<?php
// ─── Dados da loja: GET devolve tudo; PUT/POST grava uma coleção ─────────────
// GET  /api/dados                → todas as coleções (o site carrega ao abrir)
// PUT  /api/dados/{colecao}      → regrava a coleção que mudou no site

require_once __DIR__ . "/lib_compras.php";

// ── REGRA DESTA ROTA: nenhuma foto pode voltar para dentro desta resposta ────
//
// Esta rota é a primeira coisa que o site pede ao abrir. Ela já foi a causa de
// o site inteiro sair do ar com "Sem conexão com o servidor": as fotos dos
// produtos vinham aqui dentro, em base64, e a resposta passou de 19 MB. Para
// compactá-la o PHP precisava dela inteira na memória mais a cópia compactada
// ao lado — o dobro — e estourava o limite do servidor. O PHP morria no meio e
// o navegador recebia um erro 500 de corpo vazio.
//
// Enganava por dois motivos: só quebrava para quem pedia a resposta compactada
// (todo navegador pede; um teste de linha de comando não pede, e recebia os
// 19 MB parecendo tudo certo), e ia e voltava sozinho conforme cada foto nova
// empurrava o tamanho para cima ou para baixo do limite.
//
// Hoje a resposta manda só o ENDEREÇO de cada foto (ver url_foto em lib.php) e
// não passa de alguns KB. Se um dia alguém voltar a colocar base64 aqui, o
// problema volta inteiro.
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

// Porta de entrada do anti-abuso: barra quem está de castigo por excesso de
// tentativas e aplica o teto geral de requisições por IP (ver proteger_rota em
// lib.php). Fica antes de qualquer leitura ou gravação.
proteger_rota($pdo);

$metodo = $_SERVER["REQUEST_METHOD"];

