// Componente CabecalhoCheckout
//
// Cabeçalho das telas de compra. Como nas grandes lojas, some com a busca e o
// menu: aqui a pessoa só precisa terminar a compra. Abaixo da marca, a barra
// de progresso mostra em que etapa ela está (Entrega → Pagamento → Revisão →
// Pagar) — cada etapa é uma tela própria.

import { ChevronLeft, Lock } from "lucide-react";
import { Logo } from "./Logo";

export const ETAPAS_COMPRA = ["Entrega", "Pagamento", "Revisão", "Pagar"] as const;

export function CabecalhoCheckout({
  etapa,
  aoVoltar,
  rotuloVoltar = "Voltar",
}: {
  // 1 a 4 (ver ETAPAS_COMPRA). Sem etapa (carrinho, compra concluída) a barra
  // de progresso não aparece.
  etapa?: 1 | 2 | 3 | 4;
  aoVoltar?: () => void;
  rotuloVoltar?: string;
}) {
  return (
    <header>
      <div className="bg-[#A8102A] text-white">
        <div className="max-w-[1100px] mx-auto px-4 h-[52px] flex items-center gap-3">
          {aoVoltar && (
            <button
              onClick={aoVoltar}
              aria-label={rotuloVoltar}
              className="-ml-2 p-2 flex items-center gap-1 text-[14px] text-white/90 hover:text-white"
            >
              <ChevronLeft size={20} />
              <span className="hidden md:inline">{rotuloVoltar}</span>
            </button>
          )}
          <div className={aoVoltar ? "md:ml-3" : ""}>
            <Logo claro />
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-[13px] text-white/85">
            <Lock size={14} />
            <span className="hidden sm:inline">Compra segura</span>
          </span>
        </div>
      </div>

      {etapa && (
        <nav aria-label="Etapas da compra" className="bg-white border-b border-black/10">
          <div className="max-w-[1100px] mx-auto px-4 py-3">
            {/* Celular: só a etapa atual por extenso */}
            <p className="sm:hidden text-[13px] text-gray-500 mb-2">
              Etapa {etapa} de {ETAPAS_COMPRA.length} · <span className="text-gray-900 font-semibold">{ETAPAS_COMPRA[etapa - 1]}</span>
            </p>
            <ol className="grid grid-cols-4 gap-1.5">
              {ETAPAS_COMPRA.map((nome, i) => {
                const n = i + 1;
                return (
                  <li key={nome} aria-current={n === etapa ? "step" : undefined}>
                    <span
                      className={`hidden sm:block text-[13px] mb-1.5 ${
                        n === etapa ? "text-gray-900 font-semibold" : n < etapa ? "text-gray-600" : "text-gray-400"
                      }`}
                    >
                      {n}. {nome}
                    </span>
                    <span className={`block h-1 rounded-full ${n <= etapa ? "bg-[#C8102E]" : "bg-black/10"}`} />
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
      )}
    </header>
  );
}
