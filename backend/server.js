// ─── Backend da loja Coração Presente ─────────────────────────────────────────
//
// Faz duas coisas:
//  1. BANCO DE DADOS: conecta ao MySQL do XAMPP (banco "coracaopresente") e
//     guarda produtos, pedidos, clientes, cargos, recrutamentos, cupons e
//     configurações — os dados saem do navegador e ficam no banco.
//  2. COBRANÇAS PIX: cria cobranças oficiais na API Pix do Sicredi (OAuth2 +
//     certificado mTLS) e confirma o pagamento sozinho.
//
// Onde colocar cada informação: veja o README.md nesta pasta.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import https from "https";
import axios from "axios";
import crypto from "crypto";
import mysql from "mysql2/promise";

dotenv.config();

const {
  // ── Banco de dados (XAMPP / MySQL) ──
  DB_HOST = "localhost",
  DB_PORT = 3306,
  DB_USER = "root", // usuário padrão do XAMPP
  DB_PASS = "", // senha padrão do XAMPP é vazia
  DB_NAME = "coracaopresente",
  // ── Sicredi (API Pix) ──
  SICREDI_AMBIENTE = "homologacao",
  SICREDI_CLIENT_ID,
  SICREDI_CLIENT_SECRET,
  SICREDI_CERT_PATH = "./certs/cert.pem",
  SICREDI_KEY_PATH = "./certs/key.pem",
  PIX_CHAVE,
  // ── Correios (rastreamento de encomendas) ──
  // Vazio = integração desligada: o rastreio mostra só o andamento interno
  // da loja, sem os eventos dos Correios.
  CORREIOS_USUARIO = "",
  CORREIOS_CODIGO_ACESSO = "",
  CORREIOS_CARTAO_POSTAGEM = "",
  CORREIOS_AMBIENTE = "producao",
  // ── Notificações no celular (Web Push) ──
  // Caminho do par de chaves VAPID. Gere uma vez com:
  //   openssl ecparam -genkey -name prime256v1 -noout -out vapid.pem
  // Sem o arquivo, o site não oferece o botão de notificações.
  VAPID_PEM = "./vapid.pem",
  VAPID_CONTATO = "mailto:contato@coracaopresente.com.br",
  PORT = 3333,
} = process.env;

// ── Cliente da API de rastreamento dos Correios ──────────────────────────────
// Mesma lógica do backend PHP (backend-php/api/correios.php): autentica com
// usuário + código de acesso + cartão de postagem, guarda o token (vale ~1
// dia) e consulta os eventos do objeto. Qualquer falha devolve null — o
// rastreamento nunca deve quebrar por causa da integração.
const CORREIOS_BASE = CORREIOS_AMBIENTE === "homologacao"
  ? "https://apihom.correios.com.br"
  : "https://api.correios.com.br";

const correiosConfigurado = () =>
  Boolean(CORREIOS_USUARIO && CORREIOS_CODIGO_ACESSO && CORREIOS_CARTAO_POSTAGEM);

// Formato dos Correios: 2 letras + 9 dígitos + 2 letras (ex.: AA123456789BR)
const codigoRastreioValido = (codigo) => /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(String(codigo).toUpperCase().trim());

let correiosToken = null; // { token, expira }

