<?php
// ─── Avaliações de produto (comentário + vídeo do cliente) ──────────────────
// GET    /api/avaliacoes/{produtoId}  → avaliações daquele produto (mais novas primeiro)
// POST   /api/avaliacoes              → cria (ou atualiza, se já existir) a avaliação
//                                        do cliente pra aquele produto
// DELETE /api/avaliacoes/{id}         → Admin exclui uma avaliação imprópria
//
// Publicação é IMEDIATA (sem fila de aprovação) — só quem comprou o produto
// (pedido com status Pago ou Entregue) pode enviar, conferido aqui no servidor.

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

// Tabela de avaliações (criada só na primeira vez)
$pdo->exec("CREATE TABLE IF NOT EXISTS avaliacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    produtoId BIGINT NOT NULL,
    clienteEmail VARCHAR(255) NOT NULL,
    clienteNome VARCHAR(255) NOT NULL,
    nota TINYINT NOT NULL,
    comentario TEXT NULL,
    video LONGTEXT NULL,
    date VARCHAR(16) NOT NULL,
    criadaEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_produto (produtoId),
    UNIQUE KEY unico_cliente_produto (produtoId, clienteEmail)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// Recalcula rating (média) e reviews (quantidade) do produto a partir das
// avaliações reais — os mesmos campos que já apareciam na vitrine e na
// página do produto, só que agora vêm de dados de verdade.
function recalcularResumoProduto(PDO $pdo, int $produtoId): void {
    $stmt = $pdo->prepare("SELECT COUNT(*) AS qtd, AVG(nota) AS media FROM avaliacoes WHERE produtoId = ?");
    $stmt->execute([$produtoId]);
    $agg = $stmt->fetch();
    $media = $agg && $agg["media"] !== null ? round((float) $agg["media"], 1) : 0;
    $qtd = $agg ? (int) $agg["qtd"] : 0;
    $stmt = $pdo->prepare("UPDATE produtos SET rating = ?, reviews = ? WHERE id = ?");
    $stmt->execute([$media, $qtd, $produtoId]);
}

$metodo = $_SERVER["REQUEST_METHOD"];

// ── Leitura das avaliações ────────────────────────────────────────────────────
// /api/avaliacoes/{produtoId}  → avaliações de um produto (página do produto)
// /api/avaliacoes?todas=1      → todas as avaliações, com o nome do produto
//                                 (painel Admin, pra moderar)
if ($metodo === "GET") {
    limitar_taxa($pdo, "avaliacoes_ler", 120, 300);
    $produtoId = (int) ($_GET["produtoId"] ?? 0);
    $todas = ($_GET["todas"] ?? "") === "1";
    // Modo vitrine: os depoimentos da página inicial. Devolve SÓ o que aquela
    // seção mostra (nome, nota, comentário, produto e data), de no máximo 12
    // avaliações boas — sem e-mail e sem vídeo.
    $vitrine = ($_GET["vitrine"] ?? "") === "1";
    if ($produtoId <= 0 && !$todas && !$vitrine) json_out(["erro" => "Informe o produto."], 400);

    // Quem está pedindo. A página do produto é pública, então aqui NÃO se exige
    // login — mas o que cada um recebe muda conforme quem é.
    $quem = autenticacao_opcional($pdo);
    $ehAdmin = $quem["papel"] === "admin";

    // "?todas=1" devolve a loja inteira de avaliações e existe só para o Admin
    // moderar. Estava aberta: qualquer pessoa podia pedir esse endereço e
    // baixar TODAS as avaliações — com o e-mail de cada cliente junto. Isso é
    // lista de e-mails de clientes entregue de graça (e dado pessoal, LGPD).
    // A home, que só quer mostrar alguns depoimentos, passou a usar o modo
    // vitrine acima em vez desta lista completa.
    if ($todas && !$ehAdmin) {
        json_out(["erro" => "Não autorizado."], 403);
    }

    try {
        if ($vitrine && !$todas) {
            // Nota 4+ e comentário escrito — é o mesmo recorte que a home já
            // fazia no navegador, agora feito aqui: o que não vai ser mostrado
            // nem sai do servidor.
            $stmt = $pdo->query(
                "SELECT a.id, a.produtoId, a.clienteNome, a.nota, a.comentario, a.date,
                        p.name AS produtoNome
                   FROM avaliacoes a
              LEFT JOIN produtos p ON p.id = a.produtoId
                  WHERE a.nota >= 4 AND a.comentario IS NOT NULL AND TRIM(a.comentario) <> ''
               ORDER BY a.id DESC
                  LIMIT 12"
            );
            json_out(array_map(fn($a) => [
                "id" => (int) $a["id"],
                "produtoId" => (int) $a["produtoId"],
                "produtoNome" => $a["produtoNome"],
                "clienteNome" => $a["clienteNome"],
                "nota" => (int) $a["nota"],
                "comentario" => $a["comentario"],
                "date" => $a["date"],
            ], $stmt->fetchAll()));
        }

        if ($todas) {
            $stmt = $pdo->query(
                "SELECT a.*, p.name AS produtoNome FROM avaliacoes a
                 LEFT JOIN produtos p ON p.id = a.produtoId
                 ORDER BY a.id DESC"
            );
        } else {
            $stmt = $pdo->prepare("SELECT * FROM avaliacoes WHERE produtoId = ? ORDER BY id DESC");
            $stmt->execute([$produtoId]);
        }
        $emailDeQuemPede = strtolower((string) ($quem["email"] ?? ""));
        $linhas = array_map(function ($a) use ($ehAdmin, $emailDeQuemPede) {
            // O e-mail do avaliador só vai para o Admin (que modera) e para o
            // próprio dono da avaliação (é assim que a tela do produto sabe
            // qual avaliação é dele, para deixar editar). Para o resto do mundo
            // vai string vazia — a comparação na tela simplesmente não casa, e
            // nenhum e-mail de cliente circula na vitrine.
            $meu = $emailDeQuemPede !== "" && strtolower($a["clienteEmail"]) === $emailDeQuemPede;
            return [
                "id" => (int) $a["id"],
                "produtoId" => (int) $a["produtoId"],
                "produtoNome" => $a["produtoNome"] ?? null,
                "clienteEmail" => ($ehAdmin || $meu) ? $a["clienteEmail"] : "",
                "clienteNome" => $a["clienteNome"],
                "nota" => (int) $a["nota"],
                "comentario" => $a["comentario"] ?? "",
                "video" => $a["video"],
                "date" => $a["date"],
            ];
        }, $stmt->fetchAll());
        json_out($linhas);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao ler as avaliações."], 500);
    }
}

// ── Criação/atualização de uma avaliação ──────────────────────────────────────
if ($metodo === "POST") {
    limitar_taxa($pdo, "avaliacoes_criar", 20, 300);
    // Usa o e-mail da sessão autenticada, nunca o que vem no corpo — impede
    // que alguém publique uma avaliação em nome de outro cliente
    $clienteEmail = strtolower(email_autenticado($pdo));
    $corpo = corpo_json();
    $produtoId = (int) ($corpo["produtoId"] ?? 0);
    $clienteNome = trim((string) ($corpo["clienteNome"] ?? ""));
    $nota = (int) ($corpo["nota"] ?? 0);
    $comentario = trim((string) ($corpo["comentario"] ?? ""));
    $video = $corpo["video"] ?? null;
    if ($video !== null && !is_string($video)) $video = null;

    if ($produtoId <= 0 || $clienteEmail === "" || $clienteNome === "") {
        json_out(["erro" => "Dados incompletos."], 400);
    }
    // Tamanho conferido ANTES de qualquer processamento: recusar cedo é o que
    // impede um envio gigante de ocupar a memória do servidor só para depois
    // ser rejeitado. ~12 MB de vídeo viram ~16 MB escritos em base64.
    if ($video !== null && strlen($video) > 17 * 1024 * 1024) {
        json_out(["erro" => "Vídeo muito grande. Envie um vídeo mais curto (máx. 12 MB)."], 400);
    }
    // Confere tipo declarado, assinatura do arquivo e tamanho real (lib.php).
    // Um arquivo que só se DIZ vídeo não passa daqui.
    if ($video !== null && !validar_video_base64($video)) {
        json_out(["erro" => "Arquivo de vídeo inválido. Envie um MP4, WebM, MOV ou OGG de até 12 MB."], 400);
    }
    if ($nota < 1 || $nota > 5) {
        json_out(["erro" => "Escolha de 1 a 5 estrelas."], 400);
    }
    // Teto no comentário: o campo é TEXT (64 KB) e o que passar disso seria
    // cortado pelo banco no meio. Recusar é melhor do que gravar pela metade.
    if (mb_strlen($comentario) > 2000) {
        json_out(["erro" => "Comentário muito longo — use até 2.000 caracteres."], 400);
    }
    if (mb_strlen($clienteNome) > 120) {
        $clienteNome = mb_substr($clienteNome, 0, 120);
    }
    if ($comentario === "" && !$video) {
        json_out(["erro" => "Escreva um comentário ou envie um vídeo."], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT name FROM produtos WHERE id = ?");
        $stmt->execute([$produtoId]);
        $produto = $stmt->fetch();
        if (!$produto) json_out(["erro" => "Produto não encontrado."], 404);

        // Só quem comprou (pedido Pago ou Entregue) pode avaliar. Pedidos não
        // guardam o id do produto, só o nome (ver App.tsx) — compara por nome.
        $stmt = $pdo->prepare(
            "SELECT id FROM pedidos WHERE email = ? AND status IN ('Pago','Entregue')
             AND (items = ? OR items LIKE ?) LIMIT 1"
        );
        $stmt->execute([$clienteEmail, $produto["name"], $produto["name"] . " (%"]);
        if (!$stmt->fetch()) {
            json_out(["erro" => "Só clientes que compraram este produto podem avaliar."], 403);
        }

        $date = date("d/m/Y");
        // Upsert: 1 avaliação por cliente por produto (enviar de novo atualiza)
        $stmt = $pdo->prepare(
            "INSERT INTO avaliacoes (produtoId, clienteEmail, clienteNome, nota, comentario, video, date)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                clienteNome = VALUES(clienteNome),
                nota = VALUES(nota),
                comentario = VALUES(comentario),
                video = VALUES(video),
                date = VALUES(date)"
        );
        $stmt->execute([$produtoId, $clienteEmail, $clienteNome, $nota, $comentario, $video, $date]);

        recalcularResumoProduto($pdo, $produtoId);
        // A nota e a quantidade de avaliações aparecem no card do produto na
        // vitrine: a cópia em cache precisa ser refeita.
        invalidar_vitrine($pdo);
        json_out(["ok" => true]);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao gravar a avaliação."], 500);
    }
}

// ── Exclusão (Admin remove avaliação imprópria) ───────────────────────────────
if ($metodo === "DELETE") {
    exigir_admin($pdo);
    $id = (int) ($_GET["produtoId"] ?? 0); // rota /avaliacoes/{id} reaproveita o mesmo parâmetro
    if ($id <= 0) json_out(["erro" => "Id inválido."], 400);
    try {
        $stmt = $pdo->prepare("SELECT produtoId FROM avaliacoes WHERE id = ?");
        $stmt->execute([$id]);
        $linha = $stmt->fetch();
        if ($linha) {
            $pdo->prepare("DELETE FROM avaliacoes WHERE id = ?")->execute([$id]);
            recalcularResumoProduto($pdo, (int) $linha["produtoId"]);
            invalidar_vitrine($pdo);
            registrar_auditoria($pdo, "excluir_avaliacao", (string) $id);
        }
        json_out(["ok" => true]);
    } catch (Throwable $e) {
        json_out(["erro" => "Falha ao excluir a avaliação."], 500);
    }
}

json_out(["erro" => "Método não suportado."], 405);
