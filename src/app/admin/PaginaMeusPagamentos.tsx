// Pagina Admin: PaginaMeusPagamentos

import { useEffect, useState } from "react";
import { Wallet, Check, Clock, CalendarDays } from "lucide-react";
import { URL_BACKEND_PIX } from "../constantes";
import { formatarMoeda } from "../utils";
import { cabecalhosAdmin } from "../authToken";

// ─── Meus Pagamentos (vendedor) ───────────────────────────────────────────────
//
// Duas coisas, nesta ordem:
//   1. O que está sendo acumulado NESTA semana — sobe a cada venda e volta a
//      zero quando a semana vira. É o "score" do vendedor.
//   2. O histórico de semanas já fechadas, cada uma com o valor congelado, a
//      data da semana e se a loja já pagou.
//
// A semana vai de segunda a domingo. Quando ela termina, o servidor guarda o
// valor num recibo (tabela fechamentos_semana) e a semana nova começa zerada —
// o valor antigo não some, só sai do contador e entra no histórico.

export type Cargo = "vendedor" | "master" | "masterplus";

// As três partes que podem compor a comissão de uma semana. Vendedor só tem a
// primeira; Master tem as duas primeiras; MasterPlus tem as três.
type PartesDaComissao = {
  percentual: number;
  comissaoPropria: number;
  totalEquipe: number;
  percentualEquipe: number;
  comissaoEquipe: number;
  totalRepasse: number;
  percentualRepasse: number;
  comissaoRepasse: number;
  comissao: number;
};

export type FechamentoSemana = PartesDaComissao & {
  id: number;
  vendedor: string;
  vendedorNome: string | null;
  cargo: Cargo;
  semanaInicio: string; // "2026-09-08"
  semanaFim: string;
  totalVendido: number;
  qtdVendas: number;
  pago: boolean;
  pagoEm: string | null;
  pagoPor: string | null;
};

export type SemanaAberta = PartesDaComissao & {
  vendedor: string;
  cargo: Cargo;
  semanaInicio: string;
  semanaFim: string;
  totalVendido: number;
  qtdVendas: number;
  vendasTotais: number;
};

export const ROTULO_CARGO: Record<Cargo, string> = {
  vendedor: "Vendedor",
  master: "Master",
  masterplus: "MasterPlus",
};

// Quebra da comissão em linhas legíveis — usada no recibo do vendedor e na
// lista do Admin. Só devolve as partes que realmente valem alguma coisa, para
// o vendedor comum não ver linhas de equipe zeradas.
export function partesDaComissao(f: PartesDaComissao & { totalVendido: number }) {
  const partes: { rotulo: string; base: number; pct: number; valor: number }[] = [];
  if (f.comissaoPropria > 0 || f.totalVendido > 0) {
    partes.push({ rotulo: "Suas vendas", base: f.totalVendido, pct: f.percentual, valor: f.comissaoPropria });
  }
  if (f.comissaoEquipe > 0 || f.totalEquipe > 0) {
    partes.push({ rotulo: "Sua equipe", base: f.totalEquipe, pct: f.percentualEquipe, valor: f.comissaoEquipe });
  }
  if (f.comissaoRepasse > 0 || f.totalRepasse > 0) {
    partes.push({ rotulo: "Equipe dos seus Masters", base: f.totalRepasse, pct: f.percentualRepasse, valor: f.comissaoRepasse });
  }
  return partes;
}