async function obterTokenCorreios() {
  if (!correiosConfigurado()) return null;
  if (correiosToken && correiosToken.expira > Date.now() + 300_000) return correiosToken.token;
  try {
    const basic = Buffer.from(`${CORREIOS_USUARIO}:${CORREIOS_CODIGO_ACESSO}`).toString("base64");
    const { data } = await axios.post(
      `${CORREIOS_BASE}/token/v1/autentica/cartaopostagem`,
      { numero: CORREIOS_CARTAO_POSTAGEM },
      { headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    if (!data?.token) return null;
    const expira = data.expiraEm ? Date.parse(data.expiraEm) : NaN;
    correiosToken = { token: data.token, expira: Number.isNaN(expira) ? Date.now() + 43_200_000 : expira };
    return correiosToken.token;
  } catch (e) {
    console.error("Correios: falha ao autenticar:", e.response?.status || e.message);
    return null;
  }
}

async function eventosCorreios(codigo) {
  const cod = String(codigo).toUpperCase().trim();
  if (!codigoRastreioValido(cod)) return null;
  const token = await obterTokenCorreios();
  if (!token) return null;
  try {
    const { data } = await axios.get(
      `${CORREIOS_BASE}/srorastro/v1/objetos/${encodeURIComponent(cod)}?resultado=T`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );
    const eventos = data?.objetos?.[0]?.eventos;
    // Objeto inexistente ou ainda não postado vem sem eventos
    if (!Array.isArray(eventos) || eventos.length === 0) return null;
    return eventos.map((e) => {
      const end = e.unidade?.endereco || {};
      return {
        descricao: e.descricao || "",
        detalhe: e.detalhe || null,
        data: e.dtHrCriado || null,
        local: end.cidade ? `${end.cidade}${end.uf ? ` / ${end.uf}` : ""}` : null,
      };
    });
  } catch (e) {
    console.error(`Correios: falha ao rastrear ${cod}:`, e.response?.status || e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTE 1 — BANCO DE DADOS (XAMPP / MySQL)
// ═══════════════════════════════════════════════════════════════════════════════

let pool = null; // null = MySQL indisponível (site continua no modo navegador)

async function iniciarBanco() {
  try {
    // Cria o banco "coracaopresente" se ainda não existir
    const conexao = await mysql.createConnection({
      host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASS,
    });
    await conexao.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conexao.end();

    pool = mysql.createPool({
      host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASS,
      database: DB_NAME, waitForConnections: true, connectionLimit: 10,
    });

    // Tabelas (criadas somente se não existirem)
    await pool.query(`CREATE TABLE IF NOT EXISTS produtos (
      id BIGINT PRIMARY KEY,
      codigo VARCHAR(16) NULL,
      name TEXT NOT NULL,
      brand VARCHAR(255) NOT NULL,
      price DOUBLE NOT NULL,
      originalPrice DOUBLE NULL,
      installments INT NOT NULL DEFAULT 12,
      rating DOUBLE NOT NULL DEFAULT 0,
      reviews INT NOT NULL DEFAULT 0,
      image LONGTEXT,
      category VARCHAR(64),
      badge VARCHAR(32) NULL,
      freeShipping TINYINT(1) NOT NULL DEFAULT 1,
      stock INT NOT NULL DEFAULT 0,
      owner VARCHAR(255) NULL,
      pixDesconto INT NULL,
      images LONGTEXT NULL,
      colors LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migração: bancos criados antes do código sequencial (ex.: "BEL-001")
    // existir não ganham a coluna nova só com CREATE TABLE IF NOT EXISTS
    const [colunasProdutos] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'produtos' AND COLUMN_NAME = 'codigo'`,
      [DB_NAME]
    );
    if (colunasProdutos.length === 0) {
      await pool.query(`ALTER TABLE produtos ADD COLUMN codigo VARCHAR(16) NULL`);
    }

    // Migração: bancos criados antes de "images" (galeria) e "colors"
    // (cores/modelos) existirem não ganham as colunas novas só com
    // CREATE TABLE IF NOT EXISTS — precisa checar e adicionar
    const [colunasProdutosGaleria] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'produtos' AND COLUMN_NAME IN ('images', 'colors')`,
      [DB_NAME]
    );
    const colunasGaleriaExistentes = colunasProdutosGaleria.map((c) => c.COLUMN_NAME);
    if (!colunasGaleriaExistentes.includes("images")) {
      await pool.query(`ALTER TABLE produtos ADD COLUMN images LONGTEXT NULL`);
    }
    if (!colunasGaleriaExistentes.includes("colors")) {
      await pool.query(`ALTER TABLE produtos ADD COLUMN colors LONGTEXT NULL`);
    }

    // Migração: remove a coluna "description" — as características do
    // produto deixaram de existir no site (o Admin não cadastra mais isso)
    const [colunaDescricao] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'produtos' AND COLUMN_NAME = 'description'`,
      [DB_NAME]
    );
    if (colunaDescricao.length > 0) {
      await pool.query(`ALTER TABLE produtos DROP COLUMN description`);
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS pedidos (
      id VARCHAR(32) PRIMARY KEY,
      customer VARCHAR(255),
      email VARCHAR(255),
      items TEXT,
      total DOUBLE NOT NULL,
      status VARCHAR(32),
      date VARCHAR(16),
      month VARCHAR(8),
      category VARCHAR(64),
      pagamento VARCHAR(16) NULL,
      vendedor VARCHAR(255) NULL,
      codigoVenda VARCHAR(16) NULL,
      endereco TEXT NULL,
      cupomUsado VARCHAR(32) NULL,
      codigoRastreio VARCHAR(32) NULL,
      produtoId BIGINT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migração: bancos criados antes do campo cupomUsado existir (cupom de
    // uso único por cliente) não ganham a coluna nova só com CREATE TABLE
    // IF NOT EXISTS — precisa checar e adicionar
    const [colunasPedidosCupom] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'cupomUsado'`,
      [DB_NAME]
    );
    if (colunasPedidosCupom.length === 0) {
      await pool.query(`ALTER TABLE pedidos ADD COLUMN cupomUsado VARCHAR(32) NULL`);
    }

    // Migração: código de rastreio dos Correios (preenchido pelo Admin ao
    // despachar o pedido)
    const [colunasPedidosRastreio] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'codigoRastreio'`,
      [DB_NAME]
    );
    if (colunasPedidosRastreio.length === 0) {
      await pool.query(`ALTER TABLE pedidos ADD COLUMN codigoRastreio VARCHAR(32) NULL`);
    }

    // Migração: produtoId (referência ao produto desta linha do pedido) —
    // usado para buscar a foto nos e-mails de confirmação de compra/entrega
    const [colunasPedidosProdutoId] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pedidos' AND COLUMN_NAME = 'produtoId'`,
      [DB_NAME]
    );
    if (colunasPedidosProdutoId.length === 0) {
      await pool.query(`ALTER TABLE pedidos ADD COLUMN produtoId BIGINT NULL`);
    }

    // Avisos do andamento do pedido (viram e-mail e notificação no celular)
    await pool.query(`CREATE TABLE IF NOT EXISTS notificacoes_cliente (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      titulo VARCHAR(160) NOT NULL,
      corpo VARCHAR(255) NOT NULL,
      pedidoId VARCHAR(32) NULL,
      criadoEm DATETIME NOT NULL,
      entregue TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_email_entregue (email, entregue)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Celulares/navegadores autorizados a receber notificação
    await pool.query(`CREATE TABLE IF NOT EXISTS push_inscricoes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      endpointHash CHAR(64) NOT NULL UNIQUE,
      endpoint TEXT NOT NULL,
      email VARCHAR(255) NOT NULL,
      criadoEm DATETIME NOT NULL,
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes (
      email VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      since VARCHAR(32),
      criadoEm VARCHAR(10),
      viaGoogle TINYINT(1) NOT NULL DEFAULT 0,
      senha_hash VARCHAR(64) NULL,
      senha_salt VARCHAR(32) NULL,
      email_verificado TINYINT(1) NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    for (const [coluna, tipo] of [
      ["senha_hash", "VARCHAR(64) NULL"],
      ["senha_salt", "VARCHAR(32) NULL"],
      ["email_verificado", "TINYINT(1) NOT NULL DEFAULT 0"],
    ]) {
      const [colunas] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clientes' AND COLUMN_NAME = ?`,
        [DB_NAME, coluna]
      );
      if (colunas.length === 0) await pool.query(`ALTER TABLE clientes ADD COLUMN \`${coluna}\` ${tipo}`);
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes_sessoes (
      token VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS cliente_login_tentativas (
      email VARCHAR(255) PRIMARY KEY,
      tentativas INT NOT NULL DEFAULT 0,
      ultima_tentativa DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes_verificacao (
      token VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes_reset_senha (
      token VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migração: bancos criados antes do campo viaGoogle existir não ganham a
    // coluna nova só com CREATE TABLE IF NOT EXISTS — precisa checar e adicionar
    const [colunasClientes] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'viaGoogle'`,
      [DB_NAME]
    );
    if (colunasClientes.length === 0) {
      await pool.query(
        `ALTER TABLE clientes ADD COLUMN viaGoogle TINYINT(1) NOT NULL DEFAULT 0`
      );
    }

    // Migração: bancos criados antes do campo criadoEm existir (usado para
    // calcular "Clientes Novos" da semana atual no Dashboard, com reset
    // automático toda segunda-feira)
    const [colunasClientesCriadoEm] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'criadoEm'`,
      [DB_NAME]
    );
    if (colunasClientesCriadoEm.length === 0) {
      await pool.query(`ALTER TABLE clientes ADD COLUMN criadoEm VARCHAR(10) NULL`);
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS cargos (
      email VARCHAR(255) PRIMARY KEY,
      cargo VARCHAR(16) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS recrutamentos (
      codigo VARCHAR(16) PRIMARY KEY,
      recrutador VARCHAR(255),
      nome VARCHAR(255),
      email VARCHAR(255),
      ativado TINYINT(1) NOT NULL DEFAULT 0,
      date VARCHAR(16)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Vínculo Master ⇄ MasterPlus: guarda, para cada Master promovido por um
    // MasterPlus, o e-mail de quem o promoveu (usado no repasse de 1%)
    await pool.query(`CREATE TABLE IF NOT EXISTS vinculos_masterplus (
      master VARCHAR(255) PRIMARY KEY,
      masterplus VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS cupons (
      codigo VARCHAR(32) PRIMARY KEY,
      percentual INT NOT NULL,
      validade VARCHAR(10) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      usos INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS alertas_estoque (
      id BIGINT PRIMARY KEY,
      name TEXT,
      date VARCHAR(16)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS banners (
      id BIGINT PRIMARY KEY,
      image LONGTEXT,
      mobileImage LONGTEXT NULL,
      tag VARCHAR(64),
      title VARCHAR(255),
      subtitle VARCHAR(255),
      cta VARCHAR(64),
      category VARCHAR(64)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migração: bancos criados antes do campo mobileImage existir (imagem
    // própria de banner pro celular) — adiciona só se estiver faltando
    const [colunasBannersMobile] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'banners' AND COLUMN_NAME = 'mobileImage'`,
      [DB_NAME]
    );
    if (colunasBannersMobile.length === 0) {
      await pool.query(`ALTER TABLE banners ADD COLUMN mobileImage LONGTEXT NULL`);
    }

    // Cartões salvos dos clientes. IMPORTANTE: por segurança (padrão PCI),
    // NUNCA guarda o número completo do cartão nem o CVV — só o suficiente
    // para o cliente reconhecer o cartão numa lista (bandeira, nome,
    // últimos 4 dígitos e validade).
    await pool.query(`CREATE TABLE IF NOT EXISTS cartoes_salvos (
      id BIGINT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      bandeira VARCHAR(32),
      nomeCartao VARCHAR(255),
      ultimosDigitos VARCHAR(4),
      validade VARCHAR(7),
      mpCardId VARCHAR(64) NULL,
      mpCustomerId VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Migração: bancos criados antes dos campos do cofre do Mercado Pago
    // existirem — adiciona só o que faltar.
    const [colunasCartoesMp] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cartoes_salvos' AND COLUMN_NAME IN ('mpCardId', 'mpCustomerId')`,
      [DB_NAME]
    );
    const colunasCartoesMpExistentes = colunasCartoesMp.map((c) => c.COLUMN_NAME);
    if (!colunasCartoesMpExistentes.includes("mpCardId")) {
      await pool.query(`ALTER TABLE cartoes_salvos ADD COLUMN mpCardId VARCHAR(64) NULL`);
    }
    if (!colunasCartoesMpExistentes.includes("mpCustomerId")) {
      await pool.query(`ALTER TABLE cartoes_salvos ADD COLUMN mpCustomerId VARCHAR(64) NULL`);
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS config (
      id INT PRIMARY KEY,
      chavePix VARCHAR(255),
      freteGratisAcima DOUBLE,
      freteCapital DOUBLE,
      freteInterior DOUBLE,
      fretePadrao DOUBLE,
      comissaoRecrutador DOUBLE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Avaliações de produto (comentário + vídeo do cliente). Publicação é
    // imediata; só quem comprou o produto pode enviar (ver rota POST abaixo).
    // 1 avaliação por cliente por produto — enviar de novo atualiza a mesma.
    await pool.query(`CREATE TABLE IF NOT EXISTS avaliacoes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      produtoId BIGINT NOT NULL,
      clienteEmail VARCHAR(255) NOT NULL,
      clienteNome VARCHAR(255) NOT NULL,
      nota TINYINT NOT NULL,
      comentario TEXT NULL,
      video LONGTEXT NULL,
      date VARCHAR(16) NOT NULL,
      criadaEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unico_cliente_produto (produtoId, clienteEmail),
      INDEX idx_produto (produtoId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Sessões do Admin (login do painel) e controle de tentativas erradas —
    // mesma proteção do backend de produção (PHP).
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_sessoes (
      token VARCHAR(64) PRIMARY KEY,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expira_em DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS admin_login_tentativas (
      ip VARCHAR(64) PRIMARY KEY,
      tentativas INT NOT NULL DEFAULT 0,
      ultima_tentativa DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Código de 2FA do Admin (só um ativo por vez, id fixo = 1)
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_2fa (
      id INT PRIMARY KEY,
      codigo_hash VARCHAR(64) NOT NULL,
      expira_em DATETIME NOT NULL,
      tentativas INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Mesma ideia, por cliente (chave é o e-mail — várias contas podem estar
    // com um código pendente ao mesmo tempo)
    await pool.query(`CREATE TABLE IF NOT EXISTS clientes_2fa (
      email VARCHAR(255) PRIMARY KEY,
      codigo_hash VARCHAR(64) NOT NULL,
      expira_em DATETIME NOT NULL,
      tentativas INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Log de auditoria: login do Admin e ações que alteram dados da loja
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_auditoria (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      acao VARCHAR(64) NOT NULL,
      detalhe TEXT NULL,
      ip VARCHAR(64) NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    console.log(`✓ MySQL conectado — banco "${DB_NAME}" pronto (XAMPP)`);
  } catch (e) {
    pool = null;
    console.warn("⚠ MySQL indisponível (o XAMPP está ligado?). O site seguirá salvando no navegador.");
    console.warn("  Detalhe: " + e.message);
  }
}

// Regrava uma coleção inteira (espelha o estado do site) dentro de uma transação
async function regravarColecao(tabela, colunas, linhas) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    await conexao.query(`DELETE FROM \`${tabela}\``);
    if (linhas.length > 0) {
      const marcadores = linhas.map(() => `(${colunas.map(() => "?").join(",")})`).join(",");
      const valores = linhas.flatMap((linha) => colunas.map((c) => linha[c] ?? null));
      await conexao.query(
        `INSERT INTO \`${tabela}\` (${colunas.map((c) => `\`${c}\``).join(",")}) VALUES ${marcadores}`,
        valores
      );
    }
    await conexao.commit();
  } catch (e) {
    await conexao.rollback();
    throw e;
  } finally {
    conexao.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTE 1B — LOGIN DO ADMIN (mesma proteção do backend de produção)
// ═══════════════════════════════════════════════════════════════════════════════

// Mesmo hash usado no backend-php/api/config.php (senha atual — troque assim
// que possível, já que a senha antiga ficou exposta no código do site). Pode
// ser sobrescrito por variáveis de ambiente (.env) sem mexer no código.
const { ADMIN_PASSWORD_SALT = "1cda1bb3d2f43be06d777a838d654c40",
        ADMIN_PASSWORD_HASH = "06dcce16b03b33e7baad827443c27446627b6f904f52a2b807198065b14ef54d" } = process.env;

function ipCliente(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "desconhecido").toString();
}

async function verificarSenhaAdmin(req, senha) {
  const ip = ipCliente(req);
  const [linhas] = await pool.query("SELECT * FROM admin_login_tentativas WHERE ip = ?", [ip]);
  const registro = linhas[0];
  if (registro && registro.tentativas >= 5) {
    const decorrido = Date.now() - new Date(registro.ultima_tentativa).getTime();
    if (decorrido < 15 * 60 * 1000) {
      const erro = new Error("Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.");
      erro.status = 429;
      throw erro;
    }
  }
  const hash = crypto.createHash("sha256").update(ADMIN_PASSWORD_SALT + senha).digest("hex");
  const correta = hash.length === ADMIN_PASSWORD_HASH.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(ADMIN_PASSWORD_HASH));
  if (correta) {
    await pool.query("DELETE FROM admin_login_tentativas WHERE ip = ?", [ip]);
  } else {
    await pool.query(
      `INSERT INTO admin_login_tentativas (ip, tentativas, ultima_tentativa) VALUES (?, 1, NOW())
       ON DUPLICATE KEY UPDATE tentativas = tentativas + 1, ultima_tentativa = NOW()`,
      [ip]
    );
  }
  return correta;
}

async function registrarAuditoria(req, acao, detalhe) {
  try {
    await pool.query(
      "INSERT INTO admin_auditoria (acao, detalhe, ip) VALUES (?, ?, ?)",
      [acao, detalhe ?? null, ipCliente(req)]
    );
  } catch {
    // log não pode quebrar a ação real
  }
}

// ── 2FA do Admin (código de 6 dígitos por e-mail) ───────────────────────────
async function criarCodigo2faAdmin() {
  const codigo = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  const hash = crypto.createHash("sha256").update(codigo).digest("hex");
  await pool.query("DELETE FROM admin_2fa");
  await pool.query(
    "INSERT INTO admin_2fa (id, codigo_hash, expira_em, tentativas) VALUES (1, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)",
    [hash]
  );
  return codigo;
}

async function verificarCodigo2faAdmin(codigo) {
  const [linhas] = await pool.query("SELECT * FROM admin_2fa WHERE id = 1 AND expira_em > NOW()");
  const linha = linhas[0];
  if (!linha) return false;
  if (linha.tentativas >= 5) {
    await pool.query("DELETE FROM admin_2fa");
    return false;
  }
  const hash = crypto.createHash("sha256").update(codigo).digest("hex");
  if (hash.length === linha.codigo_hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(linha.codigo_hash))) {
    await pool.query("DELETE FROM admin_2fa");
    return true;
  }
  await pool.query("UPDATE admin_2fa SET tentativas = tentativas + 1 WHERE id = 1");
  return false;
}

// ── 2FA do cliente (código de 6 dígitos por e-mail) ─────────────────────────
// Mesma ideia do Admin, só que por conta: entra em jogo só no login com
// senha — login com Google já é conferido de verdade com a própria Google.
async function criarCodigo2faCliente(email) {
  const codigo = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  const hash = crypto.createHash("sha256").update(codigo).digest("hex");
  await pool.query(
    `INSERT INTO clientes_2fa (email, codigo_hash, expira_em, tentativas)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)
     ON DUPLICATE KEY UPDATE codigo_hash = VALUES(codigo_hash), expira_em = VALUES(expira_em), tentativas = 0`,
    [email, hash]
  );
  return codigo;
}

async function verificarCodigo2faCliente(email, codigo) {
  const [linhas] = await pool.query("SELECT * FROM clientes_2fa WHERE email = ? AND expira_em > NOW()", [email]);
  const linha = linhas[0];
  if (!linha) return false;
  if (linha.tentativas >= 5) {
    await pool.query("DELETE FROM clientes_2fa WHERE email = ?", [email]);
    return false;
  }
  const hash = crypto.createHash("sha256").update(codigo).digest("hex");
  if (hash.length === linha.codigo_hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(linha.codigo_hash))) {
    await pool.query("DELETE FROM clientes_2fa WHERE email = ?", [email]);
    return true;
  }
  await pool.query("UPDATE clientes_2fa SET tentativas = tentativas + 1 WHERE email = ?", [email]);
  return false;
}

async function criarSessaoAdmin() {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO admin_sessoes (token, expira_em) VALUES (?, DATE_ADD(NOW(), INTERVAL 72 HOUR))",
    [token]
  );
  return token;
}

// Middleware: bloqueia (401) rotas que alteram dados da loja inteira sem um
// token de Admin válido no cabeçalho Authorization: Bearer <token>.
async function exigirAdmin(req, res, next) {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const cabecalho = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(cabecalho);
  if (!m) return res.status(401).json({ erro: "Não autorizado. Faça login como Admin novamente." });
  const [linhas] = await pool.query(
    "SELECT token FROM admin_sessoes WHERE token = ? AND expira_em > NOW()",
    [m[1].trim()]
  );
  if (linhas.length === 0) {
    return res.status(401).json({ erro: "Sessão expirada. Faça login como Admin novamente." });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTE 1C — LOGIN DE CLIENTES COMUNS (senha própria + Google conferido)
// ═══════════════════════════════════════════════════════════════════════════════

const { EMAIL_ADMIN = "balorense@gmail.com",
        GOOGLE_CLIENT_ID = "887237314004-016e23l96uj8mrc2kmhh7bmemiij7j5c.apps.googleusercontent.com" } = process.env;

// Mesma regra de senha forte do backend PHP: 8+ caracteres, maiúscula,
// minúscula, número e caractere especial
function validarSenhaForte(senha) {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-z]/.test(senha)) return "A senha precisa ter pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(senha)) return "A senha precisa ter pelo menos uma letra maiúscula.";
  if (!/[0-9]/.test(senha)) return "A senha precisa ter pelo menos um número.";
  if (!/[^A-Za-z0-9]/.test(senha)) return "A senha precisa ter pelo menos um caractere especial (ex.: !@#$%).";
  return null;
}

function hashSenhaCliente(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(salt + senha).digest("hex");
  return { salt, hash };
}

function senhaClienteConfere(senha, salt, hash) {
  if (!salt || !hash) return false;
  const calculado = crypto.createHash("sha256").update(salt + senha).digest("hex");
  return calculado.length === hash.length && crypto.timingSafeEqual(Buffer.from(calculado), Buffer.from(hash));
}

async function verificarLoginCliente(email, senha, salt, hash) {
  const [linhas] = await pool.query("SELECT * FROM cliente_login_tentativas WHERE email = ?", [email]);
  const registro = linhas[0];
  if (registro && registro.tentativas >= 6) {
    if (Date.now() - new Date(registro.ultima_tentativa).getTime() < 15 * 60 * 1000) {
      const erro = new Error("Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.");
      erro.status = 429;
      throw erro;
    }
  }
  const correta = senhaClienteConfere(senha, salt, hash);
  if (correta) {
    await pool.query("DELETE FROM cliente_login_tentativas WHERE email = ?", [email]);
  } else {
    await pool.query(
      `INSERT INTO cliente_login_tentativas (email, tentativas, ultima_tentativa) VALUES (?, 1, NOW())
       ON DUPLICATE KEY UPDATE tentativas = tentativas + 1, ultima_tentativa = NOW()`,
      [email]
    );
  }
  return correta;
}

async function criarSessaoCliente(email) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO clientes_sessoes (token, email, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))",
    [token, email]
  );
  return token;
}

// Confere o id_token do Google direto com a Google — nunca confia só no que
// o navegador manda (evita login forjado)
async function verificarIdTokenGoogle(idToken) {
  try {
    const resposta = await axios.get("https://oauth2.googleapis.com/tokeninfo", {
      params: { id_token: idToken },
      timeout: 8000,
    });
    const dados = resposta.data;
    if (dados.aud !== GOOGLE_CLIENT_ID) return null;
    if (!dados.email || dados.email_verified !== "true") return null;
    return dados;
  } catch {
    return null;
  }
}

// Aceita tanto sessão de cliente comum quanto do Admin (a mesma rota de
// checkout, por exemplo, também é usada quando o Admin compra pela loja)
async function emailAutenticado(req) {
  const cabecalho = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(cabecalho);
  if (!m) return null;
  const token = m[1].trim();
  const [clientes] = await pool.query(
    "SELECT email FROM clientes_sessoes WHERE token = ? AND expira_em > NOW()",
    [token]
  );
  if (clientes.length > 0) return clientes[0].email;
  const [admins] = await pool.query(
    "SELECT token FROM admin_sessoes WHERE token = ? AND expira_em > NOW()",
    [token]
  );
  if (admins.length > 0) return EMAIL_ADMIN;
  return null;
}

// ─── Validação de arquivos enviados em base64 (imagem/vídeo) ─────────────────
function validarArquivoBase64(dataUri, mimesPermitidos, assinaturas) {
  if (!dataUri) return true; // campo opcional
  const m = /^data:([a-zA-Z0-9\/\+\.\-]+);base64,(.+)$/.exec(dataUri);
  if (!m) return false;
  const mime = m[1].toLowerCase();
  if (!mimesPermitidos.includes(mime)) return false;
  let bin;
  try {
    bin = Buffer.from(m[2], "base64");
  } catch {
    return false;
  }
  if (bin.length < 12) return false;
  for (const [offset, possibilidades] of assinaturas) {
    for (const assinatura of possibilidades) {
      if (bin.subarray(offset, offset + assinatura.length).equals(Buffer.from(assinatura, "binary"))) return true;
    }
  }
  return false;
}

function validarImagemBase64(dataUri) {
  return validarArquivoBase64(
    dataUri,
    ["image/jpeg", "image/png", "image/webp", "image/gif"],
    [
      [0, ["\xFF\xD8\xFF", "\x89PNG\r\n\x1a\n", "GIF87a", "GIF89a"]],
      [8, ["WEBP"]],
    ]
  );
}

function validarVideoBase64(dataUri) {
  return validarArquivoBase64(
    dataUri,
    ["video/mp4", "video/webm", "video/quicktime", "video/ogg"],
    [
      [4, ["ftyp"]],
      [0, ["\x1A\x45\xDF\xA3", "OggS"]],
    ]
  );
}

// Backend local (XAMPP) não tem SMTP configurado — em vez de tentar enviar
// e-mail de verdade, só mostra o link no terminal (suficiente pra testar o
// fluxo localmente). O backend de produção (PHP) envia o e-mail de verdade.
function enviarEmailDev(destino, assunto, link) {
  console.log(`\n✉ [E-mail simulado] Para: ${destino} — ${assunto}\n  Link: ${link}\n`);
}

async function criarTokenVerificacao(email) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO clientes_verificacao (token, email, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 48 HOUR))",
    [token, email]
  );
  return token;
}

async function criarTokenResetSenha(email) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO clientes_reset_senha (token, email, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))",
    [token, email]
  );
  return token;
}

async function exigirEmailAutenticado(req, res) {
  const email = await emailAutenticado(req);
  if (!email) {
    res.status(401).json({ erro: "Não autorizado. Faça login novamente." });
    return null;
  }
  return email;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARTE 2 — COBRANÇAS PIX (Sicredi)
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_SICREDI =
  SICREDI_AMBIENTE === "producao"
    ? "https://api-pix.sicredi.com.br"
    : "https://api-pix-h.sicredi.com.br";

// O PIX oficial só liga quando as credenciais e certificados estiverem no lugar
const pixConfigurado =
  Boolean(SICREDI_CLIENT_ID && SICREDI_CLIENT_SECRET) &&
  fs.existsSync(SICREDI_CERT_PATH) &&
  fs.existsSync(SICREDI_KEY_PATH);

let sicredi = null;
if (pixConfigurado) {
  const httpsAgent = new https.Agent({
    cert: fs.readFileSync(SICREDI_CERT_PATH),
    key: fs.readFileSync(SICREDI_KEY_PATH),
  });
  sicredi = axios.create({ baseURL: BASE_SICREDI, httpsAgent, timeout: 15000 });
}

let cacheToken = { token: null, expiraEm: 0 };

async function obterToken() {
  if (cacheToken.token && Date.now() < cacheToken.expiraEm) return cacheToken.token;
  const resposta = await sicredi.post("/oauth/token", null, {
    params: { grant_type: "client_credentials", scope: "cob.read cob.write webhook.read webhook.write" },
    auth: { username: SICREDI_CLIENT_ID, password: SICREDI_CLIENT_SECRET },
  });
  cacheToken = {
    token: resposta.data.access_token,
    expiraEm: Date.now() + Math.max(0, (resposta.data.expires_in - 60)) * 1000,
  };
  return cacheToken.token;
}

// Usa a chave PIX salva nas Configurações da loja (banco); sem banco, usa o .env
async function obterChavePix() {
  if (pool) {
    const [linhas] = await pool.query("SELECT chavePix FROM config WHERE id = 1");
    if (linhas[0]?.chavePix) return linhas[0].chavePix;
  }
  return PIX_CHAVE;
}

// txid no formato do Bacen (26 a 35 caracteres alfanuméricos)
function gerarTxid() {
  return ("CP" + crypto.randomBytes(20).toString("hex")).slice(0, 32);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();
// Só libera para o site de produção e o ambiente de desenvolvimento local —
// antes aceitava qualquer origem ("*"), qualquer site podia chamar a API.
const ORIGENS_PERMITIDAS = [
  "https://coracaopresente.com.br",
  "https://www.coracaopresente.com.br",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
app.use(cors({
  origin: (origem, callback) => {
    if (!origem || ORIGENS_PERMITIDAS.includes(origem)) return callback(null, true);
    callback(new Error("Origem não permitida"));
  },
}));
app.use(express.json({ limit: "25mb" })); // imagens de produto em base64

// ── Login do Admin ────────────────────────────────────────────────────────────

app.post("/api/admin/login", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const senha = String(req.body?.senha || "");
  if (!senha) return res.status(400).json({ erro: "Informe a senha." });
  try {
    const correta = await verificarSenhaAdmin(req, senha);
    if (!correta) {
      await registrarAuditoria(req, "login_admin_falhou");
      return res.status(401).json({ erro: "Senha incorreta." });
    }
    const codigo = await criarCodigo2faAdmin();
    enviarEmailDev(EMAIL_ADMIN, "Código de acesso do Admin", `Código: ${codigo}`);
    await registrarAuditoria(req, "login_admin_senha_ok_aguardando_2fa");
    res.json({ ok: true, precisa2fa: true });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message || "Falha ao entrar." });
  }
});

app.post("/api/admin/verificar-2fa", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const codigo = String(req.body?.codigo || "").trim();
  if (!codigo) return res.status(400).json({ erro: "Informe o código." });
  const ok = await verificarCodigo2faAdmin(codigo);
  if (!ok) {
    await registrarAuditoria(req, "login_admin_2fa_falhou");
    return res.status(401).json({ erro: "Código incorreto ou expirado." });
  }
  await registrarAuditoria(req, "login_admin");
  const token = await criarSessaoAdmin();
  res.json({ ok: true, token });
});

app.get("/api/admin/auditoria", exigirAdmin, async (_req, res) => {
  const [linhas] = await pool.query("SELECT * FROM admin_auditoria ORDER BY id DESC LIMIT 200");
  res.json(linhas);
});

app.post("/api/admin/logout", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const cabecalho = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(cabecalho);
  if (m) await pool.query("DELETE FROM admin_sessoes WHERE token = ?", [m[1].trim()]);
  res.json({ ok: true });
});

// ── Rotas do banco de dados ──────────────────────────────────────────────────

// Devolve tudo de uma vez — o site carrega isso ao abrir
// Serve a foto de um produto como imagem de verdade (fica salva no banco como
// data URI base64) — usada pelos e-mails de compra/entrega, que não podem
// embutir base64 direto (a maioria dos clientes de e-mail não renderiza, e o
// que renderiza deixa o e-mail gigante). Rota pública: a foto já é pública
// na vitrine.
app.get("/api/produtos/:id/imagem", async (req, res) => {
  if (!pool) return res.status(503).end();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).end();
  const [linhas] = await pool.query("SELECT image FROM produtos WHERE id = ?", [id]);
  const dataUri = linhas[0]?.image;
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUri || "");
  if (!m) return res.status(404).end();
  const bin = Buffer.from(m[2], "base64");
  res.set("Content-Type", m[1]);
  res.set("Cache-Control", "public, max-age=604800");
  res.send(bin);
});

app.get("/api/dados", async (_req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  try {
    const [produtos] = await pool.query("SELECT * FROM produtos");
    const [pedidos] = await pool.query("SELECT * FROM pedidos");
    const [clientes] = await pool.query("SELECT * FROM clientes");
    const [cargosLinhas] = await pool.query("SELECT * FROM cargos");
    const [recrutamentos] = await pool.query("SELECT * FROM recrutamentos");
    const [vinculosMasterPlusLinhas] = await pool.query("SELECT * FROM vinculos_masterplus");
    const [cupons] = await pool.query("SELECT * FROM cupons");
    const [alertas] = await pool.query("SELECT * FROM alertas_estoque");
    const [banners] = await pool.query("SELECT * FROM banners");
    const [cartoesSalvos] = await pool.query("SELECT * FROM cartoes_salvos");
    const [configLinhas] = await pool.query("SELECT * FROM config WHERE id = 1");

    const cargos = {};
    for (const linha of cargosLinhas) cargos[linha.email] = linha.cargo;
    const vinculosMasterPlus = {};
    for (const linha of vinculosMasterPlusLinhas) vinculosMasterPlus[linha.master] = linha.masterplus;
    const config = configLinhas[0]
      ? { ...configLinhas[0], id: undefined }
      : null;

    res.json({
      produtos: produtos.map((p) => ({
        ...p,
        codigo: p.codigo ?? undefined,
        originalPrice: p.originalPrice ?? undefined,
        badge: p.badge ?? undefined,
        owner: p.owner ?? undefined,
        pixDesconto: p.pixDesconto ?? undefined,
        freeShipping: Boolean(p.freeShipping),
        images: p.images ? JSON.parse(p.images) : undefined,
        colors: p.colors ? JSON.parse(p.colors) : undefined,
      })),
      pedidos: pedidos.map((o) => ({
        ...o,
        pagamento: o.pagamento ?? undefined,
        vendedor: o.vendedor ?? undefined,
        codigoVenda: o.codigoVenda ?? undefined,
        endereco: o.endereco ?? undefined,
        cupomUsado: o.cupomUsado ?? undefined,
        codigoRastreio: o.codigoRastreio ?? undefined,
        produtoId: o.produtoId ?? undefined,
      })),
      clientes: clientes.map((c) => ({ ...c, criadoEm: c.criadoEm ?? undefined, viaGoogle: Boolean(c.viaGoogle) })),
      cargos,
      recrutamentos: recrutamentos.map((r) => ({ ...r, ativado: Boolean(r.ativado) })),
      vinculosMasterPlus,
      cupons: cupons.map((c) => ({ ...c, ativo: Boolean(c.ativo) })),
      alertasEstoque: alertas,
      banners,
      cartoesSalvos,
      config,
    });
  } catch (e) {
    console.error("Erro ao ler o banco:", e.message);
    res.status(500).json({ erro: "Falha ao ler o banco de dados." });
  }
});

// Grava uma coleção que mudou no site (regrava a tabela inteira — só o Admin)
app.put("/api/dados/:colecao", exigirAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const dados = req.body?.dados;
  try {
    switch (req.params.colecao) {
      case "produtos":
        for (const p of dados || []) {
          if (!validarImagemBase64(p.image)) return res.status(400).json({ erro: "Imagem principal inválida em um dos produtos." });
          for (const img of p.images || []) {
            if (!validarImagemBase64(img)) return res.status(400).json({ erro: "Uma das imagens da galeria é inválida." });
          }
          for (const cor of p.colors || []) {
            if (!validarImagemBase64(cor.image)) return res.status(400).json({ erro: "Imagem de uma das cores é inválida." });
          }
        }
        await regravarColecao("produtos", [
          "id", "codigo", "name", "brand", "price", "originalPrice", "installments", "rating",
          "reviews", "image", "category", "badge", "freeShipping", "stock",
          "owner", "pixDesconto", "images", "colors",
        ], dados.map((p) => ({
          ...p,
          images: p.images && p.images.length ? JSON.stringify(p.images) : null,
          colors: p.colors && p.colors.length ? JSON.stringify(p.colors) : null,
        })));
        break;
      case "pedidos":
        await regravarColecao("pedidos", [
          "id", "customer", "email", "items", "total", "status", "date", "month",
          "category", "pagamento", "vendedor", "codigoVenda", "endereco", "cupomUsado",
          "codigoRastreio", "produtoId",
        ], dados);
        break;
      case "clientes":
        await regravarColecao(
          "clientes",
          ["email", "name", "since", "criadoEm", "viaGoogle"],
          (dados ?? []).map((c) => ({ ...c, viaGoogle: Boolean(c.viaGoogle) }))
        );
        break;
      case "cargos": {
        const linhas = Object.entries(dados ?? {}).map(([email, cargo]) => ({ email, cargo }));
        await regravarColecao("cargos", ["email", "cargo"], linhas);
        break;
      }
      case "recrutamentos":
        await regravarColecao("recrutamentos", [
          "codigo", "recrutador", "nome", "email", "ativado", "date",
        ], dados);
        break;
      case "vinculosMasterPlus": {
        const linhas = Object.entries(dados ?? {}).map(([master, masterplus]) => ({ master, masterplus }));
        await regravarColecao("vinculos_masterplus", ["master", "masterplus"], linhas);
        break;
      }
      case "cupons":
        await regravarColecao("cupons", ["codigo", "percentual", "validade", "ativo", "usos"], dados);
        break;
      case "alertasEstoque":
        await regravarColecao("alertas_estoque", ["id", "name", "date"], dados);
        break;
      case "banners":
        for (const b of dados || []) {
          if (!validarImagemBase64(b.image) || !validarImagemBase64(b.mobileImage)) {
            return res.status(400).json({ erro: "Imagem de um dos banners é inválida." });
          }
        }
        await regravarColecao("banners", [
          "id", "image", "mobileImage", "tag", "title", "subtitle", "cta", "category",
        ], dados);
        break;
      case "cartoesSalvos":
        await regravarColecao("cartoes_salvos", [
          "id", "email", "bandeira", "nomeCartao", "ultimosDigitos", "validade", "mpCardId", "mpCustomerId",
        ], dados);
        break;
      case "config":
        await regravarColecao("config", [
          "id", "chavePix", "freteGratisAcima", "freteCapital", "freteInterior",
          "fretePadrao", "comissaoRecrutador",
        ], [{ id: 1, ...dados }]);
        break;
      default:
        return res.status(400).json({ erro: "Coleção desconhecida." });
    }
    await registrarAuditoria(req, "gravar_colecao", `${req.params.colecao} (${(dados || []).length ?? ""} itens)`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`Erro ao gravar ${req.params.colecao}:`, e.message);
    res.status(500).json({ erro: "Falha ao gravar no banco de dados." });
  }
});

// ── Endpoints com gravação pontual (uma linha só) ────────────────────────────
//
// As rotas acima (PUT /api/dados/:colecao) reescrevem a TABELA INTEIRA a cada
// chamada — ótimo pra edições do Admin (raras), mas perigoso pra ações de
// clientes comuns (compra, login, avaliação...): se o navegador do cliente
// carregou os dados antes de o Admin cadastrar um produto/banner novo, a
// própria compra desse cliente reescreveria a tabela inteira com a cópia
// desatualizada dele, apagando o que o Admin acabou de adicionar. As rotas
// abaixo mudam só a linha necessária, sem esse risco.

// Finaliza uma compra: insere os pedidos, dá baixa no estoque (produto e,
// se houver, na cor escolhida) e credita o uso do cupom — tudo numa
// transação só, sem tocar em mais nada da tabela.
app.post("/api/checkout", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const emailAutenticado = await exigirEmailAutenticado(req, res);
  if (!emailAutenticado) return;
  const { pedidos, itens, cupomCodigo } = req.body || {};
  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    return res.status(400).json({ erro: "Nenhum pedido para gravar." });
  }
  if (pedidos.some((p) => String(p.email || "").toLowerCase() !== emailAutenticado.toLowerCase())) {
    return res.status(403).json({ erro: "Não autorizado." });
  }
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    // Insere os pedidos novos (nunca mexe nos pedidos já existentes)
    const colunasPedido = [
      "id", "customer", "email", "items", "total", "status", "date", "month",
      "category", "pagamento", "vendedor", "codigoVenda", "endereco", "cupomUsado", "produtoId",
    ];
    const marcadores = pedidos.map(() => `(${colunasPedido.map(() => "?").join(",")})`).join(",");
    const valores = pedidos.flatMap((p) => colunasPedido.map((c) => p[c] ?? null));
    await conexao.query(
      `INSERT INTO pedidos (${colunasPedido.map((c) => `\`${c}\``).join(",")}) VALUES ${marcadores}`,
      valores
    );

    // Baixa de estoque produto a produto (com FOR UPDATE pra travar a linha
    // contra outra compra simultânea do mesmo produto)
    const produtosAtualizados = [];
    for (const item of itens || []) {
      const [[produto]] = await conexao.query(
        "SELECT id, name, stock, colors FROM produtos WHERE id = ? FOR UPDATE",
        [item.id]
      );
      if (!produto) continue;
      const novoStock = Math.max(0, produto.stock - item.qty);
      let coresJson = produto.colors;
      if (produto.colors && item.corEscolhida) {
        const cores = JSON.parse(produto.colors);
        const novasCores = cores.map((c) =>
          c.nome === item.corEscolhida && typeof c.estoque === "number"
            ? { ...c, estoque: Math.max(0, c.estoque - item.qty) }
            : c
        );
        coresJson = JSON.stringify(novasCores);
      }
      await conexao.query("UPDATE produtos SET stock = ?, colors = ? WHERE id = ?", [novoStock, coresJson, item.id]);
      produtosAtualizados.push({ id: item.id, stock: novoStock });
      if (produto.stock > 0 && novoStock <= 0) {
        await conexao.query(
          "INSERT INTO alertas_estoque (id, name, date) VALUES (?, ?, ?)",
          [produto.id, produto.name, pedidos[0]?.date ?? null]
        );
      }
    }

    // Uso do cupom (se algum foi aplicado nesta compra)
    if (cupomCodigo) {
      await conexao.query("UPDATE cupons SET usos = usos + 1 WHERE codigo = ?", [cupomCodigo]);
    }

    await conexao.commit();

    // Confirmação de compra por e-mail — com foto, valor e endereço de cada
    // item. Depois do commit (a compra já está gravada de qualquer forma) e
    // nunca derruba a resposta se o e-mail falhar.
    try {
      const nomeCliente = pedidos[0]?.customer || "";
      const linhas = pedidos.map((p) =>
        montarLinhaItemDev(p.produtoId, p.items, p.total)
      );
      const totalGeral = pedidos.reduce((acum, p) => acum + Number(p.total || 0), 0);
      const corpo = [
        "Recebemos seu pedido e já estamos preparando tudo com carinho.",
        pedidos[0]?.pagamento ? `Pagamento: ${pedidos[0].pagamento}.` : "",
        pedidos[0]?.endereco ? `Entrega em: ${pedidos[0].endereco}.` : "",
        "",
        ...linhas,
        `  Total: ${formatarMoedaBrl(totalGeral)}`,
      ].filter(Boolean).join("\n");
      enviarEmailDev(emailAutenticado, "Compra confirmada", corpo);
    } catch (e) {
      console.error("Falha ao enviar e-mail de confirmação de compra:", e.message);
    }

    res.json({ ok: true, produtosAtualizados });
  } catch (e) {
    await conexao.rollback();
    console.error("Erro ao finalizar compra:", e.message);
    res.status(500).json({ erro: "Falha ao gravar a compra no banco de dados." });
  } finally {
    conexao.release();
  }
});

// Rastreamento público: exige o número do pedido E o e-mail da compra (só quem
// comprou tem os dois). Devolve apenas o andamento — nunca endereço, pagamento
// ou dados do cliente.
app.get("/api/pedidos/rastrear", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const id = String(req.query?.id || "").trim();
  const email = String(req.query?.email || "").trim().toLowerCase();
  if (!id || !email) {
    return res.status(400).json({ erro: "Informe o número do pedido e o e-mail da compra." });
  }
  try {
    const [linhas] = await pool.query(
      `SELECT id, items, total, status, date, codigoRastreio
       FROM pedidos WHERE LOWER(id) = ? AND LOWER(email) = ?`,
      [id.toLowerCase(), email],
    );
    // Mesma resposta pra "não existe" e "e-mail não confere": não confirma a
    // terceiros que um número de pedido é válido.
    if (!linhas.length) return res.status(404).json({ erro: "Pedido não encontrado." });
    const o = linhas[0];
    // Com código de postagem, busca os eventos reais nos Correios; sem
    // integração configurada (ou objeto ainda não postado) vem null e o site
    // mostra só o andamento interno da loja.
    const eventos = o.codigoRastreio ? await eventosCorreios(o.codigoRastreio) : null;
    res.json({
      id: o.id,
      items: o.items,
      total: Number(o.total),
      status: o.status,
      date: o.date,
      codigoRastreio: o.codigoRastreio || null,
      eventos,
    });
  } catch (e) {
    console.error("Erro ao rastrear pedido:", e.message);
    res.status(500).json({ erro: "Falha ao consultar o pedido." });
  }
});

// Admin atualiza o status e/ou o código de rastreio de UM pedido, sem
// reescrever a tabela inteira
app.patch("/api/pedidos/:id", exigirAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const corpo = req.body || {};
  const { status } = corpo;
  // Chave presente com valor vazio = "apagar o código"; chave ausente = "não
  // mexer nesse campo".
  const mudaRastreio = Object.prototype.hasOwnProperty.call(corpo, "codigoRastreio");
  const codigoRastreio = mudaRastreio ? String(corpo.codigoRastreio || "").toUpperCase().trim() : null;

  if (!status && !mudaRastreio) return res.status(400).json({ erro: "Informe o status." });
  if (mudaRastreio && codigoRastreio !== "" && !codigoRastreioValido(codigoRastreio)) {
    return res.status(400).json({ erro: "Código de rastreio inválido — use o formato AA123456789BR." });
  }
  try {
    const campos = [];
    const valores = [];
    if (status) { campos.push("status = ?"); valores.push(status); }
    if (mudaRastreio) { campos.push("codigoRastreio = ?"); valores.push(codigoRastreio || null); }
    valores.push(req.params.id);
    await pool.query(`UPDATE pedidos SET ${campos.join(", ")} WHERE id = ?`, valores);
    if (status) await registrarAuditoria(req, "status_pedido", `${req.params.id} -> ${status}`);
    // Avisa o cliente por e-mail e notificação no celular (depois do UPDATE,
    // para o texto já sair com o código de rastreio novo)
    if (status) await avisarClienteStatus(req.params.id, status);
    if (mudaRastreio) {
      await registrarAuditoria(req, "rastreio_pedido", `${req.params.id} -> ${codigoRastreio || "(removido)"}`);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao atualizar status do pedido:", e.message);
    res.status(500).json({ erro: "Falha ao atualizar o pedido." });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// AVISOS AO CLIENTE — e-mail + notificação no celular (Web Push)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Mesma lógica do backend PHP (backend-php/api/avisos.php). O push vai SEM
// conteúdo: o service worker acorda e busca o texto em /api/push/pendentes.
// Isso evita ter que criptografar o corpo da mensagem (AES-GCM + ECDH), que é
// a parte chata do Web Push.

const base64url = (buf) => Buffer.from(buf).toString("base64url");

// Um lugar só para o texto, usado no e-mail e na notificação
function textoAvisoStatus(status, pedidoId, codigoRastreio) {
  switch (status) {
    case "Em trânsito":
      return ["Seu pedido saiu para entrega 🚚", codigoRastreio
        ? `O pedido ${pedidoId} está a caminho. Código dos Correios: ${codigoRastreio}.`
        : `O pedido ${pedidoId} foi despachado e está a caminho do seu endereço.`];
    case "Entregue":
      return ["Seu pedido foi entregue 🎉",
        `O pedido ${pedidoId} chegou ao destino. Boa festa — e conte pra gente o que achou!`];
    case "Cancelado":
      return ["Seu pedido foi cancelado",
        `O pedido ${pedidoId} foi cancelado. Se você não pediu isso, fale com a gente.`];
    case "Processando":
      return ["Pagamento confirmado ✅",
        `Recebemos o pagamento do pedido ${pedidoId}. Já estamos separando tudo.`];
    default:
      return ["Novidade no seu pedido", `O pedido ${pedidoId} agora está como "${status}".`];
  }
}

let chaveVapid = null; // { privada, publica } — carregado uma vez

function carregarVapid() {
  if (chaveVapid !== null) return chaveVapid || null;
  try {
    if (!fs.existsSync(VAPID_PEM)) { chaveVapid = false; return null; }
    const privada = crypto.createPrivateKey(fs.readFileSync(VAPID_PEM));
    const jwk = crypto.createPublicKey(privada).export({ format: "jwk" });
    // Ponto não comprimido: 0x04 + X + Y
    const publica = base64url(Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from(jwk.y, "base64url"),
    ]));
    chaveVapid = { privada, publica };
    return chaveVapid;
  } catch (e) {
    console.error("VAPID: não consegui ler", VAPID_PEM, "-", e.message);
    chaveVapid = false;
    return null;
  }
}

// Token que prova ao serviço de push (Google, Mozilla, Apple...) que o aviso
// saiu do nosso servidor. Vale 12h e é montado por endpoint.
function tokenVapid(origem) {
  const chaves = carregarVapid();
  if (!chaves) return null;
  const cabecalho = base64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const dados = base64url(JSON.stringify({
    aud: origem,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: VAPID_CONTATO,
  }));
  // dsaEncoding ieee-p1363 = os dois números crus colados, como o JWT ES256
  // exige (o padrão do OpenSSL seria DER, que o serviço de push recusa)
  const assinatura = crypto.sign("sha256", Buffer.from(`${cabecalho}.${dados}`), {
    key: chaves.privada,
    dsaEncoding: "ieee-p1363",
  });
  return `${cabecalho}.${dados}.${base64url(assinatura)}`;
}

// Cutuca UM navegador. false = inscrição morta (quem chama apaga a linha).
async function enviarPush(endpoint) {
  const chaves = carregarVapid();
  if (!chaves) return false;
  let origem;
  try { origem = new URL(endpoint).origin; } catch { return false; }
  const token = tokenVapid(origem);
  if (!token) return false;
  try {
    await axios.post(endpoint, "", {
      headers: {
        Authorization: `vapid t=${token}, k=${chaves.publica}`,
        TTL: "86400", // guarda por 1 dia se o celular estiver desligado
        "Content-Length": "0",
        Urgency: "normal",
      },
      timeout: 10000,
    });
    return true;
  } catch (e) {
    const http = e.response?.status;
    if (http === 404 || http === 410) return false; // inscrição expirada
    console.error("Push: falha ao enviar:", http || e.message);
    return true; // erro passageiro — não apaga a inscrição
  }
}

// Grava o aviso, manda o e-mail e cutuca os celulares do cliente
// Formata pra exibição no e-mail dev (produção usa o mesmo padrão em PHP,
// backend-php/api/avisos.php → formatar_moeda_brl)
const formatarMoedaBrl = (valor) => "R$ " + Number(valor).toFixed(2).replace(".", ",");

// Linha de item (descrição + valor), com a URL pública da foto — a mesma
// rota usada pelo e-mail real do backend PHP. Aqui só entra no log do
// terminal (local não manda e-mail de verdade), mas mantém a paridade.
function montarLinhaItemDev(produtoId, itemTexto, total) {
  const foto = produtoId ? `[foto: /api/produtos/${produtoId}/imagem]` : "[sem foto]";
  return `  ${foto} ${itemTexto} — ${formatarMoedaBrl(total)}`;
}

async function avisarClienteStatus(pedidoId, status) {
  try {
    const [linhas] = await pool.query(
      "SELECT customer, email, codigoRastreio, items, total, produtoId FROM pedidos WHERE id = ?", [pedidoId]
    );
    const pedido = linhas[0];
    if (!pedido?.email) return;

    const [titulo, corpo] = textoAvisoStatus(status, pedidoId, pedido.codigoRastreio);
    await pool.query(
      "INSERT INTO notificacoes_cliente (email, titulo, corpo, pedidoId, criadoEm) VALUES (?, ?, ?, ?, NOW())",
      [pedido.email, titulo, corpo, pedidoId]
    );
    // Local não tem SMTP: o e-mail de verdade sai no backend PHP (produção)
    const detalhe = status !== "Cancelado" ? montarLinhaItemDev(pedido.produtoId, pedido.items, pedido.total) : "";
    enviarEmailDev(pedido.email, titulo, `${corpo}\n${detalhe}`);

    const [inscricoes] = await pool.query(
      "SELECT id, endpoint FROM push_inscricoes WHERE LOWER(email) = ?", [pedido.email.toLowerCase()]
    );
    for (const inscricao of inscricoes) {
      if (!(await enviarPush(inscricao.endpoint))) {
        await pool.query("DELETE FROM push_inscricoes WHERE id = ?", [inscricao.id]);
      }
    }
  } catch (e) {
    // Avisar o cliente nunca pode derrubar a ação do Admin
    console.error(`Aviso ao cliente falhou (${pedidoId}):`, e.message);
  }
}

// ── Rotas do push ────────────────────────────────────────────────────────────

// Sem chave configurada devolve null, e o site nem oferece o botão
app.get("/api/push/chave-publica", (_req, res) => {
  res.json({ chave: carregarVapid()?.publica ?? null });
});

app.post("/api/push/inscrever", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const endpoint = String(req.body?.endpoint || "").trim();
  if (!endpoint.startsWith("http")) return res.status(400).json({ erro: "Inscrição inválida." });
  // O e-mail vem da SESSÃO, nunca do que o navegador mandou: senão daria para
  // se inscrever nos avisos dos pedidos de outra pessoa.
  const email = await emailAutenticado(req);
  if (!email) return res.status(401).json({ erro: "Entre na sua conta para ativar as notificações." });
  const hash = crypto.createHash("sha256").update(endpoint).digest("hex");
  await pool.query(
    `INSERT INTO push_inscricoes (endpointHash, endpoint, email, criadoEm) VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE email = VALUES(email), criadoEm = NOW()`,
    [hash, endpoint, email]
  );
  res.json({ ok: true });
});

app.delete("/api/push/inscrever", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const endpoint = String(req.body?.endpoint || "").trim();
  const hash = crypto.createHash("sha256").update(endpoint).digest("hex");
  await pool.query("DELETE FROM push_inscricoes WHERE endpointHash = ?", [hash]);
  res.json({ ok: true });
});

// Quem chama é o service worker, sem sessão. A autorização é o próprio
// endpoint (URL secreta que só o navegador e nós conhecemos) e a resposta traz
// só título e texto — nada de endereço, valor ou dado pessoal.
app.get("/api/push/pendentes", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const hash = String(req.query?.e || "");
  if (!/^[a-f0-9]{64}$/.test(hash)) return res.status(400).json({ erro: "Inscrição inválida." });

  const [inscricoes] = await pool.query(
    "SELECT email FROM push_inscricoes WHERE endpointHash = ?", [hash]
  );
  if (!inscricoes.length) return res.json({ avisos: [] });

  const [avisos] = await pool.query(
    `SELECT id, titulo, corpo, pedidoId FROM notificacoes_cliente
     WHERE LOWER(email) = ? AND entregue = 0 ORDER BY id ASC LIMIT 5`,
    [inscricoes[0].email.toLowerCase()]
  );
  if (avisos.length) {
    await pool.query("UPDATE notificacoes_cliente SET entregue = 1 WHERE id IN (?)",
      [avisos.map((a) => a.id)]);
  }
  res.json({ avisos: avisos.map(({ titulo, corpo, pedidoId }) => ({ titulo, corpo, pedidoId })) });
});

// ── Conta do cliente: cadastro, login (senha) e login com Google ───────────

app.post("/api/clientes/cadastro", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  if (!name || !email || !senha) return res.status(400).json({ erro: "Preencha nome, e-mail e senha." });
  const erroSenha = validarSenhaForte(senha);
  if (erroSenha) return res.status(400).json({ erro: erroSenha });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "E-mail inválido." });
  try {
    const [existentes] = await pool.query("SELECT email FROM clientes WHERE email = ?", [email]);
    if (existentes.length > 0) {
      return res.status(409).json({ erro: "Este e-mail já tem uma conta. Use a opção Entrar." });
    }
    const { salt, hash } = hashSenhaCliente(senha);
    const since = new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    const criadoEm = new Date().toISOString().slice(0, 10);
    await pool.query(
      "INSERT INTO clientes (email, name, since, criadoEm, senha_hash, senha_salt, viaGoogle, email_verificado) VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
      [email, name, since, criadoEm, hash, salt]
    );
    const tokenVerificacao = await criarTokenVerificacao(email);
    enviarEmailDev(email, "Confirme seu e-mail", `http://localhost:5173/?verificar-email=${tokenVerificacao}`);
    const token = await criarSessaoCliente(email);
    res.json({ ok: true, token, cliente: { name, email } });
  } catch (e) {
    console.error("Erro ao cadastrar cliente:", e.message);
    res.status(500).json({ erro: "Falha ao criar a conta." });
  }
});

// Duas etapas, igual ao Admin: senha certa dispara um código de 6 dígitos
// por e-mail em vez de entrar direto — a sessão só é criada em verificar-2fa
app.post("/api/clientes/login", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  if (!email || !senha) return res.status(400).json({ erro: "Informe e-mail e senha." });
  try {
    const [linhas] = await pool.query("SELECT * FROM clientes WHERE email = ?", [email]);
    const cliente = linhas[0];
    const ok = await verificarLoginCliente(email, senha, cliente?.senha_salt, cliente?.senha_hash);
    if (!cliente || !ok) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    const codigo = await criarCodigo2faCliente(email);
    // Local não tem SMTP: o e-mail de verdade sai no backend PHP (produção)
    enviarEmailDev(email, "Seu código de acesso", `Código: ${codigo}`);
    res.json({ ok: true, precisa2fa: true });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message || "Falha ao entrar." });
  }
});

app.post("/api/clientes/verificar-2fa", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const codigo = String(req.body?.codigo || "").trim();
  if (!email || !codigo) return res.status(400).json({ erro: "Informe o código." });
  try {
    const ok = await verificarCodigo2faCliente(email, codigo);
    if (!ok) return res.status(401).json({ erro: "Código incorreto ou expirado." });
    const [linhas] = await pool.query("SELECT name FROM clientes WHERE email = ?", [email]);
    const cliente = linhas[0];
    if (!cliente) return res.status(404).json({ erro: "Conta não encontrada." });
    const token = await criarSessaoCliente(email);
    res.json({ ok: true, token, cliente: { name: cliente.name, email } });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message || "Falha ao confirmar o código." });
  }
});

app.post("/api/clientes/login-google", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const idToken = String(req.body?.idToken || "");
  if (!idToken) return res.status(400).json({ erro: "Token do Google ausente." });
  try {
    const dados = await verificarIdTokenGoogle(idToken);
    if (!dados) return res.status(401).json({ erro: "Não foi possível confirmar o login do Google." });
    const email = dados.email.toLowerCase();
    const name = dados.name || email.split("@")[0];
    const [linhas] = await pool.query("SELECT * FROM clientes WHERE email = ?", [email]);
    if (linhas.length === 0) {
      const since = new Date().toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
      const criadoEm = new Date().toISOString().slice(0, 10);
      await pool.query(
        "INSERT INTO clientes (email, name, since, criadoEm, viaGoogle, email_verificado) VALUES (?, ?, ?, ?, 1, 1)",
        [email, name, since, criadoEm]
      );
    } else if (!linhas[0].viaGoogle || !linhas[0].email_verificado) {
      await pool.query("UPDATE clientes SET viaGoogle = 1, email_verificado = 1 WHERE email = ?", [email]);
    }
    const token = await criarSessaoCliente(email);
    res.json({ ok: true, token, cliente: { name: linhas[0]?.name ?? name, email } });
  } catch (e) {
    console.error("Erro no login com Google:", e.message);
    res.status(500).json({ erro: "Falha ao entrar com o Google." });
  }
});

app.post("/api/clientes/logout", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const cabecalho = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(cabecalho);
  if (m) await pool.query("DELETE FROM clientes_sessoes WHERE token = ?", [m[1].trim()]);
  res.json({ ok: true });
});

app.get("/api/clientes/verificar-email", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ erro: "Token ausente." });
  const [linhas] = await pool.query(
    "SELECT email FROM clientes_verificacao WHERE token = ? AND expira_em > NOW()",
    [token]
  );
  if (linhas.length === 0) return res.status(400).json({ erro: "Link inválido ou expirado." });
  await pool.query("UPDATE clientes SET email_verificado = 1 WHERE email = ?", [linhas[0].email]);
  await pool.query("DELETE FROM clientes_verificacao WHERE token = ?", [token]);
  res.json({ ok: true });
});

app.post("/api/clientes/reenviar-verificacao", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const email = await exigirEmailAutenticado(req, res);
  if (!email) return;
  const [linhas] = await pool.query("SELECT name, email_verificado FROM clientes WHERE email = ?", [email]);
  if (linhas[0] && !linhas[0].email_verificado) {
    const token = await criarTokenVerificacao(email);
    enviarEmailDev(email, "Confirme seu e-mail", `http://localhost:5173/?verificar-email=${token}`);
  }
  res.json({ ok: true });
});

app.post("/api/clientes/esqueci-senha", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ erro: "Informe o e-mail." });
  const [linhas] = await pool.query("SELECT email FROM clientes WHERE email = ?", [email]);
  if (linhas.length > 0) {
    const token = await criarTokenResetSenha(email);
    enviarEmailDev(email, "Redefinir senha", `http://localhost:5173/?redefinir-senha=${token}`);
  }
  res.json({ ok: true }); // sempre a mesma resposta, exista a conta ou não
});

