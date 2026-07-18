// Componente RodapeLoja

import type { Pedido } from "../types";
import { Logo } from "./Logo";

// ─── Store Footer ─────────────────────────────────────────────────────────────

export function RodapeLoja() {
  return (
    <footer className="bg-[#4A1218] text-white mt-2">
      <div className="max-w-[1440px] mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Logo small />
            <p className="text-white/50 text-xs leading-relaxed mt-4">
              © 2026 Coração Presente LTDA.<br />
              CNPJ: 12.345.678/0001-90
            </p>
          </div>
          {[
            { title: "Institucional", links: ["Sobre Nós", "Trabalhe Conosco", "Imprensa", "Investidores"] },
            { title: "Atendimento", links: ["Central de Ajuda", "Trocas e Devoluções", "Rastrear Pedido", "Fale Conosco"] },
            { title: "Pagamento", links: ["Cartão de Crédito", "PIX", "Parcelamento"] },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="font-black text-[#E8B84B] mb-4 text-sm">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-white/55 hover:text-white transition-colors text-xs">{l}</a>
                  </li>
                ))}
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
