// Componente GraficoRede — árvore visual da rede de um Master/MasterPlus

import { useLayoutEffect, useRef, useState } from "react";
import { Crown, Award, User, Star, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { formatarMoeda } from "../utils";

// ─── Network Graph (org chart) ─────────────────────────────────────────────────

// Um nó da rede: pode ser o próprio MasterPlus/Master (raiz, sem comissaoParaVoce)
// ou alguém abaixo dele (Master promovido ou Vendedor).
export interface NoRede {
  nome: string;
  email: string;
  papel: "masterplus" | "master" | "vendedor";
  vendas: number; // vendas com o próprio código
  // Quanto esse nó gera de comissão para quem está vendo o gráfico (o pai
  // dele na árvore). Não aparece na raiz — ninguém paga comissão a si mesmo.
  comissaoParaVoce?: number;
  destaque?: boolean; // vendedor de destaque (top vendas), mostra a estrelinha
  filhos?: NoRede[];
}

const ROTULO_PAPEL: Record<NoRede["papel"], string> = {
  masterplus: "MasterPlus",
  master: "Master",
  vendedor: "Vendedor",
};

const ICONE_PAPEL: Record<NoRede["papel"], React.ReactNode> = {
  masterplus: <Crown size={13} />,
  master: <Award size={13} />,
  vendedor: <User size={13} />,
};

const ESTILO_PAPEL: Record<NoRede["papel"], string> = {
  masterplus: "bg-[#4A1218] text-white border border-[#4A1218]",
  master: "bg-[#C8102E] text-white border border-[#C8102E]",
  vendedor: "bg-white text-gray-800 border border-gray-200",
};

function CartaoNo({ no }: { no: NoRede }) {
  return (
    <div className={`rounded-xl px-2.5 py-2 shadow-sm w-[132px] flex-shrink-0 ${ESTILO_PAPEL[no.papel]}`}>
      <div className="flex items-center gap-1 text-[7.5px] font-black uppercase tracking-wide opacity-75">
        {ICONE_PAPEL[no.papel]}
        {ROTULO_PAPEL[no.papel]}
        {no.destaque && <Star size={9} className="fill-[#E8B84B] text-[#E8B84B] ml-auto flex-shrink-0" />}
      </div>
      <div className="text-[10.5px] font-bold leading-tight truncate mt-1">{no.nome}</div>
      <div className="text-[8.5px] opacity-60 truncate">{no.email}</div>
      <div className="text-[11px] font-black mt-1.5">{formatarMoeda(no.vendas)}</div>
      <div className="text-[7.5px] opacity-60 -mt-0.5">vendas próprias</div>
      {no.comissaoParaVoce !== undefined && no.comissaoParaVoce > 0 && (
        <div className="mt-1.5 text-[9px] font-black text-emerald-500 bg-white/15 rounded-md px-1.5 py-0.5 inline-block">
          +{formatarMoeda(no.comissaoParaVoce)} p/ você
        </div>
      )}
    </div>
  );
}

function Ramo({ no }: { no: NoRede }) {
  const filhos = no.filhos ?? [];
  return (
    <div className="flex flex-col items-center">
      <CartaoNo no={no} />
      {filhos.length > 0 && (
        <div className="flex flex-col items-center">
          {/* tronco descendo do card pai até a barra horizontal */}
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-start">
            {filhos.map((filho, i) => (
              <div key={filho.email} className="relative flex flex-col items-center px-1.5">
                {/* barra horizontal ligando os irmãos entre si */}
                {filhos.length > 1 && (
                  <div
                    className="absolute top-0 h-px bg-gray-300"
                    style={{
                      left: i === 0 ? "50%" : 0,
                      right: i === filhos.length - 1 ? "50%" : 0,
                    }}
                  />
                )}
                {/* tronco descendo da barra até o card do filho */}
                <div className="w-px h-4 bg-gray-300" />
                <Ramo no={filho} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Soma recursiva de pessoas e vendas de toda a árvore (usado no resumo do topo)
function contarPessoas(no: NoRede): number {
  return 1 + (no.filhos ?? []).reduce((acum, f) => acum + contarPessoas(f), 0);
}
function somarVendas(no: NoRede): number {
  return no.vendas + (no.filhos ?? []).reduce((acum, f) => acum + somarVendas(f), 0);
}
function somarComissao(no: NoRede): number {
  return (
    (no.filhos ?? []).reduce(
      (acum, f) => acum + (f.comissaoParaVoce ?? 0) + somarComissao(f),
      0
    )
  );
}

// Painel arrastável tipo "planilha/mapa": permite navegar dentro da div
// arrastando com o mouse (clicar e arrastar) ou com o dedo (touch já rola
// nativamente em overflow-auto). Usa Pointer Events com setPointerCapture
// para o arrasto continuar mesmo se o cursor sair da área durante um
// movimento rápido — com mouse events comuns (onMouseLeave) o arrasto para
// assim que o ponteiro cruza a borda, o que dá a impressão de "não funciona".
function usePainelArrastavel() {
  const ref = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const origem = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [emArrasto, setEmArrasto] = useState(false);

  const aoPressionar = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    arrastando.current = true;
    setEmArrasto(true);
    origem.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  };
  const aoSoltar = (e: React.PointerEvent) => {
    const el = ref.current;
    arrastando.current = false;
    setEmArrasto(false);
    if (el && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  const aoMover = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !arrastando.current) return;
    e.preventDefault();
    el.scrollLeft = origem.current.scrollLeft - (e.clientX - origem.current.x);
    el.scrollTop = origem.current.scrollTop - (e.clientY - origem.current.y);
  };

  return {
    ref,
    emArrasto,
    handlers: {
      onPointerDown: aoPressionar,
      onPointerMove: aoMover,
      onPointerUp: aoSoltar,
      onPointerCancel: aoSoltar,
    },
  };
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_PASSO = 0.15;

export function GraficoRede({ raiz }: { raiz: NoRede }) {
  const pessoas = contarPessoas(raiz) - 1;
  const vendasRede = somarVendas(raiz);
  const comissaoTotal = somarComissao(raiz);
  const { ref, emArrasto, handlers } = usePainelArrastavel();
  const [zoom, setZoom] = useState(1);
  const conteudoRef = useRef<HTMLDivElement>(null);
  // Tamanho "real" (sem zoom) da árvore. CSS transform:scale() só afeta o
  // desenho, não o espaço que o elemento ocupa no layout — então, se o zoom
  // ficasse só no transform, o container por trás nunca "cresceria" para dar
  // espaço de rolagem quando a rede aumentada não coubesse mais na tela (é
  // por isso que o arrastar não tinha efeito). Por isso medimos o tamanho
  // natural aqui e damos ao wrapper de rolagem uma largura/altura explícita
  // já multiplicada pelo zoom.
  const [tamanhoNatural, setTamanhoNatural] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = conteudoRef.current;
    if (!el) return;
    const medir = () => {
      const rect = el.getBoundingClientRect();
      setTamanhoNatural({ width: rect.width / zoom, height: rect.height / zoom });
    };
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raiz]);

  const ajustarZoom = (delta: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));

  // Ctrl/Cmd + roda do mouse dá zoom (padrão de editores tipo Figma/Miro);
  // roda sozinha continua rolando a área normalmente.
  const aoRolar = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    ajustarZoom(e.deltaY < 0 ? ZOOM_PASSO : -ZOOM_PASSO);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-black text-gray-900 text-[15px]">Sua rede</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {pessoas} pessoa{pessoas !== 1 ? "s" : ""} na rede · {formatarMoeda(vendasRede)} vendidos no total
            {comissaoTotal > 0 && ` · ${formatarMoeda(comissaoTotal)} de comissão de rede`}
          </p>
        </div>
        {pessoas > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[10.5px] text-gray-400 font-medium hidden sm:inline">
              Arraste para navegar
            </span>
            <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-xl p-1">
              <button
                onClick={() => ajustarZoom(-ZOOM_PASSO)}
                disabled={zoom <= ZOOM_MIN}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Diminuir zoom"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-[11px] font-bold text-gray-600 w-9 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => ajustarZoom(ZOOM_PASSO)}
                disabled={zoom >= ZOOM_MAX}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Aumentar zoom"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-gray-800 transition-colors"
                title="Restaurar zoom"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      {pessoas === 0 ? (
        <div className="py-12 text-center text-gray-400 text-[13px]">
          Sua rede ainda está vazia. Cadastre vendedores para ela começar a crescer.
        </div>
      ) : (
        <div
          ref={ref}
          {...handlers}
          onWheel={aoRolar}
          className={`overflow-auto max-h-[520px] rounded-xl border border-gray-100 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] select-none touch-none ${
            emArrasto ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {/* Largura/altura explícitas (max entre 100% do container e o
              tamanho real × zoom): quando a árvore cabe no espaço visível,
              o wrapper fica do tamanho do container e centraliza o
              conteúdo; quando fica maior (zoom alto ou rede grande), o
              wrapper cresce de verdade, dando ao overflow-auto do pai uma
              área real para arrastar/rolar até as pontas */}
          <div
            className="flex items-center justify-center p-10"
            style={{
              width: tamanhoNatural.width ? `max(100%, ${tamanhoNatural.width * zoom + 80}px)` : "100%",
              height: `max(420px, ${tamanhoNatural.height * zoom + 80}px)`,
            }}
          >
            <div ref={conteudoRef} style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}>
              <Ramo no={raiz} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
