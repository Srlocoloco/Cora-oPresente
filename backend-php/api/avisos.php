<?php
// ─── Avisos ao cliente: e-mail + notificação no celular ──────────────────────
// Biblioteca (não é rota — quem expõe HTTP é notificacoes.php). Usada pelo
// pedidos.php toda vez que o Admin muda o status ou posta a encomenda.
//
// Como a notificação chega no celular, em três passos:
//   1. o site pede permissão e registra uma "inscrição push" no navegador
//      (tabela push_inscricoes);
//   2. quando o status muda, gravamos o aviso (tabela notificacoes_cliente) e
//      cutucamos o navegador do cliente — um push SEM conteúdo;
//   3. o service worker acorda, busca os avisos pendentes em
//      /api/push/pendentes e mostra a notificação.
//
// Por que o push vai vazio: mandar texto dentro do push exige criptografar o
// conteúdo (AES-GCM + ECDH), coisa que hospedagem compartilhada quase nunca
// tem biblioteca para fazer. Sem conteúdo, basta assinar o cabeçalho VAPID —
// que o OpenSSL do PHP já faz sozinho. O texto vem na busca do passo 3.

require_once __DIR__ . "/lib.php";

// ─── Texto de cada aviso ─────────────────────────────────────────────────────

// Um lugar só para o texto, usado no e-mail e na notificação do celular.
function texto_aviso_status(string $status, string $pedidoId, ?string $codigoRastreio = null): array {
    switch ($status) {
        case "Em trânsito":
            return [
                "Seu pedido saiu para entrega 🚚",
                $codigoRastreio
                    ? "O pedido $pedidoId está a caminho. Código dos Correios: $codigoRastreio."
                    : "O pedido $pedidoId foi despachado e está a caminho do seu endereço.",
            ];
        case "Entregue":
            return [
                "Seu pedido foi entregue 🎉",
                "O pedido $pedidoId chegou ao destino. Boa festa — e conte pra gente o que achou!",
            ];
        case "Cancelado":
            return [
                "Seu pedido foi cancelado",
                "O pedido $pedidoId foi cancelado. Se você não pediu isso, fale com a gente.",
            ];
        case "Processando":
            return [
                "Pagamento confirmado ✅",
                "Recebemos o pagamento do pedido $pedidoId. Já estamos separando tudo.",
            ];
        default:
            return ["Novidade no seu pedido", "O pedido $pedidoId agora está como \"$status\"."];
    }
}

// ─── 1. E-mail ───────────────────────────────────────────────────────────────

function formatar_moeda_brl(float $valor): string {
    return "R$ " . number_format($valor, 2, ",", ".");
}

// Uma linha de item (foto + descrição + valor) — usada tanto no e-mail de
// confirmação de compra (vários itens) quanto no de mudança de status (um só).
// A foto vem da rota pública /api/produtos/{id}/imagem — nunca em base64
// direto no e-mail (a maioria dos clientes de e-mail não renderiza isso, e o
// que renderiza deixa o e-mail gigante). Sem produtoId (pedido antigo, de
// antes dessa coluna existir), mostra só o texto, sem foto.
function montar_linha_item_email(?int $produtoId, string $itemTexto, float $total): string {
    $foto = $produtoId
        ? "<img src=\"" . URL_SITE . "/api/produtos/$produtoId/imagem\" width=\"56\" height=\"56\"
             style=\"width:56px;height:56px;border-radius:10px;object-fit:cover;background:#f3f3f3;display:block\" alt=\"\">"
        : "<div style=\"width:56px;height:56px;border-radius:10px;background:#f3f3f3\"></div>";

    return "<tr>
        <td style=\"padding:10px 0;border-bottom:1px solid #f0f0f0;width:56px\">$foto</td>
        <td style=\"padding:10px 0 10px 12px;border-bottom:1px solid #f0f0f0;color:#333;font-size:14px\">"
            . htmlspecialchars($itemTexto) . "</td>
        <td style=\"padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;font-weight:bold;text-align:right;white-space:nowrap\">"
            . formatar_moeda_brl($total) . "</td>
      </tr>";
}

