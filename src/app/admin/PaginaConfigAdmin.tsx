// Pagina Admin: PaginaConfigAdmin

import { useState } from "react";
import { Check } from "lucide-react";
import type { ConfigLoja } from "../types";

// ─── Página Configurações (Admin) ─────────────────────────────────────────────

// O Admin ajusta chave PIX, fretes, desconto PIX e comissão sem mexer no código
export function PaginaConfigAdmin({
  config,
  aoSalvar,
}: {
  config: ConfigLoja;
  aoSalvar: (c: ConfigLoja) => void;
}) {
  const [rascunho, setRascunho] = useState<ConfigLoja>(config);
  const [salvo, setSalvo] = useState(false);

  const numero = (v: string) => Number(v.replace(",", ".")) || 0;

  const salvar = () => {
    aoSalvar(rascunho);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  const campoNumero = (
    rotulo: string,
    valor: number,
    aoMudar: (n: number) => void,
    sufixo?: string
  ) => (
    <div>
      <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">{rotulo}</label>
      <div className="flex items-center gap-2">
        <input
          value={String(valor)}
          onChange={(e) => aoMudar(numero(e.target.value))}
          inputMode="decimal"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
        />
        {sufixo && <span className="text-[13px] font-bold text-gray-400 flex-shrink-0">{sufixo}</span>}
      </div>
    </div>
  );

  return (
    <div className="max-w-[640px] space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Pagamento</h3>
          <p className="text-[12px] text-gray-400">A chave PIX é usada no QR Code e no copia e cola da tela de pagamento.</p>
        </div>
        <div>
          <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">Chave PIX da loja</label>
          <input
            value={rascunho.chavePix}
            onChange={(e) => setRascunho({ ...rascunho, chavePix: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Master</h3>
          <p className="text-[12px] text-gray-400">
            Percentual que o Master ganha sobre as vendas dos vendedores (a equipe). Nas vendas
            com o próprio código, o Master já ganha 10% fixo — o mesmo do nível Diamante.
          </p>
        </div>
        {campoNumero("Comissão do Master sobre a equipe", rascunho.comissaoRecrutador, (n) => setRascunho({ ...rascunho, comissaoRecrutador: n }), "%")}
      </div>

      <button
        onClick={salvar}
        className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-4 rounded-xl transition-colors text-base flex items-center justify-center gap-2"
      >
        <Check size={17} />
        {salvo ? "Configurações salvas!" : "Salvar configurações"}
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        As senhas do Admin e do Master continuam definidas no código, por segurança.
      </p>
    </div>
  );
}
