const Sync = {};

// ============================================================================
// Fase 7 — sincronização com o Google Drive, criptografada, sem depender de
// nenhum script externo (nunca CDN): tudo aqui é fetch() comum para as APIs do
// Google + Web Crypto nativa do navegador. Ver PLANO.md seção "Fase 7" e o
// arquivo GUIA-SYNC.md para o passo a passo de configuração no Google Cloud.
//
// Como funciona, em uma frase: cada sincronização baixa o que está no Drive,
// funde com o que está no aparelho registro por registro (quem tem o
// atualizadoEm mais recente vence) e manda de volta o resultado — nunca
// sobrescreve o arquivo do Drive com uma cópia cega do aparelho.
// ============================================================================

Sync.ESCOPO = 'https://www.googleapis.com/auth/drive.appdata';
Sync.URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
Sync.URL_TOKEN = 'https://oauth2.googleapis.com/token';
Sync.URL_DRIVE_ARQUIVOS = 'https://www.googleapis.com/drive/v3/files';
Sync.URL_DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
Sync.NOME_ARQUIVO_DRIVE = 'dados-saude.sync.json';
Sync._KDF_ITERACOES = 150000;

// Chave usada para casar registros no merge de cada entidade (id para a maioria;
// catálogos usam a própria chave natural, já que não têm id gerado).
Sync.CHAVES_ENTIDADE = {
  catalogoMarcadores: 'codigo',
  catalogoExercicios: 'nome',
  registrosPeso: 'id',
  registrosMedidas: 'id',
  registrosMarcadores: 'id',
  treinos: 'id',
  metas: 'id',
};

// Entidades que aparecem no botão de exportação CSV (seção "Exportar CSV" da tela Config).
Sync.DEFINICOES_CSV = {
  registrosPeso: {
    rotulo: 'Peso',
    nomeArquivo: 'peso',
    obter: () => Dados.listarPeso(),
    colunas: [
      { rotulo: 'Data/hora', fn: (r) => Util.formatarDataHoraBR(r.dataHora) },
      { rotulo: 'Peso (kg)', fn: (r) => r.pesoKg },
      { rotulo: 'Gordura (%)', fn: (r) => r.gorduraPct },
      { rotulo: 'Massa magra (kg)', fn: (r) => r.massaMagraKg },
      { rotulo: 'Contexto', fn: (r) => r.contexto },
      { rotulo: 'Observações', fn: (r) => r.obs },
    ],
  },
  registrosMedidas: {
    rotulo: 'Medidas',
    nomeArquivo: 'medidas',
    obter: () => Dados.listarMedidas(),
    colunas: [
      { rotulo: 'Data/hora', fn: (r) => Util.formatarDataHoraBR(r.dataHora) },
      ...Schema.CAMPOS_MEDIDAS.map((campo) => ({ rotulo: campo, fn: (r) => (r.medidas || {})[campo] })),
      { rotulo: 'Observações', fn: (r) => r.obs },
    ],
  },
  registrosMarcadores: {
    rotulo: 'Marcadores',
    nomeArquivo: 'marcadores',
    obter: () => Dados.listarMarcadores(),
    colunas: [
      { rotulo: 'Data/hora', fn: (r) => Util.formatarDataHoraBR(r.dataHora) },
      { rotulo: 'Código', fn: (r) => r.codigo },
      { rotulo: 'Valor', fn: (r) => r.valor },
      { rotulo: 'Contexto', fn: (r) => r.contexto },
      { rotulo: 'Origem', fn: (r) => r.origem },
      { rotulo: 'Observações', fn: (r) => r.obs },
    ],
  },
  treinos: {
    rotulo: 'Treinos',
    nomeArquivo: 'treinos',
    obter: () => Dados.listarTreinos(),
    colunas: [
      { rotulo: 'Início', fn: (r) => Util.formatarDataHoraBR(r.inicio) },
      { rotulo: 'Duração', fn: (r) => Util.formatarDuracao(r.duracaoMin) },
      { rotulo: 'Tipo', fn: (r) => r.tipo },
      { rotulo: 'Foco', fn: (r) => (r.foco || []).join(', ') },
      { rotulo: 'Local', fn: (r) => r.local },
      { rotulo: 'Descrição', fn: (r) => r.descricao },
      { rotulo: 'Energia', fn: (r) => r.sensacao && r.sensacao.energia },
      { rotulo: 'Dor muscular', fn: (r) => r.sensacao && r.sensacao.dorMuscular },
      { rotulo: 'Humor', fn: (r) => r.sensacao && r.sensacao.humor },
      { rotulo: 'RPE', fn: (r) => r.sensacao && r.sensacao.rpe },
      {
        rotulo: 'Exercícios',
        fn: (r) => (r.exercicios || [])
          .map((ex) => `${ex.nome}: ${(ex.series || []).map((s) => `${s.reps}x${s.cargaKg ?? '-'}`).join(',')}`)
          .join(' | '),
      },
    ],
  },
  metas: {
    rotulo: 'Metas',
    nomeArquivo: 'metas',
    obter: () => Dados.listarMetas(),
    colunas: [
      { rotulo: 'Tipo', fn: (r) => r.tipo },
      { rotulo: 'Métrica', fn: (r) => r.metrica },
      { rotulo: 'Alvo', fn: (r) => r.alvo },
      { rotulo: 'Início', fn: (r) => r.inicio },
      { rotulo: 'Prazo', fn: (r) => r.prazo },
      { rotulo: 'Ativa', fn: (r) => (r.ativa ? 'Sim' : 'Não') },
    ],
  },
  catalogoMarcadores: {
    rotulo: 'Catálogo de marcadores',
    nomeArquivo: 'catalogo-marcadores',
    obter: () => Dados.listarCatalogoMarcadores(),
    colunas: [
      { rotulo: 'Código', fn: (r) => r.codigo },
      { rotulo: 'Nome', fn: (r) => r.nome },
      { rotulo: 'Unidade', fn: (r) => r.unidade },
      { rotulo: 'Direção desejada', fn: (r) => r.direcaoDesejada },
    ],
  },
};

