// Validação dos dados do cartão de crédito (sem DOM, testável sozinha)

// Algoritmo de Luhn: confere o dígito verificador do número do cartão.
export function numeroCartaoValido(numero: string) {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 13 || digitos.length > 19) return false;
  let soma = 0;
  let dobra = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = Number(digitos[i]);
    if (dobra) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

// Validade no formato MM/AA — precisa ser um mês real e não estar vencida.
// "agora" é injetável para o teste não depender da data do relógio.
export function validadeCartaoValida(validade: string, agora = new Date()) {
  const partes = validade.replace(/\s/g, "").split("/");
  if (partes.length !== 2) return false;
  const mes = Number(partes[0]);
  const ano = Number(partes[1]);
  if (!Number.isInteger(mes) || !Number.isInteger(ano)) return false;
  if (partes[0].length !== 2 || partes[1].length !== 2) return false;
  if (mes < 1 || mes > 12) return false;
  // Último instante do mês de validade (o cartão vale até o fim do mês)
  const fim = new Date(2000 + ano, mes, 1).getTime();
  return fim > agora.getTime();
}

// Retorna a mensagem do primeiro problema encontrado, ou null se está tudo ok.
export function validarDadosCartao(
  dados: { numero: string; nome: string; validade: string; cvv: string },
  agora = new Date()
): string | null {
  if (!numeroCartaoValido(dados.numero)) return "Número do cartão inválido.";
  if (dados.nome.trim().length < 3) return "Informe o nome impresso no cartão.";
  if (!validadeCartaoValida(dados.validade, agora)) return "Validade inválida ou cartão vencido.";
  if (!/^\d{3,4}$/.test(dados.cvv.trim())) return "CVV inválido (3 ou 4 dígitos).";
  return null;
}