// "2026-09-08" → "08/09"
export function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// "2026-09-08" → "08/09/2026"
export function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function PaginaMeusPagamentos() {
  const [semana, setSemana] = useState<SemanaAberta | null>(null);
  const [fechamentos, setFechamentos] = useState<FechamentoSemana[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`${URL_BACKEND_PIX}/api/fechamentos`, { headers: cabecalhosAdmin() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!vivo) return;
        setSemana(d.semanaAberta ?? null);
        setFechamentos(Array.isArray(d.fechamentos) ? d.fechamentos : []);
      })
      .catch(() => vivo && setErro("Não foi possível carregar seus pagamentos."))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, []);

  const aReceber = fechamentos.filter((f) => !f.pago);
  const totalAReceber = aReceber.reduce((soma, f) => soma + f.comissao, 0);
  const jaRecebido = fechamentos.filter((f) => f.pago).reduce((soma, f) => soma + f.comissao, 0);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-[3px] border-gray-200 border-t-[#C8102E] rounded-full animate-spin" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium px-4 py-3 rounded-xl">
        {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Semana em andamento — o contador que zera toda segunda */}
      {semana && (
        <div className="bg-white rounded-2xl border-2 border-[#C8102E]/15 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <Wallet size={20} className="text-[#C8102E]" />
              <div>
                <h3 className="font-black text-gray-900 text-[15px]">Esta semana</h3>
                <p className="text-[12px] text-gray-400">
                  {diaMes(semana.semanaInicio)} a {diaMes(semana.semanaFim)} · fecha domingo
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
              {ROTULO_CARGO[semana.cargo] ?? "Vendedor"}
            </span>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">A receber desta semana</div>
            <div className="text-3xl font-black text-[#A8102A] mt-1 leading-none">
              {formatarMoeda(semana.comissao)}
            </div>
            <div className="text-[11px] text-gray-400 mt-1.5">entra no histórico quando a semana fechar</div>
          </div>

          {/* De onde vem o valor. O vendedor vê uma linha só; o Master vê as
              vendas dele e as da equipe; o MasterPlus vê as três origens. */}
          <div className="px-5 pb-5">
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {partesDaComissao(semana).map((p, i) => (
                <div
                  key={p.rotulo}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] ${i > 0 ? "border-t border-gray-100" : ""}`}
                >
                  <span className="font-semibold text-gray-700">{p.rotulo}</span>
                  <span className="text-gray-400 text-[12px] flex-1 text-right truncate">
                    {formatarMoeda(p.base)} × {(p.pct * 100).toFixed(0)}%
                  </span>
                  <span className="font-black text-gray-900 tabular-nums">{formatarMoeda(p.valor)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border-t border-gray-100">
            <div className="p-4">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Suas vendas na semana</div>
              <div className="text-lg font-black text-gray-900 mt-1">{formatarMoeda(semana.totalVendido)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {semana.qtdVendas} {semana.qtdVendas === 1 ? "compra" : "compras"}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Suas vendas totais</div>
              <div className="text-lg font-black text-gray-900 mt-1">{formatarMoeda(semana.vendasTotais)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {semana.cargo === "vendedor" ? "é o que define sua faixa" : "percentual fixo no seu cargo"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resumo do que a loja deve e do que já pagou */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Clock size={22} className="text-amber-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-lg font-black text-gray-900">{formatarMoeda(totalAReceber)}</div>
            <div className="text-[12px] text-gray-400">
              aguardando pagamento
              {aReceber.length > 0 && ` · ${aReceber.length} ${aReceber.length === 1 ? "semana" : "semanas"}`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Check size={22} className="text-emerald-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-lg font-black text-gray-900">{formatarMoeda(jaRecebido)}</div>
            <div className="text-[12px] text-gray-400">já recebido</div>
          </div>
        </div>
      </div>

      {/* Histórico: uma linha por semana fechada */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Semanas fechadas</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Cada semana encerrada vira um recibo com o valor daquela semana. O valor não muda depois.
          </p>
        </div>

        {fechamentos.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarDays size={26} className="text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-400">
              Nenhuma semana fechada ainda. A primeira fecha no domingo.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {fechamentos.map((f) => (
              <div key={f.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800">
                      {dataBr(f.semanaInicio)} a {dataBr(f.semanaFim)}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {f.qtdVendas} {f.qtdVendas === 1 ? "compra sua" : "compras suas"}
                      {f.pago && f.pagoEm && ` · pago em ${dataBr(f.pagoEm.slice(0, 10))}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-gray-900 text-[15px] tabular-nums">
                      {formatarMoeda(f.comissao)}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap ${
                        f.pago ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {f.pago ? "PAGO" : "A RECEBER"}
                    </span>
                  </div>
                </div>

                {/* De onde veio o valor. Sempre a partir das partes reais —
                    nunca supondo que a origem é venda própria: numa semana em
                    que o Master não vendeu nada, mas a equipe dele vendeu, o
                    texto tem que falar da equipe, não de uma venda que não
                    existiu. */}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {partesDaComissao(f).map((p) => (
                    <span key={p.rotulo} className="text-[11px] text-gray-400">
                      {p.rotulo}: {formatarMoeda(p.base)} × {(p.pct * 100).toFixed(0)}% ={" "}
                      <span className="font-bold text-gray-600">{formatarMoeda(p.valor)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
