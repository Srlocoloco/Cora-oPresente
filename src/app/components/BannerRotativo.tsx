// Componente BannerRotativo

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Banner } from "../types";

// ─── Hero Banner (auto-rotating) ──────────────────────────────────────────────

// Todos os banners usam o mesmo tamanho de caixa, sempre — assim a vitrine
// fica com um padrão único em vez de cada imagem esticar o quadro pro
// próprio formato. A imagem sempre preenche a caixa (object-cover) e fica
// centralizada (object-center), tanto no desktop quanto no celular.

export function BannerRotativo({ banners, aoClicarBanner }: { banners: Banner[]; aoClicarBanner: (category: string) => void }) {
  const [bannerAtivo, setBannerAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  // Detecta celular para escolher a imagem própria de celular (mobileImage),
  // quando o Admin cadastrou uma
  const [ehMobile, setEhMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const aoRedimensionar = () => setEhMobile(window.innerWidth < 768);
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);

  useEffect(() => {
    // Volta ao primeiro banner se a lista mudar (ex.: Admin excluiu um banner
    // e o índice ativo ficaria fora dos limites)
    setBannerAtivo(0);
  }, [banners.length]);

  useEffect(() => {
    if (pausado || banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerAtivo((anterior) => (anterior + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [pausado, banners.length]);

  const anterior = () => { setBannerAtivo((a) => (a - 1 + banners.length) % banners.length); setPausado(true); };
  const proximoBanner = () => { setBannerAtivo((a) => (a + 1) % banners.length); setPausado(true); };

  if (banners.length === 0) return null;
  // Protege contra índice fora dos limites no instante em que a lista muda
  // (ex.: Admin excluiu justamente o banner que estava em exibição)
  const ativo = Math.min(bannerAtivo, banners.length - 1);

  // Em cada banner, usa a imagem própria de celular (quando o Admin cadastrou
  // uma) no mobile; sem ela, cai para a mesma imagem larga do desktop
  const imagemParaTela = (b: Banner) => (ehMobile && b.mobileImage ? b.mobileImage : b.image);

  return (
    <div
      className="relative overflow-hidden bg-[#7A1220] h-[150px] sm:h-[200px] md:h-[340px] group"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      {banners.map((b, i) => (
        <div
          key={b.id}
          aria-hidden={i !== ativo}
          className={`absolute inset-0 transition-opacity duration-700 ${i === ativo ? "opacity-100" : "opacity-0"}`}
        >
          <img
            src={imagemParaTela(b)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      ))}
      {/* A foto "some" no cinza da página, sem a borda dura de um quadro */}
      <div className="absolute inset-x-0 bottom-0 h-16 md:h-24 bg-gradient-to-t from-[#EDEDED] to-transparent z-[5]" />

      <div className="relative z-10 h-full max-w-[1200px] mx-auto px-5 md:px-4 flex flex-col justify-center pb-6 md:pb-10 text-white">
        {banners[ativo].tag && (
          <span className="text-[11px] md:text-[13px] font-semibold tracking-wide uppercase mb-1 md:mb-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {banners[ativo].tag}
          </span>
        )}
        <h1 className="text-[18px] sm:text-[24px] md:text-[40px] font-semibold leading-[1.1] max-w-[60%] md:max-w-[520px] line-clamp-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6),0_2px_12px_rgba(0,0,0,0.35)]">
          {banners[ativo].title}
        </h1>
        <p className="hidden sm:block text-[14px] md:text-[17px] mt-1.5 md:mt-2 max-w-[60%] md:max-w-[440px] line-clamp-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {banners[ativo].subtitle}
        </p>
        {banners[ativo].cta && (
          <button
            onClick={() => aoClicarBanner(banners[ativo].category)}
            className="mt-3 md:mt-5 bg-white text-gray-900 hover:bg-gray-100 text-[12.5px] md:text-[15px] font-semibold px-3.5 py-1.5 md:px-6 md:py-2.5 rounded-md w-fit shadow-sm"
          >
            {banners[ativo].cta}
          </button>
        )}
      </div>

      {/* Setas: aparecem ao passar o mouse, como abas presas nas laterais */}
      {banners.length > 1 && (
        <>
          <button
            onClick={anterior}
            aria-label="Banner anterior"
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-11 h-16 bg-white rounded-r-full shadow-md items-center justify-start pl-2 text-[#C8102E] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={proximoBanner}
            aria-label="Próximo banner"
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-11 h-16 bg-white rounded-l-full shadow-md items-center justify-end pr-2 text-[#C8102E] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight size={22} />
          </button>
          <div className="absolute bottom-7 md:bottom-10 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => { setBannerAtivo(i); setPausado(true); }}
                aria-label={`Banner ${i + 1}`}
                aria-current={ativo === i ? "true" : undefined}
                className={`w-2 h-2 rounded-full transition-colors ${ativo === i ? "bg-white" : "bg-white/45 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
