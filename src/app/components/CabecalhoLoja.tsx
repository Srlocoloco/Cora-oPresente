// Componente CabecalhoLoja
//
// Cabeçalho da vitrine, no molde dos grandes marketplaces: na primeira linha a
// marca e a busca (o que a pessoa mais usa); na segunda, as categorias como
// links de texto à esquerda e a conta/carrinho à direita. No celular a busca
// divide a linha com a marca e as categorias rolam de lado — carrinho, conta e
// favoritos ficam na barra de baixo (BarraInferiorMobile).

import { ShoppingCart, Search, Heart, ChevronDown } from "lucide-react";
import type { Usuario } from "../types";
import { Logo } from "./Logo";

export function CabecalhoLoja({
  qtdCarrinho,
  qtdFavoritos,
  aoAbrirCarrinho,
  aoAbrirFavoritos,
  aoAbrirPainel,
  rotuloPainel,
  aoClicarEntrar,
  aoAbrirPerfil,
  aoIrInicio,
  busca,
  aoBuscar,
  usuario,
  categorias,
  categoriaSelecionada,
  aoSelecionarCategoria,
  aoMontarCaixa,
}: {
  qtdCarrinho: number;
  qtdFavoritos?: number;
  aoAbrirCarrinho: () => void;
  aoAbrirFavoritos?: () => void;
  aoAbrirPainel: () => void;
  rotuloPainel: string | null;
  aoClicarEntrar: () => void;
  aoAbrirPerfil: () => void;
  aoIrInicio: () => void;
  busca: string;
  aoBuscar: (v: string) => void;
  usuario: Usuario | null;
  categorias: string[];
  categoriaSelecionada: string;
  aoSelecionarCategoria: (c: string) => void;
  aoMontarCaixa?: () => void;
}) {
  const linkTopo = "text-white/85 hover:text-white whitespace-nowrap transition-colors";

  return (
    <header className="bg-[#A8102A] text-white">
      <div className="max-w-[1200px] mx-auto px-4">
        {/* Marca + busca */}
        <div className="flex items-center gap-3 md:gap-8 h-[56px] md:h-[60px]">
          <button onClick={aoIrInicio} aria-label="Coração Presente — página inicial" className="flex-shrink-0">
            <Logo claro />
          </button>

          <form
            role="search"
            onSubmit={(e) => e.preventDefault()}
            className="flex-1 max-w-[620px] flex bg-white rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.25)] h-10"
          >
            <input
              type="search"
              value={busca}
              onChange={(e) => aoBuscar(e.target.value)}
              placeholder="Buscar produtos, marcas e muito mais…"
              aria-label="Buscar produtos"
              className="flex-1 min-w-0 pl-4 pr-2 text-[15px] text-gray-800 outline-none placeholder:text-gray-400 bg-transparent"
            />
            <button type="submit" aria-label="Buscar" className="px-3.5 flex items-center border-l border-gray-200 text-gray-500 hover:text-gray-800">
              <Search size={18} />
            </button>
          </form>
        </div>

        {/* Categorias + conta */}
        <div className="flex items-center justify-between gap-6 h-9 text-[13.5px] -mt-1 md:mt-0">
          <nav aria-label="Categorias" className="relative min-w-0 flex-1">
            <ul className="flex items-center gap-5 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
              {aoMontarCaixa && (
                <li>
                  <button onClick={aoMontarCaixa} className={`${linkTopo} font-semibold text-white`}>
                    Monte sua Caixa
                  </button>
                </li>
              )}
              {categorias.map((c) => {
                const ativa = categoriaSelecionada === c;
                return (
                  <li key={c}>
                    <button
                      onClick={() => aoSelecionarCategoria(c)}
                      aria-current={ativa ? "page" : undefined}
                      className={`${linkTopo} ${ativa ? "!text-white underline underline-offset-[6px] decoration-2" : ""}`}
                    >
                      {c === "Outros" ? "Todos os produtos" : c}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden md:flex items-center gap-5 flex-shrink-0">
            {rotuloPainel && (
              <button onClick={aoAbrirPainel} className={linkTopo}>
                Painel {rotuloPainel}
              </button>
            )}
            {usuario ? (
              <button onClick={aoAbrirPerfil} className={`${linkTopo} flex items-center gap-1`}>
                {usuario.name.split(" ")[0]} <ChevronDown size={14} />
              </button>
            ) : (
              <button onClick={aoClicarEntrar} className={linkTopo}>
                Entre ou cadastre-se
              </button>
            )}
            {aoAbrirFavoritos && (
              <button onClick={aoAbrirFavoritos} className={`${linkTopo} flex items-center gap-1.5`}>
                <Heart size={15} />
                Favoritos{qtdFavoritos ? ` (${qtdFavoritos})` : ""}
              </button>
            )}
            <button
              onClick={aoAbrirCarrinho}
              aria-label={`Carrinho${qtdCarrinho > 0 ? `, ${qtdCarrinho} itens` : ""}`}
              className="relative text-white/90 hover:text-white p-1"
            >
              <ShoppingCart size={21} />
              {qtdCarrinho > 0 && (
                <span
                  key={qtdCarrinho}
                  className="absolute -top-1 -right-2 bg-white text-[#A8102A] text-[10.5px] font-bold rounded-full min-w-[17px] h-[17px] px-1 flex items-center justify-center"
                  style={{ animation: "puloCarrinho 0.3s ease" }}
                >
                  {qtdCarrinho}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
