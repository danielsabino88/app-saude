# Contrato de dados — Ecossistema dos Quatro Pilares

Este documento define o formato único que os quatro apps usam para gravar dados. Cada app é independente e roda sozinho. O cockpit só lê.

---

## 1\. Estrutura de pastas (dentro do OneDrive ou Google Drive)

Quatro Pilares/

├── cockpit.html              ← o painel agregador

├── CONTRATO-DE-DADOS.md      ← este arquivo

└── dados/

    ├── saude.json

    ├── carreira.json

    ├── financas.json

    └── conexoes.json

Regra de ouro: **cada app é dono exclusivo de um arquivo.** O app de saúde só escreve em `saude.json`. Ninguém escreve no arquivo de outro. Isso elimina conflito de sincronização — o Drive só quebra quando dois processos editam o mesmo arquivo ao mesmo tempo.

---

## 2\. Formato do arquivo de pilar

Todos os quatro arquivos têm exatamente esta forma:

{

  "pilar": "saude",

  "rotulo": "Saúde",

  "atualizado\_em": "2026-08-12",

  "score\_atual": 74,

  "indicadores": \[

    {

      "id": "consistencia\_treino",

      "nome": "Consistência de treino",

      "valor": 4,

      "meta": 5,

      "unidade": "sessões/semana",

      "direcao": "maior\_melhor"

    }

  \],

  "score\_semanal": \[

    { "semana": "2026-W28", "score": 61 },

    { "semana": "2026-W29", "score": 70 }

  \],

  "marcos": \[

    {

      "titulo": "Check-up anual",

      "data": "2026-09-15",

      "status": "pendente"

    }

  \],

  "registros": \[

    {

      "data": "2026-08-10",

      "tipo": "treino",

      "valor": 1,

      "nota": "natação 40min"

    }

  \]

}

### Campos obrigatórios para o cockpit funcionar

| Campo | Para quê serve |
| :---- | :---- |
| `pilar` | chave interna: `saude`, `carreira`, `financas`, `conexoes` |
| `score_atual` | número 0–100, alimenta o anel do mapa |
| `score_semanal` | histórico, alimenta a grade de correlação |
| `indicadores` | alimenta o cartão do pilar |
| `marcos` | alimenta a agenda unificada |

`registros` é opcional para o cockpit — é o dado bruto que cada app usa internamente. O cockpit ignora, mas mantém o formato padronizado caso um dia você queira análise cruzada no nível do evento.

---

## 3\. Como calcular o `score_atual`

Cada app calcula o próprio score e grava pronto. O cockpit não recalcula nada — ele confia. Isso mantém a regra de negócio dentro do app que entende do assunto.

Fórmula padrão sugerida:

Para cada indicador:

  se direcao \= "maior\_melhor":  atingimento \= valor / meta

  se direcao \= "menor\_melhor":  atingimento \= meta / valor

  atingimento limitado ao teto de 1.0 (não existe 130%)

score \= média dos atingimentos × 100, arredondado

Se um pilar tiver indicador mais importante que outro, use média ponderada e grave o peso no próprio indicador (`"peso": 2`).

---

## 4\. Cadência de escrita

| Pilar | Quem alimenta | Ritmo |
| :---- | :---- | :---- |
| Saúde | app de saúde | registro diário, score semanal |
| Carreira e Renda | app de PDI | registro semanal |
| Finanças e Patrimônio | app financeiro (pronto) | registro semanal, fechamento mensal |
| Conexões | CRM pessoal | registro por interação |

O `score_semanal` deve ser fechado sempre no mesmo dia da semana (sugestão: domingo à noite). Semana no padrão ISO: `AAAA-Wnn`.

---

## 5\. Prompt para usar no Claude Code ao adaptar cada app

Copie e cole, trocando o nome do pilar:

> Este app precisa exportar o estado atual para o contrato de dados do cockpit. Leia o arquivo `CONTRATO-DE-DADOS.md` na pasta acima. Crie uma função `exportarParaCockpit()` que gera `dados/<pilar>.json` no formato exato do contrato, incluindo `score_atual`, `score_semanal`, `indicadores` e `marcos`. Chame essa função sempre que um registro for salvo. Não altere a lógica existente do app — apenas adicione a camada de exportação.

---

## 6\. Como abrir o cockpit

O navegador bloqueia leitura de arquivos vizinhos quando você abre o HTML com duplo clique (protocolo `file://`). Duas saídas:

**Opção A — servidor local (recomendada)** Na pasta `Quatro Pilares`, rode no terminal:

npx serve .

Abra o endereço que aparecer. O cockpit carrega os JSON sozinho.

**Opção B — carregar na mão** Abra o `cockpit.html` com duplo clique e use o botão "Carregar arquivos" para selecionar os quatro JSON. Funciona sem servidor, mas você repete a cada abertura.  
