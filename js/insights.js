const Insights = {};

// Régua honesta (seção 3.2): sem amostra mínima, correlação é coincidência.
// Cada regra devolve null quando não tem pontos suficientes, ou {texto, amostra} quando dispara.
Insights.MINIMO_DISPERSAO = 8;
Insights.MINIMO_SEMANAS_TENDENCIA = 3;
Insights.MINIMO_MARCADOR = 5;
Insights.LIMIAR_LACUNA_DIAS = 10;
Insights.LIMIAR_RECOMPOSICAO_DIAS = 30;

// Mapa heurístico grupo muscular → campo de medida corporal mais próximo (usado só pela regra 6).
Insights.MAPA_FOCO_MEDIDA = {
  peito: 'toraxPeito', biceps: 'bracoContraidoD', triceps: 'bracoContraidoD', perna: 'coxaD', gluteos: 'quadril', abdomen: 'abdomen',
};

Insights._horaEmSaoPaulo = function _horaEmSaoPaulo(iso) {
  return Number(Util.formatarDataHoraBR(iso).split(' ')[1].split(':')[0]);
};

Insights._mediaSensacao = function _mediaSensacao(sensacao) {
  return (sensacao.energia + sensacao.humor + (11 - sensacao.dorMuscular)) / 3;
};

Insights._correlacaoSimples = function _correlacaoSimples(pares) {
  const n = pares.length;
  if (n < 2) return null;
  const mediaX = pares.reduce((s, p) => s + p.x, 0) / n;
  const mediaY = pares.reduce((s, p) => s + p.y, 0) / n;
  let num = 0; let denX = 0; let denY = 0;
  pares.forEach((p) => {
    num += (p.x - mediaX) * (p.y - mediaY);
    denX += (p.x - mediaX) ** 2;
    denY += (p.y - mediaY) ** 2;
  });
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
};

// =====================================================================
// Consistência
// =====================================================================

// 1. Platô detectado — média móvel de peso variou menos de 0,3 kg em 3 semanas seguidas.
Insights._plato = function _plato(ctx) {
  if (ctx.pesos.length < 15) return null;
  const serieMM = Motor.mediaMovel(ctx.pesos.map((p) => ({ dataHora: p.dataHora, valor: p.pesoKg })), 7);
  const hojeYMD = Util.hojeISO();
  const mediasSemanais = [];
  for (let i = 0; i < 3; i += 1) {
    const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
    const limites = Motor.limitesJanela('semana', refYMD);
    const pontos = serieMM.filter((p) => Motor._dentroDaJanela(p.dataHora, limites));
    if (pontos.length === 0) return null;
    mediasSemanais.push(pontos.reduce((s, p) => s + p.valor, 0) / pontos.length);
  }
  const variacao = Util.arredondar(Math.max(...mediasSemanais) - Math.min(...mediasSemanais), 2);
  if (variacao >= 0.3) return null;
  return { texto: `Seu peso está estável há 3 semanas — variação de ${Util.formatarNumero(variacao, 2)} kg na média móvel. Pode ser hora de ajustar o plano.`, amostra: ctx.pesos.length };
};

// 2. Semana de queda de aderência — frequência caiu abaixo da meta por 2 semanas consecutivas.
Insights._quedaAderencia = function _quedaAderencia(ctx) {
  const metasFreq = ctx.metas.filter((m) => m.tipo === 'frequencia' && m.ativa && m.janela === 'semana');
  if (metasFreq.length === 0) return null;
  const hojeYMD = Util.hojeISO();
  const achados = [];
  metasFreq.forEach((meta) => {
    const treinosFiltrados = Motor._filtrarTreinos(ctx.treinos, meta.filtro);
    let semanasAbaixo = 0;
    for (let i = 1; i <= 2; i += 1) {
      const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
      const limites = Motor.limitesJanela('semana', refYMD);
      const contagem = treinosFiltrados.filter((t) => Motor._dentroDaJanela(t.inicio, limites)).length;
      if (contagem < meta.alvo) semanasAbaixo += 1;
    }
    if (semanasAbaixo === 2) {
      const rotulo = meta.filtro && meta.filtro.tipo ? `treinos de ${meta.filtro.tipo}` : 'treinos';
      achados.push(`meta de ${rotulo} (${meta.alvo}/semana)`);
    }
  });
  if (achados.length === 0) return null;
  return { texto: `Frequência abaixo da meta nas últimas 2 semanas: ${achados.join('; ')}.`, amostra: 2 };
};