// Casca comum dos e-mails transacionais: cabeçalho vermelho + cartão branco.
// $detalheHtml entra entre a mensagem e o botão — é onde os itens (quando
// houver) aparecem.
function montar_email_html(string $nome, string $titulo, string $corpo, ?string $detalheHtml, string $pedidoId, ?string $linkAvaliar = null): string {
    $link = URL_SITE . "/?pedido=" . urlencode($pedidoId);
    $primeiroNome = trim(explode(" ", trim($nome))[0] ?? "");
    $ola = $primeiroNome !== "" ? "Olá, " . htmlspecialchars($primeiroNome) . "!" : "Olá!";
    $blocoDetalhe = $detalheHtml ? "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:14px\">$detalheHtml</table>" : "";

    // Estilos dos botões escritos à mão (e-mail não aceita folha de estilo).
    // Com link de avaliação, ELE vira o botão principal: no e-mail de entrega
    // "acompanhar o pedido" já não tem muito o que mostrar.
    $estiloCheio = "background:#C8102E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold;display:inline-block";
    $estiloVazado = "background:#fff;color:#C8102E;text-decoration:none;padding:10px 18px;border:2px solid #C8102E;border-radius:10px;font-weight:bold;display:inline-block";
    $blocoBotoes = $linkAvaliar
        ? "<a href=\"$linkAvaliar\" style=\"$estiloCheio\">Avaliar minha compra</a>
           <a href=\"$link\" style=\"$estiloVazado;margin-left:8px\">Ver o pedido</a>"
        : "<a href=\"$link\" style=\"$estiloCheio\">Acompanhar meu pedido</a>";

    return "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto\">
       <div style=\"background:#C8102E;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0\">
         <strong style=\"font-size:18px\">Coração Presente</strong>
       </div>
       <div style=\"border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;padding:20px\">
         <p>$ola</p>
         <h2 style=\"font-size:17px;color:#111;margin:14px 0 6px\">" . htmlspecialchars($titulo) . "</h2>
         <p style=\"color:#444;line-height:1.5\">" . htmlspecialchars($corpo) . "</p>
         $blocoDetalhe
         <p style=\"margin:22px 0\">$blocoBotoes</p>
         <p style=\"color:#999;font-size:12px\">Você recebeu este e-mail porque fez uma compra na Coração Presente.</p>
       </div>
     </div>";
}

function enviar_email_status(string $email, string $nome, string $titulo, string $corpo, string $pedidoId, ?string $detalheHtml = null, ?string $linkAvaliar = null): void {
    enviar_email($email, $titulo . " — Coração Presente", montar_email_html($nome, $titulo, $corpo, $detalheHtml, $pedidoId, $linkAvaliar));
}

// ─── Confirmação de compra (dispara no checkout, não numa mudança de status) ──
// $itens: cada elemento com produtoId (int|null), texto (string), total (float)
function enviar_email_confirmacao_compra(
    string $email, string $nome, array $itens, float $totalGeral,
    ?string $endereco, ?string $pagamento, string $pedidoReferencia
): void {
    $linhas = "";
    foreach ($itens as $item) {
        $linhas .= montar_linha_item_email($item["produtoId"] ?? null, $item["texto"], $item["total"]);
    }
    $linhas .= "<tr><td></td><td style=\"padding:14px 0 0;text-align:right;color:#666;font-size:13px;font-weight:bold\">Total</td>
        <td style=\"padding:14px 0 0;text-align:right;color:#111;font-size:16px;font-weight:bold;white-space:nowrap\">"
        . formatar_moeda_brl($totalGeral) . "</td></tr>";

    $corpo = "Recebemos seu pedido e já estamos preparando tudo com carinho.";
    if ($pagamento) $corpo .= " Pagamento: $pagamento.";
    if ($endereco) $corpo .= " Entrega em: $endereco.";

    enviar_email(
        $email,
        "Compra confirmada — Coração Presente",
        montar_email_html($nome, "Seu pedido foi confirmado! 🎁", $corpo, $linhas, $pedidoReferencia)
    );
}

// ─── 2. Push (Web Push com VAPID, sem conteúdo) ──────────────────────────────

function push_configurado(): bool {
    return defined("VAPID_CHAVE_PRIVADA_PEM")
        && VAPID_CHAVE_PRIVADA_PEM !== ""
        && is_readable(VAPID_CHAVE_PRIVADA_PEM);
}

