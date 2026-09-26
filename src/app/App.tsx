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
import type { Produto, ItemCarrinho, Usuario, ConfigLoja, Cupom, Banner, Cargo, Recrutamento, ResultadoCadastroVendedor, Pedido, Cliente, Tela, DadosPagamento, CaixaMontada } from "./types";
import { CONFIG_PADRAO, CATEGORIAS_VITRINE, CATEGORIA_CAIXA, CATEGORIA_CAIXA_LEGADO, EMAIL_ADMIN, NOMES_MESES, URL_BACKEND_PIX, COMISSAO_MASTER_PROMOVIDO_EQUIPE, QTD_RECOMENDACOES, ATRASO_POPUP_RECOMENDACAO, ESPERA_APOS_DISPENSAR_RECOMENDACAO } from "./constantes";
import { cabecalhosAdmin, cabecalhosAuth, definirSessao } from "./authToken";
import { sincronizarInscricao } from "./notificacoesPush";
import { cupomEstaValido, clienteJaUsouCupom, codigoVendaDe, lerArmazenamento, gerarCodigoProduto, linhaDeCarrinhoDaCaixa, itensParaEstoque, textoDoPedidoDaCaixa } from "./utils";
import { produtosComprados, recomendarProdutos, motivoDaRecomendacao } from "./recomendacoes";
import { toast } from "sonner";
import { ImagemProduto } from "./components/ImagemProduto";
import { AvisoBancoDesconectado } from "./components/AvisoBancoDesconectado";
import { PopupRecomendacao } from "./components/PopupRecomendacao";
import { BarraInferiorMobile } from "./components/BarraInferiorMobile";
import { ModalVendedorAtivado } from "./components/ModalVendedorAtivado";
import { CabecalhoLoja } from "./components/CabecalhoLoja";
import { MenuCategorias } from "./components/MenuCategorias";
import { BannerRotativo } from "./components/BannerRotativo";
import { BarraFiltros, type Ordenacao, type FaixaPreco } from "./components/BarraFiltros";
import { FaixaBeneficios } from "./components/FaixaBeneficios";
import { SecaoMaisVendidos } from "./components/SecaoMaisVendidos";
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
import { TelaPix } from "./screens/TelaPix";
import { TelaPagamento } from "./screens/TelaPagamento";
import { TelaCompraConcluida } from "./screens/TelaCompraConcluida";
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
    <div className="min-h-screen bg-[#FBF4EA] flex flex-col items-center justify-center gap-3">
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
  // Pagamento escolhido no carrinho, aguardando confirmação na tela de pagamento
  const [pagamentoPendente, setPagamentoPendente] = useState<DadosPagamento | null>(null);
  // Cargos dados pelo Master (e-mail → vendedor), carregados do banco
  const [cargos, setCargos] = useState<Record<string, Cargo>>({});
  // Vendedores cadastrados pelo Master (código de ativação), carregados do banco
  const [recrutamentos, setRecrutamentos] = useState<Recrutamento[]>([]);
  // E-mail do Master (minúsculo) → e-mail do MasterPlus que o promoveu.
  // Todo Master tem, obrigatoriamente, um vínculo aqui — não existe Master
  // fora da equipe de um MasterPlus (ver definirCargo). Carregado do banco.
  const [vinculosMasterPlus, setVinculosMasterPlus] = useState<Record<string, string>>({});
  // Código de venda digitado pelo cliente na compra atual
  const [codigoVenda, setCodigoVenda] = useState("");
  // Configurações da loja ajustáveis pelo Admin, carregadas do banco
  const [config, setConfig] = useState<ConfigLoja>(CONFIG_PADRAO);
  // Cupons de desconto criados pelo Admin, carregados do banco
  const [cupons, setCupons] = useState<Cupom[]>([]);
  // Banners da vitrine, editados pelo Admin, carregados do banco
  const [banners, setBanners] = useState<Banner[]>([]);
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
  const salvarConfig = (novaConfig: ConfigLoja) => {
    setConfig(novaConfig);
    salvarNoBanco("config", novaConfig);
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

    if (souAdmin) {
      salvarNoBanco("cargos", novosCargos);
      if (vinculosMudaram) salvarNoBanco("vinculosMasterPlus", novosVinculos);
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
    const novosVinculos = { ...vinculosMasterPlus, [chave]: masterPlusChave };
    setVinculosMasterPlus(novosVinculos);
    if (usuario?.email?.toLowerCase() === EMAIL_ADMIN) salvarNoBanco("vinculosMasterPlus", novosVinculos);
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

  // Cria um produto novo (gera o código sequencial da categoria, ex.:
  // "BEL-001") ou atualiza um existente (mantém o código já atribuído)
  const salvarProduto = (p: Produto) => {
    const existente = produtos.find((x) => x.id === p.id);
    const novo = existente
      ? produtos.map((x) => (x.id === p.id ? { ...p, codigo: existente.codigo ?? p.codigo } : x))
      : [{ ...p, codigo: p.codigo ?? gerarCodigoProduto(p.category, produtos) }, ...produtos];
    setProdutos(novo);
    salvarNoBanco("produtos", novo);
  };

  // Remove um produto do catálogo
  const excluirProduto = (id: number) => {
    const novo = produtos.filter((p) => p.id !== id);
    setProdutos(novo);
    salvarNoBanco("produtos", novo);
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
    setPedidos((anterior) => anterior.map((o) => (o.id === id ? { ...o, ...mudancas } : o)));
    // encodeURIComponent é obrigatório aqui: o número do pedido começa com "#"
    // (ex.: "#CP-A0"), e "#" numa URL significa "âncora" — o navegador corta
    // tudo dali em diante e nunca envia ao servidor. Sem isto a requisição ia
    // para "/api/pedidos/" sem número nenhum: a tela mostrava o status novo
    // (que é aplicado aqui em cima, na hora) e o banco continuava com o antigo,
    // então bastava recarregar a página para a mudança "desaparecer".
    salvarNoServidor(`/api/pedidos/${encodeURIComponent(id)}`, "PATCH", mudancas);
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
    () => recomendarProdutos(compradosPeloCliente, produtos, QTD_RECOMENDACOES),
    [compradosPeloCliente, produtos]
  );

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

  // Trava de uma compra por vez. A tela do PIX pergunta ao servidor a cada 5
  // segundos se o dinheiro caiu; se duas respostas "CONCLUIDA" chegarem juntas
  // (a primeira demorou mais que o intervalo), esta função seria chamada duas
  // vezes e o cliente pagava uma compra e recebia duas — com baixa dobrada no
  // estoque. A trava é uma ref porque precisa valer no mesmo instante, antes
  // de qualquer re-renderização.
  const finalizandoCompra = useRef(false);

  // Chamado quando o pagamento é confirmado: cria os pedidos, dá baixa no
  // estoque e gera alertas. O site só chama isso depois de confirmar o PIX
  // de verdade — o status inicial do pedido é sempre "Pago".
  const confirmarPagamento = async () => {
    if (!usuario || !pagamentoPendente) return;
    if (finalizandoCompra.current) return;
    finalizandoCompra.current = true;
    const agora = new Date();
    const date = agora.toLocaleDateString("pt-BR");
    const month = NOMES_MESES[agora.getMonth()];
    // Número do pedido: aleatório, não o relógio. Os 5 últimos dígitos de
    // Date.now() repetem a cada 100 segundos — em algumas centenas de vendas
    // dois pedidos acabariam com o mesmo número, e o segundo era recusado
    // pelo banco (chave duplicada), derrubando a compra inteira de um cliente
    // que já tinha pagado.
    const sufixo = Array.from({ length: 4 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
    ).join("") + String(Date.now()).slice(-4);
    const rotuloPagamento =
      pagamentoPendente.metodo === "cartao"
        ? `Cartão ${pagamentoPendente.parcelas}x`
        : "PIX";
    const statusInicial = "Pago";

    // Uma caixa montada é UMA linha do carrinho, mas vários produtos no
    // estoque: aqui ela é desmontada de volta em produtos de verdade, que é o
    // que dá baixa (aqui e no servidor) — ver itensParaEstoque.
    const itensVendidos = itensParaEstoque(carrinho);

    const novosPedidos: Pedido[] = carrinho.map((item, i) => {
      // Nome-base + cor escolhida (se houver) + quantidade — nessa ordem —
      // para o produto continuar batendo com produtoFoiCompradoPor
      const nomeComCor = item.corEscolhida ? `${item.name} - ${item.corEscolhida}` : item.name;
      // Caixa montada pelo cliente tem descrição própria: recipiente,
      // conteúdo e cartão de mensagem — é por ela que o Admin monta o pedido
      const descricao = item.caixa
        ? textoDoPedidoDaCaixa(item.caixa, item.qty)
        : item.qty > 1
        ? `${nomeComCor} (${item.qty}x)`
        : nomeComCor;
      return {
        id: `#CP-${sufixo}${i}`,
        customer: usuario.name,
        email: usuario.email,
        items: descricao,
        total: item.price * item.qty,
        status: statusInicial,
        date,
        month,
        category: item.category,
        pagamento: rotuloPagamento,
        // Foto do e-mail de confirmação: numa caixa, a foto é a da caixa
        produtoId: item.caixa ? item.caixa.recipienteId : item.id,
        // Atribuição da venda: com código de venda válido, a venda conta somente
        // para a conta dona do código. Sem código, a venda cai para o
        // administrador (a loja) — só o código credita o vendedor ou o Master.
        vendedor: vendedorVinculado ?? donoCodigoVenda ?? EMAIL_ADMIN,
        codigoVenda: !vendedorVinculado && donoCodigoVenda ? codigoVendaLimpo : undefined,
        // Endereço de entrega preenchido no carrinho (CEP + número)
        endereco: pagamentoPendente.endereco,
        // Cupom usado nesta compra — trava o mesmo cupom para o cliente de novo
        cupomUsado: cupomAplicado ? cupomAplicado.codigo : undefined,
      };
    });

    // Baixa de estoque dos produtos vendidos: soma as quantidades de todas as
    // linhas do carrinho com este id (mesmo produto pode ter cores diferentes
    // no carrinho, cada uma em uma linha) para tirar do estoque geral
    const produtosAtualizados = produtos.map((p) => {
      const itensDoProduto = itensVendidos.filter((i) => i.id === p.id);
      if (itensDoProduto.length === 0) return p;
      const qtyTotal = itensDoProduto.reduce((acum, i) => acum + i.qty, 0);
      // Também desconta do estoque da cor específica escolhida (quando ela
      // tem um estoque próprio cadastrado), senão a cor nunca esgota sozinha
      const coresAtualizadas = p.colors?.map((c) => {
        const itemDaCor = itensDoProduto.find((i) => i.corEscolhida === c.nome);
        if (!itemDaCor || typeof c.estoque !== "number") return c;
        return { ...c, estoque: Math.max(0, c.estoque - itemDaCor.qty) };
      });
      // Mesma ideia para o tamanho da caixa (P/M/G): a baixa desce no tamanho
      // que o cliente escolheu, senão o P nunca esgotaria antes do G
      const tamanhosAtualizados = p.tamanhos?.map((t) => {
        const itemDoTamanho = itensDoProduto.find((i) => i.tamanhoEscolhido === t.tamanho);
        if (!itemDoTamanho) return t;
        return { ...t, estoque: Math.max(0, t.estoque - itemDoTamanho.qty) };
      });
      return {
        ...p,
        stock: Math.max(0, p.stock - qtyTotal),
        colors: coresAtualizadas ?? p.colors,
        tamanhos: tamanhosAtualizados ?? p.tamanhos,
      };
    });
    // Alerta de produto esgotado (para as notificações do admin)
    const esgotados = produtos
      .filter((p) => {
        const qtyTotal = itensVendidos.filter((i) => i.id === p.id).reduce((acum, i) => acum + i.qty, 0);
        return qtyTotal > 0 && p.stock > 0 && p.stock - qtyTotal <= 0;
      })
      .map((p) => ({ id: p.id, name: p.name, date }));

    // Grava a compra no banco pelo endpoint pontual — só insere os pedidos
    // novos e dá baixa no estoque dos itens comprados (com lock de linha),
    // sem reescrever as tabelas inteiras de produtos/pedidos/cupons (que
    // outros clientes podem estar alterando ao mesmo tempo).
    //
    // ESPERA a resposta antes de comemorar. Antes isto era disparado e
    // esquecido: se o servidor recusasse (estoque acabado, sessão expirada,
    // banco fora do ar), o cliente via "Compra realizada!" mesmo assim e ia
    // embora achando que estava tudo certo — enquanto na loja não existia
    // pedido nenhum para separar e enviar.
    const resposta = await chamarServidor("/api/checkout", "POST", {
      pedidos: novosPedidos,
      itens: itensVendidos,
      cupomCodigo: cupomAplicado ? cupomAplicado.codigo : undefined,
    });

    if (!resposta.ok) {
      finalizandoCompra.current = false;
      toast.error(
        resposta.erro ?? "Não foi possível registrar seu pedido. Fale com a loja antes de pagar de novo.",
        { duration: 12000 }
      );
      // O carrinho continua intacto e a pessoa volta para ele: dá para
      // corrigir o que o servidor apontou (quantidade, cupom) e tentar de novo
      // sem remontar a compra.
      setTela("carrinho");
      return;
    }

    // Números que o servidor realmente gravou (ele troca o número quando já
    // existe um pedido com aquele id) — é o que vai para a tela e para o
    // rastreamento do cliente.
    const idsGravados = Array.isArray(resposta.dados?.pedidos)
      ? (resposta.dados!.pedidos as string[])
      : null;
    const pedidosGravados = idsGravados
      ? novosPedidos.map((p, i) => ({ ...p, id: idsGravados[i] ?? p.id }))
      : novosPedidos;

    // Atualiza o estado local na hora, só para a UI — o servidor já fez o
    // cálculo real e definitivo acima.
    setProdutos(produtosAtualizados);
    // Mantém só os 30 mais recentes — o efeito acima já remove o que foi
    // reabastecido, isso aqui é só uma trava extra contra crescimento sem fim
    if (esgotados.length > 0) setAlertasEstoque((anterior) => [...esgotados, ...anterior].slice(0, 30));

    setPedidos((anterior) => [...pedidosGravados, ...anterior]);
    // Primeira compra com código válido: o cliente fica vinculado a essa conta
    // para sempre (o servidor grava o vínculo no checkout). A partir daqui o
    // campo de código de venda some — só é pedido uma vez por conta.
    if (!vendedorVinculado && donoCodigoVenda) {
      const chaveCliente = usuario.email.toLowerCase();
      setClientes((anterior) =>
        anterior.map((c) =>
          c.email.toLowerCase() === chaveCliente ? { ...c, vendedorVinculado: donoCodigoVenda } : c
        )
      );
    }
    setTotalUltimaCompra(pagamentoPendente.total);
    // Produtos desta compra: viram o convite de avaliação na tela de sucesso
    setProdutosUltimaCompra(
      produtos.filter((p) => itensVendidos.some((i) => i.id === p.id))
    );
    setCarrinho([]);
    setPagamentoPendente(null);
    setCodigoVenda(""); // já virou vínculo fixo da conta, não é pedido de novo
    // Registra o uso do cupom (localmente) e limpa para a próxima compra
    if (cupomAplicado) {
      setCupons((anterior) =>
        anterior.map((c) => (c.codigo === cupomAplicado.codigo ? { ...c, usos: c.usos + 1 } : c))
      );
      setCupomDigitado("");
    }
    setTela("sucesso");
    // Compra encerrada: libera a trava para a próxima compra desta sessão.
    finalizandoCompra.current = false;
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
          (o.status === "Processando" || o.status === "Em trânsito")
      ).length
    : 0;

  // Dono do código de venda digitado pelo cliente (null = vazio ou inválido).
  // Sem código (ou com código inválido), a compra segue normalmente.
  // Contas com código: quem vende — Vendedor, Master e MasterPlus. Entregador
  // não tem código de venda (não divulga produto, não ganha comissão), então
  // fica de fora: senão o código derivado do e-mail dele seria aceito no
  // carrinho e a venda ficaria creditada a quem não vendeu nada.
  const codigoVendaLimpo = codigoVenda.trim().toUpperCase();
  const contasComCodigo = Object.keys(cargos).filter((email) => cargos[email] !== "entregador");
  const donoCodigoVenda = codigoVendaLimpo
    ? contasComCodigo.find((email) => codigoVendaDe(email) === codigoVendaLimpo) ?? null
    : null;
  // Nome amigável do dono do código (para mostrar ao cliente)
  const nomeDonoCodigoVenda = donoCodigoVenda
    ? clientes.find((c) => c.email.toLowerCase() === donoCodigoVenda)?.name ?? donoCodigoVenda
    : null;
  const vendedorVinculado = usuario
    ? clientes.find((c) => c.email.toLowerCase() === usuario.email.toLowerCase())?.vendedorVinculado ?? null
    : null;

  // Cupom digitado no carrinho, se existir, estiver válido (ativo e na
  // validade) e ainda não tiver sido usado por este cliente antes (cada
  // cupom vale só uma vez por pessoa)
  const cupomAplicado = cupomDigitado.trim()
    ? cupons.find(
        (c) =>
          c.codigo === cupomDigitado.trim().toUpperCase() &&
          cupomEstaValido(c) &&
          (!usuario || !clienteJaUsouCupom(usuario.email, c.codigo, pedidos))
      ) ?? null
    : null;
  // true quando o código digitado existe mas já foi usado por este cliente —
  // usado só para mostrar uma mensagem melhor que "cupom inválido"
  const cupomJaUsado =
    !cupomAplicado &&
    !!usuario &&
    cupomDigitado.trim().length > 0 &&
    cupons.some(
      (c) => c.codigo === cupomDigitado.trim().toUpperCase() && cupomEstaValido(c) && clienteJaUsouCupom(usuario.email, c.codigo, pedidos)
    );

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
    const filtrados = produtosDaVitrine.filter((p) => {
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
      const matchCat = termo || verSoFavoritos ? true : categoriaSelecionada === "Outros" || p.category === categoriaSelecionada;
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
      // "relevancia": mantém a ordem do catálogo (curadoria do Admin)
    }
    return ordenados;
  }, [categoriaSelecionada, busca, produtosDaVitrine, verSoFavoritos, favoritos, faixaPreco, avaliacaoMinFiltro, marcaFiltro, apenasEstoqueFiltro, ordenacao]);

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

  const filtrosDeCatalogoAtivos = faixaPreco !== "" || avaliacaoMinFiltro > 0 || marcaFiltro !== "" || apenasEstoqueFiltro;
  const limparFiltrosDeCatalogo = () => {
    setFaixaPreco(""); setAvaliacaoMinFiltro(0); setMarcaFiltro(""); setApenasEstoqueFiltro(false); setOrdenacao("relevancia");
  };

  // Home "limpa": sem categoria/busca/favoritos filtrando — é quando faz
  // sentido mostrar as seções de vitrine (categorias, mais vendidos, etc.),
  // em vez de competir com o resultado de uma navegação específica.
  const naHomeLimpa = categoriaSelecionada === "Outros" && busca.trim() === "" && !verSoFavoritos;

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
          categorias={categoriasComProduto.filter((c) => c !== "Outros")}
          desde={clientes.find((c) => c.email.toLowerCase() === usuario.email.toLowerCase())?.since}
          aoVerCategoria={(c) => { setCategoriaSelecionada(c); setProdutoSelecionado(null); setTela("loja"); }}
          aoVerProduto={abrirProdutoNaLoja}
          aoVoltar={() => setTela("loja")}
          aoSair={() => {
            const ehAdminSaindo = usuario?.email?.toLowerCase() === EMAIL_ADMIN;
            salvarNoServidor(ehAdminSaindo ? "/api/admin/logout" : "/api/clientes/logout", "POST");
            definirSessao(null);
            setUsuario(null);
            setTela("loja");
          }}
          aoAbrirNotificacoes={abrirNotificacoes}
          aoAbrirAjuda={() => { setPaginaInstitucional("ajuda"); setTela("institucional"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          rotuloPainel={rotuloPainel}
          aoAbrirPainel={abrirPainel}
          cargoUsuario={cargoUsuario}
          aoAtivarCodigo={ativarCodigoVendedor}
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
        bancoOffline={bancoConectado === false}
        aoAtualizarResumoAvaliacoes={atualizarResumoAvaliacoes}
      />
    );
  }

  // Painel Master: como o admin, mas SEM a página de Produtos e COM as páginas
  // Meus Vendedores (cadastra vendedores por código), Equipe & Cargos (dá o
  // cargo de Vendedor direto por e-mail) e Minha Rede (gráfico da equipe).
  // Um Master promovido por um MasterPlus ganha 1% sobre a própria equipe em
  // vez do padrão configurável (o restante vira repasse ao MasterPlus).
  if (tela === "master" && ehMaster) {
    const souMasterPromovido = usuario ? Boolean(vinculosMasterPlus[usuario.email.toLowerCase()]) : false;
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
        comissaoPct={souMasterPromovido ? COMISSAO_MASTER_PROMOVIDO_EQUIPE : config.comissaoRecrutador / 100}
        bancoOffline={bancoConectado === false}
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
        />
      );
    }
    return (
      <TelaPagamento
        dados={pagamentoPendente}
        email={usuario?.email ?? ""}
        aoConfirmar={confirmarPagamento}
        aoVoltar={() => { setPagamentoPendente(null); setTela("carrinho"); }}
      />
    );
  }

  if (tela === "sucesso") {
    return (
      <TelaCompraConcluida
        total={totalUltimaCompra}
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
          QTD_RECOMENDACOES
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
        aoFinalizarCompra={finalizarCompra}
        usuario={usuario}
        codigoVenda={codigoVenda}
        aoMudarCodigoVenda={setCodigoVenda}
        nomeDonoCodigo={nomeDonoCodigoVenda}
        vendedorVinculado={vendedorVinculado}
        config={config}
        cupom={cupomDigitado}
        aoMudarCupom={setCupomDigitado}
        cupomAplicado={cupomAplicado}
        cupomJaUsado={cupomJaUsado}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-14 md:pb-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Cabeçalho + categorias empilhados num único sticky, pra não sobrepor um no outro */}
      <div className="sticky top-0 z-40">
        <CabecalhoLoja
          qtdCarrinho={qtdCarrinho}
          qtdFavoritos={favoritos.length}
          aoAbrirCarrinho={() => setTela("carrinho")}
          aoAbrirFavoritos={() => {
            setVerSoFavoritos(true);
            setProdutoSelecionado(null);
            document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
          }}
          aoAbrirPainel={abrirPainel}
          rotuloPainel={rotuloPainel}
          aoClicarEntrar={abrirTelaLogin}
          aoAbrirPerfil={abrirPerfil}
          busca={busca}
          aoBuscar={(v) => { setBusca(v); setProdutoSelecionado(null); setVerSoFavoritos(false); }}
          usuario={usuario}
        />
        <MenuCategorias
          categorias={categoriasComProduto}
          selecionada={categoriaSelecionada}
          aoSelecionar={(c) => { setCategoriaSelecionada(c); setProdutoSelecionado(null); setVerSoFavoritos(false); }}
          aoMontarCaixa={() => abrirMontagemDeCaixa(null)}
        />
      </div>

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
          produtos={produtosDaVitrine}
          aoAdicionarAoCarrinho={adicionarAoCarrinho}
          aoAbrirProduto={(p) => { setProdutoSelecionado(p); setIrParaAvaliacoes(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aoVoltar={() => { setProdutoSelecionado(null); setIrParaAvaliacoes(false); }}
          aoFavoritar={alternarFavorito}
          favoritos={favoritos}
          usuario={usuario}
          pedidos={pedidos}
          aoAtualizarResumoAvaliacoes={atualizarResumoAvaliacoes}
          config={config}
          focarAvaliacoes={irParaAvaliacoes}
        />
      ) : (
      <main>
        <BannerRotativo
          banners={banners}
          aoClicarBanner={(c) => {
            setCategoriaSelecionada(c);
            setProdutoSelecionado(null);
            setVerSoFavoritos(false);
            document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        {naHomeLimpa && <ChamadaMonteSuaCaixa aoAbrir={() => abrirMontagemDeCaixa(null)} />}

        <section id="produtos-section" className="max-w-[1440px] mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-[#A8102A]" />
              <div>
                <h2 className="text-xl font-black text-gray-900">
                  {/* Com uma busca em andamento o título mostrava o nome da
                      categoria selecionada — quase sempre "Outros", que não
                      diz nada sobre o que a pessoa procurou e ainda parecia
                      que a busca tinha sido ignorada. */}
                  {verSoFavoritos
                    ? "Seus favoritos"
                    : busca.trim()
                    ? `Resultados para “${busca.trim()}”`
                    : naHomeLimpa
                    ? "Produtos em destaque"
                    : categoriaSelecionada}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            {verSoFavoritos && (
              <button
                onClick={() => setVerSoFavoritos(false)}
                className="text-[#A8102A] font-bold text-sm hover:underline flex-shrink-0"
              >
                Ver tudo
              </button>
            )}
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
            <div className="py-16 md:py-20 text-center bg-white rounded-2xl border border-gray-100">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Search size={26} strokeWidth={1.75} className="text-[#A8102A]" />
              </div>
              <p className="font-bold text-gray-700 mb-1">
                {verSoFavoritos
                  ? "Você ainda não favoritou nenhum produto"
                  : produtos.length === 0 ? "Nenhum produto cadastrado ainda" : "Nenhum produto encontrado"}
              </p>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                {verSoFavoritos
                  ? "Toque no coração de um produto para guardá-lo aqui."
                  : produtos.length === 0
                  ? "Em breve novidades por aqui — cadastre produtos no painel Admin."
                  : "Tente outra categoria ou termo de busca."}
              </p>
              {(verSoFavoritos || filtrosDeCatalogoAtivos || (categoriaSelecionada !== "Outros" && produtos.length > 0)) && (
                <button
                  onClick={() => { setVerSoFavoritos(false); setCategoriaSelecionada("Outros"); limparFiltrosDeCatalogo(); }}
                  className="mt-5 text-[#A8102A] font-bold text-sm hover:underline"
                >
                  Ver todos os produtos
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
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

        {naHomeLimpa && (
          <>
            <FaixaBeneficios />
            <SecaoMaisVendidos
              produtos={produtosDaVitrine}
              aoAdicionarAoCarrinho={adicionarAoCarrinho}
              aoFavoritar={alternarFavorito}
              favoritos={favoritos}
              aoAbrirProduto={(prod) => { setProdutoSelecionado(prod); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            />
            <SecaoAvaliacoesClientes />
          </>
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
        aoIrInicio={() => {
          setProdutoSelecionado(null);
          setCategoriaSelecionada("Outros");
          setBusca("");
          setVerSoFavoritos(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
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
          motivo={motivoDaRecomendacao(popupRecomendado, compradosPeloCliente)}
          aoAbrir={(p) => { setPopupRecomendado(null); abrirProdutoNaLoja(p); }}
          aoFechar={fecharPopupRecomendado}
        />
      )}

      {bancoConectado === false && <AvisoBancoDesconectado />}
    </div>
  );
}
