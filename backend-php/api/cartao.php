<?php
// ─── Pagamento no cartão de crédito ──────────────────────────────────────────
// POST /api/cartao/pagamento        { compraId, cartao{numero,nome,validade,cvv} } → { transacaoId, status }
// GET  /api/cartao/pagamento/{id}   → { status }
// POST /api/webhook/cartao/{seg}    → aviso do adquirente
//
// Status (contrato com o site): APROVADO | PENDENTE | RECUSADO.
// O valor e as parcelas vêm da COMPRA criada no /api/checkout — o navegador
// não escolhe quanto vai ser cobrado.
//
// IMPORTANTE (PCI): os dados do cartão NUNCA são gravados, logados nem
// devolvidos por este arquivo. Existem só na memória, o tempo de repassar ao
// adquirente dentro de autorizar_no_gateway().

require_once __DIR__ . "/lib_compras.php";
cors();

$acao = $_GET["acao"] ?? "";
try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}
proteger_rota($pdo);

// ── ÚNICO PONTO A PREENCHER NA INTEGRAÇÃO ────────────────────────────────────
// Envia a autorização ao adquirente e devolve [status, idNoAdquirente].
// $cartao = ["numero", "nome", "validade" (MM/AA), "cvv"] — não persistir.
function autorizar_no_gateway(array $cartao, float $valor, int $parcelas, string $transacaoId): array {
    $corpo = [
        "transacaoId" => $transacaoId,
        "valor" => number_format($valor, 2, ".", ""),
        "parcelas" => $parcelas,
        "cartao" => [
            "numero" => preg_replace("/\D/", "", $cartao["numero"]),
            "portador" => $cartao["nome"],
            "validade" => $cartao["validade"],
            "cvv" => $cartao["cvv"],
        ],
    ];
    $ch = curl_init(SICREDI_CARTAO_URL);
    $opcoes = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($corpo),
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/json",
            "Authorization: Basic " . base64_encode(SICREDI_CARTAO_CLIENT_ID . ":" . SICREDI_CARTAO_CLIENT_SECRET),
        ],
    ];
    if (file_exists(SICREDI_CERT_PATH) && file_exists(SICREDI_KEY_PATH)) {
        $opcoes[CURLOPT_SSLCERT] = SICREDI_CERT_PATH;
        $opcoes[CURLOPT_SSLKEY] = SICREDI_KEY_PATH;
    }
    curl_setopt_array($ch, $opcoes);
    $resposta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    unset($corpo);

    $dados = is_string($resposta) ? json_decode($resposta, true) : null;
    if ($codigo < 200 || $codigo >= 300 || !is_array($dados)) return ["RECUSADO", null];
    return [status_do_adquirente((string) ($dados["status"] ?? "")), $dados["id"] ?? ($dados["nsu"] ?? null)];
}

// Ajuste este mapeamento aos nomes que o adquirente devolver de verdade
function status_do_adquirente(string $bruto): string {
    $bruto = strtoupper($bruto);
    if (in_array($bruto, ["APROVADO", "AUTHORIZED", "APPROVED", "PAID", "CONFIRMADA", "CAPTURED"], true)) return "APROVADO";
    if (in_array($bruto, ["PENDENTE", "PENDING", "IN_ANALYSIS", "EM_ANALISE"], true)) return "PENDENTE";
    return "RECUSADO";
}

