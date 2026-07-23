// Pagina Admin: PaginaProdutosAdmin

import { useState } from "react";
import { Search, X, Plus, Edit2, Trash2, Upload } from "lucide-react";
import type { Produto, CorProduto } from "../types";
import { OPCOES_SELO, CATEGORIAS, CORES_SELO } from "../constantes";
import { formatarMoeda, pctDesconto } from "../utils";
import { ImagemProduto } from "../components/ImagemProduto";

// ─── Products Admin ───────────────────────────────────────────────────────────

export function PaginaProdutosAdmin({
  produtos,
  aoSalvar,
  aoExcluir,
}: {
  produtos: Produto[];
  aoSalvar: (p: Produto) => void;
  aoExcluir: (id: number) => void;
}) {
  const [termoBusca, setTermoBusca] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);

  const visiveis = produtos.filter(
    (p) =>
      p.name.toLowerCase().includes(termoBusca.toLowerCase()) ||
      p.brand.toLowerCase().includes(termoBusca.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 min-w-[240px]">
          <Search size={15} className="text-gray-400" />
          <input
            className="flex-1 text-[13px] outline-none placeholder:text-gray-400 bg-transparent"
            placeholder="Buscar produto ou marca..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
          />
        </div>
        <button
          onClick={() => { setEditando(null); setMostrarFormulario(true); }}
          className="flex items-center gap-2 bg-[#C8102E] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-[#8C1626] transition-colors"
        >
          <Plus size={15} />
          Novo Produto
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3.5 font-semibold hidden sm:table-cell">Código</th>
                <th className="text-left px-5 py-3.5 font-semibold">Produto</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Categoria</th>
                <th className="text-left px-5 py-3.5 font-semibold">Preço</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden lg:table-cell">Estoque</th>
                <th className="text-left px-5 py-3.5 font-semibold hidden md:table-cell">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-[13px]">
                    Nenhum produto cadastrado — clique em <strong>Novo Produto</strong> para começar a vender.
                  </td>
                </tr>
              )}
              {visiveis.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <span className="font-mono text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                      {p.codigo || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <ImagemProduto src={p.image} alt={p.name} className="w-10 h-10 object-contain bg-gray-50 rounded-xl p-1 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-800 text-[12px] leading-snug line-clamp-1 max-w-[180px]">{p.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 font-medium">{p.brand}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-gray-500 hidden md:table-cell">{p.category}</td>
                  <td className="px-5 py-4 font-black text-gray-900 text-[13px]">
                    {formatarMoeda(p.price)}
                    {p.originalPrice && p.originalPrice > p.price && (
                      <div className="text-[10px] text-red-500 font-bold">-{pctDesconto(p.originalPrice, p.price)}%</div>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${p.stock < 15 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                      {p.stock} un.
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    {p.badge ? (
                      <span className={`${CORES_SELO[p.badge] || "bg-[#C8102E]"} text-white text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide`}>
                        {p.badge}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300 font-medium">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditando(p); setMostrarFormulario(true); }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-amber-600 transition-colors"
                        title="Editar produto"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => aoExcluir(p.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-colors"
                        title="Excluir produto"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mostrarFormulario && (
        <FormularioProduto
          inicial={editando}
          aoFechar={() => setMostrarFormulario(false)}
          aoSalvar={(p) => { aoSalvar(p); setMostrarFormulario(false); }}
        />
      )}
    </div>
  );
}

// ─── Produto Form (cadastro/edição) ───────────────────────────────────────────

export function FormularioProduto({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Produto | null;
  aoFechar: () => void;
  aoSalvar: (p: Produto) => void;
}) {
  const [name, setName] = useState(inicial?.name || "");
  const [brand, setBrand] = useState(inicial?.brand || "");
  // Categorias válidas hoje — se o produto foi salvo com uma categoria antiga
  // que não existe mais na lista, cai para a primeira opção válida em vez de
  // manter o valor antigo "escondido" no estado (o <select> mostraria a opção
  // certa visualmente, mas salvaria a categoria antiga de qualquer forma).
  const categoriasValidas = CATEGORIAS.filter((c) => c !== "Outros");
  const [cat, setCat] = useState(
    inicial?.category && categoriasValidas.includes(inicial.category) ? inicial.category : categoriasValidas[0]
  );
  const [price, setPrice] = useState(inicial ? String(inicial.price) : "");
  const [originalPrice, setOriginalPrice] = useState(inicial?.originalPrice ? String(inicial.originalPrice) : "");
  const [stock, setStock] = useState(inicial ? String(inicial.stock) : "");
  const [installments, setInstallments] = useState(inicial?.installments || 12);
  const [image, setImage] = useState(inicial?.image || "");
  // Imagens extras (além da capa) para a galeria da página do produto
  const [images, setImages] = useState<string[]>(inicial?.images || []);
  // Cores/modelos do produto, para o cliente escolher qual quer comprar
  const [colors, setColors] = useState<CorProduto[]>(inicial?.colors || []);
  const [badge, setBadge] = useState(inicial?.badge || "");
  const [freeShipping, setFreeShipping] = useState(inicial?.freeShipping ?? true);
  // % de desconto no PIX deste produto (vazio = sem desconto)
  const [pixDesconto, setPixDesconto] = useState(inicial?.pixDesconto ? String(inicial.pixDesconto) : "");
  const [erro, setErro] = useState("");

  const estiloInput =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all";
  const estiloRotulo = "text-[12px] font-bold text-gray-600 block mb-1.5";

  const aoEnviarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(price.replace(",", "."));
    const op = originalPrice ? parseFloat(originalPrice.replace(",", ".")) : undefined;
    const st = parseInt(stock, 10);
    if (!name.trim() || !brand.trim()) { setErro("Informe o nome e a marca do produto."); return; }
    if (!p || p <= 0) { setErro("Informe um preço válido."); return; }
    if (op !== undefined && op <= p) { setErro("O preço original deve ser maior que o preço com desconto."); return; }
    if (isNaN(st) || st < 0) { setErro("Informe o estoque."); return; }
    const pix = pixDesconto ? parseInt(pixDesconto, 10) : 0;
    if (pix < 0 || pix > 90) { setErro("O desconto no PIX deve ser entre 0% e 90%."); return; }
    aoSalvar({
      id: inicial?.id ?? Date.now(),
      name: name.trim(),
      brand: brand.trim(),
      price: p,
      originalPrice: op,
      installments,
      rating: inicial?.rating ?? 0,
      reviews: inicial?.reviews ?? 0,
      image: image.trim(),
      images: images.length ? images : undefined,
      colors: colors.length ? colors.filter((c) => c.nome.trim()) : undefined,
      category: cat,
      badge: badge || undefined,
      freeShipping,
      stock: st,
      pixDesconto: pix > 0 ? pix : undefined,
      owner: inicial?.owner,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={aoFechar}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-black text-gray-900">{inicial ? "Editar Produto" : "Novo Produto"}</h3>
          <button onClick={aoFechar} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={aoEnviarFormulario} className="p-6 space-y-4">
          {inicial?.codigo && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Código do produto</span>
              <span className="font-mono text-[13px] font-black text-gray-700">{inicial.codigo}</span>
            </div>
          )}
          {!inicial && (
            <p className="text-[11px] text-gray-400 -mt-1">
              O código (ex.: BEL-001) é gerado automaticamente pela categoria ao salvar.
            </p>
          )}
          <div>
            <label className={estiloRotulo}>Nome do produto *</label>
            <input className={estiloInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Perfumes" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Marca *</label>
              <input className={estiloInput} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: Motorola" />
            </div>
            <div>
              <label className={estiloRotulo}>Categoria</label>
              <select className={estiloInput} value={cat} onChange={(e) => setCat(e.target.value)}>
                {CATEGORIAS.filter((c) => c !== "Outros").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Preço de venda (R$) *</label>
              <input className={estiloInput} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 1899,90" inputMode="decimal" />
              <p className="text-[11px] text-gray-400 mt-1">Valor que o cliente paga.</p>
            </div>
            <div>
              <label className={estiloRotulo}>Preço "De:" (R$)</label>
              <input className={estiloInput} value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="Ex.: 2299,90 (opcional)" inputMode="decimal" />
              <p className="text-[11px] text-gray-400 mt-1">Preço antigo, aparece riscado como desconto. Deixe vazio se não houver.</p>
            </div>
          </div>

          {/* Prévia: mostra exatamente como o cliente verá os preços */}
          {(() => {
            const p = parseFloat(price.replace(",", "."));
            if (!p || p <= 0) return null;
            const op = originalPrice ? parseFloat(originalPrice.replace(",", ".")) : undefined;
            const pix = pixDesconto ? parseInt(pixDesconto, 10) : 0;
            return (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Como o cliente vai ver</p>
                {op && op > p ? (
                  <p className="text-[14px]">
                    <span className="text-gray-400 line-through">{formatarMoeda(op)}</span>{" "}
                    <span className="font-black text-gray-900">{formatarMoeda(p)}</span>{" "}
                    <span className="text-red-500 font-black text-[11px]">-{pctDesconto(op, p)}%</span>
                  </p>
                ) : (
                  <p className="text-[14px] font-black text-gray-900">{formatarMoeda(p)}</p>
                )}
                {pix > 0 && pix <= 90 && (
                  <p className="text-[12px] text-emerald-600 font-bold mt-0.5">
                    {formatarMoeda(p * (1 - pix / 100))} no PIX ({pix}% OFF)
                  </p>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={estiloRotulo}>Estoque *</label>
              <input className={estiloInput} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="10" inputMode="numeric" />
            </div>
            <div>
              <label className={estiloRotulo}>Parcelamento</label>
              <select className={estiloInput} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                {[1, 2, 3, 6, 10, 12].map((n) => (
                  <option key={n} value={n}>{n}x sem juros</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={estiloRotulo}>Desconto extra pagando no PIX (%)</label>
            <input
              className={estiloInput}
              value={pixDesconto}
              onChange={(e) => setPixDesconto(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="Ex.: 5 — deixe vazio para não dar desconto no PIX"
              inputMode="numeric"
            />
            <p className="text-[11px] text-gray-400 mt-1">Aplicado sobre o preço de venda somente quando o cliente paga com PIX.</p>
          </div>

          <div>
            <label className={estiloRotulo}>Status na loja (destaque para atrair clientes)</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setBadge("")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-black border-2 transition-all ${
                  badge === "" ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"
                }`}
              >
                NENHUM
              </button>
              {OPCOES_SELO.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBadge(b)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-black border-2 transition-all ${
                    badge === b
                      ? `${CORES_SELO[b]} text-white border-transparent`
                      : "border-gray-200 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={estiloRotulo}>Imagem do produto</label>
            <div className="flex gap-2">
              <input
                className={estiloInput}
                value={image.startsWith("data:") ? "" : image}
                onChange={(e) => setImage(e.target.value)}
                placeholder={image.startsWith("data:") ? "Imagem enviada por upload" : "Cole a URL da imagem (https://...)"}
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
                        // Redimensiona para economizar espaço de armazenamento
                        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
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
            {image.trim() && (
              <div className="mt-2 flex items-center gap-3">
                <ImagemProduto src={image} alt="Pré-visualização" className="w-16 h-16 object-contain bg-gray-50 rounded-xl p-1 border border-gray-100" />
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="text-[11px] text-red-500 font-bold hover:underline"
                >
                  Remover imagem
                </button>
              </div>
            )}
          </div>

          <div>
            <label className={estiloRotulo}>Mais fotos do produto (galeria)</label>
            <p className="text-[11px] text-gray-400 mb-2">
              Fotos extras mostradas na página do produto, além da imagem principal. Útil para mostrar o relógio em ângulos diferentes.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  <ImagemProduto src={img} alt={`Foto ${i + 1}`} className="w-16 h-16 object-contain bg-gray-50 rounded-xl p-1 border border-gray-100" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[12px] px-4 py-2.5 rounded-xl cursor-pointer transition-colors w-fit">
              <Upload size={14} />
              Adicionar fotos
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  files.forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const img = new Image();
                      img.onload = () => {
                        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
                        const canvas = document.createElement("canvas");
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                        setImages((prev) => [...prev, canvas.toDataURL("image/jpeg", 0.85)]);
                      };
                      img.src = reader.result as string;
                    };
                    reader.readAsDataURL(file);
                  });
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div>
            <label className={estiloRotulo}>Cores / modelos (opcional)</label>
            <p className="text-[11px] text-gray-400 mb-2">
              Cadastre as variações para o cliente escolher, ex.: "Prata", "Dourado", "Preto" — cada uma pode ter sua própria foto.
            </p>
            <div className="space-y-2">
              {colors.map((c, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <ImagemProduto
                      src={c.image || image}
                      alt={c.nome || "Cor"}
                      className="w-12 h-12 object-contain bg-gray-50 rounded-lg p-1 border border-gray-100 flex-shrink-0"
                    />
                    <div className="flex-1 space-y-1.5">
                      <input
                        className={estiloInput}
                        value={c.nome}
                        onChange={(e) => {
                          const novo = [...colors];
                          novo[i] = { ...novo[i], nome: e.target.value };
                          setColors(novo);
                        }}
                        placeholder="Nome da cor, ex.: Prata"
                      />
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="color"
                          value={c.hex || "#cccccc"}
                          onChange={(e) => {
                            const novo = [...colors];
                            novo[i] = { ...novo[i], hex: e.target.value };
                            setColors(novo);
                          }}
                          className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                          title="Cor aproximada (mostrada como bolinha)"
                        />
                        <label className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[11px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                          <Upload size={12} />
                          Foto desta cor
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
                                  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
                                  const canvas = document.createElement("canvas");
                                  canvas.width = Math.round(img.width * scale);
                                  canvas.height = Math.round(img.height * scale);
                                  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                                  const novo = [...colors];
                                  novo[i] = { ...novo[i], image: canvas.toDataURL("image/jpeg", 0.85) };
                                  setColors(novo);
                                };
                                img.src = reader.result as string;
                              };
                              reader.readAsDataURL(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-500 block mb-1">Estoque desta cor</label>
                        <input
                          className={estiloInput}
                          value={c.estoque ?? ""}
                          onChange={(e) => {
                            const novo = [...colors];
                            const valor = e.target.value.replace(/\D/g, "");
                            novo[i] = { ...novo[i], estoque: valor ? parseInt(valor, 10) : undefined };
                            setColors(novo);
                          }}
                          placeholder="Ex.: 5 (deixe vazio para usar o estoque geral)"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setColors(colors.filter((_, idx) => idx !== i))}
                      className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {colors.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">
                Se o estoque de uma cor ficar vazio, o cliente vê essa cor como disponível seguindo o estoque geral do produto.
              </p>
            )}
            <button
              type="button"
              onClick={() => setColors([...colors, { nome: "" }])}
              className="mt-2 flex items-center gap-1.5 text-[12px] font-bold text-[#C8102E] hover:underline"
            >
              <Plus size={14} /> Adicionar cor
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={freeShipping}
              onChange={(e) => setFreeShipping(e.target.checked)}
              className="w-4 h-4 accent-[#C8102E]"
            />
            <span className="text-[13px] font-semibold text-gray-700">Frete grátis</span>
          </label>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
              {erro}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-xl hover:border-gray-300 transition-colors text-[14px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-[14px]"
            >
              {inicial ? "Salvar Alterações" : "Cadastrar Produto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Orders Admin ─────────────────────────────────────────────────────────────
