// Tela TelaNotificacoesCliente

import { Package, Bell, Plus, ChevronLeft } from "lucide-react";
import type { Pedido } from "../types";
import { NOTIFICACAO_POR_STATUS } from "../constantes";
import { formatarMoeda } from "../utils";

export function TelaNotificacoesCliente({ pedidos, aoVoltar }: { pedidos: Pedido[]; aoVoltar: () => void }) {
  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-[#C8102E] px-4 py-4">
        <div className="max-w-[720px] mx-auto flex items-center gap-3">
          <button onClick={aoVoltar} className="text-white/90 hover:text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-white font-black text-lg">Notificações</h1>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 py-5 space-y-2.5">
        {pedidos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400">
            <Bell size={36} strokeWidth={1} className="mx-auto mb-3" />
            <p className="font-medium text-[13px]">Nenhuma notificação por enquanto.</p>
            <p className="text-[12px] mt-1">O andamento das suas compras vai aparecer aqui.</p>
          </div>
        ) : (
          pedidos.map((o) => {
            const n = NOTIFICACAO_POR_STATUS[o.status] ?? {
              icon: <Package size={18} className="text-gray-400" />,
              texto: (id: string) => `Pedido ${id}: ${o.status}`,
              cor: "bg-gray-50",
            };
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${n.cor}`}>
                  {n.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800">{n.texto(o.id)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{o.items} · {formatarMoeda(o.total)} · {o.date}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