// ---------------------------------------------------------------------------
// Motor de mesclagem (puro — sem I/O, por isso é testável direto em testes.html
// sem precisar de rede nem de login no Google)
// ---------------------------------------------------------------------------

// Uma lista local e uma remota da mesma entidade viram uma só: por chave (id, ou
// codigo/nome nos catálogos), quem tem atualizadoEm mais recente vence. Não é
// "o último a sincronizar ganha tudo" — é registro por registro.
Sync.unirListas = function unirListas(chave, listaLocal, listaRemota) {
  const mapa = new Map();
  (listaLocal || []).forEach((item) => mapa.set(item[chave], item));
  (listaRemota || []).forEach((item) => {
    const existente = mapa.get(item[chave]);
    const atualizadoRemoto = item.atualizadoEm || '';
    const atualizadoLocal = existente ? (existente.atualizadoEm || '') : '';
    if (!existente || atualizadoRemoto > atualizadoLocal) mapa.set(item[chave], item);
  });
  return Array.from(mapa.values());
};

// Perfil é um registro único (não uma lista) — mesma regra do atualizadoEm mais recente.
Sync.unirPerfil = function unirPerfil(perfilLocal, perfilRemoto) {
  const atualizadoLocal = (perfilLocal && perfilLocal.atualizadoEm) || '';
  const atualizadoRemoto = (perfilRemoto && perfilRemoto.atualizadoEm) || '';
  if (perfilRemoto && atualizadoRemoto > atualizadoLocal) return perfilRemoto;
  return perfilLocal || perfilRemoto || null;
};

// Une dois envelopes completos (seção 2.1 do PLANO.md), entidade por entidade.
Sync.unirEnvelopes = function unirEnvelopes(envelopeLocal, envelopeRemoto) {
  const local = envelopeLocal || Schema.criarEnvelopeVazio();
  const remoto = envelopeRemoto || Schema.criarEnvelopeVazio();
  const resultado = {
    versaoSchema: Schema.versaoAtual,
    pilar: 'saude',
    atualizadoEm: Util.agoraISO(),
    dispositivoOrigem: Schema.detectarDispositivo(),
    perfil: Sync.unirPerfil(local.perfil, remoto.perfil),
  };
  Object.keys(Sync.CHAVES_ENTIDADE).forEach((nomeEntidade) => {
    resultado[nomeEntidade] = Sync.unirListas(Sync.CHAVES_ENTIDADE[nomeEntidade], local[nomeEntidade], remoto[nomeEntidade]);
  });
  return resultado;
};

