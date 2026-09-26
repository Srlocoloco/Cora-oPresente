<?php
// ─── Estoque: uma regra só para venda, devolução e ajuste do Admin ──────────
//
// Antes cada lugar mexia no estoque do seu jeito: a compra descontava o geral
// e a cor; o cadastro regravava o número que estava no formulário (apagando as
// vendas feitas enquanto ele estava aberto); o cancelamento não devolvia nada.
// O resultado era o painel de Estoque mostrando números que não batiam com a
// prateleira. Agora tudo passa por aqui, sempre com a linha do produto travada
// (FOR UPDATE) dentro de uma transação.
//
// REGRA DO ESTOQUE GERAL
//   • produto com tamanhos (caixas P/M/G) → geral = soma dos tamanhos
//   • produto em que TODAS as cores têm estoque próprio → geral = soma das cores
//   • nos demais → o número gravado no campo "stock"
// Assim o geral nunca fica diferente da soma das partes.

require_once __DIR__ . "/lib.php";

class ErroDeEstoque extends RuntimeException {}

function estoque_derivado(int $estoqueGeral, ?array $cores, ?array $tamanhos): int {
    if (is_array($tamanhos) && count($tamanhos) > 0) {
        $soma = 0;
        foreach ($tamanhos as $t) $soma += max(0, (int) ($t["estoque"] ?? 0));
        return $soma;
    }
    if (cores_tem_estoque_proprio($cores)) {
        $soma = 0;
        foreach ($cores as $c) $soma += max(0, (int) $c["estoque"]);
        return $soma;
    }
    return max(0, $estoqueGeral);
}

// true quando o produto tem cores e TODAS elas têm estoque próprio.
function cores_tem_estoque_proprio(?array $cores): bool {
    if (!is_array($cores) || count($cores) === 0) return false;
    foreach ($cores as $c) {
        if (!isset($c["estoque"]) || !is_numeric($c["estoque"])) return false;
    }
    return true;
}

function ler_produto_travado(PDO $pdo, int $produtoId): array {
    $stmt = $pdo->prepare("SELECT id, name, price, stock, colors, tamanhos, installments, pixDesconto, freeShipping, category, image FROM produtos WHERE id = ? FOR UPDATE");
    $stmt->execute([$produtoId]);
    $p = $stmt->fetch();
    if (!$p) throw new ErroDeEstoque("Um dos produtos não existe mais na loja.");
    return $p;
}

function gravar_estoque(PDO $pdo, int $produtoId, int $geral, ?array $cores, ?array $tamanhos): int {
    $final = estoque_derivado($geral, $cores, $tamanhos);
    $pdo->prepare("UPDATE produtos SET stock = ?, colors = ?, tamanhos = ? WHERE id = ?")->execute([
        $final,
        is_array($cores) && count($cores) > 0 ? json_encode($cores, JSON_UNESCAPED_UNICODE) : null,
        is_array($tamanhos) && count($tamanhos) > 0 ? json_encode($tamanhos, JSON_UNESCAPED_UNICODE) : null,
        $produtoId,
    ]);
    return $final;
}

// Retira $qtd unidades de um produto (numa venda). Devolve a lista exata do que
// saiu — cor e tamanho de cada parte — para que um cancelamento devolva as
// mesmas unidades para o mesmo lugar. Lança ErroDeEstoque se faltar.
//
// Produto de cores com estoque próprio que entra SEM cor escolhida (é o caso
// dele dentro de uma caixa do "Monte sua Caixa") sai da cor que tem mais
// unidades: o geral continua sendo a soma certa das cores.
function retirar_estoque(PDO $pdo, int $produtoId, int $qtd, ?string $cor = null, ?string $tamanho = null): array {
    if ($qtd <= 0) return [];
    $p = ler_produto_travado($pdo, $produtoId);
    $nome = (string) $p["name"];
    $cores = $p["colors"] ? (json_decode($p["colors"], true) ?: []) : [];
    $tams = $p["tamanhos"] ? (json_decode($p["tamanhos"], true) ?: []) : [];
    $geral = (int) $p["stock"];
    $partes = [];

    if (count($tams) > 0) {
        $indice = null;
        foreach ($tams as $i => $t) if (($t["tamanho"] ?? null) === $tamanho) $indice = $i;
        if ($indice === null) {
            throw new ErroDeEstoque("Escolha o tamanho de \"$nome\" antes de finalizar.");
        }
        $disp = (int) ($tams[$indice]["estoque"] ?? 0);
        if ($disp < $qtd) {
            throw new ErroDeEstoque("Estoque insuficiente de \"$nome\" no tamanho $tamanho (restam $disp).");
        }
        $tams[$indice]["estoque"] = $disp - $qtd;
        $partes[] = ["cor" => null, "tamanho" => $tamanho, "qtd" => $qtd];
    } elseif (cores_tem_estoque_proprio($cores)) {
        if ($cor !== null && $cor !== "") {
            $indice = null;
            foreach ($cores as $i => $c) if (($c["nome"] ?? null) === $cor) $indice = $i;
            if ($indice === null) throw new ErroDeEstoque("A cor \"$cor\" de \"$nome\" não existe mais.");
            $disp = (int) $cores[$indice]["estoque"];
            if ($disp < $qtd) {
                throw new ErroDeEstoque("Estoque insuficiente de \"$nome\" na cor $cor (restam $disp).");
            }
            $cores[$indice]["estoque"] = $disp - $qtd;
            $partes[] = ["cor" => $cor, "tamanho" => null, "qtd" => $qtd];
        } else {
            $total = 0;
            foreach ($cores as $c) $total += max(0, (int) $c["estoque"]);
            if ($total < $qtd) throw new ErroDeEstoque("Estoque insuficiente de \"$nome\" (restam $total).");
            $falta = $qtd;
            while ($falta > 0) {
                $maior = null;
                foreach ($cores as $i => $c) {
                    if ((int) $c["estoque"] > 0 && ($maior === null || (int) $c["estoque"] > (int) $cores[$maior]["estoque"])) $maior = $i;
                }
                $tira = min($falta, (int) $cores[$maior]["estoque"]);
                $cores[$maior]["estoque"] = (int) $cores[$maior]["estoque"] - $tira;
                $partes[] = ["cor" => $cores[$maior]["nome"] ?? null, "tamanho" => null, "qtd" => $tira];
                $falta -= $tira;
            }
        }
    } else {
        if ($geral < $qtd) throw new ErroDeEstoque("Estoque insuficiente de \"$nome\" (restam $geral).");
        $geral -= $qtd;
        // Cor escolhida sem estoque próprio: segue o geral, mas fica anotada
        $partes[] = ["cor" => ($cor !== "" ? $cor : null), "tamanho" => null, "qtd" => $qtd];
    }

    $antes = estoque_derivado((int) $p["stock"], $p["colors"] ? json_decode($p["colors"], true) : null, $p["tamanhos"] ? json_decode($p["tamanhos"], true) : null);
    $depois = gravar_estoque($pdo, $produtoId, $geral, $cores, $tams);
    if ($antes > 0 && $depois <= 0) {
        $pdo->prepare(
            "INSERT INTO alertas_estoque (id, name, date) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), date = VALUES(date)"
        )->execute([$produtoId, $nome, agora_brasil("d/m/Y")]);
    }
    return $partes;
}

