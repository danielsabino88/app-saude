const Dados = {};

Dados.NOME_BANCO = 'app_saude';
Dados.VERSAO_BANCO = 3;
Dados.NOMES_ARMAZENAMENTOS = [
  'perfil', 'catalogoMarcadores', 'catalogoExercicios',
  'registrosPeso', 'registrosMedidas', 'registrosMarcadores', 'treinos', 'metas',
  'cronometroTreino',
];
// syncMeta guarda credenciais/config/estado da Fase 7 (js/sync.js). Fica fora de
// NOMES_ARMAZENAMENTOS de propósito: "apagar tudo" (seed/testes) não pode desconectar
// o Drive nem esquecer a frase de sincronização do aparelho.
Dados.NOME_ARMAZENAMENTO_SYNC = 'syncMeta';

Dados._db = null;
Dados._abrindo = null;

Dados._criarArmazenamentos = function _criarArmazenamentos(db) {
  if (!db.objectStoreNames.contains('perfil')) {
    db.createObjectStore('perfil');
  }
  if (!db.objectStoreNames.contains('catalogoMarcadores')) {
    db.createObjectStore('catalogoMarcadores', { keyPath: 'codigo' });
  }
  if (!db.objectStoreNames.contains('catalogoExercicios')) {
    db.createObjectStore('catalogoExercicios', { keyPath: 'nome' });
  }
  if (!db.objectStoreNames.contains('registrosPeso')) {
    db.createObjectStore('registrosPeso', { keyPath: 'id' }).createIndex('dataHora', 'dataHora');
  }
  if (!db.objectStoreNames.contains('registrosMedidas')) {
    db.createObjectStore('registrosMedidas', { keyPath: 'id' }).createIndex('dataHora', 'dataHora');
  }
  if (!db.objectStoreNames.contains('registrosMarcadores')) {
    const armazenamento = db.createObjectStore('registrosMarcadores', { keyPath: 'id' });
    armazenamento.createIndex('dataHora', 'dataHora');
    armazenamento.createIndex('codigo', 'codigo');
  }
  if (!db.objectStoreNames.contains('treinos')) {
    db.createObjectStore('treinos', { keyPath: 'id' }).createIndex('inicio', 'inicio');
  }
  if (!db.objectStoreNames.contains('metas')) {
    db.createObjectStore('metas', { keyPath: 'id' }).createIndex('ativa', 'ativa');
  }
  if (!db.objectStoreNames.contains('cronometroTreino')) {
    db.createObjectStore('cronometroTreino');
  }
  if (!db.objectStoreNames.contains(Dados.NOME_ARMAZENAMENTO_SYNC)) {
    db.createObjectStore(Dados.NOME_ARMAZENAMENTO_SYNC);
  }
};

Dados.abrir = function abrir() {
  if (Dados._db) return Promise.resolve(Dados._db);
  if (Dados._abrindo) return Dados._abrindo;
  Dados._abrindo = new Promise((resolve, reject) => {
    const pedido = indexedDB.open(Dados.NOME_BANCO, Dados.VERSAO_BANCO);
    pedido.onupgradeneeded = (evento) => {
      Dados._criarArmazenamentos(evento.target.result);
    };
    pedido.onsuccess = () => {
      Dados._db = pedido.result;
      resolve(Dados._db);
    };
    pedido.onerror = () => reject(pedido.error);
  });
  return Dados._abrindo;
};

Dados._promessa = function _promessa(pedido) {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
};

Dados._armazenamento = async function _armazenamento(nome, modo) {
  const db = await Dados.abrir();
  return db.transaction(nome, modo).objectStore(nome);
};

// --- CRUD genérico para entidades com id gerado (registros e treinos/metas) ---

Dados._criarRegistro = async function _criarRegistro(nomeEntidade, dados) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const erros = Schema.validar(nomeEntidade, dados);
  if (erros.length > 0) throw new Error(`Dados inválidos para ${nomeEntidade}: ${erros.join('; ')}`);
  const agora = Util.agoraISO();
  const registro = { ...dados, id: Util.gerarId(config.prefixoId), criadoEm: agora, atualizadoEm: agora };
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readwrite');
  await Dados._promessa(armazenamento.add(registro));
  return registro;
};

Dados._obterRegistro = async function _obterRegistro(nomeEntidade, id) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readonly');
  return Dados._promessa(armazenamento.get(id));
};

