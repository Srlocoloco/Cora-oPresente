// Tela TelaPagamento

import { useState } from "react";
import { CreditCard, ChevronLeft, Check, Zap, Lock, Trash2 } from "lucide-react";
import type { Tela, DadosPagamento, CartaoSalvo, DadosCartaoDigitado } from "../types";
import { formatarMoeda, precoParcela, bandeiraCartao, formatarNumeroCartao, formatarValidadeCartao, formatarCpf } from "../utils";
import { Logo } from "../components/Logo";
import { URL_BACKEND_PIX, MP_PUBLIC_KEY } from "../constantes";

// O SDK do Mercado Pago (carregado via <script> no index.html) expõe esse
// construtor global — não tem tipagem oficial, então declaramos como "any".
declare global {
  interface Window {
    MercadoPago: any;
  }
}

// ─── Tela de Pagamento ─────────────────────────────────────────────────────────

// Mostra o resumo do pagamento escolhido e pede a confirmação final. No
// Cartão, tokeniza os dados no navegador com o SDK do Mercado Pago (o número
// e o CVV nunca chegam no nosso backend) e cobra de verdade via
// POST /api/pagamento/cartao — só confirma o pedido quando o Mercado Pago
// aprova (ou entra em análise) o pagamento.
export function TelaPagamento({
  dados,
  email,
  aoConfirmar,
  aoVoltar,
  cartoesSalvos = [],
  aoExcluirCartao,
}: {
  dados: DadosPagamento;
  email: string;
  aoConfirmar: (dadosCartao?: DadosCartaoDigitado, statusCartao?: "approved" | "in_process" | "pending") => void;
  aoVoltar: () => void;
  cartoesSalvos?: CartaoSalvo[];
  aoExcluirCartao?: (id: number) => void;
}) {
  const rotulos = { cartao: "Cartão de Crédito", pix: "PIX" } as const;
  const icones = { cartao: <CreditCard size={36} />, pix: <Zap size={36} /> };
  const descricoes = {
    cartao: `${dados.parcelas}x de ${precoParcela(dados.total, dados.parcelas)} sem juros`,
    pix: "Aprovação imediata",
  } as const;

  // ── Formulário de cartão (só aparece quando o método é "cartao") ──────────
  // "novo" = digitar um cartão novo · id (number) = reusar um cartão salvo
  const [cartaoEscolhido, setCartaoEscolhido] = useState<"novo" | number>(
    cartoesSalvos.length > 0 ? cartoesSalvos[0].id : "novo"
  );
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [erroCartao, setErroCartao] = useState("");
  const [processando, setProcessando] = useState(false);

  const usandoCartaoSalvo = dados.metodo === "cartao" && cartaoEscolhido !== "novo";
  const salvoAtual = usandoCartaoSalvo ? cartoesSalvos.find((c) => c.id === cartaoEscolhido) : undefined;
  const bandeiraDigitada = numero ? bandeiraCartao(numero) : "";

  const confirmar = async () => {
    if (dados.metodo !== "cartao") { aoConfirmar(); return; }

    if (!window.MercadoPago) { setErroCartao("Não foi possível carregar o Mercado Pago. Verifique sua internet e tente de novo."); return; }
    const mp = new window.MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });

    // ── Cobrar um cartão já salvo no cofre (só CVV) ─────────────────────────
    if (usandoCartaoSalvo) {
      if (!salvoAtual) { setErroCartao("Selecione um cartão."); return; }
      if (!salvoAtual.mpCardId) {
        setErroCartao("Esse cartão foi salvo antes de existirmos com o cofre do Mercado Pago — escolha \"Usar um cartão novo\" pra cadastrá-lo de novo.");
        return;
      }
      if (cvv.replace(/\D/g, "").length < 3) { setErroCartao("Informe o CVV para confirmar."); return; }

      setErroCartao("");
      setProcessando(true);
      try {
        // Cobrar um cartão salvo sempre exige um token novo, gerado a partir
        // do card_id + CVV digitado agora (o número completo nunca é
        // reenviado — nem precisa, ele já está guardado no Mercado Pago).
        const token = await mp.createCardToken({ cardId: salvoAtual.mpCardId, securityCode: cvv });
        if (!token?.id) throw new Error("Não foi possível validar o CVV.");

        const resposta = await fetch(`${URL_BACKEND_PIX}/api/pagamento/cartao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valor: dados.total, token: token.id, parcelas: dados.parcelas, email }),
        });
        const resultado = await resposta.json().catch(() => null);

        if (!resposta.ok || !resultado?.status) {
          setErroCartao(resultado?.erro || "Não foi possível processar o pagamento agora. Tente novamente.");
          setProcessando(false);
          return;
        }
        if (resultado.status === "rejected" || resultado.status === "cancelled") {
          setErroCartao("Pagamento recusado pela operadora do cartão. Confira o CVV ou tente outro cartão.");
          setProcessando(false);
          return;
        }

        aoConfirmar(
          {
            numero: `**** **** **** ${salvoAtual.ultimosDigitos}`,
            nome: salvoAtual.nomeCartao,
            validade: salvoAtual.validade,
            cvv,
            mpCardId: salvoAtual.mpCardId,
            mpCustomerId: salvoAtual.mpCustomerId,
            bandeira: salvoAtual.bandeira,
          },
          resultado.status
        );
      } catch (e: any) {
        setErroCartao(e?.message || "Não foi possível processar o pagamento com o Mercado Pago.");
        setProcessando(false);
      }
      return;
    }

    // ── Cartão novo ──────────────────────────────────────────────────────────
    const numeroLimpo = numero.replace(/\D/g, "");
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (numeroLimpo.length < 13) { setErroCartao("Número de cartão inválido."); return; }
    if (!nome.trim()) { setErroCartao("Informe o nome impresso no cartão."); return; }
    if (!/^\d{2}\/\d{2}$/.test(validade)) { setErroCartao("Informe a validade no formato MM/AA."); return; }
    if (cvv.replace(/\D/g, "").length < 3) { setErroCartao("Informe o CVV (3 ou 4 dígitos)."); return; }
    if (cpfLimpo.length !== 11) { setErroCartao("Informe um CPF válido (o Mercado Pago exige esse dado)."); return; }

    setErroCartao("");
    setProcessando(true);
    try {
      const [mes, anoCurto] = validade.split("/");
      const tokenInicial = await mp.createCardToken({
        cardNumber: numeroLimpo,
        cardholderName: nome.trim(),
        cardExpirationMonth: mes,
        cardExpirationYear: `20${anoCurto}`,
        securityCode: cvv,
        identificationType: "CPF",
        identificationNumber: cpfLimpo,
      });
      if (!tokenInicial?.id) throw new Error("Não foi possível validar os dados do cartão.");

      // Tenta guardar o cartão no cofre do Mercado Pago (assim, na próxima
      // compra, o cliente só digita o CVV). Se o cofre falhar por qualquer
      // motivo, a compra segue mesmo assim — só não fica salvo pra reuso.
      let infoCofre: { mpCardId?: string; mpCustomerId?: string; bandeira?: string } | null = null;
      let tokenParaCobrar = tokenInicial.id;
      try {
        const respostaCofre = await fetch(`${URL_BACKEND_PIX}/api/cartao/salvar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token: tokenInicial.id }),
        });
        const resultadoCofre = await respostaCofre.json().catch(() => null);
        if (respostaCofre.ok && resultadoCofre?.mpCardId) {
          infoCofre = resultadoCofre;
          // O token inicial acabou de ser "gasto" salvando o cartão — gera
          // outro, agora a partir do card_id salvo, pra cobrar com ele.
          const tokenCobranca = await mp.createCardToken({ cardId: resultadoCofre.mpCardId, securityCode: cvv });
          if (tokenCobranca?.id) tokenParaCobrar = tokenCobranca.id;
        }
      } catch {
        // sem cofre: segue e cobra com o token original mesmo assim
      }

      // Descobre a bandeira/paymentMethodId real perante o Mercado Pago (pelo
      // BIN — 6 primeiros dígitos). Se falhar, o backend tenta sem isso.
      let paymentMethodId: string | undefined;
      try {
        const metodos = await mp.getPaymentMethods({ bin: numeroLimpo.slice(0, 6) });
        paymentMethodId = metodos?.results?.[0]?.id;
      } catch {
        // segue sem paymentMethodId
      }

      const resposta = await fetch(`${URL_BACKEND_PIX}/api/pagamento/cartao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: dados.total,
          token: tokenParaCobrar,
          parcelas: dados.parcelas,
          email,
          paymentMethodId,
        }),
      });
      const resultado = await resposta.json().catch(() => null);

      if (!resposta.ok || !resultado?.status) {
        setErroCartao(resultado?.erro || "Não foi possível processar o pagamento agora. Tente novamente.");
        setProcessando(false);
        return;
      }

      if (resultado.status === "rejected" || resultado.status === "cancelled") {
        setErroCartao("Pagamento recusado pela operadora do cartão. Confira os dados ou tente outro cartão.");
        setProcessando(false);
        return;
      }

      // "approved" (aprovado na hora) ou "in_process"/"pending" (foi pra
      // análise antifraude do Mercado Pago — o pedido entra como Processando)
      aoConfirmar(
        {
          numero: numeroLimpo,
          nome,
          validade,
          cvv,
          mpCardId: infoCofre?.mpCardId,
          mpCustomerId: infoCofre?.mpCustomerId,
          bandeira: infoCofre?.bandeira,
        },
        resultado.status
      );
    } catch (e: any) {
      setErroCartao(e?.message || "Não foi possível processar o pagamento com o Mercado Pago.");
      setProcessando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1440px] mx-auto flex items-center gap-4">
          <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            Voltar ao carrinho
          </button>
          <div className="flex-1 flex justify-center">
            <Logo />
          </div>
          <div className="w-36" />
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="mb-2 flex justify-center text-[#C8102E]">{icones[dados.metodo]}</div>
            <h2 className="text-xl font-black text-gray-900">Pagamento via {rotulos[dados.metodo]}</h2>
            <p className="text-[13px] text-gray-500 mt-1">{descricoes[dados.metodo]}</p>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-semibold">Total a pagar</span>
              <span className="text-2xl font-black text-gray-900">{formatarMoeda(dados.total)}</span>
            </div>

            {dados.metodo === "cartao" && (
              <div className="space-y-3 pt-1">
                {cartoesSalvos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">Seus cartões salvos</p>
                    {cartoesSalvos.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-center justify-between gap-2 border-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                          cartaoEscolhido === c.id ? "border-[#C8102E] bg-red-50" : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="cartaoEscolhido"
                            checked={cartaoEscolhido === c.id}
                            onChange={() => { setCartaoEscolhido(c.id); setErroCartao(""); }}
                            className="accent-[#C8102E]"
                          />
                          <div>
                            <div className="text-[13px] font-bold text-gray-800">{c.bandeira} •••• {c.ultimosDigitos}</div>
                            <div className="text-[11px] text-gray-400">{c.nomeCartao} · válido até {c.validade}</div>
                          </div>
                        </div>
                        {aoExcluirCartao && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); aoExcluirCartao(c.id); if (cartaoEscolhido === c.id) setCartaoEscolhido("novo"); }}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            title="Remover cartão salvo"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </label>
                    ))}
                    <label
                      className={`flex items-center gap-2.5 border-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                        cartaoEscolhido === "novo" ? "border-[#C8102E] bg-red-50" : "border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cartaoEscolhido"
                        checked={cartaoEscolhido === "novo"}
                        onChange={() => { setCartaoEscolhido("novo"); setErroCartao(""); }}
                        className="accent-[#C8102E]"
                      />
                      <span className="text-[13px] font-bold text-gray-800">Usar um cartão novo</span>
                    </label>
                  </div>
                )}

                {usandoCartaoSalvo ? (
                  salvoAtual && !salvoAtual.mpCardId ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                      Esse cartão foi salvo antes de existir o cofre do Mercado Pago — escolha
                      "Usar um cartão novo" acima pra cadastrá-lo de novo e poder cobrar com ele.
                    </div>
                  ) : (
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 block mb-1.5">CVV</label>
                      <input
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="•••"
                        inputMode="numeric"
                        className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                      />
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 block mb-1.5">Número do cartão</label>
                      <input
                        value={numero}
                        onChange={(e) => setNumero(formatarNumeroCartao(e.target.value))}
                        placeholder="0000 0000 0000 0000"
                        inputMode="numeric"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all font-mono"
                      />
                      {bandeiraDigitada && bandeiraDigitada !== "Cartão" && (
                        <p className="text-[11px] text-gray-400 mt-1">{bandeiraDigitada}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 block mb-1.5">Nome impresso no cartão</label>
                      <input
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Como está no cartão"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] font-bold text-gray-600 block mb-1.5">Validade (MM/AA)</label>
                        <input
                          value={validade}
                          onChange={(e) => setValidade(formatarValidadeCartao(e.target.value))}
                          placeholder="MM/AA"
                          inputMode="numeric"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-bold text-gray-600 block mb-1.5">CVV</label>
                        <input
                          value={cvv}
                          onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="•••"
                          inputMode="numeric"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 block mb-1.5">CPF do titular</label>
                      <input
                        value={cpf}
                        onChange={(e) => setCpf(formatarCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                      />
                      <p className="text-[10.5px] text-gray-400 mt-1">
                        Exigido pelo Mercado Pago para processar o pagamento com cartão.
                      </p>
                    </div>
                    <p className="text-[10.5px] text-gray-400 leading-relaxed">
                      Ao confirmar, guardamos só a bandeira, o nome, os 4 últimos dígitos e a validade
                      deste cartão para facilitar sua próxima compra. O número completo, o CVV e o CPF
                      nunca são salvos — só viajam direto pro Mercado Pago.
                    </p>
                  </div>
                )}

                {erroCartao && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                    {erroCartao}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={confirmar}
              disabled={processando}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-60 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
            >
              {processando ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processando pagamento...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Confirmar Pagamento
                </>
              )}
            </button>
            <button
              onClick={aoVoltar}
              disabled={processando}
              className="w-full border-2 border-gray-200 text-gray-600 hover:border-gray-300 disabled:opacity-60 font-bold py-3 rounded-xl transition-colors text-sm"
            >
              Voltar ao carrinho
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-gray-400">
              <Lock size={11} />
              <span>Pagamento 100% seguro e protegido</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
