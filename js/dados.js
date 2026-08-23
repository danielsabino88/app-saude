const Dados = {};

Dados.NOME_BANCO = 'app_saude';
Dados.VERSAO_BANCO = 1;
Dados.NOMES_ARMAZENAMENTOS = [
  'perfil', 'catalogoMarcadores', 'catalogoExercicios',
  'registrosPeso', 'registrosMedidas', 'registrosMarcadores', 'treinos', 'metas',
];

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

Dados._listarRegistros = async function _listarRegistros(nomeEntidade) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readonly');
  return Dados._promessa(armazenamento.getAll());
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

Dados._removerRegistro = async function _removerRegistro(nomeEntidade, id) {
  const config = Schema.ENTIDADES[nomeEntidade];
  const armazenamento = await Dados._armazenamento(config.armazenamento, 'readwrite');
  await Dados._promessa(armazenamento.delete(id));
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
  const agora = Util.agoraISO();
  const registro = { ...dados, criadoEm: agora, atualizadoEm: agora };
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readwrite');
  await Dados._promessa(armazenamento.add(registro));
  return registro;
};

Dados.obterMarcadorCatalogo = async function obterMarcadorCatalogo(codigo) {
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readonly');
  return Dados._promessa(armazenamento.get(codigo));
};

Dados.listarCatalogoMarcadores = async function listarCatalogoMarcadores() {
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readonly');
  return Dados._promessa(armazenamento.getAll());
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
  const armazenamento = await Dados._armazenamento('catalogoMarcadores', 'readwrite');
  await Dados._promessa(armazenamento.delete(codigo));
};

// --- Catálogo de exercícios (chave: nome) ---

Dados.criarExercicioCatalogo = async function criarExercicioCatalogo(dados) {
  const erros = Schema.validar('catalogoExercicios', dados);
  if (erros.length > 0) throw new Error(`Dados inválidos para catalogoExercicios: ${erros.join('; ')}`);
  const agora = Util.agoraISO();
  const registro = { foco: [], ...dados, criadoEm: agora, atualizadoEm: agora };
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readwrite');
  await Dados._promessa(armazenamento.add(registro));
  return registro;
};

Dados.obterExercicioCatalogo = async function obterExercicioCatalogo(nome) {
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readonly');
  return Dados._promessa(armazenamento.get(nome));
};

Dados.listarCatalogoExercicios = async function listarCatalogoExercicios() {
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readonly');
  return Dados._promessa(armazenamento.getAll());
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
  const armazenamento = await Dados._armazenamento('catalogoExercicios', 'readwrite');
  await Dados._promessa(armazenamento.delete(nome));
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
  if (!catalogo) throw new Error(`Código de marcador não cadastrado no catálogo: ${dados.codigo}`);
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