// ---------------------------------------------------------------------------
// Base64url, PKCE e criptografia AES-GCM (Web Crypto nativa — sem biblioteca)
// ---------------------------------------------------------------------------

function bytesAleatorios(tamanho) {
  const buffer = new Uint8Array(tamanho);
  crypto.getRandomValues(buffer);
  return buffer;
}

function paraBase64Url(bytes) {
  let binario = '';
  bytes.forEach((b) => { binario += String.fromCharCode(b); });
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  let base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function sha256(texto) {
  const dados = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', dados);
  return new Uint8Array(hash);
}

Sync._derivarChave = async function _derivarChave(passphrase, saltBytes) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: Sync._KDF_ITERACOES, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

// Devolve { v, salt, iv, dados } — salt e iv novos a cada chamada (boa prática:
// nunca reusar iv com a mesma chave). O pacote inteiro é o que sobe pro Drive.
Sync._criptografar = async function _criptografar(objeto, passphrase) {
  const salt = bytesAleatorios(16);
  const iv = bytesAleatorios(12);
  const chave = await Sync._derivarChave(passphrase, salt);
  const claro = new TextEncoder().encode(JSON.stringify(objeto));
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, claro);
  return { v: 1, salt: paraBase64Url(salt), iv: paraBase64Url(iv), dados: paraBase64Url(new Uint8Array(cifrado)) };
};

Sync._descriptografar = async function _descriptografar(pacote, passphrase) {
  const salt = deBase64Url(pacote.salt);
  const iv = deBase64Url(pacote.iv);
  const chave = await Sync._derivarChave(passphrase, salt);
  const bytes = deBase64Url(pacote.dados);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, bytes);
  return JSON.parse(new TextDecoder().decode(claro));
};

// ---------------------------------------------------------------------------
// OAuth 2.0 com PKCE — só fetch() e um redirecionamento de página, nunca um
// script de terceiro. client_id/client_secret ficam só no IndexedDB deste
// aparelho (nunca no repositório): quem preenche é você, na tela Config.
// ---------------------------------------------------------------------------

Sync._redirectUri = function _redirectUri() {
  return location.origin + location.pathname;
};

Sync.obterConfig = () => Dados.obterSyncMeta('config');
Sync.salvarConfig = (config) => Dados.salvarSyncMeta('config', config);
Sync.obterCredenciais = () => Dados.obterSyncMeta('credenciais');
Sync._salvarCredenciais = (credenciais) => Dados.salvarSyncMeta('credenciais', credenciais);

Sync.estaConectado = async function estaConectado() {
  const credenciais = await Sync.obterCredenciais();
  return !!(credenciais && credenciais.refreshToken);
};

// Redireciona para a tela de login do Google. Volta para a mesma URL do app com
// ?code=... na query string — Sync.tratarRetornoOAuth() (chamado no boot) processa isso.
Sync.iniciarConexao = async function iniciarConexao() {
  const config = await Sync.obterConfig();
  if (!config || !config.clientId || !config.clientSecret) {
    throw new Error('Preencha o ID e a chave secreta do cliente OAuth antes de conectar.');
  }
  const verifier = paraBase64Url(bytesAleatorios(32));
  const desafio = paraBase64Url(await sha256(verifier));
  const estado = paraBase64Url(bytesAleatorios(16));
  await Dados.salvarSyncMeta('oauthPendente', { verifier, estado, criadoEm: Date.now() });

  const parametros = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: Sync._redirectUri(),
    response_type: 'code',
    scope: Sync.ESCOPO,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: desafio,
    code_challenge_method: 'S256',
    state: estado,
  });
  location.href = `${Sync.URL_AUTORIZACAO}?${parametros.toString()}`;
};