// 3. Lacuna de dados — mais de N dias sem registro de peso ou medida.
Insights._lacunaDados = function _lacunaDados(ctx) {
  const registros = [...ctx.pesos.map((r) => r.dataHora), ...ctx.medidas.map((r) => r.dataHora)];
  if (registros.length === 0) return null;
  const ultimo = registros.slice().sort().pop();
  const dias = Motor._diasEntreYMD(Util.diaEmSaoPaulo(new Date(ultimo)), Util.hojeISO());
  if (dias < Insights.LIMIAR_LACUNA_DIAS) return null;
  return { texto: `${dias} dias sem registrar peso ou medida. O gráfico desse período vai ficar sem dados.`, amostra: registros.length };
};

// =====================================================================
// Corpo × treino
// =====================================================================

// 4. Recomposição — peso estável (±0,5 kg) e perímetro somado caindo no mesmo período.
Insights._recomposicao = function _recomposicao(ctx) {
  const medidasComPerimetro = ctx.medidas.filter((m) => Motor.perimetroSomado(m.medidas) !== null);
  if (medidasComPerimetro.length < 2 || ctx.pesos.length < 2) return null;
  const primeira = medidasComPerimetro[0];
  const ultima = medidasComPerimetro[medidasComPerimetro.length - 1];
  const diasSpan = Motor._diasEntreYMD(Util.diaEmSaoPaulo(new Date(primeira.dataHora)), Util.diaEmSaoPaulo(new Date(ultima.dataHora)));
  if (diasSpan < Insights.LIMIAR_RECOMPOSICAO_DIAS) return null;

  const deltaPerimetro = Motor.perimetroSomado(ultima.medidas) - Motor.perimetroSomado(primeira.medidas);
  const pesosNoIntervalo = ctx.pesos.filter((p) => p.dataHora >= primeira.dataHora && p.dataHora <= ultima.dataHora);
  if (pesosNoIntervalo.length < 2) return null;
  const deltaPeso = pesosNoIntervalo[pesosNoIntervalo.length - 1].pesoKg - pesosNoIntervalo[0].pesoKg;

  if (Math.abs(deltaPeso) > 0.5 || deltaPerimetro >= -1) return null;
  return {
    texto: `Peso estável (${deltaPeso >= 0 ? '+' : ''}${Util.formatarNumero(deltaPeso, 1)} kg) mas perímetro somado caiu ${Util.formatarNumero(Math.abs(deltaPerimetro), 1)} cm em ${diasSpan} dias — sinal de recomposição corporal (trocando gordura por músculo).`,
    amostra: pesosNoIntervalo.length + medidasComPerimetro.length,
  };
};

// 5. Resposta ao estímulo — frequência média das últimas 4 semanas × delta de peso no mesmo período.
Insights._respostaEstimulo = function _respostaEstimulo(ctx) {
  if (ctx.treinos.length < 4 || ctx.pesos.length < 4) return null;
  const freqMedia = Motor.frequenciaSemanal(ctx.treinos, 4);
  const limiteYMD = Motor._somarDiasYMD(Util.hojeISO(), -28);
  const pesosPeriodo = ctx.pesos.filter((p) => Util.diaEmSaoPaulo(new Date(p.dataHora)) >= limiteYMD);
  if (pesosPeriodo.length < 2) return null;
  const deltaPeso = Util.arredondar(pesosPeriodo[pesosPeriodo.length - 1].pesoKg - pesosPeriodo[0].pesoKg, 1);
  return {
    texto: `Nas últimas 4 semanas você treinou em média ${Util.formatarNumero(freqMedia, 1)}x/semana e seu peso variou ${deltaPeso >= 0 ? '+' : ''}${deltaPeso} kg no período.`,
    amostra: pesosPeriodo.length,
  };
};

