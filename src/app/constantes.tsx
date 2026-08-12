// Constantes e valores fixos da loja (config do programa, nao e banco de dados)

import { X, Package, Truck, Check } from "lucide-react";
import type { ConfigLoja, Banner, Tela } from "./types";

export const CONFIG_PADRAO: ConfigLoja = {
  chavePix: "44997201104",
  freteGratisAcima: 299,
  freteCapital: 14.9,
  freteInterior: 19.9,
  fretePadrao: 29.9,
  comissaoRecrutador: 2,
};


// ─── Seller Levels ────────────────────────────────────────────────────────────

export const NIVEIS_VENDEDOR = [
  {
    name: "Bronze",
    min: 0,
    max: 500,
    color: "#CD7F32",
    bg: "from-amber-800/20 to-amber-600/10",
    border: "border-amber-700/30",
    commission: "4%",
    benefits: ["Suporte padrão", "Comissão de 4%", "Painel básico", "Relatório mensal"],
  },
  {
    name: "Prata",
    min: 500,
    max: 1500,
    color: "#A8B8C8",
    bg: "from-slate-400/20 to-slate-300/10",
    border: "border-slate-400/30",
    commission: "6%",
    benefits: ["Suporte prioritário", "Comissão de 6%", "Destaque nas buscas", "Relatórios avançados"],
  },
  {
    name: "Ouro",
    min: 1500,
    max: 3000,
    color: "#FFD700",
    bg: "from-yellow-400/20 to-yellow-300/10",
    border: "border-yellow-400/40",
    commission: "8%",
    benefits: ["Suporte dedicado", "Comissão de 8%", "Banner gratuito", "Analytics premium", "Selo Ouro"],
  },
  {
    name: "Diamante",
    min: 3000,
    max: Infinity,
    color: "#7DD3F8",
    bg: "from-cyan-400/20 to-blue-300/10",
    border: "border-cyan-400/40",
    commission: "10%",
    benefits: ["Gerente exclusivo", "Comissão de 10%", "Topo dos resultados", "Campanhas gratuitas", "Early access", "Selo Diamante"],
  },
];


// A conta Master já entra sempre no nível Diamante (não sobe de nível como o
// vendedor) — por isso a comissão dela sobre as próprias vendas (com o
// código pessoal) é fixa, no mesmo percentual do topo da tabela.
export const COMISSAO_MASTER_PROPRIA = parseFloat(NIVEIS_VENDEDOR[3].commission) / 100;


// Bônus de nível: pago à própria conta do vendedor quando ela atinge, em
// vendas totais, o nível Ouro ou o nível Diamante. É cumulativo —
// quem chega ao Diamante já passou pelo Ouro e recebe os dois valores.
export const BONUS_NIVEL_OURO = 100;
export const BONUS_NIVEL_DIAMANTE = 150;


// ─── MasterPlus ─────────────────────────────────────────────────────────────
// Cargo acima do Master. Ganha comissão em três partes:
//  • 10% sobre as próprias vendas, com o próprio código pessoal (mesmo
//    percentual fixo do Master, nível Diamante)
//  • 2% sobre as vendas da própria equipe (vendedores que ele mesmo cadastrou)
//  • 1% de repasse sobre as vendas da equipe do Master que ele promoveu
//    (não conta a venda pessoal do Master, só a equipe dele)
export const COMISSAO_MASTERPLUS_PROPRIA = 0.10;
export const COMISSAO_MASTERPLUS_EQUIPE = 0.02;
export const COMISSAO_MASTERPLUS_OVERRIDE = 0.01;

// Comissão do Master sobre a própria equipe QUANDO ele foi promovido por um
// MasterPlus (ver vinculosMasterPlus, em App.tsx) — menor que o padrão
// configurável (config.comissaoRecrutador) porque 1% vai de repasse ao
// MasterPlus que o promoveu.
export const COMISSAO_MASTER_PROMOVIDO_EQUIPE = 0.01;


// ─── Data ─────────────────────────────────────────────────────────────────────

// Catálogo começa vazio — os produtos são cadastrados pelo painel Admin
export const IMAGEM_PADRAO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#F1F5F9'/><text x='200' y='210' font-size='17' font-family='sans-serif' fill='#94A3B8' text-anchor='middle'>Sem imagem</text></svg>"
  );


export const OPCOES_SELO = ["OFERTA", "MAIS VENDIDO", "TOP VENDA", "NOVO", "LANÇAMENTO"];


export const CATEGORIAS = [
  "Outros",
  "Beleza & Perfumaria",
  "Adega",
  "Brinquedos",
  "Academia",
  "Acessórios",
  "Casa & Decoração",
];


