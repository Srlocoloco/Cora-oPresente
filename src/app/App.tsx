/*
 * ══════════════════════════════════════════════════════════════════
 *  CORAÇÃO PRESENTE — Loja virtual + Painel Administrativo
 * ══════════════════════════════════════════════════════════════════
 *  Estrutura do arquivo:
 *   1. Tipos (Produto, Pedido, Cliente, Usuario, ItemCarrinho)
 *   2. Constantes (níveis do vendedor, cores, categorias, banners)
 *   3. Funções auxiliares (moeda, parcelas, desconto, armazenamento)
 *   4. App — controla o estado geral e decide qual tela mostrar
 *   5. Telas da loja (login, cabeçalho, banner, produtos, carrinho)
 *   6. Painel Admin (dashboard, produtos, pedidos, notificações)
 *
 *  Os dados (produtos, pedidos, clientes) ficam salvos no navegador
 *  via localStorage — as chaves "cp_..." não devem ser alteradas.
 * ══════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart,
  Search,
  User,
  X,
  Star,
  Package,
  LayoutDashboard,
  ShoppingBag,
  Users,
  TrendingUp,
  Bell,
  LogOut,
  Plus,
  Edit2,
  Trash2,
  Heart,
  Truck,
  Shield,
  RotateCcw,
  Tag,
  Menu,
  Settings,
  CreditCard,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Check,
  Award,
  Zap,
  MapPin,
  Lock,
  Upload,
  FileText,
  Home,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

// Estrutura de um produto da loja
interface Produto {
  id: number;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  installments: number;
  rating: number;
  reviews: number;
  image: string;
  category: string;
  badge?: string;
  freeShipping: boolean;
  stock: number;
  description?: string;
  // E-mail do vendedor dono do produto (vazio = produto da própria loja)
  owner?: string;
  // % de desconto pagando no PIX, definido produto a produto (vazio = sem desconto)
  pixDesconto?: number;
}

// Item do carrinho: produto + quantidade escolhida
interface ItemCarrinho extends Produto {
  qty: number;
}

// Usuário autenticado (cliente logado)
interface Usuario {
  name: string;
  email: string;
}

// ─── Configurações da Loja ────────────────────────────────────────────────────

// Valores da loja que o Admin pode ajustar na página Configurações
interface ConfigLoja {
  chavePix: string;
  freteGratisAcima: number; // compras acima deste valor têm frete grátis
  freteCapital: number; // frete para Curitiba
  freteInterior: number; // frete para o interior do Paraná
  fretePadrao: number; // frete sem CEP informado
  comissaoRecrutador: number; // % do recrutador sobre as vendas da equipe
}

const CONFIG_PADRAO: ConfigLoja = {
  chavePix: "44997201104",
  freteGratisAcima: 299,
  freteCapital: 14.9,
  freteInterior: 19.9,
  fretePadrao: 29.9,
  comissaoRecrutador: 2,
};

// ─── Cupons de Desconto ───────────────────────────────────────────────────────

// Cupom criado pelo Admin; o cliente digita o código no carrinho
interface Cupom {
  codigo: string;
  percentual: number; // % de desconto sobre o subtotal
  validade: string; // última data válida (AAAA-MM-DD)
  ativo: boolean;
  usos: number; // quantas compras já usaram este cupom
}

// Um cupom vale se está ativo e dentro da validade
function cupomEstaValido(c: Cupom) {
  return c.ativo && new Date(c.validade + "T23:59:59") >= new Date();
}

// ─── Página Financeiro (Admin) ────────────────────────────────────────────────

// Faturamento por período e forma de pagamento + fechamento das comissões
function PaginaFinanceiroAdmin({
  pedidos,
  cargos,
  recrutamentos,
  clientes,
  comissao,
}: {
  pedidos: Pedido[];
  cargos: Record<string, Cargo>;
  recrutamentos: Recrutamento[];
  clientes: Cliente[];
  comissao: number; // fração (ex.: 0.02)
}) {
  const validos = pedidos.filter((o) => o.status !== "Cancelado");
  const faturamentoTotal = validos.reduce((acum, o) => acum + o.total, 0);
  const mesAtual = NOMES_MESES[new Date().getMonth()];
  const faturamentoMes = validos.filter((o) => o.month === mesAtual).reduce((acum, o) => acum + o.total, 0);

  // Fechamento de comissões: quanto pagar a cada recrutador
  const recrutadores = Object.keys(cargos).filter((e) => cargos[e] === "recrutador");
  const fechamento = recrutadores.map((email) => {
    const ativos = recrutamentos
      .filter((r) => r.recrutador === email && r.ativado)
      .map((r) => r.email.toLowerCase());
    const totalEquipe = validos
      .filter((o) => o.vendedor && ativos.includes(o.vendedor.toLowerCase()))
      .reduce((acum, o) => acum + o.total, 0);
    const nome =
      clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;
    return { email, nome, totalEquipe, valor: totalEquipe * comissao };
  });
  const comissoesTotal = fechamento.reduce((acum, f) => acum + f.valor, 0);

  const cartoes = [
    { label: "Faturamento total", valor: formatarMoeda(faturamentoTotal), icone: <TrendingUp size={22} className="text-emerald-600" /> },
    { label: `Faturamento de ${mesAtual}`, valor: formatarMoeda(faturamentoMes), icone: <TrendingUp size={22} className="text-[#C8102E]" /> },
    { label: "Pedidos válidos", valor: String(validos.length), icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
    { label: `Comissões a pagar (${comissao * 100}%)`, valor: formatarMoeda(comissoesTotal), icone: <Users size={22} className="text-[#C8102E]" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-lg font-black text-gray-900 truncate">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fechamento de comissões */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Fechamento de comissões</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Quanto pagar a cada recrutador pelas vendas acumuladas da equipe dele.</p>
        </div>
        {fechamento.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum recrutador nomeado ainda.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {fechamento.map((f) => (
              <div key={f.email} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-gray-800 truncate">{f.nome}</div>
                  <div className="text-[11px] text-gray-400 truncate">{f.email} · equipe vendeu {formatarMoeda(f.totalEquipe)}</div>
                </div>
                <span className="font-black text-emerald-600 text-[14px]">{formatarMoeda(f.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página Estoque (Admin) ───────────────────────────────────────────────────

// Produtos esgotados e com estoque baixo, para planejar a reposição
function PaginaEstoqueAdmin({ produtos }: { produtos: Produto[] }) {
  const esgotados = produtos.filter((p) => p.stock <= 0);
  const baixo = produtos.filter((p) => p.stock > 0 && p.stock < 15).sort((a, b) => a.stock - b.stock);
  const totalUnidades = produtos.reduce((acum, p) => acum + Math.max(0, p.stock), 0);

  const cartoes = [
    { label: "Produtos esgotados", valor: String(esgotados.length), icone: <Package size={22} className="text-red-500" /> },
    { label: "Estoque baixo (menos de 15)", valor: String(baixo.length), icone: <Package size={22} className="text-amber-500" /> },
    { label: "Unidades em estoque", valor: totalUnidades.toLocaleString("pt-BR"), icone: <Package size={22} className="text-emerald-600" /> },
  ];

  const linha = (p: Produto) => (
    <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center p-1 flex-shrink-0">
          <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-800 truncate">{p.name}</div>
          <div className="text-[11px] text-gray-400 truncate">{p.brand} · {p.category}</div>
        </div>
      </div>
      <span
        className={`text-[11px] font-black px-2.5 py-1 rounded-full flex-shrink-0 ${
          p.stock <= 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
        }`}
      >
        {p.stock <= 0 ? "ESGOTADO" : `${p.stock} un.`}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-lg font-black text-gray-900 truncate">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Esgotados — reponha o quanto antes</h3>
        </div>
        {esgotados.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum produto esgotado.</div>
        ) : (
          <div className="divide-y divide-gray-50">{esgotados.map(linha)}</div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Estoque baixo</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Produtos com menos de 15 unidades — a loja já mostra "Últimas unidades!" para o cliente.</p>
        </div>
        {baixo.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum produto com estoque baixo.</div>
        ) : (
          <div className="divide-y divide-gray-50">{baixo.map(linha)}</div>
        )}
      </div>
    </div>
  );
}

// ─── Página Cupons (Admin) ────────────────────────────────────────────────────

// Criação e gestão dos cupons de desconto usados no carrinho
function PaginaCuponsAdmin({
  cupons,
  aoSalvar,
  aoExcluir,
}: {
  cupons: Cupom[];
  aoSalvar: (c: Cupom) => void;
  aoExcluir: (codigo: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [percentual, setPercentual] = useState("10");
  const [validade, setValidade] = useState("");
  const [erro, setErro] = useState("");

  const criar = () => {
    const cod = codigo.trim().toUpperCase();
    const pct = Number(percentual);
    if (!cod) { setErro("Informe o código do cupom."); return; }
    if (cupons.some((c) => c.codigo === cod)) { setErro("Já existe um cupom com este código."); return; }
    if (!pct || pct < 1 || pct > 90) { setErro("O desconto deve ser entre 1% e 90%."); return; }
    if (!validade) { setErro("Informe a data de validade."); return; }
    aoSalvar({ codigo: cod, percentual: pct, validade, ativo: true, usos: 0 });
    setErro("");
    setCodigo("");
    setPercentual("10");
    setValidade("");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Criar cupom</h3>
        <p className="text-[12px] text-gray-400 mb-4">O cliente digita o código no carrinho e ganha o desconto sobre o subtotal.</p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código (ex.: BEMVINDO10)"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
          />
          <div className="flex items-center gap-1.5">
            <input
              value={percentual}
              onChange={(e) => setPercentual(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              className="w-20 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors text-center"
            />
            <span className="text-[13px] font-bold text-gray-500">% off</span>
          </div>
          <input
            type="date"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={criar}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            Criar
          </button>
        </div>
        {erro && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erro}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Cupons ({cupons.length})</h3>
        </div>
        {cupons.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum cupom criado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {cupons.map((c) => {
              const expirado = new Date(c.validade + "T23:59:59") < new Date();
              return (
                <div key={c.codigo} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-black text-[#C8102E]">{c.codigo}</span>
                      <span className="text-[13px] font-bold text-gray-800">{c.percentual}% off</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          expirado
                            ? "bg-gray-100 text-gray-500"
                            : c.ativo
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {expirado ? "EXPIRADO" : c.ativo ? "ATIVO" : "PAUSADO"}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · {c.usos} {c.usos === 1 ? "uso" : "usos"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!expirado && (
                      <button
                        onClick={() => aoSalvar({ ...c, ativo: !c.ativo })}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border-2 transition-colors ${
                          c.ativo
                            ? "border-gray-200 text-gray-500 hover:border-gray-300"
                            : "border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {c.ativo ? "Pausar" : "Reativar"}
                      </button>
                    )}
                    <button
                      onClick={() => aoExcluir(c.codigo)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página Configurações (Admin) ─────────────────────────────────────────────

// O Admin ajusta chave PIX, fretes, desconto PIX e comissão sem mexer no código
function PaginaConfigAdmin({
  config,
  aoSalvar,
}: {
  config: ConfigLoja;
  aoSalvar: (c: ConfigLoja) => void;
}) {
  const [rascunho, setRascunho] = useState<ConfigLoja>(config);
  const [salvo, setSalvo] = useState(false);

  const numero = (v: string) => Number(v.replace(",", ".")) || 0;

  const salvar = () => {
    aoSalvar(rascunho);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  const campoNumero = (
    rotulo: string,
    valor: number,
    aoMudar: (n: number) => void,
    sufixo?: string
  ) => (
    <div>
      <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">{rotulo}</label>
      <div className="flex items-center gap-2">
        <input
          value={String(valor)}
          onChange={(e) => aoMudar(numero(e.target.value))}
          inputMode="decimal"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
        />
        {sufixo && <span className="text-[13px] font-bold text-gray-400 flex-shrink-0">{sufixo}</span>}
      </div>
    </div>
  );

  return (
    <div className="max-w-[640px] space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Pagamento</h3>
          <p className="text-[12px] text-gray-400">A chave PIX é usada no QR Code e no copia e cola da tela de pagamento.</p>
        </div>
        <div>
          <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">Chave PIX da loja</label>
          <input
            value={rascunho.chavePix}
            onChange={(e) => setRascunho({ ...rascunho, chavePix: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Equipe</h3>
          <p className="text-[12px] text-gray-400">Percentual que o recrutador ganha sobre as vendas dos vendedores dele.</p>
        </div>
        {campoNumero("Comissão do recrutador", rascunho.comissaoRecrutador, (n) => setRascunho({ ...rascunho, comissaoRecrutador: n }), "%")}
      </div>

      <button
        onClick={salvar}
        className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
      >
        <Check size={17} />
        {salvo ? "Configurações salvas!" : "Salvar configurações"}
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        As senhas do Admin e do Master continuam definidas no código, por segurança.
      </p>
    </div>
  );
}

// ─── Seller Levels ────────────────────────────────────────────────────────────

const NIVEIS_VENDEDOR = [
  {
    name: "Bronze",
    min: 0,
    max: 50000,
    color: "#CD7F32",
    bg: "from-amber-800/20 to-amber-600/10",
    border: "border-amber-700/30",
    commission: "8%",
    benefits: ["Suporte padrão", "Comissão de 8%", "Painel básico", "Relatório mensal"],
  },
  {
    name: "Prata",
    min: 50000,
    max: 150000,
    color: "#A8B8C8",
    bg: "from-slate-400/20 to-slate-300/10",
    border: "border-slate-400/30",
    commission: "10%",
    benefits: ["Suporte prioritário", "Comissão de 10%", "Destaque nas buscas", "Relatórios avançados"],
  },
  {
    name: "Ouro",
    min: 150000,
    max: 300000,
    color: "#FFD700",
    bg: "from-yellow-400/20 to-yellow-300/10",
    border: "border-yellow-400/40",
    commission: "12%",
    benefits: ["Suporte dedicado", "Comissão de 12%", "Banner gratuito", "Analytics premium", "Selo Ouro"],
  },
  {
    name: "Diamante",
    min: 300000,
    max: Infinity,
    color: "#7DD3F8",
    bg: "from-cyan-400/20 to-blue-300/10",
    border: "border-cyan-400/40",
    commission: "15%",
    benefits: ["Gerente exclusivo", "Comissão de 15%", "Topo dos resultados", "Campanhas gratuitas", "Early access", "Selo Diamante"],
  },
];

function obterNivelVendedor(sales: number) {
  return NIVEIS_VENDEDOR.findIndex((l) => sales >= l.min && sales < l.max);
}

// ─── Data ─────────────────────────────────────────────────────────────────────

// Catálogo começa vazio — os produtos são cadastrados pelo painel Admin
const IMAGEM_PADRAO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#F1F5F9'/><text x='200' y='210' font-size='17' font-family='sans-serif' fill='#94A3B8' text-anchor='middle'>Sem imagem</text></svg>"
  );

function ImagemProduto({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return (
    <img
      src={src && src.trim() ? src : IMAGEM_PADRAO}
      alt={alt}
      className={className}
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (img.src !== IMAGEM_PADRAO) img.src = IMAGEM_PADRAO;
      }}
    />
  );
}

const OPCOES_SELO = ["OFERTA", "MAIS VENDIDO", "TOP VENDA", "NOVO", "LANÇAMENTO"];

const CATEGORIAS = ["Todos", "Perfumes", "TVs", "Notebooks", "Geladeiras", "Áudio", "Eletrodomésticos", "Games"];

// Conta do administrador da loja — somente ela enxerga e acessa o painel Admin
const EMAIL_ADMIN = "balorense@gmail.com";
const SENHA_ADMIN = "Kayth254321";
const NOME_ADMIN = "Kayke Spoti";

// Conta Master — painel próprio SEM a página de Produtos; dá cargos aos usuários
const EMAIL_MASTER = "master@coracaopresente.com";
const SENHA_MASTER = "Master254321";
const NOME_MASTER = "Master";

// ─── Cargos & Recrutamento ────────────────────────────────────────────────────

// Cargos que o Master pode dar a um usuário.
// Recrutador: cadastra vendedores e ganha 2% sobre as vendas deles.
// Vendedor: cadastra produtos no catálogo e NÃO pode recrutar.
type Cargo = "recrutador" | "vendedor";

// Vínculo criado quando um recrutador cadastra um vendedor.
// O código gerado é entregue ao vendedor, que o usa para ativar a conta.
interface Recrutamento {
  codigo: string;
  recrutador: string; // e-mail do recrutador
  nome: string; // nome do vendedor cadastrado
  email: string; // e-mail do vendedor cadastrado
  ativado: boolean; // vira true quando o vendedor usa o código
  date: string;
}

// Percentual que o recrutador ganha sobre cada venda dos seus vendedores
const COMISSAO_RECRUTADOR = 0.02;

// Gera um código único de recrutamento (ex.: CP-7K2M9X)
function gerarCodigoRecrutamento() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return `CP-${c}`;
}

// Código de venda pessoal de uma conta (ex.: CV-9X2K4M).
// É FIXO e ÚNICO: derivado do e-mail da conta, nunca muda e é o mesmo em
// qualquer dispositivo. O cliente informa esse código ao comprar e a venda
// é creditada somente à conta dona do código (master, recrutador ou vendedor).
function codigoVendaDe(email: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const s = email.trim().toLowerCase();
  // Hash djb2 do e-mail: o mesmo e-mail sempre gera o mesmo código
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  let c = "";
  let v = h;
  for (let i = 0; i < 6; i++) {
    c += chars[v % chars.length];
    v = Math.floor(v / chars.length);
  }
  return `CV-${c}`;
}

// ── Login real com Google ──────────────────────────────────────────────────
// Para ativar: crie um "OAuth Client ID" gratuito em console.cloud.google.com
// (APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth →
// Aplicativo da Web → em "Origens JavaScript autorizadas" adicione
// http://localhost:5173) e cole o ID abaixo. Com o ID preenchido, o site
// consulta a Google de verdade; vazio, usa o cadastro simulado por nome.
const GOOGLE_CLIENT_ID = "";

const NOMES_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CORES_CATEGORIA: Record<string, string> = {
  Perfumes: "#C8102E",
  Notebooks: "#E8B84B",
  TVs: "#10B981",
  Games: "#F59E0B",
  Geladeiras: "#6366F1",
  "Áudio": "#EC4899",
  "Eletrodomésticos": "#8B5CF6",
};

// Pedido gerado a cada compra finalizada
interface Pedido {
  id: string;
  customer: string;
  email: string;
  items: string;
  total: number;
  status: string;
  date: string;
  month: string;
  category: string;
  pagamento?: string;
  // E-mail da conta que leva o crédito da venda: o dono do código de venda
  // informado pelo cliente ou, sem código, o vendedor dono do produto
  vendedor?: string;
  // Código de venda usado pelo cliente nesta compra (se houve)
  codigoVenda?: string;
  // Endereço de entrega do pedido
  endereco?: string;
}

// Cliente cadastrado na loja
interface Cliente {
  name: string;
  email: string;
  since: string;
}

// Lê um valor salvo no navegador (localStorage) com segurança
function lerArmazenamento<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Formata números como moeda brasileira (R$)
const formatarMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const precoParcela = (price: number, n: number) => formatarMoeda(price / n);
const pctDesconto = (orig: number, curr: number) =>
  Math.round(((orig - curr) / orig) * 100);

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ small }: { small?: boolean }) {
  const [erroImagem, setImgError] = useState(false);

  // Usa a imagem da logo (public/logo.png); se não existir, mostra a versão em texto
  if (!erroImagem) {
    return (
      <div className={`bg-white rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 ${small ? "w-10 h-10" : "w-12 h-12 md:w-14 md:h-14"}`}>
        <img
          src="/logo.png"
          alt="Coração Presente"
          className="w-full h-full object-cover scale-[1.15]"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl flex items-center gap-2 ${small ? "px-2.5 py-1.5" : "px-3 py-2"}`}>
      <Heart
        size={small ? 14 : 18}
        className="fill-red-500 text-red-500 flex-shrink-0"
      />
      <div className="leading-none">
        <div
          className={`text-[#C8102E] font-black tracking-tight leading-none ${small ? "text-[10px]" : "text-[13px]"}`}
        >
          CORAÇÃO
        </div>
        <div
          className={`text-[#C8102E] font-black tracking-tight leading-none ${small ? "text-[10px]" : "text-[13px]"}`}
        >
          PRESENTE
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Tela = "login" | "loja" | "carrinho" | "pagamento" | "admin" | "master" | "recrutador" | "vendedor" | "sucesso" | "perfil";

// Dados do pagamento escolhido no carrinho (aguardando confirmação)
interface DadosPagamento {
  metodo: "cartao" | "boleto" | "pix";
  total: number;
  parcelas: number;
  // Endereço de entrega montado no carrinho (via CEP + número informado)
  endereco: string;
}

// Componente principal: controla telas, carrinho, produtos, pedidos e clientes
export default function App() {
  // Tela atual do app: loja, login, carrinho, admin ou sucesso
  const [tela, setTela] = useState<Tela>("loja");
  // Página ativa dentro dos painéis (admin, master, recrutador, vendedor)
  const [paginaAdmin, setPaginaAdmin] = useState<string>("dashboard");
  // Itens que o cliente colocou no carrinho
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  // Texto digitado na busca de produtos
  const [busca, setBusca] = useState("");
  // Categoria selecionada no menu da loja
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todos");
  // IDs dos produtos favoritados (coração)
  const [favoritos, setFavoritos] = useState<number[]>([]);
  const [menuMobileAdmin, setMenuMobileAdmin] = useState(false);
  // Cliente logado (null = visitante)
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  // Define se a tela de login abre em login ou cadastro
  const [modoTelaLogin, setModoTelaLogin] = useState<"login" | "cadastro">("login");
  const [avisoTelaLogin, setAvisoTelaLogin] = useState("");
  // Produto que o visitante tentou comprar antes de se cadastrar
  const [produtoPendente, setProdutoPendente] = useState<Produto | null>(null);
  // Pagamento escolhido no carrinho, aguardando confirmação na tela de pagamento
  const [pagamentoPendente, setPagamentoPendente] = useState<DadosPagamento | null>(null);
  // Cargos dados pelo Master (e-mail → recrutador/vendedor), carregados do banco
  const [cargos, setCargos] = useState<Record<string, Cargo>>({});
  // Vínculos de recrutamento (recrutador → vendedor), carregados do banco
  const [recrutamentos, setRecrutamentos] = useState<Recrutamento[]>([]);
  // Código de venda digitado pelo cliente na compra atual
  const [codigoVenda, setCodigoVenda] = useState("");
  // Configurações da loja ajustáveis pelo Admin, carregadas do banco
  const [config, setConfig] = useState<ConfigLoja>(CONFIG_PADRAO);
  // Cupons de desconto criados pelo Admin, carregados do banco
  const [cupons, setCupons] = useState<Cupom[]>([]);
  // Cupom digitado pelo cliente no carrinho
  const [cupomDigitado, setCupomDigitado] = useState("");
  // Pedidos de compras finalizadas (carregados do banco de dados)
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  // Clientes cadastrados (carregados do banco de dados)
  const [clientes, setClientes] = useState<Cliente[]>([]);
  // Catálogo de produtos gerenciado pelo admin (carregado do banco de dados)
  const [produtos, setProdutos] = useState<Produto[]>([]);
  // Alertas de produto esgotado (aparecem no sino do admin)
  const [alertasEstoque, setAlertasEstoque] = useState<{ id: number; name: string; date: string }[]>([]);
  // Produto aberto na página de detalhes (null = vitrine)
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [totalUltimaCompra, setTotalUltimaCompra] = useState(0);
  // Controla o aviso animado de adicionado ao carrinho
  const [toastAdicionado, setToastAdicionado] = useState<{ p: Produto; key: number } | null>(null);

  useEffect(() => {
    if (!toastAdicionado) return;
    const t = setTimeout(() => setToastAdicionado(null), 2600);
    return () => clearTimeout(t);
  }, [toastAdicionado]);

  // ── Banco de dados (XAMPP/MySQL via backend) — fonte única dos dados ─────
  // Tudo que precisa ser guardado vive SOMENTE no banco "coracaopresente".
  // Ao abrir o site, os dados são carregados de lá. Dados antigos que ainda
  // estejam no navegador são migrados para o banco uma única vez e apagados.
  const bancoPronto = useRef(false);
  // null = verificando · true = conectado · false = desconectado (mostra aviso)
  const [bancoConectado, setBancoConectado] = useState<boolean | null>(null);

  useEffect(() => {
    // Cópias antigas do navegador (usadas só para a migração inicial)
    const locais = {
      produtos: lerArmazenamento<Produto[]>("cp_products", []),
      pedidos: lerArmazenamento<Pedido[]>("cp_orders", []),
      clientes: lerArmazenamento<Cliente[]>("cp_customers", []),
      cargos: lerArmazenamento<Record<string, Cargo>>("cp_cargos", {}),
      recrutamentos: lerArmazenamento<Recrutamento[]>("cp_recrutamentos", []),
      cupons: lerArmazenamento<Cupom[]>("cp_cupons", []),
      alertasEstoque: lerArmazenamento<{ id: number; name: string; date: string }[]>("cp_stock_alerts", []),
      config: lerArmazenamento<Partial<ConfigLoja> | null>("cp_config", null),
    };

    // Prefere o banco; usa a cópia antiga apenas se o banco estiver vazio
    const aplicar = (banco: any) => {
      const escolher = <T,>(doBanco: T[] | undefined, antigo: T[]) =>
        doBanco && doBanco.length > 0 ? doBanco : antigo;
      setProdutos(escolher(banco?.produtos, locais.produtos));
      setPedidos(escolher(banco?.pedidos, locais.pedidos));
      setClientes(escolher(banco?.clientes, locais.clientes));
      setRecrutamentos(escolher(banco?.recrutamentos, locais.recrutamentos));
      setCupons(escolher(banco?.cupons, locais.cupons));
      setAlertasEstoque(escolher(banco?.alertasEstoque, locais.alertasEstoque));
      setCargos(
        banco?.cargos && Object.keys(banco.cargos).length > 0 ? banco.cargos : locais.cargos
      );
      const configFinal = banco?.config ?? locais.config;
      if (configFinal) setConfig((anterior) => ({ ...anterior, ...configFinal }));
    };

    fetch(`${URL_BACKEND_PIX}/api/dados`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((banco) => {
        aplicar(banco);
        setBancoConectado(true);
        // Habilita a gravação: o que veio da migração é enviado ao banco agora
        bancoPronto.current = true;
        // Remove as cópias antigas do navegador — os dados ficam só no XAMPP
        ["cp_products", "cp_orders", "cp_customers", "cp_cargos", "cp_recrutamentos",
         "cp_cupons", "cp_stock_alerts", "cp_config"].forEach((k) => localStorage.removeItem(k));
      })
      .catch(() => {
        // Banco fora do ar: mostra o que houver, mas avisa que nada será salvo
        aplicar(null);
        setBancoConectado(false);
      });
  }, []);

  // Grava uma coleção no banco. Nada é salvo no navegador.
  const salvarNoBanco = (colecao: string, dados: unknown) => {
    if (!bancoPronto.current) return;
    fetch(`${URL_BACKEND_PIX}/api/dados/${colecao}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dados }),
    }).catch(() => setBancoConectado(false));
  };

  useEffect(() => {
    salvarNoBanco("pedidos", pedidos);
  }, [pedidos]);

  useEffect(() => {
    salvarNoBanco("produtos", produtos);
  }, [produtos]);

  useEffect(() => {
    salvarNoBanco("alertasEstoque", alertasEstoque);
  }, [alertasEstoque]);

  useEffect(() => {
    salvarNoBanco("cargos", cargos);
  }, [cargos]);

  useEffect(() => {
    salvarNoBanco("recrutamentos", recrutamentos);
  }, [recrutamentos]);

  useEffect(() => {
    salvarNoBanco("config", config);
  }, [config]);

  useEffect(() => {
    salvarNoBanco("cupons", cupons);
  }, [cupons]);

  // Cria um cupom novo ou atualiza um existente (mesmo código)
  const salvarCupom = (c: Cupom) =>
    setCupons((anterior) =>
      anterior.some((x) => x.codigo === c.codigo)
        ? anterior.map((x) => (x.codigo === c.codigo ? c : x))
        : [c, ...anterior]
    );

  const excluirCupom = (codigo: string) =>
    setCupons((anterior) => anterior.filter((c) => c.codigo !== codigo));


  // Master dá (ou remove) o cargo de um usuário. Vendedor nunca vira recrutador
  // por aqui sem o Master decidir — e o recrutamento em si só existe para recrutadores.
  const definirCargo = (email: string, cargo: Cargo | null) => {
    const chave = email.toLowerCase();
    setCargos((anterior) => {
      const novo = { ...anterior };
      if (cargo === null) delete novo[chave];
      else novo[chave] = cargo;
      return novo;
    });
  };

  // Recrutador cadastra um vendedor: gera o código de ativação e cria o vínculo.
  // Retorna uma mensagem de erro, ou null se deu certo.
  const recrutarVendedor = (recrutadorEmail: string, nome: string, email: string): string | null => {
    const chave = email.trim().toLowerCase();
    if (!nome.trim() || !chave) return "Preencha o nome e o e-mail do vendedor.";
    if (chave === EMAIL_ADMIN || chave === EMAIL_MASTER) return "Este e-mail é reservado.";
    if (chave === recrutadorEmail.toLowerCase()) return "Você não pode recrutar a si mesmo.";
    if (cargos[chave] === "recrutador") return "Este usuário é um recrutador e não pode ser recrutado.";
    if (recrutamentos.some((r) => r.email.toLowerCase() === chave))
      return "Este e-mail já foi recrutado.";
    setRecrutamentos((anterior) => [
      {
        codigo: gerarCodigoRecrutamento(),
        recrutador: recrutadorEmail.toLowerCase(),
        nome: nome.trim(),
        email: chave,
        ativado: false,
        date: new Date().toLocaleDateString("pt-BR"),
      },
      ...anterior,
    ]);
    return null;
  };

  // Cria um produto novo ou atualiza um existente
  const salvarProduto = (p: Produto) =>
    setProdutos((anterior) =>
      anterior.some((x) => x.id === p.id) ? anterior.map((x) => (x.id === p.id ? p : x)) : [p, ...anterior]
    );

  // Remove um produto do catálogo
  const excluirProduto = (id: number) => setProdutos((anterior) => anterior.filter((p) => p.id !== id));

  // Atualiza o status de um pedido (Processando, Entregue...)
  const atualizarStatusPedido = (id: string, status: string) =>
    setPedidos((anterior) => anterior.map((o) => (o.id === id ? { ...o, status } : o)));

  useEffect(() => {
    salvarNoBanco("clientes", clientes);
  }, [clientes]);

  // Insere o produto no carrinho respeitando o estoque disponível
  const colocarNoCarrinho = (produto: Produto) => {
    setCarrinho((anterior) => {
      const existente = anterior.find((i) => i.id === produto.id);
      if (existente) {
        // Não deixa colocar no carrinho mais do que o estoque disponível
        if (existente.qty >= produto.stock) return anterior;
        return anterior.map((i) => i.id === produto.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...anterior, { ...produto, qty: 1 }];
    });
    setToastAdicionado({ p: produto, key: Date.now() });
  };

  // Comprar exige cadastro: visitante é enviado para a tela de cadastro
  const adicionarAoCarrinho = (produto: Produto) => {
    if (produto.stock <= 0) return; // esgotado
    if (!usuario) {
      // Cliente precisa se cadastrar antes de comprar
      setProdutoPendente(produto);
      setModoTelaLogin("cadastro");
      setAvisoTelaLogin("Crie sua conta para continuar a compra");
      setTela("login");
      return;
    }
    colocarNoCarrinho(produto);
  };

  const abrirTelaCadastro = () => {
    setModoTelaLogin("cadastro");
    setAvisoTelaLogin("");
    setProdutoPendente(null);
    setTela("login");
  };

  // Finaliza a compra: cria os pedidos, dá baixa no estoque e gera alertas
  // Chamado pelo carrinho: valida o cliente e abre a tela de pagamento
  const finalizarCompra = (dados: DadosPagamento) => {
    if (!usuario) {
      setModoTelaLogin("cadastro");
      setAvisoTelaLogin("Crie sua conta para finalizar a compra");
      setTela("login");
      return;
    }
    if (carrinho.length === 0) return;
    setPagamentoPendente(dados);
    setTela("pagamento");
  };

  // Chamado quando o pagamento é confirmado: cria os pedidos, dá baixa no
  // estoque e gera alertas. PIX e Cartão entram como "Pago" (sem estorno).
  const confirmarPagamento = () => {
    if (!usuario || !pagamentoPendente) return;
    const agora = new Date();
    const date = agora.toLocaleDateString("pt-BR");
    const month = NOMES_MESES[agora.getMonth()];
    const sufixo = String(Date.now()).slice(-5);
    const rotuloPagamento = { pix: "PIX", cartao: "Cartão", boleto: "Boleto" }[pagamentoPendente.metodo];
    // Boleto ainda depende de compensação; PIX e Cartão são aprovados na hora
    const statusInicial = pagamentoPendente.metodo === "boleto" ? "Processando" : "Pago";

    const novosPedidos: Pedido[] = carrinho.map((item, i) => ({
      id: `#CP-${sufixo}${i}`,
      customer: usuario.name,
      email: usuario.email,
      items: item.qty > 1 ? `${item.name} (${item.qty}x)` : item.name,
      total: item.price * item.qty,
      status: statusInicial,
      date,
      month,
      category: item.category,
      pagamento: rotuloPagamento,
      // Atribuição da venda: com código de venda válido, a venda conta somente
      // para a conta dona do código; sem código, vale o dono do produto
      vendedor: donoCodigoVenda ?? item.owner,
      codigoVenda: donoCodigoVenda ? codigoVendaLimpo : undefined,
      // Endereço de entrega preenchido no carrinho (CEP + número)
      endereco: pagamentoPendente.endereco,
    }));

    // Baixa de estoque dos produtos vendidos
    const produtosAtualizados = produtos.map((p) => {
      const item = carrinho.find((i) => i.id === p.id);
      if (!item) return p;
      return { ...p, stock: Math.max(0, p.stock - item.qty) };
    });
    // Alerta de produto esgotado (para as notificações do admin)
    const esgotados = produtos
      .filter((p) => {
        const item = carrinho.find((i) => i.id === p.id);
        return item && p.stock > 0 && p.stock - item.qty <= 0;
      })
      .map((p) => ({ id: p.id, name: p.name, date }));

    setProdutos(produtosAtualizados);
    if (esgotados.length > 0) setAlertasEstoque((anterior) => [...esgotados, ...anterior]);

    setPedidos((anterior) => [...novosPedidos, ...anterior]);
    setTotalUltimaCompra(pagamentoPendente.total);
    setCarrinho([]);
    setPagamentoPendente(null);
    setCodigoVenda(""); // o código de venda vale para uma compra por vez
    // Registra o uso do cupom e limpa para a próxima compra
    if (cupomAplicado) {
      setCupons((anterior) =>
        anterior.map((c) => (c.codigo === cupomAplicado.codigo ? { ...c, usos: c.usos + 1 } : c))
      );
      setCupomDigitado("");
    }
    setTela("sucesso");
  };

  const removerDoCarrinho = (id: number) => setCarrinho((anterior) => anterior.filter((i) => i.id !== id));
  const mudarQtd = (id: number, variacao: number) =>
    setCarrinho((anterior) =>
      anterior.map((i) => i.id === id ? { ...i, qty: Math.max(0, i.qty + variacao) } : i)
          .filter((i) => i.qty > 0)
    );
  const alternarFavorito = (id: number) =>
    setFavoritos((anterior) => anterior.includes(id) ? anterior.filter((x) => x !== id) : [...anterior, id]);

  const totalCarrinho = carrinho.reduce((acum, i) => acum + i.price * i.qty, 0);
  const qtdCarrinho = carrinho.reduce((acum, i) => acum + i.qty, 0);

  // Dono do código de venda digitado pelo cliente (null = vazio ou inválido).
  // Sem código (ou com código inválido), a compra segue normalmente.
  // Contas com código: o Master e todos que têm cargo de recrutador ou vendedor.
  const codigoVendaLimpo = codigoVenda.trim().toUpperCase();
  const contasComCodigo = [EMAIL_MASTER, ...Object.keys(cargos)];
  const donoCodigoVenda = codigoVendaLimpo
    ? contasComCodigo.find((email) => codigoVendaDe(email) === codigoVendaLimpo) ?? null
    : null;
  // Nome amigável do dono do código (para mostrar ao cliente)
  const nomeDonoCodigoVenda = donoCodigoVenda
    ? donoCodigoVenda === EMAIL_MASTER
      ? NOME_MASTER
      : clientes.find((c) => c.email.toLowerCase() === donoCodigoVenda)?.name ?? donoCodigoVenda
    : null;

  // Cupom digitado no carrinho, se existir e estiver válido (ativo e na validade)
  const cupomAplicado = cupomDigitado.trim()
    ? cupons.find((c) => c.codigo === cupomDigitado.trim().toUpperCase() && cupomEstaValido(c)) ?? null
    : null;

  const produtosFiltrados = useMemo(
    () => produtos.filter((p) => {
      const matchCat = categoriaSelecionada === "Todos" || p.category === categoriaSelecionada;
      const matchSearch =
        p.name.toLowerCase().includes(busca.toLowerCase()) ||
        p.brand.toLowerCase().includes(busca.toLowerCase());
      return matchCat && matchSearch;
    }),
    [categoriaSelecionada, busca, produtos]
  );

  // Após login/cadastro: registra o cliente e retoma a compra pendente.
  // Se veio um código de recrutamento válido, ativa a conta como vendedor.
  const processarLogin = (u: Usuario, codigoVendedor?: string) => {
    setUsuario(u);
    const emailLimpo = u.email.toLowerCase();
    // Ativação por código: vincula o vendedor ao recrutador que o cadastrou
    if (codigoVendedor) {
      const vinculo = recrutamentos.find(
        (r) => r.codigo === codigoVendedor && r.email.toLowerCase() === emailLimpo
      );
      if (vinculo) {
        setRecrutamentos((anterior) =>
          anterior.map((r) => (r.codigo === codigoVendedor ? { ...r, ativado: true } : r))
        );
        definirCargo(emailLimpo, "vendedor");
      }
    }
    // Administrador e Master não entram na lista de clientes da loja
    if (emailLimpo === EMAIL_ADMIN || emailLimpo === EMAIL_MASTER) {
      setTela(produtoPendente ? "carrinho" : "loja");
      if (produtoPendente) { colocarNoCarrinho(produtoPendente); setProdutoPendente(null); }
      setAvisoTelaLogin("");
      return;
    }
    setClientes((anterior) =>
      anterior.some((c) => c.email === u.email)
        ? anterior
        : [...anterior, {
            name: u.name,
            email: u.email,
            since: new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
          }]
    );
    if (produtoPendente) {
      colocarNoCarrinho(produtoPendente);
      setProdutoPendente(null);
      setTela("carrinho");
    } else {
      setTela("loja");
    }
    setAvisoTelaLogin("");
  };

  if (tela === "login") {
    return (
      <TelaLogin
        aoLogar={processarLogin}
        modoInicial={modoTelaLogin}
        aviso={avisoTelaLogin}
        aoVoltar={() => { setProdutoPendente(null); setAvisoTelaLogin(""); setTela("loja"); }}
        clientes={clientes}
        recrutamentos={recrutamentos}
      />
    );
  }

  // Verifica se o usuário logado é o administrador da loja
  const ehAdmin = usuario?.email?.toLowerCase() === EMAIL_ADMIN;
  // Verifica se o usuário logado é o Master (dá cargos; painel sem Produtos)
  const ehMaster = usuario?.email?.toLowerCase() === EMAIL_MASTER;
  // Cargo dado pelo Master ao usuário logado (recrutador ou vendedor)
  const cargoUsuario: Cargo | undefined = usuario ? cargos[usuario.email.toLowerCase()] : undefined;

  // Rótulo do botão de painel no cabeçalho (null = usuário sem painel)
  const rotuloPainel = ehAdmin
    ? "Admin"
    : ehMaster
    ? "Master"
    : cargoUsuario === "recrutador"
    ? "Recrutador"
    : cargoUsuario === "vendedor"
    ? "Vendedor"
    : null;

  // Abre o painel certo para o usuário, já na página inicial adequada
  const abrirPainel = () => {
    if (ehAdmin) { setPaginaAdmin("dashboard"); setTela("admin"); }
    else if (ehMaster) { setPaginaAdmin("dashboard"); setTela("master"); }
    else if (cargoUsuario === "recrutador") { setPaginaAdmin("vendedores"); setTela("recrutador"); }
    else if (cargoUsuario === "vendedor") { setPaginaAdmin("produtos"); setTela("vendedor"); }
  };

  // Abre o perfil do cliente (pede login se for visitante)
  const abrirPerfil = () => {
    if (!usuario) {
      setModoTelaLogin("login");
      setAvisoTelaLogin("Entre na sua conta para ver o seu perfil");
      setTela("login");
      return;
    }
    setTela("perfil");
  };

  // Perfil do cliente: pedidos por status, cupons e categorias
  if (tela === "perfil" && usuario) {
    return (
      <>
        <TelaPerfil
          usuario={usuario}
          pedidos={pedidos.filter((o) => o.email.toLowerCase() === usuario.email.toLowerCase())}
          cupons={cupons.filter(cupomEstaValido)}
          categorias={CATEGORIAS.filter((c) => c !== "Todos")}
          aoVerCategoria={(c) => { setCategoriaSelecionada(c); setProdutoSelecionado(null); setTela("loja"); }}
          aoVoltar={() => setTela("loja")}
          aoSair={() => { setUsuario(null); setTela("loja"); }}
          rotuloPainel={rotuloPainel}
          aoAbrirPainel={abrirPainel}
        />
        <BarraInferiorMobile
          ativa="perfil"
          qtdCarrinho={qtdCarrinho}
          aoIrInicio={() => { setProdutoSelecionado(null); setTela("loja"); }}
          aoAbrirCarrinho={() => setTela("carrinho")}
          aoAbrirPerfil={() => {}}
          categorias={CATEGORIAS.filter((c) => c !== "Todos")}
          aoEscolherCategoria={(c) => { setCategoriaSelecionada(c); setProdutoSelecionado(null); setTela("loja"); }}
        />
        {bancoConectado === false && <AvisoBancoDesconectado />}
      </>
    );
  }

  // O painel Admin só abre para o e-mail do administrador
  if (tela === "admin" && ehAdmin) {
    return (
      <PainelAdmin
        modo="admin"
        pagina={paginaAdmin}
        setPagina={setPaginaAdmin}
        setTela={setTela}
        menuMobileAberto={menuMobileAdmin}
        setMenuMobileAberto={setMenuMobileAdmin}
        usuario={usuario}
        pedidos={pedidos}
        clientes={clientes}
        produtos={produtos}
        aoSalvarProduto={salvarProduto}
        aoExcluirProduto={excluirProduto}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        recrutamentos={recrutamentos}
        comissaoPct={config.comissaoRecrutador / 100}
        cupons={cupons}
        aoSalvarCupom={salvarCupom}
        aoExcluirCupom={excluirCupom}
        config={config}
        aoSalvarConfig={setConfig}
        bancoOffline={bancoConectado === false}
      />
    );
  }

  // Painel Master: como o admin, mas SEM a página de Produtos e COM a página
  // Equipe, onde os cargos de recrutador e vendedor são dados aos usuários
  if (tela === "master" && ehMaster) {
    return (
      <PainelAdmin
        modo="master"
        pagina={paginaAdmin}
        setPagina={setPaginaAdmin}
        setTela={setTela}
        menuMobileAberto={menuMobileAdmin}
        setMenuMobileAberto={setMenuMobileAdmin}
        usuario={usuario}
        pedidos={pedidos}
        clientes={clientes}
        produtos={produtos}
        aoSalvarProduto={salvarProduto}
        aoExcluirProduto={excluirProduto}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        aoDefinirCargo={definirCargo}
        recrutamentos={recrutamentos}
        codigoVenda={usuario ? codigoVendaDe(usuario.email) : undefined}
        bancoOffline={bancoConectado === false}
      />
    );
  }

  // Painel do Recrutador: cadastra vendedores e acompanha as comissões de 2%
  if (tela === "recrutador" && usuario && cargoUsuario === "recrutador") {
    return (
      <PainelAdmin
        modo="recrutador"
        pagina={paginaAdmin}
        setPagina={setPaginaAdmin}
        setTela={setTela}
        menuMobileAberto={menuMobileAdmin}
        setMenuMobileAberto={setMenuMobileAdmin}
        usuario={usuario}
        pedidos={pedidos}
        clientes={clientes}
        produtos={produtos}
        aoSalvarProduto={salvarProduto}
        aoExcluirProduto={excluirProduto}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        recrutamentos={recrutamentos}
        aoRecrutar={(nome, email) => recrutarVendedor(usuario.email, nome, email)}
        codigoVenda={codigoVendaDe(usuario.email)}
        comissaoPct={config.comissaoRecrutador / 100}
        bancoOffline={bancoConectado === false}
      />
    );
  }

  // Painel do Vendedor: gerencia apenas os próprios produtos e vendas.
  // Vendedor NÃO pode recrutar — o painel não tem nenhuma função de recrutamento.
  if (tela === "vendedor" && usuario && cargoUsuario === "vendedor") {
    const emailVendedor = usuario.email.toLowerCase();
    return (
      <PainelAdmin
        modo="vendedor"
        pagina={paginaAdmin}
        setPagina={setPaginaAdmin}
        setTela={setTela}
        menuMobileAberto={menuMobileAdmin}
        setMenuMobileAberto={setMenuMobileAdmin}
        usuario={usuario}
        pedidos={pedidos.filter((o) => o.vendedor?.toLowerCase() === emailVendedor)}
        clientes={clientes}
        produtos={produtos.filter((p) => p.owner?.toLowerCase() === emailVendedor)}
        aoSalvarProduto={(p) => salvarProduto({ ...p, owner: emailVendedor })}
        aoExcluirProduto={excluirProduto}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque.filter((a) =>
          produtos.some((p) => p.id === a.id && p.owner?.toLowerCase() === emailVendedor)
        )}
        codigoVenda={codigoVendaDe(emailVendedor)}
        bancoOffline={bancoConectado === false}
      />
    );
  }

  // Tela de pagamento: confirma o pagamento pendente ou volta ao carrinho.
  // PIX tem página própria com QR Code e código copia e cola (expira em 30 min)
  if (tela === "pagamento" && pagamentoPendente) {
    if (pagamentoPendente.metodo === "pix") {
      return (
        <TelaPix
          total={pagamentoPendente.total}
          aoConfirmar={confirmarPagamento}
          aoVoltar={() => { setPagamentoPendente(null); setTela("carrinho"); }}
          chavePix={config.chavePix}
        />
      );
    }
    return (
      <TelaPagamento
        dados={pagamentoPendente}
        aoConfirmar={confirmarPagamento}
        aoVoltar={() => { setPagamentoPendente(null); setTela("carrinho"); }}
      />
    );
  }

  if (tela === "sucesso") {
    return (
      <TelaCompraConcluida
        total={totalUltimaCompra}
        aoContinuar={() => setTela("loja")}
      />
    );
  }

  if (tela === "carrinho") {
    return (
      <PaginaCarrinho
        items={carrinho}
        onRemove={removerDoCarrinho}
        aoMudarQtd={mudarQtd}
        aoVoltar={() => setTela("loja")}
        aoFinalizarCompra={finalizarCompra}
        usuario={usuario}
        codigoVenda={codigoVenda}
        aoMudarCodigoVenda={setCodigoVenda}
        nomeDonoCodigo={nomeDonoCodigoVenda}
        config={config}
        cupom={cupomDigitado}
        aoMudarCupom={setCupomDigitado}
        cupomAplicado={cupomAplicado}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-14 md:pb-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <CabecalhoLoja
        qtdCarrinho={qtdCarrinho}
        aoAbrirCarrinho={() => setTela("carrinho")}
        aoAbrirPainel={abrirPainel}
        rotuloPainel={rotuloPainel}
        aoClicarEntrar={abrirTelaCadastro}
        aoSair={() => setUsuario(null)}
        busca={busca}
        aoBuscar={(v) => { setBusca(v); setProdutoSelecionado(null); }}
        usuario={usuario}
      />
      <MenuCategorias
        categorias={CATEGORIAS}
        selecionada={categoriaSelecionada}
        aoSelecionar={(c) => { setCategoriaSelecionada(c); setProdutoSelecionado(null); }}
      />

      {/* Toast: produto adicionado ao carrinho */}
      {toastAdicionado && (
        <div
          key={toastAdicionado.key}
          className="fixed bottom-5 right-4 left-4 md:left-auto md:right-5 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 px-4 py-3 flex items-center gap-3 md:max-w-sm"
          style={{ animation: "toastIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Check size={18} className="text-emerald-600" strokeWidth={3} />
          </div>
          <ImagemProduto
            src={toastAdicionado.p.image}
            alt={toastAdicionado.p.name}
            className="w-10 h-10 object-contain bg-gray-50 rounded-lg p-1 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-black text-gray-900">Adicionado ao carrinho!</div>
            <div className="text-[11px] text-gray-500 truncate">{toastAdicionado.p.name}</div>
          </div>
          <button
            onClick={() => { setToastAdicionado(null); setTela("carrinho"); }}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white text-[11px] font-black px-3 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            Ver carrinho
          </button>
        </div>
      )}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(24px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes puloCarrinho {
          0% { transform: scale(1); }
          40% { transform: scale(1.5); }
          100% { transform: scale(1); }
        }
      `}</style>

      {produtoSelecionado ? (
        <PaginaProduto
          produto={produtoSelecionado}
          produtos={produtos}
          aoAdicionarAoCarrinho={adicionarAoCarrinho}
          aoAbrirProduto={(p) => { setProdutoSelecionado(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aoVoltar={() => setProdutoSelecionado(null)}
          aoFavoritar={alternarFavorito}
          favoritos={favoritos}
          codigoVenda={codigoVenda}
          aoMudarCodigoVenda={setCodigoVenda}
          nomeDonoCodigo={nomeDonoCodigoVenda}
        />
      ) : (
      <main>
        <BannerRotativo
          aoClicarBanner={(c) => {
            setCategoriaSelecionada(c);
            setProdutoSelecionado(null);
            document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <section id="produtos-section" className="max-w-[1280px] mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-black text-gray-900">
                {categoriaSelecionada === "Todos" ? "Ofertas do Dia" : categoriaSelecionada}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {produtosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Search size={40} strokeWidth={1} className="mx-auto mb-3" />
              <p className="font-medium">
                {produtos.length === 0
                  ? "Nenhum produto cadastrado ainda — cadastre produtos no painel Admin."
                  : "Nenhum produto encontrado"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4">
              {produtosFiltrados.map((p) => (
                <CartaoProduto
                  key={p.id}
                  produto={p}
                  aoAdicionarAoCarrinho={(prod) => { adicionarAoCarrinho(prod); }}
                  aoFavoritar={alternarFavorito}
                  estaFavoritado={favoritos.includes(p.id)}
                  aoAbrirProduto={(prod) => { setProdutoSelecionado(prod); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              ))}
            </div>
          )}
        </section>

        <SecaoConfianca />
      </main>
      )}

      <RodapeLoja />

      {/* Navegação inferior no celular: Início · Categorias · Carrinho · Eu */}
      <BarraInferiorMobile
        ativa="inicio"
        qtdCarrinho={qtdCarrinho}
        aoIrInicio={() => {
          setProdutoSelecionado(null);
          setCategoriaSelecionada("Todos");
          setBusca("");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        aoAbrirCarrinho={() => setTela("carrinho")}
        aoAbrirPerfil={abrirPerfil}
        categorias={CATEGORIAS.filter((c) => c !== "Todos")}
        aoEscolherCategoria={(c) => {
          setCategoriaSelecionada(c);
          setProdutoSelecionado(null);
          document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      {bancoConectado === false && <AvisoBancoDesconectado />}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function TelaLogin({
  aoLogar,
  modoInicial = "login",
  aviso,
  aoVoltar,
  clientes = [],
  recrutamentos = [],
}: {
  aoLogar: (u: Usuario, codigoVendedor?: string) => void;
  modoInicial?: "login" | "cadastro";
  aviso?: string;
  aoVoltar?: () => void;
  clientes?: Cliente[];
  recrutamentos?: Recrutamento[];
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [modo, setModo] = useState<"login" | "cadastro">(modoInicial);
  const [name, setName] = useState("");
  // Código de recrutamento (opcional): ativa a conta como vendedor
  const [codigoVendedor, setCodigoVendedor] = useState("");
  // Cadastro rápido com Google: só pede o nome de usuário
  const [modoGoogle, setModoGoogle] = useState(false);
  const [nomeGoogle, setNomeGoogle] = useState("");
  // Onde o Google desenha o botão oficial de login (quando há Client ID)
  const botaoGoogleRef = useRef<HTMLDivElement>(null);

  // Login real com Google: carrega o script oficial e valida a conta na Google.
  // Quem já tem cadastro entra automaticamente com o e-mail verificado.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return; // sem Client ID configurado, usa o fluxo simulado
    const iniciarGoogle = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !botaoGoogleRef.current) return;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resposta: any) => {
          try {
            // O Google devolve um token JWT: o payload traz nome e e-mail verificados
            const payload = JSON.parse(
              atob(resposta.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
            );
            aoLogar({ name: payload.name || payload.email.split("@")[0], email: payload.email });
          } catch {
            setErro("Não foi possível entrar com o Google. Tente novamente.");
          }
        },
      });
      g.accounts.id.renderButton(botaoGoogleRef.current, {
        theme: "outline",
        size: "large",
        width: 380,
        text: "continue_with",
        locale: "pt-BR",
      });
    };
    if ((window as any).google?.accounts?.id) { iniciarGoogle(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = iniciarGoogle;
    document.head.appendChild(script);
  }, []);

  // Cria a conta automaticamente a partir do nome de usuário informado
  const cadastrarComGoogle = () => {
    if (!nomeGoogle.trim()) { setErro("Informe seu nome de usuário."); return; }
    const emailGerado = nomeGoogle.trim().toLowerCase().replace(/\s+/g, ".") + "@gmail.com";
    // Bloqueia tentativas de criar as contas do administrador ou do Master pelo Google
    if (emailGerado === EMAIL_ADMIN || emailGerado === EMAIL_MASTER) {
      setErro("Este nome de usuário não está disponível.");
      return;
    }
    setErro("");
    setCarregando(true);
    // Se o usuário já tem cadastro, entra automaticamente na conta existente
    const contaExistente = clientes.find((c) => c.email.toLowerCase() === emailGerado);
    setTimeout(() => {
      setCarregando(false);
      aoLogar(
        contaExistente
          ? { name: contaExistente.name, email: contaExistente.email }
          : { name: nomeGoogle.trim(), email: emailGerado }
      );
    }, 1000);
  };

  const aoEnviarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha) { setErro("Preencha todos os campos."); return; }
    if (modo === "cadastro" && !name) { setErro("Informe seu nome."); return; }

    const emailLimpo = email.trim().toLowerCase();

    // Contas reservadas (Admin e Master): exigem a senha correta e não podem ser recadastradas
    if (emailLimpo === EMAIL_ADMIN || emailLimpo === EMAIL_MASTER) {
      if (modo === "cadastro") {
        setErro("Este e-mail é reservado. Use a opção Entrar.");
        return;
      }
      const senhaCorreta = emailLimpo === EMAIL_ADMIN ? SENHA_ADMIN : SENHA_MASTER;
      if (senha !== senhaCorreta) {
        setErro("Senha incorreta.");
        return;
      }
    }

    // Código de vendedor (opcional): precisa bater com o cadastro feito pelo recrutador
    const codigoLimpo = codigoVendedor.trim().toUpperCase();
    if (modo === "cadastro" && codigoLimpo) {
      const vinculo = recrutamentos.find(
        (r) => r.codigo === codigoLimpo && r.email.toLowerCase() === emailLimpo
      );
      if (!vinculo) {
        setErro("Código de vendedor inválido para este e-mail. Confira com o seu recrutador.");
        return;
      }
    }

    setErro("");
    setCarregando(true);
    setTimeout(() => {
      setCarregando(false);
      // Login das contas reservadas usa sempre o nome oficial
      if (emailLimpo === EMAIL_ADMIN) {
        aoLogar({ name: NOME_ADMIN, email: EMAIL_ADMIN });
        return;
      }
      if (emailLimpo === EMAIL_MASTER) {
        aoLogar({ name: NOME_MASTER, email: EMAIL_MASTER });
        return;
      }
      aoLogar({ name: name || email.split("@")[0], email }, modo === "cadastro" && codigoLimpo ? codigoLimpo : undefined);
    }, 1200);
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[55%] bg-[#4A1218] relative overflow-hidden flex-col">
        <img
          src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=900&h=1200&fit=crop&auto=format"
          alt="Shopping"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#4A1218] via-[#C8102E]/60 to-[#4A1218]/80" />

        <div className="relative z-10 flex flex-col h-full p-12">
          <Logo />

          <div className="flex-1 flex flex-col justify-center">
            <div className="max-w-sm">
              <h1 className="text-4xl font-black text-white leading-tight mb-4">
                Bem-vindo de volta!
              </h1>
              <p className="text-white/65 text-base leading-relaxed mb-10">
                Acesse sua conta e continue aproveitando as melhores ofertas com frete grátis e parcelamento sem juros.
              </p>

              <div className="space-y-4">
                {[
                  { icon: <Truck size={18} />, text: "Frete grátis em milhares de produtos" },
                  { icon: <CreditCard size={18} />, text: "Parcele em até 12x sem juros" },
                  { icon: <Zap size={18} />, text: "Descontos exclusivos pagando com PIX" },
                  { icon: <Heart size={18} />, text: "Parte da receita vai para projetos sociais" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <span className="text-[#E8B84B]">{item.icon}</span>
                    <span className="text-white/75 text-sm font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-white/30 text-xs">
            © 2026 Coração Presente · Todos os direitos reservados
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 bg-white flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo />
          </div>

          {aoVoltar && (
            <button
              onClick={aoVoltar}
              className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-[#C8102E] font-semibold mb-6 transition-colors"
            >
              <ChevronLeft size={15} />
              Voltar para a loja
            </button>
          )}

          {aviso && (
            <div className="bg-red-50 border border-red-200 text-[#C8102E] text-[13px] font-semibold px-4 py-3 rounded-xl mb-6">
              {aviso}
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-2xl font-black text-gray-900">
              {modo === "login" ? "Entrar na sua conta" : "Criar sua conta"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {modo === "login"
                ? "Informe seu e-mail e senha para continuar"
                : "Preencha os dados abaixo para começar"}
            </p>
          </div>

          <form onSubmit={aoEnviarFormulario} className="space-y-4">
            {modo === "cadastro" && (
              <div>
                <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
              </div>
            )}

            <div>
              <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
              />
            </div>

            <div>
              <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {modo === "cadastro" && (
              <div>
                <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                  Código de vendedor <span className="text-gray-400 font-medium">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={codigoVendedor}
                  onChange={(e) => setCodigoVendedor(e.target.value.toUpperCase())}
                  placeholder="Ex.: CP-7K2M9X"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Recebeu um código do seu recrutador? Informe aqui para ativar sua conta de vendedor.
                </p>
              </div>
            )}

            {modo === "login" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setLembrar(!lembrar)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      lembrar ? "bg-[#C8102E] border-[#C8102E]" : "border-gray-300"
                    }`}
                  >
                    {lembrar && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-[12px] text-gray-600 font-medium">Lembrar de mim</span>
                </label>
                <button type="button" className="text-[12px] text-[#C8102E] font-semibold hover:underline">
                  Esqueci minha senha
                </button>
              </div>
            )}

            {erro && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-black py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-[15px]"
            >
              {carregando ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </>
              ) : modo === "login" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium">ou continue com</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Com Client ID: botão oficial do Google (login real).
                Sem Client ID: cadastro simulado pedindo só o nome de usuário. */}
            {GOOGLE_CLIENT_ID ? (
              <div ref={botaoGoogleRef} className="flex justify-center" />
            ) : !modoGoogle ? (
              <button
                type="button"
                onClick={() => { setModoGoogle(true); setErro(""); }}
                className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2.5 text-sm"
              >
                <span className="text-lg">G</span>
                Continuar com Google
              </button>
            ) : (
              <div className="border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">G</span>
                  <span className="text-[13px] font-bold text-gray-800">Cadastro rápido com Google</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Informe apenas seu nome de usuário — o resto criamos automaticamente.
                </p>
                <input
                  type="text"
                  value={nomeGoogle}
                  onChange={(e) => setNomeGoogle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cadastrarComGoogle(); } }}
                  placeholder="Seu nome de usuário"
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setModoGoogle(false); setErro(""); }}
                    className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl hover:border-gray-300 transition-colors text-[13px]"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={cadastrarComGoogle}
                    disabled={carregando}
                    className="flex-1 bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-black py-2.5 rounded-xl transition-colors text-[13px] flex items-center justify-center gap-2"
                  >
                    {carregando ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "Criar conta"
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="text-center text-[13px] text-gray-500 mt-6">
            {modo === "login" ? "Não tem uma conta?" : "Já tem conta?"}{" "}
            <button
              onClick={() => { setModo(modo === "login" ? "cadastro" : "login"); setErro(""); }}
              className="text-[#C8102E] font-bold hover:underline"
            >
              {modo === "login" ? "Criar conta grátis" : "Entrar"}
            </button>
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-5 text-[11px] text-gray-400">
            <Lock size={11} />
            <span>Seus dados estão seguros e protegidos</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aviso de Banco Desconectado ──────────────────────────────────────────────

// Aparece quando o backend/MySQL (XAMPP) não responde: nada está sendo salvo
function AvisoBancoDesconectado() {
  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 right-4 md:left-auto md:w-[400px] z-[70] bg-amber-50 border-2 border-amber-300 text-amber-800 text-[12px] font-semibold px-4 py-3 rounded-xl shadow-lg">
      Banco de dados desconectado — as alterações NÃO estão sendo salvas.
      Ligue o MySQL no XAMPP e o backend (npm start na pasta backend) e recarregue a página.
    </div>
  );
}

// ─── Barra Inferior (Mobile) ──────────────────────────────────────────────────

// Navegação fixa no rodapé, visível somente no celular (estilo marketplace):
// Início · Categorias · Carrinho · Eu
function BarraInferiorMobile({
  ativa,
  qtdCarrinho,
  aoIrInicio,
  aoAbrirCarrinho,
  aoAbrirPerfil,
  categorias,
  aoEscolherCategoria,
}: {
  ativa: "inicio" | "perfil";
  qtdCarrinho: number;
  aoIrInicio: () => void;
  aoAbrirCarrinho: () => void;
  aoAbrirPerfil: () => void;
  categorias: string[];
  aoEscolherCategoria: (c: string) => void;
}) {
  const [categoriasAbertas, setCategoriasAbertas] = useState(false);

  const classeItem = (ativo: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
      ativo ? "text-[#C8102E]" : "text-gray-400"
    }`;

  return (
    <>
      {/* Gaveta de categorias */}
      {categoriasAbertas && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setCategoriasAbertas(false)}>
          <div
            className="absolute bottom-14 left-0 right-0 bg-white rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-black text-gray-900 text-[15px] mb-3">Categorias</h3>
            <div className="grid grid-cols-2 gap-2">
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => { aoEscolherCategoria(c); setCategoriasAbertas(false); }}
                  className="border border-gray-200 rounded-xl px-3 py-3 text-[13px] font-bold text-gray-700 hover:border-[#C8102E] hover:text-[#C8102E] transition-colors text-left"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden">
        <div className="grid grid-cols-4">
          <button onClick={aoIrInicio} className={classeItem(ativa === "inicio")}>
            <Home size={20} />
            <span className="text-[10px] font-bold">Início</span>
          </button>
          <button onClick={() => setCategoriasAbertas(true)} className={classeItem(false)}>
            <Menu size={20} />
            <span className="text-[10px] font-bold">Categorias</span>
          </button>
          <button onClick={aoAbrirCarrinho} className={classeItem(false)}>
            <div className="relative">
              <ShoppingCart size={20} />
              {qtdCarrinho > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                  {qtdCarrinho}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold">Carrinho</span>
          </button>
          <button onClick={aoAbrirPerfil} className={classeItem(ativa === "perfil")}>
            <User size={20} />
            <span className="text-[10px] font-bold">Eu</span>
          </button>
        </div>
      </nav>
    </>
  );
}

// ─── Tela Perfil do Cliente ───────────────────────────────────────────────────

// Perfil do cliente: pedidos por status (Preparando, A caminho, Entregues,
// Cancelados), cupons disponíveis e atalhos para as categorias da loja
function TelaPerfil({
  usuario,
  pedidos,
  cupons,
  categorias,
  aoVerCategoria,
  aoVoltar,
  aoSair,
  rotuloPainel,
  aoAbrirPainel,
}: {
  usuario: Usuario;
  pedidos: Pedido[];
  cupons: Cupom[];
  categorias: string[];
  aoVerCategoria: (c: string) => void;
  aoVoltar: () => void;
  aoSair: () => void;
  rotuloPainel: string | null;
  aoAbrirPainel: () => void;
}) {
  // null = mostra todos os pedidos; senão filtra pelo status escolhido
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [cupomCopiado, setCupomCopiado] = useState("");

  const atalhos = [
    { status: "Processando", rotulo: "Preparando", icon: <Package size={20} /> },
    { status: "Em trânsito", rotulo: "A caminho", icon: <Truck size={20} /> },
    { status: "Entregue", rotulo: "Entregues", icon: <Check size={20} /> },
    { status: "Cancelado", rotulo: "Cancelados", icon: <X size={20} /> },
  ];

  const contagem = (status: string) => pedidos.filter((o) => o.status === status).length;
  const visiveis = filtroStatus ? pedidos.filter((o) => o.status === filtroStatus) : pedidos;

  const copiarCupom = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCupomCopiado(codigo);
    setTimeout(() => setCupomCopiado(""), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Cabeçalho do perfil */}
      <div className="bg-[#C8102E] px-4 pt-4 pb-10">
        <div className="max-w-[720px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1 text-[13px] font-semibold transition-colors">
              <ChevronLeft size={16} />
              Loja
            </button>
            <button onClick={aoSair} className="text-white/80 hover:text-white flex items-center gap-1.5 text-[13px] font-semibold transition-colors">
              <LogOut size={14} />
              Sair
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
              {usuario.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-white font-black text-lg truncate">{usuario.name}</div>
              <div className="text-white/70 text-[12px] truncate">{usuario.email}</div>
            </div>
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="ml-auto bg-white/15 hover:bg-white/25 text-white text-[12px] font-bold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Settings size={13} />
                {rotuloPainel}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 -mt-5 space-y-4">
        {/* Meus pedidos: atalhos por status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-gray-900 text-[15px]">Meus Pedidos</h3>
            <button
              onClick={() => setFiltroStatus(null)}
              className="text-[12px] font-bold text-[#C8102E] hover:underline"
            >
              Ver todos
            </button>
          </div>
          <div className="grid grid-cols-4">
            {atalhos.map((a) => (
              <button
                key={a.status}
                onClick={() => setFiltroStatus(a.status)}
                className={`flex flex-col items-center gap-1.5 py-2 rounded-xl transition-colors ${
                  filtroStatus === a.status ? "bg-red-50 text-[#C8102E]" : "text-gray-500 hover:text-[#C8102E]"
                }`}
              >
                <div className="relative">
                  {a.icon}
                  {contagem(a.status) > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                      {contagem(a.status)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold">{a.rotulo}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lista de pedidos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h3 className="font-black text-gray-900 text-[14px]">
              {filtroStatus
                ? atalhos.find((a) => a.status === filtroStatus)?.rotulo
                : "Todos os pedidos"}
            </h3>
          </div>
          {visiveis.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-[13px]">
              {filtroStatus ? "Nenhum pedido nesta etapa." : "Você ainda não fez nenhum pedido."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visiveis.map((o) => (
                <div key={o.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[11px] text-[#C8102E] font-bold">{o.id}</span>
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h3 className="font-black text-gray-900 text-[14px]">Cupons para você</h3>
          </div>
          {cupons.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-[13px]">
              Nenhum cupom disponível no momento.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cupons.map((c) => (
                <div key={c.codigo} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-black text-[#C8102E]">{c.percentual}% OFF</div>
                    <div className="text-[11px] text-gray-400">
                      Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · use no carrinho
                    </div>
                  </div>
                  <button
                    onClick={() => copiarCupom(c.codigo)}
                    className="font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                  >
                    {cupomCopiado === c.codigo ? "Copiado!" : c.codigo}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categorias */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-black text-gray-900 text-[14px] mb-3">Categorias</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => aoVerCategoria(c)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] font-bold text-gray-700 hover:border-[#C8102E] hover:text-[#C8102E] transition-colors text-left"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Store Header ─────────────────────────────────────────────────────────────

function CabecalhoLoja({
  qtdCarrinho,
  aoAbrirCarrinho,
  aoAbrirPainel,
  rotuloPainel,
  aoClicarEntrar,
  aoSair,
  busca,
  aoBuscar,
  usuario,
}: {
  qtdCarrinho: number;
  aoAbrirCarrinho: () => void;
  aoAbrirPainel: () => void;
  rotuloPainel: string | null;
  aoClicarEntrar: () => void;
  aoSair: () => void;
  busca: string;
  aoBuscar: (v: string) => void;
  usuario: Usuario | null;
}) {
  const [perfilAberto, setPerfilAberto] = useState(false);

  return (
    <header>
      <div className="bg-[#8C1626] text-white text-[11px] py-1.5 px-4 text-center">
        Coração Presente · Frete grátis acima de R$&nbsp;299 · 0800 773 2578 · Atendimento 24h
      </div>
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-3 md:gap-x-4">
          <div className="flex-shrink-0">
            <Logo />
          </div>

          {/* Busca: linha própria no mobile, centralizada no desktop */}
          <div className="order-last md:order-none basis-full md:basis-0 md:flex-1 max-w-2xl md:mx-auto">
            <div className="flex bg-white rounded-xl overflow-hidden shadow-sm">
              <input
                type="text"
                value={busca}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder="Busque por produto, marca ou categoria..."
                className="flex-1 px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 min-w-0"
              />
              <button className="bg-[#E8B84B] px-5 flex items-center hover:bg-[#D9A83C] transition-colors">
                <Search size={17} className="text-[#C8102E]" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {/* Botão de painel: Admin, Master, Recrutador ou Vendedor */}
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="flex flex-col items-center gap-0.5 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/15 transition-colors"
              >
                <Settings size={19} />
                <span className="text-[9px] md:text-[10px] font-semibold">{rotuloPainel}</span>
              </button>
            )}

            {/* Perfil */}
            <div className="relative">
              <button
                onClick={() => (usuario ? setPerfilAberto((v) => !v) : aoClicarEntrar())}
                className="flex flex-col items-center gap-0.5 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/15 transition-colors"
              >
                <User size={19} />
                <span className="text-[9px] md:text-[10px] font-semibold max-w-[64px] truncate">
                  {usuario ? usuario.name.split(" ")[0] : "Entrar"}
                </span>
              </button>

              {perfilAberto && usuario && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPerfilAberto(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="text-[13px] font-black text-gray-900 truncate">{usuario.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{usuario.email}</div>
                    </div>
                    <button
                      onClick={() => { setPerfilAberto(false); aoSair(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-bold text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={15} />
                      Sair da conta
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={aoAbrirCarrinho}
              className="flex flex-col items-center gap-0.5 px-2.5 md:px-3 py-1.5 rounded-lg text-white hover:bg-white/15 transition-colors relative"
            >
              <div className="relative">
                <ShoppingCart size={19} />
                {qtdCarrinho > 0 && (
                  <span
                    key={qtdCarrinho}
                    className="absolute -top-2 -right-2 bg-[#E8B84B] text-[#C8102E] text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center"
                    style={{ animation: "puloCarrinho 0.4s ease" }}
                  >
                    {qtdCarrinho}
                  </span>
                )}
              </div>
              <span className="text-[9px] md:text-[10px] font-semibold">Carrinho</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Category Nav ─────────────────────────────────────────────────────────────

function MenuCategorias({ categorias, selecionada, aoSelecionar }: {
  categorias: string[];
  selecionada: string;
  aoSelecionar: (c: string) => void;
}) {
  return (
    <nav className="bg-[#8C1626] sticky top-0 z-30 shadow-sm">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide md:justify-center">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => aoSelecionar(c)}
              className={`px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                selecionada === c
                  ? "text-[#E8B84B] border-b-2 border-[#E8B84B]"
                  : "text-white/75 hover:text-white"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ─── Hero Banner (auto-rotating) ──────────────────────────────────────────────

const BANNERS = [
  {
    image: "perfume.jpeg",
    tag: "SUPER OFERTA",
    title: "Perfumes com até 5% OFF",
    subtitle: "Parcele em até 3x sem juros no cartão",
    cta: "Comprar Agora",
    accent: "#E8B84B",
    category: "Perfumes",
  },
  {
    image: "https://images.unsplash.com/photo-1593359677879-a4bb92f4834c?w=1200&h=400&fit=crop&auto=format",
    tag: "TV DAY",
    title: "Smart TVs 4K a partir de R$ 1.299",
    subtitle: "Frete grátis para todo o Brasil · Entrega expressa",
    cta: "Ver Ofertas",
    accent: "#E8B84B",
    category: "TVs",
  },
  {
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&h=400&fit=crop&auto=format",
    tag: "TECH WEEK",
    title: "Notebooks Intel i5 a partir de R$ 2.499",
    subtitle: "SSD 512GB · 16GB RAM · Garantia 12 meses",
    cta: "Aproveitar",
    accent: "#E8B84B",
    category: "Notebooks",
  },
  {
    image: "https://images.unsplash.com/photo-1607016284897-76561b521e4e?w=1200&h=400&fit=crop&auto=format",
    tag: "GAMER WEEK",
    title: "PS5 Slim com até R$ 500 de desconto",
    subtitle: "Estoque limitado · Aproveite enquanto dura",
    cta: "Garantir o meu",
    accent: "#E8B84B",
    category: "Games",
  },
];

function BannerRotativo({ aoClicarBanner }: { aoClicarBanner: (category: string) => void }) {
  const [bannerAtivo, setBannerAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    const timer = setInterval(() => {
      setBannerAtivo((anterior) => (anterior + 1) % BANNERS.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [pausado]);

  const anterior = () => { setBannerAtivo((a) => (a - 1 + BANNERS.length) % BANNERS.length); setPausado(true); };
  const proximoBanner = () => { setBannerAtivo((a) => (a + 1) % BANNERS.length); setPausado(true); };

  return (
    <div className="max-w-[1280px] mx-auto px-4 pt-5">
      <div
        className="relative rounded-2xl overflow-hidden h-[185px] md:h-[315px] bg-[#C8102E]"
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
      >
        {BANNERS.map((b, i) => (
          <div
            key={i}
            className={`absolute inset-0 transition-opacity duration-700 ${i === bannerAtivo ? "opacity-100" : "opacity-0"}`}
          >
            <img
              src={b.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#4A1218]/92 via-[#4A1218]/55 to-transparent" />
          </div>
        ))}

        <div className="relative z-10 h-full flex flex-col justify-center px-8 md:px-14 text-white">
          <span className="bg-[#E8B84B] text-[#4A1218] text-[10px] font-black px-3 py-1 rounded-full w-fit mb-3 tracking-wider">
            {BANNERS[bannerAtivo].tag}
          </span>
          <h1 className="text-2xl md:text-4xl font-black leading-tight mb-2 max-w-md drop-shadow-sm">
            {BANNERS[bannerAtivo].title}
          </h1>
          <p className="text-sm md:text-base text-white/70 mb-5 max-w-xs">
            {BANNERS[bannerAtivo].subtitle}
          </p>
          <button
            onClick={() => aoClicarBanner(BANNERS[bannerAtivo].category)}
            className="bg-[#E8B84B] text-[#4A1218] font-black text-sm px-7 py-2.5 rounded-xl w-fit hover:bg-[#F0C767] hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            {BANNERS[bannerAtivo].cta}
          </button>
        </div>

        {/* Arrows */}
        <button
          onClick={anterior}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 transition-colors backdrop-blur-sm"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={proximoBanner}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 transition-colors backdrop-blur-sm"
        >
          <ChevronRight size={18} />
        </button>

        {/* Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={() => { setBannerAtivo(i); setPausado(true); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                bannerAtivo === i ? "bg-[#E8B84B] w-7" : "bg-white/40 w-1.5 hover:bg-white/70"
              }`}
            />
          ))}
        </div>

        {/* Auto-play progress bar */}
        {!pausado && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-10">
            <div
              key={bannerAtivo}
              className="h-full bg-[#E8B84B]"
              style={{ animation: "progressBar 2s linear forwards" }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes progressBar {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}

// ─── Promo Strip ──────────────────────────────────────────────────────────────


// ─── Produto Card ─────────────────────────────────────────────────────────────

const CORES_SELO: Record<string, string> = {
  "MAIS VENDIDO": "bg-orange-500",
  OFERTA: "bg-red-500",
  "TOP VENDA": "bg-purple-600",
  NOVO: "bg-green-500",
  LANÇAMENTO: "bg-emerald-600",
};

function CartaoProduto({ produto, aoAdicionarAoCarrinho, aoFavoritar, estaFavoritado, aoAbrirProduto }: {
  produto: Produto;
  aoAdicionarAoCarrinho: (p: Produto) => void;
  aoFavoritar: (id: number) => void;
  estaFavoritado: boolean;
  aoAbrirProduto?: (p: Produto) => void;
}) {
  const temDesconto = produto.originalPrice && produto.originalPrice > produto.price;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col group">
      {produto.badge && (
        <div className={`${CORES_SELO[produto.badge] || "bg-[#C8102E]"} text-white text-[8px] md:text-[9px] font-black px-2 md:px-3 py-1 tracking-wider`}>
          {produto.badge}
        </div>
      )}
      <div
        className="relative p-2.5 md:p-4 bg-gray-50/70 cursor-pointer"
        onClick={() => aoAbrirProduto?.(produto)}
      >
        {temDesconto && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md z-10">
            -{pctDesconto(produto.originalPrice!, produto.price)}%
          </div>
        )}
        <ImagemProduto
          src={produto.image}
          alt={produto.name}
          className="w-full h-[90px] md:h-[130px] object-contain group-hover:scale-[1.04] transition-transform duration-300"
        />
        <button
          onClick={(e) => { e.stopPropagation(); aoFavoritar(produto.id); }}
          className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow"
        >
          <Heart size={13} className={estaFavoritado ? "fill-red-500 text-red-500" : "text-gray-300"} />
        </button>
      </div>
      <div className="p-2 md:p-3 flex flex-col flex-1">
        <span className="text-[9px] md:text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{produto.brand}</span>
        <p
          className="text-[11px] md:text-[13px] text-gray-800 font-semibold leading-snug mt-0.5 mb-1.5 md:mb-2 line-clamp-2 flex-1 cursor-pointer hover:text-[#C8102E] transition-colors"
          onClick={() => aoAbrirProduto?.(produto)}
        >
          {produto.name}
        </p>
        <div className="flex items-center gap-1 mb-2 md:mb-3">
          <div className="flex">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={10} className={i < Math.floor(produto.rating) ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
            ))}
          </div>
          <span className="text-[9px] md:text-[10px] text-gray-400">
            {produto.reviews > 0 ? `(${produto.reviews.toLocaleString("pt-BR")})` : "(novo)"}
          </span>
        </div>
        <div className="mt-auto">
          {temDesconto && (
            <span className="text-[10px] md:text-[11px] text-gray-400 line-through">{formatarMoeda(produto.originalPrice!)}</span>
          )}
          <div className="text-[16px] md:text-[22px] font-black text-[#C8102E] md:text-gray-900 leading-tight">{formatarMoeda(produto.price)}</div>
          <div className="text-[10px] md:text-[11px] text-gray-500 mt-0.5">
            ou {produto.installments}x de{" "}
            <span className="font-bold text-[#C8102E]">{precoParcela(produto.price, produto.installments)}</span>{" "}
            sem juros
          </div>
          {produto.freeShipping && (
            <div className="text-[9px] md:text-[10px] text-green-600 font-bold mt-1 md:mt-1.5 flex items-center gap-1">
              <Truck size={10} />
              FRETE GRÁTIS
            </div>
          )}
        </div>
        {produto.stock <= 0 ? (
          <button
            disabled
            className="mt-2 md:mt-3 bg-gray-200 text-gray-400 font-bold text-[11px] md:text-[13px] py-2 md:py-2.5 rounded-xl w-full cursor-not-allowed"
          >
            Esgotado
          </button>
        ) : (
          <button
            onClick={() => aoAdicionarAoCarrinho(produto)}
            className="mt-2 md:mt-3 bg-[#C8102E] hover:bg-[#8C1626] text-white font-bold text-[11px] md:text-[13px] py-2 md:py-2.5 rounded-xl transition-colors w-full"
          >
            Comprar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Produto Page ─────────────────────────────────────────────────────────────

// ─── Campo de Código de Venda ─────────────────────────────────────────────────

// Região onde o cliente informa o código de venda de quem o atendeu.
// Com um código válido, a venda é creditada somente à conta dona do código
// (master, recrutador ou vendedor), em vez do dono do produto.
function CampoCodigoVenda({
  codigo,
  aoMudar,
  nomeDono,
}: {
  codigo: string;
  aoMudar: (v: string) => void;
  nomeDono: string | null;
}) {
  const digitado = codigo.trim().length > 0;
  return (
    <div className="border border-gray-100 rounded-2xl px-4 py-3 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <Tag size={14} className="text-[#C8102E]" />
        <span className="text-[13px] font-bold text-gray-800">Código de venda</span>
        <span className="text-[11px] text-gray-400 font-medium">(opcional)</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        Foi atendido por alguém da nossa equipe? Informe o código para creditar a venda a essa pessoa.
      </p>
      <input
        value={codigo}
        onChange={(e) => aoMudar(e.target.value.toUpperCase())}
        placeholder="Ex.: CV-9X2K4M"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
      />
      {digitado && nomeDono && (
        <div className="mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold px-3 py-2 rounded-lg">
          Venda será creditada a <span className="font-black">{nomeDono}</span>
        </div>
      )}
      {digitado && !nomeDono && (
        <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium px-3 py-2 rounded-lg">
          Código não reconhecido — confira com quem te atendeu. Sem um código válido, a compra segue normalmente.
        </div>
      )}
    </div>
  );
}

function PaginaProduto({
  produto,
  produtos,
  aoAdicionarAoCarrinho,
  aoAbrirProduto,
  aoVoltar,
  aoFavoritar,
  favoritos,
  codigoVenda,
  aoMudarCodigoVenda,
  nomeDonoCodigo,
}: {
  produto: Produto;
  produtos: Produto[];
  aoAdicionarAoCarrinho: (p: Produto) => void;
  aoAbrirProduto: (p: Produto) => void;
  aoVoltar: () => void;
  aoFavoritar: (id: number) => void;
  favoritos: number[];
  codigoVenda: string;
  aoMudarCodigoVenda: (v: string) => void;
  nomeDonoCodigo: string | null;
}) {
  const temDesconto = produto.originalPrice && produto.originalPrice > produto.price;
  // Desconto no PIX definido no próprio produto (0 = sem desconto)
  const pctPix = produto.pixDesconto ?? 0;
  const precoPix = produto.price * (1 - pctPix / 100);
  const recomendados = produtos.filter((p) => p.id !== produto.id && p.category === produto.category).slice(0, 4);
  const outrosProdutos = produtos.filter((p) => p.id !== produto.id && p.category !== produto.category).slice(0, 8);

  const grid = (items: Produto[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4">
      {items.map((p) => (
        <CartaoProduto
          key={p.id}
          produto={p}
          aoAdicionarAoCarrinho={aoAdicionarAoCarrinho}
          aoFavoritar={aoFavoritar}
          estaFavoritado={favoritos.includes(p.id)}
          aoAbrirProduto={aoAbrirProduto}
        />
      ))}
    </div>
  );

  return (
    <main className="max-w-[1280px] mx-auto px-4 py-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium mb-4 flex-wrap">
        <button onClick={aoVoltar} className="hover:text-[#C8102E] transition-colors">Início</button>
        <ChevronRight size={13} />
        <span>{produto.category}</span>
        <ChevronRight size={13} />
        <span className="text-gray-800 font-semibold line-clamp-1">{produto.name}</span>
      </div>

      {/* Produto area */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <div className="relative bg-gray-50/70 rounded-2xl p-6 flex items-center justify-center">
            {produto.badge && (
              <span className={`absolute top-3 left-3 ${CORES_SELO[produto.badge] || "bg-[#C8102E]"} text-white text-[10px] font-black px-3 py-1 rounded-full tracking-wider z-10`}>
                {produto.badge}
              </span>
            )}
            {temDesconto && (
              <span className="absolute top-3 right-3 bg-red-500 text-white text-[11px] font-black px-2 py-1 rounded-md z-10">
                -{pctDesconto(produto.originalPrice!, produto.price)}%
              </span>
            )}
            <ImagemProduto
              src={produto.image}
              alt={produto.name}
              className="w-full h-[240px] md:h-[380px] object-contain"
            />
            <button
              onClick={() => aoFavoritar(produto.id)}
              className="absolute bottom-3 right-3 p-2.5 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
            >
              <Heart size={17} className={favoritos.includes(produto.id) ? "fill-red-500 text-red-500" : "text-gray-300"} />
            </button>
          </div>

          {/* Info */}
          <div>
            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wide">{produto.brand}</span>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 leading-snug mt-1 mb-3">
              {produto.name}
            </h1>

            <div className="flex items-center gap-1.5 mb-5">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className={i < Math.floor(produto.rating) ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
                ))}
              </div>
              <span className="text-[12px] text-gray-500 font-medium">
                {produto.rating > 0 ? produto.rating : "0"}{" "}
                {produto.reviews > 0 ? `(${produto.reviews.toLocaleString("pt-BR")} avaliações)` : "(novo)"}
              </span>
            </div>

            {/* Price block */}
            <div className="bg-gray-50 rounded-2xl p-5 mb-5">
              {temDesconto && (
                <span className="text-[13px] text-gray-400 line-through">{formatarMoeda(produto.originalPrice!)}</span>
              )}
              <div className="flex items-end gap-2 flex-wrap">
                <span className="text-3xl md:text-4xl font-black text-gray-900">{formatarMoeda(precoPix)}</span>
                {pctPix > 0 && (
                  <>
                    <span className="text-[13px] text-gray-500 font-semibold mb-1.5">no PIX</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[11px] font-black px-2 py-0.5 rounded-md mb-1.5">{pctPix}% OFF</span>
                  </>
                )}
              </div>
              <div className="text-[13px] text-gray-600 mt-2">
                ou <span className="font-bold">{formatarMoeda(produto.price)}</span> em{" "}
                <span className="font-bold text-[#C8102E]">
                  {produto.installments}x de {precoParcela(produto.price, produto.installments)} sem juros
                </span>{" "}
                no cartão
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {produto.freeShipping && (
                  <span className="flex items-center gap-1 text-green-600 text-[12px] font-bold">
                    <Truck size={13} /> FRETE GRÁTIS
                  </span>
                )}
                <span className={`text-[12px] font-bold ${produto.stock < 15 ? "text-red-500" : "text-gray-500"}`}>
                  {produto.stock <= 0
                    ? "Produto esgotado"
                    : produto.stock < 15
                    ? `Últimas ${produto.stock} unidades!`
                    : `${produto.stock} em estoque`}
                </span>
              </div>
            </div>

            {produto.stock <= 0 ? (
              <button
                disabled
                className="w-full bg-gray-200 text-gray-400 font-black py-4 rounded-xl text-base flex items-center justify-center gap-2 mb-3 cursor-not-allowed"
              >
                Produto Esgotado
              </button>
            ) : (
              <button
                onClick={() => aoAdicionarAoCarrinho(produto)}
                className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2 mb-3"
              >
                <ShoppingCart size={17} />
                Comprar
              </button>
            )}

            {/* Código de venda: credita a compra a um vendedor/recrutador/master */}
            <div className="mb-3">
              <CampoCodigoVenda codigo={codigoVenda} aoMudar={aoMudarCodigoVenda} nomeDono={nomeDonoCodigo} />
            </div>

            {/* Delivery options */}
            <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Truck size={16} className="text-[#C8102E]" />
                  <div>
                    <div className="text-[13px] font-bold text-gray-800">Receba amanhã</div>
                    <div className="text-[11px] text-gray-400">Para pagamentos confirmados hoje</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black">Grátis</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Package size={16} className="text-[#C8102E]" />
                  <div>
                    <div className="text-[13px] font-bold text-gray-800">Retire na loja a partir de 2 horas</div>
                    <div className="text-[11px] text-gray-400">Após aprovação da compra</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black">Grátis</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <RotateCcw size={16} className="text-[#C8102E]" />
                  <div>
                    <div className="text-[13px] font-bold text-gray-800">Devolução grátis</div>
                    <div className="text-[11px] text-gray-400">Até 30 dias após o recebimento</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black">Grátis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Características */}
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h2 className="text-lg font-black text-gray-900 mb-4">Principais características</h2>
          <ul className="space-y-2">
            {(produto.description
              ? produto.description.split("\n").filter(Boolean)
              : [
                  `Marca: ${produto.brand}`,
                  `Categoria: ${produto.category}`,
                  "Garantia de 12 meses",
                  produto.freeShipping ? "Frete grátis para todo o Brasil" : "Consulte o frete para sua região",
                ]
            ).map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] text-gray-700">
                <Check size={14} className="text-[#C8102E] mt-0.5 flex-shrink-0" strokeWidth={3} />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recommendations */}
      {recomendados.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-black text-gray-900 mb-4">Recomendados para você</h2>
          {grid(recomendados)}
        </section>
      )}

      {outrosProdutos.length > 0 && (
        <section className="mt-8 mb-4">
          <h2 className="text-lg font-black text-gray-900 mb-4">Mais produtos da loja</h2>
          {grid(outrosProdutos)}
        </section>
      )}
    </main>
  );
}

// ─── Trust Section ────────────────────────────────────────────────────────────

function SecaoConfianca() {
  const items = [
    { icon: <Shield size={26} />, title: "Compra Garantida", desc: "Devolução em até 30 dias" },
    { icon: <Truck size={26} />, title: "Entrega Rápida", desc: "Receba em casa ou na loja" },
    { icon: <CreditCard size={26} />, title: "12x Sem Juros", desc: "No cartão e parceiros" },
    { icon: <RotateCcw size={26} />, title: "Troca Fácil", desc: "Sem burocracia ou custo" },
  ];
  return (
    <section className="max-w-[1280px] mx-auto px-4 pb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.title} className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-gray-100 shadow-sm">
            <div className="text-[#C8102E] flex-shrink-0">{item.icon}</div>
            <div>
              <div className="font-bold text-[13px] text-gray-800">{item.title}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Store Footer ─────────────────────────────────────────────────────────────

function RodapeLoja() {
  return (
    <footer className="bg-[#4A1218] text-white mt-2">
      <div className="max-w-[1280px] mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Logo small />
            <p className="text-white/50 text-xs leading-relaxed mt-4">
              © 2026 Coração Presente LTDA.<br />
              CNPJ: 12.345.678/0001-90
            </p>
          </div>
          {[
            { title: "Institucional", links: ["Sobre Nós", "Trabalhe Conosco", "Imprensa", "Investidores"] },
            { title: "Atendimento", links: ["Central de Ajuda", "Trocas e Devoluções", "Rastrear Pedido", "Fale Conosco"] },
            { title: "Pagamento", links: ["Cartão de Crédito", "Boleto Bancário", "PIX", "Parcelamento"] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="font-black text-[#E8B84B] mb-4 text-sm">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-white/55 hover:text-white transition-colors text-xs">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 mt-8 pt-6 text-center text-[11px] text-white/30">
          Coração Presente · Todos os direitos reservados · 2026
        </div>
      </div>
    </footer>
  );
}

// ─── Cart Page ────────────────────────────────────────────────────────────────

function PaginaCarrinho({
  items,
  onRemove,
  aoMudarQtd,
  aoVoltar,
  aoFinalizarCompra,
  usuario,
  codigoVenda,
  aoMudarCodigoVenda,
  nomeDonoCodigo,
  config,
  cupom,
  aoMudarCupom,
  cupomAplicado,
}: {
  items: ItemCarrinho[];
  onRemove: (id: number) => void;
  aoMudarQtd: (id: number, variacao: number) => void;
  aoVoltar: () => void;
  aoFinalizarCompra: (dados: DadosPagamento) => void;
  usuario: Usuario | null;
  codigoVenda: string;
  aoMudarCodigoVenda: (v: string) => void;
  nomeDonoCodigo: string | null;
  config: ConfigLoja;
  cupom: string;
  aoMudarCupom: (v: string) => void;
  cupomAplicado: Cupom | null;
}) {
  const [formaPagamento, setFormaPagamento] = useState<"cartao" | "boleto" | "pix">("cartao");
  const [installments, setInstallments] = useState(12);
  const subtotal = items.reduce((acum, i) => acum + i.price * i.qty, 0);

  // ── Cálculo de frete: consulta o CEP na base dos Correios (via ViaCEP) ──
  // A loja entrega somente dentro do Paraná (UF = PR).
  // A mesma consulta traz rua e bairro para montar o endereço de entrega.
  const [cep, setCep] = useState("");
  const [freteInfo, setFreteInfo] = useState<{
    cidade: string;
    prazo: string;
    valor: number;
    logradouro: string;
    bairro: string;
  } | null>(null);
  const [freteErro, setFreteErro] = useState("");
  const [calculandoFrete, setCalculandoFrete] = useState(false);
  // Endereço de entrega: a rua vem do CEP (editável); número e complemento são do cliente
  const [ruaEndereco, setRuaEndereco] = useState("");
  const [numeroEndereco, setNumeroEndereco] = useState("");
  const [complementoEndereco, setComplementoEndereco] = useState("");
  const [erroCompra, setErroCompra] = useState("");

  const calcularFrete = async () => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      setFreteErro("Digite um CEP válido com 8 dígitos.");
      setFreteInfo(null);
      return;
    }
    setCalculandoFrete(true);
    setFreteErro("");
    try {
      // ViaCEP: serviço público e gratuito baseado na base de CEPs dos Correios
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        setFreteErro("CEP não encontrado. Confira e tente novamente.");
        setFreteInfo(null);
      } else if (dados.uf !== "PR") {
        // Fora do Paraná: entrega não disponível
        setFreteErro(`No momento entregamos apenas no Paraná (seu CEP é de ${dados.localidade} - ${dados.uf}).`);
        setFreteInfo(null);
      } else {
        // CEPs 80000-000 a 82999-999 = Curitiba (entrega mais rápida e barata)
        const capital = cepLimpo >= "80000000" && cepLimpo <= "82999999";
        setFreteInfo({
          cidade: `${dados.localidade} - PR`,
          prazo: capital ? "1 a 2 dias úteis" : "2 a 4 dias úteis",
          valor: subtotal >= config.freteGratisAcima ? 0 : capital ? config.freteCapital : config.freteInterior,
          // Rua e bairro vêm da própria consulta do CEP (ViaCEP)
          logradouro: dados.logradouro || "",
          bairro: dados.bairro || "",
        });
        setRuaEndereco(dados.logradouro || "");
      }
    } catch {
      setFreteErro("Falha ao consultar o CEP. Verifique sua internet e tente de novo.");
      setFreteInfo(null);
    }
    setCalculandoFrete(false);
  };

  // Frete: usa o valor calculado pelo CEP; sem CEP informado, regra padrão da loja
  const shipping = freteInfo ? freteInfo.valor : subtotal >= config.freteGratisAcima ? 0 : config.fretePadrao;
  // Desconto PIX definido produto a produto (soma item a item do carrinho)
  const pixDiscount =
    formaPagamento === "pix"
      ? items.reduce((acum, i) => acum + i.price * i.qty * ((i.pixDesconto ?? 0) / 100), 0)
      : 0;
  // Desconto do cupom (aplicado sobre o subtotal)
  const cupomDesconto = cupomAplicado ? subtotal * (cupomAplicado.percentual / 100) : 0;
  const total = Math.max(0, subtotal + shipping - pixDiscount - cupomDesconto);

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1280px] mx-auto flex items-center gap-4">
          <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            Continuar comprando
          </button>
          <div className="flex-1 flex justify-center">
            <Logo />
          </div>
          <div className="w-36" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="max-w-[1280px] mx-auto px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium">
          <button onClick={aoVoltar} className="hover:text-[#C8102E] transition-colors">Início</button>
          <ChevronRight size={13} />
          <span className="text-gray-800 font-semibold">Carrinho de Compras</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
          <ShoppingCart size={64} strokeWidth={1} className="mx-auto mb-5 text-gray-300" />
          <h2 className="text-2xl font-black text-gray-800 mb-2">Seu carrinho está vazio</h2>
          <p className="text-gray-500 mb-6">Adicione produtos e volte aqui para finalizar sua compra.</p>
          <button onClick={aoVoltar} className="bg-[#C8102E] text-white font-bold px-8 py-3 rounded-xl hover:bg-[#8C1626] transition-colors">
            Explorar Produtos
          </button>
        </div>
      ) : (
        <div className="max-w-[1280px] mx-auto px-4 pb-12">
          <div className="flex gap-6 flex-col lg:flex-row">
            {/* Items */}
            <div className="flex-1 space-y-3">
              <h2 className="text-lg font-black text-gray-900 mb-4">
                Meu Carrinho <span className="text-gray-400 font-semibold text-base">({items.length} {items.length === 1 ? "item" : "itens"})</span>
              </h2>

              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl p-4 flex gap-4 border border-gray-100 shadow-sm">
                  <div className="w-24 h-24 bg-gray-50 rounded-xl flex items-center justify-center p-2 flex-shrink-0">
                    <ImagemProduto src={item.image} alt={item.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{item.brand}</p>
                        <p className="text-sm text-gray-800 font-semibold leading-snug mt-0.5 line-clamp-2">{item.name}</p>
                      </div>
                      <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 p-1 transition-colors flex-shrink-0">
                        <X size={16} />
                      </button>
                    </div>
                    {item.freeShipping && (
                      <div className="flex items-center gap-1 text-green-600 text-[11px] font-bold mt-1.5">
                        <Truck size={11} /> FRETE GRÁTIS
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                      <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                        <button onClick={() => aoMudarQtd(item.id, -1)} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm font-black shadow-sm hover:shadow transition-shadow">-</button>
                        <span className="w-7 text-center text-sm font-black">{item.qty}</span>
                        <button onClick={() => aoMudarQtd(item.id, 1)} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm font-black shadow-sm hover:shadow transition-shadow">+</button>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-gray-400">
                          {item.qty > 1 && `${item.qty}x ${formatarMoeda(item.price)}`}
                        </div>
                        <div className="text-lg font-black text-gray-900">{formatarMoeda(item.price * item.qty)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Cálculo de frete pelo CEP (somente Paraná) */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={16} className="text-[#C8102E]" />
                  <span className="text-[13px] font-bold text-gray-700">Calcular prazo de entrega</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">Entregamos em todo o estado do Paraná</p>
                <div className="flex gap-2">
                  <input
                    value={cep}
                    onChange={(e) => {
                      // Máscara automática: 00000-000
                      const numeros = e.target.value.replace(/\D/g, "").slice(0, 8);
                      setCep(numeros.length > 5 ? `${numeros.slice(0, 5)}-${numeros.slice(5)}` : numeros);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") calcularFrete(); }}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                    placeholder="Digite seu CEP"
                    inputMode="numeric"
                    maxLength={9}
                  />
                  <button
                    onClick={calcularFrete}
                    disabled={calculandoFrete}
                    className="bg-[#C8102E] text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#8C1626] disabled:opacity-70 transition-colors flex items-center gap-2"
                  >
                    {calculandoFrete ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "Calcular"
                    )}
                  </button>
                </div>

                {/* Resultado da consulta */}
                {freteErro && (
                  <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                    {freteErro}
                  </div>
                )}
                {freteInfo && (
                  <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-[12px] font-bold text-emerald-800">{freteInfo.cidade}</div>
                      <div className="text-[11px] text-emerald-600">Entrega em {freteInfo.prazo}</div>
                    </div>
                    <span className="text-[13px] font-black text-emerald-700">
                      {freteInfo.valor === 0 ? "FRETE GRÁTIS" : formatarMoeda(freteInfo.valor)}
                    </span>
                  </div>
                )}

                {/* Endereço de entrega: rua preenchida pelo CEP; cliente completa número */}
                {freteInfo && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[12px] font-bold text-gray-700">Endereço de entrega</p>
                    <input
                      value={ruaEndereco}
                      onChange={(e) => setRuaEndereco(e.target.value)}
                      placeholder="Rua / Avenida"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                    />
                    <div className="flex gap-2">
                      <input
                        value={numeroEndereco}
                        onChange={(e) => setNumeroEndereco(e.target.value)}
                        placeholder="Número"
                        className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                      />
                      <input
                        value={complementoEndereco}
                        onChange={(e) => setComplementoEndereco(e.target.value)}
                        placeholder="Complemento (opcional)"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                      />
                    </div>
                    {freteInfo.bairro && (
                      <p className="text-[11px] text-gray-400">Bairro: {freteInfo.bairro}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Código de venda: credita esta compra a um vendedor/recrutador/master */}
              <CampoCodigoVenda codigo={codigoVenda} aoMudar={aoMudarCodigoVenda} nomeDono={nomeDonoCodigo} />
            </div>

            {/* Pedido Summary */}
            <div className="lg:w-[360px] flex-shrink-0">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-20">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 text-base">Resumo do Pedido</h3>
                </div>

                {/* Payment method */}
                <div className="p-5 border-b border-gray-100">
                  <p className="text-[12px] font-bold text-gray-500 mb-3 uppercase tracking-wide">Forma de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["cartao", "boleto", "pix"] as const).map((m) => {
                      const labels = { cartao: "Cartão", boleto: "Boleto", pix: "PIX" };
                      const icons = { cartao: <CreditCard size={16} />, boleto: <FileText size={16} />, pix: <Zap size={16} /> };
                      return (
                        <button
                          key={m}
                          onClick={() => setFormaPagamento(m)}
                          className={`py-2.5 rounded-xl text-[12px] font-bold border-2 transition-all flex flex-col items-center gap-0.5 ${
                            formaPagamento === m
                              ? "border-[#C8102E] bg-red-50 text-[#C8102E]"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {icons[m]}
                          {labels[m]}
                        </button>
                      );
                    })}
                  </div>

                  {formaPagamento === "cartao" && (
                    <div className="mt-3">
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Parcelamento</label>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#C8102E] transition-colors"
                      >
                        {[1, 2, 3, 6, 10, 12].map((n) => (
                          <option key={n} value={n}>
                            {n}x de {precoParcela(subtotal, n)} {n <= 12 ? "sem juros" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formaPagamento === "pix" && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-emerald-700 text-[12px] font-medium">
                        {pixDiscount > 0
                          ? "Desconto PIX dos produtos aplicado no total"
                          : "Aprovação imediata pagando com PIX"}
                      </span>
                    </div>
                  )}

                  {formaPagamento === "boleto" && (
                    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <span className="text-gray-600 text-[12px] font-medium">Vencimento em 3 dias úteis após a emissão</span>
                    </div>
                  )}
                </div>

                {/* Cupom de desconto */}
                <div className="p-5 border-b border-gray-100">
                  <p className="text-[12px] font-bold text-gray-500 mb-2 uppercase tracking-wide">Cupom de desconto</p>
                  <input
                    value={cupom}
                    onChange={(e) => aoMudarCupom(e.target.value.toUpperCase())}
                    placeholder="Tem um cupom? Digite aqui"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
                  />
                  {cupom.trim().length > 0 && cupomAplicado && (
                    <div className="mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold px-3 py-2 rounded-lg">
                      Cupom {cupomAplicado.codigo} aplicado: {cupomAplicado.percentual}% de desconto
                    </div>
                  )}
                  {cupom.trim().length > 0 && !cupomAplicado && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium px-3 py-2 rounded-lg">
                      Cupom inválido ou expirado.
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="p-5 space-y-2.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-600">Subtotal ({items.reduce((a, i) => a + i.qty, 0)} itens)</span>
                    <span className="font-semibold text-gray-800">{formatarMoeda(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-600">Frete</span>
                    <span className={`font-semibold ${shipping === 0 ? "text-green-600" : "text-gray-800"}`}>
                      {shipping === 0 ? "GRÁTIS" : formatarMoeda(shipping)}
                    </span>
                  </div>
                  {pixDiscount > 0 && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-emerald-600 font-semibold">Desconto PIX</span>
                      <span className="font-bold text-emerald-600">-{formatarMoeda(pixDiscount)}</span>
                    </div>
                  )}
                  {cupomDesconto > 0 && cupomAplicado && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-emerald-600 font-semibold">Cupom {cupomAplicado.codigo} ({cupomAplicado.percentual}%)</span>
                      <span className="font-bold text-emerald-600">-{formatarMoeda(cupomDesconto)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                    <span className="font-black text-gray-900">Total</span>
                    <div className="text-right">
                      <div className="text-2xl font-black text-gray-900">{formatarMoeda(total)}</div>
                      {formaPagamento === "cartao" && (
                        <div className="text-[11px] text-gray-500">
                          ou {installments}x de {precoParcela(total, installments)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <button
                    onClick={() => {
                      // Endereço de entrega é obrigatório para fechar a compra
                      if (!freteInfo) {
                        setErroCompra("Informe seu CEP em \"Calcular prazo de entrega\" para preencher o endereço.");
                        return;
                      }
                      if (!ruaEndereco.trim()) {
                        setErroCompra("Informe a rua do endereço de entrega.");
                        return;
                      }
                      if (!numeroEndereco.trim()) {
                        setErroCompra("Informe o número do endereço de entrega.");
                        return;
                      }
                      setErroCompra("");
                      const complemento = complementoEndereco.trim() ? ` - ${complementoEndereco.trim()}` : "";
                      const bairro = freteInfo.bairro ? `, ${freteInfo.bairro}` : "";
                      aoFinalizarCompra({
                        metodo: formaPagamento,
                        total,
                        parcelas: formaPagamento === "cartao" ? installments : 1,
                        endereco: `${ruaEndereco.trim()}, ${numeroEndereco.trim()}${complemento}${bairro} — ${freteInfo.cidade} · CEP ${cep}`,
                      });
                    }}
                    className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
                  >
                    <Shield size={16} />
                    Finalizar Compra
                  </button>
                  {erroCompra && (
                    <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                      {erroCompra}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-[11px] text-gray-400">
                    <Lock size={11} />
                    <span>Compra 100% segura e protegida</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tela de Pagamento PIX ─────────────────────────────────────────────────────

// CRC16-CCITT exigido pelo padrão BR Code do Banco Central (último campo do PIX)
function crc16Pix(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Monta um campo EMV do BR Code: id + tamanho (2 dígitos) + valor
function campoPix(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

// Gera o código PIX "copia e cola" (BR Code) com o valor da compra e um
// identificador de transação — é este texto que também vira o QR Code.
// A chave PIX vem das Configurações da loja (painel Admin).
function gerarPayloadPix(valor: number, txid: string, chavePix: string) {
  const contaComerciante = campoPix("00", "br.gov.bcb.pix") + campoPix("01", chavePix);
  const semCRC =
    campoPix("00", "01") +
    campoPix("26", contaComerciante) +
    campoPix("52", "0000") +
    campoPix("53", "986") +
    campoPix("54", valor.toFixed(2)) +
    campoPix("58", "BR") +
    campoPix("59", "CORACAO PRESENTE") +
    campoPix("60", "CURITIBA") +
    campoPix("62", campoPix("05", txid)) +
    "6304";
  return semCRC + crc16Pix(semCRC);
}

// O código PIX expira em 30 minutos
const VALIDADE_PIX_MS = 30 * 60 * 1000;

// Endereço do backend de cobranças PIX (pasta backend/ do projeto).
// Com o backend ligado, o QR é a cobrança OFICIAL do Sicredi e o pedido é
// confirmado sozinho quando o cliente paga. Desligado, o site usa o QR
// estático com a chave PIX das Configurações (confirmação manual).
// Em produção, troque para o endereço público do seu servidor.
const URL_BACKEND_PIX = "http://localhost:3333";

// Página do pagamento PIX: QR Code + código copia e cola com expiração de 30 min
function TelaPix({
  total,
  aoConfirmar,
  aoVoltar,
  chavePix,
}: {
  total: number;
  aoConfirmar: () => void;
  aoVoltar: () => void;
  chavePix: string;
}) {
  // Identificador da transação (muda quando um novo código é gerado)
  const [txid, setTxid] = useState(() => `CP${String(Date.now()).slice(-10)}`);
  const [expiraEm, setExpiraEm] = useState(() => Date.now() + VALIDADE_PIX_MS);
  const [agora, setAgora] = useState(Date.now());
  const [copiado, setCopiado] = useState(false);
  // Cobrança oficial criada pelo backend Sicredi (null = usa o QR estático)
  const [payloadBackend, setPayloadBackend] = useState<string | null>(null);
  const [txidBackend, setTxidBackend] = useState<string | null>(null);

  // Tenta criar a cobrança oficial no backend; sem backend, segue no modo estático
  useEffect(() => {
    if (!URL_BACKEND_PIX) return;
    let cancelado = false;
    fetch(`${URL_BACKEND_PIX}/api/pix/cobranca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor: total }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (!cancelado && dados?.pixCopiaECola) {
          setPayloadBackend(dados.pixCopiaECola);
          setTxidBackend(dados.txid ?? null);
        }
      })
      .catch(() => {}); // backend desligado: sem problema, usa o QR estático
    return () => { cancelado = true; };
  }, [txid, total]);

  // Com a cobrança oficial: verifica a cada 5s se o PIX caiu e confirma sozinho
  useEffect(() => {
    if (!txidBackend) return;
    const t = setInterval(() => {
      fetch(`${URL_BACKEND_PIX}/api/pix/cobranca/${txidBackend}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((dados) => {
          if (dados?.status === "CONCLUIDA") aoConfirmar();
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [txidBackend]);

  // Relógio da contagem regressiva (atualiza a cada segundo)
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restanteMs = Math.max(0, expiraEm - agora);
  const expirado = restanteMs <= 0;
  const acabando = !expirado && restanteMs < 5 * 60 * 1000; // últimos 5 minutos
  const minutos = String(Math.floor(restanteMs / 60000)).padStart(2, "0");
  const segundos = String(Math.floor((restanteMs % 60000) / 1000)).padStart(2, "0");

  // Usa a cobrança oficial do Sicredi quando o backend responde;
  // sem backend, gera o código estático com a chave PIX das Configurações
  const payload = payloadBackend ?? gerarPayloadPix(total, txid, chavePix);
  const urlQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(payload)}`;

  const copiarCodigo = () => {
    navigator.clipboard?.writeText(payload).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // Gera um novo código PIX com mais 30 minutos de validade
  const gerarNovoCodigo = () => {
    setPayloadBackend(null); // descarta a cobrança antiga (uma nova será criada)
    setTxidBackend(null);
    setTxid(`CP${String(Date.now()).slice(-10)}`);
    setExpiraEm(Date.now() + VALIDADE_PIX_MS);
  };

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1280px] mx-auto flex items-center gap-4">
          <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            Voltar ao carrinho
          </button>
          <div className="flex-1 flex justify-center">
            <Logo />
          </div>
          <div className="w-36" />
        </div>
      </div>

      <div className="max-w-[520px] mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="mb-2 flex justify-center"><Zap size={36} className="text-[#C8102E]" /></div>
            <h2 className="text-xl font-black text-gray-900">Pague com PIX</h2>
            <p className="text-[13px] text-gray-500 mt-1">
              Escaneie o QR Code ou copie o código abaixo no app do seu banco
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-2xl font-black text-gray-900">{formatarMoeda(total)}</span>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Contagem regressiva de expiração */}
            <div
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold ${
                expirado
                  ? "bg-red-50 border border-red-200 text-red-600"
                  : acabando
                  ? "bg-amber-50 border border-amber-200 text-amber-700"
                  : "bg-gray-50 border border-gray-200 text-gray-600"
              }`}
            >
              {expirado ? "Código expirado" : <>Este código expira em <span className="font-mono font-black">{minutos}:{segundos}</span></>}
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              {expirado ? (
                <div className="w-[240px] h-[240px] rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 text-center p-4">
                  <RotateCcw size={28} className="text-gray-300" />
                  <p className="text-[13px] text-gray-500 font-semibold">
                    O tempo de pagamento acabou.<br />Gere um novo código para continuar.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
                  <img
                    src={urlQrCode}
                    alt="QR Code PIX"
                    width={240}
                    height={240}
                    className="rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Código copia e cola */}
            {!expirado && (
              <div>
                <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">PIX copia e cola</p>
                <div className="flex gap-2">
                  <div className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 font-mono text-[11px] text-gray-600 truncate bg-gray-50">
                    {payload}
                  </div>
                  <button
                    onClick={copiarCodigo}
                    className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-bold text-[13px] px-4 py-2.5 rounded-xl transition-colors flex-shrink-0"
                  >
                    {copiado ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            {/* Passo a passo */}
            {!expirado && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                {[
                  "Abra o app do seu banco e escolha pagar com PIX",
                  "Escaneie o QR Code ou cole o código copia e cola",
                  "Confira o valor e confirme — a aprovação é imediata",
                ].map((passo, i) => (
                  <div key={passo} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-[12px] text-gray-600 font-medium">{passo}</span>
                  </div>
                ))}
              </div>
            )}

            {expirado ? (
              <button
                onClick={gerarNovoCodigo}
                className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
              >
                <RotateCcw size={17} />
                Gerar novo código PIX
              </button>
            ) : (
              <button
                onClick={aoConfirmar}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Já fiz o pagamento
              </button>
            )}
            <button
              onClick={aoVoltar}
              className="w-full border-2 border-gray-200 text-gray-600 hover:border-gray-300 font-bold py-3 rounded-xl transition-colors text-sm"
            >
              Voltar ao carrinho
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-gray-400">
              <Lock size={11} />
              <span>Pagamento 100% seguro e protegido</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tela de Pagamento ─────────────────────────────────────────────────────────

// Mostra o resumo do pagamento escolhido e pede a confirmação final
function TelaPagamento({
  dados,
  aoConfirmar,
  aoVoltar,
}: {
  dados: DadosPagamento;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  const rotulos = { cartao: "Cartão de Crédito", boleto: "Boleto Bancário", pix: "PIX" } as const;
  const icones = { cartao: <CreditCard size={36} />, boleto: <FileText size={36} />, pix: <Zap size={36} /> };
  const descricoes = {
    cartao: `${dados.parcelas}x de ${precoParcela(dados.total, dados.parcelas)} sem juros`,
    boleto: "Vencimento em 3 dias úteis após a emissão",
    pix: "Aprovação imediata",
  } as const;

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1280px] mx-auto flex items-center gap-4">
          <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            Voltar ao carrinho
          </button>
          <div className="flex-1 flex justify-center">
            <Logo />
          </div>
          <div className="w-36" />
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="mb-2 flex justify-center text-[#C8102E]">{icones[dados.metodo]}</div>
            <h2 className="text-xl font-black text-gray-900">Pagamento via {rotulos[dados.metodo]}</h2>
            <p className="text-[13px] text-gray-500 mt-1">{descricoes[dados.metodo]}</p>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-semibold">Total a pagar</span>
              <span className="text-2xl font-black text-gray-900">{formatarMoeda(dados.total)}</span>
            </div>

            <button
              onClick={aoConfirmar}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Confirmar Pagamento
            </button>
            <button
              onClick={aoVoltar}
              className="w-full border-2 border-gray-200 text-gray-600 hover:border-gray-300 font-bold py-3 rounded-xl transition-colors text-sm"
            >
              Voltar ao carrinho
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-gray-400">
              <Lock size={11} />
              <span>Pagamento 100% seguro e protegido</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pedido Success ────────────────────────────────────────────────────────────

function TelaCompraConcluida({ total, aoContinuar }: { total: number; aoContinuar: () => void }) {
  return (
    <div className="min-h-screen bg-[#FBF4EA] flex items-center justify-center p-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check size={32} className="text-emerald-600" strokeWidth={3} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Compra realizada!</h2>
        <p className="text-gray-500 text-sm mb-1">Seu pedido foi registrado com sucesso.</p>
        <div className="text-3xl font-black text-gray-900 my-4">{formatarMoeda(total)}</div>
        <p className="text-[12px] text-gray-400 mb-6">Você receberá as atualizações do pedido por e-mail.</p>
        <button
          onClick={aoContinuar}
          className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3.5 rounded-xl transition-colors"
        >
          Continuar Comprando
        </button>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function PainelAdmin({
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
  aoRecrutar,
  codigoVenda,
  comissaoPct = 0.02,
  cupons = [],
  aoSalvarCupom,
  aoExcluirCupom,
  config,
  aoSalvarConfig,
  bancoOffline = false,
}: {
  modo?: "admin" | "master" | "recrutador" | "vendedor";
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
  aoRecrutar?: (nome: string, email: string) => string | null;
  // Código de venda pessoal da conta logada (mostrado no topo do painel)
  codigoVenda?: string;
  // Comissão do recrutador em fração (ex.: 0.02 = 2%)
  comissaoPct?: number;
  cupons?: Cupom[];
  aoSalvarCupom?: (c: Cupom) => void;
  aoExcluirCupom?: (codigo: string) => void;
  config?: ConfigLoja;
  aoSalvarConfig?: (c: ConfigLoja) => void;
  // true = banco de dados (XAMPP) fora do ar — mostra o aviso no painel
  bancoOffline?: boolean;
}) {
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [notifAberta, setNotifAberta] = useState(false);
  const [notifVistas, setNotifVistas] = useState<number>(() => lerArmazenamento<number>("cp_notif_seen", 0));

  const notificacoes = [
    ...alertasEstoque.slice(0, 5).map((a) => ({
      icon: <Package size={18} className="text-red-500" />,
      title: "Produto esgotado!",
      desc: `${a.name} — reponha o estoque`,
      date: a.date,
    })),
    ...pedidos.slice(0, 8).map((o) => ({
      icon: <ShoppingCart size={18} className="text-[#C8102E]" />,
      title: `Novo pedido ${o.id}`,
      desc: `${o.customer} · ${formatarMoeda(o.total)}`,
      date: o.date,
    })),
  ];
  const totalEventos = pedidos.length + alertasEstoque.length;
  const naoLidas = Math.max(0, totalEventos - notifVistas);

  const alternarNotificacoes = () => {
    setNotifAberta((v) => !v);
    setNotifVistas(totalEventos);
    localStorage.setItem("cp_notif_seen", JSON.stringify(totalEventos));
  };
  // Menu lateral muda conforme o modo do painel:
  // Admin: tudo · Master: SEM Produtos, COM Equipe · Recrutador: vendedores e
  // comissões (sem produtos — vendedor não recruta e recrutador não vende) ·
  // Vendedor: apenas os próprios produtos e vendas
  const menusPorModo: Record<string, { id: string; label: string; icon: React.ReactNode }[]> = {
    admin: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
      { id: "produtos", label: "Produtos", icon: <Package size={17} /> },
      { id: "pedidos", label: "Pedidos", icon: <ShoppingBag size={17} /> },
      { id: "financeiro", label: "Financeiro", icon: <TrendingUp size={17} /> },
      { id: "estoque", label: "Estoque", icon: <Package size={17} /> },
      { id: "cupons", label: "Cupons", icon: <Tag size={17} /> },
      // Supervisão: só o Admin enxerga todos os recrutadores e vendedores
      { id: "supervisao", label: "Supervisão", icon: <Users size={17} /> },
      { id: "config", label: "Configurações", icon: <Settings size={17} /> },
    ],
    master: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
      { id: "pedidos", label: "Pedidos", icon: <ShoppingBag size={17} /> },
      { id: "equipe", label: "Equipe & Cargos", icon: <Users size={17} /> },
    ],
    recrutador: [
      { id: "vendedores", label: "Meus Vendedores", icon: <Users size={17} /> },
      { id: "comissoes", label: "Comissões", icon: <TrendingUp size={17} /> },
    ],
    vendedor: [
      { id: "produtos", label: "Meus Produtos", icon: <Package size={17} /> },
      { id: "pedidos", label: "Minhas Vendas", icon: <ShoppingBag size={17} /> },
    ],
  };
  const itensMenu = menusPorModo[modo];

  const rotulosPainel: Record<string, string> = {
    admin: "Admin Panel",
    master: "Master Panel",
    recrutador: "Painel do Recrutador",
    vendedor: "Painel do Vendedor",
  };

  const titulosPaginas: Record<string, string> = {
    dashboard: "Dashboard",
    produtos: modo === "vendedor" ? "Meus Produtos" : "Gestão de Produtos",
    pedidos: modo === "vendedor" ? "Minhas Vendas" : "Pedidos",
    equipe: "Equipe & Cargos",
    vendedores: "Meus Vendedores",
    comissoes: "Comissões",
    supervisao: "Supervisão de Recrutadores e Vendedores",
    financeiro: "Financeiro",
    estoque: "Controle de Estoque",
    cupons: "Cupons de Desconto",
    config: "Configurações da Loja",
  };

  // Vendas do mês para o cartão de nível — o sistema de progressão aparece
  // SOMENTE nos painéis de recrutador e vendedor (não no Admin nem no Master)
  const mesAtualNivel = NOMES_MESES[new Date().getMonth()];
  let vendasDoMesNivel = 0;
  if (modo === "vendedor") {
    // O painel do vendedor já recebe apenas os pedidos dele
    vendasDoMesNivel = pedidos
      .filter((o) => o.status !== "Cancelado" && o.month === mesAtualNivel)
      .reduce((acum, o) => acum + o.total, 0);
  } else if (modo === "recrutador" && usuario) {
    // Recrutador: vendas do mês da equipe dele + as com o próprio código
    const emailRecrutador = usuario.email.toLowerCase();
    const equipeAtiva = recrutamentos
      .filter((r) => r.recrutador === emailRecrutador && r.ativado)
      .map((r) => r.email.toLowerCase());
    vendasDoMesNivel = pedidos
      .filter(
        (o) =>
          o.status !== "Cancelado" &&
          o.month === mesAtualNivel &&
          o.vendedor &&
          (equipeAtiva.includes(o.vendedor.toLowerCase()) ||
            o.vendedor.toLowerCase() === emailRecrutador)
      )
      .reduce((acum, o) => acum + o.total, 0);
  }

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
          {/* Progressão de nível: só para recrutadores e vendedores */}
          {(modo === "recrutador" || modo === "vendedor") && (
            <div className="mb-5">
              <CartaoNivelVendedor vendasDoMes={vendasDoMesNivel} />
            </div>
          )}
          {pagina === "dashboard" && <PaginaDashboard pedidos={pedidos} clientes={clientes} aoVerTodosPedidos={() => setPagina("pedidos")} />}
          {pagina === "produtos" && modo !== "master" && modo !== "recrutador" && (
            <PaginaProdutosAdmin produtos={produtos} aoSalvar={aoSalvarProduto} aoExcluir={aoExcluirProduto} />
          )}
          {pagina === "pedidos" && <PaginaPedidosAdmin pedidos={pedidos} aoAtualizarStatus={aoAtualizarStatusPedido} />}
          {pagina === "equipe" && modo === "master" && cargos && aoDefinirCargo && (
            <PaginaEquipeMaster
              clientes={clientes}
              cargos={cargos}
              aoDefinirCargo={aoDefinirCargo}
              recrutamentos={recrutamentos}
            />
          )}
          {pagina === "vendedores" && modo === "recrutador" && usuario && aoRecrutar && (
            <PaginaVendedoresRecrutador
              emailRecrutador={usuario.email}
              recrutamentos={recrutamentos}
              aoRecrutar={aoRecrutar}
            />
          )}
          {pagina === "comissoes" && modo === "recrutador" && usuario && (
            <PaginaComissoesRecrutador
              emailRecrutador={usuario.email}
              recrutamentos={recrutamentos}
              pedidos={pedidos}
              comissao={comissaoPct}
            />
          )}
          {pagina === "supervisao" && modo === "admin" && cargos && (
            <PaginaSupervisaoAdmin
              pedidos={pedidos}
              produtos={produtos}
              clientes={clientes}
              cargos={cargos}
              recrutamentos={recrutamentos}
              comissao={comissaoPct}
            />
          )}
          {pagina === "financeiro" && modo === "admin" && cargos && (
            <PaginaFinanceiroAdmin
              pedidos={pedidos}
              cargos={cargos}
              recrutamentos={recrutamentos}
              clientes={clientes}
              comissao={comissaoPct}
            />
          )}
          {pagina === "estoque" && modo === "admin" && (
            <PaginaEstoqueAdmin produtos={produtos} />
          )}
          {pagina === "cupons" && modo === "admin" && aoSalvarCupom && aoExcluirCupom && (
            <PaginaCuponsAdmin cupons={cupons} aoSalvar={aoSalvarCupom} aoExcluir={aoExcluirCupom} />
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

// ─── Página Equipe & Cargos (Master) ──────────────────────────────────────────

// O Master dá ou remove os cargos de recrutador e vendedor dos usuários
// cadastrados e acompanha os vínculos de recrutamento da loja.
function PaginaEquipeMaster({
  clientes,
  cargos,
  aoDefinirCargo,
  recrutamentos,
}: {
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
  recrutamentos: Recrutamento[];
}) {
  // Dar cargo direto por e-mail (necessário para criar o primeiro recrutador,
  // já que a lista abaixo só mostra quem entrou com código de vendedor)
  const [emailCargo, setEmailCargo] = useState("");

  const darCargoPorEmail = (cargo: Cargo) => {
    const chave = emailCargo.trim().toLowerCase();
    if (!chave || chave === EMAIL_ADMIN || chave === EMAIL_MASTER) return;
    aoDefinirCargo(chave, cargo);
    setEmailCargo("");
  };

  const totalRecrutadores = Object.values(cargos).filter((c) => c === "recrutador").length;
  const totalVendedores = Object.values(cargos).filter((c) => c === "vendedor").length;
  const vinculosAtivos = recrutamentos.filter((r) => r.ativado).length;

  // Na lista de cargos aparecem SOMENTE as pessoas que se cadastraram
  // com um código de vendedor válido (vínculo ativado pelo código)
  const emailsAtivados = new Set(
    recrutamentos.filter((r) => r.ativado).map((r) => r.email.toLowerCase())
  );
  const usuariosDaEquipe = clientes.filter((c) => emailsAtivados.has(c.email.toLowerCase()));

  const cartoes = [
    { label: "Recrutadores", valor: totalRecrutadores, icone: <Users size={22} className="text-[#C8102E]" /> },
    { label: "Vendedores", valor: totalVendedores, icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
    { label: "Vínculos ativos", valor: vinculosAtivos, icone: <Check size={22} className="text-emerald-600" /> },
  ];

  const opcoesCargo: { valor: Cargo | null; label: string }[] = [
    { valor: "recrutador", label: "Recrutador" },
    { valor: "vendedor", label: "Vendedor" },
    { valor: null, label: "Sem cargo" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div>
              <div className="text-xl font-black text-gray-900">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Dar cargo por e-mail</h3>
        <p className="text-[12px] text-gray-400 mb-3">
          Dá o cargo diretamente a qualquer conta — use para nomear os seus recrutadores.
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={emailCargo}
            onChange={(e) => setEmailCargo(e.target.value)}
            placeholder="E-mail da conta"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={() => darCargoPorEmail("recrutador")}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-5 py-3 rounded-xl transition-colors text-sm"
          >
            Tornar Recrutador
          </button>
          <button
            onClick={() => darCargoPorEmail("vendedor")}
            className="border-2 border-[#C8102E] text-[#C8102E] hover:bg-red-50 font-black px-5 py-3 rounded-xl transition-colors text-sm"
          >
            Tornar Vendedor
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Usuários e cargos</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Somente quem se cadastrou com um código de vendedor válido aparece aqui. Recrutador cadastra vendedores e ganha 2% sobre as vendas deles. Vendedor gerencia os próprios produtos e não pode recrutar.
          </p>
        </div>
        {usuariosDaEquipe.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Ninguém se cadastrou com código de vendedor ainda — quem ativar a conta com um código válido aparecerá aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Usuário</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Desde</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Cargo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usuariosDaEquipe.map((c) => {
                  const cargoAtual = cargos[c.email.toLowerCase()] ?? null;
                  return (
                    <tr key={c.email} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                            {c.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-800 truncate">{c.name}</div>
                            <div className="text-[11px] text-gray-400 truncate">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[12px] text-gray-400 hidden md:table-cell">{c.since}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {opcoesCargo.map((op) => (
                            <button
                              key={op.label}
                              onClick={() => aoDefinirCargo(c.email, op.valor)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all ${
                                cargoAtual === op.valor
                                  ? "border-[#C8102E] bg-red-50 text-[#C8102E]"
                                  : "border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}
                            >
                              {op.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Vínculos de recrutamento</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Vendedores cadastrados pelos recrutadores e o status da ativação por código.</p>
        </div>
        {recrutamentos.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">
            Nenhum vínculo ainda — os recrutamentos aparecerão aqui.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recrutamentos.map((r) => (
              <div key={r.codigo} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800">
                    {r.nome} <span className="text-gray-400 font-medium">({r.email})</span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Recrutado por {r.recrutador} · {r.date} · Código <span className="font-mono font-bold">{r.codigo}</span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                    r.ativado ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {r.ativado ? "ATIVO" : "PENDENTE"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página Meus Vendedores (Recrutador) ──────────────────────────────────────

// O recrutador cadastra vendedores (nome + e-mail) e entrega o código gerado
// para que eles ativem a conta. Vendedores NÃO têm acesso a esta página.
function PaginaVendedoresRecrutador({
  emailRecrutador,
  recrutamentos,
  aoRecrutar,
}: {
  emailRecrutador: string;
  recrutamentos: Recrutamento[];
  aoRecrutar: (nome: string, email: string) => string | null;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState("");

  const meusVendedores = recrutamentos.filter(
    (r) => r.recrutador === emailRecrutador.toLowerCase()
  );

  const cadastrar = () => {
    const resultado = aoRecrutar(nome, email);
    if (resultado) { setErro(resultado); return; }
    setErro("");
    setNome("");
    setEmail("");
  };

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCopiado(codigo);
    setTimeout(() => setCopiado(""), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Cadastrar novo vendedor</h3>
        <p className="text-[12px] text-gray-400 mb-4">
          Informe os dados do vendedor. Um código será gerado — entregue-o à pessoa para que ela
          ative a conta ao se cadastrar na loja. Você ganha 2% sobre cada venda dela.
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do vendedor"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail do vendedor"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={cadastrar}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            Cadastrar
          </button>
        </div>
        {erro && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erro}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Vendedores recrutados ({meusVendedores.length})</h3>
        </div>
        {meusVendedores.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Você ainda não recrutou ninguém. Cadastre um vendedor acima para gerar o código.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {meusVendedores.map((r) => (
              <div key={r.codigo} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                    {r.nome[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate">{r.nome}</div>
                    <div className="text-[11px] text-gray-400 truncate">{r.email} · {r.date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copiarCodigo(r.codigo)}
                    title="Copiar código"
                    className="font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    {copiado === r.codigo ? "Copiado!" : r.codigo}
                  </button>
                  <span
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                      r.ativado ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {r.ativado ? "ATIVO" : "PENDENTE"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página Comissões (Recrutador) ────────────────────────────────────────────

// Mostra os 2% que o recrutador ganha sobre cada venda dos seus vendedores
// ativos. Pedidos cancelados não geram comissão.
function PaginaComissoesRecrutador({
  emailRecrutador,
  recrutamentos,
  pedidos,
  comissao,
}: {
  emailRecrutador: string;
  recrutamentos: Recrutamento[];
  pedidos: Pedido[];
  comissao: number; // fração (ex.: 0.02 = 2%)
}) {
  const meusAtivos = recrutamentos.filter(
    (r) => r.recrutador === emailRecrutador.toLowerCase() && r.ativado
  );
  const emailsAtivos = meusAtivos.map((r) => r.email.toLowerCase());
  const nomePorEmail: Record<string, string> = {};
  meusAtivos.forEach((r) => { nomePorEmail[r.email.toLowerCase()] = r.nome; });

  const vendas = pedidos.filter(
    (o) => o.vendedor && emailsAtivos.includes(o.vendedor.toLowerCase()) && o.status !== "Cancelado"
  );
  const totalVendido = vendas.reduce((acum, o) => acum + o.total, 0);
  const totalComissao = totalVendido * comissao;

  // Vendas creditadas diretamente a esta conta pelo código de venda
  const vendasComCodigo = pedidos.filter(
    (o) => o.vendedor?.toLowerCase() === emailRecrutador.toLowerCase() && o.status !== "Cancelado"
  );
  const totalComCodigo = vendasComCodigo.reduce((acum, o) => acum + o.total, 0);

  const cartoes = [
    { label: `Comissão acumulada (${comissao * 100}%)`, valor: formatarMoeda(totalComissao), icone: <TrendingUp size={22} className="text-emerald-600" /> },
    { label: "Total vendido pela equipe", valor: formatarMoeda(totalVendido), icone: <TrendingUp size={22} className="text-[#C8102E]" /> },
    { label: "Vendas com seu código", valor: formatarMoeda(totalComCodigo), icone: <Tag size={22} className="text-[#C8102E]" /> },
    { label: "Vendedores ativos", valor: String(meusAtivos.length), icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div>
              <div className="text-lg font-black text-gray-900">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Vendas da sua equipe</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Você ganha {comissao * 100}% sobre cada venda dos vendedores que recrutou. Cancelamentos não contam.</p>
        </div>
        {vendas.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhuma venda da sua equipe ainda — as comissões aparecerão aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Pedido</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Vendedor</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Data</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Venda</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Sua comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendas.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">
                      {nomePorEmail[o.vendedor!.toLowerCase()] ?? o.vendedor}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-gray-400 hidden md:table-cell">{o.date}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">{formatarMoeda(o.total)}</td>
                    <td className="px-5 py-4 font-black text-emerald-600">
                      +{formatarMoeda(o.total * comissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Vendas com o seu código de venda</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Compras em que o cliente informou o seu código — creditadas somente à sua conta.
          </p>
        </div>
        {vendasComCodigo.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">
            Nenhuma venda com o seu código ainda. Compartilhe o código que aparece no topo do painel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Pedido</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Cliente</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Data</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendasComCodigo.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">{o.customer}</td>
                    <td className="px-5 py-4 text-[12px] text-gray-400 hidden md:table-cell">{o.date}</td>
                    <td className="px-5 py-4 font-black text-gray-900">{formatarMoeda(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página Supervisão (somente Admin) ────────────────────────────────────────

// Visão geral de TODOS os recrutadores e vendedores da loja: códigos, equipes,
// vendas e comissões. Os painéis individuais mostram apenas os próprios dados;
// esta página é a supervisão completa, exclusiva do Admin.
function PaginaSupervisaoAdmin({
  pedidos,
  produtos,
  clientes,
  cargos,
  recrutamentos,
  comissao,
}: {
  pedidos: Pedido[];
  produtos: Produto[];
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  recrutamentos: Recrutamento[];
  comissao: number; // fração (ex.: 0.02 = 2%)
}) {
  // Nome amigável de uma conta (cliente cadastrado ou nome dado pelo recrutador)
  const nomeDe = (email: string) =>
    clientes.find((c) => c.email.toLowerCase() === email)?.name ??
    recrutamentos.find((r) => r.email.toLowerCase() === email)?.nome ??
    email;

  const vendasValidas = pedidos.filter((o) => o.status !== "Cancelado");

  const recrutadores = Object.keys(cargos).filter((e) => cargos[e] === "recrutador");
  const vendedores = Object.keys(cargos).filter((e) => cargos[e] === "vendedor");

  // Resumo de cada recrutador: equipe, vendas da equipe e comissão de 2%
  const dadosRecrutadores = recrutadores.map((email) => {
    const equipe = recrutamentos.filter((r) => r.recrutador === email);
    const ativos = equipe.filter((r) => r.ativado).map((r) => r.email.toLowerCase());
    const vendasEquipe = vendasValidas.filter(
      (o) => o.vendedor && ativos.includes(o.vendedor.toLowerCase())
    );
    const totalEquipe = vendasEquipe.reduce((acum, o) => acum + o.total, 0);
    const vendasProprias = vendasValidas.filter((o) => o.vendedor?.toLowerCase() === email);
    return {
      email,
      nome: nomeDe(email),
      codigo: codigoVendaDe(email),
      totalVendedores: equipe.length,
      vendedoresAtivos: ativos.length,
      totalEquipe,
      comissao: totalEquipe * comissao,
      totalProprio: vendasProprias.reduce((acum, o) => acum + o.total, 0),
    };
  });

  // Resumo de cada vendedor: recrutador, produtos e vendas
  const dadosVendedores = vendedores.map((email) => {
    const vinculo = recrutamentos.find((r) => r.email.toLowerCase() === email && r.ativado);
    const vendas = vendasValidas.filter((o) => o.vendedor?.toLowerCase() === email);
    return {
      email,
      nome: nomeDe(email),
      codigo: codigoVendaDe(email),
      recrutador: vinculo ? nomeDe(vinculo.recrutador) : "—",
      totalProdutos: produtos.filter((p) => p.owner?.toLowerCase() === email).length,
      qtdVendas: vendas.length,
      totalVendido: vendas.reduce((acum, o) => acum + o.total, 0),
    };
  });

  const comissaoTotal = dadosRecrutadores.reduce((acum, r) => acum + r.comissao, 0);
  const vendidoPorVendedores = dadosVendedores.reduce((acum, v) => acum + v.totalVendido, 0);

  const cartoes = [
    { label: "Recrutadores", valor: String(recrutadores.length), icone: <Users size={22} className="text-[#C8102E]" /> },
    { label: "Vendedores", valor: String(vendedores.length), icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
    { label: "Vendido por vendedores", valor: formatarMoeda(vendidoPorVendedores), icone: <TrendingUp size={22} className="text-[#C8102E]" /> },
    { label: `Comissões a pagar (${comissao * 100}%)`, valor: formatarMoeda(comissaoTotal), icone: <TrendingUp size={22} className="text-emerald-600" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-lg font-black text-gray-900 truncate">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recrutadores */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Recrutadores</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Equipes, vendas e a comissão de 2% de cada recrutador.</p>
        </div>
        {dadosRecrutadores.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">
            Nenhum recrutador nomeado ainda — o Master dá os cargos na página Equipe.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Recrutador</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Código</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Equipe</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Vendas da equipe</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Vendas próprias</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Comissão ({comissao * 100}%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dadosRecrutadores.map((r) => (
                  <tr key={r.email} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                          {r.nome[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800 truncate">{r.nome}</div>
                          <div className="text-[11px] text-gray-400 truncate">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold hidden md:table-cell">{r.codigo}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">
                      {r.vendedoresAtivos}/{r.totalVendedores}
                      <span className="text-[11px] text-gray-400 font-medium"> ativos</span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-800 hidden lg:table-cell">{formatarMoeda(r.totalEquipe)}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800 hidden lg:table-cell">{formatarMoeda(r.totalProprio)}</td>
                    <td className="px-5 py-4 font-black text-emerald-600">{formatarMoeda(r.comissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vendedores */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Vendedores</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Produtos, vendas e o recrutador responsável por cada vendedor.</p>
        </div>
        {dadosVendedores.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">
            Nenhum vendedor ativo ainda — quem ativar a conta com código aparecerá aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Vendedor</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Código</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Recrutador</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Produtos</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Vendas</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Total vendido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dadosVendedores.map((v) => (
                  <tr key={v.email} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                          {v.nome[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800 truncate">{v.nome}</div>
                          <div className="text-[11px] text-gray-400 truncate">{v.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold hidden md:table-cell">{v.codigo}</td>
                    <td className="px-5 py-4 text-gray-600 hidden lg:table-cell">{v.recrutador}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">{v.totalProdutos}</td>
                    <td className="px-5 py-4 font-semibold text-gray-800">{v.qtdVendas}</td>
                    <td className="px-5 py-4 font-black text-gray-900">{formatarMoeda(v.totalVendido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Seller Level Card ────────────────────────────────────────────────────────

function CartaoNivelVendedor({ vendasDoMes }: { vendasDoMes: number }) {
  const indiceNivel = obterNivelVendedor(vendasDoMes);
  const nivelAtual = NIVEIS_VENDEDOR[indiceNivel];
  const proximoNivel = NIVEIS_VENDEDOR[indiceNivel + 1];

  const pctProgresso = proximoNivel
    ? Math.min(100, ((vendasDoMes - nivelAtual.min) / (nivelAtual.max - nivelAtual.min)) * 100)
    : 100;

  const valorFaltante = proximoNivel ? proximoNivel.min - vendasDoMes : 0;

  return (
    <div className={`bg-white rounded-2xl border-2 ${nivelAtual.border} shadow-sm overflow-hidden`}>
      {/* Header gradient */}
      <div className={`bg-gradient-to-r ${nivelAtual.bg} p-5 border-b border-gray-100`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Award size={36} style={{ color: nivelAtual.color }} />
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nível Atual</div>
              <div className="text-2xl font-black text-gray-900">{nivelAtual.name}</div>
              <div className="text-[12px] text-gray-600 font-medium">Comissão {nivelAtual.commission}</div>
            </div>
          </div>

          {/* Level icons */}
          <div className="flex items-center gap-1">
            {NIVEIS_VENDEDOR.map((level, i) => (
              <div key={level.name} className="flex items-center">
                <div className={`flex flex-col items-center ${i <= indiceNivel ? "opacity-100" : "opacity-30"}`}>
                  <div className={`${i === indiceNivel ? "scale-125" : ""} transition-transform`}>
                    <Award size={18} style={{ color: level.color }} />
                  </div>
                  <div className={`text-[9px] font-black mt-0.5 ${i === indiceNivel ? "text-gray-800" : "text-gray-400"}`}>
                    {level.name}
                  </div>
                </div>
                {i < NIVEIS_VENDEDOR.length - 1 && (
                  <div className={`w-6 h-0.5 mx-1 mb-4 rounded ${i < indiceNivel ? "bg-gray-800" : "bg-gray-300"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5">
        {/* Progress to proximoBanner */}
        {proximoNivel && (
          <div className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-bold text-gray-600">
                Progresso para {proximoNivel.name}
              </span>
              <span className="text-[12px] font-black text-gray-900">{pctProgresso.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 relative overflow-hidden"
                style={{
                  width: `${pctProgresso}%`,
                  backgroundColor: nivelAtual.color,
                }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[11px] text-gray-500">{formatarMoeda(vendasDoMes)} este mês</span>
              <span className="text-[11px] font-bold text-emerald-600">
                Faltam apenas {formatarMoeda(valorFaltante)}!
              </span>
            </div>
          </div>
        )}

        {!proximoNivel && (
          <div className="mb-5 bg-cyan-50 border border-cyan-200 rounded-xl p-3 flex items-center gap-2">
            <Award size={22} className="text-cyan-500" />
            <div>
              <div className="font-black text-cyan-800 text-sm">Nível máximo atingido!</div>
              <div className="text-[11px] text-cyan-600">Você está no topo. Continue assim!</div>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
            Seus Benefícios — {nivelAtual.name}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {nivelAtual.benefits.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: nivelAtual.color + "33" }}
                >
                  <Check size={10} style={{ color: nivelAtual.color }} strokeWidth={3} />
                </div>
                <span className="text-[12px] text-gray-700 font-medium">{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next level preview */}
        {proximoNivel && (
          <div className="mt-4 bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[11px] font-bold text-gray-500 mb-2">
              Desbloqueie no {proximoNivel.name}:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {proximoNivel.benefits
                .filter((b) => !nivelAtual.benefits.includes(b))
                .map((b) => (
                  <span key={b} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                    + {b}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function PaginaDashboard({ pedidos, clientes, aoVerTodosPedidos }: { pedidos: Pedido[]; clientes: Cliente[]; aoVerTodosPedidos: () => void }) {
  const agora = new Date();
  const mesAtual = NOMES_MESES[agora.getMonth()];
  const pedidosValidos = pedidos.filter((o) => o.status !== "Cancelado");
  const pedidosDoMes = pedidosValidos.filter((o) => o.month === mesAtual);
  const vendasDoMes = pedidosDoMes.reduce((acum, o) => acum + o.total, 0);
  const ticketMedio = pedidosDoMes.length > 0 ? vendasDoMes / pedidosDoMes.length : 0;

  // Gráfico acompanha as vendas reais, mês a mês
  const dadosVendas = NOMES_MESES.slice(0, agora.getMonth() + 1).map((m) => ({
    month: m,
    vendas: pedidosValidos.filter((o) => o.month === m).reduce((acum, o) => acum + o.total, 0),
  }));

  // Participação por categoria a partir das vendas reais
  const totaisPorCategoria: Record<string, number> = {};
  pedidosValidos.forEach((o) => {
    totaisPorCategoria[o.category] = (totaisPorCategoria[o.category] || 0) + o.total;
  });
  const totalVendido = Object.values(totaisPorCategoria).reduce((a, b) => a + b, 0);
  const dadosCategoria = Object.entries(totaisPorCategoria)
    .map(([name, v]) => ({
      name,
      value: totalVendido > 0 ? Math.round((v / totalVendido) * 100) : 0,
      color: CORES_CATEGORIA[name] || "#94A3B8",
    }))
    .sort((a, b) => b.value - a.value);

  const metricas = [
    { label: `Faturamento (${mesAtual})`, value: formatarMoeda(vendasDoMes), icon: <TrendingUp size={18} />, bg: "bg-red-50", color: "text-[#C8102E]" },
    { label: `Pedidos (${mesAtual})`, value: String(pedidosDoMes.length), icon: <ShoppingBag size={18} />, bg: "bg-emerald-50", color: "text-emerald-600" },
    { label: "Clientes Novos", value: String(clientes.length), icon: <Users size={18} />, bg: "bg-purple-50", color: "text-purple-600" },
    { label: "Ticket Médio", value: formatarMoeda(ticketMedio), icon: <Tag size={18} />, bg: "bg-orange-50", color: "text-orange-500" },
  ];

  return (
    <div className="space-y-5">
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricas.map((m) => (
          <div key={m.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 ${m.bg} ${m.color} rounded-xl`}>{m.icon}</div>
            </div>
            <div className="text-[22px] font-black text-gray-900">{m.value}</div>
            <div className="text-[11px] text-gray-500 font-medium mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-800">Minhas Vendas — {agora.getFullYear()}</h3>
            <div className="flex items-center gap-4 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#C8102E] rounded inline-block" />Vendas</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={dadosVendas} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C8102E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#C8102E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: any) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, ""]}
                contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="vendas" stroke="#C8102E" strokeWidth={2.5} fill="url(#gradVendas)" name="Vendas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-black text-gray-800 mb-5">Por Categoria</h3>
          {dadosCategoria.length === 0 && (
            <p className="text-[12px] text-gray-400 text-center py-8">
              Nenhuma venda registrada ainda
            </p>
          )}
          <div className="space-y-4">
            {dadosCategoria.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-[12px] font-semibold text-gray-700 mb-1.5">
                  <span>{c.name}</span>
                  <span className="font-black">{c.value}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.value}%`, backgroundColor: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-black text-gray-800">Pedidos Recentes</h3>
          <button
            onClick={aoVerTodosPedidos}
            className="text-[12px] text-[#C8102E] font-bold hover:underline"
          >
            Ver todos →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Pedido</th>
                <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Produto</th>
                <th className="text-left px-5 py-3 font-semibold">Total</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pedidos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-[13px]">
                    Nenhum pedido ainda — as compras dos clientes aparecerão aqui.
                  </td>
                </tr>
              )}
              {pedidos.slice(0, 5).map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</td>
                  <td className="px-5 py-3.5 font-semibold text-gray-800">{o.customer}</td>
                  <td className="px-5 py-3.5 text-gray-500 hidden md:table-cell text-[12px]">{o.items}</td>
                  <td className="px-5 py-3.5 font-black text-gray-900">{formatarMoeda(o.total)}</td>
                  <td className="px-5 py-3.5"><SeloStatus status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function SeloStatus({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    Entregue: "bg-emerald-100 text-emerald-700",
    "Em trânsito": "bg-blue-100 text-blue-700",
    Processando: "bg-amber-100 text-amber-700",
    Cancelado: "bg-red-100 text-red-600",
  };
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${estilos[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ─── Products Admin ───────────────────────────────────────────────────────────

function PaginaProdutosAdmin({
  produtos,
  aoSalvar,
  aoExcluir,
}: {
  produtos: Produto[];
  aoSalvar: (p: Produto) => void;
  aoExcluir: (id: number) => void;
}) {
  const [termoBusca, setTermoBusca] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);

  const visiveis = produtos.filter(
    (p) =>
      p.name.toLowerCase().includes(termoBusca.toLowerCase()) ||
      p.brand.toLowerCase().includes(termoBusca.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 min-w-[240px]">
          <Search size={15} className="text-gray-400" />
          <input
            className="flex-1 text-[13px] outline-none placeholder:text-gray-400 bg-transparent"
            placeholder="Buscar produto ou marca..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
          />
        </div>
        <button
          onClick={() => { setEditando(null); setMostrarFormulario(true); }}
          className="flex items-center gap-2 bg-[#C8102E] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-[#8C1626] transition-colors"
        >
          <Plus size={15} />
          Novo Produto
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold">Produto</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Categoria</th>
                <th className="text-left px-5 py-3.5 font-semibold">Preço</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Estoque</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-[13px]">
                    Nenhum produto cadastrado — clique em <strong>Novo Produto</strong> para começar a vender.
                  </td>
                </tr>
              )}
              {visiveis.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <ImagemProduto src={p.image} alt={p.name} className="w-10 h-10 object-contain bg-gray-50 rounded-xl p-1 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-800 text-[12px] leading-snug line-clamp-1 max-w-[180px]">{p.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 font-medium">{p.brand}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-gray-500 hidden md:table-cell">{p.category}</td>
                  <td className="px-5 py-4 font-black text-gray-900 text-[13px]">
                    {formatarMoeda(p.price)}
                    {p.originalPrice && p.originalPrice > p.price && (
                      <div className="text-[10px] text-red-500 font-bold">-{pctDesconto(p.originalPrice, p.price)}%</div>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${p.stock < 15 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                      {p.stock} un.
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    {p.badge ? (
                      <span className={`${CORES_SELO[p.badge] || "bg-[#C8102E]"} text-white text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide`}>
                        {p.badge}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300 font-medium">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditando(p); setMostrarFormulario(true); }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-amber-600 transition-colors"
                        title="Editar produto"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => aoExcluir(p.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-colors"
                        title="Excluir produto"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mostrarFormulario && (
        <FormularioProduto
          inicial={editando}
          aoFechar={() => setMostrarFormulario(false)}
          aoSalvar={(p) => { aoSalvar(p); setMostrarFormulario(false); }}
        />
      )}
    </div>
  );
}

// ─── Produto Form (cadastro/edição) ───────────────────────────────────────────

function FormularioProduto({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Produto | null;
  aoFechar: () => void;
  aoSalvar: (p: Produto) => void;
}) {
  const [name, setName] = useState(inicial?.name || "");
  const [brand, setBrand] = useState(inicial?.brand || "");
  const [cat, setCat] = useState(inicial?.category || "Perfumes");
  const [price, setPrice] = useState(inicial ? String(inicial.price) : "");
  const [originalPrice, setOriginalPrice] = useState(inicial?.originalPrice ? String(inicial.originalPrice) : "");
  const [stock, setStock] = useState(inicial ? String(inicial.stock) : "");
  const [installments, setInstallments] = useState(inicial?.installments || 12);
  const [image, setImage] = useState(inicial?.image || "");
  const [badge, setBadge] = useState(inicial?.badge || "");
  const [freeShipping, setFreeShipping] = useState(inicial?.freeShipping ?? true);
  const [description, setDescription] = useState(inicial?.description || "");
  // % de desconto no PIX deste produto (vazio = sem desconto)
  const [pixDesconto, setPixDesconto] = useState(inicial?.pixDesconto ? String(inicial.pixDesconto) : "");
  const [erro, setErro] = useState("");

  const estiloInput =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all";
  const estiloRotulo = "text-[12px] font-bold text-gray-600 block mb-1.5";

  const aoEnviarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(price.replace(",", "."));
    const op = originalPrice ? parseFloat(originalPrice.replace(",", ".")) : undefined;
    const st = parseInt(stock, 10);
    if (!name.trim() || !brand.trim()) { setErro("Informe o nome e a marca do produto."); return; }
    if (!p || p <= 0) { setErro("Informe um preço válido."); return; }
    if (op !== undefined && op <= p) { setErro("O preço original deve ser maior que o preço com desconto."); return; }
    if (isNaN(st) || st < 0) { setErro("Informe o estoque."); return; }
    const pix = pixDesconto ? parseInt(pixDesconto, 10) : 0;
    if (pix < 0 || pix > 90) { setErro("O desconto no PIX deve ser entre 0% e 90%."); return; }
    aoSalvar({
      id: inicial?.id ?? Date.now(),
      name: name.trim(),
      brand: brand.trim(),
      price: p,
      originalPrice: op,
      installments,
      rating: inicial?.rating ?? 0,
      reviews: inicial?.reviews ?? 0,
      image: image.trim(),
      category: cat,
      badge: badge || undefined,
      freeShipping,
      stock: st,
      description: description.trim() || undefined,
      pixDesconto: pix > 0 ? pix : undefined,
      owner: inicial?.owner,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={aoFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-black text-gray-900">{inicial ? "Editar Produto" : "Novo Produto"}</h3>
          <button onClick={aoFechar} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={aoEnviarFormulario} className="p-6 space-y-4">
          <div>
            <label className={estiloRotulo}>Nome do produto *</label>
            <input className={estiloInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Perfumes" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Marca *</label>
              <input className={estiloInput} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: Motorola" />
            </div>
            <div>
              <label className={estiloRotulo}>Categoria</label>
              <select className={estiloInput} value={cat} onChange={(e) => setCat(e.target.value)}>
                {CATEGORIAS.filter((c) => c !== "Todos").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Preço de venda (R$) *</label>
              <input className={estiloInput} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 1899,90" inputMode="decimal" />
              <p className="text-[11px] text-gray-400 mt-1">Valor que o cliente paga.</p>
            </div>
            <div>
              <label className={estiloRotulo}>Preço "De:" (R$)</label>
              <input className={estiloInput} value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="Ex.: 2299,90 (opcional)" inputMode="decimal" />
              <p className="text-[11px] text-gray-400 mt-1">Preço antigo, aparece riscado como desconto. Deixe vazio se não houver.</p>
            </div>
          </div>

          {/* Prévia: mostra exatamente como o cliente verá os preços */}
          {(() => {
            const p = parseFloat(price.replace(",", "."));
            if (!p || p <= 0) return null;
            const op = originalPrice ? parseFloat(originalPrice.replace(",", ".")) : undefined;
            const pix = pixDesconto ? parseInt(pixDesconto, 10) : 0;
            return (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Como o cliente vai ver</p>
                {op && op > p ? (
                  <p className="text-[14px]">
                    <span className="text-gray-400 line-through">{formatarMoeda(op)}</span>{" "}
                    <span className="font-black text-gray-900">{formatarMoeda(p)}</span>{" "}
                    <span className="text-red-500 font-black text-[11px]">-{pctDesconto(op, p)}%</span>
                  </p>
                ) : (
                  <p className="text-[14px] font-black text-gray-900">{formatarMoeda(p)}</p>
                )}
                {pix > 0 && pix <= 90 && (
                  <p className="text-[12px] text-emerald-600 font-bold mt-0.5">
                    {formatarMoeda(p * (1 - pix / 100))} no PIX ({pix}% OFF)
                  </p>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Estoque *</label>
              <input className={estiloInput} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="10" inputMode="numeric" />
            </div>
            <div>
              <label className={estiloRotulo}>Parcelamento</label>
              <select className={estiloInput} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                {[1, 2, 3, 6, 10, 12].map((n) => (
                  <option key={n} value={n}>{n}x sem juros</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={estiloRotulo}>Desconto extra pagando no PIX (%)</label>
            <input
              className={estiloInput}
              value={pixDesconto}
              onChange={(e) => setPixDesconto(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="Ex.: 5 — deixe vazio para não dar desconto no PIX"
              inputMode="numeric"
            />
            <p className="text-[11px] text-gray-400 mt-1">Aplicado sobre o preço de venda somente quando o cliente paga com PIX.</p>
          </div>

          <div>
            <label className={estiloRotulo}>Status na loja (destaque para atrair clientes)</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setBadge("")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-black border-2 transition-all ${
                  badge === "" ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"
                }`}
              >
                NENHUM
              </button>
              {OPCOES_SELO.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBadge(b)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-black border-2 transition-all ${
                    badge === b
                      ? `${CORES_SELO[b]} text-white border-transparent`
                      : "border-gray-200 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={estiloRotulo}>Imagem do produto</label>
            <div className="flex gap-2">
              <input
                className={estiloInput}
                value={image.startsWith("data:") ? "" : image}
                onChange={(e) => setImage(e.target.value)}
                placeholder={image.startsWith("data:") ? "Imagem enviada por upload" : "Cole a URL da imagem (https://...)"}
              />
              <label className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[12px] px-4 rounded-xl cursor-pointer transition-colors whitespace-nowrap">
                <Upload size={14} />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const img = new Image();
                      img.onload = () => {
                        // Redimensiona para economizar espaço de armazenamento
                        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
                        const canvas = document.createElement("canvas");
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                        setImage(canvas.toDataURL("image/jpeg", 0.85));
                      };
                      img.src = reader.result as string;
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {image.trim() && (
              <div className="mt-2 flex items-center gap-3">
                <ImagemProduto src={image} alt="Pré-visualização" className="w-16 h-16 object-contain bg-gray-50 rounded-xl p-1 border border-gray-100" />
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="text-[11px] text-red-500 font-bold hover:underline"
                >
                  Remover imagem
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={estiloRotulo}>Características (uma por linha)</label>
            <textarea
              className={`${estiloInput} min-h-[80px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={"512GB de armazenamento interno\n24GB de memória RAM\nCâmera 50MP"}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={freeShipping}
              onChange={(e) => setFreeShipping(e.target.checked)}
              className="w-4 h-4 accent-[#C8102E]"
            />
            <span className="text-[13px] font-semibold text-gray-700">Frete grátis</span>
          </label>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
              {erro}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl hover:border-gray-300 transition-colors text-[14px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-[14px]"
            >
              {inicial ? "Salvar Alterações" : "Cadastrar Produto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Orders Admin ─────────────────────────────────────────────────────────────

function PaginaPedidosAdmin({
  pedidos,
  aoAtualizarStatus,
}: {
  pedidos: Pedido[];
  aoAtualizarStatus: (id: string, status: string) => void;
}) {
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const listaStatus = ["Todos", "Processando", "Em trânsito", "Entregue", "Cancelado"];
  const visiveis = filtroStatus === "Todos" ? pedidos : pedidos.filter((o) => o.status === filtroStatus);
  const contagens = listaStatus.reduce((acum, s) => {
    acum[s] = s === "Todos" ? pedidos.length : pedidos.filter((o) => o.status === s).length;
    return acum;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {listaStatus.map((s) => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors flex items-center gap-1.5 ${
              filtroStatus === s ? "bg-[#C8102E] text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
            }`}
          >
            {s}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${filtroStatus === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {contagens[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold">Pedido</th>
                <th className="text-left px-5 py-3.5 font-semibold">Cliente</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Produto</th>
                <th className="text-left px-5 py-3.5 font-semibold">Total</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Data</th>
                <th className="text-left px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-[13px]">
                    Nenhum pedido encontrado — as compras dos clientes aparecerão aqui.
                  </td>
                </tr>
              )}
              {visiveis.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold">{o.id}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                        {o.customer[0]}
                      </div>
                      <span className="font-semibold text-gray-800">{o.customer}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-gray-500 hidden md:table-cell">{o.items}</td>
                  <td className="px-5 py-4 font-black text-gray-900">{formatarMoeda(o.total)}</td>
                  <td className="px-5 py-4 text-[12px] text-gray-400 hidden lg:table-cell">{o.date}</td>
                  <td className="px-5 py-4"><SeloStatus status={o.status} /></td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setPedidoSelecionado(o)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                      title="Ver detalhes da compra"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pedidoSelecionado && (
        <ModalDetalhesPedido
          pedido={pedidoSelecionado}
          aoFechar={() => setPedidoSelecionado(null)}
          aoAtualizarStatus={(s) => {
            aoAtualizarStatus(pedidoSelecionado.id, s);
            setPedidoSelecionado({ ...pedidoSelecionado, status: s });
          }}
        />
      )}
    </div>
  );
}

function ModalDetalhesPedido({
  pedido,
  aoFechar,
  aoAtualizarStatus,
}: {
  pedido: Pedido;
  aoFechar: () => void;
  aoAtualizarStatus: (status: string) => void;
}) {
  const listaStatus = ["Processando", "Em trânsito", "Entregue", "Cancelado"];
  const campos = [
    { label: "Cliente", value: pedido.customer },
    { label: "E-mail", value: pedido.email },
    { label: "Produto", value: pedido.items },
    { label: "Categoria", value: pedido.category },
    { label: "Data da compra", value: pedido.date },
    // Endereço de entrega informado pelo cliente no carrinho
    ...(pedido.endereco ? [{ label: "Endereço de entrega", value: pedido.endereco }] : []),
    // Atribuição da venda (código de venda usado e conta creditada)
    ...(pedido.codigoVenda ? [{ label: "Código de venda", value: pedido.codigoVenda }] : []),
    ...(pedido.vendedor ? [{ label: "Venda creditada a", value: pedido.vendedor }] : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={aoFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Detalhes da Compra</h3>
            <span className="font-mono text-[12px] text-[#C8102E] font-bold">{pedido.id}</span>
          </div>
          <button onClick={aoFechar} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={17} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {campos.map((c) => (
              <div key={c.label} className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-[12px] text-gray-400 font-semibold flex-shrink-0">{c.label}</span>
                <span className="text-[13px] text-gray-800 font-semibold text-right">{c.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] font-bold text-gray-600">Total da compra</span>
            <span className="text-xl font-black text-gray-900">{formatarMoeda(pedido.total)}</span>
          </div>

          <div>
            <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">Status do pedido</p>
            <div className="grid grid-cols-2 gap-2">
              {listaStatus.map((s) => (
                <button
                  key={s}
                  onClick={() => aoAtualizarStatus(s)}
                  className={`py-2.5 rounded-xl text-[12px] font-bold border-2 transition-all ${
                    pedido.status === s
                      ? "border-[#C8102E] bg-red-50 text-[#C8102E]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Pedidos cancelados não contam no faturamento nem no gráfico de vendas.
            </p>
          </div>

          <button
            onClick={aoFechar}
            className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-[14px]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
