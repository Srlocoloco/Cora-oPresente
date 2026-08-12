// ─── Notificações no celular (Web Push) ──────────────────────────────────────
// Liga o site ao service worker (public/sw.js). Tudo aqui degrada em silêncio:
// navegador antigo, servidor sem chave VAPID configurada ou permissão negada
// simplesmente não oferecem o recurso — nada quebra.

import { URL_BACKEND_PIX } from "./constantes";
import { cabecalhosAuth } from "./authToken";

// O navegador precisa dos três para funcionar; o iPhone só entrega push quando
// o site foi adicionado à tela inicial (aí ele passa a existir aqui também).
export function suportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function permissaoAtual(): NotificationPermission | null {
  return suportaPush() ? Notification.permission : null;
}

// A chave pública fica só no servidor (é derivada do vapid.pem) — o site
// pergunta por ela na hora de inscrever. null = push desligado no servidor.
async function chavePublica(): Promise<string | null> {
  try {
    const r = await fetch(`${URL_BACKEND_PIX}/api/push/chave-publica`);
    if (!r.ok) return null;
    return (await r.json())?.chave ?? null;
  } catch {
    return null;
  }
}

// A API do navegador quer a chave como bytes, não como texto
function base64urlParaBytes(base64url: string): Uint8Array {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(base64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!suportaPush()) return null;
  try {
    // O endereço da API viaja na URL porque o sw.js é estático (não passa
    // pelo build do Vite e por isso não enxerga as variáveis de ambiente).
    return await navigator.serviceWorker.register(
      `/sw.js?api=${encodeURIComponent(URL_BACKEND_PIX)}`,
      { scope: "/" },
    );
  } catch {
    return null;
  }
}

// Existe push configurado no servidor E o navegador dá conta? Decide se o
// botão de "ativar notificações" deve sequer aparecer.
export async function pushDisponivel(): Promise<boolean> {
  return suportaPush() && (await chavePublica()) !== null;
}

export async function jaInscrito(): Promise<boolean> {
  if (!suportaPush()) return false;
  const registro = await navigator.serviceWorker.getRegistration();
  return Boolean(await registro?.pushManager.getSubscription());
}

// Pede permissão, inscreve no navegador e avisa o servidor. Devolve a mensagem
// de erro quando não dá certo, ou null quando deu tudo certo.
export async function ativarNotificacoes(): Promise<string | null> {
  if (!suportaPush()) return "Este navegador não aceita notificações.";

  const chave = await chavePublica();
  if (!chave) return "As notificações ainda não estão configuradas no servidor.";

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    return permissao === "denied"
      ? "As notificações foram bloqueadas neste navegador. Libere nas configurações do site para voltar a receber."
      : "Permissão não concedida.";
  }

  const registro = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!registro) return "Não foi possível preparar as notificações.";

  try {
    // userVisibleOnly: obrigatório nos navegadores — é a promessa de que todo
    // push vira uma notificação visível, nunca algo silencioso em segundo plano
    const inscricao =
      (await registro.pushManager.getSubscription()) ??
      (await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlParaBytes(chave),
      }));

    const resposta = await fetch(`${URL_BACKEND_PIX}/api/push/inscrever`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhosAuth() },
      body: JSON.stringify({ endpoint: inscricao.endpoint }),
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      return corpo?.erro || "Não foi possível salvar sua inscrição. Tente de novo.";
    }
    return null;
  } catch {
    return "Não foi possível ativar as notificações neste aparelho.";
  }
}

// Um mesmo celular pode trocar de dono (a filha entra na conta dela depois da
// mãe). A inscrição no navegador continua a mesma, então basta reapresentá-la
// ao servidor a cada login para os avisos passarem a ir para a conta certa.
export async function sincronizarInscricao(): Promise<void> {
  if (!suportaPush() || Notification.permission !== "granted") return;
  try {
    const registro = await navigator.serviceWorker.getRegistration();
    const inscricao = await registro?.pushManager.getSubscription();
    if (!inscricao) return;
    await fetch(`${URL_BACKEND_PIX}/api/push/inscrever`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhosAuth() },
      body: JSON.stringify({ endpoint: inscricao.endpoint }),
    });
  } catch {
    // Sem rede agora: na próxima abertura do site tenta de novo
  }
}

export async function desativarNotificacoes(): Promise<void> {
  if (!suportaPush()) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = await registro?.pushManager.getSubscription();
  if (!inscricao) return;
  // Avisa o servidor primeiro: depois de cancelar no navegador o endpoint some
  await fetch(`${URL_BACKEND_PIX}/api/push/inscrever`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...cabecalhosAuth() },
    body: JSON.stringify({ endpoint: inscricao.endpoint }),
  }).catch(() => {});
  await inscricao.unsubscribe().catch(() => {});
}
