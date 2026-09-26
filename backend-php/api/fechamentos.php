<?php
// ─── Pagamento semanal do vendedor ──────────────────────────────────────────
//
// GET   /api/fechamentos        → semana em aberto + semanas já fechadas
//                                 (vendedor vê as dele; Admin vê de todos)
// PATCH /api/fechamentos/{id}   → { pago: true|false }  — só o Admin
//
// COMO A SEMANA FECHA
// Não existe tarefa agendada na hospedagem, então o fechamento é PREGUIÇOSO:
// toda vez que alguém abre esta tela, o servidor olha se existe alguma semana
// já terminada com venda e sem recibo, e cria o recibo na hora. O efeito para
// quem usa é o mesmo de um robô rodando domingo à meia-noite, sem depender de
// um robô que a hospedagem não tem.
//
// A semana vai de SEGUNDA a DOMINGO (mesma convenção já usada no Dashboard).
// A semana corrente nunca fecha — ela ainda está somando.

require_once __DIR__ . "/lib.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

proteger_rota($pdo);

// Só gente logada: vendedor (os dele) ou Admin (todos).
$email = strtolower(email_autenticado($pdo));
$ehAdmin = $email === strtolower(EMAIL_ADMIN);

// Segunda-feira da semana de uma data (00:00). WEEKDAY() do MySQL devolve 0
// para segunda, o que casa exatamente com a convenção do site.
function segunda_da_semana(string $data = "now"): string {
    $d = new DateTime($data);
    $d->modify("-" . ((int) $d->format("N") - 1) . " days");
    return $d->format("Y-m-d");
}

function domingo_da_semana(string $segunda): string {
    $d = new DateTime($segunda);
    $d->modify("+6 days");
    return $d->format("Y-m-d");
}

// ─── Regras de comissão ─────────────────────────────────────────────────────
// Espelham as constantes do site (constantes.tsx). Se a regra mudar lá, mude
// aqui junto — são os dois únicos lugares onde esses números existem.
const MASTER_PROPRIA        = 0.07; // Master: 7% fixo sobre as próprias vendas
const MASTERPLUS_PROPRIA    = 0.07; // MasterPlus: idem
const MASTERPLUS_EQUIPE     = 0.02; // MasterPlus: 2% sobre a equipe dele
const MASTERPLUS_OVERRIDE   = 0.01; // MasterPlus: 1% sobre a equipe do Master que promoveu
const MASTER_PROMOVIDO_EQUIPE = 0.01; // Master promovido por MasterPlus: 1% (o resto vai de repasse)

// Percentual da faixa do VENDEDOR, a partir do total que ele já vendeu.
// Master e MasterPlus não usam esta tabela — têm percentual fixo.
function fracao_comissao(float $vendasTotais): float {
    if ($vendasTotais >= 3000) return 0.10;
    if ($vendasTotais >= 1500) return 0.08;
    if ($vendasTotais >= 500)  return 0.06;
    return 0.04;
}

// Cargo de uma conta ("vendedor" quando não tem cargo registrado).
function cargo_de(PDO $pdo, string $email): string {
    $stmt = $pdo->prepare("SELECT cargo FROM cargos WHERE LOWER(email) = ?");
    $stmt->execute([$email]);
    $c = $stmt->fetchColumn();
    return $c ?: "vendedor";
}

// Percentual que ESTE Master ganha sobre a equipe dele. É menor quando ele foi
// promovido por um MasterPlus, porque 1% vai de repasse para quem o promoveu.
function percentual_equipe_do_master(PDO $pdo, string $email): float {
    $stmt = $pdo->prepare("SELECT 1 FROM vinculos_masterplus WHERE LOWER(master) = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) return MASTER_PROMOVIDO_EQUIPE;

    // Padrão configurável no painel (Configurações → Comissão do Master sobre
    // a equipe), guardado em porcentagem inteira.
    try {
        $pct = db()->query("SELECT comissaoRecrutador FROM config WHERE id = 1")->fetchColumn();
        return $pct !== false ? ((float) $pct) / 100 : 0.02;
    } catch (Throwable $e) {
        return 0.02;
    }
}

// E-mails da equipe de alguém: os vendedores que ele cadastrou E que já
// ativaram o código. Quem não ativou ainda não vende, então não entra na conta.
function equipe_de(PDO $pdo, string $email): array {
    $stmt = $pdo->prepare("SELECT LOWER(email) AS email FROM recrutamentos WHERE LOWER(recrutador) = ? AND ativado = 1");
    $stmt->execute([$email]);
    return array_column($stmt->fetchAll(), "email");
}

// Quanto um conjunto de pessoas vendeu numa semana (pedidos não cancelados).
function vendido_por_no_periodo(PDO $pdo, array $emails, string $de, string $ate): float {
    if (count($emails) === 0) return 0.0;
    $marcas = implode(",", array_fill(0, count($emails), "?"));
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(total),0) FROM pedidos
          WHERE LOWER(vendedor) IN ($marcas)
            AND status <> 'Cancelado'
            AND STR_TO_DATE(`date`, '%d/%m/%Y') BETWEEN ? AND ?"
    );
    $stmt->execute([...$emails, $de, $ate]);
    return (float) $stmt->fetchColumn();
}

