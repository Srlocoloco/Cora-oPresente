<?php
// ─── Funções comuns: conexão MySQL, tabelas e respostas JSON ─────────────────

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/smtp.php";

// Resposta JSON padronizada
function json_out($dados, int $codigo = 200): void {
    http_response_code($codigo);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

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
const VERSAO_ESQUEMA = 2;

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
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS schema_versao (
            id INT PRIMARY KEY,
            versao INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $stmt = $pdo->query("SELECT versao FROM schema_versao WHERE id = 1");
        $atual = $stmt->fetchColumn();
        return $atual !== false && (int) $atual === VERSAO_ESQUEMA;
    } catch (Throwable $e) {
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
        description TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: bancos criados antes de "images" (galeria), "colors"
    // (cores/modelos) e "description" (descrição opcional) existirem não
    // ganham as colunas novas só com CREATE TABLE IF NOT EXISTS — adiciona
    // só o que faltar.
    foreach (["images" => "LONGTEXT NULL", "colors" => "LONGTEXT NULL", "description" => "TEXT NULL"] as $coluna => $tipo) {
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
        produtoId BIGINT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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
        comissaoRecrutador DOUBLE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Avisos do andamento do pedido (o texto que vira e-mail e notificação no
    // celular). Fica gravado mesmo quando o push falha — é daqui que o
    // service worker lê o que mostrar.
    $pdo->exec("CREATE TABLE IF NOT EXISTS notificacoes_cliente (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        titulo VARCHAR(160) NOT NULL,
        corpo VARCHAR(255) NOT NULL,
        pedidoId VARCHAR(32) NULL,
        criadoEm DATETIME NOT NULL,
        entregue TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_email_entregue (email, entregue)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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

    marcar_esquema_atualizado($pdo);
}

// ─── Autenticação do Admin ────────────────────────────────────────────────────

// IP de quem está chamando (best-effort atrás de proxy/CDN)
function ip_cliente(): string {
    return $_SERVER["HTTP_X_FORWARDED_FOR"] ?? $_SERVER["REMOTE_ADDR"] ?? "desconhecido";
}

// Limite de requisições simples: no máximo $max chamadas a cada
// $janelaSegundos, por endpoint (usa o IP automaticamente). Bloqueia com
// 429 quando o limite estoura. Protege endpoints públicos (sem login) contra
// abuso/força bruta: checkout, cupom, criação de cartão/cliente, PIX.
function limitar_taxa(PDO $pdo, string $endpoint, int $max, int $janelaSegundos): void {
    $chave = $endpoint . ":" . ip_cliente();
    $stmt = $pdo->prepare("SELECT * FROM taxa_limite WHERE chave = ?");
    $stmt->execute([$chave]);
    $registro = $stmt->fetch();

    if (!$registro) {
        $pdo->prepare("INSERT INTO taxa_limite (chave, contagem, janela_inicio) VALUES (?, 1, NOW())")
            ->execute([$chave]);
        return;
    }

    $decorrido = time() - strtotime($registro["janela_inicio"]);
    if ($decorrido > $janelaSegundos) {
        $pdo->prepare("UPDATE taxa_limite SET contagem = 1, janela_inicio = NOW() WHERE chave = ?")
            ->execute([$chave]);
        return;
    }

    if ((int) $registro["contagem"] >= $max) {
        json_out(["erro" => "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo."], 429);
    }

    $pdo->prepare("UPDATE taxa_limite SET contagem = contagem + 1 WHERE chave = ?")->execute([$chave]);
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

    $hash = hash("sha256", ADMIN_PASSWORD_SALT . $senha);
    $correta = hash_equals(ADMIN_PASSWORD_HASH, $hash);

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
    enviar_email(
        EMAIL_ADMIN,
        "Seu código de acesso — Coração Presente",
        "<p>Seu código para entrar no painel Admin:</p>
         <p style=\"font-size:28px;font-weight:bold;letter-spacing:6px\">$codigo</p>
         <p>Válido por 10 minutos. Se não foi você quem pediu, ignore este e-mail — sua conta continua segura.</p>"
    );

    // ─── Recuperação temporária (REMOVER depois de usar) ────────────────────
    // O e-mail do 2FA não estava chegando (mail() sem SMTP configurado na
    // hospedagem cai com frequência). Enquanto isso não é resolvido, o
    // código também é gravado aqui — um arquivo FORA de public_html (mesmo
    // diretório de sicredi_certs), então não é acessível por navegador, só
    // por FTP / Gerenciador de Arquivos do painel da hospedagem.
    //
    // Assim que você conseguir entrar de novo, APAGUE este bloco de código
    // (ou pelo menos o arquivo abaixo) — ele deixa o código de acesso do
    // Admin gravado em texto puro no servidor, o que não deve ficar
    // permanente.
    @file_put_contents(
        __DIR__ . "/../../admin_2fa_codigo.txt",
        "Código: $codigo — gerado em " . date("d/m/Y H:i:s") . " (válido por 10 minutos)\n"
    );
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
    $cabecalho = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
    if ($cabecalho === "" && function_exists("apache_request_headers")) {
        $todos = apache_request_headers();
        $cabecalho = $todos["Authorization"] ?? $todos["authorization"] ?? "";
    }
    if (!preg_match('/^Bearer\s+(.+)$/i', $cabecalho, $m)) {
        json_out(["erro" => "Não autorizado. Faça login como Admin novamente."], 401);
    }
    $token = trim($m[1]);
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

// Lê o token do cabeçalho "Authorization: Bearer <token>" (vazio se não vier)
function token_do_cabecalho(): string {
    $cabecalho = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
    if ($cabecalho === "" && function_exists("apache_request_headers")) {
        $todos = apache_request_headers();
        $cabecalho = $todos["Authorization"] ?? $todos["authorization"] ?? "";
    }
    return preg_match('/^Bearer\s+(.+)$/i', $cabecalho, $m) ? trim($m[1]) : "";
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

// Gera um salt novo + hash da senha de um cliente (cada cliente tem o
// próprio salt — diferente do Admin, que é uma conta só)
function hash_senha_cliente(string $senha): array {
    $salt = bin2hex(random_bytes(16));
    return [$salt, hash("sha256", $salt . $senha)];
}

function senha_cliente_confere(string $senha, ?string $salt, ?string $hash): bool {
    if (!$salt || !$hash) return false;
    return hash_equals($hash, hash("sha256", $salt . $senha));
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
    $cabecalho = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
    if ($cabecalho === "" && function_exists("apache_request_headers")) {
        $todos = apache_request_headers();
        $cabecalho = $todos["Authorization"] ?? $todos["authorization"] ?? "";
    }
    if (!preg_match('/^Bearer\s+(.+)$/i', $cabecalho, $m)) {
        json_out(["erro" => "Não autorizado. Faça login novamente."], 401);
    }
    $token = trim($m[1]);
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
    $cabecalho = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
    if ($cabecalho === "" && function_exists("apache_request_headers")) {
        $todos = apache_request_headers();
        $cabecalho = $todos["Authorization"] ?? $todos["authorization"] ?? "";
    }
    if (!preg_match('/^Bearer\s+(.+)$/i', $cabecalho, $m)) {
        json_out(["erro" => "Não autorizado. Faça login novamente."], 401);
    }
    $token = trim($m[1]);

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
function validar_arquivo_base64(?string $dataUri, array $mimesPermitidos, array $assinaturas): bool {
    if (!$dataUri) return true; // campo opcional — vazio é válido
    if (!preg_match('/^data:([a-zA-Z0-9\/\+\.\-]+);base64,(.+)$/', $dataUri, $m)) return false;
    $mime = strtolower($m[1]);
    if (!in_array($mime, $mimesPermitidos, true)) return false;

    $bin = base64_decode($m[2], true);
    if ($bin === false || strlen($bin) < 12) return false;

    foreach ($assinaturas as $offset => $possibilidades) {
        foreach ($possibilidades as $assinatura) {
            if (substr($bin, $offset, strlen($assinatura)) === $assinatura) return true;
        }
    }
    return false;
}

function validar_imagem_base64(?string $dataUri): bool {
    return validar_arquivo_base64(
        $dataUri,
        ["image/jpeg", "image/png", "image/webp", "image/gif"],
        [
            0 => ["\xFF\xD8\xFF", "\x89PNG\r\n\x1a\n", "GIF87a", "GIF89a"],
            8 => ["WEBP"],
        ]
    );
}

function validar_video_base64(?string $dataUri): bool {
    return validar_arquivo_base64(
        $dataUri,
        ["video/mp4", "video/webm", "video/quicktime", "video/ogg"],
        [
            4 => ["ftyp"],          // MP4 / MOV (QuickTime)
            0 => ["\x1A\x45\xDF\xA3", "OggS"], // WebM / Ogg
        ]
    );
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
function sincronizar(PDO $pdo, string $tabela, string $chave, array $colunas, array $linhas): void {
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
