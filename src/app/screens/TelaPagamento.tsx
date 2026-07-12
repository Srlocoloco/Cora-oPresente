// Tela TelaPagamento

import { Plus, CreditCard, ChevronLeft, Check, Zap, Lock, FileText } from "lucide-react";
import type { Tela, DadosPagamento } from "../types";
import { formatarMoeda, precoParcela } from "../utils";
import { Logo } from "../components/Logo";

// ─── Tela de Pagamento ─────────────────────────────────────────────────────────

// Mostra o resumo do pagamento escolhido e pede a confirmação final
export function TelaPagamento({
  dados,
  aoConfirmar,
  aoVoltar,
}: {
  dados: DadosPagamento;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  const rotulos = { cartao: "Cartão de Crédito", boleto: "Boleto Bancário", pix: "PIX" } as const;
  const icones = { cartao: <CreditCard size={36} />, boleto: <FileText size={36} />, pix: <Zap size={36} /> };
  const descricoes = {
    cartao: `${dados.parcelas}x de ${precoParcela(dados.total, dados.parcelas)} sem juros`,
    boleto: "Vencimento em 3 dias úteis após a emissão",
    pix: "Aprovação imediata",
  } as const;

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1440px] mx-auto flex items-center gap-4">
          <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            Voltar ao carrinho
          </button>
          <div className="flex-1 flex justify-center">
            <Logo />
          </div>
          <div className="w-36" />
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="mb-2 flex justify-center text-[#C8102E]">{icones[dados.metodo]}</div>
            <h2 className="text-xl font-black text-gray-900">Pagamento via {rotulos[dados.metodo]}</h2>
            <p className="text-[13px] text-gray-500 mt-1">{descricoes[dados.metodo]}</p>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-semibold">Total a pagar</span>
              <span className="text-2xl font-black text-gray-900">{formatarMoeda(dados.total)}</span>
            </div>

            <button
              onClick={aoConfirmar}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Confirmar Pagamento
            </button>
            <button
              onClick={aoVoltar}
              className="w-full border-2 border-gray-200 text-gray-600 hover:border-gray-300 font-bold py-3 rounded-xl transition-colors text-sm"
            >
              Voltar ao carrinho
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-gray-400">
              <Lock size={11} />
              <span>Pagamento 100% seguro e protegido</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
