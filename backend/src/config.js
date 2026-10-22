// Configuração lida das variáveis de ambiente (com defaults seguros p/ dev)
export const config = {
  porta: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rasec',
  adminSenha: process.env.ADMIN_SENHA || 'rasec123',
  pix: {
    chave: process.env.PIX_CHAVE || '+5542999999999',
    recebedor: process.env.PIX_RECEBEDOR || 'RASEC ESPETINHOS',
    cidade: process.env.PIX_CIDADE || 'GUARAPUAVA',
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://127.0.0.1:8091,http://localhost:8091')
    .split(',').map((o) => o.trim()).filter(Boolean),
};
