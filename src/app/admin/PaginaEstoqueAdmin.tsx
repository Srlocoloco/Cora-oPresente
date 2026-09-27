// Pagina Admin: PaginaEstoqueAdmin
//
// O que estava errado na tela antiga:
//  • mostrava só o estoque GERAL — num relógio com cores, "5 un." escondia que
//    a cor Prata estava zerada (e o cliente não conseguia comprá-la);
//  • o limite de "estoque baixo" era 15 fixo, enquanto a loja mostrava
//    "Últimas unidades" com outro número;
//  • o código do produto (BEL-001) mudava quando outro produto era apagado;
//  • não dava para dar entrada de mercadoria sem abrir o cadastro inteiro — e
//    salvar o cadastro regravava o estoque antigo, apagando as vendas do meio.
// Agora: estoque por cor e por tamanho, limite único (Configurações), código
// fixo e ajuste rápido que soma/subtrai sobre o estoque DE AGORA.

import { useMemo, useState } from "react";
import { Package, AlertTriangle, Boxes, Search, Minus, Plus, Pencil, Loader2, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import type { Produto } from "../types";
import { CATEGORIAS } from "../constantes";
import { formatarMoeda } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";

type Ajuste = { delta?: number; definir?: number; cor?: string; tamanho?: string };

// Uma parte do estoque de um produto: o geral, uma cor ou um tamanho.
interface ParteEstoque {
  rotulo: string;
  qtd: number;
  cor?: string;
  tamanho?: string;
}

function partesDoProduto(p: Produto): { partes: ParteEstoque[]; porVariacao: boolean } {
  if (p.tamanhos && p.tamanhos.length > 0) {
    return { porVariacao: true, partes: p.tamanhos.map((t) => ({ rotulo: `Tamanho ${t.tamanho}`, qtd: t.estoque, tamanho: t.tamanho })) };
  }
  const cores = p.colors ?? [];
  if (cores.length > 0 && cores.every((c) => typeof c.estoque === "number")) {
    return { porVariacao: true, partes: cores.map((c) => ({ rotulo: c.nome, qtd: c.estoque ?? 0, cor: c.nome })) };
  }
  return { porVariacao: false, partes: [{ rotulo: "Estoque", qtd: p.stock }] };
}

function ControleQtd({ parte, aoAjustar }: { parte: ParteEstoque; aoAjustar: (a: Ajuste) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(parte.qtd));
  const [ocupado, setOcupado] = useState(false);
  const alvo = { cor: parte.cor, tamanho: parte.tamanho };

  const aplicar = async (a: Ajuste) => {
    setOcupado(true);
    await aoAjustar({ ...a, ...alvo });
    setOcupado(false);
    setEditando(false);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => aplicar({ delta: -1 })}
        disabled={ocupado || parte.qtd <= 0}
        aria-label={`Tirar 1 de ${parte.rotulo}`}
        className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30"
      >
        <Minus size={13} />
      </button>
      {editando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(valor, 10);
            if (!Number.isFinite(n) || n < 0) return toast.error("Informe um número de 0 para cima.");
            aplicar({ definir: n });
          }}
          className="flex items-center gap-1"
        >
          <input
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onBlur={() => setTimeout(() => setEditando(false), 150)}
            inputMode="numeric"
            className="w-16 border border-[#C8102E] rounded-lg px-2 py-1 text-[13px] font-bold text-center outline-none"
          />
          <button type="submit" className="text-[12.5px] font-bold text-white bg-[#C8102E] px-2 py-1.5 rounded-lg">OK</button>
        </form>
      ) : (
        <button
          onClick={() => { setValor(String(parte.qtd)); setEditando(true); }}
          title="Clique para digitar o número exato"
          className="min-w-[46px] px-2 h-7 rounded-lg bg-gray-50 border border-gray-200 text-[13px] font-bold text-gray-900 tabular-nums hover:border-[#C8102E] flex items-center justify-center gap-1"
        >
          {ocupado ? <Loader2 size={13} className="animate-spin" /> : parte.qtd}
        </button>
      )}
      <button
        onClick={() => aplicar({ delta: 1 })}
        disabled={ocupado}
        aria-label={`Somar 1 em ${parte.rotulo}`}
        className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

