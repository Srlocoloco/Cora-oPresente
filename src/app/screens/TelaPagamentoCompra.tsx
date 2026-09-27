// Tela TelaPagamentoCompra
//
// A 4ª etapa da compra ("Pagar"), para uma compra JÁ criada no servidor (ver
// TelaCheckout). O valor vem da compra, e quem diz que foi pago é o servidor —
// esta tela só pergunta "já foi pago?" de tempos em tempos e avança quando for.
//  • Pix: QR Code + "copia e cola" (no celular o código vem primeiro: não dá
//    para escanear a tela do próprio aparelho).
//  • Cartão: o formulário, que manda os dados direto para o banco.

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, Clock, RotateCcw, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import type { Compra, Produto } from "../types";
import { api } from "../api";
import { formatarMoeda, precoParcela, formatarNumeroCartao, formatarValidadeCartao, bandeiraCartao } from "../utils";
import { validarDadosCartao } from "../cartao";
import { CabecalhoCheckout } from "../components/CabecalhoCheckout";
import { ResumoCompra } from "../components/ResumoCompra";
import { QrCodePix } from "../components/QrCodePix";

export function TelaPagamentoCompra({
  compraInicial,
  produtos,
  aoAprovado,
  aoVoltar,
  aoCancelada,
}: {
  compraInicial: Compra;
  produtos: Produto[];
  aoAprovado: (compra: Compra) => void;
  // Volta ao carrinho SEM cancelar (a compra continua reservada até vencer)
  aoVoltar: () => void;
  aoCancelada: () => void;
}) {
  const [compra, setCompra] = useState<Compra>(compraInicial);
  // O relógio do servidor manda: guardamos quando a compra vence no relógio
  // DESTE aparelho (agora + segundos que faltam), sem depender da hora certa dele.
  const [venceEm] = useState(() => Date.now() + compraInicial.segundosParaPagar * 1000);
  const [agora, setAgora] = useState(Date.now());
  const aprovado = useRef(false);

  const consultar = useCallback(async () => {
    const r = await api<{ compra: Compra }>(`/api/compras/${compra.id}`);
    if (!r.ok || !r.dados) return;
    const atual = r.dados.compra;
    setCompra((c) => ({ ...c, ...atual, pix: atual.pix ?? c.pix }));
    if (atual.status === "paga" && !aprovado.current) {
      aprovado.current = true;
      aoAprovado(atual);
    }
  }, [compra.id, aoAprovado]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // O "voltar" do aparelho leva ao carrinho (a compra continua reservada)
  useEffect(() => {
    window.history.pushState({ pagamentoCompra: compraInicial.id }, "");
    const aoVoltarNoNavegador = () => aoVoltar();
    window.addEventListener("popstate", aoVoltarNoNavegador);
    return () => window.removeEventListener("popstate", aoVoltarNoNavegador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restante = Math.max(0, venceEm - agora);
  const vencida = compra.status === "expirada" || compra.status === "cancelada" || restante === 0;

  const cancelar = async () => {
    if (!window.confirm("Cancelar esta compra? Os produtos voltam para a loja e nada será cobrado.")) return;
    await api(`/api/compras/${compra.id}/cancelar`, { metodo: "POST", corpo: {} });
    aoCancelada();
  };

  const fotos = compra.pedidos.map((p) => {
    const prod = produtos.find((x) => x.id === p.produtoId);
    return { src: prod?.image ?? "", alt: p.items };
  });

  return (
    <div className="min-h-screen bg-[#EDEDED]">
      <CabecalhoCheckout etapa={4} aoVoltar={aoVoltar} rotuloVoltar="Voltar ao carrinho" />
      <main className="max-w-[1100px] mx-auto px-4 pt-6 pb-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0">
          {vencida ? (
            <PagamentoVencido status={compra.status} aoVoltar={aoVoltar} />
          ) : compra.metodo === "pix" ? (
            <PagamentoPix compra={compra} restante={restante} aoConsultar={consultar} />
          ) : (
            <PagamentoCartao compra={compra} aoConsultar={consultar} />
          )}
          {!vencida && (
            <button onClick={cancelar} className="mt-5 text-[14px] text-gray-500 hover:text-[#C8102E] hover:underline">
              Cancelar esta compra
            </button>
          )}
        </div>

        <aside className="lg:sticky lg:top-4 space-y-3">
          <ResumoCompra
            fotos={fotos}
            linhas={[
              { rotulo: compra.pedidos.length === 1 ? "Produto" : `Produtos (${compra.pedidos.length})`, valor: compra.subtotal },
              ...(compra.frete > 0 ? [{ rotulo: "Entrega", valor: compra.frete }] : []),
              ...(compra.descontoPix > 0 ? [{ rotulo: "Desconto no Pix", valor: compra.descontoPix, tipo: "desconto" as const }] : []),
              ...(compra.descontoCupom > 0 ? [{ rotulo: `Cupom ${compra.cupom ?? ""}`, valor: compra.descontoCupom, tipo: "desconto" as const }] : []),
            ]}
            total={compra.total}
            rotuloTotal="Você paga"
            observacao={compra.metodo === "cartao" && compra.parcelas > 1 ? `${compra.parcelas}x de ${precoParcela(compra.total, compra.parcelas)} sem juros` : undefined}
          />
          <div className="painel px-5 py-4 text-[14px]">
            <p className="text-[13px] text-gray-500 mb-1">Entrega em</p>
            <p className="text-gray-800">{compra.endereco}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function PagamentoVencido({ status, aoVoltar }: { status: Compra["status"]; aoVoltar: () => void }) {
  return (
    <section className="painel px-6 py-12 text-center">
      <Clock size={40} strokeWidth={1.25} className="text-gray-400 mx-auto mb-4" />
      <h1 className="text-[22px] text-gray-900">{status === "cancelada" ? "Compra cancelada" : "O prazo para pagar acabou"}</h1>
      <p className="text-[15px] text-gray-500 mt-2 max-w-sm mx-auto">
        Nada foi cobrado e os produtos voltaram para a loja. Seu carrinho continua salvo.
      </p>
      <button onClick={aoVoltar} className="btn-primario mt-6 px-8 py-3 text-[15px]">
        Voltar ao carrinho
      </button>
    </section>
  );
}

// ─── Pix ─────────────────────────────────────────────────────────────────────
function PagamentoPix({ compra, restante, aoConsultar }: { compra: Compra; restante: number; aoConsultar: () => Promise<void> }) {
  const [pix, setPix] = useState(compra.pix ?? null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(!compra.pix);
  const [copiado, setCopiado] = useState(false);
  const [conferindo, setConferindo] = useState(false);

  const gerar = useCallback(async () => {
    setGerando(true);
    setErro("");
    const r = await api<{ txid: string; modo: "api" | "manual"; pixCopiaECola: string; expiraEm: string }>("/api/pix/cobranca", {
      corpo: { compraId: compra.id },
    });
    setGerando(false);
    if (r.ok && r.dados) setPix(r.dados);
    else setErro(r.erro ?? "Não foi possível gerar o Pix agora.");
  }, [compra.id]);

  useEffect(() => {
    if (!pix) gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pergunta ao servidor se o pagamento caiu: a cada 5 s com a API do banco
  // (confirmação automática) e a cada 10 s quando é a loja que confere.
  useEffect(() => {
    if (!pix) return;
    const t = setInterval(aoConsultar, pix.modo === "api" ? 5000 : 10000);
    return () => clearInterval(t);
  }, [pix, aoConsultar]);

  const copiar = () => {
    if (!pix) return;
    navigator.clipboard?.writeText(pix.pixCopiaECola).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const jaPaguei = async () => {
    setConferindo(true);
    await aoConsultar();
    setTimeout(() => setConferindo(false), 1200);
  };

  const horas = Math.floor(restante / 3600000);
  const minutos = Math.floor((restante % 3600000) / 60000);
  const segundos = Math.floor((restante % 60000) / 1000);
  const acabando = restante < 5 * 60 * 1000;
  const prazo =
    horas >= 1
      ? `Pague em até ${horas}h${String(minutos).padStart(2, "0")}.`
      : `O código vence em ${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}.`;

  return (
    <>
      <h1 className="text-[22px] md:text-[24px] text-gray-900">Pague {formatarMoeda(compra.total)} com Pix</h1>
      <p className={`text-[14.5px] mt-1 mb-4 flex items-center gap-1.5 ${acabando ? "text-[#B45309]" : "text-gray-500"}`}>
        <Clock size={15} /> {prazo} Depois disso a compra é cancelada sozinha.
      </p>

      <section className="painel">
        {gerando ? (
          <div className="py-16 flex flex-col items-center gap-3 text-gray-500 text-[15px]">
            <Loader2 size={26} className="animate-spin text-[#C8102E]" /> Gerando o código Pix…
          </div>
        ) : erro ? (
          <div className="px-6 py-12 text-center">
            <AlertCircle size={32} strokeWidth={1.5} className="text-[#C8102E] mx-auto mb-3" />
            <p className="text-[16px] text-gray-900">{erro}</p>
            <p className="text-[14px] text-gray-500 mt-1">Nada foi cobrado. Tente de novo em instantes.</p>
            <button onClick={gerar} className="btn-primario mt-5 px-6 py-2.5 text-[14px]">
              Tentar de novo
            </button>
          </div>
        ) : pix ? (
          <>
            <div className="p-5 md:p-7 flex flex-col md:flex-row gap-7 md:gap-10">
              {/* No celular o QR vai para baixo: a pessoa usa o "copia e cola" */}
              <div className="order-2 md:order-1 flex flex-col items-center gap-2 flex-shrink-0">
                <div className="p-2 border border-black/10 rounded">
                  <QrCodePix codigo={pix.pixCopiaECola} tamanho={208} />
                </div>
                <span className="text-[13px] text-gray-500">Escaneie com o app do banco</span>
              </div>

              <div className="order-1 md:order-2 flex-1 min-w-0">
                <ol className="space-y-2.5 text-[15px] text-gray-700 list-decimal pl-5 marker:text-gray-400">
                  <li>Abra o app do seu banco e entre na área Pix.</li>
                  <li>Escolha <span className="text-gray-900">Pix Copia e Cola</span> e cole o código abaixo, ou leia o QR Code.</li>
                  <li>Confira o valor de {formatarMoeda(compra.total)} e o nome Coração Presente, e confirme.</li>
                </ol>

                <label className="block text-[13px] text-gray-500 mt-6 mb-1.5" htmlFor="copia-e-cola">
                  Código Pix Copia e Cola
                </label>
                <input
                  id="copia-e-cola"
                  readOnly
                  value={pix.pixCopiaECola}
                  onFocus={(e) => e.target.select()}
                  className="campo font-mono !text-[12.5px] !text-gray-600 bg-[#F5F5F5]"
                />
                <button onClick={copiar} className="btn-primario w-full sm:w-auto mt-3 px-6 py-3 text-[15px] flex items-center justify-center gap-2">
                  {copiado ? <Check size={17} /> : <Copy size={17} />}
                  {copiado ? "Código copiado" : "Copiar código"}
                </button>
              </div>
            </div>

            <div className="border-t border-black/[0.08] px-5 md:px-7 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <p className="flex-1 text-[14px] text-gray-600 flex items-start gap-2.5">
                <Loader2 size={16} className="animate-spin text-gray-400 flex-shrink-0 mt-0.5" />
                {pix.modo === "api"
                  ? "Aguardando o pagamento. Quando o Pix cair, esta tela avança sozinha."
                  : "Depois de pagar, a loja confere o Pix e confirma o pedido, normalmente em poucos minutos no horário comercial. Você pode fechar esta página: avisamos quando for aprovado."}
              </p>
              <button
                onClick={jaPaguei}
                disabled={conferindo}
                className="btn-secundario px-5 py-2.5 text-[14px] flex items-center justify-center gap-2 flex-shrink-0"
              >
                {conferindo ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                Já paguei
              </button>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

// ─── Cartão ──────────────────────────────────────────────────────────────────
function PagamentoCartao({ compra, aoConsultar }: { compra: Compra; aoConsultar: () => Promise<void> }) {
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);
  const [emAnalise, setEmAnalise] = useState(false);

  useEffect(() => {
    if (!emAnalise) return;
    const t = setInterval(aoConsultar, 6000);
    return () => clearInterval(t);
  }, [emAnalise, aoConsultar]);

  const pagar = async () => {
    const problema = validarDadosCartao({ numero, nome, validade, cvv });
    if (problema) return setErro(problema);
    setErro("");
    setProcessando(true);
    const r = await api<{ status: string }>("/api/cartao/pagamento", {
      corpo: { compraId: compra.id, cartao: { numero, nome, validade, cvv } },
    });
    setProcessando(false);
    if (!r.ok) return setErro(r.erro ?? "Não foi possível processar o pagamento.");
    if (r.dados?.status === "APROVADO") {
      setCvv("");
      await aoConsultar();
      return;
    }
    if (r.dados?.status === "PENDENTE") {
      setEmAnalise(true);
      return;
    }
    setErro("O banco recusou o pagamento. Confira os dados ou use outro cartão.");
  };

  const digitos = numero.replace(/\D/g, "");
  const rotulo = "block text-[14px] text-gray-700 mb-1.5";

  return (
    <>
      <h1 className="text-[22px] md:text-[24px] text-gray-900 mb-4">
        {compra.parcelas > 1
          ? `Pague em ${compra.parcelas}x de ${precoParcela(compra.total, compra.parcelas)} sem juros`
          : `Pague ${formatarMoeda(compra.total)} no cartão`}
      </h1>

      <section className="painel">
        {emAnalise ? (
          <div className="px-6 py-12 text-center">
            <Loader2 size={28} className="animate-spin text-[#C8102E] mx-auto mb-3" />
            <p className="text-[17px] text-gray-900">O banco está analisando o pagamento</p>
            <p className="text-[14px] text-gray-500 mt-1">Leva alguns minutos. Quando for aprovado, esta tela avança sozinha.</p>
          </div>
        ) : (
          <form
            className="p-5 md:p-7 grid gap-4 max-w-[480px]"
            onSubmit={(e) => {
              e.preventDefault();
              pagar();
            }}
          >
            <div>
              <label className={rotulo} htmlFor="cc-numero">Número do cartão</label>
              <div className="relative">
                <input
                  id="cc-numero"
                  value={numero}
                  onChange={(e) => setNumero(formatarNumeroCartao(e.target.value))}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  className="campo font-mono pr-24"
                  placeholder="0000 0000 0000 0000"
                />
                {digitos && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-gray-500">{bandeiraCartao(digitos)}</span>
                )}
              </div>
            </div>
            <div>
              <label className={rotulo} htmlFor="cc-nome">Nome impresso no cartão</label>
              <input id="cc-nome" value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} autoComplete="cc-name" className="campo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={rotulo} htmlFor="cc-validade">Validade</label>
                <input
                  id="cc-validade"
                  value={validade}
                  onChange={(e) => setValidade(formatarValidadeCartao(e.target.value))}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/AA"
                  className="campo"
                />
              </div>
              <div>
                <label className={rotulo} htmlFor="cc-cvv">Código de segurança</label>
                <input
                  id="cc-cvv"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="3 ou 4 números"
                  className="campo"
                />
              </div>
            </div>
            {erro && (
              <p role="alert" className="flex items-start gap-2 text-[14px] text-[#C8102E]">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {erro}
              </p>
            )}
            <button type="submit" disabled={processando} className="btn-primario py-3 text-[15px] flex items-center justify-center gap-2">
              {processando && <Loader2 size={17} className="animate-spin" />}
              {processando ? "Processando…" : `Pagar ${formatarMoeda(compra.total)}`}
            </button>
            <p className="text-[13px] text-gray-500 flex items-start gap-1.5">
              <ShieldCheck size={15} className="flex-shrink-0 mt-0.5" /> Os dados do cartão vão direto para o banco e não ficam guardados na loja.
            </p>
          </form>
        )}
      </section>
    </>
  );
}
