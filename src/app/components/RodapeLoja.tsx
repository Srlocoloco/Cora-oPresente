// Componente RodapeLoja

import type { Pedido } from "../types";
import type { PaginaInstitucional } from "../screens/TelaInstitucional";
import { Logo } from "./Logo";

// ─── Store Footer ─────────────────────────────────────────────────────────────

// Links das colunas Institucional e Atendimento: cada rótulo aponta para uma
// página da TelaInstitucional. A coluna Pagamento segue sendo só informativa.
const PAGINA_POR_LINK: Record<string, PaginaInstitucional> = {
  "Sobre Nós": "sobre",
  "Trabalhe Conosco": "trabalhe",
  "Central de Ajuda (FAQ)": "ajuda",
  "Rastrear Pedido": "rastreio",
  "Fale Conosco": "contato",
  "Política de Privacidade": "privacidade",
  "Termos de Uso": "termos",
};

export function RodapeLoja({ aoAbrirPagina }: { aoAbrirPagina?: (p: PaginaInstitucional) => void }) {
  return (
    <footer className="bg-[#4A1218] text-white mt-2">
      <div className="max-w-[1440px] mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div>
            <Logo small claro />
            <p className="text-white/50 text-xs leading-relaxed mt-4">
              © 2026 Coração Presente LTDA.<br />
              CNPJ: 12.345.678/0001-90
            </p>
          </div>
          {[
            { title: "Institucional", links: ["Sobre Nós", "Trabalhe Conosco"] },
            { title: "Atendimento", links: ["Central de Ajuda (FAQ)", "Rastrear Pedido", "Fale Conosco"] },
            { title: "Legal", links: ["Política de Privacidade", "Termos de Uso"] },
            { title: "Pagamento", links: ["Cartão de Crédito", "PIX", "Parcelamento"] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="font-black text-[#E8B84B] mb-4 text-sm">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((l) => {
                  const destino = PAGINA_POR_LINK[l];
                  return (
                    <li key={l}>
                      {destino && aoAbrirPagina ? (
                        <button
                          onClick={() => aoAbrirPagina(destino)}
                          className="text-white/55 hover:text-white transition-colors text-xs text-left"
                        >
                          {l}
                        </button>
                      ) : (
                        <span className="text-white/55 text-xs">{l}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 mt-8 pt-6 text-center text-[11px] text-white/30">
          Coração Presente · Todos os direitos reservados · 2026
        </div>
      </div>
    </footer>
  );
}
