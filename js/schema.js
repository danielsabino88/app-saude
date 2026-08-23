const Schema = {};

Schema.versaoAtual = 1;

Schema.CONTEXTOS_PESO = ['jejum', 'manha', 'tarde', 'noite', 'pos_treino'];
Schema.ORIGENS_MARCADOR = ['aparelho', 'exame_laboratorio', 'manual'];
Schema.DIRECOES_MARCADOR = ['aumentar', 'reduzir', 'manter'];
Schema.TIPOS_TREINO = ['forca', 'cardio', 'mobilidade', 'esporte', 'outro'];
Schema.TIPOS_META = ['valor', 'frequencia'];
Schema.DIRECOES_META = ['aumentar', 'reduzir'];
Schema.JANELAS_META = ['semana', 'mes'];
Schema.SEXOS = ['M', 'F', 'outro'];
Schema.CAMPOS_MEDIDAS = [
  'pescoco', 'toraxPeito', 'cintura', 'abdomen', 'quadril',
  'bracoRelaxadoD', 'bracoRelaxadoE', 'bracoContraidoD', 'bracoContraidoE',
  'antebracoD', 'antebracoE', 'coxaD', 'coxaE', 'panturrilhaD', 'panturrilhaE',
];

// Entidades com id gerado (ULID prefixado) e armazenamento próprio no IndexedDB.
Schema.ENTIDADES = {
  registrosPeso: { armazenamento: 'registrosPeso', prefixoId: 'pes' },
  registrosMedidas: { armazenamento: 'registrosMedidas', prefixoId: 'med' },
  registrosMarcadores: { armazenamento: 'registrosMarcadores', prefixoId: 'mar' },
  treinos: { armazenamento: 'treinos', prefixoId: 'tre' },
  metas: { armazenamento: 'metas', prefixoId: 'met' },
};

Schema.detectarDispositivo = function detectarDispositivo() {
  if (typeof navigator === 'undefined') return 'desconhecido';
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iphone';
  if (/iPad/.test(ua)) return 'ipad';
  if (/Macintosh/.test(ua)) return 'mac';
  return 'desconhecido';
};

Schema.criarEnvelopeVazio = function criarEnvelopeVazio() {
  return {
    versaoSchema: Schema.versaoAtual,
    pilar: 'saude',
    atualizadoEm: Util.agoraISO(),
    dispositivoOrigem: Schema.detectarDispositivo(),
    perfil: { alturaCm: null, nascimento: null, sexo: null },
    catalogoMarcadores: [],
    catalogoExercicios: [],
    registrosPeso: [],
    registrosMedidas: [],
    registrosMarcadores: [],
    treinos: [],
    metas: [],
  };
};

Schema.validarPerfil = function validarPerfil(dados) {
  const erros = [];
  if (dados.alturaCm !== null && dados.alturaCm !== undefined) {
    if (!Util.ehNumero(dados.alturaCm) || dados.alturaCm <= 0 || dados.alturaCm > 260) {
      erros.push('alturaCm deve ser um número entre 0 e 260');
    }
  }
  if (dados.nascimento !== null && dados.nascimento !== undefined) {
    if (!Util.ehDataISOValida(dados.nascimento)) erros.push('nascimento deve ser uma data válida');
  }
  if (dados.sexo !== null && dados.sexo !== undefined) {
    if (!Schema.SEXOS.includes(dados.sexo)) erros.push(`sexo deve ser um de: ${Schema.SEXOS.join(', ')}`);
  }
  return erros;
};

