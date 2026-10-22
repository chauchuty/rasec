// Rotas da API do RASEC Espetinhos
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { gerarPayloadPix } from './pix.js';
import { config } from './config.js';
import { consultar, buscarPedidoCompleto } from './db.js';

export const rotas = Router();

const SABORES = { carne: 12.0, frango: 10.0, linguica: 10.0 };
const STATUS_VALIDOS = ['Pendente', 'Em preparo', 'Pronto', 'Entregue'];

/* --------------------- Sessão administrativa --------------------- */
// Tokens em memória: se o servidor reiniciar, o admin faz login de novo.
const sessoes = new Set();
const cookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').filter(Boolean)
    .map((p) => p.trim().split('=').map(decodeURIComponent))
);

function exigirAdmin(req, res, next) {
  const token = cookies(req).rasec_admin;
  if (sessoes.has(token)) return next();
  res.status(401).json({ erro: 'Não autorizado' });
}

/* ----------------------------- Público --------------------------- */

/** Lista de sabores (fonte única com o frontend) */
rotas.get('/api/cardapio', (_req, res) => {
  res.json([
    { id: 'carne', nome: 'Carne', preco: 12.0 },
    { id: 'frango', nome: 'Frango', preco: 10.0 },
    { id: 'linguica', nome: 'Linguiça', preco: 10.0 },
  ]);
});

