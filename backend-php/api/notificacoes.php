<?php
// ─── Rotas das notificações no celular ───────────────────────────────────────
// GET    /api/push/chave-publica  → chave VAPID que o navegador precisa
// POST   /api/push/inscrever      → { endpoint, email } grava a autorização
// DELETE /api/push/inscrever      → { endpoint } cancela
// GET    /api/push/pendentes?e=   → avisos ainda não mostrados (usado pelo
//                                   service worker quando o push chega)
//
// A lógica de envio fica em avisos.php.

require_once __DIR__ . "/avisos.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}

$acao = $_GET["acao"] ?? "";
$metodo = $_SERVER["REQUEST_METHOD"];

// ── Chave pública: sem ela o navegador nem consegue pedir permissão ──
if ($acao === "chave-publica") {
    // Chave nula = integração desligada. O site entende isso e simplesmente
    // não oferece o botão de notificações.
    json_out(["chave" => vapid_chave_publica()]);
}

// ── Inscrever / cancelar ──
if ($acao === "inscrever") {
    $corpo = corpo_json();
    $endpoint = trim((string) ($corpo["endpoint"] ?? ""));
    if ($endpoint === "" || !filter_var($endpoint, FILTER_VALIDATE_URL)) {
        json_out(["erro" => "Inscrição inválida."], 400);
    }
    $hash = hash("sha256", $endpoint);

    if ($metodo === "DELETE") {
        $pdo->prepare("DELETE FROM push_inscricoes WHERE endpointHash = ?")->execute([$hash]);
        json_out(["ok" => true]);
    }

    if ($metodo !== "POST") json_out(["erro" => "Método não permitido."], 405);

    // O e-mail vem da SESSÃO, nunca do que o navegador mandou: senão qualquer
    // um poderia se inscrever para receber os avisos dos pedidos de outra
    // pessoa. Por isso notificação só é oferecida para quem está logado.
    // (email_autenticado já responde 401 sozinho se não houver sessão válida)
    $email = email_autenticado($pdo);

    limitar_taxa($pdo, "push_inscrever", 30, 600);

    // Mesmo celular inscrito de novo (ou em outra conta) só atualiza a linha.
    $pdo->prepare(
        "INSERT INTO push_inscricoes (endpointHash, endpoint, email, criadoEm)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE email = VALUES(email), criadoEm = NOW()"
    )->execute([$hash, $endpoint, $email]);

    json_out(["ok" => true]);
}

// ── Avisos pendentes: quem chama é o service worker, sem sessão ──
// A autorização aqui é o próprio endpoint: ele é uma URL secreta, gerada pelo
// navegador e conhecida só por ele e por nós. Ainda assim, devolve só título
// e texto — nada de endereço, valor ou dado pessoal.
if ($acao === "pendentes") {
    if ($metodo !== "GET") json_out(["erro" => "Método não permitido."], 405);

    $hash = trim((string) ($_GET["e"] ?? ""));
    if (!preg_match('/^[a-f0-9]{64}$/', $hash)) json_out(["erro" => "Inscrição inválida."], 400);

    limitar_taxa($pdo, "push_pendentes", 60, 600);

    $stmt = $pdo->prepare("SELECT email FROM push_inscricoes WHERE endpointHash = ?");
    $stmt->execute([$hash]);
    $inscricao = $stmt->fetch();
    if (!$inscricao) json_out(["avisos" => []]);

    $stmt = $pdo->prepare(
        "SELECT id, titulo, corpo, pedidoId FROM notificacoes_cliente
         WHERE LOWER(email) = ? AND entregue = 0 ORDER BY id ASC LIMIT 5"
    );
    $stmt->execute([strtolower($inscricao["email"])]);
    $avisos = $stmt->fetchAll();

    if ($avisos) {
        $marcas = implode(",", array_fill(0, count($avisos), "?"));
        $pdo->prepare("UPDATE notificacoes_cliente SET entregue = 1 WHERE id IN ($marcas)")
            ->execute(array_column($avisos, "id"));
    }

    json_out(["avisos" => array_map(fn($a) => [
        "titulo" => $a["titulo"],
        "corpo" => $a["corpo"],
        "pedidoId" => $a["pedidoId"],
    ], $avisos)]);
}

json_out(["erro" => "Rota não encontrada."], 404);
