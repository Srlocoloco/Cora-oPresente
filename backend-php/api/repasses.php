<?php
// ─── Ganhos e repasses dos associados ────────────────────────────────────────
//
// Associado (vendedor, Master, MasterPlus):
//   GET  /api/recebimento            → a conta onde ele recebe
//   PUT  /api/recebimento            → cadastra/atualiza essa conta
//   GET  /api/ganhos                 → saldo (a liberar, disponível, recebido),
//                                      comissões venda a venda e repasses
// Admin:
//   GET  /api/repasses               → repasses, saldos de todos, pendências
//   POST /api/repasses/gerar         → fecha um repasse para cada pessoa com saldo liberado
//   POST /api/repasses/remessa       → { dataPagamento } gera o arquivo CNAB 240 do Sicredi
//   GET  /api/repasses/remessa/{id}  → baixa o arquivo gerado
//   POST /api/repasses/retorno       → { conteudo } lê o arquivo de retorno do banco
//   POST /api/repasses/{id}/pagar    → { comprovante } marca como pago (pagou por fora)
//   POST /api/repasses/{id}/cancelar → desfaz; as comissões voltam para o saldo
// Agendador de tarefas (cron da hospedagem):
//   GET  /api/repasses/automatico/{segredo}

require_once __DIR__ . "/lib_compras.php";
require_once __DIR__ . "/lib_cnab240.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}

$acao = (string) ($_GET["acao"] ?? "");
$metodo = $_SERVER["REQUEST_METHOD"];
$id = (int) ($_GET["id"] ?? 0);

// ── Agendador (sem login; protegido pelo segredo no endereço) ────────────────
if ($acao === "automatico") {
    if (REPASSE_SEGREDO_CRON === "" || !hash_equals(REPASSE_SEGREDO_CRON, (string) ($_GET["segredo"] ?? ""))) {
        http_response_code(404);
        exit;
    }
    expirar_compras_vencidas($pdo, 100);
    atualizar_liberacoes($pdo);
    $criados = [];
    if ((int) (config_loja($pdo)["repasseAutomatico"] ?? 0) === 1) {
        [$criados] = gerar_repasses($pdo);
    }
    registrar_auditoria($pdo, "repasses_automatico", count($criados) . " repasse(s) fechado(s)");
    json_out(["ok" => true, "repassesCriados" => count($criados)]);
}

proteger_rota($pdo);
$quem = autenticacao_opcional($pdo);
if ($quem["papel"] === "anonimo") json_out(["erro" => "Faça login para continuar."], 401);
$email = strtolower((string) $quem["email"]);
$ehAdmin = $quem["papel"] === "admin";

function exigir_associado(PDO $pdo, string $email): string {
    $cargo = cargo_da_conta($pdo, $email);
    if (!in_array($cargo, ["vendedor", "master", "masterplus"], true)) {
        json_out(["erro" => "Só vendedores, Masters e MasterPlus recebem comissão."], 403);
    }
    return $cargo;
}

function dados_recebimento_para_tela(?array $d): ?array {
    if (!$d) return null;
    return [
        "titular" => $d["titular"], "cpf" => $d["cpf"], "banco" => $d["banco"],
        "bancoNome" => BANCOS_CONHECIDOS[$d["banco"]] ?? null,
        "agencia" => $d["agencia"], "conta" => $d["conta"], "contaDigito" => $d["contaDigito"],
        "tipoConta" => $d["tipoConta"], "tipoChavePix" => $d["tipoChavePix"], "chavePix" => $d["chavePix"],
        "metodo" => metodo_de_repasse($d), "atualizadoEm" => $d["atualizadoEm"],
    ];
}