// incluirExcluidos=true traz também os registros apagados (tombstones, ver _removerRegistro
// abaixo) — usado só pela sincronização (js/sync.js), que precisa deles para propagar a
// exclusão para os outros aparelhos. As telas do app nunca passam esse parâmetro.
Dados._listarRegistros = async function _listarRegistros(nomeEntidade, incluirExcluidos) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readonly');
  const todos = await Dados._promessa(armazenamento.getAll());
  return incluirExcluidos ? todos : todos.filter((r) => !r.excluidoEm);
};

Dados._atualizarRegistro = async function _atualizarRegistro(nomeEntidade, id, alteracoes) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const existente = await Dados._obterRegistro(nomeEntidade, id);
  if (!existente) throw new Error(`Registro não encontrado em ${nomeEntidade}: ${id}`);
  const atualizado = {
    ...existente,
    ...alteracoes,
    id: existente.id,
    criadoEm: existente.criadoEm,
    atualizadoEm: Util.agoraISO(),
  };
  const erros = Schema.validar(nomeEntidade, atualizado);
  if (erros.length > 0) throw new Error(`Dados inválidos para ${nomeEntidade}: ${erros.join('; ')}`);
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readwrite');
  await Dados._promessa(armazenamento.put(atualizado));
  return atualizado;
};

// Exclusão suave (tombstone): marca excluidoEm em vez de apagar de verdade. Sem isso, um
// registro apagado no Mac reapareceria no iPhone no sync seguinte, porque o merge por
// união (id + atualizadoEm) não teria como saber que ele foi removido — só que ele "sumiu
// de uma lista", o que uma lista JSON isolada não registra. As telas do app não notam a
// diferença: _listarRegistros já filtra excluidoEm por padrão.
Dados._removerRegistro = async function _removerRegistro(nomeEntidade, id) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const existente = await Dados._obterRegistro(nomeEntidade, id);
  if (!existente || existente.excluidoEm) return;
  const agora = Util.agoraISO();
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readwrite');
  await Dados._promessa(armazenamento.put({ ...existente, excluidoEm: agora, atualizadoEm: agora }));
};

// --- Perfil (registro único) ---

Dados.obterPerfil = async function obterPerfil() {
  const armazenamento = await Dados._armazenamento('perfil', 'readonly');
  const registro = await Dados._promessa(armazenamento.get('perfil'));
  return registro || { alturaCm: null, nascimento: null, sexo: null };
};

Dados.salvarPerfil = async function salvarPerfil(dados) {
  const erros = Schema.validar('perfil', dados);
  if (erros.length > 0) throw new Error(`Dados inválidos para perfil: ${erros.join('; ')}`);
  const registro = { ...dados, atualizadoEm: Util.agoraISO() };
  const armazenamento = await Dados._armazenamento('perfil', 'readwrite');
  await Dados._promessa(armazenamento.put(registro, 'perfil'));
  return registro;
};

// --- Catálogo de marcadores (chave: codigo) ---

Dados.criarMarcadorCatalogo = async function criarMarcadorCatalogo(dados) {
  const erros = Schema.validar('catalogoMarcadores', dados);
  if (erros.length > 0) throw new Error(`Dados inválidos para catalogoMarcadores: ${erros.join('; ')}`);
  const existente = await Dados.obterMarcadorCatalogo(dados.codigo);
  if (existente && !existente.excluidoEm) throw new Error(`Já existe um marcador cadastrado com o código: ${dados.codigo}`);
  const agora = Util.agoraISO();
  // put (não add): se o código já existe como tombstone (marcador apagado antes),
  // recadastrar precisa reaproveitar a linha em vez de esbarrar na chave já usada.
  const registro = { ...dados, criadoEm: existente ? existente.criadoEm : agora, atualizadoEm: agora };
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readwrite');
  await Dados._promessa(armazenamento.put(registro));
  return registro;
};

Dados.obterMarcadorCatalogo = async function obterMarcadorCatalogo(codigo) {
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readonly');
  return Dados._promessa(armazenamento.get(codigo));
};

Dados.listarCatalogoMarcadores = async function listarCatalogoMarcadores(incluirExcluidos) {
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readonly');
  const todos = await Dados._promessa(armazenamento.getAll());
  return incluirExcluidos ? todos : todos.filter((r) => !r.excluidoEm);
};

