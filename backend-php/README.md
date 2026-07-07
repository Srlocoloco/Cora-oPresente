# Backend PHP — versão para a HostGator (hospedagem compartilhada)

Mesmo papel do backend Node da pasta `backend`, mas em PHP puro: roda
nativamente no cPanel da HostGator, sem instalar nada. Guarda todos os dados
no MySQL da hospedagem e cria as cobranças PIX oficiais do Sicredi.

> No seu computador continue usando o backend Node + XAMPP.
> Esta pasta é só para a hospedagem.

## Passo a passo na HostGator

### 1. Criar o banco no cPanel

cPanel → **Bancos de Dados MySQL**:

1. Crie o banco `coracaopresente` (vai ficar `SEUUSUARIO_coracaopresente`).
2. Crie um usuário com senha forte (vai ficar `SEUUSUARIO_algo`).
3. Adicione o usuário ao banco com **todos os privilégios**.
4. Anote: nome completo do banco, usuário e senha.

As tabelas são criadas sozinhas no primeiro acesso — não precisa importar nada.

### 2. Configurar

Edite `api/config.php` e preencha `DB_NAME`, `DB_USER` e `DB_PASS` com o que
você anotou. (`DB_HOST` fica `localhost` mesmo.)

### 3. Publicar o site

No seu computador, na pasta do projeto:

1. Abra `src/app/App.tsx` e troque a linha
   `const URL_BACKEND_PIX = "http://localhost:3333";`
   por `const URL_BACKEND_PIX = "https://www.seudominio.com.br";`
   (seu domínio, sem barra no final).
2. Rode `npm run build` — sai a pasta `dist`.
3. No cPanel → **Gerenciador de Arquivos** → `public_html`: envie o CONTEÚDO
   de `dist` (o `index.html` e a pasta `assets`) para dentro de `public_html`.

### 4. Publicar a API

Envie a pasta `api` (desta pasta `backend-php`) para dentro de `public_html`,
ficando `public_html/api/` com: `.htaccess`, `config.php`, `lib.php`,
`dados.php`, `pix.php`.

Teste: abra `https://www.seudominio.com.br/api/dados` — deve responder um JSON
com as coleções. Se aparecer erro de MySQL, revise o passo 2.

### 5. Ativar o HTTPS

cPanel → **SSL/TLS Status**: ative o certificado grátis (AutoSSL) para o seu
domínio. O site e o PIX exigem HTTPS.

### 6. PIX Sicredi (quando tiver as credenciais)

1. No Gerenciador de Arquivos, crie a pasta `sicredi_certs` no diretório
   **home** da conta (FORA de `public_html`) e envie `cert.pem` e `key.pem`
   (conversão do certificado explicada no README da pasta `backend`).
2. Em `api/config.php`, preencha `SICREDI_CLIENT_ID`, `SICREDI_CLIENT_SECRET`
   e, quando for pra valer, mude `SICREDI_AMBIENTE` para `"producao"`.
3. No portal do Sicredi, cadastre o webhook:
   `https://www.seudominio.com.br/api/webhook/pix`
   (confirmação instantânea — opcional, o site também consulta a cada 5 s).

Enquanto o Sicredi não estiver configurado, o site usa o QR estático com a
chave PIX das Configurações — a loja funciona normalmente.

## Rotas (iguais às do backend Node)

- `GET  /api/dados` — todas as coleções
- `PUT  /api/dados/{colecao}` — grava `produtos`, `pedidos`, `clientes`, `cargos`, `recrutamentos`, `cupons`, `alertasEstoque` ou `config`
- `POST /api/pix/cobranca` — cria cobrança de 30 min
- `GET  /api/pix/cobranca/{txid}` — status da cobrança
- `POST /api/webhook/pix` — webhook do Sicredi

## Segurança

`config.php` guarda senhas: o servidor nunca mostra o conteúdo dele (executa o
PHP), e o `.htaccess` ainda bloqueia acesso direto a `config.php` e `lib.php`.
Os certificados ficam fora de `public_html`. Mesmo assim, não compartilhe
esses arquivos com ninguém.
