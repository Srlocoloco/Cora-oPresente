// Pagina Admin: PaginaEstoqueAdmin

import { Package } from "lucide-react";
import type { Produto } from "../types";
import { ImagemProduto } from "../components/ImagemProduto";

// ─── Página Estoque (Admin) ───────────────────────────────────────────────────

// Produtos esgotados e com estoque baixo, para planejar a reposição
export function PaginaEstoqueAdmin({ produtos }: { produtos: Produto[] }) {
  const esgotados = produtos.filter((p) => p.stock <= 0);
  const baixo = produtos.filter((p) => p.stock > 0 && p.stock < 15).sort((a, b) => a.stock - b.stock);
  const totalUnidades = produtos.reduce((acum, p) => acum + Math.max(0, p.stock), 0);

  const cartoes = [
    { label: "Produtos esgotados", valor: String(esgotados.length), icone: <Package size={22} className="text-red-500" /> },
    { label: "Estoque baixo (menos de 15)", valor: String(baixo.length), icone: <Package size={22} className="text-amber-500" /> },
    { label: "Unidades em estoque", valor: totalUnidades.toLocaleString("pt-BR"), icone: <Package size={22} className="text-emerald-600" /> },
  ];

  const linha = (p: Produto) => (
    <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center p-1 flex-shrink-0">
          <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-800 truncate">{p.name}</div>
          <div className="text-[11px] text-gray-400 truncate">{p.brand} · {p.category}</div>
        </div>
      </div>
      <span
        className={`text-[11px] font-black px-2.5 py-1 rounded-full flex-shrink-0 ${
          p.stock <= 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
        }`}
      >
        {p.stock <= 0 ? "ESGOTADO" : `${p.stock} un.`}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-lg font-black text-gray-900 truncate">{c.valor}</div>
              <div className="text-[11px] text-gray-400 font-semibold">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Esgotados — reponha o quanto antes</h3>
        </div>
        {esgotados.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum produto esgotado.</div>
        ) : (
          <div className="divide-y divide-gray-50">{esgotados.map(linha)}</div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Estoque baixo</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Produtos com menos de 15 unidades — a loja já mostra "Últimas unidades!" para o cliente.</p>
        </div>
        {baixo.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-[13px]">Nenhum produto com estoque baixo.</div>
        ) : (
          <div className="divide-y divide-gray-50">{baixo.map(linha)}</div>
        )}
      </div>
    </div>
  );
}
