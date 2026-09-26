// Pagina Admin: PaginaMastersAdmin

import { Award } from "lucide-react";
import type { Cargo, Cliente } from "../types";
import { COMISSAO_MASTER_PROPRIA } from "../constantes";

// ─── Página Masters (somente Admin, somente leitura) ──────────────────────────

// Só existe Master dentro da equipe de um MasterPlus: quem promove é o
// próprio MasterPlus (na página "Promover a Master"), escolhendo um
// vendedor de destaque que ele mesmo cadastrou — o Admin não cria Master
// direto. Isso garante que todo Master sempre tenha um MasterPlus "dono",
// responsável por ele. Esta página é só para o Admin acompanhar quem são os
// Masters ativos e, se precisar, excluir algum (remover o cargo).
export function PaginaMastersAdmin({
  clientes,
  cargos,
  aoDefinirCargo,
  vinculosMasterPlus,
  comissaoEquipePct,
}: {
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
  vinculosMasterPlus: Record<string, string>;
  comissaoEquipePct: number;
}) {
  const emailsMasters = Object.keys(cargos).filter((e) => cargos[e] === "master");
  const masters = clientes.filter((c) => emailsMasters.includes(c.email.toLowerCase()));
  const nomeDe = (email: string) => clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <Award size={22} className="text-[#C8102E] flex-shrink-0" />
        <div>
          <div className="text-xl font-black text-gray-900">{masters.length}</div>
          <div className="text-[11px] text-gray-400 font-semibold">Masters ativos</div>
        </div>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-[12.5px] text-purple-700 leading-relaxed">
        Todo Master é promovido pelo próprio MasterPlus, a partir de um vendedor de destaque da
        equipe dele (página "Promover a Master"). O Master ganha{" "}
        {(COMISSAO_MASTER_PROPRIA * 100).toFixed(0)}% sobre as vendas próprias e{" "}
        {comissaoEquipePct}% sobre as vendas da sua equipe — se o MasterPlus que o promoveu perder
        o cargo, o Master perde o cargo junto.
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Masters cadastrados</h3>
        </div>
        {masters.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum Master cadastrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {masters.map((m) => {
              const masterPlusDele = vinculosMasterPlus[m.email.toLowerCase()];
              return (
                <div key={m.email} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                      {m.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-gray-800 truncate">{m.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {m.email}
                        {masterPlusDele && ` · equipe de ${nomeDe(masterPlusDele)}`}
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
