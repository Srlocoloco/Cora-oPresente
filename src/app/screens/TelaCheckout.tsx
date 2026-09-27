// Tela TelaCheckout
//
// A finalização da compra, uma etapa por tela (a 4ª, "Pagar", é a
// TelaPagamentoCompra):
//   1. Entrega   — endereço salvo ou CEP (preenche rua, bairro e cidade)
//   2. Pagamento — Pix ou cartão, com o valor de cada um
//   3. Revisão   — tudo o que foi escolhido, código de venda, cupom e o
//                  botão "Confirmar compra"
// No celular o botão de seguir fica preso embaixo, com o total. O botão
// "voltar" do aparelho volta uma etapa (e da primeira, para o carrinho).
//
// O valor mostrado aqui é uma estimativa com as mesmas regras do servidor. Ao
// confirmar, o servidor recalcula tudo (preço, estoque, entrega, cupom) e é o
// valor dele que o cliente paga — ver backend-php/api/lib_compras.php.

import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode, CreditCard, AlertCircle, Loader2, ChevronLeft, MapPin } from "lucide-react";
import type { ItemCarrinho, ConfigLoja, Cupom, DadosPagamento, EnderecoEntrega } from "../types";
import { MAX_PARCELAS_CARTAO } from "../constantes";
import {
  formatarMoeda,
  precoParcela,
  maxParcelasDoCarrinho,
  estimarCompra,
  entregaNaCidade,
  textoCidadesAtendidas,
  lerArmazenamento,
  cupomEstaValido,
} from "../utils";
import { CabecalhoCheckout } from "../components/CabecalhoCheckout";
import { ResumoCompra, type LinhaResumo } from "../components/ResumoCompra";
import { ImagemProduto } from "../components/ImagemProduto";

type Etapa = 1 | 2 | 3;

