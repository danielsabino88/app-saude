const Motor = {};

Motor.MS_DIA = 86400000;

// --- Regressão linear simples (mínimos quadrados) ---

Motor.regressaoLinear = function regressaoLinear(pontos) {
  const n = pontos.length;
  if (n < 2) return null;
  let somaX = 0;
  let somaY = 0;
  let somaXY = 0;
  let somaX2 = 0;
  pontos.forEach((p) => {
    somaX += p.x;
    somaY += p.y;
    somaXY += p.x * p.y;
    somaX2 += p.x * p.x;
  });
  const denominador = n * somaX2 - somaX * somaX;
  if (denominador === 0) return null;
  const inclinacao = (n * somaXY - somaX * somaY) / denominador;
  const intercepto = (somaY - inclinacao * somaX) / n;
  return { inclinacao, intercepto };
};

// --- Aritmética de datas por calendário (YYYY-MM-DD), sem depender de fuso do navegador ---
// O app usa sempre offset fixo -03:00 (sem horário de verão no Brasil desde 2019), então
// comparar/somar datas por meio-dia UTC evita qualquer ambiguidade de fuso local da máquina.

Motor._diaSemanaISO = function _diaSemanaISO(dataYMD) {
  return new Date(`${dataYMD}T12:00:00Z`).getUTCDay(); // 0=domingo .. 6=sábado
};