// ── O cálculo, por cargo ────────────────────────────────────────────────────
// Devolve as partes separadas da comissão de uma pessoa numa semana.
//
//   vendedor   → só vendas próprias, no percentual da faixa
//   master     → 7% das próprias + % sobre a equipe de vendedores dele
//   masterplus → 7% das próprias + 2% da equipe + 1% de repasse sobre a
//                equipe de cada Master que ele promoveu (a venda pessoal do
//                Master NÃO entra no repasse — só a equipe dele)
function calcular_comissao(
    PDO $pdo,
    string $email,
    string $cargo,
    float $totalProprio,
    float $acumuladoProprio,
    string $de,
    string $ate
): array {
    $r = [
        "percentual" => 0.0, "comissao_propria" => 0.0,
        "total_equipe" => 0.0, "percentual_equipe" => 0.0, "comissao_equipe" => 0.0,
        "total_repasse" => 0.0, "percentual_repasse" => 0.0, "comissao_repasse" => 0.0,
    ];

    if ($cargo === "master" || $cargo === "masterplus") {
        $r["percentual"] = $cargo === "master" ? MASTER_PROPRIA : MASTERPLUS_PROPRIA;
        $r["comissao_propria"] = round($totalProprio * $r["percentual"], 2);

        $equipe = equipe_de($pdo, $email);
        $r["total_equipe"] = vendido_por_no_periodo($pdo, $equipe, $de, $ate);
        $r["percentual_equipe"] = $cargo === "master"
            ? percentual_equipe_do_master($pdo, $email)
            : MASTERPLUS_EQUIPE;
        $r["comissao_equipe"] = round($r["total_equipe"] * $r["percentual_equipe"], 2);

        if ($cargo === "masterplus") {
            // Repasse: a equipe de cada Master promovido por este MasterPlus.
            $stmt = $pdo->prepare("SELECT LOWER(master) AS master FROM vinculos_masterplus WHERE LOWER(masterplus) = ?");
            $stmt->execute([$email]);
            $equipesDosMasters = [];
            foreach (array_column($stmt->fetchAll(), "master") as $m) {
                $equipesDosMasters = array_merge($equipesDosMasters, equipe_de($pdo, $m));
            }
            $equipesDosMasters = array_values(array_unique($equipesDosMasters));
            $r["total_repasse"] = vendido_por_no_periodo($pdo, $equipesDosMasters, $de, $ate);
            $r["percentual_repasse"] = MASTERPLUS_OVERRIDE;
            $r["comissao_repasse"] = round($r["total_repasse"] * MASTERPLUS_OVERRIDE, 2);
        }
    } else {
        // Vendedor: faixa pelo total acumulado até o fim daquela semana.
        $r["percentual"] = fracao_comissao($acumuladoProprio);
        $r["comissao_propria"] = round($totalProprio * $r["percentual"], 2);
    }

    $r["comissao"] = round($r["comissao_propria"] + $r["comissao_equipe"] + $r["comissao_repasse"], 2);
    return $r;
}

