// Tipos e interfaces compartilhados pelo site inteiro

export interface Produto {
  id: number;
  // Código sequencial por categoria (ex.: "BEL-001"), gerado automaticamente
  // ao cadastrar o produto — fica fixo mesmo se a categoria mudar depois
  codigo?: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  installments: number;
  rating: number;
  reviews: number;
  image: string;
  // Imagens extras do produto (além de "image", que continua sendo a capa).
  // Usadas na galeria da página do produto.
  images?: string[];
  category: string;
  badge?: string;
  freeShipping: boolean;
  stock: number;
  // E-mail do vendedor dono do produto (vazio = produto da própria loja)
  owner?: string;
  // % de desconto pagando no PIX, definido produto a produto (vazio = sem desconto)
  pixDesconto?: number;
  // Variações de cor/modelo do produto (ex.: pulseiras/mostradores diferentes
  // do mesmo relógio), para o cliente escolher antes de comprar
  colors?: CorProduto[];
  // Tamanhos P/M/G — só faz sentido nos produtos da categoria "Caixas". Caixa
  // sem isto preenchido é de tamanho único e usa o price/stock do produto.
  tamanhos?: TamanhoCaixa[];
  // Descrição opcional do produto, mostrada na página de detalhes
  description?: string;
  // Nome da cor escolhida na página do produto antes de "Comprar" — só
  // existe numa cópia do produto colocada no carrinho (ItemCarrinho), nunca
  // no cadastro em si. Cada cor escolhida vira uma linha separada no
  // carrinho, com a foto e o estoque daquela cor específica.
  corEscolhida?: string;
}

// Um tamanho da mesma caixa. É o próprio recipiente em três medidas, cada
// uma com preço, estoque e capacidade próprios — por isso não dá para
// reaproveitar CorProduto, que não tem preço nem capacidade.
export interface TamanhoCaixa {
  tamanho: "P" | "M" | "G";
  price: number;
  estoque: number;
  // Quantos produtos cabem dentro (soma das quantidades). É o que faz o
  // tamanho significar algo para o cliente, e não ser só um preço maior.
  capacidade: number;
}


// Uma opção de cor/modelo dentro de um produto
export interface CorProduto {
  nome: string; // ex.: "Prata", "Dourado", "Preto"
  hex?: string; // cor aproximada p/ mostrar como bolinha, ex.: "#C0C0C0"
  image?: string; // foto do produto nessa cor (opcional, cai na capa se vazio)
  estoque?: number; // estoque específico dessa cor (opcional)
}


// ─── Monte sua Caixa ──────────────────────────────────────────────────────────
// Um produto escolhido pelo cliente para ir DENTRO da caixa. Guarda uma cópia
// dos dados na hora da escolha (nome, preço, foto) para a caixa continuar
// legível no carrinho e no pedido mesmo se o produto mudar depois.
export interface ItemDaCaixa {
  produtoId: number;
  name: string;
  price: number;
  image: string;
  qty: number;
}


// A caixa montada pelo cliente: o recipiente escolhido (um produto da
// categoria "Caixas") + os produtos colocados dentro + o cartão de mensagem.
// Ela viaja no carrinho como UMA linha só (ver ItemCarrinho.caixa), mas na
// hora de dar baixa no estoque cada produto de dentro conta separado — ver
// itensParaEstoque em utils.ts.
export interface CaixaMontada {
  // Identificador da montagem (não é id de produto): serve para editar a
  // mesma caixa depois, já no carrinho
  id: string;
  recipienteId: number;
  recipienteNome: string;
  recipienteImagem: string;
  // Preço do TAMANHO escolhido (não o do produto): é ele que entra na conta
  recipientePreco: number;
  // Tamanho escolhido e o teto de produtos que ele comporta. Ficam vazios nas
  // caixas de tamanho único e nas montagens feitas antes desta funcionalidade
  // existir — por isso todo o código trata a ausência como "sem limite".
  recipienteTamanho?: "P" | "M" | "G";
  recipienteCapacidade?: number;
  itens: ItemDaCaixa[];
  // Cartão de mensagem escrito pelo cliente (opcional)
  para?: string;
  de?: string;
  mensagem?: string;
}


