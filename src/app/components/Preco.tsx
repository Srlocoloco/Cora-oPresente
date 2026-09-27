// Componente Preco
//
// O preço do jeito que as grandes lojas mostram: "R$ 110" grande, em peso
// normal, e os centavos pequenos no alto ("R$ 49⁹⁰"). Sem ",00" quando não há
// centavos. O leitor de tela ouve o valor inteiro ("R$ 49,90").

import { formatarMoeda } from "../utils";

export function Preco({
  valor,
  tamanho = 24,
  className = "",
}: {
  valor: number;
  // tamanho da fonte do número principal, em px
  tamanho?: number;
  className?: string;
}) {
  const [inteiro, centavos] = Math.abs(valor).toFixed(2).split(".");
  return (
    <span className={`inline-flex items-start leading-none tabular-nums ${className}`} style={{ fontSize: tamanho }}>
      <span className="sr-only">{formatarMoeda(valor)}</span>
      <span aria-hidden className="inline-flex items-start">
        {valor < 0 && "-"}
        <span className="mr-[0.22em]">R$</span>
        {Number(inteiro).toLocaleString("pt-BR")}
        {centavos !== "00" && <span className="text-[0.48em] mt-[0.12em] ml-[0.1em]">{centavos}</span>}
      </span>
    </span>
  );
}
