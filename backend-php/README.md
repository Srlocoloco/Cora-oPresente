# Backend PHP — versão para a KingHost (hospedagem compartilhada)

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
`dados.php`, `avaliacoes.php`, `pix.php`, `mercadopago.php`.

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

### 7. Mercado Pago (pagamento com cartão)

1. Em `api/config.php`, preencha `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` com as
   credenciais de developers.mercadopago.com → sua aplicação → Credenciais.
   Use as de **teste** (prefixo `TEST-`) enquanto estiver testando, e troque
   pelas de **produção** (prefixo `APP_USR-`) quando for pra valer.
2. No painel do Mercado Pago, vá em **Webhooks** → **Configurar notificações**
   → **URL de produção** e cadastre:
   `https://www.seudominio.com.br/api/webhook/mercadopago`
   Marque o evento **"Pagamentos"**.
   - Testando local com XAMPP: use a URL pública do **ngrok** no lugar do seu
     domínio (ex.: `https://abc123.ngrok-free.app/api/webhook/mercadopago`).
     O ngrok precisa apontar para a porta do Apache/XAMPP (normalmente 80).
3. Depois de cadastrar a URL, o painel mostra uma **"Assinatura secreta"**.
   Copie e cole em `MP_WEBHOOK_SECRET` (`config.php`) — isso faz o webhook
   validar o cabeçalho `X-Signature` e recusar notificações falsas.
4. O front-end precisa gerar o **token do cartão** com o SDK do Mercado Pago
   (usando `MP_PUBLIC_KEY`) e mandar esse token para `POST /api/pagamento/cartao`
   — o número do cartão, validade e CVV nunca devem chegar neste servidor.

## Rotas (iguais às do backend Node)

- `GET  /api/dados` — todas as coleções
- `PUT  /api/dados/{colecao}` — grava `produtos`, `pedidos`, `clientes`, `cargos`, `recrutamentos`, `cupons`, `alertasEstoque`, `banners`, `cartoesSalvos` ou `config`
- `GET  /api/avaliacoes/{produtoId}` — avaliações (comentário + vídeo) de um produto
- `GET  /api/avaliacoes?todas=1` — todas as avaliações, pro painel Admin moderar
- `POST /api/avaliacoes` — cria/atualiza a avaliação do cliente (só quem comprou o produto)
- `DELETE /api/avaliacoes/{id}` — Admin exclui uma avaliação imprópria
- `POST /api/pix/cobranca` — cria cobrança de 30 min
- `GET  /api/pix/cobranca/{txid}` — status da cobrança
- `POST /api/webhook/pix` — webhook do Sicredi
- `POST /api/pagamento/cartao` — processa pagamento com cartão (Mercado Pago)
- `POST /api/webhook/mercadopago` — webhook do Mercado Pago
- `POST /api/cartao/salvar` — cofre: anexa um cartão tokenizado ao cliente (via customer do Mercado Pago)

## Segurança

`config.php` guarda senhas: o servidor nunca mostra o conteúdo dele (executa o
PHP), e o `.htaccess` ainda bloqueia acesso direto a `config.php` e `lib.php`.
Os certificados ficam fora de `public_html`. Mesmo assim, não compartilhe
esses arquivos com ninguém.

Este `config.php` fica versionado no Git. Enquanto as chaves do Mercado Pago
forem as de **teste** (prefixo `TEST-`) o risco é baixo — não movem dinheiro
real. Antes de trocar para as chaves de **produção**, considere tirar
`backend-php/api/config.php` do repositório (`.gitignore` + `git rm --cached`)
para não deixar segredos reais no histórico do Git.
