<?php
// ─── Dados da loja: GET devolve tudo; PUT/POST grava uma coleção ─────────────
// GET  /api/dados                → todas as coleções (o site carrega ao abrir)
// PUT  /api/dados/{colecao}      → regrava a coleção que mudou no site

require_once __DIR__ . "/lib.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

$metodo = $_SERVER["REQUEST_METHOD"];

// ── Leitura completa ──────────────────────────────────────────────────────────
if ($metodo === "GET") {
    try {
        $produtos = array_map(fn($p) => [
            "id" => (int) $p["id"],
            "name" => $p["name"],
            "brand" => $p["brand"],
            "price" => (float) $p["price"],
            "originalPrice" => $p["originalPrice"] !== null ? (float) $p["originalPrice"] : null,
            "installments" => (int) $p["installments"],
            "rating" => (float) $p["rating"],
            "reviews" => (int) $p["reviews"],
            "image" => $p["image"],
            "category" => $p["category"],
            "badge" => $p["badge"],
            "freeShipping" => (bool) $p["freeShipping"],
            "stock" => (int) $p["stock"],
            "owner" => $p["owner"],
            "pixDesconto" => $p["pixDesconto"] !== null ? (int) $p["pixDesconto"] : null,
            "images" => isset($p["images"]) && $p["images"] !== null ? json_decode($p["images"], true) : null,
            "colors" => isset($p["colors"]) && $p["colors"] !== null ? json_decode($p["colors"], true) : null,
        ], $pdo->query("SELECT * FROM produtos")->fetchAll());

        $pedidos = array_map(fn($o) => [
            "id" => $o["id"],
            "customer" => $o["customer"],
            "email" => $o["email"],
            "items" => $o["items"],
            "total" => (float) $o["total"],
            "status" => $o["status"],
            "date" => $o["date"],
            "month" => $o["month"],
            "category" => $o["category"],
            "pagamento" => $o["pagamento"],
            "vendedor" => $o["vendedor"],
            "codigoVenda" => $o["codigoVenda"],
            "endereco" => $o["endereco"],
            "cupomUsado" => $o["cupomUsado"] ?? null,
        ], $pdo->query("SELECT * FROM pedidos")->fetchAll());

        $clientes = $pdo->query("SELECT email, name, since FROM clientes")->fetchAll();

        $cargos = new stdClass();
        foreach ($pdo->query("SELECT email, cargo FROM cargos")->fetchAll() as $linha) {
            $cargos->{$linha["email"]} = $linha["cargo"];
        }

        $recrutamentos = array_map(fn($r) => [
            "codigo" => $r["codigo"],
            "recrutador" => $r["recrutador"],
            "nome" => $r["nome"],
            "email" => $r["email"],
            "ativado" => (bool) $r["ativado"],
            "date" => $r["date"],
        ], $pdo->query("SELECT * FROM recrutamentos")->fetchAll());

        $vinculosMasterPlus = new stdClass();
        foreach ($pdo->query("SELECT master, masterplus FROM vinculos_masterplus")->fetchAll() as $linha) {
            $vinculosMasterPlus->{$linha["master"]} = $linha["masterplus"];
        }

        $cupons = array_map(fn($c) => [
            "codigo" => $c["codigo"],
            "percentual" => (int) $c["percentual"],
            "validade" => $c["validade"],
            "ativo" => (bool) $c["ativo"],
            "usos" => (int) $c["usos"],
        ], $pdo->query("SELECT * FROM cupons")->fetchAll());

        $alertas = array_map(fn($a) => [
            "id" => (int) $a["id"],
            "name" => $a["name"],
            "date" => $a["date"],
        ], $pdo->query("SELECT * FROM alertas_estoque")->fetchAll());

        $banners = array_map(fn($b) => [
            "id" => (int) $b["id"],
            "image" => $b["image"],
            "mobileImage" => $b["mobileImage"] ?? null,
            "tag" => $b["tag"],
            "title" => $b["title"],
            "subtitle" => $b["subtitle"],
            "cta" => $b["cta"],
            "category" => $b["category"],
        ], $pdo->query("SELECT * FROM banners")->fetchAll());

        $cartoesSalvos = array_map(fn($c) => [
            "id" => (int) $c["id"],
            "email" => $c["email"],
            "bandeira" => $c["bandeira"],
            "nomeCartao" => $c["nomeCartao"],
            "ultimosDigitos" => $c["ultimosDigitos"],
            "validade" => $c["validade"],
            "mpCardId" => $c["mpCardId"],
            "mpCustomerId" => $c["mpCustomerId"],
        ], $pdo->query("SELECT * FROM cartoes_salvos")->fetchAll());

        $configLinha = $pdo->query("SELECT * FROM config WHERE id = 1")->fetch();
        $config = $configLinha ? [
            "chavePix" => $configLinha["chavePix"],
            "freteGratisAcima" => (float) $configLinha["freteGratisAcima"],
            "freteCapital" => (float) $configLinha["freteCapital"],
            "freteInterior" => (float) $configLinha["freteInterior"],
            "fretePadrao" => (float) $configLinha["fretePadrao"],
            "comissaoRecrutador" => (float) $configLinha["comissaoRecrutador"],
        ] : null;

        json_out([
            "produtos" => $produtos,
            "pedidos" => $pedidos,
            "clientes" => $clientes,
            "cargos" => $cargos,
            "recrutamentos" => $recrutamentos,
            "vinculosMasterPlus" => $vinculosMasterPlus,
            "cupons" => $cupons,
            "alertasEstoque" => $alertas,
            "banners" => $banners,
            "cartoesSalvos" => $cartoesSalvos,
            "config" => $config,
        ]);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao ler o banco de dados."], 500);
    }
}

