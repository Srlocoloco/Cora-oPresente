<?php
// ─── Cobranças PIX (API Pix Sicredi) ─────────────────────────────────────────
// POST /api/pix/cobranca          → cria cobrança de 30 min { txid, pixCopiaECola }
// GET  /api/pix/cobranca/{txid}   → { status: ATIVA | CONCLUIDA }
// POST /api/webhook/pix           → notificação instantânea do Sicredi

require_once __DIR__ . "/lib.php";
cors();

$acao = $_GET["acao"] ?? "";

function sicredi_base(): string {
    return SICREDI_AMBIENTE === "producao"
        ? "https://api-pix.sicredi.com.br"
        : "https://api-pix-h.sicredi.com.br";
}

function pix_configurado(): bool {
    return SICREDI_CLIENT_ID !== "" && SICREDI_CLIENT_SECRET !== ""
        && file_exists(SICREDI_CERT_PATH) && file_exists(SICREDI_KEY_PATH);
}

// Chamada à API do Sicredi com o certificado mTLS
function chamar_sicredi(string $metodo, string $caminho, ?array $corpo, ?string $token) {
    $ch = curl_init(sicredi_base() . $caminho);
    $headers = ["Content-Type: application/json"];
    if ($token !== null) $headers[] = "Authorization: Bearer " . $token;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_SSLCERT => SICREDI_CERT_PATH,
        CURLOPT_SSLKEY => SICREDI_KEY_PATH,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($corpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($corpo));
    $resposta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$codigo, is_string($resposta) ? json_decode($resposta, true) : null];
}

// Token OAuth2 (client_credentials)
function obter_token(): ?string {
    $url = sicredi_base() . "/oauth/token?grant_type=client_credentials&scope="
         . urlencode("cob.read cob.write webhook.read webhook.write");
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => "",
        CURLOPT_USERPWD => SICREDI_CLIENT_ID . ":" . SICREDI_CLIENT_SECRET,
        CURLOPT_SSLCERT => SICREDI_CERT_PATH,
        CURLOPT_SSLKEY => SICREDI_KEY_PATH,
        CURLOPT_TIMEOUT => 20,
    ]);
    $resposta = curl_exec($ch);
    curl_close($ch);
    $dados = is_string($resposta) ? json_decode($resposta, true) : null;
    return $dados["access_token"] ?? null;
}

// Chave PIX: usa a das Configurações da loja (banco); reserva no config.php
function chave_pix(): string {
    try {
        $linha = db()->query("SELECT chavePix FROM config WHERE id = 1")->fetch();
        if ($linha && !empty($linha["chavePix"])) return $linha["chavePix"];
    } catch (Throwable $e) {
        // sem banco, segue com a reserva
    }
    return PIX_CHAVE_RESERVA;
}

// ── Criar cobrança ────────────────────────────────────────────────────────────
if ($acao === "cobranca") {
    if (!pix_configurado()) {
        json_out(["erro" => "PIX Sicredi ainda não configurado (veja o README)."], 503);
    }
    $corpo = corpo_json();
    $valor = (float) ($corpo["valor"] ?? 0);
    if ($valor <= 0) json_out(["erro" => "Valor inválido."], 400);

    $token = obter_token();
    if ($token === null) json_out(["erro" => "Falha na autenticação com o Sicredi."], 502);

    $txid = substr("CP" . bin2hex(random_bytes(20)), 0, 32);
    [$codigo, $resposta] = chamar_sicredi("PUT", "/api/v2/cob/" . $txid, [
        "calendario" => ["expiracao" => 1800], // 30 minutos, igual ao site
        "valor" => ["original" => number_format($valor, 2, ".", "")],
        "chave" => chave_pix(),
        "solicitacaoPagador" => "Compra na loja Coração Presente",
    ], $token);

    if ($codigo >= 200 && $codigo < 300 && isset($resposta["pixCopiaECola"])) {
        json_out([
            "txid" => $txid,
            "pixCopiaECola" => $resposta["pixCopiaECola"],
            "status" => $resposta["status"] ?? "ATIVA",
        ]);
    }
    json_out(["erro" => "Não foi possível criar a cobrança no Sicredi."], 502);
}

// ── Consultar status ──────────────────────────────────────────────────────────
if ($acao === "status") {
    if (!pix_configurado()) json_out(["erro" => "PIX Sicredi não configurado."], 503);
    $txid = $_GET["txid"] ?? "";
    if ($txid === "") json_out(["erro" => "txid ausente."], 400);

    // O webhook pode já ter avisado que este PIX foi pago
    try {
        $stmt = db()->prepare("SELECT txid FROM pix_pagos WHERE txid = ?");
        $stmt->execute([$txid]);
        if ($stmt->fetch()) json_out(["status" => "CONCLUIDA"]);
    } catch (Throwable $e) {
        // sem banco, consulta direto no Sicredi
    }

    $token = obter_token();
    if ($token === null) json_out(["erro" => "Falha na autenticação com o Sicredi."], 502);
    [$codigo, $resposta] = chamar_sicredi("GET", "/api/v2/cob/" . $txid, null, $token);
    if ($codigo >= 200 && $codigo < 300 && isset($resposta["status"])) {
        json_out(["status" => $resposta["status"]]);
    }
    json_out(["erro" => "Não foi possível consultar a cobrança."], 502);
}

// ── Webhook (o Sicredi chama quando um PIX é pago) ────────────────────────────
if ($acao === "webhook") {
    $corpo = corpo_json();
    try {
        $stmt = db()->prepare("INSERT IGNORE INTO pix_pagos (txid, valor) VALUES (?, ?)");
        foreach ($corpo["pix"] ?? [] as $p) {
            if (!empty($p["txid"])) $stmt->execute([$p["txid"], $p["valor"] ?? null]);
        }
    } catch (Throwable $e) {
        // não derruba o webhook por causa do banco
    }
    http_response_code(200);
    exit;
}

json_out(["erro" => "Ação desconhecida."], 400);
