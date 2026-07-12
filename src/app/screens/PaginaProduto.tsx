// Tela PaginaProduto

import { ShoppingCart, Star, Package, Heart, Truck, RotateCcw, ChevronRight, Check } from "lucide-react";
import type { Produto } from "../types";
import { CORES_SELO } from "../constantes";
import { categoriaExibida, formatarMoeda, precoParcela, pctDesconto } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { CartaoProduto } from "../components/CartaoProduto";
import { CampoCodigoVenda } from "../components/CampoCodigoVenda";

export function PaginaProduto({
  produto,
  produtos,
  aoAdicionarAoCarrinho,
  aoAbrirProduto,
  aoVoltar,
  aoFavoritar,
  favoritos,
  codigoVenda,
  aoMudarCodigoVenda,
  nomeDonoCodigo,
}: {
  produto: Produto;
  produtos: Produto[];
  aoAdicionarAoCarrinho: (p: Produto) => void;
  aoAbrirProduto: (p: Produto) => void;
  aoVoltar: () => void;
  aoFavoritar: (id: number) => void;
  favoritos: number[];
  codigoVenda: string;
  aoMudarCodigoVenda: (v: string) => void;
  nomeDonoCodigo: string | null;
}) {
  const temDesconto = produto.originalPrice && produto.originalPrice > produto.price;
  // Desconto no PIX definido no próprio produto (0 = sem desconto)
  const pctPix = produto.pixDesconto ?? 0;
  const precoPix = produto.price * (1 - pctPix / 100);
  const recomendados = produtos.filter((p) => p.id !== produto.id && p.category === produto.category).slice(0, 4);
  const outrosProdutos = produtos.filter((p) => p.id !== produto.id && p.category !== produto.category).slice(0, 8);

  const grid = (items: Produto[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4">
      {items.map((p) => (
        <CartaoProduto
          key={p.id}
          produto={p}
          aoAdicionarAoCarrinho={aoAdicionarAoCarrinho}
          aoFavoritar={aoFavoritar}
          estaFavoritado={favoritos.includes(p.id)}
          aoAbrirProduto={aoAbrirProduto}
        />
      ))}
    </div>
  );

  return (
    <main className="max-w-[1440px] mx-auto px-4 py-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium mb-4 flex-wrap">
        <button onClick={aoVoltar} className="hover:text-[#C8102E] transition-colors">Início</button>
        <ChevronRight size={13} />
        <span>{categoriaExibida(produto.category)}</span>
        <ChevronRight size={13} />
        <span className="text-gray-800 font-semibold line-clamp-1">{produto.name}</span>
      </div>

      {/* Produto area */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <div className="relative bg-gray-50/70 rounded-2xl p-6 flex items-center justify-center">
            {produto.badge && (
              <span className={`absolute top-3 left-3 ${CORES_SELO[produto.badge] || "bg-[#C8102E]"} text-white text-[10px] font-black px-3 py-1 rounded-full tracking-wider z-10`}>
                {produto.badge}
              </span>
            )}
            {temDesconto && (
              <span className="absolute top-3 right-3 bg-red-500 text-white text-[11px] font-black px-2 py-1 rounded-md z-10">
                -{pctDesconto(produto.originalPrice!, produto.price)}%
              </span>
            )}
            <ImagemProduto
              src={produto.image}
              alt={produto.name}
              className="w-full h-[240px] md:h-[380px] object-contain"
            />
            <button
              onClick={() => aoFavoritar(produto.id)}
              className="absolute bottom-3 right-3 p-2.5 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
            >
              <Heart size={17} className={favoritos.includes(produto.id) ? "fill-red-500 text-red-500" : "text-gray-300"} />
            </button>
          </div>

          {/* Info */}
          <div>
            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wide">{produto.brand}</span>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 leading-snug mt-1 mb-3">
              {produto.name}
            </h1>

            <div className="flex items-center gap-1.5 mb-5">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className={i < Math.floor(produto.rating) ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
                ))}
              </div>
              <span className="text-[12px] text-gray-500 font-medium">
                {produto.rating > 0 ? produto.rating : "0"}{" "}
                {produto.reviews > 0 ? `(${produto.reviews.toLocaleString("pt-BR")} avaliações)` : "(novo)"}
              </span>
            </div>

            {/* Price block */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 mb-5">
              {temDesconto && (
                <span className="text-[13px] text-gray-400 line-through">{formatarMoeda(produto.originalPrice!)}</span>
              )}
              <div className="flex items-end gap-2 flex-wrap">
                <span className="text-3xl md:text-4xl font-black text-gray-900">{formatarMoeda(precoPix)}</span>
                {pctPix > 0 && (
                  <>
                    <span className="text-[13px] text-gray-500 font-semibold mb-1.5">no PIX</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[11px] font-black px-2 py-0.5 rounded-md mb-1.5">{pctPix}% OFF</span>
                  </>
                )}
              </div>
              <div className="text-[13px] text-gray-600 mt-2">
                ou <span className="font-bold">{formatarMoeda(produto.price)}</span> em{" "}
                <span className="font-bold text-[#C8102E]">
                  {produto.installments}x de {precoParcela(produto.price, produto.installments)} sem juros
                </span>{" "}
                no cartão
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {produto.freeShipping && (
                  <span className="flex items-center gap-1 text-green-600 text-[12px] font-bold">
                    <Truck size={13} /> FRETE GRÁTIS
                  </span>
                )}
                <span className={`text-[12px] font-bold ${produto.stock < 15 ? "text-red-500" : "text-gray-500"}`}>
                  {produto.stock <= 0
                    ? "Produto esgotado"
                    : produto.stock < 15
                    ? `Últimas ${produto.stock} unidades!`
                    : `${produto.stock} em estoque`}
                </span>
              </div>
            </div>

            {produto.stock <= 0 ? (
              <button
                disabled
                className="w-full bg-gray-200 text-gray-400 font-black py-4 rounded-xl text-base flex items-center justify-center gap-2 mb-3 cursor-not-allowed"
              >
                Produto Esgotado
              </button>
            ) : (
              <button
                onClick={() => aoAdicionarAoCarrinho(produto)}
                className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2 mb-3"
              >
                <ShoppingCart size={17} />
                Comprar
              </button>
            )}

            {/* Código de venda: credita a compra a um vendedor ou ao Master */}
            <div className="mb-3">
              <CampoCodigoVenda codigo={codigoVenda} aoMudar={aoMudarCodigoVenda} nomeDono={nomeDonoCodigo} />
            </div>

            {/* Delivery options */}
            <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Truck size={15} className="text-[#C8102E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">Receba amanhã</div>
                    <div className="text-[11px] text-gray-400">Para pagamentos confirmados hoje</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black flex-shrink-0">Grátis</span>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-[#C8102E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">Retire na loja a partir de 2 horas</div>
                    <div className="text-[11px] text-gray-400">Após aprovação da compra</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black flex-shrink-0">Grátis</span>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <RotateCcw size={15} className="text-[#C8102E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">Devolução grátis</div>
                    <div className="text-[11px] text-gray-400">Até 30 dias após o recebimento</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black flex-shrink-0">Grátis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Características */}
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h2 className="text-lg font-black text-gray-900 mb-4">Principais características</h2>
          <ul className="space-y-2">
            {(produto.description
              ? produto.description.split("\n").filter(Boolean)
              : [
                  `Marca: ${produto.brand}`,
                  `Categoria: ${categoriaExibida(produto.category)}`,
                  "Garantia de 12 meses",
                  produto.freeShipping ? "Frete grátis para todo o Brasil" : "Consulte o frete para sua região",
                ]
            ).map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] text-gray-700">
                <Check size={14} className="text-[#C8102E] mt-0.5 flex-shrink-0" strokeWidth={3} />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recommendations */}
      {recomendados.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-black text-gray-900 mb-4">Recomendados para você</h2>
          {grid(recomendados)}
        </section>
      )}

      {outrosProdutos.length > 0 && (
        <section className="mt-8 mb-4">
          <h2 className="text-lg font-black text-gray-900 mb-4">Mais produtos da loja</h2>
          {grid(outrosProdutos)}
        </section>
      )}
    </main>
  );
}
