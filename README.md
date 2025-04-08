# Otimização de JOINs SQL com Node.js e PostgreSQL 🚀

Este projeto demonstra a diferença de desempenho entre duas abordagens para resolver uma consulta SQL complexa que envolve múltiplos JOINs, focando no "problema do diamante".

1.  **JOIN Padrão:** A forma tradicional, usando uma única query SQL com vários `JOIN`s.
2.  **Busca & Expansão (Simulada):** Uma abordagem que quebra a consulta em múltiplos passos (queries menores), filtrando dados mais cedo para evitar a criação de resultados intermediários gigantescos.

A aplicação é construída com Node.js, TypeScript, Express e se conecta a um banco de dados PostgreSQL.

## O Problema 🧐

Consultas que precisam relacionar múltiplas tabelas (ex: Pacientes -> Medicamentos Tomados -> Interações Medicamentosas) podem ficar muito lentas. Isso acontece porque o banco de dados, ao fazer os JOINs, pode gerar temporariamente um número enorme de combinações de linhas, mesmo que o resultado final seja pequeno. É o "problema do diamante": entra pouco dado, explode no meio, sai pouco dado.

## A Abordagem Alternativa ✨

A técnica simulada aqui (Busca & Expansão) tenta ser mais inteligente:

1.  **Busca (Lookup):** Faz pequenas consultas para verificar pré-condições (Ex: As drogas existem? Elas interagem?) e buscar conjuntos iniciais de IDs (Ex: Quais pacientes tomam a Droga A?).
2.  **Filtra/Processa:** Realiza operações na aplicação (Ex: Encontrar a interseção dos pacientes que tomam Droga A *E* Droga B).
3.  **Expande (Expand):** Só no final, busca os detalhes completos (Ex: Nome e ID) apenas para os itens que realmente passaram por todos os filtros.

Isso evita que o banco de dados faça o trabalho pesado de combinar milhões de linhas desnecessárias.

## Pré-requisitos 🛠️

Antes de começar, garanta que você tenha instalado:

*   **Node.js:** Versão 18 ou superior.
*   **npm** ou **yarn:** Gerenciador de pacotes do Node.js.
*   **Docker e Docker Compose:** Para rodar o banco de dados PostgreSQL facilmente em um container. (É a forma recomendada!).
*   **VS Code** (Opcional, mas recomendado): Editor de código.
*   **Extensão VS Code: REST Client** (Importante!): Para executar o arquivo `requests.http` e testar a API diretamente do editor.
    *   Instale aqui: [REST Client - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)

## Como Configurar o Projeto ⚙️

1.  **Clone o Repositório:**
    ```bash
    git clone https://github.com/wilkerwalace/melhorando-joins
    cd <lembrar de por depois>
    ```

2.  **Instale as Dependências:**
    ```bash
    npm install
    ```
    *(ou `yarn install` se você usa Yarn)*

3.  **Configure as Variáveis de Ambiente:**
    *   Copie o arquivo `.env.example` para um novo arquivo chamado `.env`:
        ```bash
        cp .env.example .env
        ```
    *   Abra o arquivo `.env` e **verifique/ajuste** as credenciais do banco de dados (`PGUSER`, `PGPASSWORD`, etc.) se você *não* estiver usando os padrões definidos no `docker-compose.yml`. Para rodar com Docker, os padrões geralmente funcionam.
    *   **Importante:** O arquivo `.env` não deve ser enviado para o controle de versão (Git)!

## Como Rodar (Passo a Passo) ▶️

Siga esta sequência para colocar tudo no ar:

1.  **Inicie o Banco de Dados (Docker):**
    *   No terminal, na raiz do projeto, execute:
        ```bash
        docker-compose up -d
        ```
    *   Isso vai baixar a imagem do PostgreSQL (se ainda não tiver) e iniciar o container em segundo plano (`-d`). Aguarde alguns segundos para o banco inicializar completamente.

2.  **Popule o Banco de Dados (Seeding):**
    *   Execute o script que cria as tabelas e insere *MUITOS* dados de exemplo:
        ```bash
        npm run db:seed
        ```
    *   ⚠️ **Atenção:** Este comando pode levar **vários minutos** para completar, dependendo da sua máquina! Ele vai gerar centenas de milhares de registros. Acompanhe o progresso pelo console.

3.  **Inicie a Aplicação Node.js (Modo Desenvolvimento):**
    *   Execute o comando:
        ```bash
        npm run dev
        ```
    *   Isso iniciará o servidor usando `nodemon` e `ts-node`. O `nodemon` ficará observando por alterações nos arquivos `*.ts` dentro de `src/` e reiniciará o servidor automaticamente.
    *   Você deverá ver mensagens indicando que o servidor está rodando, geralmente em `http://localhost:3000` (ou a porta definida no `.env`).

## Testando a API 🧪

Com o servidor rodando e o banco populado:

1.  Abra o arquivo `requests.http` no VS Code.
2.  Certifique-se de ter a extensão **REST Client** instalada.
3.  Você verá links "Send Request" acima de cada bloco de requisição HTTP no arquivo.
4.  **Execute os Testes Principais:**
    *   Clique em "Send Request" para a `Consulta usando JOIN Padrão`. Observe a resposta e o campo `tempoExecucaoMs`.
    *   Clique em "Send Request" para a `Consulta usando Busca & Expansão` (com as mesmas drogas). Observe a resposta.
5.  **Compare:**
    *   O `data` (a lista de pacientes) deve ser **idêntico** entre as duas respostas.
    *   O `tempoExecucaoMs` da abordagem "Busca & Expansão" deve ser **significativamente menor** que o do "JOIN Padrão". Essa é a demonstração!
6.  **Execute os Testes Adicionais:** Teste os outros cenários (drogas sem interação, mesma droga, parâmetros faltando) para ver como a API responde.

## Parando Tudo 🛑

Quando terminar os testes:

1.  Pare o servidor Node.js no terminal pressionando `Ctrl + C`.
2.  Pare e remova o container do banco de dados Docker:
    ```bash
    docker-compose down
    ```
    *(Isso não apaga o volume `postgres_dados_ts`, então se você rodar `docker-compose up -d` de novo, os dados do seed ainda estarão lá. Para apagar tudo, use `docker-compose down -v`)*.

---

Com esses dois arquivos, qualquer pessoa (incluindo você no futuro!) conseguirá configurar, popular e testar facilmente a demonstração para observar o impacto da otimização de JOIN.