Schema.validarRegistroPeso = function validarRegistroPeso(dados) {
  const erros = [];
  if (!Util.ehDataISOValida(dados.dataHora)) erros.push('dataHora é obrigatória e deve ser uma data/hora válida');
  if (!Util.ehNumero(dados.pesoKg) || dados.pesoKg <= 0 || dados.pesoKg > 500) {
    erros.push('pesoKg é obrigatório e deve ser um número entre 0 e 500');
  }
  if (dados.gorduraPct !== null && dados.gorduraPct !== undefined) {
    if (!Util.ehNumero(dados.gorduraPct) || dados.gorduraPct < 0 || dados.gorduraPct > 100) {
      erros.push('gorduraPct deve ser um número entre 0 e 100');
    }
  }
  if (dados.massaMagraKg !== null && dados.massaMagraKg !== undefined) {
    if (!Util.ehNumero(dados.massaMagraKg) || dados.massaMagraKg <= 0) {
      erros.push('massaMagraKg deve ser um número positivo');
    }
  }
  if (!Schema.CONTEXTOS_PESO.includes(dados.contexto)) {
    erros.push(`contexto é obrigatório e deve ser um de: ${Schema.CONTEXTOS_PESO.join(', ')}`);
  }
  if (dados.obs !== undefined && typeof dados.obs !== 'string') erros.push('obs deve ser texto');
  return erros;
};

Schema.validarRegistroMedidas = function validarRegistroMedidas(dados) {
  const erros = [];
  if (!Util.ehDataISOValida(dados.dataHora)) erros.push('dataHora é obrigatória e deve ser uma data/hora válida');
  if (typeof dados.medidas !== 'object' || dados.medidas === null || Array.isArray(dados.medidas)) {
    erros.push('medidas é obrigatório e deve ser um objeto');
  } else {
    const chaves = Object.keys(dados.medidas);
    const chavesInvalidas = chaves.filter((c) => !Schema.CAMPOS_MEDIDAS.includes(c));
    if (chavesInvalidas.length > 0) erros.push(`medidas contém campos desconhecidos: ${chavesInvalidas.join(', ')}`);
    const preenchidas = chaves.filter((c) => dados.medidas[c] !== null && dados.medidas[c] !== undefined);
    if (preenchidas.length === 0) erros.push('preencha ao menos uma medida');
    preenchidas.forEach((c) => {
      const v = dados.medidas[c];
      if (!Util.ehNumero(v) || v <= 0 || v > 300) erros.push(`medidas.${c} deve ser um número entre 0 e 300`);
    });
  }
  if (dados.obs !== undefined && typeof dados.obs !== 'string') erros.push('obs deve ser texto');
  return erros;
};

Schema.validarCatalogoMarcador = function validarCatalogoMarcador(dados) {
  const erros = [];
  if (!dados.codigo || typeof dados.codigo !== 'string' || !/^[a-z0-9_]+$/.test(dados.codigo)) {
    erros.push('codigo é obrigatório e deve conter apenas letras minúsculas, números e underscore');
  }
  if (!dados.nome || typeof dados.nome !== 'string') erros.push('nome é obrigatório');
  if (!dados.unidade || typeof dados.unidade !== 'string') erros.push('unidade é obrigatória');
  if (!Number.isInteger(dados.casasDecimais) || dados.casasDecimais < 0 || dados.casasDecimais > 4) {
    erros.push('casasDecimais é obrigatório e deve ser um inteiro entre 0 e 4');
  }
  if (!Array.isArray(dados.contextos)) erros.push('contextos deve ser uma lista');
  if (dados.faixaReferencia !== undefined && dados.faixaReferencia !== null) {
    const { min, max } = dados.faixaReferencia;
    if (min !== null && min !== undefined && !Util.ehNumero(min)) erros.push('faixaReferencia.min deve ser número ou nulo');
    if (max !== null && max !== undefined && !Util.ehNumero(max)) erros.push('faixaReferencia.max deve ser número ou nulo');
  }
  if (!Schema.DIRECOES_MARCADOR.includes(dados.direcaoDesejada)) {
    erros.push(`direcaoDesejada é obrigatório e deve ser um de: ${Schema.DIRECOES_MARCADOR.join(', ')}`);
  }
  return erros;
};

