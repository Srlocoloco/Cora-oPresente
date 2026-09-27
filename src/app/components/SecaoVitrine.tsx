// Componente SecaoVitrine
//
// Uma prateleira da página inicial: título, poucos produtos e "Ver todos".
// A home é feita de várias destas (ofertas, mais vendidos, cada categoria…)
// em vez de despejar o catálogo inteiro de uma vez. No celular a fileira rola
// de lado; no computador são cinco por linha.

import type { Produto } from "../types";
import { CartaoProduto } from "./CartaoProduto";

export function SecaoVitrine({
  titulo,
  subtitulo,
  produtos,
  aoVerTodos,
  rotuloVerTodos = "Ver todos",
  favoritos,
  aoFavoritar,
  aoAbrirProduto,
  estoqueBaixo,
}: {
  titulo: string;
  subtitulo?: string;
  produtos: Produto[];
  aoVerTodos?: () => void;
  rotuloVerTodos?: string;
  favoritos: number[];
  aoFavoritar: (id: number) => void;
  aoAbrirProduto: (p: Produto) => void;
  estoqueBaixo?: number;
}) {
  if (produtos.length === 0) return null;

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-8">
      <div className="flex items-baseline gap-4 mb-3">
        <h2 className="text-[20px] md:text-[22px] text-gray-800">{titulo}</h2>
        {aoVerTodos && (
          <button onClick={aoVerTodos} className="text-[14px] text-[#C8102E] hover:underline whitespace-nowrap">
            {rotuloVerTodos}
          </button>
        )}
      </div>
      {subtitulo && <p className="text-[13.5px] text-gray-500 -mt-2 mb-3">{subtitulo}</p>}
      <div className="flex md:grid md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 pb-1 snap-x">
        {produtos.slice(0, 5).map((p, i) => (
          <div key={p.id} className={`w-[158px] md:w-auto flex-shrink-0 flex snap-start ${i === 4 ? "md:hidden lg:flex" : ""}`}>
            <CartaoProduto
              produto={p}
              aoFavoritar={aoFavoritar}
              estaFavoritado={favoritos.includes(p.id)}
              aoAbrirProduto={aoAbrirProduto}
              estoqueBaixo={estoqueBaixo}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
