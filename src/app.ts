import express, { Express, Request, Response, NextFunction } from 'express';
import queryRoutes from './routes/queryRoutes';

const app: Express = express();

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.status(200).send('Você está prestes a fazer o melhor Join da sua vida meu chará \t(̿▀̿‿ ̿▀̿ ̿)');
});


app.use('/api', queryRoutes);


app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Algo deu errado!', message: err.message });
});

export default app;