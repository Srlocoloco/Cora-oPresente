<?php
// ─── Cliente SMTP mínimo (sem biblioteca externa) ────────────────────────────
// Fala o protocolo SMTP diretamente por socket, com STARTTLS/SSL + AUTH LOGIN
// — o suficiente para qualquer provedor comum (KingHost, Gmail, SendGrid,
// Mailgun, Brevo...). Não é um cliente completo (sem anexos, sem múltiplos
// destinatários), só o necessário para os e-mails transacionais do site.
//
// Por que não usar uma lib pronta (PHPMailer etc.): este backend é PHP puro,
// sem Composer nem dependências — a mesma escolha já feita para o resto do
// projeto (ver README da pasta).

function smtp_configurado(): bool {
    return SMTP_HOST !== "" && SMTP_USUARIO !== "" && SMTP_SENHA !== "";
}

// Lê uma (ou várias, em resposta multilinha "250-...") linha(s) de resposta
// do servidor e devolve o código (ex.: 250) e o texto completo.
function smtp_ler_resposta($socket): array {
    $texto = "";
    do {
        $linha = fgets($socket, 515);
        if ($linha === false) break;
        $texto .= $linha;
        // "250 " (com espaço) = última linha; "250-" = tem mais linhas vindo
        $continua = isset($linha[3]) && $linha[3] === "-";
    } while ($continua);
    $codigo = (int) substr($texto, 0, 3);
    return [$codigo, $texto];
}

function smtp_comando($socket, string $comando, int $codigoEsperado): bool {
    fwrite($socket, $comando . "\r\n");
    [$codigo] = smtp_ler_resposta($socket);
    return $codigo === $codigoEsperado;
}

// Devolve true/false — nunca lança, pra nunca derrubar quem chamou (o site
// precisa continuar funcionando mesmo se o e-mail falhar)
function enviar_email_smtp(string $para, string $assunto, string $corpoHtml): bool {
    if (!smtp_configurado()) return false;

    $timeout = 12;
    // Transporte explícito sempre: "tcp://" mesmo pra TLS, porque a
    // criptografia começa depois, via STARTTLS — conectar direto com
    // "ssl://" só faz sentido para o modo SSL direto (porta 465).
    $esquema = SMTP_SEGURANCA === "ssl" ? "ssl" : "tcp";

    $socket = @stream_socket_client("$esquema://" . SMTP_HOST . ":" . SMTP_PORTA, $codigoErro, $mensagemErro, $timeout);
    if (!$socket) {
        error_log("SMTP: falha ao conectar em " . SMTP_HOST . ":" . SMTP_PORTA . " — $mensagemErro");
        return false;
    }
    stream_set_timeout($socket, $timeout);

    try {
        [$codigo] = smtp_ler_resposta($socket); // saudação (220)
        if ($codigo !== 220) return false;

        $dominioLocal = "localhost"; // qualquer nome serve pro EHLO — não precisa ser real
        if (!smtp_comando($socket, "EHLO $dominioLocal", 250)) return false;

        if (SMTP_SEGURANCA === "tls") {
            if (!smtp_comando($socket, "STARTTLS", 220)) return false;
            $ok = @stream_socket_enable_crypto(
                $socket, true,
                STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT
            );
            if (!$ok) { error_log("SMTP: falha ao negociar TLS"); return false; }
            // Depois do STARTTLS, o protocolo pede EHLO de novo
            if (!smtp_comando($socket, "EHLO $dominioLocal", 250)) return false;
        }

        if (!smtp_comando($socket, "AUTH LOGIN", 334)) return false;
        if (!smtp_comando($socket, base64_encode(SMTP_USUARIO), 334)) return false;
        if (!smtp_comando($socket, base64_encode(SMTP_SENHA), 235)) {
            error_log("SMTP: usuário/senha rejeitados pelo servidor");
            return false;
        }

        if (!smtp_comando($socket, "MAIL FROM:<" . MAIL_DE . ">", 250)) return false;
        if (!smtp_comando($socket, "RCPT TO:<$para>", 250)) return false;
        if (!smtp_comando($socket, "DATA", 354)) return false;

        $cabecalhos =
            "From: " . MAIL_NOME_DE . " <" . MAIL_DE . ">\r\n" .
            "To: <$para>\r\n" .
            "Subject: =?UTF-8?B?" . base64_encode($assunto) . "?=\r\n" .
            "MIME-Version: 1.0\r\n" .
            "Content-Type: text/html; charset=UTF-8\r\n" .
            "Date: " . date("r") . "\r\n";

        // Linhas que começam com "." precisam virar ".." — é assim que o
        // protocolo SMTP diferencia o fim dos dados (uma linha só com ".")
        // de um "." que faz parte do conteúdo de verdade.
        $corpoEscapado = preg_replace('/\n\./', "\n..", $corpoHtml);

        fwrite($socket, $cabecalhos . "\r\n" . $corpoEscapado . "\r\n.\r\n");
        [$codigoFinal] = smtp_ler_resposta($socket);

        smtp_comando($socket, "QUIT", 221);

        return $codigoFinal === 250;
    } finally {
        fclose($socket);
    }
}
