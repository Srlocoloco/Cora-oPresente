// Pagina Admin: PaginaPedidosAdmin

import { useState } from "react";
import { Eye } from "lucide-react";
import type { Produto, Pedido, Cliente } from "../types";
import { formatarMoeda } from "../utils";
import { SeloStatus } from "../components/SeloStatus";
import { ModalDetalhesPedido } from "../components/ModalDetalhesPedido";

// ─── Orders Admin ─────────────────────────────────────────────────────────────

export function PaginaPedidosAdmin({
  pedidos,
  aoAtualizarStatus,
  comissaoPorPedido,
  modo = "admin",
}: {
  pedidos: Pedido[];
  aoAtualizarStatus: (id: string, status: string) => void;
  // Quando informada, mostra quanto a conta logada ganha de comissão em cada
  // venda (vendedor: comissão do nível atual em todas as linhas · master:
  // varia linha a linha — 10% fixo nas próprias vendas, % da equipe nas dos
  // vendedores, e nada nas vendas sem código)
  comissaoPorPedido?: (o: Pedido) => number;
  // Status do pedido e o botão de "ver detalhes" (endereço, forma de
  // pagamento etc.) são operacionais — só o Admin cuida da entrega e por
  // isso só ele vê essas colunas. Master/MasterPlus/Vendedor só acompanham
  // o valor da própria comissão em cada venda.
  modo?: "admin" | "master" | "masterplus" | "vendedor";
}) {
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const ehAdmin = modo === "admin";
  const listaStatus = ["Todos", "Processando", "Em trânsito", "Entregue", "Cancelado"];
  const visiveis = filtroStatus === "Todos" ? pedidos : pedidos.filter((o) => o.status === filtroStatus);
  const contagens = listaStatus.reduce((acum, s) => {
    acum[s] = s === "Todos" ? pedidos.length : pedidos.filter((o) => o.status === s).length;
    return acum;
  }, {} as Record<string, number>);
  const mostrarComissao = comissaoPorPedido !== undefined;
  const totalColunas = 5 + (ehAdmin ? 1 : 0) + (mostrarComissao ? 1 : 0) + (ehAdmin ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {listaStatus.map((s) => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors flex items-center gap-1.5 ${
              filtroStatus === s ? "bg-[#C8102E] text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
            }`}
          >
            {s}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${filtroStatus === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {contagens[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold">Pedido</th>
                <th className="text-left px-5 py-3.5 font-semibold">Cliente</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Produto</th>
                <th className="text-left px-5 py-3.5 font-semibold">Total</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Data</th>
                {ehAdmin && <th className="text-left px-5 py-3.5 font-semibold">Status</th>}
                {mostrarComissao && <th className="text-left px-5 py-3.5 font-semibold">Sua comissão</th>}
                {ehAdmin && <th className="px-5 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={totalColunas} className="px-5 py-12 text-center text-gray-400 text-[13px]">
                    Nenhum pedido encontrado — as compras dos clientes aparecerão aqui.
                  </td>
                </tr>
              )}
              {visiveis.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                        {o.customer[0]}
                      </div>
                      <span className="font-semibold text-gray-800">{o.customer}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-gray-500 hidden md:table-cell">{o.items}</td>
                  <td className="px-5 py-4 font-black text-gray-900">{formatarMoeda(o.total)}</td>
                  <td className="px-5 py-4 text-[12px] text-gray-400 hidden lg:table-cell">{o.date}</td>
                  {ehAdmin && (
                    <td className="px-5 py-4"><SeloStatus status={o.status} /></td>
                  )}
                  {mostrarComissao && (
                    <td className="px-5 py-4 font-black text-emerald-600">
                      {o.status === "Cancelado" || !comissaoPorPedido
                        ? "—"
                        : `+${formatarMoeda(comissaoPorPedido(o))}`}
                    </td>
                  )}
                  {ehAdmin && (
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setPedidoSelecionado(o)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                        title="Ver detalhes da compra"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pedidoSelecionado && (
        <ModalDetalhesPedido
          pedido={pedidoSelecionado}
          aoFechar={() => setPedidoSelecionado(null)}
          aoAtualizarStatus={(s) => {
            aoAtualizarStatus(pedidoSelecionado.id, s);
            setPedidoSelecionado({ ...pedidoSelecionado, status: s });
          }}
        />
      )}
    </div>
  );
}
