// Componente CartaoProduto

import { Star, Heart, Truck } from "lucide-react";
import type { Produto } from "../types";
import { CORES_SELO } from "../constantes";
import { formatarMoeda, precoParcela, pctDesconto } from "../utils";
import { ImagemProduto } from "./ImagemProduto";

export function CartaoProduto({ produto, aoAdicionarAoCarrinho, aoFavoritar, estaFavoritado, aoAbrirProduto }: {
  produto: Produto;
  aoAdicionarAoCarrinho: (p: Produto) => void;
  aoFavoritar: (id: number) => void;
  estaFavoritado: boolean;
  aoAbrirProduto?: (p: Produto) => void;
}) {
  const temDesconto = produto.originalPrice && produto.originalPrice > produto.price;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-[#A8102A]/25 hover:shadow-md transition-shadow duration-150 flex flex-col group">
      <div
        className="relative p-2.5 md:p-4 bg-gray-50/70 cursor-pointer"
        onClick={() => aoAbrirProduto?.(produto)}
      >
        <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1">
          {produto.badge && (
            <span className={`${CORES_SELO[produto.badge] || "bg-[#C8102E]"} text-white text-[8px] md:text-[9px] font-black px-2 py-1 rounded-full tracking-wider`}>
              {produto.badge}
            </span>
          )}
          {temDesconto && (
            <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">
              -{pctDesconto(produto.originalPrice!, produto.price)}%
            </span>
          )}
        </div>
        <ImagemProduto
          src={produto.image}
          alt={produto.name}
          className="w-full h-[115px] md:h-[155px] object-contain group-hover:scale-[1.04] transition-transform duration-300"
        />
        <button
          onClick={(e) => { e.stopPropagation(); aoFavoritar(produto.id); }}
          aria-label={estaFavoritado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={estaFavoritado}
          className="absolute top-2 right-2 p-2 bg-white rounded-full border border-gray-100"
        >
          <Heart size={15} className={estaFavoritado ? "fill-[#A8102A] text-[#A8102A]" : "text-gray-300"} />
        </button>
        {produto.colors && produto.colors.length > 0 && (
          <div className="absolute bottom-2 left-2 flex gap-0.5 bg-white/90 rounded-full px-1.5 py-1">
            {produto.colors.slice(0, 4).map((c, i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: c.hex || "#cccccc" }}
                title={c.nome}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-2 md:p-3 flex flex-col flex-1">
        <span className="text-[9px] md:text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{produto.brand}</span>
        <p
          className="text-[12px] md:text-[14px] text-gray-900 font-semibold leading-snug mt-0.5 mb-1.5 md:mb-2 line-clamp-2 flex-1 cursor-pointer hover:text-[#A8102A] transition-colors"
          onClick={() => aoAbrirProduto?.(produto)}
        >
          {produto.name}
        </p>
        <div className="flex items-center gap-1 mb-2 md:mb-3">
          <div className="flex" role="img" aria-label={`Avaliação ${produto.rating.toFixed(1)} de 5`}>
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={11} className={i < Math.floor(produto.rating) ? "fill-[#C79A3B] text-[#C79A3B]" : "fill-gray-200 text-gray-200"} />
            ))}
          </div>
          <span className="text-[10px] md:text-[11px] text-gray-500">
            {produto.reviews > 0 ? `(${produto.reviews.toLocaleString("pt-BR")})` : "(novo)"}
          </span>
        </div>
        <div className="mt-auto">
          {temDesconto && (
            <span className="text-[10px] md:text-[11px] text-gray-400 line-through">{formatarMoeda(produto.originalPrice!)}</span>
          )}
          <div className="text-[17px] md:text-[22px] font-black text-gray-900 leading-tight">{formatarMoeda(produto.price)}</div>
          <div className="text-[10px] md:text-[11px] text-gray-500 mt-0.5">
            ou {produto.installments}x de{" "}
            <span className="font-bold text-gray-700">{precoParcela(produto.price, produto.installments)}</span>{" "}
            sem juros
          </div>
          {produto.freeShipping && (
            <div className="text-[9px] md:text-[10px] text-green-700 font-bold mt-1 md:mt-1.5 flex items-center gap-1">
              <Truck size={10} />
              FRETE GRÁTIS
            </div>
          )}
        </div>
        {produto.stock <= 0 ? (
          <button
            disabled
            className="mt-3 bg-gray-200 text-gray-400 font-bold text-[13px] py-2.5 md:py-3 rounded-xl w-full cursor-not-allowed"
          >
            Esgotado
          </button>
        ) : (
          <button
            onClick={() => aoAdicionarAoCarrinho(produto)}
            className="mt-3 bg-[#A8102A] hover:bg-[#7A1220] text-white font-bold text-[13px] py-2.5 md:py-3 rounded-xl transition-colors w-full whitespace-nowrap"
          >
            <span className="md:hidden">Adicionar</span>
            <span className="hidden md:inline">Adicionar ao carrinho</span>
          </button>
        )}
      </div>
    </div>
  );
}
