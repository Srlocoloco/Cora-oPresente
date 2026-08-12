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

// ── Leitura ───────────────────────────────────────────────────────────────────
// A resposta é RECORTADA por quem está pedindo. Antes esta rota devolvia o
// banco inteiro (todos os clientes, todos os pedidos com nome, e-mail e
// endereço de entrega) para qualquer visitante, sem login nenhum: bastava
// abrir /api/dados no navegador para baixar os dados de todo mundo.
//   visitante → só o que a vitrine precisa (produtos, banners, frete)
//   cliente   → + os pedidos dele e da equipe dele (Master/MasterPlus)
//   Admin     → tudo
if ($metodo === "GET") {
    try {
        $quem = autenticacao_opcional($pdo);
        $ehAdmin = $quem["papel"] === "admin";
        $emailLogado = $quem["email"];

        // E-mails cujas vendas este usuário pode enxergar: ele mesmo, mais a
        // equipe que ele montou (Master/MasterPlus veem a própria rede)
        $escopoVendas = [];
        if ($emailLogado !== null) {
            $escopoVendas[] = $emailLogado;
            $stmt = $pdo->prepare("SELECT email FROM recrutamentos WHERE LOWER(recrutador) = ?");
            $stmt->execute([$emailLogado]);
            foreach ($stmt->fetchAll() as $r) $escopoVendas[] = strtolower($r["email"]);
            // MasterPlus: também vê os Masters que promoveu e a equipe deles
            $stmt = $pdo->prepare("SELECT master FROM vinculos_masterplus WHERE LOWER(masterplus) = ?");
            $stmt->execute([$emailLogado]);
            foreach (array_map(fn($l) => strtolower($l["master"]), $stmt->fetchAll()) as $m) {
                $escopoVendas[] = $m;
                $sub = $pdo->prepare("SELECT email FROM recrutamentos WHERE LOWER(recrutador) = ?");
                $sub->execute([$m]);
                foreach ($sub->fetchAll() as $r) $escopoVendas[] = strtolower($r["email"]);
            }
            $escopoVendas = array_values(array_unique($escopoVendas));
        }

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
            "description" => $p["description"] ?? null,
        ], $pdo->query("SELECT * FROM produtos")->fetchAll());

        // Pedidos: o Admin vê todos; um cliente vê só as compras dele e as
        // vendas creditadas a ele ou à equipe dele; visitante não vê nenhum.
        if ($ehAdmin) {
            $linhasPedidos = $pdo->query("SELECT * FROM pedidos")->fetchAll();
        } elseif ($emailLogado !== null) {
            $marcas = implode(",", array_fill(0, count($escopoVendas), "?"));
            $stmt = $pdo->prepare(
                "SELECT * FROM pedidos WHERE LOWER(email) = ? OR LOWER(vendedor) IN ($marcas)"
            );
            $stmt->execute(array_merge([$emailLogado], $escopoVendas));
            $linhasPedidos = $stmt->fetchAll();
        } else {
            $linhasPedidos = [];
        }

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
            "codigoRastreio" => $o["codigoRastreio"] ?? null,
            "produtoId" => $o["produtoId"] !== null ? (int) $o["produtoId"] : null,
        ], $linhasPedidos);

        // Clientes: a lista completa é só do Admin (é dado pessoal de todo
        // mundo). O cliente logado recebe a própria linha mais os nomes das
        // contas com cargo (é o que a loja mostra como dono do código de
        // venda); o visitante não recebe nenhuma.
        if ($ehAdmin) {
            $clientes = $pdo->query("SELECT email, name, since, vendedorVinculado FROM clientes")->fetchAll();
        } elseif ($emailLogado !== null) {
            $stmt = $pdo->prepare(
                "SELECT c.email, c.name, c.since, c.vendedorVinculado
                   FROM clientes c
              LEFT JOIN cargos g ON LOWER(g.email) = LOWER(c.email)
                  WHERE LOWER(c.email) = ? OR g.cargo IS NOT NULL"
            );
            $stmt->execute([$emailLogado]);
            $clientes = $stmt->fetchAll();
        } else {
            $clientes = [];
        }

        // Cargos: só para quem está logado (é a lista de quem tem código de
        // venda). Visitante não precisa e não recebe.
        $cargos = new stdClass();
        if ($emailLogado !== null) {
            foreach ($pdo->query("SELECT email, cargo FROM cargos")->fetchAll() as $linha) {
                $cargos->{$linha["email"]} = $linha["cargo"];
            }
        }

        // Recrutamentos: Admin vê todos; o cliente vê os que ele criou e o
        // dele próprio (para ativar o código recebido).
        if ($ehAdmin) {
            $linhasRecrutamentos = $pdo->query("SELECT * FROM recrutamentos")->fetchAll();
        } elseif ($emailLogado !== null) {
            $stmt = $pdo->prepare(
                "SELECT * FROM recrutamentos WHERE LOWER(recrutador) = ? OR LOWER(email) = ?"
            );
            $stmt->execute([$emailLogado, $emailLogado]);
            $linhasRecrutamentos = $stmt->fetchAll();
        } else {
            $linhasRecrutamentos = [];
        }

        $recrutamentos = array_map(fn($r) => [
            "codigo" => $r["codigo"],
            "recrutador" => $r["recrutador"],
            "nome" => $r["nome"],
            "email" => $r["email"],
            "ativado" => (bool) $r["ativado"],
            "date" => $r["date"],
        ], $linhasRecrutamentos);

        $vinculosMasterPlus = new stdClass();
        if ($emailLogado !== null) {
            foreach ($pdo->query("SELECT master, masterplus FROM vinculos_masterplus")->fetchAll() as $linha) {
                $vinculosMasterPlus->{$linha["master"]} = $linha["masterplus"];
            }
        }

        // Cupons: o Admin vê todos (inclusive inativos e a contagem de usos);
        // o cliente recebe só os cupons ativos, sem o histórico de uso.
        $cupons = array_map(fn($c) => [
            "codigo" => $c["codigo"],
            "percentual" => (int) $c["percentual"],
            "validade" => $c["validade"],
            "ativo" => (bool) $c["ativo"],
            "usos" => $ehAdmin ? (int) $c["usos"] : 0,
        ], $ehAdmin
            ? $pdo->query("SELECT * FROM cupons")->fetchAll()
            : $pdo->query("SELECT * FROM cupons WHERE ativo = 1")->fetchAll());

        // Alertas de estoque esgotado são informação interna da loja
        $alertas = $ehAdmin
            ? array_map(fn($a) => [
                "id" => (int) $a["id"],
                "name" => $a["name"],
                "date" => $a["date"],
            ], $pdo->query("SELECT * FROM alertas_estoque")->fetchAll())
            : [];

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

        $configLinha = $pdo->query("SELECT * FROM config WHERE id = 1")->fetch();
        // A chave PIX da loja só vai para o Admin (é ele quem edita nas
        // Configurações). A cobrança PIX é criada no servidor, então o site
        // do cliente não precisa conhecer a chave.
        $config = $configLinha ? [
            "chavePix" => $ehAdmin ? $configLinha["chavePix"] : "",
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
            "config" => $config,
        ]);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao ler o banco de dados."], 500);
    }
}

