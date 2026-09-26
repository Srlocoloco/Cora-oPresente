<?php
// ─── Compras (acompanhar e resolver o pagamento) ─────────────────────────────
// GET  /api/compras                  → compras do cliente que ainda aguardam pagamento
// GET  /api/compras/{id}             → situação de UMA compra (a tela de pagamento
//                                       consulta a cada poucos segundos)
// POST /api/compras/{id}/cancelar    → cliente desiste (ou Admin cancela) — o estoque volta
// POST /api/compras/{id}/confirmar   → Admin confirma um PIX recebido na conta
//                                       (quando a API do banco não está configurada)

require_once __DIR__ . "/lib_compras.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}
proteger_rota($pdo);

$quem = autenticacao_opcional($pdo);
if ($quem["papel"] === "anonimo") json_out(["erro" => "Faça login para continuar."], 401);
$email = strtolower((string) $quem["email"]);
$ehAdmin = $quem["papel"] === "admin";
$id = (string) ($_GET["id"] ?? "");
$acao = (string) ($_GET["acao"] ?? "");
$metodo = $_SERVER["REQUEST_METHOD"];

expirar_compras_vencidas($pdo);

function compra_visivel(PDO $pdo, string $id, string $email, bool $ehAdmin): array {
    $stmt = $pdo->prepare("SELECT * FROM compras WHERE id = ?");
    $stmt->execute([$id]);
    $c = $stmt->fetch();
    if (!$c || (!$ehAdmin && strtolower($c["email"]) !== $email)) json_out(["erro" => "Compra não encontrada."], 404);
    return $c;
}

// ── Lista: compras do cliente esperando pagamento ────────────────────────────
if ($metodo === "GET" && $id === "") {
    limitar_taxa($pdo, "compras_listar", 60, 300);
    $stmt = $pdo->prepare(
        "SELECT id FROM compras WHERE email = ? AND status = 'aguardando_pagamento' ORDER BY criadoEm DESC LIMIT 10"
    );
    $stmt->execute([$email]);
    json_out(["compras" => array_map(fn($c) => resumo_da_compra($pdo, $c), $stmt->fetchAll(PDO::FETCH_COLUMN))]);
}

// ── Situação de uma compra ───────────────────────────────────────────────────
if ($metodo === "GET") {
    // A tela do PIX pergunta a cada 5 s durante até 30 min (~360 vezes)
    limitar_taxa($pdo, "compras_status", 600, 1800);
    $c = compra_visivel($pdo, $id, $email, $ehAdmin);
    if ($c["status"] === "aguardando_pagamento" && $c["metodo"] === "pix") {
        consultar_pix_da_compra($pdo, $id);
    }
    $resumo = resumo_da_compra($pdo, $id);
    if ($resumo["status"] === "aguardando_pagamento" && $resumo["metodo"] === "pix") {
        $stmt = $pdo->prepare("SELECT txid, modo, pixCopiaECola, expiraEm FROM pix_cobrancas WHERE compraId = ? ORDER BY criadoEm DESC LIMIT 1");
        $stmt->execute([$id]);
        $resumo["pix"] = $stmt->fetch() ?: null;
    }
    json_out(["compra" => $resumo]);
}

if ($metodo !== "POST") json_out(["erro" => "Método não permitido."], 405);

// ── Cancelar ─────────────────────────────────────────────────────────────────
if ($acao === "cancelar") {
    limitar_taxa($pdo, "compras_cancelar", 20, 600);
    $c = compra_visivel($pdo, $id, $email, $ehAdmin);
    if ($c["status"] !== "aguardando_pagamento") json_out(["erro" => "Só dá para cancelar aqui uma compra que ainda não foi paga."], 409);
    cancelar_compra($pdo, $id);
    registrar_auditoria($pdo, "compra_cancelada", "$id por $email");
    json_out(["ok" => true]);
}

// ── Admin confirma um PIX que caiu na conta ──────────────────────────────────
if ($acao === "confirmar") {
    if (!$ehAdmin) json_out(["erro" => "Só o Admin confirma pagamentos."], 403);
    limitar_taxa($pdo, "compras_confirmar", 60, 600);
    $c = compra_visivel($pdo, $id, $email, true);
    if ($c["status"] === "paga") json_out(["ok" => true]);
    if (!in_array($c["status"], ["aguardando_pagamento", "expirada", "cancelada"], true)) {
        json_out(["erro" => "Esta compra não pode ser confirmada."], 409);
    }
    $ok = confirmar_pagamento_compra($pdo, $id, "manual", "confirmado por $email", (float) $c["total"]);
    if (!$ok) json_out(["erro" => "Não foi possível confirmar agora. Tente de novo."], 500);
    registrar_auditoria($pdo, "pagamento_confirmado_manual", "$id (R$ " . number_format((float) $c["total"], 2, ",", ".") . ")");
    json_out(["ok" => true, "compra" => resumo_da_compra($pdo, $id)]);
}

json_out(["erro" => "Ação desconhecida."], 400);
