<?php
// ─── Arquivo de remessa CNAB 240 — Pagamentos Sicredi (banco 748) ───────────
//
// É o arquivo que o Sicredi aceita para pagar VÁRIAS pessoas de uma vez, direto
// da conta da empresa: você envia no Internet Banking (Pagamentos → Pagamento
// a Fornecedores / Folha de Pagamento → Enviar arquivo) ou pela troca de
// arquivos, e o banco agenda um pagamento para cada linha.
//
// Layout seguido: "Manual para Empresas Associadas — Pagamento a Fornecedor —
// CNAB 240 Febraban" do Banco Cooperativo Sicredi (versão com PIX) e o manual
// de Pagamentos/Folha (serviço 30). Posições conferidas campo a campo.
//
// Lotes gerados (um lote por tipo, como o manual recomenda):
//   serviço 20 · forma 45 → PIX transferência (segmentos A + B-PIX)
//   serviço 20 · forma 01 → crédito em conta corrente Sicredi (A + B)
//   serviço 30 · forma 01 → folha de pagamento em conta salário Sicredi (A + B)
//
// ANTES DO PRIMEIRO USO: o convênio de Pagamentos (fornecedores) e o de Folha
// precisam estar ativos na cooperativa, e o gerente informa o CÓDIGO DO
// CONVÊNIO. Faça o primeiro envio com um valor pequeno e confira o retorno.

require_once __DIR__ . "/lib.php";

// Texto em ASCII maiúsculo, sem acento — o banco só aceita esse alfabeto.
function cnab_texto(?string $v, int $tamanho): string {
    $v = (string) $v;
    $v = strtr($v, [
        "á"=>"a","à"=>"a","ã"=>"a","â"=>"a","ä"=>"a","é"=>"e","è"=>"e","ê"=>"e","ë"=>"e",
        "í"=>"i","ì"=>"i","î"=>"i","ï"=>"i","ó"=>"o","ò"=>"o","õ"=>"o","ô"=>"o","ö"=>"o",
        "ú"=>"u","ù"=>"u","û"=>"u","ü"=>"u","ç"=>"c","ñ"=>"n",
        "Á"=>"A","À"=>"A","Ã"=>"A","Â"=>"A","Ä"=>"A","É"=>"E","È"=>"E","Ê"=>"E","Ë"=>"E",
        "Í"=>"I","Ì"=>"I","Î"=>"I","Ï"=>"I","Ó"=>"O","Ò"=>"O","Õ"=>"O","Ô"=>"O","Ö"=>"O",
        "Ú"=>"U","Ù"=>"U","Û"=>"U","Ü"=>"U","Ç"=>"C","Ñ"=>"N",
    ]);
    $v = strtoupper(preg_replace('/[^A-Za-z0-9 !*\-$()\[\]{},.;:\/\\\\#%&@+=?_]/', ' ', $v));
    return str_pad(substr($v, 0, $tamanho), $tamanho, " ", STR_PAD_RIGHT);
}

// Chave PIX: e-mail vai em minúsculas (exigência do manual, nota G024).
function cnab_chave(string $v, int $tamanho): string {
    $v = preg_replace('/[^A-Za-z0-9@.+\-_]/', '', $v);
    return str_pad(substr($v, 0, $tamanho), $tamanho, " ", STR_PAD_RIGHT);
}

function cnab_num($v, int $tamanho): string {
    $v = preg_replace('/\D/', '', (string) $v);
    if (strlen($v) > $tamanho) $v = substr($v, -$tamanho);
    return str_pad($v, $tamanho, "0", STR_PAD_LEFT);
}

function cnab_valor(float $valor, int $tamanho): string {
    return cnab_num((string) (int) round($valor * 100), $tamanho);
}

function cnab_brancos(int $n): string {
    return str_repeat(" ", $n);
}

// Confere o tamanho de cada linha. Uma linha com 239 ou 241 posições faz o
// banco recusar o arquivo inteiro — melhor falhar aqui, com o motivo.
function cnab_linha(string $linha): string {
    if (strlen($linha) !== 240) {
        throw new LogicException("Linha CNAB com " . strlen($linha) . " posições (esperado 240).");
    }
    return $linha;
}

