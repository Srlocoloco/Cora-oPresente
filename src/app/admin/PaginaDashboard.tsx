// Pagina Admin: PaginaDashboard

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShoppingBag, Users, TrendingUp, Tag } from "lucide-react";
import type { Produto, Pedido, Cliente } from "../types";
import { NOMES_MESES, CORES_CATEGORIA, EMAIL_ADMIN } from "../constantes";
import { categoriaExibida, formatarMoeda } from "../utils";
import { SeloStatus } from "../components/SeloStatus";

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function PaginaDashboard({
  pedidos,
  clientes,
  titulo = "Desempenho da Empresa",
  aoVerTodosPedidos,
  modo = "admin",
}: {
  pedidos: Pedido[];
  clientes: Cliente[];
  titulo?: string;
  aoVerTodosPedidos: () => void;
  // O ranking "Quem mais vende" mistura Masters, MasterPlus e Vendedores de
  // toda a loja — faz sentido para quem vende (ver como está se saindo vs.
  // os colegas), mas não para o Admin, que não participa desse ranking e só
  // veria uma lista de terceiros sem contexto de "vs. você".
  modo?: "admin" | "master" | "masterplus" | "vendedor";
}) {
  const agora = new Date();
  const mesAtual = NOMES_MESES[agora.getMonth()];
  const pedidosValidos = pedidos.filter((o) => o.status !== "Cancelado");
  const pedidosDoMes = pedidosValidos.filter((o) => o.month === mesAtual);
  const vendasDoMes = pedidosDoMes.reduce((acum, o) => acum + o.total, 0);
  const ticketMedio = pedidosDoMes.length > 0 ? vendasDoMes / pedidosDoMes.length : 0;

  // "Clientes Novos" reseta toda semana: conta só quem se cadastrou entre a
  // segunda-feira desta semana e hoje (não é um contador que precisa ser
  // zerado manualmente — ele já recalcula sozinho a cada carregamento).
  const inicioSemana = new Date(agora);
  const diaDaSemana = inicioSemana.getDay(); // 0 = domingo, 1 = segunda...
  inicioSemana.setDate(inicioSemana.getDate() - (diaDaSemana === 0 ? 6 : diaDaSemana - 1));
  inicioSemana.setHours(0, 0, 0, 0);
  const clientesNovosSemana = clientes.filter(
    (c) => c.criadoEm && new Date(c.criadoEm + "T12:00:00") >= inicioSemana
  ).length;

  // Gráfico acompanha as vendas reais, mês a mês
  const dadosVendas = NOMES_MESES.slice(0, agora.getMonth() + 1).map((m) => ({
    month: m,
    vendas: pedidosValidos.filter((o) => o.month === m).reduce((acum, o) => acum + o.total, 0),
  }));

  // Participação por categoria a partir das vendas reais (pedidos antigos com
  // uma categoria que não existe mais caem em "Outros" — ver categoriaExibida)
  const totaisPorCategoria: Record<string, number> = {};
  pedidosValidos.forEach((o) => {
    const nome = categoriaExibida(o.category);
    totaisPorCategoria[nome] = (totaisPorCategoria[nome] || 0) + o.total;
  });
  const totalVendido = Object.values(totaisPorCategoria).reduce((a, b) => a + b, 0);
  const dadosCategoria = Object.entries(totaisPorCategoria)
    .map(([name, v]) => ({
      name,
      value: totalVendido > 0 ? Math.round((v / totalVendido) * 100) : 0,
      color: CORES_CATEGORIA[name] || "#94A3B8",
    }))
    .sort((a, b) => b.value - a.value);

  // Formata o eixo Y do gráfico: valores abaixo de R$1.000 aparecem em reais
  // (R$50, R$100...) em vez de sempre "R$0k" — só passa para o formato "k"
  // quando o faturamento realmente passa de mil reais.
  const formatarEixoY = (v: number) => {
    if (v >= 1000) {
      const k = v / 1000;
      return `R$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
    }
    return `R$${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  };

  // Destaques rápidos sobre o próprio gráfico: melhor mês, total do período e
  // média mensal (só considera os meses já decorridos, mesma base do gráfico)
  const totalPeriodo = dadosVendas.reduce((acum, d) => acum + d.vendas, 0);
  const melhorMes = dadosVendas.reduce(
    (melhor, d) => (d.vendas > melhor.vendas ? d : melhor),
    dadosVendas[0] ?? { month: "-", vendas: 0 }
  );
  const mediaMensal = dadosVendas.length > 0 ? totalPeriodo / dadosVendas.length : 0;
  const mesAnteriorDados = dadosVendas[dadosVendas.length - 2];
  const crescimentoMensal =
    mesAnteriorDados && mesAnteriorDados.vendas > 0
      ? ((vendasDoMes - mesAnteriorDados.vendas) / mesAnteriorDados.vendas) * 100
      : null;

  // Ranking de quem mais vende (Masters, MasterPlus e Vendedores, pelo total
  // vendido com o próprio código) — ignora o e-mail do Admin, que é só o
  // "dono" padrão das vendas sem código de venda informado.
  const vendasPorPessoa: Record<string, number> = {};
  pedidosValidos.forEach((o) => {
    const chave = o.vendedor?.toLowerCase();
    if (!chave || chave === EMAIL_ADMIN) return;
    vendasPorPessoa[chave] = (vendasPorPessoa[chave] || 0) + o.total;
  });
  const topVendedores = Object.entries(vendasPorPessoa)
    .map(([email, total]) => ({
      email,
      nome: clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email,
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const metricas = [
    { label: `Faturamento (${mesAtual})`, value: formatarMoeda(vendasDoMes), icon: <TrendingUp size={18} />, bg: "bg-red-50", color: "text-[#C8102E]" },
    { label: `Pedidos (${mesAtual})`, value: String(pedidosDoMes.length), icon: <ShoppingBag size={18} />, bg: "bg-emerald-50", color: "text-emerald-600" },
    { label: "Clientes Novos (semana)", value: String(clientesNovosSemana), icon: <Users size={18} />, bg: "bg-purple-50", color: "text-purple-600" },
    { label: "Ticket Médio", value: formatarMoeda(ticketMedio), icon: <Tag size={18} />, bg: "bg-orange-50", color: "text-orange-500" },
  ];

  return (
    <div className="space-y-5">
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricas.map((m) => (
          <div key={m.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 ${m.bg} ${m.color} rounded-xl`}>{m.icon}</div>
            </div>
            <div className="text-[22px] font-black text-gray-900">{m.value}</div>
            <div className="text-[11px] text-gray-500 font-medium mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-800">{titulo} — {agora.getFullYear()}</h3>
            <div className="flex items-center gap-4 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#C8102E] rounded inline-block" />Vendas</span>
            </div>
          </div>

          {/* Destaques rápidos: melhor mês, total do período, média mensal e
              variação em relação ao mês anterior */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Melhor mês</div>
              <div className="text-[13px] font-black text-gray-900 mt-0.5">{melhorMes.month} · {formatarMoeda(melhorMes.vendas)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Total no período</div>
              <div className="text-[13px] font-black text-gray-900 mt-0.5">{formatarMoeda(totalPeriodo)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Média mensal</div>
              <div className="text-[13px] font-black text-gray-900 mt-0.5">{formatarMoeda(mediaMensal)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Vs. mês anterior</div>
              <div className={`text-[13px] font-black mt-0.5 ${crescimentoMensal === null ? "text-gray-400" : crescimentoMensal >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {crescimentoMensal === null ? "—" : `${crescimentoMensal >= 0 ? "+" : ""}${crescimentoMensal.toFixed(0)}%`}
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={dadosVendas} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C8102E" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#C8102E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={formatarEixoY} />
              <Tooltip
                formatter={(v: any) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, ""]}
                contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }}
              />
              <Area
                type="natural"
                dataKey="vendas"
                stroke="#C8102E"
                strokeWidth={2.5}
                fill="url(#gradVendas)"
                name="Vendas"
                dot={{ r: 4, fill: "#fff", stroke: "#C8102E", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#C8102E", stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Quem mais vende: ranking pelo total vendido com o próprio código
              (não aparece para o Admin — ele não participa do ranking) */}
          {modo !== "admin" && topVendedores.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <h4 className="text-[12px] font-black text-gray-700 mb-3">🏆 Quem mais vende</h4>
              <div className="space-y-2">
                {topVendedores.map((v, i) => (
                  <div key={v.email} className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${
                        i === 0
                          ? "bg-amber-100 text-amber-700"
                          : i === 1
                          ? "bg-gray-200 text-gray-600"
                          : i === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-50 text-gray-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[13px] font-bold text-gray-800 truncate flex-1">{v.nome}</span>
                    <span className="text-[13px] font-black text-emerald-600 flex-shrink-0">{formatarMoeda(v.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-black text-gray-800 mb-5">Por Categoria</h3>
          {dadosCategoria.length === 0 && (
            <p className="text-[12px] text-gray-400 text-center py-8">
              Nenhuma venda registrada ainda
            </p>
          )}
          <div className="space-y-4">
            {dadosCategoria.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-[12px] font-semibold text-gray-700 mb-1.5">
                  <span>{c.name}</span>
                  <span className="font-black">{c.value}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.value}%`, backgroundColor: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-gray-800">Pedidos Recentes</h3>
          <button
            onClick={aoVerTodosPedidos}
            className="text-[12px] text-[#C8102E] font-bold hover:underline"
          >
            Ver todos →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Pedido</th>
                <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Produto</th>
                <th className="text-left px-5 py-3 font-semibold">Total</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pedidos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-[13px]">
                    Nenhum pedido ainda — as compras dos clientes aparecerão aqui.
                  </td>
                </tr>
              )}
              {pedidos.slice(0, 5).map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</td>
                  <td className="px-5 py-3.5 font-semibold text-gray-800">{o.customer}</td>
                  <td className="px-5 py-3.5 text-gray-500 hidden md:table-cell text-[12px]">{o.items}</td>
                  <td className="px-5 py-3.5 font-black text-gray-900">{formatarMoeda(o.total)}</td>
                  <td className="px-5 py-3.5"><SeloStatus status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
