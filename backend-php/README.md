# Backend PHP — versão para a KingHost (hospedagem compartilhada)

## ⚠️ Atualização de setembro/2026 — leia antes de publicar

Esta versão muda o fluxo de compra, o cadastro de produtos e as comissões. O
banco é migrado **sozinho** na primeira chamada à API (tabelas novas e colunas
novas; nenhuma tabela é apagada), mas faça o passo 1 mesmo assim.

### O que mudou (e por quê)

| Antes | Agora |
|---|---|
| O pedido era gravado como "Pago" pelo navegador — dava para chamar `/api/checkout` direto e ganhar um pedido pago sem pagar. A cobrança PIX usava o valor que o navegador mandasse. | A compra nasce **"Aguardando pagamento"**, com preço, frete, cupom e desconto PIX calculados no servidor, e o estoque fica reservado. Só vira "Pago" quando o banco confirma (ou quando o Admin confirma o PIX). Compra não paga vence sozinha e devolve o estoque. |
| O painel gravava o catálogo INTEIRO a cada "Salvar": duas pessoas cadastrando juntas apagavam o produto uma da outra; editar regravava o estoque antigo. | Cada produto é salvo sozinho (`/api/produtos`), com **trava de versão** e estoque aplicado como diferença. Código do produto (BEL-001) fixo, dado pelo servidor. |
| Produto com foto por link (https) nunca salvava. | Aceita link https (a capa) além do upload. |
| Cancelar pedido não devolvia estoque; o estoque geral podia divergir da soma das cores/tamanhos. | Cancelar devolve as unidades; geral = soma das cores/tamanhos. |
| Comissão calculada por semana, com 7% para Master. | **Comissão por venda**, congelada no pagamento: MasterPlus 7% (+2% equipe, +1% rede dos Masters dele); Master 2% nas próprias vendas + 1% da rede; vendedor 4–10%. Percentuais editáveis em Configurações. |
| Pagamento aos associados marcado à mão. | **Repasses**: o site junta as comissões liberadas e gera o **arquivo CNAB 240 do Sicredi** (PIX, crédito em conta Sicredi e folha para conta salário). O arquivo de retorno do banco dá baixa sozinho. |
| Senhas em SHA-256 simples. | bcrypt (cada conta migra no próximo login). |
| Gravações de "pedidos"/"clientes" apagavam e regravavam a tabela inteira. | Desativadas. |

### Como publicar

1. **Backup do banco**: Painel KingHost → Bancos MySQL → phpMyAdmin → Exportar
   (formato SQL). Guarde o arquivo.
2. Envie **todos** os arquivos de `backend-php/api/` para `/www/api/`
   (inclusive os novos: `lib_compras.php`, `lib_comissoes.php`,
   `lib_estoque.php`, `lib_pix.php`, `lib_cnab240.php`, `produtos.php`,
   `compras.php`, `repasses.php`, `vitrine.php` e o `.htaccess` atualizado). **Não** envie
   `config.local.php` por cima do que está no servidor.
3. Acrescente ao `config.local.php` do servidor (gere cada valor com
   `php -r "echo bin2hex(random_bytes(24));"`):
   ```php
   define('WEBHOOK_SEGREDO_REAL', 'valor-gerado-1');
   define('REPASSE_SEGREDO_CRON_REAL', 'valor-gerado-2');
   ```
   Ou rode de novo `C:\xampp\php\php.exe backend-php\gerar-config-local.php`,
   que já gera os dois e grava a senha do Admin em bcrypt.
4. No seu computador: `npm install` (há uma dependência nova, o gerador de QR
   Code) e `npm run build`; envie o conteúdo de `dist/` como sempre. Publique
   site e API **juntos** — o site antigo usa rotas que foram desativadas (ele
   mostra "atualize a página").
5. Abra o painel → **Configurações** e confira: chave PIX, comissões, prazo de
   liberação, e preencha a **conta da empresa no Sicredi** (CNPJ, agência,
   conta, dígito e código do convênio de Pagamentos).
6. **Google**: a descrição antiga da loja (com "frete grátis" e "todo o Brasil")
   continua no Google até ele visitar o site de novo. Depois de publicar, abra
   o Google Search Console → **Inspeção de URL** → `https://coracaopresente.com.br/`
   → **Solicitar indexação**. O texto novo aparece em alguns dias.

### PIX

