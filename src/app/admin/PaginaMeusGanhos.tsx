// Pagina Admin: PaginaMeusGanhos (vendedor, Master e MasterPlus)
//
// O "extrato" de cada associado, como no Mercado Pago:
//   • quanto está DISPONÍVEL (entra no próximo repasse), quanto está A LIBERAR
//     (pedido entregue, contando o prazo de arrependimento), quanto espera a
//     entrega e quanto JÁ CAIU na conta;
//   • a conta onde ele recebe — conta salário Sicredi (folha de pagamento),
//     conta Sicredi ou outra conta com chave PIX;
//   • cada venda que gerou comissão, com o percentual e a situação;
//   • cada repasse feito, com a data e para onde foi.

import { useEffect, useState } from "react";
import { Clock, Truck, CheckCircle2, Landmark, Pencil, Loader2, AlertCircle, Info, ShieldCheck, ArrowDownToLine } from "lucide-react";
import type { Cargo } from "../types";
import { api } from "../api";
import { formatarMoeda, formatarCpf } from "../utils";
import { type RegrasComissao, explicacaoDoCargo, pct } from "../comissoes";
import { PaginaMeusPagamentos } from "./PaginaMeusPagamentos";

interface Saldo { aguardandoEntrega: number; aLiberar: number; disponivel: number; emRepasse: number; recebido: number }
interface Comissao {
  id: number; pedidoId: string; tipo: "venda" | "equipe" | "repasse" | "estorno"; origem: string | null; descricao: string | null;
  base: number; percentual: number; valor: number; status: string; liberaEm: string | null; criadoEm: string;
}
interface Repasse {
  id: number; valor: number; qtdComissoes: number; metodo: string; status: string; ocorrencia: string | null;
  criadoEm: string; pagoEm: string | null; destinoResumo: string;
}
interface DadosRecebimento {
  titular: string; cpf: string; banco: string; bancoNome: string | null; agencia: string; conta: string; contaDigito: string;
  tipoConta: "salario" | "corrente" | "poupanca"; tipoChavePix: string | null; chavePix: string | null; metodo: string;
}

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

const STATUS_COMISSAO: Record<string, { rotulo: string; cor: string }> = {
  aguardando_entrega: { rotulo: "Aguardando entrega", cor: "bg-gray-100 text-gray-600" },
  a_liberar: { rotulo: "A liberar", cor: "bg-amber-50 text-amber-700" },
  disponivel: { rotulo: "Disponível", cor: "bg-emerald-50 text-emerald-700" },
  em_repasse: { rotulo: "Em pagamento", cor: "bg-sky-50 text-sky-700" },
  paga: { rotulo: "Paga", cor: "bg-emerald-600 text-white" },
  cancelada: { rotulo: "Cancelada", cor: "bg-red-50 text-red-600" },
};
const STATUS_REPASSE: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Preparando pagamento", cor: "bg-amber-50 text-amber-700" },
  no_banco: { rotulo: "Enviado ao banco", cor: "bg-sky-50 text-sky-700" },
  pago: { rotulo: "Pago", cor: "bg-emerald-600 text-white" },
  falhou: { rotulo: "Recusado pelo banco", cor: "bg-red-50 text-red-600" },
  cancelado: { rotulo: "Cancelado", cor: "bg-gray-100 text-gray-500" },
};
const TIPO_COMISSAO: Record<string, string> = { venda: "Sua venda", equipe: "Sua equipe/rede", repasse: "Rede de um Master seu", estorno: "Estorno" };

