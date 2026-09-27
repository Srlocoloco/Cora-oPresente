// Componente SeloStatus

// ─── Status Badge ─────────────────────────────────────────────────────────────

export function SeloStatus({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    // "Pago" é o status de todo pedido novo: dinheiro na conta, pedido ainda
    // por separar. Sem uma cor própria ele caía no cinza neutro — o pedido
    // que mais pede ação era o que menos chamava atenção na lista do Admin.
    Pago: "bg-[#C8102E]/10 text-[#A8102A]",
    // Compra registrada, PIX ainda não confirmado
    "Aguardando pagamento": "bg-amber-50 text-amber-800",
    Entregue: "bg-emerald-100 text-emerald-700",
    "Em trânsito": "bg-blue-100 text-blue-700",
    Processando: "bg-amber-100 text-amber-700",
    Cancelado: "bg-red-100 text-red-600",
  };
  return (
    <span className={`inline-block text-[12px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap ${estilos[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ─── Products Admin ───────────────────────────────────────────────────────────
