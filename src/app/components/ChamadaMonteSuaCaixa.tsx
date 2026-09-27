// Componente ChamadaMonteSuaCaixa
// Chamada da área "Monte sua Caixa" dentro da vitrine: em vez de comprar uma
// caixa pronta, o cliente escolhe a caixa e enche ela do jeito que quiser.
// Mostra fotos de produtos de verdade da loja — dá para ver o que cabe na
// caixa antes de entrar. O caminho todo acontece na PaginaMontarCaixa.

import { ChevronRight } from "lucide-react";
import { ImagemProduto } from "./ImagemProduto";

export function ChamadaMonteSuaCaixa({ aoAbrir, fotos = [] }: { aoAbrir: () => void; fotos?: { src: string; alt: string }[] }) {
  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-6">
      <button
        onClick={aoAbrir}
        className="painel w-full text-left flex items-center gap-4 md:gap-8 px-4 py-4 md:px-8 md:py-6 hover:shadow-md transition-shadow"
      >
        {fotos.length >= 3 && (
          <div className="grid grid-cols-2 gap-1 w-[76px] h-[76px] md:w-[104px] md:h-[104px] flex-shrink-0 bg-[#F5F5F5] rounded p-1">
            {fotos.slice(0, 4).map((f, i) => (
              <div key={i} className="bg-white rounded-sm overflow-hidden">
                <ImagemProduto src={f.src} alt="" className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] md:text-[24px] text-gray-900 leading-tight">Monte sua caixa de presente</h2>
          <p className="text-[13.5px] md:text-[15px] text-gray-600 mt-1">
            Escolha a caixa, coloque os produtos que quiser e escreva o cartão. Entregamos pronto para presentear.
          </p>
        </div>
        <span className="hidden sm:inline-flex btn-primario px-6 py-3 text-[15px] flex-shrink-0">Montar minha caixa</span>
        <ChevronRight size={20} className="sm:hidden text-gray-400 flex-shrink-0" />
      </button>
    </section>
  );
}
