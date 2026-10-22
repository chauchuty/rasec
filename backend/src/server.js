// Servidor HTTP da API do RASEC Espetinhos
import express from 'express';
import { config } from './config.js';
import { inicializarBanco } from './db.js';
import { rotas } from './rotas.js';

const app = express();

// CORS restrito às origens do frontend
app.use((req, res, next) => {
  const origem = req.headers.origin;
  if (origem && config.corsOrigins.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '32kb' }));
app.use(rotas);

// O servidor sobe mesmo sem conexão ao banco (modo degradado):
// o health avisa e os pedidos retornam 500 até o Postgres responder.
inicializarBanco()
  .then(() => console.log('[rasec] banco Postgres conectado.'))
  .catch((erro) => {
    console.error('[rasec] sem conexão ao Postgres:', erro.message);
    console.error('Verifique DATABASE_URL no arquivo .env (copie .env.example).');
    console.error('A API seguirá degradada até o banco ficar disponível.');
    // Retenta a cada 30 s — útil quando o banco externo volta ao ar
    const revalidar = setInterval(() => {
      inicializarBanco()
        .then(() => { console.log('[rasec] banco reconectado!'); clearInterval(revalidar); })
        .catch(() => null);
    }, 30000);
  })
  .finally(() => {
    app.listen(config.porta, () =>
      console.log(`[rasec] API em http://127.0.0.1:${config.porta}`)
    );
  });
