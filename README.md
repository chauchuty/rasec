# RASEC Espetinhos — Totem PWA + Painel Administrativo

Totem de autoatendimento (PWA) e painel administrativo para venda de espetinhos:
**carne (R$ 12,00)**, **frango (R$ 10,00)** e **linguiça (R$ 10,00)**.
Estética baseada no `banner.png` (creme vintage, preto carvão, vermelho vibrante).

## Arquitetura

```
frontend/            ← interface (PWA)
  totem/               totem de autoatendimento (instalável, offline)
  admin/               painel administrativo (pedidos + relatórios)
backend/             ← API REST (Node + Express + Postgres)
  src/server.js        boot do servidor
  src/rotas.js         endpoints públicos e administrativos
  src/db.js            conexão com Postgres (pg) e esquema automático
  src/pix.js           BR Code (Pix copia-e-cola + CRC16)
  sql/schema.sql       DDL: pedidos + pedido_itens
servidor.cjs         servidor estático do frontend (dev, porta 8091)
```

## Como rodar (desenvolvimento)

**1. Backend** — configure o banco e instale:

```sh
cd backend
copy .env.example .env        # edite DATABASE_URL com o Postgres externo
npm install
npm start                     # API em http://127.0.0.1:3000
```

O esquema (`pedidos`, `pedido_itens`) é criado automaticamente no boot.
A senha do painel e os dados Pix ficam no `.env` (`ADMIN_SENHA`, `PIX_CHAVE`…).

**2. Frontend** — na raiz do projeto:

```sh
npm start                     # http://127.0.0.1:8091
```

- Totem: **http://127.0.0.1:8091**
- Painel: **http://127.0.0.1:8091/admin**

## Funcionalidades

### Totem (PWA)
- Cardápio com quantidade + observação por item
- Carrinho flutuante e checkout: nome (opcional) e **Pix ou Dinheiro**
- **Pix**: exibe QR Code estático (chave `+5542999999999`) + botão copiar código;
  não há integração de confirmação — o cliente **apresenta o comprovante**
- Pedido gravado no **Postgres** via API; sem conexão, cai em fila offline local
- "Meus pedidos" com status em tempo real (consultado no banco)
- Instalável (manifest + ícones), service worker com precache e página offline

### Painel administrativo (`/admin`)
- Login por senha (`ADMIN_SENHA`, padrão `rasec123` — sessão por cookie HttpOnly)
- **Pedidos**: lista com filtros por status (Pendente / Em preparo / Pronto / Entregue),
  atualização automática a cada 15 s e botão "Avançar status"
- **Relatórios**: período personalizável — faturamento, totais por forma de pagamento,
  quantidade/receita por sabor e vendas por dia

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/cardapio` | Sabores e preços |
| POST | `/api/pedidos` | Cria pedido (`{nome?, pagamento: 'Pix'\|'Dinheiro', itens[]}`) |
| GET | `/api/pedidos/numero/:numero` | Status público do pedido |
| GET | `/api/pix/qr.png?valor=` | QR Code PNG do Pix com valor |
| GET | `/api/pix/payload?valor=` | Código copia-e-cola |
| GET | `/api/health` | Saúde da API e do banco |
| POST | `/api/admin/login` | Login do painel (`{senha}`) |
| POST | `/api/admin/logout` | Encerra sessão |
| GET | `/api/admin/pedidos?status=&limite=` | Lista pedidos (requer sessão) |
| PATCH | `/api/admin/pedidos/:id/status` | Atualiza status |
| GET | `/api/admin/relatorios?de=&ate=` | Relatórios do período |

## Observações

- Service worker e instalação exigem **HTTPS ou localhost**.
- Em produção, coloque frontend e API no mesmo domínio (o frontend detecta a porta
  8091 no dev; fora dela, usa caminhos relativos `./api/...`).
- O CORS é restrito às origens em `CORS_ORIGINS`.
