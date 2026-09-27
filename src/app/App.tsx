/*
══════════════════════════════════════════════════════════════════
 CORAÇÃO PRESENTE
══════════════════════════════════════════════════════════════════
 Este arquivo é só o "maestro": guarda o estado geral (produtos, carrinho,
 usuário, pedidos etc.), busca/salva tudo no banco de dados e decide qual
 tela mostrar. Cada tela e cada painel vivem em arquivos próprios:

   types.ts        -> formatos dos dados (Produto, Pedido, Cliente...)
   constantes.tsx  -> valores fixos de configuração (categorias, níveis...)
   utils.ts        -> funções auxiliares (formatar moeda, calcular comissão...)
   components/     -> pedaços de tela reutilizados (Logo, CartaoProduto...)
   screens/        -> telas do cliente (login, carrinho, perfil, PIX...)
   admin/          -> páginas do painel Admin/Master/Vendedor

 Os dados (produtos, pedidos, clientes) ficam salvos no banco de dados
 (MySQL, via backend) — veja o useEffect abaixo que busca em /api/dados.
══════════════════════════════════════════════════════════════════
*/

import { useState, useEffect, useMemo, useRef, lazy, Suspense, type ComponentProps } from "react";
import { Search, Plus, Check } from "lucide-react";
import type { Produto, ItemCarrinho, Usuario, ConfigLoja, Cupom, Banner, Cargo, Recrutamento, ResultadoCadastroVendedor, Pedido, Cliente, Tela, DadosPagamento, CaixaMontada, Compra } from "./types";
import { CONFIG_PADRAO, CATEGORIAS_VITRINE, CATEGORIA_CAIXA, CATEGORIA_CAIXA_LEGADO, EMAIL_ADMIN, URL_BACKEND_PIX, QTD_RECOMENDACOES, ATRASO_POPUP_RECOMENDACAO, ESPERA_APOS_DISPENSAR_RECOMENDACAO } from "./constantes";
import { cabecalhosAdmin, cabecalhosAuth, definirSessao } from "./authToken";
import { sincronizarInscricao } from "./notificacoesPush";
import { cupomEstaValido, codigoVendaDe, lerArmazenamento, gerarCodigoProduto, linhaDeCarrinhoDaCaixa } from "./utils";
import { api } from "./api";
import {
  produtosComprados,
  recomendarProdutos,
  motivoDaRecomendacao,
  maisVendidosDaLoja,
  ofertasEmDestaque,
  estaEmOferta,
  descontoDe,
  SINAIS_VAZIOS,
  type SinaisVitrine,
} from "./recomendacoes";
import { toast } from "sonner";
import { ImagemProduto } from "./components/ImagemProduto";
import { AvisoBancoDesconectado } from "./components/AvisoBancoDesconectado";
import { PopupRecomendacao } from "./components/PopupRecomendacao";
import { BarraInferiorMobile } from "./components/BarraInferiorMobile";
import { ModalVendedorAtivado } from "./components/ModalVendedorAtivado";
import { CabecalhoLoja } from "./components/CabecalhoLoja";
import { BannerRotativo } from "./components/BannerRotativo";
import { BarraFiltros, type Ordenacao, type FaixaPreco } from "./components/BarraFiltros";
import { FaixaBeneficios } from "./components/FaixaBeneficios";
import { SecaoVitrine } from "./components/SecaoVitrine";
import { SecaoAvaliacoesClientes } from "./components/SecaoAvaliacoesClientes";
import { ChamadaMonteSuaCaixa } from "./components/ChamadaMonteSuaCaixa";
import { CartaoProduto } from "./components/CartaoProduto";
import { RodapeLoja } from "./components/RodapeLoja";
import { TelaLogin } from "./screens/TelaLogin";
import { TelaRedefinirSenha } from "./screens/TelaRedefinirSenha";
import { TelaNotificacoesCliente } from "./screens/TelaNotificacoesCliente";
import { TelaInstitucional, type PaginaInstitucional } from "./screens/TelaInstitucional";
import { TelaPerfil } from "./screens/TelaPerfil";
import { PaginaProduto } from "./screens/PaginaProduto";
import { PaginaCarrinho } from "./screens/PaginaCarrinho";
import { PaginaMontarCaixa } from "./screens/PaginaMontarCaixa";
import { TelaCheckout } from "./screens/TelaCheckout";
import { TelaPagamentoCompra } from "./screens/TelaPagamentoCompra";
import { TelaCompraConcluida } from "./screens/TelaCompraConcluida";
// Prateleiras da home que podem ser abertas por inteiro ("Ver todos")
type Colecao = "ofertas" | "para-voce" | "mais-vendidos" | "novidades" | "todos";
const NOME_COLECAO: Record<Exclude<Colecao, "para-voce" | "todos">, string> = {
  ofertas: "Ofertas",
  "mais-vendidos": "Mais vendidos",
  novidades: "Novidades",
};
// Quantos produtos a listagem mostra por vez
const POR_PAGINA = 20;

// ─── Painel Admin: baixado só por quem abre o painel ─────────────────────────
//
// O painel inteiro (19 telas + a biblioteca de gráficos) pesava dentro do mesmo
// arquivo que a loja. Resultado: TODO visitante baixava o painel de controle
// para ver a vitrine — mais de 900 KB, quando o cliente só precisa da loja.
//
// Com o import() aqui embaixo, o navegador só busca esse pedaço quando alguém
// de fato abre o painel. Quem entra para comprar nunca chega a baixá-lo.
const PainelAdminCarregado = lazy(() =>
  import("./admin/PainelAdmin").then((m) => ({ default: m.PainelAdmin }))
);

// Enquanto o pedaço do painel chega (uma vez só, e normalmente em menos de um
// segundo), mostra uma tela de espera em vez de um branco sem explicação.
function CarregandoPainel() {
  return (
    <div className="min-h-screen bg-[#EDEDED] flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-[3px] border-[#C8102E]/20 border-t-[#C8102E] rounded-full animate-spin" />
      <p className="text-[13px] font-semibold text-gray-500">Abrindo o painel...</p>
    </div>
  );
}

// Embrulho com o Suspense já dentro: os pontos que renderizam o painel
// continuam escrevendo <PainelAdmin ... /> como antes.
function PainelAdmin(props: ComponentProps<typeof PainelAdminCarregado>) {
  return (
    <Suspense fallback={<CarregandoPainel />}>
      <PainelAdminCarregado {...props} />
    </Suspense>
  );
}

