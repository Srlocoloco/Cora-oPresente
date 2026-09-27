<?php
// ─── Servidor de teste da API no seu computador (sem Apache) ────────────────
//
// Roda a pasta api/ com o servidor embutido do PHP, aplicando as MESMAS regras
// de endereço do api/.htaccess (lidas dele na hora — não há duas listas para
// manter). Serve para testar mudanças antes de enviar por FTP.
//
// Como usar (Windows, na pasta do projeto), com um MySQL/MariaDB local:
//   set CP_DB_HOST=127.0.0.1
//   set CP_DB_NAME=coracao_teste
//   set CP_DB_USER=root
//   set CP_CONFIG_LOCAL=C:\caminho\config.teste.php   (define DB_PASS_REAL etc.)
//   set CP_URL_SITE=http://localhost:8787
//   C:\xampp\php\php.exe -S localhost:8787 backend-php\servidor-local.php
//
// E no site: VITE_BACKEND_URL=http://localhost:8787 npm run dev
//
// NUNCA envie este arquivo para a hospedagem (ele fica fora da pasta api/).

if (PHP_SAPI !== "cli-server") {
    http_response_code(404);
    exit;
}

$caminho = rawurldecode((string) parse_url($_SERVER["REQUEST_URI"] ?? "/", PHP_URL_PATH));
if (!str_starts_with($caminho, "/api/")) {
    http_response_code(404);
    echo "Só a API é servida aqui (/api/...).";
    return true;
}
$relativo = substr($caminho, 5);

// Só aqui (servidor de teste): libera o Vite em QUALQUER porta local — ele
// pula para 5174, 5175… quando a 5173 já está ocupada. Na hospedagem vale a
// lista fixa de lib.php.
$origem = $_SERVER["HTTP_ORIGIN"] ?? "";
if (preg_match('#^http://(localhost|127\.0\.0\.1):\d{2,5}$#', $origem)) {
    header("Access-Control-Allow-Origin: $origem");
    header("Vary: Origin");
}

foreach (file(__DIR__ . "/api/.htaccess") as $linha) {
    if (!preg_match('/^RewriteRule\s+(\S+)\s+(\S+)/', trim($linha), $m)) continue;
    if (str_starts_with($m[2], "http")) continue; // regra de forçar HTTPS
    if (!preg_match("#" . $m[1] . "#", $relativo, $grupos)) continue;
    $alvo = preg_replace_callback('/\$(\d)/', fn($g) => $grupos[(int) $g[1]] ?? "", $m[2]);
    [$arquivo, $query] = array_pad(explode("?", $alvo, 2), 2, "");
    parse_str($query, $parametros);
    $_GET = array_merge($_GET, $parametros); // QSA: soma aos parâmetros originais
    $_SERVER["SCRIPT_NAME"] = "/api/" . $arquivo;
    chdir(__DIR__ . "/api");
    require __DIR__ . "/api/" . $arquivo;
    return true;
}
http_response_code(404);
echo "Rota não encontrada.";
return true;
