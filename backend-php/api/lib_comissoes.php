<?php
// ─── Comissão por venda ──────────────────────────────────────────────────────
//
// Cada venda PAGA vira, na hora, uma linha de comissão para cada pessoa da
// rede que ganha com ela. É o "extrato" de cada associado: dá para ver venda
// por venda de onde veio o dinheiro, quanto já está liberado e quanto já caiu
// na conta.
//
// REGRAS (percentuais editáveis em Admin → Configurações → Comissões)
//   Vendedor    → faixa pelo total vendido na vida: 4% · 6% · 8% · 10%
//   Master      → 2% das próprias vendas + 1% das vendas da rede dele
//                 (os vendedores que ele cadastrou)
//   MasterPlus  → 7% das próprias vendas + 2% da equipe dele
//                 + 1% de repasse sobre a rede de cada Master que promoveu
//   Venda com o código da LOJA (sem vendedor) não gera comissão.
//
// CICLO DE UMA COMISSÃO
//   aguardando_entrega → o pedido foi pago, mas ainda não foi entregue
//   a_liberar          → entregue; libera em N dias (prazo de arrependimento)
//   disponivel         → pode entrar no próximo repasse
//   em_repasse         → está num repasse enviado ao banco
//   paga               → o banco confirmou o crédito na conta do associado
//   cancelada          → o pedido foi cancelado antes de a comissão ser paga
//   (tipo "estorno")   → pedido cancelado DEPOIS de pago: valor negativo, que
//                        é descontado do próximo repasse

require_once __DIR__ . "/lib.php";

// Faixas do vendedor — mesmas de NIVEIS_VENDEDOR (src/app/constantes.tsx).
const FAIXAS_VENDEDOR = [
    [3000, 0.10],
    [1500, 0.08],
    [500, 0.06],
    [0, 0.04],
];

function faixa_do_vendedor(float $vendasTotais): float {
    foreach (FAIXAS_VENDEDOR as [$minimo, $fracao]) {
        if ($vendasTotais >= $minimo) return $fracao;
    }
    return 0.04;
}

// Percentuais em vigor, como FRAÇÃO (0.02 = 2%). Vêm da configuração; os
// valores padrão são a regra da loja caso o banco ainda não tenha o campo.
function regras_comissao(PDO $pdo): array {
    $c = config_loja($pdo);
    $pct = fn(string $campo, float $padrao) => max(0.0, min(50.0, (float) ($c[$campo] ?? $padrao))) / 100;
    return [
        "master_propria" => $pct("comMasterPropria", 2),
        "master_rede" => $pct("comMasterRede", 1),
        "masterplus_propria" => $pct("comMasterPlusPropria", 7),
        "masterplus_equipe" => $pct("comMasterPlusEquipe", 2),
        "masterplus_repasse" => $pct("comMasterPlusRepasse", 1),
        "dias_liberacao" => max(0, min(90, (int) ($c["repasseDiasLiberacao"] ?? 7))),
        "valor_minimo" => max(0.0, (float) ($c["repasseValorMinimo"] ?? 10)),
    ];
}

// Quem cadastrou este vendedor (e-mail), considerando só vínculos ativados.
function recrutador_de(PDO $pdo, string $vendedor): ?string {
    $stmt = $pdo->prepare("SELECT LOWER(recrutador) FROM recrutamentos WHERE LOWER(email) = ? AND ativado = 1 LIMIT 1");
    $stmt->execute([strtolower($vendedor)]);
    $r = $stmt->fetchColumn();
    return $r ? (string) $r : null;
}

function masterplus_do_master(PDO $pdo, string $master): ?string {
    $stmt = $pdo->prepare("SELECT LOWER(masterplus) FROM vinculos_masterplus WHERE LOWER(master) = ? LIMIT 1");
    $stmt->execute([strtolower($master)]);
    $r = $stmt->fetchColumn();
    return $r ? (string) $r : null;
}

// Total que um vendedor já vendeu na vida (pedidos pagos, não cancelados).
function vendas_totais_de(PDO $pdo, string $vendedor): float {
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(total), 0) FROM pedidos
          WHERE LOWER(vendedor) = ? AND status NOT IN ('Cancelado', 'Aguardando pagamento')"
    );
    $stmt->execute([strtolower($vendedor)]);
    return (float) $stmt->fetchColumn();
}

