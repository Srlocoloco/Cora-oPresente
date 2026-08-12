<?php
// ─── Serve a foto de um produto como imagem de verdade ───────────────────────
// GET /api/produtos/{id}/imagem
//
// As fotos ficam salvas no banco como data URI base64 (campo "image" de
// produtos) — ótimo para o site (evita ida a um servidor de arquivo à parte),
// mas inútil para e-mail: a maioria dos clientes de e-mail (Outlook, Yahoo,
// várias visualizações do Gmail) não renderiza <img src="data:..."> — e as
// que renderizam inflam MUITO o tamanho do e-mail, o que ajuda ele cair em
// spam. Por isso os e-mails de compra/entrega (ver avisos.php) referenciam
// essa URL pública em vez de embutir o base64 direto.
//
// Rota pública de propósito — a foto do produto já é pública na vitrine.

require_once __DIR__ . "/lib.php";

try {
    $pdo = db();
} catch (Throwable $e) {
    http_response_code(503);
    exit;
}

$id = (int) ($_GET["id"] ?? 0);
if ($id <= 0) { http_response_code(400); exit; }

$stmt = $pdo->prepare("SELECT image FROM produtos WHERE id = ?");
$stmt->execute([$id]);
$dataUri = $stmt->fetchColumn();

if (!$dataUri || !preg_match('/^data:([a-zA-Z0-9\/\+\.\-]+);base64,(.+)$/', $dataUri, $m)) {
    http_response_code(404);
    exit;
}

$bin = base64_decode($m[2], true);
if ($bin === false) { http_response_code(404); exit; }

header("Content-Type: " . $m[1]);
header("Content-Length: " . strlen($bin));
// A foto de um produto quase nunca muda de figura (o Admin sobe outra em vez
// de editar a mesma) — cache longo é seguro e evita decodificar de novo em
// toda visualização de e-mail.
header("Cache-Control: public, max-age=604800");
echo $bin;
