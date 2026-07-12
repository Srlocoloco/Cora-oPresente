// Componente MenuCategorias

// ─── Category Nav ─────────────────────────────────────────────────────────────

export function MenuCategorias({ categorias, selecionada, aoSelecionar }: {
  categorias: string[];
  selecionada: string;
  aoSelecionar: (c: string) => void;
}) {
  return (
    <nav className="bg-white/95 backdrop-blur sticky top-0 z-30 border-b border-gray-100">
      <div className="max-w-[1440px] mx-auto px-4 relative">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2.5 md:justify-center">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => aoSelecionar(c)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all ${
                selecionada === c
                  ? "bg-[#C8102E] text-white shadow-sm shadow-[#C8102E]/30"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
