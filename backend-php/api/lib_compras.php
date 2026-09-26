<?php
// ─── Compras: o valor é calculado AQUI e só o servidor marca como paga ──────
//
// COMO ERA (e por que era perigoso)
//   O navegador calculava o total, mostrava o PIX, esperava "CONCLUIDA" e só
//   então mandava os pedidos para /api/checkout — já com status "Pago". O
//   servidor não conferia se existia pagamento nenhum: bastava chamar
//   /api/checkout direto para ganhar um pedido pago. E a cobrança PIX era
//   criada com o valor que o navegador quisesse (R$ 0,01 servia).
//
// COMO FICOU (o mesmo fluxo do Mercado Livre)
//   1. /api/checkout recebe só O QUE está no carrinho. O servidor calcula
//      preço, frete, cupom e desconto PIX, reserva o estoque e cria a compra
//      "Aguardando pagamento", com prazo para pagar.
//   2. A cobrança PIX (ou o cartão) é criada para o valor DESSA compra.
//   3. Quando o banco confirma, o servidor marca a compra como paga, lança as
//      comissões e avisa o cliente. Nada disso passa pelo navegador.
//   4. Se o prazo vence sem pagamento, a compra é cancelada sozinha e o
//      estoque reservado volta para a loja.

require_once __DIR__ . "/lib.php";
require_once __DIR__ . "/lib_estoque.php";
require_once __DIR__ . "/lib_comissoes.php";
require_once __DIR__ . "/lib_pix.php";

const PRAZO_PAGAMENTO_PIX_MIN = 30;       // PIX com confirmação automática
const PRAZO_PAGAMENTO_MANUAL_MIN = 1440;  // PIX conferido pelo Admin (24 h)
const PRAZO_PAGAMENTO_CARTAO_MIN = 30;
const TOLERANCIA_EXPIRACAO_MIN = 5;       // folga antes de cancelar (webhook atrasado)

class ErroDeCompra extends RuntimeException {
    public int $codigo;
    public function __construct(string $mensagem, int $codigo = 400) {
        parent::__construct($mensagem);
        $this->codigo = $codigo;
    }
}

function sem_acento_minusculo(string $s): string {
    $s = mb_strtolower(trim($s));
    return strtr($s, [
        "á"=>"a","à"=>"a","ã"=>"a","â"=>"a","é"=>"e","ê"=>"e","í"=>"i","ó"=>"o","õ"=>"o","ô"=>"o","ú"=>"u","ü"=>"u","ç"=>"c",
    ]);
}

// A loja entrega nesta cidade? (mesma regra de entregaNaCidade em utils.ts)
function entrega_na_cidade(string $cidade, string $uf, string $cidadesAtendidas): bool {
    if (strtoupper($uf) !== "PR") return false;
    $lista = array_values(array_filter(array_map("trim", explode(",", $cidadesAtendidas)), fn($c) => $c !== ""));
    if (count($lista) === 0) return true;
    $alvo = sem_acento_minusculo($cidade);
    foreach ($lista as $c) if (sem_acento_minusculo($c) === $alvo) return true;
    return false;
}

// Confere o CEP no ViaCEP pelo servidor — a cidade que o navegador manda pode
// ser editada. Se o ViaCEP estiver fora do ar, segue com o que veio (a compra
// não pode parar por causa de um serviço de terceiros).
function consultar_cep(string $cep): ?array {
    $ctx = stream_context_create(["http" => ["timeout" => 5], "https" => ["timeout" => 5]]);
    $r = @file_get_contents("https://viacep.com.br/ws/$cep/json/", false, $ctx);
    if ($r === false) return null;
    $d = json_decode($r, true);
    if (!is_array($d) || !empty($d["erro"])) return ["invalido" => true];
    return $d;
}