// 6. Volume × segmento com defasagem — volume de um grupo em t-8..t-4 contra a medida do segmento em t.
Insights._volumeSegmentoDefasagem = function _volumeSegmentoDefasagem(ctx) {
  const achados = [];
  let amostraTotal = 0;
  Object.entries(Insights.MAPA_FOCO_MEDIDA).forEach(([foco, campo]) => {
    const treinosFoco = ctx.treinos.filter((t) => t.foco && t.foco.includes(foco) && t.exercicios && t.exercicios.length > 0);
    if (treinosFoco.length === 0) return;
    const hojeYMD = Util.hojeISO();
    const inicioJanela = Motor._somarDiasYMD(hojeYMD, -56);
    const fimJanela = Motor._somarDiasYMD(hojeYMD, -28);
    const treinosNaJanela = treinosFoco.filter((t) => {
      const d = Util.diaEmSaoPaulo(new Date(t.inicio));
      return d >= inicioJanela && d <= fimJanela;
    });
    const volumeJanela = treinosNaJanela.reduce((s, t) => s + (Motor.volumeTreino(t) || 0), 0);
    if (volumeJanela === 0) return;
    const delta = Motor.deltaSegmento(ctx.medidas, campo, 28);
    if (delta === null) return;
    achados.push({ foco, campo, volumeJanela: Util.arredondar(volumeJanela, 0), delta });
    amostraTotal += treinosNaJanela.length;
  });
  if (achados.length === 0) return null;
  const texto = achados
    .map((a) => `${a.foco}: ${Util.formatarNumero(a.volumeJanela, 0)} kg de volume 4-8 semanas atrás → ${a.delta >= 0 ? '+' : ''}${Util.formatarNumero(a.delta, 1)} cm em ${a.campo} nas últimas 4 semanas`)
    .join('; ');
  return { texto: `Resposta com defasagem: ${texto}.`, amostra: amostraTotal };
};

// 7. Assimetria persistente — diferença bilateral acima de 1 cm em 3 medições seguidas.
Insights._assimetriaPersistente = function _assimetriaPersistente(ctx) {
  const ultimas3 = ctx.medidas.slice(-3);
  if (ultimas3.length < 3) return null;
  const achados = [];
  Motor.PARES_BILATERAIS.forEach(([d, e]) => {
    const diffs = ultimas3.map((m) => (Util.ehNumero(m.medidas[d]) && Util.ehNumero(m.medidas[e]) ? Math.abs(m.medidas[d] - m.medidas[e]) : null));
    if (diffs.some((x) => x === null)) return;
    if (diffs.every((x) => x > 1)) achados.push({ par: d.replace(/D$/, ''), diffs });
  });
  if (achados.length === 0) return null;
  const texto = achados.map((a) => `${a.par}: ${a.diffs.map((d) => Util.formatarNumero(d, 1)).join('/')} cm`).join('; ');
  return { texto: `Assimetria bilateral persistente nas últimas 3 medições — ${texto}.`, amostra: 3 };
};

// =====================================================================
// Sensação
// =====================================================================

// 8. Curva de fadiga — RPE médio por faixa de duração da sessão.
Insights._curvaFadiga = function _curvaFadiga(ctx) {
  const validos = ctx.treinos.filter((t) => t.sensacao && Util.ehNumero(t.duracaoMin));
  if (validos.length < Insights.MINIMO_DISPERSAO) return null;
  const buckets = { curta: [], media: [], longa: [] };
  validos.forEach((t) => {
    const chave = t.duracaoMin < 45 ? 'curta' : t.duracaoMin <= 75 ? 'media' : 'longa';
    buckets[chave].push(t.sensacao.rpe);
  });
  const medias = Object.entries(buckets)
    .filter(([, v]) => v.length >= 2)
    .map(([chave, v]) => ({ chave, media: Util.arredondar(v.reduce((s, x) => s + x, 0) / v.length, 1) }));
  if (medias.length < 2) return null;
  const melhor = medias.reduce((min, m) => (m.media < min.media ? m : min), medias[0]);
  const rotulo = { curta: 'até 45min', media: '45-75min', longa: 'acima de 75min' };
  return { texto: `Sessões ${rotulo[melhor.chave]} têm o menor RPE médio (${melhor.media}) — parece ser seu ponto ótimo de duração.`, amostra: validos.length };
};

