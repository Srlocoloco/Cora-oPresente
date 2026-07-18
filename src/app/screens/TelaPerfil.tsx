// Tela TelaPerfil

import { useState } from "react";
import { X, Package, LogOut, Plus, Truck, Settings, ChevronLeft, Check, MapPin, CreditCard, Trash2 } from "lucide-react";
import type { Usuario, Cupom, Cargo, Pedido, Cliente, Tela, CartaoSalvo, DadosCartaoDigitado } from "../types";
import { formatarMoeda, formatarNumeroCartao, formatarValidadeCartao, bandeiraCartao, formatarCpf } from "../utils";
import { SeloStatus } from "../components/SeloStatus";
import { URL_BACKEND_PIX, MP_PUBLIC_KEY } from "../constantes";

// ─── Tela Perfil do Cliente ───────────────────────────────────────────────────

// Perfil do cliente: pedidos por status (Preparando, A caminho, Entregues,
// Cancelados), cupons disponíveis, atalhos para as categorias da loja e
// ativação do código de vendedor (quando a conta ainda não tem cargo)
export function TelaPerfil({
  usuario,
  pedidos,
  cupons,
  categorias,
  aoVerCategoria,
  aoVoltar,
  aoSair,
  rotuloPainel,
  aoAbrirPainel,
  cargoUsuario,
  aoAtivarCodigo,
  cartoesSalvos = [],
  aoExcluirCartao,
  aoAdicionarCartao,
}: {
  usuario: Usuario;
  pedidos: Pedido[];
  cupons: Cupom[];
  categorias: string[];
  aoVerCategoria: (c: string) => void;
  aoVoltar: () => void;
  aoSair: () => void;
  rotuloPainel: string | null;
  aoAbrirPainel: () => void;
  cargoUsuario?: Cargo;
  aoAtivarCodigo: (codigo: string) => string | null;
  cartoesSalvos?: CartaoSalvo[];
  aoExcluirCartao?: (id: number) => void;
  aoAdicionarCartao?: (dados: DadosCartaoDigitado) => void;
}) {
  // null = mostra todos os pedidos; senão filtra pelo status escolhido
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [cupomCopiado, setCupomCopiado] = useState("");
  const [codigoAtivar, setCodigoAtivar] = useState("");
  const [erroAtivar, setErroAtivar] = useState("");
  const [ativando, setAtivando] = useState(false);

  // ── Formulário para adicionar um cartão sem precisar comprar antes ────────
  const [mostrarFormCartao, setMostrarFormCartao] = useState(false);
  const [numeroCartao, setNumeroCartao] = useState("");
  const [nomeCartao, setNomeCartao] = useState("");
  const [validadeCartao, setValidadeCartao] = useState("");
  const [cvvCartao, setCvvCartao] = useState("");
  const [cpfCartao, setCpfCartao] = useState("");
  const [erroCartao, setErroCartao] = useState("");
  const [salvandoCartao, setSalvandoCartao] = useState(false);
  const bandeiraDigitada = numeroCartao ? bandeiraCartao(numeroCartao) : "";

  // Salva de verdade no cofre do Mercado Pago (precisa de CVV e CPF pra
  // tokenizar o cartão — sem eles não tem como gerar um token de verdade).
  const adicionarCartao = async () => {
    const numeroLimpo = numeroCartao.replace(/\D/g, "");
    const cpfLimpo = cpfCartao.replace(/\D/g, "");
    if (numeroLimpo.length < 13) { setErroCartao("Número de cartão inválido."); return; }
    if (!nomeCartao.trim()) { setErroCartao("Informe o nome impresso no cartão."); return; }
    if (!/^\d{2}\/\d{2}$/.test(validadeCartao)) { setErroCartao("Informe a validade no formato MM/AA."); return; }
    if (cvvCartao.replace(/\D/g, "").length < 3) { setErroCartao("Informe o CVV (3 ou 4 dígitos)."); return; }
    if (cpfLimpo.length !== 11) { setErroCartao("Informe um CPF válido (o Mercado Pago exige esse dado)."); return; }

    if (!window.MercadoPago) { setErroCartao("Não foi possível carregar o Mercado Pago. Verifique sua internet e tente de novo."); return; }

    setErroCartao("");
    setSalvandoCartao(true);
    try {
      const mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
      const [mes, anoCurto] = validadeCartao.split("/");
      const token = await mp.createCardToken({
        cardNumber: numeroLimpo,
        cardholderName: nomeCartao.trim(),
        cardExpirationMonth: mes,
        cardExpirationYear: `20${anoCurto}`,
        securityCode: cvvCartao,
        identificationType: "CPF",
        identificationNumber: cpfLimpo,
      });
      if (!token?.id) throw new Error("Não foi possível validar os dados do cartão.");

      const resposta = await fetch(`${URL_BACKEND_PIX}/api/cartao/salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: usuario.email, token: token.id }),
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok || !resultado?.mpCardId) {
        setErroCartao(resultado?.erro || "Não foi possível salvar o cartão no Mercado Pago agora.");
        setSalvandoCartao(false);
        return;
      }

      aoAdicionarCartao?.({
        numero: numeroLimpo,
        nome: nomeCartao.trim(),
        validade: validadeCartao,
        cvv: "",
        mpCardId: resultado.mpCardId,
        mpCustomerId: resultado.mpCustomerId,
        bandeira: resultado.bandeira,
      });
      setNumeroCartao("");
      setNomeCartao("");
      setValidadeCartao("");
      setCvvCartao("");
      setCpfCartao("");
      setMostrarFormCartao(false);
    } catch (e: any) {
      setErroCartao(e?.message || "Não foi possível salvar o cartão com o Mercado Pago.");
    } finally {
      setSalvandoCartao(false);
    }
  };

  const ativarCodigo = () => {
    setAtivando(true);
    const resultado = aoAtivarCodigo(codigoAtivar);
    setAtivando(false);
    if (resultado) { setErroAtivar(resultado); return; }
    setErroAtivar("");
    setCodigoAtivar("");
  };

  const atalhos = [
    { status: "Processando", rotulo: "Preparando", icon: <Package size={20} /> },
    { status: "Em trânsito", rotulo: "A caminho", icon: <Truck size={20} /> },
    { status: "Entregue", rotulo: "Entregues", icon: <Check size={20} /> },
    { status: "Cancelado", rotulo: "Cancelados", icon: <X size={20} /> },
  ];

  const contagem = (status: string) => pedidos.filter((o) => o.status === status).length;
  const visiveis = filtroStatus ? pedidos.filter((o) => o.status === filtroStatus) : pedidos;

  const copiarCupom = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCupomCopiado(codigo);
    setTimeout(() => setCupomCopiado(""), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Cabeçalho do perfil */}
      <div className="bg-[#C8102E] px-4 pt-4 pb-10">
        <div className="max-w-[720px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1 text-[13px] font-semibold transition-colors">
              <ChevronLeft size={16} />
              Loja
            </button>
            <button onClick={aoSair} className="text-white/80 hover:text-white flex items-center gap-1.5 text-[13px] font-semibold transition-colors">
              <LogOut size={14} />
              Sair
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
              {usuario.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-white font-black text-lg truncate">{usuario.name}</div>
              <div className="text-white/70 text-[12px] truncate">{usuario.email}</div>
            </div>
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="ml-auto bg-white/15 hover:bg-white/25 text-white text-[12px] font-bold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Settings size={13} />
                {rotuloPainel}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 -mt-5 space-y-4">
        {/* Ativar código de vendedor: só aparece pra quem ainda não tem cargo */}
        {!cargoUsuario && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-black text-gray-900 text-[15px] mb-1">Tem um código de vendedor?</h3>
            <p className="text-[12px] text-gray-400 mb-3">
              Recebeu um código de ativação? Ative aqui e comece a divulgar os produtos da loja ganhando comissão em cada venda.
            </p>
            <div className="flex gap-2 flex-col sm:flex-row">
              <input
                value={codigoAtivar}
                onChange={(e) => { setCodigoAtivar(e.target.value.toUpperCase()); setErroAtivar(""); }}
                placeholder="Ex.: CP-7K2M9X"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
              />
              <button
                onClick={ativarCodigo}
                disabled={ativando || !codigoAtivar.trim()}
                className="bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-50 text-white font-black px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Ativar
              </button>
            </div>
            {erroAtivar && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                {erroAtivar}
              </div>
            )}
          </div>
        )}

        {/* Meus pedidos: atalhos por status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-gray-900 text-[15px]">Meus Pedidos</h3>
            <button
              onClick={() => setFiltroStatus(null)}
              className="text-[12px] font-bold text-[#C8102E] hover:underline"
            >
              Ver todos
            </button>
          </div>
          <div className="grid grid-cols-4">
            {atalhos.map((a) => (
              <button
                key={a.status}
                onClick={() => setFiltroStatus(a.status)}
                className={`flex flex-col items-center gap-1.5 py-2 rounded-xl transition-colors ${
                  filtroStatus === a.status ? "bg-red-50 text-[#C8102E]" : "text-gray-500 hover:text-[#C8102E]"
                }`}
              >
                <div className="relative">
                  {a.icon}
                  {contagem(a.status) > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                      {contagem(a.status)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold">{a.rotulo}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lista de pedidos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h3 className="font-black text-gray-900 text-[14px]">
              {filtroStatus
                ? atalhos.find((a) => a.status === filtroStatus)?.rotulo
                : "Todos os pedidos"}
            </h3>
          </div>
          {visiveis.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-[13px]">
              {filtroStatus ? "Nenhum pedido nesta etapa." : "Você ainda não fez nenhum pedido."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visiveis.map((o) => (
                <div key={o.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[11px] text-[#C8102E] font-bold">{o.id}</span>
                    <SeloStatus status={o.status} />
                  </div>
                  <div className="text-[13px] text-gray-700 font-medium truncate">{o.items}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-gray-400">{o.date}{o.pagamento ? ` · ${o.pagamento}` : ""}</span>
                    <span className="font-black text-gray-900 text-[13px]">{formatarMoeda(o.total)}</span>
                  </div>
                  {o.endereco && (
                    <div className="text-[11px] text-gray-400 mt-1 flex items-start gap-1">
                      <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{o.endereco}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cartões salvos: guardados só com dados seguros (sem número completo nem CVV) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-black text-gray-900 text-[14px]">Meus Cartões</h3>
            {aoAdicionarCartao && (
              <button
                onClick={() => { setMostrarFormCartao((v) => !v); setErroCartao(""); }}
                className="text-[12px] font-bold text-[#C8102E] hover:underline flex items-center gap-1"
              >
                <Plus size={13} />
                {mostrarFormCartao ? "Cancelar" : "Adicionar cartão"}
              </button>
            )}
          </div>

          {mostrarFormCartao && (
            <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/60 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 block mb-1">Número do cartão</label>
                <input
                  value={numeroCartao}
                  onChange={(e) => setNumeroCartao(formatarNumeroCartao(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  inputMode="numeric"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all font-mono bg-white"
                />
                {bandeiraDigitada && bandeiraDigitada !== "Cartão" && (
                  <p className="text-[11px] text-gray-400 mt-1">{bandeiraDigitada}</p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 block mb-1">Nome impresso no cartão</label>
                <input
                  value={nomeCartao}
                  onChange={(e) => setNomeCartao(e.target.value)}
                  placeholder="Como está no cartão"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">Validade (MM/AA)</label>
                  <input
                    value={validadeCartao}
                    onChange={(e) => setValidadeCartao(formatarValidadeCartao(e.target.value))}
                    placeholder="MM/AA"
                    inputMode="numeric"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 block mb-1">CVV</label>
                  <input
                    value={cvvCartao}
                    onChange={(e) => setCvvCartao(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="•••"
                    inputMode="numeric"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 block mb-1">CPF do titular</label>
                <input
                  value={cpfCartao}
                  onChange={(e) => setCpfCartao(formatarCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all bg-white"
                />
              </div>
              <p className="text-[10.5px] text-gray-400 leading-relaxed">
                O CVV e o CPF são exigidos pelo Mercado Pago só pra confirmar que o cartão é seu — vão
                direto pro Mercado Pago e nunca são salvos aqui. Depois de salvo, guardamos só a
                bandeira, o nome, os 4 últimos dígitos e a validade.
              </p>
              {erroCartao && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                  {erroCartao}
                </div>
              )}
              <button
                onClick={adicionarCartao}
                disabled={salvandoCartao}
                className="w-full bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-60 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                {salvandoCartao ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Salvar cartão
                  </>
                )}
              </button>
            </div>
          )}

          {cartoesSalvos.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-[13px]">
              Nenhum cartão salvo ainda. Adicione um acima, ou ele é salvo automaticamente na sua
              próxima compra com Cartão.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cartoesSalvos.map((c) => (
                <div key={c.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CreditCard size={18} className="text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-gray-800">{c.bandeira} •••• {c.ultimosDigitos}</div>
                      <div className="text-[11px] text-gray-400 truncate">{c.nomeCartao} · válido até {c.validade}</div>
                    </div>
                  </div>
                  {aoExcluirCartao && (
                    <button
                      onClick={() => aoExcluirCartao(c.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remover cartão"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cupons disponíveis */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h3 className="font-black text-gray-900 text-[14px]">Cupons para você</h3>
          </div>
          {cupons.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-[13px]">
              Nenhum cupom disponível no momento.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cupons.map((c) => (
                <div key={c.codigo} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-black text-[#C8102E]">{c.percentual}% OFF</div>
                    <div className="text-[11px] text-gray-400">
                      Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · use no carrinho
                    </div>
                  </div>
                  <button
                    onClick={() => copiarCupom(c.codigo)}
                    className="font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                  >
                    {cupomCopiado === c.codigo ? "Copiado!" : c.codigo}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categorias */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-black text-gray-900 text-[14px] mb-3">Categorias</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => aoVerCategoria(c)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] font-bold text-gray-700 hover:border-[#C8102E] hover:text-[#C8102E] transition-colors text-left"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
