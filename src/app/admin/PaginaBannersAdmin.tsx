// Pagina Admin: PaginaBannersAdmin

import { useState } from "react";
import { X, Plus, Edit2, Trash2, Upload } from "lucide-react";
import type { Banner } from "../types";
import { CATEGORIAS, ehFotoGuardada } from "../constantes";

// ─── Página Banners (Admin) ───────────────────────────────────────────────────

// Formulário de criação/edição de um banner da vitrine, com upload de imagem
// (mesmo esquema de redimensionar + converter para base64 usado nos produtos)
export function FormularioBanner({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Banner | null;
  aoFechar: () => void;
  aoSalvar: (b: Banner) => void;
}) {
  const [tag, setTag] = useState(inicial?.tag || "");
  const [title, setTitle] = useState(inicial?.title || "");
  const [subtitle, setSubtitle] = useState(inicial?.subtitle || "");
  const [cta, setCta] = useState(inicial?.cta || "Ver Ofertas");
  const categoriasValidas = CATEGORIAS.filter((c) => c !== "Outros");
  const [category, setCategory] = useState(
    inicial?.category && categoriasValidas.includes(inicial.category) ? inicial.category : categoriasValidas[0]
  );
  const [image, setImage] = useState(inicial?.image || "");
  const [mobileImage, setMobileImage] = useState(inicial?.mobileImage || "");
  const [erro, setErro] = useState("");

  const estiloInput =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all";
  const estiloRotulo = "text-[12px] font-bold text-gray-600 block mb-1.5";

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErro("Informe o título do banner."); return; }
    if (!image.trim()) { setErro("Envie ou cole a imagem do banner."); return; }
    aoSalvar({
      id: inicial?.id ?? Date.now(),
      image: image.trim(),
      mobileImage: mobileImage.trim() || undefined,
      tag: tag.trim() || "OFERTA",
      title: title.trim(),
      subtitle: subtitle.trim(),
      cta: cta.trim() || "Ver Ofertas",
      category,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={aoFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-black text-gray-900">{inicial ? "Editar Banner" : "Novo Banner"}</h3>
          <button onClick={aoFechar} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 space-y-4">
          <div>
            <label className={estiloRotulo}>Imagem do banner *</label>
            <div className="flex gap-2">
              <input
                className={estiloInput}
                value={ehFotoGuardada(image) ? "" : image}
                onChange={(e) => setImage(e.target.value)}
                placeholder={ehFotoGuardada(image) ? "Imagem enviada por upload" : "Cole a URL da imagem (https://...)"}
              />
              <label className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[12px] px-4 rounded-xl cursor-pointer transition-colors whitespace-nowrap">
                <Upload size={14} />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const img = new Image();
                      img.onload = () => {
                        // Redimensiona para o formato largo do banner (máx. 1200px de largura)
                        const scale = Math.min(1, 1200 / img.width);
                        const canvas = document.createElement("canvas");
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                        setImage(canvas.toDataURL("image/jpeg", 0.85));
                      };
                      img.src = reader.result as string;
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Formato ideal: imagem larga, tipo 1200×400.</p>
            {image.trim() && (
              <div className="mt-2 relative rounded-xl overflow-hidden border border-gray-100 bg-gray-900">
                <img
                  src={image}
                  alt="Pré-visualização"
                  className="w-full h-24 object-cover opacity-90"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
                />
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-black/70 transition-colors"
                >
                  Remover
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={estiloRotulo}>Imagem para celular (opcional)</label>
            <p className="text-[11px] text-gray-400 mb-2">
              A imagem larga acima fica baixinha no celular. Envie uma versão mais alta/quadrada
              (ex.: 800×900) pensada pro formato do celular — sem cortar nada e ocupando o espaço
              todo. Sem essa imagem, o celular usa a mesma imagem larga de cima.
            </p>
            <div className="flex gap-2">
              <input
                className={estiloInput}
                value={ehFotoGuardada(mobileImage) ? "" : mobileImage}
                onChange={(e) => setMobileImage(e.target.value)}
                placeholder={ehFotoGuardada(mobileImage) ? "Imagem enviada por upload" : "Cole a URL da imagem (https://...)"}
              />
              <label className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[12px] px-4 rounded-xl cursor-pointer transition-colors whitespace-nowrap">
                <Upload size={14} />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const img = new Image();
                      img.onload = () => {
                        // Redimensiona pro formato vertical do celular (máx. 900px de largura)
                        const scale = Math.min(1, 900 / img.width);
                        const canvas = document.createElement("canvas");
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                        setMobileImage(canvas.toDataURL("image/jpeg", 0.85));
                      };
                      img.src = reader.result as string;
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {mobileImage.trim() && (
              <div className="mt-2 relative rounded-xl overflow-hidden border border-gray-100 bg-gray-900 w-32">
                <img
                  src={mobileImage}
                  alt="Pré-visualização mobile"
                  className="w-full h-40 object-cover opacity-90"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
                />
                <button
                  type="button"
                  onClick={() => setMobileImage("")}
                  className="absolute top-1.5 right-1.5 bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-black/70 transition-colors"
                >
                  Remover
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Selo pequeno (tag)</label>
              <input className={estiloInput} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="Ex.: SUPER OFERTA" />
            </div>
            <div>
              <label className={estiloRotulo}>Categoria ao clicar</label>
              <select className={estiloInput} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categoriasValidas.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={estiloRotulo}>Título *</label>
            <input className={estiloInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Perfumes com até 5% OFF" />
          </div>

          <div>
            <label className={estiloRotulo}>Subtítulo</label>
            <input className={estiloInput} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ex.: Parcele em até 3x sem juros no cartão" />
          </div>

          <div>
            <label className={estiloRotulo}>Texto do botão</label>
            <input className={estiloInput} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex.: Comprar Agora" />
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
              {erro}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={aoFechar}
              className="flex-1 border border-gray-200 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-sm"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Lista os banners cadastrados e abre o formulário para criar/editar/excluir —
// assim o Admin troca as imagens e os textos do topo da loja sem mexer em código
export function PaginaBannersAdmin({
  banners,
  aoSalvar,
  aoExcluir,
}: {
  banners: Banner[];
  aoSalvar: (b: Banner) => void;
  aoExcluir: (id: number) => void;
}) {
  const [editando, setEditando] = useState<Banner | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-gray-900 text-[15px] mb-1">Banners da vitrine</h3>
          <p className="text-[12px] text-gray-400">
            Aparecem em rotação no topo da loja. Troque imagens e textos por aqui, sem mexer em código.
          </p>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="bg-[#C8102E] hover:bg-[#8C1626] text-white font-black px-5 py-2.5 rounded-xl transition-colors text-sm flex items-center gap-2 flex-shrink-0"
        >
          <Plus size={15} />
          Novo banner
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 text-[15px]">Banners cadastrados ({banners.length})</h3>
        </div>
        {banners.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
            Nenhum banner cadastrado — a loja fica sem o banner rotativo no topo.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {banners.map((b) => (
              <div key={b.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                <div className="w-24 h-14 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={b.image}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black text-[#C8102E] uppercase tracking-wide">{b.tag}</div>
                  <div className="text-[13px] font-bold text-gray-800 truncate">{b.title}</div>
                  <div className="text-[11px] text-gray-400 truncate">{b.subtitle} · categoria: {b.category}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setEditando(b)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => aoExcluir(b.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(criando || editando) && (
        <FormularioBanner
          inicial={editando}
          aoFechar={() => { setCriando(false); setEditando(null); }}
          aoSalvar={(b) => { aoSalvar(b); setCriando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}
