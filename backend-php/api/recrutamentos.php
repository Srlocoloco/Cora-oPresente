<?php
// ─── Equipe do Master / MasterPlus ───────────────────────────────────────────
// POST /api/recrutamentos                 → { nome, email }   cadastra um vendedor na PRÓPRIA equipe
// POST /api/equipe/cargo                  → { email, cargo }  dá / tira cargo dentro da PRÓPRIA equipe
// POST /api/recrutamentos/{codigo}/ativar → o cliente ativa, no perfil dele, o código recebido
//
// Por que estas rotas existem: o painel do Master/MasterPlus gravava a equipe
// pela rota do Admin (PUT /api/dados/{colecao}). Ela exige token de ADMIN — e
// o Master está logado como cliente comum —, então cadastrar um vendedor
// respondia 401 e o painel mostrava "Sessão expirada. Faça login como Admin
// novamente." seguido de "Sem conexão com o servidor".
//
// E, se o token fosse aceito, seria pior: aquela rota REESCREVE a tabela
// inteira a partir da lista que o navegador tem na memória — e o Master só
// enxerga a própria fatia de recrutamentos/cargos (ver o recorte por quem
// pede, em dados.php). Gravar essa fatia apagaria a equipe de todos os outros
// Masters de uma vez. Cada rota daqui mexe SÓ na linha que a ação mudou.

require_once __DIR__ . "/lib.php";
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

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    json_out(["erro" => "Método não permitido."], 405);
}

// Sem ?acao (um .htaccess antigo ainda no servidor, por exemplo), a única rota
// que existia era a ativação — continua funcionando igual.
$acao = $_GET["acao"] ?? (isset($_GET["codigo"]) ? "ativar" : "");

// Cargo gravado para um e-mail (null = conta sem cargo nenhum)
function cargo_de(PDO $pdo, string $email): ?string {
    $stmt = $pdo->prepare("SELECT cargo FROM cargos WHERE LOWER(email) = ?");
    $stmt->execute([strtolower($email)]);
    $cargo = $stmt->fetchColumn();
    return $cargo === false ? null : (string) $cargo;
}

// Só Admin, Master e MasterPlus montam equipe. Devolve [e-mail, cargo] de quem
// está pedindo, ou bloqueia com 401/403.
function exigir_lider(PDO $pdo): array {
    $email = strtolower(email_autenticado($pdo));
    $cargo = $email === strtolower(EMAIL_ADMIN) ? "admin" : cargo_de($pdo, $email);
    if (!in_array($cargo, ["admin", "master", "masterplus"], true)) {
        json_out(["erro" => "Só um Master ou MasterPlus pode montar equipe."], 403);
    }
    return [$email, $cargo];
}

// Código de ativação do vendedor (ex.: CP-7K2M9X). Gerado no SERVIDOR: é aqui
// que dá para garantir que ele não repete um código já existente — o navegador
// só enxerga a própria equipe e sortearia às cegas.
function gerar_codigo_recrutamento(PDO $pdo): string {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I: não confunde ao ditar
    $stmt = $pdo->prepare("SELECT 1 FROM recrutamentos WHERE codigo = ?");
    for ($tentativa = 0; $tentativa < 25; $tentativa++) {
        $sorteio = "";
        for ($i = 0; $i < 6; $i++) $sorteio .= $chars[random_int(0, strlen($chars) - 1)];
        $codigo = "CP-$sorteio";
        $stmt->execute([$codigo]);
        if (!$stmt->fetchColumn()) return $codigo;
    }
    throw new RuntimeException("Não foi possível gerar um código único.");
}

function data_de_hoje(): string {
    return (new DateTime("now", new DateTimeZone("America/Sao_Paulo")))->format("d/m/Y");
}