- **Sem a API Pix configurada** (situação atual): o cliente recebe o QR/copia e
  cola da chave da loja **com o valor exato**; o pedido fica "Aguardando
  pagamento" e você confirma em **Pedidos → Conferir e confirmar** depois de
  ver o PIX no extrato. A compra fica reservada por 24 h.
- **Com a API Pix do Sicredi** (itens 6 abaixo): a confirmação é automática.
  Cadastre no Sicredi o webhook `https://coracaopresente.com.br/api/webhook/pix/SEU_WEBHOOK_SEGREDO`.

### Repasses (pagar a comissão dos associados)

1. Cada associado cadastra a conta em **Meus ganhos → Conta para receber**:
   - **conta salário Sicredi** → paga pela **Folha de Pagamento** (conta
     salário só recebe crédito da empresa pela folha; o Banco Central proíbe
     PIX de terceiros nela). A conta salário é aberta pela empresa junto à
     cooperativa;
   - **conta corrente Sicredi** → crédito direto;
   - **outro banco / poupança** → PIX (a chave é obrigatória).
2. Peça ao gerente da cooperativa o convênio de **Pagamento a Fornecedores**
   e de **Folha de Pagamento** por **arquivo CNAB 240** e o **código do
   convênio**. Faça o primeiro envio com um valor pequeno.
3. No painel → **Repasses**: "Fechar repasses" → "Gerar arquivo do banco" →
   envie o arquivo no Internet Banking do Sicredi e autorize → quando o banco
   devolver o arquivo de retorno (.RET), envie em "Enviar retorno do banco".
4. Para fechar os repasses sozinho, ligue em Configurações "Fechar os repasses
   automaticamente" e crie no **Agendador de Tarefas (cron)** da KingHost uma
   tarefa diária chamando:
   `https://coracaopresente.com.br/api/repasses/automatico/SEU_REPASSE_SEGREDO_CRON`

A comissão é liberada N dias depois que o pedido é marcado **Entregue**
(padrão 7, o prazo de arrependimento). Pedido cancelado depois de pago gera um
estorno que é descontado do próximo repasse.

### Testar no seu computador antes de publicar

`backend-php/servidor-local.php` roda a API com o PHP do XAMPP, aplicando as
mesmas regras do `.htaccess` (instruções no topo do arquivo). O backend Node da
pasta `backend/` está desatualizado e não deve mais ser usado.

Mesmo papel do backend Node da pasta `backend`, mas em PHP puro: roda
nativamente na hospedagem da KingHost, sem instalar nada. Guarda todos os
dados no MySQL da hospedagem e cria as cobranças PIX oficiais do Sicredi.

> No seu computador continue usando o backend Node + XAMPP.
> Esta pasta é só para a hospedagem.

## Passo a passo na KingHost

### 1. Criar o banco no Painel de Controle

Painel de Controle KingHost → **Bancos MySQL** → **Gerenciar Bancos MySQL** →
**Novo banco de dados**:

1. A KingHost não deixa escolher o nome — ele é criado automaticamente com
   base no usuário do domínio (ex.: `coracao1_bd1`).
2. Defina a senha do banco (é o usuário e a senha que você vai usar no
   `config.php` — não é a mesma senha do seu login no painel).
3. Em nível de acesso por IP, deixe **"Não liberar acesso externo"** (mais
   seguro — o PHP roda no mesmo servidor, não precisa de acesso de fora).
4. Anote o nome completo do banco e do usuário, mostrados na tela.

As tabelas são criadas sozinhas no primeiro acesso — não precisa importar nada.

### 2. Configurar

Edite `api/config.php` e preencha `DB_NAME`, `DB_USER` e `DB_PASS` com o que
você anotou. O `DB_HOST` na KingHost normalmente NÃO é `localhost` — veja o
"Host para conexão" na tela do banco no painel (algo como
`mysql.seudominio.com.br`) e use esse valor.

### 3. Publicar o site

No seu computador, na pasta do projeto:

1. Copie `.env.example` para `.env` e troque
   `VITE_BACKEND_URL=https://www.seusite.com.br`
   pelo seu domínio de verdade (sem barra no final) — é o mesmo domínio onde
   a pasta `backend-php/api` vai ficar, em `/api`.
2. Rode `npm run build` — sai a pasta `dist`.
3. Envie o CONTEÚDO de `dist` (o `index.html` e a pasta `assets`) para dentro
   de `public_html` — pelo **Gerenciar FTP** do Painel de Controle (ou um
   cliente de FTP como o FileZilla, com os dados de acesso que aparecem lá).

