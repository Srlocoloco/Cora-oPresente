// Componente CampoCodigoVenda

import { Tag } from "lucide-react";

// ─── Campo de Código de Venda ─────────────────────────────────────────────────

// Região onde o cliente informa o código de venda de quem o atendeu.
// Com um código válido, a venda é creditada somente à conta dona do código
// (Master ou vendedor), em vez de cair para o administrador da loja.
export function CampoCodigoVenda({
  codigo,
  aoMudar,
  nomeDono,
}: {
  codigo: string;
  aoMudar: (v: string) => void;
  nomeDono: string | null;
}) {
  const digitado = codigo.trim().length > 0;
  return (
    <div className="border border-gray-100 rounded-2xl px-4 py-3 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <Tag size={14} className="text-[#C8102E]" />
        <span className="text-[13px] font-bold text-gray-800">Código de venda</span>
        <span className="text-[11px] text-gray-400 font-medium">(opcional)</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        Foi atendido por alguém da nossa equipe? Informe o código para creditar a venda a essa pessoa.
      </p>
      <input
        value={codigo}
        onChange={(e) => aoMudar(e.target.value.toUpperCase())}
        placeholder="Ex.: CV-9X2K4M"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors font-mono"
      />
      {digitado && nomeDono && (
        <div className="mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-semibold px-3 py-2 rounded-lg">
          Venda será creditada a <span className="font-black">{nomeDono}</span>
        </div>
      )}
      {digitado && !nomeDono && (
        <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium px-3 py-2 rounded-lg">
          Código não reconhecido — confira com quem te atendeu. Sem um código válido, a compra segue normalmente.
        </div>
      )}
    </div>
  );
}
