// Componente ModalDetalhesPedido

import { X } from "lucide-react";
import type { Produto, Pedido, Cliente } from "../types";
import { categoriaExibida, formatarMoeda } from "../utils";

export function ModalDetalhesPedido({
  pedido,
  aoFechar,
  aoAtualizarStatus,
}: {
  pedido: Pedido;
  aoFechar: () => void;
  aoAtualizarStatus: (status: string) => void;
}) {
  const listaStatus = ["Processando", "Em trânsito", "Entregue", "Cancelado"];
  const campos = [
    { label: "Cliente", value: pedido.customer },
    { label: "E-mail", value: pedido.email },
    { label: "Produto", value: pedido.items },
    { label: "Categoria", value: categoriaExibida(pedido.category) },
    { label: "Data da compra", value: pedido.date },
    // Endereço de entrega informado pelo cliente no carrinho
    ...(pedido.endereco ? [{ label: "Endereço de entrega", value: pedido.endereco }] : []),
    // Atribuição da venda (código de venda usado e conta creditada)
    ...(pedido.codigoVenda ? [{ label: "Código de venda", value: pedido.codigoVenda }] : []),
    ...(pedido.vendedor ? [{ label: "Venda creditada a", value: pedido.vendedor }] : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={aoFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Detalhes da Compra</h3>
            <span className="font-mono text-[12px] text-[#C8102E] font-bold">{pedido.id}</span>
          </div>
          <button onClick={aoFechar} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={17} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {campos.map((c) => (
              <div key={c.label} className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-[12px] text-gray-400 font-semibold flex-shrink-0">{c.label}</span>
                <span className="text-[13px] text-gray-800 font-semibold text-right">{c.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] font-bold text-gray-600">Total da compra</span>
            <span className="text-xl font-black text-gray-900">{formatarMoeda(pedido.total)}</span>
          </div>

          <div>
            <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">Status do pedido</p>
            <div className="grid grid-cols-2 gap-2">
              {listaStatus.map((s) => (
                <button
                  key={s}
                  onClick={() => aoAtualizarStatus(s)}
                  className={`py-2.5 rounded-xl text-[12px] font-bold border-2 transition-all ${
                    pedido.status === s
                      ? "border-[#C8102E] bg-red-50 text-[#C8102E]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Pedidos cancelados não contam no faturamento nem no gráfico de vendas.
            </p>
          </div>

          <button
            onClick={aoFechar}
            className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-[14px]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

