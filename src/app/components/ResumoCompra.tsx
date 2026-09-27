// Componente ResumoCompra
//
// O "Resumo da compra" da lateral (no celular, embaixo): o que está sendo
// comprado, cada valor em uma linha e o total. Mesmo desenho no carrinho, no
// checkout e no pagamento — a pessoa sempre sabe quanto vai pagar e por quê.

import type { ReactNode } from "react";
import { ImagemProduto } from "./ImagemProduto";
import { formatarMoeda } from "../utils";

export interface LinhaResumo {
  rotulo: string;
  valor: number;
  // "desconto" pinta de verde e mostra o sinal de menos
  tipo?: "normal" | "desconto";
  detalhe?: string;
}

export function ResumoCompra({
  titulo = "Resumo da compra",
  fotos = [],
  linhas,
  total,
  rotuloTotal = "Você pagará",
  observacao,
  children,
}: {
  titulo?: string;
  fotos?: { src: string; alt: string }[];
  linhas: LinhaResumo[];
  total: number;
  rotuloTotal?: string;
  observacao?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-label={titulo} className="painel">
      <h2 className="px-5 py-4 text-[17px] text-gray-900 border-b border-black/[0.08]">{titulo}</h2>
      <div className="px-5 py-4">
        {fotos.length > 0 && (
          <div className="flex gap-2 mb-4">
            {fotos.slice(0, 4).map((f, i) => (
              <div key={i} className="w-12 h-12 rounded border border-black/10 bg-white p-0.5 flex-shrink-0">
                <ImagemProduto src={f.src} alt={f.alt} className="w-full h-full object-contain" />
              </div>
            ))}
            {fotos.length > 4 && (
              <div className="w-12 h-12 rounded border border-black/10 text-[13px] text-gray-500 flex items-center justify-center">
                +{fotos.length - 4}
              </div>
            )}
          </div>
        )}
        <dl className="space-y-2.5">
          {linhas.map((l) => (
            <div key={l.rotulo} className="flex items-start justify-between gap-3 text-[14px]">
              <dt className="text-gray-600">
                {l.rotulo}
                {l.detalhe && <span className="block text-[12.5px] text-gray-400">{l.detalhe}</span>}
              </dt>
              <dd className={`tabular-nums text-right ${l.tipo === "desconto" ? "text-[#00A650]" : "text-gray-800"}`}>
                {l.tipo === "desconto" ? "- " : ""}
                {formatarMoeda(l.valor)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-black/[0.08] mt-4 pt-4 flex items-baseline justify-between gap-3">
          <span className="text-[16px] font-semibold text-gray-900">{rotuloTotal}</span>
          <span className="text-[20px] font-semibold text-gray-900 tabular-nums">{formatarMoeda(total)}</span>
        </div>
        {observacao && <div className="mt-2 text-[13px] text-gray-500 leading-snug">{observacao}</div>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}
