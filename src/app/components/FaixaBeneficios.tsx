// Componente FaixaBeneficios
// O que a loja garante, com os dados de verdade dela (para quais cidades
// entrega, como se paga) em vez de frases de efeito. Nenhuma promessa nova:
// só deixa visível o que já vale nas Configurações.

import { Truck, Gift, QrCode, MessageCircle } from "lucide-react";
import type { ConfigLoja } from "../types";
import { textoCidadesAtendidas } from "../utils";

export function FaixaBeneficios({ config }: { config: ConfigLoja }) {
  const itens = [
    {
      icone: Truck,
      titulo: "Entrega própria",
      texto: `Entregamos em ${textoCidadesAtendidas(config.cidadesAtendidas)}, de 1 a 4 dias úteis.`,
    },
    {
      icone: Gift,
      titulo: "Chega pronto para presentear",
      texto: "Você escolhe a caixa, os produtos e o cartão; a gente monta.",
    },
    {
      icone: QrCode,
      titulo: config.pagamentoCartao ? "Pix ou cartão" : "Pague com Pix",
      texto: config.pixAutomatico
        ? "O Pix é confirmado na hora e o pedido já vai para separação."
        : "Leia o QR Code ou copie o código no app do seu banco.",
    },
    {
      icone: MessageCircle,
      titulo: "Fale com a gente",
      texto: "WhatsApp e e-mail, de segunda a sexta, das 9h às 18h.",
    },
  ];

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-10">
      <div className="painel grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 lg:divide-x divide-black/[0.08]">
        {itens.map(({ icone: Icone, titulo, texto }) => (
          <div key={titulo} className="flex sm:flex-col items-start sm:items-center sm:text-center gap-4 sm:gap-3 px-5 py-5 sm:py-8">
            <Icone size={34} strokeWidth={1.25} className="text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-[15px] md:text-[16px] text-gray-800">{titulo}</p>
              <p className="text-[13px] md:text-[13.5px] text-gray-500 mt-1 leading-snug">{texto}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
