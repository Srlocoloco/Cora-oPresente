// Componente CartaoProduto
//
// Um produto na vitrine, como nos grandes marketplaces: foto grande sobre
// branco, o nome, e o preço em destaque — com as parcelas em verde. O cartão inteiro abre o produto; comprar é na página dele, onde a
// pessoa escolhe cor e quantidade.

import { Star, Heart } from "lucide-react";
import type { Produto } from "../types";
import { formatarMoeda, precoParcela, pctDesconto } from "../utils";
import { ImagemProduto } from "./ImagemProduto";
import { Preco } from "./Preco";

export function CartaoProduto({ produto, aoFavoritar, estaFavoritado, aoAbrirProduto, estoqueBaixo = 5 }: {
  produto: Produto;
  aoFavoritar: (id: number) => void;
  estaFavoritado: boolean;
  aoAbrirProduto?: (p: Produto) => void;
  // Abaixo disto aparece "Últimas unidades" (Configurações → Estoque)
  estoqueBaixo?: number;
}) {
  const temDesconto = produto.originalPrice && produto.originalPrice > produto.price;
  const pix = produto.pixDesconto && produto.pixDesconto > 0 ? produto.price * (1 - produto.pixDesconto / 100) : null;
  const esgotado = produto.stock <= 0;
  const ultimas = !esgotado && produto.stock <= estoqueBaixo;
  const abrir = () => aoAbrirProduto?.(produto);

  return (
    <article
      onClick={abrir}
      className="painel w-full overflow-hidden flex flex-col group cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-square bg-white border-b border-black/[0.06] p-3 md:p-4">
        <ImagemProduto
          src={produto.image}
          alt={produto.name}
          className={`w-full h-full object-contain ${esgotado ? "opacity-50" : ""}`}
        />
        <button
          onClick={(e) => { e.stopPropagation(); aoFavoritar(produto.id); }}
          aria-label={estaFavoritado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={estaFavoritado}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center transition-opacity ${
            estaFavoritado ? "" : "md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          <Heart size={16} className={estaFavoritado ? "fill-[#C8102E] text-[#C8102E]" : "text-[#C8102E]"} />
        </button>
      </div>

      <div className="px-3 pt-3 pb-4 md:px-4 flex flex-col flex-1">
        {produto.badge && (
          <span className="self-start bg-[#FF7733] text-white text-[10.5px] font-bold px-1.5 py-[1px] rounded-sm mb-1.5">
            {produto.badge}
          </span>
        )}
        {/* Nome em até duas linhas, sempre com a altura de duas: os preços da
            fileira ficam alinhados mesmo com nomes de tamanhos diferentes */}
        <h3 className="text-[13.5px] md:text-[14px] leading-[1.3] text-gray-800 min-h-[2.6em]">
          {/* Botão para quem navega pelo teclado; o clique vale no cartão todo */}
          <button
            onClick={(e) => { e.stopPropagation(); abrir(); }}
            title={produto.name}
            className="text-left line-clamp-2 group-hover:text-black focus-visible:underline outline-none"
          >
            {produto.name}
          </button>
        </h3>

        {produto.reviews > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[12px] text-gray-500">
            <span>{produto.rating.toFixed(1)}</span>
            <span className="flex" role="img" aria-label={`Avaliação ${produto.rating.toFixed(1)} de 5`}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={10} className={i < Math.round(produto.rating) ? "fill-[#C8102E] text-[#C8102E]" : "fill-gray-300 text-gray-300"} />
              ))}
            </span>
            <span>({produto.reviews.toLocaleString("pt-BR")})</span>
          </div>
        )}

        <div className="mt-2">
          {temDesconto && (
            <s className="block text-[12px] text-gray-400 leading-none mb-1">{formatarMoeda(produto.originalPrice!)}</s>
          )}
          <div className="flex items-start gap-2">
            <Preco valor={produto.price} tamanho={22} className="text-gray-900" />
            {temDesconto && (
              <span className="text-[13px] text-[#00A650] leading-none mt-1">{pctDesconto(produto.originalPrice!, produto.price)}% OFF</span>
            )}
          </div>
          {produto.installments > 1 && (
            <p className="text-[12.5px] text-[#00A650] mt-1">
              em {produto.installments}x {precoParcela(produto.price, produto.installments)} sem juros
            </p>
          )}
          {pix !== null && (
            <p className="text-[12.5px] text-gray-600 mt-0.5">{formatarMoeda(pix)} no Pix</p>
          )}
        </div>

        <div className="mt-auto pt-2 text-[12.5px] space-y-0.5">
          {esgotado ? (
            <p className="text-gray-500">Esgotado</p>
          ) : (
            ultimas && <p className="text-[#C8102E]">{produto.stock === 1 ? "Última unidade" : `Restam ${produto.stock} unidades`}</p>
          )}
        </div>
      </div>
    </article>
  );
}
