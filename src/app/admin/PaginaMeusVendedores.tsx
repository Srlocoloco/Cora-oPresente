// Pagina Admin: PaginaMeusVendedores

import { useState } from "react";
import { Users, Plus, Award } from "lucide-react";
import type { Recrutamento, Pedido } from "../types";
import { BONUS_NIVEL_OURO, BONUS_NIVEL_DIAMANTE, BONUS_CONVITE_VENDEDOR } from "../constantes";
import { bonusDeNivel, bonusDeConvite, totalVendidoPor, formatarMoeda } from "../utils";

// ─── Página Meus Vendedores (Master) ──────────────────────────────────────────

// O Master cadastra vendedores (nome + e-mail) e entrega o código gerado
// para que eles ativem a conta no próprio perfil.
export function PaginaMeusVendedores({
  emailMaster,
  recrutamentos: todosRecrutamentos,
  aoCadastrar,
  pedidos,
}: {
  emailMaster: string;
  recrutamentos: Recrutamento[];
  aoCadastrar: (nome: string, email: string) => string | null;
  pedidos: Pedido[];
}) {
  // Cada Master só vê e cadastra a própria equipe — não a de outros Masters
  const recrutamentos = todosRecrutamentos.filter(
    (r) => r.recrutador === emailMaster.toLowerCase()
  );
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState("");

  const cadastrar = () => {
    const resultado = aoCadastrar(nome, email);
    if (resultado) { setErro(resultado); return; }
    setErro("");
    setNome("");
    setEmail("");
  };

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCopiado(codigo);
    setTimeout(() => setCopiado(""), 2000);
  };

  const vendedoresAtivos = recrutamentos.filter((r) => r.ativado).length;
  const bonusConvite = bonusDeConvite(recrutamentos);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Users size={22} className="text-[#C8102E] flex-shrink-0" />
          <div>
            <div className="text-xl font-black text-gray-900">{vendedoresAtivos}</div>
            <div className="text-[11px] text-gray-400 font-semibold">Vendedores ativos</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <Award size={22} className="text-purple-600 flex-shrink-0" />
          <div>
            <div className="text-xl font-black text-gray-900">{formatarMoeda(bonusConvite)}</div>
            <div className="text-[11px] text-gray-400 font-semibold">Bônus de convite ganho</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Cadastrar novo vendedor</h3>
        <p className="text-[12px] text-gray-400 mb-4">
          Informe os dados do vendedor. Um código será gerado — entregue-o à pessoa para que ela
          ative a própria conta no perfil dela. Assim que ela ativar, você ganha um bônus de convite
          de {formatarMoeda(BONUS_CONVITE_VENDEDOR)}. Ao atingir o nível Ouro ou Diamante em vendas
          totais, o vendedor também ganha um bônus de {formatarMoeda(BONUS_NIVEL_OURO)} ou{" "}
          {formatarMoeda(BONUS_NIVEL_DIAMANTE)}, respectivamente.
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do vendedor"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail do vendedor"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={cadastrar}
            className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            Cadastrar
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
          <h3 className="font-black text-gray-900 text-[15px]">Vendedores cadastrados ({recrutamentos.length})</h3>
        </div>
        {recrutamentos.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum vendedor cadastrado ainda. Cadastre um acima para gerar o código.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recrutamentos.map((r) => {
              const vendidoPeloVendedor = r.ativado ? totalVendidoPor(r.email, pedidos) : 0;
              const bonusNivelVendedor = bonusDeNivel(vendidoPeloVendedor);
              return (
                <div key={r.codigo} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[13px] font-black flex items-center justify-center flex-shrink-0">
                      {r.nome[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-gray-800 truncate">{r.nome}</div>
                      <div className="text-[11px] text-gray-400 truncate">{r.email} · {r.date}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copiarCodigo(r.codigo)}
                      title="Copiar código"
                      className="font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      {copiado === r.codigo ? "Copiado!" : r.codigo}
                    </button>
                    {bonusNivelVendedor > 0 && (
                      <span
                        title={`Bônus de nível ganho pelo vendedor: ${formatarMoeda(bonusNivelVendedor)}`}
                        className="text-[10px] font-black px-2.5 py-1 rounded-full bg-purple-50 text-purple-600"
                      >
                        🎁 Bônus de nível: {formatarMoeda(bonusNivelVendedor)}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                        r.ativado ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {r.ativado ? "ATIVO" : "PENDENTE"}
                    </span>
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
