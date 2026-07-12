// Componente CartaoNivelVendedor

import { Check, Award } from "lucide-react";
import { NIVEIS_VENDEDOR } from "../constantes";
import { obterNivelVendedor, bonusDeNivel, formatarMoeda } from "../utils";

// ─── Seller Level Card ────────────────────────────────────────────────────────

export function CartaoNivelVendedor({ vendasDoMes, vendasTotais = 0 }: { vendasDoMes: number; vendasTotais?: number }) {
  const indiceNivel = obterNivelVendedor(vendasDoMes);
  const nivelAtual = NIVEIS_VENDEDOR[indiceNivel];
  const proximoNivel = NIVEIS_VENDEDOR[indiceNivel + 1];

  const pctProgresso = proximoNivel
    ? Math.min(100, ((vendasDoMes - nivelAtual.min) / (nivelAtual.max - nivelAtual.min)) * 100)
    : 100;

  const valorFaltante = proximoNivel ? proximoNivel.min - vendasDoMes : 0;

  // Bônus de nível: pago uma vez, com base nas vendas totais (vitalícias)
  const bonusNivel = bonusDeNivel(vendasTotais);

  return (
    <div className={`bg-white rounded-2xl border-2 ${nivelAtual.border} shadow-sm overflow-hidden`}>
      {/* Header gradient */}
      <div className={`bg-gradient-to-r ${nivelAtual.bg} p-5 border-b border-gray-100`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Award size={36} style={{ color: nivelAtual.color }} />
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nível Atual</div>
              <div className="text-2xl font-black text-gray-900">{nivelAtual.name}</div>
              <div className="text-[12px] text-gray-600 font-medium">Comissão {nivelAtual.commission}</div>
            </div>
          </div>

          {/* Level icons */}
          <div className="flex items-center gap-1">
            {NIVEIS_VENDEDOR.map((level, i) => (
              <div key={level.name} className="flex items-center">
                <div className={`flex flex-col items-center ${i <= indiceNivel ? "opacity-100" : "opacity-30"}`}>
                  <div className={`${i === indiceNivel ? "scale-125" : ""} transition-transform`}>
                    <Award size={18} style={{ color: level.color }} />
                  </div>
                  <div className={`text-[9px] font-black mt-0.5 ${i === indiceNivel ? "text-gray-800" : "text-gray-400"}`}>
                    {level.name}
                  </div>
                </div>
                {i < NIVEIS_VENDEDOR.length - 1 && (
                  <div className={`w-6 h-0.5 mx-1 mb-4 rounded ${i < indiceNivel ? "bg-gray-800" : "bg-gray-300"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5">
        {bonusNivel > 0 && (
          <div className="mb-5 bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-2.5">
            <Award size={20} className="text-purple-600 flex-shrink-0" />
            <p className="text-[12px] text-purple-700 font-medium">
              Você já ganhou <span className="font-black">{formatarMoeda(bonusNivel)}</span> em bônus de nível ao
              atingir o nível {vendasTotais >= NIVEIS_VENDEDOR[3].min ? "Diamante" : "Ouro"} em vendas totais.
            </p>
          </div>
        )}
        {/* Progress to proximoBanner */}
        {proximoNivel && (
          <div className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-bold text-gray-600">
                Progresso para {proximoNivel.name}
              </span>
              <span className="text-[12px] font-black text-gray-900">{pctProgresso.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 relative overflow-hidden"
                style={{
                  width: `${pctProgresso}%`,
                  backgroundColor: nivelAtual.color,
                }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[11px] text-gray-500">{formatarMoeda(vendasDoMes)} este mês</span>
              <span className="text-[11px] font-bold text-emerald-600">
                Faltam apenas {formatarMoeda(valorFaltante)}!
              </span>
            </div>
          </div>
        )}

        {!proximoNivel && (
          <div className="mb-5 bg-cyan-50 border border-cyan-200 rounded-xl p-3 flex items-center gap-2">
            <Award size={22} className="text-cyan-500" />
            <div>
              <div className="font-black text-cyan-800 text-sm">Nível máximo atingido!</div>
              <div className="text-[11px] text-cyan-600">Você está no topo. Continue assim!</div>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
            Seus Benefícios — {nivelAtual.name}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {nivelAtual.benefits.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: nivelAtual.color + "33" }}
                >
                  <Check size={10} style={{ color: nivelAtual.color }} strokeWidth={3} />
                </div>
                <span className="text-[12px] text-gray-700 font-medium">{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next level preview */}
        {proximoNivel && (
          <div className="mt-4 bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[11px] font-bold text-gray-500 mb-2">
              Desbloqueie no {proximoNivel.name}:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {proximoNivel.benefits
                .filter((b) => !nivelAtual.benefits.includes(b))
                .map((b) => (
                  <span key={b} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                    + {b}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
