<?php
// ─── Cobranças PIX ───────────────────────────────────────────────────────────
// POST /api/pix/cobranca          { compraId } → { txid, pixCopiaECola, modo, expiraEm, valor }
// GET  /api/pix/cobranca/{txid}   → { status: ATIVA | CONCLUIDA }
// POST /api/webhook/pix/{segredo} → aviso instantâneo do Sicredi
//
// A cobrança é SEMPRE de uma compra criada pelo /api/checkout e do cliente
// logado — o valor vem da compra, nunca do navegador (ver lib_compras.php).

require_once __DIR__ . "/lib_compras.php";
cors();

$acao = $_GET["acao"] ?? "";

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}

// ── Criar (ou reaproveitar) a cobrança de uma compra ─────────────────────────
if ($acao === "cobranca") {
    proteger_rota($pdo);
    // Cada chamada pode criar uma cobrança de verdade no banco. O teto segura
    // robô sem atrapalhar quem gera o código de novo algumas vezes.
    limitar_taxa($pdo, "pix_cobranca", 15, 600);
    if ($_SERVER["REQUEST_METHOD"] !== "POST") json_out(["erro" => "Método não permitido."], 405);

    $email = strtolower(email_autenticado($pdo));
    $compraId = (string) (corpo_json()["compraId"] ?? "");
    $stmt = $pdo->prepare("SELECT * FROM compras WHERE id = ?");
    $stmt->execute([$compraId]);
    $compra = $stmt->fetch();
    if (!$compra || strtolower($compra["email"]) !== $email) json_out(["erro" => "Compra não encontrada."], 404);
    if ($compra["status"] === "paga") json_out(["erro" => "Esta compra já está paga."], 409);
    if ($compra["status"] !== "aguardando_pagamento" || strtotime($compra["expiraEm"]) < strtotime(agora_brasil())) {
        json_out(["erro" => "O prazo para pagar esta compra acabou. Volte ao carrinho e finalize de novo."], 410);
    }
    if ($compra["metodo"] !== "pix") json_out(["erro" => "Esta compra foi feita para pagamento com cartão."], 409);

    try {
        $cobranca = cobranca_pix_da_compra($pdo, $compra);
        json_out($cobranca + ["valor" => (float) $compra["total"], "compraId" => $compra["id"]]);
    } catch (ErroDeCompra $e) {
        json_out(["erro" => $e->getMessage()], $e->codigo);
    } catch (Throwable $e) {
        error_log("pix cobranca: " . $e->getMessage());
        json_out(["erro" => "Não foi possível gerar o PIX agora."], 500);
    }
}

// ── Consultar status (compatível com a tela antiga) ──────────────────────────
if ($acao === "status") {
    proteger_rota($pdo);
    limitar_taxa($pdo, "pix_status", 500, 1800);
    $txid = (string) ($_GET["txid"] ?? "");
    $stmt = $pdo->prepare("SELECT compraId FROM pix_cobrancas WHERE txid = ?");
    $stmt->execute([$txid]);
    $compraId = $stmt->fetchColumn();
    if (!$compraId) json_out(["status" => "ATIVA"]);
    $stmt = $pdo->prepare("SELECT status FROM compras WHERE id = ?");
    $stmt->execute([$compraId]);
    $status = $stmt->fetchColumn();
    if ($status === "aguardando_pagamento" && consultar_pix_da_compra($pdo, (string) $compraId)) $status = "paga";
    json_out(["status" => $status === "paga" ? "CONCLUIDA" : "ATIVA"]);
}

// ── Webhook (o Sicredi chama quando um PIX é pago) ────────────────────────────
// Só com o segredo combinado no fim do endereço (WEBHOOK_SEGREDO). E mesmo
// assim o aviso não é aceito de olhos fechados: a compra só é confirmada
// depois de consultar a cobrança no próprio Sicredi (consultar_pix_da_compra),
// com o valor que o banco informar.
if ($acao === "webhook") {
    if (WEBHOOK_SEGREDO === "" || !hash_equals(WEBHOOK_SEGREDO, (string) ($_GET["segredo"] ?? ""))) {
        error_log("webhook pix recusado (segredo ausente ou errado) de " . ip_cliente());
        http_response_code(404);
        exit;
    }
    $corpo = corpo_json();
    try {
        $aceitos = 0;
        foreach ($corpo["pix"] ?? [] as $p) {
            $txid = (string) ($p["txid"] ?? "");
            if (!preg_match('/^CP[a-f0-9]{1,30}$/i', $txid)) continue;
            $pdo->prepare("INSERT IGNORE INTO pix_pagos (txid, valor) VALUES (?, ?)")->execute([$txid, $p["valor"] ?? null]);
            $stmt = $pdo->prepare("SELECT compraId FROM pix_cobrancas WHERE txid = ?");
            $stmt->execute([$txid]);
            $compraId = $stmt->fetchColumn();
            if ($compraId) {
                [$status, $valor] = consultar_cobranca_sicredi($txid);
                if ($status === "CONCLUIDA" && $valor !== null) {
                    confirmar_pagamento_compra($pdo, (string) $compraId, "pix", $txid, $valor);
                    $aceitos++;
                }
            }
        }
        registrar_auditoria($pdo, "webhook_pix", "$aceitos pagamento(s) confirmado(s)");
    } catch (Throwable $e) {
        error_log("webhook pix: " . $e->getMessage());
    }
    http_response_code(200);
    exit;
}

json_out(["erro" => "Ação desconhecida."], 400);