// Chamado uma vez no boot (App.iniciar). Se a URL não tem ?code=..., não faz nada.
Sync.tratarRetornoOAuth = async function tratarRetornoOAuth() {
  const parametros = new URLSearchParams(location.search);
  const code = parametros.get('code');
  const estadoRecebido = parametros.get('state');
  const erro = parametros.get('error');
  if (!code && !erro) return null;

  // limpa code/state da URL imediatamente — não pode ficar exposto nem ser reprocessado
  // se a página recarregar (voltar/atualizar reenviaria um código já usado).
  history.replaceState(null, '', location.origin + location.pathname + location.hash);

  if (erro) {
    await Sync._salvarEstado('erro', `Login recusado: ${erro}`);
    return { ok: false, erro };
  }

  const pendente = await Dados.obterSyncMeta('oauthPendente');
  await Dados.removerSyncMeta('oauthPendente');
  if (!pendente || pendente.estado !== estadoRecebido) {
    await Sync._salvarEstado('erro', 'Retorno de login inválido — tente conectar de novo.');
    return { ok: false, erro: 'state_invalido' };
  }

  try {
    await Sync._trocarCodigoPorToken(code, pendente.verifier);
    return { ok: true };
  } catch (e) {
    await Sync._salvarEstado('erro', e.message);
    return { ok: false, erro: e.message };
  }
};

Sync._trocarCodigoPorToken = async function _trocarCodigoPorToken(code, verifier) {
  const config = await Sync.obterConfig();
  const corpo = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: Sync._redirectUri(),
  });
  const resposta = await fetch(Sync.URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  const json = await resposta.json();
  if (!resposta.ok) throw new Error(`Falha ao concluir o login com o Google: ${json.error_description || json.error || resposta.status}`);
  await Sync._salvarCredenciais({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiraEm: Date.now() + (json.expires_in - 60) * 1000,
    fileId: null,
  });
};

Sync._renovarTokenSeNecessario = async function _renovarTokenSeNecessario() {
  const credenciais = await Sync.obterCredenciais();
  if (!credenciais || !credenciais.refreshToken) throw new Error('Google Drive não conectado. Conecte em Config.');
  if (credenciais.accessToken && credenciais.expiraEm && Date.now() < credenciais.expiraEm) return credenciais.accessToken;

  const config = await Sync.obterConfig();
  const corpo = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: credenciais.refreshToken,
    grant_type: 'refresh_token',
  });
  const resposta = await fetch(Sync.URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  const json = await resposta.json();
  if (!resposta.ok) throw new Error(`Falha ao renovar o acesso ao Drive: ${json.error_description || json.error || resposta.status}`);
  const atualizadas = { ...credenciais, accessToken: json.access_token, expiraEm: Date.now() + (json.expires_in - 60) * 1000 };
  await Sync._salvarCredenciais(atualizadas);
  return atualizadas.accessToken;
};

// Desconecta só o Drive — os dados locais no aparelho não são tocados.
Sync.desconectar = async function desconectar() {
  await Dados.removerSyncMeta('credenciais');
  await Sync._salvarEstado('nunca', null);
};

// ---------------------------------------------------------------------------
// Arquivo no Drive (pasta appDataFolder — invisível no Drive normal, exclusiva
// deste app, não conta como "arquivo do usuário" que ele possa apagar sem querer)
// ---------------------------------------------------------------------------

Sync._buscarArquivo = async function _buscarArquivo(accessToken) {
  const consulta = encodeURIComponent(`name='${Sync.NOME_ARQUIVO_DRIVE}' and trashed=false`);
  const url = `${Sync.URL_DRIVE_ARQUIVOS}?spaces=appDataFolder&q=${consulta}&fields=files(id,name)`;
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resposta.ok) throw new Error(`Falha ao procurar o arquivo no Drive (HTTP ${resposta.status})`);
  const json = await resposta.json();
  return (json.files && json.files[0]) || null;
};

