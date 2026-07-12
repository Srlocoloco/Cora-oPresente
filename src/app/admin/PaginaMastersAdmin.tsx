// Pagina Admin: PaginaMastersAdmin

import { useState } from "react";
import { Award } from "lucide-react";
import type { Cargo, Cliente } from "../types";
import { BONUS_CONVITE_VENDEDOR, EMAIL_ADMIN } from "../constantes";
import { formatarMoeda } from "../utils";

// ─── Página Masters (somente Admin) ───────────────────────────────────────────

// Só o Admin promove contas a Master. Cada Master tem sua própria equipe de
// vendedores (cadastro por código) — este cargo não pertence mais a uma conta
// fixa única, pode haver vários Masters ao mesmo tempo.
export function PaginaMastersAdmin({
  clientes,
  cargos,
  aoDefinirCargo,
  comissaoEquipePct,
}: {
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
  comissaoEquipePct: number;
}) {
  const [emailMaster, setEmailMaster] = useState("");
  const [erro, setErro] = useState("");

  const tornarMaster = () => {
    const chave = emailMaster.trim().toLowerCase();
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
    if (!cliente.viaGoogle) {
      setErro("Este e-mail precisa ter entrado com o login do Google para ser verificado.");
      return;
    }
    setErro("");
    aoDefinirCargo(chave, "master");
    setEmailMaster("");
  };

  const emailsMasters = Object.keys(cargos).filter((e) => cargos[e] === "master");
  const masters = clientes.filter((c) => emailsMasters.includes(c.email.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <Award size={22} className="text-[#C8102E] flex-shrink-0" />
        <div>
          <div className="text-xl font-black text-gray-900">{masters.length}</div>
          <div className="text-[11px] text-gray-400 font-semibold">Masters ativos</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Tornar Master</h3>
        <p className="text-[12px] text-gray-400 mb-3">
          Dá o cargo de Master a uma conta já cadastrada na loja com login do Google (e-mail
          verificado). O Master monta a própria equipe de vendedores, ganha 10% sobre as vendas
          próprias, {comissaoEquipePct}% sobre as vendas da equipe, bônus de{" "}
          {formatarMoeda(BONUS_CONVITE_VENDEDOR)} por vendedor ativado e bônus por bater metas de
          vendas próprias (Ouro e Diamante).
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={emailMaster}
            onChange={(e) => { setEmailMaster(e.target.value); setErro(""); }}
            placeholder="E-mail da conta"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={tornarMaster}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-5 py-3 rounded-xl transition-colors text-sm"
          >
            Tornar Master
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
          <h3 className="font-black text-gray-900 text-[15px]">Masters cadastrados</h3>
        </div>
        {masters.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum Master cadastrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {masters.map((m) => (
              <div key={m.email} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                    {m.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate">{m.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{m.email}</div>
                  </div>
                </div>
                <button
                  onClick={() => aoDefinirCargo(m.email, null)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 transition-all"
                >
                  Remover cargo
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
