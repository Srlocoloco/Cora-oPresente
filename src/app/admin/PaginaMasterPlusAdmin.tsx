// Pagina Admin: PaginaMasterPlusAdmin

import { useState } from "react";
import { Crown } from "lucide-react";
import type { Cargo, Cliente } from "../types";
import { EMAIL_ADMIN, COMISSAO_MASTERPLUS_PROPRIA, COMISSAO_MASTERPLUS_EQUIPE, COMISSAO_MASTERPLUS_OVERRIDE } from "../constantes";

// ─── Página MasterPlus (somente Admin) ────────────────────────────────────────

// Só o Admin promove contas a MasterPlus — cargo acima do Master. O
// MasterPlus monta a própria equipe de vendedores (como um Master) e ainda
// pode promover um vendedor de destaque da própria equipe a Master.
export function PaginaMasterPlusAdmin({
  clientes,
  cargos,
  aoDefinirCargo,
  vinculosMasterPlus,
}: {
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
  vinculosMasterPlus: Record<string, string>;
}) {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");

  const tornarMasterPlus = () => {
    const chave = email.trim().toLowerCase();
    if (!chave) return;
    if (chave === EMAIL_ADMIN) {
      setErro("Este e-mail é reservado.");
      return;
    }
    const cliente = clientes.find((c) => c.email.toLowerCase() === chave);
    if (!cliente) {
      setErro("Este e-mail ainda não tem cadastro na loja.");
      return;
    }
    setErro("");
    aoDefinirCargo(chave, "masterplus");
    setEmail("");
  };

  const emailsMasterPlus = Object.keys(cargos).filter((e) => cargos[e] === "masterplus");
  const masterPlusList = clientes.filter((c) => emailsMasterPlus.includes(c.email.toLowerCase()));

  const nomeDe = (e: string) => clientes.find((c) => c.email.toLowerCase() === e)?.name ?? e;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <Crown size={22} className="text-[#4A1218] flex-shrink-0" />
        <div>
          <div className="text-xl font-black text-gray-900">{masterPlusList.length}</div>
          <div className="text-[11px] text-gray-400 font-semibold">MasterPlus ativos</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Tornar MasterPlus</h3>
        <p className="text-[12px] text-gray-400 mb-3">
          Dá o cargo de MasterPlus a uma conta já cadastrada na loja (login do Google ou cadastro
          manual). O MasterPlus monta a própria equipe de vendedores (como um Master) e ainda
          pode promover um vendedor de destaque da própria equipe a Master. Ganha{" "}
          {(COMISSAO_MASTERPLUS_PROPRIA * 100).toFixed(0)}% fixo sobre as próprias vendas (igual ao
          Master), mais {(COMISSAO_MASTERPLUS_EQUIPE * 100).toFixed(0)}% sobre a equipe própria e
          mais {(COMISSAO_MASTERPLUS_OVERRIDE * 100).toFixed(0)}% de repasse sobre a equipe de cada
          Master que promover.
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErro(""); }}
            placeholder="E-mail da conta"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={tornarMasterPlus}
            className="bg-[#4A1218] hover:bg-[#2E0B0F] text-white font-black px-5 py-3 rounded-xl transition-colors text-sm"
          >
            Tornar MasterPlus
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
          <h3 className="font-black text-gray-900 text-[15px]">MasterPlus cadastrados</h3>
        </div>
        {masterPlusList.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum MasterPlus cadastrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {masterPlusList.map((m) => {
              const mastersDele = Object.keys(vinculosMasterPlus).filter(
                (masterEmail) => vinculosMasterPlus[masterEmail] === m.email.toLowerCase() && cargos[masterEmail] === "master"
              );
              return (
                <div key={m.email} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#4A1218]/10 text-[#4A1218] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                      {m.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-gray-800 truncate">{m.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {m.email}
                        {mastersDele.length > 0 &&
                          ` · promoveu ${mastersDele.length} Master${mastersDele.length > 1 ? "s" : ""}: ${mastersDele.map(nomeDe).join(", ")}`}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => aoDefinirCargo(m.email, null)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 transition-all flex-shrink-0"
                  >
                    Remover cargo
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
