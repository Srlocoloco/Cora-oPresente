// Tela PaginaProduto

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, Star, Package, Heart, Truck, RotateCcw, ChevronRight, ChevronLeft, Video } from "lucide-react";
import type { Produto, Usuario, Pedido, Avaliacao, CorProduto } from "../types";
import { CORES_SELO, URL_BACKEND_PIX, LIMITE_VIDEO_AVALIACAO_MB, LIMITE_VIDEO_AVALIACAO_SEGUNDOS } from "../constantes";
import { categoriaExibida, formatarMoeda, precoParcela, pctDesconto, produtoFoiCompradoPor, mediaAvaliacoes } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { CartaoProduto } from "../components/CartaoProduto";

export function PaginaProduto({
  produto,
  produtos,
  aoAdicionarAoCarrinho,
  aoAbrirProduto,
  aoVoltar,
  aoFavoritar,
  favoritos,
  usuario,
  pedidos,
  aoAtualizarResumoAvaliacoes,
}: {
  produto: Produto;
  produtos: Produto[];
  aoAdicionarAoCarrinho: (p: Produto) => void;
  aoAbrirProduto: (p: Produto) => void;
  aoVoltar: () => void;
  aoFavoritar: (id: number) => void;
  favoritos: number[];
  usuario: Usuario | null;
  pedidos: Pedido[];
  aoAtualizarResumoAvaliacoes: (produtoId: number, rating: number, reviews: number) => void;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: produto.id,
          clienteEmail: usuario.email,
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
    <main className="max-w-[1440px] mx-auto px-4 py-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium mb-4 flex-wrap">
        <button onClick={aoVoltar} className="hover:text-[#C8102E] transition-colors">Início</button>
        <ChevronRight size={13} />
        <span>{categoriaExibida(produto.category)}</span>
        <ChevronRight size={13} />
        <span className="text-gray-800 font-semibold line-clamp-1">{produto.name}</span>
      </div>

      {/* Produto area */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery */}
          <div>
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
                src={fotoSelecionada}
                alt={produto.name}
                className="w-full h-[240px] md:h-[380px] object-contain"
              />
              {fotosGaleria.length > 1 && (
                <>
                  <button
                    onClick={() => irParaFoto(-1)}
                    aria-label="Foto anterior"
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => irParaFoto(1)}
                    aria-label="Próxima foto"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
              <button
                onClick={() => aoFavoritar(produto.id)}
                className="absolute bottom-3 right-3 p-2.5 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
              >
                <Heart size={17} className={favoritos.includes(produto.id) ? "fill-red-500 text-red-500" : "text-gray-300"} />
              </button>
            </div>

            {/* Miniaturas: capa + fotos extras + fotos das cores */}
            {fotosGaleria.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {fotosGaleria.map((foto, i) => (
                  <button
                    key={i}
                    onClick={() => setFotoSelecionada(foto)}
                    className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 p-1 bg-gray-50 transition-colors ${
                      fotoSelecionada === foto ? "border-[#C8102E]" : "border-gray-100 hover:border-gray-300"
                    }`}
                  >
                    <ImagemProduto src={foto} alt={`${produto.name} - foto ${i + 1}`} className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}

            {/* Seletor de cor/modelo */}
            {produto.colors && produto.colors.length > 0 && (
              <div className="mt-4">
                <p className="text-[12px] font-bold text-gray-600 mb-2">
                  Cor{corSelecionada ? `: ${corSelecionada.nome}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {produto.colors.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => aoEscolherCor(c)}
                      title={c.nome}
                      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border-2 text-[12px] font-bold transition-colors ${
                        corSelecionada?.nome === c.nome ? "border-[#C8102E] text-[#C8102E]" : "border-gray-200 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      <ImagemProduto
                        src={c.image || produto.image}
                        alt={c.nome}
                        className="w-7 h-7 rounded-full object-cover border border-gray-200 flex-shrink-0 bg-gray-50"
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                        style={{ backgroundColor: c.hex || "#cccccc" }}
                      />
                      {c.nome}
                      {typeof c.estoque === "number" && c.estoque <= 0 && (
                        <span className="text-[10px] text-red-500 font-black">ESGOTADO</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wide">{produto.brand}</span>
            </div>
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
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 mb-5">
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
                <span className={`text-[12px] font-bold ${estoqueEfetivo < 15 ? "text-red-500" : "text-gray-500"}`}>
                  {estoqueEfetivo <= 0
                    ? corSelecionada
                      ? `Esgotado na cor ${corSelecionada.nome}`
                      : "Produto esgotado"
                    : estoqueEfetivo < 15
                    ? `Últimas ${estoqueEfetivo} unidades!${corSelecionada ? ` na cor ${corSelecionada.nome}` : ""}`
                    : `${estoqueEfetivo} em estoque`}
                </span>
              </div>
            </div>

            {estoqueEfetivo <= 0 ? (
              <button
                disabled
                className="w-full bg-gray-200 text-gray-400 font-black py-4 rounded-xl text-base flex items-center justify-center gap-2 mb-3 cursor-not-allowed"
              >
                {corSelecionada ? `Esgotado na cor ${corSelecionada.nome}` : "Produto Esgotado"}
              </button>
            ) : (
              <button
                onClick={() => aoAdicionarAoCarrinho(produtoParaComprar)}
                className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2 mb-3"
              >
                <ShoppingCart size={17} />
                Comprar{corSelecionada ? ` — ${corSelecionada.nome}` : ""}
              </button>
            )}

            {/* Delivery options */}
            <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Truck size={15} className="text-[#C8102E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">Receba amanhã</div>
                    <div className="text-[11px] text-gray-400">Para pagamentos confirmados hoje</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black flex-shrink-0">Grátis</span>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-[#C8102E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">Retire na loja a partir de 2 horas</div>
                    <div className="text-[11px] text-gray-400">Após aprovação da compra</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black flex-shrink-0">Grátis</span>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <RotateCcw size={15} className="text-[#C8102E]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">Devolução grátis</div>
                    <div className="text-[11px] text-gray-400">Até 30 dias após o recebimento</div>
                  </div>
                </div>
                <span className="text-emerald-600 text-[12px] font-black flex-shrink-0">Grátis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Avaliações dos clientes */}
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h2 className="text-lg font-black text-gray-900 mb-4">Avaliações dos clientes</h2>

          {carregandoAvaliacoes ? (
            <p className="text-[13px] text-gray-400 mb-5">Carregando avaliações...</p>
          ) : avaliacoes.length === 0 ? (
            <p className="text-[13px] text-gray-400 mb-5">Ainda não há avaliações para este produto.</p>
          ) : (
            <div className="space-y-3 mb-6">
              {avaliacoes.map((a) => (
                <div key={a.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px] text-gray-800">{a.clienteNome}</span>
                      <div className="flex">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={12} className={i < a.nota ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
                        ))}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">{a.date}</span>
                  </div>
                  {a.comentario && <p className="text-[13px] text-gray-700 mt-2 whitespace-pre-line">{a.comentario}</p>}
                  {a.video && (
                    <video controls className="mt-3 rounded-lg max-h-[280px] bg-black w-full sm:w-auto" src={a.video} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Formulário: só clientes que compraram este produto podem avaliar */}
          {usuario && jaComprou && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
              <h3 className="font-black text-gray-900 text-[14px] mb-3">
                {minhaAvaliacao ? "Editar minha avaliação" : "Deixe sua avaliação"}
              </h3>
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setNotaForm(n)} aria-label={`${n} estrela${n > 1 ? "s" : ""}`}>
                    <Star size={22} className={n <= notaForm ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
                  </button>
                ))}
              </div>
              <textarea
                value={comentarioForm}
                onChange={(e) => setComentarioForm(e.target.value)}
                placeholder="Conte o que achou do produto..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]/30"
              />
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <Video size={15} />
                  {videoForm ? "Trocar vídeo" : "Anexar vídeo (opcional)"}
                  <input type="file" accept="video/*" className="hidden" onChange={aoEscolherVideo} />
                </label>
                {videoForm && (
                  <span className="text-[12px] text-gray-500 flex items-center gap-2">
                    {nomeVideoForm || "vídeo anexado"}
                    <button
                      type="button"
                      onClick={() => { setVideoForm(null); setNomeVideoForm(""); }}
                      className="text-red-500 font-bold hover:underline"
                    >
                      Remover
                    </button>
                  </span>
                )}
              </div>
              {videoForm && <video controls className="rounded-lg max-h-[220px] bg-black mb-3 w-full sm:w-auto" src={videoForm} />}
              <p className="text-[11px] text-gray-400 mb-3">
                Vídeo de até {LIMITE_VIDEO_AVALIACAO_SEGUNDOS}s e {LIMITE_VIDEO_AVALIACAO_MB} MB.
              </p>
              {erroForm && <p className="text-[12px] text-red-500 font-semibold mb-3">{erroForm}</p>}
              <button
                onClick={aoEnviarAvaliacao}
                disabled={enviando}
                className="bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-60 text-white font-black py-2.5 px-5 rounded-xl text-[13px] transition-colors"
              >
                {enviando ? "Enviando..." : minhaAvaliacao ? "Atualizar avaliação" : "Enviar avaliação"}
              </button>
            </div>
          )}

          {usuario && !jaComprou && (
            <p className="text-[12px] text-gray-400">Só clientes que compraram este produto podem avaliar.</p>
          )}
          {!usuario && (
            <p className="text-[12px] text-gray-400">Entre na sua conta para avaliar este produto.</p>
          )}
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
