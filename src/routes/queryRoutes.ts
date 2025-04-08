import { Router } from 'express';
import { getResultadoJoinPadrao, getResultadoBuscaExpansao } from '../controllers/queryController';

const router = Router();

// Rota para executar a consulta com JOIN padrão
router.get('/join-padrao', getResultadoJoinPadrao);

// Rota para executar a consulta com a abordagem Busca & Expansão
router.get('/busca-expansao-join', getResultadoBuscaExpansao);

export default router;