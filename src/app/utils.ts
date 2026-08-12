// Funcoes auxiliares puras

import type { Cupom, Pedido, Produto } from "./types";
import { NIVEIS_VENDEDOR, BONUS_NIVEL_OURO, BONUS_NIVEL_DIAMANTE, CATEGORIAS, PREFIXOS_CATEGORIA } from "./constantes";

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


export function bonusDeNivel(vendasTotais: number) {
  let bonus = 0;
  if (vendasTotais >= NIVEIS_VENDEDOR[2].min) bonus += BONUS_NIVEL_OURO;
  if (vendasTotais >= NIVEIS_VENDEDOR[3].min) bonus += BONUS_NIVEL_DIAMANTE;
  return bonus;
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


// Gera um código único de ativação (ex.: CP-7K2M9X)
export function gerarCodigoRecrutamento() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return `CP-${c}`;
}


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
