// Pagina Admin: PaginaConfigAdmin
//
// Todas as regras da loja num lugar, cada uma explicada em uma frase. A seção
// de comissões corrige o texto antigo, que dizia que o MASTER ganhava 7% — a
// regra da loja é: MasterPlus 7% nas próprias vendas; Master 2% nas próprias
// vendas + 1% sobre a rede dele. Os percentuais valem para as vendas pagas a
// partir de agora (cada venda congela a comissão no dia do pagamento).

import { useState, type ReactNode } from "react";
import { Check, Zap, Truck, MapPin, Percent, Wallet, Building2, Boxes, Loader2, AlertCircle } from "lucide-react";
import type { ConfigLoja } from "../types";
import { textoCidadesAtendidas, formatarMoeda } from "../utils";
import { regrasDaConfig, pct } from "../comissoes";

function Secao({ icone, titulo, descricao, children }: { icone: ReactNode; titulo: string; descricao: ReactNode; children: ReactNode }) {
  return (
    <section className="painel p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-red-50 text-[#C8102E] flex items-center justify-center flex-shrink-0">{icone}</span>
        <div>
          <h3 className="font-bold text-gray-900 text-[15px]">{titulo}</h3>
          <p className="text-[12.5px] text-gray-500 leading-relaxed">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CampoNumero({ rotulo, ajuda, valor, aoMudar, sufixo, prefixo }: {
  rotulo: string; ajuda?: string; valor: number; aoMudar: (n: number) => void; sufixo?: string; prefixo?: string;
}) {
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  return (
    <div>
      <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">{rotulo}</label>
      <div className="flex items-center border border-gray-200 rounded-xl focus-within:border-[#C8102E] transition-colors">
        {prefixo && <span className="pl-3 text-[13px] font-bold text-gray-400">{prefixo}</span>}
        <input
          value={texto}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d,.]/g, "");
            setTexto(v);
            const n = Number(v.replace(",", "."));
            if (Number.isFinite(n)) aoMudar(n);
          }}
          inputMode="decimal"
          className="w-full px-3 py-2.5 text-sm outline-none bg-transparent rounded-xl"
        />
        {sufixo && <span className="pr-3 text-[13px] font-bold text-gray-400">{sufixo}</span>}
      </div>
      {ajuda && <p className="text-[12.5px] text-gray-400 mt-1">{ajuda}</p>}
    </div>
  );
}

function CampoTexto({ rotulo, ajuda, valor, aoMudar, placeholder, mono }: {
  rotulo: string; ajuda?: string; valor: string; aoMudar: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">{rotulo}</label>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C8102E] transition-colors ${mono ? "font-mono" : ""}`}
      />
      {ajuda && <p className="text-[12.5px] text-gray-400 mt-1">{ajuda}</p>}
    </div>
  );
}

