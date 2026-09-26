<?php
// ─── Funções comuns: conexão MySQL, tabelas e respostas JSON ─────────────────

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/smtp.php";

// A hospedagem pode estar num PHP 7.4 — estas duas funções só existem a partir
// do PHP 8. Com elas definidas aqui, o código roda igual nas duas versões.
if (!function_exists("str_starts_with")) {
    function str_starts_with(string $texto, string $inicio): bool {
        return $inicio === "" || strncmp($texto, $inicio, strlen($inicio)) === 0;
    }
}
if (!function_exists("str_contains")) {
    function str_contains(string $texto, string $trecho): bool {
        return $trecho === "" || strpos($texto, $trecho) !== false;
    }
}

// Resposta JSON padronizada
function json_out($dados, int $codigo = 200): void {
    http_response_code($codigo);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

// Problema no CONTEÚDO enviado pelo painel (uma foto inválida, por exemplo),
// não uma falha do banco. Existe como exceção — e não como resposta imediata —
// porque a gravação acontece dentro de uma transação: lançando daqui, a
// transação é desfeita direito antes de o erro virar resposta, e o painel
// recebe o motivo de verdade em vez de "Falha ao gravar no banco de dados".
class ErroDeGravacao extends RuntimeException {}

// Quantos itens uma única gravação de coleção pode remover. O painel exclui
// um produto/banner/cupom por vez, então mais que isso numa chamada só quer
// dizer que o navegador mandou uma lista desatualizada — e a gravação é
// recusada em vez de apagar o catálogo.
const MAX_REMOCOES_POR_GRAVACAO = 3;

// Origens que podem chamar a API — o site de produção e o ambiente de
// desenvolvimento local (Vite). Qualquer outra origem não recebe o cabeçalho
// de liberação e o navegador bloqueia a chamada sozinho.
const ORIGENS_PERMITIDAS = [
    "https://coracaopresente.com.br",
    "https://www.coracaopresente.com.br",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];

// Cabeçalhos CORS + resposta ao preflight — só libera para as origens
// conhecidas do site (antes aceitava "*", qualquer site podia chamar a API)
function cors(): void {
    $origem = $_SERVER["HTTP_ORIGIN"] ?? "";
    if (in_array($origem, ORIGENS_PERMITIDAS, true)) {
        header("Access-Control-Allow-Origin: $origem");
        header("Vary: Origin");
    }
    header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
        http_response_code(204);
        exit;
    }
}

// Lê o corpo JSON da requisição
function corpo_json(): array {
    $bruto = file_get_contents("php://input");
    $dados = json_decode($bruto, true);
    return is_array($dados) ? $dados : [];
}

// Conexão única com o MySQL (cria as tabelas na primeira vez)
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // Prepared statement DE VERDADE (feito pelo MySQL), em vez da
                // emulação do PHP que monta a string da consulta por conta
                // própria. Com isso, o valor digitado pelo usuário nunca é
                // concatenado no SQL — ele viaja separado da consulta, então
                // não existe texto capaz de "virar comando" (SQL injection).
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        criar_tabelas($pdo);
    }
    return $pdo;
}

// Mesmas tabelas do backend Node — criadas somente se não existirem.
// O banco em si é criado pelo Painel de Controle da KingHost (a hospedagem
// não permite CREATE DATABASE pelo código).
// Sobe este número toda vez que criar_tabelas() ganhar uma tabela ou coluna
// nova — é o que faz a checagem de esquema (memoized abaixo) rodar de novo
// só quando precisa, em vez de perguntar ao MySQL "essa coluna já existe?"
// em toda única requisição da API.
const VERSAO_ESQUEMA = 11; // 6: bloqueios_ip + cache_vitrine · 7: fechamentos_semana · 8: fechamentos por cargo · 9: pedidos.compraId (agrupa o carrinho) · 10: config.cidadesAtendidas · 11: compras pagas no servidor, código/versão de produto, comissão por venda, repasses

// Acrescenta uma coluna só se ela ainda não existir. Devolve true quando criou
// — é o sinal para rodar o preenchimento inicial daquela coluna uma vez só.
function garantir_coluna(PDO $pdo, string $tabela, string $coluna, string $tipo): bool {
    $stmt = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
    );
    $stmt->execute([$tabela, $coluna]);
    if ($stmt->fetch()) return false;
    $pdo->exec("ALTER TABLE `$tabela` ADD COLUMN `$coluna` $tipo");
    return true;
}

// Cada chamada à API roda um processo PHP novo (hospedagem compartilhada não
// mantém nada vivo entre requisições), então "rodar só na primeira vez" não
// existe de graça — sem isso, criar_tabelas() checaria de novo, a cada
// requisição, se cada uma das ~15 colunas/tabelas já existe (uma consulta a
// information_schema por checagem). Isso é lento o bastante pra deixar a
// carga da loja intermitente, e visitantes veem a vitrine vazia sem ninguém
// ter mexido em nada — foi o que causou os produtos "sumindo sozinhos".
//
// A correção: uma tabela de uma linha só guarda a versão do esquema já
// aplicada. Bate com VERSAO_ESQUEMA (uma consulta rápida, por chave
// primária) → não faz mais nada. Só roda todas as checagens de novo quando
// a versão muda (ou seja: quando este arquivo ganha uma migração nova).
function esquema_atualizado(PDO $pdo): bool {
    // Pergunta a versão DIRETO. Antes, esta função rodava um
    // "CREATE TABLE IF NOT EXISTS" antes do SELECT — em toda requisição da API,
    // de todo visitante, para criar uma tabela que já existia desde o primeiro
    // acesso. CREATE TABLE não é de graça nem quando não cria nada: o MySQL
    // ainda analisa o comando e consulta o dicionário de dados.
    //
    // Agora o caminho normal (tabela existe) custa uma consulta só, por chave
    // primária. A criação ficou no catch: acontece uma vez na vida do banco.
    try {
        $atual = $pdo->query("SELECT versao FROM schema_versao WHERE id = 1")->fetchColumn();
        return $atual !== false && (int) $atual === VERSAO_ESQUEMA;
    } catch (Throwable $e) {
        // Tabela ainda não existe (banco novo): cria e manda rodar as migrações.
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS schema_versao (
                id INT PRIMARY KEY,
                versao INT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        } catch (Throwable $e2) {
            // sem permissão: cai nas migrações, que é o caminho seguro
        }
        return false; // na dúvida, roda as migrações — mais lento, nunca errado
    }
}

function marcar_esquema_atualizado(PDO $pdo): void {
    $pdo->prepare(
        "INSERT INTO schema_versao (id, versao) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE versao = VALUES(versao)"
    )->execute([VERSAO_ESQUEMA]);
}

