// Tela PaginaCarrinho

import { useState } from "react";
import { ShoppingCart, X, Truck, Shield, ChevronLeft, ChevronRight, Zap, MapPin, Lock, CreditCard } from "lucide-react";
import type { ItemCarrinho, Usuario, ConfigLoja, Cupom, DadosPagamento } from "../types";
import { MAX_PARCELAS_CARTAO } from "../constantes";
import { formatarMoeda, precoParcela, maxParcelasDoCarrinho } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";
import { Logo } from "../components/Logo";
import { CampoCodigoVenda } from "../components/CampoCodigoVenda";

// ─── Cart Page ────────────────────────────────────────────────────────────────

export function PaginaCarrinho({
  items,
  onRemove,
  aoMudarQtd,
  aoVoltar,
  aoFinalizarCompra,
  usuario,
  codigoVenda,
  aoMudarCodigoVenda,
  nomeDonoCodigo,
  vendedorVinculado,
  config,
  cupom,
  aoMudarCupom,
  cupomAplicado,
  cupomJaUsado,
}: {
  items: ItemCarrinho[];
  onRemove: (id: number, corEscolhida?: string) => void;
  aoMudarQtd: (id: number, variacao: number, corEscolhida?: string) => void;
  aoVoltar: () => void;
  aoFinalizarCompra: (dados: DadosPagamento) => void;
  usuario: Usuario | null;
  codigoVenda: string;
  aoMudarCodigoVenda: (v: string) => void;
  nomeDonoCodigo: string | null;
  vendedorVinculado?: string | null;
  config: ConfigLoja;
  cupom: string;
  aoMudarCupom: (v: string) => void;
  cupomAplicado: Cupom | null;
  // true quando o código digitado é de um cupom válido, mas este cliente já usou
  cupomJaUsado?: boolean;
}) {
  const subtotal = items.reduce((acum, i) => acum + i.price * i.qty, 0);
  // Se TODOS os itens do carrinho têm o selo "Frete Grátis", o frete some de
  // verdade — não só na etiqueta do produto. Com itens misturados (alguns
  // com frete grátis, outros não), continua valendo a regra normal (CEP ou
  // valor mínimo do carrinho).
  const todosFreteGratis = items.length > 0 && items.every((i) => i.freeShipping);

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
  // Forma de pagamento escolhida pelo cliente (o desconto do PIX só vale no PIX)
  const [metodoPagamento, setMetodoPagamento] = useState<"pix" | "cartao">("pix");
  const [parcelas, setParcelas] = useState(1);
  // Teto de parcelas do carrinho: o menor "Parcelamento" entre os produtos
  const maxParcelas = maxParcelasDoCarrinho(items, MAX_PARCELAS_CARTAO);
  // Se o carrinho mudar e o teto cair, a escolha volta para o máximo permitido
  const parcelasEscolhidas = Math.min(parcelas, maxParcelas);

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
          valor: todosFreteGratis || subtotal >= config.freteGratisAcima ? 0 : capital ? config.freteCapital : config.freteInterior,
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
  const shipping = todosFreteGratis ? 0 : freteInfo ? freteInfo.valor : subtotal >= config.freteGratisAcima ? 0 : config.fretePadrao;
  // Desconto PIX definido produto a produto (soma item a item do carrinho).
  // Só entra na conta quando o cliente escolhe pagar com PIX.
  const pixDiscount =
    metodoPagamento === "pix"
      ? items.reduce((acum, i) => acum + i.price * i.qty * ((i.pixDesconto ?? 0) / 100), 0)
      : 0;
  // Desconto do cupom (aplicado sobre o subtotal)
  const cupomDesconto = cupomAplicado ? subtotal * (cupomAplicado.percentual / 100) : 0;
  const total = Math.max(0, subtotal + shipping - pixDiscount - cupomDesconto);

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#A8102A] py-3 px-4">
        <div className="max-w-[1440px] mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            onClick={aoVoltar}
            className="justify-self-start text-white/85 hover:text-white flex items-center gap-1.5 text-[13px] font-semibold transition-colors py-2 pr-2 -my-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Continuar comprando</span>
          </button>
          <div className="justify-self-center">
            <Logo claro />
          </div>
          <div />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="max-w-[1440px] mx-auto px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium">
          <button onClick={aoVoltar} className="hover:text-[#A8102A] transition-colors">Início</button>
          <ChevronRight size={13} />
          <span className="text-gray-800 font-semibold">Carrinho de Compras</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="max-w-[1440px] mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <ShoppingCart size={32} strokeWidth={1.5} className="text-[#A8102A]" />
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">Seu carrinho está vazio</h2>
          <p className="text-gray-500 mb-6">Adicione produtos e volte aqui para finalizar sua compra.</p>
          <button onClick={aoVoltar} className="bg-[#A8102A] text-white font-bold px-8 py-3 rounded-xl hover:bg-[#7A1220] transition-colors">
            Explorar Produtos
          </button>
        </div>
      ) : (
        <div className="max-w-[1440px] mx-auto px-4 pb-12">
          <div className="flex gap-6 flex-col lg:flex-row">
            {/* Items */}
            <div className="flex-1 space-y-3">
              <h2 className="text-lg font-black text-gray-900 mb-4">
                Meu Carrinho <span className="text-gray-400 font-semibold text-base">({items.length} {items.length === 1 ? "item" : "itens"})</span>
              </h2>

              {items.map((item) => (
                <div key={`${item.id}-${item.corEscolhida ?? ""}`} className="bg-white rounded-2xl p-4 md:p-5 flex gap-4 border border-gray-100">
                  <div className="w-24 h-24 md:w-28 md:h-28 bg-gray-50 rounded-xl flex items-center justify-center p-2 flex-shrink-0">
                    <ImagemProduto src={item.image} alt={item.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{item.brand}</p>
                        <p className="text-[13px] md:text-sm text-gray-800 font-semibold leading-snug mt-0.5 line-clamp-2">{item.name}</p>
                        {item.corEscolhida && (
                          <p className="text-[11px] text-gray-500 font-semibold mt-0.5">Cor: {item.corEscolhida}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onRemove(item.id, item.corEscolhida)}
                        aria-label={`Remover ${item.name} do carrinho`}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 -m-1 rounded-lg transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#A8102A]"
                      >
                        <X size={17} />
                      </button>
                    </div>
                    {item.freeShipping && (
                      <div className="flex items-center gap-1 text-green-700 text-[11px] font-bold mt-1.5">
                        <Truck size={11} /> FRETE GRÁTIS
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                          <button
                            onClick={() => aoMudarQtd(item.id, -1, item.corEscolhida)}
                            aria-label="Diminuir quantidade"
                            className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-base font-black hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#A8102A]"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-[14px] font-black" aria-live="polite">{item.qty}</span>
                          <button
                            onClick={() => aoMudarQtd(item.id, 1, item.corEscolhida)}
                            disabled={item.qty >= item.stock}
                            aria-label="Aumentar quantidade"
                            className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-base font-black hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#A8102A]"
                          >
                            +
                          </button>
                        </div>
                        {item.qty >= item.stock && (
                          <p className="text-[10px] text-amber-600 font-semibold mt-1">Estoque máximo atingido</p>
                        )}
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
              <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-100">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={16} className="text-[#A8102A]" />
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
                    className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors"
                    placeholder="Digite seu CEP"
                    inputMode="numeric"
                    maxLength={9}
                  />
                  <button
                    onClick={calcularFrete}
                    disabled={calculandoFrete}
                    className="bg-[#A8102A] text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#7A1220] disabled:opacity-70 transition-colors flex items-center gap-2"
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
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors"
                    />
                    <div className="flex gap-2">
                      <input
                        value={numeroEndereco}
                        onChange={(e) => setNumeroEndereco(e.target.value)}
                        placeholder="Número"
                        className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors"
                      />
                      <input
                        value={complementoEndereco}
                        onChange={(e) => setComplementoEndereco(e.target.value)}
                        placeholder="Complemento (opcional)"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors"
                      />
                    </div>
                    {freteInfo.bairro && (
                      <p className="text-[11px] text-gray-400">Bairro: {freteInfo.bairro}</p>
                    )}
                  </div>
                )}
              </div>

              {!vendedorVinculado && (
                <CampoCodigoVenda codigo={codigoVenda} aoMudar={aoMudarCodigoVenda} nomeDono={nomeDonoCodigo} />
              )}
            </div>

            {/* Pedido Summary */}
            <div className="lg:w-[360px] flex-shrink-0">
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden sticky top-4">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 text-base">Resumo do Pedido</h3>
                </div>

                {/* Payment method */}
                <div className="p-5 border-b border-gray-100">
                  <p className="text-[12px] font-bold text-gray-500 mb-3 uppercase tracking-wide">Forma de Pagamento</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento("pix")}
                      aria-pressed={metodoPagamento === "pix"}
                      className={`py-3 rounded-xl text-[13px] font-bold border-2 flex items-center justify-center gap-1.5 transition-colors ${
                        metodoPagamento === "pix"
                          ? "border-[#A8102A] bg-red-50 text-[#A8102A]"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <Zap size={16} />
                      PIX
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento("cartao")}
                      aria-pressed={metodoPagamento === "cartao"}
                      className={`py-3 rounded-xl text-[13px] font-bold border-2 flex items-center justify-center gap-1.5 transition-colors ${
                        metodoPagamento === "cartao"
                          ? "border-[#A8102A] bg-red-50 text-[#A8102A]"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <CreditCard size={16} />
                      Cartão
                    </button>
                  </div>

                  {metodoPagamento === "pix" ? (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-emerald-700 text-[12px] font-medium">
                        {pixDiscount > 0
                          ? "Desconto PIX dos produtos aplicado no total"
                          : "Aprovação imediata pagando com PIX"}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                        {maxParcelas === 1 ? "Pagamento à vista" : "Parcelas"}
                      </label>
                      <select
                        disabled={maxParcelas === 1}
                        value={parcelasEscolhidas}
                        onChange={(e) => setParcelas(Number(e.target.value))}
                        className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#A8102A] transition-colors"
                      >
                        {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x de {precoParcela(total, n)} sem juros
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        {maxParcelas === 1
                          ? "Os produtos deste carrinho não têm parcelamento."
                          : `Até ${maxParcelas}x conforme o parcelamento cadastrado nos produtos.`}
                      </p>
                      {pixDiscount > 0 && (
                        <p className="text-[11px] text-amber-600 font-medium mt-2">
                          O desconto do PIX não vale no cartão.
                        </p>
                      )}
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
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#A8102A] transition-colors font-mono"
                  />
                  {cupom.trim().length > 0 && cupomAplicado && (
                    <div className="mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold px-3 py-2 rounded-lg">
                      Cupom {cupomAplicado.codigo} aplicado: {cupomAplicado.percentual}% de desconto
                    </div>
                  )}
                  {cupom.trim().length > 0 && !cupomAplicado && cupomJaUsado && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium px-3 py-2 rounded-lg">
                      Você já usou este cupom antes — cada cupom vale só uma vez por cliente.
                    </div>
                  )}
                  {cupom.trim().length > 0 && !cupomAplicado && !cupomJaUsado && (
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
                      // Código de venda é obrigatório: toda compra precisa ser
                      // creditada a um vendedor ou ao Master
                      if (!vendedorVinculado) {
                        if (!codigoVenda.trim()) {
                          setErroCompra("Informe o código de venda de quem indicou a compra para continuar.");
                          return;
                        }
                        if (!nomeDonoCodigo) {
                          setErroCompra("Código de venda inválido — confira o código e tente de novo.");
                          return;
                        }
                      }
                      setErroCompra("");
                      const complemento = complementoEndereco.trim() ? ` - ${complementoEndereco.trim()}` : "";
                      const bairro = freteInfo.bairro ? `, ${freteInfo.bairro}` : "";
                      aoFinalizarCompra({
                        metodo: metodoPagamento,
                        total,
                        parcelas: metodoPagamento === "cartao" ? parcelasEscolhidas : 1,
                        endereco: `${ruaEndereco.trim()}, ${numeroEndereco.trim()}${complemento}${bairro} — ${freteInfo.cidade} · CEP ${cep}`,
                      });
                    }}
                    className="w-full bg-[#A8102A] hover:bg-[#7A1220] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
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