export function PaginaEstoqueAdmin({
  produtos,
  estoqueBaixo,
  aoAjustar,
  aoEditarProduto,
}: {
  produtos: Produto[];
  estoqueBaixo: number;
  aoAjustar?: (id: number, ajuste: Ajuste) => Promise<string | null>;
  aoEditarProduto?: () => void;
}) {
  const [filtro, setFiltro] = useState<"todos" | "esgotados" | "baixo">("todos");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");

  const situacao = (p: Produto) => {
    const { partes, porVariacao } = partesDoProduto(p);
    const esgotadas = partes.filter((x) => x.qtd <= 0).length;
    if (p.stock <= 0) return { tipo: "esgotado" as const, texto: "Esgotado" };
    if (porVariacao && esgotadas > 0) return { tipo: "baixo" as const, texto: `${esgotadas} ${esgotadas === 1 ? "variação esgotada" : "variações esgotadas"}` };
    if (p.stock <= estoqueBaixo) return { tipo: "baixo" as const, texto: "Estoque baixo" };
    return { tipo: "ok" as const, texto: "Em estoque" };
  };

  const esgotados = produtos.filter((p) => situacao(p).tipo === "esgotado");
  const baixos = produtos.filter((p) => situacao(p).tipo === "baixo");
  const unidades = produtos.reduce((s, p) => s + Math.max(0, p.stock), 0);
  const valorEmEstoque = produtos.reduce((s, p) => s + Math.max(0, p.stock) * p.price, 0);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos
      .filter((p) => (filtro === "todos" ? true : situacao(p).tipo === (filtro === "esgotados" ? "esgotado" : "baixo")))
      .filter((p) => !categoria || p.category === categoria)
      .filter((p) => !termo || p.name.toLowerCase().includes(termo) || (p.codigo ?? "").toLowerCase().includes(termo) || p.brand.toLowerCase().includes(termo))
      // Esgotados primeiro, depois por código. Ordenar pela quantidade fazia a
      // linha "pular" de lugar a cada clique no + / −.
      .sort((a, b) => Number(b.stock <= 0) - Number(a.stock <= 0) || (a.codigo ?? a.name).localeCompare(b.codigo ?? b.name, "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, filtro, busca, categoria, estoqueBaixo]);

  const ajustar = (p: Produto) => async (a: Ajuste) => {
    if (!aoAjustar) return;
    const erro = await aoAjustar(p.id, a);
    if (erro) toast.error(erro, { duration: 7000 });
  };

  const cartoes = [
    { label: "Esgotados", valor: String(esgotados.length), icone: <Package size={22} className="text-red-500" />, dica: "o cliente não consegue comprar" },
    { label: `Estoque baixo (até ${estoqueBaixo} un.)`, valor: String(baixos.length), icone: <AlertTriangle size={22} className="text-amber-500" />, dica: "ou com alguma cor/tamanho zerado" },
    { label: "Unidades em estoque", valor: unidades.toLocaleString("pt-BR"), icone: <Boxes size={22} className="text-emerald-600" /> },
    { label: "Valor em estoque", valor: formatarMoeda(valorEmEstoque), icone: <CircleDollarSign size={22} className="text-[#C8102E]" />, dica: "pelo preço de venda" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cartoes.map((c) => (
          <div key={c.label} className="painel p-4 flex items-center gap-3">
            <span className="flex-shrink-0">{c.icone}</span>
            <div className="min-w-0">
              <div className="text-[17px] leading-tight font-bold text-gray-900 break-words">{c.valor}</div>
              <div className="text-[12.5px] text-gray-500 font-semibold">{c.label}</div>
              {c.dica && <div className="text-[12px] text-gray-400">{c.dica}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="painel p-3 flex flex-wrap items-center gap-2">
        {([["todos", `Todos (${produtos.length})`], ["esgotados", `Esgotados (${esgotados.length})`], ["baixo", `Estoque baixo (${baixos.length})`]] as const).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`px-3.5 py-2 rounded-xl text-[12px] font-bold transition-colors ${
              filtro === id ? "bg-[#C8102E] text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {rotulo}
          </button>
        ))}
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-[12px] bg-white" aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, marca ou código (BEL-001)" className="flex-1 text-[12.5px] outline-none" />
        </div>
      </div>

      <p className="text-[12px] text-gray-500 px-1">
        Use <span className="font-bold">+</span> e <span className="font-bold">−</span> para entrada e saída, ou clique no número para digitar o valor exato.
        As vendas continuam descontando sozinhas — um ajuste aqui nunca apaga uma venda que aconteceu ao mesmo tempo.
      </p>

      <div className="painel overflow-hidden">
        {visiveis.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            {filtro === "esgotados" ? "Nenhum produto esgotado. " : filtro === "baixo" ? "Nenhum produto com estoque baixo." : "Nenhum produto encontrado."}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiveis.map((p) => {
              const { partes, porVariacao } = partesDoProduto(p);
              const s = situacao(p);
              return (
                <li key={p.id} className="px-4 md:px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0 md:w-[42%]">
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center p-1 flex-shrink-0">
                      <ImagemProduto src={p.image} alt={p.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-gray-800 truncate">{p.name}</div>
                      <div className="text-[12.5px] text-gray-400 truncate">
                        <span className="font-mono font-bold text-gray-500">{p.codigo ?? "—"}</span> · {p.category} · {formatarMoeda(p.price)}
                      </div>
                      <span
                        className={`inline-block mt-1 text-[12px] font-bold px-2 py-0.5 rounded-sm ${
                          s.tipo === "esgotado" ? "bg-red-50 text-red-600" : s.tipo === "baixo" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {s.texto}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {partes.map((parte) => (
                        <div key={parte.rotulo} className="flex items-center gap-2">
                          <span className={`text-[12px] font-semibold ${parte.qtd <= 0 ? "text-red-600" : "text-gray-600"} min-w-[64px]`}>{parte.rotulo}</span>
                          {aoAjustar ? <ControleQtd parte={parte} aoAjustar={ajustar(p)} /> : <span className="font-bold">{parte.qtd}</span>}
                        </div>
                      ))}
                    </div>
                    {porVariacao && (
                      <p className="text-[12.5px] text-gray-400 mt-1.5">
                        Total: <span className="font-bold text-gray-600">{p.stock} un.</span> (soma {p.tamanhos?.length ? "dos tamanhos" : "das cores"})
                      </p>
                    )}
                  </div>
                  {aoEditarProduto && (
                    <button onClick={aoEditarProduto} className="self-start md:self-center text-[12px] font-bold text-gray-500 hover:text-[#C8102E] flex items-center gap-1">
                      <Pencil size={13} /> Cadastro
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