// Lê e confere as linhas do carrinho. Cada linha é um produto solto
// ({produtoId, qty, cor}) ou uma caixa montada ({caixa: {...}, qty}).
function normalizar_linhas_do_carrinho($linhas): array {
    if (!is_array($linhas) || count($linhas) === 0) throw new ErroDeCompra("Seu carrinho está vazio.");
    if (count($linhas) > 60) throw new ErroDeCompra("Carrinho grande demais. Divida em duas compras.");
    $saida = [];
    foreach ($linhas as $l) {
        $qty = (int) ($l["qty"] ?? 0);
        if ($qty < 1 || $qty > 99) throw new ErroDeCompra("Quantidade inválida no carrinho.");
        if (isset($l["caixa"]) && is_array($l["caixa"])) {
            $cx = $l["caixa"];
            $itens = [];
            foreach ((array) ($cx["itens"] ?? []) as $i) {
                $pid = (int) ($i["produtoId"] ?? 0);
                $q = (int) ($i["qty"] ?? 0);
                if ($pid <= 0 || $q < 1 || $q > 10) throw new ErroDeCompra("Um item da caixa está inválido.");
                $itens[] = ["produtoId" => $pid, "qty" => $q];
            }
            if (count($itens) === 0) throw new ErroDeCompra("Uma das caixas está vazia.");
            $tamanho = $cx["tamanho"] ?? null;
            if ($tamanho !== null && !in_array($tamanho, ["P", "M", "G"], true)) $tamanho = null;
            $saida[] = [
                "tipo" => "caixa",
                "qty" => $qty,
                "recipienteId" => (int) ($cx["recipienteId"] ?? 0),
                "tamanho" => $tamanho,
                "itens" => $itens,
                "para" => mb_substr(trim((string) ($cx["para"] ?? "")), 0, 60),
                "de" => mb_substr(trim((string) ($cx["de"] ?? "")), 0, 60),
                "mensagem" => mb_substr(trim((string) ($cx["mensagem"] ?? "")), 0, 200),
            ];
        } else {
            $pid = (int) ($l["produtoId"] ?? 0);
            if ($pid <= 0) throw new ErroDeCompra("Produto inválido no carrinho.");
            $cor = isset($l["cor"]) && $l["cor"] !== "" ? mb_substr((string) $l["cor"], 0, 60) : null;
            $saida[] = ["tipo" => "produto", "qty" => $qty, "produtoId" => $pid, "cor" => $cor];
        }
    }
    return $saida;
}

function numero_de_pedido(): string {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    $s = "";
    for ($i = 0; $i < 8; $i++) $s .= $chars[random_int(0, 31)];
    return "#CP-" . $s;
}

function codigo_de_compra(): string {
    return "CO" . bin2hex(random_bytes(10));
}

