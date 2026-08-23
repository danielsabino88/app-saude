const Graficos = {};

Graficos._instancias = {};

Graficos.PALETA = ['#22d3a4', '#60a5fa', '#f87171', '#facc15', '#c084fc', '#fb923c', '#34d399', '#f472b6', '#38bdf8', '#a3e635'];

Graficos.cor = function cor(indice) {
  return Graficos.PALETA[indice % Graficos.PALETA.length];
};

Graficos._cssVar = function _cssVar(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
};

Graficos._destruir = function _destruir(id) {
  if (Graficos._instancias[id]) {
    Graficos._instancias[id].destroy();
    delete Graficos._instancias[id];
  }
};

Graficos.destruirTodos = function destruirTodos() {
  Object.keys(Graficos._instancias).forEach(Graficos._destruir);
};

Graficos._opcoesBase = function _opcoesBase(scalesExtra) {
  const corTexto = Graficos._cssVar('--cor-texto-fraco');
  const corGrade = Graficos._cssVar('--cor-borda');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: corTexto, boxWidth: 12, font: { size: 11 }, filter: (item) => !item.text.startsWith('Faixa'),
        },
      },
      tooltip: {
        backgroundColor: Graficos._cssVar('--cor-fundo-elevado-2'),
        titleColor: Graficos._cssVar('--cor-texto'),
        bodyColor: Graficos._cssVar('--cor-texto'),
        borderColor: corGrade,
        borderWidth: 1,
      },
    },
    scales: {
      x: { ticks: { color: corTexto, font: { size: 10 }, maxRotation: 0, autoSkip: true }, grid: { color: corGrade } },
      y: { ticks: { color: corTexto, font: { size: 10 } }, grid: { color: corGrade } },
      ...(scalesExtra || {}),
    },
  };
};

// --- Construtores genéricos por tipo de gráfico (a montagem dos dados fica na tela) ---

Graficos.criarLinha = function criarLinha(canvas, labels, datasets, scalesExtra) {
  Graficos._destruir(canvas.id);
  const chart = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: Graficos._opcoesBase(scalesExtra) });
  Graficos._instancias[canvas.id] = chart;
  return chart;
};

Graficos.criarBarras = function criarBarras(canvas, labels, datasets, scalesExtra) {
  Graficos._destruir(canvas.id);
  const chart = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: Graficos._opcoesBase(scalesExtra) });
  Graficos._instancias[canvas.id] = chart;
  return chart;
};

// Gráfico misto (barra + linha) — cada dataset define seu próprio "type".
Graficos.criarMisto = function criarMisto(canvas, labels, datasets, scalesExtra) {
  Graficos._destruir(canvas.id);
  const chart = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: Graficos._opcoesBase(scalesExtra) });
  Graficos._instancias[canvas.id] = chart;
  return chart;
};

Graficos.criarDispersao = function criarDispersao(canvas, datasets, scalesExtra) {
  Graficos._destruir(canvas.id);
  const chart = new Chart(canvas, { type: 'scatter', data: { datasets }, options: Graficos._opcoesBase(scalesExtra) });
  Graficos._instancias[canvas.id] = chart;
  return chart;
};

Graficos.criarBarrasEmpilhadas = function criarBarrasEmpilhadas(canvas, labels, datasets) {
  Graficos._destruir(canvas.id);
  const opcoes = Graficos._opcoesBase();
  opcoes.scales.x.stacked = true;
  opcoes.scales.y.stacked = true;
  const chart = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: opcoes });
  Graficos._instancias[canvas.id] = chart;
  return chart;
};

// Calendário de consistência: grade "estilo GitHub", desenhada em DOM puro (sem plugin de heatmap).
// contagemPorDia: { 'YYYY-MM-DD': quantidade }. Alinha a primeira coluna à segunda-feira anterior ao início.
Graficos.criarHeatmapConsistencia = function criarHeatmapConsistencia(container, contagemPorDia, dataInicioYMD, dataFimYMD) {
  const diaSemanaInicio = Motor._diaSemanaISO(dataInicioYMD);
  const deslocamento = (diaSemanaInicio + 6) % 7;
  let cursor = Motor._somarDiasYMD(dataInicioYMD, -deslocamento);
  const max = Math.max(1, ...Object.values(contagemPorDia));
  const celulas = [];
  while (cursor <= dataFimYMD) {
    const contagem = contagemPorDia[cursor] || 0;
    const dentroDoPeriodo = cursor >= dataInicioYMD;
    const nivel = !dentroDoPeriodo ? null : contagem === 0 ? 0 : Math.min(4, Math.ceil((contagem / max) * 4));
    const classe = nivel === null ? 'fora-periodo' : `nivel-${nivel}`;
    celulas.push(`<div class="celula-heatmap ${classe}" title="${Util.formatarDataBR(cursor)}: ${contagem} treino${contagem === 1 ? '' : 's'}"></div>`);
    cursor = Motor._somarDiasYMD(cursor, 1);
  }
  container.innerHTML = `<div class="grade-heatmap">${celulas.join('')}</div>`;
};
