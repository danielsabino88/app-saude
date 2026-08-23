const TelaRelatorio = {};

TelaRelatorio.PERIODOS = [
  { chave: '30d', rotulo: '30 dias' },
  { chave: '90d', rotulo: '90 dias' },
  { chave: '6m', rotulo: '6 meses' },
  { chave: '1a', rotulo: '1 ano' },
  { chave: 'tudo', rotulo: 'Tudo' },
];

TelaRelatorio._periodo = '90d';
TelaRelatorio._contexto = null;
TelaRelatorio._camposMedidasSelecionados = [];
TelaRelatorio._marcadorSelecionado = null;

// --- Utilidades de exibição ---

TelaRelatorio._mostrarVazio = function _mostrarVazio(container, seletorCanvas) {
  const canvas = container.querySelector(seletorCanvas);
  if (!canvas) return;
  Graficos._destruir(canvas.id);
  const ctx2d = canvas.getContext('2d');
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const pai = canvas.closest('.grafico-container');
  if (pai && !pai.querySelector('.texto-vazio-grafico')) {
    const aviso = document.createElement('p');
    aviso.className = 'texto-vazio texto-vazio-grafico';
    aviso.textContent = 'Sem dados suficientes no período selecionado.';
    pai.appendChild(aviso);
  }
};

TelaRelatorio._semanasNoPeriodo = function _semanasNoPeriodo(periodo, treinos) {
  const hojeYMD = Util.hojeISO();
  let dias = Motor.PERIODOS[periodo];
  if (dias === null || dias === undefined) {
    if (treinos.length === 0) return [];
    dias = Motor._diasEntreYMD(Util.diaEmSaoPaulo(new Date(treinos[0].inicio)), hojeYMD) + 7;
  }
  const numSemanas = Math.max(1, Math.min(60, Math.ceil(dias / 7)));
  const semanas = [];
  for (let i = numSemanas - 1; i >= 0; i -= 1) {
    const refYMD = Motor._somarDiasYMD(hojeYMD, -7 * i);
    semanas.push(Motor.limitesJanela('semana', refYMD));
  }
  return semanas;
};

// --- Insights ---

TelaRelatorio._renderizarInsights = function _renderizarInsights(container, ctx) {
  const alvo = container.querySelector('#area-insights');
  const insights = Insights.avaliarTudo(ctx);
  if (insights.length === 0) {
    alvo.innerHTML = '<div class="cartao"><p class="texto-vazio">Ainda não há dados suficientes para leituras cruzadas. Continue registrando — cada regra exige uma amostra mínima para evitar afirmar demais com dados de menos.</p></div>';
    return;
  }
  const porCategoria = {};
  insights.forEach((i) => { (porCategoria[i.categoria] = porCategoria[i.categoria] || []).push(i); });
  alvo.innerHTML = Object.entries(porCategoria).map(([categoria, lista]) => `
    <h2 class="titulo-categoria-insight">${categoria}</h2>
    ${lista.map((i) => `
      <div class="cartao cartao-insight">
        <h3>${i.titulo}</h3>
        <p>${i.texto}</p>
        <span class="amostra-insight">Baseado em ${i.amostra} ponto${i.amostra === 1 ? '' : 's'} (mínimo ${i.amostraMinima})</span>
      </div>
    `).join('')}
  `).join('');
};

// --- Gráfico 1: Peso ---

