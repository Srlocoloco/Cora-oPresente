<?php
// ─── Produtos: um por vez ────────────────────────────────────────────────────
// POST   /api/produtos               → cadastra (o servidor dá o id e o código BEL-001)
// PUT    /api/produtos/{id}          → edita (precisa da "versao" que o painel leu)
// DELETE /api/produtos/{id}          → exclui
// PATCH  /api/produtos/{id}/estoque  → { delta | definir, cor?, tamanho? } ajuste rápido
//
// POR QUE EXISTE
// O painel gravava a lista INTEIRA de produtos a cada "Salvar". Duas pessoas
// cadastrando ao mesmo tempo: a segunda gravação levava a lista dela, sem o
// produto da primeira — e ele sumia. Editar um produto também regravava o
// estoque que estava no formulário, apagando as vendas feitas enquanto ele
// estava aberto.
//
// Agora cada produto é gravado sozinho, e:
//   • a "versao" recusa a edição feita em cima de uma cópia velha (outra
//     pessoa salvou antes) — em vez de uma apagar a outra calada;
//   • o estoque da edição entra como DIFERENÇA ("tinha 10, deixei 15" = +5),
//     somada ao estoque de agora — as vendas do meio do caminho não somem.

require_once __DIR__ . "/lib_estoque.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}
proteger_rota($pdo);
exigir_admin($pdo);
limitar_taxa($pdo, "produtos_gravar", 120, 300);

const CATEGORIAS_PRODUTO = ["Outros", "Caixas", "Beleza & Perfumaria", "Eletrônicos", "Brinquedos", "Academia", "Acessórios", "Casa & Decoração"];
const SELOS_PRODUTO = ["OFERTA", "MAIS VENDIDO", "TOP VENDA", "NOVO", "LANÇAMENTO"];

$metodo = $_SERVER["REQUEST_METHOD"];
$id = (int) ($_GET["id"] ?? 0);
$acao = (string) ($_GET["acao"] ?? "");

function produto_do_banco(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare(SQL_PRODUTO_SITE . " WHERE id = ?");
    $stmt->execute([$id]);
    $p = $stmt->fetch();
    return $p ? produto_para_site($p) : null;
}

