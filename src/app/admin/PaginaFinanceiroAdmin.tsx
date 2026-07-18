// Pagina Admin: PaginaFinanceiroAdmin

import { ShoppingBag, Users, TrendingUp, Award, Crown } from "lucide-react";
import type { Cargo, Recrutamento, Pedido, Cliente } from "../types";
import {
  COMISSAO_MASTER_PROPRIA,
  COMISSAO_MASTERPLUS_PROPRIA,
  COMISSAO_MASTERPLUS_EQUIPE,
  COMISSAO_MASTERPLUS_OVERRIDE,
  COMISSAO_MASTER_PROMOVIDO_EQUIPE,
  NOMES_MESES,
} from "../constantes";
import { comissaoFracaoPorNivel, bonusDeNivel, totalVendidoPor, formatarMoeda } from "../utils";

// ─── Página Financeiro (Admin) ────────────────────────────────────────────────

// Faturamento por período e forma de pagamento + comissões dos vendedores
export function PaginaFinanceiroAdmin({
  pedidos,
  cargos,
  clientes,
  recrutamentos,
  comissaoEquipePct,
  vinculosMasterPlus = {},
}: {
  pedidos: Pedido[];
  cargos: Record<string, Cargo>;
  clientes: Cliente[];
  recrutamentos: Recrutamento[];
  comissaoEquipePct: number; // fração (ex.: 0.02 = 2%) que o Master padrão ganha sobre a equipe
  // E-mail do Master (minúsculo) → e-mail do MasterPlus que o promoveu
  vinculosMasterPlus?: Record<string, string>;
}) {
  const validos = pedidos.filter((o) => o.status !== "Cancelado");
  const faturamentoTotal = validos.reduce((acum, o) => acum + o.total, 0);
  const mesAtual = NOMES_MESES[new Date().getMonth()];
  const faturamentoMes = validos.filter((o) => o.month === mesAtual).reduce((acum, o) => acum + o.total, 0);

  // Comissão e bônus de nível de cada vendedor, com base nas próprias vendas
  const vendedoresList = Object.keys(cargos).filter((e) => cargos[e] === "vendedor");
  const dadosVendedores = vendedoresList.map((email) => {
    const totalProprio = totalVendidoPor(email, pedidos);
    const nome = clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;
    return {
      email,
      nome,
      totalProprio,
      comissao: totalProprio * comissaoFracaoPorNivel(totalProprio),
      bonus: bonusDeNivel(totalProprio),
    };
  });
  const comissoesTotal = dadosVendedores.reduce((acum, v) => acum + v.comissao, 0);
  const bonusVendedores = dadosVendedores.filter((v) => v.bonus > 0);
  const bonusTotal = bonusVendedores.reduce((acum, v) => acum + v.bonus, 0);

  // Comissão de cada Master: 10% fixo (nível Diamante) sobre as próprias vendas
  // (código pessoal) + % sobre as vendas da própria equipe de vendedores
  // (padrão configurável, ou 1% se este Master foi promovido por um
  // MasterPlus — nesse caso 1% vai de repasse ao MasterPlus), mais bônus de
  // nível (vendas próprias). Pode haver vários Masters, cada um com a
  // própria equipe isolada.
  const emailsMasters = Object.keys(cargos).filter((e) => cargos[e] === "master");
  const dadosMasters = emailsMasters.map((email) => {
    const nome = clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;
    const totalProprio = totalVendidoPor(email, pedidos);
    const recrutamentosDoMaster = recrutamentos.filter((r) => r.recrutador === email);
    const emailsEquipe = new Set(
      recrutamentosDoMaster.filter((r) => r.ativado).map((r) => r.email.toLowerCase())
    );
    const totalEquipe = dadosVendedores
      .filter((v) => emailsEquipe.has(v.email))
      .reduce((acum, v) => acum + v.totalProprio, 0);
    const promovidoPorMasterPlus = Boolean(vinculosMasterPlus[email]);
    const suaComissaoEquipePct = promovidoPorMasterPlus ? COMISSAO_MASTER_PROMOVIDO_EQUIPE : comissaoEquipePct;
    const comissaoPropria = totalProprio * COMISSAO_MASTER_PROPRIA;
    const comissaoEquipe = totalEquipe * suaComissaoEquipePct;
    const bonusNivel = bonusDeNivel(totalProprio);
    return {
      email,
      nome,
      totalProprio,
      totalEquipe,
      vendedoresAtivos: emailsEquipe.size,
      comissaoPropria,
      comissaoEquipe,
      suaComissaoEquipePct,
      promovidoPorMasterPlus,
      bonusNivel,
      total: comissaoPropria + comissaoEquipe + bonusNivel,
    };
  });
  const totalMasters = dadosMasters.reduce((acum, m) => acum + m.total, 0);

  // Comissão de cada MasterPlus: 10% fixo (nível Diamante) sobre as próprias
  // vendas (código pessoal, igual ao Master) + 2% sobre a própria equipe de
  // vendedores + 1% de repasse sobre a equipe de cada Master que ele
  // promoveu (não conta a venda pessoal do Master, só a equipe dele).
  const emailsMasterPlus = Object.keys(cargos).filter((e) => cargos[e] === "masterplus");
  const dadosMasterPlus = emailsMasterPlus.map((email) => {
    const nome = clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;
    const totalProprio = totalVendidoPor(email, pedidos);
    const comissaoPropria = totalProprio * COMISSAO_MASTERPLUS_PROPRIA;
    const recrutamentosProprios = recrutamentos.filter((r) => r.recrutador === email && r.ativado);
    const totalEquipePropria = recrutamentosProprios.reduce(
      (acum, r) => acum + totalVendidoPor(r.email, pedidos),
      0
    );
    const comissaoEquipePropria = totalEquipePropria * COMISSAO_MASTERPLUS_EQUIPE;

    const mastersPromovidos = Object.keys(vinculosMasterPlus).filter(
      (masterEmail) => vinculosMasterPlus[masterEmail] === email && cargos[masterEmail] === "master"
    );
    const detalheMasters = mastersPromovidos.map((masterEmail) => {
      const equipeDoMaster = recrutamentos.filter((r) => r.recrutador === masterEmail && r.ativado);
      const totalEquipeDoMaster = equipeDoMaster.reduce((acum, r) => acum + totalVendidoPor(r.email, pedidos), 0);
      return {
        email: masterEmail,
        nome: clientes.find((c) => c.email.toLowerCase() === masterEmail)?.name ?? masterEmail,
        totalEquipe: totalEquipeDoMaster,
        repasse: totalEquipeDoMaster * COMISSAO_MASTERPLUS_OVERRIDE,
      };
    });
    const comissaoOverride = detalheMasters.reduce((acum, m) => acum + m.repasse, 0);

    return {
      email,
      nome,
      totalProprio,
      comissaoPropria,
      totalEquipePropria,
      vendedoresProprios: recrutamentosProprios.length,
      comissaoEquipePropria,
      comissaoOverride,
      detalheMasters,
      total: comissaoPropria + comissaoEquipePropria + comissaoOverride,
    };
  });
  const totalMasterPlus = dadosMasterPlus.reduce((acum, m) => acum + m.total, 0);

  const cartoesGerais = [
    { label: "Faturamento total", valor: formatarMoeda(faturamentoTotal), icone: <TrendingUp size={22} className="text-emerald-600" /> },
    { label: `Faturamento de ${mesAtual}`, valor: formatarMoeda(faturamentoMes), icone: <TrendingUp size={22} className="text-[#C8102E]" /> },
    { label: "Pedidos válidos", valor: String(validos.length), icone: <ShoppingBag size={22} className="text-[#C8102E]" /> },
  ];
  const cartoesRepasses = [
    { label: "Comissões dos vendedores a pagar", valor: formatarMoeda(comissoesTotal), icone: <Users size={22} className="text-[#C8102E]" /> },
    { label: "Bônus de nível a pagar", valor: formatarMoeda(bonusTotal), icone: <Award size={22} className="text-purple-600" /> },
  ];

  const cartao = (c: { label: string; valor: string; icone: React.ReactNode }) => (
    <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <span className="flex-shrink-0">{c.icone}</span>
      <div className="min-w-0">
        <div className="text-lg font-black text-gray-900 truncate">{c.valor}</div>
        <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">Visão geral</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cartoesGerais.map(cartao)}
        </div>
      </div>
      <div>
        <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">Repasses a pagar</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cartoesRepasses.map(cartao)}
        </div>
      </div>
      {/* Comissões dos vendedores */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Comissões dos vendedores</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Quanto pagar a cada vendedor, pela comissão do próprio nível (4% a 10%) sobre as vendas totais dele.</p>
        </div>
        {dadosVendedores.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum vendedor cadastrado ainda.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {dadosVendedores.map((v) => (
              <div key={v.email} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-gray-800 truncate">{v.nome}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {v.email} · vendeu {formatarMoeda(v.totalProprio)}
                    {v.bonus > 0 && ` · bônus de nível ${formatarMoeda(v.bonus)}`}
                  </div>
                </div>
                <span className="font-black text-emerald-600 text-[14px]">{formatarMoeda(v.comissao)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bônus de nível dos vendedores */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Bônus de nível — Vendedores</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Vendedores que atingiram o nível Ouro (R$100) ou Diamante (R$150) em vendas totais.</p>
        </div>
        {bonusVendedores.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum vendedor atingiu o nível Ouro ainda.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bonusVendedores.map((v) => (
              <div key={v.email} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-gray-800 truncate">{v.nome}</div>
                  <div className="text-[11px] text-gray-400 truncate">{v.email} · vendeu {formatarMoeda(v.totalProprio)}</div>
                </div>
                <span className="font-black text-purple-600 text-[14px]">{formatarMoeda(v.bonus)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comissão dos Masters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Masters</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Cada Master ganha 10% fixo (nível Diamante) sobre as vendas com o próprio código,{" "}
            {(comissaoEquipePct * 100).toFixed(0)}% sobre as vendas da própria equipe de vendedores
            (ou {(COMISSAO_MASTER_PROMOVIDO_EQUIPE * 100).toFixed(0)}% se foi promovido por um
            MasterPlus), e bônus de nível sobre as próprias vendas.
          </p>
        </div>
        {dadosMasters.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum Master cadastrado ainda.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {dadosMasters.map((m) => (
              <div key={m.email} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate flex items-center gap-1.5 flex-wrap">
                      {m.nome}
                      {m.promovidoPorMasterPlus && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#4A1218]/10 text-[#4A1218]">
                          Promovido por MasterPlus
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">{m.email} · {m.vendedoresAtivos} vendedor(es) ativo(s)</div>
                  </div>
                  <span className="font-black text-gray-900 text-[15px]">{formatarMoeda(m.total)}</span>
                </div>
                <div className="divide-y divide-gray-50 bg-gray-50/60 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[12px] text-gray-600">Comissão própria (10%) · vendeu {formatarMoeda(m.totalProprio)}</span>
                    <span className="font-black text-emerald-600 text-[13px]">{formatarMoeda(m.comissaoPropria)}</span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[12px] text-gray-600">Comissão da equipe ({(m.suaComissaoEquipePct * 100).toFixed(0)}%) · equipe vendeu {formatarMoeda(m.totalEquipe)}</span>
                    <span className="font-black text-emerald-600 text-[13px]">{formatarMoeda(m.comissaoEquipe)}</span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[12px] text-gray-600">Bônus de nível (vendas próprias)</span>
                    <span className="font-black text-purple-600 text-[13px]">{formatarMoeda(m.bonusNivel)}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap bg-gray-50/60">
              <span className="text-[13px] font-bold text-gray-800">Total a pagar aos Masters</span>
              <span className="font-black text-gray-900 text-[15px]">{formatarMoeda(totalMasters)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Comissão dos MasterPlus */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px] flex items-center gap-2">
            <Crown size={16} className="text-[#4A1218]" />
            MasterPlus
          </h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Ganha {(COMISSAO_MASTERPLUS_PROPRIA * 100).toFixed(0)}% fixo sobre as vendas com o
            próprio código (igual ao Master), mais {(COMISSAO_MASTERPLUS_EQUIPE * 100).toFixed(0)}%
            sobre as vendas da própria equipe de vendedores, mais{" "}
            {(COMISSAO_MASTERPLUS_OVERRIDE * 100).toFixed(0)}% de repasse sobre as vendas da equipe
            de cada Master que promoveu.
          </p>
        </div>
        {dadosMasterPlus.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum MasterPlus cadastrado ainda.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {dadosMasterPlus.map((m) => (
              <div key={m.email} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-gray-800 truncate">{m.nome}</div>
                    <div className="text-[11px] text-gray-400 truncate">{m.email} · {m.vendedoresProprios} vendedor(es) próprio(s)</div>
                  </div>
                  <span className="font-black text-gray-900 text-[15px]">{formatarMoeda(m.total)}</span>
                </div>
                <div className="divide-y divide-gray-50 bg-gray-50/60 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[12px] text-gray-600">
                      Comissão própria ({(COMISSAO_MASTERPLUS_PROPRIA * 100).toFixed(0)}%) · vendeu {formatarMoeda(m.totalProprio)}
                    </span>
                    <span className="font-black text-emerald-600 text-[13px]">{formatarMoeda(m.comissaoPropria)}</span>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[12px] text-gray-600">
                      Comissão da equipe própria ({(COMISSAO_MASTERPLUS_EQUIPE * 100).toFixed(0)}%) · equipe vendeu {formatarMoeda(m.totalEquipePropria)}
                    </span>
                    <span className="font-black text-emerald-600 text-[13px]">{formatarMoeda(m.comissaoEquipePropria)}</span>
                  </div>
                  {m.detalheMasters.length === 0 ? (
                    <div className="px-4 py-2.5 text-[12px] text-gray-400">Ainda não promoveu nenhum Master.</div>
                  ) : (
                    m.detalheMasters.map((d) => (
                      <div key={d.email} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-[12px] text-gray-600">
                          Repasse ({(COMISSAO_MASTERPLUS_OVERRIDE * 100).toFixed(0)}%) sobre a equipe de {d.nome} · equipe vendeu {formatarMoeda(d.totalEquipe)}
                        </span>
                        <span className="font-black text-emerald-600 text-[13px]">{formatarMoeda(d.repasse)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
            <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap bg-gray-50/60">
              <span className="text-[13px] font-bold text-gray-800">Total a pagar aos MasterPlus</span>
              <span className="font-black text-gray-900 text-[15px]">{formatarMoeda(totalMasterPlus)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
