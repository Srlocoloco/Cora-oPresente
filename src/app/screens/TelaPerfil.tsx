// Tela TelaPerfil

import { useState } from "react";
import { X, Package, LogOut, Plus, Truck, Settings, ChevronLeft, Check, MapPin } from "lucide-react";
import type { Usuario, Cupom, Cargo, Pedido, Cliente, Tela } from "../types";
import { formatarMoeda } from "../utils";
import { SeloStatus } from "../components/SeloStatus";

// ─── Tela Perfil do Cliente ───────────────────────────────────────────────────

// Perfil do cliente: pedidos por status (Preparando, A caminho, Entregues,
// Cancelados), cupons disponíveis, atalhos para as categorias da loja e
// ativação do código de vendedor (quando a conta ainda não tem cargo)
export function TelaPerfil({
  usuario,
  pedidos,
  cupons,
  categorias,
  aoVerCategoria,
  aoVoltar,
  aoSair,
  rotuloPainel,
  aoAbrirPainel,
  cargoUsuario,
  aoAtivarCodigo,
}: {
  usuario: Usuario;
  pedidos: Pedido[];
  cupons: Cupom[];
  categorias: string[];
  aoVerCategoria: (c: string) => void;
  aoVoltar: () => void;
  aoSair: () => void;
  rotuloPainel: string | null;
  aoAbrirPainel: () => void;
  cargoUsuario?: Cargo;
  aoAtivarCodigo: (codigo: string) => string | null;
}) {
  // null = mostra todos os pedidos; senão filtra pelo status escolhido
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [cupomCopiado, setCupomCopiado] = useState("");
  const [codigoAtivar, setCodigoAtivar] = useState("");
  const [erroAtivar, setErroAtivar] = useState("");
  const [ativando, setAtivando] = useState(false);

  const ativarCodigo = () => {
    setAtivando(true);
    const resultado = aoAtivarCodigo(codigoAtivar);
    setAtivando(false);
    if (resultado) { setErroAtivar(resultado); return; }
    setErroAtivar("");
    setCodigoAtivar("");
  };

  const atalhos = [
    { status: "Processando", rotulo: "Preparando", icon: <Package size={20} /> },
    { status: "Em trânsito", rotulo: "A caminho", icon: <Truck size={20} /> },
    { status: "Entregue", rotulo: "Entregues", icon: <Check size={20} /> },
    { status: "Cancelado", rotulo: "Cancelados", icon: <X size={20} /> },
  ];

  const contagem = (status: string) => pedidos.filter((o) => o.status === status).length;
  const visiveis = filtroStatus ? pedidos.filter((o) => o.status === filtroStatus) : pedidos;

  const copiarCupom = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {});
    setCupomCopiado(codigo);
    setTimeout(() => setCupomCopiado(""), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Cabeçalho do perfil */}
      <div className="bg-[#C8102E] px-4 pt-4 pb-10">
        <div className="max-w-[720px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={aoVoltar} className="text-white/80 hover:text-white flex items-center gap-1 text-[13px] font-semibold transition-colors">
              <ChevronLeft size={16} />
              Loja
            </button>
            <button onClick={aoSair} className="text-white/80 hover:text-white flex items-center gap-1.5 text-[13px] font-semibold transition-colors">
              <LogOut size={14} />
              Sair
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
              {usuario.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-white font-black text-lg truncate">{usuario.name}</div>
              <div className="text-white/70 text-[12px] truncate">{usuario.email}</div>
            </div>
            {rotuloPainel && (
              <button
                onClick={aoAbrirPainel}
                className="ml-auto bg-white/15 hover:bg-white/25 text-white text-[12px] font-bold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                <Settings size={13} />
                {rotuloPainel}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4 -mt-5 space-y-4">
        {/* Ativar código de vendedor: só aparece pra quem ainda não tem cargo */}
        {!cargoUsuario && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-black text-gray-900 text-[15px] mb-1">Tem um código de vendedor?</h3>
            <p className="text-[12px] text-gray-400 mb-3">
              Recebeu um código de ativação? Ative aqui e comece a divulgar os produtos da loja ganhando comissão em cada venda.
            </p>
            <div className="flex gap-2 flex-col sm:flex-row">
              <input
                value={codigoAtivar}
                onChange={(e) => { setCodigoAtivar(e.target.value.toUpperCase()); setErroAtivar(""); }}
                placeholder="Ex.: CP-7K2M9X"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
              />
              <button
                onClick={ativarCodigo}
                disabled={ativando || !codigoAtivar.trim()}
                className="bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-50 text-white font-black px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Ativar
              </button>
            </div>
            {erroAtivar && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                {erroAtivar}
              </div>
            )}
          </div>
        )}

        {/* Meus pedidos: atalhos por status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-gray-900 text-[15px]">Meus Pedidos</h3>
            <button
              onClick={() => setFiltroStatus(null)}
              className="text-[12px] font-bold text-[#C8102E] hover:underline"
            >
              Ver todos
            </button>
          </div>
          <div className="grid grid-cols-4">
            {atalhos.map((a) => (
              <button
                key={a.status}
                onClick={() => setFiltroStatus(a.status)}
                className={`flex flex-col items-center gap-1.5 py-2 rounded-xl transition-colors ${
                  filtroStatus === a.status ? "bg-red-50 text-[#C8102E]" : "text-gray-500 hover:text-[#C8102E]"
                }`}
              >
                <div className="relative">
                  {a.icon}
                  {contagem(a.status) > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                      {contagem(a.status)}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold">{a.rotulo}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Lista de pedidos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h3 className="font-black text-gray-900 text-[14px]">
              {filtroStatus
                ? atalhos.find((a) => a.status === filtroStatus)?.rotulo
                : "Todos os pedidos"}
            </h3>
          </div>
          {visiveis.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-[13px]">
              {filtroStatus ? "Nenhum pedido nesta etapa." : "Você ainda não fez nenhum pedido."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visiveis.map((o) => (
                <div key={o.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[11px] text-[#C8102E] font-bold">{o.id}</span>
                    <SeloStatus status={o.status} />
                  </div>
                  <div className="text-[13px] text-gray-700 font-medium truncate">{o.items}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-gray-400">{o.date}{o.pagamento ? ` · ${o.pagamento}` : ""}</span>
                    <span className="font-black text-gray-900 text-[13px]">{formatarMoeda(o.total)}</span>
                  </div>
                  {o.endereco && (
                    <div className="text-[11px] text-gray-400 mt-1 flex items-start gap-1">
                      <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{o.endereco}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cupons disponíveis */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <h3 className="font-black text-gray-900 text-[14px]">Cupons para você</h3>
          </div>
          {cupons.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-[13px]">
              Nenhum cupom disponível no momento.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cupons.map((c) => (
                <div key={c.codigo} className="px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-black text-[#C8102E]">{c.percentual}% OFF</div>
                    <div className="text-[11px] text-gray-400">
                      Válido até {new Date(c.validade + "T12:00:00").toLocaleDateString("pt-BR")} · use no carrinho
                    </div>
                  </div>
                  <button
                    onClick={() => copiarCupom(c.codigo)}
                    className="font-mono text-[12px] font-bold text-[#C8102E] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                  >
                    {cupomCopiado === c.codigo ? "Copiado!" : c.codigo}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categorias */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-black text-gray-900 text-[14px] mb-3">Categorias</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => aoVerCategoria(c)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] font-bold text-gray-700 hover:border-[#C8102E] hover:text-[#C8102E] transition-colors text-left"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
