const Cockpit = {};

// Fase 8 — exportação para o cockpit dos Quatro Pilares, formato exato do
// CONTRATO-DE-DADOS.md (pilar, rotulo, atualizado_em, score_atual, indicadores,
// score_semanal, marcos, registros). streak_dias e variacao_peso_30d_kg são
// campos extras, fora do contrato — o cockpit.html ignora chaves desconhecidas.

Cockpit.SEMANAS_HISTORICO = 8;
Cockpit.LIMIAR_MARCO_DIAS = 90;
Cockpit.DIAS_REGISTROS_BRUTOS = 30;

// --- Rótulo/unidade legível para o indicador de uma meta ---

Cockpit._rotuloMeta = function _rotuloMeta(meta, contexto) {
  if (meta.tipo === 'frequencia') {
    const sufixoFiltro = meta.filtro && meta.filtro.tipo ? ` de ${meta.filtro.tipo}` : '';
    return { nome: `Frequência${sufixoFiltro}`, unidade: `sessões/${meta.janela}` };
  }
  if (meta.metrica === 'pesoKg') return { nome: 'Peso', unidade: 'kg' };
  if (meta.metrica === 'duracaoMinSemanal') return { nome: 'Duração semanal de treino', unidade: 'min/semana' };
  if (meta.metrica.startsWith('medidas.')) return { nome: `Medida: ${meta.metrica.split('.')[1]}`, unidade: 'cm' };
  const marcador = contexto.catalogoMarcadores.find((m) => m.codigo === meta.metrica);
  if (marcador) return { nome: marcador.nome, unidade: marcador.unidade };
  return { nome: meta.metrica, unidade: '' };
};

// --- Indicador de uma meta numa data de referência (hoje, ou o fim de uma semana passada) ---
// Não reaproveita Motor.calcularProgressoMeta porque ele sempre ancora em Util.hojeISO() —
// aqui precisamos recalcular "quanto valia isso no fim daquela semana" para o score_semanal.

Cockpit._contagemFrequenciaEm = function _contagemFrequenciaEm(meta, contexto, refYMD) {
  const limites = Motor.limitesJanela(meta.janela, refYMD);
  const filtrados = Motor._filtrarTreinos(contexto.treinos, meta.filtro);
  return filtrados.filter((t) => Motor._dentroDaJanela(t.inicio, limites)).length;
};

Cockpit._valorMetricaEm = function _valorMetricaEm(meta, contexto, refYMD) {
  const serie = Motor._serieMetrica(meta.metrica, contexto)
    .filter((p) => Util.diaEmSaoPaulo(new Date(p.dataHora)) <= refYMD)
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  return serie.length ? serie[serie.length - 1].valor : meta.valorInicial;
};

Cockpit._indicadorDeMeta = function _indicadorDeMeta(meta, contexto, refYMD) {
  const rotulo = Cockpit._rotuloMeta(meta, contexto);
  if (meta.tipo === 'frequencia') {
    return {
      id: meta.id,
      nome: rotulo.nome,
      valor: Cockpit._contagemFrequenciaEm(meta, contexto, refYMD),
      meta: meta.alvo,
      unidade: rotulo.unidade,
      direcao: 'maior_melhor',
    };
  }
  return {
    id: meta.id,
    nome: rotulo.nome,
    valor: Util.arredondar(Cockpit._valorMetricaEm(meta, contexto, refYMD), 2),
    meta: meta.alvo,
    unidade: rotulo.unidade,
    direcao: meta.direcao === 'reduzir' ? 'menor_melhor' : 'maior_melhor',
  };
};

// --- Score (seção 3 do contrato): atingimento por indicador, limitado a 1.0, média (ponderada por "peso" se houver) ---

Cockpit._atingimento = function _atingimento(indicador) {
  const valor = Number(indicador.valor);
  const alvo = Number(indicador.meta);
  if (!Number.isFinite(valor) || !Number.isFinite(alvo) || alvo === 0) return 0;
  const bruto = indicador.direcao === 'menor_melhor' ? alvo / valor : valor / alvo;
  if (!Number.isFinite(bruto)) return valor <= 0 ? 1 : 0; // menor_melhor com valor=0 já bateu a meta
  return Math.max(0, Math.min(1, bruto));
};

Cockpit._calcularScore = function _calcularScore(indicadores) {
  if (indicadores.length === 0) return null;
  let somaPesos = 0;
  let somaPonderada = 0;
  indicadores.forEach((ind) => {
    const peso = Util.ehNumero(ind.peso) ? ind.peso : 1;
    somaPonderada += Cockpit._atingimento(ind) * peso;
    somaPesos += peso;
  });
  return Math.round((somaPonderada / somaPesos) * 100);
};

// --- Histórico semanal: recalcula o score para cada uma das últimas N semanas fechadas.
// Aproximação: usa o conjunto de metas ativas hoje (não há histórico de quando cada meta
// foi ativada/desativada), mas só considera a meta se ela já existia (meta.inicio) até o
// fim daquela semana. Suficiente para a leitura de tendência do cockpit.