// Esta é a rota mais cara da loja: monta o catálogo inteiro (~190 KB) a cada
// chamada. É a primeira coisa que o site pede ao abrir, e é exatamente o que um
// robô de raspagem de preços fica pedindo em série. O teto é generoso para uso
// normal (abrir a loja, entrar, sair e voltar) e corta quem repete sem parar.
// A gravação (PUT/POST) é do Admin e tem limite próprio, bem mais apertado.
limitar_taxa(
    $pdo,
    $metodo === "GET" ? "dados_ler" : "dados_gravar",
    $metodo === "GET" ? 120 : 60,
    300
);

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

        // ── Vitrine em cache (só para quem NÃO está logado) ─────────────────
        // Visitante recebe sempre a mesma coisa: catálogo, banners e frete.
        // Quem está logado recebe um recorte próprio (os pedidos dele, a
        // equipe dele), então esse caso nunca entra no cache compartilhado —
        // seria justamente o jeito de vazar dado de um cliente para outro.
        // Sem versão conhecida (tabela nova ainda não criada, banco com
        // problema), versao_vitrine() devolve null e o cache fica desligado:
        // a vitrine é montada na hora, como antes. Lento é melhor que errado.
        $versaoVitrine = $quem["papel"] === "anonimo" ? versao_vitrine($pdo) : null;
        $vitrineEmCache = $versaoVitrine !== null;

        if ($vitrineEmCache) {
            $etag = '"vitrine-' . $versaoVitrine . '"';

            // O navegador já tem esta versão: responde "não mudou" sem montar
            // nada. É a resposta mais barata que existe — nenhum byte de
            // catálogo sai do servidor.
            if (trim((string) ($_SERVER["HTTP_IF_NONE_MATCH"] ?? "")) === $etag) {
                header("ETag: $etag");
                header("Cache-Control: public, max-age=30, must-revalidate");
                header("Vary: Authorization");
                http_response_code(304);
                exit;
            }

            // Cópia pronta desta versão: devolve direto, sem tocar no banco.
            $pronto = ler_cache_vitrine($versaoVitrine);
            if ($pronto !== null) {
                header("Content-Type: application/json; charset=utf-8");
                header("ETag: $etag");
                header("Cache-Control: public, max-age=30, must-revalidate");
                header("Vary: Authorization");
                header("X-Cache: HIT");
                echo $pronto;
                exit;
            }
        }

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

        // As fotos NÃO vêm nesta consulta — só o tamanho da capa e um resumo
        // (MD5) do conteúdo, o bastante para montar o endereço de cada foto com
        // uma versão. É isso que mantém a resposta em alguns KB no lugar de
        // 19 MB, e que impede o PHP de carregar o catálogo de fotos inteiro na
        // memória a cada visita.
        //
        // Quantas fotos a galeria tem sai de uma continha no próprio MySQL:
        // quantas vezes o trecho "data: aparece na lista (cada foto começa
        // assim). Assim nem a lista precisa vir do banco para ser contada.
        $produtos = array_map("produto_para_site", $pdo->query(SQL_PRODUTO_SITE . " ORDER BY id ASC")->fetchAll());

        // Pedidos: o Admin vê todos; um cliente vê só as compras dele e as
        // vendas creditadas a ele ou à equipe dele; visitante não vê nenhum.
        if ($ehAdmin) {
            $linhasPedidos = $pdo->query("SELECT * FROM pedidos")->fetchAll();
        } elseif ($emailLogado !== null) {
            // ...e o entregador enxerga as entregas designadas a ele — sem
            // isso o painel de entregas dele viria vazio (a entrega não é uma
            // compra dele nem uma venda da equipe dele).
            $marcas = implode(",", array_fill(0, count($escopoVendas), "?"));
            $stmt = $pdo->prepare(
                "SELECT * FROM pedidos
                  WHERE LOWER(email) = ? OR LOWER(entregador) = ? OR LOWER(vendedor) IN ($marcas)"
            );
            $stmt->execute(array_merge([$emailLogado, $emailLogado], $escopoVendas));
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
            "compraId" => $o["compraId"] ?? null,
            "produtoId" => $o["produtoId"] !== null ? (int) $o["produtoId"] : null,
            "entregador" => $o["entregador"] ?? null,
        ], $linhasPedidos);

        // Clientes: a lista completa é só do Admin (é dado pessoal de todo
        // mundo). O cliente logado recebe a própria linha mais os nomes das
        // contas com cargo (é o que a loja mostra como dono do código de
        // venda); o visitante não recebe nenhuma.
        if ($ehAdmin) {
            $clientes = $pdo->query("SELECT email, name, since, vendedorVinculado FROM clientes")->fetchAll();
        } elseif ($emailLogado !== null) {
            // Só os cargos que VENDEM entram nessa lista — é ela que a loja usa
            // para mostrar o dono de um código de venda. Entregador não vende e
            // não tem código, então o nome e o e-mail dele não precisam (nem
            // devem) circular para todo cliente logado.
            $stmt = $pdo->prepare(
                "SELECT c.email, c.name, c.since, c.vendedorVinculado
                   FROM clientes c
              LEFT JOIN cargos g ON LOWER(g.email) = LOWER(c.email)
                  WHERE LOWER(c.email) = ? OR g.cargo IN ('vendedor', 'master', 'masterplus')"
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

        // Banner também vai como endereço, não como foto. Aqui a consulta ainda
        // traz a foto para calcular a versão — são poucos banners, algumas
        // centenas de KB; nos produtos isso significaria carregar 19 MB.
        $banners = array_map(function ($b) {
            $id = (int) $b["id"];
            $celular = $b["mobileImage"] ?? null;
            return [
                "id" => $id,
                "image" => ($b["image"] ?? "") !== ""
                    ? url_foto("banner", $id, ["v" => versao_foto($b["image"])])
                    : "",
                "mobileImage" => ($celular ?? "") !== ""
                    ? url_foto("banner", $id, ["m" => 1, "v" => versao_foto($celular)])
                    : null,
                "tag" => $b["tag"],
                "title" => $b["title"],
                "subtitle" => $b["subtitle"],
                "cta" => $b["cta"],
                "category" => $b["category"],
            ];
        }, $pdo->query("SELECT * FROM banners")->fetchAll());

        $configLinha = $pdo->query("SELECT * FROM config WHERE id = 1")->fetch();
        // A chave PIX e a conta bancária da empresa só vão para o Admin (é ele
        // quem edita nas Configurações). A cobrança é criada no servidor, então
        // o site do cliente não precisa conhecer nenhum dos dois.
        $config = $configLinha ? [
            "chavePix" => $ehAdmin ? (string) $configLinha["chavePix"] : "",
            "freteGratisAcima" => (float) $configLinha["freteGratisAcima"],
            "freteCapital" => (float) $configLinha["freteCapital"],
            "freteInterior" => (float) $configLinha["freteInterior"],
            "fretePadrao" => (float) $configLinha["fretePadrao"],
            "comissaoRecrutador" => (float) $configLinha["comissaoRecrutador"],
            // Onde a loja entrega de verdade. Vai para todo mundo (não é
            // segredo: é o que o carrinho precisa saber antes de aceitar o
            // CEP). ?? "" cobre o banco que ainda não rodou a migração.
            "cidadesAtendidas" => (string) ($configLinha["cidadesAtendidas"] ?? ""),
            // Regras de comissão (%): todo associado precisa enxergar quanto
            // ganha, então vão para quem estiver logado.
            "comMasterPropria" => (float) ($configLinha["comMasterPropria"] ?? 2),
            "comMasterRede" => (float) ($configLinha["comMasterRede"] ?? 1),
            "comMasterPlusPropria" => (float) ($configLinha["comMasterPlusPropria"] ?? 7),
            "comMasterPlusEquipe" => (float) ($configLinha["comMasterPlusEquipe"] ?? 2),
            "comMasterPlusRepasse" => (float) ($configLinha["comMasterPlusRepasse"] ?? 1),
            "repasseDiasLiberacao" => (int) ($configLinha["repasseDiasLiberacao"] ?? 7),
            "repasseValorMinimo" => (float) ($configLinha["repasseValorMinimo"] ?? 10),
            "estoqueBaixo" => (int) ($configLinha["estoqueBaixo"] ?? 5),
            // Formas de pagamento disponíveis agora — o carrinho só oferece o
            // que funciona de verdade.
            "pagamentoPix" => pix_disponivel($configLinha),
            "pixAutomatico" => pix_api_configurada(),
            "pagamentoCartao" => cartao_configurado(),
        ] : null;
        if ($config && $ehAdmin) {
            $config += [
                "repasseAutomatico" => (bool) (int) ($configLinha["repasseAutomatico"] ?? 0),
                "pixManual" => (bool) (int) ($configLinha["pixManual"] ?? 1),
                "empresaCnpj" => (string) ($configLinha["empresaCnpj"] ?? ""),
                "empresaNome" => (string) ($configLinha["empresaNome"] ?? ""),
                "empresaConvenio" => (string) ($configLinha["empresaConvenio"] ?? ""),
                "empresaAgencia" => (string) ($configLinha["empresaAgencia"] ?? ""),
                "empresaConta" => (string) ($configLinha["empresaConta"] ?? ""),
                "empresaContaDigito" => (string) ($configLinha["empresaContaDigito"] ?? ""),
            ];
        }

        $resposta = [
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
        ];

        if ($vitrineEmCache) {
            // Monta uma vez e guarda pronta: as próximas visitas, enquanto
            // nada mudar na loja, são servidas sem tocar no banco.
            $json = json_encode($resposta, JSON_UNESCAPED_UNICODE);
            gravar_cache_vitrine($versaoVitrine, $json);
            header("Content-Type: application/json; charset=utf-8");
            header('ETag: "vitrine-' . $versaoVitrine . '"');
            header("Cache-Control: public, max-age=30, must-revalidate");
            header("Vary: Authorization");
            header("X-Cache: MISS");
            echo $json;
            exit;
        }

        // Quem está logado recebe um recorte pessoal: nunca vai para cache
        // compartilhado nem para o cache do navegador.
        header("Cache-Control: private, no-store");
        header("Vary: Authorization");
        json_out($resposta);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao ler o banco de dados."], 500);
    }
}

