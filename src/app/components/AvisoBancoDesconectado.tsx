// Componente AvisoBancoDesconectado

// ─── Aviso de Banco Desconectado ──────────────────────────────────────────────

// Aparece quando o backend/MySQL (XAMPP) não responde: nada está sendo salvo
export function AvisoBancoDesconectado() {
  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 right-4 md:left-auto md:w-[400px] z-[70] bg-amber-50 border-2 border-amber-300 text-amber-800 text-[12px] font-semibold px-4 py-3 rounded-xl shadow-lg">
      Sem conexão com o servidor — as alterações NÃO estão sendo salvas.
      Verifique sua internet e recarregue a página.
    </div>
  );
}