// ─── Criar a compra ──────────────────────────────────────────────────────────
// $dados: linhas, metodo, parcelas, cupom, codigoVenda, endereco{cep,rua,
// numero,complemento,bairro,cidade,uf}, nome. Devolve o resumo para a tela
// de pagamento. Lança ErroDeCompra com uma mensagem para o cliente.
function criar_compra(PDO $pdo, string $email, string $nomeCliente, array $dados): array {
    $metodo = $dados["metodo"] ?? "";
    if (!in_array($metodo, ["pix", "cartao"], true)) throw new ErroDeCompra("Escolha a forma de pagamento.");
    $parcelas = $metodo === "cartao" ? max(1, min(12, (int) ($dados["parcelas"] ?? 1))) : 1;
    $linhas = normalizar_linhas_do_carrinho($dados["linhas"] ?? null);
    $config = config_loja($pdo);
    if ($metodo === "pix" && !pix_disponivel($config)) {
        throw new ErroDeCompra("O pagamento por PIX está indisponível no momento. Fale com a loja.", 503);
    }
    if ($metodo === "cartao" && !cartao_configurado()) {
        throw new ErroDeCompra("O pagamento com cartão ainda não está disponível. Escolha PIX.", 503);
    }

    // ── Endereço ──
    $end = (array) ($dados["endereco"] ?? []);
    $cep = preg_replace('/\D/', '', (string) ($end["cep"] ?? ""));
    $rua = mb_substr(trim((string) ($end["rua"] ?? "")), 0, 120);
    $numero = mb_substr(trim((string) ($end["numero"] ?? "")), 0, 20);
    $complemento = mb_substr(trim((string) ($end["complemento"] ?? "")), 0, 60);
    $bairro = mb_substr(trim((string) ($end["bairro"] ?? "")), 0, 80);
    $cidade = mb_substr(trim((string) ($end["cidade"] ?? "")), 0, 80);
    $uf = strtoupper(mb_substr(trim((string) ($end["uf"] ?? "")), 0, 2));
    if (strlen($cep) !== 8) throw new ErroDeCompra("Informe um CEP válido.");
    if ($rua === "" || $numero === "") throw new ErroDeCompra("Complete a rua e o número do endereço de entrega.");
    $viaCep = consultar_cep($cep);
    if ($viaCep !== null) {
        if (!empty($viaCep["invalido"])) throw new ErroDeCompra("CEP não encontrado. Confira o número.");
        $cidade = (string) ($viaCep["localidade"] ?? $cidade);
        $uf = strtoupper((string) ($viaCep["uf"] ?? $uf));
        if ($bairro === "") $bairro = (string) ($viaCep["bairro"] ?? "");
    }
    $cidadesAtendidas = (string) ($config["cidadesAtendidas"] ?? "");
    if (!entrega_na_cidade($cidade, $uf, $cidadesAtendidas)) {
        throw new ErroDeCompra("No momento a loja não entrega em $cidade - $uf.");
    }
    $cepFormatado = substr($cep, 0, 5) . "-" . substr($cep, 5);
    $enderecoTexto = "$rua, $numero" . ($complemento !== "" ? " - $complemento" : "")
        . ($bairro !== "" ? ", $bairro" : "") . " — $cidade - $uf · CEP $cepFormatado";

    // ── Quem leva o crédito da venda ──
    // Cliente já vinculado a um vendedor continua com ele (regra da loja: o
    // vínculo é da primeira compra com código). Senão, vale o código digitado.
    $stmt = $pdo->prepare("SELECT vendedorVinculado FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    $vinculado = $stmt->fetchColumn() ?: null;
    $vendedor = null;
    $codigoVendaUsado = null;
    if ($vinculado && in_array(cargo_da_conta($pdo, $vinculado), ["vendedor", "master", "masterplus"], true)) {
        $vendedor = strtolower($vinculado);
    } else {
        $codigo = strtoupper(trim((string) ($dados["codigoVenda"] ?? "")));
        if ($codigo !== "") {
            $vendedor = dono_do_codigo_de_venda($pdo, $codigo);
            if ($vendedor === null) throw new ErroDeCompra("Código de venda não encontrado. Confira com quem te indicou.");
            if ($vendedor === strtolower($email)) throw new ErroDeCompra("Você não pode usar o seu próprio código de venda.");
            $codigoVendaUsado = $codigo;
        }
    }
    $vendedorFinal = $vendedor ?? strtolower(EMAIL_ADMIN);

    $pdo->beginTransaction();
    try {
        // ── Preço e estoque de cada linha, com o banco na mão ──
        $subtotal = 0.0;
        $descontoPix = 0.0;
        $todosFreteGratis = true;
        $menorParcelamento = 12;
        $planos = []; // uma entrada por linha de pedido
        $produtoCache = [];
        $ler = function (int $id) use ($pdo, &$produtoCache) {
            if (!isset($produtoCache[$id])) $produtoCache[$id] = ler_produto_travado($pdo, $id);
            return $produtoCache[$id];
        };

        foreach ($linhas as $l) {
            if ($l["tipo"] === "produto") {
                $p = $ler($l["produtoId"]);
                $preco = centavos((float) $p["price"]);
                $valorLinha = centavos($preco * $l["qty"]);
                $subtotal += $valorLinha;
                $descontoPix += $valorLinha * max(0, min(90, (int) ($p["pixDesconto"] ?? 0))) / 100;
                $todosFreteGratis = $todosFreteGratis && (int) $p["freeShipping"] === 1;
                $menorParcelamento = min($menorParcelamento, max(1, (int) $p["installments"]));
                $nome = (string) $p["name"] . ($l["cor"] ? " - " . $l["cor"] : "");
                $planos[] = [
                    "texto" => $l["qty"] > 1 ? "$nome ({$l["qty"]}x)" : $nome,
                    "total" => $valorLinha,
                    "categoria" => (string) $p["category"],
                    "produtoId" => (int) $p["id"],
                    "saidas" => [["id" => (int) $p["id"], "qty" => $l["qty"], "cor" => $l["cor"], "tamanho" => null]],
                ];
            } else {
                $rec = $ler($l["recipienteId"]);
                if ((string) $rec["category"] !== "Caixas") throw new ErroDeCompra("A caixa escolhida não está mais disponível.");
                $tams = $rec["tamanhos"] ? (json_decode($rec["tamanhos"], true) ?: []) : [];
                $precoCaixa = (float) $rec["price"];
                $capacidade = 0;
                if (count($tams) > 0) {
                    $achou = null;
                    foreach ($tams as $t) if (($t["tamanho"] ?? null) === $l["tamanho"]) $achou = $t;
                    if (!$achou) throw new ErroDeCompra("Escolha o tamanho da caixa \"{$rec["name"]}\".");
                    $precoCaixa = (float) $achou["price"];
                    $capacidade = (int) ($achou["capacidade"] ?? 0);
                }
                $qtdDentro = array_sum(array_column($l["itens"], "qty"));
                if ($capacidade > 0 && $qtdDentro > $capacidade) {
                    throw new ErroDeCompra("A caixa tamanho {$l["tamanho"]} comporta até $capacidade produtos.");
                }
                $precoUnitario = centavos($precoCaixa);
                $pixUnitario = $precoCaixa * max(0, min(90, (int) ($rec["pixDesconto"] ?? 0))) / 100;
                $freteGratis = (int) $rec["freeShipping"] === 1;
                $parcelamento = max(1, (int) $rec["installments"]);
                $saidas = [["id" => (int) $rec["id"], "qty" => $l["qty"], "cor" => null, "tamanho" => $l["tamanho"]]];
                $conteudo = [];
                foreach ($l["itens"] as $item) {
                    $p = $ler($item["produtoId"]);
                    if ((string) $p["category"] === "Caixas") throw new ErroDeCompra("Uma caixa não pode ir dentro de outra.");
                    $precoUnitario += centavos((float) $p["price"]) * $item["qty"];
                    $pixUnitario += (float) $p["price"] * $item["qty"] * max(0, min(90, (int) ($p["pixDesconto"] ?? 0))) / 100;
                    $freteGratis = $freteGratis && (int) $p["freeShipping"] === 1;
                    $parcelamento = min($parcelamento, max(1, (int) $p["installments"]));
                    $saidas[] = ["id" => (int) $p["id"], "qty" => $item["qty"] * $l["qty"], "cor" => null, "tamanho" => null];
                    $conteudo[] = $item["qty"] > 1 ? "{$p["name"]} ({$item["qty"]}x)" : (string) $p["name"];
                }
                $valorLinha = centavos($precoUnitario * $l["qty"]);
                $subtotal += $valorLinha;
                $descontoPix += $pixUnitario * $l["qty"];
                $todosFreteGratis = $todosFreteGratis && $freteGratis;
                $menorParcelamento = min($menorParcelamento, $parcelamento);
                $cartao = implode(" · ", array_filter([
                    $l["para"] !== "" ? "Para: " . $l["para"] : "",
                    $l["de"] !== "" ? "De: " . $l["de"] : "",
                    $l["mensagem"] !== "" ? "\"" . $l["mensagem"] . "\"" : "",
                ]));
                $texto = "Caixa personalizada — {$rec["name"]}" . ($l["tamanho"] ? " · tamanho {$l["tamanho"]}" : "")
                    . " | Conteúdo: " . implode(", ", $conteudo) . ($cartao !== "" ? " | Cartão: $cartao" : "");
                if ($l["qty"] > 1) $texto .= " ({$l["qty"]}x)";
                $planos[] = [
                    "texto" => mb_substr($texto, 0, 2000),
                    "total" => $valorLinha,
                    "categoria" => "Caixas",
                    "produtoId" => (int) $rec["id"],
                    "saidas" => $saidas,
                ];
            }
        }
        $subtotal = centavos($subtotal);
        $descontoPix = $metodo === "pix" ? centavos($descontoPix) : 0.0;

        if ($parcelas > $menorParcelamento) {
            throw new ErroDeCompra("Estes produtos podem ser parcelados em até {$menorParcelamento}x.");
        }

        // ── Cupom ──
        $cupomCodigo = strtoupper(trim((string) ($dados["cupom"] ?? "")));
        $descontoCupom = 0.0;
        if ($cupomCodigo !== "") {
            $stmtCupom = $pdo->prepare("SELECT codigo, percentual, ativo, validade FROM cupons WHERE UPPER(codigo) = ? FOR UPDATE");
            $stmtCupom->execute([$cupomCodigo]);
            $cupom = $stmtCupom->fetch();
            if (!$cupom || !(int) $cupom["ativo"] || $cupom["validade"] < agora_brasil("Y-m-d")) {
                throw new ErroDeCompra("Cupom inválido ou vencido.");
            }
            $stmtUso = $pdo->prepare(
                "SELECT 1 FROM pedidos WHERE LOWER(email) = ? AND UPPER(cupomUsado) = ? AND status <> 'Cancelado' LIMIT 1"
            );
            $stmtUso->execute([strtolower($email), $cupomCodigo]);
            if ($stmtUso->fetch()) throw new ErroDeCompra("Você já usou este cupom em outra compra.");
            $cupomCodigo = (string) $cupom["codigo"];
            $descontoCupom = centavos($subtotal * max(0, min(90, (int) $cupom["percentual"])) / 100);
        } else {
            $cupomCodigo = null;
        }

        // ── Frete (mesma regra do carrinho) ──
        $gratisAcima = (float) ($config["freteGratisAcima"] ?? 299);
        $capital = $cep >= "80000000" && $cep <= "82999999";
        $frete = ($todosFreteGratis || $subtotal >= $gratisAcima)
            ? 0.0
            : (float) ($capital ? ($config["freteCapital"] ?? 14.9) : ($config["freteInterior"] ?? 19.9));
        $frete = centavos($frete);

        $total = centavos(max(0.01, $subtotal + $frete - $descontoPix - $descontoCupom));

        // ── Reserva do estoque (sai agora; volta se a compra não for paga) ──
        foreach ($planos as $i => $plano) {
            $saidasReais = [];
            foreach ($plano["saidas"] as $s) {
                foreach (retirar_estoque($pdo, $s["id"], $s["qty"], $s["cor"], $s["tamanho"]) as $parte) {
                    $saidasReais[] = ["id" => $s["id"]] + $parte;
                }
            }
            $planos[$i]["saidasReais"] = $saidasReais;
        }

        // ── Grava a compra e uma linha de pedido por item ──
        $compraId = codigo_de_compra();
        $manual = $metodo === "pix" && !pix_api_configurada() ;
        $prazo = $metodo === "cartao" ? PRAZO_PAGAMENTO_CARTAO_MIN : ($manual ? PRAZO_PAGAMENTO_MANUAL_MIN : PRAZO_PAGAMENTO_PIX_MIN);
        $agora = agora_brasil();
        $expira = agora_brasil("Y-m-d H:i:s", "+$prazo minutes");
        $pdo->prepare(
            "INSERT INTO compras (id, email, subtotal, frete, descontoPix, descontoCupom, total, metodo, parcelas, maxParcelas,
                                  cupom, vendedor, endereco, status, criadoEm, expiraEm)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'aguardando_pagamento', ?, ?)"
        )->execute([
            $compraId, $email, $subtotal, $frete, $descontoPix, $descontoCupom, $total, $metodo, $parcelas,
            $menorParcelamento, $cupomCodigo, $vendedorFinal, $enderecoTexto, $agora, $expira,
        ]);

        $rotuloPagamento = $metodo === "cartao" ? "Cartão {$parcelas}x" : "PIX";
        $insPedido = $pdo->prepare(
            "INSERT INTO pedidos (id, customer, email, items, total, status, date, month, category, pagamento,
                                  vendedor, codigoVenda, endereco, cupomUsado, produtoId, compraId, itensJson, criadoEm)
             VALUES (?,?,?,?,?, 'Aguardando pagamento', ?,?,?,?,?,?,?,?,?,?,?,?)"
        );
        $existe = $pdo->prepare("SELECT 1 FROM pedidos WHERE id = ?");
        $meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        $data = agora_brasil("d/m/Y");
        $mes = $meses[(int) agora_brasil("n") - 1];
        $ids = [];
        foreach ($planos as $plano) {
            do {
                $id = numero_de_pedido();
                $existe->execute([$id]);
            } while ($existe->fetchColumn());
            $insPedido->execute([
                $id, mb_substr($nomeCliente, 0, 255), $email, $plano["texto"], $plano["total"], $data, $mes,
                $plano["categoria"], $rotuloPagamento, $vendedorFinal, $codigoVendaUsado, $enderecoTexto,
                $cupomCodigo, $plano["produtoId"], $compraId,
                json_encode($plano["saidasReais"], JSON_UNESCAPED_UNICODE), $agora,
            ]);
            $ids[] = $id;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e instanceof ErroDeEstoque) throw new ErroDeCompra($e->getMessage() . " Ajuste o carrinho e tente de novo.", 409);
        throw $e;
    }

    invalidar_vitrine($pdo);
    return resumo_da_compra($pdo, $compraId);
}

