# Plano de Construção — App de Saúde e Treino

**Pilar Saúde do ecossistema pessoal** Autor do plano: definido em chat · Execução: Claude Code Versão 1.0

---

## 0\. Como usar este plano

Este arquivo é o contrato entre você e o Claude Code. O fluxo é sempre o mesmo:

1. Salve este arquivo na raiz do repositório como `PLANO.md`.  
2. Abra o Claude Code na pasta do projeto.  
3. Execute **uma fase por vez**, colando o prompt da fase.  
4. Ao final de cada fase, valide o critério de aceite e faça o commit.  
5. Só depois passe para a fase seguinte.

>   
> **Regra de ouro:** nunca peça duas fases no mesmo prompt. Cada fase termina com o app funcionando. Se uma fase quebrar o app, o `git revert` te devolve o estado anterior.

---

## 1\. Decisões de arquitetura

### 1.1 O que muda em relação ao CRM e ao Orçamento

Seus apps anteriores rodam como arquivo local no Mac. **Isso não funciona no iPhone.** O iOS não abre `file://` como aplicativo, não instala PWA sem HTTPS e não te dá acesso ao sistema de arquivos.

A mudança é uma só, e é a mais importante do plano:

|  | CRM / Orçamento | App de Saúde |
| :---- | :---- | :---- |
| Entrega | Arquivo `.html` no Mac | Site estático em HTTPS |
| Hospedagem | Nenhuma | GitHub Pages (grátis) |
| Instalação | LaunchAgent \+ Dock | PWA — "Adicionar à Tela de Início" |
| Dados | Arquivo local | IndexedDB no aparelho \+ sync no Drive |
| Dispositivos | Mac | Mac, iPad e iPhone |

**Analogia:** o CRM é um caderno na sua mesa — perfeito enquanto você trabalha ali. O app de saúde precisa ser um caderno de bolso que também existe na mesa. A única forma de o mesmo caderno estar nos dois lugares é ele morar numa prateleira comum (o Drive) e cada aparelho ter uma cópia sincronizada.

### 1.2 Princípios

- **Offline-first.** Academia tem sinal ruim. O app grava local sempre; sincroniza quando puder.  
- **Registro em menos de 20 segundos.** Se o registro do treino der trabalho, o histórico morre em três semanas e o relatório fica sem matéria-prima.  
- **Sem build.** Mesmo padrão dos outros apps: HTML/CSS/JS vanilla, scripts em sequência, sem npm, sem bundler.  
- **Bibliotecas locais, não CDN.** Offline exige que tudo esteja no repositório (`assets/vendor/`).  
- **Compatível com o cockpit.** O JSON exportado segue o mesmo data contract dos outros pilares.

### 1.3 Stack

- HTML5 \+ CSS puro \+ JavaScript vanilla (ES modules não — scripts em sequência, como no Orçamento)  
- **IndexedDB** para persistência local (não use `localStorage`: limite baixo e o Safari descarta com mais facilidade)  
- **Service Worker** \+ `manifest.json` para PWA  
- **Chart.js** vendorizado em `assets/vendor/` (ou reaproveite a camada `graficos` do Orçamento, se ela já resolver linha \+ barra \+ dispersão)  
- **Google Drive API** para sync, reaproveitando o módulo de criptografia AES-GCM que você já escreveu no CRM  
- **GitHub Pages** para hospedagem

### 1.4 Estrutura de pastas

app-saude/

├── index.html

├── manifest.json

├── sw.js

├── PLANO.md

├── CLAUDE.md

├── assets/

│   ├── estilo.css

│   ├── icones/

│   │   ├── icone-180.png

│   │   ├── icone-192.png

│   │   └── icone-512.png

│   └── vendor/

│       └── chart.umd.js