Dados.atualizarMarcadorCatalogo = async function atualizarMarcadorCatalogo(codigo, alteracoes) {
  const existente = await Dados.obterMarcadorCatalogo(codigo);
  if (!existente) throw new Error(`Marcador não encontrado no catálogo: ${codigo}`);
  const atualizado = {
    ...existente,
    ...alteracoes,
    codigo: existente.codigo,
    criadoEm: existente.criadoEm,
    atualizadoEm: Util.agoraISO(),
  };
  const erros = Schema.validar('catalogoMarcadores', atualizado);
  if (erros.length > 0) throw new Error(`Dados inválidos para catalogoMarcadores: ${erros.join('; ')}`);
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readwrite');
  await Dados._promessa(armazenamento.put(atualizado));
  return atualizado;
};

Dados.removerMarcadorCatalogo = async function removerMarcadorCatalogo(codigo) {
  const existente = await Dados.obterMarcadorCatalogo(codigo);
  if (!existente || existente.excluidoEm) return;
  const agora = Util.agoraISO();
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readwrite');
  await Dados._promessa(armazenamento.put({ ...existente, excluidoEm: agora, atualizadoEm: agora }));
};

// --- Catálogo de exercícios (chave: nome) ---

Dados.criarExercicioCatalogo = async function criarExercicioCatalogo(dados) {
  const erros = Schema.validar('catalogoExercicios', dados);
  if (erros.length > 0) throw new Error(`Dados inválidos para catalogoExercicios: ${erros.join('; ')}`);
  const existente = await Dados.obterExercicioCatalogo(dados.nome);
  if (existente && !existente.excluidoEm) throw new Error(`Já existe um exercício cadastrado com o nome: ${dados.nome}`);
  const agora = Util.agoraISO();
  const registro = { foco: [], ...dados, criadoEm: existente ? existente.criadoEm : agora, atualizadoEm: agora };
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readwrite');
  await Dados._promessa(armazenamento.put(registro));
  return registro;
};

Dados.obterExercicioCatalogo = async function obterExercicioCatalogo(nome) {
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readonly');
  return Dados._promessa(armazenamento.get(nome));
};

Dados.listarCatalogoExercicios = async function listarCatalogoExercicios(incluirExcluidos) {
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readonly');
  const todos = await Dados._promessa(armazenamento.getAll());
  return incluirExcluidos ? todos : todos.filter((r) => !r.excluidoEm);
};

Dados.atualizarExercicioCatalogo = async function atualizarExercicioCatalogo(nome, alteracoes) {
  const existente = await Dados.obterExercicioCatalogo(nome);
  if (!existente) throw new Error(`Exercício não encontrado no catálogo: ${nome}`);
  const atualizado = {
    ...existente,
    ...alteracoes,
    nome: existente.nome,
    criadoEm: existente.criadoEm,
    atualizadoEm: Util.agoraISO(),
  };
  const erros = Schema.validar('catalogoExercicios', atualizado);
  if (erros.length > 0) throw new Error(`Dados inválidos para catalogoExercicios: ${erros.join('; ')}`);
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readwrite');
  await Dados._promessa(armazenamento.put(atualizado));
  return atualizado;
};

Dados.removerExercicioCatalogo = async function removerExercicioCatalogo(nome) {
  const existente = await Dados.obterExercicioCatalogo(nome);
  if (!existente || existente.excluidoEm) return;
  const agora = Util.agoraISO();
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readwrite');
  await Dados._promessa(armazenamento.put({ ...existente, excluidoEm: agora, atualizadoEm: agora }));
};

// --- Peso ---

Dados.criarPeso = (dados) => Dados._criarRegistro('registrosPeso', dados);
Dados.obterPeso = (id) => Dados._obterRegistro('registrosPeso', id);
Dados.listarPeso = async () => {
  const lista = await Dados._listarRegistros('registrosPeso');
  return lista.sort((a, b) => a.dataHora.localeCompare(b.dataHora));
};
Dados.atualizarPeso = (id, alteracoes) => Dados._atualizarRegistro('registrosPeso', id, alteracoes);
Dados.removerPeso = (id) => Dados._removerRegistro('registrosPeso', id);

// --- Medidas ---