// Devolve ao estoque exatamente as partes que saíram (ver retirar_estoque).
// Produto apagado depois da venda simplesmente não recebe nada de volta.
function devolver_estoque(PDO $pdo, int $produtoId, array $partes): void {
    $stmt = $pdo->prepare("SELECT id, stock, colors, tamanhos FROM produtos WHERE id = ? FOR UPDATE");
    $stmt->execute([$produtoId]);
    $p = $stmt->fetch();
    if (!$p) return;
    $cores = $p["colors"] ? (json_decode($p["colors"], true) ?: []) : [];
    $tams = $p["tamanhos"] ? (json_decode($p["tamanhos"], true) ?: []) : [];
    $geral = (int) $p["stock"];

    foreach ($partes as $parte) {
        $qtd = max(0, (int) ($parte["qtd"] ?? 0));
        if ($qtd === 0) continue;
        $devolvido = false;
        if (!empty($parte["tamanho"])) {
            foreach ($tams as $i => $t) {
                if (($t["tamanho"] ?? null) === $parte["tamanho"]) {
                    $tams[$i]["estoque"] = (int) ($t["estoque"] ?? 0) + $qtd;
                    $devolvido = true;
                }
            }
        } elseif (!empty($parte["cor"]) && cores_tem_estoque_proprio($cores)) {
            foreach ($cores as $i => $c) {
                if (($c["nome"] ?? null) === $parte["cor"]) {
                    $cores[$i]["estoque"] = (int) $c["estoque"] + $qtd;
                    $devolvido = true;
                }
            }
        }
        if (!$devolvido) $geral += $qtd;
    }
    $final = gravar_estoque($pdo, $produtoId, $geral, $cores, $tams);
    if ($final > 0) $pdo->prepare("DELETE FROM alertas_estoque WHERE id = ?")->execute([$produtoId]);
}

// Ajuste manual do Admin (tela Estoque): soma/subtrai ($delta) ou define um
// número exato ($definir), no geral, numa cor ou num tamanho. Devolve o
// produto atualizado (estoque geral, cores e tamanhos).
function ajustar_estoque(PDO $pdo, int $produtoId, ?int $delta, ?int $definir, ?string $cor, ?string $tamanho): array {
    $p = ler_produto_travado($pdo, $produtoId);
    $cores = $p["colors"] ? (json_decode($p["colors"], true) ?: []) : [];
    $tams = $p["tamanhos"] ? (json_decode($p["tamanhos"], true) ?: []) : [];
    $geral = (int) $p["stock"];
    $novo = fn(int $atual) => max(0, $definir !== null ? $definir : $atual + (int) $delta);

    if ($tamanho !== null && $tamanho !== "") {
        $achou = false;
        foreach ($tams as $i => $t) {
            if (($t["tamanho"] ?? null) === $tamanho) { $tams[$i]["estoque"] = $novo((int) ($t["estoque"] ?? 0)); $achou = true; }
        }
        if (!$achou) throw new ErroDeEstoque("Este produto não tem o tamanho $tamanho.");
    } elseif ($cor !== null && $cor !== "") {
        $achou = false;
        foreach ($cores as $i => $c) {
            if (($c["nome"] ?? null) === $cor) { $cores[$i]["estoque"] = $novo((int) ($c["estoque"] ?? 0)); $achou = true; }
        }
        if (!$achou) throw new ErroDeEstoque("Este produto não tem a cor $cor.");
    } else {
        if (count($tams) > 0 || cores_tem_estoque_proprio($cores)) {
            throw new ErroDeEstoque("Este produto controla o estoque por " . (count($tams) > 0 ? "tamanho" : "cor") . " — ajuste em cada um.");
        }
        $geral = $novo($geral);
    }
    $final = gravar_estoque($pdo, $produtoId, $geral, $cores, $tams);
    if ($final > 0) $pdo->prepare("DELETE FROM alertas_estoque WHERE id = ?")->execute([$produtoId]);
    return ["stock" => $final, "colors" => $cores ?: null, "tamanhos" => $tams ?: null];
}
