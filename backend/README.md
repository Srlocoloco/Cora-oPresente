# Backend da loja — Banco de dados (XAMPP) + Cobranças PIX (Sicredi)

Este servidor faz duas coisas:

1. **Banco de dados**: guarda TODAS as informações da loja no MySQL do XAMPP
   (banco `coracaopresente`) — produtos, pedidos, clientes, cargos,
   recrutamentos, cupons, alertas de estoque e configurações. Os dados deixam
   de morar no navegador.
2. **PIX oficial**: cria cobranças na API Pix do Sicredi e confirma o pedido
   sozinho quando o cliente paga.

Com o backend desligado, o site continua funcionando no modo antigo
(dados no navegador e QR PIX estático).

## Parte 1 — Banco de dados no XAMPP

1. Abra o **XAMPP Control Panel** e clique em **Start** no **MySQL**
   (o Apache não é necessário).
2. Na pasta `backend`, copie `.env.example` para `.env`. Os padrões do XAMPP
   já estão preenchidos (usuário `root`, sem senha, banco `coracaopresente`).
3. Instale e rode:

   ```bash
   npm install
   npm start
   ```

   Deve aparecer: `✓ MySQL conectado — banco "coracaopresente" pronto (XAMPP)`.
   O banco e as tabelas são criados automaticamente na primeira vez.
4. Abra o site normalmente (`npm run dev` na pasta do projeto). Pronto: tudo
   que acontecer na loja é gravado no MySQL. Você pode conferir no phpMyAdmin
   (http://localhost/phpmyadmin → banco `coracaopresente`).

Tabelas criadas: `produtos`, `pedidos`, `clientes`, `cargos`, `recrutamentos`,
`cupons`, `alertas_estoque`, `config`.

## Parte 2 — PIX oficial do Sicredi (onde colocar cada informação)

| Informação | Onde conseguir | Onde colocar |
|---|---|---|
| `client_id` e `client_secret` | Portal do Desenvolvedor do Sicredi (developer.sicredi.com.br) → sua aplicação API Pix. O gerente da cooperativa habilita o acesso. | `.env`, campos `SICREDI_CLIENT_ID` e `SICREDI_CLIENT_SECRET` |
| Certificado digital (`.pfx`/`.p12`) | Gerado no mesmo portal, na etapa de certificados | Converta para PEM (abaixo) e salve como `certs/cert.pem` e `certs/key.pem` |
| Chave PIX | Sua chave cadastrada no Sicredi | Em **Configurações** no painel Admin do site (fica no banco) — o `.env` (`PIX_CHAVE`) é só reserva |
| Ambiente | — | `.env`, `SICREDI_AMBIENTE`: `homologacao` para testar, `producao` para valer |

Conversão do certificado (no Windows, use o Git Bash):

```bash
openssl pkcs12 -in certificado.pfx -clcerts -nokeys -out cert.pem
openssl pkcs12 -in certificado.pfx -nocerts -nodes -out key.pem
```

Enquanto as credenciais não estiverem preenchidas, o backend sobe mesmo assim
(só o banco funciona) e o site usa o QR PIX estático.

## Rotas

- `GET /` → saúde do serviço (mostra estado do banco e do PIX)
- `GET /api/dados` → todas as coleções (o site carrega ao abrir)
- `PUT /api/dados/:colecao` → grava uma coleção (`produtos`, `pedidos`, `clientes`, `cargos`, `recrutamentos`, `cupons`, `alertasEstoque`, `config`)
- `POST /api/pix/cobranca` `{ "valor": 123.45 }` → cria cobrança de 30 min → `{ txid, pixCopiaECola }`
- `GET /api/pix/cobranca/:txid` → `{ "status": "ATIVA" | "CONCLUIDA" }`
- `POST /webhook/pix` → notificação instantânea do Sicredi (opcional)

## Produção

Hospede esta pasta em um serviço com HTTPS (Render, Railway, VPS...) com um
MySQL próprio, e troque `URL_BACKEND_PIX` no `src/app/App.tsx` do site de
`http://localhost:3333` para o endereço público do servidor.

**Segurança**: `.env` e `certs/` dão acesso à sua conta — nunca compartilhe
nem coloque no front-end.
