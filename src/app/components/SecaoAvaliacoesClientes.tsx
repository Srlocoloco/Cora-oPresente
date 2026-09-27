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
    <section className="max-w-[1200px] mx-auto px-4 pt-10">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-[22px] text-gray-800">Quem comprou, recomenda</h2>
        <span className="text-[14px] text-gray-500 flex items-center gap-1">
          <Star size={13} className="fill-[#C8102E] text-[#C8102E]" /> {media.toFixed(1)} de média
        </span>
      </div>
      <div className="grid md:grid-cols-3 gap-3 md:gap-4">
        {avaliacoes.map((a, i) => (
          <figure key={i} className="painel p-5">
            <div className="flex gap-0.5" role="img" aria-label={`Avaliação ${a.nota} de 5`}>
              {[...Array(5)].map((_, j) => (
                <Star key={j} size={13} className={j < a.nota ? "fill-[#C8102E] text-[#C8102E]" : "fill-gray-200 text-gray-200"} />
              ))}
            </div>
            <blockquote className="text-[14px] text-gray-700 leading-relaxed line-clamp-4 mt-2.5">{a.comentario}</blockquote>
            <figcaption className="mt-3 text-[12.5px] text-gray-500">
              <span className="text-gray-700">{a.clienteNome}</span>
              {a.produtoNome && <> · {a.produtoNome}</>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
