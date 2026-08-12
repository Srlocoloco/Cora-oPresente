<?php
// ─── Cliente da API de rastreamento dos Correios ─────────────────────────────
// Usado por pedidos.php (rastreamento público) e nada mais. Duas chamadas:
//
//   1. POST /token/v1/autentica/cartaopostagem  → token de ~24h (Basic auth
//      com usuário + código de acesso, e o número do cartão de postagem)
//   2. GET  /srorastro/v1/objetos/{codigo}?resultado=T → eventos do objeto
//
// Se as credenciais não estiverem preenchidas em config.php, tudo aqui
// devolve null e o site cai no andamento interno da loja — de propósito: o
// rastreamento nunca deve quebrar por causa da integração.

require_once __DIR__ . "/config.php";

function correios_configurado(): bool {
    return CORREIOS_USUARIO !== ""
        && CORREIOS_CODIGO_ACESSO !== ""
        && CORREIOS_CARTAO_POSTAGEM !== "";
}

function correios_base(): string {
    return CORREIOS_AMBIENTE === "homologacao"
        ? "https://apihom.correios.com.br"
        : "https://api.correios.com.br";
}

// O token vale cerca de um dia. Pedir um novo a cada consulta seria lento e
// ainda gastaria o limite de requisições do contrato, então ele fica guardado
// num arquivo temporário do servidor (some sozinho, não vai pro banco nem
// pro Git) e só é renovado quando falta menos de 5 min para expirar.
function correios_arquivo_token(): string {
    return sys_get_temp_dir() . "/cp_correios_token.json";
}

function correios_token(): ?string {
    if (!correios_configurado()) return null;

    $arquivo = correios_arquivo_token();
    if (is_readable($arquivo)) {
        $cache = json_decode((string) @file_get_contents($arquivo), true);
        if (is_array($cache) && ($cache["expira"] ?? 0) > time() + 300 && !empty($cache["token"])) {
            return $cache["token"];
        }
    }

    $ch = curl_init(correios_base() . "/token/v1/autentica/cartaopostagem");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_USERPWD => CORREIOS_USUARIO . ":" . CORREIOS_CODIGO_ACESSO,
        CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
        CURLOPT_POSTFIELDS => json_encode(["numero" => CORREIOS_CARTAO_POSTAGEM]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $resposta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($codigo < 200 || $codigo >= 300) {
        error_log("Correios: falha ao autenticar (HTTP $codigo)");
        return null;
    }
    $dados = is_string($resposta) ? json_decode($resposta, true) : null;
    $token = $dados["token"] ?? null;
    if (!$token) return null;

    // "expiraEm" vem como data ISO; na dúvida, guarda por 12h só.
    $expira = isset($dados["expiraEm"]) ? strtotime($dados["expiraEm"]) : false;
    @file_put_contents(
        $arquivo,
        json_encode(["token" => $token, "expira" => $expira ?: time() + 43200])
    );
    return $token;
}

// Formato aceito pelos Correios: 2 letras + 9 dígitos + 2 letras (ex.: AA123456789BR)
function correios_codigo_valido(string $codigo): bool {
    return (bool) preg_match('/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/', strtoupper(trim($codigo)));
}

// Devolve a lista de eventos (mais recente primeiro) ou null quando não deu
// para consultar — sem credenciais, código inválido, API fora do ar, objeto
// ainda não postado. Quem chama decide o que mostrar nesse caso.
function correios_eventos(string $codigo): ?array {
    $codigo = strtoupper(trim($codigo));
    if (!correios_codigo_valido($codigo)) return null;

    $token = correios_token();
    if ($token === null) return null;

    $ch = curl_init(correios_base() . "/srorastro/v1/objetos/" . urlencode($codigo) . "?resultado=T");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $token],
        CURLOPT_TIMEOUT => 15,
    ]);
    $resposta = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($http < 200 || $http >= 300) {
        error_log("Correios: falha ao rastrear $codigo (HTTP $http)");
        return null;
    }

    $dados = is_string($resposta) ? json_decode($resposta, true) : null;
    $objeto = $dados["objetos"][0] ?? null;
    // Objeto inexistente ou ainda não postado vem sem eventos, às vezes com
    // uma mensagem no lugar — nos dois casos não há o que mostrar.
    if (!is_array($objeto) || empty($objeto["eventos"])) return null;

    return array_map(function ($e) {
        $unidade = $e["unidade"]["endereco"] ?? [];
        $cidade = $unidade["cidade"] ?? null;
        $uf = $unidade["uf"] ?? null;
        return [
            "descricao" => $e["descricao"] ?? "",
            "detalhe" => $e["detalhe"] ?? null,
            "data" => $e["dtHrCriado"] ?? null,
            "local" => $cidade ? trim($cidade . ($uf ? " / $uf" : "")) : null,
        ];
    }, $objeto["eventos"]);
}
