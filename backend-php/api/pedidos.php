<?php
// ─── Um pedido só: status/código de rastreio (Admin) e consulta pública ──────
// PATCH /api/pedidos/{id} → { status: "Entregue", codigoRastreio: "AA1..BR" }
// Não mexe no resto da tabela — evita que essa edição do Admin colida com um
// pedido novo sendo inserido na mesma hora por um cliente.

require_once __DIR__ . "/lib_compras.php";
require_once __DIR__ . "/correios.php";
require_once __DIR__ . "/avisos.php";
cors();

// Os únicos status que existem. Antes aceitava qualquer texto — um erro de
// digitação criava um status novo que nenhuma tela sabia mostrar.
const STATUS_PEDIDO = ["Aguardando pagamento", "Pago", "Processando", "Em trânsito", "Entregue", "Cancelado"];

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

// Porta de entrada do anti-abuso: barra quem está de castigo por excesso de
// tentativas e aplica o teto geral de requisições por IP (ver proteger_rota em
// lib.php). Fica antes de qualquer leitura ou gravação.
proteger_rota($pdo);

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

$id = $_GET["id"] ?? "";
if ($id === "") json_out(["erro" => "Id do pedido ausente."], 400);

// ─── Quem pode mexer neste pedido ────────────────────────────────────────────
// O Admin muda o que quiser. O ENTREGADOR designado para este pedido mexe só
// no andamento da entrega dele: "Em trânsito" ao sair e "Entregue" ao chegar.
// Não troca o responsável, não mexe no código de rastreio e não enxerga
// pedido de outro entregador.
$token = token_do_cabecalho();
$ehAdmin = false;
if ($token !== "") {
    $stmt = $pdo->prepare("SELECT token FROM admin_sessoes WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    if ($stmt->fetch()) {
        $ehAdmin = true;
        // Sessão deslizante, igual ao exigir_admin()
        $pdo->prepare(
            "UPDATE admin_sessoes SET expira_em = DATE_ADD(NOW(), INTERVAL " . SESSAO_ADMIN_DIAS . " DAY) WHERE token = ?"
        )->execute([$token]);
    }
}

if (!$ehAdmin) {
    // email_autenticado responde 401 sozinho se não houver sessão nenhuma
    $emailPedindo = strtolower(email_autenticado($pdo));

    $stmt = $pdo->prepare("SELECT cargo FROM cargos WHERE LOWER(email) = ?");
    $stmt->execute([$emailPedindo]);
    $cargoPedindo = $stmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT entregador FROM pedidos WHERE id = ?");
    $stmt->execute([$id]);
    $entregadorDoPedido = strtolower((string) ($stmt->fetchColumn() ?: ""));

    if ($cargoPedindo !== "entregador" || $entregadorDoPedido !== $emailPedindo) {
        json_out(["erro" => "Você não tem permissão para alterar este pedido."], 403);
    }
}

$corpo = corpo_json();
$status = $corpo["status"] ?? null;
// Chave presente com valor vazio = "apagar o código"; chave ausente = "não
// mexer nesse campo". Por isso o array_key_exists em vez de ?? null.
$mudaRastreio = array_key_exists("codigoRastreio", $corpo);
$codigoRastreio = $mudaRastreio ? strtoupper(trim((string) $corpo["codigoRastreio"])) : null;
// Designar (ou tirar) o entregador responsável — só o Admin faz isso
$mudaEntregador = array_key_exists("entregador", $corpo);
$entregador = $mudaEntregador ? strtolower(trim((string) $corpo["entregador"])) : null;

if (!$ehAdmin) {
    if ($mudaRastreio || $mudaEntregador) {
        json_out(["erro" => "Só o Admin muda o rastreio ou o entregador do pedido."], 403);
    }
    // O entregador só empurra a entrega para frente
    if (!in_array($status, ["Em trânsito", "Entregue"], true)) {
        json_out(["erro" => "Entregador só pode marcar a entrega como saída ou concluída."], 403);
    }
}

if (!$status && !$mudaRastreio && !$mudaEntregador) json_out(["erro" => "Informe o status."], 400);
if ($status !== null && !in_array($status, STATUS_PEDIDO, true)) json_out(["erro" => "Status inválido."], 400);

$stmt = $pdo->prepare("SELECT * FROM pedidos WHERE id = ?");
$stmt->execute([$id]);
$pedidoAtual = $stmt->fetch();
if (!$pedidoAtual) json_out(["erro" => "Pedido não encontrado."], 404);
$statusAtual = (string) $pedidoAtual["status"];