└── js/

    ├── util.js          \# datas, formatação, ids, validação

    ├── schema.js        \# definição das entidades e migrações

    ├── dados.js         \# camada IndexedDB (CRUD)

    ├── sync.js          \# Google Drive \+ AES-GCM

    ├── motor.js         \# métricas derivadas

    ├── insights.js      \# regras de leitura dos dados

    ├── graficos.js      \# renderização

    ├── telas/

    │   ├── hoje.js

    │   ├── peso.js

    │   ├── medidas.js

    │   ├── marcadores.js

    │   ├── treino.js

    │   ├── metas.js

    │   ├── relatorio.js

    │   └── config.js

    └── app.js           \# roteamento e boot via App.iniciar()

---

## 2\. Contrato de dados

Tudo é JSON. Um arquivo único por usuário, versionado, exportável.

### 2.1 Envelope

{

  "versaoSchema": 1,

  "pilar": "saude",

  "atualizadoEm": "2026-08-23T14:30:00-03:00",

  "dispositivoOrigem": "iphone",

  "perfil": { "alturaCm": 178, "nascimento": "1990-01-01", "sexo": "M" },

  "catalogoMarcadores": \[\],

  "catalogoExercicios": \[\],

  "registrosPeso": \[\],

  "registrosMedidas": \[\],

  "registrosMarcadores": \[\],

  "treinos": \[\],

  "metas": \[\]

}

### 2.2 Peso

{

  "id": "pes\_01J...",

  "dataHora": "2026-08-23T06:10:00-03:00",

  "pesoKg": 84.2,

  "gorduraPct": 21.4,

  "massaMagraKg": null,

  "contexto": "jejum",

  "obs": ""

}

`contexto`: `jejum` | `manha` | `tarde` | `noite` | `pos_treino` Registrar o contexto é o que separa dado de ruído — 800 g de diferença entre manhã e noite é água, não gordura.

### 2.3 Medidas corporais

{

  "id": "med\_01J...",

  "dataHora": "2026-08-23T06:20:00-03:00",

  "medidas": {

    "pescoco": 39.0,

    "toraxPeito": 102.0,

    "cintura": 88.5,

    "abdomen": 92.0,

    "quadril": 100.0,

    "bracoRelaxadoD": 34.0, "bracoRelaxadoE": 33.5,

    "bracoContraidoD": 36.5, "bracoContraidoE": 36.0,

    "antebracoD": 29.0, "antebracoE": 28.8,

    "coxaD": 58.0, "coxaE": 57.5,

    "panturrilhaD": 38.0, "panturrilhaE": 37.8

  },

  "obs": ""

}

Todos os campos opcionais — registre só o que mediu. Unidade padrão: cm.

### 2.4 Marcadores (tabela genérica)

Em vez de criar um campo por marcador, use um **catálogo configurável**. Assim você adiciona qualquer marcador novo (de exame ou de aparelho) sem mexer no código.

// catalogoMarcadores

{

  "codigo": "glicemia",

  "nome": "Glicemia",

  "unidade": "mg/dL",

  "casasDecimais": 0,

  "contextos": \["jejum", "pos\_prandial", "aleatorio"\],

  "faixaReferencia": { "min": null, "max": null },

  "direcaoDesejada": "manter"

}

// registrosMarcadores

{

  "id": "mar\_01J...",

  "dataHora": "2026-08-23T07:00:00-03:00",

  "codigo": "glicemia",

  "valor": 94,

  "contexto": "jejum",

  "origem": "aparelho",

  "obs": ""

}

`origem`: `aparelho` | `exame_laboratorio` | `manual` `faixaReferencia` fica em branco por padrão. Preencha com os valores que **o seu médico** definir — o app é registro e acompanhamento pessoal, não interpretação clínica.

### 2.5 Treino (híbrido)

