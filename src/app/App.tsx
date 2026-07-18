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

import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, Check } from "lucide-react";
import type { Produto, ItemCarrinho, Usuario, ConfigLoja, Cupom, Banner, Cargo, Recrutamento, Pedido, Cliente, Tela, DadosPagamento, CartaoSalvo, DadosCartaoDigitado } from "./types";
import { CONFIG_PADRAO, CATEGORIAS, EMAIL_ADMIN, NOMES_MESES, URL_BACKEND_PIX, COMISSAO_MASTER_PROMOVIDO_EQUIPE } from "./constantes";
import { cupomEstaValido, gerarCodigoRecrutamento, codigoVendaDe, lerArmazenamento, gerarCodigoProduto, bandeiraCartao } from "./utils";
import { ImagemProduto } from "./components/ImagemProduto";
import { AvisoBancoDesconectado } from "./components/AvisoBancoDesconectado";
import { BarraInferiorMobile } from "./components/BarraInferiorMobile";
import { ModalVendedorAtivado } from "./components/ModalVendedorAtivado";
import { CabecalhoLoja } from "./components/CabecalhoLoja";
import { MenuCategorias } from "./components/MenuCategorias";
import { BannerRotativo } from "./components/BannerRotativo";
import { CartaoProduto } from "./components/CartaoProduto";
import { RodapeLoja } from "./components/RodapeLoja";
import { TelaLogin } from "./screens/TelaLogin";
import { TelaNotificacoesCliente } from "./screens/TelaNotificacoesCliente";
import { TelaPerfil } from "./screens/TelaPerfil";
import { PaginaProduto } from "./screens/PaginaProduto";
import { PaginaCarrinho } from "./screens/PaginaCarrinho";
import { TelaPix } from "./screens/TelaPix";
import { TelaPagamento } from "./screens/TelaPagamento";
import { TelaCompraConcluida } from "./screens/TelaCompraConcluida";
import { PainelAdmin } from "./admin/PainelAdmin";

