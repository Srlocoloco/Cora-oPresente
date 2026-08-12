<?php
// ─── Pagamento no cartão de crédito ──────────────────────────────────────────
// POST /api/cartao/pagamento            → { transacaoId, status }
// GET  /api/cartao/pagamento/{id}       → { status }
// POST /api/webhook/cartao              → notificação do adquirente
//
// Status possíveis (contrato com o site): APROVADO | PENDENTE | RECUSADO.
// O site só conclui a compra com APROVADO — igual ao PIX, que só conclui
// quando o Sicredi confirma que o dinheiro caiu.
//
// IMPORTANTE (PCI): os dados do cartão NUNCA são gravados, logados nem
// devolvidos por este arquivo. Eles existem só na memória, o tempo de
// repassar ao adquirente dentro de autorizar_no_gateway().

require_once __DIR__ . "/lib.php";
cors();

$acao = $_GET["acao"] ?? "";
$pdo = db();

function cartao_configurado(): bool {
    return defined("SICREDI_CARTAO_URL") && SICREDI_CARTAO_URL !== ""
        && SICREDI_CARTAO_CLIENT_ID !== "" && SICREDI_CARTAO_CLIENT_SECRET !== "";
}

// ── ÚNICO PONTO A PREENCHER NA INTEGRAÇÃO ────────────────────────────────────
// Envia a autorização ao adquirente e devolve [status, idNoAdquirente].
// $cartao = ["numero", "nome", "validade" (MM/AA), "cvv"] — não persistir.
// Troque o corpo pela chamada real do Sicredi (mesmo padrão do pix.php:
// curl com CURLOPT_SSLCERT/CURLOPT_SSLKEY quando o adquirente exigir mTLS).
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
    // mTLS opcional: reaproveita os certificados da API Pix se existirem
    if (file_exists(SICREDI_CERT_PATH) && file_exists(SICREDI_KEY_PATH)) {
        $opcoes[CURLOPT_SSLCERT] = SICREDI_CERT_PATH;
        $opcoes[CURLOPT_SSLKEY] = SICREDI_KEY_PATH;
    }
    curl_setopt_array($ch, $opcoes);
    $resposta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $dados = is_string($resposta) ? json_decode($resposta, true) : null;
    if ($codigo < 200 || $codigo >= 300 || !is_array($dados)) return ["RECUSADO", null];

    // Ajuste este mapeamento aos nomes que o adquirente devolver de verdade
    $bruto = strtoupper((string) ($dados["status"] ?? ""));
    $status = in_array($bruto, ["APROVADO", "AUTHORIZED", "APPROVED", "PAID", "CONFIRMADA"], true)
        ? "APROVADO"
        : (in_array($bruto, ["PENDENTE", "PENDING", "IN_ANALYSIS", "EM_ANALISE"], true) ? "PENDENTE" : "RECUSADO");
    return [$status, $dados["id"] ?? ($dados["nsu"] ?? null)];
}

// ── Criar pagamento ──────────────────────────────────────────────────────────
if ($acao === "pagamento") {
    // Só um cliente logado paga (mesma regra do checkout)
    $email = strtolower(email_autenticado($pdo));
    // No máximo 10 tentativas de cartão por IP a cada 10 minutos
    limitar_taxa($pdo, "cartao_pagamento", 10, 600);

    if (!cartao_configurado()) {
        json_out(["erro" => "Pagamento com cartão ainda não configurado."], 503);
    }

    $corpo = corpo_json();
    $valor = (float) ($corpo["valor"] ?? 0);
    $parcelas = (int) ($corpo["parcelas"] ?? 1);
    $cartao = $corpo["cartao"] ?? [];
    if ($valor <= 0) json_out(["erro" => "Valor inválido."], 400);
    if ($parcelas < 1 || $parcelas > 12) json_out(["erro" => "Parcelas inválidas."], 400);
    foreach (["numero", "nome", "validade", "cvv"] as $campo) {
        if (empty($cartao[$campo])) json_out(["erro" => "Dados do cartão incompletos."], 400);
    }

    $transacaoId = substr("CT" . bin2hex(random_bytes(20)), 0, 40);
    $pdo->prepare("INSERT INTO cartao_pagamentos (transacaoId, email, valor, parcelas, status) VALUES (?, ?, ?, ?, 'PENDENTE')")
        ->execute([$transacaoId, $email, $valor, $parcelas]);

    [$status, $idAdquirente] = autorizar_no_gateway($cartao, $valor, $parcelas, $transacaoId);
    unset($cartao, $corpo); // os dados do cartão morrem aqui

    $pdo->prepare("UPDATE cartao_pagamentos SET status = ?, id_adquirente = ? WHERE transacaoId = ?")
        ->execute([$status, $idAdquirente, $transacaoId]);

    json_out(["transacaoId" => $transacaoId, "status" => $status]);
}

// ── Consultar status ─────────────────────────────────────────────────────────
if ($acao === "status") {
    $email = strtolower(email_autenticado($pdo));
    $transacaoId = $_GET["transacaoId"] ?? "";
    if ($transacaoId === "") json_out(["erro" => "transacaoId ausente."], 400);

    $stmt = $pdo->prepare("SELECT status FROM cartao_pagamentos WHERE transacaoId = ? AND email = ?");
    $stmt->execute([$transacaoId, $email]);
    $linha = $stmt->fetch();
    if (!$linha) json_out(["erro" => "Pagamento não encontrado."], 404);
    json_out(["status" => $linha["status"]]);
}

// ── Webhook (o adquirente avisa quando a análise termina) ────────────────────
if ($acao === "webhook") {
    $corpo = corpo_json();
    $transacaoId = $corpo["transacaoId"] ?? null;
    $bruto = strtoupper((string) ($corpo["status"] ?? ""));
    if ($transacaoId) {
        $status = in_array($bruto, ["APROVADO", "AUTHORIZED", "APPROVED", "PAID", "CONFIRMADA"], true)
            ? "APROVADO"
            : (in_array($bruto, ["PENDENTE", "PENDING", "IN_ANALYSIS", "EM_ANALISE"], true) ? "PENDENTE" : "RECUSADO");
        try {
            $pdo->prepare("UPDATE cartao_pagamentos SET status = ? WHERE transacaoId = ?")
                ->execute([$status, $transacaoId]);
        } catch (Throwable $e) {
            // não derruba o webhook por causa do banco
        }
    }
    http_response_code(200);
    exit;
}

json_out(["erro" => "Ação desconhecida."], 400);
