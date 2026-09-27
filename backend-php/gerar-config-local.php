<?php
// ─── Gerador do config.local.php ─────────────────────────────────────────────
//
// Monta o arquivo de senhas do servidor SEM que nenhuma senha precise ser
// digitada dentro do código (e sem passar por e-mail, chat ou git).
//
// Como usar (no Windows, dentro da pasta do projeto):
//   C:\xampp\php\php.exe backend-php\gerar-config-local.php
//
// Ele cria "backend-php/api/config.local.php" — um arquivo que o .gitignore
// já bloqueia, então nunca vai para o git. Depois é só enviar esse arquivo
// por FTP para /www/api/ no servidor.

if (PHP_SAPI !== "cli") {
    exit("Este script só roda pelo terminal (php.exe), nunca pelo navegador.\n");
}

function perguntar(string $rotulo, bool $obrigatorio = true): string {
    while (true) {
        echo $rotulo;
        $valor = trim((string) fgets(STDIN));
        if ($valor !== "" || !$obrigatorio) return $valor;
        echo "  -> Campo obrigatorio, tente de novo.\n";
    }
}

echo "\n=== Gerador do config.local.php (Coracao Presente) ===\n\n";
echo "As senhas ficam SO neste computador e no servidor.\n\n";

$dbPass   = perguntar("1) Senha do MySQL (Painel KingHost > Bancos MySQL): ");
$senhaAdm = perguntar("2) Senha do painel Admin (a que voce vai digitar no site): ");
$smtpPass = perguntar("3) Senha do e-mail SMTP (deixe vazio se ainda nao usa): ", false);
$pixChave = perguntar("4) Chave PIX reserva (deixe vazio se nao usa): ", false);

// A senha do Admin nunca é guardada: só o hash bcrypt (password_hash), que é
// lento de propósito — com o arquivo vazado, cada tentativa de adivinhar a
// senha custa ~100 ms em vez dos microssegundos do SHA-256 antigo. O salt vai
// dentro do próprio hash; a constante de salt fica vazia só por compatibilidade.
$salt = "";
$hash = password_hash($senhaAdm, PASSWORD_BCRYPT);

$escapar = fn(string $v) => str_replace(["\\", "'"], ["\\\\", "\\'"], $v);

$conteudo = "<?php\n"
    . "// Senhas do servidor. NUNCA vai para o git (ver .gitignore).\n"
    . "// Gerado por backend-php/gerar-config-local.php\n\n"
    . "define('DB_PASS_REAL', '" . $escapar($dbPass) . "');\n\n"
    . "// Senha do Admin guardada como hash: nem quem abrir este arquivo\n"
    . "// consegue descobrir a senha original a partir daqui.\n"
    . "define('ADMIN_PASSWORD_SALT_REAL', '" . $salt . "');\n"
    . "define('ADMIN_PASSWORD_HASH_REAL', '" . $hash . "');\n\n"
    . "define('SMTP_SENHA_REAL', '" . $escapar($smtpPass) . "');\n"
    . "define('PIX_CHAVE_RESERVA_REAL', '" . $escapar($pixChave) . "');\n\n"
    . "// Segredos dos endereços automáticos (gerados ao acaso — não precisa decorar).\n"
    . "// Webhook do banco:    /api/webhook/pix/<WEBHOOK_SEGREDO_REAL>\n"
    . "// Agendador (cron):    /api/repasses/automatico/<REPASSE_SEGREDO_CRON_REAL>\n"
    . "define('WEBHOOK_SEGREDO_REAL', '" . bin2hex(random_bytes(24)) . "');\n"
    . "define('REPASSE_SEGREDO_CRON_REAL', '" . bin2hex(random_bytes(24)) . "');\n";

$destino = __DIR__ . "/api/config.local.php";
if (file_put_contents($destino, $conteudo) === false) {
    exit("\nERRO: nao consegui escrever em $destino\n");
}

echo "\n=== Pronto ===\n";
echo "Arquivo criado em:\n  $destino\n\n";
echo "Agora envie esse arquivo por FTP para /www/api/ no servidor.\n";
echo "Assim que ele estiver la, a API volta a responder.\n\n";
