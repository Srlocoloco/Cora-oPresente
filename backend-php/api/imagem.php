<?php
// ─── Serve a foto guardada no banco como imagem de verdade ───────────────────
//
// GET /api/produtos/{id}/imagem            capa do produto
// GET /api/produtos/{id}/imagem?g={n}      foto {n} da galeria
// GET /api/produtos/{id}/imagem?c={n}      foto da cor {n}
// GET /api/banners/{id}/imagem             banner (desktop)
// GET /api/banners/{id}/imagem?m=1         banner (celular)
//
// As fotos ficam salvas no banco como data URI base64. Esta rota decodifica e
// devolve a imagem pronta, com cabeçalho de cache — que é o que permite ao
// /api/dados mandar só o ENDEREÇO de cada foto em vez do base64 inteiro. Antes
// dessa separação a resposta do /api/dados passava de 19 MB e derrubava o site
// (ver o comentário em lib.php, "Fotos: endereço público no lugar do base64").
//
// Também é usada pelos e-mails de compra/entrega (ver avisos.php): a maioria
// dos programas de e-mail não mostra <img src="data:...">, mas mostra uma
// imagem vinda de um endereço normal.
//
// Rota pública de propósito — a foto do produto já é pública na vitrine.

require_once __DIR__ . "/lib.php";

try {
    $pdo = db();
} catch (Throwable $e) {
    http_response_code(503);
    exit;
}

// Anti-abuso. Esta rota lê a foto do banco e a decodifica de base64 na memória
// a cada pedido — é barata para o visitante e cara para o servidor, que é o
// perfil clássico de alvo de sobrecarga.
//
// O teto é alto de propósito: uma única visita à vitrine pede dezenas de fotos
// de uma vez, e o navegador guarda cada uma em cache (ver o ETag mais abaixo),
// então quem navega normalmente pede pouco depois da primeira visita.
verificar_bloqueio($pdo);
limitar_taxa($pdo, "imagem", 1200, 300);

// O tipo vem do próprio caminho pedido. Ler do caminho (e não só do "?tipo=")
// evita que o endereço de um produto seja usado para pedir um banner por meio
// de um parâmetro colado na mão.
$caminho = $_SERVER["REQUEST_URI"] ?? "";
if (strpos($caminho, "/banners/") !== false) {
    $tipo = "banner";
} elseif (strpos($caminho, "/produtos/") !== false) {
    $tipo = "produto";
} else {
    $tipo = ($_GET["tipo"] ?? "") === "banner" ? "banner" : "produto";
}

$id = (int) ($_GET["id"] ?? 0);
if ($id <= 0) { http_response_code(400); exit; }

$dataUri = null;

if ($tipo === "banner") {
    // Lista fixa de colunas — o nome nunca vem do que o visitante digitou.
    $coluna = isset($_GET["m"]) && $_GET["m"] !== "" ? "mobileImage" : "image";
    $stmt = $pdo->prepare("SELECT `$coluna` FROM banners WHERE id = ?");
    $stmt->execute([$id]);
    $dataUri = $stmt->fetchColumn();
} elseif (isset($_GET["g"])) {
    $stmt = $pdo->prepare("SELECT images FROM produtos WHERE id = ?");
    $stmt->execute([$id]);
    $lista = json_decode((string) $stmt->fetchColumn(), true);
    $dataUri = is_array($lista) ? ($lista[(int) $_GET["g"]] ?? null) : null;
} elseif (isset($_GET["c"])) {
    $stmt = $pdo->prepare("SELECT colors FROM produtos WHERE id = ?");
    $stmt->execute([$id]);
    $cores = json_decode((string) $stmt->fetchColumn(), true);
    $dataUri = is_array($cores) ? ($cores[(int) $_GET["c"]]["image"] ?? null) : null;
} else {
    $stmt = $pdo->prepare("SELECT image FROM produtos WHERE id = ?");
    $stmt->execute([$id]);
    $dataUri = $stmt->fetchColumn();
}

if (!$dataUri || !preg_match('/^data:([a-zA-Z0-9\/\+\.\-]+);base64,(.+)$/', $dataUri, $m)) {
    http_response_code(404);
    exit;
}

// ── Trava de tipo na SAÍDA ───────────────────────────────────────────────────
// O Content-Type daqui saía direto do que estava gravado no banco. Quem grava é
// o painel, com validação — mas esta rota é a última porta antes do navegador,
// e ela precisa se defender sozinha por dois motivos:
//   • fotos gravadas ANTES de a validação existir nunca passaram por peneira
//     nenhuma e continuam no banco;
//   • se algum dia entrar um "data:text/html" ou um "data:image/svg+xml" ali,
//     esta rota o entregaria como página do próprio domínio da loja — ou seja,
//     código de terceiro rodando com o token de sessão de quem abrisse.
// A lista é a mesma usada na gravação (MIMES_IMAGEM_PERMITIDOS, em lib.php).
$mime = strtolower($m[1]);
if (!in_array($mime, MIMES_IMAGEM_PERMITIDOS, true)) {
    error_log("imagem.php recusou tipo não permitido ($mime) em $tipo #$id");
    http_response_code(404);
    exit;
}

$bin = base64_decode($m[2], true);
if ($bin === false) { http_response_code(404); exit; }

// Confere a assinatura do arquivo antes de entregar: o tipo declarado tem que
// bater com os bytes de verdade. Arquivo que se diz PNG mas começa com "<html"
// não sai daqui.
$assinaturaOk =
    substr($bin, 0, 3) === "\xFF\xD8\xFF" ||                 // JPEG
    substr($bin, 0, 8) === "\x89PNG\r\n\x1a\n" ||            // PNG
    substr($bin, 0, 6) === "GIF87a" || substr($bin, 0, 6) === "GIF89a" ||
    substr($bin, 8, 4) === "WEBP";
if (!$assinaturaOk) {
    error_log("imagem.php recusou arquivo sem assinatura de imagem em $tipo #$id");
    http_response_code(404);
    exit;
}

// Se o endereço traz "?v=" (o resumo do conteúdo, criado por url_foto), ele
// muda sozinho sempre que a foto muda. Então o navegador pode guardar esta
// resposta para sempre e nem perguntar de novo: trocar a foto no painel gera
// um endereço diferente, que o navegador busca do zero.
// Sem "v" (é o caso dos e-mails, que usam o endereço curto), o cache é curto,
// para a foto trocada aparecer em pouco tempo.
$temVersao = isset($_GET["v"]) && $_GET["v"] !== "";
$etag = '"' . md5($dataUri) . '"';

header("Content-Type: " . $mime);
// nosniff: proíbe o navegador de "adivinhar" o tipo pelo conteúdo e tratar o
// arquivo como outra coisa (HTML, script) mesmo com o Content-Type certo.
header("X-Content-Type-Options: nosniff");
// A resposta é só uma figura: não pode carregar nada, não pode rodar nada e não
// pode ser colocada dentro de um frame. Se alguma coisa escapar das travas
// acima, ela morre aqui.
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
header("Content-Disposition: inline");
header("ETag: $etag");
header("Cache-Control: " . ($temVersao
    ? "public, max-age=31536000, immutable"
    : "public, max-age=86400"));

// O navegador já tem esta mesma foto: responde "não mudou" e não manda o
// arquivo de novo.
if (trim((string) ($_SERVER["HTTP_IF_NONE_MATCH"] ?? "")) === $etag) {
    http_response_code(304);
    exit;
}

header("Content-Length: " . strlen($bin));
echo $bin;
