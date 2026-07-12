// Pagina Admin: PaginaCuponsAdmin

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Cupom } from "../types";

// ─── Página Cupons (Admin) ────────────────────────────────────────────────────

// Criação e gestão dos cupons de desconto usados no carrinho
export function PaginaCuponsAdmin({
  cupons,
  aoSalvar,
  aoExcluir,
}: {
  cupons: Cupom[];
  aoSalvar: (c: Cupom) => void;
  aoExcluir: (codigo: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [percentual, setPercentual] = useState("10");
  const [validade, setValidade] = useState("");
  const [erro, setErro] = useState("");

  const criar = () => {
    const cod = codigo.trim().toUpperCase();
    const pct = Number(percentual);
    if (!cod) { setErro("Informe o código do cupom."); return; }
    if (cupons.some((c) => c.codigo === cod)) { setErro("Já existe um cupom com este código."); return; }
    if (!pct || pct < 1 || pct > 90) { setErro("O desconto deve ser entre 1% e 90%."); return; }
    if (!validade) { setErro("Informe a data de validade."); return; }
    aoSalvar({ codigo: cod, percentual: pct, validade, ativo: true, usos: 0 });
    setErro("");
    setCodigo("");
    setPercentual("10");
    setValidade("");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Criar cupom</h3>
        <p className="text-[12px] text-gray-400 mb-4">O cliente digita o código no carrinho e ganha o desconto sobre o subtotal.</p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código (ex.: BEMVINDO10)"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
          />
          <div className="flex items-center gap-1.5">
            <input
              value={percentual}
              onChange={(e) => setPercentual(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              className="w-20 border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors text-center"
            />
            <span className="text-[13px] font-bold text-gray-500">% off</span>
          </div>
          <input
            type="date"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={criar}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            Criar
          </button>
        </div>
        {erro && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erro}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Cupons ({cupons.length})</h3>
        </div>
        {cupons.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum cupom criado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {cupons.map((c) => {
              const expirado = new Date(c.validade + "T23:59:59") < new Date();
              return (
                <div key={c.codigo} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-black text-[#C8102E]">{c.codigo}</span>
                      <span className="text-[13px] font-bold text-gray-800">{c.percentual}% off</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          expirado
                            ? "bg-gray-100 text-gray-500"
                            : c.ativo
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {expirado ? "EXPIRADO" : c.ativo ? "ATIVO" : "PAUSADO"}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · {c.usos} {c.usos === 1 ? "uso" : "usos"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!expirado && (
                      <button
                        onClick={() => aoSalvar({ ...c, ativo: !c.ativo })}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border-2 transition-colors ${
                          c.ativo
                            ? "border-gray-200 text-gray-500 hover:border-gray-300"
                            : "border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {c.ativo ? "Pausar" : "Reativar"}
                      </button>
                    )}
                    <button
                      onClick={() => aoExcluir(c.codigo)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
