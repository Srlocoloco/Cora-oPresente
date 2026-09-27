// ─── Regras de comissão (um lugar só) ─────────────────────────────────────────
//
// Antes os percentuais estavam escritos à mão em sete telas diferentes (7% do
// Master em uma, 1% "de promovido" em outra...). Mudar a regra exigia caçar
// todos — e as telas acabavam mostrando números diferentes do que se pagava.
//
// Agora os percentuais vêm da Configuração da loja (Admin → Configurações →
// Comissões) e toda tela calcula por aqui. O valor que vale para PAGAR é o do
// servidor (backend-php/api/lib_comissoes.php), lançado venda a venda no
// momento em que o pagamento é aprovado; estas contas servem para mostrar
// estimativas e totais no painel.
//
//   Vendedor    → faixa pelo total vendido: 4% · 6% · 8% · 10%
//   Master      → próprias vendas (padrão 2%) + rede dele (padrão 1%)
//   MasterPlus  → próprias vendas (7%) + equipe direta (2%) + rede dos
//                 Masters que promoveu (1%)

import type { Cargo, ConfigLoja, Pedido, Recrutamento } from "./types";
import { comissaoFracaoPorNivel } from "./utils";

export interface RegrasComissao {
  masterPropria: number;
  masterRede: number;
  masterPlusPropria: number;
  masterPlusEquipe: number;
  masterPlusRepasse: number;
}

// Frações (0.02 = 2%) a partir da configuração, com a regra da loja como padrão.
export function regrasDaConfig(config?: Partial<ConfigLoja> | null): RegrasComissao {
  const f = (v: number | undefined, padrao: number) => (typeof v === "number" && v >= 0 ? v : padrao) / 100;
  return {
    masterPropria: f(config?.comMasterPropria, 2),
    masterRede: f(config?.comMasterRede, 1),
    masterPlusPropria: f(config?.comMasterPlusPropria, 7),
    masterPlusEquipe: f(config?.comMasterPlusEquipe, 2),
    masterPlusRepasse: f(config?.comMasterPlusRepasse, 1),
  };
}

// "2%", "1,5%"
export const pct = (fracao: number) =>
  `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// Só venda paga e não cancelada gera comissão (e conta no total vendido).
export const pedidoGeraComissao = (o: Pedido) => o.status !== "Cancelado" && o.status !== "Aguardando pagamento";

export function vendidoPor(email: string, pedidos: Pedido[]) {
  const e = email.toLowerCase();
  return pedidos.filter((o) => o.vendedor?.toLowerCase() === e && pedidoGeraComissao(o)).reduce((s, o) => s + o.total, 0);
}

// Contexto da rede, para descobrir quem ganha com cada venda.
export interface RedeComissao {
  cargos: Record<string, Cargo>;
  recrutamentos: Recrutamento[];
  vinculosMasterPlus: Record<string, string>;
  pedidos: Pedido[];
  regras: RegrasComissao;
}

// Quem cadastrou este vendedor (considerando só códigos já ativados).
export function liderDe(vendedor: string, recrutamentos: Recrutamento[]): string | null {
  const v = vendedor.toLowerCase();
  return recrutamentos.find((r) => r.email.toLowerCase() === v && r.ativado)?.recrutador.toLowerCase() ?? null;
}

// Quanto `email` ganha com UM pedido (0 se não ganha nada) — mesma regra do servidor.
export function comissaoDoPedidoPara(pedido: Pedido, email: string, rede: RedeComissao): number {
  if (!pedidoGeraComissao(pedido)) return 0;
  const eu = email.toLowerCase();
  const vend = pedido.vendedor?.toLowerCase();
  if (!vend) return 0;
  const cargoVend = rede.cargos[vend];
  const r = rede.regras;

  if (vend === eu) {
    if (cargoVend === "masterplus") return pedido.total * r.masterPlusPropria;
    if (cargoVend === "master") return pedido.total * r.masterPropria;
    if (cargoVend === "vendedor") return pedido.total * comissaoFracaoPorNivel(vendidoPor(eu, rede.pedidos));
    return 0;
  }
  if (cargoVend !== "vendedor") return 0;
  const lider = liderDe(vend, rede.recrutamentos);
  if (!lider) return 0;
  if (lider === eu) {
    if (rede.cargos[eu] === "master") return pedido.total * r.masterRede;
    if (rede.cargos[eu] === "masterplus") return pedido.total * r.masterPlusEquipe;
    return 0;
  }
  // Repasse: o vendedor é da rede de um Master que EU (MasterPlus) promovi
  if (rede.cargos[eu] === "masterplus" && rede.cargos[lider] === "master" && rede.vinculosMasterPlus[lider] === eu) {
    return pedido.total * r.masterPlusRepasse;
  }
  return 0;
}

// Resumo de quanto uma pessoa ganha e de onde (para Financeiro, Rede e Masters).
export function resumoComissoes(email: string, rede: RedeComissao) {
  const eu = email.toLowerCase();
  let propria = 0;
  let equipe = 0;
  let repasse = 0;
  for (const o of rede.pedidos) {
    const valor = comissaoDoPedidoPara(o, eu, rede);
    if (valor === 0) continue;
    const vend = o.vendedor?.toLowerCase();
    if (vend === eu) propria += valor;
    else if (liderDe(vend ?? "", rede.recrutamentos) === eu) equipe += valor;
    else repasse += valor;
  }
  return { propria, equipe, repasse, total: propria + equipe + repasse };
}

// Frase curta explicando a regra de cada cargo (mostrada nos painéis).
export function explicacaoDoCargo(cargo: Cargo | "admin" | undefined, regras: RegrasComissao): string {
  if (cargo === "masterplus") {
    return `Você ganha ${pct(regras.masterPlusPropria)} nas suas vendas, ${pct(regras.masterPlusEquipe)} nas vendas da sua equipe e ${pct(regras.masterPlusRepasse)} nas vendas da rede de cada Master que você promoveu.`;
  }
  if (cargo === "master") {
    return `Você ganha ${pct(regras.masterPropria)} nas suas vendas e ${pct(regras.masterRede)} nas vendas da sua rede (os vendedores que você cadastrou).`;
  }
  if (cargo === "vendedor") {
    return "Você ganha de 4% a 10% em cada venda, conforme o total que já vendeu (Bronze 4% · Prata 6% · Ouro 8% · Diamante 10%).";
  }
  return "";
}