export default function App() {
  // Tela atual do app: loja, login, carrinho, admin ou sucesso
  const [tela, setTela] = useState<Tela>("loja");
  // Página ativa dentro dos painéis (admin, master, vendedor)
  const [paginaAdmin, setPaginaAdmin] = useState<string>("dashboard");
  // Itens que o cliente colocou no carrinho
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  // Texto digitado na busca de produtos
  const [busca, setBusca] = useState("");
  // Categoria selecionada no menu da loja
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Outros");
  // IDs dos produtos favoritados (coração)
  const [favoritos, setFavoritos] = useState<number[]>([]);
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
  // Cartões salvos dos clientes (dados seguros só: bandeira, nome, últimos 4
  // dígitos e validade — NUNCA o número completo nem o CVV), carregados do banco
  const [cartoesSalvos, setCartoesSalvos] = useState<CartaoSalvo[]>([]);
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

  // Mantém o login salvo no navegador: continua logado ao voltar ao site
  useEffect(() => {
    if (usuario) localStorage.setItem("cp_usuario_logado", JSON.stringify(usuario));
    else localStorage.removeItem("cp_usuario_logado");
  }, [usuario]);

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
      banners: lerArmazenamento<Banner[]>("cp_banners", []),
      alertasEstoque: lerArmazenamento<{ id: number; name: string; date: string }[]>("cp_stock_alerts", []),
      config: lerArmazenamento<Partial<ConfigLoja> | null>("cp_config", null),
    };

    // Preenche o código sequencial (ex.: "BEL-001") de produtos antigos que
    // ainda não têm um — mantém a ordem original da lista, só processa por
    // id crescente (proxy da ordem de cadastro) para numerar em sequência
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
      setProdutos(comCodigosPreenchidos(escolher(banco?.produtos, locais.produtos)));
      setCartoesSalvos(banco?.cartoesSalvos ?? []);
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

    fetch(`${URL_BACKEND_PIX}/api/dados`)
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

  // Limpa automaticamente os alertas de estoque assim que o produto volta a
  // ter estoque (ou é excluído) — sem isso, cada "esgotado" ficava para
  // sempre na lista e lotava o sino de notificações do Admin.
  useEffect(() => {
    setAlertasEstoque((atual) => {
      const aindaEsgotados = atual.filter((a) => {
        const produto = produtos.find((p) => p.id === a.id);
        return produto ? produto.stock <= 0 : false;
      });
      return aindaEsgotados.length === atual.length ? atual : aindaEsgotados;
    });
  }, [produtos]);

  useEffect(() => {
    salvarNoBanco("cargos", cargos);
  }, [cargos]);

  useEffect(() => {
    salvarNoBanco("recrutamentos", recrutamentos);
  }, [recrutamentos]);

  useEffect(() => {
    salvarNoBanco("vinculosMasterPlus", vinculosMasterPlus);
  }, [vinculosMasterPlus]);

  useEffect(() => {
    salvarNoBanco("config", config);
  }, [config]);

  useEffect(() => {
    salvarNoBanco("cupons", cupons);
  }, [cupons]);

  useEffect(() => {
    salvarNoBanco("banners", banners);
  }, [banners]);

  useEffect(() => {
    salvarNoBanco("cartoesSalvos", cartoesSalvos);
  }, [cartoesSalvos]);

  // Salva um cartão novo após uma compra confirmada com Cartão (ou atualiza
  // os ids do cofre num cartão que já existia localmente). Não duplica se o
  // cliente já tiver salvo o mesmo cartão antes (mesmos últimos 4 dígitos +
  // validade). O número completo e o CVV são descartados aqui — só entram na
  // memória do navegador durante a digitação, nunca são salvos.
  const salvarCartao = (email: string, dados: DadosCartaoDigitado) => {
    const ultimosDigitos = dados.numero.replace(/\D/g, "").slice(-4);
    const emailChave = email.toLowerCase();
    if (!ultimosDigitos) return;
    const existente = cartoesSalvos.find(
      (c) => c.email.toLowerCase() === emailChave && c.ultimosDigitos === ultimosDigitos && c.validade === dados.validade
    );
    if (existente) {
      // Já estava salvo (ex.: reuso de cartão salvo) — só atualiza os ids do
      // cofre se agora tivermos um (ex.: cartão antigo que nunca tinha sido
      // vinculado ao Mercado Pago e acabou de ser tokenizado de novo).
      if (dados.mpCardId && !existente.mpCardId) {
        setCartoesSalvos((anterior) =>
          anterior.map((c) => (c.id === existente.id ? { ...c, mpCardId: dados.mpCardId, mpCustomerId: dados.mpCustomerId } : c))
        );
      }
      return;
    }
    setCartoesSalvos((anterior) => [
      {
        id: Date.now(),
        email: emailChave,
        bandeira: dados.bandeira || bandeiraCartao(dados.numero),
        nomeCartao: dados.nome.trim(),
        ultimosDigitos,
        validade: dados.validade,
        mpCardId: dados.mpCardId,
        mpCustomerId: dados.mpCustomerId,
      },
      ...anterior,
    ]);
  };

  // Remove um cartão salvo (só o dono do cartão consegue, via perfil)
  const excluirCartao = (id: number) => setCartoesSalvos((anterior) => anterior.filter((c) => c.id !== id));

  // Cria um cupom novo ou atualiza um existente (mesmo código)
  const salvarCupom = (c: Cupom) =>
    setCupons((anterior) =>
      anterior.some((x) => x.codigo === c.codigo)
        ? anterior.map((x) => (x.codigo === c.codigo ? c : x))
        : [c, ...anterior]
    );

  const excluirCupom = (codigo: string) =>
    setCupons((anterior) => anterior.filter((c) => c.codigo !== codigo));

  // Cria um banner novo ou atualiza um existente (mesmo id)
  const salvarBanner = (b: Banner) =>
    setBanners((anterior) =>
      anterior.some((x) => x.id === b.id)
        ? anterior.map((x) => (x.id === b.id ? b : x))
        : [...anterior, b]
    );

  const excluirBanner = (id: number) =>
    setBanners((anterior) => anterior.filter((b) => b.id !== id));


  // Master/MasterPlus/Admin dá (ou remove) um cargo de um usuário.
  //
  // Regra: só existe Master dentro da equipe de um MasterPlus — não há mais
  // Master "solto" (o Admin não promove Master direto, só o MasterPlus
  // promove um vendedor da própria equipe). Por isso, se esta conta deixa
  // de ser MasterPlus (perde o cargo, é removida, etc.), os Masters que ela
  // promoveu não ficam órfãos: são excluídos junto (perdem o cargo).
  const definirCargo = (email: string, cargo: Cargo | null) => {
    const chave = email.toLowerCase();
    setCargos((anterior) => {
      const novo = { ...anterior };
      if (cargo === null) delete novo[chave];
      else novo[chave] = cargo;
      if (cargo !== "masterplus") {
        const mastersDela = Object.keys(vinculosMasterPlus).filter((m) => vinculosMasterPlus[m] === chave);
        mastersDela.forEach((m) => delete novo[m]);
      }
      return novo;
    });
    if (cargo !== "master") {
      setVinculosMasterPlus((anterior) => {
        if (!(chave in anterior)) return anterior;
        const novo = { ...anterior };
        delete novo[chave];
        return novo;
      });
    }
    if (cargo !== "masterplus") {
      setVinculosMasterPlus((anterior) => {
        if (!Object.values(anterior).includes(chave)) return anterior;
        const novo = { ...anterior };
        for (const k of Object.keys(novo)) if (novo[k] === chave) delete novo[k];
        return novo;
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
    definirCargo(chave, "master");
    setVinculosMasterPlus((anterior) => ({ ...anterior, [chave]: masterPlusChave }));
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
    setRecrutamentos((anterior) =>
      anterior.map((r) => (r.codigo === codigoLimpo ? { ...r, ativado: true } : r))
    );
    definirCargo(emailLimpo, "vendedor");
    setAvisoVendedorAtivado(true);
    return null;
  };

  // Master cadastra um vendedor: gera o código de ativação e cria o vínculo,
  // marcado com o e-mail do Master que convidou (cada Master tem a própria
  // equipe — a comissão e o bônus de convite só valem sobre ela).
  // Retorna uma mensagem de erro, ou null se deu certo.
  const cadastrarVendedor = (masterEmail: string, nome: string, email: string): string | null => {
    const chave = email.trim().toLowerCase();
    if (!nome.trim() || !chave) return "Preencha o nome e o e-mail do vendedor.";
    if (chave === EMAIL_ADMIN) return "Este e-mail é reservado.";
    if (chave === masterEmail.toLowerCase()) return "Você não pode convidar a si mesmo.";
    if (recrutamentos.some((r) => r.email.toLowerCase() === chave))
      return "Este e-mail já foi cadastrado.";
    setRecrutamentos((anterior) => [
      {
        codigo: gerarCodigoRecrutamento(),
        recrutador: masterEmail.toLowerCase(),
        nome: nome.trim(),
        email: chave,
        ativado: false,
        date: new Date().toLocaleDateString("pt-BR"),
      },
      ...anterior,
    ]);
    return null;
  };

  // Cria um produto novo (gera o código sequencial da categoria, ex.:
  // "BEL-001") ou atualiza um existente (mantém o código já atribuído)
  const salvarProduto = (p: Produto) =>
    setProdutos((anterior) => {
      const existente = anterior.find((x) => x.id === p.id);
      if (existente) {
        return anterior.map((x) => (x.id === p.id ? { ...p, codigo: existente.codigo ?? p.codigo } : x));
      }
      const comCodigo = { ...p, codigo: p.codigo ?? gerarCodigoProduto(p.category, anterior) };
      return [comCodigo, ...anterior];
    });

  // Remove um produto do catálogo
  const excluirProduto = (id: number) => setProdutos((anterior) => anterior.filter((p) => p.id !== id));

  // Atualiza na hora o resumo (estrelas + quantidade) de um produto depois que
  // uma avaliação é enviada ou excluída — o pedido de verdade (POST/DELETE em
  // /api/avaliacoes) já fica salvo no banco; isso só reflete no estado local
  // pra não precisar recarregar a página inteira pra ver o novo resumo.
  const atualizarResumoAvaliacoes = (produtoId: number, rating: number, reviews: number) =>
    setProdutos((anterior) => anterior.map((p) => (p.id === produtoId ? { ...p, rating, reviews } : p)));

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

  // Chamado quando o pagamento é confirmado: cria os pedidos, dá baixa no
  // estoque e gera alertas. PIX é sempre "Pago" (o site só chama isso depois
  // de confirmar o PIX de verdade). Cartão manda o status REAL devolvido pelo
  // Mercado Pago (statusCartao) — "approved" vira Pago, "in_process"/"pending"
  // vira Processando (ex.: análise antifraude); pagamento recusado nunca chega
  // aqui (a tela de pagamento barra antes). Se foi pago com um cartão novo,
  // salva o cartão (dados seguros) no perfil.
  const confirmarPagamento = (dadosCartao?: DadosCartaoDigitado, statusCartao?: "approved" | "in_process" | "pending") => {
    if (!usuario || !pagamentoPendente) return;
    if (pagamentoPendente.metodo === "cartao" && dadosCartao) {
      salvarCartao(usuario.email, dadosCartao);
    }
    const agora = new Date();
    const date = agora.toLocaleDateString("pt-BR");
    const month = NOMES_MESES[agora.getMonth()];
    const sufixo = String(Date.now()).slice(-5);
    const rotuloPagamento = { pix: "PIX", cartao: "Cartão" }[pagamentoPendente.metodo];
    // Cartão: Pago só quando o Mercado Pago aprovou na hora; se ficou em
    // análise (antifraude), entra como Processando. PIX só chega aqui depois
    // de confirmado de verdade, então é sempre Pago.
    const statusInicial =
      pagamentoPendente.metodo === "cartao" && statusCartao && statusCartao !== "approved"
        ? "Processando"
        : "Pago";

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
      // para a conta dona do código. Sem código, a venda cai para o
      // administrador (a loja) — só o código credita o vendedor ou o Master.
      vendedor: donoCodigoVenda ?? EMAIL_ADMIN,
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
    // Mantém só os 30 mais recentes — o efeito acima já remove o que foi
    // reabastecido, isso aqui é só uma trava extra contra crescimento sem fim
    if (esgotados.length > 0) setAlertasEstoque((anterior) => [...esgotados, ...anterior].slice(0, 30));

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
  // Contas com código: todos que têm o cargo de Master ou Vendedor.
  const codigoVendaLimpo = codigoVenda.trim().toUpperCase();
  const contasComCodigo = Object.keys(cargos);
  const donoCodigoVenda = codigoVendaLimpo
    ? contasComCodigo.find((email) => codigoVendaDe(email) === codigoVendaLimpo) ?? null
    : null;
  // Nome amigável do dono do código (para mostrar ao cliente)
  const nomeDonoCodigoVenda = donoCodigoVenda
    ? clientes.find((c) => c.email.toLowerCase() === donoCodigoVenda)?.name ?? donoCodigoVenda
    : null;

  // Cupom digitado no carrinho, se existir e estiver válido (ativo e na validade)
  const cupomAplicado = cupomDigitado.trim()
    ? cupons.find((c) => c.codigo === cupomDigitado.trim().toUpperCase() && cupomEstaValido(c)) ?? null
    : null;

  const produtosFiltrados = useMemo(
    () => produtos.filter((p) => {
      const termo = busca.trim().toLowerCase();
      const matchSearch =
        !termo ||
        p.name.toLowerCase().includes(termo) ||
        p.brand.toLowerCase().includes(termo) ||
        p.category.toLowerCase().includes(termo);
      // Com uma busca digitada, procura em todas as categorias — só filtra
      // pela categoria selecionada quando o campo de busca está vazio.
      const matchCat = termo ? true : categoriaSelecionada === "Outros" || p.category === categoriaSelecionada;
      return matchCat && matchSearch;
    }),
    [categoriaSelecionada, busca, produtos]
  );

  // Após login/cadastro: registra o cliente e retoma a compra pendente.
  // A ativação do código de vendedor agora acontece no perfil do cliente,
  // depois que a conta já existe — ver ativarCodigoVendedor.
  const processarLogin = (u: Usuario, viaGoogle?: boolean) => {
    setUsuario(u);
    const emailLimpo = u.email.toLowerCase();
    // Só o Administrador não entra na lista de clientes da loja — o Master
    // agora é só uma conta comum com o cargo de Master, então precisa
    // aparecer em clientes (é de lá que o Admin escolhe quem promover)
    if (emailLimpo === EMAIL_ADMIN) {
      setTela(produtoPendente ? "carrinho" : "loja");
      if (produtoPendente) { colocarNoCarrinho(produtoPendente); setProdutoPendente(null); }
      setAvisoTelaLogin("");
      return;
    }
    setClientes((anterior) =>
      anterior.some((c) => c.email === u.email)
        ? viaGoogle
          ? anterior.map((c) => (c.email === u.email ? { ...c, viaGoogle: true } : c))
          : anterior
        : [...anterior, {
            name: u.name,
            email: u.email,
            since: new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
            criadoEm: new Date().toISOString().slice(0, 10),
            viaGoogle: Boolean(viaGoogle),
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
    : null;

  // Abre o painel certo para o usuário, já na página inicial adequada
  const abrirPainel = () => {
    if (ehAdmin) { setPaginaAdmin("dashboard"); setTela("admin"); }
    else if (ehMasterPlus) { setPaginaAdmin("dashboard"); setTela("masterplus"); }
    else if (ehMaster) { setPaginaAdmin("dashboard"); setTela("master"); }
    else if (cargoUsuario === "vendedor") { setPaginaAdmin("pedidos"); setTela("vendedor"); }
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
          pedidos={pedidos.filter((o) => o.email.toLowerCase() === usuario.email.toLowerCase())}
          cupons={cupons.filter(cupomEstaValido)}
          categorias={CATEGORIAS.filter((c) => c !== "Outros")}
          aoVerCategoria={(c) => { setCategoriaSelecionada(c); setProdutoSelecionado(null); setTela("loja"); }}
          aoVoltar={() => setTela("loja")}
          aoSair={() => { setUsuario(null); setTela("loja"); }}
          rotuloPainel={rotuloPainel}
          aoAbrirPainel={abrirPainel}
          cargoUsuario={cargoUsuario}
          aoAtivarCodigo={ativarCodigoVendedor}
          cartoesSalvos={cartoesSalvos.filter((c) => c.email.toLowerCase() === usuario.email.toLowerCase())}
          aoExcluirCartao={excluirCartao}
          aoAdicionarCartao={(dados) => salvarCartao(usuario.email, dados)}
        />
        <BarraInferiorMobile
          ativa="perfil"
          qtdCarrinho={qtdCarrinho}
          aoIrInicio={() => { setProdutoSelecionado(null); setTela("loja"); }}
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

  // Notificações do cliente: status dos pedidos (substitui "Categorias" no menu mobile)
  if (tela === "notificacoes" && usuario) {
    return (
      <>
        <TelaNotificacoesCliente
          pedidos={pedidos.filter((o) => o.email.toLowerCase() === usuario.email.toLowerCase())}
          aoVoltar={() => setTela("loja")}
        />
        <BarraInferiorMobile
          ativa="notificacoes"
          qtdCarrinho={qtdCarrinho}
          aoIrInicio={() => { setProdutoSelecionado(null); setTela("loja"); }}
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
        aoSalvarConfig={setConfig}
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
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        aoDefinirCargo={definirCargo}
        recrutamentos={recrutamentos}
        vinculosMasterPlus={vinculosMasterPlus}
        aoCadastrarVendedor={(nome, email) =>
          usuario ? cadastrarVendedor(usuario.email, nome, email) : "Você precisa estar logado."
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
  // Ganha 10% fixo sobre a própria venda pessoal (código pessoal, igual ao
  // Master) além da comissão de rede (equipe própria + repasse).
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
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={alertasEstoque}
        cargos={cargos}
        aoDefinirCargo={definirCargo}
        recrutamentos={recrutamentos}
        vinculosMasterPlus={vinculosMasterPlus}
        aoCadastrarVendedor={(nome, email) =>
          usuario ? cadastrarVendedor(usuario.email, nome, email) : "Você precisa estar logado."
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
        produtos={[]}
        aoSalvarProduto={() => {}}
        aoExcluirProduto={() => {}}
        aoAtualizarStatusPedido={atualizarStatusPedido}
        alertasEstoque={[]}
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
        />
      );
    }
    return (
      <TelaPagamento
        dados={pagamentoPendente}
        email={usuario?.email ?? ""}
        aoConfirmar={confirmarPagamento}
        aoVoltar={() => { setPagamentoPendente(null); setTela("carrinho"); }}
        cartoesSalvos={usuario ? cartoesSalvos.filter((c) => c.email.toLowerCase() === usuario.email.toLowerCase()) : []}
        aoExcluirCartao={excluirCartao}
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
        aoClicarEntrar={abrirTelaLogin}
        aoAbrirPerfil={abrirPerfil}
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
          usuario={usuario}
          pedidos={pedidos}
          aoAtualizarResumoAvaliacoes={atualizarResumoAvaliacoes}
        />
      ) : (
      <main>
        <BannerRotativo
          banners={banners}
          aoClicarBanner={(c) => {
            setCategoriaSelecionada(c);
            setProdutoSelecionado(null);
            document.getElementById("produtos-section")?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <section id="produtos-section" className="max-w-[1440px] mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-[#C8102E]" />
              <div>
                <h2 className="text-xl font-black text-gray-900">
                  {categoriaSelecionada === "Outros" ? "Ofertas do Dia" : categoriaSelecionada}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>

          {produtosFiltrados.length === 0 ? (
            <div className="py-16 md:py-20 text-center bg-white rounded-2xl border border-gray-100">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Search size={26} strokeWidth={1.75} className="text-[#C8102E]" />
              </div>
              <p className="font-bold text-gray-700 mb-1">
                {produtos.length === 0 ? "Nenhum produto cadastrado ainda" : "Nenhum produto encontrado"}
              </p>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                {produtos.length === 0
                  ? "Em breve novidades por aqui — cadastre produtos no painel Admin."
                  : "Tente outra categoria ou termo de busca."}
              </p>
              {categoriaSelecionada !== "Outros" && produtos.length > 0 && (
                <button
                  onClick={() => setCategoriaSelecionada("Outros")}
                  className="mt-5 text-[#C8102E] font-bold text-sm hover:underline"
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
      </main>
      )}

      <RodapeLoja />

      {/* Navegação inferior no celular: Início · Notificações · Carrinho · Eu */}
      <BarraInferiorMobile
        ativa="inicio"
        qtdCarrinho={qtdCarrinho}
        aoIrInicio={() => {
          setProdutoSelecionado(null);
          setCategoriaSelecionada("Outros");
          setBusca("");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        aoAbrirCarrinho={() => setTela("carrinho")}
        aoAbrirPerfil={abrirPerfil}
        aoAbrirNotificacoes={abrirNotificacoes}
        qtdNotificacoes={qtdNotificacoesCliente}
      />

      {bancoConectado === false && <AvisoBancoDesconectado />}
    </div>
  );
}
