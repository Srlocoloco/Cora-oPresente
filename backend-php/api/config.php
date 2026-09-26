<?php
// ─── Configuração do backend PHP (KingHost) ──────────────────────────────────
// Preencha com os dados criados no Painel de Controle da KingHost. Este
// arquivo NÃO é visível para visitantes (o servidor executa o PHP, não mostra
// o código), mas mesmo assim nunca compartilhe seu conteúdo.

// Nunca mostra erro/aviso do PHP na tela (poderia vazar caminho de arquivo,
// consulta SQL ou outros detalhes internos para quem estiver olhando) — os
// erros continuam sendo registrados no log do servidor, só não aparecem para
// o visitante. Todas as rotas já devolvem uma mensagem de erro genérica em
// JSON quando algo falha (ver json_out em lib.php).
error_reporting(E_ALL);
ini_set("display_errors", "0");
ini_set("log_errors", "1");

// ── MySQL (Painel de Controle → Bancos MySQL → Novo banco de dados) ──
// A KingHost não deixa escolher o nome do banco: ele é criado automaticamente
// com base no usuário do domínio (ex.: algo como "coracao1_bd1"). Veja o
// nome completo do banco e do usuário na tela "Gerenciar Bancos MySQL".
// As variáveis CP_* abaixo só existem no computador de quem está testando (ver
// backend-php/servidor-local.php). Na hospedagem elas não existem, e valem os
// valores fixos de sempre — nada muda em produção.
define("DB_HOST", getenv("CP_DB_HOST") ?: "mysql.coracaopresente.com.br");
define("DB_NAME", getenv("CP_DB_NAME") ?: "coracaopresent01");
define("DB_USER", getenv("CP_DB_USER") ?: "coracaopresent01");

// A senha de verdade mora em config.local.php (arquivo fora do git, enviado
// direto por FTP para o servidor). Sem esse arquivo, o site não conecta —
// isso é proposital, para nunca mais existir senha em texto puro no git.
// Repare no "is_file" antes do require: com "require_once" puro, se o arquivo
// faltasse o PHP abortava e a API devolvia uma tela 500 EM BRANCO, sem dizer o
// motivo. Assim a API continua respondendo e o erro sai legível na tela
// ("MySQL indisponível"), além de ficar registrado no log do servidor.
$arquivoSegredos = getenv("CP_CONFIG_LOCAL") ?: __DIR__ . "/config.local.php";
if (is_file($arquivoSegredos)) {
    require_once $arquivoSegredos;
} else {
    error_log("FALTA config.local.php em " . __DIR__ . " — envie-o por FTP para /www/api/.");
}

define("DB_PASS", defined("DB_PASS_REAL") ? DB_PASS_REAL : "");

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

// ── Sicredi (cartão de crédito) ──
// URL de autorização do adquirente e as credenciais da loja. Enquanto os três
// estiverem vazios, o site recusa a compra no cartão com "ainda não
// configurado" (nunca conclui um pedido sem cobrança de verdade).
// A chamada em si fica em cartao.php → autorizar_no_gateway().
define("SICREDI_CARTAO_URL", "");
define("SICREDI_CARTAO_CLIENT_ID", "");
define("SICREDI_CARTAO_CLIENT_SECRET", "");

// Chave PIX reserva (a principal é a das Configurações da loja, salva no banco).
// Fica em config.local.php (fora do git) porque é um dado pessoal — uma chave
// PIX de CPF identifica uma pessoa, e este arquivo aqui é versionado.
// Em config.local.php:  define("PIX_CHAVE_RESERVA_REAL", "sua-chave-pix");
define("PIX_CHAVE_RESERVA", defined("PIX_CHAVE_RESERVA_REAL") ? PIX_CHAVE_RESERVA_REAL : "");

