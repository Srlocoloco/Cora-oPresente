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
      cupomUsado VARCHAR(32) NULL
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

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes (
      email VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      since VARCHAR(32),
      criadoEm VARCHAR(10),
      viaGoogle TINYINT(1) NOT NULL DEFAULT 0
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
      validade VARCHAR(7)
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

// Grava uma coleção que mudou no site
app.put("/api/dados/:colecao", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  const dados = req.body?.dados;
  try {
    switch (req.params.colecao) {
      case "produtos":
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
        await regravarColecao("banners", [
          "id", "image", "mobileImage", "tag", "title", "subtitle", "cta", "category",
        ], dados);
        break;
      case "cartoesSalvos":
        await regravarColecao("cartoes_salvos", [
          "id", "email", "bandeira", "nomeCartao", "ultimosDigitos", "validade",
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
    res.json({ ok: true });
  } catch (e) {
    console.error(`Erro ao gravar ${req.params.colecao}:`, e.message);
    res.status(500).json({ erro: "Falha ao gravar no banco de dados." });
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
  try {
    const produtoId = Number(req.body?.produtoId) || 0;
    const clienteEmail = String(req.body?.clienteEmail ?? "").trim();
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
app.delete("/api/avaliacoes/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ erro: "MySQL indisponível." });
  try {
    const id = Number(req.params.id) || 0;
    if (!id) return res.status(400).json({ erro: "Id inválido." });
    const [[linha]] = await pool.query("SELECT produtoId FROM avaliacoes WHERE id = ?", [id]);
    if (linha) {
      await pool.query("DELETE FROM avaliacoes WHERE id = ?", [id]);
      await recalcularResumoProduto(linha.produtoId);
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
