// Tela PaginaMontarCaixa
//
// Área dedicada em que o cliente monta a própria caixa de presente, em três
// passos: escolhe a CAIXA (o recipiente — produtos cadastrados na categoria
// "Caixas"), enche ela com os produtos que quiser e, por fim, escreve o
// cartão de mensagem. No final tudo vira UMA linha do carrinho (ver
// linhaDeCarrinhoDaCaixa, em utils.ts) — por dentro continuam sendo produtos
// de verdade, cada um com o próprio estoque.

import { useState, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Gift, Check, Plus, Minus, Search, Trash2,
  Sparkles, ShoppingBasket, PenLine, X,
} from "lucide-react";
import type { Produto, CaixaMontada, ItemDaCaixa } from "../types";
import {
  CATEGORIA_CAIXA, CATEGORIAS, MIN_ITENS_CAIXA, MAX_QTD_POR_ITEM_CAIXA,
  MAX_CARACTERES_MENSAGEM_CAIXA, TAMANHOS_CAIXA,
} from "../constantes";
import { formatarMoeda, novoIdDeCaixa, tamanhosDisponiveis, tamanhoDoProduto, capacidadeDaCaixa } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { Logo } from "../components/Logo";

const ETAPAS = [
  { numero: 1, titulo: "Escolha a caixa e o tamanho", curto: "A caixa" },
  { numero: 2, titulo: "Escolha os produtos", curto: "Produtos" },
  { numero: 3, titulo: "Cartão e revisão", curto: "Cartão" },
];