/** Cria um pedido (totem). Pagamento: 'Pix' ou 'Dinheiro' */
rotas.post('/api/pedidos', async (req, res) => {
  try {
    const { nome = '', pagamento, itens = [] } = req.body || {};
    if (!['Pix', 'Dinheiro'].includes(pagamento)) {
      return res.status(400).json({ erro: 'Forma de pagamento inválida (use Pix ou Dinheiro).' });
    }
    const itensValidos = itens.filter((i) => SABORES[i.sabor] && Number(i.quantidade) > 0);
    if (itensValidos.length === 0) {
      return res.status(400).json({ erro: 'Pedido sem itens válidos.' });
    }

    const total = itensValidos.reduce((s, i) => s + SABORES[i.sabor] * Math.floor(i.quantidade), 0);
    const nomeLimpo = String(nome).trim().slice(0, 60) || null;

    const pedido = await consultar(
      `INSERT INTO pedidos (nome, pagamento, total) VALUES ($1, $2, $3) RETURNING id, numero`,
      [nomeLimpo, pagamento, total.toFixed(2)]
    );
    const { id, numero } = pedido.rows[0];

    for (const item of itensValidos) {
      await consultar(
        `INSERT INTO pedido_itens (pedido_id, sabor, preco_unit, quantidade, observacao)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, item.sabor, SABORES[item.sabor].toFixed(2), Math.floor(item.quantidade),
         String(item.observacao || '').trim().slice(0, 120) || null]
      );
    }

    res.status(201).json(await buscarPedidoCompleto(id));
  } catch (erro) {
    console.error('[rasec] erro ao criar pedido:', erro);
    res.status(500).json({ erro: 'Falha ao registrar o pedido no banco de dados.' });
  }
});

/** Status público de um pedido pelo número (para o totem acompanhar) */
rotas.get('/api/pedidos/numero/:numero', async (req, res) => {
  try {
    const r = await consultar(
      `SELECT id FROM pedidos WHERE numero = $1`, [Number(req.params.numero)]
    );
    if (r.rowCount === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(await buscarPedidoCompleto(r.rows[0].id));
  } catch (erro) {
    console.error('[rasec] erro ao consultar pedido:', erro);
    res.status(500).json({ erro: 'Falha na consulta.' });
  }
});

/** QR Code PNG do Pix estático (+ valor) */
rotas.get('/api/pix/qr.png', async (req, res) => {
  try {
    const valor = Math.min(Math.max(Number(req.query.valor) || 0, 0), 99999);
    const payload = gerarPayloadPix(valor);
    const QRCode = (await import('qrcode')).default;
    const png = await QRCode.toBuffer(payload, {
      type: 'png', margin: 1, width: 320,
      color: { dark: '#171310', light: '#f2e8cf' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  } catch (erro) {
    console.error('[rasec] erro ao gerar QR:', erro);
    res.status(500).json({ erro: 'Falha ao gerar QR Code.' });
  }
});

/** Payload copia-e-cola (mesma chave) */
rotas.get('/api/pix/payload', (req, res) => {
  const valor = Math.min(Math.max(Number(req.query.valor) || 0, 0), 99999);
  res.json({ payload: gerarPayloadPix(valor) });
});

rotas.get('/api/health', async (_req, res) => {
  try { await consultar('SELECT 1'); res.json({ ok: true, banco: true }); }
  catch { res.status(503).json({ ok: true, banco: false }); }
});

/* ------------------------------ Admin ---------------------------- */

rotas.post('/api/admin/login', (req, res) => {
  const { senha } = req.body || {};
  if (senha !== config.adminSenha) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  const token = randomBytes(24).toString('hex');
  sessoes.add(token);
  res.setHeader('Set-Cookie', `rasec_admin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  res.json({ ok: true });
});

rotas.post('/api/admin/logout', (req, res) => {
  const token = cookies(req).rasec_admin;
  if (token) sessoes.delete(token);
  res.setHeader('Set-Cookie', 'rasec_admin=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

/** Pedidos (administrativo). ?status=Pendente filtra resultados */
rotas.get('/api/admin/pedidos', exigirAdmin, async (req, res) => {
  try {
    const { status, limite = 100 } = req.query;
    const params = [];
    let filtro = '';
    if (status && STATUS_VALIDOS.includes(status)) {
      params.push(status);
      filtro = `WHERE p.status = $${params.length}`;
    }
    params.push(Math.min(Number(limite) || 100, 300));
    const r = await consultar(
      `SELECT p.id, p.numero, p.nome, p.pagamento, p.status, p.total, p.criado_em,
              COALESCE(json_agg(json_build_object('sabor', i.sabor,
                 'preco_unit', i.preco_unit, 'quantidade', i.quantidade,
                 'observacao', i.observacao) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]')
               AS itens
       FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
       ${filtro}
       GROUP BY p.id ORDER BY p.criado_em DESC LIMIT $${params.length}`,
      params
    );
    res.json(r.rows);
  } catch (erro) {
    console.error('[rasec] erro ao listar pedidos:', erro);
    res.status(500).json({ erro: 'Falha ao listar pedidos.' });
  }
});

/** Atualiza status do pedido */
rotas.patch('/api/admin/pedidos/:id/status', exigirAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }
    const r = await consultar(
      `UPDATE pedidos SET status = $1, atualizado_em = now()
       WHERE id = $2 RETURNING id, numero, status`,
      [status, Number(req.params.id)]
    );
    if (r.rowCount === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(r.rows[0]);
  } catch (erro) {
    console.error('[rasec] erro ao atualizar status:', erro);
    res.status(500).json({ erro: 'Falha ao atualizar status.' });
  }
});

/** Relatórios: período (padrão: últimos 30 dias) */
rotas.get('/api/admin/relatorios', exigirAdmin, async (req, res) => {
  try {
    const { de, ate } = req.query;
    const dataDe = de ? new Date(de) : new Date(Date.now() - 30 * 864e5);
    const dataAte = ate ? new Date(ate + 'T23:59:59Z') : new Date();
    if (isNaN(dataDe) || isNaN(dataAte)) {
      return res.status(400).json({ erro: 'Datas inválidas.' });
    }

    const resumo = await consultar(
      `SELECT COUNT(*) AS total_pedidos, COALESCE(SUM(total),0) AS faturamento,
              COUNT(*) FILTER (WHERE pagamento = 'Pix') AS pag_pix,
              COUNT(*) FILTER (WHERE pagamento = 'Dinheiro') AS pag_dinheiro,
              COUNT(*) FILTER (WHERE status = 'Pendente') AS pendentes,
              COUNT(*) FILTER (WHERE status = 'Em preparo') AS em_preparo,
              COUNT(*) FILTER (WHERE status = 'Pronto') AS prontos,
              COUNT(*) FILTER (WHERE status = 'Entregue') AS entregues
       FROM pedidos WHERE criado_em BETWEEN $1 AND $2`,
      [dataDe, dataAte]
    );

    const porSabor = await consultar(
      `SELECT i.sabor, SUM(i.quantidade) AS quantidade,
              SUM(i.quantidade * i.preco_unit) AS receita
       FROM pedido_itens i
       JOIN pedidos p ON p.id = i.pedido_id
       WHERE p.criado_em BETWEEN $1 AND $2
       GROUP BY i.sabor ORDER BY receita DESC`,
      [dataDe, dataAte]
    );

    const porDia = await consultar(
      `SELECT DATE(criado_em) AS dia, COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
       FROM pedidos WHERE criado_em BETWEEN $1 AND $2
       GROUP BY dia ORDER BY dia DESC LIMIT 30`,
      [dataDe, dataAte]
    );

    res.json({
      periodo: { de: dataDe, ate: dataAte },
      resumo: resumo.rows[0],
      porSabores: porSabor.rows,
      porDia: porDia.rows,
    });
  } catch (erro) {
    console.error('[rasec] erro no relatório:', erro);
    res.status(500).json({ erro: 'Falha ao gerar relatório.' });
  }
});