// 9. Melhor janela do dia — sensação média por faixa de horário de início.
Insights._melhorJanelaDia = function _melhorJanelaDia(ctx) {
  const validos = ctx.treinos.filter((t) => t.sensacao);
  if (validos.length < Insights.MINIMO_DISPERSAO) return null;
  const buckets = { manha: [], tarde: [], noite: [] };
  validos.forEach((t) => {
    const hora = Insights._horaEmSaoPaulo(t.inicio);
    const chave = hora < 12 ? 'manha' : hora < 18 ? 'tarde' : 'noite';
    buckets[chave].push(Insights._mediaSensacao(t.sensacao));
  });
  const medias = Object.entries(buckets)
    .filter(([, v]) => v.length >= 2)
    .map(([chave, v]) => ({ chave, media: Util.arredondar(v.reduce((s, x) => s + x, 0) / v.length, 1) }));
  if (medias.length < 2) return null;
  const melhor = medias.reduce((max, m) => (m.media > max.media ? m : max), medias[0]);
  const rotulo = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };
  return { texto: `Seus treinos de ${rotulo[melhor.chave]} têm a melhor sensação média (${melhor.media}/10) — energia e humor altos, dor baixa.`, amostra: validos.length };
};

// 10. Melhor dia da semana — sensação média por dia.
Insights._melhorDiaSemana = function _melhorDiaSemana(ctx) {
  const validos = ctx.treinos.filter((t) => t.sensacao);
  if (validos.length < Insights.MINIMO_DISPERSAO) return null;
  const nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const buckets = {};
  validos.forEach((t) => {
    const dia = Motor._diaSemanaISO(Util.diaEmSaoPaulo(new Date(t.inicio)));
    (buckets[dia] = buckets[dia] || []).push(Insights._mediaSensacao(t.sensacao));
  });
  const medias = Object.entries(buckets)
    .filter(([, v]) => v.length >= 2)
    .map(([dia, v]) => ({ dia: Number(dia), media: Util.arredondar(v.reduce((s, x) => s + x, 0) / v.length, 1) }));
  if (medias.length < 2) return null;
  const melhor = medias.reduce((max, m) => (m.media > max.media ? m : max), medias[0]);
  return { texto: `${nomes[melhor.dia]} é o seu melhor dia — sensação média de ${melhor.media}/10 nos treinos.`, amostra: validos.length };
};

// 11. Alerta de sobrecarga — RPE subindo e energia caindo por 2 semanas com volume constante.
Insights._alertaSobrecarga = function _alertaSobrecarga(ctx) {
  const hojeYMD = Util.hojeISO();
  const limSemanaPassada = Motor.limitesJanela('semana', Motor._somarDiasYMD(hojeYMD, -7));
  const limSemanaRetrasada = Motor.limitesJanela('semana', Motor._somarDiasYMD(hojeYMD, -14));
  const filtrar = (lim) => ctx.treinos.filter((t) => Motor._dentroDaJanela(t.inicio, lim) && t.sensacao);
  const semanaRecente = filtrar(limSemanaPassada);
  const semanaAnterior = filtrar(limSemanaRetrasada);
  if (semanaRecente.length < 2 || semanaAnterior.length < 2) return null;

  const mediaRpe = (l) => l.reduce((s, t) => s + t.sensacao.rpe, 0) / l.length;
  const mediaEnergia = (l) => l.reduce((s, t) => s + t.sensacao.energia, 0) / l.length;
  const volumeSemana = (l) => l.reduce((s, t) => s + (Motor.volumeTreino(t) || 0), 0);

  const rpeRecente = mediaRpe(semanaRecente);
  const rpeAnterior = mediaRpe(semanaAnterior);
  const energiaRecente = mediaEnergia(semanaRecente);
  const energiaAnterior = mediaEnergia(semanaAnterior);
  const volRecente = volumeSemana(semanaRecente);
  const volAnterior = volumeSemana(semanaAnterior);
  const volumeConstante = volAnterior === 0 ? true : Math.abs(volRecente - volAnterior) / volAnterior < 0.15;

  if (rpeRecente <= rpeAnterior || energiaRecente >= energiaAnterior || !volumeConstante) return null;
  return {
    texto: `RPE subiu (${Util.formatarNumero(rpeAnterior, 1)}→${Util.formatarNumero(rpeRecente, 1)}) e energia caiu (${Util.formatarNumero(energiaAnterior, 1)}→${Util.formatarNumero(energiaRecente, 1)}) em 2 semanas com volume estável — sinal clássico de recuperação insuficiente.`,
    amostra: semanaRecente.length + semanaAnterior.length,
  };
};