const ENDERECO_VAZIO: EnderecoEntrega = { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

const enderecoCompleto = (e: EnderecoEntrega) =>
  e.cep.replace(/\D/g, "").length === 8 && !!e.rua.trim() && !!e.numero.trim() && !!e.cidade.trim();

const cepFormatado = (cep: string) => cep.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2");

const prazoDoCep = (cep: string) => (cep >= "80000000" && cep <= "82999999" ? "1 a 2 dias úteis" : "2 a 4 dias úteis");

export function TelaCheckout({
  items,
  config,
  cupons,
  vendedorVinculado,
  nomeDoDonoDoCodigo,
  aoVoltar,
  aoConfirmar,
}: {
  items: ItemCarrinho[];
  config: ConfigLoja;
  cupons: Cupom[];
  // E-mail do vendedor a quem a conta já está vinculada (null = 1ª compra)
  vendedorVinculado: string | null;
  // Nome do dono de um código de venda digitado (null = não reconhecido)
  nomeDoDonoDoCodigo: (codigo: string) => string | null;
  aoVoltar: () => void;
  // Cria a compra no servidor. Devolve a mensagem de erro, ou null se deu certo.
  aoConfirmar: (dados: DadosPagamento) => Promise<string | null>;
}) {
  const [etapa, setEtapa] = useState<Etapa>(1);

  // ── Entrega ──
  const [endereco, setEndereco] = useState<EnderecoEntrega>(() => ({
    ...ENDERECO_VAZIO,
    ...lerArmazenamento<Partial<EnderecoEntrega>>("cp_endereco", {}),
  }));
  // Quem já comprou vê o endereço salvo pronto; só abre o formulário se pedir
  const [editandoEndereco, setEditandoEndereco] = useState(() => !enderecoCompleto(endereco));
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");
  const [erroEntrega, setErroEntrega] = useState("");

  // ── Pagamento ──
  const pixDisponivel = config.pagamentoPix !== false;
  const cartaoDisponivel = Boolean(config.pagamentoCartao);
  const [metodo, setMetodo] = useState<"pix" | "cartao">(pixDisponivel || !cartaoDisponivel ? "pix" : "cartao");
  const maxParcelas = maxParcelasDoCarrinho(items, MAX_PARCELAS_CARTAO);
  const [parcelas, setParcelas] = useState(1);
  const parcelasValidas = Math.min(parcelas, maxParcelas);

  // ── Revisão ──
  const [cupom, setCupom] = useState("");
  const [mostrarCupom, setMostrarCupom] = useState(false);
  const [codigoVenda, setCodigoVenda] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erroFinal, setErroFinal] = useState("");

  const cepLimpo = endereco.cep.replace(/\D/g, "");
  const cupomAplicado = cupom.trim()
    ? cupons.find((c) => c.codigo === cupom.trim().toUpperCase() && cupomEstaValido(c)) ?? null
    : null;
  const opcoesEstimativa = { cep: cepLimpo, cupomPercentual: cupomAplicado?.percentual };
  const est = estimarCompra(items, config, { metodo, ...opcoesEstimativa });
  const estPix = estimarCompra(items, config, { metodo: "pix", ...opcoesEstimativa });
  const estCartao = estimarCompra(items, config, { metodo: "cartao", ...opcoesEstimativa });
  const donoDoCodigo = codigoVenda.trim() ? nomeDoDonoDoCodigo(codigoVenda.trim().toUpperCase()) : null;
  const qtdTotal = items.reduce((a, i) => a + i.qty, 0);

  // ── Navegação entre as etapas (com o "voltar" do aparelho) ──
  // Cada etapa vira uma entrada no histórico do navegador: no celular, o
  // botão voltar desfaz uma etapa em vez de sair da loja.
  const etapaRef = useRef(etapa);
  etapaRef.current = etapa;
  useEffect(() => {
    window.history.pushState({ etapaCheckout: 1 }, "");
    const aoVoltarNoNavegador = (e: PopStateEvent) => {
      const anterior = (e.state?.etapaCheckout as Etapa | undefined) ?? null;
      if (!anterior) return aoVoltar();
      // Só volta: "avançar" pelo navegador pularia as validações da etapa
      if (anterior < etapaRef.current) {
        setEtapa(anterior);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener("popstate", aoVoltarNoNavegador);
    return () => window.removeEventListener("popstate", aoVoltarNoNavegador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irPara = (n: Etapa) => {
    if (n === etapa) return;
    // Para trás, anda no próprio histórico (o popstate acima troca a etapa),
    // assim o botão voltar do aparelho continua coerente
    if (n < etapa) return window.history.go(n - etapa);
    window.history.pushState({ etapaCheckout: n }, "");
    setEtapa(n);
    window.scrollTo({ top: 0 });
  };
  // "Voltar" da tela: usa o histórico, para o botão do aparelho e o da tela
  // andarem juntos
  const voltar = () => window.history.back();

  // Busca o endereço assim que o CEP fica completo
  useEffect(() => {
    if (!editandoEndereco || cepLimpo.length !== 8) return;
    const ctrl = new AbortController();
    setBuscandoCep(true);
    setErroCep("");
    fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) {
          setErroCep("Não encontramos esse CEP. Confira os números.");
          return;
        }
        setEndereco((e) => ({
          ...e,
          // CEP geral de cidade pequena não traz a rua: mantém a digitada
          rua: d.logradouro || e.rua,
          bairro: d.bairro || e.bairro,
          cidade: d.localidade || "",
          uf: d.uf || "",
        }));
        if (!entregaNaCidade(d.localidade, d.uf, config.cidadesAtendidas)) {
          setErroCep(`Ainda não entregamos em ${d.localidade} - ${d.uf}. Hoje atendemos ${textoCidadesAtendidas(config.cidadesAtendidas)}.`);
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setErroCep("Não foi possível consultar o CEP agora. Preencha o endereço à mão.");
      })
      .finally(() => setBuscandoCep(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepLimpo, editandoEndereco]);

  const mudar = (campo: keyof EnderecoEntrega, valor: string) => setEndereco((e) => ({ ...e, [campo]: valor }));

  const confirmarEntrega = () => {
    // Vale também para o endereço salvo (a loja pode ter deixado de atender
    // aquela cidade): o problema abre o formulário para corrigir
    const falha = (msg: string) => {
      setErroEntrega(msg);
      setEditandoEndereco(true);
    };
    if (cepLimpo.length !== 8) return falha("Digite o CEP com 8 números.");
    if (erroCep && erroCep.startsWith("Ainda não entregamos")) return falha(erroCep);
    if (endereco.cidade && !entregaNaCidade(endereco.cidade, endereco.uf, config.cidadesAtendidas)) {
      return falha(`Ainda não entregamos em ${endereco.cidade}.`);
    }
    if (!endereco.cidade.trim()) return falha("Informe a cidade.");
    if (!endereco.rua.trim()) return falha("Informe a rua.");
    if (!endereco.numero.trim()) return falha("Informe o número (use S/N se não houver).");
    setErroEntrega("");
    try {
      localStorage.setItem("cp_endereco", JSON.stringify(endereco));
    } catch {
      // sem armazenamento: só não lembra o endereço na próxima vez
    }
    setEditandoEndereco(false);
    irPara(2);
  };

  const confirmarCompra = async () => {
    if (!vendedorVinculado) {
      if (!codigoVenda.trim()) return setErroFinal("Informe o código de venda de quem te indicou a loja.");
      if (!donoDoCodigo) return setErroFinal("Código de venda não reconhecido. Confira com quem te indicou.");
    }
    if (cupom.trim() && !cupomAplicado) return setErroFinal("Este cupom não é válido. Apague o cupom para continuar.");
    setErroFinal("");
    setConfirmando(true);
    const erro = await aoConfirmar({
      metodo,
      parcelas: metodo === "cartao" ? parcelasValidas : 1,
      endereco: { ...endereco, cep: cepLimpo },
      cupom: cupomAplicado?.codigo,
      codigoVenda: vendedorVinculado ? undefined : codigoVenda.trim().toUpperCase(),
    });
    setConfirmando(false);
    if (erro) setErroFinal(erro);
  };

  const fotos = useMemo(() => items.map((i) => ({ src: i.image, alt: i.name })), [items]);
  const rotulo = "block text-[14px] text-gray-700 mb-1.5";
  const textoEndereco = `${endereco.rua}, ${endereco.numero}${endereco.complemento ? ` - ${endereco.complemento}` : ""}`;
  const textoPagamento =
    metodo === "pix"
      ? "Pix"
      : parcelasValidas > 1
      ? `Cartão de crédito em ${parcelasValidas}x de ${precoParcela(est.total, parcelasValidas)} sem juros`
      : "Cartão de crédito à vista";

  // O botão principal de cada etapa (fica embaixo da tela no celular)
  const acao: { texto: string; aoClicar: () => void; desativado?: boolean } =
    etapa === 1
      ? { texto: "Continuar", aoClicar: confirmarEntrega }
      : etapa === 2
      ? {
          texto: "Continuar",
          aoClicar: () => irPara(3),
          desativado: (metodo === "pix" && !pixDisponivel) || (metodo === "cartao" && !cartaoDisponivel),
        }
      : { texto: confirmando ? "Registrando sua compra…" : "Confirmar compra", aoClicar: confirmarCompra, desativado: confirmando };

  const linhasResumo: LinhaResumo[] = [
    { rotulo: qtdTotal === 1 ? "Produto" : `Produtos (${qtdTotal})`, valor: est.subtotal },
    // Só aparece quando há valor de entrega a cobrar
    ...(est.frete ? [{ rotulo: "Entrega", valor: est.frete }] : []),
    ...(est.descontoPix > 0 ? [{ rotulo: "Desconto no Pix", valor: est.descontoPix, tipo: "desconto" as const }] : []),
    ...(est.descontoCupom > 0 ? [{ rotulo: `Cupom ${cupomAplicado?.codigo}`, valor: est.descontoCupom, tipo: "desconto" as const }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#EDEDED] pb-28 lg:pb-0">
      <CabecalhoCheckout etapa={etapa} aoVoltar={voltar} rotuloVoltar={etapa === 1 ? "Voltar ao carrinho" : "Etapa anterior"} />

      <main className="max-w-[1100px] mx-auto px-4 pt-6 pb-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0">
          {/* ───────────── 1. Entrega ───────────── */}
          {etapa === 1 && (
            <>
              <h1 className="text-[22px] md:text-[24px] text-gray-900 mb-4">Onde você quer receber a compra?</h1>

              {!editandoEndereco ? (
                <div className="painel">
                  <label className="flex items-start gap-4 p-5 cursor-pointer">
                    <input type="radio" checked readOnly className="mt-1.5 w-4 h-4 accent-[#C8102E]" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] text-gray-900">{textoEndereco}</span>
                      <span className="block text-[14px] text-gray-500 mt-0.5">
                        {endereco.bairro ? `${endereco.bairro} · ` : ""}
                        {endereco.cidade} - {endereco.uf} · CEP {cepFormatado(endereco.cep)}
                      </span>
                      <span className="block text-[14px] text-gray-700 mt-2">Chega em {prazoDoCep(cepLimpo)}</span>
                    </span>
                    <MapPin size={20} strokeWidth={1.5} className="text-gray-400 flex-shrink-0 mt-1" />
                  </label>
                  <div className="border-t border-black/[0.08] px-5 py-3.5">
                    <button onClick={() => setEditandoEndereco(true)} className="text-[14px] text-[#C8102E] hover:underline">
                      Entregar em outro endereço
                    </button>
                  </div>
                </div>
              ) : (
                <div className="painel p-5 md:p-6">
                  <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                    <div>
                      <label className={rotulo} htmlFor="cep">CEP</label>
                      <div className="relative">
                        <input
                          id="cep"
                          value={endereco.cep}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                            mudar("cep", d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
                          }}
                          inputMode="numeric"
                          autoComplete="postal-code"
                          placeholder="00000-000"
                          className="campo"
                          autoFocus
                        />
                        {buscandoCep && <Loader2 size={16} className="animate-spin text-gray-400 absolute right-3 top-3.5" />}
                      </div>
                      <a
                        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[13px] text-[#C8102E] hover:underline mt-1.5 inline-block"
                      >
                        Não sei meu CEP
                      </a>
                    </div>
                    {endereco.cidade && (
                      <div className="sm:pt-7 text-[14px] text-gray-600">
                        {endereco.cidade} - {endereco.uf}
                      </div>
                    )}
                  </div>

                  {erroCep && (
                    <p className="mt-4 flex items-start gap-2 text-[14px] text-[#B45309]">
                      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {erroCep}
                    </p>
                  )}

                  {(cepLimpo.length === 8 || endereco.rua) && (
                    <div className="mt-5 grid gap-4 grid-cols-2 sm:grid-cols-[1fr_140px]">
                      <div className="col-span-2 sm:col-span-1">
                        <label className={rotulo} htmlFor="rua">Rua ou avenida</label>
                        <input id="rua" value={endereco.rua} onChange={(e) => mudar("rua", e.target.value)} autoComplete="address-line1" className="campo" />
                      </div>
                      <div>
                        <label className={rotulo} htmlFor="numero">Número</label>
                        <input id="numero" value={endereco.numero} onChange={(e) => mudar("numero", e.target.value)} className="campo" inputMode="numeric" />
                      </div>
                      <div className="col-span-2 sm:col-span-1 sm:order-last">
                        <label className={rotulo} htmlFor="bairro">Bairro</label>
                        <input id="bairro" value={endereco.bairro} onChange={(e) => mudar("bairro", e.target.value)} className="campo" />
                      </div>
                      {/* Sem resposta do serviço de CEP, a cidade é digitada à mão */}
                      {erroCep.startsWith("Não foi possível") && (
                        <>
                          <div className="col-span-2 sm:col-span-1">
                            <label className={rotulo} htmlFor="cidade">Cidade</label>
                            <input id="cidade" value={endereco.cidade} onChange={(e) => mudar("cidade", e.target.value)} className="campo" autoComplete="address-level2" />
                          </div>
                          <div>
                            <label className={rotulo} htmlFor="uf">Estado</label>
                            <input id="uf" value={endereco.uf} onChange={(e) => mudar("uf", e.target.value.toUpperCase().slice(0, 2))} className="campo" placeholder="PR" autoComplete="address-level1" />
                          </div>
                        </>
                      )}
                      <div className="sm:col-span-1">
                        <label className={rotulo} htmlFor="complemento">
                          Complemento <span className="text-gray-400">(opcional)</span>
                        </label>
                        <input id="complemento" value={endereco.complemento} onChange={(e) => mudar("complemento", e.target.value)} className="campo" placeholder="Apto, bloco…" />
                      </div>
                    </div>
                  )}

                  {cepLimpo.length === 8 && !erroCep && endereco.cidade && (
                    <p className="mt-5 text-[14px] text-gray-700">Chega em {prazoDoCep(cepLimpo)}.</p>
                  )}
                  {erroEntrega && <p role="alert" className="mt-4 text-[14px] text-[#C8102E]">{erroEntrega}</p>}
                </div>
              )}
            </>
          )}

          {/* ───────────── 2. Pagamento ───────────── */}
          {etapa === 2 && (
            <>
              <h1 className="text-[22px] md:text-[24px] text-gray-900 mb-4">Como você quer pagar?</h1>
              <div className="painel divide-y divide-black/[0.08]" role="radiogroup" aria-label="Forma de pagamento">
                <OpcaoPagamento
                  ativa={metodo === "pix"}
                  desativada={!pixDisponivel}
                  aoEscolher={() => setMetodo("pix")}
                  icone={<QrCode size={22} strokeWidth={1.5} />}
                  titulo="Pix"
                  descricao={config.pixAutomatico ? "Aprovação em segundos." : "A loja confirma o recebimento e libera o pedido."}
                  valor={estPix.total}
                  destaque={estPix.descontoPix > 0 ? `Você economiza ${formatarMoeda(estPix.descontoPix)}` : undefined}
                />
                <OpcaoPagamento
                  ativa={metodo === "cartao"}
                  desativada={!cartaoDisponivel}
                  aoEscolher={() => setMetodo("cartao")}
                  icone={<CreditCard size={22} strokeWidth={1.5} />}
                  titulo="Cartão de crédito"
                  descricao={
                    cartaoDisponivel
                      ? maxParcelas > 1 ? `Em até ${maxParcelas}x sem juros.` : "À vista."
                      : "Em breve. Por enquanto, pague com Pix."
                  }
                  valor={cartaoDisponivel ? estCartao.total : undefined}
                >
                  {metodo === "cartao" && cartaoDisponivel && maxParcelas > 1 && (
                    <div className="mt-4 max-w-[320px]">
                      <label className={rotulo} htmlFor="parcelas">Parcelas</label>
                      <select id="parcelas" value={parcelasValidas} onChange={(e) => setParcelas(Number(e.target.value))} className="campo">
                        {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x de {precoParcela(estCartao.total, n)} sem juros
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </OpcaoPagamento>
              </div>
            </>
          )}

          {/* ───────────── 3. Revisão ───────────── */}
          {etapa === 3 && (
            <>
              <h1 className="text-[22px] md:text-[24px] text-gray-900 mb-4">Revise e confirme</h1>

              <div className="painel divide-y divide-black/[0.08]">
                <BlocoRevisao titulo="Entrega" aoAlterar={() => irPara(1)}>
                  <p className="text-gray-900">{textoEndereco}</p>
                  <p className="text-gray-500">
                    {endereco.cidade} - {endereco.uf} · CEP {cepFormatado(endereco.cep)} · chega em {prazoDoCep(cepLimpo)}
                  </p>
                </BlocoRevisao>
                <BlocoRevisao titulo="Pagamento" aoAlterar={() => irPara(2)}>
                  <p className="text-gray-900">{textoPagamento}</p>
                  <p className="text-gray-500">{formatarMoeda(est.total)}</p>
                </BlocoRevisao>
                <BlocoRevisao titulo={qtdTotal === 1 ? "Produto" : `Produtos (${qtdTotal})`}>
                  <ul className="space-y-3 mt-1">
                    {items.map((i) => (
                      <li key={`${i.id}-${i.corEscolhida ?? ""}`} className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded border border-black/10 p-0.5 flex-shrink-0 bg-white">
                          <ImagemProduto src={i.image} alt={i.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 line-clamp-1">{i.name}</p>
                          <p className="text-[13px] text-gray-500">
                            {i.qty} {i.qty === 1 ? "unidade" : "unidades"}
                            {i.corEscolhida ? ` · ${i.corEscolhida}` : ""}
                          </p>
                        </div>
                        <span className="text-gray-800 tabular-nums">{formatarMoeda(i.price * i.qty)}</span>
                      </li>
                    ))}
                  </ul>
                </BlocoRevisao>

                {!vendedorVinculado && (
                  <div className="px-5 py-4">
                    <label className={rotulo} htmlFor="codigo-venda">Código de venda de quem te indicou</label>
                    <input
                      id="codigo-venda"
                      value={codigoVenda}
                      onChange={(e) => setCodigoVenda(e.target.value.toUpperCase())}
                      placeholder="Ex.: CV-9X2K4M"
                      className="campo font-mono max-w-[320px]"
                    />
                    <p className="text-[13px] mt-1.5">
                      {codigoVenda.trim() ? (
                        donoDoCodigo ? (
                          <span className="text-[#00A650]">Venda de {donoDoCodigo}.</span>
                        ) : (
                          <span className="text-[#B45309]">Código não reconhecido. Confira com quem te atendeu.</span>
                        )
                      ) : (
                        <span className="text-gray-500">Só na primeira compra. Depois sua conta fica ligada a essa pessoa.</span>
                      )}
                    </p>
                  </div>
                )}

                <div className="px-5 py-4">
                  {!mostrarCupom && !cupom ? (
                    <button onClick={() => setMostrarCupom(true)} className="text-[14px] text-[#C8102E] hover:underline">
                      Tenho um cupom de desconto
                    </button>
                  ) : (
                    <>
                      <label className={rotulo} htmlFor="cupom">Cupom de desconto</label>
                      <input
                        id="cupom"
                        value={cupom}
                        onChange={(e) => setCupom(e.target.value.toUpperCase())}
                        placeholder="Digite o código"
                        className="campo font-mono max-w-[320px]"
                        autoFocus
                      />
                      {cupom.trim() && (
                        <p className={`text-[13px] mt-1.5 ${cupomAplicado ? "text-[#00A650]" : "text-[#B45309]"}`}>
                          {cupomAplicado ? `${cupomAplicado.percentual}% de desconto aplicado.` : "Cupom inválido ou vencido."}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {erroFinal && (
                <p role="alert" className="mt-4 painel px-4 py-3 flex items-start gap-2 text-[14px] text-[#C8102E]">
                  <AlertCircle size={17} className="flex-shrink-0 mt-0.5" /> {erroFinal}
                </p>
              )}
              <p className="text-[13px] text-gray-500 mt-4">
                Ao confirmar, os produtos ficam reservados para você enquanto o pagamento é feito.
              </p>
            </>
          )}

          {/* Botões da etapa (no computador; no celular ficam presos embaixo) */}
          <div className="hidden lg:flex items-center justify-between mt-6">
            <button onClick={voltar} className="text-[14px] text-[#C8102E] hover:underline flex items-center gap-1">
              <ChevronLeft size={16} /> {etapa === 1 ? "Voltar ao carrinho" : "Voltar"}
            </button>
            <button
              onClick={acao.aoClicar}
              disabled={acao.desativado}
              className="btn-primario px-10 py-3 text-[15px] flex items-center gap-2"
            >
              {confirmando && etapa === 3 && <Loader2 size={17} className="animate-spin" />}
              {acao.texto}
            </button>
          </div>
        </div>

        <aside className="lg:sticky lg:top-4">
          <ResumoCompra
            fotos={fotos}
            linhas={linhasResumo}
            total={est.total}
            observacao={
              metodo === "cartao" && parcelasValidas > 1
                ? `${parcelasValidas}x de ${precoParcela(est.total, parcelasValidas)} sem juros`
                : undefined
            }
          />
        </aside>
      </main>

      {/* Celular: total + botão da etapa sempre à mão */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-black/10 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center gap-4">
        <div className="min-w-0">
          <div className="text-[12px] text-gray-500 leading-none">Total</div>
          <div className="text-[18px] font-semibold text-gray-900 tabular-nums mt-1">{formatarMoeda(est.total)}</div>
        </div>
        <button
          onClick={acao.aoClicar}
          disabled={acao.desativado}
          className="btn-primario flex-1 py-3 text-[15px] flex items-center justify-center gap-2"
        >
          {confirmando && etapa === 3 && <Loader2 size={17} className="animate-spin" />}
          {acao.texto}
        </button>
      </div>
    </div>
  );
}

// Uma forma de pagamento na lista da etapa 2. Fica fora da tela de propósito:
// componente declarado dentro de outro é recriado a cada tecla digitada.
function OpcaoPagamento({
  ativa,
  desativada,
  aoEscolher,
  icone,
  titulo,
  descricao,
  valor,
  destaque,
  children,
}: {
  ativa: boolean;
  desativada?: boolean;
  aoEscolher: () => void;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  valor?: number;
  destaque?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`px-5 py-4 ${desativada ? "opacity-55" : ""}`}>
      <button
        role="radio"
        aria-checked={ativa}
        disabled={desativada}
        onClick={aoEscolher}
        className="w-full text-left flex items-center gap-4 disabled:cursor-not-allowed"
      >
        <span
          className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center ${
            ativa ? "border-[#C8102E]" : "border-black/30"
          }`}
        >
          {ativa && <span className="w-2.5 h-2.5 rounded-full bg-[#C8102E]" />}
        </span>
        <span className="hidden sm:flex w-10 h-10 rounded-full border border-black/10 items-center justify-center text-gray-600 flex-shrink-0">
          {icone}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] text-gray-900">{titulo}</span>
          <span className="block text-[13.5px] text-gray-500">{descricao}</span>
          {/* No celular o valor vem embaixo, para o texto não ficar espremido */}
          {valor !== undefined && (
            <span className="sm:hidden block mt-1 text-[15px] text-gray-900 tabular-nums">
              {formatarMoeda(valor)}
              {destaque && <span className="block text-[12.5px] text-[#00A650]">{destaque}</span>}
            </span>
          )}
        </span>
        {valor !== undefined && (
          <span className="hidden sm:block text-right flex-shrink-0">
            <span className="block text-[16px] text-gray-900 tabular-nums">{formatarMoeda(valor)}</span>
            {destaque && <span className="block text-[12.5px] text-[#00A650]">{destaque}</span>}
          </span>
        )}
      </button>
      {children && <div className="pl-[34px] sm:pl-[90px]">{children}</div>}
    </div>
  );
}

// Um bloco da revisão (Entrega, Pagamento, Produtos), com "Alterar"
function BlocoRevisao({ titulo, aoAlterar, children }: { titulo: string; aoAlterar?: () => void; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 text-[14.5px]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-[13px] text-gray-500">{titulo}</h2>
        {aoAlterar && (
          <button onClick={aoAlterar} className="text-[14px] text-[#C8102E] hover:underline">
            Alterar
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
