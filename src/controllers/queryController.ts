import { Request, Response } from 'express';
import { query as dbQuery } from '../config/database';
import { QueryResultRow } from 'pg';


interface Paciente {
    id: number;
    nome: string;
}

/**
 * Controlador para a rota de JOIN Padrão.
 * Encontra pacientes que tomam duas drogas específicas que interagem,
 * usando uma única query com múltiplos JOINs.
 */
export const getResultadoJoinPadrao = async (req: Request, res: Response): Promise<void> => {
    const { droga1, droga2 } = req.query;

    // Validação básica dos parâmetros
    if (!droga1 || !droga2 || typeof droga1 !== 'string' || typeof droga2 !== 'string') {
        res.status(400).json({ error: 'Parâmetros droga1 e droga2 (strings) são obrigatórios.' });
        return;
    }
    if (droga1 === droga2) {
        res.status(400).json({ error: 'Os nomes das drogas devem ser diferentes.' });
        return;
    }


    console.log(`Executando JOIN Padrão para: ${droga1} e ${droga2}`);
    const startTime = performance.now();

    // Query SQL com múltiplos JOINs
    // 1. Encontra o ID da droga1 e junta com paciente_medicamentos (pm1)
    // 2. Junta com pacientes (p)
    // 3. Junta novamente paciente_medicamentos (pm2) para o mesmo paciente
    // 4. Encontra o ID da droga2 e junta com pm2
    // 5. Junta com interacoes_medicamentosas para verificar se m1 e m2 interagem
    // 6. Usa DISTINCT para evitar retornar o mesmo paciente múltiplas vezes se houver outras condições
    const sqlQuery = `
        SELECT DISTINCT p.id, p.nome
        FROM pacientes p
                 JOIN paciente_medicamentos pm1 ON p.id = pm1.paciente_id
                 JOIN medicamentos m1 ON pm1.medicamento_id = m1.id AND m1.nome = $1
                 JOIN paciente_medicamentos pm2 ON p.id = pm2.paciente_id -- Junta de novo no mesmo paciente
                 JOIN medicamentos m2 ON pm2.medicamento_id = m2.id AND m2.nome = $2
                 JOIN interacoes_medicamentosas mi
                      ON (mi.med1_id = m1.id AND mi.med2_id = m2.id)
                          OR (mi.med1_id = m2.id AND mi.med2_id = m1.id)
        WHERE m1.id <> m2.id;
    `;
    try {
        const result = await dbQuery(sqlQuery, [droga1, droga2]);
        const endTime = performance.now();
        const tempoExecucaoMs = endTime - startTime;

        res.status(200).json({
            description: `Resultado da consulta JOIN Padrão para '${droga1}' e '${droga2}'`,
            approach: 'Standard JOIN',
            tempoExecucaoMs: parseFloat(tempoExecucaoMs.toFixed(2)),
            rowCount: result.rowCount, // Número de pacientes encontrados
            data: result.rows as Paciente[], // Tipa o resultado
        });

    } catch (error: any) {
        console.error('Erro na consulta JOIN Padrão:', error);
        res.status(500).json({
            error: 'Erro interno do servidor ao processar a consulta padrão.',
            details: error.message
        });
    }
};

/**
 * Controlador para a rota de Busca & Expansão.
 * Simula a abordagem encontrando pacientes que tomam duas drogas que interagem,
 * quebrando a lógica em múltiplos passos e queries menores.
 */