// ── Pagar uma compra ─────────────────────────────────────────────────────────
if ($acao === "pagamento") {
    if ($_SERVER["REQUEST_METHOD"] !== "POST") json_out(["erro" => "Método não permitido."], 405);
    $email = strtolower(email_autenticado($pdo));
    // No máximo 10 tentativas de cartão por IP a cada 10 minutos (teste de
    // cartão roubado é o abuso mais comum em loja online)
    limitar_taxa($pdo, "cartao_pagamento", 10, 600);
    if (!cartao_configurado()) json_out(["erro" => "Pagamento com cartão ainda não configurado. Escolha PIX."], 503);

    $corpo = corpo_json();
    $cartao = (array) ($corpo["cartao"] ?? []);
    foreach (["numero", "nome", "validade", "cvv"] as $campo) {
        if (empty($cartao[$campo]) || !is_string($cartao[$campo])) json_out(["erro" => "Dados do cartão incompletos."], 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM compras WHERE id = ?");
    $stmt->execute([(string) ($corpo["compraId"] ?? "")]);
    $compra = $stmt->fetch();
    if (!$compra || strtolower($compra["email"]) !== $email) json_out(["erro" => "Compra não encontrada."], 404);
    if ($compra["status"] === "paga") json_out(["transacaoId" => null, "status" => "APROVADO"]);
    if ($compra["status"] !== "aguardando_pagamento") json_out(["erro" => "O prazo desta compra acabou. Finalize de novo pelo carrinho."], 410);
    if ($compra["metodo"] !== "cartao") json_out(["erro" => "Esta compra foi feita para pagamento com PIX."], 409);

    $valor = (float) $compra["total"];
    $parcelas = (int) $compra["parcelas"];
    $transacaoId = substr("CT" . bin2hex(random_bytes(19)), 0, 40);
    $pdo->prepare("INSERT INTO cartao_pagamentos (transacaoId, email, valor, parcelas, status, compraId) VALUES (?, ?, ?, ?, 'PENDENTE', ?)")
        ->execute([$transacaoId, $email, $valor, $parcelas, $compra["id"]]);

    [$status, $idAdquirente] = autorizar_no_gateway($cartao, $valor, $parcelas, $transacaoId);
    unset($cartao, $corpo); // os dados do cartão morrem aqui

    $pdo->prepare("UPDATE cartao_pagamentos SET status = ?, id_adquirente = ? WHERE transacaoId = ?")
        ->execute([$status, $idAdquirente, $transacaoId]);
    if ($status === "APROVADO") confirmar_pagamento_compra($pdo, $compra["id"], "cartao", $transacaoId, $valor);
    json_out(["transacaoId" => $transacaoId, "status" => $status]);
}

// ── Consultar status ─────────────────────────────────────────────────────────
if ($acao === "status") {
    limitar_taxa($pdo, "cartao_status", 120, 600);
    $email = strtolower(email_autenticado($pdo));
    $stmt = $pdo->prepare("SELECT status FROM cartao_pagamentos WHERE transacaoId = ? AND email = ?");
    $stmt->execute([(string) ($_GET["transacaoId"] ?? ""), $email]);
    $linha = $stmt->fetch();
    if (!$linha) json_out(["erro" => "Pagamento não encontrado."], 404);
    json_out(["status" => $linha["status"]]);
}

// ── Webhook do adquirente ────────────────────────────────────────────────────
if ($acao === "webhook") {
    if (WEBHOOK_SEGREDO === "" || !hash_equals(WEBHOOK_SEGREDO, (string) ($_GET["segredo"] ?? ""))) {
        error_log("webhook cartao recusado (segredo ausente ou errado) de " . ip_cliente());
        http_response_code(404);
        exit;
    }
    $corpo = corpo_json();
    $transacaoId = (string) ($corpo["transacaoId"] ?? "");
    if ($transacaoId !== "") {
        $status = status_do_adquirente((string) ($corpo["status"] ?? ""));
        try {
            $pdo->prepare("UPDATE cartao_pagamentos SET status = ? WHERE transacaoId = ?")->execute([$status, $transacaoId]);
            if ($status === "APROVADO") {
                $stmt = $pdo->prepare("SELECT compraId, valor FROM cartao_pagamentos WHERE transacaoId = ?");
                $stmt->execute([$transacaoId]);
                $t = $stmt->fetch();
                if ($t && $t["compraId"]) confirmar_pagamento_compra($pdo, $t["compraId"], "cartao", $transacaoId, (float) $t["valor"]);
            }
        } catch (Throwable $e) {
            error_log("webhook cartao: " . $e->getMessage());
        }
    }
    http_response_code(200);
    exit;
}

json_out(["erro" => "Ação desconhecida."], 400);