// Quem ganha quanto com UM pedido. Devolve linhas prontas para gravar.
function comissoes_do_pedido(PDO $pdo, array $pedido, array $regras, array &$cacheFaixa): array {
    $vendedor = strtolower(trim((string) ($pedido["vendedor"] ?? "")));
    if ($vendedor === "" || $vendedor === strtolower(EMAIL_ADMIN)) return [];
    $base = centavos((float) $pedido["total"]);
    if ($base <= 0) return [];

    $linhas = [];
    $add = function (string $quem, string $cargo, string $tipo, float $fracao, string $descricao) use (&$linhas, $base, $vendedor) {
        $valor = centavos($base * $fracao);
        if ($valor <= 0) return;
        $linhas[] = [
            "beneficiario" => $quem, "cargo" => $cargo, "tipo" => $tipo, "origem" => $vendedor,
            "descricao" => $descricao, "base" => $base, "percentual" => $fracao, "valor" => $valor,
        ];
    };

    $cargo = cargo_da_conta($pdo, $vendedor);
    if ($cargo === "masterplus") {
        $add($vendedor, "masterplus", "venda", $regras["masterplus_propria"], "Sua venda");
    } elseif ($cargo === "master") {
        $add($vendedor, "master", "venda", $regras["master_propria"], "Sua venda");
    } elseif ($cargo === "vendedor") {
        if (!isset($cacheFaixa[$vendedor])) $cacheFaixa[$vendedor] = faixa_do_vendedor(vendas_totais_de($pdo, $vendedor));
        $add($vendedor, "vendedor", "venda", $cacheFaixa[$vendedor], "Sua venda");

        $lider = recrutador_de($pdo, $vendedor);
        if ($lider !== null) {
            $cargoLider = cargo_da_conta($pdo, $lider);
            if ($cargoLider === "master") {
                $add($lider, "master", "equipe", $regras["master_rede"], "Venda da sua rede");
                $mp = masterplus_do_master($pdo, $lider);
                if ($mp !== null && cargo_da_conta($pdo, $mp) === "masterplus") {
                    $add($mp, "masterplus", "repasse", $regras["masterplus_repasse"], "Rede de um Master seu");
                }
            } elseif ($cargoLider === "masterplus") {
                $add($lider, "masterplus", "equipe", $regras["masterplus_equipe"], "Venda da sua equipe");
            }
        }
    }
    return $linhas;
}

// Grava as comissões de todos os pedidos de uma compra que acabou de ser paga.
// Idempotente: a chave única (pedido + pessoa + tipo) impede lançar duas vezes.
function registrar_comissoes_da_compra(PDO $pdo, string $compraId): void {
    $stmt = $pdo->prepare("SELECT id, vendedor, total, items FROM pedidos WHERE compraId = ?");
    $stmt->execute([$compraId]);
    $pedidos = $stmt->fetchAll();
    $regras = regras_comissao($pdo);
    $cacheFaixa = [];
    $ins = $pdo->prepare(
        "INSERT IGNORE INTO comissoes
            (pedidoId, compraId, beneficiario, cargo, tipo, origem, descricao, base, percentual, valor, status, criadoEm)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'aguardando_entrega', ?)"
    );
    $agora = agora_brasil();
    foreach ($pedidos as $p) {
        foreach (comissoes_do_pedido($pdo, $p, $regras, $cacheFaixa) as $c) {
            $descricao = mb_substr($c["descricao"] . " · " . (string) $p["items"], 0, 250);
            $ins->execute([
                $p["id"], $compraId, $c["beneficiario"], $c["cargo"], $c["tipo"], $c["origem"],
                $descricao, $c["base"], $c["percentual"], $c["valor"], $agora,
            ]);
        }
        $pdo->prepare("UPDATE pedidos SET comissaoPorVenda = 1 WHERE id = ?")->execute([$p["id"]]);
    }
}

