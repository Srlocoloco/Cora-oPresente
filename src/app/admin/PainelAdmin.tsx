// Pagina Admin: PainelAdmin

import { useState } from "react";
import { ShoppingCart, Package, LayoutDashboard, ShoppingBag, Users, TrendingUp, Bell, LogOut, Plus, Tag, Menu, Settings, Award, Crown, Share2, Image as ImageIcon } from "lucide-react";
import type { Produto, Usuario, ConfigLoja, Cupom, Banner, Cargo, Recrutamento, Pedido, Cliente } from "../types";
import { COMISSAO_MASTER_PROPRIA, COMISSAO_MASTERPLUS_PROPRIA, COMISSAO_MASTERPLUS_EQUIPE, COMISSAO_MASTERPLUS_OVERRIDE, NOMES_MESES } from "../constantes";
import { comissaoFracaoPorNivel, bonusDeNivel, bonusDeConvite, totalVendidoPor, lerArmazenamento, formatarMoeda } from "../utils";
import { Logo } from "../components/Logo";
import { AvisoBancoDesconectado } from "../components/AvisoBancoDesconectado";
import { CartaoNivelVendedor } from "../components/CartaoNivelVendedor";
import { PaginaFinanceiroAdmin } from "./PaginaFinanceiroAdmin";
import { PaginaEstoqueAdmin } from "./PaginaEstoqueAdmin";
import { PaginaCuponsAdmin } from "./PaginaCuponsAdmin";
import { PaginaBannersAdmin } from "./PaginaBannersAdmin";
import { PaginaConfigAdmin } from "./PaginaConfigAdmin";
import { PaginaEquipeMaster } from "./PaginaEquipeMaster";
import { PaginaMeusVendedores } from "./PaginaMeusVendedores";
import { PaginaMastersAdmin } from "./PaginaMastersAdmin";
import { PaginaMasterPlusAdmin } from "./PaginaMasterPlusAdmin";
import { PaginaPromoverMaster } from "./PaginaPromoverMaster";
import { PaginaRede } from "./PaginaRede";
import { PaginaSupervisaoAdmin } from "./PaginaSupervisaoAdmin";
import { PaginaDashboard } from "./PaginaDashboard";
import { PaginaProdutosAdmin } from "./PaginaProdutosAdmin";
import { PaginaPedidosAdmin } from "./PaginaPedidosAdmin";

// ─── Admin Panel ──────────────────────────────────────────────────────────────