// Confere o formulário e devolve os campos prontos para gravar (menos fotos e
// estoque, que têm regras próprias). Lança ErroDeGravacao com o motivo.
function campos_do_formulario(array $d): array {
    $nome = trim((string) ($d["name"] ?? ""));
    $marca = trim((string) ($d["brand"] ?? ""));
    if ($nome === "" || mb_strlen($nome) > 200) throw new ErroDeGravacao("Informe o nome do produto (até 200 letras).");
    if ($marca === "" || mb_strlen($marca) > 100) throw new ErroDeGravacao("Informe a marca (até 100 letras).");
    $categoria = (string) ($d["category"] ?? "");
    if (!in_array($categoria, CATEGORIAS_PRODUTO, true)) throw new ErroDeGravacao("Escolha uma categoria da lista.");
    $preco = round((float) ($d["price"] ?? 0), 2);
    $precoDe = isset($d["originalPrice"]) && $d["originalPrice"] !== null && $d["originalPrice"] !== "" ? round((float) $d["originalPrice"], 2) : null;
    $parcelas = (int) ($d["installments"] ?? 1);
    if ($parcelas < 1 || $parcelas > 12) throw new ErroDeGravacao("Parcelamento deve ser de 1 a 12 vezes.");
    $selo = isset($d["badge"]) && $d["badge"] !== "" ? (string) $d["badge"] : null;
    if ($selo !== null && !in_array($selo, SELOS_PRODUTO, true)) throw new ErroDeGravacao("Selo inválido.");
    $pix = isset($d["pixDesconto"]) && $d["pixDesconto"] !== null && $d["pixDesconto"] !== "" ? (int) $d["pixDesconto"] : null;
    if ($pix !== null && ($pix < 0 || $pix > 90)) throw new ErroDeGravacao("O desconto no PIX deve ser entre 0% e 90%.");
    $descricao = trim((string) ($d["description"] ?? ""));
    if (mb_strlen($descricao) > 5000) throw new ErroDeGravacao("A descrição passou de 5.000 letras.");

    // Tamanhos (só nas caixas)
    $tamanhos = [];
    if ($categoria === "Caixas") {
        foreach ((array) ($d["tamanhos"] ?? []) as $t) {
            $t = (array) $t;
            $medida = $t["tamanho"] ?? "";
            $precoT = round((float) ($t["price"] ?? 0), 2);
            if (!in_array($medida, ["P", "M", "G"], true) || $precoT <= 0) continue;
            $cap = (int) ($t["capacidade"] ?? 0);
            if ($cap < 1) throw new ErroDeGravacao("Informe quantos produtos cabem na caixa tamanho $medida.");
            $tamanhos[$medida] = [
                "tamanho" => $medida, "price" => $precoT,
                "estoque" => max(0, (int) ($t["estoque"] ?? 0)),
                "estoqueBase" => isset($t["estoqueBase"]) ? max(0, (int) $t["estoqueBase"]) : null,
                "capacidade" => $cap,
            ];
        }
        uksort($tamanhos, fn($a, $b) => strpos("PMG", $a) <=> strpos("PMG", $b));
        $tamanhos = array_values($tamanhos);
    }
    if (count($tamanhos) > 0) $preco = min(array_column($tamanhos, "price"));
    if ($preco <= 0 || $preco > 1000000) throw new ErroDeGravacao("Informe um preço de venda válido.");
    if ($precoDe !== null && $precoDe <= $preco) throw new ErroDeGravacao("O preço \"De\" precisa ser maior que o preço de venda.");

    // Cores
    $cores = [];
    $nomes = [];
    foreach ((array) ($d["colors"] ?? []) as $c) {
        $c = (array) $c;
        $nomeCor = trim((string) ($c["nome"] ?? ""));
        if ($nomeCor === "") continue;
        if (mb_strlen($nomeCor) > 60) throw new ErroDeGravacao("Nome de cor muito longo: $nomeCor.");
        $chave = mb_strtolower($nomeCor);
        if (isset($nomes[$chave])) throw new ErroDeGravacao("A cor \"$nomeCor\" aparece duas vezes.");
        $nomes[$chave] = true;
        $hex = isset($c["hex"]) && preg_match('/^#[0-9a-fA-F]{6}$/', (string) $c["hex"]) ? strtolower((string) $c["hex"]) : null;
        $estoque = isset($c["estoque"]) && $c["estoque"] !== null && $c["estoque"] !== "" ? max(0, (int) $c["estoque"]) : null;
        $cores[] = [
            "nome" => $nomeCor, "hex" => $hex, "image" => $c["image"] ?? null, "estoque" => $estoque,
            "estoqueBase" => isset($c["estoqueBase"]) && $c["estoqueBase"] !== null ? max(0, (int) $c["estoqueBase"]) : null,
        ];
    }

    return [
        "name" => $nome, "brand" => $marca, "category" => $categoria, "price" => $preco,
        "originalPrice" => $precoDe, "installments" => $parcelas, "badge" => $selo,
        "freeShipping" => !empty($d["freeShipping"]) ? 1 : 0,
        "pixDesconto" => $pix !== null && $pix > 0 ? $pix : null,
        "description" => $descricao !== "" ? $descricao : null,
        "tamanhos" => $tamanhos, "cores" => $cores,
        "stock" => max(0, (int) ($d["stock"] ?? 0)),
        "estoqueBase" => isset($d["estoqueBase"]) && $d["estoqueBase"] !== null ? max(0, (int) $d["estoqueBase"]) : null,
    ];
}

// Fotos: capa (aceita link https), galeria e foto de cada cor.
function fotos_do_formulario(PDO $pdo, array $d, array $cores): array {
    $cache = [];
    $capa = foto_para_gravar($pdo, $d["image"] ?? null, $cache, true);
    if ($capa === false) throw new ErroDeGravacao("A imagem principal é inválida. Envie JPG, PNG, WebP ou GIF de até 8 MB, ou cole um link https.");
    $galeria = [];
    foreach ((array) ($d["images"] ?? []) as $img) {
        $foto = foto_para_gravar($pdo, $img, $cache);
        if ($foto === false) throw new ErroDeGravacao("Uma das fotos da galeria é inválida (use JPG, PNG, WebP ou GIF).");
        if ($foto !== null && $foto !== "") $galeria[] = $foto;
    }
    if (count($galeria) > 12) throw new ErroDeGravacao("A galeria aceita até 12 fotos.");
    foreach ($cores as $i => $c) {
        $foto = foto_para_gravar($pdo, $c["image"], $cache);
        if ($foto === false) throw new ErroDeGravacao("A foto da cor \"{$c["nome"]}\" é inválida.");
        if ($foto === null || $foto === "") unset($cores[$i]["image"]);
        else $cores[$i]["image"] = $foto;
    }
    return [$capa, $galeria, array_values($cores)];
}

// Estoque na edição: a DIFERENÇA que o Admin fez no formulário, somada ao
// estoque de agora (que pode ter mudado com vendas enquanto o formulário
// estava aberto). No cadastro, vale o número digitado.
function aplicar_diferenca(int $atual, int $digitado, ?int $base): int {
    if ($base === null) return max(0, $digitado);
    return max(0, $atual + ($digitado - $base));
}