Sync._baixarArquivo = async function _baixarArquivo(accessToken, fileId) {
  const resposta = await fetch(`${Sync.URL_DRIVE_ARQUIVOS}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`Falha ao baixar os dados do Drive (HTTP ${resposta.status})`);
  return resposta.json();
};

Sync._enviarArquivo = async function _enviarArquivo(accessToken, fileId, pacote) {
  const corpo = JSON.stringify(pacote);
  if (fileId) {
    const resposta = await fetch(`${Sync.URL_DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: corpo,
    });
    if (!resposta.ok) throw new Error(`Falha ao enviar os dados ao Drive (HTTP ${resposta.status})`);
    return fileId;
  }
  const metadados = { name: Sync.NOME_ARQUIVO_DRIVE, parents: ['appDataFolder'] };
  const limite = 'limite-sync-saude';
  const multipart = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n${corpo}\r\n--${limite}--`;
  const resposta = await fetch(`${Sync.URL_DRIVE_UPLOAD}?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: multipart,
  });
  if (!resposta.ok) throw new Error(`Falha ao criar o arquivo no Drive (HTTP ${resposta.status})`);
  const json = await resposta.json();
  return json.id;
};

// ---------------------------------------------------------------------------
// Orquestração: estado exibido na tela e o ciclo completo de sincronização
// ---------------------------------------------------------------------------

Sync._salvarEstado = async function _salvarEstado(status, mensagemErro) {
  const atual = (await Dados.obterSyncMeta('estado')) || {};
  const novo = { ...atual, status };
  if (status === 'sincronizado') { novo.ultimaSincronizacaoEm = Util.agoraISO(); novo.ultimoErro = null; }
  if (status === 'erro') novo.ultimoErro = mensagemErro;
  await Dados.salvarSyncMeta('estado', novo);
  return novo;
};

// Maior atualizadoEm entre todos os registros locais (incluindo tombstones) — usado
// só para saber se há algo criado/editado/apagado depois da última sincronização.
Sync._maiorAtualizacaoLocal = async function _maiorAtualizacaoLocal() {
  const envelope = await Dados.exportarEnvelope({ incluirExcluidos: true });
  let maior = (envelope.perfil && envelope.perfil.atualizadoEm) || '';
  Object.keys(Sync.CHAVES_ENTIDADE).forEach((nomeEntidade) => {
    (envelope[nomeEntidade] || []).forEach((item) => {
      if ((item.atualizadoEm || '') > maior) maior = item.atualizadoEm;
    });
  });
  return maior;
};

// Estado para a tela Config mostrar: 'desconectado' | 'erro' | 'pendente' | 'sincronizado'.
Sync.obterStatusExibicao = async function obterStatusExibicao() {
  const conectado = await Sync.estaConectado();
  if (!conectado) return { chave: 'desconectado', rotulo: 'Google Drive não conectado', ultimaSincronizacaoEm: null };

  const estado = (await Dados.obterSyncMeta('estado')) || {};
  if (estado.status === 'erro') {
    return { chave: 'erro', rotulo: `Erro ao sincronizar: ${estado.ultimoErro || 'falha desconhecida'}`, ultimaSincronizacaoEm: estado.ultimaSincronizacaoEm || null };
  }
  if (!estado.ultimaSincronizacaoEm) return { chave: 'pendente', rotulo: 'Ainda não sincronizado', ultimaSincronizacaoEm: null };

  const maiorLocal = await Sync._maiorAtualizacaoLocal();
  if (maiorLocal > estado.ultimaSincronizacaoEm) {
    return { chave: 'pendente', rotulo: 'Há alterações locais por sincronizar', ultimaSincronizacaoEm: estado.ultimaSincronizacaoEm };
  }
  return {
    chave: 'sincronizado',
    rotulo: `Sincronizado — ${Util.formatarDataHoraBR(estado.ultimaSincronizacaoEm)}`,
    ultimaSincronizacaoEm: estado.ultimaSincronizacaoEm,
  };
};

Sync._emAndamento = false;

