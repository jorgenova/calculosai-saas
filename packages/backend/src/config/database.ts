import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL_APP,
});

db.on('error', (err) => {
  console.error('Erro inesperado no pool do banco:', err);
});