Schema.validarRegistroMarcador = function validarRegistroMarcador(dados) {
  const erros = [];
  if (!Util.ehDataISOValida(dados.dataHora)) erros.push('dataHora é obrigatória e deve ser uma data/hora válida');
  if (!dados.codigo || typeof dados.codigo !== 'string') erros.push('codigo é obrigatório');
  if (!Util.ehNumero(dados.valor)) erros.push('valor é obrigatório e deve ser numérico');
  if (!dados.contexto || typeof dados.contexto !== 'string') erros.push('contexto é obrigatório');
  if (!Schema.ORIGENS_MARCADOR.includes(dados.origem)) {
    erros.push(`origem é obrigatório e deve ser um de: ${Schema.ORIGENS_MARCADOR.join(', ')}`);
  }
  if (dados.obs !== undefined && typeof dados.obs !== 'string') erros.push('obs deve ser texto');
  return erros;
};

Schema.validarCatalogoExercicio = function validarCatalogoExercicio(dados) {
  const erros = [];
  if (!dados.nome || typeof dados.nome !== 'string') erros.push('nome é obrigatório');
  if (dados.foco !== undefined && !Array.isArray(dados.foco)) erros.push('foco deve ser uma lista');
  return erros;
};

Schema.validarTreino = function validarTreino(dados) {
  const erros = [];
  if (!Util.ehDataISOValida(dados.inicio)) erros.push('inicio é obrigatório e deve ser uma data/hora válida');
  if (dados.fim !== null && dados.fim !== undefined) {
    if (!Util.ehDataISOValida(dados.fim)) erros.push('fim deve ser uma data/hora válida');
    else if (new Date(dados.fim) < new Date(dados.inicio)) erros.push('fim não pode ser antes de inicio');
  }
  if (dados.duracaoMin !== null && dados.duracaoMin !== undefined) {
    if (!Number.isInteger(dados.duracaoMin) || dados.duracaoMin < 0) erros.push('duracaoMin deve ser um inteiro não-negativo');
  }
  if (!Schema.TIPOS_TREINO.includes(dados.tipo)) {
    erros.push(`tipo é obrigatório e deve ser um de: ${Schema.TIPOS_TREINO.join(', ')}`);
  }
  if (dados.foco !== undefined && !Array.isArray(dados.foco)) erros.push('foco deve ser uma lista');
  if (dados.local !== undefined && typeof dados.local !== 'string') erros.push('local deve ser texto');
  if (dados.descricao !== undefined && typeof dados.descricao !== 'string') erros.push('descricao deve ser texto');
  if (dados.sensacao !== undefined && dados.sensacao !== null) {
    ['energia', 'dorMuscular', 'humor', 'rpe'].forEach((campo) => {
      const v = dados.sensacao[campo];
      if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1 || v > 10)) {
        erros.push(`sensacao.${campo} deve ser um inteiro entre 1 e 10`);
      }
    });
  }
  if (dados.exercicios !== undefined) {
    if (!Array.isArray(dados.exercicios)) {
      erros.push('exercicios deve ser uma lista');
    } else {
      dados.exercicios.forEach((ex, i) => {
        if (!ex.nome || typeof ex.nome !== 'string') erros.push(`exercicios[${i}].nome é obrigatório`);
        if (!Array.isArray(ex.series)) {
          erros.push(`exercicios[${i}].series deve ser uma lista`);
        } else {
          ex.series.forEach((serie, j) => {
            if (!Number.isInteger(serie.reps) || serie.reps < 0) {
              erros.push(`exercicios[${i}].series[${j}].reps deve ser um inteiro não-negativo`);
            }
            if (serie.cargaKg !== undefined && serie.cargaKg !== null) {
              if (!Util.ehNumero(serie.cargaKg) || serie.cargaKg < 0) {
                erros.push(`exercicios[${i}].series[${j}].cargaKg deve ser um número não-negativo`);
              }
            }
            if (serie.rpe !== undefined && serie.rpe !== null) {
              if (!Number.isInteger(serie.rpe) || serie.rpe < 1 || serie.rpe > 10) {
                erros.push(`exercicios[${i}].series[${j}].rpe deve ser um inteiro entre 1 e 10`);
              }
            }
          });
        }
      });
    }
  }
  if (dados.tags !== undefined && !Array.isArray(dados.tags)) erros.push('tags deve ser uma lista');
  return erros;
};