// ── Fecha as semanas vencidas de um vendedor ────────────────────────────────
// Agrupa os pedidos dele por semana e cria o recibo de toda semana que já
// terminou e ainda não tem um. Pedido cancelado não conta.
function fechar_semanas_vencidas(PDO $pdo, string $vendedor, ?string $cargo = null): void {
    $segundaAtual = segunda_da_semana();
    $cargo = $cargo ?? cargo_de($pdo, $vendedor);

    // Semanas com venda PRÓPRIA. STR_TO_DATE porque a data do pedido é gravada
    // como texto "dd/mm/aaaa"; DATE_SUB(... WEEKDAY(...)) joga qualquer dia
    // para a segunda daquela semana.
    $stmt = $pdo->prepare(
        "SELECT
            DATE(DATE_SUB(STR_TO_DATE(`date`, '%d/%m/%Y'),
                 INTERVAL WEEKDAY(STR_TO_DATE(`date`, '%d/%m/%Y')) DAY)) AS semana,
            SUM(total) AS total_vendido,
            -- COUNT distinto por compra: um carrinho com 3 produtos vira 3 linhas
            -- nesta tabela, mas é UMA compra. Pedido antigo (sem compraId)
            -- conta pelo próprio número, que é o melhor palpite para ele.
            COUNT(DISTINCT COALESCE(compraId, id)) AS qtd
         FROM pedidos
         WHERE LOWER(vendedor) = ?
           AND status <> 'Cancelado'
           AND STR_TO_DATE(`date`, '%d/%m/%Y') IS NOT NULL
         GROUP BY semana
         HAVING semana < ?
         ORDER BY semana ASC"
    );
    $stmt->execute([$vendedor, $segundaAtual]);
    $porSemana = [];
    foreach ($stmt->fetchAll() as $s) {
        $porSemana[$s["semana"]] = ["total" => (float) $s["total_vendido"], "qtd" => (int) $s["qtd"]];
    }

    // Master e MasterPlus ganham também sobre a EQUIPE. Então pode existir
    // semana em que eles não venderam nada pessoalmente e mesmo assim têm
    // comissão a receber — essas semanas também precisam de recibo, senão o
    // dinheiro da equipe simplesmente não apareceria.
    if ($cargo === "master" || $cargo === "masterplus") {
        $rede = equipe_de($pdo, $vendedor);
        if ($cargo === "masterplus") {
            $stmtM = $pdo->prepare("SELECT LOWER(master) AS master FROM vinculos_masterplus WHERE LOWER(masterplus) = ?");
            $stmtM->execute([$vendedor]);
            foreach (array_column($stmtM->fetchAll(), "master") as $m) {
                $rede = array_merge($rede, equipe_de($pdo, $m));
            }
        }
        $rede = array_values(array_unique($rede));
        if (count($rede) > 0) {
            $marcas = implode(",", array_fill(0, count($rede), "?"));
            $stmtRede = $pdo->prepare(
                "SELECT DISTINCT
                    DATE(DATE_SUB(STR_TO_DATE(`date`, '%d/%m/%Y'),
                         INTERVAL WEEKDAY(STR_TO_DATE(`date`, '%d/%m/%Y')) DAY)) AS semana
                 FROM pedidos
                 WHERE LOWER(vendedor) IN ($marcas)
                   AND status <> 'Cancelado'
                   AND STR_TO_DATE(`date`, '%d/%m/%Y') IS NOT NULL
                 HAVING semana < ?"
            );
            $stmtRede->execute([...$rede, $segundaAtual]);
            foreach ($stmtRede->fetchAll() as $s) {
                if (!isset($porSemana[$s["semana"]])) $porSemana[$s["semana"]] = ["total" => 0.0, "qtd" => 0];
            }
        }
    }

    if (count($porSemana) === 0) return;
    ksort($porSemana); // da mais antiga para a mais nova, para o acumulado bater

    // Quais semanas já têm recibo — para não perguntar uma a uma.
    $jaFechadas = [];
    $stmtExistentes = $pdo->prepare("SELECT semana_inicio FROM fechamentos_semana WHERE vendedor = ?");
    $stmtExistentes->execute([$vendedor]);
    foreach ($stmtExistentes->fetchAll() as $linha) $jaFechadas[$linha["semana_inicio"]] = true;

    // INSERT IGNORE: se duas telas abrirem no mesmo instante, a chave única
    // (vendedor + semana) segura — a segunda simplesmente não insere nada.
    $stmtInserir = $pdo->prepare(
        "INSERT IGNORE INTO fechamentos_semana
            (vendedor, cargo, semana_inicio, semana_fim, total_vendido, percentual,
             comissao_propria, total_equipe, percentual_equipe, comissao_equipe,
             total_repasse, percentual_repasse, comissao_repasse, comissao, qtd_vendas)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    );

    // Para o VENDEDOR, a faixa de cada semana sai do total vendido ATÉ o fim
    // daquela semana — não do total de hoje. Assim o recibo antigo não muda de
    // valor quando ele sobe de faixa depois.
    $acumulado = 0.0;
    foreach ($porSemana as $semana => $dados) {
        $acumulado += $dados["total"];
        if (isset($jaFechadas[$semana])) continue;

        $domingo = domingo_da_semana($semana);
        $c = calcular_comissao($pdo, $vendedor, $cargo, $dados["total"], $acumulado, $semana, $domingo);

        // Semana sem nada a receber não vira recibo — não faz sentido pedir
        // para o Admin "pagar" R$ 0,00.
        if ($c["comissao"] <= 0) continue;

        $stmtInserir->execute([
            $vendedor, $cargo, $semana, $domingo,
            $dados["total"], $c["percentual"], $c["comissao_propria"],
            $c["total_equipe"], $c["percentual_equipe"], $c["comissao_equipe"],
            $c["total_repasse"], $c["percentual_repasse"], $c["comissao_repasse"],
            $c["comissao"], $dados["qtd"],
        ]);
    }
}