app.post("/api/clientes/redefinir-senha", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const token = String(req.body?.token || "");
  const novaSenha = String(req.body?.novaSenha || "");
  if (!token || !novaSenha) return res.status(400).json({ erro: "Dados incompletos." });
  const erroSenhaNova = validarSenhaForte(novaSenha);
  if (erroSenhaNova) return res.status(400).json({ erro: erroSenhaNova });

  const [linhas] = await pool.query(
    "SELECT email FROM clientes_reset_senha WHERE token = ? AND expira_em > NOW()",
    [token]
  );
  if (linhas.length === 0) return res.status(400).json({ erro: "Link inválido ou expirado. Peça a redefinição de novo." });

  const { salt, hash } = hashSenhaCliente(novaSenha);
  await pool.query("UPDATE clientes SET senha_hash = ?, senha_salt = ? WHERE email = ?", [hash, salt, linhas[0].email]);
  await pool.query("DELETE FROM clientes_reset_senha WHERE token = ?", [token]);
  await pool.query("DELETE FROM clientes_sessoes WHERE email = ?", [linhas[0].email]);
  res.json({ ok: true });
});

// Cliente ativa, no próprio perfil, o código de vendedor recebido do Master —
// marca o vínculo como ativado e dá o cargo de vendedor, sem mexer no resto
// das tabelas de recrutamentos/cargos
app.post("/api/recrutamentos/:codigo/ativar", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const email = await exigirEmailAutenticado(req, res);
  if (!email) return;
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const [[vinculo]] = await conexao.query(
      "SELECT * FROM recrutamentos WHERE codigo = ? AND email = ? FOR UPDATE",
      [req.params.codigo, email.toLowerCase()]
    );
    if (!vinculo) {
      await conexao.rollback();
      return res.status(404).json({ erro: "Código inválido para esta conta." });
    }
    if (vinculo.ativado) {
      await conexao.rollback();
      return res.status(409).json({ erro: "Este código já foi ativado." });
    }
    await conexao.query("UPDATE recrutamentos SET ativado = 1 WHERE codigo = ?", [req.params.codigo]);
    await conexao.query(
      "INSERT INTO cargos (email, cargo) VALUES (?, 'vendedor') ON DUPLICATE KEY UPDATE cargo = 'vendedor'",
      [email.toLowerCase()]
    );
    await conexao.commit();
    res.json({ ok: true });
  } catch (e) {
    await conexao.rollback();
    console.error("Erro ao ativar código de vendedor:", e.message);
    res.status(500).json({ erro: "Falha ao ativar o código." });
  } finally {
    conexao.release();
  }
});

