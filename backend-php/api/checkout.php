<?php
// ─── Finalização de compra ───────────────────────────────────────────────────
// POST /api/checkout
//   { linhas: [{produtoId, qty, cor?} | {caixa: {...}, qty}],
//     metodo: "pix" | "cartao", parcelas, cupom, codigoVenda,
//     endereco: {cep, rua, numero, complemento, bairro, cidade, uf} }
//   → resumo da compra criada ("Aguardando pagamento"), com o valor a pagar.
//
// O navegador manda só O QUE o cliente quer comprar. Preço, frete, descontos,
// estoque e o dono do código de venda são decididos aqui (ver lib_compras.php).
// A compra só vira "Pago" quando o banco confirma — nunca por esta rota.

require_once __DIR__ . "/lib_compras.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

proteger_rota($pdo);

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    json_out(["erro" => "Método não permitido."], 405);
}

// No máximo 20 compras iniciadas por IP a cada 5 minutos
limitar_taxa($pdo, "checkout", 20, 300);

$email = strtolower(email_autenticado($pdo));
$corpo = corpo_json();

// Compra antiga ainda aguardando pagamento deste cliente: devolve o estoque
// dela antes de reservar de novo (o cliente voltou ao carrinho e mudou algo).
expirar_compras_vencidas($pdo);
if (!empty($corpo["substituirCompra"]) && is_string($corpo["substituirCompra"])) {
    $stmt = $pdo->prepare("SELECT id FROM compras WHERE id = ? AND email = ? AND status = 'aguardando_pagamento'");
    $stmt->execute([$corpo["substituirCompra"], $email]);
    if ($stmt->fetchColumn()) cancelar_compra($pdo, $corpo["substituirCompra"]);
}

// Nome do cliente vem do cadastro, não do navegador
$stmt = $pdo->prepare("SELECT name FROM clientes WHERE email = ?");
$stmt->execute([$email]);
$nome = (string) ($stmt->fetchColumn() ?: ($email === strtolower(EMAIL_ADMIN) ? "Admin" : explode("@", $email)[0]));

try {
    $compra = criar_compra($pdo, $email, $nome, $corpo);
    registrar_auditoria($pdo, "compra_criada", $compra["id"] . " · " . number_format($compra["total"], 2, ",", ".") . " · $email");
    json_out(["ok" => true, "compra" => $compra]);
} catch (ErroDeCompra $e) {
    json_out(["erro" => $e->getMessage()], $e->codigo);
} catch (Throwable $e) {
    error_log("Falha no checkout de $email: " . $e->getMessage());
    json_out(["erro" => "Não foi possível registrar sua compra agora. Tente de novo em instantes."], 500);
}