// ── Semana em aberto (o "a receber" que ainda está subindo) ─────────────────
function semana_em_aberto(PDO $pdo, string $vendedor, ?string $cargo = null): array {
    $segunda = segunda_da_semana();
    $domingo = domingo_da_semana($segunda);
    $cargo = $cargo ?? cargo_de($pdo, $vendedor);

    // Vendas próprias desta semana
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(total),0) AS total,
                COUNT(DISTINCT COALESCE(compraId, id)) AS qtd
           FROM pedidos
          WHERE LOWER(vendedor) = ?
            AND status <> 'Cancelado'
            AND STR_TO_DATE(`date`, '%d/%m/%Y') BETWEEN ? AND ?"
    );
    $stmt->execute([$vendedor, $segunda, $domingo]);
    $atual = $stmt->fetch() ?: ["total" => 0, "qtd" => 0];

    // Total vendido na vida — é ele que define a faixa do VENDEDOR
    $stmtTotal = $pdo->prepare(
        "SELECT COALESCE(SUM(total),0) FROM pedidos WHERE LOWER(vendedor) = ? AND status <> 'Cancelado'"
    );
    $stmtTotal->execute([$vendedor]);
    $vendasTotais = (float) $stmtTotal->fetchColumn();

    $totalSemana = (float) $atual["total"];
    $c = calcular_comissao($pdo, $vendedor, $cargo, $totalSemana, $vendasTotais, $segunda, $domingo);

    return [
        "vendedor" => $vendedor,
        "cargo" => $cargo,
        "semanaInicio" => $segunda,
        "semanaFim" => $domingo,
        "totalVendido" => $totalSemana,
        "qtdVendas" => (int) $atual["qtd"],
        "percentual" => $c["percentual"],
        "comissaoPropria" => $c["comissao_propria"],
        "totalEquipe" => $c["total_equipe"],
        "percentualEquipe" => $c["percentual_equipe"],
        "comissaoEquipe" => $c["comissao_equipe"],
        "totalRepasse" => $c["total_repasse"],
        "percentualRepasse" => $c["percentual_repasse"],
        "comissaoRepasse" => $c["comissao_repasse"],
        "comissao" => $c["comissao"],
        "vendasTotais" => $vendasTotais,
    ];
}

$metodo = $_SERVER["REQUEST_METHOD"];

