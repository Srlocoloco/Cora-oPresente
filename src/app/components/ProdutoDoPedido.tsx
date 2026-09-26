// Componente ProdutoDoPedido
//
// A foto do produto comprado, ao lado da descrição do pedido, com atalho para
// a página dele na loja — é assim que o cliente (e o Admin) volta ao produto a
// partir de um pedido, para comprar de novo ou conferir o que foi.
//
// Pedido antigo (de antes da coluna produtoId) e produto que saiu do catálogo
// caem no mesmo lugar: mostra só o texto, sem foto e sem link — nunca uma
// imagem quebrada ou um clique que não leva a lugar nenhum.

import type { Produto } from "../types";
import { ImagemProduto } from "./ImagemProduto";

export function ProdutoDoPedido({
  produto,
  descricao,
  aoAbrir,
  tamanhoFoto = "w-11 h-11",
  className = "",
}: {
  produto?: Produto | null;
  descricao: string;
  aoAbrir?: (produto: Produto) => void;
  // Cada lugar usa um tamanho: a lista do perfil, a tabela do Admin, o sino
  tamanhoFoto?: string;
  className?: string;
}) {
  const conteudo = (
    <>
      {produto && (
        <ImagemProduto
          src={produto.image}
          alt={produto.name}
          className={`${tamanhoFoto} rounded-lg object-cover border border-gray-100 flex-shrink-0 bg-gray-50`}
        />
      )}
      <span className="min-w-0 text-left">
        <span className="block truncate">{descricao}</span>
        {produto && aoAbrir && (
          <span className="block text-[11px] font-bold text-[#A8102A]">Ver na loja</span>
        )}
      </span>
    </>
  );

  if (!produto || !aoAbrir) {
    return <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => aoAbrir(produto)}
      title={`Ver ${produto.name} na loja`}
      className={`flex items-center gap-2.5 min-w-0 text-left rounded-lg hover:bg-gray-50 transition-colors ${className}`}
    >
      {conteudo}
    </button>
  );
}
