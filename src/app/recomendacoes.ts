// ─── Recomendações da loja ───────────────────────────────────────────────────
//
// Depois que alguém compra, a loja passa a ter uma informação que antes não
// tinha: o gosto daquela pessoa. Este arquivo transforma isso em "o que
// oferecer agora" — os produtos parecidos com o que ela levou, dando
// preferência a quem está em oferta.
//
// Tudo acontece no navegador, em cima do catálogo e dos pedidos que a conta já
// recebeu do servidor: nenhuma chamada nova, nenhum dado a mais guardado sobre
// o cliente. Sem compra nenhuma (visitante, primeira visita), cai nas ofertas
// da loja — melhor do que não mostrar nada.
//
// Onde isso aparece: na tela de compra concluída, no sino de notificações, num
// pop-up discreto dentro do site (ver PopupRecomendacao) e na notificação do
// celular (essa última é montada no servidor, em checkout.php, porque precisa
// sair mesmo com o site fechado).

import type { Pedido, Produto } from "./types";
import { CATEGORIA_CAIXA } from "./constantes";

// Desconto real do produto, em fração (0.2 = 20% off; 0 = sem desconto)
export function descontoDe(p: Produto): number {
  if (!p.originalPrice || p.originalPrice <= p.price) return 0;
  return (p.originalPrice - p.price) / p.originalPrice;
}

// O que a loja chama de "oferta": desconto de verdade no preço ou o selo que o
// Admin colocou à mão no produto.
export function estaEmOferta(p: Produto): boolean {
  return descontoDe(p) >= 0.05 || p.badge === "OFERTA";
}

// "06/07/2026" → milissegundos. Data vazia ou estranha vira 0 (vai para o fim
// da fila em vez de derrubar a ordenação).
function emMilissegundos(dataBr?: string): number {
  const [dia, mes, ano] = (dataBr ?? "").split("/").map(Number);
  if (!dia || !mes || !ano) return 0;
  return new Date(ano, mes - 1, dia).getTime();
}

// Os produtos que esta pessoa comprou, do mais recente para o mais antigo.
// Pedido cancelado não conta: ele diz o contrário do gosto dela.
export function produtosComprados(
  pedidos: Pedido[],
  catalogo: Produto[],
  limite = 6
): Produto[] {
  const vistos = new Set<number>();
  const comprados: Produto[] = [];
  const ordenados = [...pedidos]
    .filter((o) => o.status !== "Cancelado" && o.produtoId)
    .sort((a, b) => emMilissegundos(b.date) - emMilissegundos(a.date));

  for (const pedido of ordenados) {
    const id = pedido.produtoId as number;
    if (vistos.has(id)) continue;
    const produto = catalogo.find((p) => p.id === id);
    if (!produto) continue; // produto saiu do catálogo
    vistos.add(id);
    comprados.push(produto);
    if (comprados.length >= limite) break;
  }
  return comprados;
}

// Quanto este produto combina com o que a pessoa comprou. Só uma soma de
// pontos, sem mágica nenhuma — e é de propósito: dá para ler a regra inteira
// aqui e ajustar o peso de cada coisa sem quebrar o resto.
function pontuar(candidato: Produto, base: Produto[]): number {
  let pontos = 0;

  // 1. Mesma categoria é o sinal mais forte: quem comprou perfume volta ao
  //    perfume muito mais do que a qualquer outra prateleira.
  if (base.some((b) => b.category === candidato.category)) pontos += 50;

  // 2. Mesma marca: gosto declarado, mas vale menos que a categoria
  if (base.some((b) => b.brand && b.brand === candidato.brand)) pontos += 12;

  // 3. Faixa de preço parecida — recomendar algo cinco vezes mais caro do que
  //    a pessoa costuma gastar não é recomendação, é vitrine.
  const precoMedio = base.reduce((acum, b) => acum + b.price, 0) / Math.max(1, base.length);
  if (precoMedio > 0) {
    const distancia = Math.abs(candidato.price - precoMedio) / precoMedio;
    pontos += Math.max(0, 25 - distancia * 25);
  }

  // 4. Oferta primeiro: é o que o cliente quer ver numa recomendação, e o que
  //    a loja quer girar.
  if (estaEmOferta(candidato)) pontos += 15;
  pontos += descontoDe(candidato) * 20;

  // 5. Prova social e conveniência
  pontos += candidato.rating * 3;
  if (candidato.badge === "MAIS VENDIDO" || candidato.badge === "TOP VENDA") pontos += 6;
  if (candidato.freeShipping) pontos += 4;

  return pontos;
}

// Produtos que podem ser recomendados: em estoque, fora da categoria "Caixas"
// (recipiente para montar presente, não presente sozinho) e que a pessoa ainda
// não comprou.
function candidatos(catalogo: Produto[], jaComprados: Produto[]): Produto[] {
  const comprados = new Set(jaComprados.map((p) => p.id));
  return catalogo.filter(
    (p) => p.stock > 0 && p.category !== CATEGORIA_CAIXA && !comprados.has(p.id)
  );
}

// As ofertas da loja, para quem ainda não comprou nada (visitante, conta nova).
// Maior desconto primeiro; empate desempata pela nota.
export function ofertasEmDestaque(catalogo: Produto[], quantidade = 4): Produto[] {
  return candidatos(catalogo, [])
    .filter(estaEmOferta)
    .sort((a, b) => descontoDe(b) - descontoDe(a) || b.rating - a.rating || a.id - b.id)
    .slice(0, quantidade);
}

// O resultado final: os produtos mais parecidos com o que a pessoa comprou.
// Sem base de comparação, devolve as ofertas em destaque (e, se a loja não tem
// nenhuma oferta no ar, os produtos mais bem avaliados) — a lista nunca volta
// vazia à toa.
export function recomendarProdutos(
  base: Produto[],
  catalogo: Produto[],
  quantidade = 4
): Produto[] {
  const disponiveis = candidatos(catalogo, base);

  if (base.length === 0) {
    const ofertas = ofertasEmDestaque(catalogo, quantidade);
    if (ofertas.length >= quantidade) return ofertas;
    const completando = disponiveis
      .filter((p) => !ofertas.some((o) => o.id === p.id))
      .sort((a, b) => b.rating - a.rating || a.id - b.id)
      .slice(0, quantidade - ofertas.length);
    return [...ofertas, ...completando];
  }

  return disponiveis
    .map((p) => ({ produto: p, pontos: pontuar(p, base) }))
    .sort((a, b) => b.pontos - a.pontos || a.produto.id - b.produto.id)
    .slice(0, quantidade)
    .map((x) => x.produto);
}

// Frase curta que explica por que ESTE produto está sendo mostrado. Aparece na
// notificação e no pop-up: recomendação sem motivo parece anúncio.
export function motivoDaRecomendacao(produto: Produto, base: Produto[]): string {
  const desconto = descontoDe(produto);
  if (desconto >= 0.05) return `${Math.round(desconto * 100)}% de desconto agora`;
  if (base.some((b) => b.brand && b.brand === produto.brand)) return `Da ${produto.brand}, que você já comprou`;
  if (base.some((b) => b.category === produto.category)) return `Combina com o que você comprou`;
  if (produto.badge === "MAIS VENDIDO" || produto.badge === "TOP VENDA") return "Um dos mais vendidos da loja";
  if (produto.freeShipping) return "Com frete grátis";
  return "Escolhido para você";
}