export const getResultadoBuscaExpansao = async (req: Request, res: Response): Promise<void> => {
    const { droga1, droga2 } = req.query;

    // Validação básica dos parâmetros
    if (!droga1 || !droga2 || typeof droga1 !== 'string' || typeof droga2 !== 'string') {
        res.status(400).json({ error: 'Parâmetros droga1 e droga2 (strings) são obrigatórios.' });
        return;
    }
    if (droga1 === droga2) {
        res.status(400).json({ error: 'Os nomes das drogas devem ser diferentes.' });
        return;
    }

    console.log(`Executando Busca & Expansão para: ${droga1} e ${droga2}`);
    const startTime = performance.now();
    let med1_id: number | null = null;
    let med2_id: number | null = null;
    let pacientesDroga1 = new Set<number>();
    let pacientesDroga2 = new Set<number>();
    let pacientesIntersecao: number[] = [];
    let resultadoFinal: Paciente[] = [];
    let executionSuccessful = true;

    try {
        const medsResult = await dbQuery('SELECT id, nome FROM medicamentos WHERE nome = $1 OR nome = $2', [droga1, droga2]);
        if ((medsResult.rowCount ?? 0) < 2) {
            console.log(`  -> Aviso: Uma ou ambas as drogas ('${droga1}', '${droga2}') não foram encontradas.`);
            executionSuccessful = false; // Meu chapa, se voce esta lendo isso, saiba que isso é um POG pensado,
            // pois temos que mostrar o tempo da query mesmo se nao tiver resultado
            // na producao com certeza o fluxo acabaria aqui
            // entao fica tranquilo e curte o 200 erro ocorrido com sucesso.	(づ ￣ ³￣)づ
        } else {
            medsResult.rows.forEach(row => {
                if (row.nome === droga1) med1_id = row.id;
                if (row.nome === droga2) med2_id = row.id;
            });
            if (!med1_id || !med2_id) {
                console.warn(`  -> Inconsistência ao buscar IDs para ${droga1}, ${droga2}.`);
                executionSuccessful = false;
            } else {
                console.log(`  -> IDs encontrados: ${droga1}=${med1_id}, ${droga2}=${med2_id}`);
            }
        }

        if (executionSuccessful) {
            const idMenor = Math.min(med1_id!, med2_id!);
            const idMaior = Math.max(med1_id!, med2_id!);
            const interacaoResult = await dbQuery(
                'SELECT 1 FROM interacoes_medicamentosas WHERE med1_id = $1 AND med2_id = $2 LIMIT 1',
                [idMenor, idMaior]
            );

            if (interacaoResult.rowCount === 0) {
                console.log(`  -> Nenhuma interação encontrada entre ${droga1} e ${droga2}.`);
                executionSuccessful = false;
            } else {
                console.log(`  -> Interação confirmada entre ${droga1} e ${droga2}.`);

                const pacientes1Result = await dbQuery('SELECT paciente_id FROM paciente_medicamentos WHERE medicamento_id = $1', [med1_id!]);
                pacientes1Result.rows.forEach((row: QueryResultRow) => pacientesDroga1.add(row.paciente_id));
                console.log(`  -> ${pacientesDroga1.size} pacientes encontrados para ${droga1}.`);

                if (pacientesDroga1.size === 0) {
                    executionSuccessful = false;
                }
            }
        }

        if (executionSuccessful) {
            const pacientes2Result = await dbQuery('SELECT paciente_id FROM paciente_medicamentos WHERE medicamento_id = $1', [med2_id!]);
            pacientes2Result.rows.forEach((row: QueryResultRow) => pacientesDroga2.add(row.paciente_id));
            console.log(`  -> ${pacientesDroga2.size} pacientes encontrados para ${droga2}.`);

            if (pacientesDroga2.size === 0) {
                console.log(`  -> Nenhum paciente encontrado para ${droga2}. Interseção será vazia.`);
            }
        }

        if (executionSuccessful) {
            if (pacientesDroga1.size > 0 && pacientesDroga2.size > 0) {
                console.log('  -> Calculando interseção dos pacientes...');
                if (pacientesDroga1.size < pacientesDroga2.size) {
                    pacientesDroga1.forEach(id => {
                        if (pacientesDroga2.has(id)) {
                            pacientesIntersecao.push(id);
                        }
                    });
                } else {
                    pacientesDroga2.forEach(id => {
                        if (pacientesDroga1.has(id)) {
                            pacientesIntersecao.push(id);
                        }
                    });
                }
                console.log(`  -> ${pacientesIntersecao.length} pacientes encontrados na interseção.`);
            } else {
                console.log('  -> Um dos conjuntos de pacientes estava vazio, interseção é vazia.');
            }


            if (pacientesIntersecao.length > 0) {
                console.log('  -> Buscando detalhes dos pacientes da interseção...');
                const detalhesResult = await dbQuery(
                    'SELECT id, nome FROM pacientes WHERE id = ANY($1::int[])',
                    [pacientesIntersecao]
                );
                resultadoFinal = detalhesResult.rows as Paciente[];
                console.log(`  -> ${resultadoFinal.length} detalhes de pacientes recuperados.`);
            } else {
                console.log('  -> Interseção vazia, não é necessário buscar detalhes.');
            }
        }

        const endTime = performance.now();
        const tempoExecucaoMs = endTime - startTime;

        res.status(200).json({
            description: `Resultado da consulta Busca & Expansão para '${droga1}' e '${droga2}'`,
            approach: 'Lookup & Expand',
            tempoExecucaoMs: parseFloat(tempoExecucaoMs.toFixed(2)),
            rowCount: resultadoFinal.length,
            data: resultadoFinal,
        });


    } catch (error: any) {
        console.error('Erro inesperado na consulta Busca & Expansão:', error);
        res.status(500).json({
            error: 'Erro interno inesperado do servidor ao processar a consulta busca & expansão.',
            details: error.message
        });
    }
};