{

  "id": "tre\_01J...",

  "inicio": "2026-08-23T18:05:00-03:00",

  "fim": "2026-08-23T19:12:00-03:00",

  "duracaoMin": 67,

  "tipo": "forca",

  "foco": \["peito", "triceps"\],

  "local": "academia",

  "descricao": "Supino reto pesado, crucifixo, paralelas e tríceps corda. Pegou bem.",

  "sensacao": {

    "energia": 4,

    "dorMuscular": 2,

    "humor": 5,

    "rpe": 8

  },

  "exercicios": \[

    {

      "nome": "Supino reto",

      "series": \[

        { "reps": 10, "cargaKg": 60, "rpe": 7 },

        { "reps": 8,  "cargaKg": 70, "rpe": 8 },

        { "reps": 6,  "cargaKg": 75, "rpe": 9 }

      \]

    }

  \],

  "tags": \[\]

}

**Como o híbrido funciona na prática:**

- A tela abre com **cronômetro \+ campo de texto livre \+ 4 sliders de sensação**. É esse o caminho padrão, o de 20 segundos.  
- Um botão *"Detalhar exercícios"* abre o bloco estruturado. Opcional, por treino.  
- `exercicios: []` vazio é perfeitamente válido. O relatório se adapta: sem estrutura, ele analisa frequência, duração e sensação; com estrutura, ele libera volume, tonelagem e progressão de carga.

`tipo`: `forca` | `cardio` | `mobilidade` | `esporte` | `outro` `foco`: grupos musculares ou sistema trabalhado — é o que permite cruzar volume de perna com perímetro de coxa depois. `sensacao.rpe`: percepção de esforço 1–10. É o dado mais subestimado do app: junto com volume, ele mostra quando você está progredindo e quando está só se cansando.

### 2.6 Metas (os dois tipos)

// Tipo 1 — valor-alvo com prazo

{

  "id": "met\_01J...",

  "tipo": "valor",

  "metrica": "pesoKg",

  "alvo": 79.0,

  "direcao": "reduzir",

  "valorInicial": 84.2,

  "inicio": "2026-08-23",

  "prazo": "2026-12-20",

  "ativa": true

}

// Tipo 2 — frequência / hábito

{

  "id": "met\_01J...",

  "tipo": "frequencia",

  "metrica": "treinos",

  "filtro": { "tipo": "forca" },

  "alvo": 4,

  "janela": "semana",

  "inicio": "2026-08-23",

  "prazo": null,

  "ativa": true

}

`metrica` para metas de valor pode ser: `pesoKg`, `medidas.cintura`, qualquer `codigo` de marcador, ou `duracaoMinSemanal`. `janela` para metas de frequência: `semana` | `mes`.

---

## 3\. Motor de métricas e catálogo de insights

Esta é a parte que transforma o app de caderno em painel. Separe em duas camadas: `motor.js` calcula números, `insights.js` traduz números em frases.

### 3.1 Métricas derivadas

**Peso e composição** | Métrica | Cálculo | Por que importa | |---|---|---| | Média móvel 7 dias | média das últimas 7 leituras | O peso diário é ruído (água, sal, intestino). A média é o sinal. | | Taxa semanal | inclinação da regressão linear das últimas 4 semanas, em kg/semana | Diz se você está indo, parado ou voltando | | ETA da meta | (alvo − média atual) ÷ taxa semanal | Projeta a data de chegada no ritmo atual | | IMC | peso ÷ altura² | Referência grosseira, útil só como série temporal | | Variação acumulada | atual − primeiro registro | O número que motiva |

**Medidas** | Métrica | Cálculo | Por que importa | |---|---|---| | Relação cintura/altura (RCEst) | cintura ÷ altura | Indicador de distribuição de gordura mais informativo que o IMC | | Relação cintura/quadril | cintura ÷ quadril | Idem | | Perímetro somado | soma de todas as medidas | Detecta recomposição: peso parado \+ soma caindo \= trocou gordura por músculo | | Assimetria bilateral | |D − E| por par | Sinaliza desequilíbrio de carga entre lados | | Delta por segmento | variação de cada medida em 30/60/90 dias | Mostra onde o corpo respondeu |