function base64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), "+/", "-_"), "=");
}

// Chave pública que o navegador precisa para se inscrever. É derivada do
// próprio par de chaves (arquivo .pem), então não há o que sincronizar à mão:
// trocou o .pem, a chave pública muda junto.
function vapid_chave_publica(): ?string {
    if (!push_configurado()) return null;
    $chave = openssl_pkey_get_private(file_get_contents(VAPID_CHAVE_PRIVADA_PEM));
    if ($chave === false) return null;
    $detalhes = openssl_pkey_get_details($chave);
    $x = $detalhes["ec"]["x"] ?? null;
    $y = $detalhes["ec"]["y"] ?? null;
    if ($x === null || $y === null) return null;
    // Ponto não comprimido: 0x04 + X(32 bytes) + Y(32 bytes)
    return base64url("\x04" . str_pad($x, 32, "\0", STR_PAD_LEFT) . str_pad($y, 32, "\0", STR_PAD_LEFT));
}

// O OpenSSL assina em DER (SEQUENCE de dois inteiros); o padrão JWT ES256
// quer os dois números crus, 32 bytes cada, colados. Esta função converte.
function der_para_jose(string $der): ?string {
    $pos = 0;
    if (($der[$pos++] ?? "") !== "\x30") return null;
    $tamanho = ord($der[$pos++]);
    if ($tamanho > 0x80) $pos += $tamanho - 0x80; // tamanho longo: pula os bytes extras
    $ler = function () use ($der, &$pos): ?string {
        if (($der[$pos++] ?? "") !== "\x02") return null;
        $n = ord($der[$pos++]);
        $valor = substr($der, $pos, $n);
        $pos += $n;
        return str_pad(ltrim($valor, "\0"), 32, "\0", STR_PAD_LEFT);
    };
    $r = $ler();
    $s = $ler();
    return ($r === null || $s === null) ? null : $r . $s;
}

// Token que prova para o serviço de push (Google, Mozilla, Apple...) que o
// aviso saiu mesmo do nosso servidor. Vale 12h e é montado por endpoint.
function vapid_token(string $origemEndpoint): ?string {
    $chave = openssl_pkey_get_private(file_get_contents(VAPID_CHAVE_PRIVADA_PEM));
    if ($chave === false) return null;

    $cabecalho = base64url(json_encode(["typ" => "JWT", "alg" => "ES256"]));
    $dados = base64url(json_encode([
        "aud" => $origemEndpoint,
        "exp" => time() + 43200,
        "sub" => VAPID_CONTATO,
    ]));

    $assinatura = "";
    if (!openssl_sign("$cabecalho.$dados", $assinatura, $chave, OPENSSL_ALGO_SHA256)) return null;
    $jose = der_para_jose($assinatura);
    return $jose === null ? null : "$cabecalho.$dados." . base64url($jose);
}

// Cutuca UM navegador. Devolve false quando a inscrição morreu (o cliente
// desinstalou o site ou limpou os dados) — aí quem chama apaga a linha.
function enviar_push(string $endpoint): bool {
    if (!push_configurado()) return false;

    $partes = parse_url($endpoint);
    if (!isset($partes["scheme"], $partes["host"])) return false;
    $token = vapid_token($partes["scheme"] . "://" . $partes["host"]);
    if ($token === null) return false;

    $publica = vapid_chave_publica();
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => "",
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            "Authorization: vapid t=$token, k=$publica",
            "TTL: 86400",          // guarda por 1 dia se o celular estiver desligado
            "Content-Length: 0",
            "Urgency: normal",
        ],
    ]);
    curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    // 404/410 = inscrição expirada. Qualquer outro erro é problema passageiro.
    if ($http === 404 || $http === 410) return false;
    if ($http < 200 || $http >= 300) {
        error_log("Push: falha ao enviar (HTTP $http)");
    }
    return true;
}