// Item do carrinho: produto + quantidade escolhida
export interface ItemCarrinho extends Produto {
  qty: number;
  // Preenchido só nas linhas que são uma caixa montada pelo cliente. Nesse
  // caso o "produto" da linha é sintético (id negativo, preço somado) e o
  // conteúdo de verdade está aqui dentro.
  caixa?: CaixaMontada;
}


// Usuário autenticado (cliente logado)
export interface Usuario {
  name: string;
  email: string;
}


// Valores da loja que o Admin pode ajustar na página Configurações
export interface ConfigLoja {
  chavePix: string;
  freteGratisAcima: number; // compras acima deste valor têm frete grátis
  freteCapital: number; // frete para Curitiba
  freteInterior: number; // frete para o interior do Paraná
  fretePadrao: number; // frete sem CEP informado
  comissaoRecrutador: number; // % do Master sobre as vendas dos vendedores (a equipe)
  // Cidades onde a loja entrega, separadas por vírgula (ex.: "Altônia, Pérola").
  // Vazio = todo o Paraná. O carrinho recusa CEP de fora desta lista ANTES de
  // deixar o cliente pagar — vender o que não se entrega custa o cancelamento,
  // a devolução e o cliente.
  cidadesAtendidas: string;
}


// Cupom criado pelo Admin; o cliente digita o código no carrinho
export interface Cupom {
  codigo: string;
  percentual: number; // % de desconto sobre o subtotal
  validade: string; // última data válida (AAAA-MM-DD)
  ativo: boolean;
  usos: number; // quantas compras já usaram este cupom
}


// Banner rotativo do topo da loja, editado pelo Admin (sem mexer em código)
export interface Banner {
  id: number;
  image: string;
  // Versão opcional pensada pro formato do celular (mais alta/quadrada) —
  // sem ela, o mobile usa a mesma imagem do desktop
  mobileImage?: string;
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  category: string;
}


// Cargos que o Admin, o MasterPlus e o Master podem dar a um usuário.
// MasterPlus: acima do Master. Cadastra a própria equipe de vendedores (como
// um Master) e também pode promover um vendedor de destaque da própria
// equipe a Master (ver vinculosMasterPlus, em App.tsx). Ganha 7% fixo sobre
// as próprias vendas (código pessoal) mais a comissão de
// rede (equipe própria + repasse da equipe do Master que promoveu).
// Master: painel próprio SEM a página de Produtos, cadastra vendedores (com
// código de ativação) e dá o cargo de Vendedor a outros usuários. Pode haver
// vários Masters, cada um com a própria equipe de vendedores. Um Master pode
// ter sido promovido por um MasterPlus (ver vinculosMasterPlus) — nesse caso
// a comissão dele sobre a própria equipe é menor (1% em vez do padrão),
// porque 1% vai de repasse ao MasterPlus que o promoveu.
// Vendedor: divulga os produtos da loja com o código de venda pessoal e
// ganha comissão pelo próprio nível.
// Cargos da loja. "entregador" é o único que não vende nada: ele só enxerga as
// entregas designadas a ele (ver PaginaEntregas) e move o pedido de "saiu para
// entrega" até "entregue".
export type Cargo = "vendedor" | "master" | "masterplus" | "entregador";


// Vínculo criado quando o Master cadastra um vendedor. O código gerado é
// entregue ao vendedor, que o usa para ativar a própria conta no perfil.
// O que o painel recebe de volta ao cadastrar um vendedor. O servidor é quem
// decide o caminho: conta que JÁ existe na loja entra na equipe na hora
// (jaEraCliente), conta nova recebe um código para ativar depois.
export interface ResultadoCadastroVendedor {
  // Mensagem para mostrar no formulário; null quando deu certo
  erro: string | null;
  codigo?: string;
  jaEraCliente?: boolean;
}