function Interruptor({ ligado, aoMudar, rotulo, ajuda }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string; ajuda: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoMudar(!ligado)}
        className={`mt-0.5 w-10 h-6 rounded-full relative flex-shrink-0 transition-colors ${ligado ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span>
        <span className="block text-[13px] font-semibold text-gray-800">{rotulo}</span>
        <span className="block text-[13px] text-gray-500">{ajuda}</span>
      </span>
    </label>
  );
}

export function PaginaConfigAdmin({
  config,
  aoSalvar,
}: {
  config: ConfigLoja;
  aoSalvar: (c: ConfigLoja) => Promise<string | null> | void;
}) {
  const [r, setR] = useState<ConfigLoja>(config);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const muda = <K extends keyof ConfigLoja>(campo: K, valor: ConfigLoja[K]) => {
    setR((atual) => ({ ...atual, [campo]: valor }));
    setMsg(null);
  };

  const regras = regrasDaConfig(r);
  // Exemplo concreto, porque percentual solto é difícil de visualizar
  const exemplo = 100;

  const salvar = async () => {
    setSalvando(true);
    const erro = await aoSalvar(r);
    setSalvando(false);
    setMsg(erro ? { ok: false, texto: erro } : { ok: true, texto: "Configurações salvas!" });
  };

  return (
    <div className="max-w-[760px] space-y-4 pb-24">
      <Secao
        icone={<Zap size={18} />}
        titulo="Recebimento dos clientes (PIX)"
        descricao={
          config.pixAutomatico
            ? "A API Pix do Sicredi está ligada: o pagamento é confirmado sozinho, na hora."
            : "A API Pix do Sicredi ainda não está configurada. Enquanto isso, o cliente paga pela chave abaixo (o QR já sai com o valor certo) e você confirma o recebimento em Pedidos."
        }
      >
        <CampoTexto rotulo="Chave PIX da loja" valor={r.chavePix} aoMudar={(v) => muda("chavePix", v)} mono placeholder="CNPJ, e-mail, celular ou chave aleatória" />
        {!config.pixAutomatico && (
          <Interruptor
            ligado={r.pixManual !== false}
            aoMudar={(v) => muda("pixManual", v)}
            rotulo="Aceitar PIX com confirmação manual"
            ajuda="Desligado, a loja só aceita PIX quando a API do banco estiver configurada."
          />
        )}
        <p className="text-[13px] text-gray-500">
          Cartão de crédito: {config.pagamentoCartao ? <span className="text-emerald-700 font-bold">ativo</span> : <span className="font-bold">ainda não configurado</span>} (as credenciais ficam no servidor, em config.php).
        </p>
      </Secao>

      <Secao
        icone={<Truck size={18} />}
        titulo="Frete"
        descricao="O valor é escolhido pelo CEP: Curitiba e região (CEP 80000-000 a 82999-999) pagam o frete da capital; o resto do Paraná, o do interior. Produto marcado com “Frete grátis” nunca paga frete."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoNumero rotulo="Frete grátis a partir de" prefixo="R$" valor={r.freteGratisAcima} aoMudar={(n) => muda("freteGratisAcima", n)} />
          <CampoNumero rotulo="Frete padrão (sem CEP)" prefixo="R$" valor={r.fretePadrao} aoMudar={(n) => muda("fretePadrao", n)} />
          <CampoNumero rotulo="Frete — Curitiba e região" prefixo="R$" valor={r.freteCapital} aoMudar={(n) => muda("freteCapital", n)} />
          <CampoNumero rotulo="Frete — interior do Paraná" prefixo="R$" valor={r.freteInterior} aoMudar={(n) => muda("freteInterior", n)} />
        </div>
      </Secao>

      <Secao
        icone={<MapPin size={18} />}
        titulo="Onde a loja entrega"
        descricao={<>Cidades separadas por vírgula. Cliente de fora dessas cidades <strong>não consegue fechar a compra</strong> — evita receber pedido pago que não dá para entregar. Em branco = todo o Paraná.</>}
      >
        <CampoTexto
          rotulo="Cidades atendidas"
          valor={r.cidadesAtendidas ?? ""}
          aoMudar={(v) => muda("cidadesAtendidas", v)}
          placeholder="Ex.: Altônia, Pérola, Xambrê"
          ajuda={(r.cidadesAtendidas ?? "").trim() === "" ? "Sem restrição: qualquer CEP do Paraná." : `Hoje: ${textoCidadesAtendidas(r.cidadesAtendidas)}.`}
        />
      </Secao>

      <Secao
        icone={<Percent size={18} />}
        titulo="Comissões da rede"
        descricao="Quanto cada cargo ganha em cada venda paga. Vale para as vendas pagas a partir do momento em que você salvar — as já pagas mantêm o percentual do dia."
      >
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
          <p className="text-[12px] font-bold text-purple-900">MasterPlus</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CampoNumero rotulo="Nas próprias vendas" sufixo="%" valor={r.comMasterPlusPropria} aoMudar={(n) => muda("comMasterPlusPropria", n)} />
            <CampoNumero rotulo="Na equipe direta" sufixo="%" valor={r.comMasterPlusEquipe} aoMudar={(n) => muda("comMasterPlusEquipe", n)} ajuda="vendedores que ele cadastrou" />
            <CampoNumero rotulo="Na rede dos Masters dele" sufixo="%" valor={r.comMasterPlusRepasse} aoMudar={(n) => muda("comMasterPlusRepasse", n)} ajuda="Masters que ele promoveu" />
          </div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 space-y-3">
          <p className="text-[12px] font-bold text-[#8C0E24]">Master</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoNumero rotulo="Nas próprias vendas" sufixo="%" valor={r.comMasterPropria} aoMudar={(n) => muda("comMasterPropria", n)} ajuda="venda com o código dele" />
            <CampoNumero rotulo="Na rede dele" sufixo="%" valor={r.comMasterRede} aoMudar={(n) => muda("comMasterRede", n)} ajuda="vendas dos vendedores que ele cadastrou" />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-[12px] font-bold text-gray-700 mb-1">Vendedor</p>
          <p className="text-[12.5px] text-gray-600">Faixa pelo total que já vendeu: Bronze 4% · Prata 6% (a partir de R$ 500) · Ouro 8% (R$ 1.500) · Diamante 10% (R$ 3.000).</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-[12.5px] text-gray-700 leading-relaxed">
          <p className="font-bold text-gray-900 mb-1">Exemplo: venda de {formatarMoeda(exemplo)} feita por um vendedor da rede de um Master</p>
          Vendedor (faixa Bronze) ganha {formatarMoeda(exemplo * 0.04)} · Master ganha {formatarMoeda(exemplo * regras.masterRede)} ({pct(regras.masterRede)}) ·
          MasterPlus que promoveu o Master ganha {formatarMoeda(exemplo * regras.masterPlusRepasse)} ({pct(regras.masterPlusRepasse)}).
          <br />
          Se o próprio Master vender: ele ganha {formatarMoeda(exemplo * regras.masterPropria)} ({pct(regras.masterPropria)}). Se o MasterPlus vender:{" "}
          {formatarMoeda(exemplo * regras.masterPlusPropria)} ({pct(regras.masterPlusPropria)}).
        </div>
      </Secao>

      <Secao
        icone={<Wallet size={18} />}
        titulo="Repasses (pagamento das comissões)"
        descricao="A comissão fica disponível alguns dias depois que o pedido é marcado como Entregue — o prazo em que o cliente ainda pode desistir da compra. Depois disso ela entra no próximo repasse."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoNumero rotulo="Liberar a comissão depois de" sufixo="dias" valor={r.repasseDiasLiberacao} aoMudar={(n) => muda("repasseDiasLiberacao", Math.round(n))} ajuda="contados a partir da entrega (0 = na hora)" />
          <CampoNumero rotulo="Pagar só a partir de" prefixo="R$" valor={r.repasseValorMinimo} aoMudar={(n) => muda("repasseValorMinimo", n)} ajuda="saldo menor espera acumular" />
        </div>
        <Interruptor
          ligado={Boolean(r.repasseAutomatico)}
          aoMudar={(v) => muda("repasseAutomatico", v)}
          rotulo="Fechar os repasses automaticamente"
          ajuda="Com o agendador de tarefas da hospedagem ligado, os repasses são fechados sozinhos (ver README). Você só gera o arquivo e envia ao banco."
        />
      </Secao>

      <Secao
        icone={<Building2 size={18} />}
        titulo="Conta da empresa no Sicredi"
        descricao="Usada para montar o arquivo de pagamento em lote (CNAB 240) que o Sicredi aceita: o banco paga todos os associados de uma vez, direto desta conta. O código do convênio de Pagamentos é informado pelo seu gerente."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoTexto rotulo="Razão social" valor={r.empresaNome ?? ""} aoMudar={(v) => muda("empresaNome", v)} />
          <CampoTexto rotulo="CNPJ" valor={r.empresaCnpj ?? ""} aoMudar={(v) => muda("empresaCnpj", v)} mono placeholder="00.000.000/0000-00" />
          <CampoTexto rotulo="Código do convênio (Pagamentos)" valor={r.empresaConvenio ?? ""} aoMudar={(v) => muda("empresaConvenio", v)} mono ajuda="Peça ao gerente da cooperativa" />
          <CampoTexto rotulo="Agência (cooperativa)" valor={r.empresaAgencia ?? ""} aoMudar={(v) => muda("empresaAgencia", v)} mono placeholder="0000" />
          <CampoTexto rotulo="Conta corrente" valor={r.empresaConta ?? ""} aoMudar={(v) => muda("empresaConta", v)} mono placeholder="só números" />
          <CampoTexto rotulo="Dígito da conta" valor={r.empresaContaDigito ?? ""} aoMudar={(v) => muda("empresaContaDigito", v)} mono placeholder="0" />
        </div>
      </Secao>

      <Secao
        icone={<Boxes size={18} />}
        titulo="Estoque"
        descricao="Abaixo deste número o produto aparece como “estoque baixo” no painel e a loja mostra “Últimas unidades” para o cliente."
      >
        <div className="max-w-[260px]">
          <CampoNumero rotulo="Avisar quando tiver até" sufixo="un." valor={r.estoqueBaixo} aoMudar={(n) => muda("estoqueBaixo", Math.round(n))} />
        </div>
      </Secao>

      {/* Barra de salvar sempre visível */}
      <div className="fixed bottom-0 right-0 left-0 md:left-60 bg-white/95 backdrop-blur border-t border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3 z-30">
        {msg && (
          <span className={`text-[12.5px] font-semibold flex items-center gap-1.5 ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {msg.ok ? <Check size={15} /> : <AlertCircle size={15} />} {msg.texto}
          </span>
        )}
        <button
          onClick={salvar}
          disabled={salvando}
          className="ml-auto bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Salvar configurações
        </button>
      </div>
    </div>
  );
}
