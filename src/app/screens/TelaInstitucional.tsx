// Tela TelaInstitucional
// Páginas de conteúdo abertas pelos links do rodapé (colunas Institucional e
// Atendimento). Todas compartilham o mesmo layout: cabeçalho vermelho, menu
// lateral com as outras páginas e o conteúdo próprio de cada uma.

import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronDown, Heart, Users, Star, Tag, ShoppingBag,
  LifeBuoy, Truck, Mail, Package, Check, X, Search,
  Phone, MessageCircle, MapPin, Clock, ShieldCheck, FileText,
} from "lucide-react";
import type { Pedido, Produto } from "../types";
import { formatarMoeda } from "../utils";
import { URL_BACKEND_PIX } from "../constantes";

export type PaginaInstitucional =
  | "sobre" | "trabalhe"
  | "ajuda" | "rastreio" | "contato" | "privacidade" | "termos";

// Título e ícone de cada página, usados no cabeçalho e no menu lateral
const PAGINAS: Record<PaginaInstitucional, { titulo: string; grupo: "Institucional" | "Atendimento"; icone: React.ReactNode }> = {
  sobre: { titulo: "Sobre Nós", grupo: "Institucional", icone: <Heart size={16} /> },
  trabalhe: { titulo: "Trabalhe Conosco", grupo: "Institucional", icone: <Users size={16} /> },
  ajuda: { titulo: "Central de Ajuda", grupo: "Atendimento", icone: <LifeBuoy size={16} /> },
  rastreio: { titulo: "Rastrear Pedido", grupo: "Atendimento", icone: <Truck size={16} /> },
  contato: { titulo: "Fale Conosco", grupo: "Atendimento", icone: <Mail size={16} /> },
  privacidade: { titulo: "Política de Privacidade", grupo: "Atendimento", icone: <ShieldCheck size={16} /> },
  termos: { titulo: "Termos de Uso", grupo: "Atendimento", icone: <FileText size={16} /> },
};

// Canais de atendimento — um lugar só, usados na Central de Ajuda e no Fale Conosco
const CANAIS = [
  { icone: <MessageCircle size={18} />, titulo: "WhatsApp", detalhe: "(44) 99921-8154", nota: "Seg a sex, 9h às 18h" },
  { icone: <Phone size={18} />, titulo: "Telefone", detalhe: "(44) 99921-8154", nota: "Seg a sex, 9h às 18h" },
  { icone: <Mail size={18} />, titulo: "E-mail", detalhe: "contato@coracaopresente.com.br", nota: "Resposta em até 24h úteis" },
];

const PERGUNTAS = [
  {
    p: "Em quanto tempo meu pedido chega?",
    r: "O pedido é preparado assim que o pagamento é confirmado. O prazo depende do seu endereço e aparece no carrinho junto com o frete, calculado pelo CEP. Qualquer dúvida sobre um pedido específico, chame a gente no WhatsApp.",
  },
  {
    p: "Quais formas de pagamento vocês aceitam?",
    r: "Cartão de crédito parcelado em até 12x, PIX (com desconto em vários produtos) e cartão de débito. O pedido só é preparado depois que o pagamento é aprovado.",
  },
  {
    p: "O frete é grátis?",
    r: "Compras acima de um valor mínimo têm frete grátis. Tanto esse valor quanto o frete da sua região aparecem no carrinho depois que você informa o CEP.",
  },
  {
    p: "Como acompanho o andamento da compra?",
    r: "Pela página Rastrear Pedido, aqui mesmo no rodapé, ou pelo sino de notificações quando você está logado. Cada mudança de status aparece automaticamente.",
  },
  {
    p: "Posso trocar um produto que não serviu?",
    r: "Pode. Você tem 7 dias corridos para desistir da compra e até 30 dias para trocar por defeito. Fale com a gente pelo WhatsApp ou e‑mail com o número do pedido que a gente resolve.",
  },
  {
    p: "Como funciona o código de vendedor?",
    r: "Se alguém te indicou a loja, é só digitar o código de venda no carrinho. A comissão daquela compra vai para quem te indicou, sem custo nenhum para você.",
  },
];

