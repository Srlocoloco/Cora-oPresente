<?php
// ─── Funções comuns: conexão MySQL, tabelas e respostas JSON ─────────────────

require_once __DIR__ . "/config.php";

// Resposta JSON padronizada
function json_out($dados, int $codigo = 200): void {
    http_response_code($codigo);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

// Cabeçalhos CORS + resposta ao preflight (permite testar de outra origem)
function cors(): void {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
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
function criar_tabelas(PDO $pdo): void {
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
        colors LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: bancos criados antes de "images" (galeria) e "colors"
    // (cores/modelos) existirem não ganham as colunas novas só com
    // CREATE TABLE IF NOT EXISTS — adiciona só o que faltar.
    foreach (["images" => "LONGTEXT NULL", "colors" => "LONGTEXT NULL"] as $coluna => $tipo) {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produtos' AND COLUMN_NAME = ?"
        );
        $stmt->execute([$coluna]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE produtos ADD COLUMN `$coluna` $tipo");
        }
    }

    // Migração: remove a coluna "description" — as características do
    // produto deixaram de existir no site (o Admin não cadastra mais isso)
    $stmtDescricao = $pdo->prepare(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produtos' AND COLUMN_NAME = 'description'"
    );
    $stmtDescricao->execute();
    if ($stmtDescricao->fetch()) {
        $pdo->exec("ALTER TABLE produtos DROP COLUMN description");
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
        cupomUsado VARCHAR(32) NULL
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS clientes (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        since VARCHAR(32)
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

    // Cartões salvos dos clientes. POR SEGURANÇA (padrão PCI): nunca guarda o
    // número completo do cartão nem o CVV — só o suficiente para o cliente
    // reconhecer o cartão numa lista (bandeira, nome, últimos 4 dígitos e
    // validade). mpCardId/mpCustomerId ligam esse registro ao cartão de
    // verdade guardado no cofre do Mercado Pago (só existem quando o cliente
    // já tokenizou esse cartão pelo menos uma vez).
    $pdo->exec("CREATE TABLE IF NOT EXISTS cartoes_salvos (
        id BIGINT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        bandeira VARCHAR(32),
        nomeCartao VARCHAR(255),
        ultimosDigitos VARCHAR(4),
        validade VARCHAR(7),
        mpCardId VARCHAR(64) NULL,
        mpCustomerId VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Migração: se este banco já tinha "cartoes_salvos" de antes (ex.: criado
    // pelo backend Node, que roda no mesmo MySQL local), a tabela existe mas
    // sem as colunas do cofre — adiciona só o que faltar.
    foreach (["mpCardId" => "VARCHAR(64) NULL", "mpCustomerId" => "VARCHAR(64) NULL"] as $coluna => $tipo) {
        $stmt = $pdo->prepare(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cartoes_salvos' AND COLUMN_NAME = ?"
        );
        $stmt->execute([$coluna]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE cartoes_salvos ADD COLUMN `$coluna` $tipo");
        }
    }

    // PIX pagos avisados pelo webhook do Sicredi
    $pdo->exec("CREATE TABLE IF NOT EXISTS pix_pagos (
        txid VARCHAR(40) PRIMARY KEY,
        valor VARCHAR(20) NULL,
        recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Pagamentos com cartão via Mercado Pago (criados na hora e/ou avisados
    // pelo webhook). pedido_id guarda o "external_reference" enviado na
    // criação do pagamento, ligando de volta com a tabela pedidos.
    $pdo->exec("CREATE TABLE IF NOT EXISTS mp_pagamentos (
        payment_id VARCHAR(32) PRIMARY KEY,
        pedido_id VARCHAR(32) NULL,
        status VARCHAR(32) NULL,
        valor DOUBLE NULL,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Cofre de cartões: liga o e-mail do cliente ao "customer" criado no
    // Mercado Pago (1 customer por cliente). É nele que os cartões salvos
    // ficam de verdade guardados (nós só guardamos o card_id, nunca o cartão
    // em si — quem guarda o cartão é o Mercado Pago).
    $pdo->exec("CREATE TABLE IF NOT EXISTS mp_clientes (
        email VARCHAR(255) PRIMARY KEY,
        mp_customer_id VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
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
