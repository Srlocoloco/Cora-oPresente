// Tela TelaCompraConcluida

import { Check, Star } from "lucide-react";
import type { Produto } from "../types";
import { formatarMoeda } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";

// ─── Pedido Success ────────────────────────────────────────────────────────────

// Depois da compra confirmada, convida o cliente a avaliar o que comprou:
// clicando no produto, ele vai direto para a seção de avaliações da página
// daquele produto (o formulário já fica liberado, porque a compra existe).
export function TelaCompraConcluida({
  total,
  produtosComprados = [],
  aoAvaliarProduto,
  aoContinuar,
}: {
  total: number;
  produtosComprados?: Produto[];
  aoAvaliarProduto?: (p: Produto) => void;
  aoContinuar: () => void;
}) {
  const podeAvaliar = produtosComprados.length > 0 && Boolean(aoAvaliarProduto);
  return (
    <div className="min-h-screen bg-[#FBF4EA] flex items-center justify-center p-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 sm:p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check size={32} className="text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Compra realizada!</h2>
        <p className="text-gray-500 text-sm mb-1">Seu pedido foi registrado com sucesso.</p>
        <div className="text-3xl font-black text-gray-900 my-4">{formatarMoeda(total)}</div>
        <p className="text-[12px] text-gray-400 mb-6">Você receberá as atualizações do pedido por e-mail.</p>

        {podeAvaliar && (
          <div className="border-t border-gray-100 pt-5 mb-5 text-left">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Star size={16} className="fill-[#E8B84B] text-[#E8B84B]" />
              <h3 className="font-black text-gray-900 text-[14px]">O que achou? Avalie sua compra</h3>
            </div>
            <p className="text-[12px] text-gray-400 text-center mb-3">
              Sua opinião ajuda outros clientes a escolher.
            </p>
            <div className="space-y-2">
              {produtosComprados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => aoAvaliarProduto?.(p)}
                  className="w-full flex items-center gap-3 border border-gray-100 hover:border-[#C8102E] rounded-xl p-2.5 text-left transition-colors"
                >
                  <div className="w-11 h-11 bg-gray-50 rounded-lg flex items-center justify-center p-1 flex-shrink-0">
                    <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2 flex-1 min-w-0">
                    {p.name}
                  </span>
                  <span className="text-[12px] font-black text-[#C8102E] flex-shrink-0">Avaliar</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={aoContinuar}
          className={`w-full font-black py-3.5 rounded-xl transition-colors ${
            podeAvaliar
              ? "border-2 border-gray-200 text-gray-600 hover:border-gray-300"
              : "bg-[#C8102E] hover:bg-[#8C1626] text-white"
          }`}
        >
          Continuar Comprando
        </button>
      </div>
    </div>
  );
}