// ─── Master/MasterPlus cadastra um vendedor ──────────────────────────────────
// Um cadastro só, e o servidor escolhe o caminho: quem JÁ tem conta na loja
// entra na equipe na hora, com o cargo dado (não faz sentido mandar um código
// de ativação para quem já está cadastrado); quem ainda não tem recebe o
// código para ativar quando criar a conta.
//
// Essa decisão é obrigatoriamente daqui: o painel do Master não enxerga a
// lista de clientes da loja (o /api/dados só entrega isso ao Admin — é dado
// pessoal de todo mundo), então ele não teria como saber quem já tem conta.
if ($acao === "criar") {
    limitar_taxa($pdo, "recrutamentos_criar", 30, 600);
    [$lider] = exigir_lider($pdo);

    $corpo = corpo_json();
    $nome = trim((string) ($corpo["nome"] ?? ""));
    $email = strtolower(trim((string) ($corpo["email"] ?? "")));

    if ($nome === "" || $email === "") json_out(["erro" => "Preencha o nome e o e-mail do vendedor."], 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(["erro" => "E-mail inválido."], 400);
    if ($email === strtolower(EMAIL_ADMIN)) json_out(["erro" => "Este e-mail é reservado."], 400);
    if ($email === $lider) json_out(["erro" => "Você não pode convidar a si mesmo."], 400);

    // Cada pessoa pertence a UMA equipe só — senão a comissão da venda teria
    // dois donos. A conferência é aqui no banco: o navegador do Master só vê a
    // própria equipe e não teria como saber da equipe dos outros.
    $stmt = $pdo->prepare("SELECT recrutador FROM recrutamentos WHERE LOWER(email) = ?");
    $stmt->execute([$email]);
    $recrutadorAtual = $stmt->fetchColumn();
    if ($recrutadorAtual !== false) {
        json_out(["erro" => strtolower((string) $recrutadorAtual) === $lider
            ? "Este e-mail já está cadastrado na sua equipe."
            : "Este e-mail já faz parte da equipe de outro Master."], 409);
    }

    // Já tem conta na loja? Então entra na equipe já ativado, com o cargo dado
    $stmt = $pdo->prepare("SELECT name FROM clientes WHERE LOWER(email) = ?");
    $stmt->execute([$email]);
    $jaEraCliente = $stmt->fetchColumn() !== false;

    // Master e MasterPlus não viram vendedor de ninguém — isso é do Admin
    $cargoAtual = cargo_de($pdo, $email);
    if (in_array($cargoAtual, ["master", "masterplus"], true)) {
        json_out(["erro" => "Esta conta já tem cargo de $cargoAtual na loja."], 409);
    }

    try {
        $pdo->beginTransaction();
        $codigo = gerar_codigo_recrutamento($pdo);
        $data = data_de_hoje();
        $pdo->prepare(
            "INSERT INTO recrutamentos (codigo, recrutador, nome, email, ativado, date) VALUES (?, ?, ?, ?, ?, ?)"
        )->execute([$codigo, $lider, $nome, $email, $jaEraCliente ? 1 : 0, $data]);
        if ($jaEraCliente) {
            $pdo->prepare(
                "INSERT INTO cargos (email, cargo) VALUES (?, 'vendedor') ON DUPLICATE KEY UPDATE cargo = 'vendedor'"
            )->execute([$email]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log("Falha ao cadastrar vendedor: " . $e->getMessage());
        json_out(["erro" => "Falha ao cadastrar o vendedor. Tente de novo."], 500);
    }

    json_out([
        "ok" => true,
        // O painel usa isto para dizer o que aconteceu: "já entrou na equipe"
        // ou "entregue este código para a pessoa ativar"
        "jaEraCliente" => $jaEraCliente,
        "recrutamento" => [
            "codigo" => $codigo,
            "recrutador" => $lider,
            "nome" => $nome,
            "email" => $email,
            "ativado" => $jaEraCliente,
            "date" => $data,
        ],
    ]);
}

// ─── Cargo de alguém da própria equipe ───────────────────────────────────────
// cargo = "vendedor" (dar cargo direto por e-mail) · "master" (MasterPlus
// promove um vendedor de destaque) · null (tirar o cargo)
if ($acao === "cargo") {
    limitar_taxa($pdo, "equipe_cargo", 60, 600);
    [$lider, $cargoLider] = exigir_lider($pdo);

    $corpo = corpo_json();
    $alvo = strtolower(trim((string) ($corpo["email"] ?? "")));
    $cargo = $corpo["cargo"] ?? null;
    if ($cargo === "") $cargo = null;

    if ($alvo === "") json_out(["erro" => "Informe o e-mail da conta."], 400);
    if ($alvo === strtolower(EMAIL_ADMIN)) json_out(["erro" => "Este e-mail é reservado."], 400);
    if ($alvo === $lider) json_out(["erro" => "Você não pode mudar o próprio cargo."], 400);
    if ($cargo !== null && !in_array($cargo, ["vendedor", "master"], true)) {
        json_out(["erro" => "Cargo inválido."], 400);
    }

    $stmt = $pdo->prepare("SELECT name FROM clientes WHERE LOWER(email) = ?");
    $stmt->execute([$alvo]);
    $nomeDoCliente = $stmt->fetchColumn();
    if ($nomeDoCliente === false) json_out(["erro" => "Este e-mail ainda não tem cadastro na loja."], 404);

    $stmt = $pdo->prepare("SELECT codigo, recrutador, ativado FROM recrutamentos WHERE LOWER(email) = ?");
    $stmt->execute([$alvo]);
    $vinculo = $stmt->fetch();
    $daMinhaEquipe = $vinculo && strtolower((string) $vinculo["recrutador"]) === $lider;
    // Preenchido quando o cargo por e-mail cria o vínculo na hora: volta na
    // resposta para o painel já mostrar a pessoa na lista da equipe, sem
    // precisar recarregar a página.
    $recrutamentoCriado = null;

    try {
        $pdo->beginTransaction();

        if ($cargo === "master") {
            // Promover a Master é coisa de MasterPlus (e do Admin), e só vale
            // para vendedor da própria equipe que já ativou o código
            if (!in_array($cargoLider, ["masterplus", "admin"], true)) {
                $pdo->rollBack();
                json_out(["erro" => "Só um MasterPlus pode promover um vendedor a Master."], 403);
            }
            if (!$daMinhaEquipe || (int) $vinculo["ativado"] !== 1) {
                $pdo->rollBack();
                json_out(["erro" => "Você só pode promover vendedores da sua equipe que já ativaram o código."], 403);
            }
            $pdo->prepare("INSERT INTO cargos (email, cargo) VALUES (?, 'master') ON DUPLICATE KEY UPDATE cargo = 'master'")
                ->execute([$alvo]);
            $pdo->prepare(
                "INSERT INTO vinculos_masterplus (master, masterplus) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE masterplus = VALUES(masterplus)"
            )->execute([$alvo, $lider]);
        } elseif ($cargo === "vendedor") {
            // Atalho "dar cargo por e-mail": quem ainda não tem vínculo entra
            // na equipe de quem deu o cargo, já ativado — sem isso a venda
            // dele não teria a quem creditar a comissão de equipe.
            if ($vinculo && !$daMinhaEquipe) {
                $pdo->rollBack();
                json_out(["erro" => "Esta conta já faz parte da equipe de outro Master."], 409);
            }
            $cargoAtual = cargo_de($pdo, $alvo);
            if (in_array($cargoAtual, ["master", "masterplus"], true) && $cargoLider !== "admin") {
                $pdo->rollBack();
                json_out(["erro" => "Esta conta tem cargo de $cargoAtual — só o Admin pode mudar."], 403);
            }
            if (!$vinculo) {
                $codigoNovo = gerar_codigo_recrutamento($pdo);
                $dataNova = data_de_hoje();
                $nome = trim((string) $nomeDoCliente) !== "" ? (string) $nomeDoCliente : $alvo;
                $pdo->prepare(
                    "INSERT INTO recrutamentos (codigo, recrutador, nome, email, ativado, date) VALUES (?, ?, ?, ?, 1, ?)"
                )->execute([$codigoNovo, $lider, $nome, $alvo, $dataNova]);
                $recrutamentoCriado = [
                    "codigo" => $codigoNovo,
                    "recrutador" => $lider,
                    "nome" => $nome,
                    "email" => $alvo,
                    "ativado" => true,
                    "date" => $dataNova,
                ];
            } elseif ((int) $vinculo["ativado"] !== 1) {
                $pdo->prepare("UPDATE recrutamentos SET ativado = 1 WHERE codigo = ?")->execute([$vinculo["codigo"]]);
            }
            $pdo->prepare("INSERT INTO cargos (email, cargo) VALUES (?, 'vendedor') ON DUPLICATE KEY UPDATE cargo = 'vendedor'")
                ->execute([$alvo]);
        } else {
            if (!$daMinhaEquipe) {
                $pdo->rollBack();
                json_out(["erro" => "Você só pode mudar o cargo de quem está na sua equipe."], 403);
            }
            $pdo->prepare("DELETE FROM cargos WHERE LOWER(email) = ?")->execute([$alvo]);
            // Master que perdeu o cargo deixa de ser Master DESTE MasterPlus
            $pdo->prepare("DELETE FROM vinculos_masterplus WHERE LOWER(master) = ? AND LOWER(masterplus) = ?")
                ->execute([$alvo, $lider]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log("Falha ao mudar cargo da equipe: " . $e->getMessage());
        json_out(["erro" => "Falha ao salvar o cargo. Tente de novo."], 500);
    }

    json_out($recrutamentoCriado === null
        ? ["ok" => true]
        : ["ok" => true, "recrutamento" => $recrutamentoCriado]);
}

// ─── Admin: cargo de qualquer conta (uma por vez) ────────────────────────────
// POST /api/admin/cargo { email, cargo: "masterplus" | "entregador" | "vendedor" | null }
//
// Antes o painel do Admin mandava a tabela de cargos INTEIRA (e a de vínculos
// Master ⇄ MasterPlus), montada a partir do que ele tinha na memória: um
// cargo dado por um Master no mesmo intervalo sumia na gravação seguinte.
// Aqui muda só a conta pedida — e a regra "Master sem MasterPlus não existe"
// é aplicada no servidor, na mesma transação.
if ($acao === "cargo-admin") {
    exigir_admin($pdo);
    limitar_taxa($pdo, "admin_cargo", 60, 600);
    $corpo = corpo_json();
    $alvo = strtolower(trim((string) ($corpo["email"] ?? "")));
    $cargo = $corpo["cargo"] ?? null;
    if ($cargo === "") $cargo = null;
    if ($alvo === "" || !filter_var($alvo, FILTER_VALIDATE_EMAIL)) json_out(["erro" => "Informe um e-mail válido."], 400);
    if ($alvo === strtolower(EMAIL_ADMIN)) json_out(["erro" => "A conta do Admin não recebe cargo."], 400);
    if ($cargo !== null && !in_array($cargo, ["masterplus", "entregador", "vendedor"], true)) {
        json_out(["erro" => "Cargo inválido. (Master é promovido pelo MasterPlus, na página Promover a Master.)"], 400);
    }
    $stmt = $pdo->prepare("SELECT name FROM clientes WHERE LOWER(email) = ?");
    $stmt->execute([$alvo]);
    if ($stmt->fetchColumn() === false) json_out(["erro" => "Este e-mail ainda não tem cadastro na loja. Peça para a pessoa criar a conta primeiro."], 404);

    try {
        $pdo->beginTransaction();
        $cargoAntes = cargo_de($pdo, $alvo);
        if ($cargo === null) {
            $pdo->prepare("DELETE FROM cargos WHERE LOWER(email) = ?")->execute([$alvo]);
        } else {
            $pdo->prepare("INSERT INTO cargos (email, cargo) VALUES (?, ?) ON DUPLICATE KEY UPDATE cargo = VALUES(cargo)")
                ->execute([$alvo, $cargo]);
        }
        // Deixou de ser Master: sai do vínculo com o MasterPlus
        if ($cargoAntes === "master" && $cargo !== "master") {
            $pdo->prepare("DELETE FROM vinculos_masterplus WHERE LOWER(master) = ?")->execute([$alvo]);
        }
        // Deixou de ser MasterPlus: os Masters que ele promoveu perdem o cargo
        // junto (não existe Master sem um MasterPlus responsável)
        $mastersRemovidos = [];
        if ($cargoAntes === "masterplus" && $cargo !== "masterplus") {
            $stmt = $pdo->prepare("SELECT LOWER(master) FROM vinculos_masterplus WHERE LOWER(masterplus) = ?");
            $stmt->execute([$alvo]);
            $mastersRemovidos = $stmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($mastersRemovidos as $m) {
                $pdo->prepare("DELETE FROM cargos WHERE LOWER(email) = ? AND cargo = 'master'")->execute([$m]);
            }
            $pdo->prepare("DELETE FROM vinculos_masterplus WHERE LOWER(masterplus) = ?")->execute([$alvo]);
        }
        $pdo->commit();
        registrar_auditoria($pdo, "cargo_admin", "$alvo: " . ($cargoAntes ?? "sem cargo") . " → " . ($cargo ?? "sem cargo")
            . ($mastersRemovidos ? " (Masters removidos: " . implode(", ", $mastersRemovidos) . ")" : ""));
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log("cargo-admin: " . $e->getMessage());
        json_out(["erro" => "Falha ao salvar o cargo. Tente de novo."], 500);
    }

    // Devolve o estado atual das duas tabelas, para a tela se alinhar ao banco
    $cargos = [];
    foreach ($pdo->query("SELECT LOWER(email) AS email, cargo FROM cargos")->fetchAll() as $l) $cargos[$l["email"]] = $l["cargo"];
    $vinculos = [];
    foreach ($pdo->query("SELECT LOWER(master) AS master, LOWER(masterplus) AS masterplus FROM vinculos_masterplus")->fetchAll() as $l) {
        $vinculos[$l["master"]] = $l["masterplus"];
    }
    json_out(["ok" => true, "cargos" => (object) $cargos, "vinculosMasterPlus" => (object) $vinculos]);
}

// ─── Cliente ativa, no próprio perfil, o código de vendedor recebido ─────────
// Marca o vínculo como ativado e dá o cargo de vendedor, numa transação só,
// sem reescrever as tabelas inteiras de recrutamentos/cargos.
if ($acao === "ativar") {
    // No máximo 10 tentativas de ativação por IP a cada 5 minutos — evita
    // força bruta tentando adivinhar códigos de vendedor
    limitar_taxa($pdo, "recrutamentos_ativar", 10, 300);

    $codigo = $_GET["codigo"] ?? "";
    if ($codigo === "") json_out(["erro" => "Código ausente."], 400);

    // Usa o e-mail da sessão autenticada, nunca o que vem no corpo — impede que
    // alguém ative um código de vendedor "em nome" de outra conta
    $email = strtolower(email_autenticado($pdo));

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("SELECT * FROM recrutamentos WHERE codigo = ? AND email = ? FOR UPDATE");
        $stmt->execute([$codigo, $email]);
        $vinculo = $stmt->fetch();

        if (!$vinculo) {
            $pdo->rollBack();
            json_out(["erro" => "Código inválido para esta conta."], 404);
        }
        if ((int) $vinculo["ativado"] === 1) {
            $pdo->rollBack();
            json_out(["erro" => "Este código já foi ativado."], 409);
        }

        $pdo->prepare("UPDATE recrutamentos SET ativado = 1 WHERE codigo = ?")->execute([$codigo]);
        $pdo->prepare(
            "INSERT INTO cargos (email, cargo) VALUES (?, 'vendedor') ON DUPLICATE KEY UPDATE cargo = 'vendedor'"
        )->execute([$email]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_out(["erro" => "Falha ao ativar o código."], 500);
    }

    json_out(["ok" => true]);
}

json_out(["erro" => "Ação desconhecida."], 400);
