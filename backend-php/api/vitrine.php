<?php
// ─── Sinais da vitrine: o que a loja vende de verdade ───────────────────────
// GET /api/vitrine → {
//     maisVendidos:     [produtoId, ...]            (mais pedidos pagos primeiro)
//     compradosJuntos:  { "produtoId": [outroId, ...] }  (quem comprou um
//                        também comprou os outros, do mais comum ao menos)
// }
//
// É o que alimenta "Mais vendidos" e "Quem comprou isto também comprou" no
// site. Só números agregados saem daqui: nenhum e-mail, nome ou pedido — dá
// para saber que dois produtos costumam sair juntos, nunca quem os comprou.
// Conta só pedido pago (nem cancelado, nem aguardando pagamento).
//
// A conta passa pelos pedidos todos, então a resposta fica pronta num arquivo
// por 10 minutos: a vitrine não precisa estar certa ao segundo, e cada visita
// não refaz a mesma soma.

require_once __DIR__ . "/lib.php";
cors();

if ($_SERVER["REQUEST_METHOD"] !== "GET") json_out(["erro" => "Método não permitido."], 405);

try {
    $pdo = db();
} catch (Throwable $e) {
    json_out(["erro" => "MySQL indisponível."], 503);
}
proteger_rota($pdo);

const VITRINE_SINAIS_VALIDADE = 600; // segundos
const VITRINE_JUNTOS_POR_PRODUTO = 8;

$arquivo = rtrim(sys_get_temp_dir(), "/\\") . DIRECTORY_SEPARATOR . "cp_sinais_vitrine_" . md5(DB_NAME) . ".json";
if (is_file($arquivo) && time() - filemtime($arquivo) < VITRINE_SINAIS_VALIDADE) {
    $pronto = @file_get_contents($arquivo);
    if (is_string($pronto) && $pronto !== "") {
        header("Content-Type: application/json; charset=utf-8");
        header("Cache-Control: public, max-age=300");
        echo $pronto;
        exit;
    }
}

$pago = "status NOT IN ('Cancelado', 'Aguardando pagamento') AND produtoId IS NOT NULL";

$maisVendidos = array_map(
    "intval",
    $pdo->query(
        "SELECT produtoId FROM pedidos WHERE $pago
         GROUP BY produtoId ORDER BY COUNT(*) DESC, MAX(id) DESC LIMIT 40"
    )->fetchAll(PDO::FETCH_COLUMN)
);

// Pares de produtos comprados pela mesma pessoa (em qualquer compra). Conta
// pessoas, não pedidos: um cliente que compra o mesmo par dez vezes não pode
// pesar mais do que dez clientes diferentes.
$pares = $pdo->query(
    "SELECT a.produtoId AS de, b.produtoId AS para, COUNT(DISTINCT a.email) AS pessoas
     FROM pedidos a
     JOIN pedidos b ON b.email = a.email AND b.produtoId <> a.produtoId
     WHERE a.status NOT IN ('Cancelado', 'Aguardando pagamento') AND a.produtoId IS NOT NULL
       AND b.status NOT IN ('Cancelado', 'Aguardando pagamento') AND b.produtoId IS NOT NULL
     GROUP BY a.produtoId, b.produtoId
     ORDER BY a.produtoId, pessoas DESC, b.produtoId"
)->fetchAll();

$compradosJuntos = [];
foreach ($pares as $par) {
    $de = (string) (int) $par["de"];
    if (count($compradosJuntos[$de] ?? []) >= VITRINE_JUNTOS_POR_PRODUTO) continue;
    $compradosJuntos[$de][] = (int) $par["para"];
}

$json = json_encode(
    ["maisVendidos" => $maisVendidos, "compradosJuntos" => (object) $compradosJuntos],
    JSON_UNESCAPED_UNICODE
);
$temporario = $arquivo . "." . getmypid() . ".tmp";
if (@file_put_contents($temporario, $json) !== false) @rename($temporario, $arquivo);

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: public, max-age=300");
echo $json;