if ($status !== null && $status !== $statusAtual) {
    // Cancelado é o fim da linha: o estoque já voltou e a comissão já foi
    // estornada. Reabrir exigiria reservar tudo de novo — é mais seguro o
    // cliente fazer um pedido novo.
    if ($statusAtual === "Cancelado") {
        json_out(["erro" => "Pedido cancelado não pode ser reaberto. Se o cliente ainda quiser, faça um pedido novo."], 409);
    }
    if ($status === "Aguardando pagamento") {
        json_out(["erro" => "Um pedido não volta para \"Aguardando pagamento\"."], 409);
    }
    // Pedido ainda não pago: só sai daqui confirmando o pagamento ou cancelando
    // — e isso vale para a COMPRA inteira (todas as linhas do mesmo carrinho).
    if ($statusAtual === "Aguardando pagamento") {
        if (!$ehAdmin) json_out(["erro" => "Este pedido ainda não foi pago."], 409);
        $compraId = (string) ($pedidoAtual["compraId"] ?? "");
        if ($status === "Pago") {
            $stmt = $pdo->prepare("SELECT total FROM compras WHERE id = ?");
            $stmt->execute([$compraId]);
            $totalCompra = $stmt->fetchColumn();
            if ($totalCompra === false || !confirmar_pagamento_compra($pdo, $compraId, "manual", "confirmado pelo Admin", (float) $totalCompra)) {
                json_out(["erro" => "Não foi possível confirmar o pagamento desta compra."], 500);
            }
            registrar_auditoria($pdo, "pagamento_confirmado_manual", $compraId);
            json_out(["ok" => true, "compraPaga" => true]);
        }
        if ($status === "Cancelado") {
            cancelar_compra($pdo, $compraId);
            registrar_auditoria($pdo, "compra_cancelada", "$compraId pelo Admin");
            json_out(["ok" => true, "compraCancelada" => true]);
        }
        json_out(["erro" => "Confirme o pagamento antes de mudar o andamento deste pedido."], 409);
    }
}
if ($mudaRastreio && $codigoRastreio !== "" && !correios_codigo_valido($codigoRastreio)) {
    json_out(["erro" => "Código de rastreio inválido — use o formato AA123456789BR."], 400);
}
// Entregador designado tem que ser uma conta com esse cargo — senão o pedido
// ficaria preso com alguém que não enxerga o painel de entregas
if ($mudaEntregador && $entregador !== "") {
    $stmt = $pdo->prepare("SELECT cargo FROM cargos WHERE LOWER(email) = ?");
    $stmt->execute([$entregador]);
    if ($stmt->fetchColumn() !== "entregador") {
        json_out(["erro" => "Esta conta não tem cargo de entregador."], 400);
    }
}

try {
    $campos = [];
    $valores = [];
    if ($status) { $campos[] = "status = ?"; $valores[] = $status; }
    if ($mudaRastreio) {
        $campos[] = "codigoRastreio = ?";
        $valores[] = $codigoRastreio === "" ? null : $codigoRastreio;
    }
    if ($mudaEntregador) {
        $campos[] = "entregador = ?";
        $valores[] = $entregador === "" ? null : $entregador;
    }
    $valores[] = $id;
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("UPDATE pedidos SET " . implode(", ", $campos) . " WHERE id = ?");
    $stmt->execute($valores);
    $mudouStatus = $status && $status !== $statusAtual;
    if ($mudouStatus && $status === "Cancelado") {
        // Cancelou depois de pago: a mercadoria volta para a prateleira e a
        // comissão da rede é cancelada (ou estornada, se já foi paga). A
        // devolução do dinheiro ao cliente é feita pelo Admin no banco.
        $stmt = $pdo->prepare("SELECT * FROM pedidos WHERE id = ? FOR UPDATE");
        $stmt->execute([$id]);
        devolver_estoque_do_pedido($pdo, $stmt->fetch());
        cancelar_comissoes_do_pedido($pdo, $id);
    }
    if ($mudouStatus && $status === "Entregue") {
        liberar_comissoes_na_entrega($pdo, $id);
    }
    $pdo->commit();
    if ($mudouStatus && $status === "Cancelado") invalidar_vitrine($pdo);
    if ($status) registrar_auditoria($pdo, "status_pedido", "$id -> $status");
    // Avisa o cliente por e-mail e notificação no celular. Roda depois do
    // UPDATE (para o texto já sair com o código de rastreio novo, quando os
    // dois mudam juntos) e nunca derruba a resposta se o envio falhar.
    if ($status) avisar_cliente_status($pdo, $id, $status);
    if ($mudaRastreio) registrar_auditoria($pdo, "rastreio_pedido", "$id -> " . ($codigoRastreio ?: "(removido)"));
    if ($mudaEntregador) registrar_auditoria($pdo, "entregador_pedido", "$id -> " . ($entregador ?: "(sem entregador)"));
    json_out(["ok" => true]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log("pedidos PATCH $id: " . $e->getMessage());
    json_out(["erro" => "Falha ao atualizar o pedido."], 500);
}
