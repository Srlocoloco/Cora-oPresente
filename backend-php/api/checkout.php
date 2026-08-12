<?php
// ─── Finalização de compra: grava só o que essa compra mudou ─────────────────
// POST /api/checkout → insere os pedidos novos, dá baixa no estoque (produto
// e, se houver, na cor escolhida) e credita o uso do cupom — tudo numa
// transação só, sem reescrever as tabelas inteiras.
//
// Isso existe porque a rota antiga (PUT /api/dados/{colecao}) reescreve a
// tabela inteira a cada chamada. Pra ações de Admin (raras) tudo bem, mas
// numa compra (ação comum, de qualquer cliente) isso é perigoso: se o
// navegador do cliente carregou os produtos antes de o Admin cadastrar uma
// imagem nova, a compra dele reescreveria a tabela inteira com a cópia
// desatualizada, apagando o que o Admin acabou de adicionar.

require_once __DIR__ . "/lib.php";
require_once __DIR__ . "/avisos.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    json_out(["erro" => "Método não permitido."], 405);
}

// No máximo 20 compras por IP a cada 5 minutos — evita abuso automatizado
limitar_taxa($pdo, "checkout", 20, 300);

// Confere quem está comprando de verdade (sessão de cliente ou do Admin) —
// sem isso, qualquer requisição poderia informar o e-mail de outra pessoa
$emailAutenticado = strtolower(email_autenticado($pdo));

$corpo = corpo_json();
$pedidos = $corpo["pedidos"] ?? [];
$itens = $corpo["itens"] ?? [];
$cupomCodigo = $corpo["cupomCodigo"] ?? null;

if (!is_array($pedidos) || count($pedidos) === 0) {
    json_out(["erro" => "Nenhum pedido para gravar."], 400);
}

// Todos os pedidos desta compra têm que ser do e-mail autenticado — impede
// que alguém finalize uma compra "em nome" de outro cliente
foreach ($pedidos as $p) {
    if (strtolower((string) ($p["email"] ?? "")) !== $emailAutenticado) {
        json_out(["erro" => "Não autorizado."], 403);
    }
}

// Parcelamento: o cliente não pode parcelar além do que o Admin cadastrou em
// cada produto ("Parcelamento" no cadastro). O site já limita a lista, isso
// aqui é a conferência de verdade, no servidor.
$parcelasPedidas = 1;
foreach ($pedidos as $p) {
    if (preg_match("/Cartão\s+(\d+)x/u", (string) ($p["pagamento"] ?? ""), $m)) {
        $parcelasPedidas = max($parcelasPedidas, (int) $m[1]);
    }
}
if ($parcelasPedidas > 1) {
    $ids = array_values(array_filter(array_map(fn($i) => (int) ($i["id"] ?? 0), $itens)));
    if (count($ids) > 0) {
        $marcas = implode(",", array_fill(0, count($ids), "?"));
        $stmtParc = $pdo->prepare("SELECT MIN(installments) FROM produtos WHERE id IN ($marcas)");
        $stmtParc->execute($ids);
        $maxPermitido = (int) ($stmtParc->fetchColumn() ?: 1);
        if ($parcelasPedidas > max(1, $maxPermitido)) {
            json_out(["erro" => "Parcelamento acima do permitido para estes produtos."], 400);
        }
    }
}

