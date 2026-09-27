// ─── Recomendações da loja ───────────────────────────────────────────────────
//
// Três fontes de sinal, da mais forte para a mais fraca:
//  1. O que OUTRAS pessoas compraram junto com o que esta comprou ("quem
//     comprou isto também comprou") — vem do servidor já somado, sem dizer
//     quem comprou (ver backend-php/api/vitrine.php).
//  2. O gosto da própria pessoa: categoria, marca e faixa de preço do que ela
//     já levou.
//  3. O que a loja mais vende e o que está em oferta.
// Quando não há gosto nenhum para seguir (visitante, conta nova), a loja
// mostra produtos VARIADOS — um pouco de cada categoria, girando a cada dia —
// em vez de repetir sempre as mesmas ofertas.
//
// Em toda lista há uma regra de variedade: cada produto repetido da mesma
// categoria perde pontos, então a lista não vira "cinco perfumes iguais".
//
// Onde isso aparece: na vitrine, na página do produto, na tela de compra
// concluída, no sino de notificações e num pop-up discreto (PopupRecomendacao).

import type { Pedido, Produto } from "./types";
import { CATEGORIA_CAIXA } from "./constantes";

// O que o servidor soma a partir de todos os pedidos pagos
export interface SinaisVitrine {
  maisVendidos: number[]; // ids, do mais vendido para o menos
  compradosJuntos: Record<string, number[]>; // id → ids comprados pelas mesmas pessoas
}
export const SINAIS_VAZIOS: SinaisVitrine = { maisVendidos: [], compradosJuntos: {} };

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
export function produtosComprados(pedidos: Pedido[], catalogo: Produto[], limite = 6): Produto[] {
  const vistos = new Set<number>();
  const comprados: Produto[] = [];
  const ordenados = [...pedidos]
    .filter((o) => o.status !== "Cancelado" && o.status !== "Aguardando pagamento" && o.produtoId)
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

// 0 a 1: quão perto do topo dos mais vendidos o produto está (0 = fora da lista)
function popularidade(p: Produto, sinais: SinaisVitrine): number {
  const pos = sinais.maisVendidos.indexOf(p.id);
  return pos < 0 ? 0 : 1 - pos / sinais.maisVendidos.length;
}

// Quanto os produtos da base "puxam" este candidato: soma, para cada produto
// da base, a posição do candidato na lista de comprados junto (1º = 1).
function forcaCompradoJunto(candidato: Produto, base: Produto[], sinais: SinaisVitrine): number {
  let forca = 0;
  for (const b of base) {
    const lista = sinais.compradosJuntos[String(b.id)] ?? [];
    const pos = lista.indexOf(candidato.id);
    if (pos >= 0) forca += 1 - pos / (lista.length + 1);
  }
  return forca;
}

// Número "aleatório" fixo para cada produto dentro de um mesmo dia: a vitrine
// de descoberta muda de um dia para o outro, mas não pula a cada clique.
function acasoDoDia(id: number, dia: number): number {
  let h = (id ^ (dia * 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const hoje = () => Math.floor(Date.now() / 86_400_000);

// Quanto este produto combina com o que a pessoa comprou. Só uma soma de
// pontos, sem mágica nenhuma — dá para ler a regra inteira aqui e ajustar o
// peso de cada coisa sem quebrar o resto.
function pontuar(candidato: Produto, base: Produto[], sinais: SinaisVitrine): number {
  let pontos = 0;

  // 1. Outras pessoas compraram junto: o sinal mais forte que existe
  pontos += forcaCompradoJunto(candidato, base, sinais) * 60;

  // 2. Mesma categoria: quem comprou perfume volta ao perfume
  if (base.some((b) => b.category === candidato.category)) pontos += 30;

  // 3. Mesma marca: gosto declarado, mas vale menos que a categoria
  if (base.some((b) => b.brand && b.brand === candidato.brand)) pontos += 10;

  // 4. Faixa de preço parecida — algo cinco vezes mais caro do que a pessoa
  //    costuma gastar não é recomendação, é vitrine.
  const precoMedio = base.reduce((acum, b) => acum + b.price, 0) / Math.max(1, base.length);
  if (precoMedio > 0) {
    const distancia = Math.abs(candidato.price - precoMedio) / precoMedio;
    pontos += Math.max(0, 20 - distancia * 20);
  }

  // 5. O que a loja mais vende, ofertas e boas notas
  pontos += popularidade(candidato, sinais) * 15;
  if (estaEmOferta(candidato)) pontos += 10;
  pontos += descontoDe(candidato) * 15;
  pontos += candidato.rating * 2;

  return pontos;
}

// Produtos que podem ser recomendados: em estoque, fora da categoria "Caixas"
// (recipiente para montar presente, não presente sozinho) e que a pessoa ainda
// não comprou.
function candidatos(catalogo: Produto[], jaComprados: Produto[]): Produto[] {
  const comprados = new Set(jaComprados.map((p) => p.id));
  return catalogo.filter((p) => p.stock > 0 && p.category !== CATEGORIA_CAIXA && !comprados.has(p.id));
}

// Escolhe os melhores sem deixar a lista monótona: a cada escolha, os que são
// da mesma categoria de algo já escolhido perdem `penalidade` pontos.
function escolherComVariedade(
  pontuados: { produto: Produto; pontos: number }[],
  quantidade: number,
  penalidade: number
): Produto[] {
  const restantes = [...pontuados];
  const porCategoria = new Map<string, number>();
  const escolhidos: Produto[] = [];
  while (escolhidos.length < quantidade && restantes.length > 0) {
    let melhor = 0;
    let melhorValor = -Infinity;
    restantes.forEach((x, i) => {
      const valor = x.pontos - (porCategoria.get(x.produto.category) ?? 0) * penalidade;
      if (valor > melhorValor || (valor === melhorValor && x.produto.id < restantes[melhor].produto.id)) {
        melhorValor = valor;
        melhor = i;
      }
    });
    const [escolhido] = restantes.splice(melhor, 1);
    escolhidos.push(escolhido.produto);
    porCategoria.set(escolhido.produto.category, (porCategoria.get(escolhido.produto.category) ?? 0) + 1);
  }
  return escolhidos;
}

// Para quem a loja ainda não conhece: um pouco de cada categoria, puxando os
// mais vendidos e as ofertas, com um toque de acaso que muda todo dia.
export function descobrirProdutos(catalogo: Produto[], quantidade: number, sinais: SinaisVitrine = SINAIS_VAZIOS): Produto[] {
  const dia = hoje();
  const pontuados = candidatos(catalogo, []).map((p) => ({
    produto: p,
    pontos:
      popularidade(p, sinais) * 30 +
      (estaEmOferta(p) ? 12 : 0) +
      descontoDe(p) * 15 +
      p.rating * 2 +
      acasoDoDia(p.id, dia) * 35,
  }));
  return escolherComVariedade(pontuados, quantidade, 40);
}

// O resultado final: os produtos que mais combinam com o que a pessoa
// comprou. Sem nada comprado, vira a vitrine de descoberta.
export function recomendarProdutos(
  base: Produto[],
  catalogo: Produto[],
  quantidade = 4,
  sinais: SinaisVitrine = SINAIS_VAZIOS
): Produto[] {
  if (base.length === 0) return descobrirProdutos(catalogo, quantidade, sinais);
  const pontuados = candidatos(catalogo, base).map((p) => ({ produto: p, pontos: pontuar(p, base, sinais) }));
  return escolherComVariedade(pontuados, quantidade, 18);
}

// "Quem comprou este produto também comprou": dados reais de outras
// compras. Com poucas vendas ainda, completa com produtos parecidos (mesma
// categoria e faixa de preço) — a seção nunca fica vazia à toa.
export function compradosJuntosCom(
  produto: Produto,
  catalogo: Produto[],
  quantidade: number,
  sinais: SinaisVitrine = SINAIS_VAZIOS
): { produtos: Produto[]; deVerdade: boolean } {
  const disponiveis = candidatos(catalogo, [produto]);
  const ids = sinais.compradosJuntos[String(produto.id)] ?? [];
  const juntos = ids
    .map((id) => disponiveis.find((p) => p.id === id))
    .filter((p): p is Produto => Boolean(p))
    .slice(0, quantidade);
  if (juntos.length >= Math.min(3, quantidade)) return { produtos: juntos, deVerdade: true };
  const completar = recomendarProdutos([produto], catalogo, quantidade + juntos.length, sinais).filter(
    (p) => !juntos.some((j) => j.id === p.id)
  );
  return { produtos: [...juntos, ...completar].slice(0, quantidade), deVerdade: false };
}

// Os mais vendidos de verdade (pedidos pagos). Enquanto a loja não tem
// vendas, usa a quantidade de avaliações como aproximação.
export function maisVendidosDaLoja(catalogo: Produto[], quantidade: number, sinais: SinaisVitrine = SINAIS_VAZIOS): Produto[] {
  const disponiveis = candidatos(catalogo, []);
  const vendidos = sinais.maisVendidos
    .map((id) => disponiveis.find((p) => p.id === id))
    .filter((p): p is Produto => Boolean(p));
  if (vendidos.length >= quantidade) return vendidos.slice(0, quantidade);
  const porAvaliacoes = disponiveis
    .filter((p) => p.reviews > 0 && !vendidos.some((v) => v.id === p.id))
    .sort((a, b) => b.reviews - a.reviews || b.rating - a.rating);
  return [...vendidos, ...porAvaliacoes].slice(0, quantidade);
}

// As ofertas da loja: maior desconto primeiro; empate desempata pela nota.
export function ofertasEmDestaque(catalogo: Produto[], quantidade = 4): Produto[] {
  return candidatos(catalogo, [])
    .filter(estaEmOferta)
    .sort((a, b) => descontoDe(b) - descontoDe(a) || b.rating - a.rating || a.id - b.id)
    .slice(0, quantidade);
}

// Frase curta que explica por que ESTE produto está sendo mostrado. Aparece na
// notificação e no pop-up: recomendação sem motivo parece anúncio.
export function motivoDaRecomendacao(produto: Produto, base: Produto[], sinais: SinaisVitrine = SINAIS_VAZIOS): string {
  if (forcaCompradoJunto(produto, base, sinais) > 0) return "Quem comprou o mesmo que você também levou";
  const desconto = descontoDe(produto);
  if (desconto >= 0.05) return `${Math.round(desconto * 100)}% de desconto agora`;
  if (base.some((b) => b.brand && b.brand === produto.brand)) return `Da ${produto.brand}, que você já comprou`;
  if (base.some((b) => b.category === produto.category)) return "Combina com o que você comprou";
  if (popularidade(produto, sinais) > 0) return "Um dos mais vendidos da loja";
  return "Novidade para você conhecer";
}