Motor._somarDiasYMD = function _somarDiasYMD(dataYMD, dias) {
  const data = new Date(`${dataYMD}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

Motor._retrocederMesesYMD = function _retrocederMesesYMD(dataYMD, meses) {
  const [ano, mes, dia] = dataYMD.split('-').map(Number);
  const totalMeses = ano * 12 + (mes - 1) - meses;
  const anoNovo = Math.floor(totalMeses / 12);
  const mesNovo = (totalMeses % 12) + 1;
  const diaClamp = Math.min(dia, 28);
  return `${anoNovo}-${String(mesNovo).padStart(2, '0')}-${String(diaClamp).padStart(2, '0')}`;
};

Motor._diasEntreYMD = function _diasEntreYMD(deYMD, ateYMD) {
  return Math.round((new Date(`${ateYMD}T12:00:00Z`).getTime() - new Date(`${deYMD}T12:00:00Z`).getTime()) / Motor.MS_DIA);
};

Motor._paraDias = function _paraDias(dataHoraISO) {
  return new Date(dataHoraISO).getTime() / Motor.MS_DIA;
};

Motor.limitesJanela = function limitesJanela(janela, dataRefYMD) {
  if (janela === 'semana') {
    const diaSemana = Motor._diaSemanaISO(dataRefYMD);
    const deslocamento = (diaSemana + 6) % 7; // dias desde a última segunda-feira
    const inicio = Motor._somarDiasYMD(dataRefYMD, -deslocamento);
    const fim = Motor._somarDiasYMD(inicio, 6);
    return { inicio, fim };
  }
  if (janela === 'mes') {
    const inicio = `${dataRefYMD.slice(0, 7)}-01`;
    const primeiroDoProximoMes = `${Motor._somarDiasYMD(inicio, 32).slice(0, 7)}-01`;
    const fim = Motor._somarDiasYMD(primeiroDoProximoMes, -1);
    return { inicio, fim };
  }
  throw new Error(`Janela desconhecida: ${janela}`);
};

Motor._dentroDaJanela = function _dentroDaJanela(dataHoraISO, limites) {
  const dia = Util.diaEmSaoPaulo(new Date(dataHoraISO));
  return dia >= limites.inicio && dia <= limites.fim;
};

// --- Série histórica de uma métrica de meta, a partir dos registros já carregados ---

Motor._serieDuracaoMinSemanal = function _serieDuracaoMinSemanal(treinos, semanas = 8) {
  const hojeYMD = Util.hojeISO();
  const pontos = [];
  for (let i = semanas - 1; i >= 0; i -= 1) {
    const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
    const limites = Motor.limitesJanela('semana', refYMD);
    const total = treinos
      .filter((t) => Motor._dentroDaJanela(t.inicio, limites))
      .reduce((soma, t) => soma + (t.duracaoMin || 0), 0);
    pontos.push({ dataHora: `${limites.fim}T23:59:59-03:00`, valor: total });
  }
  return pontos;
};

Motor._serieMetrica = function _serieMetrica(metrica, contexto) {
  if (metrica === 'pesoKg') {
    return contexto.pesos.map((r) => ({ dataHora: r.dataHora, valor: r.pesoKg }));
  }
  if (metrica === 'duracaoMinSemanal') {
    return Motor._serieDuracaoMinSemanal(contexto.treinos);
  }
  if (metrica.startsWith('medidas.')) {
    const campo = metrica.split('.')[1];
    return contexto.medidas
      .filter((r) => r.medidas && r.medidas[campo] !== null && r.medidas[campo] !== undefined)
      .map((r) => ({ dataHora: r.dataHora, valor: r.medidas[campo] }));
  }
  // qualquer outro valor de "metrica" é tratado como código de marcador do catálogo
  return contexto.marcadores
    .filter((r) => r.codigo === metrica)
    .map((r) => ({ dataHora: r.dataHora, valor: r.valor }));
};

// --- Meta tipo "valor" ---

Motor.calcularMetaValor = function calcularMetaValor(meta, contexto) {
  const serie = Motor._serieMetrica(meta.metrica, contexto).slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const agora = Util.agoraISO();
  const pontosAteAgora = serie.filter((p) => p.dataHora <= agora);
  const ultimo = pontosAteAgora.length ? pontosAteAgora[pontosAteAgora.length - 1] : null;
  const valorAtual = ultimo ? ultimo.valor : meta.valorInicial;

  const distanciaTotal = meta.direcao === 'reduzir' ? meta.valorInicial - meta.alvo : meta.alvo - meta.valorInicial;
  const distanciaPercorrida = meta.direcao === 'reduzir' ? meta.valorInicial - valorAtual : valorAtual - meta.valorInicial;
  const progressoPctBruto = distanciaTotal !== 0
    ? (distanciaPercorrida / distanciaTotal) * 100
    : (valorAtual === meta.alvo ? 100 : 0);
  const progressoPct = Util.arredondar(Math.max(0, Math.min(140, progressoPctBruto)), 0);

  const hojeYMD = Util.hojeISO();
  const limiteRegressaoYMD = Motor._somarDiasYMD(hojeYMD, -28);
  const pontosRecentes = pontosAteAgora.filter((p) => Util.diaEmSaoPaulo(new Date(p.dataHora)) >= limiteRegressaoYMD);
  const baseRegressao = pontosRecentes.length >= 2 ? pontosRecentes : pontosAteAgora;
  const regressao = baseRegressao.length >= 2
    ? Motor.regressaoLinear(baseRegressao.map((p) => ({ x: Motor._paraDias(p.dataHora), y: p.valor })))
    : null;
  const ritmoSemanalBruto = regressao ? regressao.inclinacao * 7 : null;
  const sinalDirecao = meta.direcao === 'reduzir' ? -1 : 1;
  const ritmoSemanal = ritmoSemanalBruto !== null ? Util.arredondar(ritmoSemanalBruto * sinalDirecao, 2) : null;

  let ritmoNecessarioSemanal = null;
  let diasRestantes = null;
  if (meta.prazo) {
    diasRestantes = Motor._diasEntreYMD(hojeYMD, meta.prazo);
    const faltante = meta.direcao === 'reduzir' ? valorAtual - meta.alvo : meta.alvo - valorAtual;
    if (diasRestantes > 0) {
      ritmoNecessarioSemanal = Util.arredondar((faltante / diasRestantes) * 7, 2);
    } else {
      ritmoNecessarioSemanal = faltante > 0 ? Infinity : 0;
    }
  }

  const metaAtingida = meta.direcao === 'reduzir' ? valorAtual <= meta.alvo : valorAtual >= meta.alvo;
  let statusProjecao;
  let projecaoData = null;
  if (metaAtingida) {
    statusProjecao = 'atingida';
    projecaoData = ultimo ? Util.diaEmSaoPaulo(new Date(ultimo.dataHora)) : hojeYMD;
  } else if (ritmoSemanalBruto === null) {
    statusProjecao = 'sem_dados';
  } else {
    const faltanteBruto = meta.alvo - valorAtual;
    if (ritmoSemanalBruto !== 0 && Math.sign(ritmoSemanalBruto) === Math.sign(faltanteBruto)) {
      const semanasNecessarias = faltanteBruto / ritmoSemanalBruto;
      const diasNecessarios = Math.max(1, Math.round(semanasNecessarias * 7));
      projecaoData = Motor._somarDiasYMD(hojeYMD, diasNecessarios);
      statusProjecao = 'convergindo';
    } else {
      statusProjecao = 'divergindo';
    }
  }

  return {
    valorAtual, progressoPct, ritmoSemanal, ritmoNecessarioSemanal, diasRestantes, projecaoData, statusProjecao,
  };
};

// --- Meta tipo "frequência" ---

Motor._filtrarTreinos = function _filtrarTreinos(treinos, filtro) {
  if (!filtro) return treinos;
  return treinos.filter((t) => Object.keys(filtro).every((chave) => t[chave] === filtro[chave]));
};

Motor._mediaFrequenciaHistorica = function _mediaFrequenciaHistorica(treinosFiltrados, janela, hojeYMD, quantidadeJanelas = 4) {
  let soma = 0;
  for (let i = 1; i <= quantidadeJanelas; i += 1) {
    const refYMD = janela === 'semana' ? Motor._somarDiasYMD(hojeYMD, -7 * i) : Motor._retrocederMesesYMD(hojeYMD, i);
    const limites = Motor.limitesJanela(janela, refYMD);
    soma += treinosFiltrados.filter((t) => Motor._dentroDaJanela(t.inicio, limites)).length;
  }
  return Util.arredondar(soma / quantidadeJanelas, 1);
};

Motor.calcularMetaFrequencia = function calcularMetaFrequencia(meta, contexto) {
  const hojeYMD = Util.hojeISO();
  const limites = Motor.limitesJanela(meta.janela, hojeYMD);
  const treinosFiltrados = Motor._filtrarTreinos(contexto.treinos, meta.filtro);

  const contagemAtual = treinosFiltrados.filter((t) => Motor._dentroDaJanela(t.inicio, limites)).length;
  const progressoPct = Util.arredondar(Math.max(0, Math.min(140, (contagemAtual / meta.alvo) * 100)), 0);

  const diasNaJanela = Motor._diasEntreYMD(limites.inicio, limites.fim) + 1;
  const diasDecorridos = Math.min(diasNaJanela, Motor._diasEntreYMD(limites.inicio, hojeYMD) + 1);
  const diasRestantesJanela = diasNaJanela - diasDecorridos;

  const ritmoAtualPorDia = diasDecorridos > 0 ? contagemAtual / diasDecorridos : 0;
  const faltam = Math.max(0, meta.alvo - contagemAtual);
  const ritmoNecessarioPorDia = diasRestantesJanela > 0
    ? Util.arredondar(faltam / diasRestantesJanela, 2)
    : (faltam > 0 ? Infinity : 0);

  let statusProjecao;
  let projecaoData = null;
  if (contagemAtual >= meta.alvo) {
    statusProjecao = 'atingida';
    projecaoData = hojeYMD;
  } else if (ritmoAtualPorDia <= 0) {
    statusProjecao = 'sem_dados';
  } else {
    const diasNecessarios = Math.ceil(meta.alvo / ritmoAtualPorDia);
    if (diasNecessarios <= diasNaJanela) {
      projecaoData = Motor._somarDiasYMD(limites.inicio, diasNecessarios - 1);
      statusProjecao = 'convergindo';
    } else {
      statusProjecao = 'divergindo';
    }
  }

  const mediaHistorica = Motor._mediaFrequenciaHistorica(treinosFiltrados, meta.janela, hojeYMD);

  return {
    contagemAtual,
    progressoPct,
    limites,
    diasNaJanela,
    diasDecorridos,
    diasRestantesJanela,
    ritmoAtualPorDia: Util.arredondar(ritmoAtualPorDia, 2),
    ritmoNecessarioPorDia,
    projecaoData,
    statusProjecao,
    mediaHistorica,
  };
};

// --- Despachante ---

Motor.calcularProgressoMeta = function calcularProgressoMeta(meta, contexto) {
  if (meta.tipo === 'valor') return Motor.calcularMetaValor(meta, contexto);
  if (meta.tipo === 'frequencia') return Motor.calcularMetaFrequencia(meta, contexto);
  throw new Error(`Tipo de meta desconhecido: ${meta.tipo}`);
};