function repasse_para_tela(array $r, bool $completo): array {
    $destino = json_decode((string) $r["destino"], true) ?: [];
    $saida = [
        "id" => (int) $r["id"], "beneficiario" => $r["beneficiario"], "nome" => $r["nome"] ?? null,
        "valor" => (float) $r["valor"], "qtdComissoes" => (int) $r["qtdComissoes"], "metodo" => $r["metodo"],
        "status" => $r["status"], "ocorrencia" => $r["ocorrencia"], "comprovante" => $r["comprovante"],
        "remessaId" => $r["remessaId"] !== null ? (int) $r["remessaId"] : null,
        "criadoEm" => $r["criadoEm"], "pagoEm" => $r["pagoEm"],
        // O associado vê para onde foi, sem o documento inteiro
        "destinoResumo" => trim((BANCOS_CONHECIDOS[$destino["banco"] ?? ""] ?? ("Banco " . ($destino["banco"] ?? "")))
            . " · " . (($destino["tipoConta"] ?? "") === "salario" ? "conta salário" : (($destino["chavePix"] ?? null) ? "PIX " . mascarar((string) $destino["chavePix"], 4) : "conta " . mascarar((string) ($destino["conta"] ?? ""), 3)))),
    ];
    if ($completo) $saida["destino"] = $destino;
    return $saida;
}