Dados.criarMedidas = (dados) => Dados._criarRegistro('registrosMedidas', dados);
Dados.obterMedidas = (id) => Dados._obterRegistro('registrosMedidas', id);
Dados.listarMedidas = async () => {
  const lista = await Dados._listarRegistros('registrosMedidas');
  return lista.sort((a, b) => a.dataHora.localeCompare(b.dataHora));
};
Dados.atualizarMedidas = (id, alteracoes) => Dados._atualizarRegistro('registrosMedidas', id, alteracoes);
Dados.removerMedidas = (id) => Dados._removerRegistro('registrosMedidas', id);

// --- Registros de marcadores (valida contra o catálogo) ---

Dados.criarMarcador = async function criarMarcador(dados) {
  const catalogo = await Dados.obterMarcadorCatalogo(dados.codigo);
  if (!catalogo || catalogo.excluidoEm) throw new Error(`Código de marcador não cadastrado no catálogo: ${dados.codigo}`);
  if (Array.isArray(catalogo.contextos) && catalogo.contextos.length > 0 && !catalogo.contextos.includes(dados.contexto)) {
    erroContextoInvalido(dados.codigo, dados.contexto, catalogo.contextos);
  }
  return Dados._criarRegistro('registrosMarcadores', dados);
};

function erroContextoInvalido(codigo, contexto, contextosPermitidos) {
  throw new Error(
    `Contexto "${contexto}" não é válido para o marcador "${codigo}" (permitidos: ${contextosPermitidos.join(', ')})`,
  );
}

Dados.obterMarcador = (id) => Dados._obterRegistro('registrosMarcadores', id);
Dados.listarMarcadores = async (codigo) => {
  const lista = await Dados._listarRegistros('registrosMarcadores');
  const filtrada = codigo ? lista.filter((r) => r.codigo === codigo) : lista;
  return filtrada.sort((a, b) => a.dataHora.localeCompare(b.dataHora));
};
Dados.atualizarMarcador = (id, alteracoes) => Dados._atualizarRegistro('registrosMarcadores', id, alteracoes);
Dados.removerMarcador = (id) => Dados._removerRegistro('registrosMarcadores', id);

// --- Treinos ---

Dados.criarTreino = (dados) => Dados._criarRegistro('treinos', {
  fim: null, duracaoMin: null, foco: [], local: '', descricao: '', sensacao: null, exercicios: [], tags: [],
  ...dados,
});
Dados.obterTreino = (id) => Dados._obterRegistro('treinos', id);
Dados.listarTreinos = async () => {
  const lista = await Dados._listarRegistros('treinos');
  return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
};
Dados.atualizarTreino = (id, alteracoes) => Dados._atualizarRegistro('treinos', id, alteracoes);
Dados.removerTreino = (id) => Dados._removerRegistro('treinos', id);

// --- Metas ---

Dados.criarMeta = (dados) => Dados._criarRegistro('metas', { prazo: null, ativa: true, ...dados });
Dados.obterMeta = (id) => Dados._obterRegistro('metas', id);
Dados.listarMetas = async () => Dados._listarRegistros('metas');
Dados.atualizarMeta = (id, alteracoes) => Dados._atualizarRegistro('metas', id, alteracoes);
Dados.removerMeta = (id) => Dados._removerRegistro('metas', id);

// --- Cronômetro de treino em andamento (estado efêmero, sobrevive a segundo plano/reload; não faz parte do envelope exportável) ---

Dados.salvarCronometroTreino = async function salvarCronometroTreino(dados) {
  const armazenamento = await Dados._armazenamento('cronometroTreino', 'readwrite');
  await Dados._promessa(armazenamento.put(dados, 'atual'));
};

Dados.obterCronometroTreino = async function obterCronometroTreino() {
  const armazenamento = await Dados._armazenamento('cronometroTreino', 'readonly');
  return Dados._promessa(armazenamento.get('atual'));
};

Dados.limparCronometroTreino = async function limparCronometroTreino() {
  const armazenamento = await Dados._armazenamento('cronometroTreino', 'readwrite');
  await Dados._promessa(armazenamento.delete('atual'));
};

// --- Metadados de sincronização (Fase 7) — chave/valor livre para js/sync.js ---
// (config: clientId/clientSecret/passphrase; credenciais: tokens do Drive; estado: status
// de sync; oauthPendente: verifier/state do PKCE durante o redirecionamento do login)

Dados.obterSyncMeta = async function obterSyncMeta(chave) {
  const armazenamento = await Dados._armazenamento(Dados.NOME_ARMAZENAMENTO_SYNC, 'readonly');
  return Dados._promessa(armazenamento.get(chave));
};

