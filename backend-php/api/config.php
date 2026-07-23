<?php
// ─── Configuração do backend PHP (KingHost) ──────────────────────────────────
// Preencha com os dados criados no Painel de Controle da KingHost. Este
// arquivo NÃO é visível para visitantes (o servidor executa o PHP, não mostra
// o código), mas mesmo assim nunca compartilhe seu conteúdo.

// ── MySQL (Painel de Controle → Bancos MySQL → Novo banco de dados) ──
// A KingHost não deixa escolher o nome do banco: ele é criado automaticamente
// com base no usuário do domínio (ex.: algo como "coracao1_bd1"). Veja o
// nome completo do banco e do usuário na tela "Gerenciar Bancos MySQL".
define("DB_HOST", "mysql.coracaopresente.com.br");
define("DB_NAME", "coracaopresent");
define("DB_USER", "coracaopresent");
define("DB_PASS", "kayth254321");

// ── Sicredi (API Pix) ──
// "homologacao" para testar | "producao" quando for pra valer
define("SICREDI_AMBIENTE", "homologacao");
define("SICREDI_CLIENT_ID", "");
define("SICREDI_CLIENT_SECRET", "");

// Certificados PEM da API Pix. Coloque a pasta "sicredi_certs" FORA da
// public_html (no diretório home da conta), para nunca ficarem acessíveis.
// __DIR__ é a pasta api/; "/../../" sobe para fora de public_html.
define("SICREDI_CERT_PATH", __DIR__ . "/../../sicredi_certs/cert.pem");
define("SICREDI_KEY_PATH", __DIR__ . "/../../sicredi_certs/key.pem");

// Chave PIX reserva (a principal é a das Configurações da loja, salva no banco)
define("PIX_CHAVE_RESERVA", "44997201104");

// ── Mercado Pago (pagamento com cartão) ──
// Chaves em developers.mercadopago.com → sua aplicação → "Credenciais de teste".
// Prefixo "TEST-" = ambiente de testes (cartões de teste, sem dinheiro real).
// Quando for pra valer, troque pelas credenciais de produção (prefixo "APP_USR-").
define("MP_ACCESS_TOKEN", "TEST-7734824503194731-071715-0ec9352d787b46a489ddc81c946b4e29-2934032204");
define("MP_PUBLIC_KEY", "TEST-85a56c57-c387-411d-a303-aad0182ddb65");

// Assinatura secreta do webhook (painel → Webhooks → sua URL → "Assinatura
// secreta"). Só existe DEPOIS de cadastrar a URL no painel — veja o README.
// Enquanto ficar em branco, o webhook aceita notificações sem validar a
// assinatura (ok para testar local com ngrok; preencha antes de ir pra produção).
define("MP_WEBHOOK_SECRET", "c2ad3905ab9152d335d259ce59f7681aa75e2572f7ff1fac38ce3cc58b528d55");