// 12. Correlação humor × frequência — humor médio em semanas com ≥ meta contra semanas abaixo.
Insights._humorFrequencia = function _humorFrequencia(ctx) {
  const metaFreq = ctx.metas.find((m) => m.tipo === 'frequencia' && m.ativa && m.janela === 'semana');
  if (!metaFreq) return null;
  const hojeYMD = Util.hojeISO();
  const treinosFiltrados = Motor._filtrarTreinos(ctx.treinos, metaFreq.filtro);
  const acima = []; const abaixo = [];
  for (let i = 1; i <= 8; i += 1) {
    const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
    const limites = Motor.limitesJanela('semana', refYMD);
    const daSemana = treinosFiltrados.filter((t) => Motor._dentroDaJanela(t.inicio, limites) && t.sensacao);
    if (daSemana.length === 0) continue; // eslint-disable-line no-continue
    const humorMedio = daSemana.reduce((s, t) => s + t.sensacao.humor, 0) / daSemana.length;
    const contagemTotal = ctx.treinos.filter((t) => Motor._dentroDaJanela(t.inicio, limites)).length;
    if (contagemTotal >= metaFreq.alvo) acima.push(humorMedio); else abaixo.push(humorMedio);
  }
  if (acima.length < 2 || abaixo.length < 2) return null;
  const mediaAcima = Util.arredondar(acima.reduce((s, x) => s + x, 0) / acima.length, 1);
  const mediaAbaixo = Util.arredondar(abaixo.reduce((s, x) => s + x, 0) / abaixo.length, 1);
  return {
    texto: `Semanas em que você bateu a meta de frequência têm humor médio ${mediaAcima}/10 nos treinos, contra ${mediaAbaixo}/10 nas semanas abaixo da meta.`,
    amostra: acima.length + abaixo.length,
  };
};

// =====================================================================
// Marcadores
// =====================================================================

// 13. Série temporal por marcador — quantos registros caíram fora da faixa de referência.
Insights._serieMarcador = function _serieMarcador(ctx) {
  const achados = [];
  let amostraTotal = 0;
  ctx.catalogoMarcadores.forEach((cat) => {
    const registros = ctx.marcadores.filter((m) => m.codigo === cat.codigo);
    if (registros.length < Insights.MINIMO_MARCADOR) return;
    const faixa = cat.faixaReferencia || {};
    if (!Util.ehNumero(faixa.min) && !Util.ehNumero(faixa.max)) return;
    const foraDaFaixa = registros.filter((r) => (Util.ehNumero(faixa.min) && r.valor < faixa.min) || (Util.ehNumero(faixa.max) && r.valor > faixa.max));
    if (foraDaFaixa.length === 0) return;
    achados.push({ nome: cat.nome, foraDaFaixa: foraDaFaixa.length, total: registros.length });
    amostraTotal += registros.length;
  });
  if (achados.length === 0) return null;
  const texto = achados.map((a) => `${a.nome}: ${a.foraDaFaixa}/${a.total} fora da faixa de referência`).join('; ');
  return { texto: `Marcadores fora da faixa: ${texto}.`, amostra: amostraTotal };
};

// 14. Marcador × peso com defasagem — correlação simples entre o valor do marcador e o peso mais próximo.
Insights._marcadorXPeso = function _marcadorXPeso(ctx) {
  const achados = [];
  let amostraTotal = 0;
  ctx.catalogoMarcadores.forEach((cat) => {
    const registros = ctx.marcadores.filter((m) => m.codigo === cat.codigo);
    if (registros.length < Insights.MINIMO_DISPERSAO) return;
    const pares = registros.map((r) => {
      const alvo = new Date(r.dataHora).getTime();
      let melhor = null; let melhorDist = Infinity;
      ctx.pesos.forEach((p) => {
        const dist = Math.abs(new Date(p.dataHora).getTime() - alvo);
        if (dist < melhorDist && dist <= 2 * Motor.MS_DIA) { melhorDist = dist; melhor = p; }
      });
      return melhor ? { x: melhor.pesoKg, y: r.valor } : null;
    }).filter(Boolean);
    if (pares.length < Insights.MINIMO_DISPERSAO) return;
    const correlacao = Insights._correlacaoSimples(pares);
    if (correlacao === null || Math.abs(correlacao) < 0.5) return;
    achados.push({ nome: cat.nome, correlacao: Util.arredondar(correlacao, 2), n: pares.length });
    amostraTotal += pares.length;
  });
  if (achados.length === 0) return null;
  const texto = achados.map((a) => `${a.nome} e peso: correlação de ${a.correlacao} (${a.n} pontos)`).join('; ');
  return { texto: `Possível relação (correlação não é causalidade — leve para o médico): ${texto}.`, amostra: amostraTotal };
};

