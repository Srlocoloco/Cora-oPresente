// Componente PopupRecomendacao
//
// Um cartão discreto no canto da tela com UMA recomendação: foto do produto,
// preço e um toque para abrir. É o "aproveite também" da loja — e o cuidado
// aqui é justamente ele não atrapalhar quem está navegando:
//
//   · nunca cobre a tela (não é modal, não escurece o fundo, não trava o
//     scroll) e fica acima da barra de baixo no celular;
//   · aparece só depois de um tempo de navegação, uma vez por visita, e quem
//     manda nas regras de quando é o App (ver popupRecomendado lá);
//   · fechou, sai na hora e não volta tão cedo.
//
// A foto é parte do conteúdo, não enfeite: é ela que faz a pessoa reconhecer o
// produto sem precisar ler.

import { useEffect, useState } from "react";
import { X, ChevronRight, Sparkles } from "lucide-react";
import type { Produto } from "../types";
import { formatarMoeda } from "../utils";
import { descontoDe } from "../recomendacoes";
import { ImagemProduto } from "./ImagemProduto";

export function PopupRecomendacao({
  produto,
  motivo,
  aoAbrir,
  aoFechar,
}: {
  produto: Produto;
  motivo: string;
  aoAbrir: (p: Produto) => void;
  aoFechar: () => void;
}) {
  // Entra deslizando: o cartão nasce fora da tela e só depois do primeiro
  // quadro ganha a posição final, senão o navegador não anima nada
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), 30);
    return () => clearTimeout(t);
  }, []);

  const desconto = descontoDe(produto);

  return (
    <div
      role="complementary"
      aria-label="Sugestão para você"
      className={`fixed z-40 left-4 right-4 bottom-20 md:left-auto md:right-6 md:bottom-6 md:w-[330px] transition-all duration-300 ${
        visivel ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2 bg-[#FBF4EA] border-b border-gray-100">
          <span className="flex items-center gap-1.5 text-[10.5px] font-black text-[#A8102A] uppercase tracking-wide">
            <Sparkles size={12} />
            Você também pode gostar
          </span>
          <button
            onClick={aoFechar}
            aria-label="Fechar sugestão"
            className="p-1 -mr-1 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <button
          onClick={() => aoAbrir(produto)}
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center p-1 flex-shrink-0">
            <ImagemProduto src={produto.image} alt={produto.name} className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold text-[#A8102A] truncate">{motivo}</p>
            <p className="text-[13px] font-bold text-gray-800 leading-snug line-clamp-2">{produto.name}</p>
            <p className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[14px] font-black text-gray-900">{formatarMoeda(produto.price)}</span>
              {desconto > 0 && (
                <>
                  <span className="text-[11px] text-gray-400 line-through">
                    {formatarMoeda(produto.originalPrice as number)}
                  </span>
                  <span className="text-[10px] font-black text-emerald-600">
                    -{Math.round(desconto * 100)}%
                  </span>
                </>
              )}
            </p>
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}