// ── Gravação de uma coleção ───────────────────────────────────────────────────
// Regrava a tabela inteira — ação restrita ao Admin (só o painel usa isso).
if ($metodo === "PUT" || $metodo === "POST") {
    exigir_admin($pdo);
    $colecao = $_GET["colecao"] ?? "";
    $corpo = corpo_json();
    $dados = $corpo["dados"] ?? null;

    try {
        // Trava de segurança contra apagamento em massa. Estas rotas mandam a
        // coleção inteira, então uma lista vazia — ou encurtada — vinda de um
        // navegador com o estado desatualizado apagaria tudo de uma vez, sem
        // volta. Excluir itens um a um continua funcionando; o que se recusa é
        // sumir com vários de uma tacada só, que nunca é uma ação real do
        // painel (lá se exclui um produto por vez).
        $protegidas = ["produtos" => "produtos", "banners" => "banners", "cupons" => "cupons"];
        if (isset($protegidas[$colecao])) {
            $tabela = $protegidas[$colecao];
            $existentes = (int) $pdo->query("SELECT COUNT(*) FROM `$tabela`")->fetchColumn();
            $enviados = count(is_array($dados) ? $dados : []);
            $sumindo = $existentes - $enviados;
            if ($existentes > 1 && $sumindo > MAX_REMOCOES_POR_GRAVACAO) {
                registrar_auditoria($pdo, "gravacao_recusada", "$colecao: $enviados enviados x $existentes no banco");
                json_out([
                    "erro" => "Gravação recusada: isso apagaria $sumindo de $existentes itens de $colecao de uma vez. "
                            . "Recarregue a página para buscar os dados atuais e tente de novo.",
                ], 409);
            }
        }

        switch ($colecao) {
            case "produtos":
                foreach ((is_array($dados) ? $dados : []) as $p) {
                    if (!validar_imagem_base64($p["image"] ?? null)) {
                        json_out(["erro" => "Imagem principal inválida em um dos produtos."], 400);
                    }
                    foreach ((array) ($p["images"] ?? []) as $img) {
                        if (!validar_imagem_base64($img)) {
                            json_out(["erro" => "Uma das imagens da galeria é inválida."], 400);
                        }
                    }
                    foreach ((array) ($p["colors"] ?? []) as $cor) {
                        if (!validar_imagem_base64($cor["image"] ?? null)) {
                            json_out(["erro" => "Imagem de uma das cores é inválida."], 400);
                        }
                    }
                }
                $produtosParaGravar = array_map(function ($p) {
                    $p["images"] = !empty($p["images"]) ? json_encode($p["images"]) : null;
                    $p["colors"] = !empty($p["colors"]) ? json_encode($p["colors"]) : null;
                    return $p;
                }, is_array($dados) ? $dados : []);
                sincronizar($pdo, "produtos", "id", [
                    "id", "name", "brand", "price", "originalPrice", "installments",
                    "rating", "reviews", "image", "category", "badge", "freeShipping",
                    "stock", "owner", "pixDesconto", "images", "colors", "description",
                ], $produtosParaGravar);
                break;
            case "pedidos":
                regravar($pdo, "pedidos", [
                    "id", "customer", "email", "items", "total", "status", "date",
                    "month", "category", "pagamento", "vendedor", "codigoVenda", "endereco", "cupomUsado",
                    "codigoRastreio", "produtoId",
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
                sincronizar($pdo, "cupons", "codigo", ["codigo", "percentual", "validade", "ativo", "usos"], is_array($dados) ? $dados : []);
                break;
            case "alertasEstoque":
                regravar($pdo, "alertas_estoque", ["id", "name", "date"], is_array($dados) ? $dados : []);
                break;
            case "banners":
                foreach ((is_array($dados) ? $dados : []) as $b) {
                    if (!validar_imagem_base64($b["image"] ?? null) || !validar_imagem_base64($b["mobileImage"] ?? null)) {
                        json_out(["erro" => "Imagem de um dos banners é inválida."], 400);
                    }
                }
                sincronizar($pdo, "banners", "id", [
                    "id", "image", "mobileImage", "tag", "title", "subtitle", "cta", "category",
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
        registrar_auditoria($pdo, "gravar_colecao", $colecao . " (" . count((array) $dados) . " itens)");
        json_out(["ok" => true]);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao gravar no banco de dados."], 500);
    }
}

json_out(["erro" => "Método não suportado."], 405);