export function PaginaMontarCaixa({
  produtos,
  caixaInicial,
  aoVoltar,
  aoConcluir,
}: {
  produtos: Produto[];
  // Preenchida quando o cliente clica em "Editar caixa" lá no carrinho —
  // a montagem reabre exatamente como ele deixou
  caixaInicial?: CaixaMontada | null;
  aoVoltar: () => void;
  aoConcluir: (caixa: CaixaMontada) => void;
}) {
  const [etapa, setEtapa] = useState(caixaInicial ? 2 : 1);
  const [recipienteId, setRecipienteId] = useState<number | null>(caixaInicial?.recipienteId ?? null);
  // Tamanho escolhido (P/M/G). Fica null nas caixas de tamanho único.
  const [tamanhoEscolhido, setTamanhoEscolhido] = useState<"P" | "M" | "G" | null>(
    caixaInicial?.recipienteTamanho ?? null
  );
  // produtoId → quantidade escolhida dentro da caixa
  const [escolhidos, setEscolhidos] = useState<Record<number, number>>(() => {
    const inicial: Record<number, number> = {};
    for (const i of caixaInicial?.itens ?? []) inicial[i.produtoId] = i.qty;
    return inicial;
  });
  const [para, setPara] = useState(caixaInicial?.para ?? "");
  const [de, setDe] = useState(caixaInicial?.de ?? "");
  const [mensagem, setMensagem] = useState(caixaInicial?.mensagem ?? "");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Outros");
  // No celular o resumo não cabe ao lado: abre por cima, pelo botão da barra
  const [resumoAberto, setResumoAberto] = useState(false);
  const [aviso, setAviso] = useState("");

  const caixasDisponiveis = useMemo(
    () => produtos.filter((p) => p.category === CATEGORIA_CAIXA),
    [produtos]
  );
  const recipiente = caixasDisponiveis.find((p) => p.id === recipienteId) ?? null;
  // Os tamanhos que ESTA caixa oferece (vazio = caixa de tamanho único)
  const tamanhosDaCaixa = recipiente ? tamanhosDisponiveis(recipiente) : [];
  const tamanho = tamanhoDoProduto(recipiente ?? undefined, tamanhoEscolhido ?? undefined);
  // Preço da caixa vazia: o do tamanho escolhido, ou o do produto quando ela é
  // de tamanho único
  const precoRecipiente = tamanho?.price ?? recipiente?.price ?? 0;
  // Quantos produtos cabem dentro. Sem tamanho, não há teto (Infinity).
  const capacidade = capacidadeDaCaixa(tamanho?.capacidade);
  // Só falta escolher o tamanho quando a caixa oferece tamanhos e nenhum foi
  // marcado ainda — é o que trava a passagem para a etapa 2.
  const faltaEscolherTamanho = tamanhosDaCaixa.length > 0 && !tamanho;

  // Tudo que NÃO é caixa pode ir dentro da caixa
  const produtosParaRecheio = useMemo(
    () => produtos.filter((p) => p.category !== CATEGORIA_CAIXA && p.stock > 0),
    [produtos]
  );

  const categoriasComProduto = useMemo(
    () => ["Outros", ...CATEGORIAS.filter(
      (c) => c !== "Outros" && c !== CATEGORIA_CAIXA && produtosParaRecheio.some((p) => p.category === c)
    )],
    [produtosParaRecheio]
  );

  const recheioFiltrado = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtosParaRecheio.filter((p) => {
      if (termo) {
        return p.name.toLowerCase().includes(termo) || p.brand.toLowerCase().includes(termo);
      }
      // "Outros" aqui é o atalho de "todas as categorias", igual à vitrine
      return categoria === "Outros" || p.category === categoria;
    });
  }, [produtosParaRecheio, busca, categoria]);

  // Itens escolhidos, já no formato que vai para o carrinho e para o pedido
  const itens: ItemDaCaixa[] = useMemo(
    () =>
      Object.entries(escolhidos)
        .map(([id, qty]) => {
          const p = produtos.find((x) => x.id === Number(id));
          return p ? { produtoId: p.id, name: p.name, price: p.price, image: p.image, qty } : null;
        })
        .filter((i): i is ItemDaCaixa => i !== null && i.qty > 0),
    [escolhidos, produtos]
  );

  const qtdItens = itens.reduce((acum, i) => acum + i.qty, 0);
  const totalRecheio = itens.reduce((acum, i) => acum + i.price * i.qty, 0);
  const total = precoRecipiente + totalRecheio;
  const podeFinalizar = Boolean(recipiente) && !faltaEscolherTamanho && qtdItens >= MIN_ITENS_CAIXA;
  // Vagas que ainda sobram no tamanho escolhido
  const vagasRestantes = Math.max(0, capacidade - qtdItens);
  const caixaCheia = vagasRestantes === 0;

  // Teto por produto: o que o Admin tem em estoque, limitado ao máximo por
  // item da caixa (uma caixa não é compra no atacado) e ao que ainda cabe
  // dentro do tamanho escolhido — não adianta oferecer 10 unidades de um
  // produto se só restam 2 vagas na caixa P.
  const tetoDoProduto = (p: Produto) => {
    const jaEscolhido = escolhidos[p.id] ?? 0;
    return Math.max(0, Math.min(MAX_QTD_POR_ITEM_CAIXA, p.stock, jaEscolhido + vagasRestantes));
  };

  const mudarQtd = (p: Produto, variacao: number) => {
    // Caixa cheia: em vez de um botão morto, diz o porquê e o que fazer
    if (variacao > 0 && caixaCheia) {
      setAviso(
        "A caixa " + tamanhoEscolhido + " já está cheia (" + capacidade + " " +
        (capacidade === 1 ? "produto" : "produtos") + "). Tire algo de dentro ou " +
        "volte à etapa 1 e escolha um tamanho maior."
      );
      return;
    }
    setAviso("");
    setEscolhidos((anterior) => {
      const atual = anterior[p.id] ?? 0;
      const nova = Math.max(0, Math.min(atual + variacao, tetoDoProduto(p)));
      const copia = { ...anterior };
      if (nova === 0) delete copia[p.id];
      else copia[p.id] = nova;
      return copia;
    });
  };

  const removerItem = (produtoId: number) =>
    setEscolhidos((anterior) => {
      const copia = { ...anterior };
      delete copia[produtoId];
      return copia;
    });

  const escolherCaixa = (p: Produto) => {
    setRecipienteId(p.id);
    setTamanhoEscolhido(null);
    setAviso("");
    // Caixa com tamanhos fica na etapa 1: ainda falta escolher P, M ou G. Só a
    // de tamanho único segue direto para o recheio.
    if (tamanhosDisponiveis(p).length > 0) return;
    setEtapa(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const escolherTamanho = (p: Produto, t: "P" | "M" | "G") => {
    setRecipienteId(p.id);
    setTamanhoEscolhido(t);
    setAviso("");
    // Trocar para um tamanho menor com a caixa já cheia deixaria a montagem
    // acima do limite — aqui o excesso sai, do último produto colocado para
    // trás, em vez de barrar a troca.
    const nova = tamanhoDoProduto(p, t);
    if (nova) {
      setEscolhidos((anterior) => {
        const ids = Object.keys(anterior).map(Number);
        let total = ids.reduce((soma, id) => soma + anterior[id], 0);
        if (total <= nova.capacidade) return anterior;
        const copia = { ...anterior };
        for (const id of [...ids].reverse()) {
          while (total > nova.capacidade && copia[id] > 0) { copia[id]--; total--; }
          if (copia[id] === 0) delete copia[id];
          if (total <= nova.capacidade) break;
        }
        setAviso("Alguns produtos saíram da caixa: o tamanho " + t + " cabe " + nova.capacidade + ".");
        return copia;
      });
    }
    setEtapa(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const irParaEtapa = (n: number) => {
    if (n >= 2 && !recipiente) {
      setAviso("Escolha primeiro a caixa que vai receber os produtos.");
      return;
    }
    if (n >= 2 && faltaEscolherTamanho) {
      setAviso("Escolha o tamanho da caixa: P, M ou G.");
      return;
    }
    if (n === 3 && !podeFinalizar) {
      setAviso(`Coloque pelo menos ${MIN_ITENS_CAIXA} produto na caixa para continuar.`);
      return;
    }
    setAviso("");
    setEtapa(n);
    setResumoAberto(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finalizar = () => {
    if (!recipiente || !podeFinalizar) {
      setAviso(
        faltaEscolherTamanho
          ? "Escolha o tamanho da caixa: P, M ou G."
          : "Escolha uma caixa e pelo menos um produto para continuar."
      );
      return;
    }
    aoConcluir({
      id: caixaInicial?.id ?? novoIdDeCaixa(),
      recipienteId: recipiente.id,
      recipienteNome: recipiente.name,
      recipienteImagem: recipiente.image,
      recipientePreco: precoRecipiente,
      recipienteTamanho: tamanho?.tamanho,
      recipienteCapacidade: tamanho?.capacidade,
      itens,
      para: para.trim() || undefined,
      de: de.trim() || undefined,
      mensagem: mensagem.trim() || undefined,
    });
  };

  // ─── Resumo (coluna da direita no desktop, painel por cima no celular) ───
  const resumo = (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="bg-[#4A1218] px-4 py-3 flex items-center gap-2">
        <ShoppingBasket size={17} className="text-[#E8B84B]" />
        <span className="text-white font-black text-[13px]">Sua caixa</span>
        <span className="ml-auto text-white/60 text-[11px] font-semibold">
          {capacidade === Infinity
            ? `${qtdItens} ${qtdItens === 1 ? "produto" : "produtos"}`
            : `${qtdItens} de ${capacidade}`}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* A caixa escolhida */}
        {recipiente ? (
          <div className="flex items-center gap-3 pb-3 border-b border-dashed border-gray-200">
            <div className="w-12 h-12 bg-gray-50 rounded-lg p-1 flex-shrink-0">
              <ImagemProduto src={recipiente.image} alt={recipiente.name} className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] text-[#C79A3B] font-black uppercase tracking-wide">
                A caixa{tamanho ? " · tamanho " + tamanho.tamanho : ""}
              </p>
              <p className="text-[12px] font-bold text-gray-800 leading-tight line-clamp-2">{recipiente.name}</p>
              {tamanho && (
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                  cabe {tamanho.capacidade} {tamanho.capacidade === 1 ? "produto" : "produtos"}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[12px] font-black text-gray-900">{formatarMoeda(precoRecipiente)}</p>
              <button
                onClick={() => { setEtapa(1); setResumoAberto(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="text-[10px] text-[#A8102A] font-bold hover:underline"
              >
                trocar
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 border-b border-dashed border-gray-200">
            <Gift size={22} className="text-gray-300 mx-auto mb-1.5" strokeWidth={1.75} />
            <p className="text-[12px] text-gray-400 font-semibold">Nenhuma caixa escolhida ainda</p>
          </div>
        )}

        {/* O que foi colocado dentro */}
        {itens.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-3">
            A caixa está vazia. Escolha os produtos que vão dentro dela.
          </p>
        ) : (
          <ul className="space-y-2 max-h-[38vh] lg:max-h-[32vh] overflow-y-auto -mr-1 pr-1">
            {itens.map((i) => (
              <li key={i.produtoId} className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-gray-50 rounded-lg p-0.5 flex-shrink-0">
                  <ImagemProduto src={i.image} alt={i.name} className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold text-gray-700 leading-tight line-clamp-1">{i.name}</p>
                  <p className="text-[10.5px] text-gray-400">{i.qty}x {formatarMoeda(i.price)}</p>
                </div>
                <span className="text-[11.5px] font-black text-gray-800 flex-shrink-0">
                  {formatarMoeda(i.price * i.qty)}
                </span>
                <button
                  onClick={() => removerItem(i.produtoId)}
                  aria-label={`Tirar ${i.name} da caixa`}
                  className="text-gray-300 hover:text-red-500 p-1 -m-1 rounded transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-gray-100 pt-3 flex items-end justify-between">
          <span className="text-[12px] font-bold text-gray-500">Total da caixa</span>
          <span className="text-xl font-black text-gray-900">{formatarMoeda(total)}</span>
        </div>
        <p className="text-[10.5px] text-gray-400 leading-snug">
          Frete e descontos são calculados no carrinho, na finalização da compra.
        </p>
      </div>
    </div>
  );

  const rotuloBotao =
    etapa === 3
      ? "Adicionar caixa ao carrinho"
      : etapa === 1
      // Botão desligado dizendo "Escolher os produtos" só confunde: enquanto
      // faltar o tamanho, ele diz o que realmente falta fazer.
      ? faltaEscolherTamanho
        ? "Escolha o tamanho"
        : "Escolher os produtos"
      : "Ir para o cartão";
  const acaoBotao = () => (etapa === 3 ? finalizar() : irParaEtapa(etapa + 1));
  const botaoDesabilitado =
    etapa === 3 ? !podeFinalizar : etapa === 2 ? qtdItens === 0 : !recipiente || faltaEscolherTamanho;

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-28 lg:pb-12" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Cabeçalho */}
      <div className="bg-[#A8102A] py-3 px-4">
        <div className="max-w-[1440px] mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            onClick={aoVoltar}
            className="justify-self-start text-white/85 hover:text-white flex items-center gap-1.5 text-[13px] font-semibold transition-colors py-2 pr-2 -my-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Voltar à loja</span>
          </button>
          <div className="justify-self-center">
            <Logo claro />
          </div>
          <div />
        </div>
      </div>

      {/* Chamada da área. No celular ela ocupa quase a tela toda, e cada troca
          de etapa volta o scroll para o topo — quem já está montando cairia
          nela de novo em vez de nos produtos. Por isso some depois da etapa 1;
          no desktop, onde sobra altura, continua sempre visível. */}
      <div
        className={`bg-gradient-to-br from-[#4A1218] to-[#7A1220] text-white ${
          etapa > 1 ? "hidden md:block" : ""
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-4 py-7 md:py-9 text-center">
          <span className="inline-flex items-center gap-1.5 bg-[#E8B84B]/15 text-[#E8B84B] text-[10.5px] font-black px-3 py-1 rounded-full tracking-wide">
            <Sparkles size={12} /> EXCLUSIVO
          </span>
          <h1 className="text-2xl md:text-4xl font-black mt-3">Monte sua caixa de presente</h1>
          <p className="text-white/70 text-[13px] md:text-[15px] mt-2 max-w-xl mx-auto leading-relaxed">
            Escolha a caixa, encha do jeito que quiser e escreva o cartão.
            Nós montamos e entregamos tudo pronto para presentear.
          </p>
        </div>
      </div>

      {/* Passo a passo */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex items-center justify-center gap-1.5 md:gap-3">
          {ETAPAS.map((e, indice) => {
            const concluida = etapa > e.numero;
            const ativa = etapa === e.numero;
            return (
              <div key={e.numero} className="flex items-center gap-1.5 md:gap-3">
                <button
                  onClick={() => irParaEtapa(e.numero)}
                  className="flex items-center gap-2 group"
                  aria-current={ativa ? "step" : undefined}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-colors ${
                      concluida
                        ? "bg-emerald-500 text-white"
                        : ativa
                        ? "bg-[#A8102A] text-white"
                        : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                    }`}
                  >
                    {concluida ? <Check size={14} strokeWidth={3} /> : e.numero}
                  </span>
                  <span className={`text-[12px] font-bold ${ativa ? "text-gray-900" : "text-gray-400"}`}>
                    <span className="hidden md:inline">{e.titulo}</span>
                    <span className="md:hidden">{e.curto}</span>
                  </span>
                </button>
                {indice < ETAPAS.length - 1 && (
                  <span className={`w-4 md:w-10 h-[2px] rounded-full ${etapa > e.numero ? "bg-emerald-400" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 py-6">
        {aviso && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-[12.5px] font-semibold px-4 py-3 rounded-xl">
            {aviso}
          </div>
        )}

        <div className="flex gap-6 flex-col lg:flex-row">
          <div className="flex-1 min-w-0">
            {/* ─── Etapa 1: escolher a caixa ─────────────────────────────── */}
            {etapa === 1 && (
              <section>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-1 h-6 rounded-full bg-[#A8102A]" />
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Escolha a caixa</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {caixasDisponiveis.length}{" "}
                      {caixasDisponiveis.length === 1 ? "opção disponível" : "opções disponíveis"}
                    </p>
                  </div>
                </div>

                {caixasDisponiveis.length === 0 ? (
                  <div className="py-16 text-center bg-white rounded-2xl border border-gray-100">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                      <Gift size={26} strokeWidth={1.75} className="text-[#A8102A]" />
                    </div>
                    <p className="font-bold text-gray-700 mb-1">Nenhuma caixa cadastrada ainda</p>
                    <p className="text-sm text-gray-400 max-w-xs mx-auto">
                      As caixas aparecem aqui assim que forem cadastradas no painel Admin,
                      na categoria “{CATEGORIA_CAIXA}”.
                    </p>
                  </div>
                ) : (
                  // No celular a caixa ocupa a linha inteira (deitada, foto à
                  // esquerda): em duas colunas os tamanhos não cabiam e o preço
                  // ficava cortado na borda do card.
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 items-start">
                    {caixasDisponiveis.map((p) => {
                      const selecionada = recipienteId === p.id;
                      const tams = tamanhosDisponiveis(p);
                      // Caixa COM tamanhos acaba quando nenhum tamanho tem
                      // estoque; a de tamanho único segue pelo estoque do
                      // produto, como sempre foi.
                      const esgotada = (p.tamanhos?.length ?? 0) > 0 ? tams.length === 0 : p.stock <= 0;
                      // A vitrine da etapa 1 mostra o menor preço ("a partir
                      // de"), porque o preço de verdade depende do tamanho
                      const menorPreco = tams.length > 0 ? Math.min(...tams.map((t) => t.price)) : p.price;
                      return (
                        <div
                          key={p.id}
                          className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
                            selecionada ? "border-[#A8102A] shadow-md" : "border-gray-100 hover:border-[#A8102A]/30"
                          } ${esgotada ? "opacity-55" : ""}`}
                        >
                          <button
                            onClick={() => !esgotada && escolherCaixa(p)}
                            disabled={esgotada}
                            className="text-left w-full flex sm:block disabled:cursor-not-allowed"
                          >
                            <div className="relative bg-gray-50/70 p-3 w-[38%] max-w-[150px] flex-shrink-0 flex items-center sm:w-auto sm:max-w-none sm:block">
                              <ImagemProduto
                                src={p.image}
                                alt={p.name}
                                className="w-full h-[112px] sm:h-[140px] md:h-[165px] object-contain"
                              />
                              {selecionada && (
                                <span className="absolute top-2 right-2 w-7 h-7 bg-[#A8102A] rounded-full flex items-center justify-center">
                                  <Check size={15} className="text-white" strokeWidth={3} />
                                </span>
                              )}
                              {esgotada && (
                                <span className="absolute top-2 left-2 bg-gray-700 text-white text-[9px] font-black px-2 py-1 rounded-full">
                                  ESGOTADA
                                </span>
                              )}
                            </div>
                            <div className="p-3 flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-gray-800 leading-snug line-clamp-2">{p.name}</p>
                              <p className="text-[17px] font-black text-gray-900 mt-1.5">
                                {tams.length > 1 && (
                                  <span className="text-[10.5px] font-bold text-gray-400">a partir de </span>
                                )}
                                {formatarMoeda(menorPreco)}
                              </p>
                              <span
                                className={`mt-2.5 block text-center text-[12px] font-black py-2 rounded-xl ${
                                  selecionada && (tams.length === 0 || tamanhoEscolhido)
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-[#A8102A] text-white"
                                }`}
                              >
                                {esgotada
                                  ? "Indisponível"
                                  : tams.length > 0
                                  ? selecionada
                                    ? tamanhoEscolhido
                                      ? `Caixa ${tamanhoEscolhido} escolhida`
                                      : "Agora o tamanho ↓"
                                    : "Escolher esta"
                                  : selecionada
                                  ? "Caixa escolhida"
                                  : "Escolher esta"}
                              </span>
                            </div>
                          </button>

                          {/* Tamanhos: aparecem depois que a caixa é escolhida,
                              para não poluir a grade toda de uma vez */}
                          {selecionada && tams.length > 0 && !esgotada && (
                            <div className="px-3 pb-3 -mt-1">
                              <p className="text-[9.5px] font-black text-gray-400 uppercase tracking-wide mb-1.5">
                                Escolha o tamanho
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {tams.map((t) => {
                                  const marcado = tamanhoEscolhido === t.tamanho;
                                  const rotulo = TAMANHOS_CAIXA.find((x) => x.tamanho === t.tamanho);
                                  return (
                                    <button
                                      key={t.tamanho}
                                      onClick={() => escolherTamanho(p, t.tamanho)}
                                      title={`${rotulo?.nome ?? t.tamanho} — cabe ${t.capacidade} produtos`}
                                      className={`w-full min-w-0 flex items-center gap-2 rounded-xl pl-1.5 pr-2.5 py-2 border-2 transition-colors ${
                                        marcado
                                          ? "border-[#A8102A] bg-[#A8102A]/5"
                                          : "border-gray-200 hover:border-[#A8102A]/40 bg-white"
                                      }`}
                                    >
                                      {/* A letra num quadrinho: âncora visual da linha */}
                                      <span
                                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[12px] font-black flex-shrink-0 ${
                                          marcado ? "bg-[#A8102A] text-white" : "bg-gray-100 text-gray-700"
                                        }`}
                                      >
                                        {t.tamanho}
                                      </span>
                                      {/* Encolhe (com reticências) em vez de
                                          empurrar o preço para fora do card */}
                                      <span className="flex-1 min-w-0 text-left">
                                        <span
                                          className={`block text-[11px] font-black leading-tight truncate ${
                                            marcado ? "text-[#A8102A]" : "text-gray-700"
                                          }`}
                                        >
                                          {rotulo?.nome ?? t.tamanho}
                                        </span>
                                        <span className="block text-[10px] font-bold text-gray-400 leading-tight truncate">
                                          cabe {t.capacidade} {t.capacidade === 1 ? "produto" : "produtos"}
                                        </span>
                                      </span>
                                      <span
                                        className={`text-[11.5px] font-black whitespace-nowrap flex-shrink-0 ${
                                          marcado ? "text-[#A8102A]" : "text-gray-800"
                                        }`}
                                      >
                                        {formatarMoeda(t.price)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ─── Etapa 2: encher a caixa ───────────────────────────────── */}
            {etapa === 2 && (
              <section>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-1 h-6 rounded-full bg-[#A8102A]" />
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Escolha os produtos</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {capacidade === Infinity
                        ? `Coloque na caixa quantos produtos quiser — até ${MAX_QTD_POR_ITEM_CAIXA} de cada.`
                        : `A caixa ${tamanhoEscolhido} cabe ${capacidade} produtos — até ${MAX_QTD_POR_ITEM_CAIXA} de cada.`}
                    </p>
                  </div>
                </div>

                {/* Quanto já foi ocupado do tamanho escolhido. É o que mostra,
                    sem o cliente ter que contar, por que vale subir de tamanho. */}
                {capacidade !== Infinity && (
                  <div className="bg-white rounded-xl border border-gray-100 px-3.5 py-2.5 mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11.5px] font-bold text-gray-600">
                        Ocupação da caixa {tamanhoEscolhido}
                      </span>
                      <span
                        className={`text-[11.5px] font-black ${caixaCheia ? "text-[#A8102A]" : "text-gray-700"}`}
                        aria-live="polite"
                      >
                        {qtdItens} de {capacidade}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${caixaCheia ? "bg-[#A8102A]" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, (qtdItens / capacidade) * 100)}%` }}
                      />
                    </div>
                    {caixaCheia && (
                      <button
                        onClick={() => irParaEtapa(1)}
                        className="text-[10.5px] text-[#A8102A] font-bold mt-1.5 hover:underline"
                      >
                        Caixa cheia — trocar por um tamanho maior
                      </button>
                    )}
                  </div>
                )}

                {/* Busca */}
                <div className="flex bg-white rounded-xl overflow-hidden border border-gray-200 focus-within:border-[#A8102A] transition-colors mb-3">
                  <span className="pl-4 flex items-center">
                    <Search size={17} className="text-gray-400" />
                  </span>
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar um produto para colocar na caixa"
                    aria-label="Buscar produto"
                    className="flex-1 px-3 py-3 text-[14px] text-gray-800 outline-none placeholder:text-gray-400 min-w-0"
                  />
                  {busca && (
                    <button
                      onClick={() => setBusca("")}
                      aria-label="Limpar busca"
                      className="px-4 text-gray-400 hover:text-gray-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Categorias */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-3">
                  {categoriasComProduto.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setCategoria(c); setBusca(""); }}
                      className={`px-3.5 py-2 rounded-full text-[12.5px] font-bold whitespace-nowrap transition-colors ${
                        categoria === c && !busca
                          ? "bg-[#A8102A] text-white"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {c === "Outros" ? "Tudo" : c}
                    </button>
                  ))}
                </div>

                {recheioFiltrado.length === 0 ? (
                  <div className="py-14 text-center bg-white rounded-2xl border border-gray-100">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                      <Search size={22} strokeWidth={1.75} className="text-[#A8102A]" />
                    </div>
                    <p className="font-bold text-gray-700 mb-1">Nenhum produto encontrado</p>
                    <p className="text-sm text-gray-400">Tente outra categoria ou outro termo de busca.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                    {recheioFiltrado.map((p) => {
                      const qty = escolhidos[p.id] ?? 0;
                      const teto = tetoDoProduto(p);
                      return (
                        <div
                          key={p.id}
                          className={`bg-white rounded-2xl border-2 overflow-hidden flex flex-col transition-colors ${
                            qty > 0 ? "border-[#A8102A]" : "border-gray-100"
                          }`}
                        >
                          <div className="relative bg-gray-50/70 p-2.5 md:p-3">
                            <ImagemProduto
                              src={p.image}
                              alt={p.name}
                              className="w-full h-[105px] md:h-[130px] object-contain"
                            />
                            {qty > 0 && (
                              <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 bg-[#A8102A] rounded-full flex items-center justify-center text-white text-[11px] font-black">
                                {qty}
                              </span>
                            )}
                          </div>
                          <div className="p-2.5 md:p-3 flex flex-col flex-1">
                            <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{p.brand}</span>
                            <p className="text-[12px] md:text-[13px] text-gray-800 font-semibold leading-snug mt-0.5 line-clamp-2 flex-1">
                              {p.name}
                            </p>
                            <p className="text-[15px] md:text-[17px] font-black text-gray-900 mt-1.5">
                              {formatarMoeda(p.price)}
                            </p>

                            {qty === 0 ? (
                              <button
                                onClick={() => mudarQtd(p, 1)}
                                className="mt-2.5 bg-[#A8102A] hover:bg-[#7A1220] text-white font-bold text-[12.5px] py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Plus size={14} strokeWidth={3} /> Colocar
                              </button>
                            ) : (
                              <div className="mt-2.5 flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                                <button
                                  onClick={() => mudarQtd(p, -1)}
                                  aria-label={`Tirar um ${p.name} da caixa`}
                                  className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                                >
                                  <Minus size={14} strokeWidth={3} />
                                </button>
                                <span className="flex-1 text-center text-[13px] font-black" aria-live="polite">{qty}</span>
                                <button
                                  onClick={() => mudarQtd(p, 1)}
                                  disabled={qty >= Math.min(MAX_QTD_POR_ITEM_CAIXA, p.stock)}
                                  aria-label={`Colocar mais um ${p.name} na caixa`}
                                  className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Plus size={14} strokeWidth={3} />
                                </button>
                              </div>
                            )}
                            {qty > 0 && qty >= teto && (
                              <p className="text-[10px] text-amber-600 font-semibold mt-1 text-center">
                                {caixaCheia
                                  ? "Caixa cheia"
                                  : p.stock <= MAX_QTD_POR_ITEM_CAIXA
                                  ? "Todo o estoque"
                                  : "Máximo por caixa"}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ─── Etapa 3: cartão de mensagem e revisão ─────────────────── */}
            {etapa === 3 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-1 h-6 rounded-full bg-[#A8102A]" />
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Cartão de mensagem</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Opcional — escrevemos à mão e colocamos na caixa.</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] font-bold text-gray-700 block mb-1.5" htmlFor="caixa-para">Para</label>
                      <input
                        id="caixa-para"
                        value={para}
                        onChange={(e) => setPara(e.target.value.slice(0, 60))}
                        placeholder="Quem vai receber"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-700 block mb-1.5" htmlFor="caixa-de">De</label>
                      <input
                        id="caixa-de"
                        value={de}
                        onChange={(e) => setDe(e.target.value.slice(0, 60))}
                        placeholder="Quem está presenteando"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-[12px] font-bold text-gray-700 block mb-1.5" htmlFor="caixa-mensagem">Mensagem</label>
                    <textarea
                      id="caixa-mensagem"
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value.slice(0, MAX_CARACTERES_MENSAGEM_CAIXA))}
                      rows={4}
                      placeholder="Escreva aqui o recado que vai no cartão…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors resize-none"
                    />
                    <p className="text-[10.5px] text-gray-400 text-right mt-1">
                      {mensagem.length}/{MAX_CARACTERES_MENSAGEM_CAIXA}
                    </p>
                  </div>

                  {/* Prévia do cartão */}
                  {(para || de || mensagem) && (
                    <div className="mt-2 bg-[#FBF4EA] border border-dashed border-[#C79A3B]/50 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <PenLine size={13} className="text-[#C79A3B]" />
                        <span className="text-[10px] font-black text-[#C79A3B] uppercase tracking-wide">Prévia do cartão</span>
                      </div>
                      {para && <p className="text-[13px] font-bold text-gray-800">Para: {para}</p>}
                      {mensagem && <p className="text-[13px] text-gray-700 italic mt-1.5 whitespace-pre-wrap">“{mensagem}”</p>}
                      {de && <p className="text-[13px] font-bold text-gray-800 mt-1.5 text-right">De: {de}</p>}
                    </div>
                  )}
                </div>

                {/* Revisão do que vai dentro */}
                <div className="flex items-center gap-2.5 pt-1">
                  <span className="w-1 h-6 rounded-full bg-[#A8102A]" />
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Confira sua caixa</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {recipiente?.name} · {qtdItens} {qtdItens === 1 ? "produto" : "produtos"} dentro
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
                  {itens.map((i) => (
                    <div key={i.produtoId} className="flex items-center gap-3 p-3.5">
                      <div className="w-14 h-14 bg-gray-50 rounded-xl p-1 flex-shrink-0">
                        <ImagemProduto src={i.image} alt={i.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{i.name}</p>
                        <p className="text-[11.5px] text-gray-400 mt-0.5">{i.qty}x {formatarMoeda(i.price)}</p>
                      </div>
                      <span className="text-[14px] font-black text-gray-900 flex-shrink-0">
                        {formatarMoeda(i.price * i.qty)}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => irParaEtapa(2)}
                  className="text-[#A8102A] font-bold text-[13px] hover:underline flex items-center gap-1"
                >
                  <Plus size={14} strokeWidth={3} /> Colocar mais produtos na caixa
                </button>
              </section>
            )}
          </div>

          {/* Resumo fixo ao lado (desktop) */}
          <aside className="hidden lg:block w-[340px] flex-shrink-0">
            <div className="sticky top-[76px] space-y-3">
              {resumo}
              <button
                onClick={acaoBotao}
                disabled={botaoDesabilitado}
                className="w-full bg-[#A8102A] hover:bg-[#7A1220] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black text-[14px] py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {rotuloBotao}
                <ChevronRight size={17} />
              </button>
              {etapa > 1 && (
                <button
                  onClick={() => irParaEtapa(etapa - 1)}
                  className="w-full text-gray-500 hover:text-gray-800 font-bold text-[13px] py-2 transition-colors"
                >
                  Voltar ao passo anterior
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Resumo por cima (celular) */}
      {resumoAberto && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            aria-label="Fechar resumo"
            onClick={() => setResumoAberto(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative bg-[#FBF4EA] rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto">
            {/* O próprio resumo já se apresenta ("Sua caixa"), então aqui em
                cima fica só o fechar */}
            <div className="flex justify-end mb-2">
              <button onClick={() => setResumoAberto(false)} aria-label="Fechar" className="p-2 -m-1 text-gray-500">
                <X size={20} />
              </button>
            </div>
            {resumo}
          </div>
        </div>
      )}

      {/* Barra fixa (celular) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <button onClick={() => setResumoAberto(true)} className="text-left flex-shrink-0">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              {qtdItens} {qtdItens === 1 ? "produto" : "produtos"}
            </p>
            <p className="text-[17px] font-black text-gray-900 leading-tight">{formatarMoeda(total)}</p>
            <span className="text-[10.5px] text-[#A8102A] font-bold">ver caixa</span>
          </button>
          <button
            onClick={acaoBotao}
            disabled={botaoDesabilitado}
            className="flex-1 bg-[#A8102A] hover:bg-[#7A1220] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black text-[13.5px] py-3.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            {rotuloBotao}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