function montar_estoque(array $f, ?array $atual): array {
    $coresAtuais = $atual && $atual["colors"] ? (json_decode($atual["colors"], true) ?: []) : [];
    $tamsAtuais = $atual && $atual["tamanhos"] ? (json_decode($atual["tamanhos"], true) ?: []) : [];
    $porNome = [];
    foreach ($coresAtuais as $c) $porNome[mb_strtolower((string) ($c["nome"] ?? ""))] = $c;
    $porTam = [];
    foreach ($tamsAtuais as $t) $porTam[$t["tamanho"] ?? ""] = $t;

    $cores = [];
    foreach ($f["cores"] as $c) {
        $antes = $porNome[mb_strtolower($c["nome"])] ?? null;
        if ($c["estoque"] !== null) {
            $atualCor = $antes && isset($antes["estoque"]) && is_numeric($antes["estoque"]) ? (int) $antes["estoque"] : null;
            $c["estoque"] = $atualCor === null ? $c["estoque"] : aplicar_diferenca($atualCor, $c["estoque"], $c["estoqueBase"]);
        }
        unset($c["estoqueBase"]);
        if ($c["hex"] === null) unset($c["hex"]);
        if ($c["estoque"] === null) unset($c["estoque"]);
        $cores[] = $c;
    }
    $tams = [];
    foreach ($f["tamanhos"] as $t) {
        $antes = $porTam[$t["tamanho"]] ?? null;
        $t["estoque"] = $antes ? aplicar_diferenca((int) ($antes["estoque"] ?? 0), $t["estoque"], $t["estoqueBase"]) : $t["estoque"];
        unset($t["estoqueBase"]);
        $tams[] = $t;
    }
    $geral = $atual ? aplicar_diferenca((int) $atual["stock"], $f["stock"], $f["estoqueBase"]) : $f["stock"];
    return [estoque_derivado($geral, $cores, $tams), $cores, $tams];
}

function e_chave_duplicada(Throwable $e): bool {
    return $e instanceof PDOException && ($e->errorInfo[1] ?? 0) == 1062;
}