// ── Gravação (só o Admin) ─────────────────────────────────────────────────────
// Esta rota recebia a coleção INTEIRA e regravava a tabela a partir do que o
// navegador tinha na memória. Com duas pessoas no painel, a gravação de uma
// apagava o que a outra acabou de cadastrar; e "pedidos"/"clientes" chegavam a
// ser apagados e reinseridos (sumindo com senhas, compras novas e vínculos).
//
// Agora:
//   • produtos → rotas próprias, um produto por vez (produtos.php)
//   • cargos / Masters / MasterPlus → rota da equipe (recrutamentos.php)
//   • pedidos, clientes, recrutamentos, alertas → não se grava mais por aqui
//   • banners e cupons → seguem aqui (poucos itens, só o Admin mexe), com a
//     trava de remoção em massa
//   • config → só os campos conhecidos, validados um a um
if ($metodo === "PUT" || $metodo === "POST") {
    exigir_admin($pdo);
    $colecao = $_GET["colecao"] ?? "";
    $corpo = corpo_json();
    $dados = $corpo["dados"] ?? null;

    $movidas = [
        "produtos" => "Os produtos agora são salvos um por vez. Atualize a página (Ctrl+F5) para usar o painel novo.",
        "cargos" => "Os cargos agora são salvos um por vez. Atualize a página (Ctrl+F5) para usar o painel novo.",
        "vinculosMasterPlus" => "Os cargos agora são salvos um por vez. Atualize a página (Ctrl+F5) para usar o painel novo.",
        "pedidos" => "Pedidos são alterados um por vez, pela tela de Pedidos.",
        "clientes" => "A lista de clientes não é regravada por aqui.",
        "recrutamentos" => "A equipe é alterada pelas telas de equipe.",
        "alertasEstoque" => "Os alertas de estoque são atualizados sozinhos.",
    ];
    if (isset($movidas[$colecao])) json_out(["erro" => $movidas[$colecao]], 410);

    try {
        if ($colecao === "banners" || $colecao === "cupons") {
            // Trava contra apagamento em massa: excluir é um item por vez no
            // painel, então uma lista muito menor que a do banco é sinal de
            // tela desatualizada — e a gravação é recusada.
            $existentes = (int) $pdo->query("SELECT COUNT(*) FROM `$colecao`")->fetchColumn();
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
            case "cupons":
                $linhas = [];
                foreach ((is_array($dados) ? $dados : []) as $c) {
                    $codigo = strtoupper(trim((string) ($c["codigo"] ?? "")));
                    $pct = (int) ($c["percentual"] ?? 0);
                    $validade = (string) ($c["validade"] ?? "");
                    if (!preg_match('/^[A-Z0-9_-]{3,32}$/', $codigo)) throw new ErroDeGravacao("Código de cupom inválido: use de 3 a 32 letras/números.");
                    if ($pct < 1 || $pct > 90) throw new ErroDeGravacao("O desconto do cupom $codigo deve ser entre 1% e 90%.");
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $validade)) throw new ErroDeGravacao("Validade do cupom $codigo inválida.");
                    $linhas[] = [
                        "codigo" => $codigo, "percentual" => $pct, "validade" => $validade,
                        "ativo" => !empty($c["ativo"]) ? 1 : 0, "usos" => max(0, (int) ($c["usos"] ?? 0)),
                    ];
                }
                sincronizar($pdo, "cupons", "codigo", ["codigo", "percentual", "validade", "ativo", "usos"], $linhas);
                break;

            case "banners":
                // O site devolve o endereço da foto que já está no banco, e
                // aqui esse endereço vira a foto de volta (senão a gravação
                // apagaria o banner).
                $cacheFotos = [];
                $bannersParaGravar = (function () use ($pdo, $dados, &$cacheFotos) {
                    foreach ((is_array($dados) ? $dados : []) as $b) {
                        foreach (["image", "mobileImage"] as $campo) {
                            $foto = foto_para_gravar($pdo, $b[$campo] ?? null, $cacheFotos);
                            if ($foto === false) {
                                throw new ErroDeGravacao("Imagem de um dos banners é inválida.");
                            }
                            $b[$campo] = $foto;
                        }
                        foreach (["tag" => 64, "title" => 255, "subtitle" => 255, "cta" => 64, "category" => 64] as $campo => $max) {
                            $b[$campo] = mb_substr(trim((string) ($b[$campo] ?? "")), 0, $max);
                        }
                        $b["id"] = (int) ($b["id"] ?? 0);
                        if ($b["id"] <= 0) throw new ErroDeGravacao("Banner sem identificação.");
                        yield $b;
                    }
                })();
                sincronizar($pdo, "banners", "id", [
                    "id", "image", "mobileImage", "tag", "title", "subtitle", "cta", "category",
                ], $bannersParaGravar);
                break;

            case "config":
                gravar_config($pdo, (array) ($dados ?? []));
                break;

            default:
                json_out(["erro" => "Coleção desconhecida."], 400);
        }
        registrar_auditoria($pdo, "gravar_colecao", $colecao . " (" . count((array) $dados) . " itens)");
        // O Admin mudou algo: a cópia pronta da vitrine deixa de valer e a
        // próxima visita monta a nova.
        invalidar_vitrine($pdo);
        json_out(["ok" => true]);
    } catch (ErroDeGravacao $e) {
        json_out(["erro" => $e->getMessage()], 400);
    } catch (Throwable $e) {
        error_log("dados PUT $colecao: " . $e->getMessage());
        json_out(["erro" => "Falha ao gravar no banco de dados."], 500);
    }
}