// ─── Blocos de conteúdo reaproveitados pelas páginas ──────────────────────────

function Secao({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-7">
      {titulo && <h2 className="font-black text-[#4A1218] text-base md:text-lg mb-3">{titulo}</h2>}
      <div className="space-y-3 text-[13px] md:text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

function Numeros({ itens }: { itens: { valor: string; rotulo: string; icone: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {itens.map((n) => (
        <div key={n.rotulo} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <span className="w-8 h-8 rounded-full bg-[#FBF4EA] text-[#C8102E] flex items-center justify-center mx-auto mb-2">
            {n.icone}
          </span>
          <p className="font-black text-[#C8102E] text-xl md:text-2xl">{n.valor}</p>
          <p className="text-[11px] text-gray-500 mt-1 leading-tight">{n.rotulo}</p>
        </div>
      ))}
    </div>
  );
}

// Números da loja calculados na hora a partir do catálogo que veio do banco —
// nada é fixo no código, então o que aparece aqui é sempre o estado real da
// loja. Só usamos dados públicos (produtos e o resumo de avaliações): pedidos e
// clientes o backend nem manda para quem não está logado.
function NumerosDaLoja({ produtos }: { produtos: Produto[] }) {
  const dados = useMemo(() => {
    const categorias = new Set(produtos.map((p) => p.category).filter(Boolean));
    const avaliacoes = produtos.reduce((soma, p) => soma + (p.reviews || 0), 0);
    const somaNotas = produtos.reduce((soma, p) => soma + (p.rating || 0) * (p.reviews || 0), 0);
    const media = avaliacoes > 0 ? somaNotas / avaliacoes : 0;
    return { categorias: categorias.size, avaliacoes, media };
  }, [produtos]);

  if (produtos.length === 0) return null;

  return (
    <Numeros
      itens={[
        { icone: <ShoppingBag size={15} />, valor: String(produtos.length), rotulo: produtos.length === 1 ? "Produto no catálogo" : "Produtos no catálogo" },
        { icone: <Tag size={15} />, valor: String(dados.categorias), rotulo: dados.categorias === 1 ? "Categoria" : "Categorias" },
        { icone: <Star size={15} />, valor: String(dados.avaliacoes), rotulo: dados.avaliacoes === 1 ? "Avaliação de cliente" : "Avaliações de clientes" },
        {
          icone: <Heart size={15} />,
          valor: dados.avaliacoes > 0 ? `${dados.media.toFixed(1).replace(".", ",")}/5` : "—",
          rotulo: dados.avaliacoes > 0 ? "Nota média dos clientes" : "Sem avaliações ainda",
        },
      ]}
    />
  );
}

function ListaCanais() {
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {CANAIS.map((c) => (
        <div key={c.titulo} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <span className="w-9 h-9 rounded-full bg-[#FBF4EA] text-[#C8102E] flex items-center justify-center mb-3">
            {c.icone}
          </span>
          <p className="font-bold text-[13px] text-gray-800">{c.titulo}</p>
          <p className="text-[12px] text-gray-600 mt-0.5 break-all">{c.detalhe}</p>
          <p className="text-[11px] text-gray-400 mt-1">{c.nota}</p>
        </div>
      ))}
    </div>
  );
}

function Pergunta({ p, r }: { p: string; r: string }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setAberta((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-[#FBF4EA]/60 transition-colors"
      >
        <span className="font-semibold text-[13px] text-gray-800">{p}</span>
        <ChevronDown size={18} className={`text-gray-400 flex-shrink-0 transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      {aberta && <p className="px-4 pb-4 text-[12.5px] text-gray-600 leading-relaxed">{r}</p>}
    </div>
  );
}

// ─── Rastreamento: acha o pedido do cliente pelo número ───────────────────────

// "Pago" é o primeiro estado de todo pedido (ver confirmarPagamento em
// App.tsx). Sem ele nesta lista, indexOf devolvia -1 e o rastreamento de quem
// tinha acabado de pagar aparecia com TODAS as etapas apagadas — a leitura
// natural é "pagaram e não fizeram nada com o meu pedido", justo na hora de
// maior ansiedade da compra.
const ETAPAS = ["Pago", "Processando", "Em trânsito", "Entregue"];

// Texto de cada etapa, na mesma ordem de ETAPAS
const DESCRICAO_ETAPA = [
  "Pagamento confirmado. Recebemos seu pedido.",
  "Pedido em separação para envio.",
  "Pedido despachado e a caminho do endereço de entrega.",
  "Pedido entregue ao destinatário.",
];

// Um evento do rastreamento dos Correios, como o backend entrega
type EventoRastreio = {
  descricao: string;
  detalhe?: string | null;
  data?: string | null;
  local?: string | null;
};

// O que a tela precisa mostrar. Vem da consulta ao servidor (que traz os
// eventos dos Correios) e, para o cliente logado, do pedido já carregado
// — que é o único com o endereço de entrega.
type PedidoRastreado = Pick<Pedido, "id" | "items" | "total" | "status" | "date"> & {
  endereco?: string;
  codigoRastreio?: string | null;
  eventos?: EventoRastreio[] | null;
};

// "2026-08-11T14:32:00" → "11/08/2026 às 14:32"
function dataHoraEvento(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Rastreamento({
  pedidos, emailPadrao, pedidoInicial, aoVerPedidos,
}: {
  pedidos: Pedido[];
  emailPadrao?: string;
  // Número que veio no link do e-mail/notificação (?pedido=...)
  pedidoInicial?: string;
  aoVerPedidos?: () => void;
}) {
  const [codigo, setCodigo] = useState(pedidoInicial ?? "");
  const [email, setEmail] = useState(emailPadrao ?? "");
  const [encontrado, setEncontrado] = useState<PedidoRastreado | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const rastrear = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = codigo.trim();
    const mail = email.trim();
    if (!id) return;
    setEncontrado(null);
    setErro("");

    // O pedido pode já estar carregado (cliente logado) — é a única fonte do
    // endereço de entrega. Mesmo assim consultamos o servidor, porque é de lá
    // que vêm os eventos dos Correios, que o navegador não tem.
    const local = pedidos.find((o) => o.id.toLowerCase() === id.toLowerCase());

    if (!mail) {
      if (local) { setEncontrado(local); return; }
      setErro("Informe o e-mail usado na compra para consultar o pedido.");
      return;
    }

    setCarregando(true);
    try {
      const resposta = await fetch(
        `${URL_BACKEND_PIX}/api/pedidos/rastrear?id=${encodeURIComponent(id)}&email=${encodeURIComponent(mail)}`,
      );
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        // Servidor recusou, mas o pedido está na conta: mostra o que temos
        if (local) { setEncontrado(local); return; }
        setErro(dados?.erro || "Não foi possível consultar o pedido agora.");
        return;
      }
      setEncontrado({ ...(dados as PedidoRastreado), endereco: local?.endereco });
    } catch {
      if (local) { setEncontrado(local); return; }
      setErro("Sem conexão com o servidor. Tente de novo em instantes.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      <Secao titulo="Rastrear pedido">
        <p>
          Digite o número do pedido (ele aparece na confirmação da compra e no e-mail
          que você recebeu) e o e-mail usado na compra.
        </p>
        <form onSubmit={rastrear} className="flex flex-col gap-2 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Nº do pedido — ex.: PED-1024"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C8102E] transition-colors"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail da compra"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-[#C8102E] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={carregando || codigo.trim() === ""}
            className="bg-[#C8102E] hover:bg-[#a60d26] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[13px] rounded-xl px-5 py-2.5 flex items-center justify-center gap-2 transition-colors sm:self-start"
          >
            <Search size={16} /> {carregando ? "Consultando..." : "Rastrear"}
          </button>
        </form>
      </Secao>

      {erro !== "" && (
        <Secao>
          <div className="text-center py-4 text-gray-400">
            <Package size={32} strokeWidth={1} className="mx-auto mb-2" />
            <p className="text-[13px] font-medium text-gray-500">{erro}</p>
            <p className="text-[12px] mt-1">Confira o número do pedido e o e-mail usado na compra.</p>
          </div>
        </Secao>
      )}

      {encontrado && (
        <Secao titulo={`Pedido ${encontrado.id}`}>
          <p className="text-[12px] text-gray-400 -mt-1">
            {encontrado.items} · {formatarMoeda(encontrado.total)} · {encontrado.date}
          </p>
          {encontrado.status === "Cancelado" ? (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-[13px] font-semibold">
              <X size={16} /> Este pedido foi cancelado.
            </div>
          ) : (
            <ol className="pt-2 space-y-4">
              {ETAPAS.map((etapa, i) => {
                const atual = ETAPAS.indexOf(encontrado.status);
                const feito = atual >= i;
                return (
                  <li key={etapa} className="flex items-start gap-3">
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        feito ? "bg-[#C8102E] text-white" : "bg-gray-100 text-gray-300"
                      }`}
                    >
                      {feito ? <Check size={15} /> : <Clock size={14} />}
                    </span>
                    <div>
                      <p className={`text-[13px] font-semibold ${feito ? "text-gray-800" : "text-gray-400"}`}>{etapa}</p>
                      <p className="text-[11.5px] text-gray-400">{DESCRICAO_ETAPA[i]}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {encontrado.endereco && (
            <p className="flex items-start gap-1.5 text-[12px] text-gray-500 pt-1">
              <MapPin size={14} className="mt-[1px] flex-shrink-0 text-gray-400" /> {encontrado.endereco}
            </p>
          )}

          {/* Código de postagem: o cliente pode conferir direto no site dos
              Correios, mesmo que a consulta automática esteja indisponível. */}
          {encontrado.codigoRastreio && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#FBF4EA] rounded-xl px-4 py-3">
              <span className="text-[12px] text-gray-500 font-semibold">Código dos Correios</span>
              <span className="font-mono text-[13px] font-bold text-gray-800">{encontrado.codigoRastreio}</span>
              <a
                href={`https://rastreamento.correios.com.br/app/index.php?objeto=${encontrado.codigoRastreio}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-bold text-[#C8102E] hover:underline"
              >
                Ver no site dos Correios
              </a>
            </div>
          )}
        </Secao>
      )}

      {/* Caminho real da encomenda, direto da API dos Correios (mais recente
          primeiro). Só aparece depois que o objeto é postado. */}
      {encontrado?.eventos && encontrado.eventos.length > 0 && (
        <Secao titulo="Movimentação nos Correios">
          <ol className="space-y-4 pt-1">
            {encontrado.eventos.map((ev, i) => (
              <li key={`${ev.data}-${i}`} className="flex items-start gap-3">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    i === 0 ? "bg-[#C8102E] text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <Truck size={14} />
                </span>
                <div>
                  <p className={`text-[13px] font-semibold ${i === 0 ? "text-gray-800" : "text-gray-500"}`}>
                    {ev.descricao}
                  </p>
                  {ev.detalhe && <p className="text-[11.5px] text-gray-400">{ev.detalhe}</p>}
                  <p className="text-[11.5px] text-gray-400">
                    {[dataHoraEvento(ev.data), ev.local].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Secao>
      )}

      {aoVerPedidos && (
        <button
          onClick={aoVerPedidos}
          className="text-[#C8102E] font-bold text-[13px] hover:underline"
        >
          Ver todos os meus pedidos
        </button>
      )}
    </>
  );
}

// ─── Conteúdo de cada página ──────────────────────────────────────────────────

function Conteudo({
  pagina, pedidos, produtos, emailUsuario, pedidoInicial, aoVerPedidos, aoIrPara,
}: {
  pagina: PaginaInstitucional;
  pedidos: Pedido[];
  emailUsuario?: string;
  pedidoInicial?: string;
  produtos: Produto[];
  aoVerPedidos?: () => void;
  aoIrPara: (p: PaginaInstitucional) => void;
}) {
  switch (pagina) {
    case "sobre":
      return (
        <>
          <Secao titulo="Presentes que dizem o que a gente sente">
            <p>
              {/* Dizia "entrega para todo o Brasil", mas o carrinho recusa
                  qualquer CEP fora do Paraná ("No momento entregamos apenas no
                  Paraná"). Quem vinha de outro estado montava a compra inteira
                  e só descobria na hora de fechar — cliente irritado, venda
                  perdida e propaganda enganosa de brinde. O texto agora diz o
                  que o site realmente faz. */}
              A Coração Presente é uma loja online de presentes e acessórios tocada de Altônia, no
              noroeste do Paraná, e entrega em todo o estado do Paraná. A ideia é simples: escolher um
              presente devia ser tão bom quanto recebê‑lo.
            </p>
            <p>
              Trabalhamos com uma vitrine enxuta e escolhida a dedo, em vez de um catálogo gigante que
              ninguém consegue olhar até o fim. Os números abaixo são do nosso catálogo agora, neste
              instante — nada de propaganda.
            </p>
          </Secao>
          <NumerosDaLoja produtos={produtos} />
          <Secao titulo="No que a gente acredita">
            <ul className="space-y-2">
              {[
                ["Curadoria de verdade", "Só vendemos o que colocaríamos na nossa própria lista de presentes."],
                ["Preço honesto", "Sem preço inflado para fingir desconto depois."],
                ["Atendimento humano", "Do outro lado da conversa tem sempre uma pessoa."],
                ["Gente crescendo junto", "Nossa rede de vendedores transforma indicação em renda real."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-2">
                  <Heart size={15} className="text-[#C8102E] flex-shrink-0 mt-[3px]" />
                  <span><strong className="text-gray-800">{t}:</strong> {d}</span>
                </li>
              ))}
            </ul>
          </Secao>
        </>
      );

    case "trabalhe":
      return (
        <>
          <Secao titulo="Venha trabalhar com a gente">
            <p>
              Somos um time pequeno, tocado de Altônia/PR, que decide rápido e gosta de ver o resultado
              no mesmo dia. A porta principal aqui é a rede de vendedores — dá para começar hoje, de
              casa, sem processo seletivo.
            </p>
          </Secao>
          <Secao titulo="Currículo">
            <p>
              No momento não temos vaga com carteira assinada aberta. Se quiser deixar seu currículo
              guardado para quando abrir, é só mandar para{" "}
              <a href="mailto:contato@coracaopresente.com.br" className="text-[#C8102E] font-semibold hover:underline">
                contato@coracaopresente.com.br
              </a>{" "}
              ou falar com a gente no WhatsApp{" "}
              <a href="https://wa.me/5544999218154" target="_blank" rel="noreferrer" className="text-[#C8102E] font-semibold hover:underline">
                (44) 99921-8154
              </a>.
            </p>
          </Secao>
          <Secao titulo="Quer vender sem sair de casa?">
            <p>
              Além das vagas fixas, temos a rede de vendedores: você recebe um código de venda, indica os
              produtos e ganha comissão em cada compra feita com o seu código. Peça o seu convite pelo{" "}
              <button onClick={() => aoIrPara("contato")} className="text-[#C8102E] font-semibold hover:underline">
                Fale Conosco
              </button>.
            </p>
          </Secao>
        </>
      );

    case "ajuda":
      return (
        <>
          <Secao titulo="Como podemos ajudar?">
            <p>Reunimos aqui as dúvidas que mais chegam no atendimento. Se a sua não estiver na lista, fale com a gente.</p>
          </Secao>
          <div className="space-y-2">
            {PERGUNTAS.map((f) => <Pergunta key={f.p} {...f} />)}
          </div>
          <button
            onClick={() => aoIrPara("rastreio")}
            className="w-full bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-left hover:border-[#C8102E]/40 transition-colors"
          >
            <Truck size={18} className="text-[#C8102E] mb-2" />
            <p className="font-bold text-[13px] text-gray-800">Rastrear pedido</p>
            <p className="text-[11.5px] text-gray-400">Veja onde está sua compra.</p>
          </button>
          <ListaCanais />
        </>
      );

    case "rastreio":
      return <Rastreamento pedidos={pedidos} emailPadrao={emailUsuario} pedidoInicial={pedidoInicial} aoVerPedidos={aoVerPedidos} />;

    case "contato":
      return (
        <>
          <Secao titulo="Fale conosco">
            <p>
              Atendemos de segunda a sexta, das 9h às 18h. Tenha o número do pedido em mãos — a conversa
              anda bem mais rápido assim.
            </p>
          </Secao>
          <ListaCanais />
          <Secao titulo="Onde estamos">
            <p className="flex items-start gap-2">
              <MapPin size={15} className="text-[#C8102E] flex-shrink-0 mt-[3px]" />
              Altônia/PR — CEP 87551-068
            </p>
            <p className="text-[12px] text-gray-400">
              Coração Presente LTDA · CNPJ 68.076.424/0001-73. Loja 100% online, sem atendimento presencial.
            </p>
          </Secao>
          <Secao titulo="Antes de escrever">
            <p>
              Muita coisa se resolve em segundos na{" "}
              <button onClick={() => aoIrPara("ajuda")} className="text-[#C8102E] font-semibold hover:underline">Central de Ajuda</button>{" "}
              ou na página de{" "}
              <button onClick={() => aoIrPara("rastreio")} className="text-[#C8102E] font-semibold hover:underline">Rastrear Pedido</button>.
            </p>
          </Secao>
        </>
      );

    case "privacidade":
      return (
        <>
          <Secao titulo="Quais dados coletamos">
            <p>
              Para processar seu pedido, coletamos nome, e-mail, endereço de entrega e dados de pagamento
              (processados diretamente pela operadora/banco — não guardamos número de cartão). Ao navegar,
              também usamos cookies essenciais para o carrinho e o login funcionarem.
            </p>
          </Secao>
          <Secao titulo="Como usamos seus dados">
            <ul className="space-y-2">
              <li className="flex gap-2"><Check size={15} className="text-[#C8102E] flex-shrink-0 mt-[3px]" /><span>Processar e entregar seu pedido, e avisar sobre o andamento dele.</span></li>
              <li className="flex gap-2"><Check size={15} className="text-[#C8102E] flex-shrink-0 mt-[3px]" /><span>Atender você quando entra em contato pelo suporte.</span></li>
              <li className="flex gap-2"><Check size={15} className="text-[#C8102E] flex-shrink-0 mt-[3px]" /><span>Enviar novidades e ofertas por e-mail, só para quem se cadastrou na newsletter.</span></li>
            </ul>
            <p className="mt-2">
              Não vendemos seus dados a terceiros. Compartilhamos o mínimo necessário com quem processa o
              pagamento e a entrega (transportadora), só para viabilizar a compra.
            </p>
          </Secao>
          <Secao titulo="Seus direitos (LGPD)">
            <p>
              Você pode pedir a qualquer momento para ver, corrigir ou apagar seus dados, e cancelar a
              newsletter quando quiser. É só falar com a gente pelos canais abaixo.
            </p>
          </Secao>
          <ListaCanais />
        </>
      );

    case "termos":
      return (
        <>
          <Secao titulo="Sobre a loja">
            <p>
              A Coração Presente é uma loja 100% online. Ao comprar aqui, você concorda com estas condições
              e com o Código de Defesa do Consumidor.
            </p>
          </Secao>
          <Secao titulo="Pedidos e pagamento">
            <p>
              O pedido é confirmado após o pagamento ser aprovado (PIX ou cartão de crédito). Os preços e a
              disponibilidade dos produtos podem mudar sem aviso prévio, mas nunca depois que o pedido é
              confirmado.
            </p>
          </Secao>
          <Secao titulo="Entrega">
            <p>
              Entregamos em todo o estado do Paraná. O prazo estimado aparece no carrinho ao informar o CEP,
              antes de fechar a compra.
            </p>
          </Secao>
          <Secao titulo="Dúvidas">
            <p>
              Qualquer dúvida sobre estes termos, fale com a gente pela{" "}
              <button onClick={() => aoIrPara("contato")} className="text-[#C8102E] font-semibold hover:underline">Central de Atendimento</button>.
            </p>
          </Secao>
        </>
      );
  }
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export function TelaInstitucional({
  pagina, aoTrocarPagina, aoVoltar, pedidos = [], produtos = [], emailUsuario, pedidoInicial, aoVerPedidos,
}: {
  pagina: PaginaInstitucional;
  aoTrocarPagina: (p: PaginaInstitucional) => void;
  aoVoltar: () => void;
  pedidos?: Pedido[];
  produtos?: Produto[];
  emailUsuario?: string;
  pedidoInicial?: string;
  aoVerPedidos?: () => void;
}) {
  const irPara = (p: PaginaInstitucional) => {
    aoTrocarPagina(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const chaves = Object.keys(PAGINAS) as PaginaInstitucional[];
  const grupos: ("Institucional" | "Atendimento")[] = ["Institucional", "Atendimento"];

  return (
    <div className="min-h-screen bg-[#FBF4EA] pb-20 md:pb-10" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-[#C8102E] px-4 py-4">
        <div className="max-w-[980px] mx-auto flex items-center gap-3">
          <button onClick={aoVoltar} className="text-white/90 hover:text-white transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div>
            <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wide">{PAGINAS[pagina].grupo}</p>
            <h1 className="text-white font-black text-lg leading-tight">{PAGINAS[pagina].titulo}</h1>
          </div>
        </div>
      </div>

      {/* Atalhos entre as páginas: rolagem horizontal no celular, coluna no desktop */}
      <div className="max-w-[980px] mx-auto px-4 py-5 md:flex md:gap-6 md:items-start">
        <nav className="md:w-56 md:flex-shrink-0 md:sticky md:top-5">
          <div className="flex gap-2 overflow-x-auto pb-3 md:flex-col md:overflow-visible md:pb-0 md:gap-5">
            {grupos.map((g) => (
              <div key={g} className="contents md:block">
                <p className="hidden md:block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-2">{g}</p>
                <div className="contents md:block md:space-y-1">
                  {chaves.filter((k) => PAGINAS[k].grupo === g).map((k) => (
                    <button
                      key={k}
                      onClick={() => irPara(k)}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors md:w-full ${
                        k === pagina
                          ? "bg-[#C8102E] text-white"
                          : "bg-white text-gray-600 border border-gray-100 hover:text-[#C8102E] md:bg-transparent md:border-0"
                      }`}
                    >
                      {PAGINAS[k].icone} {PAGINAS[k].titulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0 space-y-3">
          <Conteudo pagina={pagina} pedidos={pedidos} produtos={produtos} emailUsuario={emailUsuario} pedidoInicial={pedidoInicial} aoVerPedidos={aoVerPedidos} aoIrPara={irPara} />
        </div>
      </div>
    </div>
  );
}
