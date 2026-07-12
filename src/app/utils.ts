// Funcoes auxiliares puras

import type { Cupom, Recrutamento, Pedido } from "./types";
import { NIVEIS_VENDEDOR, BONUS_NIVEL_OURO, BONUS_NIVEL_DIAMANTE, BONUS_CONVITE_VENDEDOR, CATEGORIAS } from "./constantes";

// Um cupom vale se está ativo e dentro da validade
export function cupomEstaValido(c: Cupom) {
  return c.ativo && new Date(c.validade + "T23:59:59") >= new Date();
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


export function bonusDeConvite(recrutamentos: Recrutamento[]) {
  return recrutamentos.filter((r) => r.ativado).length * BONUS_CONVITE_VENDEDOR;
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


// ─── Helpers ──────────────────────────────────────────────────────────────────

// Formata números como moeda brasileira (R$)
export const formatarMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const precoParcela = (price: number, n: number) => formatarMoeda(price / n);
export const pctDesconto = (orig: number, curr: number) =>
  Math.round(((orig - curr) / orig) * 100);