Schema.validarMeta = function validarMeta(dados) {
  const erros = [];
  if (!Schema.TIPOS_META.includes(dados.tipo)) {
    erros.push(`tipo é obrigatório e deve ser um de: ${Schema.TIPOS_META.join(', ')}`);
    return erros;
  }
  if (!dados.metrica || typeof dados.metrica !== 'string') erros.push('metrica é obrigatória');
  if (!Util.ehNumero(dados.alvo)) erros.push('alvo é obrigatório e deve ser numérico');
  if (!Util.ehDataISOValida(dados.inicio)) erros.push('inicio é obrigatório e deve ser uma data válida');
  if (dados.prazo !== null && dados.prazo !== undefined && !Util.ehDataISOValida(dados.prazo)) {
    erros.push('prazo deve ser uma data válida ou nulo');
  }
  if (typeof dados.ativa !== 'boolean') erros.push('ativa é obrigatório e deve ser booleano');

  if (dados.tipo === 'valor') {
    if (!Schema.DIRECOES_META.includes(dados.direcao)) {
      erros.push(`direcao é obrigatório e deve ser um de: ${Schema.DIRECOES_META.join(', ')}`);
    }
    if (!Util.ehNumero(dados.valorInicial)) erros.push('valorInicial é obrigatório e deve ser numérico');
  } else if (dados.tipo === 'frequencia') {
    if (!Schema.JANELAS_META.includes(dados.janela)) {
      erros.push(`janela é obrigatório e deve ser um de: ${Schema.JANELAS_META.join(', ')}`);
    }
    if (dados.filtro !== undefined && dados.filtro !== null && typeof dados.filtro !== 'object') {
      erros.push('filtro deve ser um objeto');
    }
  }
  return erros;
};

Schema.VALIDADORES = {
  perfil: Schema.validarPerfil,
  catalogoMarcadores: Schema.validarCatalogoMarcador,
  catalogoExercicios: Schema.validarCatalogoExercicio,
  registrosPeso: Schema.validarRegistroPeso,
  registrosMedidas: Schema.validarRegistroMedidas,
  registrosMarcadores: Schema.validarRegistroMarcador,
  treinos: Schema.validarTreino,
  metas: Schema.validarMeta,
};

Schema.validar = function validar(nomeEntidade, dados) {
  const validador = Schema.VALIDADORES[nomeEntidade];
  if (!validador) throw new Error(`Entidade desconhecida: ${nomeEntidade}`);
  return validador(dados);
};

// Migrações do envelope completo (seção 2.1), indexadas pela versão de origem.
// Quando a v2 existir, adicionar aqui: 1: (envelope) => ({ ...envelope, versaoSchema: 2, ... }).
Schema.MIGRACOES = {};

Schema.migrar = function migrar(envelope) {
  let atual = envelope;
  let versao = atual.versaoSchema || 1;
  if (versao > Schema.versaoAtual) {
    throw new Error(`Versão do schema (${versao}) é mais nova que a suportada (${Schema.versaoAtual})`);
  }
  while (versao < Schema.versaoAtual) {
    const migracao = Schema.MIGRACOES[versao];
    if (!migracao) throw new Error(`Não há migração definida da versão ${versao} para ${versao + 1}`);
    atual = migracao(atual);
    versao += 1;
  }
  atual.versaoSchema = versao;
  return atual;
};
