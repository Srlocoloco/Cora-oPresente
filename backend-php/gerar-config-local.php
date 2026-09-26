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

// A senha do Admin nunca é guardada: só o salt aleatório e o hash SHA-256 de
// (salt + senha). É a mesma conta que o lib.php faz ao conferir o login, então
// o hash gerado aqui casa exatamente com verificar_senha_admin().
$salt = bin2hex(random_bytes(16));
$hash = hash("sha256", $salt . $senhaAdm);

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
    . "define('PIX_CHAVE_RESERVA_REAL', '" . $escapar($pixChave) . "');\n";

$destino = __DIR__ . "/api/config.local.php";
if (file_put_contents($destino, $conteudo) === false) {
    exit("\nERRO: nao consegui escrever em $destino\n");
}

echo "\n=== Pronto ===\n";
echo "Arquivo criado em:\n  $destino\n\n";
echo "Agora envie esse arquivo por FTP para /www/api/ no servidor.\n";
echo "Assim que ele estiver la, a API volta a responder.\n\n";
