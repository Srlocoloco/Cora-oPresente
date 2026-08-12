<?php
// ─── Login do Admin (senha + código por e-mail em duas etapas) ──────────────
// POST /api/admin/login          { senha }  → { precisa2fa: true } (envia o código por e-mail)
// POST /api/admin/verificar-2fa  { codigo } → { token }
// POST /api/admin/logout                    → apaga o token (com Authorization: Bearer)

require_once __DIR__ . "/lib.php";
cors();

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível — confira os dados em config.php."], 503);
}

$acao = $_GET["acao"] ?? "";

// Consulta do log de auditoria (login e ações que alteram a loja) — só o
// próprio Admin, já logado, pode ver
if ($acao === "auditoria" && $_SERVER["REQUEST_METHOD"] === "GET") {
    exigir_admin($pdo);
    $linhas = $pdo->query("SELECT * FROM admin_auditoria ORDER BY id DESC LIMIT 200")->fetchAll();
    json_out($linhas);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    json_out(["erro" => "Método não permitido."], 405);
}

// Etapa 1: confere a senha e manda o código de 6 dígitos por e-mail — ainda
// não cria sessão nenhuma
if ($acao === "login") {
    $corpo = corpo_json();
    $senha = (string) ($corpo["senha"] ?? "");
    if ($senha === "") json_out(["erro" => "Informe a senha."], 400);

    if (!verificar_senha_admin($pdo, $senha)) {
        registrar_auditoria($pdo, "login_admin_falhou");
        json_out(["erro" => "Senha incorreta."], 401);
    }

    $codigo = criar_codigo_2fa_admin($pdo);
    enviar_email_2fa_admin($codigo);
    registrar_auditoria($pdo, "login_admin_senha_ok_aguardando_2fa");
    json_out(["ok" => true, "precisa2fa" => true]);
}

// Etapa 2: confere o código recebido por e-mail e só aí cria a sessão
if ($acao === "verificar-2fa") {
    limitar_taxa($pdo, "admin_2fa", 10, 300);
    $corpo = corpo_json();
    $codigo = trim((string) ($corpo["codigo"] ?? ""));
    if ($codigo === "") json_out(["erro" => "Informe o código."], 400);

    if (!verificar_codigo_2fa_admin($pdo, $codigo)) {
        registrar_auditoria($pdo, "login_admin_2fa_falhou");
        json_out(["erro" => "Código incorreto ou expirado."], 401);
    }

    registrar_auditoria($pdo, "login_admin");
    $token = criar_sessao_admin($pdo);
    json_out(["ok" => true, "token" => $token]);
}

if ($acao === "logout") {
    $cabecalho = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
    if (preg_match('/^Bearer\s+(.+)$/i', $cabecalho, $m)) {
        $pdo->prepare("DELETE FROM admin_sessoes WHERE token = ?")->execute([trim($m[1])]);
    }
    json_out(["ok" => true]);
}

json_out(["erro" => "Ação desconhecida."], 400);
