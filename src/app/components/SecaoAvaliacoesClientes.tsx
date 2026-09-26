// Componente SecaoAvaliacoesClientes
// Prova social na home: avaliações REAIS de clientes que compraram (mesma
// tabela que alimenta a página de cada produto) — nunca depoimento inventado.
// Mostra as melhores com comentário escrito, mais recentes primeiro.

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { URL_BACKEND_PIX } from "../constantes";

type AvaliacaoPublica = {
  clienteNome: string;
  nota: number;
  comentario: string;
  produtoNome: string | null;
  date: string;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function SecaoAvaliacoesClientes() {
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoPublica[]>([]);

  useEffect(() => {
    let vivo = true;
    // Modo vitrine: o servidor devolve só o punhado de depoimentos que esta
    // seção mostra — sem o e-mail de ninguém e sem os vídeos. Antes daqui saía
    // um pedido pela lista COMPLETA de avaliações da loja (?todas=1), que vinha
    // com o e-mail de cada cliente e todos os vídeos em base64: dado pessoal
    // exposto na home e uma resposta enorme só para mostrar seis cartõezinhos.
    fetch(`${URL_BACKEND_PIX}/api/avaliacoes?vitrine=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: AvaliacaoPublica[]) => {
        if (!vivo || !Array.isArray(lista)) return;
        setAvaliacoes(lista.slice(0, 6));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (avaliacoes.length === 0) return null;

  const media = avaliacoes.reduce((acum, a) => acum + a.nota, 0) / avaliacoes.length;

  return (
    <section className="max-w-[1440px] mx-auto px-4 pt-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[20px] md:text-2xl font-bold text-gray-900">O que dizem nossos clientes</h2>
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-full px-3 py-1">
          <Star size={14} className="fill-[#C79A3B] text-[#C79A3B]" />
          <span className="text-[13px] font-bold text-gray-800">{media.toFixed(1)}</span>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3 md:gap-5">
        {avaliacoes.map((a, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-full bg-[#FBF4EA] text-[#A8102A] font-bold text-[12px] flex items-center justify-center flex-shrink-0">
                {iniciais(a.clienteNome)}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-800 truncate">{a.clienteNome}</p>
                {a.produtoNome && <p className="text-[11px] text-gray-400 truncate">{a.produtoNome}</p>}
              </div>
            </div>
            <div className="flex gap-0.5 mb-1.5" role="img" aria-label={`Avaliação ${a.nota} de 5`}>
              {[...Array(5)].map((_, j) => (
                <Star key={j} size={12} className={j < a.nota ? "fill-[#C79A3B] text-[#C79A3B]" : "fill-gray-200 text-gray-200"} />
              ))}
            </div>
            <p className="text-[13px] text-gray-600 leading-relaxed line-clamp-4">{a.comentario}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