**Treino** | Métrica | Cálculo | Por que importa | |---|---|---| | Frequência semanal | treinos ÷ semana | Base de tudo | | Aderência | frequência ÷ meta de frequência | Nota da consistência | | Streak | semanas seguidas batendo a meta | Combustível comportamental | | Volume (tonelagem) | Σ (séries × reps × carga) | Só com registro estruturado | | Volume por grupo muscular | tonelagem agrupada por `foco` | Revela grupo negligenciado | | 1RM estimado | Epley: carga × (1 \+ reps ÷ 30\) | Compara séries de faixas de repetição diferentes | | Densidade | volume ÷ duração | Mede eficiência da sessão | | Tempo total semanal | Σ duração | Meta de volume para cardio/mobilidade |

### 3.2 Catálogo de insights (as leituras cruzadas)

Cada item abaixo é uma regra em `insights.js`, com condição de disparo e frase gerada.

**Consistência**

1. *Platô detectado* — média móvel de peso variou menos de 0,3 kg em 3 semanas seguidas.  
2. *Semana de queda de aderência* — frequência caiu abaixo da meta por 2 semanas consecutivas.  
3. *Lacuna de dados* — mais de N dias sem registro de peso ou medida (avisa que o gráfico vai ficar cego naquele trecho).

**Corpo × treino** 4\. *Recomposição* — peso estável (±0,5 kg) e perímetro somado caindo no mesmo período. 5\. *Resposta ao estímulo* — cruzar frequência média das últimas 4 semanas com o delta de peso/medidas do mesmo período. 6\. *Volume × segmento com defasagem* — volume de um grupo muscular nas semanas t−8 a t−4 contra a medida do segmento correspondente em t. Corpo responde com atraso; o gráfico precisa respeitar isso. 7\. *Assimetria persistente* — diferença bilateral acima de 1 cm em 3 medições seguidas.

**Sensação — o dado mais rico e o mais ignorado** 8\. *Curva de fadiga* — dispersão de RPE/energia pós-treino contra duração e volume. Responde: qual é o meu ponto ótimo de sessão? 9\. *Melhor janela do dia* — sensação média por faixa de horário de início. 10\. *Melhor dia da semana* — sensação e volume médios por dia. 11\. *Alerta de sobrecarga* — RPE subindo e energia pós-treino caindo por 2 semanas com volume constante. Sinal clássico de recuperação insuficiente. 12\. *Correlação humor × frequência* — humor médio em semanas com ≥ meta contra semanas abaixo da meta.

**Marcadores** 13\. *Série temporal por marcador*, com faixa de referência sombreada quando preenchida. 14\. *Marcador × peso/medidas com defasagem* — dispersão com correlação simples. 15\. *Marcador × contexto* — por exemplo, comparar leituras em jejum e pós-prandial como séries separadas, nunca misturadas no mesmo gráfico.

**Metas** 16\. *Projeção vs. prazo* — "no ritmo atual você chega em 12/jan, 23 dias depois do prazo". 17\. *Ritmo necessário* — quanto por semana falta a partir de hoje para bater no prazo.

> **Régua honesta:** com poucos registros, correlação é coincidência. Faça `insights.js` exigir um mínimo de amostras por regra (sugestão: 8 pontos para dispersões, 3 semanas para tendências) e exibir a contagem junto do insight. Um painel que afirma demais com dados de menos é pior que nenhum painel.

### 3.3 Gráficos

| Gráfico | Tipo | Eixos |
| :---- | :---- | :---- |
| Peso | Linha dupla | Pontos brutos \+ média móvel 7d, com linha da meta |
| Medidas | Linha múltipla | Uma série por medida, seletor de quais exibir |
| Perímetro somado × peso | Linha dupla, eixo Y duplo | Detector visual de recomposição |
| Frequência de treino | Barras semanais | Com linha da meta atravessando |
| Volume por grupo | Barras empilhadas | Semanas no X, grupos empilhados |
| Progressão de carga | Linha | 1RM estimado por exercício |
| Sensação × volume | Dispersão | Volume no X, RPE/energia no Y |
| Sensação por dia/horário | Barras | Médias por recorte |
| Marcador | Linha | Com faixa de referência sombreada |
| Calendário de consistência | Heatmap | Estilo "grade de contribuições" |