export interface Recrutamento {
  codigo: string;
  recrutador: string; // e-mail de quem cadastrou (sempre o Master)
  nome: string; // nome do vendedor cadastrado
  email: string; // e-mail do vendedor cadastrado
  ativado: boolean; // vira true quando o vendedor usa o código
  date: string;
}


// Pedido gerado a cada compra finalizada
export interface Pedido {
  id: string;
  customer: string;
  email: string;
  items: string;
  total: number;
  status: string;
  date: string;
  month: string;
  category: string;
  pagamento?: string;
  // E-mail da conta que leva o crédito da venda: o dono do código de venda
  // informado pelo cliente ou, sem código, o vendedor dono do produto
  vendedor?: string;
  // Código de venda usado pelo cliente nesta compra (se houve)
  codigoVenda?: string;
  // Endereço de entrega do pedido
  endereco?: string;
  // Identificador da COMPRA: o mesmo em todas as linhas que saíram do mesmo
  // carrinho. Uma compra de 3 produtos vira 3 linhas aqui (uma por produto,
  // para o estoque e o acompanhamento), e é este campo que volta a juntá-las
  // numa compra só na tela do Admin. Pedido antigo não tem — cada linha dele
  // conta como uma compra.
  compraId?: string;
  // Código do cupom de desconto usado nesta compra (se houve) — cada cupom só
  // pode ser usado uma vez por cliente, então isso é checado no próximo carrinho
  cupomUsado?: string;
  // Código de postagem dos Correios (ex.: AA123456789BR), preenchido pelo
  // Admin ao despachar. É o que permite mostrar o rastreamento real na
  // página "Rastrear Pedido".
  codigoRastreio?: string;
  // Produto comprado nesta linha (cada item do carrinho vira uma linha de
  // pedido própria — ver confirmarPagamento em App.tsx). Usado para buscar a
  // foto do produto nos e-mails de confirmação de compra e de entrega.
  produtoId?: number;
  // E-mail do entregador designado pelo Admin para levar este pedido. É por
  // ele que o painel de entregas mostra a cada entregador só o que é dele.
  entregador?: string | null;
}


// Cliente cadastrado na loja
export interface Cliente {
  name: string;
  email: string;
  since: string;
  // Data de cadastro em formato ISO (AAAA-MM-DD) — usada para calcular
  // métricas por período exato (ex.: "Clientes Novos" da semana atual no
  // Dashboard). Clientes cadastrados antes dessa coluna existir não têm esse
  // campo (undefined) e não entram nas contagens por semana.
  criadoEm?: string;
  // true = e-mail verificado de verdade pelo login do Google (JWT do Google);
  // usado para exigir e-mail verificado antes de dar o cargo de Vendedor
  viaGoogle?: boolean;
  vendedorVinculado?: string;
}


export type Tela = "login" | "loja" | "carrinho" | "pagamento" | "admin" | "master" | "masterplus" | "vendedor" | "entregador" | "sucesso" | "perfil" | "notificacoes" | "institucional" | "montar-caixa";


// Dados do pagamento escolhido no carrinho (aguardando confirmação)
export interface DadosPagamento {
  metodo: "pix" | "cartao";
  total: number;
  // Parcelas escolhidas no cartão (PIX é sempre 1)
  parcelas: number;
  // Endereço de entrega montado no carrinho (via CEP + número informado)
  endereco: string;
}


// Avaliação de um produto: só clientes que compraram podem enviar (1 por
// cliente por produto — enviar de novo atualiza a mesma avaliação). Aparece
// na hora na página do produto (sem fila de aprovação); o Admin pode excluir
// uma avaliação imprópria a qualquer momento (ver PaginaAvaliacoesAdmin).
export interface Avaliacao {
  id: number;
  produtoId: number;
  clienteEmail: string;
  clienteNome: string;
  nota: number; // 1 a 5
  comentario: string;
  // Vídeo curto enviado pelo cliente, como data URL base64 (ex.: "data:video/mp4;base64,...")
  video?: string;
  date: string; // dd/mm/aaaa
}
