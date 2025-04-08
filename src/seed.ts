// src/seed.ts
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker/locale/pt_BR';
import fs from 'fs';
import path from 'path';
import { from as copyFrom } from 'pg-copy-streams';
import { Readable } from 'stream';

dotenv.config();

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '5432', 10),
});

const NUM_PACIENTES = 100000;
const NUM_MEDICAMENTOS = 1000;
const MIN_MEDS_POR_PACIENTE = 5;
const MAX_MEDS_POR_PACIENTE = 40;
const PCT_PACIENTES_DROGA_A = 0.15;
const PCT_PACIENTES_DROGA_B = 0.18;
const NOME_DROGA_A = 'DrogaA-Especial';
const NOME_DROGA_B = 'DrogaB-Comum';
const NUM_INTERACOES = 500;


async function executeQuery(client: PoolClient, sql: string, params: any[] = []) {
    try {
        await client.query(sql, params);
    } catch (error) {
        console.error(`Erro executando query: ${sql.substring(0, 100)}...`, error);
        throw error;
    }
}

function streamToPromise(stream: NodeJS.WritableStream): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}


async function seedDatabase() {
    console.log('Iniciando o processo de seeding...');
    const client = await pool.connect();
    console.log('Conexão com o banco de dados estabelecida.');

    try {
        await client.query('BEGIN');
        console.log('Transação iniciada.');

        console.log('Aplicando schema SQL...');
        const schemaSqlPath = path.join(__dirname, '../sql/schema.sql');
        const schemaSql = fs.readFileSync(schemaSqlPath, 'utf-8');
        await executeQuery(client, schemaSql);
        console.log('Schema SQL aplicado com sucesso.');

        console.log(`Gerando ${NUM_MEDICAMENTOS} medicamentos...`);
        const medicamentosGerados: { id: number; nome: string }[] = [];
        let drogaAId: number | null = null;
        let drogaBId: number | null = null;

        const insertMedicamentoQuery = 'INSERT INTO medicamentos (nome) VALUES ($1) RETURNING id, nome';
        let resultA = await client.query(insertMedicamentoQuery, [NOME_DROGA_A]);
        medicamentosGerados.push(resultA.rows[0]);
        drogaAId = resultA.rows[0].id;
        let resultB = await client.query(insertMedicamentoQuery, [NOME_DROGA_B]);
        medicamentosGerados.push(resultB.rows[0]);
        drogaBId = resultB.rows[0].id;

        const medNamesSet = new Set([NOME_DROGA_A, NOME_DROGA_B]);
        let generatedCount = 2;
        while (generatedCount < NUM_MEDICAMENTOS) {
            const nomeMedicamento = `${faker.commerce.productName()} ${faker.string.alphanumeric(4)}`.substring(0, 100); // Limita tamanho
            if (medNamesSet.has(nomeMedicamento)) {
                continue;
            }
            try {
                const res = await client.query(insertMedicamentoQuery, [nomeMedicamento]);
                medicamentosGerados.push(res.rows[0]);
                medNamesSet.add(nomeMedicamento);
                generatedCount++;
            } catch (e: any) {
                if (e.code === '23505') { // GRRRR pra evitar esse erro chato
                    console.warn(`Medicamento duplicado no BD '${nomeMedicamento}', pulando.`);
                    medNamesSet.add(nomeMedicamento);
                } else {
                    throw e;
                }
            }
        }
        console.log(`${medicamentosGerados.length} medicamentos gerados (ID DrogaA: ${drogaAId}, ID DrogaB: ${drogaBId}).`);
        console.log(`Gerando ${NUM_PACIENTES} pacientes...`);
        async function* generatePacientesData() {
            for (let i = 0; i < NUM_PACIENTES; i++) {
                const nomePaciente = faker.person.fullName();
                yield `${nomePaciente.replace(/[\n\t\\]/g, ' ')}\n`;
            }
        }
        const pacientesReadableStream = Readable.from(generatePacientesData());
        const copyPacientesStream = client.query(copyFrom(`COPY pacientes (nome) FROM STDIN WITH (FORMAT text, DELIMITER '\t')`));

        pacientesReadableStream.pipe(copyPacientesStream);
        await streamToPromise(copyPacientesStream);
        const resultPacientes = await client.query('SELECT id FROM pacientes ORDER BY id');
        const pacientesGerados = resultPacientes.rows as { id: number }[];
        console.log(`${pacientesGerados.length} pacientes gerados.`);

        console.log('Gerando associações paciente-medicamentos (usando stream)...');
        const medIds = medicamentosGerados.map(m => m.id);
        let associacoesCount = 0;

        async function* generateAssociationData() {
            for (let i = 0; i < pacientesGerados.length; i++) {
                const paciente = pacientesGerados[i];
                const numMeds = faker.number.int({ min: MIN_MEDS_POR_PACIENTE, max: MAX_MEDS_POR_PACIENTE });
                const medsParaPaciente = new Set<number>();

                if (drogaAId && Math.random() < PCT_PACIENTES_DROGA_A) {
                    medsParaPaciente.add(drogaAId);
                }
                if (drogaBId && Math.random() < PCT_PACIENTES_DROGA_B) {
                    medsParaPaciente.add(drogaBId);
                }

                while (medsParaPaciente.size < numMeds && medsParaPaciente.size < medIds.length) {
                    const randomIndex = faker.number.int({ min: 0, max: medIds.length - 1 });
                    medsParaPaciente.add(medIds[randomIndex]);
                }

                for (const medId of medsParaPaciente) {
                    yield `${paciente.id}\t${medId}\n`;
                    associacoesCount++;
                }

                if ((i + 1) % 10000 === 0) {
                    console.log(`  -> ${i + 1} pacientes processados para associações...`);
                }
            }
        }

        const assocReadableStream = Readable.from(generateAssociationData());
        const copyAssocStream = client.query(copyFrom(`COPY paciente_medicamentos (paciente_id, medicamento_id) FROM STDIN WITH (FORMAT text, DELIMITER '\t')`));

        assocReadableStream.pipe(copyAssocStream);

        await streamToPromise(copyAssocStream);
        console.log(`${associacoesCount} associações paciente-medicamentos geradas via streaming.`);


        console.log(`Gerando ${NUM_INTERACOES} interações medicamentosas...`);
        let interacoesCount = 0;
        const insertInteracaoQuery = 'INSERT INTO interacoes_medicamentosas (med1_id, med2_id, severidade, descricao) VALUES ($1, $2, $3, $4)';
        const severidades: ('Leve' | 'Moderada' | 'Grave')[] = ['Leve', 'Moderada', 'Grave'];
        const interacoesGeradas = new Set<string>();

        if (drogaAId && drogaBId) {
            const id1 = Math.min(drogaAId, drogaBId);
            const id2 = Math.max(drogaAId, drogaBId);
            const key = `${id1}-${id2}`;
            if (!interacoesGeradas.has(key)) {
                const severidadeInteracaoAB = 'Grave';
                const descricaoInteracaoAB = `Interação crítica documentada entre ${NOME_DROGA_A} e ${NOME_DROGA_B}`;
                await executeQuery(client, insertInteracaoQuery, [id1, id2, severidadeInteracaoAB, descricaoInteracaoAB]);
                interacoesGeradas.add(key);
                interacoesCount++;
                console.log(`  -> Interação ${NOME_DROGA_A} <-> ${NOME_DROGA_B} criada.`);
            }
        } else {
            console.warn('IDs da DrogaA ou DrogaB não encontrados, interação específica não pôde ser criada.');
        }

        const maxPossibleInteractions = (medIds.length * (medIds.length - 1)) / 2;
        let attempts = 0;
        const maxAttempts = NUM_INTERACOES * 5;

        while (interacoesCount < NUM_INTERACOES && interacoesGeradas.size < maxPossibleInteractions && attempts < maxAttempts) {
            attempts++;
            const index1 = faker.number.int({ min: 0, max: medIds.length - 1 });
            let index2 = faker.number.int({ min: 0, max: medIds.length - 1 });
            while (index1 === index2) {
                index2 = faker.number.int({ min: 0, max: medIds.length - 1 });
            }

            const id1 = Math.min(medIds[index1], medIds[index2]);
            const id2 = Math.max(medIds[index1], medIds[index2]);
            const key = `${id1}-${id2}`;

            if (!interacoesGeradas.has(key)) {
                const severidade = severidades[faker.number.int({ min: 0, max: 2 })];
                const descricao = `Interação aleatória ${interacoesCount + 1} entre med ${id1} e med ${id2}`;
                try {
                    await executeQuery(client, insertInteracaoQuery, [id1, id2, severidade, descricao]);
                    interacoesGeradas.add(key);
                    interacoesCount++;
                } catch (e: any) {
                    if (e.code === '23505') { // Vai queimando todo o erro desse codigo senhorrrrrrr
                        console.warn(`Erro ao inserir interação ${id1}-${id2} (provável duplicata no BD), pulando.`);
                        interacoesGeradas.add(key);
                    } else {
                        throw e;
                    }
                }
            }

            if (interacoesCount > 0 && interacoesCount % 100 === 0) {
                console.log(`  -> ${interacoesCount} interações geradas...`);
            }
        }
        if (attempts >= maxAttempts && interacoesCount < NUM_INTERACOES) {
            console.warn(`Atingido limite de tentativas (${maxAttempts}) para gerar interações. ${interacoesCount}/${NUM_INTERACOES} geradas.`);
        }
        console.log(`${interacoesCount} interações medicamentosas geradas no total.`);



        await client.query('COMMIT');
        console.log('Transação concluída com sucesso (COMMIT).');

    } catch (error) {
        console.error('ERRO DETECTADO DURANTE SEEDING!');
        try {
            await client.query('ROLLBACK');
            console.log('Transação revertida (ROLLBACK).');
        } catch (rollbackError) {
            console.error('Erro ao tentar reverter a transação:', rollbackError);
        }
        console.error('Erro original:', error);
    } finally {
        client.release();
        console.log('Conexão com o banco de dados liberada.');
        await pool.end();
        console.log('Pool de conexões finalizado.');
        console.log('gostou do script né? Kiba não comédia ୧༼ಠ益ಠ༽︻╦╤─');
    }
}

seedDatabase().catch(err => {
    console.error("Erro fatal não capturado no script de seeding:", err);
    process.exit(1);
});