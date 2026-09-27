// Pagina Admin: PainelAdmin

import { useState } from "react";
import { ShoppingCart, Package, LayoutDashboard, ShoppingBag, Users, TrendingUp, Bell, LogOut, Tag, Menu, Settings, Award, Crown, Share2, Image as ImageIcon, Star, Truck, Wallet, Boxes } from "lucide-react";
import type { Produto, Usuario, ConfigLoja, Cupom, Banner, Cargo, Recrutamento, ResultadoCadastroVendedor, Pedido, Cliente } from "../types";
import { NOMES_MESES } from "../constantes";
import { lerArmazenamento, formatarMoeda, pedidoNoMes } from "../utils";
import { regrasDaConfig, comissaoDoPedidoPara, pedidoGeraComissao } from "../comissoes";
import { Logo } from "../components/Logo";
import { AvisoBancoDesconectado } from "../components/AvisoBancoDesconectado";
import { CartaoNivelVendedor } from "../components/CartaoNivelVendedor";
import { PaginaFinanceiroAdmin } from "./PaginaFinanceiroAdmin";
import { PaginaEstoqueAdmin } from "./PaginaEstoqueAdmin";
import { PaginaCuponsAdmin } from "./PaginaCuponsAdmin";
import { PaginaBannersAdmin } from "./PaginaBannersAdmin";
import { PaginaConfigAdmin } from "./PaginaConfigAdmin";
import { PaginaMeusVendedores } from "./PaginaMeusVendedores";
import { PaginaMastersAdmin } from "./PaginaMastersAdmin";
import { PaginaMasterPlusAdmin } from "./PaginaMasterPlusAdmin";
import { PaginaPromoverMaster } from "./PaginaPromoverMaster";
import { PaginaRede } from "./PaginaRede";
import { PaginaSupervisaoAdmin } from "./PaginaSupervisaoAdmin";
import { PaginaDashboard } from "./PaginaDashboard";
import { PaginaProdutosAdmin } from "./PaginaProdutosAdmin";
import { PaginaPedidosAdmin } from "./PaginaPedidosAdmin";
import { PaginaAvaliacoesAdmin } from "./PaginaAvaliacoesAdmin";
import { PaginaEntregas } from "./PaginaEntregas";
import { PaginaEntregadoresAdmin } from "./PaginaEntregadoresAdmin";
import { PaginaMeusGanhos } from "./PaginaMeusGanhos";
import { PaginaRepassesAdmin } from "./PaginaRepassesAdmin";