Dados.salvarSyncMeta = async function salvarSyncMeta(chave, valor) {
  const armazenamento = await Dados._armazenamento(Dados.NOME_ARMAZENAMENTO_SYNC, 'readwrite');
  await Dados._promessa(armazenamento.put(valor, chave));
};

Dados.removerSyncMeta = async function removerSyncMeta(chave) {
  const armazenamento = await Dados._armazenamento(Dados.NOME_ARMAZENAMENTO_SYNC, 'readwrite');
  await Dados._promessa(armazenamento.delete(chave));
};

// --- Envelope completo (seção 2.1 do PLANO.md) — usado pela sincronização e pelo backup manual ---

// incluirExcluidos=true inclui os tombstones (ver _removerRegistro): é o que a sincronização
// com o Drive usa para propagar exclusões para os outros aparelhos. O backup manual (JSON
// para download) usa o padrão (false) — um backup não precisa carregar histórico de exclusão.
Dados.exportarEnvelope = async function exportarEnvelope(opcoes = {}) {
  const incluirExcluidos = !!opcoes.incluirExcluidos;
  const [
    perfil, catalogoMarcadores, catalogoExercicios,
    registrosPeso, registrosMedidas, registrosMarcadores, treinos, metas,
  ] = await Promise.all([
    Dados.obterPerfil(),
    Dados.listarCatalogoMarcadores(incluirExcluidos),
    Dados.listarCatalogoExercicios(incluirExcluidos),
    Dados._listarRegistros('registrosPeso', incluirExcluidos),
    Dados._listarRegistros('registrosMedidas', incluirExcluidos),
    Dados._listarRegistros('registrosMarcadores', incluirExcluidos),
    Dados._listarRegistros('treinos', incluirExcluidos),
    Dados._listarRegistros('metas', incluirExcluidos),
  ]);
  return {
    versaoSchema: Schema.versaoAtual,
    pilar: 'saude',
    atualizadoEm: Util.agoraISO(),
    dispositivoOrigem: Schema.detectarDispositivo(),
    perfil,
    catalogoMarcadores,
    catalogoExercicios,
    registrosPeso,
    registrosMedidas,
    registrosMarcadores,
    treinos,
    metas,
  };
};

// Grava um envelope (já mesclado por Sync.unirEnvelopes) de volta no IndexedDB. Sempre put
// (nunca clear+add): registros que não vieram no envelope permanecem intocados — quem decide
// o que muda é o merge, não esta função.
Dados.aplicarEnvelope = async function aplicarEnvelope(envelope) {
  const db = await Dados.abrir();

  if (envelope.perfil) {
    const armazenamentoPerfil = db.transaction('perfil', 'readwrite').objectStore('perfil');
    await Dados._promessa(armazenamentoPerfil.put(envelope.perfil, 'perfil'));
  }

  const gravarLista = async (nomeArmazenamento, lista) => {
    if (!Array.isArray(lista) || lista.length === 0) return;
    const armazenamento = db.transaction(nomeArmazenamento, 'readwrite').objectStore(nomeArmazenamento);
    await Promise.all(lista.map((item) => Dados._promessa(armazenamento.put(item))));
  };

  await gravarLista('catalogoMarcadores', envelope.catalogoMarcadores);
  await gravarLista('catalogoExercicios', envelope.catalogoExercicios);
  await gravarLista('registrosPeso', envelope.registrosPeso);
  await gravarLista('registrosMedidas', envelope.registrosMedidas);
  await gravarLista('registrosMarcadores', envelope.registrosMarcadores);
  await gravarLista('treinos', envelope.treinos);
  await gravarLista('metas', envelope.metas);
};

// --- Utilidades gerais ---

Dados.contarTudo = async function contarTudo() {
  const db = await Dados.abrir();
  const contagens = {};
  await Promise.all(Dados.NOMES_ARMAZENAMENTOS.map(async (nome) => {
    const armazenamento = db.transaction(nome, 'readonly').objectStore(nome);
    contagens[nome] = await Dados._promessa(armazenamento.count());
  }));
  return contagens;
};

Dados.limparTudo = async function limparTudo() {
  const db = await Dados.abrir();
  const tx = db.transaction(Dados.NOMES_ARMAZENAMENTOS, 'readwrite');
  await Promise.all(Dados.NOMES_ARMAZENAMENTOS.map((nome) => Dados._promessa(tx.objectStore(nome).clear())));
};
