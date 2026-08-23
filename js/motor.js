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

// =====================================================================
// Métricas derivadas (seção 3.1 do plano)
// =====================================================================

// --- Filtro por período, usado pela tela Relatório ---

Motor.PERIODOS = {
  '30d': 30, '90d': 90, '6m': 182, '1a': 365, tudo: null,
};

Motor.filtrarPorPeriodo = function filtrarPorPeriodo(lista, campoData, periodo) {
  const dias = Motor.PERIODOS[periodo];
  if (dias === null || dias === undefined) return lista;
  const limiteYMD = Motor._somarDiasYMD(Util.hojeISO(), -dias);
  return lista.filter((item) => Util.diaEmSaoPaulo(new Date(item[campoData])) >= limiteYMD);
};

// --- Peso e composição ---

// Média das últimas N leituras (não dias de calendário) — o peso diário é ruído, a média é o sinal.
Motor.mediaMovel = function mediaMovel(pontos, janela = 7) {
  const ordenados = pontos.slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  return ordenados.map((p, i) => {
    const fatia = ordenados.slice(Math.max(0, i - janela + 1), i + 1);
    const media = fatia.reduce((soma, x) => soma + x.valor, 0) / fatia.length;
    return { dataHora: p.dataHora, valor: Util.arredondar(media, 2) };
  });
};

// Inclinação da regressão linear das últimas N semanas, em unidade/semana.
Motor.taxaSemanal = function taxaSemanal(pontos, semanas = 4) {
  if (pontos.length < 2) return null;
  const ordenados = pontos.slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const limiteYMD = Motor._somarDiasYMD(Util.hojeISO(), -7 * semanas);
  const recentes = ordenados.filter((p) => Util.diaEmSaoPaulo(new Date(p.dataHora)) >= limiteYMD);
  const base = recentes.length >= 2 ? recentes : ordenados;
  if (base.length < 2) return null;
  const regressao = Motor.regressaoLinear(base.map((p) => ({ x: Motor._paraDias(p.dataHora), y: p.valor })));
  return regressao ? Util.arredondar(regressao.inclinacao * 7, 3) : null;
};

// Projeção de data de chegada no alvo, dado o ritmo semanal atual. null quando o ritmo diverge do alvo.
Motor.etaMeta = function etaMeta(valorAtual, alvo, taxaSemanalValor) {
  if (!Util.ehNumero(taxaSemanalValor) || taxaSemanalValor === 0) return null;
  const faltante = alvo - valorAtual;
  if (Math.sign(faltante) !== Math.sign(taxaSemanalValor)) return null;
  const diasNecessarios = Math.max(1, Math.round((faltante / taxaSemanalValor) * 7));
  return { diasNecessarios, dataYMD: Motor._somarDiasYMD(Util.hojeISO(), diasNecessarios) };
};

Motor.imc = function imc(pesoKg, alturaCm) {
  if (!Util.ehNumero(pesoKg) || !Util.ehNumero(alturaCm) || alturaCm <= 0) return null;
  const alturaM = alturaCm / 100;
  return Util.arredondar(pesoKg / (alturaM * alturaM), 1);
};

Motor.variacaoAcumulada = function variacaoAcumulada(pontos) {
  if (pontos.length < 2) return null;
  const ordenados = pontos.slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  return Util.arredondar(ordenados[ordenados.length - 1].valor - ordenados[0].valor, 2);
};

// --- Medidas corporais ---

Motor.rcest = function rcest(cinturaCm, alturaCm) {
  if (!Util.ehNumero(cinturaCm) || !Util.ehNumero(alturaCm) || alturaCm <= 0) return null;
  return Util.arredondar(cinturaCm / alturaCm, 2);
};

Motor.rcq = function rcq(cinturaCm, quadrilCm) {
  if (!Util.ehNumero(cinturaCm) || !Util.ehNumero(quadrilCm) || quadrilCm <= 0) return null;
  return Util.arredondar(cinturaCm / quadrilCm, 2);
};

Motor.perimetroSomado = function perimetroSomado(medidas) {
  if (!medidas) return null;
  const valores = Object.values(medidas).filter((v) => Util.ehNumero(v));
  if (valores.length === 0) return null;
  return Util.arredondar(valores.reduce((soma, v) => soma + v, 0), 1);
};