// Cutuca TODOS os aparelhos autorizados desta conta. Inscrição morta (o cliente
// desinstalou o site ou limpou os dados do navegador) é apagada na hora.
function cutucar_push(PDO $pdo, string $email): void {
    if (!push_configurado()) return;
    $inscricoes = $pdo->prepare("SELECT id, endpoint FROM push_inscricoes WHERE LOWER(email) = ?");
    $inscricoes->execute([strtolower($email)]);
    foreach ($inscricoes->fetchAll() as $inscricao) {
        if (!enviar_push($inscricao["endpoint"])) {
            $pdo->prepare("DELETE FROM push_inscricoes WHERE id = ?")->execute([$inscricao["id"]]);
        }
    }
}

// ─── O aviso completo: grava, manda e-mail e cutuca o celular ────────────────

function avisar_cliente_status(PDO $pdo, string $pedidoId, string $status): void {
    try {
        // A foto do produto entra junto (o MD5/CHAR_LENGTH montam o endereço
        // público sem trazer o base64, igual ao que o /api/dados faz)
        $stmt = $pdo->prepare(
            "SELECT ped.customer, ped.email, ped.codigoRastreio, ped.items, ped.total, ped.produtoId,
                    CHAR_LENGTH(COALESCE(pro.image, '')) AS capaTam,
                    LEFT(MD5(COALESCE(pro.image, '')), 8) AS capaVersao
               FROM pedidos ped
          LEFT JOIN produtos pro ON pro.id = ped.produtoId
              WHERE ped.id = ?"
        );
        $stmt->execute([$pedidoId]);
        $pedido = $stmt->fetch();
        if (!$pedido || empty($pedido["email"])) return;

        [$titulo, $corpo] = texto_aviso_status($status, $pedidoId, $pedido["codigoRastreio"] ?? null);
        $email = $pedido["email"];

        // Pedido entregue: quem comprou já pode avaliar (ver avaliacoes.php,
        // que aceita pedido "Pago" ou "Entregue"), então o aviso leva o caminho
        // pronto — foto para reconhecer o produto e link que abre a loja já na
        // área de avaliação ("&avaliar=1", tratado no App.tsx). Sem isso o
        // "conte pra gente o que achou" do texto não tinha onde clicar.
        // Em pedido antigo, sem produtoId, tudo continua como era.
        $foto = null;
        $linkAvaliar = null;
        if ($status === "Entregue" && $pedido["produtoId"] !== null) {
            $produtoId = (int) $pedido["produtoId"];
            if ((int) ($pedido["capaTam"] ?? 0) > 0) {
                $foto = url_foto("produto", $produtoId, ["v" => $pedido["capaVersao"]]);
            }
            $linkAvaliar = rtrim(URL_SITE, "/") . "/?produto=$produtoId&avaliar=1";
        }

        // Fica gravado mesmo sem push: é o que o service worker busca depois e
        // também o histórico que o cliente vê no sininho da loja.
        $pdo->prepare(
            "INSERT INTO notificacoes_cliente (email, titulo, corpo, pedidoId, foto, link, criadoEm)
             VALUES (?, ?, ?, ?, ?, ?, NOW())"
        )->execute([$email, $titulo, $corpo, $pedidoId, $foto, $linkAvaliar]);

        // Detalhamento do item (foto + descrição + valor) — não mostra num
        // pedido cancelado, onde "o que foi comprado" já perdeu o sentido.
        $detalheHtml = $status !== "Cancelado"
            ? montar_linha_item_email(
                  $pedido["produtoId"] !== null ? (int) $pedido["produtoId"] : null,
                  (string) $pedido["items"],
                  (float) $pedido["total"]
              )
            : null;

        enviar_email_status($email, (string) $pedido["customer"], $titulo, $corpo, $pedidoId, $detalheHtml, $linkAvaliar);

        cutucar_push($pdo, $email);
    } catch (Throwable $e) {
        // Avisar o cliente NUNCA pode derrubar a ação do Admin: se o e-mail ou
        // o push falharem, o status já foi salvo e é isso que importa.
        error_log("Aviso ao cliente falhou ($pedidoId): " . $e->getMessage());
    }
}

