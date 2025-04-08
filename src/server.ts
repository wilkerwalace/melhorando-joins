import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 3000;


app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`); // Mostra o ambiente
    console.log(`Acesse: http://localhost:${PORT}`);
});