// ── Anti-abuso: de quem é a requisição ───────────────────────────────────────
// Todo o controle de robôs (limite de requisições, travamento do login,
// tentativas de cartão) é contado POR IP. Na KingHost a requisição chega
// direto no Apache, então o IP verdadeiro é o REMOTE_ADDR e esta lista fica
// vazia — que é o certo: com a lista vazia, nenhum cabeçalho enviado pelo
// visitante é levado em conta, e não há como um robô fingir um IP novo a cada
// tentativa para escapar dos limites.
//
// Só preencha se um dia o site passar a ficar ATRÁS de algo (Cloudflare, um
// balanceador, um proxy reverso). Aí coloque aqui o IP com que ESSE
// intermediário chega ao servidor — e só ele.
//   Ex.: define("PROXIES_CONFIAVEIS", ["10.0.0.5"]);
define("PROXIES_CONFIAVEIS", []);

// ── Segredo dos webhooks (avisos automáticos do banco) ───────────────────────
// O banco avisa a loja que um PIX caiu chamando /api/webhook/pix. Esse aviso é
// o que faz o pedido ser dado como pago — então quem conseguir chamar essa
// rota consegue marcar uma compra como paga sem pagar nada.
//
// Por isso o endereço leva um segredo no fim:
//   https://coracaopresente.com.br/api/webhook/pix/SEU_SEGREDO_AQUI
// e é ESSE endereço completo que deve ser cadastrado no Sicredi. Sem o segredo
// certo, a rota responde 404 e não faz nada.
//
// O valor real fica em config.local.php (fora do git). Para gerar um:
//   php -r "echo bin2hex(random_bytes(24));"
// e em config.local.php:  define("WEBHOOK_SEGREDO_REAL", "o-valor-gerado");
define("WEBHOOK_SEGREDO", defined("WEBHOOK_SEGREDO_REAL") ? WEBHOOK_SEGREDO_REAL : "");

// ── Login do Admin (painel) ──────────────────────────────────────────────────
// A senha do Admin NUNCA fica no código do site (antes ficava — qualquer
// visitante conseguia abrir o JavaScript do navegador e ler a senha em texto
// puro). Agora ela só existe aqui, neste arquivo bloqueado no servidor, como
// um hash (SALT + SHA-256) — mesmo quem tiver acesso ao banco de dados não
// consegue "ler" a senha de volta a partir do hash.
//
// O jeito certo de trocar a senha é rodar backend-php/gerar-config-local.php,
// que grava o hash no formato bcrypt (lento de propósito: cada tentativa de
// adivinhar custa ~100 ms, contra microssegundos do SHA-256 antigo).
// Hashes antigos (SALT + SHA-256) continuam aceitos até a troca.
define("ADMIN_PASSWORD_SALT", defined("ADMIN_PASSWORD_SALT_REAL") ? ADMIN_PASSWORD_SALT_REAL : "");
define("ADMIN_PASSWORD_HASH", defined("ADMIN_PASSWORD_HASH_REAL") ? ADMIN_PASSWORD_HASH_REAL : "");

// ── E-mail transacional (verificação de cadastro, código de acesso, etc.) ───
// Troque o "de" pelo seu domínio de verdade quando publicar.
define("MAIL_DE", "cora@coracaopresente.com.br");
define("MAIL_NOME_DE", "Coração Presente");

// ── SMTP (recomendado) ───────────────────────────────────────────────────────
// A função mail() nativa do PHP (usada quando os campos abaixo ficam vazios)
// costuma cair como spam ou nem sair, porque o e-mail não é "autenticado" —
// qualquer servidor pode alegar que está mandando em nome do seu domínio.
// Preenchendo aqui, os e-mails passam a sair autenticados de verdade.
//
// Caminho mais simples na KingHost: Painel de Controle → Central de E-mails
// → crie uma caixa no seu domínio (ex.: sistema@coracaopresente.com.br) só
// para o site usar → em "Configurar no computador/celular" a KingHost mostra
// o SERVIDOR SMTP e a PORTA certos para a sua conta (varia por plano/servidor,
// por isso não dá pra cravar um valor fixo aqui).
//
// SMTP_USUARIO normalmente é o e-mail completo dessa caixa, e MAIL_DE (acima)
// deve ser ESSE MESMO e-mail — a maioria dos servidores rejeita mandar em nome
// de um remetente diferente do autenticado.
define("SMTP_HOST", "smtpi.kinghost.net"); // host de "Acesso com SSL/TLS" do painel da KingHost
define("SMTP_PORTA", 465);          // SSL direto
define("SMTP_SEGURANCA", "ssl");
define("SMTP_USUARIO", "coracaopresente@coracaopresente.com.br");
define("SMTP_SENHA", defined("SMTP_SENHA_REAL") ? SMTP_SENHA_REAL : "");
// URL pública do site (usada para montar os links dos e-mails)
define("URL_SITE", getenv("CP_URL_SITE") ?: "https://coracaopresente.com.br");

