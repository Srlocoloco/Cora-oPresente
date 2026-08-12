// Componente ModalDetalhesPedido

import { useState } from "react";
import { X, Truck } from "lucide-react";
import type { Produto, Pedido, Cliente } from "../types";
import { categoriaExibida, formatarMoeda } from "../utils";

// Formato do código de postagem dos Correios: 2 letras + 9 dígitos + 2 letras
const FORMATO_RASTREIO = /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/;

export function ModalDetalhesPedido({
  pedido,
  aoFechar,
  aoAtualizarStatus,
  aoSalvarCodigoRastreio,
}: {
  pedido: Pedido;
  aoFechar: () => void;
  aoAtualizarStatus: (status: string) => void;
  aoSalvarCodigoRastreio?: (codigo: string) => void;
}) {
  const [rastreio, setRastreio] = useState(pedido.codigoRastreio ?? "");
  const [salvo, setSalvo] = useState(false);
  const rastreioNormalizado = rastreio.toUpperCase().trim();
  // Vazio é permitido: é como se apaga um código digitado errado
  const rastreioValido = rastreioNormalizado === "" || FORMATO_RASTREIO.test(rastreioNormalizado);
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

          {/* Código de postagem dos Correios: é o que faz a página "Rastrear
              Pedido" mostrar o caminho real da encomenda para o cliente. */}
          {aoSalvarCodigoRastreio && (
            <div>
              <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                Código de rastreio (Correios)
              </p>
              <div className="flex gap-2">
                <input
                  value={rastreio}
                  onChange={(e) => { setRastreio(e.target.value); setSalvo(false); }}
                  placeholder="AA123456789BR"
                  className={`flex-1 border-2 rounded-xl px-3 py-2.5 text-[13px] font-mono uppercase outline-none transition-colors ${
                    rastreioValido ? "border-gray-200 focus:border-[#C8102E]" : "border-red-300"
                  }`}
                />
                <button
                  onClick={() => { aoSalvarCodigoRastreio(rastreioNormalizado); setSalvo(true); }}
                  disabled={!rastreioValido || rastreioNormalizado === (pedido.codigoRastreio ?? "")}
                  className="bg-gray-900 hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[12px] rounded-xl px-4 transition-colors"
                >
                  Salvar
                </button>
              </div>
              <p className={`text-[11px] mt-2 flex items-center gap-1.5 ${rastreioValido ? "text-gray-400" : "text-red-500"}`}>
                <Truck size={13} className="flex-shrink-0" />
                {!rastreioValido
                  ? "Formato inválido — são 2 letras, 9 números e 2 letras (BR)."
                  : salvo
                    ? "Código salvo. O cliente já vê o rastreamento na loja."
                    : "Deixe em branco para remover. Sem código, o cliente vê só o status acima."}
              </p>
            </div>
          )}

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

