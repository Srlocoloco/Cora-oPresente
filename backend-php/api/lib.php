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
// O banco em si é criado pelo painel do cPanel (a HostGator não permite
// CREATE DATABASE pelo código).
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
        description TEXT NULL,
        owner VARCHAR(255) NULL,
        pixDesconto INT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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
        endereco TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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

    $pdo->exec("CREATE TABLE IF NOT EXISTS config (
        id INT PRIMARY KEY,
        chavePix VARCHAR(255),
        freteGratisAcima DOUBLE,
        freteCapital DOUBLE,
        freteInterior DOUBLE,
        fretePadrao DOUBLE,
        comissaoRecrutador DOUBLE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // PIX pagos avisados pelo webhook do Sicredi
    $pdo->exec("CREATE TABLE IF NOT EXISTS pix_pagos (
        txid VARCHAR(40) PRIMARY KEY,
        valor VARCHAR(20) NULL,
        recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
