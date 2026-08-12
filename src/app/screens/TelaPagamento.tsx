// Tela TelaPagamento

import { useState } from "react";
import { ChevronLeft, Check, CreditCard, Lock } from "lucide-react";
import type { DadosPagamento } from "../types";
import { URL_BACKEND_PIX } from "../constantes";
import { formatarMoeda, precoParcela } from "../utils";
import { Logo } from "../components/Logo";
import { validarDadosCartao } from "../cartao";

// ─── Tela de Pagamento no Cartão ───────────────────────────────────────────────

// Coleta os dados do cartão, valida (número pelo Luhn, validade e CVV) e
// confirma a compra. O PIX tem tela própria (TelaPix).
export function TelaPagamento({
  dados,
  aoConfirmar,
  aoVoltar,
}: {
  dados: DadosPagamento;
  email: string;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  const aoDigitarNumero = (v: string) => {
    const digitos = v.replace(/\D/g, "").slice(0, 16);
    setNumero(digitos.replace(/(.{4})/g, "$1 ").trim());
  };

  const aoDigitarValidade = (v: string) => {
    const digitos = v.replace(/\D/g, "").slice(0, 4);
    setValidade(digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos);
  };

  // Envia o cartão para o backend autorizar no adquirente. A compra só é
  // concluída com APROVADO — sem gateway configurado, o backend responde 503 e
  // o pedido NÃO é criado (mesma regra do PIX, que espera o Sicredi confirmar).
  const confirmar = async () => {
    const problema = validarDadosCartao({ numero, nome, validade, cvv });
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const resposta = await fetch(`${URL_BACKEND_PIX}/api/cartao/pagamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          valor: dados.total,
          parcelas: dados.parcelas,
          cartao: { numero, nome, validade, cvv },
        }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Não foi possível processar o pagamento.");
        return;
      }
      if (corpo?.status === "APROVADO") {
        aoConfirmar();
        return;
      }
      setErro(
        corpo?.status === "PENDENTE"
          ? "Pagamento em análise pelo banco. Assim que for aprovado, seu pedido é liberado."
          : "Pagamento recusado pelo banco. Confira os dados ou tente outro cartão."
      );
    } catch {
      setErro("Falha de conexão com o servidor de pagamento. Tente de novo.");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF4EA]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div className="bg-[#C8102E] py-3 px-4 shadow-md">
        <div className="max-w-[1440px] mx-auto relative flex items-center min-h-[40px]">
          <button onClick={aoVoltar} className="relative z-10 text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-semibold transition-colors">
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Voltar ao carrinho</span>
          </button>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Logo claro />
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="mb-2 flex justify-center text-[#C8102E]"><CreditCard size={36} /></div>
            <h2 className="text-xl font-black text-gray-900">Pagamento no cartão</h2>
            <p className="text-[13px] text-gray-500 mt-1">
              {dados.parcelas}x de {precoParcela(dados.total, dados.parcelas)} sem juros
            </p>
          </div>

          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-semibold">Total a pagar</span>
              <span className="text-2xl font-black text-gray-900">{formatarMoeda(dados.total)}</span>
            </div>

            <input
              value={numero}
              onChange={(e) => aoDigitarNumero(e.target.value)}
              placeholder="Número do cartão"
              inputMode="numeric"
              autoComplete="cc-number"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
            />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value.toUpperCase())}
              placeholder="Nome impresso no cartão"
              autoComplete="cc-name"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
            />
            <div className="flex gap-2">
              <input
                value={validade}
                onChange={(e) => aoDigitarValidade(e.target.value)}
                placeholder="Validade (MM/AA)"
                inputMode="numeric"
                autoComplete="cc-exp"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
              />
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="CVV"
                inputMode="numeric"
                autoComplete="cc-csc"
                className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors"
              />
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                {erro}
              </div>
            )}

            <button
              onClick={confirmar}
              disabled={processando}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
            >
              {processando ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={18} />
              )}
              {processando ? "Processando..." : "Confirmar Pagamento"}
            </button>
            <button
              onClick={aoVoltar}
              className="w-full border-2 border-gray-200 text-gray-600 hover:border-gray-300 font-bold py-3 rounded-xl transition-colors text-sm"
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
