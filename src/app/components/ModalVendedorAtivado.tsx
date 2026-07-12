// Componente ModalVendedorAtivado

import { Check } from "lucide-react";

// ─── Pop-up: conta ativada como Vendedor ───────────────────────────────────────

export function ModalVendedorAtivado({ aoFechar, aoAbrirPainel }: { aoFechar: () => void; aoAbrirPainel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check size={28} className="text-emerald-600" strokeWidth={3} />
        </div>
        <h3 className="font-black text-gray-900 text-lg mb-2">Conta ativada como Vendedor!</h3>
        <p className="text-[13px] text-gray-500 mb-5">
          Você já pode divulgar os produtos da loja com o seu código de venda pessoal e ganhar comissão em cada venda.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={aoAbrirPainel}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-sm"
          >
            Ir para o Painel do Vendedor
          </button>
          <button onClick={aoFechar} className="text-gray-500 hover:text-gray-700 font-semibold text-[13px] py-2">
            Continuar navegando
          </button>
        </div>
      </div>
    </div>
  );
}
