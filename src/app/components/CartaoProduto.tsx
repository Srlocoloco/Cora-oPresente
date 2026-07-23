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
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-[#C8102E]/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col group">
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
          className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow"
        >
          <Heart size={13} className={estaFavoritado ? "fill-red-500 text-red-500" : "text-gray-300"} />
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
          className="text-[11px] md:text-[13px] text-gray-800 font-semibold leading-snug mt-0.5 mb-1.5 md:mb-2 line-clamp-2 flex-1 cursor-pointer hover:text-[#C8102E] transition-colors"
          onClick={() => aoAbrirProduto?.(produto)}
        >
          {produto.name}
        </p>
        <div className="flex items-center gap-1 mb-2 md:mb-3">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={10} className={i < Math.floor(produto.rating) ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
            ))}
          </div>
          <span className="text-[9px] md:text-[10px] text-gray-400">
            {produto.reviews > 0 ? `(${produto.reviews.toLocaleString("pt-BR")})` : "(novo)"}
          </span>
        </div>
        <div className="mt-auto">
          {temDesconto && (
            <span className="text-[10px] md:text-[11px] text-gray-400 line-through">{formatarMoeda(produto.originalPrice!)}</span>
          )}
          <div className="text-[16px] md:text-[22px] font-black text-[#C8102E] leading-tight">{formatarMoeda(produto.price)}</div>
          <div className="text-[10px] md:text-[11px] text-gray-500 mt-0.5">
            ou {produto.installments}x de{" "}
            <span className="font-bold text-[#C8102E]">{precoParcela(produto.price, produto.installments)}</span>{" "}
            sem juros
          </div>
          {produto.freeShipping && (
            <div className="text-[9px] md:text-[10px] text-green-600 font-bold mt-1 md:mt-1.5 flex items-center gap-1">
              <Truck size={10} />
              FRETE GRÁTIS
            </div>
          )}
        </div>
        {produto.stock <= 0 ? (
          <button
            disabled
            className="hidden md:block md:mt-3 bg-gray-200 text-gray-400 font-bold text-[13px] py-2.5 rounded-xl w-full cursor-not-allowed"
          >
            Esgotado
          </button>
        ) : (
          <button
            onClick={() => aoAdicionarAoCarrinho(produto)}
            className="hidden md:block md:mt-3 bg-[#C8102E] hover:bg-[#8C1626] text-white font-bold text-[13px] py-2.5 rounded-xl transition-colors w-full"
          >
            Comprar
          </button>
        )}
      </div>
    </div>
  );
}