export function PaginaMeusGanhos({ cargo, regras }: { cargo: Cargo; regras: RegrasComissao }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [dias, setDias] = useState(7);
  const [minimo, setMinimo] = useState(10);
  const [conta, setConta] = useState<DadosRecebimento | null>(null);
  const [bancos, setBancos] = useState<Record<string, string>>({});
  const [editandoConta, setEditandoConta] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const [g, c] = await Promise.all([api("/api/ganhos"), api("/api/recebimento")]);
    setCarregando(false);
    if (!g.ok) return setErro(g.erro ?? "Não foi possível carregar seus ganhos.");
    setSaldo(g.dados.saldo);
    setComissoes(g.dados.comissoes ?? []);
    setRepasses(g.dados.repasses ?? []);
    setDias(g.dados.diasLiberacao ?? 7);
    setMinimo(g.dados.valorMinimo ?? 10);
    if (c.ok) {
      setConta(c.dados?.dados ?? null);
      setBancos(c.dados?.bancos ?? {});
      if (!c.dados?.dados) setEditandoConta(true);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  if (carregando && !saldo) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-[#C8102E]" />
      </div>
    );
  }
  if (erro) {
    return <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium px-4 py-3 rounded-xl">{erro}</div>;
  }

  return (
    <div className="space-y-4 max-w-[980px]">
      <div className="painel px-4 py-3 text-[13.5px] text-gray-700 flex gap-2.5 leading-relaxed">
        <Info size={17} className="flex-shrink-0 mt-0.5 text-gray-400" />
        <span>{explicacaoDoCargo(cargo, regras)}</span>
      </div>

      {/* Saldo */}
      {saldo && (
        <section className="painel overflow-hidden">
          <div className="p-5 md:p-6 border-b border-black/[0.08]">
            <p className="text-[14px] text-gray-500">Disponível para o próximo repasse</p>
            <p className={`text-[36px] leading-tight mt-1 tabular-nums ${saldo.disponivel < 0 ? "text-[#C8102E]" : "text-gray-900"}`}>
              {saldo.disponivel < 0 ? `- ${formatarMoeda(-saldo.disponivel)}` : formatarMoeda(saldo.disponivel)}
            </p>
            {saldo.disponivel < 0 && (
              <p className="text-[13px] text-[#C8102E]">Um pedido pago foi cancelado: este valor é descontado das próximas comissões.</p>
            )}
            <p className="text-[13.5px] text-gray-500 mt-1">
              {saldo.disponivel >= minimo
                ? "Entra no próximo pagamento da loja, direto na sua conta."
                : `Os pagamentos saem a partir de ${formatarMoeda(minimo)} acumulados.`}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-black/[0.08]">
            {[
              { rotulo: "A liberar", valor: saldo.aLiberar, icone: <Clock size={16} className="text-amber-600" />, ajuda: dias === 0 ? "entregues, liberando agora" : `entregues há menos de ${dias} ${dias === 1 ? "dia" : "dias"}` },
              { rotulo: "Aguardando entrega", valor: saldo.aguardandoEntrega, icone: <Truck size={16} className="text-gray-500" />, ajuda: "pedidos pagos, ainda não entregues" },
              { rotulo: "Em pagamento", valor: saldo.emRepasse, icone: <ArrowDownToLine size={16} className="text-sky-600" />, ajuda: "já enviado ao banco" },
              { rotulo: "Já recebido", valor: saldo.recebido, icone: <CheckCircle2 size={16} className="text-emerald-600" />, ajuda: "caiu na sua conta" },
            ].map((c) => (
              <div key={c.rotulo} className="bg-white p-4">
                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">{c.icone}{c.rotulo}</div>
                <div className="text-[19px] text-gray-900 tabular-nums mt-1">{formatarMoeda(c.valor)}</div>
                <div className="text-[12px] text-gray-400">{c.ajuda}</div>
              </div>
            ))}
          </div>
          <p className="px-5 py-3 border-t border-black/[0.08] text-[13px] text-gray-500">
            Como funciona: a comissão nasce quando o cliente paga, é liberada {dias === 0 ? "assim que" : `${dias} dia(s) depois que`} o pedido é entregue
            e entra no próximo repasse da loja. Se um pedido for cancelado, a comissão dele é cancelada (ou descontada do próximo repasse, se já tiver sido paga).
          </p>
        </section>
      )}

      {/* Conta para receber */}
      <section className="painel p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-red-50 text-[#C8102E] flex items-center justify-center flex-shrink-0"><Landmark size={18} /></span>
            <div>
              <h3 className="font-bold text-gray-900 text-[15px]">Conta para receber</h3>
              <p className="text-[12px] text-gray-500">O dinheiro sai da conta da loja direto para esta conta.</p>
            </div>
          </div>
          {conta && !editandoConta && (
            <button onClick={() => setEditandoConta(true)} className="text-[12.5px] font-bold text-[#C8102E] hover:underline flex items-center gap-1">
              <Pencil size={13} /> Alterar
            </button>
          )}
        </div>
        {!conta && !editandoConta ? null : editandoConta ? (
          <FormularioConta
            inicial={conta}
            bancos={bancos}
            aoCancelar={conta ? () => setEditandoConta(false) : undefined}
            aoSalvo={(d) => { setConta(d); setEditandoConta(false); }}
          />
        ) : conta ? (
          <div className="rounded-xl border border-gray-200 p-4 grid gap-1 text-[13px] text-gray-700">
            <p><span className="text-gray-500">Titular:</span> <span className="font-bold">{conta.titular}</span> · CPF {formatarCpf(conta.cpf).replace(/^\d{3}\.\d{3}/, "•••.•••")}</p>
            <p>
              <span className="text-gray-500">Conta:</span> {conta.bancoNome ?? `Banco ${conta.banco}`} · agência {conta.agencia} · {conta.tipoConta === "salario" ? "conta salário" : conta.tipoConta === "poupanca" ? "poupança" : "conta corrente"} {conta.conta}-{conta.contaDigito}
            </p>
            {conta.chavePix && <p><span className="text-gray-500">Chave PIX:</span> {conta.chavePix}</p>}
            <p className="text-[12px] text-emerald-700 font-semibold mt-1 flex items-center gap-1.5">
              <ShieldCheck size={14} />
              {conta.metodo === "folha" ? "Você recebe pela folha de pagamento do Sicredi." : conta.metodo === "pix" ? "Você recebe por PIX, nesta chave." : "Você recebe por crédito direto na sua conta Sicredi."}
            </p>
          </div>
        ) : null}
      </section>

      {/* Extrato */}
      <section className="painel overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-[15px]">Comissão de cada venda</h3>
          <p className="text-[12px] text-gray-500">A comissão fica congelada no dia do pagamento do cliente.</p>
        </div>
        {comissoes.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-gray-400">Nenhuma venda com comissão ainda. Divulgue seu código de venda!</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {comissoes.map((c) => {
              const st = STATUS_COMISSAO[c.status] ?? { rotulo: c.status, cor: "bg-gray-100 text-gray-600" };
              return (
                <li key={c.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 line-clamp-1">{c.descricao ?? TIPO_COMISSAO[c.tipo]}</p>
                    <p className="text-[13px] text-gray-500">
                      {dataBr(c.criadoEm)} · pedido {c.pedidoId} · {TIPO_COMISSAO[c.tipo] ?? c.tipo}
                      {c.tipo !== "estorno" && ` · ${pct(c.percentual)} de ${formatarMoeda(c.base)}`}
                    </p>
                    <span className={`inline-block mt-1 text-[12px] font-bold px-2 py-0.5 rounded-sm ${st.cor}`}>
                      {st.rotulo}{c.status === "a_liberar" && c.liberaEm ? ` em ${dataBr(c.liberaEm)}` : ""}
                    </span>
                  </div>
                  <span className={`text-[14px] font-bold tabular-nums flex-shrink-0 ${c.valor < 0 ? "text-red-600" : c.status === "cancelada" ? "text-gray-300 line-through" : "text-gray-900"}`}>
                    {c.valor < 0 ? "- " : ""}{formatarMoeda(Math.abs(c.valor))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Repasses */}
      <section className="painel overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-[15px]">Pagamentos recebidos</h3>
        </div>
        {repasses.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-gray-400">Nenhum pagamento ainda.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {repasses.map((r) => {
              const st = STATUS_REPASSE[r.status] ?? { rotulo: r.status, cor: "bg-gray-100" };
              return (
                <li key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800">
                      Repasse #{r.id} · {r.qtdComissoes} {r.qtdComissoes === 1 ? "comissão" : "comissões"}
                    </p>
                    <p className="text-[13px] text-gray-500">
                      {r.pagoEm ? `Pago em ${dataBr(r.pagoEm)}` : `Criado em ${dataBr(r.criadoEm)}`} · {r.destinoResumo}
                    </p>
                    {r.status === "falhou" && r.ocorrencia && (
                      <p className="text-[13px] text-red-600 mt-0.5 flex items-center gap-1"><AlertCircle size={12} /> {r.ocorrencia} — confira sua conta acima.</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[14px] font-bold text-gray-900 tabular-nums">{formatarMoeda(r.valor)}</p>
                    <span className={`inline-block text-[12px] font-bold px-2 py-0.5 rounded-sm ${st.cor}`}>{st.rotulo}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recibos do sistema antigo (semana a semana), se houver */}
      <PaginaMeusPagamentos somenteHistorico />
    </div>
  );
}

// ─── Formulário da conta ──────────────────────────────────────────────────────
function FormularioConta({
  inicial,
  bancos,
  aoCancelar,
  aoSalvo,
}: {
  inicial: DadosRecebimento | null;
  bancos: Record<string, string>;
  aoCancelar?: () => void;
  aoSalvo: (d: DadosRecebimento) => void;
}) {
  const [f, setF] = useState({
    titular: inicial?.titular ?? "",
    cpf: inicial ? formatarCpf(inicial.cpf) : "",
    tipoConta: (inicial?.tipoConta ?? "salario") as DadosRecebimento["tipoConta"],
    banco: inicial?.banco ?? "748",
    agencia: inicial?.agencia ?? "",
    conta: inicial?.conta ?? "",
    contaDigito: inicial?.contaDigito ?? "",
    tipoChavePix: inicial?.tipoChavePix ?? "",
    chavePix: inicial?.chavePix ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const muda = (campo: keyof typeof f, v: string) => { setF((x) => ({ ...x, [campo]: v })); setErro(""); };
  const salario = f.tipoConta === "salario";
  const pixObrigatorio = !salario && (f.banco !== "748" || f.tipoConta === "poupanca");

  const salvar = async () => {
    setSalvando(true);
    const r = await api<{ dados: DadosRecebimento }>("/api/recebimento", {
      metodo: "PUT",
      corpo: { ...f, banco: salario ? "748" : f.banco, tipoChavePix: f.chavePix.trim() ? f.tipoChavePix : "", chavePix: f.chavePix.trim() },
    });
    setSalvando(false);
    if (!r.ok || !r.dados?.dados) return setErro(r.erro ?? "Não foi possível salvar.");
    aoSalvo(r.dados.dados);
  };

  const campo = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10";
  const rot = "block text-[12px] font-semibold text-gray-600 mb-1";
  const ordemBancos = Object.entries(bancos).sort(([a], [b]) => (a === "748" ? -1 : b === "748" ? 1 : 0));

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Tipo de conta" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {([
          ["salario", "Conta salário Sicredi", "pela folha de pagamento"],
          ["corrente", "Conta corrente", "Sicredi ou outro banco"],
          ["poupanca", "Poupança", "precisa de chave PIX"],
        ] as const).map(([id, titulo, sub]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={f.tipoConta === id}
            onClick={() => muda("tipoConta", id)}
            className={`text-left border-2 rounded-xl px-3 py-2.5 ${f.tipoConta === id ? "border-[#C8102E] bg-red-50/40" : "border-gray-200 hover:border-gray-300"}`}
          >
            <span className="block text-[13px] font-bold text-gray-900">{titulo}</span>
            <span className="block text-[12.5px] text-gray-500">{sub}</span>
          </button>
        ))}
      </div>
      {salario && (
        <p className="text-[13px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          Conta salário só recebe o crédito da empresa pela folha de pagamento (regra do Banco Central — ela não aceita PIX de terceiros). Por isso precisa ser uma conta salário do Sicredi, aberta pela loja com a cooperativa.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={rot} htmlFor="titular">Nome completo do titular</label>
          <input id="titular" value={f.titular} onChange={(e) => muda("titular", e.target.value)} className={campo} autoComplete="name" />
        </div>
        <div>
          <label className={rot} htmlFor="cpf">CPF do titular</label>
          <input id="cpf" value={f.cpf} onChange={(e) => muda("cpf", formatarCpf(e.target.value))} inputMode="numeric" className={campo} placeholder="000.000.000-00" />
        </div>
        <div className="sm:col-span-2">
          <label className={rot} htmlFor="banco">Banco</label>
          <select id="banco" value={salario ? "748" : f.banco} disabled={salario} onChange={(e) => muda("banco", e.target.value)} className={`${campo} bg-white disabled:bg-gray-50`}>
            {ordemBancos.map(([codigo, nome]) => <option key={codigo} value={codigo}>{codigo} — {nome}</option>)}
            {!bancos[f.banco] && f.banco && <option value={f.banco}>{f.banco}</option>}
          </select>
        </div>
        <div>
          <label className={rot} htmlFor="agencia">Agência <span className="font-normal text-gray-400">(sem dígito)</span></label>
          <input id="agencia" value={f.agencia} onChange={(e) => muda("agencia", e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className={campo} />
        </div>
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <div>
            <label className={rot} htmlFor="conta">Conta</label>
            <input id="conta" value={f.conta} onChange={(e) => muda("conta", e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" className={campo} />
          </div>
          <div>
            <label className={rot} htmlFor="digito">Dígito</label>
            <input id="digito" value={f.contaDigito} onChange={(e) => muda("contaDigito", e.target.value.replace(/[^0-9xX]/g, "").slice(0, 1).toUpperCase())} className={campo} />
          </div>
        </div>
      </div>
      {!salario && (
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
          <div>
            <label className={rot} htmlFor="tipo-chave">Chave PIX {pixObrigatorio ? "" : <span className="font-normal text-gray-400">(opcional)</span>}</label>
            <select id="tipo-chave" value={f.tipoChavePix} onChange={(e) => muda("tipoChavePix", e.target.value)} className={`${campo} bg-white`}>
              <option value="">Tipo da chave</option>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="telefone">Celular</option>
              <option value="aleatoria">Chave aleatória</option>
            </select>
          </div>
          <div>
            <label className={rot} htmlFor="chave">&nbsp;</label>
            <input id="chave" value={f.chavePix} onChange={(e) => muda("chavePix", e.target.value)} className={campo} placeholder="A chave desta mesma conta" />
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="flex items-start gap-2 text-[12.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={salvar} disabled={salvando} className="bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2">
          {salvando && <Loader2 size={15} className="animate-spin" />} Salvar conta
        </button>
        {aoCancelar && (
          <button onClick={aoCancelar} className="border-2 border-gray-200 text-gray-600 font-bold px-5 py-2.5 rounded-xl">Cancelar</button>
        )}
      </div>
      <p className="text-[12.5px] text-gray-400 flex items-center gap-1.5">
        <ShieldCheck size={13} /> Só você e o administrador da loja veem estes dados. Toda troca de conta é avisada por e-mail.
      </p>
    </div>
  );
}