type ModoPainel = "admin" | "master" | "masterplus" | "vendedor" | "entregador";

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
  aoAjustarEstoque,
  aoVerProdutoNaLoja,
  aoDefinirEntregador,
  aoAtualizarStatusPedido,
  alertasEstoque,
  cargos,
  aoDefinirCargo,
  recrutamentos = [],
  aoCadastrarVendedor,
  codigoVenda,
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
  aoAtualizarResumoAvaliacoes,
  aoSair,
}: {
  modo?: ModoPainel;
  pagina: string;
  setPagina: (p: any) => void;
  setTela: (v: any) => void;
  menuMobileAberto: boolean;
  setMenuMobileAberto: (v: boolean) => void;
  usuario: Usuario | null;
  pedidos: Pedido[];
  clientes: Cliente[];
  produtos: Produto[];
  // Salva UM produto no servidor; devolve a mensagem de erro (null = salvou)
  aoSalvarProduto: (p: Produto & { estoqueBase?: number }) => Promise<string | null> | void;
  aoExcluirProduto: (id: number) => void;
  // Ajuste rápido de estoque (tela Estoque)
  aoAjustarEstoque?: (id: number, ajuste: { delta?: number; definir?: number; cor?: string; tamanho?: string }) => Promise<string | null>;
  // Abre a página do produto na loja (a partir da foto de um pedido)
  aoVerProdutoNaLoja?: (produto: Produto) => void;
  // Admin designa (ou tira) o entregador responsável por um pedido
  aoDefinirEntregador?: (id: string, email: string | null) => void;
  aoAtualizarStatusPedido: (id: string, mudancas: { status?: string; codigoRastreio?: string }) => void;
  alertasEstoque: { id: number; name: string; date: string }[];
  cargos?: Record<string, Cargo>;
  aoDefinirCargo?: (email: string, cargo: Cargo | null) => void;
  recrutamentos?: Recrutamento[];
  aoCadastrarVendedor?: (nome: string, email: string) => Promise<ResultadoCadastroVendedor>;
  // Código de venda pessoal da conta logada (mostrado no topo do painel)
  codigoVenda?: string;
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
  // Configuração da loja — inclusive os percentuais de comissão, que todos
  // os painéis usam para mostrar quanto cada um ganha
  config?: ConfigLoja;
  aoSalvarConfig?: (c: ConfigLoja) => Promise<string | null> | void;
  // true = banco de dados fora do ar — mostra o aviso no painel
  bancoOffline?: boolean;
  aoAtualizarResumoAvaliacoes?: (produtoId: number, rating: number, reviews: number) => void;
  // Encerra a sessão de verdade (servidor + navegador)
  aoSair?: () => void;
}) {
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [notifAberta, setNotifAberta] = useState(false);
  const [notifVistas, setNotifVistas] = useState<number>(() => lerArmazenamento<number>("cp_notif_seen", 0));
  const regras = regrasDaConfig(config);

  // As notificações do Admin (pedidos da loja inteira e alertas de estoque) são
  // só dele. Master e MasterPlus recebem o painel com todos os pedidos para as
  // páginas de rede, mas o sino mostra apenas as vendas do próprio código.
  const pedidosNotificacao =
    modo === "admin"
      ? pedidos
      : usuario
        ? pedidos.filter((o) => o.vendedor?.toLowerCase() === usuario.email.toLowerCase())
        : [];
  const aguardandoConfirmacao = modo === "admin" ? pedidos.filter((o) => o.status === "Aguardando pagamento") : [];
  const notificacoes = [
    ...(aguardandoConfirmacao.length > 0
      ? [{
          icon: <Wallet size={18} className="text-amber-500" />,
          title: `${aguardandoConfirmacao.length} pedido(s) aguardando pagamento`,
          desc: "Confira os PIX recebidos e confirme em Pedidos",
          date: "",
        }]
      : []),
    ...(modo === "admin"
      ? alertasEstoque.slice(0, 5).map((a) => ({
          icon: <Package size={18} className="text-red-500" />,
          title: "Produto esgotado!",
          desc: `${a.name} — reponha o estoque`,
          date: a.date,
        }))
      : []),
    ...pedidosNotificacao.slice(0, 8).map((o) => ({
      icon: <ShoppingCart size={18} className="text-[#C8102E]" />,
      title: `Pedido ${o.id}`,
      desc: `${o.customer} · ${formatarMoeda(o.total)} · ${o.status}`,
      date: o.date,
    })),
  ];
  const totalEventos = pedidosNotificacao.length + (modo === "admin" ? alertasEstoque.length : 0);
  const naoLidas = Math.max(0, totalEventos - notifVistas) + aguardandoConfirmacao.length;

  const alternarNotificacoes = () => {
    setNotifAberta((v) => !v);
    setNotifVistas(totalEventos);
    try {
      localStorage.setItem("cp_notif_seen", JSON.stringify(totalEventos));
    } catch {
      // modo privado: só não lembra o que já foi visto
    }
  };

  // Menu lateral muda conforme o modo do painel. O do Admin vem em grupos —
  // são 14 páginas, e sem grupo vira uma lista comprida sem começo nem fim.
  type ItemMenu = { id: string; label: string; icon: React.ReactNode };
  const gruposPorModo: Record<ModoPainel, { grupo?: string; itens: ItemMenu[] }[]> = {
    admin: [
      {
        grupo: "Vendas",
        itens: [
          { id: "dashboard", label: "Resumo", icon: <LayoutDashboard size={18} /> },
          { id: "pedidos", label: "Pedidos", icon: <ShoppingBag size={18} /> },
          { id: "avaliacoes", label: "Opiniões", icon: <Star size={18} /> },
        ],
      },
      {
        grupo: "Catálogo",
        itens: [
          { id: "produtos", label: "Produtos", icon: <Package size={18} /> },
          { id: "estoque", label: "Estoque", icon: <Boxes size={18} /> },
          { id: "cupons", label: "Cupons", icon: <Tag size={18} /> },
          { id: "banners", label: "Banners", icon: <ImageIcon size={18} /> },
        ],
      },
      {
        grupo: "Equipe",
        itens: [
          { id: "supervisao", label: "Vendedores", icon: <Users size={18} /> },
          { id: "masters", label: "Masters", icon: <Award size={18} /> },
          { id: "masterplus", label: "MasterPlus", icon: <Crown size={18} /> },
          { id: "entregadores", label: "Entregadores", icon: <Truck size={18} /> },
        ],
      },
      {
        grupo: "Dinheiro",
        itens: [
          { id: "financeiro", label: "Financeiro", icon: <TrendingUp size={18} /> },
          // Repasses: comissões liberadas → arquivo do banco → conta de cada associado
          { id: "pagamentos", label: "Repasses", icon: <Wallet size={18} /> },
        ],
      },
      { grupo: "Loja", itens: [{ id: "config", label: "Configurações", icon: <Settings size={18} /> }] },
    ],
    master: [
      {
        itens: [
          { id: "dashboard", label: "Resumo", icon: <LayoutDashboard size={18} /> },
          { id: "pagamentos", label: "Meus ganhos", icon: <Wallet size={18} /> },
          { id: "pedidos", label: "Vendas", icon: <ShoppingBag size={18} /> },
          { id: "vendedores", label: "Meus vendedores", icon: <Users size={18} /> },
          { id: "rede", label: "Minha rede", icon: <Share2 size={18} /> },
        ],
      },
    ],
    masterplus: [
      {
        itens: [
          { id: "dashboard", label: "Resumo", icon: <LayoutDashboard size={18} /> },
          { id: "pagamentos", label: "Meus ganhos", icon: <Wallet size={18} /> },
          { id: "vendedores", label: "Meus vendedores", icon: <Users size={18} /> },
          { id: "promover", label: "Promover a Master", icon: <Award size={18} /> },
          { id: "rede", label: "Minha rede", icon: <Share2 size={18} /> },
        ],
      },
    ],
    vendedor: [
      {
        itens: [
          { id: "pagamentos", label: "Meus ganhos", icon: <Wallet size={18} /> },
          { id: "pedidos", label: "Minhas vendas", icon: <ShoppingBag size={18} /> },
        ],
      },
    ],
    // Entregador tem uma página só, e ela basta: as entregas designadas a ele
    entregador: [{ itens: [{ id: "entregas", label: "Minhas entregas", icon: <Truck size={18} /> }] }],
  };
  const menusPorModo = Object.fromEntries(
    Object.entries(gruposPorModo).map(([m, grupos]) => [m, grupos.flatMap((g) => g.itens)])
  ) as Record<ModoPainel, ItemMenu[]>;
  const itensMenu = menusPorModo[modo];
  // Página que não existe neste painel (ex.: link antigo) cai na primeira do menu
  const paginaAtual = itensMenu.some((i) => i.id === pagina) ? pagina : itensMenu[0].id;

  // Contas com cargo de entregador: usadas na página Entregadores e na hora de
  // designar quem leva cada pedido (nos detalhes da compra)
  const entregadores = clientes.filter((c) => cargos?.[c.email.toLowerCase()] === "entregador");

  const rotulosPainel: Record<ModoPainel, string> = {
    admin: "Painel da loja",
    master: "Painel do Master",
    masterplus: "Painel do MasterPlus",
    vendedor: "Painel do vendedor",
    entregador: "Painel do entregador",
  };

  const titulosPaginas: Record<string, string> = {
    dashboard: "Resumo",
    produtos: "Produtos",
    avaliacoes: "Opiniões dos clientes",
    pedidos: modo === "vendedor" ? "Minhas vendas" : modo === "admin" ? "Pedidos" : "Vendas",
    vendedores: "Meus vendedores",
    supervisao: "Vendedores",
    entregadores: "Entregadores",
    entregas: "Minhas entregas",
    masters: "Masters",
    masterplus: "MasterPlus",
    promover: "Promover a Master",
    rede: "Minha rede",
    financeiro: "Financeiro",
    pagamentos: modo === "admin" ? "Repasses das comissões" : "Meus ganhos",
    estoque: "Estoque",
    cupons: "Cupons de desconto",
    banners: "Banners da vitrine",
    config: "Configurações da loja",
  };

  // Vendas do mês e vendas totais do vendedor — entram no cartão de comissão,
  // que aparece SOMENTE no painel do vendedor (não no Admin nem no Master).
  // O total vitalício é o que define a faixa de comissão dele.
  const agoraNivel = new Date();
  const mesAtualNivel = NOMES_MESES[agoraNivel.getMonth()];
  let vendasDoMesNivel = 0;
  let vendasTotaisNivel = 0;
  if (modo === "vendedor") {
    // O painel do vendedor já recebe apenas os pedidos dele
    const validosVendedor = pedidos.filter(pedidoGeraComissao);
    vendasDoMesNivel = validosVendedor
      .filter((o) => pedidoNoMes(o, agoraNivel.getMonth(), agoraNivel.getFullYear(), mesAtualNivel))
      .reduce((acum, o) => acum + o.total, 0);
    vendasTotaisNivel = validosVendedor.reduce((acum, o) => acum + o.total, 0);
  }

  // Dashboard: só o Admin enxerga o desempenho geral. Master e MasterPlus têm
  // o gráfico das próprias vendas; a rede completa fica em Minha Rede.
  const pedidosDashboard =
    (modo === "master" || modo === "masterplus") && usuario
      ? pedidos.filter((o) => o.vendedor?.toLowerCase() === usuario.email.toLowerCase())
      : pedidos;
  const tituloDashboard = modo === "admin" ? "Desempenho da loja" : "Minhas vendas";

  // Quanto a conta logada ganha em cada venda — a mesma regra do servidor
  // (comissoes.ts), com os percentuais das Configurações.
  const comissaoPorPedido =
    modo !== "admin" && usuario && cargos
      ? (o: Pedido) => comissaoDoPedidoPara(o, usuario.email, { cargos, recrutamentos, vinculosMasterPlus, pedidos, regras })
      : undefined;

  const sair = () => {
    if (aoSair) aoSair();
    else setTela("loja");
  };

  const itemMenu = (item: ItemMenu) => {
    const ativo = paginaAtual === item.id;
    return (
      <button
        key={item.id}
        onClick={() => { setPagina(item.id); setMenuMobileAberto(false); }}
        aria-current={ativo ? "page" : undefined}
        className={`relative w-full flex items-center gap-3 pl-5 pr-3 py-2 text-[14px] text-left transition-colors ${
          ativo ? "bg-[#C8102E]/[0.07] text-[#A8102A] font-semibold" : "text-gray-700 hover:bg-black/[0.03]"
        }`}
      >
        {ativo && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-[#C8102E]" />}
        <span className={ativo ? "text-[#C8102E]" : "text-gray-400"}>{item.icon}</span>
        {item.label}
        {item.id === "pedidos" && aguardandoConfirmacao.length > 0 && (
          <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-sm bg-amber-100 text-amber-800 text-[12px] font-semibold flex items-center justify-center">
            {aguardandoConfirmacao.length}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#EDEDED] overflow-hidden">
      {/* ── Barra de cima ── */}
      <header className="bg-[#A8102A] text-white flex-shrink-0 z-30">
        <div className="h-[52px] px-3 md:px-5 flex items-center gap-3">
          <button className="md:hidden p-2 -ml-1" onClick={() => setMenuMobileAberto(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <Logo claro />
          <span className="hidden sm:block h-6 w-px bg-white/25 mx-1" />
          <span className="hidden sm:block text-[14px] text-white/90">{rotulosPainel[modo]}</span>

          <div className="ml-auto flex items-center gap-1 md:gap-3">
            {/* Código de venda pessoal: cliente informa na compra e a venda é creditada a esta conta */}
            {codigoVenda && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(codigoVenda).catch(() => {});
                  setCodigoCopiado(true);
                  setTimeout(() => setCodigoCopiado(false), 2000);
                }}
                title="Seu código de venda: clique para copiar e mandar para o cliente"
                className="flex items-center gap-2 text-[13px] bg-white/12 hover:bg-white/20 px-2.5 py-1.5 rounded"
              >
                <span className="hidden md:inline text-white/80">Seu código</span>
                <span className="font-mono font-semibold">{codigoCopiado ? "Copiado" : codigoVenda}</span>
              </button>
            )}
            <div className="relative">
              <button onClick={alternarNotificacoes} className="relative p-2 text-white/90 hover:text-white" aria-label="Notificações">
                <Bell size={19} />
                {naoLidas > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 bg-white text-[#A8102A] text-[11px] font-bold rounded-full flex items-center justify-center">
                    {naoLidas > 9 ? "9+" : naoLidas}
                  </span>
                )}
              </button>

              {notifAberta && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifAberta(false)} />
                  <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[92vw] md:w-[440px] painel shadow-[0_6px_24px_rgba(0,0,0,0.18)] z-50 text-gray-800">
                    <div className="px-4 py-3 border-b border-black/[0.08] flex items-center justify-between">
                      <span className="text-[15px] text-gray-900">Notificações</span>
                      <span className="text-[12.5px] text-gray-500">{notificacoes.length} recentes</span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto divide-y divide-black/[0.06]">
                      {notificacoes.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-500 text-[13.5px]">
                          Nenhuma notificação ainda. As compras dos clientes aparecem aqui.
                        </div>
                      ) : (
                        notificacoes.map((n, i) => (
                          <div key={i} className="px-4 py-3 flex items-start gap-3">
                            <span className="flex-shrink-0 mt-0.5">{n.icon}</span>
                            <div className="min-w-0">
                              <div className="text-[13.5px] text-gray-900">{n.title}</div>
                              <div className="text-[12.5px] text-gray-500 truncate">{n.desc}</div>
                              {n.date && <div className="text-[12px] text-gray-400 mt-0.5">{n.date}</div>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <span className="hidden md:block text-[14px] text-white/90 max-w-[160px] truncate">{usuario?.name || "Admin"}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Menu lateral ── */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-50 w-[232px] bg-white border-r border-black/10 flex flex-col transition-transform duration-200 ${
            menuMobileAberto ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <div className="md:hidden h-[52px] px-5 flex items-center border-b border-black/10 text-[15px] text-gray-900">
            {rotulosPainel[modo]}
          </div>
          <nav className="flex-1 py-3 overflow-y-auto" aria-label="Menu do painel">
            {gruposPorModo[modo].map((g, i) => (
              <div key={g.grupo ?? i} className={i > 0 ? "mt-4" : ""}>
                {g.grupo && <p className="px-5 pb-1 text-[12.5px] text-gray-400">{g.grupo}</p>}
                {g.itens.map(itemMenu)}
              </div>
            ))}
          </nav>
          <div className="py-2 border-t border-black/10">
            <button onClick={() => setTela("loja")} className="w-full flex items-center gap-3 px-5 py-2 text-[14px] text-gray-700 hover:bg-black/[0.03]">
              <ShoppingCart size={18} className="text-gray-400" />
              Ver a loja
            </button>
            <button onClick={sair} className="w-full flex items-center gap-3 px-5 py-2 text-[14px] text-gray-700 hover:bg-black/[0.03]">
              <LogOut size={18} className="text-gray-400" />
              Sair da conta
            </button>
          </div>
        </aside>

        {menuMobileAberto && (
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMenuMobileAberto(false)} />
        )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto">
         <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-5 md:py-6">
          <h1 className="text-[22px] md:text-[24px] text-gray-900 mb-4 md:mb-5">{titulosPaginas[paginaAtual]}</h1>
          {/* Comissão do vendedor: quanto ele ganha por venda e o que já vendeu */}
          {modo === "vendedor" && paginaAtual === "pedidos" && (
            <div className="mb-5">
              <CartaoNivelVendedor vendasDoMes={vendasDoMesNivel} vendasTotais={vendasTotaisNivel} />
            </div>
          )}

          {paginaAtual === "dashboard" && modo !== "entregador" && (
            <PaginaDashboard
              pedidos={pedidosDashboard}
              clientes={clientes}
              titulo={tituloDashboard}
              aoVerTodosPedidos={modo === "masterplus" ? undefined : () => setPagina("pedidos")}
              modo={modo}
            />
          )}
          {paginaAtual === "produtos" && modo === "admin" && (
            <PaginaProdutosAdmin produtos={produtos} aoSalvar={aoSalvarProduto} aoExcluir={aoExcluirProduto} />
          )}
          {paginaAtual === "avaliacoes" && modo === "admin" && aoAtualizarResumoAvaliacoes && (
            <PaginaAvaliacoesAdmin aoAtualizarResumoAvaliacoes={aoAtualizarResumoAvaliacoes} />
          )}
          {paginaAtual === "pedidos" && (modo === "admin" || modo === "master" || modo === "vendedor") && (
            <PaginaPedidosAdmin
              pedidos={pedidos}
              produtos={produtos}
              aoVerProdutoNaLoja={aoVerProdutoNaLoja}
              entregadores={entregadores}
              aoDefinirEntregador={aoDefinirEntregador}
              aoAtualizarStatus={aoAtualizarStatusPedido}
              comissaoPorPedido={comissaoPorPedido}
              modo={modo}
            />
          )}
          {paginaAtual === "vendedores" && (modo === "master" || modo === "masterplus") && usuario && aoCadastrarVendedor && cargos && aoDefinirCargo && (
            <PaginaMeusVendedores
              emailMaster={usuario.email}
              recrutamentos={recrutamentos}
              aoCadastrar={aoCadastrarVendedor}
              pedidos={pedidos}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
            />
          )}
          {paginaAtual === "promover" && modo === "masterplus" && usuario && cargos && aoPromoverMaster && (
            <PaginaPromoverMaster
              emailMasterPlus={usuario.email}
              recrutamentos={recrutamentos}
              cargos={cargos}
              clientes={clientes}
              pedidos={pedidos}
              vinculosMasterPlus={vinculosMasterPlus}
              aoPromover={aoPromoverMaster}
              regras={regras}
            />
          )}
          {paginaAtual === "rede" && (modo === "master" || modo === "masterplus") && usuario && cargos && (
            <PaginaRede
              modo={modo}
              usuario={usuario}
              cargos={cargos}
              recrutamentos={recrutamentos}
              clientes={clientes}
              pedidos={pedidos}
              vinculosMasterPlus={vinculosMasterPlus}
              regras={regras}
            />
          )}
          {paginaAtual === "supervisao" && modo === "admin" && cargos && (
            <PaginaSupervisaoAdmin pedidos={pedidos} clientes={clientes} cargos={cargos} />
          )}
          {paginaAtual === "entregadores" && modo === "admin" && cargos && aoDefinirCargo && (
            <PaginaEntregadoresAdmin clientes={clientes} cargos={cargos} pedidos={pedidos} aoDefinirCargo={aoDefinirCargo} />
          )}
          {/* Painel do entregador: só as entregas designadas a ele */}
          {paginaAtual === "entregas" && modo === "entregador" && (
            <PaginaEntregas pedidos={pedidos} produtos={produtos} aoAtualizarStatus={aoAtualizarStatusPedido} />
          )}
          {paginaAtual === "masters" && modo === "admin" && cargos && aoDefinirCargo && (
            <PaginaMastersAdmin
              clientes={clientes}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
              vinculosMasterPlus={vinculosMasterPlus}
              regras={regras}
            />
          )}
          {paginaAtual === "masterplus" && modo === "admin" && cargos && aoDefinirCargo && (
            <PaginaMasterPlusAdmin
              clientes={clientes}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
              vinculosMasterPlus={vinculosMasterPlus}
              regras={regras}
            />
          )}
          {paginaAtual === "financeiro" && modo === "admin" && cargos && (
            <PaginaFinanceiroAdmin
              pedidos={pedidos}
              cargos={cargos}
              clientes={clientes}
              recrutamentos={recrutamentos}
              vinculosMasterPlus={vinculosMasterPlus}
              regras={regras}
            />
          )}
          {/* Ganhos: o associado vê o extrato e cadastra a conta; o Admin vê
              os repasses de todos e gera o arquivo do banco */}
          {paginaAtual === "pagamentos" && (modo === "vendedor" || modo === "master" || modo === "masterplus") && (
            <PaginaMeusGanhos cargo={modo} regras={regras} />
          )}
          {paginaAtual === "pagamentos" && modo === "admin" && <PaginaRepassesAdmin aoIrParaConfig={() => setPagina("config")} />}

          {paginaAtual === "estoque" && modo === "admin" && (
            <PaginaEstoqueAdmin
              produtos={produtos}
              estoqueBaixo={config?.estoqueBaixo ?? 5}
              aoAjustar={aoAjustarEstoque}
              aoEditarProduto={() => setPagina("produtos")}
            />
          )}
          {paginaAtual === "cupons" && modo === "admin" && aoSalvarCupom && aoExcluirCupom && (
            <PaginaCuponsAdmin cupons={cupons} aoSalvar={aoSalvarCupom} aoExcluir={aoExcluirCupom} />
          )}
          {paginaAtual === "banners" && modo === "admin" && aoSalvarBanner && aoExcluirBanner && (
            <PaginaBannersAdmin banners={banners} aoSalvar={aoSalvarBanner} aoExcluir={aoExcluirBanner} />
          )}
          {paginaAtual === "config" && modo === "admin" && config && aoSalvarConfig && (
            <PaginaConfigAdmin config={config} aoSalvar={aoSalvarConfig} />
          )}
         </div>
        </div>
        {bancoOffline && <AvisoBancoDesconectado />}
      </div>
      </div>
    </div>
  );
}