// O que a tela de pagamento/sucesso precisa saber de uma compra.
function resumo_da_compra(PDO $pdo, string $compraId): array {
    $stmt = $pdo->prepare("SELECT * FROM compras WHERE id = ?");
    $stmt->execute([$compraId]);
    $c = $stmt->fetch();
    if (!$c) throw new ErroDeCompra("Compra não encontrada.", 404);
    $stmt = $pdo->prepare("SELECT id, items, total, status, produtoId, category FROM pedidos WHERE compraId = ? ORDER BY id");
    $stmt->execute([$compraId]);
    $pedidos = array_map(fn($p) => [
        "id" => $p["id"], "items" => $p["items"], "total" => (float) $p["total"],
        "status" => $p["status"], "produtoId" => $p["produtoId"] !== null ? (int) $p["produtoId"] : null,
        "category" => $p["category"],
    ], $stmt->fetchAll());
    return [
        "id" => $c["id"],
        "status" => $c["status"],
        "metodo" => $c["metodo"],
        "parcelas" => (int) $c["parcelas"],
        "maxParcelas" => (int) $c["maxParcelas"],
        "subtotal" => (float) $c["subtotal"],
        "frete" => (float) $c["frete"],
        "descontoPix" => (float) $c["descontoPix"],
        "descontoCupom" => (float) $c["descontoCupom"],
        "cupom" => $c["cupom"],
        "total" => (float) $c["total"],
        "endereco" => $c["endereco"],
        "criadoEm" => $c["criadoEm"],
        "expiraEm" => $c["expiraEm"],
        "pagoEm" => $c["pagoEm"],
        // Segundos até vencer — o navegador não precisa confiar no próprio relógio
        "segundosParaPagar" => max(0, strtotime($c["expiraEm"]) - strtotime(agora_brasil())),
        "pedidos" => $pedidos,
    ];
}

