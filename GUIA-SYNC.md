# Guia de configuração — Sincronização com o Google Drive (Fase 7)

Passo a passo único, feito uma vez, para o app conseguir conversar com o seu
Google Drive. Depois de feito aqui, o app pede só para você "logar" — como
qualquer app que usa "Entrar com o Google".

> **Por que isso é necessário:** o app não tem servidor próprio (só arquivos
> estáticos no GitHub Pages). Para ele poder ler/gravar no seu Drive, o Google
> exige que você cadastre uma "credencial de aplicativo" antes — é assim para
> qualquer app, não só o seu.

---

## 1. Criar o projeto no Google Cloud

1. Abra [console.cloud.google.com](https://console.cloud.google.com) e faça
   login com a conta Google que você quer usar para o backup (pode ser a
   mesma do seu Drive pessoal).
2. No topo, clique no seletor de projeto → **Novo projeto**.
3. Nome do projeto: `App Saude Sync` (ou o nome que preferir). Clique em
   **Criar**.
4. Espere alguns segundos e troque para esse projeto recém-criado (mesmo
   seletor no topo).

## 2. Ativar a API do Google Drive

1. No menu lateral (☰), vá em **APIs e serviços → Biblioteca**.
2. Busque por "Google Drive API" e clique nela.
3. Clique em **Ativar**.

## 3. Configurar a "tela de consentimento" (OAuth consent screen)

Essa é a tela que aparece pedindo sua autorização quando o app tenta entrar
no seu Drive.

1. **APIs e serviços → Tela de consentimento OAuth**.
2. Tipo de usuário: **Externo** (é a única opção disponível para conta
   Google pessoal, não é problema — só você vai usar o app mesmo).
3. Preencha: nome do app (`App Saúde`), e-mail de suporte (o seu) e e-mail de
   contato do desenvolvedor (o seu). Salve e continue nas telas seguintes
   sem precisar preencher o resto.
4. Na tela de **Escopos**, clique em **Adicionar ou remover escopos** e
   marque `.../auth/drive.appdata` (aparece como algo como "Ver e gerenciar
   os seus próprios dados de configuração de apps no Google Drive"). Salve.
5. Na tela de **Usuários de teste**, clique em **Adicionar usuários** e
   coloque o seu próprio e-mail do Google. Salve.

**Nota importante:** com o app em modo "Teste" (o normal para uso pessoal —
publicar oficialmente exigiria passar pela revisão do Google, o que não vale
a pena para um app de uso só seu), o Google costuma expirar o acesso a cada
poucos dias e pede para você reconectar na tela Config. Não é bug do app,
é política do Google para apps não revisados. Se isso incomodar no dia a
dia, me avise depois — dá para meio-contornar publicando o app "em
produção" sem revisão completa (você só vê uma tela extra de aviso "app não
verificado" ao conectar, e clica em "avançado → continuar").

## 4. Criar a credencial (Client ID)

1. **APIs e serviços → Credenciais**.
2. **Criar credenciais → ID do cliente OAuth**.
3. Tipo de aplicativo: **Aplicativo da Web**.
4. Nome: `App Saúde — Web`.
5. Em **Origens JavaScript autorizadas**, adicione a URL do seu GitHub Pages
   sem barra no final, por exemplo:
   `https://SEU-USUARIO.github.io`
6. Em **URIs de redirecionamento autorizados**, adicione **as duas linhas**
   abaixo (troque pelo endereço real do seu app — o mesmo que você usa no
   iPhone para abrir o app):
   ```
   https://SEU-USUARIO.github.io/app-saude/
   https://SEU-USUARIO.github.io/app-saude/index.html
   ```
   (as duas porque, dependendo de como o app é aberto — pelo ícone instalado
   ou digitando o endereço — o navegador usa uma forma ou outra).
7. Clique em **Criar**. Vai aparecer uma janela com **Client ID** e
   **Client Secret** — não feche ainda.

## 5. Colar no app

1. Abra o App de Saúde → **Config**.
2. Cole o **Client ID** e o **Client Secret** nos campos correspondentes.
3. No campo **Frase de sincronização**, invente uma frase (ex.: uma frase
   longa que só você saiba). **Anote em algum lugar seguro** — se perder essa
   frase, o backup no Drive fica ilegível para sempre (mas os dados no
   aparelho continuam intactos; dá para gerar um backup novo com uma frase
   nova).
4. Clique em **Salvar configuração**.
5. Clique em **Conectar ao Drive** e faça login com a mesma conta Google do
   passo 1.
6. Volte para o Config e clique em **Sincronizar agora** para testar.

## 6. Repetir no outro aparelho

No segundo aparelho (Mac, iPad...), repita só o passo 5 — **usando o mesmo
Client ID, Client Secret e Frase de sincronização** dos dois aparelhos.
Não precisa repetir os passos 1 a 4 (a credencial do Google Cloud é uma só,
compartilhada entre os aparelhos).