// Pedido entregue: começa a contar o prazo de liberação.
function liberar_comissoes_na_entrega(PDO $pdo, string $pedidoId): void {
    $dias = regras_comissao($pdo)["dias_liberacao"];
    $pdo->prepare(
        "UPDATE comissoes
            SET status = 'a_liberar', liberaEm = DATE_ADD(?, INTERVAL $dias DAY), atualizadoEm = ?
          WHERE pedidoId = ? AND status = 'aguardando_entrega'"
    )->execute([agora_brasil("Y-m-d"), agora_brasil(), $pedidoId]);
    atualizar_liberacoes($pdo);
}

// Passa para "disponível" tudo que já cumpriu o prazo. Barato (índice por
// status); roda sempre que alguém abre o extrato ou os repasses.
function atualizar_liberacoes(PDO $pdo): void {
    $pdo->prepare(
        "UPDATE comissoes SET status = 'disponivel', atualizadoEm = ?
          WHERE status = 'a_liberar' AND liberaEm <= ?"
    )->execute([agora_brasil(), agora_brasil("Y-m-d")]);
}

// Pedido cancelado: o que ainda não foi pago é cancelado; o que já foi pago
// (ou está num repasse a caminho) vira um estorno negativo, descontado do
// próximo repasse daquela pessoa.
function cancelar_comissoes_do_pedido(PDO $pdo, string $pedidoId): void {
    $agora = agora_brasil();
    $pdo->prepare(
        "UPDATE comissoes SET status = 'cancelada', atualizadoEm = ?
          WHERE pedidoId = ? AND tipo <> 'estorno' AND status IN ('aguardando_entrega','a_liberar','disponivel')"
    )->execute([$agora, $pedidoId]);

    $stmt = $pdo->prepare(
        "SELECT * FROM comissoes WHERE pedidoId = ? AND tipo <> 'estorno' AND status IN ('em_repasse','paga')"
    );
    $stmt->execute([$pedidoId]);
    $ins = $pdo->prepare(
        "INSERT IGNORE INTO comissoes
            (pedidoId, compraId, beneficiario, cargo, tipo, origem, descricao, base, percentual, valor, status, criadoEm)
         VALUES (?,?,?,?, 'estorno', ?,?,?,?,?, 'disponivel', ?)"
    );
    foreach ($stmt->fetchAll() as $c) {
        $ins->execute([
            $c["pedidoId"], $c["compraId"], $c["beneficiario"], $c["cargo"], $c["origem"],
            mb_substr("Estorno: pedido " . $pedidoId . " cancelado", 0, 250),
            $c["base"], $c["percentual"], -abs((float) $c["valor"]), $agora,
        ]);
    }
}

// Resumo do saldo de uma pessoa, no formato das telas de "Meus ganhos".
function saldo_de(PDO $pdo, string $email): array {
    atualizar_liberacoes($pdo);
    $stmt = $pdo->prepare(
        "SELECT status, COALESCE(SUM(valor), 0) AS total FROM comissoes
          WHERE beneficiario = ? AND status <> 'cancelada' GROUP BY status"
    );
    $stmt->execute([strtolower($email)]);
    $s = ["aguardando_entrega" => 0.0, "a_liberar" => 0.0, "disponivel" => 0.0, "em_repasse" => 0.0, "paga" => 0.0];
    foreach ($stmt->fetchAll() as $l) $s[$l["status"]] = centavos((float) $l["total"]);
    return [
        "aguardandoEntrega" => $s["aguardando_entrega"],
        "aLiberar" => $s["a_liberar"],
        "disponivel" => $s["disponivel"],
        "emRepasse" => $s["em_repasse"],
        "recebido" => $s["paga"],
    ];
}

// ─── Dados de recebimento ────────────────────────────────────────────────────

const BANCOS_CONHECIDOS = [
    "748" => "Sicredi", "756" => "Sicoob", "001" => "Banco do Brasil", "104" => "Caixa",
    "237" => "Bradesco", "341" => "Itaú", "033" => "Santander", "260" => "Nubank",
    "077" => "Inter", "336" => "C6 Bank", "290" => "PagBank", "323" => "Mercado Pago",
    "380" => "PicPay", "197" => "Stone", "403" => "Cora", "212" => "Banco Original",
    "041" => "Banrisul", "085" => "Ailos", "136" => "Unicred", "422" => "Safra",
];