// 15. Marcador × contexto — médias por contexto, nunca misturadas no mesmo gráfico.
Insights._marcadorPorContexto = function _marcadorPorContexto(ctx) {
  const achados = [];
  let amostraTotal = 0;
  ctx.catalogoMarcadores.forEach((cat) => {
    const registros = ctx.marcadores.filter((m) => m.codigo === cat.codigo);
    const porContexto = {};
    registros.forEach((r) => { (porContexto[r.contexto] = porContexto[r.contexto] || []).push(r.valor); });
    const contextosValidos = Object.entries(porContexto).filter(([, v]) => v.length >= 3);
    if (contextosValidos.length < 2) return;
    const medias = contextosValidos.map(([c, v]) => `${c}: ${Util.formatarNumero(v.reduce((s, x) => s + x, 0) / v.length, cat.casasDecimais)} ${cat.unidade}`);
    achados.push({ nome: cat.nome, medias });
    amostraTotal += contextosValidos.reduce((s, [, v]) => s + v.length, 0);
  });
  if (achados.length === 0) return null;
  const texto = achados.map((a) => `${a.nome} (${a.medias.join(' vs ')})`).join('; ');
  return { texto: `Compare por contexto, não misture: ${texto}.`, amostra: amostraTotal };
};

// =====================================================================
// Metas
// =====================================================================

// 16. Projeção vs. prazo.
Insights._projecaoPrazo = function _projecaoPrazo(ctx) {
  const metasComPrazo = ctx.metas.filter((m) => m.tipo === 'valor' && m.ativa && m.prazo);
  if (metasComPrazo.length === 0) return null;
  const achados = [];
  metasComPrazo.forEach((meta) => {
    const progresso = Motor.calcularProgressoMeta(meta, ctx);
    if (progresso.statusProjecao !== 'convergindo' && progresso.statusProjecao !== 'atingida') return;
    if (!progresso.projecaoData) return;
    const diffDias = Motor._diasEntreYMD(meta.prazo, progresso.projecaoData);
    if (diffDias > 0) {
      achados.push(`${meta.metrica}: no ritmo atual você chega em ${Util.formatarDataBR(progresso.projecaoData)}, ${diffDias} dia${diffDias === 1 ? '' : 's'} depois do prazo`);
    } else if (diffDias < 0) {
      achados.push(`${meta.metrica}: no ritmo atual você chega em ${Util.formatarDataBR(progresso.projecaoData)}, ${Math.abs(diffDias)} dia${Math.abs(diffDias) === 1 ? '' : 's'} antes do prazo`);
    } else {
      achados.push(`${meta.metrica}: no ritmo atual você chega em cima do prazo (${Util.formatarDataBR(meta.prazo)})`);
    }
  });
  if (achados.length === 0) return null;
  return { texto: achados.join('; '), amostra: metasComPrazo.length };
};

// 17. Ritmo necessário para bater no prazo.
Insights._ritmoNecessario = function _ritmoNecessario(ctx) {
  const metasComPrazo = ctx.metas.filter((m) => m.tipo === 'valor' && m.ativa && m.prazo);
  if (metasComPrazo.length === 0) return null;
  const achados = [];
  metasComPrazo.forEach((meta) => {
    const progresso = Motor.calcularProgressoMeta(meta, ctx);
    if (!Util.ehNumero(progresso.diasRestantes) || progresso.diasRestantes <= 0 || !Util.ehNumero(progresso.ritmoNecessarioSemanal)) return;
    achados.push(`${meta.metrica}: ${Util.formatarNumero(Math.abs(progresso.ritmoNecessarioSemanal), 2)}/semana até ${Util.formatarDataBR(meta.prazo)} (${progresso.diasRestantes} dias restantes)`);
  });
  if (achados.length === 0) return null;
  return { texto: achados.join('; '), amostra: metasComPrazo.length };
};

