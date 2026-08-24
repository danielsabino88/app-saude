# Briefing — App de Saúde (v1)

Documento de entrada para o Claude Code. Abra este arquivo na pasta do projeto antes de pedir qualquer código.

Contexto: este app é um dos quatro do ecossistema de pilares. Ele é independente, mas exporta para o cockpit no formato definido em `CONTRATO-DE-DADOS.md`.

---

## 1\. O que este app faz

Dois módulos, e só dois na v1:

**Módulo A — Ciclo de exames e marcadores** Seis grupos acompanhados: cardíaco, cérebro, visão, intestino, fígado/pâncreas/ sangue, coluna e ortopedia. Cada grupo tem uma periodicidade em meses. O app guarda a data do último exame, calcula o vencimento e avisa o que está perto de vencer. É controle de manutenção preventiva, não prontuário clínico.

**Módulo B — Treino, mobilidade e condicionamento** Registro de sessões: musculação, caminhada, natação, artes marciais, pilates, fisioterapia. Cada sessão tem data, modalidade, duração e esforço percebido. O app mede consistência contra a meta semanal.

### Regra de projeto inegociável

O app **registra, calcula prazo e lembra**. Ele nunca interpreta resultado de exame, nunca classifica valor como normal ou alterado, nunca sugere conduta. Quem lê exame é médico. Se algum campo pedir julgamento clínico, ele não entra.

### Fora da v1

Rituais e cuidado mental, estética, integração com wearable, anexo de PDF de exame. Ficam para a v2 — o app precisa nascer usável, não completo.

---

## 2\. Arquivos

O app de saúde é dono de dois arquivos e não escreve em mais nenhum:

dados/

├── saude-registros.json   ← dado bruto, uso interno do app

└── saude.json             ← exportação para o cockpit (contrato)

Sempre que um registro é salvo, os dois são regravados.

### `saude-registros.json`

{

  "config": {

    "meta\_capacidade\_semanal": 4,

    "meta\_mobilidade\_semanal": 2

  },

  "grupos": \[

    {

      "id": "cardiaco",

      "nome": "Cardíaco",

      "periodicidade\_meses": 12,

      "ultimo\_exame": "2026-02-10",

      "nota": "rotina anual"

    }

  \],

  "sessoes": \[

    {

      "data": "2026-08-10",

      "modalidade": "natacao",

      "categoria": "capacidade",

      "duracao\_min": 40,

      "esforco": 3,

      "nota": ""

    }

  \]

}

`categoria` só aceita `capacidade` (musculação, caminhada, natação, artes marciais) ou `mobilidade` (pilates, fisioterapia). É essa divisão que alimenta os dois indicadores.

### `saude.json` (gerado, nunca editado à mão)

Formato exato do `CONTRATO-DE-DADOS.md`, com três indicadores:

| id | valor | meta |
| :---- | :---- | :---- |
| `consistencia_treino` | sessões de capacidade na semana corrente | `meta_capacidade_semanal` |
| `mobilidade` | sessões de mobilidade na semana corrente | `meta_mobilidade_semanal` |
| `exames_em_dia` | grupos não vencidos | total de grupos |

**Score de saúde:**

score \= (consistencia × 0,50 \+ mobilidade × 0,25 \+ exames × 0,25) × 100

Cada parcela é o atingimento limitado a 1,0. Arredondar para inteiro.

`score_semanal` guarda o histórico: ao virar a semana (segunda-feira), o app fecha a semana anterior e adiciona a entrada no padrão ISO `AAAA-Wnn`.

`marcos` é gerado automaticamente: cada grupo vencido ou vencendo nos próximos 90 dias vira um marco com título "Renovar exame — " e a data de vencimento.

---

## 3\. Telas

**Registrar** (tela inicial) — formulário curto de sessão: modalidade, duração, esforço, data já preenchida com hoje. Salvar em menos de dez segundos.

**Semana** — as sessões dos últimos sete dias, as duas metas com barra de progresso e o score corrente.

**Exames** — os seis grupos em lista, ordenados por proximidade do vencimento, com o status colorido (em dia / vence em breve / vencido) e um campo pra atualizar a data do último exame.

**Histórico** — sessões por mês e a curva de score semanal.

---

## 4\. Base técnica

HTML, CSS e JavaScript puros, um arquivo só, sem build e sem framework — mesma linguagem do cockpit, e você consegue abrir e entender o arquivo inteiro.

Para gravar direto na pasta sincronizada, use a **File System Access API** (`showDirectoryPicker`). O usuário aponta a pasta `Quatro Pilares` uma vez; o handle fica guardado no IndexedDB e nas próximas aberturas o app só pede a confirmação de permissão. Sem servidor, sem upload, dado sempre em arquivo aberto na pasta dele.

Limitação a declarar na interface: funciona no Chrome e no Edge no computador. Firefox e Safari não implementam essa API. Como o registro é feito no computador, isso não bloqueia o uso.

Se a API não estiver disponível, o app cai num modo degradado: continua funcionando na sessão e oferece botão de baixar os dois JSON pra salvar na mão.

---

## 5\. Prompt de abertura para o Claude Code

> Leia `BRIEFING-APP-SAUDE.md` e `CONTRATO-DE-DADOS.md` nesta pasta. Construa o app de saúde descrito no briefing como um único arquivo `app-saude.html`, em HTML/CSS/JS puros, sem framework e sem build. Use a File System Access API para ler e gravar `dados/saude-registros.json` e `dados/saude.json` na pasta escolhida pelo usuário, guardando o handle no IndexedDB. Implemente as quatro telas na ordem descrita e a fórmula de score exatamente como está no briefing. Comece me mostrando a estrutura de funções que você pretende criar, antes de escrever o código completo. Não implemente nada da seção "Fora da v1".

---

## 6\. Critérios de aceite

- [ ] Registro de uma sessão em menos de dez segundos, sem tirar a mão do teclado  
- [ ] Os dois JSON são regravados a cada salvamento  
- [ ] O `saude.json` abre corretamente no `cockpit.html` e o anel de Saúde acende  
- [ ] Grupo vencido aparece destacado na tela de Exames e vira marco no cockpit  
- [ ] Fechar o navegador e reabrir não perde a pasta escolhida nem os dados  
- [ ] Nenhuma tela emite juízo sobre resultado de exame

