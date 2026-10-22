-- Esquema do banco RASEC Espetinhos
CREATE TABLE IF NOT EXISTS pedidos (
  id           SERIAL PRIMARY KEY,
  numero       SERIAL NOT NULL UNIQUE,
  nome         TEXT,
  pagamento    TEXT NOT NULL CHECK (pagamento IN ('Pix', 'Dinheiro')),
  status       TEXT NOT NULL DEFAULT 'Pendente'
               CHECK (status IN ('Pendente', 'Em preparo', 'Pronto', 'Entregue')),
  total        NUMERIC(10,2) NOT NULL,
  origem       TEXT NOT NULL DEFAULT 'totem',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id          SERIAL PRIMARY KEY,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  sabor       TEXT NOT NULL CHECK (sabor IN ('carne', 'frango', 'linguica')),
  preco_unit  NUMERIC(10,2) NOT NULL,
  quantidade  INTEGER NOT NULL CHECK (quantidade > 0),
  observacao  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status  ON pedidos (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado  ON pedidos (criado_em);
CREATE INDEX IF NOT EXISTS idx_itens_pedido    ON pedido_itens (pedido_id);
