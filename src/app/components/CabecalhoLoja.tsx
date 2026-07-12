// Componente CabecalhoLoja

import { ShoppingCart, Search, User, Settings } from "lucide-react";
import type { Usuario } from "../types";
import { Logo } from "./Logo";

// ─── Store Header ─────────────────────────────────────────────────────────────

export function CabecalhoLoja({
  qtdCarrinho,
  aoAbrirCarrinho,
  aoAbrirPainel,
  rotuloPainel,
  aoClicarEntrar,
  aoAbrirPerfil,
  busca,
  aoBuscar,
  usuario,
}: {
  qtdCarrinho: number;
  aoAbrirCarrinho: () => void;
  aoAbrirPainel: () => void;
  rotuloPainel: string | null;
  aoClicarEntrar: () => void;
  aoAbrirPerfil: () => void;
  busca: string;
  aoBuscar: (v: string) => void;
  usuario: Usuario | null;
}) {

  return (
    <header>
      <div className="bg-[#7A1220] text-white/90 text-[11px] py-1.5 px-4 text-center tracking-wide">
        Coração Presente · Frete grátis acima de R$&nbsp;299 · 0800 773 2578 · Atendimento 24h
      </div>
      <div className="bg-gradient-to-r from-[#C8102E] to-[#A50E27] py-3.5 px-4 shadow-md">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-3 md:gap-x-4">
          <div className="flex-shrink-0">
            <Logo />
          </div>

          {/* Busca: linha própria no mobile, centralizada no desktop */}
          <div className="order-last md:order-none basis-full md:basis-0 md:flex-1 max-w-2xl md:mx-auto">
            <div className="flex bg-white rounded-full overflow-hidden shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[#E8B84B] transition-shadow">
              <input
                type="text"
                value={busca}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder="Busque por produto, marca ou categoria..."
                className="flex-1 pl-5 pr-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 min-w-0"
              />
              <button className="bg-[#E8B84B] px-5 flex items-center hover:bg-[#D9A83C] transition-colors">
                <Search size={17} className="text-[#C8102E]" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {/* Botão de painel: Admin, Master ou Vendedor */}
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="flex flex-col items-center gap-0.5 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/15 transition-colors"
              >
                <Settings size={19} />
                <span className="text-[9px] md:text-[10px] font-semibold">{rotuloPainel}</span>
              </button>
            )}

            {/* Perfil: leva direto para a tela de perfil (pedidos, cupons,
                categorias etc.) — igual no mobile e no desktop */}
            <button
              onClick={() => (usuario ? aoAbrirPerfil() : aoClicarEntrar())}
              className="flex flex-col items-center gap-0.5 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/15 transition-colors"
            >
              <User size={19} />
              <span className="text-[9px] md:text-[10px] font-semibold max-w-[64px] truncate">
                {usuario ? usuario.name.split(" ")[0] : "Entrar"}
              </span>
            </button>

            <button
              onClick={aoAbrirCarrinho}
              className="flex flex-col items-center gap-0.5 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/15 transition-colors relative"
            >
              <div className="relative">
                <ShoppingCart size={19} />
                {qtdCarrinho > 0 && (
                  <span
                    key={qtdCarrinho}
                    className="absolute -top-2 -right-2 bg-[#E8B84B] text-[#C8102E] text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center"
                    style={{ animation: "puloCarrinho 0.4s ease" }}
                  >
                    {qtdCarrinho}
                  </span>
                )}
              </div>
              <span className="text-[9px] md:text-[10px] font-semibold">Carrinho</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