---

## 4\. Telas

Mobile-first. O iPhone é para registrar, o Mac e o iPad são para analisar.

| \# | Tela | Função | Onde mais se usa |
| :---- | :---- | :---- | :---- |
| 1 | **Hoje** | 4 botões grandes de registro rápido \+ resumo do dia \+ streak | iPhone |
| 2 | **Treino** | Cronômetro, texto livre, sliders de sensação, botão de detalhar | iPhone |
| 3 | **Peso** | Entrada rápida \+ últimos 30 dias | iPhone |
| 4 | **Medidas** | Formulário com campos opcionais \+ comparativo com a última | iPhone |
| 5 | **Marcadores** | Entrada por catálogo \+ histórico | iPhone / Mac |
| 6 | **Histórico** | Linha do tempo unificada, filtrável, editável | iPad |
| 7 | **Metas** | Cadastro dos dois tipos \+ barra de progresso \+ projeção | Todos |
| 8 | **Relatório** | Todos os gráficos e insights, com seletor de período | Mac / iPad |
| 9 | **Config** | Perfil, catálogos, sync, backup, exportação | Mac |

---

## 5\. Fases de execução no Claude Code

### Fase 0 — Repositório, ambiente e CLAUDE.md

**Objetivo:** ter o esqueleto publicado em HTTPS antes de escrever qualquer funcionalidade. Publicar cedo evita descobrir problema de hospedagem depois de 8 fases prontas.

**Prompt:**

Leia o PLANO.md na raiz. Execute apenas a Fase 0\.

Crie a estrutura de pastas descrita na seção 1.4, com arquivos vazios

ou com stub mínimo. Crie um index.html que apenas exiba "App de Saúde —

v0" e carregue os scripts em sequência. Crie um CLAUDE.md do projeto

com: stack (HTML/CSS/JS vanilla sem build), padrão de nomes em

português, convenção de commits, e a regra de nunca introduzir

dependência via CDN. Inicialize o git e faça o commit inicial.

Depois me dê, em passo a passo para quem nunca usou GitHub, como:

1\) criar o repositório remoto, 2\) fazer o push,

3\) ativar o GitHub Pages, 4\) obter a URL HTTPS.

**Critério de aceite:** abrir a URL do GitHub Pages no iPhone e ver "App de Saúde — v0".

---

### Fase 1 — Núcleo de dados

**Objetivo:** o modelo de dados da seção 2 funcionando, testado, antes de qualquer tela.

**Prompt:**

Execute apenas a Fase 1 do PLANO.md.

Implemente js/schema.js com todas as entidades da seção 2 do plano,

incluindo versaoSchema e uma função de migração preparada para versões

futuras. Implemente js/dados.js como camada de acesso ao IndexedDB com

CRUD completo por entidade, validação de entrada e geração de ids.

Implemente js/util.js com helpers de data/hora em fuso de São Paulo,

formatação numérica e cálculo de duração.

Crie uma página oculta de testes (testes.html) que exercite cada

operação de CRUD e imprima o resultado na tela. Popule um seed de

demonstração com 60 dias de dados fictícios para eu conseguir ver os

gráficos funcionando nas fases seguintes.

Não crie nenhuma tela de usuário nesta fase.

**Critério de aceite:** `testes.html` passa 100%; o seed de 60 dias existe e é apagável em um clique.

---

### Fase 2 — Telas de registro

**Prompt:**

Execute apenas a Fase 2 do PLANO.md.

Implemente as telas Hoje, Peso, Medidas e Marcadores (seção 4), com o

roteamento em js/app.js e boot via App.iniciar(). Mobile-first: alvos

