// Tela PaginaProduto

import { useEffect, useMemo, useState } from "react";
import { Star, Heart, Truck, ChevronRight, ChevronLeft, Video, ShieldCheck, RotateCcw } from "lucide-react";
import type { Produto, Usuario, Pedido, Avaliacao, CorProduto, ConfigLoja } from "../types";
import { URL_BACKEND_PIX, LIMITE_VIDEO_AVALIACAO_MB, LIMITE_VIDEO_AVALIACAO_SEGUNDOS } from "../constantes";
import { categoriaExibida, formatarMoeda, precoParcela, pctDesconto, produtoFoiCompradoPor, mediaAvaliacoes, textoCidadesAtendidas } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { CartaoProduto } from "../components/CartaoProduto";
import { Preco } from "../components/Preco";
import { compradosJuntosCom, recomendarProdutos, type SinaisVitrine } from "../recomendacoes";
import { cabecalhosAdmin } from "../authToken";

export function PaginaProduto({
  produto,
  produtos,
  aoAdicionarAoCarrinho,
  aoComprarAgora,
  aoAbrirProduto,
  aoVoltar,
  aoFavoritar,
  favoritos,
  usuario,
  pedidos,
  config,
  aoAtualizarResumoAvaliacoes,
  focarAvaliacoes = false,
  sinais,
}: {
  produto: Produto;
  produtos: Produto[];
  aoAdicionarAoCarrinho: (p: Produto) => void;
  // Coloca no carrinho e vai direto para o checkout (o "Comprar agora")
  aoComprarAgora?: (p: Produto) => void;
  aoAbrirProduto: (p: Produto) => void;
  aoVoltar: () => void;
  aoFavoritar: (id: number) => void;
  favoritos: number[];
  usuario: Usuario | null;
  pedidos: Pedido[];
  // Configurações da loja: cidades atendidas e o limite de "últimas unidades"
  config: ConfigLoja;
  aoAtualizarResumoAvaliacoes: (produtoId: number, rating: number, reviews: number) => void;
  // true quando o cliente chegou aqui pelo convite de avaliar depois da compra:
  // rola direto até a seção de avaliações em vez de abrir no topo da página
  focarAvaliacoes?: boolean;
  // Mais vendidos e "comprados juntos" somados no servidor (recomendacoes.ts)
  sinais?: SinaisVitrine;
}) {
  // ─── Galeria de fotos e cores/modelos ──────────────────────────────────────
  // Todas as fotos disponíveis: capa + galeria + uma foto por cor cadastrada
  const fotosGaleria = useMemo(() => {
    const lista = [produto.image, ...(produto.images || [])];
    (produto.colors || []).forEach((c) => { if (c.image && !lista.includes(c.image)) lista.push(c.image); });
    return lista.filter(Boolean);
  }, [produto]);
  const [corSelecionada, setCorSelecionada] = useState<CorProduto | null>(null);
  const [fotoSelecionada, setFotoSelecionada] = useState(produto.image);

  // Ao trocar de produto (navegação), reseta a foto e a cor escolhidas
  useEffect(() => {
    setFotoSelecionada(produto.image);
    setCorSelecionada(null);
  }, [produto.id]);

  const aoEscolherCor = (c: CorProduto) => {
    setCorSelecionada(c);
    if (c.image) setFotoSelecionada(c.image);
  };

  // Navega para a foto anterior/próxima da galeria (setas na imagem principal)
  const irParaFoto = (direcao: 1 | -1) => {
    const indiceAtual = fotosGaleria.indexOf(fotoSelecionada);
    const total = fotosGaleria.length;
    if (total === 0) return;
    const proximoIndice = ((indiceAtual === -1 ? 0 : indiceAtual) + direcao + total) % total;
    setFotoSelecionada(fotosGaleria[proximoIndice]);
  };

  // ─── Avaliações (comentário + vídeo) ───────────────────────────────────────
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [carregandoAvaliacoes, setCarregandoAvaliacoes] = useState(true);
  const [notaForm, setNotaForm] = useState(0);
  const [comentarioForm, setComentarioForm] = useState("");
  const [videoForm, setVideoForm] = useState<string | null>(null);
  const [nomeVideoForm, setNomeVideoForm] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [formInicializado, setFormInicializado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregandoAvaliacoes(true);
    setFormInicializado(false);
    setNotaForm(0);
    setComentarioForm("");
    setVideoForm(null);
    setNomeVideoForm("");
    setErroForm("");
    fetch(`${URL_BACKEND_PIX}/api/avaliacoes/${produto.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => { if (!cancelado) setAvaliacoes(Array.isArray(lista) ? lista : []); })
      .catch(() => { if (!cancelado) setAvaliacoes([]); })
      .finally(() => { if (!cancelado) setCarregandoAvaliacoes(false); });
    return () => { cancelado = true; };
  }, [produto.id]);

  // Rola até o formulário de avaliação quando o cliente veio de um convite
  // para avaliar: o de depois da compra, ou o aviso de entrega (sino, e-mail e
  // notificação do celular, que chegam como "?produto=X&avaliar=1").
  //
  // Espera as avaliações carregarem antes de rolar. Enquanto elas estão vindo
  // a página ainda é curta — a seção fica logo abaixo da dobra e o navegador
  // não tem para onde rolar, então a rolagem simplesmente não acontecia.
  useEffect(() => {
    if (!focarAvaliacoes || carregandoAvaliacoes) return;
    document.getElementById("avaliacoes-produto")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focarAvaliacoes, produto.id, carregandoAvaliacoes]);

  const jaComprou = usuario ? produtoFoiCompradoPor(usuario.email, produto, pedidos) : false;
  const minhaAvaliacao = useMemo(
    () => (usuario ? avaliacoes.find((a) => a.clienteEmail.toLowerCase() === usuario.email.toLowerCase()) : undefined),
    [avaliacoes, usuario]
  );

  // Pré-preenche o formulário com a avaliação já enviada por este cliente
  // (permite editar), só uma vez depois que a lista termina de carregar.
  useEffect(() => {
    if (carregandoAvaliacoes || formInicializado) return;
    if (minhaAvaliacao) {
      setNotaForm(minhaAvaliacao.nota);
      setComentarioForm(minhaAvaliacao.comentario);
      setVideoForm(minhaAvaliacao.video ?? null);
    }
    setFormInicializado(true);
  }, [carregandoAvaliacoes, formInicializado, minhaAvaliacao]);

  const aoEscolherVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErroForm("");
    const limiteBytes = LIMITE_VIDEO_AVALIACAO_MB * 1024 * 1024;
    if (arquivo.size > limiteBytes) {
      setErroForm(`Vídeo muito grande — envie um vídeo de até ${LIMITE_VIDEO_AVALIACAO_MB} MB.`);
      e.target.value = "";
      return;
    }
    const urlTemporaria = URL.createObjectURL(arquivo);
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(urlTemporaria);
      if (videoEl.duration > LIMITE_VIDEO_AVALIACAO_SEGUNDOS) {
        setErroForm(`Vídeo muito longo — envie um vídeo de até ${LIMITE_VIDEO_AVALIACAO_SEGUNDOS} segundos.`);
        e.target.value = "";
        return;
      }
      const leitor = new FileReader();
      leitor.onload = () => {
        setVideoForm(String(leitor.result));
        setNomeVideoForm(arquivo.name);
      };
      leitor.readAsDataURL(arquivo);
    };
    videoEl.src = urlTemporaria;
  };

  const aoEnviarAvaliacao = async () => {
    if (!usuario) return;
    setErroForm("");
    if (notaForm < 1) { setErroForm("Escolha de 1 a 5 estrelas."); return; }
    if (!comentarioForm.trim() && !videoForm) { setErroForm("Escreva um comentário ou envie um vídeo."); return; }
    setEnviando(true);
    try {
      const resposta = await fetch(`${URL_BACKEND_PIX}/api/avaliacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cabecalhosAdmin() },
        body: JSON.stringify({
          produtoId: produto.id,
          clienteNome: usuario.name,
          nota: notaForm,
          comentario: comentarioForm.trim(),
          video: videoForm,
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroForm(corpo?.erro || "Não foi possível enviar a avaliação.");
        return;
      }
      const listaAtualizada: Avaliacao[] = await fetch(`${URL_BACKEND_PIX}/api/avaliacoes/${produto.id}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
      setAvaliacoes(Array.isArray(listaAtualizada) ? listaAtualizada : []);
      const { media, qtd } = mediaAvaliacoes(listaAtualizada.map((a) => a.nota));
      aoAtualizarResumoAvaliacoes(produto.id, media, qtd);
    } catch {
      setErroForm("Falha de conexão — tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  // Estoque que vale de verdade: o da cor escolhida (quando ela tem um
  // estoque próprio cadastrado) ou, sem cor selecionada, o estoque geral
  const estoqueEfetivo = corSelecionada?.estoque ?? produto.stock;
  // Mesmo limite do painel (Configurações → Estoque). Antes era 15 fixo aqui e
  // outro número no painel — a loja e o Admin falavam de "poucas unidades"
  // com critérios diferentes.
  const limiteBaixo = config?.estoqueBaixo ?? 5;

  // Monta o produto que vai pro carrinho: com a cor escolhida, a compra é
  // creditada àquela variação específica — foto, estoque e nome da cor
  // seguem junto, em vez de cair no padrão do produto
  const produtoParaComprar: Produto = corSelecionada
    ? {
        ...produto,
        image: corSelecionada.image || produto.image,
        stock: estoqueEfetivo,
        corEscolhida: corSelecionada.nome,
      }
    : produto;

  // Cada cor com estoque próprio: é preciso escolher qual, senão não dá para
  // saber de onde sai a unidade (e o cliente recebe a cor que não queria)
  const precisaEscolherCor =
    !corSelecionada && (produto.colors ?? []).length > 0 && (produto.colors ?? []).every((c) => typeof c.estoque === "number");
  const temDesconto = produto.originalPrice && produto.originalPrice > produto.price;
  // Desconto no PIX definido no próprio produto (0 = sem desconto)
  const pctPix = produto.pixDesconto ?? 0;
  const precoPix = produto.price * (1 - pctPix / 100);
  // "Quem comprou também comprou" com dados reais de outras compras; com
  // poucas vendas ainda, vira "Você também pode gostar" (parecidos)
  const juntos = useMemo(() => compradosJuntosCom(produto, produtos, 5, sinais), [produto, produtos, sinais]);
  const outrosProdutos = useMemo(
    () => recomendarProdutos([], produtos, 15, sinais).filter((p) => p.id !== produto.id && !juntos.produtos.some((j) => j.id === p.id)).slice(0, 10),
    [produto, produtos, sinais, juntos]
  );

  const grid = (items: Produto[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
      {items.map((p) => (
        <CartaoProduto
          key={p.id}
          produto={p}
          aoFavoritar={aoFavoritar}
          estaFavoritado={favoritos.includes(p.id)}
          aoAbrirProduto={aoAbrirProduto}
          estoqueBaixo={limiteBaixo}
        />
      ))}
    </div>
  );

  const favoritado = favoritos.includes(produto.id);
  const textoEstoque =
    estoqueEfetivo <= 0
      ? corSelecionada ? `Esgotado na cor ${corSelecionada.nome}` : "Produto esgotado"
      : estoqueEfetivo === 1
      ? "Última unidade disponível"
      : estoqueEfetivo <= limiteBaixo
      ? `Restam só ${estoqueEfetivo} unidades`
      : "Estoque disponível";
  const podeComprar = estoqueEfetivo > 0 && !precisaEscolherCor;

  return (
    <main className="max-w-[1200px] mx-auto px-4 pt-4 pb-6">
      <nav aria-label="Você está em" className="flex items-center gap-1.5 text-[13px] text-gray-500 mb-3 flex-wrap">
        <button onClick={aoVoltar} className="text-[#C8102E] hover:underline flex items-center gap-0.5">
          <ChevronLeft size={15} /> Voltar
        </button>
        <span className="text-gray-300 mx-1">|</span>
        <button onClick={aoVoltar} className="hover:text-gray-800">Início</button>
        <ChevronRight size={12} />
        <span>{categoriaExibida(produto.category)}</span>
      </nav>

      <div className="painel">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px_300px] gap-6 lg:gap-8 p-4 md:p-6">
          {/* ── Fotos ── */}
          <div className="flex gap-3 min-w-0">
            {fotosGaleria.length > 1 && (
              <div className="hidden md:flex flex-col gap-2 flex-shrink-0">
                {fotosGaleria.slice(0, 7).map((foto, i) => (
                  <button
                    key={i}
                    onMouseEnter={() => setFotoSelecionada(foto)}
                    onClick={() => setFotoSelecionada(foto)}
                    aria-label={`Foto ${i + 1}`}
                    className={`w-[52px] h-[52px] rounded p-0.5 bg-white ${
                      fotoSelecionada === foto ? "border-2 border-[#C8102E]" : "border border-black/15 hover:border-black/40"
                    }`}
                  >
                    <ImagemProduto src={foto} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="relative aspect-square max-h-[500px] mx-auto flex items-center justify-center">
                <ImagemProduto src={fotoSelecionada} alt={produto.name} className="w-full h-full object-contain" />
                {fotosGaleria.length > 1 && (
                  <>
                    <button
                      onClick={() => irParaFoto(-1)}
                      aria-label="Foto anterior"
                      className="md:hidden absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full shadow flex items-center justify-center"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => irParaFoto(1)}
                      aria-label="Próxima foto"
                      className="md:hidden absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full shadow flex items-center justify-center"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <span className="md:hidden absolute top-0 left-0 text-[12px] bg-[#EDEDED] text-gray-600 rounded-full px-2 py-0.5">
                      {Math.max(1, fotosGaleria.indexOf(fotoSelecionada) + 1)} / {fotosGaleria.length}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Informações ── */}
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13px] text-gray-500">{produto.brand}</p>
              <button
                onClick={() => aoFavoritar(produto.id)}
                aria-label={favoritado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                aria-pressed={favoritado}
                className="-mt-1 -mr-1 p-1"
              >
                <Heart size={22} className={favoritado ? "fill-[#C8102E] text-[#C8102E]" : "text-[#C8102E]"} />
              </button>
            </div>
            {produto.badge && (
              <span className="inline-block bg-[#FF7733] text-white text-[11px] font-bold px-1.5 py-[1px] rounded-sm mb-1.5">{produto.badge}</span>
            )}
            <h1 className="text-[20px] md:text-[22px] font-semibold text-gray-900 leading-tight">{produto.name}</h1>

            {produto.reviews > 0 && (
              <button
                onClick={() => document.getElementById("avaliacoes-produto")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="flex items-center gap-1.5 mt-2 text-[14px] text-gray-500 hover:text-gray-800"
              >
                <span>{produto.rating.toFixed(1)}</span>
                <span className="flex" aria-hidden>
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={13} className={i < Math.round(produto.rating) ? "fill-[#C8102E] text-[#C8102E]" : "fill-gray-300 text-gray-300"} />
                  ))}
                </span>
                <span>({produto.reviews.toLocaleString("pt-BR")})</span>
              </button>
            )}

            <div className="mt-5">
              {temDesconto && <s className="block text-[15px] text-gray-400 leading-none mb-1.5">{formatarMoeda(produto.originalPrice!)}</s>}
              <div className="flex items-start gap-3">
                <Preco valor={produto.price} tamanho={36} className="text-gray-900" />
                {temDesconto && (
                  <span className="text-[18px] text-[#00A650] mt-1">{pctDesconto(produto.originalPrice!, produto.price)}% OFF</span>
                )}
              </div>
              {produto.installments > 1 && (
                <p className="text-[16px] text-[#00A650] mt-1.5">
                  em {produto.installments}x {precoParcela(produto.price, produto.installments)} sem juros
                </p>
              )}
              {pctPix > 0 && (
                <p className="text-[15px] text-gray-700 mt-1">
                  ou <span className="font-semibold">{formatarMoeda(precoPix)}</span> no Pix{" "}
                  <span className="text-[#00A650]">({pctPix}% de desconto)</span>
                </p>
              )}
            </div>

            {produto.colors && produto.colors.length > 0 && (
              <div className="mt-6">
                <p className="text-[14px] text-gray-800">
                  Cor: <span className="font-semibold">{corSelecionada ? corSelecionada.nome : "escolha uma opção"}</span>
                </p>
                <div className="flex flex-wrap gap-2 mt-2" role="radiogroup" aria-label="Cor">
                  {produto.colors.map((c, i) => {
                    const semEstoque = typeof c.estoque === "number" && c.estoque <= 0;
                    const ativa = corSelecionada?.nome === c.nome;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={ativa}
                        onClick={() => aoEscolherCor(c)}
                        title={semEstoque ? `${c.nome} (esgotado)` : c.nome}
                        className={`relative w-[52px] h-[52px] rounded p-0.5 bg-white ${
                          ativa ? "border-2 border-[#C8102E]" : "border border-black/15 hover:border-black/40"
                        } ${semEstoque ? "opacity-40" : ""}`}
                      >
                        {c.image ? (
                          <ImagemProduto src={c.image} alt={c.nome} className="w-full h-full object-contain" />
                        ) : (
                          <span className="block w-full h-full rounded-sm" style={{ backgroundColor: c.hex || "#cccccc" }} />
                        )}
                        <span className="sr-only">{c.nome}{semEstoque ? " (esgotado)" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Caixa de compra ── */}
          <aside className="lg:border lg:border-black/10 lg:rounded-md lg:p-5 h-fit border-t border-black/10 pt-5 lg:pt-5">
            <div className="flex gap-3">
              <Truck size={20} strokeWidth={1.5} className="text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="text-[14px] leading-snug">
                <p className="text-gray-800">Entregamos em {textoCidadesAtendidas(config.cidadesAtendidas)}</p>
                <p className="text-gray-500 mt-0.5">De 1 a 4 dias úteis. O prazo exato sai com o seu CEP.</p>
              </div>
            </div>

            <p className={`mt-5 text-[15px] font-semibold ${estoqueEfetivo <= 0 ? "text-gray-500" : estoqueEfetivo <= limiteBaixo ? "text-[#C8102E]" : "text-gray-900"}`}>
              {textoEstoque}
            </p>

            {precisaEscolherCor && estoqueEfetivo > 0 && (
              <p className="mt-2 text-[14px] text-gray-600">Escolha a cor para continuar.</p>
            )}

            <div className="mt-4 space-y-2">
              {aoComprarAgora && (
                <button
                  onClick={() => aoComprarAgora(produtoParaComprar)}
                  disabled={!podeComprar}
                  className="btn-primario w-full py-3 text-[15px]"
                >
                  Comprar agora
                </button>
              )}
              <button
                onClick={() => aoAdicionarAoCarrinho(produtoParaComprar)}
                disabled={!podeComprar}
                className={`${aoComprarAgora ? "btn-secundario" : "btn-primario"} w-full py-3 text-[15px]`}
              >
                Adicionar ao carrinho
              </button>
            </div>

            <ul className="mt-6 space-y-3 text-[13.5px] text-gray-500">
              <li className="flex gap-2.5">
                <ShieldCheck size={17} strokeWidth={1.5} className="flex-shrink-0 mt-px" />
                <span>
                  <span className="text-[#C8102E]">Compra segura.</span> O pagamento é confirmado pelo banco e os dados do cartão não ficam na loja.
                </span>
              </li>
              <li className="flex gap-2.5">
                <RotateCcw size={17} strokeWidth={1.5} className="flex-shrink-0 mt-px" />
                <span>Até 7 dias para desistir depois de receber.</span>
              </li>
            </ul>
          </aside>
        </div>

        {produto.description && (
          <section className="border-t border-black/10 px-4 md:px-6 py-6 md:py-8">
            <h2 className="text-[20px] md:text-[22px] text-gray-900 mb-4">Descrição</h2>
            <p className="text-[15px] md:text-[16px] text-gray-600 whitespace-pre-line leading-relaxed max-w-[760px]">{produto.description}</p>
          </section>
        )}

        {/* Opiniões dos clientes */}
        <section id="avaliacoes-produto" className="border-t border-black/10 px-4 md:px-6 py-6 md:py-8 scroll-mt-28">
          <h2 className="text-[20px] md:text-[22px] text-gray-900 mb-5">Opiniões do produto</h2>

          {carregandoAvaliacoes ? (
            <p className="text-[14px] text-gray-400">Carregando opiniões…</p>
          ) : avaliacoes.length === 0 ? (
            <p className="text-[14px] text-gray-500">Este produto ainda não tem opiniões.</p>
          ) : (
            <div className="grid md:grid-cols-[200px_1fr] gap-6 md:gap-10">
              <div>
                <p className="text-[48px] leading-none text-gray-900">{mediaAvaliacoes(avaliacoes.map((a) => a.nota)).media.toFixed(1)}</p>
                <div className="flex mt-2" aria-hidden>
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className={i < Math.round(mediaAvaliacoes(avaliacoes.map((a) => a.nota)).media) ? "fill-[#C8102E] text-[#C8102E]" : "fill-gray-300 text-gray-300"}
                    />
                  ))}
                </div>
                <p className="text-[13px] text-gray-500 mt-1.5">
                  {avaliacoes.length} {avaliacoes.length === 1 ? "opinião" : "opiniões"}
                </p>
              </div>
              <ul className="divide-y divide-black/[0.08]">
                {avaliacoes.map((a) => (
                  <li key={a.id} className="py-4 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex" role="img" aria-label={`${a.nota} de 5 estrelas`}>
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={13} className={i < a.nota ? "fill-[#C8102E] text-[#C8102E]" : "fill-gray-300 text-gray-300"} />
                        ))}
                      </span>
                      <span className="text-[12.5px] text-gray-400">{a.date}</span>
                    </div>
                    {a.comentario && <p className="text-[15px] text-gray-700 mt-2 whitespace-pre-line">{a.comentario}</p>}
                    {a.video && <video controls className="mt-3 rounded max-h-[280px] bg-black w-full sm:w-auto" src={a.video} />}
                    <p className="text-[12.5px] text-gray-400 mt-2">{a.clienteNome}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Formulário: só clientes que compraram este produto podem avaliar */}
          {usuario && jaComprou && (
            <div className="mt-8 border border-black/10 rounded-md p-5 max-w-[640px]">
              <h3 className="text-[16px] font-semibold text-gray-900 mb-3">
                {minhaAvaliacao ? "Editar minha opinião" : "Dê sua opinião sobre este produto"}
              </h3>
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setNotaForm(n)} aria-label={`${n} estrela${n > 1 ? "s" : ""}`}>
                    <Star size={26} strokeWidth={1.5} className={n <= notaForm ? "fill-[#C8102E] text-[#C8102E]" : "fill-white text-gray-300"} />
                  </button>
                ))}
              </div>
              <textarea
                value={comentarioForm}
                onChange={(e) => setComentarioForm(e.target.value)}
                placeholder="Conte o que achou do produto"
                rows={3}
                className="campo mb-3"
              />
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <label className="btn-secundario flex items-center gap-2 text-[13.5px] px-3.5 py-2 cursor-pointer">
                  <Video size={16} />
                  {videoForm ? "Trocar vídeo" : "Anexar vídeo (opcional)"}
                  <input type="file" accept="video/*" className="hidden" onChange={aoEscolherVideo} />
                </label>
                {videoForm && (
                  <span className="text-[13px] text-gray-500 flex items-center gap-2">
                    {nomeVideoForm || "vídeo anexado"}
                    <button type="button" onClick={() => { setVideoForm(null); setNomeVideoForm(""); }} className="text-[#C8102E] hover:underline">
                      Remover
                    </button>
                  </span>
                )}
              </div>
              {videoForm && <video controls className="rounded max-h-[220px] bg-black mb-3 w-full sm:w-auto" src={videoForm} />}
              <p className="text-[12.5px] text-gray-400 mb-3">
                Vídeo de até {LIMITE_VIDEO_AVALIACAO_SEGUNDOS}s e {LIMITE_VIDEO_AVALIACAO_MB} MB.
              </p>
              {erroForm && <p className="text-[13.5px] text-[#C8102E] mb-3">{erroForm}</p>}
              <button onClick={aoEnviarAvaliacao} disabled={enviando} className="btn-primario px-6 py-2.5 text-[14px]">
                {enviando ? "Enviando…" : minhaAvaliacao ? "Atualizar opinião" : "Enviar opinião"}
              </button>
            </div>
          )}

          {usuario && !jaComprou && (
            <p className="text-[13px] text-gray-400 mt-6">Só quem comprou este produto pode dar opinião.</p>
          )}
          {!usuario && <p className="text-[13px] text-gray-400 mt-6">Entre na sua conta para dar sua opinião.</p>}
        </section>
      </div>

      {juntos.produtos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[22px] text-gray-800 mb-4">
            {juntos.deVerdade ? "Quem comprou este produto também comprou" : "Você também pode gostar"}
          </h2>
          {grid(juntos.produtos)}
        </section>
      )}

      {outrosProdutos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[22px] text-gray-800 mb-4">Descubra na loja</h2>
          {grid(outrosProdutos)}
        </section>
      )}
    </main>
  );
}