// ─── 3. Recomendação depois da compra ────────────────────────────────────────
//
// O único aviso que a loja manda por conta própria (os outros são o andamento
// do pedido). Sai UMA vez, logo depois da compra: enquanto a pessoa ainda está
// no clima do presente, é quando a sugestão ajuda em vez de incomodar.
//
// A escolha segue a mesma ideia do site (ver recomendacoes.ts, no front): outro
// produto da mesma prateleira do que foi comprado, em estoque, preferindo quem
// está com desconto de verdade e bem avaliado. A foto vai junto — é ela que faz
// a pessoa reconhecer o produto sem precisar ler.

// Categoria dos recipientes do "Monte sua Caixa" (e o nome antigo dela). Não
// entra em recomendação: caixa vazia não é presente, é a base de um.
const CATEGORIAS_RECIPIENTE = ["Caixas", "Cestas"];

function produto_para_recomendar(PDO $pdo, array $idsComprados, array $categorias): ?array {
    $buscar = function (bool $mesmaCategoria) use ($pdo, $idsComprados, $categorias): ?array {
        $marcasRecipiente = implode(",", array_fill(0, count(CATEGORIAS_RECIPIENTE), "?"));
        $condicoes = ["stock > 0", "category NOT IN ($marcasRecipiente)"];
        $valores = CATEGORIAS_RECIPIENTE;

        if ($idsComprados) {
            $condicoes[] = "id NOT IN (" . implode(",", array_fill(0, count($idsComprados), "?")) . ")";
            $valores = array_merge($valores, $idsComprados);
        }
        if ($mesmaCategoria) {
            if (!$categorias) return null;
            $condicoes[] = "category IN (" . implode(",", array_fill(0, count($categorias), "?")) . ")";
            $valores = array_merge($valores, $categorias);
        }

        // A foto NÃO vem na consulta (é base64, pesa megabytes) — só o tamanho
        // e o resumo dela, o bastante para montar o endereço público, igual ao
        // que o /api/dados faz.
        $stmt = $pdo->prepare(
            "SELECT id, name, price, originalPrice, freeShipping,
                    CHAR_LENGTH(COALESCE(image, '')) AS capaTam,
                    LEFT(MD5(COALESCE(image, '')), 8) AS capaVersao
               FROM produtos
              WHERE " . implode(" AND ", $condicoes) . "
           ORDER BY (originalPrice IS NOT NULL AND originalPrice > price) DESC,
                    rating DESC, reviews DESC, id DESC
              LIMIT 1"
        );
        $stmt->execute($valores);
        return $stmt->fetch() ?: null;
    };

    // Primeiro na mesma prateleira; se ela estiver vazia, a melhor oferta da loja
    return $buscar(true) ?? $buscar(false);
}

function avisar_cliente_recomendacao(PDO $pdo, string $email, array $idsComprados, array $categorias): void {
    try {
        $produto = produto_para_recomendar($pdo, $idsComprados, $categorias);
        if (!$produto) return;

        $preco = (float) $produto["price"];
        $original = $produto["originalPrice"] !== null ? (float) $produto["originalPrice"] : null;
        $desconto = ($original !== null && $original > $preco)
            ? (int) round((1 - $preco / $original) * 100)
            : 0;

        $titulo = $desconto >= 5
            ? "$desconto% de desconto esperando por você"
            : "Combina com o que você comprou";
        $corpo = $produto["name"] . " — " . formatar_moeda_brl($preco);
        if ((int) $produto["freeShipping"] === 1) $corpo .= " · frete grátis";

        $foto = (int) $produto["capaTam"] > 0
            ? url_foto("produto", (int) $produto["id"], ["v" => $produto["capaVersao"]])
            : null;
        // O site abre direto na página do produto (ver ?produto= em App.tsx)
        $link = rtrim(URL_SITE, "/") . "/?produto=" . (int) $produto["id"];

        $pdo->prepare(
            "INSERT INTO notificacoes_cliente (email, titulo, corpo, pedidoId, foto, link, criadoEm)
             VALUES (?, ?, ?, NULL, ?, ?, NOW())"
        )->execute([$email, $titulo, mb_substr($corpo, 0, 255), $foto, $link]);

        cutucar_push($pdo, $email);
    } catch (Throwable $e) {
        // Recomendação nunca pode atrapalhar a compra: ela já foi gravada
        error_log("Recomendação pós-compra falhou ($email): " . $e->getMessage());
    }
}