// Dados da empresa pagadora (Admin → Configurações → Conta da empresa).
function cnab_empresa(array $config): array {
    $cnpj = preg_replace('/\D/', '', (string) ($config["empresaCnpj"] ?? ""));
    $convenio = strtoupper(trim((string) ($config["empresaConvenio"] ?? "")));
    $agencia = preg_replace('/\D/', '', (string) ($config["empresaAgencia"] ?? ""));
    $conta = preg_replace('/\D/', '', (string) ($config["empresaConta"] ?? ""));
    $digito = strtoupper(preg_replace('/[^0-9Xx]/', '', (string) ($config["empresaContaDigito"] ?? "")));
    $nome = trim((string) ($config["empresaNome"] ?? ""));
    $faltando = [];
    if (strlen($cnpj) !== 14) $faltando[] = "CNPJ";
    if ($convenio === "") $faltando[] = "código do convênio";
    if ($agencia === "") $faltando[] = "agência";
    if ($conta === "") $faltando[] = "conta";
    if ($digito === "") $faltando[] = "dígito da conta";
    if ($nome === "") $faltando[] = "nome da empresa";
    if ($faltando) {
        throw new InvalidArgumentException(
            "Complete a conta da empresa em Configurações antes de gerar o arquivo do banco: faltando "
            . implode(", ", $faltando) . "."
        );
    }
    return compact("cnpj", "convenio", "agencia", "conta", "digito", "nome");
}

function cnab_header_arquivo(array $emp, int $sequencial, DateTime $quando): string {
    return cnab_linha(
        "748" . "0000" . "0" . cnab_brancos(9)
        . "2" . cnab_num($emp["cnpj"], 14)
        . cnab_texto($emp["convenio"], 20)
        . cnab_num($emp["agencia"], 5) . " "
        . cnab_num($emp["conta"], 12) . cnab_texto($emp["digito"], 1) . " "
        . cnab_texto($emp["nome"], 30)
        . cnab_texto("SICREDI", 30)
        . cnab_brancos(10)
        . "1"
        . $quando->format("dmY") . $quando->format("His")
        . cnab_num($sequencial, 6)
        . "082" . "01600"
        . cnab_brancos(20) . cnab_brancos(20) . cnab_brancos(29)
    );
}

function cnab_header_lote(array $emp, int $lote, string $servico, string $forma, string $mensagem): string {
    return cnab_linha(
        "748" . cnab_num($lote, 4) . "1" . "C"
        . $servico . $forma . "045" . " "
        . "2" . cnab_num($emp["cnpj"], 14)
        . cnab_texto($emp["convenio"], 20)
        . cnab_num($emp["agencia"], 5) . " "
        . cnab_num($emp["conta"], 12) . cnab_num($emp["digito"] === "X" ? "0" : $emp["digito"], 1) . " "
        . cnab_texto($emp["nome"], 30)
        . cnab_texto($mensagem, 40)
        . cnab_brancos(30) . "00000" . cnab_brancos(15) . cnab_brancos(20) . "00000" . "000" . cnab_brancos(2)
        . cnab_brancos(8) . cnab_brancos(10)
    );
}

// Segmento A — dados do crédito (banco/agência/conta do favorecido, valor).
function cnab_segmento_a(int $lote, int $seq, string $camara, array $destino, float $valor, string $seuNumero, DateTime $dataPagamento, string $mensagem): string {
    $pix = $camara === "009";
    // Para PIX por chave o banco não valida agência/conta — zeros são aceitos
    // (manual, seção "Como será validado"). Os dados reais vão quando existem.
    $banco = $destino["banco"] ?? "";
    $agencia = $destino["agencia"] ?? "";
    $conta = $destino["conta"] ?? "";
    $digito = $destino["contaDigito"] ?? "";
    return cnab_linha(
        "748" . cnab_num($lote, 4) . "3" . cnab_num($seq, 5) . "A"
        . "0" . "00"
        . $camara
        . cnab_num($banco, 3)
        . cnab_num($agencia, 5) . " "
        . cnab_num($conta, 12) . cnab_texto($digito !== "" ? $digito : ($pix ? "0" : ""), 1) . " "
        . cnab_texto($destino["titular"] ?? "", 30)
        . cnab_texto($seuNumero, 20)
        . $dataPagamento->format("dmY")
        . "BRL"
        . cnab_num(0, 15)
        . cnab_valor($valor, 15)
        . cnab_brancos(20)
        . cnab_num(0, 8)
        . cnab_num(0, 15)
        . cnab_texto($mensagem, 40)
        . cnab_brancos(2)
        . cnab_brancos(5)
        . cnab_brancos(2)
        . cnab_brancos(3)
        . "0"
        . cnab_brancos(10)
    );
}

