// Tela PaginaCarrinho
//
// O carrinho: produtos à esquerda, "Resumo da compra" à direita e um único
// botão para seguir. Entrega, pagamento, cupom e código de venda ficam nas
// etapas seguintes (TelaCheckout), uma por tela.

import { ShoppingCart, Minus, Plus } from "lucide-react";
import type { ItemCarrinho, ConfigLoja, CaixaMontada } from "../types";
import { formatarMoeda, qtdItensDaCaixa, estimarCompra } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { CabecalhoCheckout } from "../components/CabecalhoCheckout";
import { ResumoCompra } from "../components/ResumoCompra";

export function PaginaCarrinho({
  items,
  onRemove,
  aoMudarQtd,
  aoVoltar,
  aoEditarCaixa,
  aoMontarCaixa,
  aoContinuar,
  config,
}: {
  items: ItemCarrinho[];
  onRemove: (id: number, corEscolhida?: string) => void;
  aoMudarQtd: (id: number, variacao: number, corEscolhida?: string) => void;
  aoVoltar: () => void;
  aoEditarCaixa?: (caixa: CaixaMontada) => void;
  aoMontarCaixa?: () => void;
  aoContinuar: () => void;
  config: ConfigLoja;
}) {
  const qtdTotal = items.reduce((a, i) => a + i.qty, 0);
  const est = estimarCompra(items, config, { metodo: "pix" });

  return (
    <div className="min-h-screen bg-[#EDEDED]">
      <CabecalhoCheckout aoVoltar={aoVoltar} rotuloVoltar="Continuar comprando" />

      {items.length === 0 ? (
        <main className="max-w-[1100px] mx-auto px-4 py-10">
          <div className="painel py-14 px-6 text-center">
            <ShoppingCart size={44} strokeWidth={1.25} className="text-gray-400 mx-auto mb-4" />
            <h1 className="text-[22px] text-gray-900">Seu carrinho está vazio</h1>
            <p className="text-[15px] text-gray-500 mt-1.5 mb-7">Veja os produtos da loja ou monte uma caixa de presente do seu jeito.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={aoVoltar} className="btn-primario px-8 py-3 text-[15px] w-full sm:w-auto">
                Ver produtos
              </button>
              {aoMontarCaixa && (
                <button onClick={aoMontarCaixa} className="btn-secundario px-8 py-3 text-[15px] w-full sm:w-auto">
                  Montar uma caixa
                </button>
              )}
            </div>
          </div>
        </main>
      ) : (
        <main className="max-w-[1100px] mx-auto px-4 pt-6 pb-28 lg:pb-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="min-w-0">
            <h1 className="text-[22px] md:text-[24px] text-gray-900 mb-4">
              Carrinho <span className="text-gray-500 text-[16px]">({qtdTotal} {qtdTotal === 1 ? "produto" : "produtos"})</span>
            </h1>
            <section aria-label="Produtos no carrinho" className="painel">
              <ul className="divide-y divide-black/[0.08]">
                {items.map((item) => {
                  const noLimite = item.qty >= item.stock;
                  return (
                    <li key={`${item.id}-${item.corEscolhida ?? ""}`} className="p-4 md:p-5 flex gap-4">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded border border-black/10 bg-white p-1 flex-shrink-0">
                        <ImagemProduto src={item.image} alt={item.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                          <div className="min-w-0">
                            <p className="text-[15px] text-gray-900 leading-snug line-clamp-2">{item.name}</p>
                            {item.corEscolhida && <p className="text-[13px] text-gray-500 mt-0.5">Cor: {item.corEscolhida}</p>}
                            {!!item.pixDesconto && item.pixDesconto > 0 && (
                              <p className="text-[13px] text-[#00A650] mt-0.5">{Math.round(item.pixDesconto)}% OFF pagando com Pix</p>
                            )}
                          </div>
                          <div className="sm:text-right flex-shrink-0">
                            <div className="text-[18px] text-gray-900 tabular-nums">{formatarMoeda(item.price * item.qty)}</div>
                            {item.qty > 1 && <div className="text-[12.5px] text-gray-500">{item.qty} × {formatarMoeda(item.price)}</div>}
                          </div>
                        </div>

                        {item.caixa && (
                          <div className="mt-3 bg-[#F5F5F5] rounded p-3 text-[13px]">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-gray-600">
                                {item.caixa.recipienteTamanho ? `Tamanho ${item.caixa.recipienteTamanho} · ` : ""}
                                {qtdItensDaCaixa(item.caixa)} {qtdItensDaCaixa(item.caixa) === 1 ? "produto dentro" : "produtos dentro"}
                              </span>
                              {aoEditarCaixa && (
                                <button onClick={() => aoEditarCaixa(item.caixa!)} className="text-[#C8102E] hover:underline flex-shrink-0">
                                  Editar caixa
                                </button>
                              )}
                            </div>
                            <ul className="space-y-0.5">
                              {item.caixa.itens.map((dentro) => (
                                <li key={dentro.produtoId} className="flex items-baseline gap-2 text-gray-600">
                                  <span className="text-gray-900 flex-shrink-0">{dentro.qty}x</span>
                                  <span className="flex-1 min-w-0 truncate">{dentro.name}</span>
                                  <span className="text-gray-500 flex-shrink-0 tabular-nums">{formatarMoeda(dentro.price * dentro.qty)}</span>
                                </li>
                              ))}
                            </ul>
                            {(item.caixa.para || item.caixa.de || item.caixa.mensagem) && (
                              <div className="mt-2 pt-2 border-t border-black/10 text-gray-700">
                                {item.caixa.para && <p>Para: {item.caixa.para}</p>}
                                {item.caixa.mensagem && <p className="italic text-gray-600">“{item.caixa.mensagem}”</p>}
                                {item.caixa.de && <p>De: {item.caixa.de}</p>}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          <div className="flex items-center border border-black/15 rounded" role="group" aria-label={`Quantidade de ${item.name}`}>
                            <button
                              onClick={() => aoMudarQtd(item.id, -1, item.corEscolhida)}
                              aria-label="Diminuir quantidade"
                              className="w-8 h-8 flex items-center justify-center text-[#C8102E] disabled:text-gray-300"
                              disabled={item.qty <= 1}
                            >
                              <Minus size={15} />
                            </button>
                            <span className="w-8 text-center text-[14px] tabular-nums" aria-live="polite">{item.qty}</span>
                            <button
                              onClick={() => aoMudarQtd(item.id, 1, item.corEscolhida)}
                              disabled={noLimite}
                              aria-label="Aumentar quantidade"
                              className="w-8 h-8 flex items-center justify-center text-[#C8102E] disabled:text-gray-300"
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                          <span className="text-[13px] text-gray-500">{noLimite ? "Máximo disponível" : `${item.stock} disponíveis`}</span>
                          <button onClick={() => onRemove(item.id, item.corEscolhida)} className="ml-auto text-[14px] text-[#C8102E] hover:underline">
                            Excluir
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {aoMontarCaixa && (
                <div className="border-t border-black/[0.08] px-5 py-4 text-[14px] text-gray-600">
                  Vai mandar de presente?{" "}
                  <button onClick={aoMontarCaixa} className="text-[#C8102E] hover:underline">
                    Monte uma caixa com cartão e mensagem
                  </button>
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-4">
            <ResumoCompra
              linhas={[{ rotulo: qtdTotal === 1 ? "Produto" : `Produtos (${qtdTotal})`, valor: est.subtotal }]}
              total={est.subtotal}
              rotuloTotal="Total"
              observacao={
                est.descontoPix > 0 ? (
                  <span className="text-[#00A650]">Pagando com Pix você economiza {formatarMoeda(est.descontoPix)}.</span>
                ) : undefined
              }
            >
              <button onClick={aoContinuar} className="hidden lg:block btn-primario w-full py-3 text-[15px]">
                Continuar a compra
              </button>
            </ResumoCompra>
          </aside>

          {/* Celular: o botão fica sempre à mão, com o total */}
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-black/10 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center gap-4">
            <div className="min-w-0">
              <div className="text-[12px] text-gray-500 leading-none">Total</div>
              <div className="text-[18px] font-semibold text-gray-900 tabular-nums mt-1">{formatarMoeda(est.subtotal)}</div>
            </div>
            <button onClick={aoContinuar} className="btn-primario flex-1 py-3 text-[15px]">
              Continuar a compra
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
