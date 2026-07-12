// Tela PaginaCarrinho

import { useState } from "react";
import { ShoppingCart, X, Plus, Truck, Shield, CreditCard, ChevronLeft, ChevronRight, Zap, MapPin, Lock, FileText } from "lucide-react";
import type { ItemCarrinho, Usuario, ConfigLoja, Cupom, Pedido, DadosPagamento } from "../types";
import { formatarMoeda, precoParcela } from "../utils";
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
  config,
  cupom,
  aoMudarCupom,
  cupomAplicado,
}: {
  items: ItemCarrinho[];
  onRemove: (id: number) => void;
  aoMudarQtd: (id: number, variacao: number) => void;
  aoVoltar: () => void;
  aoFinalizarCompra: (dados: DadosPagamento) => void;
  usuario: Usuario | null;
  codigoVenda: string;
  aoMudarCodigoVenda: (v: string) => void;
  nomeDonoCodigo: string | null;
  config: ConfigLoja;
  cupom: string;
  aoMudarCupom: (v: string) => void;
  cupomAplicado: Cupom | null;
}) {
  const [formaPagamento, setFormaPagamento] = useState<"cartao" | "boleto" | "pix">("cartao");
  const [installments, setInstallments] = useState(12);
  const subtotal = items.reduce((acum, i) => acum + i.price * i.qty, 0);

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
          valor: subtotal >= config.freteGratisAcima ? 0 : capital ? config.freteCapital : config.freteInterior,
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
  const shipping = freteInfo ? freteInfo.valor : subtotal >= config.freteGratisAcima ? 0 : config.fretePadrao;
  // Desconto PIX definido produto a produto (soma item a item do carrinho)
  const pixDiscount =
    formaPagamento === "pix"
      ? items.reduce((acum, i) => acum + i.price * i.qty * ((i.pixDesconto ?? 0) / 100), 0)
      : 0;
  // Desconto do cupom (aplicado sobre o subtotal)
  const cupomDesconto = cupomAplicado ? subtotal * (cupomAplicado.percentual / 100) : 0;
  const total = Math.max(0, subtotal + shipping - pixDiscount - cupomDesconto);

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#C8102E] to-[#A50E27] py-3 px-4 shadow-md">
        <div className="max-w-[1440px] mx-auto flex items-center gap-4">
          <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            Continuar comprando
          </button>
          <div className="flex-1 flex justify-center">
            <Logo />
          </div>
          <div className="w-36" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="max-w-[1440px] mx-auto px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-gray-500 font-medium">
          <button onClick={aoVoltar} className="hover:text-[#C8102E] transition-colors">Início</button>
          <ChevronRight size={13} />
          <span className="text-gray-800 font-semibold">Carrinho de Compras</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="max-w-[1440px] mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <ShoppingCart size={32} strokeWidth={1.5} className="text-[#C8102E]" />
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">Seu carrinho está vazio</h2>
          <p className="text-gray-500 mb-6">Adicione produtos e volte aqui para finalizar sua compra.</p>
          <button onClick={aoVoltar} className="bg-[#C8102E] text-white font-bold px-8 py-3 rounded-xl hover:bg-[#8C1626] transition-colors">
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
                <div key={item.id} className="bg-white rounded-2xl p-4 flex gap-4 border border-gray-100 shadow-sm">
                  <div className="w-24 h-24 bg-gray-50 rounded-xl flex items-center justify-center p-2 flex-shrink-0">
                    <ImagemProduto src={item.image} alt={item.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{item.brand}</p>
                        <p className="text-sm text-gray-800 font-semibold leading-snug mt-0.5 line-clamp-2">{item.name}</p>
                      </div>
                      <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 p-1 transition-colors flex-shrink-0">
                        <X size={16} />
                      </button>
                    </div>
                    {item.freeShipping && (
                      <div className="flex items-center gap-1 text-green-600 text-[11px] font-bold mt-1.5">
                        <Truck size={11} /> FRETE GRÁTIS
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                      <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                        <button onClick={() => aoMudarQtd(item.id, -1)} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm font-black shadow-sm hover:shadow transition-shadow">-</button>
                        <span className="w-7 text-center text-sm font-black">{item.qty}</span>
                        <button onClick={() => aoMudarQtd(item.id, 1)} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-sm font-black shadow-sm hover:shadow transition-shadow">+</button>
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
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={16} className="text-[#C8102E]" />
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
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                    placeholder="Digite seu CEP"
                    inputMode="numeric"
                    maxLength={9}
                  />
                  <button
                    onClick={calcularFrete}
                    disabled={calculandoFrete}
                    className="bg-[#C8102E] text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#8C1626] disabled:opacity-70 transition-colors flex items-center gap-2"
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
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                    />
                    <div className="flex gap-2">
                      <input
                        value={numeroEndereco}
                        onChange={(e) => setNumeroEndereco(e.target.value)}
                        placeholder="Número"
                        className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                      />
                      <input
                        value={complementoEndereco}
                        onChange={(e) => setComplementoEndereco(e.target.value)}
                        placeholder="Complemento (opcional)"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
                      />
                    </div>
                    {freteInfo.bairro && (
                      <p className="text-[11px] text-gray-400">Bairro: {freteInfo.bairro}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Código de venda: credita esta compra a um vendedor ou ao Master */}
              <CampoCodigoVenda codigo={codigoVenda} aoMudar={aoMudarCodigoVenda} nomeDono={nomeDonoCodigo} />
            </div>

            {/* Pedido Summary */}
            <div className="lg:w-[360px] flex-shrink-0">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-20">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="font-black text-gray-900 text-base">Resumo do Pedido</h3>
                </div>

                {/* Payment method */}
                <div className="p-5 border-b border-gray-100">
                  <p className="text-[12px] font-bold text-gray-500 mb-3 uppercase tracking-wide">Forma de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["cartao", "boleto", "pix"] as const).map((m) => {
                      const labels = { cartao: "Cartão", boleto: "Boleto", pix: "PIX" };
                      const icons = { cartao: <CreditCard size={16} />, boleto: <FileText size={16} />, pix: <Zap size={16} /> };
                      return (
                        <button
                          key={m}
                          onClick={() => setFormaPagamento(m)}
                          className={`py-2.5 rounded-xl text-[12px] font-bold border-2 transition-all flex flex-col items-center gap-0.5 ${
                            formaPagamento === m
                              ? "border-[#C8102E] bg-red-50 text-[#C8102E]"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {icons[m]}
                          {labels[m]}
                        </button>
                      );
                    })}
                  </div>

                  {formaPagamento === "cartao" && (
                    <div className="mt-3">
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1.5">Parcelamento</label>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#C8102E] transition-colors"
                      >
                        {[1, 2, 3, 6, 10, 12].map((n) => (
                          <option key={n} value={n}>
                            {n}x de {precoParcela(subtotal, n)} {n <= 12 ? "sem juros" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formaPagamento === "pix" && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                      <span className="text-emerald-700 text-[12px] font-medium">
                        {pixDiscount > 0
                          ? "Desconto PIX dos produtos aplicado no total"
                          : "Aprovação imediata pagando com PIX"}
                      </span>
                    </div>
                  )}

                  {formaPagamento === "boleto" && (
                    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <span className="text-gray-600 text-[12px] font-medium">Vencimento em 3 dias úteis após a emissão</span>
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
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
                  />
                  {cupom.trim().length > 0 && cupomAplicado && (
                    <div className="mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold px-3 py-2 rounded-lg">
                      Cupom {cupomAplicado.codigo} aplicado: {cupomAplicado.percentual}% de desconto
                    </div>
                  )}
                  {cupom.trim().length > 0 && !cupomAplicado && (
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
                      {formaPagamento === "cartao" && (
                        <div className="text-[11px] text-gray-500">
                          ou {installments}x de {precoParcela(total, installments)}
                        </div>
                      )}
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
                      setErroCompra("");
                      const complemento = complementoEndereco.trim() ? ` - ${complementoEndereco.trim()}` : "";
                      const bairro = freteInfo.bairro ? `, ${freteInfo.bairro}` : "";
                      aoFinalizarCompra({
                        metodo: formaPagamento,
                        total,
                        parcelas: formaPagamento === "cartao" ? installments : 1,
                        endereco: `${ruaEndereco.trim()}, ${numeroEndereco.trim()}${complemento}${bairro} — ${freteInfo.cidade} · CEP ${cep}`,
                      });
                    }}
                    className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
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
