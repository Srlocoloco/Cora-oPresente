// Pagina Admin: PaginaSupervisaoAdmin

import { ShoppingBag, TrendingUp, Award } from "lucide-react";
import type { Cargo, Pedido, Cliente } from "../types";
import { comissaoFracaoPorNivel, bonusDeNivel, codigoVendaDe, formatarMoeda } from "../utils";

// ─── Página Supervisão (somente Admin) ────────────────────────────────────────

// Visão geral de TODOS os vendedores da loja: códigos, vendas, comissão e
// bônus de nível. O painel individual do vendedor mostra apenas os próprios
// dados; esta página é a supervisão completa, exclusiva do Admin.
export function PaginaSupervisaoAdmin({
  pedidos,
  clientes,
  cargos,
}: {
  pedidos: Pedido[];
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
}) {
  const nomeDe = (email: string) => clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;

  const vendasValidas = pedidos.filter((o) => o.status !== "Cancelado");

  const vendedores = Object.keys(cargos).filter((e) => cargos[e] === "vendedor");

  // Resumo de cada vendedor: vendas, comissão do nível atual e bônus de
  // nível (Ouro/Diamante) sobre as vendas totais. Vendedor não tem catálogo
  // próprio — só divulga os produtos da loja com o código dele.
  const dadosVendedores = vendedores.map((email) => {
    const vendas = vendasValidas.filter((o) => o.vendedor?.toLowerCase() === email);
    const totalVendido = vendas.reduce((acum, o) => acum + o.total, 0);
    return {
      email,
      nome: nomeDe(email),
      codigo: codigoVendaDe(email),
      qtdVendas: vendas.length,
      totalVendido,
      comissao: totalVendido * comissaoFracaoPorNivel(totalVendido),
      bonus: bonusDeNivel(totalVendido),
    };
  });

  const comissaoTotal = dadosVendedores.reduce((acum, v) => acum + v.comissao, 0);
  const bonusTotal = dadosVendedores.reduce((acum, v) => acum + v.bonus, 0);
  const vendidoPorVendedores = dadosVendedores.reduce((acum, v) => acum + v.totalVendido, 0);

  const cartoes = [
    { label: "Vendedores", valor: String(vendedores.length), icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
    { label: "Vendido por vendedores", valor: formatarMoeda(vendidoPorVendedores), icone: <TrendingUp size={22} className="text-[#C8102E]" /> },
    { label: "Comissões a pagar", valor: formatarMoeda(comissaoTotal), icone: <TrendingUp size={22} className="text-emerald-600" /> },
    { label: "Bônus de nível a pagar", valor: formatarMoeda(bonusTotal), icone: <Award size={22} className="text-purple-600" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-lg font-black text-gray-900 truncate">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Vendedores */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Vendedores</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Vendas, a comissão do nível atual e o bônus de nível (Ouro/Diamante) de cada vendedor.</p>
        </div>
        {dadosVendedores.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">
            Nenhum vendedor ativo ainda — quem ativar a conta com código aparecerá aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Vendedor</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Código</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Vendas</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Total vendido</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Comissão</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Bônus de nível</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dadosVendedores.map((v) => (
                  <tr key={v.email} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                          {v.nome[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800 truncate">{v.nome}</div>
                          <div className="text-[11px] text-gray-400 truncate">{v.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold hidden md:table-cell">{v.codigo}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">{v.qtdVendas}</td>
                    <td className="px-5 py-4 font-black text-gray-900">{formatarMoeda(v.totalVendido)}</td>
                    <td className="px-5 py-4 font-black text-emerald-600">{formatarMoeda(v.comissao)}</td>
                    <td className="px-5 py-4 font-black text-purple-600">{formatarMoeda(v.bonus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