de toque de no mínimo 44px, inputmode="decimal" nos campos numéricos,

respeito a safe-area-inset no iPhone, tema escuro.

A tela Hoje deve permitir registrar peso em no máximo 3 toques a partir

da abertura do app. Data e hora vêm preenchidas com o momento atual e

são editáveis.

A tela Marcadores deve ler o catálogo configurável, não ter marcador

fixo no código.

**Critério de aceite:** registrar peso, uma medida e um marcador pelo iPhone, fechar e reabrir o app, e os dados continuarem lá.

---

### Fase 3 — Módulo de treino

**Prompt:**

Execute apenas a Fase 3 do PLANO.md.

Implemente a tela de Treino no modelo híbrido da seção 2.5:

\- cronômetro que grava início, fim e duração automaticamente, que

  sobreviva ao app ficar em segundo plano e ao bloqueio de tela

\- campo de descrição livre

\- seletor de tipo e de foco (grupos musculares)

\- quatro sliders de sensação pós-treino: energia, dor muscular, humor e RPE

\- botão "Detalhar exercícios" que abre o bloco estruturado com

  exercício, séries, repetições, carga e RPE por série

\- catálogo de exercícios com autocomplete que aprende os nomes que eu

  já usei

O caminho livre tem que fechar um registro completo em menos de 20

segundos. O bloco estruturado é sempre opcional.

**Critério de aceite:** registrar um treino livre em menos de 20 segundos e um treino detalhado completo, ambos sem erro; cronômetro correto após bloquear a tela por 5 minutos.

---

### Fase 4 — Metas

**Prompt:**

Execute apenas a Fase 4 do PLANO.md.

Implemente a tela de Metas com os dois tipos da seção 2.6:

valor-alvo com prazo e frequência por janela.

Para cada meta ativa, calcule e exiba: progresso percentual, ritmo

atual, ritmo necessário para bater no prazo, e projeção de data de

chegada. Exiba as metas ativas também no topo da tela Hoje.

**Critério de aceite:** criar uma meta de cada tipo e ver progresso e projeção coerentes com o seed.

---

### Fase 5 — Motor de insights e relatório

**Objetivo:** a fase que dá razão de existir ao app.

**Prompt:**

Execute apenas a Fase 5 do PLANO.md.

Implemente js/motor.js com todas as métricas derivadas da seção 3.1 e

js/insights.js com as 17 regras da seção 3.2. Cada regra deve ter

amostra mínima e devolver, junto do texto, a quantidade de pontos que

a sustenta.

Implemente js/graficos.js e a tela Relatório com todos os gráficos da

seção 3.3, usando Chart.js vendorizado em assets/vendor (nunca CDN).

Inclua seletor de período: 30 dias, 90 dias, 6 meses, 1 ano, tudo.

Use o seed de 60 dias para validar visualmente cada gráfico.

**Critério de aceite:** todos os gráficos renderizam com o seed; nenhum insight aparece com amostra abaixo do mínimo; o relatório abre em menos de 2 segundos.

---

### Fase 6 — PWA e instalação no iPhone/iPad

**Prompt:**

Execute apenas a Fase 6 do PLANO.md.

Implemente manifest.json (display standalone, tema escuro, ícones 180,

192 e 512\) e sw.js com estratégia cache-first para os arquivos do app

e network-first para nada — o app é 100% offline. Gere os três ícones.

Implemente versionamento de cache para que uma nova versão publicada

invalide a antiga sem eu precisar reinstalar.

Adicione na tela Config um indicador de versão do app e um botão de

"forçar atualização".

Depois me dê o passo a passo de instalação no iPhone e no iPad via

Safari \> Compartilhar \> Adicionar à Tela de Início.

**Critério de aceite:** app instalado na tela de início do iPhone, abrindo sem barra do Safari, funcionando em modo avião.

---

### Fase 7 — Sync com o Drive, criptografia e backup

