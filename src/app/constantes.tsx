// Constantes e valores fixos da loja (config do programa, nao e banco de dados)

import { X, Package, Truck, Check } from "lucide-react";
import type { ConfigLoja, Banner, Tela } from "./types";

export const CONFIG_PADRAO: ConfigLoja = {
  // NUNCA colocar a chave PIX de verdade aqui: tudo neste arquivo é compilado
  // para dentro do JavaScript do site, que qualquer visitante pode abrir e ler.
  // A chave real fica só no banco (Admin → Configurações) e o servidor só a
  // envia para quem está logado como Admin (ver dados.php: chavePix).
  chavePix: "",
  freteGratisAcima: 299,
  freteCapital: 14.9,
  freteInterior: 19.9,
  fretePadrao: 29.9,
  comissaoRecrutador: 2,
  // Hoje a loja entrega só em Altônia/PR. Para passar a atender mais cidades,
  // basta acrescentá-las em Admin → Configurações (separadas por vírgula) —
  // deixar em branco volta a aceitar todo o Paraná.
  cidadesAtendidas: "Altônia",
};


// ─── Tabela de comissão do vendedor ──────────────────────────────────────────
//
// É SÓ uma tabela de preço do trabalho: quanto o vendedor ganha por venda,
// conforme o total que ele já vendeu. Não é premiação, não paga bônus e não
// promete benefício nenhum.
//
// O que existia aqui antes e foi removido de propósito:
//  • bônus em dinheiro ao atingir Ouro (R$ 100) e Diamante (R$ 150) — dívida
//    da loja com cada vendedor que batesse a meta, sem nada que a controlasse;
//  • uma lista de "benefícios" por faixa ("banner gratuito", "gerente
//    exclusivo", "campanhas gratuitas", "early access", "destaque nas buscas")
//    — promessas que a loja não tem como cumprir e que, anunciadas a quem
//    vende, viram cobrança.
//
// As cores e os selos de medalha também saíram: a faixa agora aparece como
// informação, não como troféu.
export const NIVEIS_VENDEDOR = [
  { name: "Bronze",   min: 0,    max: 500,      commission: "4%" },
  { name: "Prata",    min: 500,  max: 1500,     commission: "6%" },
  { name: "Ouro",     min: 1500, max: 3000,     commission: "8%" },
  { name: "Diamante", min: 3000, max: Infinity, commission: "10%" },
];


// A conta Master não sobe de faixa como o vendedor comum: a comissão dela
// sobre as próprias vendas (com o código pessoal) é fixa em 7%, à parte da
// tabela acima, que continua valendo só para o vendedor.
export const COMISSAO_MASTER_PROPRIA = 0.07;


// ─── MasterPlus ─────────────────────────────────────────────────────────────
// Cargo acima do Master. Ganha comissão em três partes:
//  • 7% sobre as próprias vendas, com o próprio código pessoal (percentual
//    fixo, o mesmo percentual que o Master ganha nas vendas dele)
//  • 2% sobre as vendas da própria equipe (vendedores que ele mesmo cadastrou)
//  • 1% de repasse sobre as vendas da equipe do Master que ele promoveu
//    (não conta a venda pessoal do Master, só a equipe dele)
export const COMISSAO_MASTERPLUS_PROPRIA = 0.07;
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
  "Caixas",
  "Beleza & Perfumaria",
  "Eletrônicos",
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
  "Caixas": "CAI",
  // A categoria já se chamou "Cestas"; os produtos cadastrados naquela época
  // continuam com o código CES-001, CES-002... e é assim que eles têm que
  // continuar (o código é a identidade do produto no estoque e nos pedidos).
  "Cestas": "CES",
  "Beleza & Perfumaria": "BEL",
  "Eletrônicos": "ELE",
  "Brinquedos": "BRI",
  "Academia": "ACA",
  "Acessórios": "ACE",
  "Casa & Decoração": "CAS",
};


// ─── Monte sua Caixa ──────────────────────────────────────────────────────────
// A loja tem uma área dedicada em que o cliente escolhe uma CAIXA (o
// recipiente do presente: caixa de presente, baú, bandeja...) e depois enche
// ela com os produtos que quiser. Não existe cadastro separado para isso: a
// caixa é um produto normal, cadastrado no painel Admin dentro da categoria
// "Caixas". Todo produto de qualquer outra categoria pode ir dentro dela.
export const CATEGORIA_CAIXA = "Caixas";

// Nome antigo da mesma categoria. Produto cadastrado antes da troca ainda está
// gravado como "Cestas" no banco; ao carregar a loja o nome é atualizado para
// o novo (ver App.tsx), e na próxima gravação do catálogo isso vai para o
// banco sozinho. Sem isso, essas caixas sumiriam do "Monte sua Caixa".
export const CATEGORIA_CAIXA_LEGADO = "Cestas";

