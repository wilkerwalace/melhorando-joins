import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config(); 

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
    console.error('Erro inesperado no cliente ocioso do pool', err);
    process.exit(-1);
});
console.log('Pool de conexões PostgreSQL configurado.');
export const query = async (text: string, params?: any[]) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Query executada:', { text, duration: `${duration}ms`, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Erro ao executar query:', { text });
        throw error;
    }
};

export default pool;