// Cartões salvos: uma linha por vez, nunca a tabela inteira (evita que um
// cliente salvando um cartão apague o cartão salvo de outro cliente)
app.post("/api/cartoes", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const emailAutenticado = await exigirEmailAutenticado(req, res);
  if (!emailAutenticado) return;
  const { id, bandeira, nomeCartao, ultimosDigitos, validade, mpCardId, mpCustomerId } = req.body || {};
  if (!id) return res.status(400).json({ erro: "Dados do cartão incompletos." });
  try {
    await pool.query(
      `INSERT INTO cartoes_salvos (id, email, bandeira, nomeCartao, ultimosDigitos, validade, mpCardId, mpCustomerId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, emailAutenticado.toLowerCase(), bandeira ?? null, nomeCartao ?? null, ultimosDigitos ?? null, validade ?? null, mpCardId ?? null, mpCustomerId ?? null]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao salvar cartão:", e.message);
    res.status(500).json({ erro: "Falha ao salvar o cartão." });
  }
});

app.patch("/api/cartoes/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const emailAutenticado = await exigirEmailAutenticado(req, res);
  if (!emailAutenticado) return;
  const { mpCardId, mpCustomerId } = req.body || {};
  try {
    await pool.query("UPDATE cartoes_salvos SET mpCardId = ?, mpCustomerId = ? WHERE id = ? AND email = ?", [
      mpCardId ?? null, mpCustomerId ?? null, req.params.id, emailAutenticado.toLowerCase(),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao atualizar cartão:", e.message);
    res.status(500).json({ erro: "Falha ao atualizar o cartão." });
  }
});

app.delete("/api/cartoes/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const emailAutenticado = await exigirEmailAutenticado(req, res);
  if (!emailAutenticado) return;
  try {
    await pool.query("DELETE FROM cartoes_salvos WHERE id = ? AND email = ?", [req.params.id, emailAutenticado.toLowerCase()]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir cartão:", e.message);
    res.status(500).json({ erro: "Falha ao excluir o cartão." });
  }
});

// ── Avaliações de produto (comentário + vídeo do cliente) ───────────────────

// Recalcula rating (média) e reviews (quantidade) do produto a partir das
// avaliações reais salvas no banco.
async function recalcularResumoProduto(produtoId) {
  const [[agg]] = await pool.query(
    "SELECT COUNT(*) AS qtd, AVG(nota) AS media FROM avaliacoes WHERE produtoId = ?",
    [produtoId]
  );
  const media = agg?.media !== null && agg?.media !== undefined ? Math.round(Number(agg.media) * 10) / 10 : 0;
  const qtd = agg ? Number(agg.qtd) : 0;
  await pool.query("UPDATE produtos SET rating = ?, reviews = ? WHERE id = ?", [media, qtd, produtoId]);
}

// /api/avaliacoes/{produtoId} → avaliações de um produto (página do produto)
// /api/avaliacoes?todas=1     → todas as avaliações, com o nome do produto (Admin)
app.get("/api/avaliacoes/:produtoId?", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  try {
    const todas = req.query.todas === "1";
    const produtoId = Number(req.params.produtoId);
    if (todas) {
      const [linhas] = await pool.query(
        `SELECT a.*, p.name AS produtoNome FROM avaliacoes a
         LEFT JOIN produtos p ON p.id = a.produtoId
         ORDER BY a.id DESC`
      );
      return res.json(linhas);
    }
    if (!produtoId) return res.status(400).json({ erro: "Informe o produto." });
    const [linhas] = await pool.query(
      "SELECT * FROM avaliacoes WHERE produtoId = ? ORDER BY id DESC",
      [produtoId]
    );
    res.json(linhas);
  } catch (e) {
    console.error("Erro ao ler avaliações:", e.message);
    res.status(500).json({ erro: "Falha ao ler as avaliações." });
  }
});

// Cria (ou atualiza, se o cliente já tinha avaliado) uma avaliação. Só quem
// comprou o produto (pedido Pago ou Entregue) pode enviar — os pedidos não
// guardam o id do produto, só o nome (ver App.tsx/confirmarPagamento), então
// a conferência é por nome.
app.post("/api/avaliacoes", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const clienteEmail = await exigirEmailAutenticado(req, res);
  if (!clienteEmail) return;
  try {
    const produtoId = Number(req.body?.produtoId) || 0;
    const clienteNome = String(req.body?.clienteNome ?? "").trim();
    const nota = Number(req.body?.nota) || 0;
    const comentario = String(req.body?.comentario ?? "").trim();
    const video = typeof req.body?.video === "string" ? req.body.video : null;

    if (!produtoId || !clienteEmail || !clienteNome) return res.status(400).json({ erro: "Dados incompletos." });
    if (nota < 1 || nota > 5) return res.status(400).json({ erro: "Escolha de 1 a 5 estrelas." });
    if (!comentario && !video) return res.status(400).json({ erro: "Escreva um comentário ou envie um vídeo." });
    if (video && video.length > 17 * 1024 * 1024) {
      return res.status(400).json({ erro: "Vídeo muito grande. Envie um vídeo mais curto (máx. ~12 MB)." });
    }
    if (video && !validarVideoBase64(video)) {
      return res.status(400).json({ erro: "Arquivo de vídeo inválido." });
    }

    const [[produto]] = await pool.query("SELECT name FROM produtos WHERE id = ?", [produtoId]);
    if (!produto) return res.status(404).json({ erro: "Produto não encontrado." });

    const [pedidosCompativeis] = await pool.query(
      `SELECT id FROM pedidos WHERE email = ? AND status IN ('Pago','Entregue')
       AND (items = ? OR items LIKE ?) LIMIT 1`,
      [clienteEmail, produto.name, `${produto.name} (%`]
    );
    if (pedidosCompativeis.length === 0) {
      return res.status(403).json({ erro: "Só clientes que compraram este produto podem avaliar." });
    }

    const date = new Date().toLocaleDateString("pt-BR");
    await pool.query(
      `INSERT INTO avaliacoes (produtoId, clienteEmail, clienteNome, nota, comentario, video, date)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         clienteNome = VALUES(clienteNome), nota = VALUES(nota),
         comentario = VALUES(comentario), video = VALUES(video), date = VALUES(date)`,
      [produtoId, clienteEmail, clienteNome, nota, comentario, video, date]
    );

    await recalcularResumoProduto(produtoId);
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao gravar avaliação:", e.message);
    res.status(500).json({ erro: "Falha ao gravar a avaliação." });
  }
});

// Admin exclui uma avaliação imprópria
app.delete("/api/avaliacoes/:id", exigirAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  try {
    const id = Number(req.params.id) || 0;
    if (!id) return res.status(400).json({ erro: "Id inválido." });
    const [[linha]] = await pool.query("SELECT produtoId FROM avaliacoes WHERE id = ?", [id]);
    if (linha) {
      await pool.query("DELETE FROM avaliacoes WHERE id = ?", [id]);
      await recalcularResumoProduto(linha.produtoId);
      await registrarAuditoria(req, "excluir_avaliacao", String(id));
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir avaliação:", e.message);
    res.status(500).json({ erro: "Falha ao excluir a avaliação." });
  }
});

// ── Rotas de cobrança PIX (Sicredi) ──────────────────────────────────────────

const pagosPeloWebhook = new Set();

app.post("/api/pix/cobranca", async (req, res) => {
  if (!pixConfigurado) {
    return res.status(503).json({ erro: "PIX Sicredi ainda não configurado (veja o README)." });
  }
  try {
    const valor = Number(req.body?.valor);
    if (!valor || valor <= 0) return res.status(400).json({ erro: "Valor inválido." });

    const token = await obterToken();
    const txid = gerarTxid();
    const resposta = await sicredi.put(
      `/api/v2/cob/${txid}`,
      {
        calendario: { expiracao: 1800 }, // 30 minutos, igual ao site
        valor: { original: valor.toFixed(2) },
        chave: await obterChavePix(),
        solicitacaoPagador: "Compra na loja Coração Presente",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ txid, pixCopiaECola: resposta.data.pixCopiaECola, status: resposta.data.status });
  } catch (e) {
    console.error("Erro ao criar cobrança:", e.response?.data ?? e.message);
    res.status(502).json({ erro: "Não foi possível criar a cobrança no Sicredi." });
  }
});

app.get("/api/pix/cobranca/:txid", async (req, res) => {
  if (!pixConfigurado) return res.status(503).json({ erro: "PIX Sicredi não configurado." });
  try {
    const { txid } = req.params;
    if (pagosPeloWebhook.has(txid)) return res.json({ status: "CONCLUIDA" });
    const token = await obterToken();
    const resposta = await sicredi.get(`/api/v2/cob/${txid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json({ status: resposta.data.status });
  } catch (e) {
    console.error("Erro ao consultar cobrança:", e.response?.data ?? e.message);
    res.status(502).json({ erro: "Não foi possível consultar a cobrança." });
  }
});

// Webhook: o Sicredi avisa aqui no instante em que um PIX é pago (opcional)
app.post("/webhook/pix", (req, res) => {
  for (const p of req.body?.pix ?? []) {
    if (p.txid) {
      pagosPeloWebhook.add(p.txid);
      console.log(`✓ PIX recebido — txid ${p.txid}, valor R$ ${p.valor}`);
    }
  }
  res.sendStatus(200);
});

// Saúde do serviço
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    servico: "Backend Coração Presente",
    banco: pool ? `MySQL "${DB_NAME}" conectado` : "MySQL indisponível",
    pix: pixConfigurado ? `Sicredi ${SICREDI_AMBIENTE}` : "não configurado",
  });
});

await iniciarBanco();
app.listen(PORT, () => {
  console.log(`✓ Backend no ar em http://localhost:${PORT}`);
  if (!pixConfigurado) console.log("  (PIX Sicredi desligado até preencher credenciais e certificados)");
});