Motor.PARES_BILATERAIS = [
  ['bracoRelaxadoD', 'bracoRelaxadoE'],
  ['bracoContraidoD', 'bracoContraidoE'],
  ['antebracoD', 'antebracoE'],
  ['coxaD', 'coxaE'],
  ['panturrilhaD', 'panturrilhaE'],
];

Motor.assimetriaBilateral = function assimetriaBilateral(medidas) {
  const resultado = {};
  if (!medidas) return resultado;
  Motor.PARES_BILATERAIS.forEach(([d, e]) => {
    if (Util.ehNumero(medidas[d]) && Util.ehNumero(medidas[e])) {
      resultado[d.replace(/D$/, '')] = Util.arredondar(Math.abs(medidas[d] - medidas[e]), 1);
    }
  });
  return resultado;
};

// Variação de um campo de medida nos últimos N dias (contra o registro mais próximo antes desse limite).
Motor.deltaSegmento = function deltaSegmento(registrosMedidas, campo, dias) {
  const comCampo = registrosMedidas
    .filter((r) => Util.ehNumero(r.medidas && r.medidas[campo]))
    .slice()
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  if (comCampo.length === 0) return null;
  const ultimo = comCampo[comCampo.length - 1];
  const limiteYMD = Motor._somarDiasYMD(Util.diaEmSaoPaulo(new Date(ultimo.dataHora)), -dias);
  const referencia = comCampo.filter((r) => Util.diaEmSaoPaulo(new Date(r.dataHora)) <= limiteYMD).pop();
  if (!referencia) return null;
  return Util.arredondar(ultimo.medidas[campo] - referencia.medidas[campo], 1);
};

// --- Treino ---

Motor.frequenciaSemanal = function frequenciaSemanal(treinos, semanas = 4) {
  const hojeYMD = Util.hojeISO();
  let total = 0;
  for (let i = 0; i < semanas; i += 1) {
    const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
    const limites = Motor.limitesJanela('semana', refYMD);
    total += treinos.filter((t) => Motor._dentroDaJanela(t.inicio, limites)).length;
  }
  return Util.arredondar(total / semanas, 2);
};

// Tonelagem: Σ (reps × carga), só disponível para treinos com bloco de exercícios detalhado.
Motor.volumeTreino = function volumeTreino(treino) {
  if (!treino.exercicios || treino.exercicios.length === 0) return null;
  let total = 0;
  treino.exercicios.forEach((ex) => {
    ex.series.forEach((s) => {
      if (Util.ehNumero(s.reps) && Util.ehNumero(s.cargaKg)) total += s.reps * s.cargaKg;
    });
  });
  return Util.arredondar(total, 1);
};

// Tonelagem agregada por grupo muscular (foco), distribuindo o volume do treino entre os focos declarados.
Motor.volumePorGrupo = function volumePorGrupo(treinos) {
  const resultado = {};
  treinos.forEach((t) => {
    const volume = Motor.volumeTreino(t);
    if (volume === null || !t.foco || t.foco.length === 0) return;
    const porGrupo = volume / t.foco.length;
    t.foco.forEach((f) => { resultado[f] = Util.arredondar((resultado[f] || 0) + porGrupo, 1); });
  });
  return resultado;
};

// Epley: carga × (1 + reps ÷ 30) — compara séries de faixas de repetição diferentes.
Motor.rm1Estimado = function rm1Estimado(cargaKg, reps) {
  if (!Util.ehNumero(cargaKg) || !Util.ehNumero(reps) || reps <= 0) return null;
  return Util.arredondar(cargaKg * (1 + reps / 30), 1);
};

Motor.densidade = function densidade(treino) {
  const volume = Motor.volumeTreino(treino);
  if (volume === null || !Util.ehNumero(treino.duracaoMin) || treino.duracaoMin <= 0) return null;
  return Util.arredondar(volume / treino.duracaoMin, 1);
};

Motor.tempoTotalSemanal = function tempoTotalSemanal(treinos, semanaRefYMD) {
  const limites = Motor.limitesJanela('semana', semanaRefYMD || Util.hojeISO());
  return treinos
    .filter((t) => Motor._dentroDaJanela(t.inicio, limites))
    .reduce((soma, t) => soma + (t.duracaoMin || 0), 0);
};
