// Componente MenuCategorias

import { Gift } from "lucide-react";

// ─── Category Nav ─────────────────────────────────────────────────────────────

export function MenuCategorias({ categorias, selecionada, aoSelecionar, aoMontarCaixa }: {
  categorias: string[];
  selecionada: string;
  aoSelecionar: (c: string) => void;
  // Atalho fixo para a área "Monte sua Caixa". Fica aqui, e não no cabeçalho,
  // porque esta é a única barra de navegação que aparece igual no celular e no
  // desktop — a área precisa estar sempre a um toque de distância.
  aoMontarCaixa?: () => void;
}) {
  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="max-w-[1440px] mx-auto px-4 relative">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-3 md:justify-center">
          {aoMontarCaixa && (
            <button
              onClick={aoMontarCaixa}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[14px] font-bold whitespace-nowrap bg-gradient-to-r from-[#4A1218] to-[#7A1220] text-white hover:from-[#7A1220] hover:to-[#A8102A] transition-colors flex-shrink-0"
            >
              <Gift size={15} className="text-[#E8B84B]" />
              Monte sua Caixa
            </button>
          )}
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => aoSelecionar(c)}
              aria-current={selecionada === c ? "true" : undefined}
              className={`px-4 py-2.5 rounded-full text-[14px] font-bold whitespace-nowrap transition-colors ${
                selecionada === c
                  ? "bg-[#A8102A] text-white"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {/* Sinaliza que dá pra rolar o menu no celular */}
        <div className="md:hidden pointer-events-none absolute top-0 bottom-0 left-4 w-6 bg-gradient-to-r from-white to-transparent" />
        <div className="md:hidden pointer-events-none absolute top-0 bottom-0 right-4 w-6 bg-gradient-to-l from-white to-transparent" />
      </div>
    </nav>
  );
}
