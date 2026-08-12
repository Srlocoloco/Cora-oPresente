// Componente CabecalhoLoja

import { ShoppingCart, Search, User, Settings, Heart } from "lucide-react";
import type { Usuario } from "../types";
import { Logo } from "./Logo";

// ─── Store Header ─────────────────────────────────────────────────────────────
// Fixo no topo (sticky) para a busca e o carrinho estarem sempre à mão. Cor
// sólida (sem gradiente) e sombra mínima, por pedido: aparência limpa e
// profissional em vez de decorativa.

export function CabecalhoLoja({
  qtdCarrinho,
  qtdFavoritos,
  aoAbrirCarrinho,
  aoAbrirFavoritos,
  aoAbrirPainel,
  rotuloPainel,
  aoClicarEntrar,
  aoAbrirPerfil,
  busca,
  aoBuscar,
  usuario,
}: {
  qtdCarrinho: number;
  qtdFavoritos?: number;
  aoAbrirCarrinho: () => void;
  aoAbrirFavoritos?: () => void;
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
      <div className="bg-[#A8102A] py-3.5 px-4 shadow-sm">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-3 md:gap-x-4">
          <div className="flex-shrink-0 basis-full flex justify-center md:basis-auto md:justify-start">
            <Logo claro />
          </div>

          {/* Busca: linha própria no mobile, centralizada e em destaque no desktop */}
          <div className="order-last md:order-none basis-full md:basis-0 md:flex-1 max-w-2xl md:mx-auto">
            <div className="flex bg-white rounded-xl overflow-hidden ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-white transition-shadow">
              <input
                type="text"
                value={busca}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder="Buscar produto, marca ou categoria"
                aria-label="Buscar produto, marca ou categoria"
                className="flex-1 pl-5 pr-4 py-3 text-[15px] text-gray-800 outline-none placeholder:text-gray-400 min-w-0"
              />
              <button
                aria-label="Buscar"
                className="bg-[#232323] px-5 flex items-center hover:bg-black transition-colors"
              >
                <Search size={19} className="text-white" strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {/* No celular, Favoritos/Carrinho/Perfil/Painel vivem só na barra de
              baixo (BarraInferiorMobile) — aqui em cima ficaria redundante */}
          <div className="hidden md:flex items-center gap-1 sm:gap-2">
            {/* Botão de painel: Admin, Master ou Vendedor */}
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="flex flex-col items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/10 transition-colors min-w-[52px]"
              >
                <Settings size={20} />
                <span className="text-[10px] font-semibold">{rotuloPainel}</span>
              </button>
            )}

            {aoAbrirFavoritos && (
              <button
                onClick={aoAbrirFavoritos}
                aria-label="Favoritos"
                className="flex flex-col items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/10 transition-colors relative min-w-[52px]"
              >
                <div className="relative">
                  <Heart size={20} />
                  {!!qtdFavoritos && (
                    <span className="absolute -top-1.5 -right-1.5 bg-white text-[#A8102A] text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                      {qtdFavoritos}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold">Favoritos</span>
              </button>
            )}

            {/* Perfil: leva direto para a tela de perfil (pedidos, cupons,
                categorias etc.) — igual no mobile e no desktop */}
            <button
              onClick={() => (usuario ? aoAbrirPerfil() : aoClicarEntrar())}
              className="flex flex-col items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/10 transition-colors min-w-[52px]"
            >
              <User size={20} />
              <span className="text-[10px] font-semibold max-w-[64px] truncate">
                {usuario ? usuario.name.split(" ")[0] : "Entrar"}
              </span>
            </button>

            <button
              onClick={aoAbrirCarrinho}
              aria-label={`Carrinho${qtdCarrinho > 0 ? `, ${qtdCarrinho} itens` : ""}`}
              className="flex flex-col items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/10 transition-colors relative min-w-[52px]"
            >
              <div className="relative">
                <ShoppingCart size={20} />
                {qtdCarrinho > 0 && (
                  <span
                    key={qtdCarrinho}
                    className="absolute -top-1.5 -right-1.5 bg-white text-[#A8102A] text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center"
                    style={{ animation: "puloCarrinho 0.3s ease" }}
                  >
                    {qtdCarrinho}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">Carrinho</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
