// Componente Logo

// ─── Logo ─────────────────────────────────────────────────────────────────────

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={`bg-white rounded-xl flex items-center ${small ? "px-2.5 py-1.5" : "px-3 py-2"}`}>
      <div className="leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
        <div
          className={`text-[#C8102E] font-black italic tracking-tight leading-none ${small ? "text-[11px]" : "text-[15px]"}`}
        >
          CORAÇÃO
        </div>
        <div
          className={`text-[#C8102E] font-black italic tracking-tight leading-none ${small ? "text-[11px]" : "text-[15px]"}`}
        >
          PRESENTE
        </div>
      </div>
    </div>
  );
}
