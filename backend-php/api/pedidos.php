<?php
// ─── Um pedido só: status/código de rastreio (Admin) e consulta pública ──────
// PATCH /api/pedidos/{id} → { status: "Entregue", codigoRastreio: "AA1..BR" }
// Não mexe no resto da tabela — evita que essa edição do Admin colida com um
// pedido novo sendo inserido na mesma hora por um cliente.

require_once __DIR__ . "/lib.php";
require_once __DIR__ . "/correios.php";
require_once __DIR__ . "/avisos.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

// ─── Rastreamento público ─────────────────────────────────────────────────────
// GET /api/pedidos/rastrear?id=PED-1024&email=cliente@email.com
// Aberto (sem login), mas exige o número do pedido E o e-mail da compra — só
// quem fez o pedido tem os dois. Devolve apenas o andamento, nunca endereço,
// pagamento ou dados do cliente. Limitado por IP pra ninguém ficar chutando.
if (($_GET["acao"] ?? "") === "rastrear") {
    if ($_SERVER["REQUEST_METHOD"] !== "GET") {
        json_out(["erro" => "Método não permitido."], 405);
    }
    limitar_taxa($pdo, "rastrear_pedido", 20, 600);

    $id = trim($_GET["id"] ?? "");
    $email = strtolower(trim($_GET["email"] ?? ""));
    if ($id === "" || $email === "") {
        json_out(["erro" => "Informe o número do pedido e o e-mail da compra."], 400);
    }

    $stmt = $pdo->prepare(
        "SELECT id, items, total, status, date, codigoRastreio
         FROM pedidos WHERE LOWER(id) = ? AND LOWER(email) = ?"
    );
    $stmt->execute([strtolower($id), $email]);
    $pedido = $stmt->fetch();

    // Mesma resposta pra "não existe" e "e-mail não confere": não confirma
    // a terceiros que um número de pedido é válido.
    if (!$pedido) json_out(["erro" => "Pedido não encontrado."], 404);

    // Com código de postagem, busca os eventos reais nos Correios. Se a
    // integração não estiver configurada, o objeto ainda não tiver sido
    // postado ou a API falhar, eventos vem null e o site mostra só o
    // andamento interno da loja — a consulta nunca quebra por causa disso.
    $codigoRastreio = $pedido["codigoRastreio"] ?? null;
    $eventos = $codigoRastreio ? correios_eventos($codigoRastreio) : null;

    json_out([
        "id" => $pedido["id"],
        "items" => $pedido["items"],
        "total" => (float) $pedido["total"],
        "status" => $pedido["status"],
        "date" => $pedido["date"],
        "codigoRastreio" => $codigoRastreio,
        "eventos" => $eventos,
    ]);
}

if ($_SERVER["REQUEST_METHOD"] !== "PATCH") {
    json_out(["erro" => "Método não permitido."], 405);
}

exigir_admin($pdo);

$id = $_GET["id"] ?? "";
if ($id === "") json_out(["erro" => "Id do pedido ausente."], 400);

$corpo = corpo_json();
$status = $corpo["status"] ?? null;
// Chave presente com valor vazio = "apagar o código"; chave ausente = "não
// mexer nesse campo". Por isso o array_key_exists em vez de ?? null.
$mudaRastreio = array_key_exists("codigoRastreio", $corpo);
$codigoRastreio = $mudaRastreio ? strtoupper(trim((string) $corpo["codigoRastreio"])) : null;

if (!$status && !$mudaRastreio) json_out(["erro" => "Informe o status."], 400);
if ($mudaRastreio && $codigoRastreio !== "" && !correios_codigo_valido($codigoRastreio)) {
    json_out(["erro" => "Código de rastreio inválido — use o formato AA123456789BR."], 400);
}

try {
    $campos = [];
    $valores = [];
    if ($status) { $campos[] = "status = ?"; $valores[] = $status; }
    if ($mudaRastreio) {
        $campos[] = "codigoRastreio = ?";
        $valores[] = $codigoRastreio === "" ? null : $codigoRastreio;
    }
    $valores[] = $id;
    $stmt = $pdo->prepare("UPDATE pedidos SET " . implode(", ", $campos) . " WHERE id = ?");
    $stmt->execute($valores);
    if ($status) registrar_auditoria($pdo, "status_pedido", "$id -> $status");
    // Avisa o cliente por e-mail e notificação no celular. Roda depois do
    // UPDATE (para o texto já sair com o código de rastreio novo, quando os
    // dois mudam juntos) e nunca derruba a resposta se o envio falhar.
    if ($status) avisar_cliente_status($pdo, $id, $status);
    if ($mudaRastreio) registrar_auditoria($pdo, "rastreio_pedido", "$id -> " . ($codigoRastreio ?: "(removido)"));
    json_out(["ok" => true]);
} catch (Throwable $e) {
    json_out(["erro" => "Falha ao atualizar o pedido."], 500);
}
