// Componente FaixaBeneficios
// Reforça confiança logo abaixo da vitrine: compra segura, pagamento
// protegido, envio rápido, atendimento. Ícone + texto curto — nenhuma
// informação nova aqui, só deixa visível o que já é verdade sobre a loja.

import { ShieldCheck, Lock, Truck, Headset } from "lucide-react";

const ITENS = [
  { icone: ShieldCheck, titulo: "Compra segura", texto: "Seus dados protegidos do início ao fim" },
  { icone: Lock, titulo: "Pagamento protegido", texto: "PIX e cartão processados com segurança" },
  { icone: Truck, titulo: "Envio rápido", texto: "Despacho ágil para todo o Paraná" },
  { icone: Headset, titulo: "Atendimento real", texto: "WhatsApp e e-mail, seg. a sex., 9h às 18h" },
];

export function FaixaBeneficios() {
  return (
    <section className="max-w-[1440px] mx-auto px-4 pt-8">
      <div className="bg-white border border-gray-100 rounded-2xl grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
        {ITENS.map(({ icone: Icone, titulo, texto }) => (
          <div key={titulo} className="flex items-center gap-3 p-4">
            <Icone size={26} className="text-[#A8102A] flex-shrink-0" strokeWidth={1.75} />
            <div>
              <p className="text-[12.5px] md:text-[13px] font-bold text-gray-800 leading-tight">{titulo}</p>
              <p className="text-[10.5px] md:text-[11.5px] text-gray-500 leading-tight mt-0.5 hidden sm:block">{texto}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
