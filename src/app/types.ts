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
  category: string;
  badge?: string;
  freeShipping: boolean;
  stock: number;
  description?: string;
  // E-mail do vendedor dono do produto (vazio = produto da própria loja)
  owner?: string;
  // % de desconto pagando no PIX, definido produto a produto (vazio = sem desconto)
  pixDesconto?: number;
}


// Item do carrinho: produto + quantidade escolhida
export interface ItemCarrinho extends Produto {
  qty: number;
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
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  category: string;
}


// Cargos que o Admin, o MasterPlus e o Master podem dar a um usuário.
// MasterPlus: acima do Master. Cadastra a própria equipe de vendedores (como
// um Master) e também pode promover um vendedor de destaque da própria
// equipe a Master (ver vinculosMasterPlus, em App.tsx). Ganha 10% fixo sobre
// as próprias vendas (código pessoal, igual ao Master) mais a comissão de
// rede (equipe própria + repasse da equipe do Master que promoveu).
// Master: painel próprio SEM a página de Produtos, cadastra vendedores (com
// código de ativação) e dá o cargo de Vendedor a outros usuários. Pode haver
// vários Masters, cada um com a própria equipe de vendedores. Um Master pode
// ter sido promovido por um MasterPlus (ver vinculosMasterPlus) — nesse caso
// a comissão dele sobre a própria equipe é menor (1% em vez do padrão),
// porque 1% vai de repasse ao MasterPlus que o promoveu.
// Vendedor: divulga os produtos da loja com o código de venda pessoal e
// ganha comissão pelo próprio nível.
export type Cargo = "vendedor" | "master" | "masterplus";


// Vínculo criado quando o Master cadastra um vendedor. O código gerado é
// entregue ao vendedor, que o usa para ativar a própria conta no perfil.
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
}


export type Tela = "login" | "loja" | "carrinho" | "pagamento" | "admin" | "master" | "masterplus" | "vendedor" | "sucesso" | "perfil" | "notificacoes";


// Dados do pagamento escolhido no carrinho (aguardando confirmação)
export interface DadosPagamento {
  metodo: "cartao" | "pix";
  total: number;
  parcelas: number;
  // Endereço de entrega montado no carrinho (via CEP + número informado)
  endereco: string;
}


// Cartão salvo do cliente, guardado no banco após uma compra com Cartão.
// POR SEGURANÇA (padrão PCI): nunca guarda o número completo nem o CVV —
// só o suficiente para o cliente reconhecer o cartão numa lista.
export interface CartaoSalvo {
  id: number;
  email: string; // dono do cartão (cliente logado)
  bandeira: string; // Visa, Mastercard, Elo, Amex... (detectada pelo número digitado)
  nomeCartao: string; // nome impresso no cartão
  ultimosDigitos: string; // só os 4 últimos dígitos
  validade: string; // MM/AA
  // Cofre do Mercado Pago: presentes só quando esse cartão foi de fato
  // tokenizado e salvo lá (POST /api/cartao/salvar). Sem esses ids não dá pra
  // cobrar de novo — é preciso digitar o cartão de novo.
  mpCardId?: string;
  mpCustomerId?: string;
}


// Dados digitados no formulário de cartão, na tela de pagamento — só existem
// no navegador durante a compra. O número completo e o CVV NUNCA são salvos
// em lugar nenhum (nem no banco, nem no estado do app depois de confirmado).
export interface DadosCartaoDigitado {
  numero: string;
  nome: string;
  validade: string;
  cvv: string;
  // Preenchidos quando o cartão foi salvo de verdade no cofre do Mercado
  // Pago nesta compra (cartão novo) ou reaproveitado de um já salvo — é o
  // que permite cobrar de novo só com CVV numa próxima compra.
  mpCardId?: string;
  mpCustomerId?: string;
  bandeira?: string;
}

// Resultado real de uma cobrança no Mercado Pago, devolvido pelo backend
// (POST /api/pagamento/cartao) depois de tokenizar o cartão no navegador.
export interface ResultadoPagamentoCartao {
  paymentId: string | number;
  status: "approved" | "in_process" | "pending" | "rejected" | "cancelled" | string;
  statusDetail?: string | null;
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