export default function App() {
  // Links especiais recebidos por e-mail (redefinir senha / confirmar
  // e-mail) chegam como "?redefinir-senha=TOKEN" ou "?verificar-email=TOKEN"
  // na própria URL do site — lidos uma vez, no primeiro carregamento.
  const [tokenRedefinirSenha] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("redefinir-senha")
  );
  const [avisoVerificacaoEmail, setAvisoVerificacaoEmail] = useState<string | null>(null);

  useEffect(() => {
    const tokenVerificacao = new URLSearchParams(window.location.search).get("verificar-email");
    if (!tokenVerificacao) return;
    fetch(`${URL_BACKEND_PIX}/api/clientes/verificar-email?token=${encodeURIComponent(tokenVerificacao)}`)
      .then((r) => r.json().then((corpo) => ({ ok: r.ok, corpo })))
      .then(({ ok, corpo }) => {
        setAvisoVerificacaoEmail(ok ? "E-mail confirmado com sucesso!" : corpo?.erro || "Não foi possível confirmar o e-mail.");
      })
      .catch(() => setAvisoVerificacaoEmail("Não foi possível confirmar o e-mail."))
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("verificar-email");
        window.history.replaceState({}, "", url.toString());
      });
  }, []);

  // "?pedido=PED-1024" é o link que sai no e-mail de andamento e no toque da
  // notificação do celular: abre direto o rastreamento, já com o número
  // preenchido, em vez de largar o cliente na home.
  const [pedidoDoLink] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("pedido")
  );

  // Tela atual do app: loja, login, carrinho, admin ou sucesso
  const [tela, setTela] = useState<Tela>(pedidoDoLink ? "institucional" : "loja");
  // Página de conteúdo aberta pelos links do rodapé (Sobre Nós, Central de Ajuda…)
  const [paginaInstitucional, setPaginaInstitucional] = useState<PaginaInstitucional>(
    pedidoDoLink ? "rastreio" : "sobre"
  );
  // Página ativa dentro dos painéis (admin, master, vendedor)
  const [paginaAdmin, setPaginaAdmin] = useState<string>("dashboard");
  // Itens que o cliente colocou no carrinho. Guardado no navegador: antes
  // bastava atualizar a página, fechar a aba sem querer ou voltar depois do
  // almoço para o carrinho estar vazio — e quase ninguém monta a compra duas
  // vezes. Os preços são reconferidos com o catálogo assim que ele chega do
  // banco (ver o efeito logo abaixo), então um carrinho velho nunca compra
  // pelo preço velho.
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>(() =>
    lerArmazenamento<ItemCarrinho[]>("cp_carrinho", [])
  );
  // Texto digitado na busca de produtos
  const [busca, setBusca] = useState("");
  // Categoria selecionada no menu da loja
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Outros");
  // IDs dos produtos favoritados (coração)
  const [favoritos, setFavoritos] = useState<number[]>(() =>
    lerArmazenamento<number[]>("cp_favoritos", [])
  );
  // Alterna o grid de produtos para mostrar só os favoritados (atalho do coração no cabeçalho)
  const [verSoFavoritos, setVerSoFavoritos] = useState(false);
  // Uma prateleira da home aberta por inteiro ("Ver todos"). null = nenhuma.
  const [colecao, setColecao] = useState<Colecao | null>(null);
  // Mais vendidos e "comprados juntos" de verdade, somados no servidor
  const [sinaisVitrine, setSinaisVitrine] = useState<SinaisVitrine>(SINAIS_VAZIOS);
  // A listagem mostra aos poucos: POR_PAGINA de cada vez, "Mostrar mais" traz o resto
  const [qtdVisivel, setQtdVisivel] = useState(POR_PAGINA);
  // Filtros e ordenação do catálogo (BarraFiltros) — client-side, sobre o
  // que já está carregado; não precisa ir ao servidor de novo.
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("relevancia");
  const [faixaPreco, setFaixaPreco] = useState<FaixaPreco>("");
  const [marcaFiltro, setMarcaFiltro] = useState("");
  const [avaliacaoMinFiltro, setAvaliacaoMinFiltro] = useState(0);
  const [apenasEstoqueFiltro, setApenasEstoqueFiltro] = useState(false);
  const [menuMobileAdmin, setMenuMobileAdmin] = useState(false);
  // Cliente logado (null = visitante). Recuperado do navegador para que o
  // usuário continue logado mesmo depois de fechar e abrir o site de novo.
  const [usuario, setUsuario] = useState<Usuario | null>(() =>
    lerArmazenamento<Usuario | null>("cp_usuario_logado", null)
  );
  // Define se a tela de login abre em login ou cadastro
  const [modoTelaLogin, setModoTelaLogin] = useState<"login" | "cadastro">("login");
  const [avisoTelaLogin, setAvisoTelaLogin] = useState("");
  // Mostra o pop-up de "conta ativada como vendedor" depois que o cliente
  // ativa o código no próprio perfil
  const [avisoVendedorAtivado, setAvisoVendedorAtivado] = useState(false);
  // Produto que o visitante tentou comprar antes de se cadastrar
  const [produtoPendente, setProdutoPendente] = useState<Produto | null>(null);
  // Caixa reaberta para edição pelo botão "Editar caixa" do carrinho (null =
  // montagem começando do zero)
  const [caixaEmEdicao, setCaixaEmEdicao] = useState<CaixaMontada | null>(null);
  // Caixa que um visitante terminou de montar antes de ter conta: fica
  // guardada durante o cadastro e entra no carrinho assim que ele se cadastra
  const [caixaPendente, setCaixaPendente] = useState<CaixaMontada | null>(null);
  // Compra criada no servidor e esperando pagamento (tela de pagamento). O
  // valor dela é o do servidor — ver TelaCheckout e lib_compras.php.
  const [compraAtual, setCompraAtual] = useState<Compra | null>(null);
  // Compra que acabou de ser paga (tela "Pronto!")
  const [compraConcluida, setCompraConcluida] = useState<Compra | null>(null);
  // Cargos dados pelo Master (e-mail → vendedor), carregados do banco
  const [cargos, setCargos] = useState<Record<string, Cargo>>({});
  // Vendedores cadastrados pelo Master (código de ativação), carregados do banco
  const [recrutamentos, setRecrutamentos] = useState<Recrutamento[]>([]);
  // E-mail do Master (minúsculo) → e-mail do MasterPlus que o promoveu.
  // Todo Master tem, obrigatoriamente, um vínculo aqui — não existe Master
  // fora da equipe de um MasterPlus (ver definirCargo). Carregado do banco.
  const [vinculosMasterPlus, setVinculosMasterPlus] = useState<Record<string, string>>({});
  // Configurações da loja ajustáveis pelo Admin, carregadas do banco
  const [config, setConfig] = useState<ConfigLoja>(CONFIG_PADRAO);
  // Cupons de desconto criados pelo Admin, carregados do banco
  const [cupons, setCupons] = useState<Cupom[]>([]);
  // Banners da vitrine, editados pelo Admin, carregados do banco
  const [banners, setBanners] = useState<Banner[]>([]);
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
  // Produtos comprados na última compra (convite de avaliação na tela de sucesso)
  const [produtosUltimaCompra, setProdutosUltimaCompra] = useState<Produto[]>([]);
  // true = abrir a página do produto já rolada até a seção de avaliações
  const [irParaAvaliacoes, setIrParaAvaliacoes] = useState(false);
  // Controla o aviso animado de adicionado ao carrinho
  const [toastAdicionado, setToastAdicionado] = useState<{ p: Produto; key: number } | null>(null);

  useEffect(() => {
    if (!toastAdicionado) return;
    const t = setTimeout(() => setToastAdicionado(null), 2600);
    return () => clearTimeout(t);
  }, [toastAdicionado]);

  // Mantém o login salvo no navegador: continua logado ao voltar ao site
  useEffect(() => {
    if (usuario) localStorage.setItem("cp_usuario_logado", JSON.stringify(usuario));
    else localStorage.removeItem("cp_usuario_logado");
    // Um celular pode ser usado por mais de uma pessoa da casa: reapresenta a
    // inscrição de notificação a cada login, para os avisos irem para a conta
    // que está usando o site agora.
    if (usuario) sincronizarInscricao();
  }, [usuario]);

  // Carrinho e favoritos guardados no navegador — é o que faz a compra
  // sobreviver a um F5, a uma queda de sinal no celular ou a "depois eu
  // termino". Ficam só neste aparelho (não são dados da conta).
  useEffect(() => {
    try {
      localStorage.setItem("cp_carrinho", JSON.stringify(carrinho));
    } catch {
      // navegador sem espaço ou em modo anônimo — não é motivo para travar a loja
    }
  }, [carrinho]);

  useEffect(() => {
    try {
      localStorage.setItem("cp_favoritos", JSON.stringify(favoritos));
    } catch {
      // idem
    }
  }, [favoritos]);

  // ── Banco de dados (XAMPP/MySQL via backend) — fonte única dos dados ─────
  // Tudo que precisa ser guardado vive SOMENTE no banco "coracaopresente".
  // Ao abrir o site, os dados são carregados de lá. Dados antigos que ainda
  // estejam no navegador são migrados para o banco uma única vez e apagados.
  const bancoPronto = useRef(false);
  // null = verificando · true = conectado · false = desconectado (mostra aviso)
  const [bancoConectado, setBancoConectado] = useState<boolean | null>(null);
  // Muda a cada login/logout: refaz a carga do banco com o token novo, porque
  // o backend recorta a resposta conforme quem está pedindo.
  const [recargaBanco, setRecargaBanco] = useState(0);

  useEffect(() => {
    // Cópias antigas do navegador (usadas só para a migração inicial)
    const locais = {
      produtos: lerArmazenamento<Produto[]>("cp_products", []),
      pedidos: lerArmazenamento<Pedido[]>("cp_orders", []),
      clientes: lerArmazenamento<Cliente[]>("cp_customers", []),
      cargos: lerArmazenamento<Record<string, Cargo>>("cp_cargos", {}),
      recrutamentos: lerArmazenamento<Recrutamento[]>("cp_recrutamentos", []),
      cupons: lerArmazenamento<Cupom[]>("cp_cupons", []),
      banners: lerArmazenamento<Banner[]>("cp_banners", []),
      alertasEstoque: lerArmazenamento<{ id: number; name: string; date: string }[]>("cp_stock_alerts", []),
      config: lerArmazenamento<Partial<ConfigLoja> | null>("cp_config", null),
    };

    // Preenche o código sequencial (ex.: "BEL-001") de produtos antigos que
    // ainda não têm um — mantém a ordem original da lista, só processa por
    // id crescente (proxy da ordem de cadastro) para numerar em sequência
    // A categoria "Cestas" virou "Caixas". Produto cadastrado antes da troca
    // continua gravado com o nome antigo no banco: aqui ele já entra na loja
    // com o nome novo (senão sumiria do Monte sua Caixa e do menu do Admin), e
    // na próxima vez que o Admin salvar o catálogo o banco acompanha. O código
    // do produto (CES-001...) fica como está — é a identidade dele no estoque.
    const comCategoriaAtualizada = (lista: Produto[]): Produto[] =>
      lista.map((p) => (p.category === CATEGORIA_CAIXA_LEGADO ? { ...p, category: CATEGORIA_CAIXA } : p));

    const comCodigosPreenchidos = (lista: Produto[]): Produto[] => {
      if (lista.every((p) => p.codigo)) return lista;
      const numerados: Produto[] = [];
      for (const p of [...lista].sort((a, b) => a.id - b.id)) {
        numerados.push(p.codigo ? p : { ...p, codigo: gerarCodigoProduto(p.category, numerados) });
      }
      return lista.map((p) => numerados.find((n) => n.id === p.id)!);
    };

    // Prefere o banco; usa a cópia antiga apenas se o banco estiver vazio
    const aplicar = (banco: any) => {
      const escolher = <T,>(doBanco: T[] | undefined, antigo: T[]) =>
        doBanco && doBanco.length > 0 ? doBanco : antigo;
      setProdutos(comCodigosPreenchidos(comCategoriaAtualizada(escolher(banco?.produtos, locais.produtos))));
      setPedidos(escolher(banco?.pedidos, locais.pedidos));
      setClientes(escolher(banco?.clientes, locais.clientes));
      setRecrutamentos(escolher(banco?.recrutamentos, locais.recrutamentos));
      setCupons(escolher(banco?.cupons, locais.cupons));
      setBanners(escolher(banco?.banners, locais.banners));
      setAlertasEstoque(escolher(banco?.alertasEstoque, locais.alertasEstoque));
      const cargosCarregados: Record<string, Cargo> =
        banco?.cargos && Object.keys(banco.cargos).length > 0 ? banco.cargos : locais.cargos;
      // Vínculos Master ⇄ MasterPlus — recurso novo, sem cópia antiga no navegador
      const vinculosCarregados: Record<string, string> = banco?.vinculosMasterPlus ?? {};
      // Só deve existir Master dentro da equipe de um MasterPlus — remove
      // qualquer Master "solto" (sem vínculo) que porventura exista em
      // dados antigos, de uma migração ou de um estado inconsistente.
      const cargosSemMastersOrfaos = Object.fromEntries(
        Object.entries(cargosCarregados).filter(
          ([email, cargo]) => cargo !== "master" || Boolean(vinculosCarregados[email])
        )
      ) as Record<string, Cargo>;
      setCargos(cargosSemMastersOrfaos);
      setVinculosMasterPlus(vinculosCarregados);
      const configFinal = banco?.config ?? locais.config;
      if (configFinal) setConfig((anterior) => ({ ...anterior, ...configFinal }));
    };

    // Com o token da sessão, o backend devolve também os dados privados desta
    // conta (pedidos dela, equipe). Sem token, vem só a vitrine pública.
    fetch(`${URL_BACKEND_PIX}/api/dados`, { headers: cabecalhosAuth() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((banco) => {
        aplicar(banco);
        setBancoConectado(true);
        // Habilita a gravação: o que veio da migração é enviado ao banco agora
        bancoPronto.current = true;
        // Remove as cópias antigas do navegador — os dados ficam só no XAMPP
        ["cp_products", "cp_orders", "cp_customers", "cp_cargos", "cp_recrutamentos",
         "cp_cupons", "cp_banners", "cp_stock_alerts", "cp_config"].forEach((k) => localStorage.removeItem(k));
      })
      .catch(() => {
        // Falha ao carregar. Esta carga é refeita a cada login/logout, então
        // aqui pode ser uma RECARGA que falhou (rede caiu, sessão expirou,
        // servidor engasgou) com o banco já carregado antes.
        //
        // Nesse caso NÃO se pode chamar aplicar(null): as cópias do navegador
        // já foram apagadas na primeira carga, então ele zeraria o catálogo na
        // tela. E, pior, como a gravação continuava ligada, o próximo "salvar
        // produto" do Admin reescreveria a tabela inteira a partir dessa lista
        // vazia — apagando todos os produtos no banco de verdade.
        //
        // Então: mantém na tela o que já havia e desliga a gravação, para que
        // nenhuma cópia desatualizada sobrescreva o banco.
        const jaTinhaCarregado = bancoPronto.current;
        bancoPronto.current = false;
        if (!jaTinhaCarregado) aplicar(null);
        setBancoConectado(false);
      });
  }, [recargaBanco]);

  // Grava uma coleção INTEIRA no banco (reescreve a tabela). Só deve ser
  // chamada explicitamente em ações do Admin (poucas, controladas por uma
  // pessoa só) — nunca automaticamente a cada mudança de estado. Se algo
  // aqui rodasse pra qualquer mudança, uma ação comum de cliente (comprar,
  // logar, avaliar) poderia reescrever a tabela inteira com uma cópia
  // desatualizada, apagando o que o Admin acabou de cadastrar. Por isso
  // ações de cliente usam endpoints próprios (ver salvarNoServidor abaixo),
  // que mudam só a linha necessária.
  const salvarNoBanco = (colecao: string, dados: unknown) => {
    // Sem conexão confirmada com o banco, gravar seria perigoso: esta função
    // reescreve a tabela inteira, e o que está na memória pode estar
    // desatualizado. Avisa em vez de falhar calado (antes, o Admin só
    // descobria ao recarregar e ver que o cadastro tinha sumido).
    if (!bancoPronto.current) {
      toast.error(
        "Sem conexão com o servidor — nada foi salvo. Recarregue a página e tente de novo.",
        { duration: 8000 }
      );
      return;
    }
    fetch(`${URL_BACKEND_PIX}/api/dados/${colecao}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cabecalhosAdmin() },
      body: JSON.stringify({ dados }),
    })
      .then(async (r) => {
        if (r.ok) return;
        // A gravação falhou (sessão expirada, imagem inválida, erro do
        // servidor...) — sem isso, o Admin só percebia ao recarregar a
        // página e ver que o que cadastrou tinha sumido, sem entender por quê.
        let mensagem = "Não foi possível salvar. Tente novamente.";
        try {
          const corpo = await r.json();
          if (corpo?.erro) mensagem = corpo.erro;
        } catch {
          // resposta sem JSON — mantém a mensagem genérica
        }
        toast.error(mensagem, { duration: 8000 });
        if (r.status === 401) setBancoConectado(false);
      })
      .catch(() => {
        toast.error("Sem conexão com o servidor. As alterações NÃO foram salvas.", { duration: 8000 });
        setBancoConectado(false);
      });
  };

  // Chama um endpoint pontual do backend (muda uma linha só, não a tabela
  // inteira). Usado nas ações de cliente: comprar, logar, avaliar, ativar
  // código de vendedor, salvar/excluir cartão — e também em ações pontuais
  // do Admin (ex.: status de um pedido), que exigem o token de sessão.
  const salvarNoServidor = (caminho: string, metodo: string, corpo?: unknown) =>
    chamarServidor(caminho, metodo, corpo).then(({ ok, erro }) => {
      if (!ok && erro) toast.error(erro, { duration: 8000 });
      return ok;
    });

  // Mesma chamada, mas DEVOLVE o que o servidor respondeu e não mostra toast
  // nenhum. É o que as telas usam quando precisam do conteúdo da resposta (o
  // código de ativação que o servidor gera ao cadastrar um vendedor, por
  // exemplo) ou quando o erro aparece dentro do próprio formulário.
  const chamarServidor = async (
    caminho: string,
    metodo: string,
    corpo?: unknown
  ): Promise<{ ok: boolean; dados: Record<string, unknown> | null; erro: string | null }> => {
    if (!bancoPronto.current) {
      return {
        ok: false,
        dados: null,
        erro: "Sem conexão com o servidor — nada foi salvo. Recarregue a página e tente de novo.",
      };
    }
    try {
      const r = await fetch(`${URL_BACKEND_PIX}${caminho}`, {
        method: metodo,
        headers: { "Content-Type": "application/json", ...cabecalhosAdmin() },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      let dados: Record<string, unknown> | null = null;
      try {
        dados = await r.json();
      } catch {
        // resposta sem JSON — segue com o erro genérico abaixo
      }
      if (r.status === 401) setBancoConectado(false);
      return {
        ok: r.ok,
        dados,
        erro: r.ok ? null : (typeof dados?.erro === "string" ? dados.erro : "Não foi possível salvar. Tente novamente."),
      };
    } catch {
      setBancoConectado(false);
      return { ok: false, dados: null, erro: "Sem conexão com o servidor. As alterações NÃO foram salvas." };
    }
  };

  // Limpa automaticamente os alertas de estoque assim que o produto volta a
  // ter estoque (ou é excluído) — sem isso, cada "esgotado" ficava para
  // sempre na lista e lotava o sino de notificações do Admin. Só ajusta a
  // visão local (a tabela em si só ganha linhas via /api/checkout).
  useEffect(() => {
    setAlertasEstoque((atual) => {
      const aindaEsgotados = atual.filter((a) => {
        const produto = produtos.find((p) => p.id === a.id);
        return produto ? produto.stock <= 0 : false;
      });
      return aindaEsgotados.length === atual.length ? atual : aindaEsgotados;
    });
  }, [produtos]);

  // Carrinho guardado de uma visita anterior x catálogo de agora.
  //
  // O carrinho volta do navegador com os preços do dia em que foi montado. O
  // servidor confere os preços na hora de fechar a compra (ver checkout.php),
  // então um carrinho desatualizado seria recusado lá na frente, com o cliente
  // já na tela de pagamento e sem entender o motivo. Aqui ele é reconciliado
  // logo na abertura da loja: preço e estoque atualizados, produto que saiu do
  // catálogo removido e quantidade ajustada ao que ainda existe.
  const carrinhoReconciliado = useRef(false);
  useEffect(() => {
    if (carrinhoReconciliado.current || produtos.length === 0) return;
    carrinhoReconciliado.current = true;
    setCarrinho((atual) => {
      if (atual.length === 0) return atual;
      let mudou = false;
      const atualizado: ItemCarrinho[] = [];
      for (const item of atual) {
        // Caixa montada: o preço dela é a soma do que tem dentro, então quem
        // sabe remontá-la com os preços de hoje é a própria função que a criou.
        if (item.caixa) {
          if (!produtos.some((p) => p.id === item.caixa!.recipienteId)) { mudou = true; continue; }
          const linha = linhaDeCarrinhoDaCaixa(item.caixa, produtos);
          const qty = Math.min(item.qty, linha.stock);
          if (qty <= 0) { mudou = true; continue; }
          if (linha.price !== item.price || qty !== item.qty) mudou = true;
          atualizado.push({ ...linha, qty });
          continue;
        }
        const atualDoCatalogo = produtos.find((p) => p.id === item.id);
        if (!atualDoCatalogo || atualDoCatalogo.stock <= 0) { mudou = true; continue; }
        const qty = Math.min(item.qty, atualDoCatalogo.stock);
        if (atualDoCatalogo.price !== item.price || qty !== item.qty) mudou = true;
        // Mantém o que é escolha do cliente (cor e quantidade) e troca o resto
        // pelo cadastro de agora.
        atualizado.push({ ...atualDoCatalogo, corEscolhida: item.corEscolhida, qty });
      }
      if (!mudou) return atual;
      toast.info(
        atualizado.length === 0
          ? "Os produtos que estavam no seu carrinho não estão mais disponíveis."
          : "Seu carrinho foi atualizado com os preços e o estoque de hoje.",
        { duration: 7000 }
      );
      return atualizado;
    });
  }, [produtos]);

  // vinculosMasterPlus, config e banners agora gravam direto nos handlers que
  // realmente mudam esses dados (salvarBanner, excluirBanner, definirCargo,
  // promoverVendedorAMaster, salvarConfig) — igual ao padrão já usado por
  // produtos/cupons/cargos. Antes isso era feito por um useEffect reativo a
  // cada um desses estados, mas ele disparava de novo assim que os dados
  // vindos do banco eram aplicados no carregamento da página (é uma mudança
  // de estado como qualquer outra do ponto de vista do React) — ou seja,
  // TODO visitante regravava a loja inteira ao abrir o site, usando um token
  // de Admin antigo/expirado se houvesse um sobrando no navegador, e via
  // "Sessão expirada" à toa. Chamando salvarNoBanco só nos handlers, a
  // gravação só acontece quando o Admin realmente muda algo.

  // Cria um cupom novo ou atualiza um existente (mesmo código). Ação do
  // Admin — grava a tabela inteira (são poucos cupons, e só o Admin mexe
  // aqui). O uso do cupom numa compra normal NÃO passa por aqui — vai pelo
  // /api/checkout, que só soma +1 no cupom usado, sem reescrever a tabela.
  const salvarCupom = (c: Cupom) => {
    const novo = cupons.some((x) => x.codigo === c.codigo)
      ? cupons.map((x) => (x.codigo === c.codigo ? c : x))
      : [c, ...cupons];
    setCupons(novo);
    salvarNoBanco("cupons", novo);
  };

  const excluirCupom = (codigo: string) => {
    const novo = cupons.filter((c) => c.codigo !== codigo);
    setCupons(novo);
    salvarNoBanco("cupons", novo);
  };

  // O Admin muda a configuração da loja (frete, chave PIX, comissão...) —
  // salva no banco na hora, igual às outras ações do Admin
  // Espera o servidor confirmar: a tela de Configurações mostra o motivo se um
  // valor for recusado (ex.: comissão acima de 50%, CNPJ inválido).
  const salvarConfig = async (novaConfig: ConfigLoja): Promise<string | null> => {
    const r = await api("/api/dados/config", { metodo: "PUT", corpo: { dados: novaConfig } });
    if (!r.ok) {
      if (r.status === 401) setBancoConectado(false);
      return r.erro ?? "Não foi possível salvar as configurações.";
    }
    setConfig(novaConfig);
    return null;
  };

  // Cria um banner novo ou atualiza um existente (mesmo id)
  const salvarBanner = (b: Banner) => {
    const novo = banners.some((x) => x.id === b.id)
      ? banners.map((x) => (x.id === b.id ? b : x))
      : [...banners, b];
    setBanners(novo);
    salvarNoBanco("banners", novo);
  };

  const excluirBanner = (id: number) => {
    const novo = banners.filter((b) => b.id !== id);
    setBanners(novo);
    salvarNoBanco("banners", novo);
  };


  // Master/MasterPlus/Admin dá (ou remove) um cargo de um usuário.
  //
  // Regra: só existe Master dentro da equipe de um MasterPlus — não há mais
  // Master "solto" (o Admin não promove Master direto, só o MasterPlus
  // promove um vendedor da própria equipe). Por isso, se esta conta deixa
  // de ser MasterPlus (perde o cargo, é removida, etc.), os Masters que ela
  // promoveu não ficam órfãos: são excluídos junto (perdem o cargo).
  // Quem grava por qual rota: o Admin manda a tabela de cargos inteira (é ele
  // quem cuida de Masters e MasterPlus, e são poucas contas). Master e
  // MasterPlus usam a rota da equipe, que muda SÓ a linha daquela pessoa e
  // confere no servidor se ela é mesmo da equipe de quem pediu — o painel
  // deles não tem (nem pode ter) token de Admin, e a rota do Admin reescreve
  // a tabela inteira a partir da fatia que o navegador enxerga.
  const definirCargo = (email: string, cargo: Cargo | null) => {
    const chave = email.toLowerCase();
    const souAdmin = usuario?.email?.toLowerCase() === EMAIL_ADMIN;

    const novosCargos = { ...cargos };
    if (cargo === null) delete novosCargos[chave];
    else novosCargos[chave] = cargo;
    // Deixou de ser MasterPlus: os Masters que ele promoveu perdem o cargo junto
    if (cargo !== "masterplus") {
      Object.keys(vinculosMasterPlus)
        .filter((m) => vinculosMasterPlus[m] === chave)
        .forEach((m) => delete novosCargos[m]);
    }
    setCargos(novosCargos);

    const novosVinculos = { ...vinculosMasterPlus };
    if (cargo !== "master") delete novosVinculos[chave];
    if (cargo !== "masterplus") {
      for (const k of Object.keys(novosVinculos)) if (novosVinculos[k] === chave) delete novosVinculos[k];
    }
    const vinculosMudaram =
      Object.keys(novosVinculos).length !== Object.keys(vinculosMasterPlus).length;
    if (vinculosMudaram) setVinculosMasterPlus(novosVinculos);

    if (souAdmin && cargo !== "master") {
      // Admin: uma conta por vez. O servidor aplica a regra "Master sem
      // MasterPlus não existe" e devolve as duas tabelas como ficaram — a
      // tela se alinha a elas (antes o painel regravava a tabela inteira e
      // apagava o cargo que um Master tivesse dado no mesmo intervalo).
      chamarServidor("/api/admin/cargo", "POST", { email: chave, cargo }).then(({ ok, dados, erro }) => {
        if (!ok) {
          toast.error(erro ?? "Não foi possível salvar o cargo.", { duration: 8000 });
          setRecargaBanco((n) => n + 1);
          return;
        }
        if (dados?.cargos) setCargos(dados.cargos as Record<string, Cargo>);
        if (dados?.vinculosMasterPlus) setVinculosMasterPlus(dados.vinculosMasterPlus as Record<string, string>);
      });
    } else {
      // A rota da equipe cuida do vínculo Master ⇄ MasterPlus junto com o cargo
      chamarServidor("/api/equipe/cargo", "POST", { email: chave, cargo }).then(({ ok, dados, erro }) => {
        if (!ok) {
          toast.error(erro ?? "Não foi possível salvar o cargo.", { duration: 8000 });
          return;
        }
        // Dar cargo por e-mail a quem ainda não era da equipe cria o vínculo no
        // servidor. Ele volta aqui para a pessoa aparecer na lista na hora, sem
        // esperar a próxima carga da página.
        const vinculoNovo = dados?.recrutamento as Recrutamento | undefined;
        if (vinculoNovo) {
          setRecrutamentos((anterior) =>
            anterior.some((r) => r.codigo === vinculoNovo.codigo) ? anterior : [vinculoNovo, ...anterior]
          );
        }
      });
    }
  };

  // MasterPlus promove um vendedor de destaque DA PRÓPRIA EQUIPE a Master.
  // Só pode promover quem ele mesmo cadastrou (código já ativado) e que
  // ainda é vendedor. Retorna uma mensagem de erro, ou null se deu certo.
  const promoverVendedorAMaster = (masterPlusEmail: string, vendedorEmail: string): string | null => {
    const masterPlusChave = masterPlusEmail.toLowerCase();
    const chave = vendedorEmail.trim().toLowerCase();
    if (!chave) return "Selecione um vendedor da sua equipe.";
    if (cargos[chave] !== "vendedor") return "Essa conta não é (mais) um vendedor da sua equipe.";
    const daEquipe = recrutamentos.some(
      (r) => r.email.toLowerCase() === chave && r.recrutador === masterPlusChave && r.ativado
    );
    if (!daEquipe) return "Você só pode promover vendedores que você mesmo cadastrou.";
    // definirCargo já grava: pelo Admin, a tabela de cargos; pelo MasterPlus,
    // a rota da equipe — que gravou o vínculo Master ⇄ MasterPlus junto.
    definirCargo(chave, "master");
    setVinculosMasterPlus({ ...vinculosMasterPlus, [chave]: masterPlusChave });
    return null;
  };

  // Cliente ativa, no próprio perfil, o código de vendedor recebido do
  // Master. Retorna uma mensagem de erro, ou null se ativou com sucesso
  // (nesse caso também dispara o pop-up de aviso).
  const ativarCodigoVendedor = (codigo: string): string | null => {
    if (!usuario) return "Você precisa estar logado.";
    const codigoLimpo = codigo.trim().toUpperCase();
    if (!codigoLimpo) return "Informe o código recebido do Master.";
    const emailLimpo = usuario.email.toLowerCase();
    const vinculo = recrutamentos.find(
      (r) => r.codigo === codigoLimpo && r.email.toLowerCase() === emailLimpo
    );
    if (!vinculo) return "Código inválido para esta conta. Confira com quem te cadastrou.";
    if (vinculo.ativado) return "Este código já foi ativado.";
    // Ação do cliente: usa o endpoint pontual (não reescreve as tabelas
    // inteiras de recrutamentos/cargos, que são compartilhadas por todos).
    salvarNoServidor(`/api/recrutamentos/${codigoLimpo}/ativar`, "POST", { email: emailLimpo });
    setRecrutamentos((anterior) =>
      anterior.map((r) => (r.codigo === codigoLimpo ? { ...r, ativado: true } : r))
    );
    setCargos((anterior) => ({ ...anterior, [emailLimpo]: "vendedor" }));
    setAvisoVendedorAtivado(true);
    return null;
  };

  // Master cadastra um vendedor: gera o código de ativação e cria o vínculo,
  // marcado com o e-mail do Master que convidou (cada Master tem a própria
  // equipe — a comissão sobre a equipe só vale sobre ela).
  // Retorna uma mensagem de erro, ou null se deu certo.
  const cadastrarVendedor = async (
    masterEmail: string,
    nome: string,
    email: string
  ): Promise<ResultadoCadastroVendedor> => {
    const chave = email.trim().toLowerCase();
    if (!nome.trim() || !chave) return { erro: "Preencha o nome e o e-mail do vendedor." };
    if (chave === EMAIL_ADMIN) return { erro: "Este e-mail é reservado." };
    if (chave === masterEmail.toLowerCase()) return { erro: "Você não pode convidar a si mesmo." };
    if (recrutamentos.some((r) => r.email.toLowerCase() === chave))
      return { erro: "Este e-mail já foi cadastrado." };

    // Quem cria o vínculo é o SERVIDOR (rota própria da equipe, uma linha por
    // vez). Antes isso ia pela rota do Admin, que exige token de Admin — o
    // Master via "Sessão expirada" e nada era salvo — e que ainda reescreveria
    // a tabela inteira, apagando a equipe dos outros Masters. O código de
    // ativação também vem de lá: só o servidor enxerga todos os códigos já
    // usados e consegue garantir que o novo não repete.
    const { ok, dados, erro } = await chamarServidor("/api/recrutamentos", "POST", {
      nome: nome.trim(),
      email: chave,
    });
    if (!ok) return { erro: erro ?? "Não foi possível cadastrar o vendedor." };

    const criado = dados?.recrutamento as Recrutamento | undefined;
    const jaEraCliente = dados?.jaEraCliente === true;
    if (criado) {
      setRecrutamentos((anterior) => [criado, ...anterior]);
      // Quem já tinha conta na loja entrou na equipe na hora, com o cargo
      // dado pelo servidor — o painel reflete isso sem recarregar a página
      if (jaEraCliente) setCargos((anterior) => ({ ...anterior, [chave]: "vendedor" }));
    } else {
      // Deu certo, mas a resposta não trouxe o vínculo (backend antigo ainda no
      // ar): busca a lista de novo em vez de inventar aqui um código que o
      // banco não conhece — código errado na mão do vendedor não ativa nada.
      setRecargaBanco((n) => n + 1);
    }
    return { erro: null, codigo: criado?.codigo, jaEraCliente };
  };

  // Cadastra ou edita UM produto. Antes o painel mandava o catálogo inteiro a
  // cada "Salvar": com duas pessoas cadastrando, a gravação de uma apagava o
  // produto da outra. Agora vai só o produto, e a tela só troca a linha depois
  // que o servidor confirma. Devolve a mensagem de erro (null = salvou), para
  // o formulário continuar aberto com o que foi digitado quando algo dá errado.
  const salvarProduto = async (p: Produto & { estoqueBase?: number }): Promise<string | null> => {
    const novo = !produtos.some((x) => x.id === p.id);
    const r = await api<{ produto: Produto }>(novo ? "/api/produtos" : `/api/produtos/${p.id}`, {
      metodo: novo ? "POST" : "PUT",
      corpo: p,
    });
    if (r.status === 409 && r.dados?.produto) {
      // Outra pessoa salvou antes: mostra a versão atual em vez de apagá-la
      const atual = r.dados.produto;
      setProdutos((lista) => lista.map((x) => (x.id === atual.id ? atual : x)));
      return r.erro;
    }
    if (!r.ok || !r.dados?.produto) {
      if (r.status === 401) setBancoConectado(false);
      return r.erro ?? "Não foi possível salvar o produto.";
    }
    const salvo = r.dados.produto;
    setProdutos((lista) => (novo ? [...lista, salvo] : lista.map((x) => (x.id === salvo.id ? salvo : x))));
    toast.success(novo ? `Produto cadastrado (${salvo.codigo}).` : "Alterações salvas.");
    return null;
  };

  // Remove um produto do catálogo
  const excluirProduto = async (id: number) => {
    const r = await api(`/api/produtos/${id}`, { metodo: "DELETE" });
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível excluir o produto.", { duration: 8000 });
      return;
    }
    setProdutos((lista) => lista.filter((p) => p.id !== id));
    toast.success("Produto excluído.");
  };

  // Ajuste rápido de estoque (tela Estoque): soma/subtrai ou define um número,
  // no geral, numa cor ou num tamanho. O servidor faz a conta com o estoque DE
  // AGORA (as vendas do meio do caminho não somem) e devolve o produto certo.
  const ajustarEstoque = async (
    id: number,
    ajuste: { delta?: number; definir?: number; cor?: string; tamanho?: string }
  ): Promise<string | null> => {
    const r = await api<{ produto: Produto }>(`/api/produtos/${id}/estoque`, { metodo: "PATCH", corpo: ajuste });
    if (!r.ok || !r.dados?.produto) return r.erro ?? "Não foi possível ajustar o estoque.";
    const atual = r.dados.produto;
    setProdutos((lista) => lista.map((x) => (x.id === atual.id ? atual : x)));
    return null;
  };

  // Atualiza na hora o resumo (estrelas + quantidade) de um produto depois que
  // uma avaliação é enviada ou excluída — o pedido de verdade (POST/DELETE em
  // /api/avaliacoes) já fica salvo no banco; isso só reflete no estado local
  // pra não precisar recarregar a página inteira pra ver o novo resumo.
  const atualizarResumoAvaliacoes = (produtoId: number, rating: number, reviews: number) =>
    setProdutos((anterior) => anterior.map((p) => (p.id === produtoId ? { ...p, rating, reviews } : p)));

  // Atualiza o status de um pedido (Processando, Entregue...). Ação do
  // Admin sobre UM pedido — usa o endpoint pontual, não reescreve a tabela
  // inteira (que é compartilhada e pode ter pedidos novíssimos de outros
  // clientes comprando ao mesmo tempo).
  // Admin mexe em UM pedido: status e/ou código de rastreio dos Correios.
  // Só as chaves informadas vão para o servidor — mandar codigoRastreio: ""
  // apaga o código, não mandar a chave deixa o que já estava.
  const atualizarStatusPedido = (
    id: string,
    mudancas: { status?: string; codigoRastreio?: string; entregador?: string | null },
  ) => {
    const anterior = pedidos.find((o) => o.id === id);
    setPedidos((lista) => lista.map((o) => (o.id === id ? { ...o, ...mudancas } : o)));
    // encodeURIComponent é obrigatório aqui: o número do pedido começa com "#"
    // (ex.: "#CP-A0"), e "#" numa URL significa "âncora" — o navegador corta
    // tudo dali em diante e nunca envia ao servidor.
    chamarServidor(`/api/pedidos/${encodeURIComponent(id)}`, "PATCH", mudancas).then(({ ok, dados, erro }) => {
      if (!ok) {
        // O servidor recusou (ex.: reabrir pedido cancelado): a tela volta ao
        // que está gravado, com o motivo.
        toast.error(erro ?? "Não foi possível atualizar o pedido.", { duration: 8000 });
        if (anterior) setPedidos((lista) => lista.map((o) => (o.id === id ? anterior : o)));
        return;
      }
      // Confirmar pagamento ou cancelar mexe na compra INTEIRA (todas as
      // linhas do carrinho), no estoque e nas comissões: recarrega do banco.
      if (dados?.compraPaga || dados?.compraCancelada || mudancas.status === "Cancelado") {
        setRecargaBanco((n) => n + 1);
        if (dados?.compraPaga) toast.success("Pagamento confirmado. O cliente foi avisado.");
      }
    });
  };

  // Admin escolhe quem leva o pedido. Vai pela mesma rota do status (PATCH de
  // uma linha só); o servidor confere que a conta escolhida tem mesmo o cargo
  // de entregador — senão o pedido ficaria preso com alguém que não enxerga o
  // painel de entregas.
  const definirEntregadorDoPedido = (id: string, email: string | null) =>
    atualizarStatusPedido(id, { entregador: email });

  // Insere o produto no carrinho respeitando o estoque disponível. Cores
  // diferentes do mesmo produto viram linhas separadas no carrinho (cada uma
  // com a própria foto e o próprio estoque), por isso a identidade da linha
  // é id + cor escolhida, não só o id.
  const colocarNoCarrinho = (produto: Produto) => {
    setCarrinho((anterior) => {
      const existente = anterior.find((i) => i.id === produto.id && i.corEscolhida === produto.corEscolhida);
      if (existente) {
        // Não deixa colocar no carrinho mais do que o estoque disponível
        if (existente.qty >= produto.stock) return anterior;
        return anterior.map((i) =>
          i.id === produto.id && i.corEscolhida === produto.corEscolhida ? { ...i, qty: i.qty + 1 } : i
        );
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

  // "Comprar agora": põe no carrinho e vai direto para o checkout. Visitante
  // passa antes pelo cadastro (e volta com o produto no carrinho).
  const comprarAgora = (produto: Produto) => {
    if (!usuario) {
      adicionarAoCarrinho(produto);
      return;
    }
    if (produto.stock <= 0) return;
    colocarNoCarrinho(produto);
    setToastAdicionado(null);
    setProdutoSelecionado(null);
    setTela("checkout");
    window.scrollTo({ top: 0 });
  };

  // Abre a página de um produto na loja. É o atalho de "revisitar o produto"
  // que sai dos pedidos, das notificações e das recomendações — todos guardam
  // só o id do produto, e quem sabe navegar é aqui.
  const abrirProdutoNaLoja = (produto: Produto) => {
    setProdutoSelecionado(produto);
    setVerSoFavoritos(false);
    setTela("loja");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Mesma coisa, mas já rolando até as avaliações e com o formulário à mão.
  // É para onde vai quem toca em "Avaliar minha compra" — no aviso de entrega
  // (celular/e-mail) ou no sininho da loja.
  const abrirAvaliacaoDoProduto = (produto: Produto) => {
    setProdutoSelecionado(produto);
    setIrParaAvaliacoes(true);
    setVerSoFavoritos(false);
    setTela("loja");
  };

  // Notificação tocada no celular: o endereço vem com "?produto=12" e o site
  // abre direto na página daquele produto (ver sw.js e avisos.php). Espera o
  // catálogo chegar do banco — antes disso não há o que abrir — e acontece uma
  // vez só: depois disso o parâmetro sai da URL e a ref impede a repetição.
  const [produtoDoLink] = useState<number | null>(() => {
    const valor = Number(new URLSearchParams(window.location.search).get("produto"));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  });
  // "&avaliar=1" no fim do link: o aviso de entrega manda a pessoa direto para
  // a área de avaliação, e não só para a página do produto.
  const [avaliarPeloLink] = useState(
    () => new URLSearchParams(window.location.search).get("avaliar") === "1"
  );
  const linkDeProdutoUsado = useRef(false);

  useEffect(() => {
    if (produtoDoLink === null || linkDeProdutoUsado.current || produtos.length === 0) return;
    linkDeProdutoUsado.current = true;
    const produto = produtos.find((p) => p.id === produtoDoLink);
    if (produto) {
      setProdutoSelecionado(produto);
      setIrParaAvaliacoes(avaliarPeloLink);
      setTela("loja");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("produto");
    url.searchParams.delete("avaliar");
    window.history.replaceState({}, "", url.toString());
  }, [produtoDoLink, avaliarPeloLink, produtos]);

  // ── Recomendações e ofertas ───────────────────────────────────────────────
  // O que a conta já comprou é a base do gosto dela; daí saem as sugestões que
  // aparecem na tela de compra concluída, no sino de notificações e no pop-up
  // discreto da vitrine. Sem compra nenhuma (visitante), a lista vira as
  // ofertas da loja — ver recomendacoes.ts.
  const pedidosDoCliente = useMemo(
    () => (usuario ? pedidos.filter((o) => o.email.toLowerCase() === usuario.email.toLowerCase()) : []),
    [pedidos, usuario]
  );
  const compradosPeloCliente = useMemo(
    () => produtosComprados(pedidosDoCliente, produtos),
    [pedidosDoCliente, produtos]
  );
  const recomendacoes = useMemo(
    () => recomendarProdutos(compradosPeloCliente, produtos, QTD_RECOMENDACOES, sinaisVitrine),
    [compradosPeloCliente, produtos, sinaisVitrine]
  );

  // Os sinais mudam devagar (o servidor guarda a conta por 10 minutos):
  // uma busca por visita basta. Sem resposta, as prateleiras usam o catálogo.
  useEffect(() => {
    api<SinaisVitrine>("/api/vitrine").then((r) => {
      if (r.ok && r.dados) {
        setSinaisVitrine({ maisVendidos: r.dados.maisVendidos ?? [], compradosJuntos: r.dados.compradosJuntos ?? {} });
      }
    });
  }, []);

  // Pop-up de recomendação. As regras existem para ele NÃO atrapalhar: só na
  // vitrine (nunca no carrinho, no pagamento ou dentro de um produto), depois
  // de um tempo navegando, uma vez por visita — e, se a pessoa fechou, nada de
  // recomendação por um dia inteiro.
  const [popupRecomendado, setPopupRecomendado] = useState<Produto | null>(null);
  const popupJaMostrado = useRef(false);

  useEffect(() => {
    if (popupJaMostrado.current || popupRecomendado) return;
    if (tela !== "loja" || produtoSelecionado || recomendacoes.length === 0) return;
    const dispensadoEm = lerArmazenamento<number>("cp_reco_dispensada", 0);
    if (Date.now() - dispensadoEm < ESPERA_APOS_DISPENSAR_RECOMENDACAO) return;

    const relogio = setTimeout(() => {
      popupJaMostrado.current = true;
      setPopupRecomendado(recomendacoes[0]);
    }, ATRASO_POPUP_RECOMENDACAO);
    return () => clearTimeout(relogio);
  }, [tela, produtoSelecionado, recomendacoes, popupRecomendado]);

  const fecharPopupRecomendado = () => {
    setPopupRecomendado(null);
    try {
      localStorage.setItem("cp_reco_dispensada", JSON.stringify(Date.now()));
    } catch {
      // localStorage indisponível (modo privado) — sem problema, a regra de
      // "uma vez por visita" já segura o pop-up nesta sessão
    }
  };

  // ── Monte sua Caixa ──────────────────────────────────────────────────────
  // Abre a área de montagem. Com uma caixa em mãos, reabre exatamente como o
  // cliente deixou (é o "Editar caixa" do carrinho).
  const abrirMontagemDeCaixa = (caixa?: CaixaMontada | null) => {
    setCaixaEmEdicao(caixa ?? null);
    setProdutoSelecionado(null);
    setTela("montar-caixa");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // A caixa montada entra no carrinho como UMA linha (ver
  // linhaDeCarrinhoDaCaixa). Editar uma caixa que já está lá atualiza a linha
  // no lugar — o id da linha vem do id da montagem, então não duplica.
  const colocarCaixaNoCarrinho = (caixa: CaixaMontada) => {
    const linha = linhaDeCarrinhoDaCaixa(caixa, produtos);
    setCarrinho((anterior) =>
      anterior.some((i) => i.id === linha.id)
        ? anterior.map((i) =>
            i.id === linha.id
              ? { ...linha, qty: Math.max(1, Math.min(i.qty, linha.stock)) }
              : i
          )
        : [...anterior, linha]
    );
    setToastAdicionado({ p: linha, key: Date.now() });
  };

  // Fim da montagem: igual à compra de um produto, exige cadastro. A caixa
  // pronta fica guardada durante o cadastro para não se perder o trabalho.
  const concluirMontagemDeCaixa = (caixa: CaixaMontada) => {
    if (!usuario) {
      setCaixaPendente(caixa);
      setModoTelaLogin("cadastro");
      setAvisoTelaLogin("Crie sua conta para finalizar a sua caixa");
      setTela("login");
      return;
    }
    colocarCaixaNoCarrinho(caixa);
    setCaixaEmEdicao(null);
    setTela("carrinho");
  };

  const abrirTelaCadastro = () => {
    setModoTelaLogin("cadastro");
    setAvisoTelaLogin("");
    setProdutoPendente(null);
    setTela("login");
  };

  // Botão "Entrar" do cabeçalho: abre direto a tela de login (não a de cadastro)
  const abrirTelaLogin = () => {
    setModoTelaLogin("login");
    setAvisoTelaLogin("");
    setProdutoPendente(null);
    setTela("login");
  };

  // "Continuar a compra" no carrinho: exige conta e abre o checkout (entrega →
  // pagamento → revisão).
  const irParaCheckout = () => {
    if (!usuario) {
      setModoTelaLogin("cadastro");
      setAvisoTelaLogin("Crie sua conta para finalizar a compra");
      setTela("login");
      return;
    }
    if (carrinho.length === 0) return;
    setTela("checkout");
    window.scrollTo({ top: 0 });
  };

  // Linhas do carrinho no formato que o servidor entende: produto solto (com a
  // cor escolhida) ou caixa montada (recipiente, tamanho, conteúdo e cartão).
  // Vai só O QUE se compra — preço e total quem calcula é o servidor.
  const linhasParaOServidor = () =>
    carrinho.map((item) =>
      item.caixa
        ? {
            qty: item.qty,
            caixa: {
              recipienteId: item.caixa.recipienteId,
              tamanho: item.caixa.recipienteTamanho ?? null,
              itens: item.caixa.itens.map((i) => ({ produtoId: i.produtoId, qty: i.qty })),
              para: item.caixa.para ?? "",
              de: item.caixa.de ?? "",
              mensagem: item.caixa.mensagem ?? "",
            },
          }
        : { produtoId: item.id, qty: item.qty, cor: item.corEscolhida ?? null }
    );

  // "Confirmar e pagar" no checkout: o servidor confere preço, estoque, frete,
  // cupom e código de venda, reserva os produtos e cria a compra "Aguardando
  // pagamento". Devolve a mensagem de erro para a tela, ou null.
  const criarCompra = async (dados: DadosPagamento): Promise<string | null> => {
    const r = await api<{ compra: Compra }>("/api/checkout", {
      corpo: {
        linhas: linhasParaOServidor(),
        metodo: dados.metodo,
        parcelas: dados.parcelas,
        cupom: dados.cupom,
        codigoVenda: dados.codigoVenda,
        endereco: dados.endereco,
        // Se o cliente voltou do pagamento e mudou algo, a compra anterior
        // (ainda não paga) é desfeita e o estoque dela volta antes de reservar de novo
        substituirCompra: compraAtual?.status === "aguardando_pagamento" ? compraAtual.id : undefined,
      },
    });
    if (!r.ok || !r.dados?.compra) {
      if (r.status === 401) {
        setModoTelaLogin("login");
        setAvisoTelaLogin("Sua sessão expirou. Entre de novo para finalizar a compra.");
        setTela("login");
      }
      return r.erro ?? "Não foi possível registrar sua compra.";
    }
    setCompraAtual(r.dados.compra);
    setTela("pagamento");
    window.scrollTo({ top: 0 });
    // O estoque mudou (reserva): a vitrine se atualiza em segundo plano
    setRecargaBanco((n) => n + 1);
    return null;
  };

  // Retoma o pagamento de uma compra que ficou "Aguardando pagamento" (link
  // "Pagar agora" nos pedidos do cliente).
  const retomarPagamento = async (compraId: string) => {
    const r = await api<{ compra: Compra }>(`/api/compras/${compraId}`);
    if (!r.ok || !r.dados?.compra) {
      toast.error(r.erro ?? "Não foi possível abrir esta compra.");
      return;
    }
    if (r.dados.compra.status === "paga") {
      toast.success("Esta compra já está paga.");
      setRecargaBanco((n) => n + 1);
      return;
    }
    setCompraAtual(r.dados.compra);
    setTela("pagamento");
    window.scrollTo({ top: 0 });
  };

  // O servidor confirmou o pagamento: carrinho vazio, dados recarregados
  // (pedidos novos, estoque) e a tela "Pronto!".
  const aoCompraAprovada = (compra: Compra) => {
    const idsComprados = new Set(compra.pedidos.map((p) => p.produtoId).filter(Boolean) as number[]);
    setProdutosUltimaCompra(produtos.filter((p) => idsComprados.has(p.id)));
    setTotalUltimaCompra(compra.total);
    setCompraConcluida(compra);
    setCompraAtual(null);
    setCarrinho([]);
    setRecargaBanco((n) => n + 1);
    setTela("sucesso");
    window.scrollTo({ top: 0 });
  };

  // Cada linha do carrinho é identificada por id + cor escolhida (cores
  // diferentes do mesmo produto viram linhas separadas)
  const removerDoCarrinho = (id: number, corEscolhida?: string) =>
    setCarrinho((anterior) => anterior.filter((i) => !(i.id === id && i.corEscolhida === corEscolhida)));
  // Não deixa a quantidade no carrinho passar do estoque disponível do produto
  const mudarQtd = (id: number, variacao: number, corEscolhida?: string) =>
    setCarrinho((anterior) =>
      anterior.map((i) =>
        i.id === id && i.corEscolhida === corEscolhida
          ? { ...i, qty: Math.max(0, Math.min(i.qty + variacao, i.stock)) }
          : i
      ).filter((i) => i.qty > 0)
    );
  const alternarFavorito = (id: number) =>
    setFavoritos((anterior) => anterior.includes(id) ? anterior.filter((x) => x !== id) : [...anterior, id]);

  const totalCarrinho = carrinho.reduce((acum, i) => acum + i.price * i.qty, 0);
  const qtdCarrinho = carrinho.reduce((acum, i) => acum + i.qty, 0);

  // Pedidos do cliente com status em andamento — vira o número no sino de
  // notificações do menu inferior (mobile)
  const qtdNotificacoesCliente = usuario
    ? pedidos.filter(
        (o) =>
          o.email.toLowerCase() === usuario.email.toLowerCase() &&
          (o.status === "Aguardando pagamento" || o.status === "Processando" || o.status === "Em trânsito")
      ).length
    : 0;

  // Nome do dono de um código de venda (null = não reconhecido). Só contas que
  // VENDEM têm código — entregador fica de fora. É só para mostrar ao cliente
  // de quem é o código; quem decide de verdade é o servidor no checkout.
  const nomeDoDonoDoCodigo = (codigo: string): string | null => {
    const limpo = codigo.trim().toUpperCase();
    if (!limpo) return null;
    const email = Object.keys(cargos).find((e) => cargos[e] !== "entregador" && codigoVendaDe(e) === limpo);
    if (!email) return null;
    return clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;
  };
  const vendedorVinculado = usuario
    ? clientes.find((c) => c.email.toLowerCase() === usuario.email.toLowerCase())?.vendedorVinculado ?? null
    : null;

  // Produtos que a LOJA mostra: tudo menos as caixas. Os recipientes da
  // categoria "Caixas" não são presente que alguém compre sozinho — eles são
  // a base do Monte sua Caixa e só fazem sentido lá dentro. Antes apareciam na
  // vitrine, na busca, nos "mais vendidos" e nos relacionados da página de
  // produto; agora toda a loja parte desta lista. Quem precisa do catálogo
  // completo (o painel Admin e o próprio Monte sua Caixa) continua recebendo
  // `produtos`, e o histórico de pedidos também — senão uma caixa já
  // comprada perderia nome e foto lá no perfil.
  const produtosDaVitrine = useMemo(
    () => produtos.filter((p) => p.category !== CATEGORIA_CAIXA),
    [produtos]
  );

  // A coleção aberta por inteiro, já na ordem dela
  const listaDaColecao = useMemo((): Produto[] | null => {
    switch (colecao) {
      case "ofertas": return produtosDaVitrine.filter(estaEmOferta).sort((a, b) => descontoDe(b) - descontoDe(a));
      case "para-voce": return recomendarProdutos(compradosPeloCliente, produtosDaVitrine, 40, sinaisVitrine);
      case "mais-vendidos": return maisVendidosDaLoja(produtosDaVitrine, 40, sinaisVitrine);
      case "novidades": return [...produtosDaVitrine].sort((a, b) => b.id - a.id).slice(0, 40);
      case "todos": return produtosDaVitrine;
      default: return null;
    }
  }, [colecao, produtosDaVitrine, compradosPeloCliente, sinaisVitrine]);

  const produtosFiltrados = useMemo(() => {
    const dentroDaFaixa = (preco: number): boolean => {
      switch (faixaPreco) {
        case "ate-50": return preco <= 50;
        case "50-150": return preco > 50 && preco <= 150;
        case "150-300": return preco > 150 && preco <= 300;
        case "acima-300": return preco > 300;
        default: return true;
      }
    };
    const filtrados = (listaDaColecao ?? produtosDaVitrine).filter((p) => {
      if (verSoFavoritos && !favoritos.includes(p.id)) return false;
      const termo = busca.trim().toLowerCase();
      const matchSearch =
        !termo ||
        p.name.toLowerCase().includes(termo) ||
        p.brand.toLowerCase().includes(termo) ||
        p.category.toLowerCase().includes(termo);
      // Com uma busca digitada, procura em todas as categorias — só filtra
      // pela categoria selecionada quando o campo de busca está vazio.
      // Em "só favoritos" a categoria não filtra: são poucos itens, mistura tudo.
      const matchCat = termo || verSoFavoritos || listaDaColecao ? true : categoriaSelecionada === "Outros" || p.category === categoriaSelecionada;
      if (!matchCat || !matchSearch) return false;
      if (!dentroDaFaixa(p.price)) return false;
      if (avaliacaoMinFiltro > 0 && p.rating < avaliacaoMinFiltro) return false;
      // Compara sem diferenciar maiúsculas: a lista de marcas junta as
      // escritas diferentes do mesmo nome numa opção só (ver marcasDisponiveis),
      // então escolher "Sumax" precisa trazer também os cadastrados "SUMAX".
      if (marcaFiltro && p.brand?.trim().toLowerCase() !== marcaFiltro.trim().toLowerCase()) return false;
      if (apenasEstoqueFiltro && p.stock <= 0) return false;
      return true;
    });

    const ordenados = [...filtrados];
    switch (ordenacao) {
      case "menor-preco": ordenados.sort((a, b) => a.price - b.price); break;
      case "maior-preco": ordenados.sort((a, b) => b.price - a.price); break;
      case "avaliacao": ordenados.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews); break;
      case "novidade": ordenados.sort((a, b) => b.id - a.id); break;
      // "relevancia": mantém a ordem do catálogo (curadoria do Admin) ou a
      // da coleção aberta (maior desconto, mais vendido…)
    }
    return ordenados;
  }, [categoriaSelecionada, busca, produtosDaVitrine, listaDaColecao, verSoFavoritos, favoritos, faixaPreco, avaliacaoMinFiltro, marcaFiltro, apenasEstoqueFiltro, ordenacao]);

  // Nova listagem (outra categoria, busca, filtro…) começa da primeira página
  useEffect(() => {
    setQtdVisivel(POR_PAGINA);
  }, [categoriaSelecionada, busca, colecao, verSoFavoritos, faixaPreco, avaliacaoMinFiltro, marcaFiltro, apenasEstoqueFiltro, ordenacao]);

  // Marcas disponíveis dentro do recorte atual (categoria/busca/favoritos),
  // pra não oferecer no filtro uma marca que não tem nenhum produto ali
  const marcasDisponiveis = useMemo(() => {
    const base = produtosDaVitrine.filter((p) => {
      if (verSoFavoritos) return favoritos.includes(p.id);
      const termo = busca.trim().toLowerCase();
      if (termo) return p.name.toLowerCase().includes(termo) || p.brand.toLowerCase().includes(termo) || p.category.toLowerCase().includes(termo);
      return categoriaSelecionada === "Outros" || p.category === categoriaSelecionada;
    });
    // O campo "marca" é digitado à mão no cadastro, então o mesmo fabricante
    // chega escrito de vários jeitos ("SUMAX", "Sumax", "sumax") e muitos
    // produtos vêm com um preenchimento de ocasião ("nenhum", "NENHUMA", ".").
    // Listados crus, viravam 70 opções — várias repetidas e várias sem
    // sentido — e o filtro por marca ficava inútil justamente onde ele mais
    // ajuda a fechar uma venda. Aqui cada marca aparece uma vez só, e as de
    // preenchimento não aparecem.
    const semMarca = new Set(["nenhum", "nenhuma", "none", "sem marca", "n/a", "na", "-", ".", "?"]);
    const porChave = new Map<string, string>();
    for (const p of base) {
      const marca = (p.brand ?? "").trim();
      const chave = marca.toLowerCase();
      if (!marca || semMarca.has(chave)) continue;
      // Entre "SUMAX" e "Sumax", fica a escrita mais legível (a que não é toda
      // em maiúsculas), para a lista não virar um grito.
      const atual = porChave.get(chave);
      if (!atual || (atual === atual.toUpperCase() && marca !== marca.toUpperCase())) {
        porChave.set(chave, marca);
      }
    }
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtosDaVitrine, categoriaSelecionada, busca, verSoFavoritos, favoritos]);

  // Categorias que a loja mostra no menu: só as que têm produto. Uma
  // categoria vazia no menu é um beco sem saída — a pessoa clica em
  // "Eletrônicos", encontra uma prateleira vazia e vai embora achando que a
  // loja não tem nada. Assim que o Admin cadastrar o primeiro produto da
  // categoria, ela volta ao menu sozinha (o cadastro do painel continua
  // oferecendo a lista completa). "Outros" fica sempre: é o botão que
  // significa "ver tudo".
  const categoriasComProduto = useMemo(() => {
    const comEstoqueNoCatalogo = new Set(produtosDaVitrine.map((p) => p.category));
    return CATEGORIAS_VITRINE.filter((c) => c === "Outros" || comEstoqueNoCatalogo.has(c));
  }, [produtosDaVitrine]);

  // As prateleiras da home. Cada produto aparece em uma só (a primeira em que
  // entrar), para a página não repetir o mesmo item três vezes.
  const prateleiras = useMemo(() => {
    const usados = new Set<number>();
    const semRepetir = (lista: Produto[], n = 10) => {
      const livres = lista.filter((p) => !usados.has(p.id)).slice(0, n);
      livres.slice(0, 5).forEach((p) => usados.add(p.id));
      return livres;
    };
    const ofertas = semRepetir(ofertasEmDestaque(produtosDaVitrine, 20));
    const paraVoce = semRepetir(recomendarProdutos(compradosPeloCliente, produtosDaVitrine, 20, sinaisVitrine));
    const maisVendidos = semRepetir(maisVendidosDaLoja(produtosDaVitrine, 20, sinaisVitrine));
    const novidades = semRepetir(
      produtosDaVitrine.filter((p) => p.stock > 0).sort((a, b) => b.id - a.id).slice(0, 20)
    );
    // Uma fileira por categoria: os mais vendidos dela primeiro, depois os
    // de melhor nota. Esgotado não entra na vitrine.
    const posicaoVenda = (p: Produto) => {
      const i = sinaisVitrine.maisVendidos.indexOf(p.id);
      return i < 0 ? Infinity : i;
    };
    const porCategoria = categoriasComProduto
      .filter((c) => c !== "Outros")
      .map((categoria) => ({
        categoria,
        produtos: produtosDaVitrine
          .filter((p) => p.category === categoria && p.stock > 0)
          .sort((a, b) => posicaoVenda(a) - posicaoVenda(b) || b.rating - a.rating || b.id - a.id)
          .slice(0, 5),
      }))
      .filter((g) => g.produtos.length >= 2);
    return { ofertas, paraVoce, maisVendidos, novidades, porCategoria };
  }, [produtosDaVitrine, compradosPeloCliente, sinaisVitrine, categoriasComProduto]);

  const filtrosDeCatalogoAtivos = faixaPreco !== "" || avaliacaoMinFiltro > 0 || marcaFiltro !== "" || apenasEstoqueFiltro;
  const limparFiltrosDeCatalogo = () => {
    setFaixaPreco(""); setAvaliacaoMinFiltro(0); setMarcaFiltro(""); setApenasEstoqueFiltro(false); setOrdenacao("relevancia");
  };

  // Home "limpa": sem categoria/busca/favoritos filtrando — é quando faz
  // sentido mostrar as seções de vitrine (categorias, mais vendidos, etc.),
  // em vez de competir com o resultado de uma navegação específica.
  const naHomeLimpa = categoriaSelecionada === "Outros" && busca.trim() === "" && !verSoFavoritos && !colecao;

  // Após login/cadastro: a conta já foi criada/conferida no backend pela
  // própria TelaLogin (senha com hash, ou Google verificado de verdade) —
  // aqui só atualiza o estado local e retoma a compra pendente. A ativação
  // do código de vendedor acontece no perfil do cliente — ver ativarCodigoVendedor.
  const processarLogin = (u: Usuario, viaGoogle?: boolean) => {
    setUsuario(u);
    // Recarrega o banco já autenticado: agora o backend libera os pedidos e a
    // equipe desta conta (deslogado, a resposta traz só a vitrine)
    setRecargaBanco((n) => n + 1);
    const emailLimpo = u.email.toLowerCase();
    // Só o Administrador não entra na lista de clientes da loja — o Master
    // agora é só uma conta comum com o cargo de Master, então precisa
    // aparecer em clientes (é de lá que o Admin escolhe quem promover)
    if (emailLimpo === EMAIL_ADMIN) {
      setTela(produtoPendente || caixaPendente ? "carrinho" : "loja");
      if (produtoPendente) { colocarNoCarrinho(produtoPendente); setProdutoPendente(null); }
      if (caixaPendente) { colocarCaixaNoCarrinho(caixaPendente); setCaixaPendente(null); setCaixaEmEdicao(null); }
      setAvisoTelaLogin("");
      return;
    }
    const clienteExistente = clientes.find((c) => c.email === u.email);
    if (!clienteExistente) {
      setClientes((anterior) => [
        ...anterior,
        {
          name: u.name,
          email: u.email,
          since: new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
          criadoEm: new Date().toISOString().slice(0, 10),
          viaGoogle: Boolean(viaGoogle),
        },
      ]);
    } else if (viaGoogle) {
      setClientes((anterior) => anterior.map((c) => (c.email === u.email ? { ...c, viaGoogle: true } : c)));
    }
    if (produtoPendente) {
      colocarNoCarrinho(produtoPendente);
      setProdutoPendente(null);
      setTela("carrinho");
    } else if (caixaPendente) {
      // Caixa montada antes de ter conta — entra pronta no carrinho
      colocarCaixaNoCarrinho(caixaPendente);
      setCaixaPendente(null);
      setCaixaEmEdicao(null);
      setTela("carrinho");
    } else {
      setTela("loja");
    }
    setAvisoTelaLogin("");
  };

  // Link de "esqueci minha senha" clicado no e-mail — mostra a tela de
  // redefinição antes de qualquer outra coisa
  if (tokenRedefinirSenha) {
    return (
      <TelaRedefinirSenha
        token={tokenRedefinirSenha}
        aoConcluir={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("redefinir-senha");
          window.location.href = url.toString();
        }}
      />
    );
  }

  if (tela === "login") {
    return (
      <TelaLogin
        aoLogar={processarLogin}
        modoInicial={modoTelaLogin}
        aviso={avisoVerificacaoEmail ?? avisoTelaLogin}
        aoVoltar={() => {
          setProdutoPendente(null);
          setAvisoTelaLogin("");
          // Quem estava montando uma caixa volta para a montagem com ela
          // inteira, e não para a vitrine com tudo perdido
          if (caixaPendente) {
            setCaixaEmEdicao(caixaPendente);
            setCaixaPendente(null);
            setTela("montar-caixa");
            return;
          }
          setTela("loja");
        }}
        clientes={clientes}
      />
    );
  }

  // Verifica se o usuário logado é o administrador da loja
  const ehAdmin = usuario?.email?.toLowerCase() === EMAIL_ADMIN;
  // Cargo dado ao usuário logado (MasterPlus, Master ou Vendedor) — só o
  // Admin dá esses cargos (pode haver vários de cada)
  const cargoUsuario: Cargo | undefined = usuario ? cargos[usuario.email.toLowerCase()] : undefined;
  const ehMaster = cargoUsuario === "master";
  const ehMasterPlus = cargoUsuario === "masterplus";

  // Rótulo do botão de painel no cabeçalho (null = usuário sem painel)
  const rotuloPainel = ehAdmin
    ? "Admin"
    : ehMasterPlus
    ? "MasterPlus"
    : ehMaster
    ? "Master"
    : cargoUsuario === "vendedor"
    ? "Vendedor"
    : cargoUsuario === "entregador"
    ? "Entregador"
    : null;

  // Abre o painel certo para o usuário, já na página inicial adequada
  const abrirPainel = () => {
    if (ehAdmin) { setPaginaAdmin("dashboard"); setTela("admin"); }
    else if (ehMasterPlus) { setPaginaAdmin("dashboard"); setTela("masterplus"); }
    else if (ehMaster) { setPaginaAdmin("dashboard"); setTela("master"); }
    else if (cargoUsuario === "vendedor") { setPaginaAdmin("pedidos"); setTela("vendedor"); }
    else if (cargoUsuario === "entregador") { setPaginaAdmin("entregas"); setTela("entregador"); }
  };

  // Sair de verdade: apaga a sessão no servidor e no navegador. (O "Sair" do
  // painel antes só mostrava a tela de login — a sessão continuava valendo.)
  const sair = () => {
    const ehAdminSaindo = usuario?.email?.toLowerCase() === EMAIL_ADMIN;
    salvarNoServidor(ehAdminSaindo ? "/api/admin/logout" : "/api/clientes/logout", "POST");
    definirSessao(null);
    setUsuario(null);
    setCompraAtual(null);
    setTela("loja");
    setRecargaBanco((n) => n + 1);
  };

  // Abre o perfil do cliente (pede login se for visitante)
  // Abre uma categoria do menu. "Outros" é o "Todos os produtos".
  const verCategoria = (c: string) => {
    setCategoriaSelecionada(c);
    setColecao(c === "Outros" ? "todos" : null);
    setBusca("");
    setProdutoSelecionado(null);
    setVerSoFavoritos(false);
    window.scrollTo({ top: 0 });
  };

  // Abre uma prateleira da home por inteiro ("Ver todos")
  const verColecao = (c: Colecao) => {
    setColecao(c);
    setCategoriaSelecionada("Outros");
    setBusca("");
    setProdutoSelecionado(null);
    setVerSoFavoritos(false);
    window.scrollTo({ top: 0 });
  };

  // Volta à vitrine inicial: sem busca, sem categoria, sem produto aberto
  const irParaInicio = () => {
    setProdutoSelecionado(null);
    setColecao(null);
    setCategoriaSelecionada("Outros");
    setBusca("");
    setVerSoFavoritos(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const abrirPerfil = () => {
    if (!usuario) {
      setModoTelaLogin("login");
      setAvisoTelaLogin("Entre na sua conta para ver o seu perfil");
      setTela("login");
      return;
    }
    setTela("perfil");
  };

  // Atalho de Favoritos da barra inferior (mobile): volta pra loja já
  // filtrada nos favoritos, de qualquer tela que a pessoa estiver
  const abrirFavoritosMobile = () => {
    setProdutoSelecionado(null);
    setVerSoFavoritos(true);
    setTela("loja");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Abre as notificações do cliente (pede login se for visitante)
  const abrirNotificacoes = () => {
    if (!usuario) {
      setModoTelaLogin("login");
      setAvisoTelaLogin("Entre na sua conta para ver suas notificações");
      setTela("login");
      return;
    }
    setTela("notificacoes");
  };

  // Perfil do cliente: pedidos por status, cupons e categorias
  if (tela === "perfil" && usuario) {
    return (
      <>
        <TelaPerfil
          usuario={usuario}
          pedidos={pedidosDoCliente}
          produtos={produtos}
          cupons={cupons.filter(cupomEstaValido)}
          desde={clientes.find((c) => c.email.toLowerCase() === usuario.email.toLowerCase())?.since}
          aoVerCategoria={(c) => { verCategoria(c); setTela("loja"); }}
          aoVerProduto={abrirProdutoNaLoja}
          aoVoltar={() => setTela("loja")}
          aoSair={sair}
          aoAbrirNotificacoes={abrirNotificacoes}
          aoAbrirAjuda={() => { setPaginaInstitucional("ajuda"); setTela("institucional"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          rotuloPainel={rotuloPainel}
          aoAbrirPainel={abrirPainel}
          cargoUsuario={cargoUsuario}
          aoAtivarCodigo={ativarCodigoVendedor}
          aoPagarCompra={retomarPagamento}
        />
        <BarraInferiorMobile
          ativa="perfil"
          qtdCarrinho={qtdCarrinho}
          qtdFavoritos={favoritos.length}
          aoIrInicio={() => { setProdutoSelecionado(null); setTela("loja"); }}
          aoAbrirFavoritos={abrirFavoritosMobile}
          aoAbrirCarrinho={() => setTela("carrinho")}
          aoAbrirPerfil={() => {}}
          aoAbrirNotificacoes={abrirNotificacoes}
          qtdNotificacoes={qtdNotificacoesCliente}
        />
        {avisoVendedorAtivado && (
          <ModalVendedorAtivado
            aoFechar={() => setAvisoVendedorAtivado(false)}
            aoAbrirPainel={() => { setAvisoVendedorAtivado(false); abrirPainel(); }}
          />
        )}
        {bancoConectado === false && <AvisoBancoDesconectado />}
      </>
    );
  }

  // Páginas de conteúdo do rodapé: Institucional e Atendimento
  if (tela === "institucional") {
    return (
      <>
        <TelaInstitucional
          pagina={paginaInstitucional}
          aoTrocarPagina={setPaginaInstitucional}
          aoVoltar={() => setTela("loja")}
          pedidos={usuario ? pedidos.filter((o) => o.email.toLowerCase() === usuario.email.toLowerCase()) : []}
          produtos={produtosDaVitrine}
          emailUsuario={usuario?.email}
          pedidoInicial={pedidoDoLink ?? undefined}
          aoVerPedidos={abrirNotificacoes}
        />
        <BarraInferiorMobile
          ativa="inicio"
          qtdCarrinho={qtdCarrinho}
          qtdFavoritos={favoritos.length}
          aoIrInicio={() => { setProdutoSelecionado(null); setTela("loja"); }}
          aoAbrirFavoritos={abrirFavoritosMobile}
          aoAbrirCarrinho={() => setTela("carrinho")}
          aoAbrirPerfil={abrirPerfil}
          aoAbrirNotificacoes={abrirNotificacoes}
          qtdNotificacoes={qtdNotificacoesCliente}
        />
        {bancoConectado === false && <AvisoBancoDesconectado />}
      </>
    );
  }

  // Notificações do cliente: status dos pedidos (substitui "Categorias" no menu mobile)
  if (tela === "notificacoes" && usuario) {
    return (
      <>
        <TelaNotificacoesCliente
          pedidos={pedidosDoCliente}
          produtos={produtos}
          recomendacoes={recomendacoes}
          compradosPeloCliente={compradosPeloCliente}
          aoVerProduto={abrirProdutoNaLoja}
          aoAvaliarProduto={abrirAvaliacaoDoProduto}
          aoPagarCompra={retomarPagamento}
          aoVoltar={() => setTela("loja")}
        />
        <BarraInferiorMobile
          ativa="notificacoes"
          qtdCarrinho={qtdCarrinho}
          qtdFavoritos={favoritos.length}
          aoIrInicio={() => { setProdutoSelecionado(null); setTela("loja"); }}
          aoAbrirFavoritos={abrirFavoritosMobile}
          aoAbrirCarrinho={() => setTela("carrinho")}
          aoAbrirPerfil={abrirPerfil}
          aoAbrirNotificacoes={() => {}}
          qtdNotificacoes={0}
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
        aoVerProdutoNaLoja={abrirProdutoNaLoja}
        aoDefinirEntregador={definirEntregadorDoPedido}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        aoDefinirCargo={definirCargo}
        recrutamentos={recrutamentos}
        vinculosMasterPlus={vinculosMasterPlus}
        cupons={cupons}
        aoSalvarCupom={salvarCupom}
        aoExcluirCupom={excluirCupom}
        banners={banners}
        aoSalvarBanner={salvarBanner}
        aoExcluirBanner={excluirBanner}
        config={config}
        aoSalvarConfig={salvarConfig}
        aoAjustarEstoque={ajustarEstoque}
        bancoOffline={bancoConectado === false}
        aoAtualizarResumoAvaliacoes={atualizarResumoAvaliacoes}
        aoSair={sair}
      />
    );
  }

  // Painel Master: como o admin, mas SEM a página de Produtos e COM as páginas
  // Meus Vendedores (cadastra vendedores por código), Equipe & Cargos (dá o
  // cargo de Vendedor direto por e-mail) e Minha Rede (gráfico da equipe).
  // Um Master promovido por um MasterPlus ganha 1% sobre a própria equipe em
  // vez do padrão configurável (o restante vira repasse ao MasterPlus).
  if (tela === "master" && ehMaster) {
    return (
      <PainelAdmin
        modo="master"
        config={config}
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
        aoVerProdutoNaLoja={abrirProdutoNaLoja}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        aoDefinirCargo={definirCargo}
        recrutamentos={recrutamentos}
        vinculosMasterPlus={vinculosMasterPlus}
        aoCadastrarVendedor={(nome, email) =>
          usuario
            ? cadastrarVendedor(usuario.email, nome, email)
            : Promise.resolve({ erro: "Você precisa estar logado." })
        }
        codigoVenda={usuario ? codigoVendaDe(usuario.email) : undefined}
        bancoOffline={bancoConectado === false}
        aoSair={sair}
      />
    );
  }

  // Painel MasterPlus: monta a própria equipe de vendedores (como um Master)
  // e ainda pode promover um vendedor de destaque da própria equipe a
  // Master (página Promover a Master) e ver a rede completa (página Rede).
  // Ganha 7% fixo sobre a própria venda pessoal (código pessoal) além da
  // comissão de rede (equipe própria + repasse).
  if (tela === "masterplus" && ehMasterPlus) {
    return (
      <PainelAdmin
        modo="masterplus"
        config={config}
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
        aoVerProdutoNaLoja={abrirProdutoNaLoja}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        aoDefinirCargo={definirCargo}
        recrutamentos={recrutamentos}
        vinculosMasterPlus={vinculosMasterPlus}
        aoCadastrarVendedor={(nome, email) =>
          usuario
            ? cadastrarVendedor(usuario.email, nome, email)
            : Promise.resolve({ erro: "Você precisa estar logado." })
        }
        aoPromoverMaster={(vendedorEmail) =>
          usuario ? promoverVendedorAMaster(usuario.email, vendedorEmail) : "Você precisa estar logado."
        }
        codigoVenda={usuario ? codigoVendaDe(usuario.email) : undefined}
        bancoOffline={bancoConectado === false}
        aoSair={sair}
      />
    );
  }

  // Painel do Vendedor: só divulga os produtos da loja (não tem catálogo
  // próprio) e acompanha as vendas creditadas ao código de venda dele.
  // Vendedor NÃO pode recrutar — o painel não tem nenhuma função de recrutamento.
  // O catálogo vai junto só para a foto do produto de cada venda: o menu dele
  // não tem página de Produtos, e salvar/excluir produto aqui não faz nada.
  if (tela === "vendedor" && usuario && cargoUsuario === "vendedor") {
    const emailVendedor = usuario.email.toLowerCase();
    return (
      <PainelAdmin
        modo="vendedor"
        config={config}
        pagina={paginaAdmin}
        setPagina={setPaginaAdmin}
        setTela={setTela}
        menuMobileAberto={menuMobileAdmin}
        setMenuMobileAberto={setMenuMobileAdmin}
        usuario={usuario}
        pedidos={pedidos.filter((o) => o.vendedor?.toLowerCase() === emailVendedor)}
        clientes={clientes}
        produtos={produtos}
        aoSalvarProduto={() => {}}
        aoExcluirProduto={() => {}}
        aoVerProdutoNaLoja={abrirProdutoNaLoja}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={[]}
        codigoVenda={codigoVendaDe(emailVendedor)}
        bancoOffline={bancoConectado === false}
        aoSair={sair}
      />
    );
  }

  // Painel do Entregador: uma página só — as entregas que o Admin designou
  // para esta conta. Ele não vende, não recruta e não vê pedido de mais
  // ninguém: o servidor já entrega só as linhas com o e-mail dele em
  // "entregador", e o filtro abaixo garante o mesmo na tela.
  if (tela === "entregador" && usuario && cargoUsuario === "entregador") {
    const emailEntregador = usuario.email.toLowerCase();
    return (
      <PainelAdmin
        modo="entregador"
        config={config}
        pagina={paginaAdmin}
        setPagina={setPaginaAdmin}
        setTela={setTela}
        menuMobileAberto={menuMobileAdmin}
        setMenuMobileAberto={setMenuMobileAdmin}
        usuario={usuario}
        pedidos={pedidos.filter((o) => (o.entregador ?? "").toLowerCase() === emailEntregador)}
        clientes={[]}
        produtos={produtos}
        aoSalvarProduto={() => {}}
        aoExcluirProduto={() => {}}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={[]}
        bancoOffline={bancoConectado === false}
        aoSair={sair}
      />
    );
  }

  // Checkout: entrega → pagamento → revisão (como no Mercado Livre)
  if (tela === "checkout" && usuario) {
    return (
      <TelaCheckout
        items={carrinho}
        config={config}
        cupons={cupons.filter(cupomEstaValido)}
        vendedorVinculado={vendedorVinculado}
        nomeDoDonoDoCodigo={nomeDoDonoDoCodigo}
        aoVoltar={() => setTela("carrinho")}
        aoConfirmar={criarCompra}
      />
    );
  }

  // Pagamento de uma compra já registrada no servidor (PIX ou cartão). Quem
  // diz que foi pago é o servidor: esta tela só acompanha.
  if (tela === "pagamento" && compraAtual) {
    return (
      <TelaPagamentoCompra
        key={compraAtual.id}
        compraInicial={compraAtual}
        produtos={produtos}
        aoAprovado={aoCompraAprovada}
        aoVoltar={() => setTela("carrinho")}
        aoCancelada={() => {
          setCompraAtual(null);
          setRecargaBanco((n) => n + 1);
          setTela("carrinho");
          toast.info("Compra cancelada. Seu carrinho continua salvo.");
        }}
      />
    );
  }

  if (tela === "sucesso") {
    return (
      <TelaCompraConcluida
        total={totalUltimaCompra}
        compra={compraConcluida}
        aoVerPedidos={() => { setProdutosUltimaCompra([]); setTela("notificacoes"); }}
        produtosComprados={produtosUltimaCompra}
        aoAvaliarProduto={(p) => {
          // Leva o cliente direto para a seção de avaliações daquele produto
          setProdutoSelecionado(p);
          setIrParaAvaliacoes(true);
          setProdutosUltimaCompra([]);
          setTela("loja");
        }}
        aoContinuar={() => { setProdutosUltimaCompra([]); setTela("loja"); }}
        recomendacoes={recomendarProdutos(
          produtosUltimaCompra.length > 0 ? produtosUltimaCompra : compradosPeloCliente,
          produtos,
          QTD_RECOMENDACOES,
          sinaisVitrine
        )}
        aoVerProduto={(p) => { setProdutosUltimaCompra([]); abrirProdutoNaLoja(p); }}
      />
    );
  }

  // Área dedicada: o cliente escolhe a caixa e monta o presente do zero
  if (tela === "montar-caixa") {
    return (
      <PaginaMontarCaixa
        produtos={produtos}
        caixaInicial={caixaEmEdicao}
        aoVoltar={() => { setCaixaEmEdicao(null); setTela("loja"); }}
        aoConcluir={concluirMontagemDeCaixa}
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
        aoEditarCaixa={abrirMontagemDeCaixa}
        aoMontarCaixa={() => abrirMontagemDeCaixa(null)}
        aoContinuar={irParaCheckout}
        config={config}
      />
    );
  }

  const abrirProdutoDaVitrine = (prod: Produto) => {
    setProdutoSelecionado(prod);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const propsVitrine = {
    favoritos,
    aoFavoritar: alternarFavorito,
    aoAbrirProduto: abrirProdutoDaVitrine,
    estoqueBaixo: config.estoqueBaixo,
  };

  return (
    <div className="min-h-screen bg-[#EDEDED] pb-14 md:pb-0">
      <div className="sticky top-0 z-40">
        <CabecalhoLoja
          qtdCarrinho={qtdCarrinho}
          qtdFavoritos={favoritos.length}
          aoAbrirCarrinho={() => setTela("carrinho")}
          aoAbrirFavoritos={() => {
            setVerSoFavoritos(true);
            setColecao(null);
            setProdutoSelecionado(null);
            document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
          }}
          aoAbrirPainel={abrirPainel}
          rotuloPainel={rotuloPainel}
          aoClicarEntrar={abrirTelaLogin}
          aoAbrirPerfil={abrirPerfil}
          aoIrInicio={irParaInicio}
          busca={busca}
          aoBuscar={(v) => { setBusca(v); setColecao(null); setProdutoSelecionado(null); setVerSoFavoritos(false); }}
          usuario={usuario}
          categorias={categoriasComProduto}
          categoriaSelecionada={
            verSoFavoritos || busca.trim() || naHomeLimpa ? "" : colecao === "todos" ? "Outros" : colecao ? "" : categoriaSelecionada
          }
          aoSelecionarCategoria={verCategoria}
          aoMontarCaixa={() => abrirMontagemDeCaixa(null)}
        />
      </div>

      {/* Toast: produto adicionado ao carrinho */}
      {toastAdicionado && (
        <div
          key={toastAdicionado.key}
          role="status"
          className="fixed bottom-[68px] md:bottom-6 right-3 left-3 md:left-auto md:right-6 z-50 bg-white rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-4 py-3 flex items-center gap-3 md:w-[380px]"
          style={{ animation: "toastIn 0.2s ease-out" }}
        >
          <ImagemProduto
            src={toastAdicionado.p.image}
            alt={toastAdicionado.p.name}
            className="w-11 h-11 object-contain flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] text-[#00A650] font-semibold flex items-center gap-1">
              <Check size={15} strokeWidth={3} /> Adicionado ao carrinho
            </div>
            <div className="text-[12.5px] text-gray-500 truncate">{toastAdicionado.p.name}</div>
          </div>
          <button
            onClick={() => { setToastAdicionado(null); setTela("carrinho"); }}
            className="btn-secundario text-[13px] px-3 py-2 flex-shrink-0"
          >
            Ver carrinho
          </button>
        </div>
      )}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
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
          produtos={produtosDaVitrine}
          aoAdicionarAoCarrinho={adicionarAoCarrinho}
          aoComprarAgora={comprarAgora}
          aoAbrirProduto={(p) => { setProdutoSelecionado(p); setIrParaAvaliacoes(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aoVoltar={() => { setProdutoSelecionado(null); setIrParaAvaliacoes(false); }}
          aoFavoritar={alternarFavorito}
          favoritos={favoritos}
          usuario={usuario}
          pedidos={pedidos}
          aoAtualizarResumoAvaliacoes={atualizarResumoAvaliacoes}
          config={config}
          focarAvaliacoes={irParaAvaliacoes}
          sinais={sinaisVitrine}
        />
      ) : (
      <main>
        <BannerRotativo
          banners={banners}
          aoClicarBanner={verCategoria}
        />

        {naHomeLimpa ? (
          produtosDaVitrine.length === 0 ? (
            <div className="max-w-[1200px] mx-auto px-4 pt-8">
              <div className="painel py-16 px-6 text-center">
                <p className="text-[18px] text-gray-800">Nenhum produto cadastrado ainda</p>
                <p className="text-[14px] text-gray-500 mt-1">Em breve novidades por aqui.</p>
              </div>
            </div>
          ) : (
            <>
              <SecaoVitrine titulo="Ofertas" produtos={prateleiras.ofertas} aoVerTodos={() => verColecao("ofertas")} rotuloVerTodos="Ver todas" {...propsVitrine} />
              <ChamadaMonteSuaCaixa
                aoAbrir={() => abrirMontagemDeCaixa(null)}
                fotos={produtosDaVitrine.filter((p) => p.stock > 0 && p.image).slice(0, 4).map((p) => ({ src: p.image, alt: p.name }))}
              />
              <SecaoVitrine
                titulo={compradosPeloCliente.length > 0 ? "Inspirado nas suas compras" : "Descubra na loja"}
                produtos={prateleiras.paraVoce}
                aoVerTodos={() => verColecao("para-voce")}
                {...propsVitrine}
              />
              {prateleiras.maisVendidos.length >= 3 && (
                <SecaoVitrine titulo="Mais vendidos" produtos={prateleiras.maisVendidos} aoVerTodos={() => verColecao("mais-vendidos")} {...propsVitrine} />
              )}
              {prateleiras.porCategoria.map((g) => (
                <SecaoVitrine
                  key={g.categoria}
                  titulo={g.categoria}
                  produtos={g.produtos}
                  aoVerTodos={() => verCategoria(g.categoria)}
                  {...propsVitrine}
                />
              ))}
              <SecaoVitrine titulo="Novidades" produtos={prateleiras.novidades} aoVerTodos={() => verColecao("novidades")} rotuloVerTodos="Ver todas" {...propsVitrine} />
              <div className="max-w-[1200px] mx-auto px-4 pt-8 text-center">
                <button onClick={() => verCategoria("Outros")} className="btn-secundario px-8 py-3 text-[15px]">
                  Ver todos os produtos da loja
                </button>
              </div>
              <SecaoAvaliacoesClientes />
              <FaixaBeneficios config={config} />
            </>
          )
        ) : (
        <section id="produtos-section" className="max-w-[1200px] mx-auto px-4 pt-6 scroll-mt-28">
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="text-[22px] md:text-[24px] text-gray-800 truncate">
                {verSoFavoritos
                  ? "Seus favoritos"
                  : busca.trim()
                  ? `Resultados para “${busca.trim()}”`
                  : colecao && colecao !== "todos"
                  ? colecao === "para-voce"
                    ? compradosPeloCliente.length > 0 ? "Inspirado nas suas compras" : "Descubra na loja"
                    : NOME_COLECAO[colecao]
                  : colecao === "todos"
                  ? "Todos os produtos"
                  : categoriaSelecionada}
              </h1>
              <span className="text-[13px] text-gray-500 flex-shrink-0">
                {produtosFiltrados.length} {produtosFiltrados.length !== 1 ? "resultados" : "resultado"}
              </span>
            </div>
            <button onClick={irParaInicio} className="text-[#C8102E] text-[14px] hover:underline flex-shrink-0">
              Voltar ao início
            </button>
          </div>

          {/* Filtros de catálogo (preço, avaliação, marca, estoque, ordenação):
              só a partir do tablet — no celular ficam escondidos pra manter a
              vitrine limpa, sem a fileira de selects logo abaixo do título */}
          <div className="hidden md:block">
            <BarraFiltros
              marcas={marcasDisponiveis}
              marcaSelecionada={marcaFiltro}
              aoMudarMarca={setMarcaFiltro}
              faixaPreco={faixaPreco}
              aoMudarFaixaPreco={setFaixaPreco}
              avaliacaoMin={avaliacaoMinFiltro}
              aoMudarAvaliacaoMin={setAvaliacaoMinFiltro}
              apenasEstoque={apenasEstoqueFiltro}
              aoMudarApenasEstoque={setApenasEstoqueFiltro}
              ordenacao={ordenacao}
              aoMudarOrdenacao={setOrdenacao}
              aoLimpar={limparFiltrosDeCatalogo}
              filtrosAtivos={filtrosDeCatalogoAtivos}
            />
          </div>

          {produtosFiltrados.length === 0 ? (
            <div className="painel py-14 md:py-20 px-6 text-center">
              <Search size={40} strokeWidth={1.25} className="text-gray-400 mx-auto mb-4" />
              <p className="text-[18px] text-gray-800 mb-1">
                {verSoFavoritos ? "Você ainda não favoritou nenhum produto" : "Nenhum produto encontrado"}
              </p>
              <p className="text-[14px] text-gray-500 max-w-sm mx-auto">
                {verSoFavoritos ? "Toque no coração de um produto para guardá-lo aqui." : "Tente outra categoria ou outra palavra na busca."}
              </p>
              <button
                onClick={() => { limparFiltrosDeCatalogo(); irParaInicio(); }}
                className="mt-5 btn-secundario px-5 py-2.5 text-[14px]"
              >
                Voltar ao início
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
                {produtosFiltrados.slice(0, qtdVisivel).map((p) => (
                  <CartaoProduto
                    key={p.id}
                    produto={p}
                    aoFavoritar={alternarFavorito}
                    estaFavoritado={favoritos.includes(p.id)}
                    aoAbrirProduto={abrirProdutoDaVitrine}
                    estoqueBaixo={config.estoqueBaixo}
                  />
                ))}
              </div>
              {produtosFiltrados.length > qtdVisivel && (
                <div className="mt-6 text-center">
                  <p className="text-[13px] text-gray-500 mb-3">
                    Mostrando {qtdVisivel} de {produtosFiltrados.length}
                  </p>
                  <button onClick={() => setQtdVisivel((n) => n + POR_PAGINA)} className="btn-secundario px-8 py-3 text-[15px]">
                    Mostrar mais produtos
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        )}
      </main>
      )}

      <RodapeLoja
        aoAbrirPagina={(p) => {
          setPaginaInstitucional(p);
          setTela("institucional");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {/* Navegação inferior no celular: Início · Notificações · Carrinho · Eu */}
      <BarraInferiorMobile
        ativa={verSoFavoritos ? "favoritos" : "inicio"}
        qtdCarrinho={qtdCarrinho}
        qtdFavoritos={favoritos.length}
        aoIrInicio={irParaInicio}
        aoAbrirFavoritos={() => {
          setProdutoSelecionado(null);
          setVerSoFavoritos(true);
          document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
        }}
        aoAbrirCarrinho={() => setTela("carrinho")}
        aoAbrirPerfil={abrirPerfil}
        aoAbrirNotificacoes={abrirNotificacoes}
        qtdNotificacoes={qtdNotificacoesCliente}
      />

      {popupRecomendado && (
        <PopupRecomendacao
          produto={popupRecomendado}
          motivo={motivoDaRecomendacao(popupRecomendado, compradosPeloCliente, sinaisVitrine)}
          aoAbrir={(p) => { setPopupRecomendado(null); abrirProdutoNaLoja(p); }}
          aoFechar={fecharPopupRecomendado}
        />
      )}

      {bancoConectado === false && <AvisoBancoDesconectado />}
    </div>
  );
}
