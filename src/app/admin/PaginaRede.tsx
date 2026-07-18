// Pagina Admin: PaginaRede (Master e MasterPlus)

import type { Cargo, Recrutamento, Cliente, Pedido } from "../types";
import {
  COMISSAO_MASTERPLUS_PROPRIA,
  COMISSAO_MASTERPLUS_EQUIPE,
  COMISSAO_MASTERPLUS_OVERRIDE,
  COMISSAO_MASTER_PROMOVIDO_EQUIPE,
} from "../constantes";
import { totalVendidoPor } from "../utils";
import { GraficoRede, type NoRede } from "../components/GraficoRede";

// ─── Página Rede (gráfico de rede do Master e do MasterPlus) ──────────────────

// Monta e mostra a árvore de rede de quem está logado:
//  • Master: ele mesmo + os vendedores que ele cadastrou
//  • MasterPlus: ele mesmo + a própria equipe de vendedores + o(s) Master(es)
//    que ele promoveu, cada um com a própria equipe de vendedores
export function PaginaRede({
  modo,
  usuario,
  cargos,
  recrutamentos,
  clientes,
  pedidos,
  vinculosMasterPlus,
  comissaoEquipePct,
}: {
  modo: "master" | "masterplus";
  usuario: { name: string; email: string };
  cargos: Record<string, Cargo>;
  recrutamentos: Recrutamento[];
  clientes: Cliente[];
  pedidos: Pedido[];
  vinculosMasterPlus: Record<string, string>;
  // Fração que o Master ganha sobre a própria equipe (2% padrão, ou 1% se
  // foi promovido por um MasterPlus) — só usada no modo "master"
  comissaoEquipePct: number;
}) {
  const meuEmail = usuario.email.toLowerCase();
  const nomeDe = (email: string) =>
    clientes.find((c) => c.email.toLowerCase() === email)?.name ?? email;

  const noVendedor = (email: string, comissaoPct: number, destaque = false): NoRede => {
    const vendas = totalVendidoPor(email, pedidos);
    return {
      nome: nomeDe(email),
      email,
      papel: "vendedor",
      vendas,
      comissaoParaVoce: vendas * comissaoPct,
      destaque,
    };
  };

  let raiz: NoRede;

  if (modo === "master") {
    const filhos = recrutamentos
      .filter((r) => r.recrutador === meuEmail && r.ativado)
      .map((r) => noVendedor(r.email.toLowerCase(), comissaoEquipePct));
    raiz = {
      nome: usuario.name,
      email: meuEmail,
      papel: "master",
      vendas: totalVendidoPor(meuEmail, pedidos),
      filhos,
    };
  } else {
    // Equipe própria do MasterPlus (2% sobre cada vendedor) — os 3 que mais
    // venderam ganham a estrelinha de destaque
    // Exclui quem já foi promovido a Master — essas pessoas aparecem no
    // ramo "mastersPromovidos" abaixo, com o próprio card e a própria
    // equipe; incluí-las aqui de novo criaria um card duplicado.
    const propriosOrdenados = recrutamentos
      .filter((r) => r.recrutador === meuEmail && r.ativado && cargos[r.email.toLowerCase()] !== "master")
      .map((r) => r.email.toLowerCase())
      .sort((a, b) => totalVendidoPor(b, pedidos) - totalVendidoPor(a, pedidos));
    const equipePropria = propriosOrdenados.map((email, i) =>
      noVendedor(email, COMISSAO_MASTERPLUS_EQUIPE, i < 3 && totalVendidoPor(email, pedidos) > 0)
    );

    // Master(es) promovidos por este MasterPlus, cada um com a própria
    // equipe (1% de repasse sobre as vendas da equipe do Master, não sobre
    // a venda pessoal dele)
    const mastersPromovidos = Object.keys(vinculosMasterPlus)
      .filter((masterEmail) => vinculosMasterPlus[masterEmail] === meuEmail && cargos[masterEmail] === "master")
      .map((masterEmail) => {
        const filhosDoMaster = recrutamentos
          .filter((r) => r.recrutador === masterEmail && r.ativado)
          .map((r) => noVendedor(r.email.toLowerCase(), COMISSAO_MASTER_PROMOVIDO_EQUIPE));
        const vendasEquipeDoMaster = filhosDoMaster.reduce((acum, f) => acum + f.vendas, 0);
        const no: NoRede = {
          nome: nomeDe(masterEmail),
          email: masterEmail,
          papel: "master",
          vendas: totalVendidoPor(masterEmail, pedidos),
          comissaoParaVoce: vendasEquipeDoMaster * COMISSAO_MASTERPLUS_OVERRIDE,
          filhos: filhosDoMaster,
        };
        return no;
      });

    const vendasProprias = totalVendidoPor(meuEmail, pedidos);
    raiz = {
      nome: usuario.name,
      email: meuEmail,
      papel: "masterplus",
      vendas: vendasProprias,
      // Comissão própria (10% fixo) sobre as vendas com o próprio código
      comissaoParaVoce: vendasProprias * COMISSAO_MASTERPLUS_PROPRIA,
      filhos: [...equipePropria, ...mastersPromovidos],
    };
  }

  return (
    <div className="space-y-4">
      {modo === "masterplus" && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-[12.5px] text-purple-700 leading-relaxed">
          Você ganha <span className="font-black">{(COMISSAO_MASTERPLUS_PROPRIA * 100).toFixed(0)}%</span> fixo
          sobre as vendas com o seu próprio código, mais{" "}
          <span className="font-black">{(COMISSAO_MASTERPLUS_EQUIPE * 100).toFixed(0)}%</span> sobre
          as vendas da sua própria equipe de vendedores e mais{" "}
          <span className="font-black">{(COMISSAO_MASTERPLUS_OVERRIDE * 100).toFixed(0)}%</span> de repasse
          sobre a equipe de cada Master que você promoveu.
        </div>
      )}
      <GraficoRede raiz={raiz} />
    </div>
  );
}
