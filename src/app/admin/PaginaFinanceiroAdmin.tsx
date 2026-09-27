// Pagina Admin: PaginaFinanceiroAdmin

import type { ReactNode } from "react";
import { ShoppingBag, Users, TrendingUp, Crown, Award, Wallet, Info } from "lucide-react";
import type { Cargo, Recrutamento, Pedido, Cliente } from "../types";
import { NOMES_MESES } from "../constantes";
import { formatarMoeda, pedidoNoMes } from "../utils";
import { type RegrasComissao, pct, pedidoGeraComissao, vendidoPor, resumoComissoes } from "../comissoes";

// ─── Página Financeiro (Admin) ────────────────────────────────────────────────
//
// Faturamento e o custo de comissão de cada pessoa da rede, calculados com as
// regras de Configurações → Comissões. Pedido "Aguardando pagamento" não é
// venda ainda e não entra em nada aqui. O valor que é PAGO de fato a cada um
// está em Repasses (comissão lançada venda a venda no momento do pagamento).

interface LinhaFinanceiro {
  email: string;
  nome: string;
  vendeu: number;
  tamanhoEquipe: number;
  propria: number;
  equipe: number;
  repasse: number;
  total: number;
}

type Coluna = "propria" | "equipe" | "repasse";

function TabelaCargo({ titulo, icone, regra, linhas, colunas }: {
  titulo: string;
  icone: ReactNode;
  regra: string;
  linhas: LinhaFinanceiro[];
  colunas: Coluna[];
}) {
  const rotulos: Record<Coluna, string> = { propria: "Vendas próprias", equipe: "Equipe / rede", repasse: "Rede dos Masters" };
  return (
    <section className="painel overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 text-[15px] flex items-center gap-2">{icone}{titulo}</h3>
        <p className="text-[12px] text-gray-500 mt-0.5">{regra}</p>
      </div>
      {linhas.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-400 text-[13px]">Ninguém com este cargo ainda.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[12.5px] text-gray-500">
              <tr>
                <th className="text-left px-5 py-2.5 font-semibold">Pessoa</th>
                <th className="text-right px-3 py-2.5 font-semibold">Vendeu</th>
                {colunas.map((c) => <th key={c} className="text-right px-3 py-2.5 font-semibold">{rotulos[c]}</th>)}
                <th className="text-right px-5 py-2.5 font-semibold">Comissão total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map((l) => (
                <tr key={l.email}>
                  <td className="px-5 py-3">
                    <div className="font-bold text-gray-800">{l.nome}</div>
                    <div className="text-[12.5px] text-gray-400">
                      {l.email}{l.tamanhoEquipe > 0 ? ` · ${l.tamanhoEquipe} ${l.tamanhoEquipe === 1 ? "pessoa" : "pessoas"} na equipe` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{formatarMoeda(l.vendeu)}</td>
                  {colunas.map((c) => <td key={c} className="px-3 py-3 text-right tabular-nums">{formatarMoeda(l[c])}</td>)}
                  <td className="px-5 py-3 text-right font-bold text-emerald-700 tabular-nums">{formatarMoeda(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Cartao({ label, valor, icone, dica }: { label: string; valor: string; icone: ReactNode; dica?: string }) {
  return (
    <div className="painel p-4 flex items-center gap-3">
      <span className="flex-shrink-0">{icone}</span>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 truncate">{valor}</div>
        <div className="text-[12.5px] text-gray-500 font-semibold">{label}</div>
        {dica && <div className="text-[12px] text-gray-400">{dica}</div>}
      </div>
    </div>
  );
}

export function PaginaFinanceiroAdmin({
  pedidos,
  cargos,
  clientes,
  recrutamentos,
  vinculosMasterPlus = {},
  regras,
}: {
  pedidos: Pedido[];
  cargos: Record<string, Cargo>;
  clientes: Cliente[];
  recrutamentos: Recrutamento[];
  vinculosMasterPlus?: Record<string, string>;
  regras: RegrasComissao;
}) {
  const validos = pedidos.filter(pedidoGeraComissao);
  const faturamentoTotal = validos.reduce((acum, o) => acum + o.total, 0);
  const agora = new Date();
  const mesAtual = NOMES_MESES[agora.getMonth()];
  const faturamentoMes = validos
    .filter((o) => pedidoNoMes(o, agora.getMonth(), agora.getFullYear(), mesAtual))
    .reduce((acum, o) => acum + o.total, 0);
  const aguardando = pedidos.filter((o) => o.status === "Aguardando pagamento");
  const rede = { cargos, recrutamentos, vinculosMasterPlus, pedidos, regras };
  const nomeDe = (email: string) => clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;

  const linhasDoCargo = (cargo: Cargo): LinhaFinanceiro[] =>
    Object.keys(cargos)
      .filter((e) => cargos[e] === cargo)
      .map((email) => ({
        email,
        nome: nomeDe(email),
        vendeu: vendidoPor(email, pedidos),
        tamanhoEquipe: recrutamentos.filter((x) => x.recrutador.toLowerCase() === email && x.ativado).length,
        ...resumoComissoes(email, rede),
      }))
      .sort((a, b) => b.total - a.total);

  const vendedores = linhasDoCargo("vendedor");
  const masters = linhasDoCargo("master");
  const masterPlus = linhasDoCargo("masterplus");
  const custoTotal = [...vendedores, ...masters, ...masterPlus].reduce((s, l) => s + l.total, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao label="Faturamento total" valor={formatarMoeda(faturamentoTotal)} icone={<TrendingUp size={22} className="text-emerald-600" />} dica="pedidos pagos, sem cancelados" />
        <Cartao label={`Faturamento de ${mesAtual}`} valor={formatarMoeda(faturamentoMes)} icone={<TrendingUp size={22} className="text-[#C8102E]" />} />
        <Cartao
          label="Pedidos pagos"
          valor={String(validos.length)}
          icone={<ShoppingBag size={22} className="text-[#C8102E]" />}
          dica={aguardando.length ? `${aguardando.length} aguardando pagamento` : undefined}
        />
        <Cartao
          label="Custo total de comissões"
          valor={formatarMoeda(custoTotal)}
          icone={<Wallet size={22} className="text-amber-600" />}
          dica={faturamentoTotal > 0 ? `${pct(custoTotal / faturamentoTotal)} do faturamento` : undefined}
        />
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-[12.5px] text-sky-900 flex gap-2.5 leading-relaxed">
        <Info size={17} className="flex-shrink-0 mt-0.5" />
        <span>
          Estes totais são a comissão acumulada de cada pessoa, pelas regras atuais. O que já foi pago e o que está liberado
          para pagar fica em <span className="font-bold">Repasses</span> — lá cada venda tem a comissão congelada no dia do pagamento.
        </span>
      </div>

      <TabelaCargo
        titulo="Vendedores"
        icone={<Users size={16} className="text-[#C8102E]" />}
        regra="Faixa pelo total vendido: 4% (até R$ 500) · 6% (até R$ 1.500) · 8% (até R$ 3.000) · 10% (acima)."
        linhas={vendedores}
        colunas={["propria"]}
      />
      <TabelaCargo
        titulo="Masters"
        icone={<Award size={16} className="text-[#C8102E]" />}
        regra={`${pct(regras.masterPropria)} sobre as próprias vendas + ${pct(regras.masterRede)} sobre as vendas da rede (vendedores que ele cadastrou).`}
        linhas={masters}
        colunas={["propria", "equipe"]}
      />
      <TabelaCargo
        titulo="MasterPlus"
        icone={<Crown size={16} className="text-[#4A1218]" />}
        regra={`${pct(regras.masterPlusPropria)} sobre as próprias vendas + ${pct(regras.masterPlusEquipe)} sobre a equipe direta + ${pct(regras.masterPlusRepasse)} sobre a rede de cada Master que promoveu.`}
        linhas={masterPlus}
        colunas={["propria", "equipe", "repasse"]}
      />
    </div>
  );
}
