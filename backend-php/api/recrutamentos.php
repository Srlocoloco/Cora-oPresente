<?php
// ─── Cliente ativa, no próprio perfil, o código de vendedor recebido ─────────
// POST /api/recrutamentos/{codigo}/ativar → { email }
// Marca o vínculo como ativado e dá o cargo de vendedor, numa transação só,
// sem reescrever as tabelas inteiras de recrutamentos/cargos.

require_once __DIR__ . "/lib.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    json_out(["erro" => "Método não permitido."], 405);
}

// No máximo 10 tentativas de ativação por IP a cada 5 minutos — evita
// força bruta tentando adivinhar códigos de vendedor
limitar_taxa($pdo, "recrutamentos_ativar", 10, 300);

$codigo = $_GET["codigo"] ?? "";
if ($codigo === "") json_out(["erro" => "Código ausente."], 400);

// Usa o e-mail da sessão autenticada, nunca o que vem no corpo — impede que
// alguém ative um código de vendedor "em nome" de outra conta
$email = strtolower(email_autenticado($pdo));

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("SELECT * FROM recrutamentos WHERE codigo = ? AND email = ? FOR UPDATE");
    $stmt->execute([$codigo, $email]);
    $vinculo = $stmt->fetch();

    if (!$vinculo) {
        $pdo->rollBack();
        json_out(["erro" => "Código inválido para esta conta."], 404);
    }
    if ((int) $vinculo["ativado"] === 1) {
        $pdo->rollBack();
        json_out(["erro" => "Este código já foi ativado."], 409);
    }

    $pdo->prepare("UPDATE recrutamentos SET ativado = 1 WHERE codigo = ?")->execute([$codigo]);
    $pdo->prepare(
        "INSERT INTO cargos (email, cargo) VALUES (?, 'vendedor') ON DUPLICATE KEY UPDATE cargo = 'vendedor'"
    )->execute([$email]);

    $pdo->commit();
    json_out(["ok" => true]);
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(["erro" => "Falha ao ativar o código."], 500);
}