// Segmento B comum (crédito em conta / folha): CPF do favorecido.
function cnab_segmento_b(int $lote, int $seq, array $destino): string {
    return cnab_linha(
        "748" . cnab_num($lote, 4) . "3" . cnab_num($seq, 5) . "B"
        . cnab_brancos(3)
        . "1" . cnab_num($destino["cpf"] ?? "", 14)
        . cnab_brancos(30) . cnab_num(0, 5) . cnab_brancos(15) . cnab_brancos(15) . cnab_brancos(20)
        . cnab_num(0, 8) . cnab_brancos(2)
        . cnab_num(0, 8)
        . cnab_num(0, 15) . cnab_num(0, 15) . cnab_num(0, 15) . cnab_num(0, 15) . cnab_num(0, 15)
        . cnab_brancos(15)
        . "0"
        . cnab_brancos(6)
        . cnab_brancos(8)
    );
}

// Segmento B do PIX: tipo da chave (01 telefone · 02 e-mail · 03 CPF/CNPJ ·
// 04 aleatória) e a chave. Para CPF/CNPJ a chave é o próprio documento nas
// posições 019-032 e o campo da chave vai em branco (nota G024).
function cnab_segmento_b_pix(int $lote, int $seq, array $destino, string $txid): string {
    $tipo = $destino["tipoChavePix"] ?? "";
    $codigo = ["telefone" => "01", "email" => "02", "cpf" => "03", "cnpj" => "03", "aleatoria" => "04"][$tipo] ?? null;
    if ($codigo === null) throw new InvalidArgumentException("Chave PIX sem tipo reconhecido.");
    $documento = $destino["cpf"] ?? "";
    $tipoInscricao = "1";
    if ($tipo === "cnpj") { $documento = $destino["chavePix"]; $tipoInscricao = "2"; }
    if ($tipo === "cpf") { $documento = $destino["chavePix"]; }
    $chave = in_array($tipo, ["cpf", "cnpj"], true) ? cnab_brancos(99) : cnab_chave((string) $destino["chavePix"], 99);
    return cnab_linha(
        "748" . cnab_num($lote, 4) . "3" . cnab_num($seq, 5) . "B"
        . $codigo . " "
        . $tipoInscricao . cnab_num($documento, 14)
        . cnab_texto($txid, 30)
        . cnab_brancos(65)
        . $chave
        . cnab_brancos(6)
        . cnab_brancos(8)
    );
}

function cnab_trailer_lote(int $lote, int $qtdRegistros, float $soma): string {
    return cnab_linha(
        "748" . cnab_num($lote, 4) . "5" . cnab_brancos(9)
        . cnab_num($qtdRegistros, 6)
        . cnab_valor($soma, 18)
        . cnab_num(0, 18)
        . cnab_brancos(6)
        . cnab_brancos(165)
        . cnab_brancos(10)
    );
}

function cnab_trailer_arquivo(int $qtdLotes, int $qtdRegistros): string {
    return cnab_linha(
        "748" . "9999" . "9" . cnab_brancos(9)
        . cnab_num($qtdLotes, 6)
        . cnab_num($qtdRegistros, 6)
        . cnab_num(0, 6)
        . cnab_brancos(205)
    );
}

// Nome do arquivo que o Sicredi espera (seção 4.5 do manual):
//   convênio de 4 dígitos → CCCCDDSS.REM   ·   de 3 dígitos → CCCDDMSS.REM
function cnab_nome_arquivo(string $convenio, DateTime $quando, int $doDia): string {
    $conv = preg_replace('/[^A-Za-z0-9]/', '', strtoupper($convenio));
    $ss = str_pad((string) min(99, $doDia), 2, "0", STR_PAD_LEFT);
    if (strlen($conv) <= 3) {
        $mes = "123456789OND"[(int) $quando->format("n") - 1];
        return str_pad($conv, 3, "0", STR_PAD_LEFT) . $quando->format("d") . $mes . $ss . ".REM";
    }
    return substr($conv, 0, 4) . $quando->format("d") . $ss . ".REM";
}

