// ─── Service worker da Coração Presente ──────────────────────────────────────
// Só cuida das notificações. Não guarda página em cache de propósito: o site
// muda com frequência (preço, estoque, banner) e cache mal ajustado faria o
// cliente ver produto errado. Se um dia quiser o site funcionando offline,
// esta é a hora de acrescentar — e testar bastante.
//
// O endereço da API vem na URL do registro (sw.js?api=...), porque este
// arquivo é estático e não passa pelo build do Vite.

const API = new URL(self.location).searchParams.get("api") || "";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

// O push chega VAZIO (o servidor só nos "cutuca"). O texto de verdade vem
// desta busca — assim o servidor não precisa criptografar o conteúdo.
self.addEventListener("push", (evento) => {
  evento.waitUntil((async () => {
    let avisos = [];
    try {
      const inscricao = await self.registration.pushManager.getSubscription();
      if (inscricao) {
        const cracha = await hashDoEndpoint(inscricao.endpoint);
        const resposta = await fetch(`${API}/api/push/pendentes?e=${cracha}`);
        if (resposta.ok) avisos = (await resposta.json()).avisos || [];
      }
    } catch (e) {
      // Rede caiu no meio: melhor um aviso genérico do que nenhum — o
      // navegador exige que todo push mostre alguma notificação.
    }

    if (avisos.length === 0) {
      avisos = [{
        titulo: "Novidade no seu pedido",
        corpo: "Toque para ver o andamento da sua compra.",
      }];
    }

    await Promise.all(avisos.map((aviso) =>
      self.registration.showNotification(aviso.titulo, {
        body: aviso.corpo,
        icon: "/logo.png",
        badge: "/favicon.png",
        // Foto do produto dentro da notificação (recomendação depois da
        // compra). Onde o sistema não souber mostrar imagem grande, ele
        // simplesmente ignora este campo.
        image: aviso.foto || undefined,
        // Uma notificação por assunto: status novo do mesmo pedido substitui o
        // aviso anterior, e a recomendação tem a tag do próprio destino — sem
        // isso ela empilharia com os avisos de pedido.
        tag: aviso.pedidoId || aviso.link || "aviso",
        data: { url: aviso.link || (aviso.pedidoId ? `/?pedido=${aviso.pedidoId}` : "/") },
      })
    ));
  })());
});

// Tocou na notificação: traz a aba que já estiver aberta para a frente, em vez
// de abrir uma nova a cada toque.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || "/";
  evento.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const aba of abas) {
      if (aba.url.includes(self.location.origin)) {
        await aba.focus();
        if ("navigate" in aba) await aba.navigate(destino).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});

// Mesmo "crachá" que o backend usa para achar a inscrição: sha-256 do endpoint
async function hashDoEndpoint(endpoint) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
