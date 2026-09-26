// Componente ChamadaMonteSuaCaixa
// Chamada da área "Monte sua Caixa" dentro da vitrine: em vez de comprar uma
// caixa pronta, o cliente escolhe a caixa e enche ela do jeito que quiser.
// O caminho todo acontece na PaginaMontarCaixa.

import { Gift, Sparkles, ChevronRight, Check } from "lucide-react";

const PASSOS = ["Escolha a caixa", "Encha do seu jeito", "Escreva o cartão"];

export function ChamadaMonteSuaCaixa({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <section className="max-w-[1440px] mx-auto px-4 pt-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A1218] via-[#7A1220] to-[#A8102A] text-white">
        {/* Brilho decorativo — puramente visual */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-[#E8B84B]/10 blur-2xl"
        />

        <div className="relative px-5 py-7 md:px-10 md:py-9 flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Gift size={34} strokeWidth={1.75} className="text-[#E8B84B]" />
          </div>

          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 bg-[#E8B84B]/15 text-[#E8B84B] text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide">
              <Sparkles size={11} /> MONTE DO SEU JEITO
            </span>
            <h2 className="text-xl md:text-3xl font-black mt-2.5 leading-tight">
              Monte sua caixa de presente
            </h2>
            <p className="text-white/70 text-[13px] md:text-[14.5px] mt-1.5 leading-relaxed max-w-xl">
              Escolha a caixa, coloque dentro os produtos que quiser e escreva o cartão.
              A gente monta e entrega tudo pronto para presentear.
            </p>

            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4">
              {PASSOS.map((passo) => (
                <li key={passo} className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85">
                  <Check size={13} className="text-[#E8B84B]" strokeWidth={3} />
                  {passo}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={aoAbrir}
            className="flex-shrink-0 bg-white text-[#A8102A] hover:bg-[#E8B84B] hover:text-[#4A1218] font-black text-[14px] px-6 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 w-full md:w-auto"
          >
            Montar minha caixa
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