// ── Leitura ─────────────────────────────────────────────────────────────────
if ($metodo === "GET") {
    limitar_taxa($pdo, "fechamentos_ler", 60, 300);
    try {
        if ($ehAdmin) {
            // Admin: fecha as semanas vencidas de TODO mundo que recebe
            // comissão — vendedor, Master e MasterPlus.
            $equipeToda = $pdo->query(
                "SELECT LOWER(email) AS email, cargo FROM cargos
                  WHERE cargo IN ('vendedor','master','masterplus')"
            )->fetchAll();
            foreach ($equipeToda as $v) fechar_semanas_vencidas($pdo, $v["email"], $v["cargo"]);

            $stmt = $pdo->query(
                "SELECT f.*, c.name AS vendedorNome
                   FROM fechamentos_semana f
              LEFT JOIN clientes c ON LOWER(c.email) = f.vendedor
               ORDER BY f.pago ASC, f.semana_inicio DESC"
            );
            $fechamentos = $stmt->fetchAll();

            // Semana em aberto de cada um, para o Admin ver o que está sendo
            // acumulado agora.
            $emAberto = [];
            foreach ($equipeToda as $v) {
                $aberto = semana_em_aberto($pdo, $v["email"], $v["cargo"]);
                if ($aberto["comissao"] > 0) $emAberto[] = $aberto;
            }
        } else {
            $meuCargo = cargo_de($pdo, $email);
            fechar_semanas_vencidas($pdo, $email, $meuCargo);
            $stmt = $pdo->prepare(
                "SELECT * FROM fechamentos_semana WHERE vendedor = ? ORDER BY semana_inicio DESC LIMIT 52"
            );
            $stmt->execute([$email]);
            $fechamentos = $stmt->fetchAll();
            $emAberto = [semana_em_aberto($pdo, $email, $meuCargo)];
        }

        json_out([
            "semanaAberta" => $ehAdmin ? null : $emAberto[0],
            "emAberto" => $emAberto,
            "fechamentos" => array_map(fn($f) => [
                "id" => (int) $f["id"],
                "vendedor" => $f["vendedor"],
                "vendedorNome" => $f["vendedorNome"] ?? null,
                "cargo" => $f["cargo"] ?? "vendedor",
                "semanaInicio" => $f["semana_inicio"],
                "semanaFim" => $f["semana_fim"],
                "totalVendido" => (float) $f["total_vendido"],
                "percentual" => (float) $f["percentual"],
                "comissaoPropria" => (float) ($f["comissao_propria"] ?? 0),
                "totalEquipe" => (float) ($f["total_equipe"] ?? 0),
                "percentualEquipe" => (float) ($f["percentual_equipe"] ?? 0),
                "comissaoEquipe" => (float) ($f["comissao_equipe"] ?? 0),
                "totalRepasse" => (float) ($f["total_repasse"] ?? 0),
                "percentualRepasse" => (float) ($f["percentual_repasse"] ?? 0),
                "comissaoRepasse" => (float) ($f["comissao_repasse"] ?? 0),
                "comissao" => (float) $f["comissao"],
                "qtdVendas" => (int) $f["qtd_vendas"],
                "pago" => (bool) (int) $f["pago"],
                "pagoEm" => $f["pago_em"],
                "pagoPor" => $f["pago_por"],
            ], $fechamentos),
        ]);
    } catch (Throwable $e) {
        error_log("fechamentos GET: " . $e->getMessage());
        json_out(["erro" => "Falha ao ler os fechamentos."], 500);
    }
}

// ── Marcar como pago / desmarcar ────────────────────────────────────────────
// Só o Admin. O vendedor VÊ o estado, mas não se declara pago — senão o
// controle de quem já recebeu não valeria nada.
if ($metodo === "PATCH") {
    if (!$ehAdmin) json_out(["erro" => "Não autorizado."], 403);
    limitar_taxa($pdo, "fechamentos_pagar", 60, 300);

    $id = (int) ($_GET["id"] ?? 0);
    if ($id <= 0) json_out(["erro" => "Fechamento inválido."], 400);

    $corpo = corpo_json();
    if (!array_key_exists("pago", $corpo)) json_out(["erro" => "Informe se foi pago."], 400);
    $pago = (bool) $corpo["pago"];

    try {
        $stmt = $pdo->prepare("SELECT vendedor, comissao, pago FROM fechamentos_semana WHERE id = ?");
        $stmt->execute([$id]);
        $linha = $stmt->fetch();
        if (!$linha) json_out(["erro" => "Fechamento não encontrado."], 404);

        // A gravação acontece aqui, na hora do clique: é isto que faz o
        // vendedor ver "pago" na tela dele sem ninguém mexer no banco à mão.
        $pdo->prepare(
            "UPDATE fechamentos_semana
                SET pago = ?, pago_em = ?, pago_por = ?
              WHERE id = ?"
        )->execute([
            $pago ? 1 : 0,
            $pago ? date("Y-m-d H:i:s") : null,
            $pago ? $email : null,
            $id,
        ]);

        registrar_auditoria(
            $pdo,
            $pago ? "pagamento_confirmado" : "pagamento_desmarcado",
            $linha["vendedor"] . " · R$ " . number_format((float) $linha["comissao"], 2, ",", ".")
        );

        json_out(["ok" => true, "pago" => $pago]);
    } catch (Throwable $e) {
        error_log("fechamentos PATCH: " . $e->getMessage());
        json_out(["erro" => "Falha ao registrar o pagamento."], 500);
    }
}

json_out(["erro" => "Método não suportado."], 405);
