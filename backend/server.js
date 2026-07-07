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
  PORT = 3333,
} = process.env;

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
      description TEXT NULL,
      owner VARCHAR(255) NULL,
      pixDesconto INT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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
      endereco TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes (
      email VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      since VARCHAR(32)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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

    await pool.query(`CREATE TABLE IF NOT EXISTS config (
      id INT PRIMARY KEY,
      chavePix VARCHAR(255),
      freteGratisAcima DOUBLE,
      freteCapital DOUBLE,
      freteInterior DOUBLE,
      fretePadrao DOUBLE,
      comissaoRecrutador DOUBLE
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
app.use(cors());
app.use(express.json({ limit: "25mb" })); // imagens de produto em base64

// ── Rotas do banco de dados ──────────────────────────────────────────────────

// Devolve tudo de uma vez — o site carrega isso ao abrir
app.get("/api/dados", async (_req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  try {
    const [produtos] = await pool.query("SELECT * FROM produtos");
    const [pedidos] = await pool.query("SELECT * FROM pedidos");
    const [clientes] = await pool.query("SELECT * FROM clientes");
    const [cargosLinhas] = await pool.query("SELECT * FROM cargos");
    const [recrutamentos] = await pool.query("SELECT * FROM recrutamentos");
    const [cupons] = await pool.query("SELECT * FROM cupons");
    const [alertas] = await pool.query("SELECT * FROM alertas_estoque");
    const [configLinhas] = await pool.query("SELECT * FROM config WHERE id = 1");

    const cargos = {};
    for (const linha of cargosLinhas) cargos[linha.email] = linha.cargo;
    const config = configLinhas[0]
      ? { ...configLinhas[0], id: undefined }
      : null;

    res.json({
      produtos: produtos.map((p) => ({
        ...p,
        originalPrice: p.originalPrice ?? undefined,
        badge: p.badge ?? undefined,
        description: p.description ?? undefined,
        owner: p.owner ?? undefined,
        pixDesconto: p.pixDesconto ?? undefined,
        freeShipping: Boolean(p.freeShipping),
      })),
      pedidos: pedidos.map((o) => ({
        ...o,
        pagamento: o.pagamento ?? undefined,
        vendedor: o.vendedor ?? undefined,
        codigoVenda: o.codigoVenda ?? undefined,
        endereco: o.endereco ?? undefined,
      })),
      clientes,
      cargos,
      recrutamentos: recrutamentos.map((r) => ({ ...r, ativado: Boolean(r.ativado) })),
      cupons: cupons.map((c) => ({ ...c, ativo: Boolean(c.ativo) })),
      alertasEstoque: alertas,
      config,
    });
  } catch (e) {
    console.error("Erro ao ler o banco:", e.message);
    res.status(500).json({ erro: "Falha ao ler o banco de dados." });
  }
});

// Grava uma coleção que mudou no site
app.put("/api/dados/:colecao", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const dados = req.body?.dados;
  try {
    switch (req.params.colecao) {
      case "produtos":
        await regravarColecao("produtos", [
          "id", "name", "brand", "price", "originalPrice", "installments", "rating",
          "reviews", "image", "category", "badge", "freeShipping", "stock",
          "description", "owner", "pixDesconto",
        ], dados);
        break;
      case "pedidos":
        await regravarColecao("pedidos", [
          "id", "customer", "email", "items", "total", "status", "date", "month",
          "category", "pagamento", "vendedor", "codigoVenda", "endereco",
        ], dados);
        break;
      case "clientes":
        await regravarColecao("clientes", ["email", "name", "since"], dados);
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
      case "cupons":
        await regravarColecao("cupons", ["codigo", "percentual", "validade", "ativo", "usos"], dados);
        break;
      case "alertasEstoque":
        await regravarColecao("alertas_estoque", ["id", "name", "date"], dados);
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
    res.json({ ok: true });
  } catch (e) {
    console.error(`Erro ao gravar ${req.params.colecao}:`, e.message);
    res.status(500).json({ erro: "Falha ao gravar no banco de dados." });
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