Cockpit._calcularScoreSemanal = function _calcularScoreSemanal(metasAtivas, contexto, hojeYMD, semanas) {
  const historico = [];
  for (let i = semanas; i >= 1; i -= 1) {
    const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
    const limites = Motor.limitesJanela('semana', refYMD);
    const metasNaSemana = metasAtivas.filter((m) => m.inicio <= limites.fim);
    const indicadores = metasNaSemana.map((m) => Cockpit._indicadorDeMeta(m, contexto, limites.fim));
    const score = Cockpit._calcularScore(indicadores);
    if (score !== null) historico.push({ semana: Motor.semanaISO(limites.fim), score });
  }
  return historico;
};

// --- Marcos: metas ativas com prazo vencido ou vencendo nos próximos 90 dias ---

Cockpit._construirMarcos = function _construirMarcos(metasAtivas, contexto, hojeYMD) {
  const limiteYMD = Motor._somarDiasYMD(hojeYMD, Cockpit.LIMIAR_MARCO_DIAS);
  return metasAtivas
    .filter((m) => m.prazo && m.prazo <= limiteYMD)
    .map((m) => {
      const progresso = Motor.calcularProgressoMeta(m, contexto);
      const rotulo = Cockpit._rotuloMeta(m, contexto);
      let status = 'pendente';
      if (progresso.statusProjecao === 'atingida') status = 'concluido';
      else if (m.prazo < hojeYMD) status = 'vencido';
      return { titulo: `Meta: ${rotulo.nome}`, data: m.prazo, status };
    });
};

// --- Registros brutos (opcional para o cockpit) — últimos 30 dias de peso e treino ---

Cockpit._construirRegistros = function _construirRegistros(contexto, hojeYMD) {
  const limiteYMD = Motor._somarDiasYMD(hojeYMD, -Cockpit.DIAS_REGISTROS_BRUTOS);
  const registros = [];
  contexto.pesos.forEach((r) => {
    const dia = Util.diaEmSaoPaulo(new Date(r.dataHora));
    if (dia >= limiteYMD) registros.push({ data: dia, tipo: 'peso', valor: r.pesoKg, nota: '' });
  });
  contexto.treinos.forEach((t) => {
    const dia = Util.diaEmSaoPaulo(new Date(t.inicio));
    if (dia >= limiteYMD) {
      registros.push({ data: dia, tipo: 'treino', valor: 1, nota: `${t.tipo}${t.duracaoMin ? ` ${t.duracaoMin}min` : ''}` });
    }
  });
  return registros.sort((a, b) => a.data.localeCompare(b.data));
};

// --- Streak: dias consecutivos (até hoje, ou até ontem se hoje ainda não tem registro) com pelo menos 1 registro ---

Cockpit._diasComRegistro = function _diasComRegistro(contexto) {
  const dias = new Set();
  contexto.pesos.forEach((r) => dias.add(Util.diaEmSaoPaulo(new Date(r.dataHora))));
  contexto.medidas.forEach((r) => dias.add(Util.diaEmSaoPaulo(new Date(r.dataHora))));
  contexto.marcadores.forEach((r) => dias.add(Util.diaEmSaoPaulo(new Date(r.dataHora))));
  contexto.treinos.forEach((t) => dias.add(Util.diaEmSaoPaulo(new Date(t.inicio))));
  return dias;
};

Cockpit._calcularStreak = function _calcularStreak(diasComRegistro, hojeYMD) {
  let referencia = diasComRegistro.has(hojeYMD) ? hojeYMD : Motor._somarDiasYMD(hojeYMD, -1);
  let streak = 0;
  while (diasComRegistro.has(referencia)) {
    streak += 1;
    referencia = Motor._somarDiasYMD(referencia, -1);
  }
  return streak;
};

// --- Variação de peso em 30 dias (primeiro vs. último ponto na janela) ---

Cockpit._calcularVariacaoPeso30d = function _calcularVariacaoPeso30d(contexto) {
  const pontos = Motor.filtrarPorPeriodo(contexto.pesos, 'dataHora', '30d')
    .map((r) => ({ dataHora: r.dataHora, valor: r.pesoKg }));
  return Motor.variacaoAcumulada(pontos);
};

// --- Montagem do envelope completo ---

Cockpit.montarResumo = async function montarResumo() {
  const contexto = await Insights.montarContexto();
  const hojeYMD = Util.hojeISO();
  const metasAtivas = contexto.metas.filter((m) => m.ativa);

  const indicadores = metasAtivas.map((m) => Cockpit._indicadorDeMeta(m, contexto, hojeYMD));
  const diasComRegistro = Cockpit._diasComRegistro(contexto);

  return {
    pilar: 'saude',
    rotulo: 'Saúde',
    atualizado_em: hojeYMD,
    score_atual: Cockpit._calcularScore(indicadores),
    indicadores,
    score_semanal: Cockpit._calcularScoreSemanal(metasAtivas, contexto, hojeYMD, Cockpit.SEMANAS_HISTORICO),
    marcos: Cockpit._construirMarcos(metasAtivas, contexto, hojeYMD),
    registros: Cockpit._construirRegistros(contexto, hojeYMD),
    streak_dias: Cockpit._calcularStreak(diasComRegistro, hojeYMD),
    variacao_peso_30d_kg: Cockpit._calcularVariacaoPeso30d(contexto),
  };
};

Cockpit.exportarJSON = async function exportarJSON() {
  const resumo = await Cockpit.montarResumo();
  const blob = new Blob([JSON.stringify(resumo, null, 2)], { type: 'application/json' });
  Sync._baixarBlob(blob, 'saude.json');
};
