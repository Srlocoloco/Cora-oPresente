// Pagina Admin: PaginaMeusVendedores

import { useState } from "react";
import { Plus, Check, Clock } from "lucide-react";
import type { Recrutamento, Pedido, Cargo, ResultadoCadastroVendedor } from "../types";
import { totalVendidoPor, formatarMoeda } from "../utils";

// ─── Página Meus Vendedores (Master e MasterPlus) ─────────────────────────────

// A equipe inteira numa página só, com UM cadastro: nome + e-mail e pronto.
// Quem já tem conta na loja entra na equipe na hora, com o cargo dado; quem
// ainda não tem recebe um código para ativar quando se cadastrar. Quem decide
// isso é o servidor (ver recrutamentos.php) — o painel do Master não enxerga a
// lista de clientes da loja, então não teria como saber.
//
// Antes eram DUAS páginas no menu ("Meus Vendedores" e "Equipe & Cargos") e,
// dentro delas, DOIS formulários para a mesma coisa: colocar alguém na equipe.
// Do lado de quem usa, era escolher entre dois caminhos para o mesmo destino —
// e um deles ("dar cargo por e-mail") nem funcionava para cliente comum, porque
// o painel do Master não recebe a lista de clientes da loja.
export function PaginaMeusVendedores({
  emailMaster,
  recrutamentos: todosRecrutamentos,
  aoCadastrar,
  pedidos,
  cargos,
  aoDefinirCargo,
}: {
  emailMaster: string;
  recrutamentos: Recrutamento[];
  // Responde DEPOIS do servidor: é ele quem cria o vínculo, gera o código e
  // diz se a pessoa já era cliente da loja (aí ela entra na equipe direto)
  aoCadastrar: (nome: string, email: string) => Promise<ResultadoCadastroVendedor>;
  pedidos: Pedido[];
  cargos: Record<string, Cargo>;
  aoDefinirCargo: (email: string, cargo: Cargo | null) => void;
}) {
  // Cada Master só vê e cadastra a própria equipe — não a de outros Masters
  const recrutamentos = todosRecrutamentos.filter(
    (r) => r.recrutador === emailMaster.toLowerCase()
  );
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [copiado, setCopiado] = useState("");

  const cadastrar = async () => {
    const nomeInformado = nome.trim();
    setCadastrando(true);
    const { erro: falha, codigo, jaEraCliente } = await aoCadastrar(nome, email);
    setCadastrando(false);
    if (falha) { setErro(falha); setAviso(""); return; }
    setErro("");
    // Duas coisas bem diferentes podem ter acontecido, e quem cadastrou precisa
    // saber qual: entregar um código à pessoa, ou não fazer mais nada
    setAviso(
      jaEraCliente
        ? `${nomeInformado} já tinha conta na loja e entrou direto na sua equipe como Vendedor.`
        : `Código ${codigo ?? ""} gerado. Entregue para ${nomeInformado} ativar no perfil dela — ele também fica na lista abaixo.`
    );
    setNome("");
    setEmail("");
  };

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCopiado(codigo);
    setTimeout(() => setCopiado(""), 2000);
  };

  const vendedoresAtivos = recrutamentos.filter((r) => r.ativado).length;
  const aguardando = recrutamentos.length - vendedoresAtivos;

  const cartoes = [
    { label: "Vendedores ativos", valor: vendedoresAtivos, icone: <Check size={22} className="text-emerald-600" /> },
    { label: "Aguardando ativação", valor: aguardando, icone: <Clock size={22} className="text-amber-500" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-xl font-black text-gray-900">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold truncate">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Cadastrar novo vendedor</h3>
        <p className="text-[12px] text-gray-400 mb-4">
          Informe o nome e o e-mail. Se a pessoa já tem conta na loja, ela entra na sua equipe na
          hora; se ainda não tem, geramos um código para ela ativar a conta no perfil dela.
        </p>
        <div className="flex gap-2 flex-col md:flex-row">
          <input
            value={nome}
            onChange={(e) => { setNome(e.target.value); setErro(""); setAviso(""); }}
            placeholder="Nome do vendedor"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErro(""); setAviso(""); }}
            placeholder="E-mail do vendedor"
            type="email"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <button
            onClick={cadastrar}
            disabled={cadastrando}
            className="bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-60 text-white font-black px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Plus size={15} />
            {cadastrando ? "Cadastrando..." : "Cadastrar"}
          </button>
        </div>
        {erro && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erro}
          </div>
        )}
        {aviso && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {aviso}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">
            Minha equipe ({recrutamentos.length})
          </h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            O vendedor divulga os produtos da loja com o código de venda pessoal e ganha comissão
            pelo próprio nível (4% a 10%).
          </p>
        </div>
        {recrutamentos.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum vendedor cadastrado ainda. Cadastre um acima para começar sua equipe.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recrutamentos.map((r) => {
              const chave = r.email.toLowerCase();
              const vendidoPeloVendedor = r.ativado ? totalVendidoPor(r.email, pedidos) : 0;
              const cargoAtual = cargos[chave] ?? null;
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
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Código só interessa enquanto a pessoa não ativou —
                        depois disso ele já cumpriu o papel dele */}
                    {!r.ativado && (
                      <button
                        onClick={() => copiarCodigo(r.codigo)}
                        title="Copiar código de ativação"
                        className="font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        {copiado === r.codigo ? "Copiado!" : r.codigo}
                      </button>
                    )}
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                        r.ativado ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {r.ativado ? "ATIVO" : "PENDENTE"}
                    </span>
                    {/* Cargo de quem já ativou: dá para devolver o cargo a quem
                        perdeu (ou tirar de quem saiu da equipe) sem sair daqui */}
                    {r.ativado && (
                      cargoAtual === null ? (
                        <button
                          onClick={() => aoDefinirCargo(r.email, "vendedor")}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 border-gray-200 text-gray-500 hover:border-[#C8102E] hover:text-[#C8102E] transition-all"
                        >
                          Tornar Vendedor
                        </button>
                      ) : cargoAtual === "vendedor" ? (
                        <button
                          onClick={() => aoDefinirCargo(r.email, null)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 transition-all"
                        >
                          Remover cargo
                        </button>
                      ) : (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 uppercase">
                          {cargoAtual}
                        </span>
                      )
                    )}
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
