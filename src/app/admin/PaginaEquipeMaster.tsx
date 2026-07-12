// Pagina Admin: PaginaEquipeMaster

import { useState } from "react";
import { ShoppingBag, Check } from "lucide-react";
import type { Cargo, Recrutamento, Cliente } from "../types";
import { BONUS_NIVEL_OURO, BONUS_NIVEL_DIAMANTE, EMAIL_ADMIN } from "../constantes";
import { formatarMoeda } from "../utils";

// ─── Página Equipe & Cargos (Master) ──────────────────────────────────────────

// O Master dá ou remove o cargo de Vendedor dos usuários cadastrados.
export function PaginaEquipeMaster({
  clientes,
  cargos,
  aoDefinirCargo,
  recrutamentos,
}: {
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
  recrutamentos: Recrutamento[];
}) {
  // Dar cargo direto por e-mail — alternativa ao cadastro por código em Meus
  // Vendedores, para quem já é cliente da loja e só precisa virar Vendedor
  const [emailCargo, setEmailCargo] = useState("");
  const [erroCargo, setErroCargo] = useState("");

  // Só dá cargo a quem já é cliente cadastrado no site E entrou com o login
  // real do Google (e-mail verificado pela própria Google, não digitado à mão)
  const darCargoPorEmail = () => {
    const chave = emailCargo.trim().toLowerCase();
    if (!chave) return;
    if (chave === EMAIL_ADMIN) {
      setErroCargo("Este e-mail é reservado.");
      return;
    }
    const cliente = clientes.find((c) => c.email.toLowerCase() === chave);
    if (!cliente) {
      setErroCargo("Este e-mail ainda não tem cadastro na loja.");
      return;
    }
    if (!cliente.viaGoogle) {
      setErroCargo("Este e-mail precisa ter entrado com o login do Google para ser verificado.");
      return;
    }
    setErroCargo("");
    aoDefinirCargo(chave, "vendedor");
    setEmailCargo("");
  };

  const totalVendedores = Object.values(cargos).filter((c) => c === "vendedor").length;
  const vinculosAtivos = recrutamentos.filter((r) => r.ativado).length;

  // Na lista de cargos aparecem SOMENTE as pessoas que se cadastraram
  // com um código de vendedor válido (vínculo ativado pelo código)
  const emailsAtivados = new Set(
    recrutamentos.filter((r) => r.ativado).map((r) => r.email.toLowerCase())
  );
  const usuariosDaEquipe = clientes.filter((c) => emailsAtivados.has(c.email.toLowerCase()));

  const cartoes = [
    { label: "Vendedores", valor: totalVendedores, icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
    { label: "Vínculos ativos", valor: vinculosAtivos, icone: <Check size={22} className="text-emerald-600" /> },
  ];

  const opcoesCargo: { valor: Cargo | null; label: string }[] = [
    { valor: "vendedor", label: "Vendedor" },
    { valor: null, label: "Sem cargo" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div>
              <div className="text-xl font-black text-gray-900">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Dar cargo por e-mail</h3>
        <p className="text-[12px] text-gray-400 mb-3">
          Dá o cargo de Vendedor a uma conta já cadastrada na loja com login do Google (e-mail verificado).
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={emailCargo}
            onChange={(e) => { setEmailCargo(e.target.value); setErroCargo(""); }}
            placeholder="E-mail da conta"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={darCargoPorEmail}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-5 py-3 rounded-xl transition-colors text-sm"
          >
            Tornar Vendedor
          </button>
        </div>
        {erroCargo && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erroCargo}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Usuários e cargos</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Somente quem se cadastrou com um código de vendedor válido aparece aqui. Vendedor divulga os produtos da loja com o código de venda pessoal e ganha comissão pelo próprio nível (4% a 10%), além de um bônus de nível: {formatarMoeda(BONUS_NIVEL_OURO)} ao atingir o nível Ouro e {formatarMoeda(BONUS_NIVEL_DIAMANTE)} ao atingir o nível Diamante.
          </p>
        </div>
        {usuariosDaEquipe.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Ninguém se cadastrou com código de vendedor ainda — quem ativar a conta com um código válido aparecerá aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3.5 font-semibold">Usuário</th>
                  <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Desde</th>
                  <th className="text-left px-5 py-3.5 font-semibold">Cargo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usuariosDaEquipe.map((c) => {
                  const cargoAtual = cargos[c.email.toLowerCase()] ?? null;
                  return (
                    <tr key={c.email} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                            {c.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-800 truncate">{c.name}</div>
                            <div className="text-[11px] text-gray-400 truncate">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[12px] text-gray-400 hidden md:table-cell">{c.since}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {opcoesCargo.map((op) => (
                            <button
                              key={op.label}
                              onClick={() => aoDefinirCargo(c.email, op.valor)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all ${
                                cargoAtual === op.valor
                                  ? "border-[#C8102E] bg-red-50 text-[#C8102E]"
                                  : "border-gray-200 text-gray-500 hover:border-gray-300"
                              }`}
                            >
                              {op.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