// E-mail da conta reservada do Admin (mesmo valor de EMAIL_ADMIN em
// src/app/constantes.tsx) — usado para reconhecer o Admin comprando pela
// loja (ver email_autenticado em lib.php).
define("EMAIL_ADMIN", "balorense@gmail.com");

// ── Login de clientes com Google ─────────────────────────────────────────────
// Mesmo Client ID configurado no site (src/app/constantes.tsx). O backend usa
// isso para CONFERIR de verdade o login do Google (chama a própria Google),
// em vez de confiar cegamente no que o navegador manda.
define("GOOGLE_CLIENT_ID", "887237314004-016e23l96uj8mrc2kmhh7bmemiij7j5c.apps.googleusercontent.com");

// ── Correios (rastreamento de encomendas) ───────────────────────────────────
// Credenciais do Meu Correios / contrato (Portal Meu Correios → API →
// "Credenciais"). O usuário é o mesmo do portal; o código de acesso é gerado
// lá dentro (NÃO é a senha do portal); o cartão de postagem está no contrato.
//
// Enquanto os três estiverem vazios, o rastreamento continua funcionando —
// só que mostrando o andamento interno da loja (Processando → Em trânsito →
// Entregue), sem os eventos dos Correios. Ou seja: nada quebra se você ainda
// não tiver contrato; a integração liga sozinha quando preencher aqui.
define("CORREIOS_USUARIO", "");
define("CORREIOS_CODIGO_ACESSO", "");
define("CORREIOS_CARTAO_POSTAGEM", "");
// "producao" para valer | "homologacao" para testar com o ambiente de testes
define("CORREIOS_AMBIENTE", "producao");

// ── Notificações no celular (Web Push) ──────────────────────────────────────
// Gere o par de chaves UMA vez, no seu computador, com o OpenSSL:
//   openssl ecparam -genkey -name prime256v1 -noout -out vapid.pem
// Depois envie o vapid.pem por FTP para o diretório HOME da conta (FORA de
// public_html, do lado da pasta sicredi_certs) e confira o caminho abaixo.
//
// A chave pública que o navegador usa é derivada desse arquivo sozinha — não
// há nada para copiar e colar. Sem o arquivo, o site simplesmente não oferece
// o botão de notificações (e-mail continua funcionando normalmente).
define("VAPID_CHAVE_PRIVADA_PEM", __DIR__ . "/../../vapid.pem");
// E-mail de contato exigido pelo padrão Web Push (o serviço de push usa isso
// para falar com você se algo der errado no envio).
define("VAPID_CONTATO", "mailto:cora@coracaopresente.com.br");

// ── Repasse automático das comissões (agendador de tarefas) ─────────────────
// O fechamento dos repasses pode rodar sozinho pelo "Agendador de Tarefas"
// (cron) do painel da KingHost, chamando:
//   https://coracaopresente.com.br/api/repasses/automatico/SEU_SEGREDO
// Sem o segredo certo a rota responde 404 e não faz nada. Gere um valor com
//   php -r "echo bin2hex(random_bytes(24));"
// e em config.local.php:  define("REPASSE_SEGREDO_CRON_REAL", "o-valor-gerado");
define("REPASSE_SEGREDO_CRON", defined("REPASSE_SEGREDO_CRON_REAL") ? REPASSE_SEGREDO_CRON_REAL : "");
