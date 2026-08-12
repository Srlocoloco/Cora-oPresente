// Componente BarraFiltros
// Filtros e ordenação do catálogo. Controles nativos (select, checkbox) de
// propósito — funcionam de teclado, com leitor de tela, sem JS customizado
// que possa quebrar em algum navegador.

export type Ordenacao = "relevancia" | "menor-preco" | "maior-preco" | "avaliacao" | "novidade";
export type FaixaPreco = "" | "ate-50" | "50-150" | "150-300" | "acima-300";

export function BarraFiltros({
  marcas, marcaSelecionada, aoMudarMarca,
  faixaPreco, aoMudarFaixaPreco,
  avaliacaoMin, aoMudarAvaliacaoMin,
  apenasEstoque, aoMudarApenasEstoque,
  ordenacao, aoMudarOrdenacao,
  aoLimpar, filtrosAtivos,
}: {
  marcas: string[];
  marcaSelecionada: string;
  aoMudarMarca: (v: string) => void;
  faixaPreco: FaixaPreco;
  aoMudarFaixaPreco: (v: FaixaPreco) => void;
  avaliacaoMin: number;
  aoMudarAvaliacaoMin: (v: number) => void;
  apenasEstoque: boolean;
  aoMudarApenasEstoque: (v: boolean) => void;
  ordenacao: Ordenacao;
  aoMudarOrdenacao: (v: Ordenacao) => void;
  aoLimpar: () => void;
  filtrosAtivos: boolean;
}) {
  const classeSelect =
    "border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-700 bg-white focus-visible:outline-2 focus-visible:outline-[#A8102A] focus-visible:outline-offset-1";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5" role="group" aria-label="Filtrar e ordenar produtos">
      <select
        value={faixaPreco}
        onChange={(e) => aoMudarFaixaPreco(e.target.value as FaixaPreco)}
        className={classeSelect}
        aria-label="Filtrar por preço"
      >
        <option value="">Qualquer preço</option>
        <option value="ate-50">Até R$ 50</option>
        <option value="50-150">R$ 50 a R$ 150</option>
        <option value="150-300">R$ 150 a R$ 300</option>
        <option value="acima-300">Acima de R$ 300</option>
      </select>

      <select
        value={avaliacaoMin}
        onChange={(e) => aoMudarAvaliacaoMin(Number(e.target.value))}
        className={classeSelect}
        aria-label="Filtrar por avaliação mínima"
      >
        <option value={0}>Qualquer avaliação</option>
        <option value={4}>4 estrelas ou mais</option>
        <option value={3}>3 estrelas ou mais</option>
      </select>

      {marcas.length > 1 && (
        <select
          value={marcaSelecionada}
          onChange={(e) => aoMudarMarca(e.target.value)}
          className={classeSelect}
          aria-label="Filtrar por marca"
        >
          <option value="">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}

      <label className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-700 cursor-pointer bg-white">
        <input
          type="checkbox"
          checked={apenasEstoque}
          onChange={(e) => aoMudarApenasEstoque(e.target.checked)}
          className="w-4 h-4 accent-[#A8102A]"
        />
        Só em estoque
      </label>

      <div className="ml-auto flex items-center gap-2">
        {filtrosAtivos && (
          <button onClick={aoLimpar} className="text-[13px] font-bold text-[#A8102A] hover:underline">
            Limpar filtros
          </button>
        )}
        <select
          value={ordenacao}
          onChange={(e) => aoMudarOrdenacao(e.target.value as Ordenacao)}
          className={classeSelect}
          aria-label="Ordenar produtos por"
        >
          <option value="relevancia">Mais relevantes</option>
          <option value="menor-preco">Menor preço</option>
          <option value="maior-preco">Maior preço</option>
          <option value="avaliacao">Mais bem avaliados</option>
          <option value="novidade">Novidades</option>
        </select>
      </div>
    </div>
  );
}
