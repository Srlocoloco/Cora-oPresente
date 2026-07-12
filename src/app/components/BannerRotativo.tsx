// Componente BannerRotativo

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "../types";

// ─── Hero Banner (auto-rotating) ──────────────────────────────────────────────

export function BannerRotativo({ banners, aoClicarBanner }: { banners: Banner[]; aoClicarBanner: (category: string) => void }) {
  const [bannerAtivo, setBannerAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    // Volta ao primeiro banner se a lista mudar (ex.: Admin excluiu um banner
    // e o índice ativo ficaria fora dos limites)
    setBannerAtivo(0);
  }, [banners.length]);

  useEffect(() => {
    if (pausado || banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerAtivo((anterior) => (anterior + 1) % banners.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [pausado, banners.length]);

  const anterior = () => { setBannerAtivo((a) => (a - 1 + banners.length) % banners.length); setPausado(true); };
  const proximoBanner = () => { setBannerAtivo((a) => (a + 1) % banners.length); setPausado(true); };

  if (banners.length === 0) return null;
  // Protege contra índice fora dos limites no instante em que a lista muda
  // (ex.: Admin excluiu justamente o banner que estava em exibição)
  const ativo = Math.min(bannerAtivo, banners.length - 1);

  return (
    <div className="max-w-[1440px] mx-auto px-4 pt-5">
      <div
        className="relative overflow-hidden h-[210px] md:h-[315px] bg-[#C8102E] rounded-2xl md:rounded-3xl shadow-lg"
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
      >
        {banners.map((b, i) => (
          <div
            key={b.id}
            className={`absolute inset-0 transition-opacity duration-700 ${i === ativo ? "opacity-100" : "opacity-0"}`}
          >
            <img
              src={b.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#4A1218]/85 via-[#4A1218]/45 to-transparent" />
          </div>
        ))}

        <div className="relative z-10 h-full flex flex-col justify-center pl-11 pr-5 md:px-14 text-white">
          <span className="bg-[#E8B84B] text-[#4A1218] text-[9px] md:text-[10px] font-black px-2.5 py-1 rounded-full w-fit mb-1.5 md:mb-3 tracking-wider">
            {banners[ativo].tag}
          </span>
          <h1 className="text-base md:text-4xl font-black leading-tight mb-1 md:mb-2 max-w-[220px] md:max-w-md line-clamp-2 drop-shadow-sm">
            {banners[ativo].title}
          </h1>
          <p className="text-[11px] md:text-base text-white/70 mb-2 md:mb-5 max-w-[220px] md:max-w-xs line-clamp-1 md:line-clamp-none">
            {banners[ativo].subtitle}
          </p>
          <button
            onClick={() => aoClicarBanner(banners[ativo].category)}
            className="bg-[#E8B84B] text-[#4A1218] font-black text-[12px] md:text-sm px-4 py-2 md:px-7 md:py-2.5 rounded-xl w-fit hover:bg-[#F0C767] hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            {banners[ativo].cta}
          </button>
        </div>

        {/* Arrows */}
        {banners.length > 1 && (
        <button
          onClick={anterior}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 transition-colors backdrop-blur-sm"
        >
          <ChevronLeft size={18} />
        </button>
        )}
        {banners.length > 1 && (
        <button
          onClick={proximoBanner}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 transition-colors backdrop-blur-sm"
        >
          <ChevronRight size={18} />
        </button>
        )}

        {/* Dots */}
        {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => { setBannerAtivo(i); setPausado(true); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                ativo === i ? "bg-[#E8B84B] w-7" : "bg-white/40 w-1.5 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
        )}

        {/* Auto-play progress bar */}
        {!pausado && banners.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-10">
            <div
              key={ativo}
              className="h-full bg-[#E8B84B]"
              style={{ animation: "progressBar 2s linear forwards" }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes progressBar {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}
