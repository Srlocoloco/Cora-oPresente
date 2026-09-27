// Tela TelaCompraConcluida
//
// Depois do pagamento aprovado: a faixa verde de "Pronto!", os números dos
// pedidos, onde vai chegar e o que acontece agora. Embaixo, o convite para
// avaliar o que comprou (clicando, vai direto para as opiniões do produto) e
// sugestões a partir do que acabou de ser comprado.

import { Check, ChevronRight } from "lucide-react";
import type { Compra, Produto } from "../types";
import { formatarMoeda } from "../utils";
import { descontoDe } from "../recomendacoes";
import { ImagemProduto } from "../components/ImagemProduto";
import { CabecalhoCheckout } from "../components/CabecalhoCheckout";

const PROXIMOS_PASSOS = ["Pagamento aprovado", "Preparando", "A caminho", "Entregue"];

export function TelaCompraConcluida({
  total,
  compra,
  aoVerPedidos,
  produtosComprados = [],
  recomendacoes = [],
  aoAvaliarProduto,
  aoVerProduto,
  aoContinuar,
}: {
  total: number;
  // A compra paga (números dos pedidos, endereço, forma de pagamento)
  compra?: Compra | null;
  aoVerPedidos?: () => void;
  produtosComprados?: Produto[];
  // O que a loja sugere a partir do que acabou de ser comprado (ver
  // recomendacoes.ts). É a hora em que a sugestão mais faz sentido: a pessoa
  // ainda está com o presente na cabeça.
  recomendacoes?: Produto[];
  aoAvaliarProduto?: (p: Produto) => void;
  aoVerProduto?: (p: Produto) => void;
  aoContinuar: () => void;
}) {
  const podeAvaliar = produtosComprados.length > 0 && Boolean(aoAvaliarProduto);
  const sugestoes = aoVerProduto ? recomendacoes.slice(0, 4) : [];
  const linhaProduto = "w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-black/[0.02]";

  return (
    <div className="min-h-screen bg-[#EDEDED]">
      <CabecalhoCheckout />
      <div className="bg-[#00A650] text-white">
        <div className="max-w-[720px] mx-auto px-4 pt-8 pb-16 flex items-center gap-4">
          <span className="w-12 h-12 bg-white rounded-full flex items-center justify-center flex-shrink-0">
            <Check size={26} className="text-[#00A650]" strokeWidth={3} />
          </span>
          <div>
            <h1 className="text-[22px] md:text-[26px] font-semibold leading-tight">Pronto! Seu pagamento foi aprovado</h1>
            <p className="text-[15px] text-white/90 mt-0.5">
              Você pagou {formatarMoeda(compra?.total ?? total)}
              {compra?.metodo === "cartao" && compra.parcelas > 1 ? ` em ${compra.parcelas}x no cartão` : compra?.metodo === "pix" ? " com Pix" : ""}.
            </p>
          </div>
        </div>
      </div>

      <main className="max-w-[720px] mx-auto px-4 -mt-10 pb-12 space-y-3">
        {compra && (
          <section className="painel">
            <div className="px-5 py-4 border-b border-black/[0.08]">
              <p className="text-[13px] text-gray-500 mb-2">{compra.pedidos.length === 1 ? "Seu pedido" : "Seus pedidos"}</p>
              <ul className="space-y-2">
                {compra.pedidos.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 text-[14px]">
                    <span className="min-w-0">
                      <span className="text-gray-900">Pedido {p.id}</span>
                      <span className="block text-gray-500 line-clamp-1">{p.items}</span>
                    </span>
                    <span className="text-gray-700 tabular-nums flex-shrink-0">{formatarMoeda(p.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-4 border-b border-black/[0.08] text-[14px]">
              <p className="text-[13px] text-gray-500 mb-1">Entrega em</p>
              <p className="text-gray-800">{compra.endereco}</p>
            </div>
            <div className="px-5 py-5">
              <ol className="grid grid-cols-4 gap-1.5">
                {PROXIMOS_PASSOS.map((passo, i) => (
                  <li key={passo}>
                    <span className={`block h-1 rounded-full ${i === 0 ? "bg-[#00A650]" : "bg-black/10"}`} />
                    <span className={`block text-[12px] mt-1.5 leading-tight ${i === 0 ? "text-[#00A650] font-semibold" : "text-gray-400"}`}>
                      {passo}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-[13.5px] text-gray-500 mt-4">Avisamos por e-mail e no sino da loja a cada mudança.</p>
              {aoVerPedidos && (
                <button onClick={aoVerPedidos} className="btn-primario w-full sm:w-auto mt-4 px-8 py-3 text-[15px]">
                  Acompanhar meu pedido
                </button>
              )}
            </div>
          </section>
        )}

        {podeAvaliar && (
          <section className="painel">
            <h2 className="px-5 pt-4 pb-2 text-[16px] text-gray-900">O que você achou? Dê sua opinião</h2>
            <ul className="divide-y divide-black/[0.06] pb-1">
              {produtosComprados.map((p) => (
                <li key={p.id}>
                  <button onClick={() => aoAvaliarProduto?.(p)} className={linhaProduto}>
                    <span className="w-12 h-12 rounded border border-black/10 p-0.5 flex-shrink-0 bg-white">
                      <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
                    </span>
                    <span className="text-[14px] text-gray-800 line-clamp-2 flex-1 min-w-0">{p.name}</span>
                    <span className="text-[14px] text-[#C8102E] flex-shrink-0">Avaliar</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sugestoes.length > 0 && (
          <section className="painel">
            <h2 className="px-5 pt-4 pb-2 text-[16px] text-gray-900">Para completar o presente</h2>
            <ul className="divide-y divide-black/[0.06] pb-1">
              {sugestoes.map((p) => {
                const desconto = descontoDe(p);
                return (
                  <li key={p.id}>
                    <button onClick={() => aoVerProduto?.(p)} className={linhaProduto}>
                      <span className="w-12 h-12 rounded border border-black/10 p-0.5 flex-shrink-0 bg-white">
                        <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] text-gray-800 line-clamp-1">{p.name}</span>
                        <span className="text-[15px] text-gray-900">{formatarMoeda(p.price)}</span>
                        {desconto > 0 && <span className="text-[13px] text-[#00A650] ml-2">{Math.round(desconto * 100)}% OFF</span>}
                      </span>
                      <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="pt-2 text-center">
          <button onClick={aoContinuar} className="text-[15px] text-[#C8102E] hover:underline">
            Voltar para a loja
          </button>
        </div>
      </main>
    </div>
  );
}