export function PainelAdmin({
  modo = "admin",
  pagina,
  setPagina,
  setTela,
  menuMobileAberto,
  setMenuMobileAberto,
  usuario,
  pedidos,
  clientes,
  produtos,
  aoSalvarProduto,
  aoExcluirProduto,
  aoAtualizarStatusPedido,
  alertasEstoque,
  cargos,
  aoDefinirCargo,
  recrutamentos = [],
  aoCadastrarVendedor,
  codigoVenda,
  comissaoPct = 0.02,
  vinculosMasterPlus = {},
  aoPromoverMaster,
  cupons = [],
  aoSalvarCupom,
  aoExcluirCupom,
  banners = [],
  aoSalvarBanner,
  aoExcluirBanner,
  config,
  aoSalvarConfig,
  bancoOffline = false,
}: {
  modo?: "admin" | "master" | "masterplus" | "vendedor";
  pagina: string;
  setPagina: (p: any) => void;
  setTela: (v: any) => void;
  menuMobileAberto: boolean;
  setMenuMobileAberto: (v: boolean) => void;
  usuario: Usuario | null;
  pedidos: Pedido[];
  clientes: Cliente[];
  produtos: Produto[];
  aoSalvarProduto: (p: Produto) => void;
  aoExcluirProduto: (id: number) => void;
  aoAtualizarStatusPedido: (id: string, status: string) => void;
  alertasEstoque: { id: number; name: string; date: string }[];
  cargos?: Record<string, Cargo>;
  aoDefinirCargo?: (email: string, cargo: Cargo | null) => void;
  recrutamentos?: Recrutamento[];
  aoCadastrarVendedor?: (nome: string, email: string) => string | null;
  // Código de venda pessoal da conta logada (mostrado no topo do painel)
  codigoVenda?: string;
  // Comissão do Master sobre a própria equipe, em fração (ex.: 0.02 = 2%, ou
  // 0.01 se foi promovido por um MasterPlus). Nas vendas com o próprio
  // código, o Master ganha COMISSAO_MASTER_PROPRIA (fixo, 10%).
  comissaoPct?: number;
  // E-mail do Master (minúsculo) → e-mail do MasterPlus que o promoveu
  vinculosMasterPlus?: Record<string, string>;
  // MasterPlus promove um vendedor da própria equipe a Master
  aoPromoverMaster?: (vendedorEmail: string) => string | null;
  cupons?: Cupom[];
  aoSalvarCupom?: (c: Cupom) => void;
  aoExcluirCupom?: (codigo: string) => void;
  banners?: Banner[];
  aoSalvarBanner?: (b: Banner) => void;
  aoExcluirBanner?: (id: number) => void;
  config?: ConfigLoja;
  aoSalvarConfig?: (c: ConfigLoja) => void;
  // true = banco de dados (XAMPP) fora do ar — mostra o aviso no painel
  bancoOffline?: boolean;
}) {
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [notifAberta, setNotifAberta] = useState(false);
  const [notifVistas, setNotifVistas] = useState<number>(() => lerArmazenamento<number>("cp_notif_seen", 0));

  // Alertas de estoque esgotado só fazem sentido para o Admin — vendedores
  // e o Master não veem esse tipo de notificação
  const notificacoes = [
    ...(modo === "admin"
      ? alertasEstoque.slice(0, 5).map((a) => ({
          icon: <Package size={18} className="text-red-500" />,
          title: "Produto esgotado!",
          desc: `${a.name} — reponha o estoque`,
          date: a.date,
        }))
      : []),
    ...pedidos.slice(0, 8).map((o) => ({
      icon: <ShoppingCart size={18} className="text-[#C8102E]" />,
      title: `Novo pedido ${o.id}`,
      desc: `${o.customer} · ${formatarMoeda(o.total)}`,
      date: o.date,
    })),
  ];
  const totalEventos = pedidos.length + (modo === "admin" ? alertasEstoque.length : 0);
  const naoLidas = Math.max(0, totalEventos - notifVistas);

  const alternarNotificacoes = () => {
    setNotifAberta((v) => !v);
    setNotifVistas(totalEventos);
    localStorage.setItem("cp_notif_seen", JSON.stringify(totalEventos));
  };
  // Menu lateral muda conforme o modo do painel:
  // Admin: tudo · MasterPlus: equipe própria + Promover a Master + Rede ·
  // Master: SEM Produtos, COM Meus Vendedores e Equipe & Cargos (+ Rede) ·
  // Vendedor: só divulga os produtos da loja (não tem catálogo próprio) e
  // acompanha as vendas creditadas ao código dele
  const menusPorModo: Record<string, { id: string; label: string; icon: React.ReactNode }[]> = {
    admin: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
      { id: "produtos", label: "Produtos", icon: <Package size={17} /> },
      { id: "pedidos", label: "Pedidos", icon: <ShoppingBag size={17} /> },
      { id: "financeiro", label: "Financeiro", icon: <TrendingUp size={17} /> },
      { id: "estoque", label: "Estoque", icon: <Package size={17} /> },
      { id: "cupons", label: "Cupons", icon: <Tag size={17} /> },
      { id: "banners", label: "Banners", icon: <ImageIcon size={17} /> },
      // Supervisão: só o Admin enxerga todos os vendedores
      { id: "supervisao", label: "Supervisão", icon: <Users size={17} /> },
      // Masters: só o Admin dá (ou remove) o cargo de Master — pode haver vários
      { id: "masters", label: "Masters", icon: <Users size={17} /> },
      // MasterPlus: cargo acima do Master, também só o Admin dá ou remove
      { id: "masterplus", label: "MasterPlus", icon: <Crown size={17} /> },
      { id: "config", label: "Configurações", icon: <Settings size={17} /> },
    ],
    master: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
      { id: "pedidos", label: "Pedidos", icon: <ShoppingBag size={17} /> },
      { id: "vendedores", label: "Meus Vendedores", icon: <Users size={17} /> },
      { id: "equipe", label: "Equipe & Cargos", icon: <Users size={17} /> },
      { id: "rede", label: "Minha Rede", icon: <Share2 size={17} /> },
    ],
    masterplus: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
      { id: "pedidos", label: "Pedidos", icon: <ShoppingBag size={17} /> },
      { id: "vendedores", label: "Meus Vendedores", icon: <Users size={17} /> },
      { id: "equipe", label: "Equipe & Cargos", icon: <Users size={17} /> },
      { id: "promover", label: "Promover a Master", icon: <Award size={17} /> },
      { id: "rede", label: "Minha Rede", icon: <Share2 size={17} /> },
    ],
    vendedor: [
      { id: "pedidos", label: "Minhas Vendas", icon: <ShoppingBag size={17} /> },
    ],
  };
  const itensMenu = menusPorModo[modo];

  const rotulosPainel: Record<string, string> = {
    admin: "Admin Panel",
    master: "Master Panel",
    masterplus: "MasterPlus Panel",
    vendedor: "Painel do Vendedor",
  };

  const titulosPaginas: Record<string, string> = {
    dashboard: "Dashboard",
    produtos: "Gestão de Produtos",
    pedidos: modo === "vendedor" ? "Minhas Vendas" : "Pedidos",
    equipe: "Equipe & Cargos",
    vendedores: "Meus Vendedores",
    supervisao: "Supervisão de Vendedores",
    masters: "Masters",
    masterplus: "MasterPlus",
    promover: "Promover a Master",
    rede: "Minha Rede",
    financeiro: "Financeiro",
    estoque: "Controle de Estoque",
    cupons: "Cupons de Desconto",
    banners: "Banners da Vitrine",
    config: "Configurações da Loja",
  };

  // Vendas do mês para o cartão de nível — o sistema de progressão aparece
  // SOMENTE no painel do vendedor (não no Admin nem no Master). vendasTotaisNivel
  // (vitalícias) decide o bônus de nível Ouro/Diamante e a comissão por venda
  // mostrada nas Minhas Vendas do vendedor.
  const mesAtualNivel = NOMES_MESES[new Date().getMonth()];
  let vendasDoMesNivel = 0;
  let vendasTotaisNivel = 0;
  if (modo === "vendedor") {
    // O painel do vendedor já recebe apenas os pedidos dele
    const validosVendedor = pedidos.filter((o) => o.status !== "Cancelado");
    vendasDoMesNivel = validosVendedor
      .filter((o) => o.month === mesAtualNivel)
      .reduce((acum, o) => acum + o.total, 0);
    vendasTotaisNivel = validosVendedor.reduce((acum, o) => acum + o.total, 0);
  }

  // Dashboard: só o Admin enxerga o desempenho geral (todos os vendedores e
  // vendas diretas). Master e MasterPlus têm o gráfico das próprias vendas
  // (creditadas ao código de venda deles), como qualquer outra conta — a
  // visão da rede completa (equipe, repasses) fica na página Minha Rede.
  const pedidosDashboard =
    (modo === "master" || modo === "masterplus") && usuario
      ? pedidos.filter((o) => o.vendedor?.toLowerCase() === usuario.email.toLowerCase())
      : pedidos;
  const tituloDashboard = modo === "admin" ? "Desempenho da Empresa" : "Minhas Vendas";

  // Bônus de nível do Master: ele já está sempre no nível Diamante (não sobe
  // de nível como o vendedor), então só vale o bônus por bater a meta das
  // próprias vendas — sem a barra de progresso Bronze→Diamante.
  const bonusNivelMaster =
    modo === "master" && usuario ? bonusDeNivel(totalVendidoPor(usuario.email, pedidos)) : 0;
  // Bônus de convite: R$30 por vendedor que ESTE Master convidou e que já
  // ativou a própria conta com o código (cada Master tem a própria equipe).
  const bonusConviteMaster =
    modo === "master" && usuario
      ? bonusDeConvite(recrutamentos.filter((r) => r.recrutador === usuario.email.toLowerCase()))
      : 0;
  const bonusMaster = bonusNivelMaster + bonusConviteMaster;

  return (
    <div className="flex h-screen bg-[#FBF4EA] overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-56 bg-[#4A1218] text-white flex flex-col transition-transform duration-300 ${menuMobileAberto ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="p-4 border-b border-white/8">
          <Logo small />
          <div className="text-[9px] text-white/40 mt-2 font-semibold tracking-widest uppercase">{rotulosPainel[modo]}</div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {itensMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => { setPagina(item.id); setMenuMobileAberto(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                pagina === item.id ? "bg-[#C8102E] text-white shadow-sm" : "text-white/55 hover:bg-white/8 hover:text-white/90"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/8 space-y-0.5">
          <button
            onClick={() => setTela("loja")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-white/55 hover:bg-white/8 hover:text-white/90 transition-colors"
          >
            <ShoppingCart size={17} />
            Ver Loja
          </button>
          <button
            onClick={() => setTela("login")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-white/55 hover:bg-white/8 hover:text-white/90 transition-colors"
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      {menuMobileAberto && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMenuMobileAberto(false)} />
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1.5 hover:bg-gray-100 rounded-lg transition-colors" onClick={() => setMenuMobileAberto(true)}>
              <Menu size={19} />
            </button>
            <div>
              <h1 className="font-black text-gray-900 text-base">{titulosPaginas[pagina]}</h1>
              <p className="text-[11px] text-gray-400 font-medium">Coração Presente Admin · 6 de julho de 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Código de venda pessoal: cliente informa na compra e a venda é creditada a esta conta */}
            {codigoVenda && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(codigoVenda).catch(() => {});
                  setCodigoCopiado(true);
                  setTimeout(() => setCodigoCopiado(false), 2000);
                }}
                title="Seu código de venda — clique para copiar"
                className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Tag size={12} />
                {codigoCopiado ? "Copiado!" : codigoVenda}
              </button>
            )}
            <div className="relative">
              <button onClick={alternarNotificacoes} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={18} className="text-gray-500" />
                {naoLidas > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                    {naoLidas > 9 ? "9+" : naoLidas}
                  </span>
                )}
              </button>

              {notifAberta && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifAberta(false)} />
                  <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] md:w-[460px] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <span className="font-black text-gray-900 text-[13px]">Notificações</span>
                      <span className="text-[11px] text-gray-400 font-medium">{notificacoes.length} recentes</span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto">
                      {notificacoes.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-400 text-[12px]">
                          Nenhuma notificação ainda.<br />As compras dos clientes aparecerão aqui.
                        </div>
                      ) : (
                        notificacoes.map((n, i) => (
                          <div key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                            <span className="flex-shrink-0 mt-0.5">{n.icon}</span>
                            <div className="min-w-0">
                              <div className="text-[12px] font-bold text-gray-800">{n.title}</div>
                              <div className="text-[11px] text-gray-500 truncate">{n.desc}</div>
                              <div className="text-[10px] text-gray-300 mt-0.5">{n.date}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 pl-2">
              <div className="w-8 h-8 rounded-full bg-[#C8102E] flex items-center justify-center text-white text-sm font-black">
                {usuario ? usuario.name[0].toUpperCase() : "A"}
              </div>
              <span className="hidden md:block text-[13px] font-semibold text-gray-700">
                {usuario?.name || "Admin"}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Progressão de nível: só para o vendedor */}
          {modo === "vendedor" && (
            <div className="mb-5">
              <CartaoNivelVendedor vendasDoMes={vendasDoMesNivel} vendasTotais={vendasTotaisNivel} />
            </div>
          )}

          {/* Bônus do Master: nível (sem barra de progresso — ele já está
              sempre no nível Diamante) + convite (R$30 por vendedor ativado) */}
          {modo === "master" && bonusMaster > 0 && (
            <div className="mb-5 bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center gap-3">
              <Award size={20} className="text-purple-600 flex-shrink-0" />
              <p className="text-[13px] text-purple-700 font-medium">
                Você já ganhou <span className="font-black">{formatarMoeda(bonusMaster)}</span> em bônus
                {bonusNivelMaster > 0 && bonusConviteMaster > 0
                  ? ` — ${formatarMoeda(bonusNivelMaster)} por nível (vendas próprias) e ${formatarMoeda(bonusConviteMaster)} por convite de vendedores.`
                  : bonusNivelMaster > 0
                  ? " de nível, pelas suas vendas próprias (código pessoal)."
                  : " de convite, por vendedores que ativaram a conta com o seu código."}
              </p>
            </div>
          )}
          {pagina === "dashboard" && (
            <PaginaDashboard
              pedidos={pedidosDashboard}
              clientes={clientes}
              titulo={tituloDashboard}
              aoVerTodosPedidos={() => setPagina("pedidos")}
            />
          )}
          {pagina === "produtos" && modo === "admin" && (
            <PaginaProdutosAdmin produtos={produtos} aoSalvar={aoSalvarProduto} aoExcluir={aoExcluirProduto} />
          )}
          {pagina === "pedidos" && (
            <PaginaPedidosAdmin
              pedidos={pedidos}
              aoAtualizarStatus={aoAtualizarStatusPedido}
              comissaoPorPedido={
                modo === "vendedor"
                  ? (o) => o.total * comissaoFracaoPorNivel(vendasTotaisNivel)
                  : modo === "master" && usuario
                  ? (o) => {
                      const vend = o.vendedor?.toLowerCase();
                      const meuEmail = usuario.email.toLowerCase();
                      if (vend === meuEmail) return o.total * COMISSAO_MASTER_PROPRIA;
                      // Só conta comissão de equipe sobre vendedores que ESTE
                      // Master convidou (cada Master tem a própria equipe)
                      const daMinhaEquipe =
                        vend &&
                        cargos?.[vend] === "vendedor" &&
                        recrutamentos.some((r) => r.email.toLowerCase() === vend && r.recrutador === meuEmail);
                      return daMinhaEquipe ? o.total * comissaoPct : 0;
                    }
                  : modo === "masterplus" && usuario
                  ? (o) => {
                      const vend = o.vendedor?.toLowerCase();
                      if (!vend) return 0;
                      const meuEmail = usuario.email.toLowerCase();
                      // Venda com o próprio código do MasterPlus: comissão
                      // própria, 10% fixo (mesmo percentual do Master)
                      if (vend === meuEmail) return o.total * COMISSAO_MASTERPLUS_PROPRIA;
                      // Venda de um vendedor da própria equipe do MasterPlus: 2%
                      const daMinhaEquipe =
                        cargos?.[vend] === "vendedor" &&
                        recrutamentos.some((r) => r.email.toLowerCase() === vend && r.recrutador === meuEmail);
                      if (daMinhaEquipe) return o.total * COMISSAO_MASTERPLUS_EQUIPE;
                      // Venda de um vendedor da equipe de um Master que ESTE
                      // MasterPlus promoveu: 1% de repasse
                      const recrutadorDoVendedor = recrutamentos.find(
                        (r) => r.email.toLowerCase() === vend && r.ativado
                      )?.recrutador;
                      const masterDoVendedorEhMeu =
                        recrutadorDoVendedor &&
                        cargos?.[recrutadorDoVendedor] === "master" &&
                        vinculosMasterPlus[recrutadorDoVendedor] === meuEmail;
                      return masterDoVendedorEhMeu ? o.total * COMISSAO_MASTERPLUS_OVERRIDE : 0;
                    }
                  : undefined
              }
            />
          )}
          {pagina === "equipe" && (modo === "master" || modo === "masterplus") && cargos && aoDefinirCargo && (
            <PaginaEquipeMaster
              clientes={clientes}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
              recrutamentos={recrutamentos}
            />
          )}
          {pagina === "vendedores" && (modo === "master" || modo === "masterplus") && usuario && aoCadastrarVendedor && (
            <PaginaMeusVendedores
              emailMaster={usuario.email}
              recrutamentos={recrutamentos}
              aoCadastrar={aoCadastrarVendedor}
              pedidos={pedidos}
            />
          )}
          {pagina === "promover" && modo === "masterplus" && usuario && cargos && aoPromoverMaster && (
            <PaginaPromoverMaster
              emailMasterPlus={usuario.email}
              recrutamentos={recrutamentos}
              cargos={cargos}
              clientes={clientes}
              pedidos={pedidos}
              vinculosMasterPlus={vinculosMasterPlus}
              aoPromover={aoPromoverMaster}
            />
          )}
          {pagina === "rede" && (modo === "master" || modo === "masterplus") && usuario && cargos && (
            <PaginaRede
              modo={modo}
              usuario={usuario}
              cargos={cargos}
              recrutamentos={recrutamentos}
              clientes={clientes}
              pedidos={pedidos}
              vinculosMasterPlus={vinculosMasterPlus}
              comissaoEquipePct={comissaoPct}
            />
          )}
          {pagina === "supervisao" && modo === "admin" && cargos && (
            <PaginaSupervisaoAdmin
              pedidos={pedidos}
              clientes={clientes}
              cargos={cargos}
            />
          )}
          {pagina === "masters" && modo === "admin" && cargos && aoDefinirCargo && (
            <PaginaMastersAdmin
              clientes={clientes}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
              comissaoEquipePct={config?.comissaoRecrutador ?? 2}
            />
          )}
          {pagina === "masterplus" && modo === "admin" && cargos && aoDefinirCargo && (
            <PaginaMasterPlusAdmin
              clientes={clientes}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
              vinculosMasterPlus={vinculosMasterPlus}
            />
          )}
          {pagina === "financeiro" && modo === "admin" && cargos && (
            <PaginaFinanceiroAdmin
              pedidos={pedidos}
              cargos={cargos}
              clientes={clientes}
              recrutamentos={recrutamentos}
              comissaoEquipePct={(config?.comissaoRecrutador ?? 2) / 100}
              vinculosMasterPlus={vinculosMasterPlus}
            />
          )}
          {pagina === "estoque" && modo === "admin" && (
            <PaginaEstoqueAdmin produtos={produtos} />
          )}
          {pagina === "cupons" && modo === "admin" && aoSalvarCupom && aoExcluirCupom && (
            <PaginaCuponsAdmin cupons={cupons} aoSalvar={aoSalvarCupom} aoExcluir={aoExcluirCupom} />
          )}
          {pagina === "banners" && modo === "admin" && aoSalvarBanner && aoExcluirBanner && (
            <PaginaBannersAdmin banners={banners} aoSalvar={aoSalvarBanner} aoExcluir={aoExcluirBanner} />
          )}
          {pagina === "config" && modo === "admin" && config && aoSalvarConfig && (
            <PaginaConfigAdmin config={config} aoSalvar={aoSalvarConfig} />
          )}
        </div>
        {bancoOffline && <AvisoBancoDesconectado />}
      </div>
    </div>
  );
}
