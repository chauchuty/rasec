// Conexão com Postgres (banco externo) + criação automática do esquema
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

export async function inicializarBanco() {
  const esquema = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'schema.sql'),
    'utf8'
  );
  await pool.query(esquema);
  console.log('[rasec] esquema do banco verificado/criado com sucesso.');
}

/** Executor de consultas parametrizadas */
export const consultar = (sql, params) => pool.query(sql, params);

/** Soma total e itens de um pedido para resposta */
export async function buscarPedidoCompleto(id) {
  const pedido = await consultar(
    `SELECT id, numero, nome, pagamento, status, total, criado_em FROM pedidos WHERE id = $1`,
    [id]
  );
  if (pedido.rowCount === 0) return null;
  const itens = await consultar(
    `SELECT sabor, preco_unit, quantidade, observacao FROM pedido_itens WHERE pedido_id = $1 ORDER BY id`,
    [id]
  );
  return { ...pedido.rows[0], itens: itens.rows };
}
