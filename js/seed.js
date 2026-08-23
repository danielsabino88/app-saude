const Seed = {};

Seed.DIAS_PADRAO = 60;

Seed.FOCOS_FORCA = ['peito', 'costas', 'perna', 'ombro', 'biceps', 'triceps'];

function dataHoraHaDias(diasAtras, hora, minuto) {
  const instanteBase = new Date(Date.now() - diasAtras * 86400000);
  const dia = Util.diaEmSaoPaulo(instanteBase);
  const hh = String(hora).padStart(2, '0');
  const mm = String(minuto).padStart(2, '0');
  return `${dia}T${hh}:${mm}:00-03:00`;
}

function aleatorioEntre(min, max) {
  return min + Math.random() * (max - min);
}

function inteiroEntre(min, max) {
  return Math.round(aleatorioEntre(min, max));
}

function escolher(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

async function semearPerfil() {
  await Dados.salvarPerfil({ alturaCm: 178, nascimento: '1990-01-01', sexo: 'M' });
}

async function semearCatalogoMarcadores() {
  await Dados.criarMarcadorCatalogo({
    codigo: 'glicemia',
    nome: 'Glicemia',
    unidade: 'mg/dL',
    casasDecimais: 0,
    contextos: ['jejum', 'pos_prandial', 'aleatorio'],
    faixaReferencia: { min: null, max: null },
    direcaoDesejada: 'manter',
  });
  await Dados.criarMarcadorCatalogo({
    codigo: 'pressao_sistolica',
    nome: 'Pressão sistólica',
    unidade: 'mmHg',
    casasDecimais: 0,
    contextos: ['manha', 'noite'],
    faixaReferencia: { min: null, max: null },
    direcaoDesejada: 'reduzir',
  });
}

async function semearPeso(dias) {
  const pesoInicial = 86;
  for (let diasAtras = dias - 1; diasAtras >= 0; diasAtras -= 1) {
    const diaDecorrido = dias - 1 - diasAtras;
    const tendencia = pesoInicial - diaDecorrido * 0.035;
    const ruido = aleatorioEntre(-0.4, 0.4);
    const pesoKg = Util.arredondar(tendencia + ruido, 1);
    const registraGordura = Math.random() < 0.4;
    // eslint-disable-next-line no-await-in-loop
    await Dados.criarPeso({
      dataHora: dataHoraHaDias(diasAtras, 6, inteiroEntre(0, 30)),
      pesoKg,
      gorduraPct: registraGordura ? Util.arredondar(23 - diaDecorrido * 0.03 + aleatorioEntre(-0.5, 0.5), 1) : null,
      massaMagraKg: null,
      contexto: 'jejum',
      obs: '',
    });
  }
}

async function semearMedidas(dias) {
  for (let diasAtras = dias - 1; diasAtras >= 0; diasAtras -= 7) {
    const diaDecorrido = dias - 1 - diasAtras;
    // eslint-disable-next-line no-await-in-loop
    await Dados.criarMedidas({
      dataHora: dataHoraHaDias(diasAtras, 6, 20),
      medidas: {
        cintura: Util.arredondar(89 - diaDecorrido * 0.03, 1),
        abdomen: Util.arredondar(93 - diaDecorrido * 0.03, 1),
        quadril: Util.arredondar(100 - diaDecorrido * 0.01, 1),
        bracoRelaxadoD: Util.arredondar(34 + diaDecorrido * 0.005, 1),
        bracoRelaxadoE: Util.arredondar(33.5 + diaDecorrido * 0.005, 1),
        coxaD: Util.arredondar(58 - diaDecorrido * 0.01, 1),
        coxaE: Util.arredondar(57.5 - diaDecorrido * 0.01, 1),
      },
      obs: '',
    });
  }
}

async function semearMarcadores(dias) {
  for (let diasAtras = dias - 1; diasAtras >= 0; diasAtras -= 5) {
    // eslint-disable-next-line no-await-in-loop
    await Dados.criarMarcador({
      dataHora: dataHoraHaDias(diasAtras, 7, 0),
      codigo: 'glicemia',
      valor: inteiroEntre(85, 100),
      contexto: 'jejum',
      origem: 'aparelho',
      obs: '',
    });
    if (diasAtras % 10 === 0) {
      // eslint-disable-next-line no-await-in-loop
      await Dados.criarMarcador({
        dataHora: dataHoraHaDias(diasAtras, 7, 30),
        codigo: 'pressao_sistolica',
        valor: inteiroEntre(112, 128),
        contexto: 'manha',
        origem: 'manual',
        obs: '',
      });
    }
  }
}

function gerarExerciciosDetalhados() {
  const nomes = ['Supino reto', 'Remada curvada', 'Agachamento livre', 'Desenvolvimento militar'];
  const nome = escolher(nomes);
  const cargaBase = inteiroEntre(40, 80);
  return [{
    nome,
    series: [
      { reps: inteiroEntre(8, 12), cargaKg: cargaBase, rpe: inteiroEntre(6, 7) },
      { reps: inteiroEntre(6, 10), cargaKg: cargaBase + 5, rpe: inteiroEntre(7, 8) },
      { reps: inteiroEntre(4, 8), cargaKg: cargaBase + 10, rpe: inteiroEntre(8, 9) },
    ],
  }];
}

async function semearTreinos(dias) {
  for (let diasAtras = dias - 1; diasAtras >= 0; diasAtras -= 1) {
    const diaDaSemana = new Date(Date.now() - diasAtras * 86400000).getDay();
    const treinaHoje = [1, 2, 4, 5].includes(diaDaSemana) && Math.random() < 0.85;
    if (!treinaHoje) continue; // eslint-disable-line no-continue
    const tipo = Math.random() < 0.75 ? 'forca' : 'cardio';
    const horaInicio = inteiroEntre(17, 20);
    const inicio = dataHoraHaDias(diasAtras, horaInicio, inteiroEntre(0, 45));
    const duracaoMin = tipo === 'forca' ? inteiroEntre(45, 75) : inteiroEntre(25, 45);
    const fimData = new Date(new Date(inicio).getTime() + duracaoMin * 60000);
    const fim = Util.dataParaISOSaoPaulo(fimData);
    const detalhar = tipo === 'forca' && Math.random() < 0.5;
    // eslint-disable-next-line no-await-in-loop
    await Dados.criarTreino({
      inicio,
      fim,
      duracaoMin: Util.calcularDuracaoMin(inicio, fim),
      tipo,
      foco: tipo === 'forca' ? [escolher(Seed.FOCOS_FORCA), escolher(Seed.FOCOS_FORCA)] : ['cardio'],
      local: 'academia',
      descricao: tipo === 'forca' ? 'Treino de força, sessão consistente.' : 'Cardio moderado.',
      sensacao: {
        energia: inteiroEntre(3, 5),
        dorMuscular: inteiroEntre(1, 4),
        humor: inteiroEntre(3, 5),
        rpe: inteiroEntre(5, 9),
      },
      exercicios: detalhar ? gerarExerciciosDetalhados() : [],
      tags: [],
    });
  }
}

async function semearMetas() {
  await Dados.criarMeta({
    tipo: 'valor',
    metrica: 'pesoKg',
    alvo: 79,
    direcao: 'reduzir',
    valorInicial: 86,
    inicio: Util.hojeISO(),
    prazo: null,
    ativa: true,
  });
  await Dados.criarMeta({
    tipo: 'frequencia',
    metrica: 'treinos',
    filtro: { tipo: 'forca' },
    alvo: 4,
    janela: 'semana',
    inicio: Util.hojeISO(),
    prazo: null,
    ativa: true,
  });
}

Seed.gerar = async function gerar(dias = Seed.DIAS_PADRAO) {
  await Dados.limparTudo();
  await semearPerfil();
  await semearCatalogoMarcadores();
  await semearPeso(dias);
  await semearMedidas(dias);
  await semearMarcadores(dias);
  await semearTreinos(dias);
  await semearMetas();
  return Dados.contarTudo();
};
