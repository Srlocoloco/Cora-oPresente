// Funcoes auxiliares puras

import type { Cupom, Pedido, Produto, CaixaMontada, ItemCarrinho } from "./types";
import { NIVEIS_VENDEDOR, CATEGORIAS, PREFIXOS_CATEGORIA } from "./constantes";

// Um cupom vale se está ativo e dentro da validade
export function cupomEstaValido(c: Cupom) {
  return c.ativo && new Date(c.validade + "T23:59:59") >= new Date();
}

// Cada cupom só pode ser usado uma vez por cliente — true se este e-mail já
// tem algum pedido (de qualquer status) que usou esse código de cupom
export function clienteJaUsouCupom(email: string, codigoCupom: string, pedidos: Pedido[]) {
  const emailLimpo = email.trim().toLowerCase();
  return pedidos.some(
    (p) => p.email.toLowerCase() === emailLimpo && p.cupomUsado?.toUpperCase() === codigoCupom.toUpperCase()
  );
}


export function obterNivelVendedor(sales: number) {
  return NIVEIS_VENDEDOR.findIndex((l) => sales >= l.min && sales < l.max);
}


// Fração de comissão (ex.: 0.08) do nível correspondente a um total de vendas
export function comissaoFracaoPorNivel(vendasTotais: number) {
  const nivel = NIVEIS_VENDEDOR[obterNivelVendedor(vendasTotais)] ?? NIVEIS_VENDEDOR[0];
  return parseFloat(nivel.commission) / 100;
}


// bonusDeNivel() foi removida junto com o sistema de bônus: o vendedor ganha a
// comissão da faixa dele sobre cada venda, e nada além disso. Não existe mais
// prêmio por atingir Ouro/Diamante.


// ─── Mês de um pedido ────────────────────────────────────────────────────────
// O pedido guarda o mês como "Set" — sem o ano. Filtrar só por esse campo
// junta setembro de 2026 com setembro de 2027 no mesmo saco: o "faturamento do
// mês" cresce sozinho a cada aniversário da loja e o gráfico do ano soma anos
// anteriores dentro dele. Quem tem o ano é o campo "date" ("13/09/2026"), e é
// dele que estas funções partem.
//
// Pedido antigo sem data legível volta a ser comparado pelo nome do mês — pior
// do que o ideal, mas melhor do que sumir de um relatório de vendas.
export function anoMesDoPedido(pedido: Pedido): { ano: number; mes: number } | null {
  const [dia, mes, ano] = (pedido.date ?? "").split("/").map(Number);
  if (!dia || !mes || !ano || mes < 1 || mes > 12) return null;
  return { ano, mes: mes - 1 };
}


// true se o pedido é deste mês E deste ano
export function pedidoNoMes(pedido: Pedido, mes: number, ano: number, nomeDoMes: string) {
  const quando = anoMesDoPedido(pedido);
  return quando ? quando.ano === ano && quando.mes === mes : pedido.month === nomeDoMes;
}


export function totalVendidoPor(email: string, pedidos: Pedido[]) {
  return pedidos
    .filter((o) => o.vendedor?.toLowerCase() === email.toLowerCase() && o.status !== "Cancelado")
    .reduce((acum, o) => acum + o.total, 0);
}


// Nome de exibição de uma categoria — pedidos antigos podem ter uma
// categoria que já não existe mais na lista (ex.: catálogo trocado); em vez
// de mostrar esse valor obsoleto, agrupa como "Outros".
export function categoriaExibida(categoria: string) {
  return CATEGORIAS.includes(categoria) ? categoria : "Outros";
}


// Gera o próximo código sequencial de um produto dentro da categoria dele
// (ex.: 1º produto de Beleza & Perfumaria = "BEL-001", o 2º = "BEL-002"...).
// Cada categoria (nicho) tem a própria contagem, independente das outras.
export function gerarCodigoProduto(categoria: string, produtosExistentes: Produto[]) {
  const prefixo = PREFIXOS_CATEGORIA[categoria] || "OUT";
  const numeros = produtosExistentes
    .filter((p) => p.codigo?.startsWith(`${prefixo}-`))
    .map((p) => parseInt(p.codigo!.slice(prefixo.length + 1), 10))
    .filter((n) => !isNaN(n));
  const proximo = numeros.length > 0 ? Math.max(...numeros) + 1 : 1;
  return `${prefixo}-${String(proximo).padStart(3, "0")}`;
}


// ─── Monte sua Caixa ─────────────────────────────────────────────────────────
// A caixa montada pelo cliente entra no carrinho como UMA linha só (fica
// legível: uma caixa, um preço, um item). Mas por dentro ela é um conjunto de
// produtos de verdade — e é assim que o estoque, o pedido e a comissão
// precisam enxergá-la. As funções abaixo fazem essa tradução nos dois
// sentidos: montar a linha do carrinho e desmontá-la de volta em produtos.

