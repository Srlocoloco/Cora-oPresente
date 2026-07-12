// Componente SeloStatus

// ─── Status Badge ─────────────────────────────────────────────────────────────

export function SeloStatus({ status }: { status: string }) {
  const estilos: Record<string, string> = {
    Entregue: "bg-emerald-100 text-emerald-700",
    "Em trânsito": "bg-blue-100 text-blue-700",
    Processando: "bg-amber-100 text-amber-700",
    Cancelado: "bg-red-100 text-red-600",
  };
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${estilos[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ─── Products Admin ───────────────────────────────────────────────────────────
