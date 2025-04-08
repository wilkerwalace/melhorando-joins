
-- sql/schema.sql


DROP TABLE IF EXISTS interacoes_medicamentosas CASCADE;
DROP TABLE IF EXISTS paciente_medicamentos CASCADE;
DROP TABLE IF EXISTS medicamentos CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;

CREATE TABLE pacientes (
                           id SERIAL PRIMARY KEY,
                           nome VARCHAR(100) NOT NULL
);


CREATE TABLE medicamentos (
                              id SERIAL PRIMARY KEY,
                              nome VARCHAR(100) NOT NULL UNIQUE
);


CREATE TABLE paciente_medicamentos (
                                       paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
                                       medicamento_id INTEGER NOT NULL REFERENCES medicamentos(id) ON DELETE CASCADE,
                                       data_prescricao DATE DEFAULT CURRENT_DATE,
                                       PRIMARY KEY (paciente_id, medicamento_id)
);


CREATE TABLE interacoes_medicamentosas (
                                           med1_id INTEGER NOT NULL REFERENCES medicamentos(id) ON DELETE CASCADE,
                                           med2_id INTEGER NOT NULL REFERENCES medicamentos(id) ON DELETE CASCADE,
                                           severidade VARCHAR(50) NOT NULL CHECK (severidade IN ('Leve', 'Moderada', 'Grave')),
                                           descricao TEXT,
                                           PRIMARY KEY (med1_id, med2_id),
                                           CHECK (med1_id < med2_id)
);


CREATE INDEX idx_paciente_medicamentos_paciente ON paciente_medicamentos(paciente_id);
CREATE INDEX idx_paciente_medicamentos_medicamento ON paciente_medicamentos(medicamento_id);
CREATE INDEX idx_interacoes_medicamentosas_med1 ON interacoes_medicamentosas(med1_id);
CREATE INDEX idx_interacoes_medicamentosas_med2 ON interacoes_medicamentosas(med2_id);
CREATE INDEX idx_medicamentos_nome ON medicamentos(nome);