try {
    // ── Conta para receber (o próprio associado) ─────────────────────────────
    if ($acao === "recebimento") {
        exigir_associado($pdo, $email);
        if ($metodo === "GET") {
            json_out(["dados" => dados_recebimento_para_tela(dados_recebimento_de($pdo, $email)), "bancos" => BANCOS_CONHECIDOS]);
        }
        if ($metodo === "PUT" || $metodo === "POST") {
            limitar_taxa($pdo, "recebimento_salvar", 20, 600);
            try {
                $d = validar_dados_recebimento(corpo_json());
            } catch (InvalidArgumentException $e) {
                json_out(["erro" => $e->getMessage()], 400);
            }
            $pdo->prepare(
                "INSERT INTO dados_recebimento (email, titular, cpf, banco, agencia, conta, contaDigito, tipoConta, tipoChavePix, chavePix, atualizadoEm)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE titular = VALUES(titular), cpf = VALUES(cpf), banco = VALUES(banco),
                    agencia = VALUES(agencia), conta = VALUES(conta), contaDigito = VALUES(contaDigito),
                    tipoConta = VALUES(tipoConta), tipoChavePix = VALUES(tipoChavePix), chavePix = VALUES(chavePix),
                    atualizadoEm = VALUES(atualizadoEm)"
            )->execute([
                $email, $d["titular"], $d["cpf"], $d["banco"], $d["agencia"], $d["conta"], $d["contaDigito"],
                $d["tipoConta"], $d["tipoChavePix"], $d["chavePix"], agora_brasil(),
            ]);
            // Troca de conta é o golpe clássico (sessão roubada muda a conta de
            // destino): fica registrado e a pessoa é avisada por e-mail.
            registrar_auditoria($pdo, "conta_recebimento_alterada", "$email → banco {$d["banco"]} " . mascarar($d["conta"], 3));
            enviar_email(
                $email,
                "Sua conta para receber comissões foi atualizada — Coração Presente",
                "<p>A conta onde você recebe as comissões da Coração Presente acabou de ser alterada.</p>"
                . "<p>Banco " . htmlspecialchars($d["banco"]) . " · conta terminada em " . htmlspecialchars(substr($d["conta"], -3)) . "</p>"
                . "<p>Se não foi você, entre na sua conta, troque a senha e fale com a loja imediatamente.</p>"
            );
            json_out(["ok" => true, "dados" => dados_recebimento_para_tela(dados_recebimento_de($pdo, $email))]);
        }
        json_out(["erro" => "Método não permitido."], 405);
    }

    // ── Meus ganhos ───────────────────────────────────────────────────────────
    if ($acao === "ganhos") {
        limitar_taxa($pdo, "ganhos_ler", 60, 300);
        $alvo = $email;
        if ($ehAdmin && !empty($_GET["email"])) $alvo = strtolower((string) $_GET["email"]);
        elseif (!$ehAdmin) exigir_associado($pdo, $email);
        $saldo = saldo_de($pdo, $alvo);
        $stmt = $pdo->prepare(
            "SELECT id, pedidoId, cargo, tipo, origem, descricao, base, percentual, valor, status, liberaEm, repasseId, criadoEm
               FROM comissoes WHERE beneficiario = ? ORDER BY id DESC LIMIT 300"
        );
        $stmt->execute([$alvo]);
        $comissoes = array_map(fn($c) => [
            "id" => (int) $c["id"], "pedidoId" => $c["pedidoId"], "tipo" => $c["tipo"], "origem" => $c["origem"],
            "descricao" => $c["descricao"], "base" => (float) $c["base"], "percentual" => (float) $c["percentual"],
            "valor" => (float) $c["valor"], "status" => $c["status"], "liberaEm" => $c["liberaEm"],
            "repasseId" => $c["repasseId"] !== null ? (int) $c["repasseId"] : null, "criadoEm" => $c["criadoEm"],
        ], $stmt->fetchAll());
        $stmt = $pdo->prepare("SELECT * FROM repasses WHERE beneficiario = ? ORDER BY id DESC LIMIT 60");
        $stmt->execute([$alvo]);
        $repasses = array_map(fn($r) => repasse_para_tela($r, false), $stmt->fetchAll());
        $regras = regras_comissao($pdo);
        $dados = dados_recebimento_de($pdo, $alvo);
        json_out([
            "saldo" => $saldo,
            "comissoes" => $comissoes,
            "repasses" => $repasses,
            "temContaCadastrada" => $dados !== null,
            "diasLiberacao" => $regras["dias_liberacao"],
            "valorMinimo" => $regras["valor_minimo"],
        ]);
    }

    // Daqui para baixo, só o Admin.
    if (!$ehAdmin) json_out(["erro" => "Só o Admin mexe nos repasses."], 403);
    limitar_taxa($pdo, "repasses_admin", 120, 300);

    // ── Painel de repasses ───────────────────────────────────────────────────
    if ($acao === "" && $metodo === "GET") {
        atualizar_liberacoes($pdo);
        $repasses = $pdo->query(
            "SELECT r.*, c.name AS nome FROM repasses r LEFT JOIN clientes c ON LOWER(c.email) = r.beneficiario
              ORDER BY FIELD(r.status, 'pendente', 'falhou', 'no_banco', 'pago', 'cancelado'), r.id DESC LIMIT 300"
        )->fetchAll();
        $saldos = $pdo->query(
            "SELECT s.beneficiario, c.name AS nome, g.cargo,
                    SUM(CASE WHEN s.status = 'disponivel' AND s.repasseId IS NULL THEN s.valor ELSE 0 END) AS disponivel,
                    SUM(CASE WHEN s.status = 'a_liberar' THEN s.valor ELSE 0 END) AS aLiberar,
                    SUM(CASE WHEN s.status = 'aguardando_entrega' THEN s.valor ELSE 0 END) AS aguardandoEntrega,
                    SUM(CASE WHEN s.status = 'paga' THEN s.valor ELSE 0 END) AS recebido,
                    MAX(d.email IS NOT NULL) AS temConta
               FROM comissoes s
          LEFT JOIN clientes c ON LOWER(c.email) = s.beneficiario
          LEFT JOIN cargos g ON LOWER(g.email) = s.beneficiario
          LEFT JOIN dados_recebimento d ON d.email = s.beneficiario
              WHERE s.status <> 'cancelada'
           GROUP BY s.beneficiario, c.name, g.cargo
           ORDER BY disponivel DESC"
        )->fetchAll();
        $remessas = $pdo->query(
            "SELECT id, nomeArquivo, qtdPagamentos, total, dataPagamento, criadoEm FROM remessas ORDER BY id DESC LIMIT 30"
        )->fetchAll();
        $config = config_loja($pdo);
        $empresaCompleta = true;
        try { cnab_empresa($config); } catch (InvalidArgumentException $e) { $empresaCompleta = false; }
        $regras = regras_comissao($pdo);
        json_out([
            "repasses" => array_map(fn($r) => repasse_para_tela($r, true), $repasses),
            "saldos" => array_map(fn($s) => [
                "beneficiario" => $s["beneficiario"], "nome" => $s["nome"], "cargo" => $s["cargo"],
                "disponivel" => centavos((float) $s["disponivel"]), "aLiberar" => centavos((float) $s["aLiberar"]),
                "aguardandoEntrega" => centavos((float) $s["aguardandoEntrega"]), "recebido" => centavos((float) $s["recebido"]),
                "temConta" => (bool) (int) $s["temConta"],
            ], $saldos),
            "remessas" => array_map(fn($r) => [
                "id" => (int) $r["id"], "nomeArquivo" => $r["nomeArquivo"], "qtdPagamentos" => (int) $r["qtdPagamentos"],
                "total" => (float) $r["total"], "dataPagamento" => $r["dataPagamento"], "criadoEm" => $r["criadoEm"],
            ], $remessas),
            "empresaCompleta" => $empresaCompleta,
            "valorMinimo" => $regras["valor_minimo"],
            "diasLiberacao" => $regras["dias_liberacao"],
            "repasseAutomatico" => (int) ($config["repasseAutomatico"] ?? 0) === 1,
        ]);
    }

    if ($metodo !== "POST" && !($acao === "remessa" && $metodo === "GET")) json_out(["erro" => "Método não permitido."], 405);

    // ── Fechar repasses ──────────────────────────────────────────────────────
    if ($acao === "gerar") {
        [$criados, $pendencias] = gerar_repasses($pdo);
        json_out(["ok" => true, "criados" => $criados, "pendencias" => $pendencias]);
    }

    // ── Arquivo de remessa ───────────────────────────────────────────────────
    if ($acao === "remessa" && $metodo === "GET") {
        $stmt = $pdo->prepare("SELECT nomeArquivo, conteudo FROM remessas WHERE id = ?");
        $stmt->execute([$id]);
        $r = $stmt->fetch();
        if (!$r) json_out(["erro" => "Arquivo não encontrado."], 404);
        header("Content-Type: text/plain; charset=us-ascii");
        header("Content-Disposition: attachment; filename=\"" . preg_replace('/[^A-Za-z0-9._-]/', '', $r["nomeArquivo"]) . "\"");
        header("Cache-Control: no-store");
        echo $r["conteudo"];
        exit;
    }
    if ($acao === "remessa") {
        $corpo = corpo_json();
        $data = (string) ($corpo["dataPagamento"] ?? agora_brasil("Y-m-d"));
        $dataPagamento = DateTime::createFromFormat("Y-m-d", $data, new DateTimeZone("America/Sao_Paulo"));
        if (!$dataPagamento || $data < agora_brasil("Y-m-d")) json_out(["erro" => "Escolha uma data de pagamento de hoje em diante."], 400);
        $ids = array_values(array_filter(array_map("intval", (array) ($corpo["ids"] ?? []))));
        $sql = "SELECT * FROM repasses WHERE status = 'pendente'" . ($ids ? " AND id IN (" . implode(",", $ids) . ")" : "");
        $repasses = $pdo->query($sql . " ORDER BY id")->fetchAll();
        if (!$repasses) json_out(["erro" => "Nenhum repasse pendente para enviar ao banco. Clique em \"Fechar repasses\" primeiro."], 409);
        $config = config_loja($pdo);
        try {
            $sequencial = (int) $pdo->query("SELECT COALESCE(MAX(sequencial), 0) + 1 FROM remessas")->fetchColumn();
            [$conteudo, $qtd, $total] = cnab_gerar_remessa($config, $repasses, $dataPagamento, $sequencial);
        } catch (InvalidArgumentException $e) {
            json_out(["erro" => $e->getMessage()], 400);
        }
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM remessas WHERE DATE(criadoEm) = ?");
        $stmt->execute([agora_brasil("Y-m-d")]);
        $doDia = (int) $stmt->fetchColumn();
        $nome = cnab_nome_arquivo((string) $config["empresaConvenio"], new DateTime("now", new DateTimeZone("America/Sao_Paulo")), $doDia);
        $pdo->beginTransaction();
        $pdo->prepare(
            "INSERT INTO remessas (nomeArquivo, conteudo, qtdPagamentos, total, dataPagamento, sequencial, criadoEm, criadoPor)
             VALUES (?,?,?,?,?,?,?,?)"
        )->execute([$nome, $conteudo, $qtd, $total, $dataPagamento->format("Y-m-d"), $sequencial, agora_brasil(), $email]);
        $remessaId = (int) $pdo->lastInsertId();
        $idsIncluidos = array_map(fn($r) => (int) $r["id"], $repasses);
        $pdo->prepare("UPDATE repasses SET status = 'no_banco', remessaId = ? WHERE id IN (" . implode(",", $idsIncluidos) . ") AND status = 'pendente'")
            ->execute([$remessaId]);
        $pdo->commit();
        registrar_auditoria($pdo, "remessa_gerada", "$nome · $qtd pagamento(s) · R$ " . number_format($total, 2, ",", "."));
        json_out(["ok" => true, "remessa" => ["id" => $remessaId, "nomeArquivo" => $nome, "qtdPagamentos" => $qtd, "total" => $total]]);
    }

    // ── Arquivo de retorno do banco ──────────────────────────────────────────
    if ($acao === "retorno") {
        $conteudo = (string) (corpo_json()["conteudo"] ?? "");
        if (strlen($conteudo) < 240 || strlen($conteudo) > 5_000_000) json_out(["erro" => "Arquivo de retorno inválido."], 400);
        $lidos = cnab_ler_retorno($conteudo);
        if (!$lidos) json_out(["erro" => "Não encontrei pagamentos da loja neste arquivo. É o retorno (.RET) do Sicredi?"], 400);
        $resumo = ["pagos" => 0, "recusados" => 0, "agendados" => 0, "ignorados" => 0];
        foreach ($lidos as $seuNumero => $r) {
            if (!preg_match('/^REP(\d+)$/', $seuNumero, $m)) { $resumo["ignorados"]++; continue; }
            $idRepasse = (int) $m[1];
            if ($r["pago"]) {
                if (marcar_repasse_pago($pdo, $idRepasse, "retorno do banco", "Retorno Sicredi " . $r["codigos"])) $resumo["pagos"]++;
                else $resumo["ignorados"]++;
            } elseif ($r["agendado"]) {
                $pdo->prepare("UPDATE repasses SET ocorrencia = ? WHERE id = ? AND status = 'no_banco'")
                    ->execute(["Agendado pelo banco", $idRepasse]);
                $resumo["agendados"]++;
            } else {
                if (desfazer_repasse($pdo, $idRepasse, "falhou", cnab_motivo($r["codigos"]))) $resumo["recusados"]++;
                else $resumo["ignorados"]++;
            }
        }
        json_out(["ok" => true, "resumo" => $resumo]);
    }

    // ── Marcar pago / cancelar um repasse ────────────────────────────────────
    if ($acao === "pagar" && $id > 0) {
        $comprovante = mb_substr(trim((string) (corpo_json()["comprovante"] ?? "")), 0, 120);
        if (!marcar_repasse_pago($pdo, $id, $email, $comprovante)) json_out(["erro" => "Este repasse não pode ser marcado como pago."], 409);
        json_out(["ok" => true]);
    }
    if ($acao === "cancelar" && $id > 0) {
        if (!desfazer_repasse($pdo, $id, "cancelado", "Cancelado pelo Admin")) json_out(["erro" => "Este repasse não pode ser cancelado."], 409);
        json_out(["ok" => true]);
    }

    json_out(["erro" => "Ação desconhecida."], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log("repasses.php: " . $e->getMessage());
    json_out(["erro" => "Não foi possível concluir agora. Tente de novo."], 500);
}
