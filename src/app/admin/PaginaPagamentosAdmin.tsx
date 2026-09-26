// Pagina Admin: PaginaPagamentosAdmin

import { useEffect, useState } from "react";
import { Check, Clock, Undo2, Wallet } from "lucide-react";
import { URL_BACKEND_PIX } from "../constantes";
import { formatarMoeda } from "../utils";
import { cabecalhosAdmin } from "../authToken";
import { dataBr, diaMes, partesDaComissao, ROTULO_CARGO, type FechamentoSemana, type SemanaAberta } from "./PaginaMeusPagamentos";

// ─── Pagamentos dos vendedores (Admin) ────────────────────────────────────────
//
// A lista de quem precisa receber, semana a semana. O botão "Marcar como pago"
// grava na hora no banco — e é essa mesma marca que o vendedor enxerga no
// painel dele, sem ninguém precisar avisar nada.
//
// Marcar é reversível (dá para desmarcar se clicou errado), e toda marcação e
// desmarcação fica registrada no log de auditoria do Admin.

export function PaginaPagamentosAdmin() {
  const [fechamentos, setFechamentos] = useState<FechamentoSemana[]>([]);
  const [emAberto, setEmAberto] = useState<SemanaAberta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"pendentes" | "pagos" | "todos">("pendentes");

  const carregar = () => {
    setCarregando(true);
    setErro("");
    fetch(`${URL_BACKEND_PIX}/api/fechamentos`, { headers: cabecalhosAdmin() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setFechamentos(Array.isArray(d.fechamentos) ? d.fechamentos : []);
        setEmAberto(Array.isArray(d.emAberto) ? d.emAberto : []);
      })
      .catch(() => setErro("Não foi possível carregar os pagamentos."))
      .finally(() => setCarregando(false));
  };

  useEffect(carregar, []);

  const marcar = async (f: FechamentoSemana, pago: boolean) => {
    setSalvando(f.id);
    setErro("");
    try {
      const r = await fetch(`${URL_BACKEND_PIX}/api/fechamentos/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...cabecalhosAdmin() },
        body: JSON.stringify({ pago }),
      });
      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        setErro(corpo?.erro ?? "Não foi possível registrar o pagamento.");
        return;
      }
      // Atualiza a linha na tela na hora, sem recarregar tudo.
      setFechamentos((atual) =>
        atual.map((x) =>
          x.id === f.id
            ? { ...x, pago, pagoEm: pago ? new Date().toISOString() : null }
            : x
        )
      );
    } catch {
      setErro("Sem conexão com o servidor. Nada foi alterado.");
    } finally {
      setSalvando(null);
    }
  };

  const pendentes = fechamentos.filter((f) => !f.pago);
  const totalPendente = pendentes.reduce((soma, f) => soma + f.comissao, 0);
  const totalSemanaCorrente = emAberto.reduce((soma, s) => soma + s.comissao, 0);

  const visiveis =
    filtro === "pendentes" ? pendentes
    : filtro === "pagos" ? fechamentos.filter((f) => f.pago)
    : fechamentos;

  const nomeDe = (f: FechamentoSemana) => f.vendedorNome || f.vendedor;

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-[3px] border-gray-200 border-t-[#C8102E] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Clock size={22} className="text-amber-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-lg font-black text-gray-900">{formatarMoeda(totalPendente)}</div>
            <div className="text-[12px] text-gray-400">
              a pagar · {pendentes.length} {pendentes.length === 1 ? "semana fechada" : "semanas fechadas"}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Wallet size={22} className="text-[#C8102E] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-lg font-black text-gray-900">{formatarMoeda(totalSemanaCorrente)}</div>
            <div className="text-[12px] text-gray-400">acumulando na semana atual (ainda não fechou)</div>
          </div>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium px-4 py-3 rounded-xl">
          {erro}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          ["pendentes", "A pagar", pendentes.length],
          ["pagos", "Pagos", fechamentos.length - pendentes.length],
          ["todos", "Todos", fechamentos.length],
        ] as const).map(([id, rotulo, qtd]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors flex items-center gap-1.5 ${
              filtro === id
                ? "bg-[#C8102E] text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
            }`}
          >
            {rotulo}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${filtro === id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {qtd}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Pagamento semanal dos vendedores</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Cada linha é uma semana encerrada. Ao marcar como pago, o vendedor vê a mudança no painel dele.
          </p>
        </div>

        {visiveis.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-gray-400">
            {filtro === "pendentes"
              ? "Nenhum pagamento pendente. Tudo em dia."
              : "Nada por aqui ainda."}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visiveis.map((f) => (
              <div key={f.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                    {nomeDe(f)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate">{nomeDe(f)}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      <span className="font-bold text-gray-500">{ROTULO_CARGO[f.cargo] ?? "Vendedor"}</span>{" · "}
                      {diaMes(f.semanaInicio)} a {diaMes(f.semanaFim)}
                      {f.pago && f.pagoEm && ` · pago em ${dataBr(f.pagoEm.slice(0, 10))}`}
                    </div>
                    {/* De onde veio o valor — é o que deixa o Master conferir
                        a parte da equipe sem precisar perguntar. */}
                    <div className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                      {partesDaComissao(f).map((parte) => (
                        <span key={parte.rotulo}>
                          {parte.rotulo}: {formatarMoeda(parte.base)} × {(parte.pct * 100).toFixed(0)}% ={" "}
                          <span className="font-bold text-gray-600">{formatarMoeda(parte.valor)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-black text-gray-900 text-[15px] tabular-nums">
                    {formatarMoeda(f.comissao)}
                  </span>
                  {f.pago ? (
                    <button
                      onClick={() => marcar(f, false)}
                      disabled={salvando === f.id}
                      title="Desfazer — marca de volta como a pagar"
                      className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 disabled:opacity-50 transition-colors"
                    >
                      <Undo2 size={13} />
                      Desfazer
                    </button>
                  ) : (
                    <button
                      onClick={() => marcar(f, true)}
                      disabled={salvando === f.id}
                      className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60 transition-colors"
                    >
                      {salvando === f.id ? (
                        <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Marcar como pago
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