// ─── Confirmar o pagamento (só o servidor chama) ─────────────────────────────
// Idempotente: chamar duas vezes (webhook + consulta, por exemplo) não paga
// duas vezes nem lança comissão em dobro. Devolve true se a compra está paga.
function confirmar_pagamento_compra(PDO $pdo, string $compraId, string $tipo, string $referencia, float $valorPago): bool {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT * FROM compras WHERE id = ? FOR UPDATE");
        $stmt->execute([$compraId]);
        $c = $stmt->fetch();
        if (!$c) { $pdo->rollBack(); return false; }
        if ($c["status"] === "paga") { $pdo->commit(); return true; }
        if ($valorPago + 0.009 < (float) $c["total"]) {
            $pdo->rollBack();
            registrar_auditoria($pdo, "pagamento_valor_menor", "$compraId: pago " . number_format($valorPago, 2) . " de " . number_format((float) $c["total"], 2));
            return false;
        }
        // Pagou depois de a compra ter vencido (e o estoque já ter voltado):
        // reserva de novo. Se não houver mais estoque, a compra fica paga
        // assim mesmo e o Admin decide (entregar depois ou devolver o dinheiro)
        // — o dinheiro do cliente nunca "some".
        if ($c["status"] !== "aguardando_pagamento") {
            $stmtP = $pdo->prepare("SELECT id, itensJson, estoqueDevolvido FROM pedidos WHERE compraId = ?");
            $stmtP->execute([$compraId]);
            foreach ($stmtP->fetchAll() as $p) {
                if (!(int) $p["estoqueDevolvido"]) continue;
                $saidas = json_decode((string) $p["itensJson"], true) ?: [];
                try {
                    foreach ($saidas as $s) retirar_estoque($pdo, (int) $s["id"], (int) $s["qtd"], $s["cor"] ?? null, $s["tamanho"] ?? null);
                    $pdo->prepare("UPDATE pedidos SET estoqueDevolvido = 0 WHERE id = ?")->execute([$p["id"]]);
                } catch (ErroDeEstoque $e) {
                    registrar_auditoria($pdo, "pago_sem_estoque", "$compraId: " . $e->getMessage());
                }
            }
        }
        $agora = agora_brasil();
        $pdo->prepare(
            "UPDATE compras SET status = 'paga', pagamentoTipo = ?, pagamentoRef = ?, valorPago = ?, pagoEm = ? WHERE id = ?"
        )->execute([$tipo, mb_substr($referencia, 0, 64), centavos($valorPago), $agora, $compraId]);
        $pdo->prepare("UPDATE pedidos SET status = 'Pago' WHERE compraId = ?")->execute([$compraId]);

        // Primeira compra com código de venda: o cliente fica vinculado a esse
        // vendedor (regra da loja: o código é pedido uma vez só).
        if ($c["vendedor"] && strtolower($c["vendedor"]) !== strtolower(EMAIL_ADMIN)) {
            $pdo->prepare("UPDATE clientes SET vendedorVinculado = ? WHERE email = ? AND (vendedorVinculado IS NULL OR vendedorVinculado = '')")
                ->execute([$c["vendedor"], $c["email"]]);
        }
        if ($c["cupom"]) {
            $pdo->prepare("UPDATE cupons SET usos = usos + 1 WHERE codigo = ?")->execute([$c["cupom"]]);
        }
        registrar_comissoes_da_compra($pdo, $compraId);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log("confirmar_pagamento_compra($compraId): " . $e->getMessage());
        return false;
    }

    registrar_auditoria($pdo, "compra_paga", "$compraId via $tipo");
    invalidar_vitrine($pdo);
    avisar_compra_paga($pdo, $compraId);
    return true;
}

