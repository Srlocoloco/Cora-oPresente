// Pagina Admin: PaginaRepassesAdmin
//
// Pagar a comissão de todo mundo de uma vez, direto da conta da empresa:
//   1. "Fechar repasses" junta as comissões liberadas de cada pessoa num
//      pagamento (quem ainda não cadastrou a conta fica esperando);
//   2. "Gerar arquivo do banco" monta o arquivo CNAB 240 do Sicredi com todos
//      os pagamentos (PIX, crédito em conta Sicredi e folha para conta salário);
//   3. você envia esse arquivo no Internet Banking do Sicredi (Pagamentos →
//      arquivo/remessa) e autoriza — o banco paga todos;
//   4. o banco devolve um arquivo de retorno (.RET): enviado aqui, ele dá baixa
//      sozinho em cada pagamento feito e aponta os recusados.

import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet, Users, Send, CheckCircle2, AlertTriangle, FileDown, FileUp, Loader2, Settings, Clock, Info, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, baixarArquivo } from "../api";
import { formatarMoeda } from "../utils";
import { PaginaPagamentosAdmin } from "./PaginaPagamentosAdmin";

interface SaldoPessoa {
  beneficiario: string; nome: string | null; cargo: string | null;
  disponivel: number; aLiberar: number; aguardandoEntrega: number; recebido: number; temConta: boolean;
}
interface Destino {
  titular: string; cpf: string; banco: string; agencia: string; conta: string; contaDigito: string;
  tipoConta: string; tipoChavePix: string | null; chavePix: string | null;
}
interface RepasseAdmin {
  id: number; beneficiario: string; nome: string | null; valor: number; qtdComissoes: number;
  metodo: "pix" | "folha" | "credito_sicredi"; status: string; ocorrencia: string | null; comprovante: string | null;
  remessaId: number | null; criadoEm: string; pagoEm: string | null; destino?: Destino;
}
interface Remessa { id: number; nomeArquivo: string; qtdPagamentos: number; total: number; dataPagamento: string; criadoEm: string }

