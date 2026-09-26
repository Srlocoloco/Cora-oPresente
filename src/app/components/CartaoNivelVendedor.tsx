// Componente CartaoNivelVendedor

import { NIVEIS_VENDEDOR } from "../constantes";
import { obterNivelVendedor, comissaoFracaoPorNivel, formatarMoeda } from "../utils";

// ─── Comissão do vendedor ─────────────────────────────────────────────────────
//
// Mostra ao vendedor quanto ele ganha por venda e o que ele já vendeu. Nada
// mais: é informação de pagamento, não premiação.
//
// Este componente era um card de jogo — medalhas, barra de progresso animada,
// "Faltam apenas R$ X!", "Nível máximo atingido!", lista de benefícios
// desbloqueáveis e aviso de bônus em dinheiro. Tudo isso saiu junto com o
// sistema de bônus: as medalhas e a corrida por nível prometiam prêmio, e os
// "benefícios" (banner gratuito, gerente exclusivo, campanhas gratuitas,
// early access) eram compromissos que a loja não tem como cumprir.
//
// A tabela de faixas continua, porque é ela que define a porcentagem paga —
// mas aparece como tabela de comissão, com a faixa atual em destaque.
export function CartaoNivelVendedor({ vendasDoMes, vendasTotais = 0 }: { vendasDoMes: number; vendasTotais?: number }) {
  // A faixa vale pelo TOTAL vendido (vitalício), que é a mesma base usada para
  // calcular a comissão a pagar no Financeiro — assim o número que o vendedor
  // vê aqui é o mesmo que o Admin vê lá.
  const indiceFaixa = obterNivelVendedor(vendasTotais);
  const faixaAtual = NIVEIS_VENDEDOR[indiceFaixa] ?? NIVEIS_VENDEDOR[0];
  const comissaoDoMes = vendasDoMes * comissaoFracaoPorNivel(vendasTotais);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sua comissão</p>
        <div className="flex items-end gap-2 mt-1 flex-wrap">
          <span className="text-3xl font-black text-gray-900 leading-none">{faixaAtual.commission}</span>
          <span className="text-[13px] text-gray-500 font-medium pb-0.5">por venda com o seu código</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vendas do mês</div>
          <div className="text-lg font-black text-gray-900 mt-1">{formatarMoeda(vendasDoMes)}</div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">A receber do mês</div>
          <div className="text-lg font-black text-[#A8102A] mt-1">{formatarMoeda(comissaoDoMes)}</div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vendas totais</div>
          <div className="text-lg font-black text-gray-900 mt-1">{formatarMoeda(vendasTotais)}</div>
        </div>
      </div>

      {/* Tabela de comissão: a faixa atual em destaque, as outras como
          referência de quanto passa a valer dali em diante. */}
      <div className="p-5 border-t border-gray-100">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
          Tabela de comissão
        </p>
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {NIVEIS_VENDEDOR.map((faixa, i) => (
            <div
              key={faixa.name}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] ${
                i > 0 ? "border-t border-gray-100" : ""
              } ${i === indiceFaixa ? "bg-[#C8102E]/5" : ""}`}
            >
              <span className={`font-bold ${i === indiceFaixa ? "text-[#A8102A]" : "text-gray-600"}`}>
                {faixa.name}
                {i === indiceFaixa && <span className="ml-2 text-[10px] font-black uppercase tracking-wide">você está aqui</span>}
              </span>
              <span className="text-gray-400 text-[12px] flex-1 text-right truncate">
                {faixa.max === Infinity
                  ? `acima de ${formatarMoeda(faixa.min)} vendidos`
                  : `${formatarMoeda(faixa.min)} a ${formatarMoeda(faixa.max)} vendidos`}
              </span>
              <span className={`font-black tabular-nums ${i === indiceFaixa ? "text-[#A8102A]" : "text-gray-700"}`}>
                {faixa.commission}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