function cpf_valido(string $cpf): bool {
    $cpf = preg_replace('/\D/', '', $cpf);
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) return false;
    for ($t = 9; $t < 11; $t++) {
        $soma = 0;
        for ($i = 0; $i < $t; $i++) $soma += (int) $cpf[$i] * (($t + 1) - $i);
        $dv = ((10 * $soma) % 11) % 10;
        if ((int) $cpf[$t] !== $dv) return false;
    }
    return true;
}

function cnpj_valido(string $cnpj): bool {
    $cnpj = preg_replace('/\D/', '', $cnpj);
    if (strlen($cnpj) !== 14 || preg_match('/^(\d)\1{13}$/', $cnpj)) return false;
    $pesos = [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]];
    for ($t = 0; $t < 2; $t++) {
        $soma = 0;
        foreach ($pesos[$t] as $i => $peso) $soma += (int) $cnpj[$i] * $peso;
        $resto = $soma % 11;
        $dv = $resto < 2 ? 0 : 11 - $resto;
        if ((int) $cnpj[12 + $t] !== $dv) return false;
    }
    return true;
}

// Normaliza e confere a chave PIX pelo tipo. Devolve [tipo, chave] ou lança.
function normalizar_chave_pix(string $tipo, string $chave): array {
    $chave = trim($chave);
    switch ($tipo) {
        case "cpf":
            $d = preg_replace('/\D/', '', $chave);
            if (!cpf_valido($d)) throw new InvalidArgumentException("A chave PIX (CPF) não é um CPF válido.");
            return ["cpf", $d];
        case "cnpj":
            $d = preg_replace('/\D/', '', $chave);
            if (!cnpj_valido($d)) throw new InvalidArgumentException("A chave PIX (CNPJ) não é um CNPJ válido.");
            return ["cnpj", $d];
        case "email":
            $e = strtolower($chave);
            if (!filter_var($e, FILTER_VALIDATE_EMAIL) || strlen($e) > 77) throw new InvalidArgumentException("A chave PIX (e-mail) não é um e-mail válido.");
            return ["email", $e];
        case "telefone":
            $d = preg_replace('/\D/', '', $chave);
            if (strlen($d) === 13 && str_starts_with($d, "55")) $d = substr($d, 2);
            if (strlen($d) !== 11 && strlen($d) !== 10) throw new InvalidArgumentException("A chave PIX (celular) precisa ter DDD + número.");
            return ["telefone", "+55" . $d];
        case "aleatoria":
            $a = strtolower($chave);
            if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $a)) {
                throw new InvalidArgumentException("A chave aleatória tem 36 caracteres, no formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.");
            }
            return ["aleatoria", $a];
    }
    throw new InvalidArgumentException("Escolha o tipo da chave PIX.");
}

