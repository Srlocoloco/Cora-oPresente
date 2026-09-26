// Pagina Admin: PaginaConfigAdmin

import { useState } from "react";
import { Check } from "lucide-react";
import type { ConfigLoja } from "../types";
import { COMISSAO_MASTER_PROPRIA } from "../constantes";
import { textoCidadesAtendidas } from "../utils";

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

      {/* Frete. O banco e a API já guardavam estes quatro valores (ver
          dados.php, coleção "config") e a loja já os usava para cobrar o
          cliente — mas não havia onde mexer neles no painel. Na prática o
          preço do frete estava congelado: se a transportadora subisse o
          valor, a diferença saía do bolso da loja em toda venda até alguém
          editar o banco à mão. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Frete</h3>
          <p className="text-[12px] text-gray-400">
            O valor é escolhido pelo CEP do cliente: Curitiba e região (CEP 80000-000 a
            82999-999) pagam o frete da capital; o resto do Paraná paga o do interior. O frete
            padrão vale enquanto o cliente ainda não calculou o CEP no carrinho.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campoNumero("Frete grátis a partir de", rascunho.freteGratisAcima, (n) => setRascunho({ ...rascunho, freteGratisAcima: n }), "R$")}
          {campoNumero("Frete padrão (sem CEP)", rascunho.fretePadrao, (n) => setRascunho({ ...rascunho, fretePadrao: n }), "R$")}
          {campoNumero("Frete — Curitiba e região", rascunho.freteCapital, (n) => setRascunho({ ...rascunho, freteCapital: n }), "R$")}
          {campoNumero("Frete — interior do Paraná", rascunho.freteInterior, (n) => setRascunho({ ...rascunho, freteInterior: n }), "R$")}
        </div>
        <p className="text-[11px] text-gray-400">
          Produto marcado com “Frete grátis” no cadastro continua sem frete, seja qual for o
          valor aqui — a regra só vale quando o carrinho tem algum item sem esse selo.
        </p>
      </div>

      {/* Onde a loja entrega. É a trava que impede a loja de vender o que não
          consegue levar: o carrinho recusa o CEP de fora desta lista e o botão
          "Finalizar Compra" não passa sem CEP aceito. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Onde a loja entrega</h3>
          <p className="text-[12px] text-gray-400">
            Nomes das cidades separados por vírgula. O cliente de fora dessas cidades vê o
            aviso no carrinho e <strong>não consegue fechar a compra</strong> — é o que evita
            receber pedido pago que você não tem como entregar. Acento e maiúscula não
            importam. <strong>Deixar em branco libera todo o Paraná.</strong>
          </p>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Cidades atendidas
          </label>
          <input
            value={rascunho.cidadesAtendidas ?? ""}
            onChange={(e) => setRascunho({ ...rascunho, cidadesAtendidas: e.target.value })}
            placeholder="Ex.: Altônia, Pérola, Xambrê"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] transition-colors"
          />
          <p className="text-[11px] text-gray-400 mt-2">
            {(rascunho.cidadesAtendidas ?? "").trim() === ""
              ? "Sem restrição: qualquer CEP do Paraná é aceito."
              : `Hoje a loja entrega em ${textoCidadesAtendidas(rascunho.cidadesAtendidas)}.`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Master</h3>
          <p className="text-[12px] text-gray-400">
            Percentual que o Master ganha sobre as vendas dos vendedores (a equipe). Nas vendas
            com o próprio código, o Master já ganha {(COMISSAO_MASTER_PROPRIA * 100).toFixed(0)}% fixo.
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