// E-mail de confirmação + recomendação no sino. Depois do commit e nunca
// derruba nada se falhar — a compra já está paga de qualquer jeito.
function avisar_compra_paga(PDO $pdo, string $compraId): void {
    try {
        require_once __DIR__ . "/avisos.php";
        $stmt = $pdo->prepare("SELECT * FROM compras WHERE id = ?");
        $stmt->execute([$compraId]);
        $c = $stmt->fetch();
        $stmt = $pdo->prepare("SELECT * FROM pedidos WHERE compraId = ? ORDER BY id");
        $stmt->execute([$compraId]);
        $pedidos = $stmt->fetchAll();
        if (!$c || !$pedidos) return;
        $itens = array_map(fn($p) => [
            "produtoId" => $p["produtoId"] !== null ? (int) $p["produtoId"] : null,
            "texto" => (string) $p["items"],
            "total" => (float) $p["total"],
        ], $pedidos);
        enviar_email_confirmacao_compra(
            $c["email"], (string) $pedidos[0]["customer"], $itens, (float) $c["total"],
            $c["endereco"], $pedidos[0]["pagamento"], (string) $pedidos[0]["id"]
        );
        avisar_cliente_recomendacao(
            $pdo, $c["email"],
            array_values(array_unique(array_filter(array_map(fn($p) => (int) $p["produtoId"], $pedidos)))),
            array_values(array_unique(array_filter(array_map(fn($p) => (string) $p["category"], $pedidos))))
        );
    } catch (Throwable $e) {
        error_log("avisar_compra_paga($compraId): " . $e->getMessage());
    }
}

