// Tela TelaPerfil
//
// "Minha conta" do cliente, enxuta como nas grandes lojas: as compras em
// primeiro lugar (com abas por situação e "Pagar agora" onde falta pagar), os
// cupons e, para quem ainda não vende, a ativação do código de vendedor. No
// computador, um menu simples à esquerda; no celular, a barra de baixo
// (BarraInferiorMobile, fora deste componente) faz esse papel.

import { useState } from "react";
import { ChevronLeft, ChevronRight, Bell, LogOut, ShoppingBag } from "lucide-react";
import type { Usuario, Cupom, Cargo, Pedido, Produto } from "../types";
import { formatarMoeda } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { Logo } from "../components/Logo";

// As abas de "Minhas compras": cada uma junta os status do pedido que, para o
// cliente, são a mesma coisa
const ABAS = [
  { id: "todas", rotulo: "Todas", status: null },
  { id: "pagar", rotulo: "A pagar", status: ["Aguardando pagamento"] },
  { id: "andamento", rotulo: "Em andamento", status: ["Pago", "Processando", "Em trânsito"] },
  { id: "entregues", rotulo: "Entregues", status: ["Entregue"] },
  { id: "canceladas", rotulo: "Canceladas", status: ["Cancelado"] },
] as const;
type Aba = (typeof ABAS)[number]["id"];

// Como cada status aparece para o cliente
const SITUACAO: Record<string, { texto: string; cor: string }> = {
  "Aguardando pagamento": { texto: "Aguardando pagamento", cor: "text-[#B45309]" },
  Pago: { texto: "Pagamento aprovado", cor: "text-gray-900" },
  Processando: { texto: "Preparando o pedido", cor: "text-gray-900" },
  "Em trânsito": { texto: "A caminho", cor: "text-[#1F6FEB]" },
  Entregue: { texto: "Entregue", cor: "text-[#00A650]" },
  Cancelado: { texto: "Cancelado", cor: "text-gray-500" },
};

const POR_PAGINA = 8;