// ── Gravação de uma coleção ───────────────────────────────────────────────────
if ($metodo === "PUT" || $metodo === "POST") {
    $colecao = $_GET["colecao"] ?? "";
    $corpo = corpo_json();
    $dados = $corpo["dados"] ?? null;

    try {
        switch ($colecao) {
            case "produtos":
                $produtosParaGravar = array_map(function ($p) {
                    $p["images"] = !empty($p["images"]) ? json_encode($p["images"]) : null;
                    $p["colors"] = !empty($p["colors"]) ? json_encode($p["colors"]) : null;
                    return $p;
                }, is_array($dados) ? $dados : []);
                regravar($pdo, "produtos", [
                    "id", "name", "brand", "price", "originalPrice", "installments",
                    "rating", "reviews", "image", "category", "badge", "freeShipping",
                    "stock", "owner", "pixDesconto", "images", "colors",
                ], $produtosParaGravar);
                break;
            case "pedidos":
                regravar($pdo, "pedidos", [
                    "id", "customer", "email", "items", "total", "status", "date",
                    "month", "category", "pagamento", "vendedor", "codigoVenda", "endereco", "cupomUsado",
                ], is_array($dados) ? $dados : []);
                break;
            case "clientes":
                regravar($pdo, "clientes", ["email", "name", "since"], is_array($dados) ? $dados : []);
                break;
            case "cargos":
                $linhas = [];
                foreach ((array) ($dados ?? []) as $email => $cargo) {
                    $linhas[] = ["email" => $email, "cargo" => $cargo];
                }
                regravar($pdo, "cargos", ["email", "cargo"], $linhas);
                break;
            case "recrutamentos":
                regravar($pdo, "recrutamentos", [
                    "codigo", "recrutador", "nome", "email", "ativado", "date",
                ], is_array($dados) ? $dados : []);
                break;
            case "vinculosMasterPlus":
                $linhas = [];
                foreach ((array) ($dados ?? []) as $master => $masterplus) {
                    $linhas[] = ["master" => $master, "masterplus" => $masterplus];
                }
                regravar($pdo, "vinculos_masterplus", ["master", "masterplus"], $linhas);
                break;
            case "cupons":
                regravar($pdo, "cupons", ["codigo", "percentual", "validade", "ativo", "usos"], is_array($dados) ? $dados : []);
                break;
            case "alertasEstoque":
                regravar($pdo, "alertas_estoque", ["id", "name", "date"], is_array($dados) ? $dados : []);
                break;
            case "banners":
                regravar($pdo, "banners", [
                    "id", "image", "mobileImage", "tag", "title", "subtitle", "cta", "category",
                ], is_array($dados) ? $dados : []);
                break;
            case "cartoesSalvos":
                regravar($pdo, "cartoes_salvos", [
                    "id", "email", "bandeira", "nomeCartao", "ultimosDigitos", "validade", "mpCardId", "mpCustomerId",
                ], is_array($dados) ? $dados : []);
                break;
            case "config":
                regravar($pdo, "config", [
                    "id", "chavePix", "freteGratisAcima", "freteCapital",
                    "freteInterior", "fretePadrao", "comissaoRecrutador",
                ], [array_merge(["id" => 1], (array) ($dados ?? []))]);
                break;
            default:
                json_out(["erro" => "Coleção desconhecida."], 400);
        }
        json_out(["ok" => true]);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao gravar no banco de dados."], 500);
    }
}

json_out(["erro" => "Método não suportado."], 405);
