// Componente MenuCategorias

// ─── Category Nav ─────────────────────────────────────────────────────────────

export function MenuCategorias({ categorias, selecionada, aoSelecionar }: {
  categorias: string[];
  selecionada: string;
  aoSelecionar: (c: string) => void;
}) {
  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="max-w-[1440px] mx-auto px-4 relative">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-3 md:justify-center">
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