// Prefixo do código sequencial de cada categoria (nicho). Cada produto
// cadastrado ganha um código tipo "BEL-001", crescente dentro da própria
// categoria — ver gerarCodigoProduto em utils.ts.
export const PREFIXOS_CATEGORIA: Record<string, string> = {
  "Outros": "OUT",
  "Beleza & Perfumaria": "BEL",
  "Adega": "ADE",
  "Brinquedos": "BRI",
  "Academia": "ACA",
  "Acessórios": "ACE",
  "Casa & Decoração": "CAS",
};


// Conta do administrador da loja — somente ela enxerga e acessa o painel Admin.
// A senha NUNCA fica aqui (nem em nenhum outro arquivo do site) — ela só
// existe, como um hash, no backend (config.php). O login do Admin chama o
// backend para conferir a senha e devolve um token temporário — ver
// TelaLogin.tsx e authToken.ts.
export const EMAIL_ADMIN = "balorense@gmail.com";
export const NOME_ADMIN = "Kayke Spoti";


// ── Login real com Google ──────────────────────────────────────────────────
// Para ativar: crie um "OAuth Client ID" gratuito em console.cloud.google.com
// (APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth →
// Aplicativo da Web → em "Origens JavaScript autorizadas" adicione
// http://localhost:5173) e cole o ID abaixo. Com o ID preenchido, o site
// consulta a Google de verdade; vazio, usa o cadastro simulado por nome.
export const GOOGLE_CLIENT_ID = "887237314004-016e23l96uj8mrc2kmhh7bmemiij7j5c.apps.googleusercontent.com";


export const NOMES_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];


export const CORES_CATEGORIA: Record<string, string> = {
  "Beleza & Perfumaria": "#C8102E",
  Adega: "#7C2D12",
  Brinquedos: "#F59E0B",
  Academia: "#10B981",
  "Acessórios": "#6366F1",
  "Casa & Decoração": "#8B5CF6",
};


export const CORES_SELO: Record<string, string> = {
  "MAIS VENDIDO": "bg-orange-500",
  OFERTA: "bg-red-500",
  "TOP VENDA": "bg-purple-600",
  NOVO: "bg-green-500",
  LANÇAMENTO: "bg-emerald-600",
};


// Avisos sobre o andamento dos pedidos do cliente (substitui "Categorias" no
// menu inferior do celular)
export const NOTIFICACAO_POR_STATUS: Record<string, { icon: React.ReactNode; texto: (id: string) => string; cor: string }> = {
  Processando: {
    icon: <Package size={18} className="text-amber-500" />,
    texto: (id) => `Seu pedido ${id} está sendo preparado.`,
    cor: "bg-amber-50",
  },
  "Em trânsito": {
    icon: <Truck size={18} className="text-blue-500" />,
    texto: (id) => `Seu pedido ${id} está a caminho!`,
    cor: "bg-blue-50",
  },
  Entregue: {
    icon: <Check size={18} className="text-emerald-600" />,
    texto: (id) => `Seu pedido ${id} foi entregue.`,
    cor: "bg-emerald-50",
  },
  Cancelado: {
    icon: <X size={18} className="text-red-500" />,
    texto: (id) => `Seu pedido ${id} foi cancelado.`,
    cor: "bg-red-50",
  },
};


// ─── Tela de Pagamento PIX ─────────────────────────────────────────────────────

// O código PIX expira em 30 minutos
export const VALIDADE_PIX_MS = 30 * 60 * 1000;

// Número máximo de parcelas sem juros no cartão de crédito
export const MAX_PARCELAS_CARTAO = 12;

// Endereço do backend (banco de dados + cobranças PIX oficiais do Sicredi).
// Hospedagem definitiva: KingHost, com o backend-php publicado no mesmo
// domínio do site (veja backend-php/README.md). Antes de rodar "npm run
// build" para publicar, crie um arquivo ".env" (copie de .env.example) com
// VITE_BACKEND_URL=https://www.seusite.com.br — o mesmo domínio de sempre.
// Sem esse arquivo, usa o backend local (XAMPP em http://localhost:3333),
// que só funciona na sua própria máquina — por isso o aviso de "banco
// desconectado" quando publicado sem essa variável definida.
export const URL_BACKEND_PIX = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3333";


// ─── Avaliações de produto (comentário + vídeo do cliente) ────────────────────

// Vídeo enviado na avaliação vira base64 e fica salvo direto no banco (igual
// às fotos de produto/banner) — por isso precisa ser curto. Limite pensado
// pra caber tranquilo no corpo da requisição (25 MB) e nos limites de upload
// da hospedagem (HostGator). Em base64 o arquivo fica ~33% maior, por isso o
// limite do ARQUIVO em si é menor que o limite de envio.
export const LIMITE_VIDEO_AVALIACAO_MB = 12;
export const LIMITE_VIDEO_AVALIACAO_SEGUNDOS = 20;
