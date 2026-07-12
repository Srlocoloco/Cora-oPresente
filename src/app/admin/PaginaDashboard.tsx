// Pagina Admin: PaginaDashboard

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShoppingBag, Users, TrendingUp, Tag } from "lucide-react";
import type { Produto, Pedido, Cliente } from "../types";
import { NOMES_MESES, CORES_CATEGORIA } from "../constantes";
import { categoriaExibida, formatarMoeda } from "../utils";
import { SeloStatus } from "../components/SeloStatus";

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function PaginaDashboard({ pedidos, clientes, titulo = "Desempenho da Empresa", aoVerTodosPedidos }: { pedidos: Pedido[]; clientes: Cliente[]; titulo?: string; aoVerTodosPedidos: () => void }) {
  const agora = new Date();
  const mesAtual = NOMES_MESES[agora.getMonth()];
  const pedidosValidos = pedidos.filter((o) => o.status !== "Cancelado");
  const pedidosDoMes = pedidosValidos.filter((o) => o.month === mesAtual);
  const vendasDoMes = pedidosDoMes.reduce((acum, o) => acum + o.total, 0);
  const ticketMedio = pedidosDoMes.length > 0 ? vendasDoMes / pedidosDoMes.length : 0;

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

  const metricas = [
    { label: `Faturamento (${mesAtual})`, value: formatarMoeda(vendasDoMes), icon: <TrendingUp size={18} />, bg: "bg-red-50", color: "text-[#C8102E]" },
    { label: `Pedidos (${mesAtual})`, value: String(pedidosDoMes.length), icon: <ShoppingBag size={18} />, bg: "bg-emerald-50", color: "text-emerald-600" },
    { label: "Clientes Novos", value: String(clientes.length), icon: <Users size={18} />, bg: "bg-purple-50", color: "text-purple-600" },
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
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={dadosVendas} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C8102E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#C8102E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: any) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, ""]}
                contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="vendas" stroke="#C8102E" strokeWidth={2.5} fill="url(#gradVendas)" name="Vendas" />
            </AreaChart>
          </ResponsiveContainer>
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