// Categorias oferecidas na NAVEGAÇÃO da loja: o menu da vitrine e os atalhos
// da tela de Perfil. É a lista completa menos "Caixas" — os produtos dessa
// categoria são os recipientes (caixa, bandeja, baú), base para montar um
// presente, não presente que alguém compre sozinho — por isso não aparecem
// em lugar nenhum da loja: nem no menu, nem na vitrine, nem na busca, nem nos
// "mais vendidos". Elas só existem dentro do Monte sua Caixa (ver
// produtosDaVitrine, em App.tsx). O Admin segue cadastrando nessa categoria
// normalmente. Use CATEGORIAS (a lista completa) no Admin; use esta na loja.
export const CATEGORIAS_VITRINE = CATEGORIAS.filter((c) => c !== CATEGORIA_CAIXA);

// Mínimo de produtos para a caixa poder ir ao carrinho (só a caixa vazia não
// é presente nenhum) e teto por produto, para não virar uma compra atacado
// disfarçada de caixa.
export const MIN_ITENS_CAIXA = 1;
export const MAX_QTD_POR_ITEM_CAIXA = 10;

// Os três tamanhos oferecidos em toda caixa. Aqui ficam só os rótulos e o
// valor SUGERIDO de capacidade quando o Admin cadastra uma caixa nova — o
// preço, o estoque e a capacidade que valem são os definidos caixa por caixa
// no painel (ver Produto.tamanhos). Capacidade é o número de produtos que
// cabem dentro; sem ela o tamanho vira só um preço diferente.
export const TAMANHOS_CAIXA = [
  { tamanho: "P" as const, nome: "Pequena", descricao: "um mimo caprichado", capacidadeSugerida: 4 },
  { tamanho: "M" as const, nome: "Média", descricao: "a mais pedida", capacidadeSugerida: 8 },
  { tamanho: "G" as const, nome: "Grande", descricao: "para caprichar de vez", capacidadeSugerida: 15 },
];

// Cartão de mensagem que acompanha a caixa (de/para + recado escrito à mão
// pela loja no cartão físico). Vai junto no pedido, para o Admin montar.
export const MAX_CARACTERES_MENSAGEM_CAIXA = 200;


// ─── Recomendações ────────────────────────────────────────────────────────────
// Quantos produtos a loja sugere de uma vez (compra concluída, notificações).
export const QTD_RECOMENDACOES = 4;

// O pop-up de sugestão só aparece depois deste tempo de navegação na vitrine —
// tempo suficiente para a pessoa estar olhando a loja, e não recém-chegada.
export const ATRASO_POPUP_RECOMENDACAO = 25_000;

// Fechou o pop-up? Então nada de sugestão pelas próximas 24h. Recomendação que
// insiste vira incômodo, e incômodo tira gente da loja.
export const ESPERA_APOS_DISPENSAR_RECOMENDACAO = 24 * 60 * 60 * 1000;


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
  Caixas: "#C79A3B",
  Cestas: "#C79A3B", // nome antigo da categoria Caixas
  "Beleza & Perfumaria": "#C8102E",
  "Eletrônicos": "#0EA5E9",
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

// As fotos de produto e banner não trafegam mais em base64 dentro do
// /api/dados: de lá vem o ENDEREÇO de cada foto, servido pelo próprio backend
// (ex.: .../api/produtos/123/imagem?v=ab12cd34). Isso derrubou a resposta de
// abertura do site de 19 MB para alguns KB.
//
// Esta função diz se uma foto já está guardada no servidor — seja como
// endereço nosso, seja como base64 recém-escolhido no upload. Serve para o
// painel não jogar o endereço interno dentro do campo "cole a URL da imagem",
// que é para link de fora.
export const ehFotoGuardada = (src: string) =>
  src.startsWith("data:") || /\/api\/(produtos|banners)\/\d+\/imagem(\?|$)/.test(src);


// ─── Avaliações de produto (comentário + vídeo do cliente) ────────────────────

// Vídeo enviado na avaliação vira base64 e fica salvo direto no banco (igual
// às fotos de produto/banner) — por isso precisa ser curto. Limite pensado
// pra caber tranquilo no corpo da requisição (25 MB) e nos limites de upload
// da hospedagem (HostGator). Em base64 o arquivo fica ~33% maior, por isso o
// limite do ARQUIVO em si é menor que o limite de envio.
export const LIMITE_VIDEO_AVALIACAO_MB = 12;
export const LIMITE_VIDEO_AVALIACAO_SEGUNDOS = 20;
