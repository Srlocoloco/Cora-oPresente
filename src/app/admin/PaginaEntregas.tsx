// Pagina Admin: PaginaEntregas

import { useState } from "react";
import { MapPin, Navigation, Copy, Check, Truck, Package, Route } from "lucide-react";
import type { Pedido, Produto } from "../types";
import { formatarMoeda } from "../utils";
import { ProdutoDoPedido } from "../components/ProdutoDoPedido";

// ─── Página Minhas Entregas (cargo Entregador) ────────────────────────────────
//
// A única página do painel do entregador, e ela tem que resolver a rotina
// inteira dele sem depender de ninguém: o que levar, para quem, onde, e os
// dois botões que mudam o andamento do pedido ("saiu para entrega" e
// "entregue"). Cada botão desses dispara o aviso ao cliente por e-mail e
// notificação no celular — quem avisa é o servidor, o entregador não precisa
// fazer mais nada.
//
// O que ele NÃO vê aqui: pedido de outro entregador (o servidor só entrega os
// designados a ele), preço de custo, comissão, dados de outros clientes.

// Endereço no app de mapas do celular. Sai como busca (e não como rota já
// traçada) de propósito: o app abre no ponto e a pessoa escolhe se quer rota
// de carro, moto ou a pé, com o trânsito do momento.
function linkDoMapa(endereco: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

// Rota com várias paradas de uma vez: o app monta o caminho passando por todas
// as entregas pendentes, na ordem da lista. O Google aceita poucas paradas por
// URL, então manda as primeiras — o resto entra na próxima leva.
const MAX_PARADAS_NA_ROTA = 9;

function linkDaRota(enderecos: string[]) {
  const paradas = enderecos.slice(0, MAX_PARADAS_NA_ROTA);
  const destino = encodeURIComponent(paradas[paradas.length - 1]);
  const intermediarias = paradas
    .slice(0, -1)
    .map((e) => encodeURIComponent(e))
    .join("|");
  return (
    `https://www.google.com/maps/dir/?api=1&destination=${destino}` +
    (intermediarias ? `&waypoints=${intermediarias}` : "")
  );
}

export function PaginaEntregas({
  pedidos,
  produtos,
  aoAtualizarStatus,
}: {
  // Já chegam só as entregas designadas a esta conta
  pedidos: Pedido[];
  produtos: Produto[];
  aoAtualizarStatus: (id: string, mudancas: { status?: string }) => void;
}) {
  const [aba, setAba] = useState<"pendentes" | "entregues">("pendentes");
  const [copiado, setCopiado] = useState("");

  // Fila do dia: o pedido mais antigo primeiro — quem está esperando há mais
  // tempo é atendido antes
  const emAberto = pedidos
    .filter((o) => o.status === "Processando" || o.status === "Em trânsito")
    .slice()
    .reverse();
  const entregues = pedidos.filter((o) => o.status === "Entregue");
  const visiveis = aba === "pendentes" ? emAberto : entregues;

  const enderecosPendentes = emAberto.map((o) => o.endereco).filter((e): e is string => Boolean(e));

  const copiarEndereco = (id: string, endereco: string) => {
    navigator.clipboard?.writeText(endereco).catch(() => {});
    setCopiado(id);
    setTimeout(() => setCopiado(""), 2000);
  };

  const cartoes = [
    { label: "A entregar", valor: emAberto.length, icone: <Package size={22} className="text-amber-500" /> },
    { label: "Entregues", valor: entregues.length, icone: <Check size={22} className="text-emerald-600" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-xl font-black text-gray-900">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold truncate">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Rota do dia: abre o mapa já com todas as paradas pendentes */}
      {enderecosPendentes.length > 1 && (
        <a
          href={linkDaRota(enderecosPendentes)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-[#4A1218] hover:bg-[#2E0B0F] text-white font-black py-3.5 rounded-2xl transition-colors text-[14px] flex items-center justify-center gap-2"
        >
          <Route size={17} />
          Abrir rota com {Math.min(enderecosPendentes.length, MAX_PARADAS_NA_ROTA)} paradas
        </a>
      )}

      <div className="flex gap-2">
        {([
          { id: "pendentes", rotulo: `A entregar (${emAberto.length})` },
          { id: "entregues", rotulo: `Entregues (${entregues.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${
              aba === t.id
                ? "bg-[#C8102E] text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
            }`}
          >
            {t.rotulo}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-14 text-center">
          <Truck size={34} strokeWidth={1.25} className="text-gray-300 mx-auto mb-3" />
          <p className="text-[13px] text-gray-500 font-medium">
            {aba === "pendentes"
              ? "Nenhuma entrega na sua fila agora."
              : "Você ainda não concluiu nenhuma entrega."}
          </p>
          {aba === "pendentes" && (
            <p className="text-[12px] text-gray-400 mt-1">
              Assim que o Admin designar um pedido para você, ele aparece aqui.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((o) => {
            const saiuParaEntrega = o.status === "Em trânsito";
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</span>
                  <span
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                      o.status === "Entregue"
                        ? "bg-emerald-50 text-emerald-600"
                        : saiuParaEntrega
                        ? "bg-blue-50 text-blue-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {saiuParaEntrega ? "A CAMINHO" : o.status === "Entregue" ? "ENTREGUE" : "SEPARADO"}
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  <ProdutoDoPedido
                    produto={produtos.find((p) => p.id === o.produtoId)}
                    descricao={o.items}
                    tamanhoFoto="w-12 h-12"
                    className="text-[13px] text-gray-800 font-semibold w-full"
                  />

                  <div className="text-[13px] text-gray-700">
                    <span className="text-gray-400 text-[11px] font-semibold block">Entregar para</span>
                    {o.customer}
                  </div>

                  {o.endereco ? (
                    <div>
                      <span className="text-gray-400 text-[11px] font-semibold flex items-center gap-1">
                        <MapPin size={11} /> Endereço
                      </span>
                      <p className="text-[13px] text-gray-700 leading-snug">{o.endereco}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <a
                          href={linkDoMapa(o.endereco)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[12px] font-bold text-white bg-[#C8102E] hover:bg-[#8C1626] px-3.5 py-2 rounded-xl transition-colors"
                        >
                          <Navigation size={13} />
                          Abrir no mapa
                        </a>
                        <button
                          onClick={() => copiarEndereco(o.id, o.endereco as string)}
                          className="flex items-center gap-1.5 text-[12px] font-bold text-gray-600 border-2 border-gray-200 hover:border-gray-300 px-3.5 py-2 rounded-xl transition-colors"
                        >
                          <Copy size={13} />
                          {copiado === o.id ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Este pedido não tem endereço cadastrado — confirme com o Admin antes de sair.
                    </p>
                  )}

                  {/* Cobrança: a loja recebe pelo site (PIX ou cartão) antes de
                      o pedido existir. Deixar isso escrito evita o erro mais
                      caro da entrega, que é cobrar de novo na porta. */}
                  <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <span className="text-gray-400 text-[11px] font-semibold block">
                        {o.pagamento ? `Pago no site · ${o.pagamento}` : "Pago no site"}
                      </span>
                      <span className="text-[11px] text-gray-500">Não cobrar na entrega</span>
                    </div>
                    <span className="text-[15px] font-black text-gray-900 flex-shrink-0">
                      {formatarMoeda(o.total)}
                    </span>
                  </div>

                  {o.status !== "Entregue" && (
                    <div className="flex gap-2 flex-col sm:flex-row pt-0.5">
                      {!saiuParaEntrega && (
                        <button
                          onClick={() => aoAtualizarStatus(o.id, { status: "Em trânsito" })}
                          className="flex-1 border-2 border-[#C8102E] text-[#C8102E] hover:bg-red-50 font-black py-3 rounded-xl transition-colors text-[13px] flex items-center justify-center gap-2"
                        >
                          <Truck size={15} />
                          Saí para entrega
                        </button>
                      )}
                      <button
                        onClick={() => aoAtualizarStatus(o.id, { status: "Entregue" })}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl transition-colors text-[13px] flex items-center justify-center gap-2"
                      >
                        <Check size={15} />
                        Confirmar entrega
                      </button>
                    </div>
                  )}
                  {o.status !== "Entregue" && (
                    <p className="text-[11px] text-gray-400 text-center">
                      O cliente é avisado por e-mail e no celular a cada um destes toques.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
