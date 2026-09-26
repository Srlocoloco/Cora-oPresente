// Tela TelaNotificacoesCliente

import { useEffect, useState } from "react";
import { Package, Bell, BellRing, Plus, ChevronLeft, Sparkles, ChevronRight, Star } from "lucide-react";
import { toast } from "sonner";
import type { Pedido, Produto } from "../types";
import { NOTIFICACAO_POR_STATUS } from "../constantes";
import { formatarMoeda } from "../utils";
import { descontoDe, motivoDaRecomendacao } from "../recomendacoes";
import { ImagemProduto } from "../components/ImagemProduto";
import {
  ativarNotificacoes, desativarNotificacoes, jaInscrito, permissaoAtual, pushDisponivel,
} from "../notificacoesPush";

// Faixa que oferece (ou desliga) a notificação no celular. Só aparece quando o
// navegador aceita E o servidor tem a chave configurada — em qualquer outro
// caso o cliente não vê uma opção que não funcionaria.
function AvisoNotificacoes() {
  const [disponivel, setDisponivel] = useState(false);
  const [ligado, setLigado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [ok, inscrito] = await Promise.all([pushDisponivel(), jaInscrito()]);
      if (!vivo) return;
      setDisponivel(ok);
      setLigado(inscrito && permissaoAtual() === "granted");
    })();
    return () => { vivo = false; };
  }, []);

  if (!disponivel) return null;

  const alternar = async () => {
    setOcupado(true);
    if (ligado) {
      await desativarNotificacoes();
      setLigado(false);
      toast.success("Notificações desligadas neste aparelho.");
    } else {
      const erro = await ativarNotificacoes();
      if (erro) {
        toast.error(erro, { duration: 7000 });
      } else {
        setLigado(true);
        toast.success("Pronto! Avisaremos você a cada novidade do seu pedido.");
      }
    }
    setOcupado(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${ligado ? "bg-green-50" : "bg-red-50"}`}>
        <BellRing size={18} className={ligado ? "text-green-600" : "text-[#C8102E]"} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-800">
          {ligado ? "Notificações ligadas neste aparelho" : "Receba avisos no seu celular"}
        </p>
        <p className="text-[11.5px] text-gray-400 mt-0.5">
          {ligado
            ? "Você é avisado assim que o pedido é despachado ou entregue."
            : "Avisamos quando o pagamento é confirmado, quando o pedido sai para entrega e quando chega."}
        </p>
        <button
          onClick={alternar}
          disabled={ocupado}
          className={`mt-2.5 text-[12px] font-bold rounded-xl px-4 py-2 transition-colors disabled:opacity-50 ${
            ligado
              ? "border-2 border-gray-200 text-gray-500 hover:border-gray-300"
              : "bg-[#C8102E] hover:bg-[#8C1626] text-white"
          }`}
        >
          {ocupado ? "Um instante..." : ligado ? "Desligar" : "Ativar notificações"}
        </button>
      </div>
    </div>
  );
}

export function TelaNotificacoesCliente({
  pedidos,
  produtos,
  recomendacoes = [],
  compradosPeloCliente = [],
  aoVerProduto,
  aoVoltar,
  aoAvaliarProduto,
}: {
  pedidos: Pedido[];
  // Catálogo: de onde sai a foto do produto de cada pedido
  produtos: Produto[];
  // Sugestões da loja (ver recomendacoes.ts) — o "campo próprio" das ofertas,
  // aqui dentro do sino, onde a pessoa vai quando quer ver novidade
  recomendacoes?: Produto[];
  compradosPeloCliente?: Produto[];
  aoVerProduto?: (p: Produto) => void;
  aoVoltar: () => void;
  // Só chega preenchido para pedidos já entregues — ver o botão "Avaliar"
  aoAvaliarProduto?: (p: Produto) => void;
}) {
  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-[#C8102E] px-4 py-4">
        <div className="max-w-[720px] mx-auto flex items-center gap-3">
          <button onClick={aoVoltar} className="text-white/90 hover:text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-white font-black text-lg">Notificações</h1>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 py-5 space-y-2.5">
        <AvisoNotificacoes />
        {pedidos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400">
            <Bell size={36} strokeWidth={1} className="mx-auto mb-3" />
            <p className="font-medium text-[13px]">Nenhuma notificação por enquanto.</p>
            <p className="text-[12px] mt-1">O andamento das suas compras vai aparecer aqui.</p>
          </div>
        ) : (
          pedidos.map((o) => {
            const n = NOTIFICACAO_POR_STATUS[o.status] ?? {
              icon: <Package size={18} className="text-gray-400" />,
              texto: (id: string) => `Pedido ${id}: ${o.status}`,
              cor: "bg-gray-50",
            };
            const produtoDoPedido = produtos.find((p) => p.id === o.produtoId);
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${n.cor}`}>
                  {n.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-800">{n.texto(o.id)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{o.items} · {formatarMoeda(o.total)} · {o.date}</p>
                  {/* Pedido entregue: é aqui que a pessoa consegue avaliar sem
                      ter que caçar o produto na loja. Só aparece com o produto
                      ainda no catálogo — sem ele não há página de avaliação. */}
                  {o.status === "Entregue" && produtoDoPedido && aoAvaliarProduto && (
                    <button
                      onClick={() => aoAvaliarProduto(produtoDoPedido)}
                      className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-black text-[#C8102E] border-2 border-[#C8102E]/25 hover:border-[#C8102E] hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Star size={12} strokeWidth={2.5} />
                      Avaliar minha compra
                    </button>
                  )}
                </div>
                {/* Foto do que foi comprado: dá para reconhecer o pedido de
                    relance, e um toque leva de volta ao produto na loja */}
                {produtoDoPedido && (
                  <button
                    onClick={() => aoVerProduto?.(produtoDoPedido)}
                    disabled={!aoVerProduto}
                    title={`Ver ${produtoDoPedido.name} na loja`}
                    className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 p-1 flex-shrink-0 disabled:cursor-default"
                  >
                    <ImagemProduto
                      src={produtoDoPedido.image}
                      alt={produtoDoPedido.name}
                      className="w-full h-full object-contain"
                    />
                  </button>
                )}
              </div>
            );
          })
        )}

        {/* Ofertas para você: as sugestões da loja moram aqui, no mesmo lugar
            que a pessoa já abre para ver novidade — e não em cima da
            navegação dela. Cada uma com foto, preço e o motivo de estar
            sendo mostrada. */}
        {recomendacoes.length > 0 && aoVerProduto && (
          <div className="pt-3">
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <Sparkles size={15} className="text-[#C8102E]" />
              <h2 className="text-[13px] font-black text-gray-800">Ofertas para você</h2>
            </div>
            <div className="space-y-2.5">
              {recomendacoes.map((p) => {
                const desconto = descontoDe(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => aoVerProduto(p)}
                    className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 text-left hover:border-[#C8102E] transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 p-1 flex-shrink-0">
                      <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] font-bold text-[#C8102E] truncate">
                        {motivoDaRecomendacao(p, compradosPeloCliente)}
                      </p>
                      <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{p.name}</p>
                      <p className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-[13px] font-black text-gray-900">{formatarMoeda(p.price)}</span>
                        {desconto > 0 && (
                          <>
                            <span className="text-[11px] text-gray-400 line-through">
                              {formatarMoeda(p.originalPrice as number)}
                            </span>
                            <span className="text-[10px] font-black text-emerald-600">
                              -{Math.round(desconto * 100)}%
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