### 4. Publicar a API

Envie a pasta `api` (desta pasta `backend-php`) para dentro de `public_html`,
ficando `public_html/api/` com: `.htaccess`, `config.php`, `lib.php`,
`dados.php`, `avaliacoes.php`, `pix.php`.

Teste: abra `https://www.seudominio.com.br/api/dados` — deve responder um JSON
com as coleções. Se aparecer erro de MySQL, revise o passo 2.

### 5. Ativar o HTTPS

No Painel de Controle, procure **Certificado SSL** e ative o certificado
grátis (Let's Encrypt) para o seu domínio — funciona só depois do DNS do
domínio já estar apontado para a KingHost. O site e o PIX exigem HTTPS.

### 6. PIX Sicredi (quando tiver as credenciais)

1. Pelo Gerenciar FTP (ou FileZilla), crie a pasta `sicredi_certs` no
   diretório **home** da conta (FORA de `public_html`) e envie `cert.pem` e
   `key.pem` (conversão do certificado explicada no README da pasta `backend`).
2. Em `api/config.php`, preencha `SICREDI_CLIENT_ID`, `SICREDI_CLIENT_SECRET`
   e, quando for pra valer, mude `SICREDI_AMBIENTE` para `"producao"`.
3. No portal do Sicredi, cadastre o webhook:
   `https://www.seudominio.com.br/api/webhook/pix`
   (confirmação instantânea — opcional, o site também consulta a cada 5 s).

Enquanto o Sicredi não estiver configurado, o site usa o QR estático com a
chave PIX das Configurações — a loja funciona normalmente.

### 7. Correios (rastreamento — quando tiver contrato)

1. No **Portal Meu Correios** (`meucorreios.correios.com.br`), menu API →
   Credenciais, gere o **código de acesso** (não é a senha do portal) e anote
   o número do **cartão de postagem** do contrato.
2. Em `api/config.php`, preencha `CORREIOS_USUARIO`, `CORREIOS_CODIGO_ACESSO`
   e `CORREIOS_CARTAO_POSTAGEM` (deixe `CORREIOS_AMBIENTE` em `"producao"`).
3. Ao despachar um pedido, abra-o no painel Admin → Pedidos → ícone de olho e
   cole o código de postagem (`AA123456789BR`) no campo **Código de rastreio**.

O cliente passa a ver a movimentação real da encomenda em "Rastrear Pedido",
mais o link para o site dos Correios. Sem as credenciais preenchidas — ou
antes de o objeto ser postado — a página mostra só o andamento interno da
loja (Processando → Em trânsito → Entregue): a integração nunca derruba o
rastreamento.

### 8. E-mail confiável (SMTP)

Por padrão o site manda e-mail pelo `mail()` nativo do PHP — funciona sem
configurar nada, mas costuma cair como spam ou nem chegar, porque não é um
envio autenticado (qualquer servidor pode alegar que está mandando em nome
do seu domínio).

Para resolver de vez:

1. No Painel de Controle da KingHost → **Central de E-mails**, crie uma
   caixa no seu domínio só para o site usar (ex.:
   `sistema@coracaopresente.com.br`).
2. Na tela dessa caixa, procure **"Configurar no computador/celular"** — ali
   a KingHost mostra o **servidor SMTP** e a **porta** certos pra sua conta
   (variam por servidor, por isso não tem como cravar um valor fixo aqui).
3. Em `api/config.php`, preencha `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`
   (o e-mail completo da caixa) e `SMTP_SENHA` (senha dessa caixa, não a do
   painel). Troque também `MAIL_DE` pra ser esse mesmo e-mail — a maioria
   dos servidores rejeita mandar em nome de um remetente diferente do
   autenticado.

Enquanto esses campos ficarem vazios, o site continua usando o `mail()`
nativo — nada quebra por falta de configuração.

### 9. Avisos do pedido: e-mail e notificação no celular

O **e-mail** já funciona sem configurar nada além do item 8 acima: toda vez
que o Admin muda o status de um pedido, o cliente recebe um aviso.

A **notificação no celular** (Web Push) precisa de um par de chaves, gerado
uma única vez no seu computador:

```
openssl ecparam -genkey -name prime256v1 -noout -out vapid.pem
```

Envie o `vapid.pem` por FTP para o diretório **home** da conta (FORA de
`public_html`, do lado da pasta `sicredi_certs`) e confira o caminho em
`VAPID_CHAVE_PRIVADA_PEM`, no `config.php`. Não há chave para copiar e colar
no site: a parte pública é derivada desse arquivo automaticamente.

Sem o arquivo, o site nem mostra o botão de notificações — o e-mail continua
saindo normalmente.

**Como o cliente ativa:** logado, ele abre o sininho de notificações e toca em
"Ativar notificações". No Android funciona direto pelo navegador; no iPhone
(iOS 16.4+) ele precisa antes adicionar o site à tela inicial pelo menu
Compartilhar → "Adicionar à Tela de Início" — é uma exigência da Apple, não
uma limitação do site.

**Exige HTTPS.** Como o `.htaccess` já força HTTPS, isso está resolvido.

## Rotas (iguais às do backend Node)

- `GET  /api/dados` — todas as coleções
- `PUT  /api/dados/{colecao}` — grava `produtos`, `pedidos`, `clientes`, `cargos`, `recrutamentos`, `cupons`, `alertasEstoque`, `banners` ou `config`
- `GET  /api/avaliacoes/{produtoId}` — avaliações (comentário + vídeo) de um produto
- `GET  /api/avaliacoes?todas=1` — todas as avaliações, pro painel Admin moderar
- `POST /api/avaliacoes` — cria/atualiza a avaliação do cliente (só quem comprou o produto)
- `DELETE /api/avaliacoes/{id}` — Admin exclui uma avaliação imprópria
- `POST /api/pix/cobranca` — cria cobrança de 30 min
- `GET  /api/pix/cobranca/{txid}` — status da cobrança
- `GET  /api/pedidos/rastrear?id={pedido}&email={email}` — rastreamento público (nº do pedido + e-mail da compra)
- `PATCH /api/pedidos/{id}` — Admin muda `status`, `codigoRastreio` e/ou `entregador`; o entregador designado para o pedido muda só o `status` para "Em trânsito" ou "Entregue"
- `GET  /api/push/chave-publica` — chave VAPID (null = notificações desligadas)
- `POST /api/push/inscrever` — autoriza este celular (exige login)
- `DELETE /api/push/inscrever` — cancela
- `GET  /api/push/pendentes?e={hash}` — avisos que o service worker ainda não mostrou
- `POST /api/webhook/pix` — webhook do Sicredi
- `POST /api/recrutamentos` — Master/MasterPlus cadastra um vendedor na própria equipe: quem já tem conta na loja entra ativado, com o cargo dado; quem não tem recebe o código gerado aqui
- `POST /api/recrutamentos/{codigo}/ativar` — o cliente ativa, no perfil dele, o código recebido
- `POST /api/equipe/cargo` — Master/MasterPlus dá (`vendedor`), promove (`master`) ou tira (`null`) o cargo de alguém da própria equipe
- `POST /api/admin/cargo` — Admin dá `masterplus`, `entregador`, `vendedor` ou tira o cargo de UMA conta
- `POST /api/checkout` — cria a compra "Aguardando pagamento" (valor calculado no servidor)
- `GET  /api/compras` · `GET /api/compras/{id}` — compras do cliente / situação de uma compra
- `POST /api/compras/{id}/cancelar` · `POST /api/compras/{id}/confirmar` (Admin) — desistir / confirmar PIX recebido
- `POST /api/produtos` · `PUT /api/produtos/{id}` · `DELETE /api/produtos/{id}` — um produto por vez (PUT exige `versao`)
- `PATCH /api/produtos/{id}/estoque` — `{delta | definir, cor?, tamanho?}`
- `GET|PUT /api/recebimento` — conta do associado para receber
- `GET  /api/ganhos` — saldo e comissões do associado
- `GET  /api/repasses` · `POST /api/repasses/gerar` · `POST /api/repasses/remessa` · `GET /api/repasses/remessa/{id}` · `POST /api/repasses/retorno` · `POST /api/repasses/{id}/pagar|cancelar` — Admin
- `GET  /api/repasses/automatico/{segredo}` — agendador de tarefas
- `PUT /api/dados/{colecao}` agora só aceita `banners`, `cupons` e `config`

## Segurança

`config.php` guarda senhas: o servidor nunca mostra o conteúdo dele (executa o
PHP), e o `.htaccess` ainda bloqueia acesso direto a `config.php` e `lib.php`.
Os certificados ficam fora de `public_html`. Mesmo assim, não compartilhe
esses arquivos com ninguém.
