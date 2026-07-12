// Componente GraficoRede — árvore visual da rede de um Master/MasterPlus

import { Crown, Award, User, Star } from "lucide-react";
import { formatarMoeda } from "../utils";

// ─── Network Graph (org chart) ─────────────────────────────────────────────────

// Um nó da rede: pode ser o próprio MasterPlus/Master (raiz, sem comissaoParaVoce)
// ou alguém abaixo dele (Master promovido ou Vendedor).
export interface NoRede {
  nome: string;
  email: string;
  papel: "masterplus" | "master" | "vendedor";
  vendas: number; // vendas com o próprio código
  // Quanto esse nó gera de comissão para quem está vendo o gráfico (o pai
  // dele na árvore). Não aparece na raiz — ninguém paga comissão a si mesmo.
  comissaoParaVoce?: number;
  destaque?: boolean; // vendedor de destaque (top vendas), mostra a estrelinha
  filhos?: NoRede[];
}

const ROTULO_PAPEL: Record<NoRede["papel"], string> = {
  masterplus: "MasterPlus",
  master: "Master",
  vendedor: "Vendedor",
};

const ICONE_PAPEL: Record<NoRede["papel"], React.ReactNode> = {
  masterplus: <Crown size={13} />,
  master: <Award size={13} />,
  vendedor: <User size={13} />,
};

const ESTILO_PAPEL: Record<NoRede["papel"], string> = {
  masterplus: "bg-[#4A1218] text-white border border-[#4A1218]",
  master: "bg-[#C8102E] text-white border border-[#C8102E]",
  vendedor: "bg-white text-gray-800 border border-gray-200",
};

function CartaoNo({ no }: { no: NoRede }) {
  return (
    <div className={`rounded-2xl px-3.5 py-3 shadow-sm w-[168px] flex-shrink-0 ${ESTILO_PAPEL[no.papel]}`}>
      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide opacity-75">
        {ICONE_PAPEL[no.papel]}
        {ROTULO_PAPEL[no.papel]}
        {no.destaque && <Star size={11} className="fill-[#E8B84B] text-[#E8B84B] ml-auto flex-shrink-0" />}
      </div>
      <div className="text-[12.5px] font-bold leading-tight truncate mt-1.5">{no.nome}</div>
      <div className="text-[10px] opacity-60 truncate">{no.email}</div>
      <div className="text-[13px] font-black mt-2">{formatarMoeda(no.vendas)}</div>
      <div className="text-[9px] opacity-60 -mt-0.5">vendas próprias</div>
      {no.comissaoParaVoce !== undefined && no.comissaoParaVoce > 0 && (
        <div className="mt-2 text-[10.5px] font-black text-emerald-500 bg-white/15 rounded-lg px-2 py-1 inline-block">
          +{formatarMoeda(no.comissaoParaVoce)} p/ você
        </div>
      )}
    </div>
  );
}

function Ramo({ no }: { no: NoRede }) {
  const filhos = no.filhos ?? [];
  return (
    <div className="flex flex-col items-center">
      <CartaoNo no={no} />
      {filhos.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-5 bg-gray-300" />
          <div className="flex items-start gap-5">
            {filhos.map((filho) => (
              <Ramo key={filho.email} no={filho} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Soma recursiva de pessoas e vendas de toda a árvore (usado no resumo do topo)
function contarPessoas(no: NoRede): number {
  return 1 + (no.filhos ?? []).reduce((acum, f) => acum + contarPessoas(f), 0);
}
function somarVendas(no: NoRede): number {
  return no.vendas + (no.filhos ?? []).reduce((acum, f) => acum + somarVendas(f), 0);
}
function somarComissao(no: NoRede): number {
  return (
    (no.filhos ?? []).reduce(
      (acum, f) => acum + (f.comissaoParaVoce ?? 0) + somarComissao(f),
      0
    )
  );
}

export function GraficoRede({ raiz }: { raiz: NoRede }) {
  const pessoas = contarPessoas(raiz) - 1;
  const vendasRede = somarVendas(raiz);
  const comissaoTotal = somarComissao(raiz);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Sua rede</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {pessoas} pessoa{pessoas !== 1 ? "s" : ""} na rede · {formatarMoeda(vendasRede)} vendidos no total
            {comissaoTotal > 0 && ` · ${formatarMoeda(comissaoTotal)} de comissão de rede`}
          </p>
        </div>
      </div>
      {pessoas === 0 ? (
        <div className="py-12 text-center text-gray-400 text-[13px]">
          Sua rede ainda está vazia. Cadastre vendedores para ela começar a crescer.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="min-w-fit flex justify-center px-4">
            <Ramo no={raiz} />
          </div>
        </div>
      )}
    </div>
  );
}