function criar_tabelas(PDO $pdo): void {
    if (esquema_atualizado($pdo)) return;

    $pdo->exec("CREATE TABLE IF NOT EXISTS produtos (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL,
        brand VARCHAR(255) NOT NULL,
        price DOUBLE NOT NULL,
        originalPrice DOUBLE NULL,
        installments INT NOT NULL DEFAULT 12,
        rating DOUBLE NOT NULL DEFAULT 0,
        reviews INT NOT NULL DEFAULT 0,
        image LONGTEXT,
        category VARCHAR(64),
        badge VARCHAR(32) NULL,
        freeShipping TINYINT(1) NOT NULL DEFAULT 1,
        stock INT NOT NULL DEFAULT 0,
        owner VARCHAR(255) NULL,
        pixDesconto INT NULL,
        images LONGTEXT NULL,
        colors LONGTEXT NULL,
        description TEXT NULL,
        tamanhos LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: bancos criados antes de "images" (galeria), "colors"
    // (cores/modelos), "description" (descrição opcional) e "tamanhos"
    // (P/M/G das caixas) existirem não ganham as colunas novas só com
    // CREATE TABLE IF NOT EXISTS — adiciona só o que faltar.
    foreach (["images" => "LONGTEXT NULL", "colors" => "LONGTEXT NULL", "description" => "TEXT NULL", "tamanhos" => "LONGTEXT NULL"] as $coluna => $tipo) {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produtos' AND COLUMN_NAME = ?"
        );
        $stmt->execute([$coluna]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE produtos ADD COLUMN `$coluna` $tipo");
        }
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS pedidos (
        id VARCHAR(32) PRIMARY KEY,
        customer VARCHAR(255),
        email VARCHAR(255),
        items TEXT,
        total DOUBLE NOT NULL,
        status VARCHAR(32),
        date VARCHAR(16),
        month VARCHAR(8),
        category VARCHAR(64),
        pagamento VARCHAR(16) NULL,
        vendedor VARCHAR(255) NULL,
        codigoVenda VARCHAR(16) NULL,
        endereco TEXT NULL,
        cupomUsado VARCHAR(32) NULL,
        codigoRastreio VARCHAR(32) NULL,
        produtoId BIGINT NULL,
        entregador VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: entregador responsável pela entrega deste pedido (e-mail da
    // conta com cargo "entregador"). É por esta coluna que o painel de
    // entregas mostra a cada um só as entregas dele.
    $stmtEntregador = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'entregador'"
    );
    $stmtEntregador->execute();
    if (!$stmtEntregador->fetch()) {
        $pdo->exec("ALTER TABLE pedidos ADD COLUMN entregador VARCHAR(255) NULL");
    }

    // Migração: bancos criados antes do campo cupomUsado existir (cupom de
    // uso único por cliente) — adiciona só se estiver faltando.
    $stmtCupomUsado = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'cupomUsado'"
    );
    $stmtCupomUsado->execute();
    if (!$stmtCupomUsado->fetch()) {
        $pdo->exec("ALTER TABLE pedidos ADD COLUMN cupomUsado VARCHAR(32) NULL");
    }

    // Migração: código de rastreio dos Correios (preenchido pelo Admin ao
    // despachar) — mesma ideia da migração acima.
    $stmtRastreio = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'codigoRastreio'"
    );
    $stmtRastreio->execute();
    if (!$stmtRastreio->fetch()) {
        $pdo->exec("ALTER TABLE pedidos ADD COLUMN codigoRastreio VARCHAR(32) NULL");
    }

    // Migração: produtoId (referência ao produto desta linha do pedido) —
    // usado para buscar a foto nos e-mails de confirmação de compra/entrega.
    $stmtProdutoId = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'produtoId'"
    );
    $stmtProdutoId->execute();
    if (!$stmtProdutoId->fetch()) {
        $pdo->exec("ALTER TABLE pedidos ADD COLUMN produtoId BIGINT NULL");
    }

    // Migração: identificador da COMPRA.
    //
    // Um carrinho com 3 produtos vira 3 linhas nesta tabela — uma por produto,
    // cada uma com o próprio número e o próprio valor. Isso é proposital (é o
    // que deixa o Admin acompanhar item por item), mas sem nada que diga que
    // as três são a mesma compra, qualquer contagem vira "3 vendas" quando o
    // cliente comprou uma vez só.
    //
    // Esta coluna guarda o mesmo código nas linhas que saíram do mesmo
    // carrinho. Pedido antigo fica com NULL e continua contando como uma
    // compra cada, que é o melhor palpite possível para quem já está gravado.
    $stmtCompraId = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'compraId'"
    );
    $stmtCompraId->execute();
    if (!$stmtCompraId->fetch()) {
        $pdo->exec("ALTER TABLE pedidos ADD COLUMN compraId VARCHAR(32) NULL");
        $pdo->exec("ALTER TABLE pedidos ADD INDEX idx_compra (compraId)");
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS clientes (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        since VARCHAR(32),
        criadoEm VARCHAR(10) NULL,
        senha_hash VARCHAR(64) NULL,
        senha_salt VARCHAR(32) NULL,
        viaGoogle TINYINT(1) NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: bancos criados antes do login de cliente com senha existir
    foreach ([
        "criadoEm" => "VARCHAR(10) NULL",
        "senha_hash" => "VARCHAR(64) NULL",
        "senha_salt" => "VARCHAR(32) NULL",
        "viaGoogle" => "TINYINT(1) NOT NULL DEFAULT 0",
        "email_verificado" => "TINYINT(1) NOT NULL DEFAULT 0",
        "vendedorVinculado" => "VARCHAR(255) NULL",
    ] as $coluna => $tipo) {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = ?"
        );
        $stmt->execute([$coluna]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE clientes ADD COLUMN `$coluna` $tipo");
        }
    }

    // Sessões de clientes comuns (mesmo mecanismo do Admin, mas cada token
    // já sabe a que e-mail pertence — usado para conferir, no servidor, que
    // quem está comprando/avaliando/ativando um código é mesmo quem diz ser)
    $pdo->exec("CREATE TABLE IF NOT EXISTS clientes_sessoes (
        token VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Trava por força bruta no login de clientes, por e-mail (o Admin já tem
    // a própria trava por IP, ver admin_login_tentativas)
    $pdo->exec("CREATE TABLE IF NOT EXISTS cliente_login_tentativas (
        email VARCHAR(255) PRIMARY KEY,
        tentativas INT NOT NULL DEFAULT 0,
        ultima_tentativa DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Token de verificação de e-mail (enviado no cadastro) — 48h de validade
    $pdo->exec("CREATE TABLE IF NOT EXISTS clientes_verificacao (
        token VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Token de redefinição de senha ("esqueci minha senha") — 30min de validade
    $pdo->exec("CREATE TABLE IF NOT EXISTS clientes_reset_senha (
        token VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cargos (
        email VARCHAR(255) PRIMARY KEY,
        cargo VARCHAR(16) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS recrutamentos (
        codigo VARCHAR(16) PRIMARY KEY,
        recrutador VARCHAR(255),
        nome VARCHAR(255),
        email VARCHAR(255),
        ativado TINYINT(1) NOT NULL DEFAULT 0,
        date VARCHAR(16)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Vínculo Master ⇄ MasterPlus: guarda, para cada Master promovido por um
    // MasterPlus, o e-mail de quem o promoveu (usado no repasse de 1%)
    $pdo->exec("CREATE TABLE IF NOT EXISTS vinculos_masterplus (
        master VARCHAR(255) PRIMARY KEY,
        masterplus VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cupons (
        codigo VARCHAR(32) PRIMARY KEY,
        percentual INT NOT NULL,
        validade VARCHAR(10) NOT NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        usos INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS alertas_estoque (
        id BIGINT PRIMARY KEY,
        name TEXT,
        date VARCHAR(16)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS banners (
        id BIGINT PRIMARY KEY,
        image LONGTEXT,
        mobileImage LONGTEXT NULL,
        tag VARCHAR(64),
        title VARCHAR(255),
        subtitle VARCHAR(255),
        cta VARCHAR(64),
        category VARCHAR(64)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: bancos criados antes do campo mobileImage existir (imagem
    // própria de banner pro celular) — adiciona só se estiver faltando.
    $stmtBannerMobile = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banners' AND COLUMN_NAME = 'mobileImage'"
    );
    $stmtBannerMobile->execute();
    if (!$stmtBannerMobile->fetch()) {
        $pdo->exec("ALTER TABLE banners ADD COLUMN mobileImage LONGTEXT NULL");
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS config (
        id INT PRIMARY KEY,
        chavePix VARCHAR(255),
        freteGratisAcima DOUBLE,
        freteCapital DOUBLE,
        freteInterior DOUBLE,
        fretePadrao DOUBLE,
        comissaoRecrutador DOUBLE,
        cidadesAtendidas VARCHAR(500) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: cidades onde a loja realmente entrega (nomes separados por
    // vírgula, ex.: "Altônia, Pérola"). Vazio = todo o Paraná, que era o
    // comportamento antigo — assim um banco já existente não muda de regra
    // sozinho ao subir esta versão.
    //
    // Por que isto virou campo: o carrinho aceitava QUALQUER CEP do Paraná e
    // fechava a venda. Quem entrega só na própria cidade recebia pedido de
    // Curitiba já pago, e sobrava cancelar e devolver o dinheiro.
    $stmtCidades = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config' AND COLUMN_NAME = 'cidadesAtendidas'"
    );
    $stmtCidades->execute();
    if (!$stmtCidades->fetch()) {
        $pdo->exec("ALTER TABLE config ADD COLUMN cidadesAtendidas VARCHAR(500) NULL");
        // Backfill de uma vez só, na criação da coluna: grava a área de
        // entrega real da loja hoje (Altônia/PR). Sem isto a coluna nasceria
        // NULL, o dados.php mandaria "" para o site e o "" venceria o padrão
        // do app no merge ({...CONFIG_PADRAO, ...doServidor}) — ou seja, subir
        // esta versão REABRIRIA a loja para todo o Paraná, que é exatamente o
        // problema que a coluna existe para resolver.
        //
        // Fica gravado no banco de propósito: o que o Admin lê em
        // Configurações é o que o carrinho aplica, sem padrão escondido no
        // meio. Para atender mais cidades (ou voltar a todo o Paraná, deixando
        // em branco) é só editar por lá.
        $pdo->exec("UPDATE config SET cidadesAtendidas = 'Altônia' WHERE id = 1");
    }

    // Avisos do andamento do pedido (o texto que vira e-mail e notificação no
    // celular). Fica gravado mesmo quando o push falha — é daqui que o
    // service worker lê o que mostrar.
    $pdo->exec("CREATE TABLE IF NOT EXISTS notificacoes_cliente (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        titulo VARCHAR(160) NOT NULL,
        corpo VARCHAR(255) NOT NULL,
        pedidoId VARCHAR(32) NULL,
        foto VARCHAR(255) NULL,
        link VARCHAR(255) NULL,
        criadoEm DATETIME NOT NULL,
        entregue TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_email_entregue (email, entregue)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: bancos criados antes das notificações levarem foto do produto
    // e destino do toque (a recomendação depois da compra usa as duas)
    foreach (["foto" => "VARCHAR(255) NULL", "link" => "VARCHAR(255) NULL"] as $coluna => $tipo) {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificacoes_cliente' AND COLUMN_NAME = ?"
        );
        $stmt->execute([$coluna]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE notificacoes_cliente ADD COLUMN `$coluna` $tipo");
        }
    }

    // Celulares/navegadores autorizados a receber notificação. O endpoint é a
    // URL secreta que o navegador dá pra gente; o hash dele é o \"crachá\" que
    // o service worker usa para buscar os avisos pendentes.
    $pdo->exec("CREATE TABLE IF NOT EXISTS push_inscricoes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        endpointHash CHAR(64) NOT NULL UNIQUE,
        endpoint TEXT NOT NULL,
        email VARCHAR(255) NOT NULL,
        criadoEm DATETIME NOT NULL,
        INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // PIX pagos avisados pelo webhook do Sicredi
    $pdo->exec("CREATE TABLE IF NOT EXISTS pix_pagos (
        txid VARCHAR(40) PRIMARY KEY,
        valor VARCHAR(20) NULL,
        recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Pagamentos no cartão. NUNCA guarda dado de cartão (número, CVV,
    // validade ou nome do portador): só o valor, as parcelas e o status
    // devolvido pelo adquirente.
    $pdo->exec("CREATE TABLE IF NOT EXISTS cartao_pagamentos (
        transacaoId VARCHAR(40) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        valor DOUBLE NOT NULL,
        parcelas INT NOT NULL DEFAULT 1,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDENTE',
        id_adquirente VARCHAR(64) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cartao_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Sessões do Admin: cada login gera um token novo (72h de validade).
    // Sem isso, não existe forma de o servidor saber "quem" está chamando os
    // endpoints que alteram a loja inteira — qualquer um poderia chamar.
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_sessoes (
        token VARCHAR(64) PRIMARY KEY,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Controle simples de tentativas de login do Admin, por IP — trava por
    // 15 minutos depois de 5 tentativas erradas seguidas (evita força bruta).
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_login_tentativas (
        ip VARCHAR(64) PRIMARY KEY,
        tentativas INT NOT NULL DEFAULT 0,
        ultima_tentativa DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Limite de requisições genérico, por endpoint + IP (evita abuso de
    // cupons, criação de cobranças PIX, cadastro de cliente, etc.)
    $pdo->exec("CREATE TABLE IF NOT EXISTS taxa_limite (
        chave VARCHAR(191) PRIMARY KEY,
        contagem INT NOT NULL DEFAULT 0,
        janela_inicio DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Castigo progressivo de quem estoura limites de propósito (ver
    // registrar_falta/verificar_bloqueio). "faltas" são os estouros recentes;
    // "castigos" é quantas vezes o IP já foi bloqueado — é o que faz o próximo
    // bloqueio durar mais que o anterior.
    // ─── Fechamento semanal do vendedor ────────────────────────────────────
    //
    // Cada linha é UMA semana já encerrada de UM vendedor, com o valor
    // congelado: quanto ele vendeu, qual percentual valia e quanto a loja
    // ficou devendo. É o "recibo" da semana.
    //
    // Por que congelar em vez de recalcular sempre: o percentual do vendedor
    // sobe conforme o total vendido na vida dele. Se a comissão fosse
    // recalculada toda vez, uma semana antiga passaria a valer mais só porque
    // ele vendeu bem depois — e o valor que você já pagou não bateria mais com
    // o que a tela mostra. Congelado, o recibo de março continua o de março.
    //
    // A chave única (vendedor + semana) é o que garante que a mesma semana
    // nunca feche duas vezes, mesmo que duas telas abram no mesmo instante.
    // A comissão vem em até três partes, conforme o cargo:
    //   vendedor   → só as vendas próprias, no percentual da faixa dele
    //   master     → 7% das vendas próprias + % sobre a equipe de vendedores
    //   masterplus → 7% das próprias + 2% da equipe + 1% de repasse sobre a
    //                equipe de cada Master que ele promoveu
    // Guardar as partes separadas (e não só o total) é o que faz o recibo
    // explicar de onde veio o dinheiro — sem isso, o Master recebe um número
    // só e não tem como conferir se a parte da equipe dele está certa.
    $pdo->exec("CREATE TABLE IF NOT EXISTS fechamentos_semana (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        vendedor VARCHAR(255) NOT NULL,
        cargo VARCHAR(16) NOT NULL DEFAULT 'vendedor',
        semana_inicio DATE NOT NULL,
        semana_fim DATE NOT NULL,
        total_vendido DOUBLE NOT NULL DEFAULT 0,
        percentual DOUBLE NOT NULL DEFAULT 0,
        comissao_propria DOUBLE NOT NULL DEFAULT 0,
        total_equipe DOUBLE NOT NULL DEFAULT 0,
        percentual_equipe DOUBLE NOT NULL DEFAULT 0,
        comissao_equipe DOUBLE NOT NULL DEFAULT 0,
        total_repasse DOUBLE NOT NULL DEFAULT 0,
        percentual_repasse DOUBLE NOT NULL DEFAULT 0,
        comissao_repasse DOUBLE NOT NULL DEFAULT 0,
        comissao DOUBLE NOT NULL DEFAULT 0,
        qtd_vendas INT NOT NULL DEFAULT 0,
        pago TINYINT(1) NOT NULL DEFAULT 0,
        pago_em DATETIME NULL,
        pago_por VARCHAR(255) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unica_semana_do_vendedor (vendedor, semana_inicio),
        INDEX idx_vendedor (vendedor),
        INDEX idx_pendente (pago, semana_inicio)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração para quem já tinha a tabela na forma antiga (só vendedor).
    foreach ([
        "cargo" => "VARCHAR(16) NOT NULL DEFAULT 'vendedor'",
        "comissao_propria" => "DOUBLE NOT NULL DEFAULT 0",
        "total_equipe" => "DOUBLE NOT NULL DEFAULT 0",
        "percentual_equipe" => "DOUBLE NOT NULL DEFAULT 0",
        "comissao_equipe" => "DOUBLE NOT NULL DEFAULT 0",
        "total_repasse" => "DOUBLE NOT NULL DEFAULT 0",
        "percentual_repasse" => "DOUBLE NOT NULL DEFAULT 0",
        "comissao_repasse" => "DOUBLE NOT NULL DEFAULT 0",
    ] as $coluna => $tipo) {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fechamentos_semana' AND COLUMN_NAME = ?"
        );
        $stmt->execute([$coluna]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE fechamentos_semana ADD COLUMN `$coluna` $tipo");
        }
    }

    // Carimbo de versão da vitrine. Uma linha só, um número que sobe toda vez
    // que algo visível na loja muda (produto, banner, configuração, estoque,
    // avaliação). É por ele que o cache da vitrine sabe se ainda vale — ver
    // versao_vitrine()/invalidar_vitrine() mais abaixo.
    $pdo->exec("CREATE TABLE IF NOT EXISTS cache_vitrine (
        id TINYINT PRIMARY KEY,
        versao BIGINT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("INSERT IGNORE INTO cache_vitrine (id, versao) VALUES (1, 1)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS bloqueios_ip (
        ip VARCHAR(64) PRIMARY KEY,
        faltas INT NOT NULL DEFAULT 0,
        castigos INT NOT NULL DEFAULT 0,
        ultima_falta DATETIME NULL,
        bloqueado_ate DATETIME NULL,
        INDEX idx_bloqueado (bloqueado_ate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Código de verificação em duas etapas (2FA) do Admin — só existe um
    // código ativo por vez (id fixo = 1); a cada novo login, o anterior é
    // substituído.
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_2fa (
        id INT PRIMARY KEY,
        codigo_hash VARCHAR(64) NOT NULL,
        expira_em DATETIME NOT NULL,
        tentativas INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Mesma ideia do admin_2fa, só que por cliente (várias contas podem estar
    // com um código pendente ao mesmo tempo, por isso a chave é o e-mail, não
    // um id fixo).
    $pdo->exec("CREATE TABLE IF NOT EXISTS clientes_2fa (
        email VARCHAR(255) PRIMARY KEY,
        codigo_hash VARCHAR(64) NOT NULL,
        expira_em DATETIME NOT NULL,
        tentativas INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Log de auditoria: registra login do Admin (certo/errado) e toda ação
    // que altera dados da loja — para investigar qualquer coisa suspeita
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_auditoria (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        acao VARCHAR(64) NOT NULL,
        detalhe TEXT NULL,
        ip VARCHAR(64) NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    migracao_versao_11($pdo);

    marcar_esquema_atualizado($pdo);
}

// ─── Versão 11 do banco ──────────────────────────────────────────────────────
//
// Três mudanças de fundo, cada uma resolvendo um problema real da loja:
//
//  1. COMPRAS PAGAS NO SERVIDOR. Antes, o pedido era gravado pelo navegador
//     depois que ELE dizia que o pagamento tinha caído — dava para gravar um
//     pedido "Pago" sem pagar nada chamando /api/checkout direto. Agora a
//     compra nasce "Aguardando pagamento", com o valor calculado aqui, e só o
//     servidor a marca como paga (tabela compras + pix_cobrancas).
//
//  2. PRODUTO COM CÓDIGO FIXO E VERSÃO. O código (BEL-001) era recalculado no
//     navegador a cada carga — apagar um produto renumerava os outros. E o
//     painel gravava o catálogo inteiro: duas pessoas cadastrando ao mesmo
//     tempo apagavam o produto uma da outra. Agora cada produto é gravado
//     sozinho, com um número de versão que recusa a edição feita em cima de
//     uma cópia velha.
//
//  3. COMISSÃO POR VENDA E REPASSES. Cada venda paga gera, na hora, a
//     comissão de cada pessoa da rede (tabela comissoes). Ela é liberada
//     alguns dias depois da entrega e entra num repasse (tabela repasses),
//     pago pelo arquivo de remessa do Sicredi para a conta de cada associado.
function migracao_versao_11(PDO $pdo): void {
    // ── Produtos ──
    $codigoNovo = garantir_coluna($pdo, "produtos", "codigo", "VARCHAR(16) NULL");
    garantir_coluna($pdo, "produtos", "versao", "INT NOT NULL DEFAULT 1");
    if ($codigoNovo) {
        // A categoria "Cestas" virou "Caixas" há tempos, mas os produtos antigos
        // continuavam gravados com o nome velho (o site trocava só na tela).
        $pdo->exec("UPDATE produtos SET category = 'Caixas' WHERE category = 'Cestas'");
        preencher_codigos_de_produto($pdo);
    }
    try {
        $pdo->exec("ALTER TABLE produtos ADD UNIQUE INDEX idx_codigo (codigo)");
    } catch (Throwable $e) {
        // índice já existe
    }

    // ── Pedidos ──
    // itensJson: o que esta linha tirou do estoque (produto, cor, tamanho,
    // quantidade). É o que permite DEVOLVER o estoque quando o pedido é
    // cancelado — antes o cancelamento deixava o estoque errado para sempre.
    garantir_coluna($pdo, "pedidos", "itensJson", "TEXT NULL");
    garantir_coluna($pdo, "pedidos", "estoqueDevolvido", "TINYINT(1) NOT NULL DEFAULT 0");
    // 1 = a comissão deste pedido está na tabela comissoes (sistema novo); os
    // pedidos antigos continuam no fechamento semanal (fechamentos.php).
    garantir_coluna($pdo, "pedidos", "comissaoPorVenda", "TINYINT(1) NOT NULL DEFAULT 0");
    garantir_coluna($pdo, "pedidos", "criadoEm", "DATETIME NULL");

    // ── Clientes: espaço para o hash bcrypt ──
    $stmt = $pdo->query(
        "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'senha_hash'"
    );
    if ((int) $stmt->fetchColumn() < 255) {
        $pdo->exec("ALTER TABLE clientes MODIFY senha_hash VARCHAR(255) NULL");
    }

    // ── Configurações novas ──
    foreach ([
        // Comissões, em % (as regras da rede — ver regras_comissao)
        "comMasterPropria" => "DOUBLE NOT NULL DEFAULT 2",
        "comMasterRede" => "DOUBLE NOT NULL DEFAULT 1",
        "comMasterPlusPropria" => "DOUBLE NOT NULL DEFAULT 7",
        "comMasterPlusEquipe" => "DOUBLE NOT NULL DEFAULT 2",
        "comMasterPlusRepasse" => "DOUBLE NOT NULL DEFAULT 1",
        // Repasses
        "repasseDiasLiberacao" => "INT NOT NULL DEFAULT 7",
        "repasseValorMinimo" => "DOUBLE NOT NULL DEFAULT 10",
        "repasseAutomatico" => "TINYINT(1) NOT NULL DEFAULT 0",
        // Dados da conta da empresa no Sicredi (arquivo de remessa CNAB 240)
        "empresaCnpj" => "VARCHAR(18) NULL",
        "empresaNome" => "VARCHAR(60) NULL",
        "empresaConvenio" => "VARCHAR(20) NULL",
        "empresaAgencia" => "VARCHAR(8) NULL",
        "empresaConta" => "VARCHAR(16) NULL",
        "empresaContaDigito" => "VARCHAR(2) NULL",
        // Estoque: abaixo disto o painel avisa e a loja mostra "Últimas unidades"
        "estoqueBaixo" => "INT NOT NULL DEFAULT 5",
        // PIX sem API do banco: a loja mostra o QR da chave e o Admin confirma
        "pixManual" => "TINYINT(1) NOT NULL DEFAULT 1",
    ] as $coluna => $tipo) {
        garantir_coluna($pdo, "config", $coluna, $tipo);
    }
    // Banco novo: a linha de configuração nasce com os valores padrão da loja.
    $pdo->exec(
        "INSERT IGNORE INTO config (id, chavePix, freteGratisAcima, freteCapital, freteInterior, fretePadrao, comissaoRecrutador, cidadesAtendidas)
         VALUES (1, '', 299, 14.9, 19.9, 29.9, 2, 'Altônia')"
    );

    // ── Compras (o pagamento de um carrinho inteiro) ──
    $pdo->exec("CREATE TABLE IF NOT EXISTS compras (
        id VARCHAR(32) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        subtotal DOUBLE NOT NULL,
        frete DOUBLE NOT NULL DEFAULT 0,
        descontoPix DOUBLE NOT NULL DEFAULT 0,
        descontoCupom DOUBLE NOT NULL DEFAULT 0,
        total DOUBLE NOT NULL,
        metodo VARCHAR(16) NOT NULL,
        parcelas INT NOT NULL DEFAULT 1,
        maxParcelas INT NOT NULL DEFAULT 1,
        cupom VARCHAR(32) NULL,
        vendedor VARCHAR(255) NULL,
        endereco TEXT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'aguardando_pagamento',
        pagamentoTipo VARCHAR(16) NULL,
        pagamentoRef VARCHAR(64) NULL,
        valorPago DOUBLE NULL,
        criadoEm DATETIME NOT NULL,
        expiraEm DATETIME NOT NULL,
        pagoEm DATETIME NULL,
        INDEX idx_compra_email (email),
        INDEX idx_compra_status (status, expiraEm)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Cobranças PIX, sempre presas a UMA compra e a UM cliente. Antes a
    // cobrança era criada com o valor que o navegador mandasse, sem login:
    // pagar R$ 0,01 "confirmava" uma compra de qualquer valor.
    $pdo->exec("CREATE TABLE IF NOT EXISTS pix_cobrancas (
        txid VARCHAR(40) PRIMARY KEY,
        compraId VARCHAR(32) NOT NULL,
        email VARCHAR(255) NOT NULL,
        valor DOUBLE NOT NULL,
        modo VARCHAR(8) NOT NULL DEFAULT 'api',
        pixCopiaECola TEXT NULL,
        criadoEm DATETIME NOT NULL,
        expiraEm DATETIME NOT NULL,
        INDEX idx_pix_compra (compraId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    garantir_coluna($pdo, "cartao_pagamentos", "compraId", "VARCHAR(32) NULL");

    // ── Comissão de cada venda, de cada pessoa da rede ──
    // status: aguardando_entrega → a_liberar (conta os dias após a entrega)
    //         → disponivel → em_repasse → paga        (ou cancelada)
    // tipo:   venda (a própria venda) · equipe (venda de quem ele recrutou)
    //         · repasse (MasterPlus sobre a equipe do Master que promoveu)
    //         · estorno (valor negativo: venda cancelada depois de paga)
    $pdo->exec("CREATE TABLE IF NOT EXISTS comissoes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        pedidoId VARCHAR(32) NOT NULL,
        compraId VARCHAR(32) NULL,
        beneficiario VARCHAR(255) NOT NULL,
        cargo VARCHAR(16) NOT NULL,
        tipo VARCHAR(16) NOT NULL,
        origem VARCHAR(255) NULL,
        descricao VARCHAR(255) NULL,
        base DOUBLE NOT NULL,
        percentual DOUBLE NOT NULL,
        valor DOUBLE NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'aguardando_entrega',
        liberaEm DATE NULL,
        repasseId BIGINT NULL,
        criadoEm DATETIME NOT NULL,
        atualizadoEm DATETIME NULL,
        UNIQUE KEY unica_comissao (pedidoId, beneficiario, tipo),
        INDEX idx_benef_status (beneficiario, status),
        INDEX idx_repasse (repasseId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Conta onde cada associado recebe. Só o dono e o Admin enxergam.
    $pdo->exec("CREATE TABLE IF NOT EXISTS dados_recebimento (
        email VARCHAR(255) PRIMARY KEY,
        titular VARCHAR(120) NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        banco VARCHAR(3) NOT NULL,
        agencia VARCHAR(5) NOT NULL,
        conta VARCHAR(12) NOT NULL,
        contaDigito VARCHAR(1) NOT NULL,
        tipoConta VARCHAR(12) NOT NULL,
        tipoChavePix VARCHAR(12) NULL,
        chavePix VARCHAR(99) NULL,
        atualizadoEm DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Um repasse = um pagamento para UMA pessoa, somando as comissões liberadas.
    // status: pendente (aguardando envio ao banco) → no_banco (remessa gerada)
    //         → pago | falhou | cancelado
    $pdo->exec("CREATE TABLE IF NOT EXISTS repasses (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        beneficiario VARCHAR(255) NOT NULL,
        valor DOUBLE NOT NULL,
        qtdComissoes INT NOT NULL DEFAULT 0,
        metodo VARCHAR(16) NOT NULL,
        destino TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pendente',
        remessaId BIGINT NULL,
        ocorrencia VARCHAR(80) NULL,
        comprovante VARCHAR(120) NULL,
        criadoEm DATETIME NOT NULL,
        pagoEm DATETIME NULL,
        pagoPor VARCHAR(255) NULL,
        INDEX idx_rep_benef (beneficiario),
        INDEX idx_rep_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Arquivos de remessa gerados (guardados para baixar de novo e para
    // conferir o retorno do banco).
    $pdo->exec("CREATE TABLE IF NOT EXISTS remessas (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        nomeArquivo VARCHAR(40) NOT NULL,
        conteudo MEDIUMTEXT NOT NULL,
        qtdPagamentos INT NOT NULL,
        total DOUBLE NOT NULL,
        dataPagamento DATE NOT NULL,
        sequencial INT NOT NULL,
        criadoEm DATETIME NOT NULL,
        criadoPor VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// Prefixo do código de cada categoria — o mesmo mapa de src/app/constantes.tsx
// (PREFIXOS_CATEGORIA). Categoria desconhecida vira "OUT".
const PREFIXOS_CATEGORIA = [
    "Outros" => "OUT",
    "Caixas" => "CAI",
    "Cestas" => "CES",
    "Beleza & Perfumaria" => "BEL",
    "Eletrônicos" => "ELE",
    "Brinquedos" => "BRI",
    "Academia" => "ACA",
    "Acessórios" => "ACE",
    "Casa & Decoração" => "CAS",
];

function prefixo_da_categoria(?string $categoria): string {
    return PREFIXOS_CATEGORIA[(string) $categoria] ?? "OUT";
}

// Grava, uma vez só, o código que cada produto já mostrava na tela. A conta é
// a mesma que o navegador fazia (ordem de cadastro = id crescente, numeração
// própria por categoria), então nenhum código visível muda na migração — só
// deixa de mudar sozinho no futuro.
function preencher_codigos_de_produto(PDO $pdo): void {
    $linhas = $pdo->query("SELECT id, category FROM produtos ORDER BY id ASC")->fetchAll();
    $contador = [];
    $stmt = $pdo->prepare("UPDATE produtos SET codigo = ? WHERE id = ?");
    foreach ($linhas as $l) {
        $prefixo = prefixo_da_categoria($l["category"]);
        $contador[$prefixo] = ($contador[$prefixo] ?? 0) + 1;
        $stmt->execute([sprintf("%s-%03d", $prefixo, $contador[$prefixo]), $l["id"]]);
    }
}

// Próximo código livre de uma categoria (ex.: BEL-014). Quem chama grava
// dentro de uma transação e o índice único recusa a corrida rara em que duas
// telas pegam o mesmo número — aí basta tentar de novo.
function proximo_codigo_de_produto(PDO $pdo, string $categoria): string {
    $prefixo = prefixo_da_categoria($categoria);
    $stmt = $pdo->prepare("SELECT codigo FROM produtos WHERE codigo LIKE ?");
    $stmt->execute([$prefixo . "-%"]);
    $maior = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $codigo) {
        $n = (int) substr((string) $codigo, strlen($prefixo) + 1);
        if ($n > $maior) $maior = $n;
    }
    return sprintf("%s-%03d", $prefixo, $maior + 1);
}

// ─── Autenticação do Admin ────────────────────────────────────────────────────

// IP de quem está chamando (best-effort atrás de proxy/CDN)
// ─── De quem é esta requisição ───────────────────────────────────────────────
//
// TODO o sistema anti-abuso se apoia nesta função: limite de requisições,
// travamento do login do Admin, controle de tentativas de cartão. Se ela puder
// ser enganada, nada disso vale.
//
// Antes ela lia "X-Forwarded-For" primeiro. Esse cabeçalho é escrito por quem
// faz a requisição — ou seja, pelo próprio robô. Trocando o valor a cada envio,
// cada requisição caía num balde diferente e NENHUM limite era atingido. Isso
// foi confirmado no site em produção: 20 envios com o mesmo valor falso davam
// 429, e bastava variar o valor para nunca mais bloquear.
//
// Agora vale o REMOTE_ADDR — o endereço com quem o servidor realmente falou,
// que o cliente não escolhe. O cabeçalho só é aceito quando a requisição chega
// de um proxy que a loja reconhece (Cloudflare, balanceador), configurado em
// PROXIES_CONFIAVEIS; e mesmo aí vale o último salto antes do proxy, não o
// primeiro da lista (o começo da lista também é escrito pelo cliente).
function ip_cliente(): string {
    $remoto = $_SERVER["REMOTE_ADDR"] ?? "";
    if ($remoto === "") return "desconhecido";

    $confiaveis = defined("PROXIES_CONFIAVEIS") ? PROXIES_CONFIAVEIS : [];
    if (!is_array($confiaveis) || !in_array($remoto, $confiaveis, true)) {
        return $remoto;
    }

    $cabecalho = trim((string) ($_SERVER["HTTP_X_FORWARDED_FOR"] ?? ""));
    if ($cabecalho === "") return $remoto;

    // "cliente, proxy1, proxy2" — anda de trás para frente e para no primeiro
    // endereço que NÃO é proxy conhecido: esse é o cliente de verdade.
    $saltos = array_map("trim", explode(",", $cabecalho));
    for ($i = count($saltos) - 1; $i >= 0; $i--) {
        $ip = $saltos[$i];
        if ($ip === "" || in_array($ip, $confiaveis, true)) continue;
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : $remoto;
    }
    return $remoto;
}


// ─── Bloqueio progressivo de quem insiste ────────────────────────────────────
//
// O limite de requisições sozinho apenas devolve 429 e deixa o robô tentando
// para sempre: ele espera a janela virar e recomeça, de graça. Aqui cada
// estouro de limite vira uma "falta", e quem acumula faltas fica de castigo —
// em TODAS as rotas, não só naquela em que ele estourou.
//
// O tempo de castigo cresce a cada reincidência (2min, 8min, 32min...), até um
// dia. Para uma pessoa de verdade, que quase nunca estoura um limite, isso é
// invisível; para um robô, cada tentativa fica mais cara que a anterior.
const BLOQUEIO_FALTAS_ATE_BANIR = 3;     // faltas antes do primeiro castigo
const BLOQUEIO_BASE_SEGUNDOS    = 120;   // 2 minutos no primeiro castigo
const BLOQUEIO_MAXIMO_SEGUNDOS  = 86400; // teto de 1 dia

// Está de castigo? Responde 429 e encerra. É a primeira coisa que toda rota
// protegida faz — uma consulta barata, por índice de chave primária.
function verificar_bloqueio(PDO $pdo): void {
    $ip = ip_cliente();
    try {
        $stmt = $pdo->prepare("SELECT bloqueado_ate FROM bloqueios_ip WHERE ip = ? AND bloqueado_ate > NOW()");
        $stmt->execute([$ip]);
        $ate = $stmt->fetchColumn();
    } catch (Throwable $e) {
        return; // sem banco, não trava o site por causa do anti-abuso
    }
    if (!$ate) return;

    $segundos = max(1, strtotime($ate) - time());
    header("Retry-After: " . $segundos);
    json_out([
        "erro" => "Acesso temporariamente bloqueado por excesso de tentativas. "
            . "Tente de novo em " . ceil($segundos / 60) . " minuto(s).",
    ], 429);
}

// Registra uma falta e, se já houver faltas demais, aplica o castigo.
function registrar_falta(PDO $pdo, string $motivo): void {
    $ip = ip_cliente();
    try {
        // A janela de faltas dura 1 hora: quem estourou um limite hoje de manhã
        // e nada mais não carrega isso para a tarde inteira.
        $pdo->prepare(
            "INSERT INTO bloqueios_ip (ip, faltas, castigos, ultima_falta)
             VALUES (?, 1, 0, NOW())
             ON DUPLICATE KEY UPDATE
                faltas = IF(ultima_falta < NOW() - INTERVAL 1 HOUR, 1, faltas + 1),
                ultima_falta = NOW()"
        )->execute([$ip]);

        $stmt = $pdo->prepare("SELECT faltas, castigos FROM bloqueios_ip WHERE ip = ?");
        $stmt->execute([$ip]);
        $linha = $stmt->fetch();
        if (!$linha || (int) $linha["faltas"] < BLOQUEIO_FALTAS_ATE_BANIR) return;

        $castigos = (int) $linha["castigos"];
        $duracao = min(BLOQUEIO_MAXIMO_SEGUNDOS, BLOQUEIO_BASE_SEGUNDOS * (4 ** $castigos));
        $pdo->prepare(
            "UPDATE bloqueios_ip
                SET bloqueado_ate = NOW() + INTERVAL " . (int) $duracao . " SECOND,
                    castigos = castigos + 1,
                    faltas = 0
              WHERE ip = ?"
        )->execute([$ip]);
        registrar_auditoria($pdo, "bloqueio_automatico", "$ip por {$duracao}s — $motivo");
    } catch (Throwable $e) {
        // idem: anti-abuso nunca derruba a requisição principal
    }
}


// Limpeza das tabelas de controle. Roda de vez em quando (1 chamada em 200),
// para não pesar em toda requisição — sem isso as linhas se acumulam para
// sempre e o banco cresce sozinho.
function limpar_controle_de_abuso(PDO $pdo): void {
    if (random_int(1, 200) !== 1) return;
    try {
        $pdo->exec("DELETE FROM taxa_limite WHERE janela_inicio < NOW() - INTERVAL 1 DAY");
        $pdo->exec("DELETE FROM bloqueios_ip WHERE ultima_falta < NOW() - INTERVAL 7 DAY AND (bloqueado_ate IS NULL OR bloqueado_ate < NOW())");
    } catch (Throwable $e) {
        // limpeza é oportunista
    }
}


// ─── Cache da vitrine ────────────────────────────────────────────────────────
//
// O problema que isto resolve: a resposta de /api/dados para quem NÃO está
// logado é exatamente a mesma para todo mundo — o catálogo, os banners e as
// regras de frete. Mesmo assim, cada visitante fazia o servidor refazer ~18
// consultas ao MySQL, remontar 180 KB de JSON e compactar tudo de novo. Com
// 10 pessoas ao mesmo tempo, o servidor fazia 10 vezes o mesmo trabalho; com
// 500, ele para de responder — não porque o site é pesado, mas porque estava
// recalculando algo idêntico para cada pessoa.
//
// Agora a vitrine é montada UMA vez e guardada pronta. Enquanto nada mudar,
// toda visita é servida dessa cópia. É isto que faz a loja aguentar 10 ou
// 10.000 visitantes gastando praticamente o mesmo do servidor.
//
// Como o cache sabe que venceu: um número de versão no banco, que sobe sempre
// que algo visível muda (cadastro de produto, banner, configuração, venda que
// baixa estoque, avaliação nova). Não há tempo de validade adivinhado — se
// nada mudou, a cópia vale; se mudou, ela é descartada na hora.

// Onde a cópia pronta é guardada. Fica na pasta temporária do sistema, fora do
// site: assim ninguém acessa o arquivo pelo navegador.
function caminho_cache_vitrine(string $versao): string {
    return rtrim(sys_get_temp_dir(), "/\\") . DIRECTORY_SEPARATOR . "cp_vitrine_" . $versao . ".json";
}

// Versão atual da vitrine (uma consulta barata, por chave primária).
//
// Devolve null quando não dá para saber a versão — tabela ainda não criada,
// banco fora do ar. E null aqui DESLIGA o cache, de propósito: um cache que
// não consegue ser invalidado é pior do que não ter cache nenhum, porque
// continuaria mostrando produto e estoque velhos sem ninguém entender por quê.
// Nesse caso a loja volta a montar a vitrine a cada visita — mais lento, mas
// sempre certo.
function versao_vitrine(PDO $pdo): ?string {
    try {
        $v = $pdo->query("SELECT versao FROM cache_vitrine WHERE id = 1")->fetchColumn();
        return $v !== false ? (string) $v : null;
    } catch (Throwable $e) {
        return null;
    }
}

// Chamada por quem MUDA algo que aparece na loja. Só sobe o número: a cópia
// velha deixa de ser encontrada e a próxima visita monta a nova.
function invalidar_vitrine(PDO $pdo): void {
    try {
        $pdo->exec("UPDATE cache_vitrine SET versao = versao + 1 WHERE id = 1");
    } catch (Throwable $e) {
        // invalidar é melhor-esforço; no pior caso o cache expira pelo tempo
    }
}

// Lê a cópia pronta desta versão, se existir e ainda estiver fresca. O teto de
// tempo é só uma rede de segurança para o caso de uma invalidação se perder —
// o que manda mesmo é o número da versão.
function ler_cache_vitrine(string $versao): ?string {
    $arquivo = caminho_cache_vitrine($versao);
    if (!is_file($arquivo)) return null;
    if (time() - filemtime($arquivo) > 3600) return null;
    $conteudo = @file_get_contents($arquivo);
    return is_string($conteudo) && $conteudo !== "" ? $conteudo : null;
}

// Grava a cópia pronta. Escreve num arquivo temporário e só então renomeia:
// com duas visitas chegando juntas, ninguém lê um arquivo pela metade.
function gravar_cache_vitrine(string $versao, string $json): void {
    $arquivo = caminho_cache_vitrine($versao);
    $temporario = $arquivo . "." . getmypid() . ".tmp";
    try {
        if (@file_put_contents($temporario, $json) !== false) {
            @rename($temporario, $arquivo);
        }
        // Limpa cópias de versões antigas de vez em quando.
        if (random_int(1, 50) === 1) {
            foreach (glob(rtrim(sys_get_temp_dir(), "/\\") . DIRECTORY_SEPARATOR . "cp_vitrine_*.json") ?: [] as $antigo) {
                if ($antigo !== $arquivo && time() - filemtime($antigo) > 3600) @unlink($antigo);
            }
        }
    } catch (Throwable $e) {
        // sem permissão de escrita: o site funciona igual, só sem o cache
    }
}


// ─── Porta de entrada de toda rota ───────────────────────────────────────────
// Chamada no começo de cada arquivo da API. Faz, nesta ordem:
//   1. barra quem está de castigo;
//   2. aplica um teto GERAL por IP, somando todas as rotas — é ele que segura
//      o robô que fica pulando de endereço em endereço para não estourar o
//      limite de nenhum deles em particular;
//   3. limpa restos antigos de vez em quando.
// O teto geral é folgado de propósito: abrir a loja já dispara várias chamadas
// (dados, fotos, avaliações), e uma pessoa navegando rápido não pode ser
// confundida com um robô.
function proteger_rota(PDO $pdo, int $tetoGeral = 600, int $janelaSegundos = 300): void {
    verificar_bloqueio($pdo);
    limitar_taxa($pdo, "_geral", $tetoGeral, $janelaSegundos);
    limpar_controle_de_abuso($pdo);
}

// Limite de requisições simples: no máximo $max chamadas a cada
// $janelaSegundos, por endpoint (usa o IP automaticamente). Bloqueia com
// 429 quando o limite estoura. Protege endpoints públicos (sem login) contra
// abuso/força bruta: checkout, cupom, criação de cartão/cliente, PIX.
function limitar_taxa(PDO $pdo, string $endpoint, int $max, int $janelaSegundos): void {
    $ip = ip_cliente();
    $chave = substr($endpoint . ":" . $ip, 0, 191);
    $janela = max(1, (int) $janelaSegundos);

    try {
        // Conta e renova a janela numa operação só. A versão anterior lia,
        // decidia e só então gravava: entre a leitura e a gravação cabiam
        // outras requisições, e um robô disparando em paralelo passava do
        // limite porque todas liam a mesma contagem antiga. Somando dentro do
        // próprio UPDATE, nenhuma requisição deixa de ser contada.
        //
        // O LAST_INSERT_ID() em volta da contagem é um truque do MySQL para
        // devolver o número novo na MESMA ida ao banco: sem ele era preciso um
        // SELECT logo depois só para saber quanto ficou. Como esta função roda
        // duas vezes em toda requisição da API (o teto geral e o da rota), esse
        // SELECT a mais custava duas consultas por visita — em toda visita, de
        // todo visitante.
        $stmt = $pdo->prepare(
            "INSERT INTO taxa_limite (chave, contagem, janela_inicio) VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE
                contagem = LAST_INSERT_ID(IF(janela_inicio < NOW() - INTERVAL $janela SECOND, 1, contagem + 1)),
                janela_inicio = IF(janela_inicio < NOW() - INTERVAL $janela SECOND, NOW(), janela_inicio)"
        );
        $stmt->execute([$chave]);

        // rowCount(): 1 = linha nova (primeira chamada desta janela), 2 = linha
        // existente somada. Na linha nova a contagem é 1 e nem precisa perguntar.
        $contagem = $stmt->rowCount() === 1 ? 1 : (int) $pdo->lastInsertId();
        if ($contagem <= 0) $contagem = 1;
    } catch (Throwable $e) {
        return; // sem banco, a rota segue — o anti-abuso não pode derrubar a loja
    }

    if ($contagem <= $max) return;

    // Estourou. Vira falta (e, com faltas demais, castigo em todas as rotas).
    registrar_falta($pdo, "limite de $endpoint");

    header("Retry-After: " . $janela);
    json_out([
        "erro" => "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.",
    ], 429);
}

// Verifica a senha do Admin contra o hash salvo em config.php. Trava o IP por
// 15 minutos depois de 5 tentativas erradas seguidas.
function verificar_senha_admin(PDO $pdo, string $senha): bool {
    $ip = ip_cliente();
    $stmt = $pdo->prepare("SELECT * FROM admin_login_tentativas WHERE ip = ?");
    $stmt->execute([$ip]);
    $registro = $stmt->fetch();

    if ($registro && (int) $registro["tentativas"] >= 5) {
        $ultima = strtotime($registro["ultima_tentativa"]);
        if (time() - $ultima < 15 * 60) {
            json_out(["erro" => "Muitas tentativas erradas. Aguarde alguns minutos e tente de novo."], 429);
        }
    }

    $correta = senha_confere_com_hash($senha, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH);

    if ($correta) {
        $pdo->prepare("DELETE FROM admin_login_tentativas WHERE ip = ?")->execute([$ip]);
    } else {
        $pdo->prepare(
            "INSERT INTO admin_login_tentativas (ip, tentativas, ultima_tentativa) VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE tentativas = tentativas + 1, ultima_tentativa = NOW()"
        )->execute([$ip]);
    }
    return $correta;
}

// ─── 2FA do Admin (código de 6 dígitos por e-mail) ────────────────────────────
// Depois da senha certa, o Admin ainda precisa digitar um código de 6
// dígitos mandado por e-mail — mesmo que a senha vaze, ninguém entra no
// painel sem também ter acesso à caixa de entrada do Admin.

function criar_codigo_2fa_admin(PDO $pdo): string {
    $codigo = str_pad((string) random_int(0, 999999), 6, "0", STR_PAD_LEFT);
    $hash = hash("sha256", $codigo);
    $pdo->exec("DELETE FROM admin_2fa");
    $pdo->prepare("INSERT INTO admin_2fa (id, codigo_hash, expira_em, tentativas) VALUES (1, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)")
        ->execute([$hash]);
    return $codigo;
}

function enviar_email_2fa_admin(string $codigo): void {
    $enviado = enviar_email(
        EMAIL_ADMIN,
        "Seu código de acesso — Coração Presente",
        "<p>Seu código para entrar no painel Admin:</p>
         <p style=\"font-size:28px;font-weight:bold;letter-spacing:6px\">$codigo</p>
         <p>Válido por 10 minutos. Se não foi você quem pediu, ignore este e-mail — sua conta continua segura.</p>"
    );

    // ─── Recuperação de acesso ──────────────────────────────────────────────
    // Antes o código era SEMPRE gravado em texto puro num arquivo do servidor,
    // mesmo com o e-mail funcionando. Agora só quando o envio falha — é o que
    // evita trancar o Admin para fora da loja se o e-mail cair, sem deixar o
    // código exposto no resto do tempo. O arquivo fica FORA de public_html
    // (só FTP/Gerenciador de Arquivos chega nele) e é apagado quando o login
    // termina (ver verificar_codigo_2fa_admin).
    $arquivo = __DIR__ . "/../../admin_2fa_codigo.txt";
    if (!$enviado) {
        @file_put_contents(
            $arquivo,
            "Código: $codigo — gerado em " . date("d/m/Y H:i:s") . " (válido por 10 minutos)\n"
            . "O e-mail não saiu — configure o SMTP em config.php para não depender deste arquivo.\n"
        );
    } elseif (is_file($arquivo)) {
        @unlink($arquivo);
    }
}

// Confere o código digitado; devolve true/false. Trava depois de 5 tentativas
// erradas (o código precisa ser pedido de novo).
function verificar_codigo_2fa_admin(PDO $pdo, string $codigo): bool {
    $stmt = $pdo->prepare("SELECT * FROM admin_2fa WHERE id = 1 AND expira_em > NOW()");
    $stmt->execute();
    $linha = $stmt->fetch();
    if (!$linha) return false;
    if ((int) $linha["tentativas"] >= 5) {
        $pdo->exec("DELETE FROM admin_2fa");
        return false;
    }
    if (hash_equals($linha["codigo_hash"], hash("sha256", $codigo))) {
        $pdo->exec("DELETE FROM admin_2fa");
        @unlink(__DIR__ . "/../../admin_2fa_codigo.txt");
        return true;
    }
    $pdo->prepare("UPDATE admin_2fa SET tentativas = tentativas + 1 WHERE id = 1")->execute();
    return false;
}

// ─── 2FA do cliente (código de 6 dígitos por e-mail) ──────────────────────────
// Mesmo princípio do Admin: depois da senha certa, ainda precisa do código
// mandado por e-mail — se a senha vazar, ninguém entra na conta sem também
// ter acesso à caixa de entrada da pessoa. Só entra em jogo no login com
// senha; o login com Google já é conferido de verdade com a própria Google
// (verificar_id_token_google), então não pede código de novo.

function criar_codigo_2fa_cliente(PDO $pdo, string $email): string {
    $codigo = str_pad((string) random_int(0, 999999), 6, "0", STR_PAD_LEFT);
    $hash = hash("sha256", $codigo);
    $pdo->prepare(
        "INSERT INTO clientes_2fa (email, codigo_hash, expira_em, tentativas)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)
         ON DUPLICATE KEY UPDATE codigo_hash = VALUES(codigo_hash), expira_em = VALUES(expira_em), tentativas = 0"
    )->execute([$email, $hash]);
    return $codigo;
}

function enviar_email_2fa_cliente(string $email, string $nome, string $codigo): void {
    $primeiroNome = trim(explode(" ", trim($nome))[0] ?? "");
    $ola = $primeiroNome !== "" ? "Olá, " . htmlspecialchars($primeiroNome) . "!" : "Olá!";
    enviar_email(
        $email,
        "Seu código de acesso — Coração Presente",
        "<p>$ola</p>
         <p>Seu código para entrar na sua conta:</p>
         <p style=\"font-size:28px;font-weight:bold;letter-spacing:6px\">$codigo</p>
         <p>Válido por 10 minutos. Se não foi você quem pediu, ignore este e-mail — sua senha continua segura.</p>"
    );
}

// Confere o código digitado; devolve true/false. Trava depois de 5 tentativas
// erradas (o código precisa ser pedido de novo).
function verificar_codigo_2fa_cliente(PDO $pdo, string $email, string $codigo): bool {
    $stmt = $pdo->prepare("SELECT * FROM clientes_2fa WHERE email = ? AND expira_em > NOW()");
    $stmt->execute([$email]);
    $linha = $stmt->fetch();
    if (!$linha) return false;
    if ((int) $linha["tentativas"] >= 5) {
        $pdo->prepare("DELETE FROM clientes_2fa WHERE email = ?")->execute([$email]);
        return false;
    }
    if (hash_equals($linha["codigo_hash"], hash("sha256", $codigo))) {
        $pdo->prepare("DELETE FROM clientes_2fa WHERE email = ?")->execute([$email]);
        return true;
    }
    $pdo->prepare("UPDATE clientes_2fa SET tentativas = tentativas + 1 WHERE email = ?")->execute([$email]);
    return false;
}

// Duração de uma sessão nova (Admin) e de quanto ela se estende a cada uso —
// ver "sessão deslizante" logo abaixo: nas duas funções (exigir_admin,
// exigir_cliente, email_autenticado), o expira_em é empurrado pra frente a
// cada requisição autenticada, então a sessão só expira de verdade se o
// Admin/cliente ficar 30 dias seguidos SEM abrir o site — não só por ter
// saído e fechado a aba.
const SESSAO_ADMIN_DIAS = 30;

// Gera um novo token de sessão do Admin, válido por 30 dias (e renovada a
// cada uso — ver exigir_admin)
function criar_sessao_admin(PDO $pdo): string {
    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare("INSERT INTO admin_sessoes (token, expira_em) VALUES (?, DATE_ADD(NOW(), INTERVAL " . SESSAO_ADMIN_DIAS . " DAY))");
    $stmt->execute([$token]);
    return $token;
}

// Bloqueia a requisição (401) se não vier um token de Admin válido no cabeçalho
// "Authorization: Bearer <token>". Toda rota que grava/apaga dados
// compartilhados da loja (produtos, cupons, cargos, banners, config...) deve
// chamar isso antes de fazer qualquer alteração.
function exigir_admin(PDO $pdo): void {
    $token = token_do_cabecalho();
    if ($token === "") {
        json_out(["erro" => "Não autorizado. Faça login como Admin novamente."], 401);
    }
    $stmt = $pdo->prepare("SELECT token FROM admin_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    if (!$stmt->fetch()) {
        json_out(["erro" => "Sessão expirada. Faça login como Admin novamente."], 401);
    }
    // Sessão deslizante: cada ação válida empurra o vencimento mais 30 dias
    // pra frente — o Admin só é deslogado de verdade depois de 30 dias
    // seguidos sem usar o painel, não só por sair do site e voltar depois.
    $pdo->prepare("UPDATE admin_sessoes SET expira_em = DATE_ADD(NOW(), INTERVAL " . SESSAO_ADMIN_DIAS . " DAY) WHERE token = ?")
        ->execute([$token]);
}

// Lê o token do cabeçalho "Authorization: Bearer <token>" (vazio se não vier).
// Um lugar só para isso: antes cada função relia o cabeçalho do seu jeito, e o
// logout do cliente esquecia a segunda forma de leitura — em alguns servidores
// o "Sair" não apagava a sessão no banco.
function token_do_cabecalho(): string {
    $cabecalho = $_SERVER["HTTP_AUTHORIZATION"] ?? ($_SERVER["REDIRECT_HTTP_AUTHORIZATION"] ?? "");
    if ($cabecalho === "" && function_exists("apache_request_headers")) {
        $todos = apache_request_headers();
        $cabecalho = $todos["Authorization"] ?? $todos["authorization"] ?? "";
    }
    // O token é sempre hexadecimal (bin2hex de 32 bytes). Qualquer outra coisa
    // é descartada antes de chegar a uma consulta.
    return preg_match('/^Bearer\s+([a-f0-9]{32,128})\s*$/i', $cabecalho, $m) ? $m[1] : "";
}

// Identifica quem está chamando SEM bloquear a requisição: usada nas rotas
// que respondem para visitante, cliente e Admin, devolvendo conteúdo
// diferente para cada um (ver dados.php).
// Devolve ["papel" => "admin" | "cliente" | "anonimo", "email" => string|null].
function autenticacao_opcional(PDO $pdo): array {
    $token = token_do_cabecalho();
    if ($token === "") return ["papel" => "anonimo", "email" => null];

    $stmt = $pdo->prepare("SELECT email FROM clientes_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    $linha = $stmt->fetch();
    if ($linha) {
        $email = strtolower($linha["email"]);
        // O Admin também pode entrar como cliente pela loja
        if ($email === strtolower(EMAIL_ADMIN)) return ["papel" => "admin", "email" => $email];
        return ["papel" => "cliente", "email" => $email];
    }

    $stmt = $pdo->prepare("SELECT token FROM admin_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    if ($stmt->fetch()) return ["papel" => "admin", "email" => strtolower(EMAIL_ADMIN)];

    return ["papel" => "anonimo", "email" => null];
}

// Regra de senha forte: pelo menos 8 caracteres, com maiúscula, minúscula,
// número e caractere especial — dificulta bem mais um ataque de força bruta
// ou lista de senhas vazadas do que só exigir um tamanho mínimo. Devolve
// null se a senha está ok, ou uma mensagem de erro para mostrar ao usuário.
function validar_senha_forte(string $senha): ?string {
    if (strlen($senha) < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (!preg_match('/[a-z]/', $senha)) return "A senha precisa ter pelo menos uma letra minúscula.";
    if (!preg_match('/[A-Z]/', $senha)) return "A senha precisa ter pelo menos uma letra maiúscula.";
    if (!preg_match('/[0-9]/', $senha)) return "A senha precisa ter pelo menos um número.";
    if (!preg_match('/[^A-Za-z0-9]/', $senha)) return "A senha precisa ter pelo menos um caractere especial (ex.: !@#$%).";
    return null;
}

// ─── Autenticação de clientes comuns ──────────────────────────────────────────

// Hash da senha de um cliente: bcrypt (password_hash). Devolve [salt, hash] só
// para manter o formato antigo das colunas — no bcrypt o salt vai dentro do
// próprio hash, então a coluna senha_salt fica vazia.
//
// Por que trocar: o formato antigo era UM SHA-256 com salt. SHA-256 é rápido
// de propósito — com o banco vazado, uma placa de vídeo testa bilhões de
// senhas por segundo. O bcrypt é lento de propósito (~100 ms por tentativa).
function hash_senha_cliente(string $senha): array {
    return ["", password_hash($senha, PASSWORD_BCRYPT)];
}

// Confere a senha nos dois formatos: bcrypt (novo) e SALT+SHA-256 (antigo).
// Cada conta antiga migra sozinha no próximo login certo (ver clientes.php).
function senha_confere_com_hash(string $senha, ?string $salt, ?string $hash): bool {
    if (!$hash) return false;
    if (str_starts_with($hash, '$2') || str_starts_with($hash, '$argon')) {
        return password_verify($senha, $hash);
    }
    if (!$salt) return false;
    return hash_equals($hash, hash("sha256", $salt . $senha));
}

function senha_cliente_confere(string $senha, ?string $salt, ?string $hash): bool {
    return senha_confere_com_hash($senha, $salt, $hash);
}

// true quando o hash gravado ainda é do formato antigo (ou de um custo menor
// que o atual) e deve ser refeito agora que a senha certa está em mãos.
function senha_precisa_novo_hash(?string $hash): bool {
    if (!$hash) return false;
    if (!str_starts_with($hash, '$2') && !str_starts_with($hash, '$argon')) return true;
    return password_needs_rehash($hash, PASSWORD_BCRYPT);
}

// Trava 15 minutos depois de 6 tentativas erradas seguidas, por e-mail
function verificar_login_cliente(PDO $pdo, string $email, string $senha, ?string $salt, ?string $hash): bool {
    $stmt = $pdo->prepare("SELECT * FROM cliente_login_tentativas WHERE email = ?");
    $stmt->execute([$email]);
    $registro = $stmt->fetch();
    if ($registro && (int) $registro["tentativas"] >= 6) {
        if (time() - strtotime($registro["ultima_tentativa"]) < 15 * 60) {
            json_out(["erro" => "Muitas tentativas erradas. Aguarde alguns minutos e tente de novo."], 429);
        }
    }
    $correta = senha_cliente_confere($senha, $salt, $hash);
    if ($correta) {
        $pdo->prepare("DELETE FROM cliente_login_tentativas WHERE email = ?")->execute([$email]);
    } else {
        $pdo->prepare(
            "INSERT INTO cliente_login_tentativas (email, tentativas, ultima_tentativa) VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE tentativas = tentativas + 1, ultima_tentativa = NOW()"
        )->execute([$email]);
    }
    return $correta;
}

function criar_sessao_cliente(PDO $pdo, string $email): string {
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO clientes_sessoes (token, email, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))")
        ->execute([$token, $email]);
    return $token;
}

// Devolve o e-mail autenticado (do token enviado em Authorization: Bearer),
// ou bloqueia a requisição com 401 se não houver um token válido.
function exigir_cliente(PDO $pdo): string {
    $token = token_do_cabecalho();
    if ($token === "") {
        json_out(["erro" => "Não autorizado. Faça login novamente."], 401);
    }
    $stmt = $pdo->prepare("SELECT email FROM clientes_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    $linha = $stmt->fetch();
    if (!$linha) {
        json_out(["erro" => "Sessão expirada. Faça login novamente."], 401);
    }
    // Sessão deslizante — mesma ideia do Admin: renova 30 dias a cada uso
    $pdo->prepare("UPDATE clientes_sessoes SET expira_em = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE token = ?")
        ->execute([$token]);
    return $linha["email"];
}

// Como o token de sessão (Admin ou cliente) e o de cliente usam o mesmo
// cabeçalho, esta função aceita qualquer um dos dois — usada nas rotas que
// tanto um cliente comum quanto o Admin (comprando pela loja) podem chamar.
// Devolve o e-mail autenticado, ou bloqueia com 401.
function email_autenticado(PDO $pdo): string {
    $token = token_do_cabecalho();
    if ($token === "") {
        json_out(["erro" => "Não autorizado. Faça login novamente."], 401);
    }

    $stmt = $pdo->prepare("SELECT email FROM clientes_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    $linha = $stmt->fetch();
    if ($linha) {
        $pdo->prepare("UPDATE clientes_sessoes SET expira_em = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE token = ?")
            ->execute([$token]);
        return $linha["email"];
    }

    $stmt = $pdo->prepare("SELECT token FROM admin_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    if ($stmt->fetch()) {
        $pdo->prepare("UPDATE admin_sessoes SET expira_em = DATE_ADD(NOW(), INTERVAL " . SESSAO_ADMIN_DIAS . " DAY) WHERE token = ?")
            ->execute([$token]);
        return EMAIL_ADMIN;
    }

    json_out(["erro" => "Sessão expirada. Faça login novamente."], 401);
}

// Envia um e-mail em HTML. Com SMTP configurado em config.php (recomendado —
// veja os comentários lá), usa smtp.php: e-mail autenticado, chega direito
// na caixa de entrada em vez de spam/nunca chegar. Sem SMTP configurado, cai
// no mail() nativo do PHP (o de sempre, menos confiável). Nunca lança — quem
// chama decide o que fazer com o retorno false.
function enviar_email(string $para, string $assunto, string $corpoHtml): bool {
    if (smtp_configurado()) {
        if (enviar_email_smtp($para, $assunto, $corpoHtml)) return true;
        error_log("E-mail via SMTP falhou para $para — tentando mail() nativo como reserva.");
    }
    $cabecalhos = "MIME-Version: 1.0\r\n";
    $cabecalhos .= "Content-Type: text/html; charset=UTF-8\r\n";
    $cabecalhos .= "From: " . MAIL_NOME_DE . " <" . MAIL_DE . ">\r\n";
    try {
        return @mail($para, "=?UTF-8?B?" . base64_encode($assunto) . "?=", $corpoHtml, $cabecalhos);
    } catch (Throwable $e) {
        return false;
    }
}

// ─── Verificação de e-mail e redefinição de senha ─────────────────────────────

function criar_token_verificacao(PDO $pdo, string $email): string {
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO clientes_verificacao (token, email, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 48 HOUR))")
        ->execute([$token, $email]);
    return $token;
}

function enviar_email_verificacao(string $email, string $nome, string $token): void {
    $link = URL_SITE . "/?verificar-email=" . urlencode($token);
    enviar_email(
        $email,
        "Confirme seu e-mail — Coração Presente",
        "<p>Olá, " . htmlspecialchars($nome) . "!</p>
         <p>Confirme seu e-mail clicando no link abaixo:</p>
         <p><a href=\"$link\">$link</a></p>
         <p>Se você não criou esta conta, pode ignorar este e-mail.</p>"
    );
}

function criar_token_reset_senha(PDO $pdo, string $email): string {
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO clientes_reset_senha (token, email, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))")
        ->execute([$token, $email]);
    return $token;
}

function enviar_email_reset_senha(string $email, string $token): void {
    $link = URL_SITE . "/?redefinir-senha=" . urlencode($token);
    enviar_email(
        $email,
        "Redefinir sua senha — Coração Presente",
        "<p>Recebemos um pedido para redefinir a senha da sua conta.</p>
         <p>Clique no link abaixo para escolher uma senha nova (válido por 30 minutos):</p>
         <p><a href=\"$link\">$link</a></p>
         <p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>"
    );
}

// Confere o id_token do Google Sign-In direto com a Google (nunca confia só
// no que o navegador manda) — evita que alguém forje um login falso.
function verificar_id_token_google(string $idToken, string $clientId): ?array {
    $ctx = stream_context_create(["http" => ["timeout" => 8]]);
    $resposta = @file_get_contents(
        "https://oauth2.googleapis.com/tokeninfo?id_token=" . urlencode($idToken),
        false,
        $ctx
    );
    if ($resposta === false) return null;
    $dados = json_decode($resposta, true);
    if (!is_array($dados) || ($dados["aud"] ?? "") !== $clientId) return null;
    if (empty($dados["email"]) || ($dados["email_verified"] ?? "false") !== "true") return null;
    return $dados;
}

// ─── Validação de arquivos enviados em base64 (imagem/vídeo) ─────────────────
// O navegador manda um "data URI" (ex.: "data:image/jpeg;base64,/9j/4AAQ...").
// Confere se o tipo declarado é permitido E se os primeiros bytes do arquivo
// batem com uma assinatura conhecida daquele formato — não basta confiar no
// nome/tipo que o próprio arquivo diz ser.
// Tipos que o site aceita guardar e devolver. São listas fechadas, usadas TANTO
// na hora de gravar (aqui) QUANTO na hora de servir (imagem.php) — uma lista só
// para os dois lados, senão um arquivo antigo, gravado antes de a regra
// existir, continuaria sendo entregue pelo servidor.
//
// Repare no que NÃO está aqui: "image/svg+xml". SVG é um documento XML que pode
// conter <script>, e servido do próprio domínio da loja ele roda como se fosse
// uma página nossa — com acesso ao token de sessão de quem abrir. Por isso SVG
// não entra, mesmo sendo "imagem".
const MIMES_IMAGEM_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MIMES_VIDEO_PERMITIDOS  = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];

// Teto de tamanho, já descompactado (o base64 ocupa ~33% a mais que o arquivo).
// Sem teto, uma foto de 80 MB entra no banco, estoura a memória do PHP ao ser
// lida de volta e derruba a loja inteira — foi exatamente assim que o
// /api/dados caiu quando devolvia as fotos por dentro.
const LIMITE_IMAGEM_BYTES = 8 * 1024 * 1024;   // 8 MB
const LIMITE_VIDEO_BYTES  = 12 * 1024 * 1024;  // 12 MB (igual ao limite da tela)

function validar_arquivo_base64(?string $dataUri, array $mimesPermitidos, array $assinaturas, int $limiteBytes = 0): bool {
    if (!$dataUri) return true; // campo opcional — vazio é válido
    if (!is_string($dataUri)) return false;

    // Corta cedo pelo tamanho do TEXTO, antes de decodificar: decodificar
    // primeiro para só depois recusar seria montar o arquivo inteiro na memória
    // do servidor — que é justamente o que um envio gigante quer provocar.
    if ($limiteBytes > 0 && strlen($dataUri) > (int) ($limiteBytes * 1.4) + 1024) return false;

    // O "data:" precisa vir exatamente nesta forma. A versão anterior aceitava
    // qualquer coisa entre "data:" e ";base64," — dava para pendurar parâmetros
    // extras no tipo (ex.: 'data:image/png;x=".."') e confundir quem lesse o
    // cabeçalho depois. Aqui o tipo é só letras/dígitos com uma barra no meio.
    if (!preg_match('#^data:([a-z0-9][a-z0-9!\#$&^_.+\-]{0,60}/[a-z0-9][a-z0-9!\#$&^_.+\-]{0,60});base64,([A-Za-z0-9+/]+={0,2})$#i', $dataUri, $m)) {
        return false;
    }
    $mime = strtolower($m[1]);
    if (!in_array($mime, $mimesPermitidos, true)) return false;

    $bin = base64_decode($m[2], true);
    if ($bin === false || strlen($bin) < 12) return false;
    if ($limiteBytes > 0 && strlen($bin) > $limiteBytes) return false;

    // Assinatura ("números mágicos") no começo do arquivo. É o que separa uma
    // foto de verdade de um arquivo qualquer que só se DIZ foto: o tipo
    // declarado vem do navegador do visitante e pode ser escrito à mão.
    $bateAssinatura = false;
    foreach ($assinaturas as $offset => $possibilidades) {
        foreach ($possibilidades as $assinatura) {
            if (substr($bin, $offset, strlen($assinatura)) === $assinatura) { $bateAssinatura = true; break 2; }
        }
    }
    if (!$bateAssinatura) return false;

    // Última peneira: recusa arquivo que carregue marca de conteúdo executável
    // nos primeiros KB. Um "polyglot" é um arquivo válido como imagem E como
    // outra coisa (HTML, por exemplo) ao mesmo tempo — passa na assinatura e,
    // se algum navegador resolver adivinhar o tipo, roda o que está dentro.
    $inicio = strtolower(substr($bin, 0, 2048));
    foreach (["<script", "<?php", "<html", "<!doctype", "<svg", "<iframe"] as $perigo) {
        if (strpos($inicio, $perigo) !== false) return false;
    }

    return true;
}

function validar_imagem_base64(?string $dataUri): bool {
    return validar_arquivo_base64(
        $dataUri,
        MIMES_IMAGEM_PERMITIDOS,
        [
            0 => ["\xFF\xD8\xFF", "\x89PNG\r\n\x1a\n", "GIF87a", "GIF89a"],
            8 => ["WEBP"],
        ],
        LIMITE_IMAGEM_BYTES
    );
}

function validar_video_base64(?string $dataUri): bool {
    return validar_arquivo_base64(
        $dataUri,
        MIMES_VIDEO_PERMITIDOS,
        [
            4 => ["ftyp"],          // MP4 / MOV (QuickTime)
            0 => ["\x1A\x45\xDF\xA3", "OggS"], // WebM / Ogg
        ],
        LIMITE_VIDEO_BYTES
    );
}

// ─── Fotos: endereço público no lugar do base64 ──────────────────────────────
//
// As fotos ficam guardadas no banco em base64 ("data:image/jpeg;base64,...").
// Mandá-las DENTRO da resposta de /api/dados fazia essa resposta passar de
// 19 MB: o servidor estourava o limite de memória ao compactá-la, devolvia um
// erro de corpo vazio, e o site inteiro caía com "Sem conexão com o servidor".
//
// Agora a resposta leva só o ENDEREÇO de cada foto. O navegador busca as fotos
// separadamente, uma a uma, como faz com a imagem de qualquer outro site — e
// guarda cada uma no cache dele. Quem entrega a foto é o imagem.php.
//
//   .../api/produtos/{id}/imagem?v=...        capa do produto
//   .../api/produtos/{id}/imagem?g={n}&v=...  foto {n} da galeria
//   .../api/produtos/{id}/imagem?c={n}&v=...  foto da cor {n}
//   .../api/banners/{id}/imagem?v=...         banner (desktop)
//   .../api/banners/{id}/imagem?m=1&v=...     banner (celular)

// Resumo curto do conteúdo da foto. Não muda nada no servidor: serve só para o
// endereço mudar quando a foto muda. Sem isso, trocar a foto de um produto não
// apareceria para quem já visitou o site — o navegador seguiria mostrando a
// foto antiga até o cache dele vencer.
function versao_foto(?string $conteudo): string {
    return substr(md5((string) $conteudo), 0, 8);
}

function url_foto(string $tipo, int $id, array $parametros = []): string {
    $pasta = $tipo === "banner" ? "banners" : "produtos";
    return rtrim(URL_SITE, "/") . "/api/$pasta/$id/imagem?" . http_build_query($parametros);
}

// O caminho de volta: diz se um valor recebido do site é um endereço criado
// por url_foto() — ou seja, "a foto que já está no banco" — em vez da foto de
// verdade. Devolve null para qualquer outra coisa (inclusive base64).
//
// É isto que impede o painel de APAGAR as fotos. Ao salvar um produto, o painel
// devolve o que recebeu; como agora ele recebe endereços, sem esta tradução o
// banco gravaria o endereço por cima do base64 e a foto sumiria — de todos os
// produtos de uma vez, porque salvar um produto reescreve a lista inteira.
function ler_referencia_foto(?string $valor): ?array {
    if (!is_string($valor) || $valor === "") return null;
    $inicio = preg_quote(rtrim(URL_SITE, "/"), "#");
    if (!preg_match("#^{$inicio}/api/(produtos|banners)/([0-9]+)/imagem(?:\?(.*))?$#", $valor, $m)) {
        return null;
    }
    parse_str($m[3] ?? "", $q);
    return [
        "tipo"    => $m[1] === "banners" ? "banner" : "produto",
        "id"      => (int) $m[2],
        "galeria" => isset($q["g"]) ? (int) $q["g"] : null,
        "cor"     => isset($q["c"]) ? (int) $q["c"] : null,
        "mobile"  => isset($q["m"]) && $q["m"] !== "",
    ];
}

// Troca uma referência pela foto de verdade que está no banco hoje.
//
// Os índices (?g=2, ?c=1) são resolvidos contra a lista ATUAL do banco, então
// apagar ou reordenar fotos no painel funciona sozinho: o painel devolve os
// endereços das fotos que sobraram, e cada endereço continua apontando para a
// foto certa.
//
// O $cache guarda só o último item lido. As fotos de um mesmo produto são
// resolvidas em sequência, então isso evita reler a mesma linha várias vezes
// sem segurar o catálogo inteiro na memória — que é exatamente o que derrubava
// o site.
function resolver_foto(PDO $pdo, array $ref, array &$cache): ?string {
    $chave = $ref["tipo"] . ":" . $ref["id"];
    if (($cache["chave"] ?? null) !== $chave) {
        $stmt = $pdo->prepare(
            $ref["tipo"] === "banner"
                ? "SELECT image, mobileImage FROM banners WHERE id = ?"
                : "SELECT image, images, colors FROM produtos WHERE id = ?"
        );
        $stmt->execute([$ref["id"]]);
        $cache = ["chave" => $chave, "linha" => $stmt->fetch() ?: []];
    }
    $linha = $cache["linha"];

    if ($ref["tipo"] === "banner") {
        return $linha[$ref["mobile"] ? "mobileImage" : "image"] ?? null;
    }
    if ($ref["galeria"] !== null) {
        $lista = json_decode((string) ($linha["images"] ?? ""), true);
        return is_array($lista) ? ($lista[$ref["galeria"]] ?? null) : null;
    }
    if ($ref["cor"] !== null) {
        $cores = json_decode((string) ($linha["colors"] ?? ""), true);
        return is_array($cores) ? ($cores[$ref["cor"]]["image"] ?? null) : null;
    }
    return $linha["image"] ?? null;
}

// Recebe o que o site mandou para um campo de foto e devolve o que deve ir
// para o banco: se veio endereço, a foto que já estava lá; se veio base64,
// ele mesmo (validado). Devolve false quando a foto não vale — aí quem chama
// recusa a gravação inteira em vez de gravar um produto sem foto.
function foto_para_gravar(PDO $pdo, $valor, array &$cache, bool $permitirLinkExterno = false) {
    $ref = ler_referencia_foto(is_string($valor) ? $valor : null);
    if ($ref !== null) {
        $doBanco = resolver_foto($pdo, $ref, $cache);
        // Endereço que não aponta para nada (produto apagado, índice que não
        // existe mais): recusa. Gravar null aqui apagaria a foto calada.
        return $doBanco !== null ? $doBanco : false;
    }
    if ($valor === null || $valor === "") return $valor;
    // Link de uma foto de outro site (o campo "Cole a URL da imagem" do
    // cadastro). Antes era recusado como "imagem inválida" — o produto
    // simplesmente não salvava e ninguém entendia por quê.
    if ($permitirLinkExterno && is_string($valor) && link_de_imagem_valido($valor)) return $valor;
    if (!is_string($valor) || !validar_imagem_base64($valor)) return false;
    return $valor;
}

// Só https, sem espaço nem aspas (nada que escape de um atributo HTML).
function link_de_imagem_valido(string $url): bool {
    return strlen($url) <= 1000
        && preg_match('#^https://[^\s"\'<>`]+$#i', $url)
        && filter_var($url, FILTER_VALIDATE_URL) !== false;
}

// ─── Produto no formato que o site usa ──────────────────────────────────────
// Uma função só para a vitrine (/api/dados) e para o cadastro individual
// (/api/produtos): as duas respostas saem idênticas, e o painel pode trocar a
// linha editada pela resposta do servidor sem recarregar tudo.
const SQL_PRODUTO_SITE = "
    SELECT id, codigo, versao, name, brand, price, originalPrice, installments, rating,
           reviews, category, badge, freeShipping, stock, owner,
           pixDesconto, description, colors, tamanhos,
           CASE WHEN image LIKE 'https://%' THEN image ELSE NULL END AS capaExterna,
           CHAR_LENGTH(COALESCE(image, '')) AS capaTam,
           LEFT(MD5(COALESCE(image, '')), 8) AS capaVersao,
           LEFT(MD5(COALESCE(images, '')), 8) AS galeriaVersao,
           (CHAR_LENGTH(COALESCE(images, ''))
            - CHAR_LENGTH(REPLACE(COALESCE(images, ''), '\"data:', ''))) DIV 6
               AS galeriaQtd
    FROM produtos";

function produto_para_site(array $p): array {
    $id = (int) $p["id"];
    // Das cores continua vindo tudo (nome, cor da bolinha, estoque) — é pouca
    // coisa e a página do produto precisa. Só a foto é trocada pelo endereço.
    $cores = $p["colors"] !== null ? json_decode($p["colors"], true) : null;
    if (is_array($cores)) {
        $versaoCores = versao_foto($p["colors"]);
        foreach ($cores as $i => $cor) {
            if (empty($cor["image"])) { unset($cores[$i]["image"]); continue; }
            $cores[$i]["image"] = url_foto("produto", $id, ["c" => $i, "v" => $versaoCores]);
        }
        $cores = array_values($cores);
    }
    $galeriaQtd = max(0, (int) $p["galeriaQtd"]);
    $capa = "";
    if (!empty($p["capaExterna"])) $capa = (string) $p["capaExterna"];
    elseif ((int) $p["capaTam"] > 0) $capa = url_foto("produto", $id, ["v" => $p["capaVersao"]]);

    return [
        "id" => $id,
        "codigo" => $p["codigo"] ?? null,
        "versao" => (int) ($p["versao"] ?? 1),
        "name" => $p["name"],
        "brand" => $p["brand"],
        "price" => (float) $p["price"],
        "originalPrice" => $p["originalPrice"] !== null ? (float) $p["originalPrice"] : null,
        "installments" => (int) $p["installments"],
        "rating" => (float) $p["rating"],
        "reviews" => (int) $p["reviews"],
        "image" => $capa,
        "category" => $p["category"],
        "badge" => $p["badge"],
        "freeShipping" => (bool) $p["freeShipping"],
        "stock" => (int) $p["stock"],
        "owner" => $p["owner"],
        "pixDesconto" => $p["pixDesconto"] !== null ? (int) $p["pixDesconto"] : null,
        "images" => $galeriaQtd > 0
            ? array_map(fn($n) => url_foto("produto", $id, ["g" => $n, "v" => $p["galeriaVersao"]]), range(0, $galeriaQtd - 1))
            : null,
        "colors" => $cores,
        "tamanhos" => $p["tamanhos"] !== null ? json_decode($p["tamanhos"], true) : null,
        "description" => $p["description"] ?? null,
    ];
}

// Grava uma linha no log de auditoria. Nunca deve derrubar a requisição
// principal se falhar (log é "melhor esforço") — por isso o try/catch aqui
// dentro em vez de deixar a exceção subir.
function registrar_auditoria(PDO $pdo, string $acao, ?string $detalhe = null): void {
    try {
        $pdo->prepare("INSERT INTO admin_auditoria (acao, detalhe, ip) VALUES (?, ?, ?)")
            ->execute([$acao, $detalhe, ip_cliente()]);
    } catch (Throwable $e) {
        // ignora — log não pode quebrar a ação real
    }
}

// Sincroniza uma coleção SEM apagar a tabela primeiro: atualiza/insere o que
// veio e remove só as linhas que sumiram da lista.
//
// É a versão segura de regravar() para as coleções que o painel manda inteiras
// (produtos, banners, cupons). O "DELETE FROM tabela" seguido de INSERT deixa
// uma janela em que o catálogo inteiro depende de a requisição terminar bem:
// se o corpo chegar cortado (post_max_size), se o navegador cancelar no meio
// ou se a lista em memória estiver desatualizada, a tabela fica vazia. Aqui a
// pior hipótese é uma linha não atualizada — nada some sem estar de fora da
// lista de propósito.
//
// "iterable" em vez de "array" no último parâmetro: assim quem chama pode
// mandar uma lista já pronta OU um gerador, que monta uma linha de cada vez.
// Os produtos usam o gerador — cada foto só é trazida do banco no momento de
// gravar aquela linha, então nunca existe o catálogo inteiro (19 MB de fotos)
// dentro da memória do PHP de uma vez só.
function sincronizar(PDO $pdo, string $tabela, string $chave, array $colunas, iterable $linhas): void {
    $atualizaveis = array_values(array_filter($colunas, fn($c) => $c !== $chave));
    $sql = "INSERT INTO `$tabela` (`" . implode("`,`", $colunas) . "`) VALUES ("
         . implode(",", array_fill(0, count($colunas), "?")) . ")"
         . " ON DUPLICATE KEY UPDATE "
         . implode(",", array_map(fn($c) => "`$c` = VALUES(`$c`)", $atualizaveis));

    $pdo->beginTransaction();
    try {
        $existentes = array_map("strval", $pdo->query("SELECT `$chave` FROM `$tabela`")->fetchAll(PDO::FETCH_COLUMN));
        $stmt = $pdo->prepare($sql);
        $recebidos = [];
        foreach ($linhas as $linha) {
            $valores = [];
            foreach ($colunas as $coluna) {
                $v = $linha[$coluna] ?? null;
                if (is_bool($v)) $v = $v ? 1 : 0;
                $valores[] = $v;
            }
            $stmt->execute($valores);
            $recebidos[] = (string) ($linha[$chave] ?? "");
        }

        // Só o que estava no banco e não veio na lista é apagado
        $removidos = array_values(array_diff($existentes, $recebidos));
        if (count($removidos) > 0) {
            $marcas = implode(",", array_fill(0, count($removidos), "?"));
            $pdo->prepare("DELETE FROM `$tabela` WHERE `$chave` IN ($marcas)")->execute($removidos);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// Regrava uma coleção inteira (espelha o estado do site) numa transação
function regravar(PDO $pdo, string $tabela, array $colunas, array $linhas): void {
    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM `$tabela`");
        if (count($linhas) > 0) {
            $sql = "INSERT INTO `$tabela` (`" . implode("`,`", $colunas) . "`) VALUES ("
                 . implode(",", array_fill(0, count($colunas), "?")) . ")";
            $stmt = $pdo->prepare($sql);
            foreach ($linhas as $linha) {
                $valores = [];
                foreach ($colunas as $coluna) {
                    $v = $linha[$coluna] ?? null;
                    if (is_bool($v)) $v = $v ? 1 : 0;
                    $valores[] = $v;
                }
                $stmt->execute($valores);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// ─── Código de venda (ex.: CV-9X2K4M) ────────────────────────────────────────
// A mesma conta de codigoVendaDe() em src/app/utils.ts (hash djb2 do e-mail),
// agora também no servidor. Antes o navegador descobria sozinho de quem era o
// código e mandava o e-mail do vendedor pronto — dava para creditar a venda a
// qualquer pessoa editando a requisição. Agora o navegador manda só o código,
// e quem decide o dono é o servidor.
//
// O JavaScript percorre o texto em unidades UTF-16 (charCodeAt); aqui o e-mail
// é convertido para UTF-16 antes, para os dois lados darem sempre o mesmo
// resultado, até com acento.
function codigo_venda_de(string $email): string {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    $utf16 = mb_convert_encoding(strtolower(trim($email)), "UTF-16BE", "UTF-8");
    $h = 5381;
    for ($i = 0, $n = strlen($utf16); $i + 1 < $n; $i += 2) {
        $unidade = (ord($utf16[$i]) << 8) | ord($utf16[$i + 1]);
        $h = (($h << 5) + $h + $unidade) & 0xFFFFFFFF;
    }
    $codigo = "";
    for ($i = 0; $i < 6; $i++) {
        $codigo .= $chars[$h % 32];
        $h = intdiv($h, 32);
    }
    return "CV-" . $codigo;
}

// Dono de um código de venda: só contas que VENDEM (vendedor, Master e
// MasterPlus). Entregador não tem código. Devolve null quando não existe.
function dono_do_codigo_de_venda(PDO $pdo, string $codigo): ?string {
    $codigo = strtoupper(trim($codigo));
    if (!preg_match('/^CV-[A-Z2-9]{6}$/', $codigo)) return null;
    $stmt = $pdo->query("SELECT LOWER(email) FROM cargos WHERE cargo IN ('vendedor','master','masterplus')");
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $email) {
        if (codigo_venda_de($email) === $codigo) return $email;
    }
    return null;
}

// Cargo de uma conta (null = sem cargo).
function cargo_da_conta(PDO $pdo, string $email): ?string {
    $stmt = $pdo->prepare("SELECT cargo FROM cargos WHERE LOWER(email) = ?");
    $stmt->execute([strtolower(trim($email))]);
    $cargo = $stmt->fetchColumn();
    return $cargo === false ? null : (string) $cargo;
}

// Linha de configuração da loja (id = 1), lida uma vez por requisição.
function config_loja(PDO $pdo, bool $recarregar = false): array {
    static $cache = null;
    if ($cache === null || $recarregar) {
        $linha = $pdo->query("SELECT * FROM config WHERE id = 1")->fetch();
        $cache = $linha ?: [];
    }
    return $cache;
}

// Dinheiro sempre em 2 casas: somar DOUBLE sem arredondar deixa "R$ 10,000000001"
// escapar para comparações e para o arquivo do banco.
function centavos(float $valor): float {
    return round($valor + 0.0, 2);
}

// Data/hora de Brasília, no formato que o MySQL entende. A hospedagem pode
// estar em outro fuso — o pedido e a comissão precisam do horário da loja.
function agora_brasil(string $formato = "Y-m-d H:i:s", string $ajuste = "now"): string {
    return (new DateTime($ajuste, new DateTimeZone("America/Sao_Paulo")))->format($formato);
}
