<?php
// ─── PIX: cobrança oficial do Sicredi ou PIX conferido pelo Admin ───────────
//
// Com a API Pix do Sicredi configurada (config.php), cada compra ganha uma
// cobrança oficial e a confirmação é automática (consulta + webhook).
//
// Sem a API, a loja continua vendendo: o cliente recebe um "copia e cola" da
// chave PIX da loja com o valor exato e o número da compra, e o Admin confirma
// o recebimento no painel (Pedidos → "Confirmar pagamento"). A compra fica
// reservada por 24 h enquanto isso.

require_once __DIR__ . "/lib.php";

function sicredi_base(): string {
    return SICREDI_AMBIENTE === "producao"
        ? "https://api-pix.sicredi.com.br"
        : "https://api-pix-h.sicredi.com.br";
}

// Chamada à API do Sicredi com o certificado mTLS
function chamar_sicredi(string $metodo, string $caminho, ?array $corpo, ?string $token): array {
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

// Token OAuth2 (client_credentials), guardado por alguns minutos no arquivo
// temporário — pedir um token novo a cada consulta de 5 s sobrecarregava a
// API do banco sem necessidade.
function obter_token(): ?string {
    $cache = rtrim(sys_get_temp_dir(), "/\\") . DIRECTORY_SEPARATOR . "cp_sicredi_token_" . md5(SICREDI_CLIENT_ID) . ".json";
    $salvo = @json_decode((string) @file_get_contents($cache), true);
    if (is_array($salvo) && ($salvo["expira"] ?? 0) > time() + 30) return (string) $salvo["token"];

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
    $token = $dados["access_token"] ?? null;
    if ($token) {
        @file_put_contents($cache, json_encode(["token" => $token, "expira" => time() + (int) ($dados["expires_in"] ?? 300)]));
        @chmod($cache, 0600);
    }
    return $token;
}

// Consulta uma cobrança no Sicredi. Devolve [status, valorPago] (valor null
// quando ainda não foi paga).
function consultar_cobranca_sicredi(string $txid): array {
    $token = obter_token();
    if ($token === null) return [null, null];
    [$codigo, $resposta] = chamar_sicredi("GET", "/api/v2/cob/" . rawurlencode($txid), null, $token);
    if ($codigo < 200 || $codigo >= 300 || !isset($resposta["status"])) return [null, null];
    $valor = null;
    if (!empty($resposta["pix"]) && is_array($resposta["pix"])) {
        $valor = 0.0;
        foreach ($resposta["pix"] as $p) $valor += (float) ($p["valor"] ?? 0);
    } elseif ($resposta["status"] === "CONCLUIDA") {
        $valor = (float) ($resposta["valor"]["original"] ?? 0);
    }
    return [(string) $resposta["status"], $valor];
}

// Pergunta ao banco se alguma cobrança desta compra foi paga e, se sim,
// confirma a compra. Devolve true quando a compra está paga.
function consultar_pix_da_compra(PDO $pdo, string $compraId): bool {
    if (!pix_api_configurada()) return false;
    $stmt = $pdo->prepare("SELECT txid FROM pix_cobrancas WHERE compraId = ? AND modo = 'api' ORDER BY criadoEm DESC LIMIT 3");
    $stmt->execute([$compraId]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $txid) {
        // Quem diz que foi pago é sempre o próprio banco, consultado agora.
        [$status, $valor] = consultar_cobranca_sicredi($txid);
        if ($status === "CONCLUIDA" && $valor !== null) {
            return confirmar_pagamento_compra($pdo, $compraId, "pix", $txid, $valor);
        }
    }
    return false;
}

// Cria (ou reaproveita) a cobrança PIX de uma compra. Devolve o que a tela de
// pagamento mostra: copia e cola, modo (api | manual) e validade.
function cobranca_pix_da_compra(PDO $pdo, array $compra): array {
    // Reaproveita uma cobrança ainda válida — gerar outra a cada F5 criaria
    // várias cobranças para a mesma compra no extrato do banco.
    $stmt = $pdo->prepare(
        "SELECT * FROM pix_cobrancas WHERE compraId = ? AND expiraEm > ? ORDER BY criadoEm DESC LIMIT 1"
    );
    $stmt->execute([$compra["id"], agora_brasil("Y-m-d H:i:s", "+60 seconds")]);
    $existente = $stmt->fetch();
    if ($existente && abs((float) $existente["valor"] - (float) $compra["total"]) < 0.005) {
        return [
            "txid" => $existente["txid"], "modo" => $existente["modo"],
            "pixCopiaECola" => $existente["pixCopiaECola"], "expiraEm" => $existente["expiraEm"],
        ];
    }

    $config = config_loja($pdo);
    $segundos = max(120, strtotime($compra["expiraEm"]) - strtotime(agora_brasil()));
    $expira = agora_brasil("Y-m-d H:i:s", "+$segundos seconds");

    if (pix_api_configurada()) {
        $token = obter_token();
        if ($token === null) throw new ErroDeCompra("Não foi possível falar com o banco agora. Tente em instantes.", 502);
        $txid = substr("CP" . bin2hex(random_bytes(16)), 0, 32);
        [$codigo, $resposta] = chamar_sicredi("PUT", "/api/v2/cob/" . $txid, [
            "calendario" => ["expiracao" => $segundos],
            "valor" => ["original" => number_format((float) $compra["total"], 2, ".", "")],
            "chave" => chave_pix_da_loja($config),
            "solicitacaoPagador" => "Compra " . $compra["id"] . " - Coracao Presente",
        ], $token);
        if ($codigo < 200 || $codigo >= 300 || !isset($resposta["pixCopiaECola"])) {
            throw new ErroDeCompra("O banco não conseguiu gerar o PIX agora. Tente em instantes.", 502);
        }
        $copiaECola = (string) $resposta["pixCopiaECola"];
        $modo = "api";
    } elseif (pix_manual_ativo($config)) {
        $txid = "M" . substr($compra["id"], 2, 24);
        $copiaECola = pix_estatico(chave_pix_da_loja($config), (float) $compra["total"], $compra["id"]);
        $modo = "manual";
    } else {
        throw new ErroDeCompra("O pagamento por PIX está indisponível no momento. Fale com a loja.", 503);
    }

    $pdo->prepare(
        "INSERT INTO pix_cobrancas (txid, compraId, email, valor, modo, pixCopiaECola, criadoEm, expiraEm)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), pixCopiaECola = VALUES(pixCopiaECola), expiraEm = VALUES(expiraEm)"
    )->execute([$txid, $compra["id"], $compra["email"], (float) $compra["total"], $modo, $copiaECola, agora_brasil(), $expira]);

    return ["txid" => $txid, "modo" => $modo, "pixCopiaECola" => $copiaECola, "expiraEm" => $expira];
}
