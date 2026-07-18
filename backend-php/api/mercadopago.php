<?php
// ─── Pagamento com cartão (Mercado Pago) ─────────────────────────────────────
// POST /api/pagamento/cartao       → processa um pagamento { paymentId, status }
// POST /api/webhook/mercadopago    → notificação instantânea do Mercado Pago
//
// IMPORTANTE (segurança do cartão): o número do cartão, validade e CVV NUNCA
// devem chegar neste servidor. O front-end usa o SDK do Mercado Pago
// (MP_PUBLIC_KEY) para transformar os dados do cartão num "token" ainda no
// navegador do cliente — só esse token chega aqui. Sem isso, a loja cairia
// fora do padrão PCI (armazenar/transmitir cartão "na mão").

require_once __DIR__ . "/lib.php";
cors();

$acao = $_GET["acao"] ?? "";

// Chamada à API do Mercado Pago
function chamar_mp(string $metodo, string $caminho, ?array $corpo) {
    $ch = curl_init("https://api.mercadopago.com" . $caminho);
    $headers = [
        "Content-Type: application/json",
        "Authorization: Bearer " . MP_ACCESS_TOKEN,
        "X-Idempotency-Key: " . bin2hex(random_bytes(16)),
    ];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($corpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($corpo));
    $resposta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$codigo, is_string($resposta) ? json_decode($resposta, true) : null];
}

// Confere o cabeçalho X-Signature (evita que qualquer um chame o webhook
// fingindo ser o Mercado Pago para liberar pedido sem pagamento real).
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks#Verificação-da-origem-da-notificação
function assinatura_valida(string $dataId): bool {
    if (MP_WEBHOOK_SECRET === "") return true; // ainda não cadastrado no painel

    $xSignature = $_SERVER["HTTP_X_SIGNATURE"] ?? "";
    $xRequestId = $_SERVER["HTTP_X_REQUEST_ID"] ?? "";
    if ($xSignature === "" || $xRequestId === "") return false;

    $partes = [];
    foreach (explode(",", $xSignature) as $par) {
        $kv = explode("=", $par, 2);
        if (count($kv) === 2) $partes[trim($kv[0])] = trim($kv[1]);
    }
    $ts = $partes["ts"] ?? null;
    $hashRecebido = $partes["v1"] ?? null;
    if (!$ts || !$hashRecebido) return false;

    // O manifest usa o id sempre em minúsculo
    $manifest = "id:" . strtolower($dataId) . ";request-id:" . $xRequestId . ";ts:" . $ts . ";";
    $hashCalculado = hash_hmac("sha256", $manifest, MP_WEBHOOK_SECRET);

    return hash_equals($hashCalculado, $hashRecebido);
}

// Traduz o status do Mercado Pago pro status do pedido na loja
function status_do_pedido(string $statusMp): ?string {
    return match ($statusMp) {
        "approved" => "Pago",
        "rejected", "cancelled" => "Cancelado",
        default => null, // pending, in_process, etc. — não muda o pedido ainda
    };
}

// ── Cofre de cartões ──────────────────────────────────────────────────────────
// Devolve o "customer" do Mercado Pago dono desse e-mail — cria um na hora se
// ainda não existir. É esse customer que guarda os cartões salvos de verdade
// (nós só guardamos o id dele, em mp_clientes).
function obter_ou_criar_cliente_mp(string $email): ?string {
    $email = strtolower(trim($email));
    if ($email === "") return null;

    try {
        $stmt = db()->prepare("SELECT mp_customer_id FROM mp_clientes WHERE email = ?");
        $stmt->execute([$email]);
        $linha = $stmt->fetch();
        if ($linha && $linha["mp_customer_id"]) return $linha["mp_customer_id"];
    } catch (Throwable $e) {
        // sem banco pra checar, tenta criar um novo mesmo assim
    }

    [$codigo, $resposta] = chamar_mp("POST", "/v1/customers", ["email" => $email]);
    if ($codigo >= 200 && $codigo < 300 && isset($resposta["id"])) {
        try {
            $stmt = db()->prepare(
                "INSERT INTO mp_clientes (email, mp_customer_id) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE mp_customer_id = VALUES(mp_customer_id)"
            );
            $stmt->execute([$email, $resposta["id"]]);
        } catch (Throwable $e) {
            // mesmo sem gravar no nosso banco, o customer já existe no Mercado
            // Pago — devolve o id pra tentar salvar o cartão agora mesmo
        }
        return $resposta["id"];
    }

    return null;
}

