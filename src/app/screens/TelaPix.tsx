// Tela TelaPix

import { useState, useEffect } from "react";
import { X, Plus, RotateCcw, ChevronLeft, Zap, Lock } from "lucide-react";
import { VALIDADE_PIX_MS, URL_BACKEND_PIX } from "../constantes";
import { formatarMoeda } from "../utils";
import { Logo } from "../components/Logo";

export function TelaPix({
  total,
  aoConfirmar,
  aoVoltar,
}: {
  total: number;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  // Identificador da transação (muda quando um novo código é gerado)
  const [txid, setTxid] = useState(() => `CP${String(Date.now()).slice(-10)}`);
  const [expiraEm, setExpiraEm] = useState(() => Date.now() + VALIDADE_PIX_MS);
  const [agora, setAgora] = useState(Date.now());
  const [copiado, setCopiado] = useState(false);
  // Cobrança oficial criada pelo backend Sicredi — só existe QR quando o
  // backend confirma a cobrança de verdade (sem confirmação manual: o pedido
  // só conclui quando o site verificar que o PIX caiu na conta do Sicredi)
  const [payloadBackend, setPayloadBackend] = useState<string | null>(null);
  const [txidBackend, setTxidBackend] = useState<string | null>(null);
  const [carregandoCobranca, setCarregandoCobranca] = useState(true);
  const [erroCobranca, setErroCobranca] = useState(false);

  // Cria a cobrança oficial no backend. Sem backend (ou sem Sicredi
  // configurado), não há como confirmar o pagamento sozinho — mostra erro
  // em vez de um QR que ninguém consegue verificar de verdade.
  useEffect(() => {
    let cancelado = false;
    setCarregandoCobranca(true);
    setErroCobranca(false);
    fetch(`${URL_BACKEND_PIX}/api/pix/cobranca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor: total }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((dados) => {
        if (cancelado) return;
        if (!dados?.pixCopiaECola) throw new Error();
        setPayloadBackend(dados.pixCopiaECola);
        setTxidBackend(dados.txid ?? null);
        setCarregandoCobranca(false);
      })
      .catch(() => {
        if (cancelado) return;
        setErroCobranca(true);
        setCarregandoCobranca(false);
      });
    return () => { cancelado = true; };
  }, [txid, total]);

  // Com a cobrança oficial: verifica a cada 5s se o PIX caiu e confirma sozinho
  useEffect(() => {
    if (!txidBackend) return;
    const t = setInterval(() => {
      fetch(`${URL_BACKEND_PIX}/api/pix/cobranca/${txidBackend}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((dados) => {
          if (dados?.status === "CONCLUIDA") aoConfirmar();
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [txidBackend]);

  // Relógio da contagem regressiva (atualiza a cada segundo)
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restanteMs = Math.max(0, expiraEm - agora);
  const expirado = restanteMs <= 0;
  const acabando = !expirado && restanteMs < 5 * 60 * 1000; // últimos 5 minutos
  const minutos = String(Math.floor(restanteMs / 60000)).padStart(2, "0");
  const segundos = String(Math.floor((restanteMs % 60000) / 1000)).padStart(2, "0");

  const urlQrCode = payloadBackend
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(payloadBackend)}`
    : null;

  const copiarCodigo = () => {
    if (!payloadBackend) return;
    navigator.clipboard?.writeText(payloadBackend).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // Gera um novo código PIX com mais 30 minutos de validade (também usado
  // para tentar de novo depois de um erro ao criar a cobrança)
  const gerarNovoCodigo = () => {
    setPayloadBackend(null); // descarta a cobrança antiga (uma nova será criada)
    setTxidBackend(null);
    setTxid(`CP${String(Date.now()).slice(-10)}`);
    setExpiraEm(Date.now() + VALIDADE_PIX_MS);
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

      <div className="max-w-[520px] mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 text-center">
            <div className="mb-2 flex justify-center"><Zap size={36} className="text-[#C8102E]" /></div>
            <h2 className="text-xl font-black text-gray-900">Pague com PIX</h2>
            <p className="text-[13px] text-gray-500 mt-1">
              Escaneie o QR Code ou copie o código abaixo no app do seu banco
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-2xl font-black text-gray-900">{formatarMoeda(total)}</span>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {erroCobranca && !expirado ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
                  <X size={28} className="text-red-500 mx-auto mb-2" />
                  <p className="text-[14px] font-bold text-red-700">
                    Não foi possível confirmar pagamentos automáticos agora
                  </p>
                  <p className="text-[12px] text-red-500 mt-1">
                    Sua compra não foi cobrada. Tente novamente em instantes ou volte mais tarde.
                  </p>
                </div>
                <button
                  onClick={gerarNovoCodigo}
                  className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
                >
                  <RotateCcw size={17} />
                  Tentar novamente
                </button>
              </>
            ) : carregandoCobranca && !expirado ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#C8102E] rounded-full animate-spin" />
                <p className="text-[13px] text-gray-500 font-semibold">Gerando cobrança PIX segura...</p>
              </div>
            ) : (
              <>
                {/* Contagem regressiva de expiração */}
                <div
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold ${
                    expirado
                      ? "bg-red-50 border border-red-200 text-red-600"
                      : acabando
                      ? "bg-amber-50 border border-amber-200 text-amber-700"
                      : "bg-gray-50 border border-gray-200 text-gray-600"
                  }`}
                >
                  {expirado ? "Código expirado" : <>Este código expira em <span className="font-mono font-black">{minutos}:{segundos}</span></>}
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  {expirado || !urlQrCode ? (
                    <div className="w-[240px] h-[240px] rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 text-center p-4">
                      <RotateCcw size={28} className="text-gray-300" />
                      <p className="text-[13px] text-gray-500 font-semibold">
                        O tempo de pagamento acabou.<br />Gere um novo código para continuar.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
                      <img
                        src={urlQrCode}
                        alt="QR Code PIX"
                        width={240}
                        height={240}
                        className="rounded-lg"
                      />
                    </div>
                  )}
                </div>

                {/* Código copia e cola */}
                {!expirado && payloadBackend && (
                  <div>
                    <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">PIX copia e cola</p>
                    <div className="flex gap-2">
                      <div className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 font-mono text-[11px] text-gray-600 truncate bg-gray-50">
                        {payloadBackend}
                      </div>
                      <button
                        onClick={copiarCodigo}
                        className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-bold text-[13px] px-4 py-2.5 rounded-xl transition-colors flex-shrink-0"
                      >
                        {copiado ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Passo a passo */}
                {!expirado && payloadBackend && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                    {[
                      "Abra o app do seu banco e escolha pagar com PIX",
                      "Escaneie o QR Code ou cole o código copia e cola",
                      "Confira o valor e confirme",
                    ].map((passo, i) => (
                      <div key={passo} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-[12px] text-gray-600 font-medium">{passo}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expirado ? (
                  <button
                    onClick={gerarNovoCodigo}
                    className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={17} />
                    Gerar novo código PIX
                  </button>
                ) : (
                  <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-4 rounded-xl text-[13px] flex items-center justify-center gap-2.5">
                    <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                    Aguardando confirmação do pagamento — o pedido conclui sozinho assim que o PIX cair
                  </div>
                )}
              </>
            )}
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
