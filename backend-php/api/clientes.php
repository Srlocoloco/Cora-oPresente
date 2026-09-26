<?php
// ─── Conta do cliente: cadastro, login, senha, verificação de e-mail ─────────
// POST /api/clientes/cadastro          { name, email, senha }  → { token }
// POST /api/clientes/login             { email, senha }        → { token }
// POST /api/clientes/login-google      { idToken }             → { token }
// POST /api/clientes/logout            (Authorization: Bearer <token>)
// GET  /api/clientes/verificar-email   ?token=...
// POST /api/clientes/esqueci-senha     { email }
// POST /api/clientes/redefinir-senha   { token, novaSenha }
//
// A senha do cliente nunca fica no código do site — só o hash (SALT+SHA-256)
// fica no banco, igual ao login do Admin. O login com Google é conferido de
// verdade com a própria Google (verificar_id_token_google em lib.php), não
// confia só no que o navegador manda.

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

$acao = $_GET["acao"] ?? "";
$metodo = $_SERVER["REQUEST_METHOD"];

// ── Verificação de e-mail (link clicado no e-mail) ──────────────────────────
if ($acao === "verificar-email") {
    if ($metodo !== "GET") json_out(["erro" => "Método não permitido."], 405);
    // O link de confirmação carrega um token secreto. Sem limite, dá para
    // ficar chutando token até acertar o de alguém.
    limitar_taxa($pdo, "verificar_email", 30, 600);
    $token = $_GET["token"] ?? "";
    if ($token === "") json_out(["erro" => "Token ausente."], 400);

    $stmt = $pdo->prepare("SELECT email FROM clientes_verificacao WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    $linha = $stmt->fetch();
    if (!$linha) json_out(["erro" => "Link inválido ou expirado."], 400);

    $pdo->prepare("UPDATE clientes SET email_verificado = 1 WHERE email = ?")->execute([$linha["email"]]);
    $pdo->prepare("DELETE FROM clientes_verificacao WHERE token = ?")->execute([$token]);
    json_out(["ok" => true]);
}

if ($metodo !== "POST") {
    json_out(["erro" => "Método não permitido."], 405);
}

$corpo = corpo_json();

// ── Cadastro ───────────────────────────────────────────────────────────────
if ($acao === "cadastro") {
    limitar_taxa($pdo, "clientes_cadastro", 20, 300);

    $name = trim((string) ($corpo["name"] ?? ""));
    $email = strtolower(trim((string) ($corpo["email"] ?? "")));
    $senha = (string) ($corpo["senha"] ?? "");

    if ($name === "" || $email === "" || $senha === "") {
        json_out(["erro" => "Preencha nome, e-mail e senha."], 400);
    }
    $erroSenha = validar_senha_forte($senha);
    if ($erroSenha) json_out(["erro" => $erroSenha], 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(["erro" => "E-mail inválido."], 400);
    }

    $stmt = $pdo->prepare("SELECT email FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        json_out(["erro" => "Este e-mail já tem uma conta. Use a opção Entrar."], 409);
    }

    [$salt, $hash] = hash_senha_cliente($senha);
    $since = date("M/Y");
    $criadoEm = date("Y-m-d");

    $pdo->prepare(
        "INSERT INTO clientes (email, name, since, criadoEm, senha_hash, senha_salt, viaGoogle, email_verificado)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)"
    )->execute([$email, $name, $since, $criadoEm, $hash, $salt]);

    $tokenVerificacao = criar_token_verificacao($pdo, $email);
    enviar_email_verificacao($email, $name, $tokenVerificacao);

    $token = criar_sessao_cliente($pdo, $email);
    json_out(["ok" => true, "token" => $token, "cliente" => ["name" => $name, "email" => $email]]);
}

// ── Login com senha ───────────────────────────────────────────────────────
// Duas etapas, igual ao Admin: senha certa não entra direto — dispara um
// código de 6 dígitos por e-mail (ver "verificar-2fa" abaixo), e só com ele
// a sessão é criada.
if ($acao === "login") {
    // Força bruta de senha: esta rota NÃO tinha limite nenhum — um robô
    // podia testar milhares de senhas por minuto contra cada e-mail de
    // cliente. 10 tentativas a cada 5 minutos por IP, e quem insiste entra
    // no bloqueio progressivo (ver registrar_falta em lib.php).
    limitar_taxa($pdo, "clientes_login", 10, 300);
    $email = strtolower(trim((string) ($corpo["email"] ?? "")));
    $senha = (string) ($corpo["senha"] ?? "");
    if ($email === "" || $senha === "") json_out(["erro" => "Informe e-mail e senha."], 400);

    $stmt = $pdo->prepare("SELECT * FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    $cliente = $stmt->fetch();

    if (!$cliente || (bool) $cliente["viaGoogle"] && !$cliente["senha_hash"]) {
        // Não revela se o e-mail existe ou não (evita enumeração de contas)
        verificar_login_cliente($pdo, $email, $senha, null, null);
        json_out(["erro" => "E-mail ou senha incorretos."], 401);
    }

    if (!verificar_login_cliente($pdo, $email, $senha, $cliente["senha_salt"], $cliente["senha_hash"])) {
        json_out(["erro" => "E-mail ou senha incorretos."], 401);
    }

    // Senha certa + hash no formato antigo (SHA-256): troca agora pelo bcrypt.
    // É o único momento em que a senha original está em mãos — assim cada
    // conta migra sozinha, sem ninguém precisar redefinir a senha.
    if (senha_precisa_novo_hash($cliente["senha_hash"])) {
        [$saltNovo, $hashNovo] = hash_senha_cliente($senha);
        $pdo->prepare("UPDATE clientes SET senha_hash = ?, senha_salt = ? WHERE email = ?")
            ->execute([$hashNovo, $saltNovo, $email]);
    }

    $codigo = criar_codigo_2fa_cliente($pdo, $email);
    enviar_email_2fa_cliente($email, (string) $cliente["name"], $codigo);
    json_out(["ok" => true, "precisa2fa" => true]);
}

// ── Etapa 2: confere o código de 6 dígitos e só aí cria a sessão ───────────
if ($acao === "verificar-2fa") {
    limitar_taxa($pdo, "clientes_2fa", 10, 300);
    $email = strtolower(trim((string) ($corpo["email"] ?? "")));
    $codigo = trim((string) ($corpo["codigo"] ?? ""));
    if ($email === "" || $codigo === "") json_out(["erro" => "Informe o código."], 400);

    if (!verificar_codigo_2fa_cliente($pdo, $email, $codigo)) {
        json_out(["erro" => "Código incorreto ou expirado."], 401);
    }

    $stmt = $pdo->prepare("SELECT name FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    $cliente = $stmt->fetch();
    if (!$cliente) json_out(["erro" => "Conta não encontrada."], 404);

    $token = criar_sessao_cliente($pdo, $email);
    json_out(["ok" => true, "token" => $token, "cliente" => ["name" => $cliente["name"], "email" => $email]]);
}

// ── Login com Google (id_token conferido com a própria Google) ─────────────
if ($acao === "login-google") {
    // Cada tentativa aqui vira uma chamada ao Google para conferir o token.
    // Sem limite, é um jeito de fazer o servidor da loja trabalhar de graça.
    limitar_taxa($pdo, "clientes_login_google", 20, 300);
    $idToken = (string) ($corpo["idToken"] ?? "");
    if ($idToken === "") json_out(["erro" => "Token do Google ausente."], 400);

    $dados = verificar_id_token_google($idToken, GOOGLE_CLIENT_ID);
    if (!$dados) json_out(["erro" => "Não foi possível confirmar o login do Google."], 401);

    $email = strtolower($dados["email"]);
    $name = $dados["name"] ?? explode("@", $email)[0];

    // E-mail reservado do Admin: login com Google entra direto no painel,
    // com o token de Admin de verdade (o mesmo tipo que o login por senha +
    // 2FA cria) — sem isso, a sessão do Google nunca conseguia gravar nada
    // (produtos, banners, config...), porque essas rotas exigem
    // especificamente um token de admin_sessoes, não de clientes_sessoes.
    // A Google já confirmou de verdade que é dono desse e-mail (verificamos
    // acima com verificar_id_token_google), então não precisa do código por
    // e-mail de novo aqui.
    if ($email === strtolower(EMAIL_ADMIN)) {
        $token = criar_sessao_admin($pdo);
        registrar_auditoria($pdo, "login_admin_via_google");
        json_out(["ok" => true, "token" => $token, "admin" => true, "cliente" => ["name" => $name, "email" => $email]]);
    }

    $stmt = $pdo->prepare("SELECT * FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    $cliente = $stmt->fetch();

    if (!$cliente) {
        // Login com Google já confirma o e-mail de verdade — não precisa
        // mandar e-mail de verificação de novo
        $pdo->prepare(
            "INSERT INTO clientes (email, name, since, criadoEm, viaGoogle, email_verificado) VALUES (?, ?, ?, ?, 1, 1)"
        )->execute([$email, $name, date("M/Y"), date("Y-m-d")]);
    } elseif (!$cliente["viaGoogle"] || !$cliente["email_verificado"]) {
        $pdo->prepare("UPDATE clientes SET viaGoogle = 1, email_verificado = 1 WHERE email = ?")->execute([$email]);
    }

    $token = criar_sessao_cliente($pdo, $email);
    json_out(["ok" => true, "token" => $token, "cliente" => ["name" => $cliente["name"] ?? $name, "email" => $email]]);
}

// ── Logout ──────────────────────────────────────────────────────────────────
if ($acao === "logout") {
    $token = token_do_cabecalho();
    if ($token !== "") {
        $pdo->prepare("DELETE FROM clientes_sessoes WHERE token = ?")->execute([$token]);
    }
    json_out(["ok" => true]);
}

// ── Reenviar e-mail de verificação (cliente logado) ─────────────────────────
if ($acao === "reenviar-verificacao") {
    limitar_taxa($pdo, "reenviar_verificacao", 5, 300);
    $email = strtolower(email_autenticado($pdo));
    $stmt = $pdo->prepare("SELECT name, email_verificado FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    $cliente = $stmt->fetch();
    if ($cliente && !$cliente["email_verificado"]) {
        $token = criar_token_verificacao($pdo, $email);
        enviar_email_verificacao($email, $cliente["name"], $token);
    }
    json_out(["ok" => true]);
}

// ── Esqueci minha senha ──────────────────────────────────────────────────────
if ($acao === "esqueci-senha") {
    limitar_taxa($pdo, "esqueci_senha", 5, 300);
    $email = strtolower(trim((string) ($corpo["email"] ?? "")));
    if ($email === "") json_out(["erro" => "Informe o e-mail."], 400);

    // Sempre responde a mesma coisa, exista a conta ou não (evita que dê
    // pra descobrir quais e-mails têm conta no site)
    $stmt = $pdo->prepare("SELECT email FROM clientes WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        $token = criar_token_reset_senha($pdo, $email);
        enviar_email_reset_senha($email, $token);
    }
    json_out(["ok" => true]);
}

// ── Redefinir senha (a partir do link do e-mail) ────────────────────────────
if ($acao === "redefinir-senha") {
    // Mesma ideia do verificar-email: o token do link é o que autoriza
    // trocar a senha de uma conta. Chutar token tem que custar caro.
    limitar_taxa($pdo, "redefinir_senha", 20, 600);
    $token = (string) ($corpo["token"] ?? "");
    $novaSenha = (string) ($corpo["novaSenha"] ?? "");
    if ($token === "" || $novaSenha === "") json_out(["erro" => "Dados incompletos."], 400);
    $erroSenha = validar_senha_forte($novaSenha);
    if ($erroSenha) json_out(["erro" => $erroSenha], 400);

    $stmt = $pdo->prepare("SELECT email FROM clientes_reset_senha WHERE token = ? AND expira_em > NOW()");
    $stmt->execute([$token]);
    $linha = $stmt->fetch();
    if (!$linha) json_out(["erro" => "Link inválido ou expirado. Peça a redefinição de novo."], 400);

    [$salt, $hash] = hash_senha_cliente($novaSenha);
    $pdo->prepare("UPDATE clientes SET senha_hash = ?, senha_salt = ? WHERE email = ?")
        ->execute([$hash, $salt, $linha["email"]]);
    $pdo->prepare("DELETE FROM clientes_reset_senha WHERE token = ?")->execute([$token]);
    // Derruba todas as sessões antigas — se alguém mais tinha acesso à conta
    // (ex.: a senha vazou), esse acesso é cortado na hora
    $pdo->prepare("DELETE FROM clientes_sessoes WHERE email = ?")->execute([$linha["email"]]);

    json_out(["ok" => true]);
}

json_out(["erro" => "Ação desconhecida."], 400);