// Grava só os campos conhecidos da configuração, cada um conferido. Campo que
// não veio fica como estava (antes a linha inteira era apagada e reinserida —
// um campo esquecido pelo navegador voltava a NULL).
function gravar_config(PDO $pdo, array $d): void {
    $numero = function ($v, float $min, float $max, string $rotulo): float {
        if (!is_numeric($v)) throw new ErroDeGravacao("$rotulo: informe um número.");
        $n = (float) $v;
        if ($n < $min || $n > $max) {
            throw new ErroDeGravacao("$rotulo: use um valor entre " . str_replace(".", ",", (string) $min) . " e " . str_replace(".", ",", (string) $max) . ".");
        }
        return round($n, 2);
    };
    $texto = fn($v, int $max) => mb_substr(trim((string) $v), 0, $max);
    $regras = [
        "chavePix" => fn($v) => $texto($v, 120),
        "freteGratisAcima" => fn($v) => $numero($v, 0, 100000, "Frete grátis a partir de"),
        "freteCapital" => fn($v) => $numero($v, 0, 1000, "Frete da capital"),
        "freteInterior" => fn($v) => $numero($v, 0, 1000, "Frete do interior"),
        "fretePadrao" => fn($v) => $numero($v, 0, 1000, "Frete padrão"),
        "cidadesAtendidas" => fn($v) => $texto($v, 500),
        "comMasterPropria" => fn($v) => $numero($v, 0, 50, "Comissão do Master nas próprias vendas"),
        "comMasterRede" => fn($v) => $numero($v, 0, 50, "Comissão do Master sobre a rede"),
        "comMasterPlusPropria" => fn($v) => $numero($v, 0, 50, "Comissão do MasterPlus nas próprias vendas"),
        "comMasterPlusEquipe" => fn($v) => $numero($v, 0, 50, "Comissão do MasterPlus sobre a equipe"),
        "comMasterPlusRepasse" => fn($v) => $numero($v, 0, 50, "Repasse do MasterPlus"),
        "repasseDiasLiberacao" => fn($v) => (int) $numero($v, 0, 90, "Dias para liberar a comissão"),
        "repasseValorMinimo" => fn($v) => $numero($v, 0, 10000, "Valor mínimo do repasse"),
        "repasseAutomatico" => fn($v) => !empty($v) ? 1 : 0,
        "pixManual" => fn($v) => !empty($v) ? 1 : 0,
        "estoqueBaixo" => fn($v) => (int) $numero($v, 0, 1000, "Aviso de estoque baixo"),
        "empresaNome" => fn($v) => $texto($v, 60),
        "empresaConvenio" => fn($v) => strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $v)),
        "empresaAgencia" => fn($v) => substr(preg_replace('/\D/', '', (string) $v), 0, 5),
        "empresaConta" => fn($v) => substr(preg_replace('/\D/', '', (string) $v), 0, 12),
        "empresaContaDigito" => fn($v) => substr(strtoupper(preg_replace('/[^0-9Xx]/', '', (string) $v)), 0, 1),
        "empresaCnpj" => function ($v) {
            $d = preg_replace('/\D/', '', (string) $v);
            if ($d !== "" && !cnpj_valido($d)) throw new ErroDeGravacao("CNPJ da empresa inválido.");
            return $d;
        },
    ];
    $campos = [];
    foreach ($regras as $campo => $validar) {
        if (array_key_exists($campo, $d)) $campos[$campo] = $validar($d[$campo]);
    }
    if (!$campos) return;
    $pdo->exec("INSERT IGNORE INTO config (id) VALUES (1)");
    $sets = implode(", ", array_map(fn($c) => "`$c` = ?", array_keys($campos)));
    $pdo->prepare("UPDATE config SET $sets WHERE id = 1")->execute(array_values($campos));
    config_loja($pdo, true);
}

json_out(["erro" => "Método não suportado."], 405);
