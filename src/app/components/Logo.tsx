// Componente Logo

// ─── Logo ─────────────────────────────────────────────────────────────────────
// "claro": usado sobre fundo colorido (vermelho, vinho) — texto branco solto,
// sem moldura. Sem "claro": usado sobre fundo branco/claro — mantém o quadro
// branco com o texto vermelho, que senão ficaria ilegível (texto vermelho
// direto sobre fundo vermelho).

export function Logo({ small, claro }: { small?: boolean; claro?: boolean }) {
  const corTexto = claro ? "text-white" : "text-[#C8102E]";
  const conteudo = (
    <div className="leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
      <div className={`${corTexto} font-black italic tracking-tight leading-none ${small ? "text-[11px]" : "text-[15px]"}`}>
        CORAÇÃO
      </div>
      <div className={`${corTexto} font-black italic tracking-tight leading-none ${small ? "text-[11px]" : "text-[15px]"}`}>
        PRESENTE
      </div>
    </div>
  );

  if (claro) return conteudo;

  return (
    <div className={`bg-white rounded-xl flex items-center ${small ? "px-2.5 py-1.5" : "px-3 py-2"}`}>
      {conteudo}
    </div>
  );
}
