// Pagina Admin: PaginaEntregadoresAdmin

import { useState } from "react";
import { Truck, Package, Check } from "lucide-react";
import type { Cargo, Cliente, Pedido } from "../types";
import { EMAIL_ADMIN } from "../constantes";

// ─── Página Entregadores (somente Admin) ──────────────────────────────────────
//
// Quem entrega é gente da loja, não vendedor: o cargo de entregador não dá
// comissão, não dá código de venda e não abre catálogo nenhum. Ele dá acesso a
// UMA página — "Minhas Entregas" — com os pedidos que o Admin designou para
// aquela pessoa: endereço, mapa e os dois botões que movem o pedido até
// "Entregue" (ver PaginaEntregas).
//
// A designação de cada pedido é feita nos Pedidos, dentro dos detalhes da
// compra: é lá que o Admin sabe o que já está separado para sair.
export function PaginaEntregadoresAdmin({
  clientes,
  cargos,
  pedidos,
  aoDefinirCargo,
}: {
  clientes: Cliente[];
  cargos: Record<string, Cargo>;
  pedidos: Pedido[];
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");

  const tornarEntregador = () => {
    const chave = email.trim().toLowerCase();
    if (!chave) return;
    if (chave === EMAIL_ADMIN) {
      setErro("Este e-mail é reservado.");
      return;
    }
    const cliente = clientes.find((c) => c.email.toLowerCase() === chave);
    if (!cliente) {
      setErro("Este e-mail ainda não tem cadastro na loja. Peça para a pessoa criar a conta primeiro.");
      return;
    }
    const cargoAtual = cargos[chave];
    if (cargoAtual && cargoAtual !== "entregador") {
      setErro(`Esta conta já tem cargo de ${cargoAtual}. Remova o cargo antes de torná-la entregador.`);
      return;
    }
    setErro("");
    aoDefinirCargo(chave, "entregador");
    setEmail("");
  };

  const emailsEntregadores = Object.keys(cargos).filter((e) => cargos[e] === "entregador");
  const entregadores = clientes.filter((c) => emailsEntregadores.includes(c.email.toLowerCase()));

  const entregasDe = (emailEntregador: string) => {
    const chave = emailEntregador.toLowerCase();
    const meus = pedidos.filter((o) => (o.entregador ?? "").toLowerCase() === chave);
    return {
      pendentes: meus.filter((o) => o.status === "Processando" || o.status === "Em trânsito").length,
      entregues: meus.filter((o) => o.status === "Entregue").length,
    };
  };

  const semEntregador = pedidos.filter(
    (o) => !o.entregador && (o.status === "Processando" || o.status === "Em trânsito")
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Truck size={22} className="text-[#C8102E] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-xl font-black text-gray-900">{entregadores.length}</div>
            <div className="text-[11px] text-gray-400 font-semibold truncate">Entregadores ativos</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Package size={22} className="text-amber-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-xl font-black text-gray-900">{semEntregador}</div>
            <div className="text-[11px] text-gray-400 font-semibold truncate">Pedidos sem entregador</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Tornar entregador</h3>
        <p className="text-[12px] text-gray-400 mb-3">
          Dá o cargo de Entregador a uma conta já cadastrada na loja. Ela passa a ver o painel
          "Minhas Entregas" com os pedidos que você designar: produto, cliente, endereço com atalho
          para o mapa e os botões de "saiu para entrega" e "entregue" — cada um deles avisa o
          cliente por e-mail e no celular. O entregador não vê pedido de outro entregador, nem
          faturamento, nem dados de outros clientes.
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
            onClick={tornarEntregador}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-5 py-3 rounded-xl transition-colors text-sm"
          >
            Tornar Entregador
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
          <h3 className="font-black text-gray-900 text-[15px]">Entregadores cadastrados</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Para dar um pedido a alguém, abra Pedidos → detalhes da compra → "Entregador
            responsável".
          </p>
        </div>
        {entregadores.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum entregador cadastrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {entregadores.map((e) => {
              const { pendentes, entregues } = entregasDe(e.email);
              return (
                <div key={e.email} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                      {e.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-gray-800 truncate">{e.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{e.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 flex items-center gap-1">
                      <Package size={11} /> {pendentes} na fila
                    </span>
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-1">
                      <Check size={11} /> {entregues} entregues
                    </span>
                    <button
                      onClick={() => aoDefinirCargo(e.email, null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 transition-all"
                    >
                      Remover cargo
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
