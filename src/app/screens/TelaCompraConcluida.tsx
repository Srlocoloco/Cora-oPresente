// Tela TelaCompraConcluida

import { Plus, Check } from "lucide-react";
import type { Pedido } from "../types";
import { formatarMoeda } from "../utils";

// ─── Pedido Success ────────────────────────────────────────────────────────────

export function TelaCompraConcluida({ total, aoContinuar }: { total: number; aoContinuar: () => void }) {
  return (
    <div className="min-h-screen bg-[#FBF4EA] flex items-center justify-center p-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check size={32} className="text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Compra realizada!</h2>
        <p className="text-gray-500 text-sm mb-1">Seu pedido foi registrado com sucesso.</p>
        <div className="text-3xl font-black text-gray-900 my-4">{formatarMoeda(total)}</div>
        <p className="text-[12px] text-gray-400 mb-6">Você receberá as atualizações do pedido por e-mail.</p>
        <button
          onClick={aoContinuar}
          className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3.5 rounded-xl transition-colors"
        >
          Continuar Comprando
        </button>
      </div>
    </div>
  );
}