try {
    // ── Cadastrar ────────────────────────────────────────────────────────────
    if ($metodo === "POST" && $id === 0) {
        $d = corpo_json();
        $f = campos_do_formulario($d);
        [$capa, $galeria, $coresComFoto] = fotos_do_formulario($pdo, $d, $f["cores"]);
        $f["cores"] = $coresComFoto;
        [$estoque, $cores, $tams] = montar_estoque($f, null);

        for ($tentativa = 0; ; $tentativa++) {
            try {
                $pdo->beginTransaction();
                $maior = (int) $pdo->query("SELECT COALESCE(MAX(id), 0) FROM produtos")->fetchColumn();
                $novoId = max((int) round(microtime(true) * 1000), $maior + 1);
                $codigo = proximo_codigo_de_produto($pdo, $f["category"]);
                $pdo->prepare(
                    "INSERT INTO produtos (id, codigo, versao, name, brand, price, originalPrice, installments, rating, reviews,
                                           image, category, badge, freeShipping, stock, owner, pixDesconto, images, colors,
                                           description, tamanhos)
                     VALUES (?,?,1,?,?,?,?,?,0,0,?,?,?,?,?,NULL,?,?,?,?,?)"
                )->execute([
                    $novoId, $codigo, $f["name"], $f["brand"], $f["price"], $f["originalPrice"], $f["installments"],
                    $capa ?: null, $f["category"], $f["badge"], $f["freeShipping"], $estoque, $f["pixDesconto"],
                    $galeria ? json_encode($galeria) : null,
                    $cores ? json_encode($cores, JSON_UNESCAPED_UNICODE) : null,
                    $f["description"],
                    $tams ? json_encode($tams, JSON_UNESCAPED_UNICODE) : null,
                ]);
                $pdo->commit();
                break;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                // Duas telas pegaram o mesmo id ou o mesmo código no mesmo
                // instante: tenta de novo com o próximo.
                if (e_chave_duplicada($e) && $tentativa < 5) continue;
                throw $e;
            }
        }
        invalidar_vitrine($pdo);
        registrar_auditoria($pdo, "produto_criado", "$codigo · {$f["name"]}");
        json_out(["ok" => true, "produto" => produto_do_banco($pdo, $novoId)]);
    }

    if ($id <= 0) json_out(["erro" => "Produto inválido."], 400);

    // ── Ajuste rápido de estoque ─────────────────────────────────────────────
    if ($metodo === "PATCH" && $acao === "estoque") {
        $d = corpo_json();
        $delta = isset($d["delta"]) ? (int) $d["delta"] : null;
        $definir = isset($d["definir"]) ? (int) $d["definir"] : null;
        if ($delta === null && $definir === null) json_out(["erro" => "Informe quanto entra ou sai do estoque."], 400);
        if ($definir !== null && $definir < 0) json_out(["erro" => "O estoque não pode ser negativo."], 400);
        if ($delta !== null && abs($delta) > 100000) json_out(["erro" => "Quantidade fora do normal."], 400);
        $pdo->beginTransaction();
        $r = ajustar_estoque($pdo, $id, $delta, $definir, isset($d["cor"]) ? (string) $d["cor"] : null, isset($d["tamanho"]) ? (string) $d["tamanho"] : null);
        $pdo->commit();
        invalidar_vitrine($pdo);
        registrar_auditoria($pdo, "estoque_ajustado", "#$id " . ($definir !== null ? "= $definir" : sprintf("%+d", $delta))
            . (!empty($d["cor"]) ? " cor {$d["cor"]}" : "") . (!empty($d["tamanho"]) ? " tam {$d["tamanho"]}" : "")
            . " → {$r["stock"]}");
        json_out(["ok" => true, "produto" => produto_do_banco($pdo, $id)]);
    }

    // ── Editar ───────────────────────────────────────────────────────────────
    if ($metodo === "PUT") {
        $d = corpo_json();
        $versaoLida = (int) ($d["versao"] ?? 0);
        $f = campos_do_formulario($d);
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("SELECT id, versao, stock, colors, tamanhos, codigo FROM produtos WHERE id = ? FOR UPDATE");
        $stmt->execute([$id]);
        $atual = $stmt->fetch();
        if (!$atual) {
            $pdo->rollBack();
            json_out(["erro" => "Este produto foi excluído por outra pessoa."], 404);
        }
        if ($versaoLida !== (int) $atual["versao"]) {
            $pdo->rollBack();
            json_out([
                "erro" => "Outra pessoa salvou este produto enquanto você editava. Abrimos a versão mais recente — confira e salve de novo.",
                "produto" => produto_do_banco($pdo, $id),
            ], 409);
        }
        [$capa, $galeria, $coresComFoto] = fotos_do_formulario($pdo, $d, $f["cores"]);
        $f["cores"] = $coresComFoto;
        [$estoque, $cores, $tams] = montar_estoque($f, $atual);
        $pdo->prepare(
            "UPDATE produtos SET versao = versao + 1, name = ?, brand = ?, price = ?, originalPrice = ?, installments = ?,
                    image = ?, category = ?, badge = ?, freeShipping = ?, stock = ?, pixDesconto = ?, images = ?,
                    colors = ?, description = ?, tamanhos = ?
              WHERE id = ?"
        )->execute([
            $f["name"], $f["brand"], $f["price"], $f["originalPrice"], $f["installments"], $capa ?: null,
            $f["category"], $f["badge"], $f["freeShipping"], $estoque, $f["pixDesconto"],
            $galeria ? json_encode($galeria) : null,
            $cores ? json_encode($cores, JSON_UNESCAPED_UNICODE) : null,
            $f["description"],
            $tams ? json_encode($tams, JSON_UNESCAPED_UNICODE) : null,
            $id,
        ]);
        if ($estoque > 0) $pdo->prepare("DELETE FROM alertas_estoque WHERE id = ?")->execute([$id]);
        $pdo->commit();
        invalidar_vitrine($pdo);
        registrar_auditoria($pdo, "produto_editado", "{$atual["codigo"]} · {$f["name"]}");
        json_out(["ok" => true, "produto" => produto_do_banco($pdo, $id)]);
    }

    // ── Excluir ──────────────────────────────────────────────────────────────
    if ($metodo === "DELETE") {
        $stmt = $pdo->prepare("SELECT codigo, name FROM produtos WHERE id = ?");
        $stmt->execute([$id]);
        $p = $stmt->fetch();
        if (!$p) json_out(["ok" => true]);
        $pdo->prepare("DELETE FROM produtos WHERE id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM alertas_estoque WHERE id = ?")->execute([$id]);
        invalidar_vitrine($pdo);
        registrar_auditoria($pdo, "produto_excluido", "{$p["codigo"]} · {$p["name"]}");
        json_out(["ok" => true]);
    }

    json_out(["erro" => "Método não suportado."], 405);
} catch (ErroDeGravacao | ErroDeEstoque $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(["erro" => $e->getMessage()], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log("produtos.php: " . $e->getMessage());
    json_out(["erro" => "Não foi possível salvar o produto agora. Tente de novo."], 500);
}
