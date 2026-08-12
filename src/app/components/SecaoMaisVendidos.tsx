// Componente SecaoMaisVendidos
// Os produtos com mais avaliações — proxy honesto de "mais vendido" já que a
// loja não guarda contagem de vendas por produto. Rolagem horizontal no
// celular (uma mão só), grade no desktop.

import type { Produto } from "../types";
import { CartaoProduto } from "./CartaoProduto";

export function SecaoMaisVendidos({
  produtos, aoAdicionarAoCarrinho, aoFavoritar, favoritos, aoAbrirProduto,
}: {
  produtos: Produto[];
  aoAdicionarAoCarrinho: (p: Produto) => void;
  aoFavoritar: (id: number) => void;
  favoritos: number[];
  aoAbrirProduto: (p: Produto) => void;
}) {
  const destaques = [...produtos]
    .filter((p) => p.stock > 0)
    .sort((a, b) => b.reviews - a.reviews)
    .slice(0, 8);
  if (destaques.length === 0) return null;

  return (
    <section className="max-w-[1440px] mx-auto px-4 pt-8">
      <h2 className="text-[20px] md:text-2xl font-bold text-gray-900 mb-4">Mais vendidos</h2>
      <div className="flex md:grid md:grid-cols-4 gap-3 md:gap-5 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {destaques.map((p) => (
          <div key={p.id} className="w-[150px] md:w-auto flex-shrink-0">
            <CartaoProduto
              produto={p}
              aoAdicionarAoCarrinho={aoAdicionarAoCarrinho}
              aoFavoritar={aoFavoritar}
              estaFavoritado={favoritos.includes(p.id)}
              aoAbrirProduto={aoAbrirProduto}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