TelaRelatorio._construirGraficoPeso = function _construirGraficoPeso(container, ctx, periodo) {
  const pesos = Motor.filtrarPorPeriodo(ctx.pesos, 'dataHora', periodo);
  if (pesos.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-peso'); return; }
  const mediaMovel = Motor.mediaMovel(pesos.map((p) => ({ dataHora: p.dataHora, valor: p.pesoKg })), 7);
  const labels = pesos.map((p) => Util.formatarDataBR(p.dataHora).slice(0, 5));
  const metaPeso = ctx.metas.find((m) => m.tipo === 'valor' && m.metrica === 'pesoKg' && m.ativa);
  const datasets = [
    {
      label: 'Peso', data: pesos.map((p) => p.pesoKg), borderColor: Graficos.cor(1), backgroundColor: 'transparent', pointRadius: 2, borderWidth: 1,
    },
    {
      label: 'Média móvel 7', data: mediaMovel.map((p) => p.valor), borderColor: Graficos.cor(0), backgroundColor: 'transparent', pointRadius: 0, borderWidth: 2, tension: 0.2,
    },
  ];
  if (metaPeso) {
    datasets.push({
      label: 'Meta', data: pesos.map(() => metaPeso.alvo), borderColor: Graficos.cor(2), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5,
    });
  }
  Graficos.criarLinha(container.querySelector('#grafico-peso'), labels, datasets);
};

// --- Gráfico 2: Medidas ---

TelaRelatorio._camposComDados = function _camposComDados(medidas) {
  return Schema.CAMPOS_MEDIDAS.filter((c) => medidas.some((m) => Util.ehNumero(m.medidas[c])));
};

TelaRelatorio._construirGraficoMedidas = function _construirGraficoMedidas(container, ctx, periodo) {
  const medidas = Motor.filtrarPorPeriodo(ctx.medidas, 'dataHora', periodo);
  const alvoSeletor = container.querySelector('#seletor-medidas-grafico');
  if (medidas.length === 0) { alvoSeletor.innerHTML = ''; TelaRelatorio._mostrarVazio(container, '#grafico-medidas'); return; }

  const camposDisponiveis = TelaRelatorio._camposComDados(medidas);
  if (TelaRelatorio._camposMedidasSelecionados.length === 0) {
    TelaRelatorio._camposMedidasSelecionados = camposDisponiveis.slice(0, 3);
  }
  alvoSeletor.innerHTML = camposDisponiveis.map((c) => `
    <label class="chip-serie ${TelaRelatorio._camposMedidasSelecionados.includes(c) ? 'selecionado' : ''}">
      <input type="checkbox" data-campo-medida-grafico="${c}" ${TelaRelatorio._camposMedidasSelecionados.includes(c) ? 'checked' : ''}>
      ${TelaMedidas.ROTULOS_CAMPO[c]}
    </label>
  `).join('');

  const selecionados = TelaRelatorio._camposMedidasSelecionados.filter((c) => camposDisponiveis.includes(c));
  if (selecionados.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-medidas'); return; }
  const labels = medidas.map((m) => Util.formatarDataBR(m.dataHora).slice(0, 5));
  const datasets = selecionados.map((campo, i) => ({
    label: TelaMedidas.ROTULOS_CAMPO[campo],
    data: medidas.map((m) => (Util.ehNumero(m.medidas[campo]) ? m.medidas[campo] : null)),
    borderColor: Graficos.cor(i),
    backgroundColor: 'transparent',
    spanGaps: true,
    pointRadius: 2,
    borderWidth: 1.5,
  }));
  Graficos.criarLinha(container.querySelector('#grafico-medidas'), labels, datasets);
};

// --- Gráfico 3: Perímetro somado × peso (eixo Y duplo) ---

TelaRelatorio._construirGraficoPerimetroPeso = function _construirGraficoPerimetroPeso(container, ctx, periodo) {
  const medidas = Motor.filtrarPorPeriodo(ctx.medidas, 'dataHora', periodo).filter((m) => Motor.perimetroSomado(m.medidas) !== null);
  const pesos = Motor.filtrarPorPeriodo(ctx.pesos, 'dataHora', periodo);
  if (medidas.length === 0 || pesos.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-perimetro-peso'); return; }
  const mediaMovelPeso = Motor.mediaMovel(pesos.map((p) => ({ dataHora: p.dataHora, valor: p.pesoKg })), 7);
  const labels = medidas.map((m) => Util.formatarDataBR(m.dataHora).slice(0, 5));
  const pesoNaData = medidas.map((m) => {
    const alvo = new Date(m.dataHora).getTime();
    let melhor = null; let melhorDist = Infinity;
    mediaMovelPeso.forEach((p) => {
      const dist = Math.abs(new Date(p.dataHora).getTime() - alvo);
      if (dist < melhorDist) { melhorDist = dist; melhor = p.valor; }
    });
    return melhor;
  });
  const datasets = [
    {
      label: 'Perímetro somado (cm)', data: medidas.map((m) => Motor.perimetroSomado(m.medidas)), borderColor: Graficos.cor(0), backgroundColor: 'transparent', yAxisID: 'y', pointRadius: 2, borderWidth: 1.5,
    },
    {
      label: 'Peso (kg)', data: pesoNaData, borderColor: Graficos.cor(1), backgroundColor: 'transparent', yAxisID: 'y1', pointRadius: 2, borderWidth: 1.5,
    },
  ];
  const corTexto = Graficos._cssVar('--cor-texto-fraco');
  Graficos.criarLinha(container.querySelector('#grafico-perimetro-peso'), labels, datasets, {
    y1: {
      position: 'right', ticks: { color: corTexto, font: { size: 10 } }, grid: { drawOnChartArea: false },
    },
  });
};

// --- Gráfico 4: Frequência de treino ---

TelaRelatorio._construirGraficoFrequencia = function _construirGraficoFrequencia(container, ctx, periodo) {
  const semanas = TelaRelatorio._semanasNoPeriodo(periodo, ctx.treinos);
  if (semanas.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-frequencia'); return; }
  const labels = semanas.map((s) => Util.formatarDataBR(s.inicio).slice(0, 5));
  const contagens = semanas.map((s) => ctx.treinos.filter((t) => Motor._dentroDaJanela(t.inicio, s)).length);
  const metaFreq = ctx.metas.find((m) => m.tipo === 'frequencia' && m.janela === 'semana' && m.ativa);
  const datasets = [
    {
      type: 'bar', label: 'Treinos', data: contagens, backgroundColor: Graficos.cor(0), borderRadius: 4,
    },
  ];
  if (metaFreq) {
    datasets.push({
      type: 'line', label: 'Meta', data: labels.map(() => metaFreq.alvo), borderColor: Graficos.cor(2), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5,
    });
  }
  Graficos.criarMisto(container.querySelector('#grafico-frequencia'), labels, datasets);
};

// --- Gráfico 5: Volume por grupo muscular ---

TelaRelatorio._construirGraficoVolumeGrupo = function _construirGraficoVolumeGrupo(container, ctx, periodo) {
  const semanas = TelaRelatorio._semanasNoPeriodo(periodo, ctx.treinos);
  const treinosEstruturados = ctx.treinos.filter((t) => t.exercicios && t.exercicios.length > 0);
  const gruposPresentes = Array.from(new Set(treinosEstruturados.flatMap((t) => t.foco || [])));
  if (semanas.length === 0 || gruposPresentes.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-volume-grupo'); return; }
  const labels = semanas.map((s) => Util.formatarDataBR(s.inicio).slice(0, 5));
  const datasets = gruposPresentes.map((grupo, i) => ({
    label: TelaTreino.ROTULOS_FOCO[grupo] || grupo,
    data: semanas.map((s) => {
      const daSemana = treinosEstruturados.filter((t) => Motor._dentroDaJanela(t.inicio, s) && t.foco.includes(grupo));
      return Util.arredondar(daSemana.reduce((soma, t) => soma + (Motor.volumeTreino(t) || 0) / t.foco.length, 0), 0);
    }),
    backgroundColor: Graficos.cor(i),
  }));
  Graficos.criarBarrasEmpilhadas(container.querySelector('#grafico-volume-grupo'), labels, datasets);
};

// --- Gráfico 6: Progressão de carga (1RM estimado) ---

TelaRelatorio._construirGraficoProgressaoCarga = function _construirGraficoProgressaoCarga(container, ctx, periodo) {
  const treinos = Motor.filtrarPorPeriodo(ctx.treinos, 'inicio', periodo).filter((t) => t.exercicios && t.exercicios.length > 0);
  if (treinos.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-progressao-carga'); return; }
  const contagemPorNome = {};
  treinos.forEach((t) => t.exercicios.forEach((ex) => { contagemPorNome[ex.nome] = (contagemPorNome[ex.nome] || 0) + 1; }));
  const nomesTop = Object.entries(contagemPorNome).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([nome]) => nome);
  if (nomesTop.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-progressao-carga'); return; }

  const labels = treinos.map((t) => Util.formatarDataBR(t.inicio).slice(0, 5));
  const datasets = nomesTop.map((nome, i) => ({
    label: nome,
    data: treinos.map((t) => {
      const ex = t.exercicios.find((e) => e.nome === nome);
      if (!ex) return null;
      const melhores = ex.series.map((s) => Motor.rm1Estimado(s.cargaKg, s.reps)).filter((v) => v !== null);
      return melhores.length ? Util.arredondar(Math.max(...melhores), 1) : null;
    }),
    borderColor: Graficos.cor(i),
    backgroundColor: 'transparent',
    spanGaps: true,
    pointRadius: 3,
    borderWidth: 1.5,
  }));
  Graficos.criarLinha(container.querySelector('#grafico-progressao-carga'), labels, datasets);
};

// --- Gráfico 7: Sensação × volume (dispersão) ---

TelaRelatorio._construirGraficoSensacaoVolume = function _construirGraficoSensacaoVolume(container, ctx, periodo) {
  const treinos = Motor.filtrarPorPeriodo(ctx.treinos, 'inicio', periodo).filter((t) => t.sensacao && Motor.volumeTreino(t) !== null);
  if (treinos.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-sensacao-volume'); return; }
  const datasets = [
    {
      label: 'RPE', data: treinos.map((t) => ({ x: Motor.volumeTreino(t), y: t.sensacao.rpe })), backgroundColor: Graficos.cor(0), pointRadius: 4,
    },
    {
      label: 'Energia', data: treinos.map((t) => ({ x: Motor.volumeTreino(t), y: t.sensacao.energia })), backgroundColor: Graficos.cor(1), pointRadius: 4,
    },
  ];
  Graficos.criarDispersao(container.querySelector('#grafico-sensacao-volume'), datasets);
};

// --- Gráfico 8: Sensação por dia da semana / horário ---

TelaRelatorio._construirGraficosSensacaoRecorte = function _construirGraficosSensacaoRecorte(container, ctx, periodo) {
  const treinos = Motor.filtrarPorPeriodo(ctx.treinos, 'inicio', periodo).filter((t) => t.sensacao);
  if (treinos.length === 0) {
    TelaRelatorio._mostrarVazio(container, '#grafico-sensacao-dia');
    TelaRelatorio._mostrarVazio(container, '#grafico-sensacao-horario');
    return;
  }
  const camposSensacao = ['energia', 'humor', 'dorMuscular', 'rpe'];
  const rotulos = {
    energia: 'Energia', humor: 'Humor', dorMuscular: 'Dor muscular', rpe: 'RPE',
  };
  const mediaCampo = (lista, campo) => (lista.length ? Util.arredondar(lista.reduce((s, x) => s + x[campo], 0) / lista.length, 1) : null);

  const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const porDia = Array.from({ length: 7 }, () => []);
  treinos.forEach((t) => { porDia[Motor._diaSemanaISO(Util.diaEmSaoPaulo(new Date(t.inicio)))].push(t.sensacao); });
  const datasetsDia = camposSensacao.map((campo, i) => ({
    label: rotulos[campo], data: porDia.map((lista) => mediaCampo(lista, campo)), backgroundColor: Graficos.cor(i),
  }));
  Graficos.criarBarras(container.querySelector('#grafico-sensacao-dia'), nomesDias, datasetsDia);

  const buckets = { manha: [], tarde: [], noite: [] };
  treinos.forEach((t) => {
    const hora = Insights._horaEmSaoPaulo(t.inicio);
    const chave = hora < 12 ? 'manha' : hora < 18 ? 'tarde' : 'noite';
    buckets[chave].push(t.sensacao);
  });
  const labelsHorario = ['Manhã', 'Tarde', 'Noite'];
  const datasetsHorario = camposSensacao.map((campo, i) => ({
    label: rotulos[campo], data: [buckets.manha, buckets.tarde, buckets.noite].map((lista) => mediaCampo(lista, campo)), backgroundColor: Graficos.cor(i),
  }));
  Graficos.criarBarras(container.querySelector('#grafico-sensacao-horario'), labelsHorario, datasetsHorario);
};

// --- Gráfico 9: Marcador (linha + faixa de referência sombreada) ---

TelaRelatorio._construirGraficoMarcador = function _construirGraficoMarcador(container, ctx, periodo) {
  const alvoSeletor = container.querySelector('#seletor-marcador-grafico');
  const catalogoComDados = ctx.catalogoMarcadores.filter((cat) => ctx.marcadores.some((m) => m.codigo === cat.codigo));
  if (catalogoComDados.length === 0) { alvoSeletor.innerHTML = ''; TelaRelatorio._mostrarVazio(container, '#grafico-marcador'); return; }
  if (!TelaRelatorio._marcadorSelecionado || !catalogoComDados.some((c) => c.codigo === TelaRelatorio._marcadorSelecionado)) {
    TelaRelatorio._marcadorSelecionado = catalogoComDados[0].codigo;
  }
  alvoSeletor.innerHTML = catalogoComDados.map((m) => `<option value="${m.codigo}" ${m.codigo === TelaRelatorio._marcadorSelecionado ? 'selected' : ''}>${m.nome}</option>`).join('');

  const cat = catalogoComDados.find((c) => c.codigo === TelaRelatorio._marcadorSelecionado);
  const registros = Motor.filtrarPorPeriodo(ctx.marcadores.filter((m) => m.codigo === cat.codigo), 'dataHora', periodo);
  if (registros.length === 0) { TelaRelatorio._mostrarVazio(container, '#grafico-marcador'); return; }
  const labels = registros.map((r) => Util.formatarDataBR(r.dataHora).slice(0, 5));
  const datasets = [];
  const faixa = cat.faixaReferencia || {};
  if (Util.ehNumero(faixa.min) && Util.ehNumero(faixa.max)) {
    datasets.push({
      label: 'Faixa mín.', data: labels.map(() => faixa.min), borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, fill: false,
    });
    datasets.push({
      label: 'Faixa máx.', data: labels.map(() => faixa.max), borderColor: 'transparent', backgroundColor: 'rgba(34, 211, 164, 0.12)', pointRadius: 0, fill: '-1',
    });
  }
  datasets.push({
    label: cat.nome, data: registros.map((r) => r.valor), borderColor: Graficos.cor(0), backgroundColor: 'transparent', pointRadius: 2, borderWidth: 1.5,
  });
  Graficos.criarLinha(container.querySelector('#grafico-marcador'), labels, datasets);
};

// --- Gráfico 10: Calendário de consistência ---

TelaRelatorio._construirHeatmap = function _construirHeatmap(container, ctx, periodo) {
  const treinos = Motor.filtrarPorPeriodo(ctx.treinos, 'inicio', periodo);
  const alvo = container.querySelector('#heatmap-consistencia');
  if (treinos.length === 0) { alvo.innerHTML = '<p class="texto-vazio">Sem treinos no período.</p>'; return; }
  const contagemPorDia = {};
  treinos.forEach((t) => {
    const dia = Util.diaEmSaoPaulo(new Date(t.inicio));
    contagemPorDia[dia] = (contagemPorDia[dia] || 0) + 1;
  });
  const dias = Motor.PERIODOS[periodo];
  const hojeYMD = Util.hojeISO();
  const inicioYMD = dias ? Motor._somarDiasYMD(hojeYMD, -dias) : Util.diaEmSaoPaulo(new Date(treinos[0].inicio));
  Graficos.criarHeatmapConsistencia(alvo, contagemPorDia, inicioYMD, hojeYMD);
};

// --- Montagem geral ---

TelaRelatorio._renderizarGraficos = function _renderizarGraficos(container) {
  const ctx = TelaRelatorio._contexto;
  const periodo = TelaRelatorio._periodo;
  container.querySelectorAll('.texto-vazio-grafico').forEach((el) => el.remove());
  TelaRelatorio._construirGraficoPeso(container, ctx, periodo);
  TelaRelatorio._construirGraficoMedidas(container, ctx, periodo);
  TelaRelatorio._construirGraficoPerimetroPeso(container, ctx, periodo);
  TelaRelatorio._construirGraficoFrequencia(container, ctx, periodo);
  TelaRelatorio._construirGraficoVolumeGrupo(container, ctx, periodo);
  TelaRelatorio._construirGraficoProgressaoCarga(container, ctx, periodo);
  TelaRelatorio._construirGraficoSensacaoVolume(container, ctx, periodo);
  TelaRelatorio._construirGraficosSensacaoRecorte(container, ctx, periodo);
  TelaRelatorio._construirGraficoMarcador(container, ctx, periodo);
  TelaRelatorio._construirHeatmap(container, ctx, periodo);
};

TelaRelatorio._construirHTML = function _construirHTML() {
  const periodoHTML = TelaRelatorio.PERIODOS.map((p) => `
    <button type="button" data-periodo="${p.chave}" class="${p.chave === TelaRelatorio._periodo ? 'selecionado' : ''}">${p.rotulo}</button>
  `).join('');

  return `
    <div class="cabecalho-tela">
      <h1>Relatório</h1>
      <p class="subtitulo">Gráficos e leituras cruzadas dos seus dados</p>
    </div>

    <div class="cartao">
      <h2>Período</h2>
      <div class="segmentado" id="segmentado-periodo-relatorio">${periodoHTML}</div>
    </div>

    <div id="area-insights"></div>

    <div class="cartao">
      <h2>Peso</h2>
      <div class="grafico-container"><canvas id="grafico-peso"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Medidas</h2>
      <div class="selecao-series" id="seletor-medidas-grafico"></div>
      <div class="grafico-container"><canvas id="grafico-medidas"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Perímetro somado × peso</h2>
      <div class="grafico-container"><canvas id="grafico-perimetro-peso"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Frequência de treino</h2>
      <div class="grafico-container"><canvas id="grafico-frequencia"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Volume por grupo muscular</h2>
      <div class="grafico-container"><canvas id="grafico-volume-grupo"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Progressão de carga (1RM estimado)</h2>
      <div class="grafico-container"><canvas id="grafico-progressao-carga"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Sensação × volume</h2>
      <div class="grafico-container"><canvas id="grafico-sensacao-volume"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Sensação por dia da semana</h2>
      <div class="grafico-container"><canvas id="grafico-sensacao-dia"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Sensação por horário</h2>
      <div class="grafico-container"><canvas id="grafico-sensacao-horario"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Marcador</h2>
      <select class="select-relatorio" id="seletor-marcador-grafico"></select>
      <div class="grafico-container"><canvas id="grafico-marcador"></canvas></div>
    </div>

    <div class="cartao">
      <h2>Calendário de consistência</h2>
      <div id="heatmap-consistencia"></div>
    </div>
  `;
};

TelaRelatorio.renderizar = async function renderizar(container) {
  TelaRelatorio._periodo = TelaRelatorio._periodo || '90d';
  Graficos.destruirTodos();
  const ctx = await Insights.montarContexto();
  TelaRelatorio._contexto = ctx;
  TelaRelatorio._camposMedidasSelecionados = [];
  TelaRelatorio._marcadorSelecionado = null;

  container.innerHTML = TelaRelatorio._construirHTML();

  container.querySelector('#segmentado-periodo-relatorio').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-periodo]');
    if (!botao) return;
    TelaRelatorio._periodo = botao.dataset.periodo;
    container.querySelectorAll('#segmentado-periodo-relatorio button').forEach((b) => b.classList.toggle('selecionado', b === botao));
    TelaRelatorio._renderizarGraficos(container);
  });

  container.querySelector('#seletor-medidas-grafico').addEventListener('change', (evento) => {
    const input = evento.target.closest('[data-campo-medida-grafico]');
    if (!input) return;
    const campo = input.dataset.campoMedidaGrafico;
    const indice = TelaRelatorio._camposMedidasSelecionados.indexOf(campo);
    if (input.checked && indice === -1) TelaRelatorio._camposMedidasSelecionados.push(campo);
    if (!input.checked && indice !== -1) TelaRelatorio._camposMedidasSelecionados.splice(indice, 1);
    input.closest('.chip-serie').classList.toggle('selecionado', input.checked);
    TelaRelatorio._construirGraficoMedidas(container, TelaRelatorio._contexto, TelaRelatorio._periodo);
  });

  container.querySelector('#seletor-marcador-grafico').addEventListener('change', (evento) => {
    TelaRelatorio._marcadorSelecionado = evento.target.value;
    TelaRelatorio._construirGraficoMarcador(container, TelaRelatorio._contexto, TelaRelatorio._periodo);
  });

  TelaRelatorio._renderizarInsights(container, ctx);
  TelaRelatorio._renderizarGraficos(container);
};
