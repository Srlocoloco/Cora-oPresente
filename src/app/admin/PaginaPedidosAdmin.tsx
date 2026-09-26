// Pagina Admin: PaginaPedidosAdmin

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import type { Produto, Pedido, Cliente } from "../types";
import { formatarMoeda } from "../utils";
import { SeloStatus } from "../components/SeloStatus";
import { ProdutoDoPedido } from "../components/ProdutoDoPedido";
import { ModalDetalhesPedido } from "../components/ModalDetalhesPedido";

// ─── Orders Admin ─────────────────────────────────────────────────────────────

export function PaginaPedidosAdmin({
  pedidos,
  produtos,
  aoVerProdutoNaLoja,
  entregadores = [],
  aoDefinirEntregador,
  aoAtualizarStatus,
  comissaoPorPedido,
  modo = "admin",
}: {
  pedidos: Pedido[];
  // Contas com cargo de entregador, para o Admin escolher quem leva o pedido
  entregadores?: Cliente[];
  aoDefinirEntregador?: (id: string, email: string | null) => void;
  // Catálogo: é dele que sai a foto do produto de cada pedido
  produtos: Produto[];
  // Abre o produto na loja, para conferir a página que o cliente viu
  aoVerProdutoNaLoja?: (produto: Produto) => void;
  aoAtualizarStatus: (id: string, mudancas: { status?: string; codigoRastreio?: string }) => void;
  // Quando informada, mostra quanto a conta logada ganha de comissão em cada
  // venda (vendedor: comissão do nível atual em todas as linhas · master:
  // varia linha a linha — 7% fixo nas próprias vendas, % da equipe nas dos
  // vendedores, e nada nas vendas sem código)
  comissaoPorPedido?: (o: Pedido) => number;
  // Status do pedido e o botão de "ver detalhes" (endereço, forma de
  // pagamento etc.) são operacionais — só o Admin cuida da entrega e por
  // isso só ele vê essas colunas. Master/MasterPlus/Vendedor só acompanham
  // o valor da própria comissão em cada venda.
  modo?: "admin" | "master" | "masterplus" | "vendedor";
}) {
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null);
  const ehAdmin = modo === "admin";
  // "Pago" é o status com que TODO pedido nasce (ver confirmarPagamento em
  // App.tsx): é o pedido que já foi pago e ainda não foi separado. Ele estava
  // faltando nesta lista — ou seja, justamente a fila de trabalho do dia não
  // tinha filtro, e a soma dos números dos botões não fechava com o total.
  const listaStatus = ["Todos", "Pago", "Processando", "Em trânsito", "Entregue", "Cancelado"];

  // ─── Uma linha por COMPRA, não por produto ──────────────────────────────────
  //
  // Cada produto do carrinho vira um pedido separado no banco — é o que dá
  // baixa certa no estoque e deixa acompanhar item a item. Mas na tela isso
  // aparecia como três pedidos diferentes para a mesma pessoa, no mesmo
  // endereço, no mesmo dia: três linhas para separar quando é uma caixa só.
  //
  // O campo compraId carimba as linhas do mesmo carrinho, e é por ele que elas
  // voltam a ser uma compra aqui. Pedido antigo não tem compraId — cai no
  // próprio número e continua sendo uma linha, como sempre foi.
  const compras = useMemo(() => {
    const porCompra = new Map<string, Pedido[]>();
    for (const o of pedidos) {
      const chave = o.compraId || o.id;
      const grupo = porCompra.get(chave);
      if (grupo) grupo.push(o);
      else porCompra.set(chave, [o]);
    }
    // entries(), não values(): a chave da compra é usada no key da linha e
    // para reencontrar o grupo quando o Admin abre os detalhes.
    return [...porCompra.entries()].map(([chave, linhas]) => {
      const primeira = linhas[0];
      // Status da compra: se as linhas divergirem (só acontece se alguém mexeu
      // linha a linha no banco), mostra a etapa MENOS avançada — é a que ainda
      // precisa de trabalho, e é o que o Admin precisa ver.
      const ordem = ["Cancelado", "Pago", "Processando", "Em trânsito", "Entregue"];
      const status = linhas
        .map((l) => l.status)
        .sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))[0];
      return {
        chave,
        linhas,
        ids: linhas.map((l) => l.id),
        primeira,
        status,
        total: linhas.reduce((soma, l) => soma + l.total, 0),
        comissao: comissaoPorPedido
          ? linhas.reduce((soma, l) => soma + (l.status === "Cancelado" ? 0 : comissaoPorPedido(l)), 0)
          : 0,
      };
    });
  }, [pedidos, comissaoPorPedido]);

  const visiveis = filtroStatus === "Todos" ? compras : compras.filter((c) => c.status === filtroStatus);
  const contagens = listaStatus.reduce((acum, s) => {
    acum[s] = s === "Todos" ? compras.length : compras.filter((c) => c.status === s).length;
    return acum;
  }, {} as Record<string, number>);
  const mostrarComissao = comissaoPorPedido !== undefined;
  const totalColunas = 5 + (ehAdmin ? 1 : 0) + (mostrarComissao ? 1 : 0) + (ehAdmin ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {listaStatus.map((s) => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors flex items-center gap-1.5 ${
              filtroStatus === s ? "bg-[#C8102E] text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]"
            }`}
          >
            {s}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${filtroStatus === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {contagens[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold">Pedido</th>
                <th className="text-left px-5 py-3.5 font-semibold">Cliente</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Produto</th>
                <th className="text-left px-5 py-3.5 font-semibold">Total</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Data</th>
                {ehAdmin && <th className="text-left px-5 py-3.5 font-semibold">Status</th>}
                {mostrarComissao && <th className="text-left px-5 py-3.5 font-semibold">Sua comissão</th>}
                {ehAdmin && <th className="px-5 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={totalColunas} className="px-5 py-12 text-center text-gray-400 text-[13px]">
                    Nenhum pedido encontrado — as compras dos clientes aparecerão aqui.
                  </td>
                </tr>
              )}
              {visiveis.map((c) => {
                const o = c.primeira;
                const varios = c.linhas.length > 1;
                return (
                  <tr key={c.chave} className="hover:bg-gray-50/70 transition-colors align-top">
                    <td className="px-5 py-4 font-mono text-[12px] text-[#C8102E] font-bold whitespace-nowrap">
                      {o.id}
                      {varios && (
                        <div className="font-sans text-[10px] font-black text-gray-400 mt-0.5">
                          +{c.linhas.length - 1} {c.linhas.length - 1 === 1 ? "item" : "itens"}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#C8102E]/10 text-[#C8102E] text-[11px] font-black flex items-center justify-center flex-shrink-0">
                          {o.customer[0]}
                        </div>
                        <span className="font-semibold text-gray-800">{o.customer}</span>
                      </div>
                    </td>
                    {/* Todos os produtos da compra, um embaixo do outro: é o
                        que vai junto na mesma caixa, para o mesmo endereço. */}
                    <td className="px-5 py-4 text-[12px] text-gray-500 hidden md:table-cell max-w-[280px]">
                      <div className="space-y-2">
                        {c.linhas.map((l) => (
                          <ProdutoDoPedido
                            key={l.id}
                            produto={produtos.find((p) => p.id === l.produtoId)}
                            descricao={l.items}
                            aoAbrir={aoVerProdutoNaLoja}
                            tamanhoFoto="w-9 h-9"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-black text-gray-900 whitespace-nowrap">
                      {formatarMoeda(c.total)}
                      {varios && (
                        <div className="text-[10px] font-semibold text-gray-400">
                          {c.linhas.length} itens
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-gray-400 hidden lg:table-cell whitespace-nowrap">{o.date}</td>
                    {ehAdmin && (
                      <td className="px-5 py-4"><SeloStatus status={c.status} /></td>
                    )}
                    {mostrarComissao && (
                      <td className="px-5 py-4 font-black text-emerald-600 whitespace-nowrap">
                        {c.comissao > 0 ? `+${formatarMoeda(c.comissao)}` : "—"}
                      </td>
                    )}
                    {ehAdmin && (
                      <td className="px-5 py-4">
                        <button
                          onClick={() => setPedidoSelecionado(o)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                          title="Ver detalhes da compra"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pedidoSelecionado && (() => {
        // Os produtos que saíram no mesmo carrinho. Tudo que o Admin faz aqui
        // vale para a COMPRA inteira: status, entregador e código de postagem
        // são de uma caixa só, indo para um endereço só. Marcar "Entregue" em
        // um item e deixar os outros para trás não é um estado real — e era o
        // que acontecia antes, porque a tela só conhecia a primeira linha.
        const grupo = compras.find((c) => c.chave === (pedidoSelecionado.compraId || pedidoSelecionado.id));
        const idsDaCompra = grupo ? grupo.ids : [pedidoSelecionado.id];
        const paraTodos = (mudancas: { status?: string; codigoRastreio?: string }) =>
          idsDaCompra.forEach((id) => aoAtualizarStatus(id, mudancas));

        return (
          <ModalDetalhesPedido
            pedido={pedidoSelecionado}
            itensDaCompra={grupo?.linhas}
            totalDaCompra={grupo?.total}
            produto={produtos.find((p) => p.id === pedidoSelecionado.produtoId)}
            produtos={produtos}
            aoVerProdutoNaLoja={aoVerProdutoNaLoja}
            entregadores={entregadores}
            aoDefinirEntregador={
              ehAdmin && aoDefinirEntregador
                ? (email) => {
                    idsDaCompra.forEach((id) => aoDefinirEntregador(id, email));
                    setPedidoSelecionado({ ...pedidoSelecionado, entregador: email });
                  }
                : undefined
            }
            aoFechar={() => setPedidoSelecionado(null)}
            aoAtualizarStatus={(s) => {
              paraTodos({ status: s });
              setPedidoSelecionado({ ...pedidoSelecionado, status: s });
            }}
            aoSalvarCodigoRastreio={(codigo) => {
              paraTodos({ codigoRastreio: codigo });
              setPedidoSelecionado({ ...pedidoSelecionado, codigoRastreio: codigo });
            }}
          />
        );
      })()}
    </div>
  );
}
