// Tela TelaPerfil

import { useState } from "react";
import {
  X, Package, LogOut, Truck, ChevronLeft, Check, MapPin, Bell,
  LayoutDashboard, ShoppingBag, Tag, Grid3x3, LifeBuoy, TrendingUp,
  Sparkles, Wine, Gamepad2, Dumbbell, Watch, Home as HomeIcon, LayoutGrid,
} from "lucide-react";
import type { Usuario, Cupom, Cargo, Pedido } from "../types";
import { formatarMoeda } from "../utils";
import { SeloStatus } from "../components/SeloStatus";
import { Logo } from "../components/Logo";

const ICONE_POR_CATEGORIA: Record<string, React.ElementType> = {
  "Beleza & Perfumaria": Sparkles,
  "Adega": Wine,
  "Brinquedos": Gamepad2,
  "Academia": Dumbbell,
  "Acessórios": Watch,
  "Casa & Decoração": HomeIcon,
};

// ─── Tela Perfil do Cliente ───────────────────────────────────────────────────
// Dashboard do cliente: pedidos por status, cupons disponíveis, atalhos para
// as categorias da loja e ativação do código de vendedor (quando a conta
// ainda não tem cargo). No desktop ganha uma barra lateral; no celular, a
// navegação de baixo (BarraInferiorMobile, fora deste componente) já cobre o
// mesmo papel — por isso a sidebar só aparece a partir do tablet.
export function TelaPerfil({
  usuario,
  pedidos,
  cupons,
  categorias,
  desde,
  aoVerCategoria,
  aoVoltar,
  aoSair,
  aoAbrirNotificacoes,
  aoAbrirAjuda,
  rotuloPainel,
  aoAbrirPainel,
  cargoUsuario,
  aoAtivarCodigo,
}: {
  usuario: Usuario;
  pedidos: Pedido[];
  cupons: Cupom[];
  categorias: string[];
  // "Cliente desde" — vem do cadastro no banco; sem essa informação, omite a linha
  desde?: string;
  aoVerCategoria: (c: string) => void;
  aoVoltar: () => void;
  aoSair: () => void;
  aoAbrirNotificacoes: () => void;
  aoAbrirAjuda: () => void;
  rotuloPainel: string | null;
  aoAbrirPainel: () => void;
  cargoUsuario?: Cargo;
  aoAtivarCodigo: (codigo: string) => string | null;
}) {
  // null = mostra todos os pedidos; senão filtra pelo status escolhido
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [cupomCopiado, setCupomCopiado] = useState("");
  const [codigoAtivar, setCodigoAtivar] = useState("");
  const [erroAtivar, setErroAtivar] = useState("");
  const [ativando, setAtivando] = useState(false);

  const ativarCodigo = () => {
    setAtivando(true);
    const resultado = aoAtivarCodigo(codigoAtivar);
    setAtivando(false);
    if (resultado) { setErroAtivar(resultado); return; }
    setErroAtivar("");
    setCodigoAtivar("");
  };

  const atalhos = [
    { status: "Processando", rotulo: "Preparando", icon: <Package size={20} /> },
    { status: "Em trânsito", rotulo: "A caminho", icon: <Truck size={20} /> },
    { status: "Entregue", rotulo: "Entregues", icon: <Check size={20} /> },
    { status: "Cancelado", rotulo: "Cancelados", icon: <X size={20} /> },
  ];

  const contagem = (status: string) => pedidos.filter((o) => o.status === status).length;
  const visiveis = filtroStatus ? pedidos.filter((o) => o.status === filtroStatus) : pedidos;
  const pedidosEntregues = contagem("Entregue");

  const copiarCupom = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCupomCopiado(codigo);
    setTimeout(() => setCupomCopiado(""), 2000);
  };

  const irPara = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const itensSidebar = [
    { id: "dashboard", rotulo: "Dashboard", icon: <LayoutDashboard size={18} />, aoClicar: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    { id: "pedidos", rotulo: "Pedidos", icon: <ShoppingBag size={18} />, aoClicar: () => irPara("cartao-pedidos") },
    { id: "cupons", rotulo: "Cupons", icon: <Tag size={18} />, aoClicar: () => irPara("cartao-cupons") },
    { id: "categorias", rotulo: "Categorias", icon: <Grid3x3 size={18} />, aoClicar: () => irPara("cartao-categorias") },
  ];

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="md:flex md:items-start">
        {/* ── Sidebar (tablet/desktop) ─────────────────────────────────────── */}
        <aside className="hidden md:flex md:flex-col md:w-64 md:flex-shrink-0 md:sticky md:top-0 md:h-screen bg-white border-r border-gray-100 px-4 py-5">
          <div className="px-2 mb-6">
            <Logo />
          </div>
          <nav className="flex-1 space-y-1">
            {itensSidebar.map((item, i) => (
              <button
                key={item.id}
                onClick={item.aoClicar}
                aria-current={i === 0 ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${
                  i === 0 ? "bg-red-50 text-[#A8102A]" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.icon}
                {item.rotulo}
              </button>
            ))}
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <TrendingUp size={18} />
                {rotuloPainel}
              </button>
            )}
            <button
              onClick={aoAbrirAjuda}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <LifeBuoy size={18} />
              Ajuda
            </button>
          </nav>

          {/* Convite para virar vendedor — só faz sentido pra quem ainda não é */}
          {!cargoUsuario && (
            <div className="bg-[#FBF4EA] rounded-2xl p-4 mt-4">
              <p className="font-bold text-gray-800 text-[13px] mb-1">Quer vender com a gente?</p>
              <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3">
                Ative um código de vendedor e ganhe comissão em cada venda.
              </p>
              <button
                onClick={() => irPara("cartao-vendedor")}
                className="w-full bg-[#A8102A] hover:bg-[#7A1220] text-white font-bold text-[12.5px] py-2.5 rounded-xl transition-colors"
              >
                Ativar código
              </button>
            </div>
          )}

          <button
            onClick={aoAbrirAjuda}
            className="flex items-center gap-3 bg-[#FBF4EA] rounded-2xl p-4 mt-3 text-left hover:bg-[#F3E8D8] transition-colors"
          >
            <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <LifeBuoy size={17} className="text-[#A8102A]" />
            </span>
            <span>
              <span className="block font-bold text-gray-800 text-[12.5px]">Central de Ajuda</span>
              <span className="block text-[11px] text-gray-500">Fale com nosso suporte</span>
            </span>
          </button>
        </aside>

        {/* ── Conteúdo principal ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Cabeçalho do perfil */}
          <div className="bg-[#A8102A] px-4 pt-4 pb-10 md:m-4 md:rounded-3xl">
            <div className="max-w-[900px] md:max-w-none mx-auto">
              <div className="flex items-center justify-between mb-4">
                <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1 text-[13px] font-semibold transition-colors">
                  <ChevronLeft size={16} />
                  Loja
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={aoAbrirNotificacoes}
                    aria-label="Notificações"
                    className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <Bell size={18} />
                  </button>
                  <button onClick={aoSair} className="text-white/80 hover:text-white flex items-center gap-1.5 text-[13px] font-semibold transition-colors px-2 py-2 rounded-full hover:bg-white/10">
                    <LogOut size={14} />
                    Sair
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/15 border-2 border-white/40 flex items-center justify-center text-white text-xl md:text-2xl font-black flex-shrink-0">
                  {usuario.name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-black text-lg md:text-xl truncate">{usuario.name}</span>
                    {cargoUsuario && (
                      <span className="bg-emerald-500/20 text-emerald-50 border border-emerald-300/40 text-[10.5px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check size={11} /> {rotuloPainel ?? "Vendedor ativo"}
                      </span>
                    )}
                  </div>
                  <div className="text-white/70 text-[12px] truncate">{usuario.email}</div>
                  {desde && <div className="text-white/55 text-[11px] mt-0.5">Cliente desde {desde}</div>}
                </div>

                {/* Painel de estatísticas — só dados reais desta conta */}
                <div className="ml-auto flex items-center gap-3 md:gap-6 bg-white/10 rounded-2xl px-4 md:px-6 py-3 flex-shrink-0">
                  <div>
                    <div className="text-white font-black text-lg md:text-xl leading-none">{pedidos.length}</div>
                    <div className="text-white/70 text-[10.5px] md:text-[11px] mt-1">Pedidos feitos</div>
                  </div>
                  <div className="w-px h-9 bg-white/20" />
                  <div>
                    <div className="text-white font-black text-lg md:text-xl leading-none">{pedidosEntregues}</div>
                    <div className="text-white/70 text-[10.5px] md:text-[11px] mt-1">Entregues</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-[900px] md:max-w-none mx-auto px-4 md:px-4 -mt-5 md:mt-0 space-y-4">
            {/* Atalho pro painel (Admin/Master/Vendedor) — a sidebar com o
                mesmo link só aparece a partir do tablet, então no celular
                este é o único caminho até lá. */}
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="md:hidden w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-[#A8102A]/30 transition-colors"
              >
                <span className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <TrendingUp size={18} className="text-[#A8102A]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-black text-gray-900 text-[14px]">{rotuloPainel}</span>
                  <span className="block text-[12px] text-gray-500">Abrir painel</span>
                </span>
              </button>
            )}

            {/* Ativar código de vendedor: só aparece pra quem ainda não tem cargo */}
            {!cargoUsuario && (
              <div id="cartao-vendedor" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 scroll-mt-4">
                <div className="flex items-start gap-3 mb-1">
                  <span className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Tag size={18} className="text-[#A8102A]" />
                  </span>
                  <div>
                    <h3 className="font-black text-gray-900 text-[15px]">Tem um código de vendedor?</h3>
                    <p className="text-[12.5px] text-gray-500">
                      Recebeu um código de ativação? Ative aqui e comece a divulgar os produtos da loja ganhando comissão em cada venda.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-col sm:flex-row mt-3">
                  <input
                    value={codigoAtivar}
                    onChange={(e) => { setCodigoAtivar(e.target.value.toUpperCase()); setErroAtivar(""); }}
                    placeholder="Ex.: CP-7K2M9X"
                    aria-label="Código de vendedor"
                    className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#A8102A] transition-colors font-mono"
                  />
                  <button
                    onClick={ativarCodigo}
                    disabled={ativando || !codigoAtivar.trim()}
                    className="bg-[#A8102A] hover:bg-[#7A1220] disabled:opacity-50 text-white font-black px-6 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
                  >
                    Ativar código
                  </button>
                </div>
                {erroAtivar && (
                  <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12.5px] font-medium px-3 py-2.5 rounded-lg" role="alert">
                    {erroAtivar}
                  </div>
                )}
              </div>
            )}

            {/* Meus pedidos: atalhos por status */}
            <div id="cartao-pedidos" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 scroll-mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-gray-900 text-[15px]">Meus Pedidos</h3>
                <button
                  onClick={() => setFiltroStatus(null)}
                  className="text-[12.5px] font-bold text-[#A8102A] hover:underline"
                >
                  Ver todos
                </button>
              </div>
              <div className="grid grid-cols-4">
                {atalhos.map((a) => (
                  <button
                    key={a.status}
                    onClick={() => setFiltroStatus(a.status)}
                    aria-pressed={filtroStatus === a.status}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-colors ${
                      filtroStatus === a.status ? "bg-red-50 text-[#A8102A]" : "text-gray-500 hover:bg-gray-50 hover:text-[#A8102A]"
                    }`}
                  >
                    <div className="relative">
                      {a.icon}
                      {contagem(a.status) > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 bg-[#A8102A] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                          {contagem(a.status)}
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] font-bold">{a.rotulo}</span>
                    <span className="text-[15px] font-black text-gray-800">{contagem(a.status)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Lista de pedidos */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 md:px-5 py-3.5 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 text-[14px]">
                    {filtroStatus
                      ? atalhos.find((a) => a.status === filtroStatus)?.rotulo
                      : "Todos os pedidos"}
                  </h3>
                </div>
                {visiveis.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <div className="w-14 h-14 rounded-full bg-[#FBF4EA] flex items-center justify-center mx-auto mb-3">
                      <ShoppingBag size={22} className="text-[#A8102A]" strokeWidth={1.75} />
                    </div>
                    <p className="text-gray-500 text-[13px] font-medium mb-3">
                      {filtroStatus ? "Nenhum pedido nesta etapa." : "Você ainda não fez nenhum pedido."}
                    </p>
                    {!filtroStatus && (
                      <button
                        onClick={() => aoVerCategoria("Outros")}
                        className="text-[#A8102A] font-bold text-[13px] hover:underline"
                      >
                        Ver produtos
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                    {visiveis.map((o) => (
                      <div key={o.id} className="px-4 md:px-5 py-3.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-[11px] text-[#A8102A] font-bold">{o.id}</span>
                          <SeloStatus status={o.status} />
                        </div>
                        <div className="text-[13px] text-gray-700 font-medium truncate">{o.items}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-gray-400">{o.date}{o.pagamento ? ` · ${o.pagamento}` : ""}</span>
                          <span className="font-black text-gray-900 text-[13px]">{formatarMoeda(o.total)}</span>
                        </div>
                        {o.endereco && (
                          <div className="text-[11px] text-gray-400 mt-1 flex items-start gap-1">
                            <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                            <span className="line-clamp-1">{o.endereco}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cupons disponíveis */}
              <div id="cartao-cupons" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-4">
                <div className="px-4 md:px-5 py-3.5 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 text-[14px]">Cupons para você</h3>
                </div>
                {cupons.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <div className="w-14 h-14 rounded-full bg-[#FBF4EA] flex items-center justify-center mx-auto mb-3">
                      <Tag size={22} className="text-[#A8102A]" strokeWidth={1.75} />
                    </div>
                    <p className="text-gray-500 text-[13px] font-medium mb-3">Nenhum cupom disponível no momento.</p>
                    <button
                      onClick={() => aoVerCategoria("Outros")}
                      className="text-[#A8102A] font-bold text-[13px] hover:underline"
                    >
                      Explorar produtos
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {cupons.map((c) => (
                      <div key={c.codigo} className="px-4 md:px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-black text-[#A8102A]">{c.percentual}% OFF</div>
                          <div className="text-[11px] text-gray-400">
                            Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · use no carrinho
                          </div>
                        </div>
                        <button
                          onClick={() => copiarCupom(c.codigo)}
                          className="font-mono text-[12px] font-bold text-[#A8102A] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                        >
                          {cupomCopiado === c.codigo ? "Copiado!" : c.codigo}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Categorias */}
            <div id="cartao-categorias" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 scroll-mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-gray-900 text-[14px]">Categorias</h3>
              </div>
              <div className="flex md:grid md:grid-cols-6 gap-2.5 overflow-x-auto scrollbar-hide -mx-1 px-1 md:mx-0 md:px-0">
                {categorias.map((c) => {
                  const Icone = ICONE_POR_CATEGORIA[c] || LayoutGrid;
                  return (
                    <button
                      key={c}
                      onClick={() => aoVerCategoria(c)}
                      className="flex-shrink-0 w-[104px] md:w-auto flex flex-col items-center gap-2 border border-gray-100 rounded-2xl py-4 px-2 hover:border-[#A8102A]/30 hover:bg-[#FBF4EA] transition-colors"
                    >
                      <span className="w-10 h-10 rounded-full bg-[#FBF4EA] flex items-center justify-center">
                        <Icone size={19} className="text-[#A8102A]" strokeWidth={1.75} />
                      </span>
                      <span className="text-[11.5px] font-semibold text-gray-700 text-center leading-tight">{c}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
