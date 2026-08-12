// ─── Token de sessão (Admin ou cliente) ───────────────────────────────────────
// Guardado só no navegador (localStorage) depois de um login bem-sucedido no
// backend. A senha nunca fica no código do site — só este token temporário,
// usado para autorizar as ações que dependem de "quem está pedindo isso"
// (comprar, avaliar, ativar código de vendedor, salvar cartão, alterar a
// loja inteira...).

const CHAVE_TOKEN = "cp_sessao_token";
const CHAVE_TIPO = "cp_sessao_tipo"; // "admin" | "cliente"

export function obterToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function obterTipoSessao(): "admin" | "cliente" | null {
  try {
    return (localStorage.getItem(CHAVE_TIPO) as "admin" | "cliente" | null) ?? null;
  } catch {
    return null;
  }
}

export function definirSessao(token: string | null, tipo?: "admin" | "cliente"): void {
  try {
    if (token) {
      localStorage.setItem(CHAVE_TOKEN, token);
      if (tipo) localStorage.setItem(CHAVE_TIPO, tipo);
    } else {
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_TIPO);
    }
  } catch {
    // localStorage indisponível (modo privado, etc.) — segue sem persistir
  }
}

// Compatibilidade com o nome usado antes (só para o Admin)
export function definirTokenAdmin(token: string | null): void {
  definirSessao(token, token ? "admin" : undefined);
}

// Cabeçalho pronto para chamadas autenticadas (Admin ou cliente — o backend
// reconhece os dois tipos de token pelo mesmo cabeçalho Authorization)
export function cabecalhosAdmin(): Record<string, string> {
  const token = obterToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Mesmo cabeçalho — nome mais claro para chamadas feitas por um cliente comum
export const cabecalhosAuth = cabecalhosAdmin;