try {
    $pdo->beginTransaction();

    $stmtCliente = $pdo->prepare("SELECT vendedorVinculado FROM clientes WHERE email = ? FOR UPDATE");
    $stmtCliente->execute([$emailAutenticado]);
    $vendedorVinculado = $stmtCliente->fetchColumn() ?: null;

    if (!$vendedorVinculado) {
        $vendedorPedidos = array_values(array_unique(array_map(fn($p) => $p["vendedor"] ?? null, $pedidos)));
        if (count($vendedorPedidos) === 1 && $vendedorPedidos[0] && $vendedorPedidos[0] !== EMAIL_ADMIN) {
            $vendedorVinculado = $vendedorPedidos[0];
            $pdo->prepare("UPDATE clientes SET vendedorVinculado = ? WHERE email = ?")
                ->execute([$vendedorVinculado, $emailAutenticado]);
        }
    }

    // Insere os pedidos novos (nunca mexe nos pedidos já existentes)
    $colunasPedido = [
        "id", "customer", "email", "items", "total", "status", "date", "month",
        "category", "pagamento", "vendedor", "codigoVenda", "endereco", "cupomUsado", "produtoId",
    ];
    $sqlPedido = "INSERT INTO pedidos (`" . implode("`,`", $colunasPedido) . "`) VALUES ("
        . implode(",", array_fill(0, count($colunasPedido), "?")) . ")";
    $stmtPedido = $pdo->prepare($sqlPedido);
    foreach ($pedidos as $p) {
        $p["vendedor"] = $vendedorVinculado ?: EMAIL_ADMIN;
        $valores = array_map(fn($c) => $p[$c] ?? null, $colunasPedido);
        $stmtPedido->execute($valores);
    }

    // Baixa de estoque produto a produto (com FOR UPDATE pra travar a linha
    // contra outra compra simultânea do mesmo produto)
    $stmtProduto = $pdo->prepare("SELECT id, name, stock, colors FROM produtos WHERE id = ? FOR UPDATE");
    $stmtAtualizaProduto = $pdo->prepare("UPDATE produtos SET stock = ?, colors = ? WHERE id = ?");
    $stmtAlerta = $pdo->prepare("INSERT INTO alertas_estoque (id, name, date) VALUES (?, ?, ?)");
    $primeiraData = $pedidos[0]["date"] ?? null;

    foreach ($itens as $item) {
        $stmtProduto->execute([$item["id"]]);
        $produto = $stmtProduto->fetch();
        if (!$produto) continue;

        $novoStock = max(0, (int) $produto["stock"] - (int) $item["qty"]);
        $coresJson = $produto["colors"];
        if ($coresJson && !empty($item["corEscolhida"])) {
            $cores = json_decode($coresJson, true) ?: [];
            foreach ($cores as &$c) {
                if (($c["nome"] ?? null) === $item["corEscolhida"] && isset($c["estoque"]) && is_numeric($c["estoque"])) {
                    $c["estoque"] = max(0, (int) $c["estoque"] - (int) $item["qty"]);
                }
            }
            unset($c);
            $coresJson = json_encode($cores);
        }
        $stmtAtualizaProduto->execute([$novoStock, $coresJson, $item["id"]]);

        if ((int) $produto["stock"] > 0 && $novoStock <= 0) {
            $stmtAlerta->execute([$produto["id"], $produto["name"], $primeiraData]);
        }
    }

    // Uso do cupom (se algum foi aplicado nesta compra)
    if ($cupomCodigo) {
        $stmt = $pdo->prepare("UPDATE cupons SET usos = usos + 1 WHERE codigo = ?");
        $stmt->execute([$cupomCodigo]);
    }

    $pdo->commit();

    // Confirmação de compra por e-mail — com foto, valor e endereço de cada
    // item. Depois do commit (a compra já está gravada de qualquer forma) e
    // nunca derruba a resposta se o e-mail falhar.
    try {
        $nomeCliente = (string) ($pedidos[0]["customer"] ?? "");
        $itensEmail = array_map(fn($p) => [
            "produtoId" => isset($p["produtoId"]) ? (int) $p["produtoId"] : null,
            "texto" => (string) ($p["items"] ?? ""),
            "total" => (float) ($p["total"] ?? 0),
        ], $pedidos);
        $totalGeral = array_sum(array_column($itensEmail, "total"));
        enviar_email_confirmacao_compra(
            $emailAutenticado, $nomeCliente, $itensEmail, $totalGeral,
            $pedidos[0]["endereco"] ?? null, $pedidos[0]["pagamento"] ?? null,
            (string) $pedidos[0]["id"]
        );
    } catch (Throwable $e) {
        error_log("Falha ao enviar e-mail de confirmação de compra: " . $e->getMessage());
    }

    json_out(["ok" => true]);
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(["erro" => "Falha ao gravar a compra no banco de dados."], 500);
}