// Valida o formulário de recebimento. Devolve a linha pronta para gravar.
function validar_dados_recebimento(array $d): array {
    $titular = trim(preg_replace('/\s+/', ' ', (string) ($d["titular"] ?? "")));
    $cpf = preg_replace('/\D/', '', (string) ($d["cpf"] ?? ""));
    $banco = str_pad(preg_replace('/\D/', '', (string) ($d["banco"] ?? "")), 3, "0", STR_PAD_LEFT);
    $agencia = preg_replace('/\D/', '', (string) ($d["agencia"] ?? ""));
    $conta = preg_replace('/\D/', '', (string) ($d["conta"] ?? ""));
    $digito = strtoupper(preg_replace('/[^0-9Xx]/', '', (string) ($d["contaDigito"] ?? "")));
    $tipoConta = (string) ($d["tipoConta"] ?? "");
    $tipoChave = (string) ($d["tipoChavePix"] ?? "");
    $chave = (string) ($d["chavePix"] ?? "");

    if (mb_strlen($titular) < 5 || mb_strlen($titular) > 120) throw new InvalidArgumentException("Informe o nome completo do titular da conta.");
    if (!cpf_valido($cpf)) throw new InvalidArgumentException("CPF inválido. Confira os números.");
    if (!preg_match('/^\d{3}$/', $banco) || $banco === "000") throw new InvalidArgumentException("Escolha o banco.");
    if ($agencia === "" || strlen($agencia) > 5) throw new InvalidArgumentException("Agência inválida (até 5 números, sem dígito).");
    if ($conta === "" || strlen($conta) > 12) throw new InvalidArgumentException("Número da conta inválido.");
    if (strlen($digito) !== 1) throw new InvalidArgumentException("Informe o dígito da conta (o número depois do traço).");
    if (!in_array($tipoConta, ["salario", "corrente", "poupanca"], true)) throw new InvalidArgumentException("Escolha o tipo de conta.");

    // Conta salário só recebe crédito da empresa pela FOLHA DE PAGAMENTO do
    // banco onde ela foi aberta — e a folha da loja é no Sicredi. PIX de
    // terceiros para conta salário é proibido pelo Banco Central.
    if ($tipoConta === "salario" && $banco !== "748") {
        throw new InvalidArgumentException("A conta salário precisa ser do Sicredi (banco 748) — é por lá que a loja paga a folha.");
    }

    $tipoFinal = null;
    $chaveFinal = null;
    if ($tipoChave !== "" && trim($chave) !== "") {
        [$tipoFinal, $chaveFinal] = normalizar_chave_pix($tipoChave, $chave);
    }
    // Para receber em conta de OUTRO banco (fora do Sicredi) sem ser conta
    // salário, o pagamento sai por PIX — então a chave é obrigatória.
    if ($tipoConta !== "salario" && $banco !== "748" && $chaveFinal === null) {
        throw new InvalidArgumentException("Para receber em conta de outro banco, cadastre uma chave PIX desta conta.");
    }
    if ($tipoConta === "poupanca" && $chaveFinal === null) {
        throw new InvalidArgumentException("Para receber na poupança, cadastre uma chave PIX desta conta.");
    }

    return [
        "titular" => mb_substr($titular, 0, 120),
        "cpf" => $cpf,
        "banco" => $banco,
        "agencia" => $agencia,
        "conta" => $conta,
        "contaDigito" => $digito,
        "tipoConta" => $tipoConta,
        "tipoChavePix" => $tipoFinal,
        "chavePix" => $chaveFinal,
    ];
}

// Como o dinheiro sai para esta conta:
//   folha           → conta salário Sicredi (Folha de Pagamento, serviço 30)
//   pix             → PIX pela chave cadastrada
//   credito_sicredi → crédito direto em conta corrente Sicredi
function metodo_de_repasse(array $dados): string {
    if ($dados["tipoConta"] === "salario") return "folha";
    if (!empty($dados["chavePix"])) return "pix";
    return "credito_sicredi";
}

// Mostra só o finalzinho — listas e respostas nunca levam o dado inteiro.
function mascarar(string $valor, int $visiveis = 3): string {
    $n = mb_strlen($valor);
    if ($n <= $visiveis) return str_repeat("•", $n);
    return str_repeat("•", max(3, $n - $visiveis)) . mb_substr($valor, -$visiveis);
}

function dados_recebimento_de(PDO $pdo, string $email): ?array {
    $stmt = $pdo->prepare("SELECT * FROM dados_recebimento WHERE email = ?");
    $stmt->execute([strtolower($email)]);
    $l = $stmt->fetch();
    return $l ?: null;
}

// ─── Repasses ────────────────────────────────────────────────────────────────