**Prompt:**

Execute apenas a Fase 7 do PLANO.md.

Reaproveite o módulo de sincronização com Google Drive e criptografia

AES-GCM que já existe no meu CRM (vou colar o código). Adapte para

js/sync.js com:

\- sync manual por botão e sync automático ao abrir e ao fechar o app

\- resolução de conflito por registro, usando id \+ atualizadoEm, com

  merge por união (nunca sobrescrever o arquivo inteiro)

\- indicador visual de estado: sincronizado, pendente, erro

\- exportação e importação de JSON completo para backup manual

\- exportação em CSV por entidade

Escreva um teste de conflito: editar o mesmo dia no iPhone e no Mac

offline e verificar que nada se perde no merge.

**Critério de aceite:** registrar treino no iPhone offline, abrir no Mac depois e ver o registro; teste de conflito sem perda de dado.

---

### Fase 8 — Integração com o cockpit e polimento

**Prompt:**

Execute apenas a Fase 8 do PLANO.md.

Adeque o JSON exportado ao data contract do meu cockpit dos quatro

pilares (vou colar o contrato). Exponha para o cockpit um resumo do

pilar Saúde: aderência da semana, streak, variação de peso em 30 dias

e status de cada meta ativa.

Faça uma passada final de acessibilidade e desempenho: contraste,

tamanho de fonte, tempo de abertura, e comportamento com 2 anos de

dados simulados.

**Critério de aceite:** cockpit lendo o resumo do pilar Saúde; app abrindo em menos de 1,5 s com 2 anos de dados.

---

## 6\. Armadilhas específicas do iOS

Antecipe estas — todas custam horas se aparecerem só no fim:

1. **Safari apaga IndexedDB de sites não usados por 7 dias.** Mitigação em três camadas: instalar como PWA na tela de início (reduz muito o risco), sync automático no Drive e lembrete de backup mensal na tela Config. **Nunca trate o IndexedDB como cópia única.**  
2. **PWA no iOS exige HTTPS.** Por isso a Fase 0 publica antes de codar.  
3. **Notificação push é limitada.** Não conte com ela para lembrete de registro. Use um alarme recorrente no app Atalhos ou no Calendário apontando para a URL do app.  
4. **Teclado numérico:** `inputmode="decimal"` e `pattern` — sem isso o iPhone abre teclado alfabético em campo de carga.  
5. **Safe area:** use `env(safe-area-inset-bottom)` para a barra de navegação não ficar embaixo do indicador de home.  
6. **Cronômetro em segundo plano:** o JS pausa. Grave o timestamp de início e calcule a diferença ao voltar, em vez de contar ticks.  
7. **Zoom involuntário:** fonte de input abaixo de 16px faz o Safari dar zoom ao focar. Use 16px ou mais.

---

## 7\. Ordem de valor (se quiser cortar caminho)

Se o tempo apertar, este é o mínimo que já entrega uso real: **Fases 0 → 1 → 2 → 3 → 6\.** Você já está registrando tudo pelo iPhone, instalado, offline. Metas (4), relatório (5) e sync (7) entram depois sem retrabalho, porque o modelo de dados da Fase 1 já os previu.

---

## 8\. Backlog v2 (não construir agora)

- Importação de dados do app Saúde da Apple (peso, passos, frequência cardíaca)  
- Foto de progresso com comparação lado a lado por data  
- Templates de treino (montar a sessão a partir de um modelo salvo)  
- Anexar PDF de exame ao registro de marcador  
- Exportação de relatório em PDF para levar ao médico  
- Deload sugerido a partir do alerta de sobrecarga

---

## 9\. Observação

Este app é um registro pessoal de acompanhamento — ele organiza e mostra os seus próprios números ao longo do tempo. Faixas de referência, interpretação de marcadores e decisões sobre treino ou dieta são conversa com médico e profissional de educação física. O valor do app é chegar na consulta com histórico organizado, não substituí-la.  