// =====================================================================
// Catálogo e motor de avaliação
// =====================================================================

Insights.CATALOGO = [
  { id: 1, categoria: 'Consistência', titulo: 'Platô detectado', amostraMinima: 15, calcular: Insights._plato },
  { id: 2, categoria: 'Consistência', titulo: 'Queda de aderência', amostraMinima: 2, calcular: Insights._quedaAderencia },
  { id: 3, categoria: 'Consistência', titulo: 'Lacuna de dados', amostraMinima: 1, calcular: Insights._lacunaDados },
  { id: 4, categoria: 'Corpo × treino', titulo: 'Recomposição', amostraMinima: 2, calcular: Insights._recomposicao },
  { id: 5, categoria: 'Corpo × treino', titulo: 'Resposta ao estímulo', amostraMinima: 4, calcular: Insights._respostaEstimulo },
  { id: 6, categoria: 'Corpo × treino', titulo: 'Volume × segmento com defasagem', amostraMinima: 1, calcular: Insights._volumeSegmentoDefasagem },
  { id: 7, categoria: 'Corpo × treino', titulo: 'Assimetria persistente', amostraMinima: 3, calcular: Insights._assimetriaPersistente },
  { id: 8, categoria: 'Sensação', titulo: 'Curva de fadiga', amostraMinima: Insights.MINIMO_DISPERSAO, calcular: Insights._curvaFadiga },
  { id: 9, categoria: 'Sensação', titulo: 'Melhor janela do dia', amostraMinima: Insights.MINIMO_DISPERSAO, calcular: Insights._melhorJanelaDia },
  { id: 10, categoria: 'Sensação', titulo: 'Melhor dia da semana', amostraMinima: Insights.MINIMO_DISPERSAO, calcular: Insights._melhorDiaSemana },
  { id: 11, categoria: 'Sensação', titulo: 'Alerta de sobrecarga', amostraMinima: 4, calcular: Insights._alertaSobrecarga },
  { id: 12, categoria: 'Sensação', titulo: 'Correlação humor × frequência', amostraMinima: 4, calcular: Insights._humorFrequencia },
  { id: 13, categoria: 'Marcadores', titulo: 'Série temporal por marcador', amostraMinima: Insights.MINIMO_MARCADOR, calcular: Insights._serieMarcador },
  { id: 14, categoria: 'Marcadores', titulo: 'Marcador × peso/medidas', amostraMinima: Insights.MINIMO_DISPERSAO, calcular: Insights._marcadorXPeso },
  { id: 15, categoria: 'Marcadores', titulo: 'Marcador × contexto', amostraMinima: 6, calcular: Insights._marcadorPorContexto },
  { id: 16, categoria: 'Metas', titulo: 'Projeção vs. prazo', amostraMinima: 2, calcular: Insights._projecaoPrazo },
  { id: 17, categoria: 'Metas', titulo: 'Ritmo necessário', amostraMinima: 2, calcular: Insights._ritmoNecessario },
];

Insights.avaliarTudo = function avaliarTudo(contexto) {
  return Insights.CATALOGO.map((regra) => {
    let resultado = null;
    try {
      resultado = regra.calcular(contexto);
    } catch (erro) {
      resultado = null;
    }
    if (!resultado) return null;
    return {
      id: regra.id, categoria: regra.categoria, titulo: regra.titulo, texto: resultado.texto, amostra: resultado.amostra, amostraMinima: regra.amostraMinima,
    };
  }).filter(Boolean);
};

// Busca tudo que o motor de insights precisa, num único contexto reaproveitável pelo motor de metas também.
Insights.montarContexto = async function montarContexto() {
  const [perfil, pesos, medidas, marcadores, catalogoMarcadores, treinos, metas] = await Promise.all([
    Dados.obterPerfil(),
    Dados.listarPeso(),
    Dados.listarMedidas(),
    Dados.listarMarcadores(),
    Dados.listarCatalogoMarcadores(),
    Dados.listarTreinos(),
    Dados.listarMetas(),
  ]);
  return {
    perfil, pesos, medidas, marcadores, catalogoMarcadores, treinos, metas,
  };
};