// Monta o arquivo inteiro. $repasses: linhas da tabela repasses (com destino
// em JSON). Devolve [conteudo, qtd, total].
function cnab_gerar_remessa(array $config, array $repasses, DateTime $dataPagamento, int $sequencial): array {
    $emp = cnab_empresa($config);
    $agora = new DateTime("now", new DateTimeZone("America/Sao_Paulo"));
    $grupos = ["pix" => [], "credito_sicredi" => [], "folha" => []];
    foreach ($repasses as $r) {
        if (!isset($grupos[$r["metodo"]])) continue;
        $grupos[$r["metodo"]][] = $r;
    }

    $linhas = [cnab_header_arquivo($emp, $sequencial, $agora)];
    $lote = 0;
    $total = 0.0;
    $qtd = 0;
    $definicoes = [
        "pix" => ["20", "45", "009", "PAGAMENTO DE COMISSOES VIA PIX"],
        "credito_sicredi" => ["20", "01", "000", "PAGAMENTO DE COMISSOES"],
        "folha" => ["30", "01", "000", "FOLHA - COMISSOES"],
    ];
    foreach ($definicoes as $metodo => [$servico, $forma, $camara, $mensagem]) {
        if (count($grupos[$metodo]) === 0) continue;
        $lote++;
        $linhas[] = cnab_header_lote($emp, $lote, $servico, $forma, $mensagem);
        $seq = 0;
        $somaLote = 0.0;
        foreach ($grupos[$metodo] as $r) {
            $destino = json_decode((string) $r["destino"], true) ?: [];
            if ($metodo !== "pix") $destino["banco"] = "748";
            $valor = centavos((float) $r["valor"]);
            $seuNumero = "REP" . $r["id"];
            $seq++;
            $linhas[] = cnab_segmento_a($lote, $seq, $camara, $destino, $valor, $seuNumero, $dataPagamento, "COMISSAO CORACAO PRESENTE");
            $seq++;
            $linhas[] = $metodo === "pix"
                ? cnab_segmento_b_pix($lote, $seq, $destino, $seuNumero)
                : cnab_segmento_b($lote, $seq, $destino);
            $somaLote += $valor;
            $qtd++;
        }
        // Registros do lote = header (1) + detalhes + trailer (1)
        $linhas[] = cnab_trailer_lote($lote, $seq + 2, $somaLote);
        $total += $somaLote;
    }
    if ($lote === 0) throw new InvalidArgumentException("Nenhum repasse a enviar ao banco.");
    $linhas[] = cnab_trailer_arquivo($lote, count($linhas) + 1);
    // Cada linha termina em CRLF, inclusive a última (o "finalizador").
    return [implode("\r\n", $linhas) . "\r\n", $qtd, centavos($total)];
}

// ─── Arquivo de retorno (.RET) ───────────────────────────────────────────────
// Lê o retorno do banco e devolve, para cada repasse, o que aconteceu:
//   ["REP12" => ["pago" => true,  "codigos" => "00"], ...]
// Códigos (nota G099): 00 = efetivado · 03 = efetivado pela agência ·
// BD = agendado (ainda não pago) · demais = recusado (motivo no código).
function cnab_ler_retorno(string $conteudo): array {
    $resultado = [];
    foreach (preg_split('/\r\n|\n|\r/', $conteudo) as $linha) {
        if (strlen($linha) < 240) continue;
        if (substr($linha, 7, 1) !== "3" || substr($linha, 13, 1) !== "A") continue;
        $seuNumero = trim(substr($linha, 73, 20));
        $ocorrencias = trim(substr($linha, 230, 10));
        if ($seuNumero === "") continue;
        $codigos = str_split($ocorrencias, 2);
        $pago = in_array("00", $codigos, true) || in_array("03", $codigos, true);
        $agendado = !$pago && in_array("BD", $codigos, true);
        $resultado[$seuNumero] = [
            "pago" => $pago,
            "agendado" => $agendado,
            "codigos" => $ocorrencias,
            "valor" => ((int) substr($linha, 119, 15)) / 100,
        ];
    }
    return $resultado;
}

// Descrição curta dos códigos de recusa mais comuns, para o Admin entender
// o que corrigir sem abrir o manual.
function cnab_motivo(string $codigos): string {
    $mapa = [
        "01" => "sem saldo na conta da empresa",
        "02" => "cancelado",
        "11" => "agência/conta do favorecido inválida",
        "AG" => "agência/conta do favorecido inválida",
        "AE" => "CPF/CNPJ inválido",
        "AF" => "código de convênio inválido",
        "AA" => "arquivo duplicado",
        "BD" => "agendado pelo banco",
    ];
    $partes = [];
    foreach (str_split(trim($codigos), 2) as $c) {
        if ($c !== "" && isset($mapa[$c])) $partes[] = $mapa[$c];
    }
    return $partes ? implode("; ", $partes) : "código do banco: " . trim($codigos);
}