// Ciclo completo: renova token → baixa e decifra o que está no Drive → funde com o
// que está no aparelho → grava o resultado mesclado no IndexedDB → cifra e reenvia
// ao Drive. Lança erro (quem chama decide se mostra na tela ou engole, ver abaixo).
Sync.sincronizar = async function sincronizar() {
  if (Sync._emAndamento) return Sync.obterStatusExibicao();
  Sync._emAndamento = true;
  try {
    const config = await Sync.obterConfig();
    if (!config || !config.passphrase) {
      throw new Error('Defina a frase de sincronização em Config antes de sincronizar.');
    }

    const accessToken = await Sync._renovarTokenSeNecessario();
    let credenciais = await Sync.obterCredenciais();
    let fileId = credenciais.fileId;
    if (!fileId) {
      const encontrado = await Sync._buscarArquivo(accessToken);
      fileId = encontrado ? encontrado.id : null;
    }

    let envelopeRemoto = null;
    if (fileId) {
      const pacote = await Sync._baixarArquivo(accessToken, fileId);
      if (pacote) {
        try {
          envelopeRemoto = Schema.migrar(await Sync._descriptografar(pacote, config.passphrase));
        } catch (e) {
          throw new Error('Não foi possível decifrar os dados do Drive. Confira se a frase de sincronização é igual à usada nos outros aparelhos.');
        }
      }
    }

    const envelopeLocal = await Dados.exportarEnvelope({ incluirExcluidos: true });
    const mesclado = Sync.unirEnvelopes(envelopeLocal, envelopeRemoto);

    await Dados.aplicarEnvelope(mesclado);

    const pacoteCifrado = await Sync._criptografar(mesclado, config.passphrase);
    const novoFileId = await Sync._enviarArquivo(accessToken, fileId, pacoteCifrado);

    credenciais = await Sync.obterCredenciais();
    await Sync._salvarCredenciais({ ...credenciais, fileId: novoFileId });
    await Sync._salvarEstado('sincronizado', null);
    return Sync.obterStatusExibicao();
  } catch (e) {
    await Sync._salvarEstado('erro', e.message);
    throw e;
  } finally {
    Sync._emAndamento = false;
  }
};

// Versão "silenciosa" para os gatilhos automáticos (abrir/fechar o app): nunca lança
// erro, nunca trava a interface. O app funciona 100% offline independente do resultado.
Sync.sincronizarSilencioso = async function sincronizarSilencioso() {
  try {
    if (!(await Sync.estaConectado())) return null;
    return await Sync.sincronizar();
  } catch (e) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Backup manual (JSON completo) e exportação por entidade (CSV)
// ---------------------------------------------------------------------------

Sync._baixarBlob = function _baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 400);
};

Sync.exportarBackupJSON = async function exportarBackupJSON() {
  const envelope = await Dados.exportarEnvelope({ incluirExcluidos: false });
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  Sync._baixarBlob(blob, `app-saude-backup-${Util.hojeISO()}.json`);
};

// Nunca substitui os dados atuais: funde o backup com o que já está no aparelho
// (mesma regra de atualizadoEm), igual à sincronização com o Drive.
Sync.importarBackupJSON = async function importarBackupJSON(arquivo) {
  const texto = await arquivo.text();
  let envelope;
  try { envelope = JSON.parse(texto); } catch (e) { throw new Error('Arquivo inválido: não é um JSON legível.'); }
  if (!envelope || envelope.pilar !== 'saude') throw new Error('Arquivo inválido: não é um backup deste app.');
  envelope = Schema.migrar(envelope);
  const local = await Dados.exportarEnvelope({ incluirExcluidos: true });
  const mesclado = Sync.unirEnvelopes(local, envelope);
  await Dados.aplicarEnvelope(mesclado);
  return mesclado;
};

function csvEscapar(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function paraCsv(colunas, linhas) {
  const cabecalho = colunas.map((c) => csvEscapar(c.rotulo)).join(';');
  const corpo = linhas.map((linha) => colunas.map((c) => csvEscapar(c.fn(linha))).join(';')).join('\r\n');
  // BOM (﻿) na frente: é o que faz o Excel abrir o UTF-8 com acento certo em vez de trocar por símbolos.
  return `﻿${cabecalho}\r\n${corpo}`;
}

Sync.exportarCSV = async function exportarCSV(nomeEntidade) {
  const definicao = Sync.DEFINICOES_CSV[nomeEntidade];
  if (!definicao) throw new Error(`Entidade sem exportação CSV: ${nomeEntidade}`);
  const linhas = await definicao.obter();
  const conteudo = paraCsv(definicao.colunas, linhas);
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  Sync._baixarBlob(blob, `app-saude-${definicao.nomeArquivo}-${Util.hojeISO()}.csv`);
};