const METODO: Record<string, string> = { pix: "PIX", folha: "Folha (conta salário)", credito_sicredi: "Crédito em conta Sicredi" };
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Pronto para enviar", cor: "bg-amber-50 text-amber-700" },
  no_banco: { rotulo: "Enviado ao banco", cor: "bg-sky-50 text-sky-700" },
  pago: { rotulo: "Pago", cor: "bg-emerald-600 text-white" },
  falhou: { rotulo: "Recusado", cor: "bg-red-50 text-red-600" },
  cancelado: { rotulo: "Cancelado", cor: "bg-gray-100 text-gray-500" },
};
const CARGO: Record<string, string> = { vendedor: "Vendedor", master: "Master", masterplus: "MasterPlus" };
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function PaginaRepassesAdmin({ aoIrParaConfig }: { aoIrParaConfig?: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [repasses, setRepasses] = useState<RepasseAdmin[]>([]);
  const [saldos, setSaldos] = useState<SaldoPessoa[]>([]);
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [empresaCompleta, setEmpresaCompleta] = useState(true);
  const [valorMinimo, setValorMinimo] = useState(10);
  const [diasLiberacao, setDiasLiberacao] = useState(7);
  const [filtro, setFiltro] = useState<"pendente" | "no_banco" | "pago" | "falhou" | "todos">("pendente");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [mostrarAntigo, setMostrarAntigo] = useState(false);
  const inputRetorno = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    const r = await api("/api/repasses");
    setCarregando(false);
    if (!r.ok) return setErro(r.erro ?? "Não foi possível carregar os repasses.");
    setErro("");
    setRepasses(r.dados.repasses ?? []);
    setSaldos(r.dados.saldos ?? []);
    setRemessas(r.dados.remessas ?? []);
    setEmpresaCompleta(Boolean(r.dados.empresaCompleta));
    setValorMinimo(r.dados.valorMinimo ?? 10);
    setDiasLiberacao(r.dados.diasLiberacao ?? 7);
  };
  useEffect(() => { carregar(); }, []);

  const disponivelTotal = saldos.reduce((s, x) => s + Math.max(0, x.disponivel), 0);
  const pendentes = repasses.filter((r) => r.status === "pendente");
  const noBanco = repasses.filter((r) => r.status === "no_banco");
  const mesAtual = hoje().slice(0, 7);
  const pagosNoMes = repasses.filter((r) => r.status === "pago" && (r.pagoEm ?? "").startsWith(mesAtual)).reduce((s, r) => s + r.valor, 0);
  const semConta = saldos.filter((s) => !s.temConta && s.disponivel > 0);
  const visiveis = useMemo(
    () => (filtro === "todos" ? repasses : repasses.filter((r) => r.status === filtro)),
    [repasses, filtro]
  );

  const fecharRepasses = async () => {
    setOcupado("gerar");
    const r = await api("/api/repasses/gerar", { corpo: {} });
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível fechar os repasses.");
    const criados = r.dados.criados?.length ?? 0;
    const pend = r.dados.pendencias?.length ?? 0;
    toast.success(
      criados > 0
        ? `${criados} repasse(s) prontos para pagar.${pend ? ` ${pend} pessoa(s) ainda sem conta cadastrada.` : ""}`
        : pend
        ? `Ninguém pronto para receber: ${pend} pessoa(s) com saldo ainda não cadastraram a conta.`
        : `Nenhum saldo liberado acima de ${formatarMoeda(valorMinimo)} agora.`,
      { duration: 8000 }
    );
    setFiltro("pendente");
    carregar();
  };

  const gerarArquivo = async () => {
    if (!empresaCompleta) return toast.error("Complete a conta da empresa em Configurações primeiro.");
    setOcupado("remessa");
    const r = await api("/api/repasses/remessa", { corpo: { dataPagamento } });
    if (!r.ok) {
      setOcupado(null);
      return toast.error(r.erro ?? "Não foi possível gerar o arquivo.", { duration: 8000 });
    }
    const rem = r.dados.remessa as Remessa;
    const erroDownload = await baixarArquivo(`/api/repasses/remessa/${rem.id}`, rem.nomeArquivo);
    setOcupado(null);
    if (erroDownload) toast.error(erroDownload);
    else toast.success(`Arquivo ${rem.nomeArquivo} baixado: ${rem.qtdPagamentos} pagamento(s), ${formatarMoeda(rem.total)}. Envie no Internet Banking do Sicredi.`, { duration: 10000 });
    carregar();
  };

  const enviarRetorno = async (arquivo: File) => {
    setOcupado("retorno");
    const conteudo = await arquivo.text();
    const r = await api("/api/repasses/retorno", { corpo: { conteudo } });
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível ler o arquivo de retorno.", { duration: 8000 });
    const x = r.dados.resumo;
    toast.success(`Retorno lido: ${x.pagos} pago(s), ${x.recusados} recusado(s), ${x.agendados} agendado(s).`, { duration: 9000 });
    carregar();
  };

  const marcarPago = async (rep: RepasseAdmin) => {
    const comprovante = window.prompt(
      `Confirmar que ${rep.nome ?? rep.beneficiario} recebeu ${formatarMoeda(rep.valor)}?\n\nSe quiser, cole o número/ID do comprovante:`,
      ""
    );
    if (comprovante === null) return;
    setOcupado(`pagar-${rep.id}`);
    const r = await api(`/api/repasses/${rep.id}/pagar`, { corpo: { comprovante } });
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível marcar como pago.");
    toast.success("Pagamento registrado. A pessoa já vê no painel dela.");
    carregar();
  };

  const cancelar = async (rep: RepasseAdmin) => {
    if (!window.confirm(`Cancelar o repasse #${rep.id}? As comissões voltam para o saldo de ${rep.nome ?? rep.beneficiario} e entram no próximo.`)) return;
    setOcupado(`cancelar-${rep.id}`);
    const r = await api(`/api/repasses/${rep.id}/cancelar`, { corpo: {} });
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível cancelar.");
    carregar();
  };

  if (carregando) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[#C8102E]" /></div>;
  }
  if (erro) {
    return <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium px-4 py-3 rounded-xl">{erro}</div>;
  }

  return (
    <div className="space-y-4 max-w-[1100px]">
      {/* Como funciona */}
      <section className="painel p-5">
        <h3 className="font-bold text-gray-900 text-[15px] mb-3">Como pagar as comissões</h3>
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { n: 1, t: "Fechar repasses", d: `Junta as comissões liberadas (${diasLiberacao} dia(s) após a entrega) de quem tem conta cadastrada.` },
            { n: 2, t: "Gerar arquivo do banco", d: "Baixa o arquivo de pagamento em lote (CNAB 240) do Sicredi." },
            { n: 3, t: "Enviar no Sicredi", d: "No Internet Banking: Pagamentos → envio de arquivo. Autorize e o banco paga todos." },
            { n: 4, t: "Dar baixa", d: "Envie aqui o arquivo de retorno (.RET): os pagos são marcados sozinhos." },
          ].map((p) => (
            <li key={p.n} className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <span className="w-6 h-6 rounded-full bg-[#C8102E] text-white text-[12.5px] font-bold inline-flex items-center justify-center">{p.n}</span>
              <p className="text-[13px] font-bold text-gray-900 mt-1.5">{p.t}</p>
              <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">{p.d}</p>
            </li>
          ))}
        </ol>
        {!empresaCompleta && (
          <div className="mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12.5px] text-amber-800">
            <AlertTriangle size={17} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              Para gerar o arquivo do banco, preencha a <strong>conta da empresa no Sicredi</strong> (CNPJ, agência, conta e código do convênio de Pagamentos).
            </span>
            {aoIrParaConfig && (
              <button onClick={aoIrParaConfig} className="font-bold text-amber-900 underline flex items-center gap-1 flex-shrink-0">
                <Settings size={13} /> Configurações
              </button>
            )}
          </div>
        )}
      </section>

      {/* Números */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { rotulo: "Liberado para pagar", valor: formatarMoeda(disponivelTotal), icone: <Wallet size={22} className="text-emerald-600" />, dica: `a partir de ${formatarMoeda(valorMinimo)} por pessoa` },
          { rotulo: "Prontos para enviar", valor: `${pendentes.length} · ${formatarMoeda(pendentes.reduce((s, r) => s + r.valor, 0))}`, icone: <Send size={22} className="text-amber-600" /> },
          { rotulo: "Aguardando o banco", valor: `${noBanco.length} · ${formatarMoeda(noBanco.reduce((s, r) => s + r.valor, 0))}`, icone: <Clock size={22} className="text-sky-600" /> },
          { rotulo: "Pago neste mês", valor: formatarMoeda(pagosNoMes), icone: <CheckCircle2 size={22} className="text-[#C8102E]" /> },
        ].map((c) => (
          <div key={c.rotulo} className="painel p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-lg font-bold text-gray-900 truncate">{c.valor}</div>
              <div className="text-[12.5px] text-gray-500 font-semibold">{c.rotulo}</div>
              {c.dica && <div className="text-[12px] text-gray-400">{c.dica}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Ações */}
      <section className="painel p-5 flex flex-col lg:flex-row gap-4 lg:items-end">
        <button
          onClick={fecharRepasses}
          disabled={ocupado !== null}
          className="bg-[#4A1218] hover:bg-[#2E0B0F] disabled:opacity-60 text-white font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2"
        >
          {ocupado === "gerar" ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />} 1. Fechar repasses
        </button>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[13px] font-semibold text-gray-600 mb-1" htmlFor="data-pagamento">Data do pagamento</label>
            <input id="data-pagamento" type="date" min={hoje()} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-[13px]" />
          </div>
          <button
            onClick={gerarArquivo}
            disabled={ocupado !== null || pendentes.length === 0}
            className="bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl flex items-center gap-2"
          >
            {ocupado === "remessa" ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} 2. Gerar arquivo do banco
          </button>
        </div>
        <div className="lg:ml-auto">
          <input
            ref={inputRetorno}
            type="file"
            accept=".ret,.RET,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviarRetorno(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => inputRetorno.current?.click()}
            disabled={ocupado !== null}
            className="border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-bold px-5 py-2.5 rounded-xl flex items-center gap-2"
          >
            {ocupado === "retorno" ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} 4. Enviar retorno do banco
          </button>
        </div>
      </section>

      {semConta.length > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12.5px] text-amber-800">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>{semConta.length} pessoa(s)</strong> têm comissão liberada mas ainda não cadastraram a conta para receber:{" "}
            {semConta.map((s) => s.nome ?? s.beneficiario).join(", ")}. Peça para entrarem em <em>Meus ganhos</em> e cadastrarem.
          </span>
        </div>
      )}

      {/* Repasses */}
      <section className="painel overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-gray-900 text-[15px] mr-auto">Repasses</h3>
          {([
            ["pendente", "Prontos", pendentes.length],
            ["no_banco", "No banco", noBanco.length],
            ["falhou", "Recusados", repasses.filter((r) => r.status === "falhou").length],
            ["pago", "Pagos", repasses.filter((r) => r.status === "pago").length],
            ["todos", "Todos", repasses.length],
          ] as const).map(([id, rot, qtd]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold ${filtro === id ? "bg-[#C8102E] text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
            >
              {rot} <span className="opacity-70">({qtd})</span>
            </button>
          ))}
        </div>
        {visiveis.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-gray-400">
            {filtro === "pendente" ? "Nada pronto para enviar. Clique em “Fechar repasses” para juntar as comissões liberadas." : "Nada por aqui."}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {visiveis.map((r) => {
              const st = STATUS[r.status] ?? { rotulo: r.status, cor: "bg-gray-100" };
              const d = r.destino;
              return (
                <li key={r.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-gray-900">
                      {r.nome ?? r.beneficiario} <span className="text-gray-400 font-medium">· #{r.id}</span>
                    </p>
                    <p className="text-[13px] text-gray-500">
                      {METODO[r.metodo]}
                      {d && (r.metodo === "pix" ? ` · chave ${d.chavePix}` : ` · ag. ${d.agencia} · conta ${d.conta}-${d.contaDigito}`)}
                      {d && ` · ${d.titular}`}
                    </p>
                    <p className="text-[12.5px] text-gray-400">
                      {r.qtdComissoes} comissão(ões) · criado em {dataBr(r.criadoEm)}
                      {r.pagoEm ? ` · pago em ${dataBr(r.pagoEm)}` : ""}
                      {r.comprovante ? ` · ${r.comprovante}` : ""}
                    </p>
                    {r.ocorrencia && r.status !== "pago" && <p className="text-[13px] text-red-600 font-semibold mt-0.5">{r.ocorrencia}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[15px] font-bold text-gray-900 tabular-nums">{formatarMoeda(r.valor)}</span>
                    <span className={`text-[12px] font-bold px-2.5 py-1 rounded-sm ${st.cor}`}>{st.rotulo}</span>
                    {(r.status === "pendente" || r.status === "no_banco") && (
                      <>
                        <button
                          onClick={() => marcarPago(r)}
                          disabled={ocupado !== null}
                          className="text-[13px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                        >
                          {ocupado === `pagar-${r.id}` ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />} Marcar pago
                        </button>
                        <button
                          onClick={() => cancelar(r)}
                          disabled={ocupado !== null}
                          title="Cancelar: as comissões voltam para o saldo"
                          className="text-[13px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 flex items-center gap-1"
                        >
                          <X size={13} /> Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Saldos por pessoa */}
      <section className="painel overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-[15px]">Saldo de cada associado</h3>
          <p className="text-[12px] text-gray-500">Liberado = pode entrar no próximo repasse · A liberar = entregue, contando o prazo · Aguardando = pedido pago ainda não entregue</p>
        </div>
        {saldos.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-gray-400">Nenhuma comissão lançada ainda. Elas aparecem assim que as vendas com código forem pagas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[12.5px] text-gray-500">
                <tr>
                  <th className="text-left px-5 py-2.5 font-semibold">Pessoa</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Liberado</th>
                  <th className="text-right px-3 py-2.5 font-semibold">A liberar</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Aguardando</th>
                  <th className="text-right px-5 py-2.5 font-semibold">Já recebeu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {saldos.map((s) => (
                  <tr key={s.beneficiario}>
                    <td className="px-5 py-3">
                      <div className="font-bold text-gray-800">{s.nome ?? s.beneficiario}</div>
                      <div className="text-[12.5px] text-gray-400">
                        {CARGO[s.cargo ?? ""] ?? "Sem cargo"} · {s.temConta ? <span className="text-emerald-600 font-semibold">conta cadastrada</span> : <span className="text-amber-600 font-semibold">sem conta para receber</span>}
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-bold ${s.disponivel < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {s.disponivel < 0 ? `- ${formatarMoeda(-s.disponivel)}` : formatarMoeda(s.disponivel)}
                      {s.disponivel < 0 && <div className="text-[12px] font-semibold text-gray-400">estorno a descontar</div>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(s.aLiberar)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-500">{formatarMoeda(s.aguardandoEntrega)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-500">{formatarMoeda(s.recebido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Arquivos gerados */}
      {remessas.length > 0 && (
        <section className="painel overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-[15px]">Arquivos enviados ao banco</h3>
          </div>
          <ul className="divide-y divide-gray-50">
            {remessas.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-mono font-bold text-gray-800">{r.nomeArquivo}</p>
                  <p className="text-[13px] text-gray-500">
                    {r.qtdPagamentos} pagamento(s) · {formatarMoeda(r.total)} · para {dataBr(r.dataPagamento)} · gerado em {dataBr(r.criadoEm)}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const e = await baixarArquivo(`/api/repasses/remessa/${r.id}`, r.nomeArquivo);
                    if (e) toast.error(e);
                  }}
                  className="text-[12px] font-bold text-[#C8102E] hover:underline flex items-center gap-1"
                >
                  <FileDown size={14} /> Baixar de novo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sistema anterior (pagamento semanal) */}
      <section className="painel">
        <button onClick={() => setMostrarAntigo((v) => !v)} className="w-full px-5 py-4 flex items-center justify-between text-left">
          <span>
            <span className="block font-bold text-gray-900 text-[14px]">Pagamentos semanais do sistema anterior</span>
            <span className="block text-[12px] text-gray-500">Recibos das semanas antes da comissão por venda — marque como pago o que ainda estiver aberto.</span>
          </span>
          <RotateCcw size={16} className={`text-gray-400 transition-transform ${mostrarAntigo ? "rotate-180" : ""}`} />
        </button>
        {mostrarAntigo && <div className="px-5 pb-5"><PaginaPagamentosAdmin /></div>}
      </section>
    </div>
  );
}