// Id da montagem: identifica esta caixa específica (não é id de produto).
export function novoIdDeCaixa() {
  return `caixa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}


// Id numérico da LINHA do carrinho, derivado do id da montagem. É negativo,
// para nunca colidir com o id de um produto de verdade, e é estável: editar a
// mesma caixa atualiza a linha no lugar, sem mandá-la para o fim da lista.
export function idDeLinhaDaCaixa(caixaId: string) {
  let h = 5381;
  for (let i = 0; i < caixaId.length; i++) h = ((h << 5) + h + caixaId.charCodeAt(i)) >>> 0;
  return -(h % 2147483647) - 1;
}


// O tamanho escolhido dentro de um produto-caixa. Devolve undefined quando a
// caixa é de tamanho único ou quando o tamanho gravado na montagem não existe
// mais no cadastro (o Admin pode ter tirado o G do catálogo depois).
export function tamanhoDoProduto(produto: Produto | undefined, tamanho?: "P" | "M" | "G") {
  if (!produto || !tamanho) return undefined;
  return produto.tamanhos?.find((t) => t.tamanho === tamanho);
}


// Tamanhos que a caixa realmente oferece: só os que têm preço e ainda têm
// estoque. Caixa sem nenhum tamanho cadastrado é de tamanho único.
export function tamanhosDisponiveis(produto: Produto) {
  return (produto.tamanhos ?? []).filter((t) => t.price > 0 && t.estoque > 0);
}


// Quantos produtos ainda cabem na caixa. Sem capacidade definida (tamanho
// único ou montagem antiga) não há teto — devolver Infinity poupa o resto do
// código de checar nulo em toda conta.
export function capacidadeDaCaixa(capacidade?: number) {
  return capacidade && capacidade > 0 ? capacidade : Infinity;
}


// Preço da caixa = a caixa vazia + tudo que o cliente colocou dentro
export function precoDaCaixa(caixa: CaixaMontada) {
  return caixa.recipientePreco + caixa.itens.reduce((acum, i) => acum + i.price * i.qty, 0);
}


export function qtdItensDaCaixa(caixa: CaixaMontada) {
  return caixa.itens.reduce((acum, i) => acum + i.qty, 0);
}


// Quantas caixas IDÊNTICAS a esta ainda cabem no estoque. A caixa só existe
// se TODO o conteúdo dela existir, então o limite é o do item mais escasso —
// a caixa vazia incluída.
export function maxCaixasDisponiveis(caixa: CaixaMontada, produtos: Produto[]) {
  const estoqueDe = (id: number) => produtos.find((p) => p.id === id)?.stock ?? 0;
  // A caixa vazia: com um tamanho escolhido, o que limita é o estoque DAQUELE
  // tamanho — o P pode ter acabado com o G ainda cheio na prateleira.
  const produtoRecipiente = produtos.find((p) => p.id === caixa.recipienteId);
  const tam = tamanhoDoProduto(produtoRecipiente, caixa.recipienteTamanho);
  const limites = [
    tam ? tam.estoque : produtoRecipiente?.stock ?? 0,
    ...caixa.itens.map((i) => Math.floor(estoqueDe(i.produtoId) / Math.max(1, i.qty))),
  ];
  return Math.max(0, Math.min(...limites));
}


// Transforma a caixa montada em uma linha de carrinho. O "produto" dessa
// linha é sintético: preço somado, foto da caixa escolhida e um id negativo
// (ver idDeLinhaDaCaixa). Os campos que o carrinho usa para calcular —
// parcelamento, frete grátis e desconto no PIX — saem dos produtos de dentro:
//  • parcelas: o MENOR parcelamento entre eles (ninguém parcela além do que o
//    Admin permitiu naquele produto);
//  • frete grátis: só se todos tiverem;
//  • desconto PIX: a soma dos descontos de cada produto, convertida de volta
//    para % do total — o carrinho aplica o desconto linha a linha.
export function linhaDeCarrinhoDaCaixa(caixa: CaixaMontada, produtos: Produto[]): ItemCarrinho {
  const partes = [
    { produto: produtos.find((p) => p.id === caixa.recipienteId), preco: caixa.recipientePreco, qty: 1 },
    ...caixa.itens.map((i) => ({ produto: produtos.find((p) => p.id === i.produtoId), preco: i.price, qty: i.qty })),
  ];
  const price = precoDaCaixa(caixa);
  const descontoPixEmReais = partes.reduce(
    (acum, parte) => acum + parte.preco * parte.qty * ((parte.produto?.pixDesconto ?? 0) / 100),
    0
  );
  return {
    id: idDeLinhaDaCaixa(caixa.id),
    name: `Caixa personalizada · ${caixa.recipienteNome}${caixa.recipienteTamanho ? ` (${caixa.recipienteTamanho})` : ""}`,
    brand: "Montada por você",
    price,
    installments: maxParcelasDoCarrinho(partes.map((parte) => parte.produto ?? { installments: 1 })),
    rating: 0,
    reviews: 0,
    image: caixa.recipienteImagem,
    category: "Caixas",
    freeShipping: partes.every((parte) => parte.produto?.freeShipping ?? false),
    stock: maxCaixasDisponiveis(caixa, produtos),
    pixDesconto: price > 0 ? (descontoPixEmReais / price) * 100 : 0,
    qty: 1,
    caixa,
  };
}


// Desmonta o carrinho em produtos de verdade: cada caixa vira o recipiente +
// o conteúdo dela (multiplicado pela quantidade de caixas iguais). É esta
// lista que dá baixa no estoque, no site e no servidor (/api/checkout).
export function itensParaEstoque(itens: ItemCarrinho[]) {
  const soltos: { id: number; qty: number; corEscolhida?: string; tamanhoEscolhido?: string }[] = [];
  for (const item of itens) {
    if (item.caixa) {
      // O tamanho vai junto: no servidor a baixa desce no estoque daquele
      // tamanho, do mesmo jeito que a cor escolhida faz nos produtos comuns.
      soltos.push({ id: item.caixa.recipienteId, qty: item.qty, tamanhoEscolhido: item.caixa.recipienteTamanho });
      for (const dentro of item.caixa.itens) {
        soltos.push({ id: dentro.produtoId, qty: dentro.qty * item.qty });
      }
    } else {
      soltos.push({ id: item.id, qty: item.qty, corEscolhida: item.corEscolhida });
    }
  }
  // O mesmo produto pode aparecer solto no carrinho E dentro de uma caixa —
  // junta tudo numa linha só por produto/cor, para o servidor dar uma baixa
  // única (duas baixas seguidas do mesmo produto gerariam alerta duplicado).
  const juntos: typeof soltos = [];
  for (const solto of soltos) {
    const igual = juntos.find(
      (j) => j.id === solto.id && j.corEscolhida === solto.corEscolhida && j.tamanhoEscolhido === solto.tamanhoEscolhido
    );
    if (igual) igual.qty += solto.qty;
    else juntos.push({ ...solto });
  }
  return juntos;
}


// Texto da caixa no pedido: é por ele que o Admin sabe o que montar e o que
// escrever no cartão, então lista o recipiente, o conteúdo e a dedicatória.
export function textoDoPedidoDaCaixa(caixa: CaixaMontada, qty: number) {
  const conteudo = caixa.itens
    .map((i) => (i.qty > 1 ? `${i.name} (${i.qty}x)` : i.name))
    .join(", ");
  const cartao = [
    caixa.para ? `Para: ${caixa.para}` : "",
    caixa.de ? `De: ${caixa.de}` : "",
    caixa.mensagem ? `"${caixa.mensagem}"` : "",
  ].filter(Boolean).join(" · ");
  const partes = [
    `Caixa personalizada — ${caixa.recipienteNome}${caixa.recipienteTamanho ? ` · tamanho ${caixa.recipienteTamanho}` : ""}`,
    `Conteúdo: ${conteudo}`,
  ];
  if (cartao) partes.push(`Cartão: ${cartao}`);
  const texto = partes.join(" | ");
  return qty > 1 ? `${texto} (${qty}x)` : texto;
}


// Detecta a bandeira do cartão a partir dos primeiros dígitos digitados —
// usado só para exibição (ex.: "Visa"), nunca para validar o cartão de verdade.
export function bandeiraCartao(numero: string): string {
  const n = numero.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "American Express";
  if (/^6(011|5)/.test(n)) return "Elo";
  if (/^636368|^438935|^504175|^451416/.test(n)) return "Elo";
  return "Cartão";
}


// Formatação dos campos de cartão (número em blocos de 4, validade MM/AA) —
// usada tanto no pagamento com cartão quanto no formulário de "Meus Cartões"
// do perfil, para manter a digitação idêntica nos dois lugares.
export function formatarNumeroCartao(v: string) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function formatarValidadeCartao(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

// CPF do titular do cartão — o Mercado Pago exige esse dado (identificationNumber)
// para gerar o token do cartão no Brasil, mesmo em cartões de teste.
export function formatarCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}


// O código de ativação do vendedor (ex.: CP-7K2M9X) é gerado no SERVIDOR, em
// backend-php/api/recrutamentos.php: só lá dá para conferir que ele não repete
// um código já existente — o navegador do Master só enxerga a própria equipe.


// Código de venda pessoal de uma conta (ex.: CV-9X2K4M).
// É FIXO e ÚNICO: derivado do e-mail da conta, nunca muda e é o mesmo em
// qualquer dispositivo. O cliente informa esse código ao comprar e a venda
// é creditada somente à conta dona do código (Master ou vendedor).
export function codigoVendaDe(email: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const s = email.trim().toLowerCase();
  // Hash djb2 do e-mail: o mesmo e-mail sempre gera o mesmo código
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  let c = "";
  let v = h;
  for (let i = 0; i < 6; i++) {
    c += chars[v % chars.length];
    v = Math.floor(v / chars.length);
  }
  return `CV-${c}`;
}


// Lê um valor salvo no navegador (localStorage) com segurança
export function lerArmazenamento<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}


// Confere se um cliente comprou um produto (pedido com status Pago ou
// Entregue) — usado pra só deixar quem comprou avaliar o produto. Os pedidos
// não guardam o id do produto (só o nome, ver App.tsx/confirmarPagamento),
// então a comparação é pelo nome: "Nome do Produto" ou "Nome do Produto (2x)".
export function produtoFoiCompradoPor(email: string, produto: Produto, pedidos: Pedido[]) {
  const emailLimpo = email.trim().toLowerCase();
  return pedidos.some(
    (o) =>
      o.email.trim().toLowerCase() === emailLimpo &&
      (o.status === "Pago" || o.status === "Entregue") &&
      // "Nome", "Nome (2x)", "Nome - Cor" ou "Nome - Cor (2x)" — cobre compras
      // com e sem cor escolhida
      (o.items === produto.name ||
        o.items.startsWith(`${produto.name} (`) ||
        o.items.startsWith(`${produto.name} - `))
  );
}


// Média (arredondada em 1 casa) e quantidade de notas de uma lista de
// avaliações — usado pra atualizar o resumo (estrelas) do produto na hora,
// sem esperar recarregar a página.
export function mediaAvaliacoes(notas: number[]): { media: number; qtd: number } {
  if (notas.length === 0) return { media: 0, qtd: 0 };
  const soma = notas.reduce((acum, n) => acum + n, 0);
  return { media: Math.round((soma / notas.length) * 10) / 10, qtd: notas.length };
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

// Formata números como moeda brasileira (R$)
export const formatarMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const precoParcela = (price: number, n: number) => formatarMoeda(price / n);
export const pctDesconto = (orig: number, curr: number) =>
  Math.round(((orig - curr) / orig) * 100);

// Máximo de parcelas do carrinho no cartão: vale o parcelamento cadastrado no
// produto (campo "Parcelamento" do Admin). Com vários produtos, manda o MENOR
// deles — nenhum item pode ser parcelado além do que o Admin permitiu.
// "teto" é o limite geral da loja (MAX_PARCELAS_CARTAO).
export function maxParcelasDoCarrinho(items: { installments?: number }[], teto = 12) {
  if (items.length === 0) return 1;
  const menor = items.reduce((min, i) => {
    const n = Math.floor(i.installments ?? 1);
    return Math.min(min, n >= 1 ? n : 1);
  }, teto);
  return Math.max(1, Math.min(menor, teto));
}


// ─── Onde a loja entrega ──────────────────────────────────────────────────────
//
// O Admin escreve os nomes à mão em Configurações, então a comparação não pode
// depender de acento nem de maiúscula: "altonia", "ALTÔNIA" e "Altônia" são a
// mesma cidade. normalize("NFD") separa a letra do acento e o replace apaga só
// o acento, deixando a letra.
const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Quebra o texto do Admin ("Altônia, Pérola , Xambrê") na lista de cidades,
// descartando vírgula sobrando e espaço em branco.
export function cidadesAtendidasLista(texto: string | undefined): string[] {
  return (texto ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
}

// A loja entrega neste endereço? Lista vazia = sim, em todo o Paraná (é como
// a loja funcionava antes deste campo existir, e é o que vale para um banco
// que ainda não rodou a migração).
export function entregaNaCidade(
  localidade: string,
  uf: string,
  cidadesAtendidas: string | undefined,
): boolean {
  if (uf !== "PR") return false;
  const lista = cidadesAtendidasLista(cidadesAtendidas);
  if (lista.length === 0) return true;
  const alvo = semAcento(localidade);
  return lista.some((c) => semAcento(c) === alvo);
}

// "Altônia", "Altônia e Pérola", "Altônia, Pérola e Xambrê" — para dizer ao
// cliente onde a loja entrega sem ficar com vírgula solta no fim da frase.
export function textoCidadesAtendidas(cidadesAtendidas: string | undefined): string {
  const lista = cidadesAtendidasLista(cidadesAtendidas);
  if (lista.length === 0) return "todo o Paraná";
  if (lista.length === 1) return lista[0];
  return `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
}
