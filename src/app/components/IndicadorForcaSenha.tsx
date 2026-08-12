// Indicador visual de força da senha: barra colorida + checklist dos
// requisitos (mesma regra exigida pelo backend — ver validar_senha_forte em
// backend-php/api/lib.php e validarSenhaForte em backend/server.js).

import { Check, X } from "lucide-react";

const REQUISITOS = [
  { chave: "tamanho", label: "Pelo menos 8 caracteres", teste: (s: string) => s.length >= 8 },
  { chave: "minuscula", label: "Uma letra minúscula", teste: (s: string) => /[a-z]/.test(s) },
  { chave: "maiuscula", label: "Uma letra maiúscula", teste: (s: string) => /[A-Z]/.test(s) },
  { chave: "numero", label: "Um número", teste: (s: string) => /[0-9]/.test(s) },
  { chave: "especial", label: "Um caractere especial (!@#$%...)", teste: (s: string) => /[^A-Za-z0-9]/.test(s) },
];

export function forcaSenhaOk(senha: string): boolean {
  return REQUISITOS.every((r) => r.teste(senha));
}

export function IndicadorForcaSenha({ senha }: { senha: string }) {
  if (!senha) return null;

  const atendidos = REQUISITOS.filter((r) => r.teste(senha)).length;
  const nivel =
    atendidos <= 2 ? "fraca" : atendidos <= 4 ? "média" : "forte";
  const cor =
    nivel === "fraca" ? "bg-red-500" : nivel === "média" ? "bg-amber-500" : "bg-emerald-500";
  const corTexto =
    nivel === "fraca" ? "text-red-600" : nivel === "média" ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
          {REQUISITOS.map((r, i) => (
            <div
              key={r.chave}
              className={`flex-1 rounded-full transition-colors ${i < atendidos ? cor : "bg-gray-200"}`}
            />
          ))}
        </div>
        <span className={`text-[11px] font-bold ${corTexto} capitalize`}>{nivel}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {REQUISITOS.map((r) => {
          const ok = r.teste(senha);
          return (
            <li key={r.chave} className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-600" : "text-gray-400"}`}>
              {ok ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0" />}
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
