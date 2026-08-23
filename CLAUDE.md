# CLAUDE.md — App de Saúde

Contexto e regras deste projeto. Ver `PLANO.md` para o plano completo de execução por fases.

## Stack

- HTML5 + CSS puro + JavaScript vanilla. Sem build, sem npm, sem bundler.
- Sem ES modules. Scripts carregados em sequência via `<script>` no `index.html`, cada arquivo expõe um namespace global (ex.: `const Dados = {}`).
- IndexedDB para persistência local. Nunca `localStorage` (limite baixo, Safari descarta com facilidade).
- Service Worker + `manifest.json` para PWA.
- Google Drive API para sync, com criptografia AES-GCM.
- GitHub Pages para hospedagem.

## Padrão de nomes

- Tudo em português: arquivos, variáveis, funções, chaves de objeto/JSON.
- Arquivos de módulo em `js/`: minúsculo, sem acento (`dados.js`, `motor.js`).
- Namespaces globais em PascalCase (`Dados`, `Motor`, `TelaHoje`).
- IDs de entidade com prefixo de 3 letras + ULID (`pes_01J...`, `tre_01J...`), conforme `PLANO.md` seção 2.

## Convenção de commits

Formato: `tipo: descrição curta`, mensagem em português.

Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`.

Um assunto por commit, commits pequenos e frequentes.

## Regra de dependências

Nunca introduzir dependência via CDN. Toda biblioteca externa (ex.: Chart.js) fica vendorizada em `assets/vendor/`, versionada no repositório. O app precisa funcionar 100% offline.