// ─── Cancelar (ou deixar vencer) uma compra não paga ─────────────────────────
function cancelar_compra(PDO $pdo, string $compraId, string $novoStatus = "cancelada"): bool {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT status FROM compras WHERE id = ? FOR UPDATE");
        $stmt->execute([$compraId]);
        $status = $stmt->fetchColumn();
        if ($status !== "aguardando_pagamento") { $pdo->rollBack(); return false; }
        $stmt = $pdo->prepare("SELECT * FROM pedidos WHERE compraId = ? FOR UPDATE");
        $stmt->execute([$compraId]);
        foreach ($stmt->fetchAll() as $p) devolver_estoque_do_pedido($pdo, $p);
        $pdo->prepare("UPDATE pedidos SET status = 'Cancelado' WHERE compraId = ?")->execute([$compraId]);
        $pdo->prepare("UPDATE compras SET status = ? WHERE id = ?")->execute([$novoStatus, $compraId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    invalidar_vitrine($pdo);
    return true;
}

// Devolve o que um pedido tirou do estoque (uma vez só).
function devolver_estoque_do_pedido(PDO $pdo, array $pedido): void {
    if ((int) ($pedido["estoqueDevolvido"] ?? 0) === 1) return;
    $saidas = json_decode((string) ($pedido["itensJson"] ?? ""), true);
    if (!is_array($saidas) || count($saidas) === 0) return; // pedido antigo: sem registro do que saiu
    $porProduto = [];
    foreach ($saidas as $s) {
        $porProduto[(int) $s["id"]][] = ["cor" => $s["cor"] ?? null, "tamanho" => $s["tamanho"] ?? null, "qtd" => (int) ($s["qtd"] ?? 0)];
    }
    foreach ($porProduto as $id => $partes) devolver_estoque($pdo, $id, $partes);
    $pdo->prepare("UPDATE pedidos SET estoqueDevolvido = 1 WHERE id = ?")->execute([$pedido["id"]]);
}

// Vence as compras cujo prazo de pagamento passou. Roda "de carona" nas rotas
// de compra e no painel (a hospedagem não tem tarefa agendada garantida).
// Antes de cancelar um PIX automático, pergunta ao banco uma última vez — o
// cliente pode ter pagado no último minuto e o aviso ter se perdido.
function expirar_compras_vencidas(PDO $pdo, int $limite = 20): void {
    try {
        $stmt = $pdo->prepare(
            "SELECT id FROM compras WHERE status = 'aguardando_pagamento'
              AND expiraEm < ? ORDER BY expiraEm ASC LIMIT " . (int) $limite
        );
        $stmt->execute([agora_brasil("Y-m-d H:i:s", "-" . TOLERANCIA_EXPIRACAO_MIN . " minutes")]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $compraId) {
            if (function_exists("consultar_pix_da_compra") && consultar_pix_da_compra($pdo, $compraId)) continue;
            cancelar_compra($pdo, $compraId, "expirada");
        }
    } catch (Throwable $e) {
        error_log("expirar_compras_vencidas: " . $e->getMessage());
    }
}

// ─── PIX ─────────────────────────────────────────────────────────────────────

function pix_api_configurada(): bool {
    return SICREDI_CLIENT_ID !== "" && SICREDI_CLIENT_SECRET !== ""
        && file_exists(SICREDI_CERT_PATH) && file_exists(SICREDI_KEY_PATH);
}

// Chave usada no PIX conferido pelo Admin: a das Configurações, ou a reserva.
function chave_pix_da_loja(array $config): string {
    $chave = trim((string) ($config["chavePix"] ?? ""));
    return $chave !== "" ? $chave : (string) PIX_CHAVE_RESERVA;
}

function pix_manual_ativo(array $config): bool {
    return (int) ($config["pixManual"] ?? 1) === 1 && chave_pix_da_loja($config) !== "";
}

function pix_disponivel(array $config): bool {
    return pix_api_configurada() || pix_manual_ativo($config);
}

if (!function_exists("cartao_configurado")) {
    function cartao_configurado(): bool {
        return defined("SICREDI_CARTAO_URL") && SICREDI_CARTAO_URL !== ""
            && SICREDI_CARTAO_CLIENT_ID !== "" && SICREDI_CARTAO_CLIENT_SECRET !== "";
    }
}

// CRC16-CCITT (0x1021, início 0xFFFF) — o dígito verificador do "copia e cola".
function crc16_pix(string $payload): string {
    $crc = 0xFFFF;
    for ($i = 0, $n = strlen($payload); $i < $n; $i++) {
        $crc ^= ord($payload[$i]) << 8;
        for ($b = 0; $b < 8; $b++) {
            $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) : ($crc << 1);
            $crc &= 0xFFFF;
        }
    }
    return strtoupper(str_pad(dechex($crc), 4, "0", STR_PAD_LEFT));
}

function campo_emv(string $id, string $valor): string {
    return $id . str_pad((string) strlen($valor), 2, "0", STR_PAD_LEFT) . $valor;
}

// Formato oficial que o app do banco espera para cada tipo de chave.
function chave_pix_normalizada(string $chave): string {
    $chave = trim($chave);
    if (filter_var($chave, FILTER_VALIDATE_EMAIL)) return strtolower($chave);
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $chave)) return strtolower($chave);
    if (str_starts_with($chave, "+")) return "+" . preg_replace('/\D/', '', $chave);
    $d = preg_replace('/\D/', '', $chave);
    if (strlen($d) === 14 && cnpj_valido($d)) return $d;
    if (strlen($d) === 11 && cpf_valido($d)) return $d;
    if (strlen($d) === 10 || strlen($d) === 11) return "+55" . $d;
    if (strlen($d) === 13 && str_starts_with($d, "55")) return "+" . $d;
    return $chave;
}

// "Copia e cola" de PIX estático com valor e identificador da compra — o que o
// cliente paga quando a API do banco ainda não está configurada. O Admin
// confere o crédito no extrato e confirma no painel.
function pix_estatico(string $chave, float $valor, string $txid): string {
    $conta = campo_emv("00", "br.gov.bcb.pix") . campo_emv("01", chave_pix_normalizada($chave));
    $txid = substr(preg_replace('/[^A-Za-z0-9]/', '', $txid), 0, 25) ?: "***";
    $payload = campo_emv("00", "01")
        . campo_emv("26", $conta)
        . campo_emv("52", "0000")
        . campo_emv("53", "986")
        . campo_emv("54", number_format($valor, 2, ".", ""))
        . campo_emv("58", "BR")
        . campo_emv("59", "CORACAO PRESENTE")
        . campo_emv("60", "ALTONIA")
        . campo_emv("62", campo_emv("05", $txid))
        . "6304";
    return $payload . crc16_pix($payload);
}