// Fecha um repasse para cada pessoa com saldo disponível ≥ mínimo e conta de
// recebimento cadastrada. Devolve [criados, pendencias].
function gerar_repasses(PDO $pdo): array {
    atualizar_liberacoes($pdo);
    $regras = regras_comissao($pdo);
    $saldos = $pdo->query(
        "SELECT beneficiario, SUM(valor) AS total, COUNT(*) AS qtd FROM comissoes
          WHERE status = 'disponivel' AND repasseId IS NULL
          GROUP BY beneficiario"
    )->fetchAll();

    $criados = [];
    $pendencias = [];
    foreach ($saldos as $s) {
        $quem = (string) $s["beneficiario"];
        $total = centavos((float) $s["total"]);
        if ($total < max(0.01, $regras["valor_minimo"])) continue;
        $dados = dados_recebimento_de($pdo, $quem);
        if (!$dados) {
            $pendencias[] = ["beneficiario" => $quem, "valor" => $total, "motivo" => "Ainda não cadastrou a conta para receber."];
            continue;
        }
        try {
            $pdo->beginTransaction();
            $metodo = metodo_de_repasse($dados);
            $destino = json_encode([
                "titular" => $dados["titular"], "cpf" => $dados["cpf"], "banco" => $dados["banco"],
                "agencia" => $dados["agencia"], "conta" => $dados["conta"], "contaDigito" => $dados["contaDigito"],
                "tipoConta" => $dados["tipoConta"], "tipoChavePix" => $dados["tipoChavePix"], "chavePix" => $dados["chavePix"],
            ], JSON_UNESCAPED_UNICODE);
            $pdo->prepare(
                "INSERT INTO repasses (beneficiario, valor, qtdComissoes, metodo, destino, status, criadoEm)
                 VALUES (?, 0, 0, ?, ?, 'pendente', ?)"
            )->execute([$quem, $metodo, $destino, agora_brasil()]);
            $idRepasse = (int) $pdo->lastInsertId();
            $pdo->prepare(
                "UPDATE comissoes SET status = 'em_repasse', repasseId = ?, atualizadoEm = ?
                  WHERE beneficiario = ? AND status = 'disponivel' AND repasseId IS NULL"
            )->execute([$idRepasse, agora_brasil(), $quem]);
            // O valor é o que REALMENTE entrou no repasse (e não o somado
            // antes): uma comissão cancelada no meio do caminho não passa.
            $stmt = $pdo->prepare("SELECT COALESCE(SUM(valor),0), COUNT(*) FROM comissoes WHERE repasseId = ?");
            $stmt->execute([$idRepasse]);
            [$valorReal, $qtdReal] = $stmt->fetch(PDO::FETCH_NUM);
            $valorReal = centavos((float) $valorReal);
            if ($valorReal <= 0) {
                $pdo->rollBack();
                continue;
            }
            $pdo->prepare("UPDATE repasses SET valor = ?, qtdComissoes = ? WHERE id = ?")
                ->execute([$valorReal, (int) $qtdReal, $idRepasse]);
            $pdo->commit();
            $criados[] = ["id" => $idRepasse, "beneficiario" => $quem, "valor" => $valorReal, "metodo" => $metodo];
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log("gerar_repasses($quem): " . $e->getMessage());
        }
    }
    if ($criados) registrar_auditoria($pdo, "repasses_gerados", count($criados) . " repasse(s)");
    return [$criados, $pendencias];
}

function marcar_repasse_pago(PDO $pdo, int $id, string $quem, string $comprovante = ""): bool {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT status FROM repasses WHERE id = ? FOR UPDATE");
        $stmt->execute([$id]);
        $status = $stmt->fetchColumn();
        if (!in_array($status, ["pendente", "no_banco", "falhou"], true)) {
            $pdo->rollBack();
            return false;
        }
        $agora = agora_brasil();
        $pdo->prepare("UPDATE repasses SET status = 'pago', pagoEm = ?, pagoPor = ?, comprovante = ?, ocorrencia = NULL WHERE id = ?")
            ->execute([$agora, $quem, mb_substr($comprovante, 0, 120) ?: null, $id]);
        $pdo->prepare("UPDATE comissoes SET status = 'paga', atualizadoEm = ? WHERE repasseId = ?")->execute([$agora, $id]);
        $pdo->commit();
        registrar_auditoria($pdo, "repasse_pago", "#$id por $quem");
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// Cancela (Admin) ou registra falha (retorno do banco): as comissões voltam a
// ficar disponíveis e entram no próximo repasse.
function desfazer_repasse(PDO $pdo, int $id, string $novoStatus, string $motivo): bool {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT status FROM repasses WHERE id = ? FOR UPDATE");
        $stmt->execute([$id]);
        $status = $stmt->fetchColumn();
        if (!in_array($status, ["pendente", "no_banco"], true)) {
            $pdo->rollBack();
            return false;
        }
        $pdo->prepare("UPDATE repasses SET status = ?, ocorrencia = ? WHERE id = ?")
            ->execute([$novoStatus, mb_substr($motivo, 0, 80), $id]);
        $pdo->prepare("UPDATE comissoes SET status = 'disponivel', repasseId = NULL, atualizadoEm = ? WHERE repasseId = ?")
            ->execute([agora_brasil(), $id]);
        $pdo->commit();
        registrar_auditoria($pdo, "repasse_" . $novoStatus, "#$id — $motivo");
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
