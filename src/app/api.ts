// ─── Conversa com o backend ───────────────────────────────────────────────────
//
// Um jeito só de chamar a API, usado pelo site inteiro. Antes cada tela fazia
// o próprio fetch — umas mandavam o token, outras esqueciam (era por isso que o
// pagamento no cartão sempre respondia "Não autorizado"), e cada uma tratava o
// erro de um jeito.
//
// Sempre devolve { ok, status, dados, erro } e nunca lança: quem chama decide
// o que mostrar. "erro" já vem com uma frase pronta para o usuário.

import { URL_BACKEND_PIX } from "./constantes";
import { cabecalhosAuth } from "./authToken";

export interface RespostaApi<T = any> {
  ok: boolean;
  status: number;
  dados: T | null;
  erro: string | null;
}

export async function api<T = any>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; sinal?: AbortSignal } = {}
): Promise<RespostaApi<T>> {
  const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? "POST" : "GET");
  try {
    const r = await fetch(`${URL_BACKEND_PIX}${caminho}`, {
      method: metodo,
      headers: {
        ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        ...cabecalhosAuth(),
      },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      signal: opcoes.sinal,
    });
    let dados: any = null;
    try {
      dados = await r.json();
    } catch {
      // resposta sem JSON (ex.: 404 de rota inexistente)
    }
    if (r.ok) return { ok: true, status: r.status, dados, erro: null };
    const erro =
      typeof dados?.erro === "string"
        ? dados.erro
        : r.status === 401
        ? "Sua sessão expirou. Entre na sua conta de novo."
        : r.status === 429
        ? "Muitas tentativas em pouco tempo. Aguarde um instante."
        : "Não foi possível concluir agora. Tente de novo.";
    return { ok: false, status: r.status, dados, erro };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { ok: false, status: 0, dados: null, erro: null };
    return { ok: false, status: 0, dados: null, erro: "Sem conexão com o servidor. Confira sua internet e tente de novo." };
  }
}

// Baixa um arquivo de uma rota autenticada (o link direto não levaria o token).
export async function baixarArquivo(caminho: string, nomePadrao: string): Promise<string | null> {
  try {
    const r = await fetch(`${URL_BACKEND_PIX}${caminho}`, { headers: cabecalhosAuth() });
    if (!r.ok) {
      const corpo = await r.json().catch(() => null);
      return corpo?.erro ?? "Não foi possível baixar o arquivo.";
    }
    const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? nomePadrao;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return null;
  } catch {
    return "Sem conexão com o servidor.";
  }
}