export function TelaPerfil({
  usuario,
  pedidos,
  produtos,
  cupons,
  desde,
  aoVerCategoria,
  aoVerProduto,
  aoVoltar,
  aoSair,
  aoAbrirNotificacoes,
  aoAbrirAjuda,
  rotuloPainel,
  aoAbrirPainel,
  cargoUsuario,
  aoAtivarCodigo,
  aoPagarCompra,
}: {
  usuario: Usuario;
  pedidos: Pedido[];
  // Catálogo, só para achar a foto do produto de cada pedido (Pedido guarda o
  // produtoId, não a foto)
  produtos: Produto[];
  cupons: Cupom[];
  // "Cliente desde" — vem do cadastro no banco; sem essa informação, omite a linha
  desde?: string;
  aoVerCategoria: (c: string) => void;
  // Abre a página do produto na loja — o "revisitar" a partir do pedido
  aoVerProduto: (produto: Produto) => void;
  aoVoltar: () => void;
  aoSair: () => void;
  aoAbrirNotificacoes: () => void;
  aoAbrirAjuda: () => void;
  rotuloPainel: string | null;
  aoAbrirPainel: () => void;
  cargoUsuario?: Cargo;
  aoAtivarCodigo: (codigo: string) => string | null;
  // Retoma o pagamento de uma compra "Aguardando pagamento"
  aoPagarCompra?: (compraId: string) => void;
}) {
  // Quem tem algo para pagar já abre nessa aba: é o que pede ação
  const [aba, setAba] = useState<Aba>(() =>
    pedidos.some((o) => o.status === "Aguardando pagamento") ? "pagar" : "todas"
  );
  const [qtdVisivel, setQtdVisivel] = useState(POR_PAGINA);
  const [cupomCopiado, setCupomCopiado] = useState("");
  const [codigoAtivar, setCodigoAtivar] = useState("");
  const [erroAtivar, setErroAtivar] = useState("");

  const ativarCodigo = () => {
    const resultado = aoAtivarCodigo(codigoAtivar);
    if (resultado) return setErroAtivar(resultado);
    setErroAtivar("");
    setCodigoAtivar("");
  };

  const statusDaAba = (id: Aba) => ABAS.find((a) => a.id === id)?.status ?? null;
  const daAba = (id: Aba) => {
    const status = statusDaAba(id);
    return status ? pedidos.filter((o) => (status as readonly string[]).includes(o.status)) : pedidos;
  };
  const visiveis = daAba(aba);

  const copiarCupom = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCupomCopiado(codigo);
    setTimeout(() => setCupomCopiado(""), 2000);
  };

  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const linkMenu = "w-full text-left px-4 py-2.5 text-[14.5px] text-gray-700 hover:bg-black/[0.03]";

  return (
    <div className="min-h-screen bg-[#EDEDED] pb-20 md:pb-10">
      <header className="bg-[#A8102A] text-white">
        <div className="max-w-[1100px] mx-auto px-4 h-[52px] flex items-center gap-3">
          <button onClick={aoVoltar} className="-ml-2 p-2 flex items-center gap-1 text-[14px] text-white/90 hover:text-white">
            <ChevronLeft size={20} />
            <span className="hidden md:inline">Voltar à loja</span>
          </button>
          <Logo claro />
          <div className="ml-auto flex items-center gap-1">
            <button onClick={aoAbrirNotificacoes} aria-label="Avisos" className="p-2 text-white/85 hover:text-white">
              <Bell size={19} />
            </button>
            <button onClick={aoSair} className="p-2 flex items-center gap-1.5 text-[14px] text-white/85 hover:text-white">
              <LogOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 pt-5 md:pt-8 grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] items-start">
        {/* ── Menu (computador) ── */}
        <aside className="hidden md:block painel py-2 md:sticky md:top-4">
          <div className="px-4 pt-2 pb-3 border-b border-black/[0.08] mb-1">
            <p className="text-[15px] text-gray-900 truncate">{usuario.name}</p>
            <p className="text-[12.5px] text-gray-500 truncate">{usuario.email}</p>
          </div>
          <button onClick={() => irPara("minhas-compras")} className={`${linkMenu} font-semibold text-gray-900`}>Minhas compras</button>
          {cupons.length > 0 && <button onClick={() => irPara("meus-cupons")} className={linkMenu}>Cupons</button>}
          {!cargoUsuario && <button onClick={() => irPara("vender")} className={linkMenu}>Vender com a gente</button>}
          {rotuloPainel && <button onClick={aoAbrirPainel} className={linkMenu}>Painel {rotuloPainel}</button>}
          <button onClick={aoAbrirAjuda} className={linkMenu}>Ajuda</button>
          <button onClick={aoSair} className={`${linkMenu} text-gray-500`}>Sair</button>
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Quem é (celular) */}
          <div className="md:hidden flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center text-[17px] text-gray-700 flex-shrink-0">
              {usuario.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[16px] text-gray-900 truncate">Olá, {usuario.name.split(" ")[0]}</p>
              <p className="text-[12.5px] text-gray-500 truncate">
                {usuario.email}
                {desde ? ` · cliente desde ${desde}` : ""}
              </p>
            </div>
          </div>

          {rotuloPainel && (
            <button onClick={aoAbrirPainel} className="md:hidden painel w-full flex items-center justify-between px-4 py-3.5 text-[15px] text-gray-800">
              Abrir o painel {rotuloPainel}
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          )}

          {/* ── Minhas compras ── */}
          <section id="minhas-compras" className="painel scroll-mt-4">
            <h1 className="px-5 pt-4 text-[20px] text-gray-900">Minhas compras</h1>
            <div role="tablist" className="flex gap-5 px-5 mt-2 border-b border-black/[0.08] overflow-x-auto scrollbar-hide">
              {ABAS.map((a) => {
                const qtd = daAba(a.id).length;
                const ativa = aba === a.id;
                return (
                  <button
                    key={a.id}
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => { setAba(a.id); setQtdVisivel(POR_PAGINA); }}
                    className={`py-2.5 text-[14px] whitespace-nowrap border-b-2 -mb-px ${
                      ativa ? "border-[#C8102E] text-gray-900 font-semibold" : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {a.rotulo}
                    {qtd > 0 && <span className={`ml-1 ${ativa ? "text-gray-500" : "text-gray-400"}`}>{qtd}</span>}
                  </button>
                );
              })}
            </div>

            {visiveis.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <ShoppingBag size={36} strokeWidth={1.25} className="text-gray-300 mx-auto mb-3" />
                <p className="text-[15px] text-gray-600">
                  {aba === "todas" ? "Você ainda não fez nenhuma compra." : "Nenhuma compra aqui."}
                </p>
                {aba === "todas" && (
                  <button onClick={() => aoVerCategoria("Outros")} className="mt-3 text-[14px] text-[#C8102E] hover:underline">
                    Ver produtos da loja
                  </button>
                )}
              </div>
            ) : (
              <>
                <ul className="divide-y divide-black/[0.08]">
                  {visiveis.slice(0, qtdVisivel).map((o) => {
                    const produto = produtos.find((p) => p.id === o.produtoId);
                    const situacao = SITUACAO[o.status] ?? { texto: o.status, cor: "text-gray-700" };
                    const pagar = o.status === "Aguardando pagamento" && o.compraId && aoPagarCompra;
                    return (
                      <li key={o.id} className="px-5 py-4 flex gap-4">
                        <button
                          onClick={() => produto && aoVerProduto(produto)}
                          disabled={!produto}
                          aria-label={produto ? `Ver ${produto.name} na loja` : undefined}
                          className="w-14 h-14 rounded border border-black/10 bg-white p-0.5 flex-shrink-0"
                        >
                          {produto && <ImagemProduto src={produto.image} alt="" className="w-full h-full object-contain" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[14px] font-semibold ${situacao.cor}`}>{situacao.texto}</p>
                          <p className="text-[14px] text-gray-800 line-clamp-1">{o.items}</p>
                          <p className="text-[12.5px] text-gray-500 mt-0.5">
                            {o.date} · Pedido {o.id}
                            {o.codigoRastreio ? ` · Rastreio ${o.codigoRastreio}` : ""}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                          <span className="text-[15px] text-gray-900 tabular-nums">{formatarMoeda(o.total)}</span>
                          {pagar && (
                            <button onClick={() => aoPagarCompra!(o.compraId!)} className="btn-primario text-[13px] px-3.5 py-1.5">
                              Pagar agora
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {visiveis.length > qtdVisivel && (
                  <div className="border-t border-black/[0.08] px-5 py-3 text-center">
                    <button onClick={() => setQtdVisivel((n) => n + POR_PAGINA)} className="text-[14px] text-[#C8102E] hover:underline">
                      Ver mais compras
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Cupons ── */}
          {cupons.length > 0 && (
            <section id="meus-cupons" className="painel scroll-mt-4">
              <h2 className="px-5 pt-4 pb-2 text-[17px] text-gray-900">Cupons para você</h2>
              <ul className="divide-y divide-black/[0.08]">
                {cupons.map((c) => (
                  <li key={c.codigo} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] text-gray-900">{c.percentual}% de desconto</p>
                      <p className="text-[12.5px] text-gray-500">
                        Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · use na revisão da compra
                      </p>
                    </div>
                    <button onClick={() => copiarCupom(c.codigo)} className="btn-secundario font-mono text-[13px] px-3 py-1.5 flex-shrink-0">
                      {cupomCopiado === c.codigo ? "Copiado" : c.codigo}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Ativar código de vendedor: só para quem ainda não tem cargo ── */}
          {!cargoUsuario && (
            <section id="vender" className="painel px-5 py-4 scroll-mt-4">
              <h2 className="text-[17px] text-gray-900">Vender com a gente</h2>
              <p className="text-[13.5px] text-gray-500 mt-0.5">
                Recebeu um código de vendedor? Ative aqui para divulgar a loja e ganhar comissão em cada venda.
              </p>
              <div className="flex gap-2 flex-col sm:flex-row mt-3 max-w-[480px]">
                <input
                  value={codigoAtivar}
                  onChange={(e) => { setCodigoAtivar(e.target.value.toUpperCase()); setErroAtivar(""); }}
                  placeholder="Ex.: CP-7K2M9X"
                  aria-label="Código de vendedor"
                  className="campo font-mono flex-1 min-w-0"
                />
                <button onClick={ativarCodigo} disabled={!codigoAtivar.trim()} className="btn-primario px-5 py-2.5 text-[14px] whitespace-nowrap">
                  Ativar código
                </button>
              </div>
              {erroAtivar && <p role="alert" className="mt-2 text-[13.5px] text-[#C8102E]">{erroAtivar}</p>}
            </section>
          )}

          <div className="md:hidden painel divide-y divide-black/[0.08]">
            <button onClick={aoAbrirAjuda} className="w-full flex items-center justify-between px-4 py-3.5 text-[15px] text-gray-800">
              Ajuda <ChevronRight size={18} className="text-gray-400" />
            </button>
            <button onClick={aoSair} className="w-full flex items-center justify-between px-4 py-3.5 text-[15px] text-gray-500">
              Sair da conta <LogOut size={17} className="text-gray-400" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
