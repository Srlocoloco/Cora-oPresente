// Pagina Admin: PaginaAvaliacoesAdmin
//
// Modera as avaliações (comentário + vídeo) enviadas pelos clientes. A
// publicação é imediata (sem fila de aprovação) — esta página serve pra
// remover algo impróprio depois de publicado. Busca a lista direto do
// backend (não vem pelo /api/dados, porque os vídeos em base64 deixariam
// aquela carga inicial pesada demais).

import { useEffect, useState } from "react";
import { Star, Trash2, Video } from "lucide-react";
import { URL_BACKEND_PIX } from "../constantes";
import { cabecalhosAdmin } from "../authToken";

interface AvaliacaoAdmin {
  id: number;
  produtoId: number;
  produtoNome: string | null;
  clienteEmail: string;
  clienteNome: string;
  nota: number;
  comentario: string;
  video?: string | null;
  date: string;
}

export function PaginaAvaliacoesAdmin({
  aoAtualizarResumoAvaliacoes,
}: {
  aoAtualizarResumoAvaliacoes: (produtoId: number, rating: number, reviews: number) => void;
}) {
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);

  const carregar = () => {
    setCarregando(true);
    setErro("");
    // Manda o token: a lista completa (com o e-mail de cada cliente) agora é
    // exclusiva do Admin no servidor. Antes ela vinha sem identificação
    // nenhuma — e qualquer pessoa que soubesse o endereço baixava a lista de
    // e-mails dos clientes da loja.
    fetch(`${URL_BACKEND_PIX}/api/avaliacoes?todas=1`, { headers: cabecalhosAdmin() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((lista) => setAvaliacoes(Array.isArray(lista) ? lista : []))
      .catch(() => setErro("Não foi possível carregar as avaliações."))
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregar();
  }, []);

  const excluir = async (a: AvaliacaoAdmin) => {
    setExcluindo(a.id);
    try {
      const resposta = await fetch(`${URL_BACKEND_PIX}/api/avaliacoes/${a.id}`, {
        method: "DELETE",
        headers: cabecalhosAdmin(),
      });
      if (!resposta.ok) throw new Error();
      setAvaliacoes((anterior) => anterior.filter((x) => x.id !== a.id));
      const restantes = avaliacoes.filter((x) => x.id !== a.id && x.produtoId === a.produtoId);
      const media = restantes.length > 0
        ? Math.round((restantes.reduce((acum, x) => acum + x.nota, 0) / restantes.length) * 10) / 10
        : 0;
      aoAtualizarResumoAvaliacoes(a.produtoId, media, restantes.length);
    } catch {
      setErro("Não foi possível excluir — tente de novo.");
    } finally {
      setExcluindo(null);
      setConfirmando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-black text-gray-900 text-[15px] mb-1">Avaliações dos clientes</h3>
        <p className="text-[12px] text-gray-400">
          Publicação é imediata (sem aprovação) — só clientes que compraram o produto podem avaliar.
          Use o excluir para remover algo impróprio.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">
            {carregando ? "Carregando..." : `Avaliações recebidas (${avaliacoes.length})`}
          </h3>
        </div>

        {erro && (
          <div className="mx-5 mt-4 bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
            {erro}
          </div>
        )}

        {!carregando && avaliacoes.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhuma avaliação enviada ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {avaliacoes.map((a) => (
              <div key={a.id} className="px-5 py-4 flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-gray-800">{a.clienteNome}</span>
                    <span className="text-[11px] text-gray-400">{a.clienteEmail}</span>
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={12} className={i < a.nota ? "fill-[#E8B84B] text-[#E8B84B]" : "fill-gray-200 text-gray-200"} />
                      ))}
                    </div>
                    {a.video && <Video size={13} className="text-gray-400" />}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Produto: {a.produtoNome ?? `#${a.produtoId}`} · {a.date}
                  </div>
                  {a.comentario && <p className="text-[13px] text-gray-700 mt-2 whitespace-pre-line">{a.comentario}</p>}
                  {a.video && (
                    <video controls className="mt-3 rounded-lg max-h-[220px] bg-black w-full sm:w-auto" src={a.video} />
                  )}
                </div>
                <div className="flex-shrink-0">
                  {confirmando === a.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => excluir(a)}
                        disabled={excluindo === a.id}
                        className="text-[11px] font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {excluindo === a.id ? "Excluindo..." : "Confirmar"}
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="text-[11px] font-bold text-gray-500 hover:text-gray-700 px-2"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmando(a.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                      title="Excluir avaliação"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
