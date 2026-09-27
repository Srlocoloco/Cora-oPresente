// Componente RodapeLoja
//
// Rodapé claro e discreto, como nas grandes lojas: links úteis em colunas e os
// dados da empresa embaixo. A coluna Pagamento é só informativa.

import type { PaginaInstitucional } from "../screens/TelaInstitucional";

// Links das colunas Institucional e Atendimento: cada rótulo aponta para uma
// página da TelaInstitucional.
const PAGINA_POR_LINK: Record<string, PaginaInstitucional> = {
  "Sobre nós": "sobre",
  "Trabalhe conosco": "trabalhe",
  "Central de ajuda": "ajuda",
  "Rastrear pedido": "rastreio",
  "Fale conosco": "contato",
  "Política de privacidade": "privacidade",
  "Termos de uso": "termos",
};

const COLUNAS = [
  { titulo: "Institucional", links: ["Sobre nós", "Trabalhe conosco"] },
  { titulo: "Atendimento", links: ["Central de ajuda", "Rastrear pedido", "Fale conosco"] },
  { titulo: "Legal", links: ["Política de privacidade", "Termos de uso"] },
  { titulo: "Pagamento", links: ["Pix", "Cartão de crédito", "Parcelamento sem juros"] },
];

export function RodapeLoja({ aoAbrirPagina }: { aoAbrirPagina?: (p: PaginaInstitucional) => void }) {
  return (
    <footer className="bg-white border-t border-black/10 mt-12">
      <div className="max-w-[1200px] mx-auto px-4 pt-8 pb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-7">
          {COLUNAS.map((col) => (
            <div key={col.titulo}>
              <h4 className="text-[14px] font-semibold text-gray-800 mb-3">{col.titulo}</h4>
              <ul className="space-y-2">
                {col.links.map((l) => {
                  const destino = PAGINA_POR_LINK[l];
                  return (
                    <li key={l} className="text-[13px]">
                      {destino && aoAbrirPagina ? (
                        <button onClick={() => aoAbrirPagina(destino)} className="text-gray-500 hover:text-gray-900 text-left">
                          {l}
                        </button>
                      ) : (
                        <span className="text-gray-500">{l}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-black/[0.08] mt-8 pt-5 text-[12px] text-gray-400 leading-relaxed">
          Copyright © {new Date().getFullYear()} Coração Presente LTDA · CNPJ 68.076.424/0001-73
        </div>
      </div>
    </footer>
  );
}