// ── Salvar cartão no cofre (Mercado Pago) ─────────────────────────────────────
// Recebe um token (gerado no front-end com os dados completos do cartão) e
// anexa esse cartão ao customer do cliente. Devolve só o suficiente pra
// guardar na tabela cartoes_salvos (nunca o cartão em si).
if ($acao === "salvar_cartao") {
    $corpo = corpo_json();
    $email = $corpo["email"] ?? "";
    $token = $corpo["token"] ?? null;

    if ($email === "") json_out(["erro" => "E-mail ausente."], 400);
    if (!$token) json_out(["erro" => "Token do cartão ausente."], 400);

    $customerId = obter_ou_criar_cliente_mp($email);
    if (!$customerId) json_out(["erro" => "Não foi possível preparar o cofre do Mercado Pago."], 502);

    [$codigo, $resposta] = chamar_mp("POST", "/v1/customers/{$customerId}/cards", ["token" => $token]);

    if ($codigo >= 200 && $codigo < 300 && isset($resposta["id"])) {
        $validade = null;
        if (isset($resposta["expiration_month"], $resposta["expiration_year"])) {
            $mes = str_pad((string) $resposta["expiration_month"], 2, "0", STR_PAD_LEFT);
            $ano = substr((string) $resposta["expiration_year"], -2);
            $validade = "{$mes}/{$ano}";
        }
        json_out([
            "mpCardId" => (string) $resposta["id"],
            "mpCustomerId" => $customerId,
            "bandeira" => $resposta["payment_method"]["name"] ?? ($resposta["payment_method"]["id"] ?? "Cartão"),
            "ultimosDigitos" => $resposta["last_four_digits"] ?? null,
            "validade" => $validade,
            "nomeCartao" => $resposta["cardholder"]["name"] ?? null,
        ]);
    }

    json_out(["erro" => "Não foi possível salvar o cartão no Mercado Pago.", "detalhe" => $resposta], 502);
}

// ── Criar pagamento com cartão ────────────────────────────────────────────────
if ($acao === "pagamento") {
    $corpo = corpo_json();
    $valor = (float) ($corpo["valor"] ?? 0);
    $token = $corpo["token"] ?? null; // gerado no front-end pelo SDK do Mercado Pago
    $parcelas = max(1, (int) ($corpo["parcelas"] ?? 1));
    $email = $corpo["email"] ?? "";
    $pedidoId = $corpo["pedidoId"] ?? null;
    $metodoPagamento = $corpo["paymentMethodId"] ?? null;

    if ($valor <= 0) json_out(["erro" => "Valor inválido."], 400);
    if (!$token) json_out(["erro" => "Token do cartão ausente (gere no front-end com o SDK do Mercado Pago)."], 400);

    $requisicao = [
        "transaction_amount" => round($valor, 2),
        "token" => $token,
        "installments" => $parcelas,
        "description" => "Compra na loja Coração Presente",
        "payer" => ["email" => $email],
    ];
    if ($metodoPagamento) $requisicao["payment_method_id"] = $metodoPagamento;
    if ($pedidoId) $requisicao["external_reference"] = (string) $pedidoId;

    [$codigo, $resposta] = chamar_mp("POST", "/v1/payments", $requisicao);

    if ($codigo >= 200 && $codigo < 300 && isset($resposta["id"])) {
        // Já grava o resultado — não precisa esperar o webhook pra saber o status
        try {
            $stmt = db()->prepare(
                "INSERT INTO mp_pagamentos (payment_id, pedido_id, status, valor) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status = VALUES(status), valor = VALUES(valor)"
            );
            $stmt->execute([(string) $resposta["id"], $pedidoId, $resposta["status"], $valor]);

            $novoStatus = status_do_pedido($resposta["status"]);
            if ($novoStatus && $pedidoId) {
                $upd = db()->prepare("UPDATE pedidos SET status = ? WHERE id = ?");
                $upd->execute([$novoStatus, $pedidoId]);
            }
        } catch (Throwable $e) {
            // não impede a resposta ao cliente por causa do banco
        }

        json_out([
            "paymentId" => $resposta["id"],
            "status" => $resposta["status"],
            "statusDetail" => $resposta["status_detail"] ?? null,
        ]);
    }

    json_out(["erro" => "Não foi possível processar o pagamento.", "detalhe" => $resposta], 502);
}

// ── Webhook (o Mercado Pago avisa aqui quando um pagamento muda de status) ────
if ($acao === "webhook") {
    $corpo = corpo_json();
    $tipo = $corpo["type"] ?? $corpo["topic"] ?? ($_GET["type"] ?? $_GET["topic"] ?? "");
    $dataId = $corpo["data"]["id"] ?? ($_GET["data.id"] ?? $_GET["id"] ?? null);

    // Só nos interessa notificação de pagamento; qualquer outra coisa é só confirmada
    if ($tipo !== "payment" || !$dataId) {
        http_response_code(200);
        exit;
    }

    if (!assinatura_valida((string) $dataId)) {
        http_response_code(401);
        exit;
    }

    // Nunca confie no corpo da notificação: consulta o status real na API
    [$codigo, $pagamento] = chamar_mp("GET", "/v1/payments/{$dataId}", null);

    if ($codigo >= 200 && $codigo < 300 && $pagamento) {
        $status = $pagamento["status"] ?? null;
        $externalRef = $pagamento["external_reference"] ?? null;
        $valor = $pagamento["transaction_amount"] ?? null;

        try {
            $stmt = db()->prepare(
                "INSERT INTO mp_pagamentos (payment_id, pedido_id, status, valor) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status = VALUES(status), valor = VALUES(valor)"
            );
            $stmt->execute([(string) $dataId, $externalRef, $status, $valor]);

            $novoStatus = $status ? status_do_pedido($status) : null;
            if ($novoStatus && $externalRef) {
                $upd = db()->prepare("UPDATE pedidos SET status = ? WHERE id = ?");
                $upd->execute([$novoStatus, $externalRef]);
            }
        } catch (Throwable $e) {
            // não derruba o webhook por causa do banco
        }
    }

    // Sempre 200: se não responder assim, o Mercado Pago reenvia de hora em
    // hora achando que o servidor caiu.
    http_response_code(200);
    exit;
}

json_out(["erro" => "Ação desconhecida."], 400);
