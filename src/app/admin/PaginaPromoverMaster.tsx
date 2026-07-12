// Pagina Admin: PaginaPromoverMaster (MasterPlus)

import { useState } from "react";
import { Star, Award, ArrowUpCircle } from "lucide-react";
import type { Cargo, Recrutamento, Cliente, Pedido } from "../types";
import { COMISSAO_MASTERPLUS_OVERRIDE } from "../constantes";
import { totalVendidoPor, formatarMoeda } from "../utils";

// ─── Página Promover a Master (MasterPlus) ────────────────────────────────────

// O MasterPlus só pode promover a Master alguém que já é vendedor da PRÓPRIA
// equipe dele (cadastrado por ele mesmo, com código já ativado) — geralmente
// o(s) vendedor(es) de destaque, que mais vendem.
export function PaginaPromoverMaster({
  emailMasterPlus,
  recrutamentos,
  cargos,
  clientes,
  pedidos,
  vinculosMasterPlus,
  aoPromover,
}: {
  emailMasterPlus: string;
  recrutamentos: Recrutamento[];
  cargos: Record<string, Cargo>;
  clientes: Cliente[];
  pedidos: Pedido[];
  vinculosMasterPlus: Record<string, string>;
  aoPromover: (vendedorEmail: string) => string | null;
}) {
  const meuEmail = emailMasterPlus.toLowerCase();
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const nomeDe = (email: string) => clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;

  // Vendedores da própria equipe (ainda vendedores, ativados), ordenados do
  // que mais vende para o que menos vende
  const meusVendedores = recrutamentos
    .filter((r) => r.recrutador === meuEmail && r.ativado && cargos[r.email.toLowerCase()] === "vendedor")
    .map((r) => ({ ...r, emailBaixo: r.email.toLowerCase(), vendas: totalVendidoPor(r.email, pedidos) }))
    .sort((a, b) => b.vendas - a.vendas);

  const promover = (emailVendedor: string) => {
    const resultado = aoPromover(emailVendedor);
    if (resultado) { setErro(resultado); setSucesso(""); return; }
    setErro("");
    setSucesso(`${nomeDe(emailVendedor)} agora é Master!`);
    setTimeout(() => setSucesso(""), 4000);
  };

  // Masters já promovidos por este MasterPlus, com o total da equipe deles
  // (o repasse de 1% incide só sobre a equipe, não sobre a venda pessoal)
  const mastersPromovidos = Object.keys(vinculosMasterPlus)
    .filter((email) => vinculosMasterPlus[email] === meuEmail && cargos[email] === "master")
    .map((email) => {
      const equipe = recrutamentos.filter((r) => r.recrutador === email && r.ativado);
      const vendasEquipe = equipe.reduce((acum, r) => acum + totalVendidoPor(r.email, pedidos), 0);
      return {
        email,
        nome: nomeDe(email),
        tamanhoEquipe: equipe.length,
        vendasEquipe,
        repasse: vendasEquipe * COMISSAO_MASTERPLUS_OVERRIDE,
      };
    });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Promover a Master</h3>
        <p className="text-[12px] text-gray-400 mb-4">
          Você só pode promover alguém da sua própria equipe de vendedores. Escolha de preferência
          quem mais vende — o vendedor promovido vira Master, ganha {" "}
          <span className="font-semibold text-gray-600">1% sobre a própria equipe</span> (em vez do
          padrão) e você passa a ganhar mais{" "}
          <span className="font-semibold text-gray-600">{(COMISSAO_MASTERPLUS_OVERRIDE * 100).toFixed(0)}% de repasse</span>{" "}
          sobre as vendas da equipe dele.
        </p>

        {erro && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erro}
          </div>
        )}
        {sucesso && (
          <div className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {sucesso}
          </div>
        )}

        {meusVendedores.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-[13px]">
            Você ainda não tem vendedores ativos na sua equipe. Cadastre em "Meus Vendedores" primeiro.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {meusVendedores.map((v, i) => (
              <div key={v.codigo} className="py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                    {v.nome[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate flex items-center gap-1.5">
                      {v.nome}
                      {i < 3 && v.vendas > 0 && (
                        <span title="Vendedor de destaque" className="inline-flex items-center gap-0.5 text-[10px] font-black text-[#E8B84B] bg-amber-50 px-1.5 py-0.5 rounded-full">
                          <Star size={10} className="fill-[#E8B84B] text-[#E8B84B]" /> Destaque
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">{v.email} · vendeu {formatarMoeda(v.vendas)}</div>
                  </div>
                </div>
                <button
                  onClick={() => promover(v.emailBaixo)}
                  className="flex items-center gap-1.5 bg-[#C8102E] hover:bg-[#8C1626] text-white font-bold text-[11px] px-3.5 py-2 rounded-lg transition-colors flex-shrink-0"
                >
                  <ArrowUpCircle size={14} />
                  Promover a Master
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Masters promovidos por você</h3>
        </div>
        {mastersPromovidos.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">
            Você ainda não promoveu nenhum Master.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {mastersPromovidos.map((m) => (
              <div key={m.email} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#4A1218]/10 text-[#4A1218] flex items-center justify-center flex-shrink-0">
                    <Award size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate">{m.nome}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {m.email} · {m.tamanhoEquipe} vendedor(es) · equipe vendeu {formatarMoeda(m.vendasEquipe)}
                    </div>
                  </div>
                </div>
                <span className="font-black text-emerald-600 text-[14px] flex-shrink-0">
                  +{formatarMoeda(m.repasse)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
