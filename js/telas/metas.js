const TelaMetas = {};

TelaMetas.ROTULOS_METRICA = {
  pesoKg: { rotulo: 'Peso', unidade: 'kg', casas: 1 },
  duracaoMinSemanal: { rotulo: 'Duração semanal de treino', unidade: 'min', casas: 0 },
};

TelaMetas._tipoSelecionado = 'valor';
TelaMetas._direcaoSelecionada = 'reduzir';
TelaMetas._janelaSelecionada = 'semana';
TelaMetas._contexto = null;
TelaMetas._catalogoMarcadores = [];

// --- Contexto compartilhado (registros necessários para o motor de cálculo) ---

TelaMetas._buscarContexto = async function _buscarContexto() {
  const [pesos, medidas, marcadores, treinos, catalogoMarcadores] = await Promise.all([
    Dados.listarPeso(),
    Dados.listarMedidas(),
    Dados.listarMarcadores(),
    Dados.listarTreinos(),
    Dados.listarCatalogoMarcadores(),
  ]);
  return {
    contexto: { pesos, medidas, marcadores, treinos }, catalogoMarcadores,
  };
};

TelaMetas._infoMetrica = function _infoMetrica(metrica) {
  if (TelaMetas.ROTULOS_METRICA[metrica]) return TelaMetas.ROTULOS_METRICA[metrica];
  if (metrica.startsWith('medidas.')) {
    const campo = metrica.split('.')[1];
    return { rotulo: TelaMedidas.ROTULOS_CAMPO[campo] || campo, unidade: 'cm', casas: 1 };
  }
  const marcador = TelaMetas._catalogoMarcadores.find((m) => m.codigo === metrica);
  return marcador
    ? { rotulo: marcador.nome, unidade: marcador.unidade, casas: marcador.casasDecimais }
    : { rotulo: metrica, unidade: '', casas: 1 };
};

TelaMetas._rotuloFiltroTreino = function _rotuloFiltroTreino(filtro) {
  if (!filtro || !filtro.tipo) return 'Treinos';
  return `Treinos de ${(TelaTreino.ROTULOS_TIPO[filtro.tipo] || filtro.tipo).toLowerCase()}`;
};

// --- Descrição textual do progresso de uma meta, usada tanto na tela Metas quanto no resumo da tela Hoje ---

TelaMetas._descreverMetaValor = function _descreverMetaValor(meta, progresso) {
  const info = TelaMetas._infoMetrica(meta.metrica);
  const pctClamp = Math.max(0, Math.min(100, progresso.progressoPct));

  const linhaPrincipal = `${Util.formatarNumero(progresso.valorAtual, info.casas)} ${info.unidade} → meta ${Util.formatarNumero(meta.alvo, info.casas)} ${info.unidade}`;

  const linhaRitmoAtual = progresso.ritmoSemanal === null
    ? 'Ritmo atual: sem dados suficientes (mínimo 2 registros)'
    : `Ritmo atual: ${progresso.ritmoSemanal >= 0 ? '+' : ''}${Util.formatarNumero(progresso.ritmoSemanal, 2)} ${info.unidade}/semana ${progresso.ritmoSemanal >= 0 ? 'na direção da meta' : 'na direção contrária'}`;

  let linhaRitmoNecessario;
  if (!meta.prazo) {
    linhaRitmoNecessario = 'Sem prazo definido — sem ritmo necessário a calcular';
  } else if (progresso.diasRestantes <= 0) {
    linhaRitmoNecessario = 'Prazo já passou';
  } else {
    linhaRitmoNecessario = `Ritmo necessário: ${Util.formatarNumero(Math.abs(progresso.ritmoNecessarioSemanal), 2)} ${info.unidade}/semana até o prazo (${progresso.diasRestantes} dia${progresso.diasRestantes === 1 ? '' : 's'})`;
  }

  let linhaProjecao;
  let statusClasse;
  if (progresso.statusProjecao === 'atingida') {
    linhaProjecao = `Meta batida em ${Util.formatarDataBR(progresso.projecaoData)}`;
    statusClasse = 'positivo';
  } else if (progresso.statusProjecao === 'sem_dados') {
    linhaProjecao = 'Sem dados suficientes para projeção (registre ao menos 2 medições)';
    statusClasse = 'neutro';
  } else if (progresso.statusProjecao === 'divergindo') {
    linhaProjecao = 'No ritmo atual, você está se afastando da meta';
    statusClasse = 'negativo';
  } else if (meta.prazo) {
    const antesDoPrazo = progresso.projecaoData <= meta.prazo;
    linhaProjecao = antesDoPrazo
      ? `Projeção: chega na meta em ${Util.formatarDataBR(progresso.projecaoData)} (antes do prazo de ${Util.formatarDataBR(meta.prazo)})`
      : `Projeção: chega na meta em ${Util.formatarDataBR(progresso.projecaoData)} — depois do prazo de ${Util.formatarDataBR(meta.prazo)}`;
    statusClasse = antesDoPrazo ? 'positivo' : 'negativo';
  } else {
    linhaProjecao = `Projeção: chega na meta em ${Util.formatarDataBR(progresso.projecaoData)} no ritmo atual`;
    statusClasse = 'positivo';
  }

  return {
    titulo: info.rotulo, pctClamp, progressoLabel: `${progresso.progressoPct}%`,
    linhaPrincipal, linhaRitmoAtual, linhaRitmoNecessario, linhaProjecao, statusClasse,
  };
};

TelaMetas._descreverMetaFrequencia = function _descreverMetaFrequencia(meta, progresso) {
  const janelaLabel = meta.janela === 'semana' ? 'semana' : 'mês';
  const pctClamp = Math.max(0, Math.min(100, progresso.progressoPct));

  const linhaPrincipal = `${progresso.contagemAtual}/${meta.alvo} ${meta.janela === 'semana' ? 'esta semana' : 'este mês'} (${Util.formatarDataBR(progresso.limites.inicio)} a ${Util.formatarDataBR(progresso.limites.fim)})`;

  const linhaRitmoAtual = `Média das últimas 4 ${janelaLabel}s: ${Util.formatarNumero(progresso.mediaHistorica, 1)} por ${janelaLabel}`;

  let linhaRitmoNecessario;
  if (progresso.contagemAtual >= meta.alvo) {
    linhaRitmoNecessario = 'Meta já batida nesta janela';
  } else if (progresso.diasRestantesJanela > 0) {
    linhaRitmoNecessario = `Faltam ${meta.alvo - progresso.contagemAtual}, ${Util.formatarNumero(progresso.ritmoNecessarioPorDia, 2)} por dia nos ${progresso.diasRestantesJanela} dia${progresso.diasRestantesJanela === 1 ? '' : 's'} restantes`;
  } else {
    linhaRitmoNecessario = 'Janela terminando sem bater a meta';
  }

  let linhaProjecao;
  let statusClasse;
  if (progresso.statusProjecao === 'atingida') {
    linhaProjecao = `Meta batida em ${Util.formatarDataBR(progresso.projecaoData)}`;
    statusClasse = 'positivo';
  } else if (progresso.statusProjecao === 'sem_dados') {
    linhaProjecao = 'Ainda sem registros nesta janela';
    statusClasse = 'neutro';
  } else if (progresso.statusProjecao === 'convergindo') {
    linhaProjecao = `No ritmo atual, você bate a meta até ${Util.formatarDataBR(progresso.projecaoData)}`;
    statusClasse = 'positivo';
  } else {
    linhaProjecao = `No ritmo atual, não vai bater a meta nesta janela (termina em ${Util.formatarDataBR(progresso.limites.fim)})`;
    statusClasse = 'negativo';
  }

  return {
    titulo: TelaMetas._rotuloFiltroTreino(meta.filtro), pctClamp, progressoLabel: `${progresso.progressoPct}%`,
    linhaPrincipal, linhaRitmoAtual, linhaRitmoNecessario, linhaProjecao, statusClasse,
  };
};

TelaMetas._descrever = function _descrever(meta, progresso) {
  return meta.tipo === 'valor' ? TelaMetas._descreverMetaValor(meta, progresso) : TelaMetas._descreverMetaFrequencia(meta, progresso);
};

// --- Cartão de meta (usado na tela Metas — completo — e no resumo da tela Hoje — compacto) ---

TelaMetas._construirCartaoMeta = function _construirCartaoMeta(meta, descricao, compacto) {
  const detalhes = compacto ? '' : `
    <ul class="detalhes-meta">
      <li>${descricao.linhaRitmoAtual}</li>
      <li>${descricao.linhaRitmoNecessario}</li>
    </ul>
  `;
  const acoes = compacto ? '' : `
    <div class="linha-botoes">
      <button type="button" class="botao botao-secundario botao-pausar-meta" data-id="${meta.id}">${meta.ativa ? 'Pausar' : 'Reativar'}</button>
      <button type="button" class="botao botao-perigo botao-excluir-meta" data-id="${meta.id}">Excluir</button>
    </div>
  `;
  return `
    <div class="cartao cartao-meta status-${descricao.statusClasse}" data-id="${meta.id}">
      <div class="cabecalho-cartao-meta">
        <h3>${descricao.titulo}</h3>
        <span class="rotulo-progresso">${descricao.progressoLabel}</span>
      </div>
      <div class="barra-progresso"><div class="barra-progresso-preenchimento" style="width:${descricao.pctClamp}%"></div></div>
      <p class="linha-principal-meta">${descricao.linhaPrincipal}</p>
      ${detalhes}
      <p class="linha-projecao-meta">${descricao.linhaProjecao}</p>
      ${acoes}
    </div>
  `;
};

// --- Resumo compacto no topo da tela Hoje ---

TelaMetas.renderizarResumoEmHoje = async function renderizarResumoEmHoje(container) {
  const alvo = container.querySelector('#area-metas-hoje');
  if (!alvo) return;

  const { contexto, catalogoMarcadores } = await TelaMetas._buscarContexto();
  TelaMetas._catalogoMarcadores = catalogoMarcadores;
  const todasMetas = await Dados.listarMetas();
  const ativas = todasMetas.filter((m) => m.ativa);

  if (ativas.length === 0) {
    alvo.innerHTML = '';
    return;
  }

  const cartoes = ativas.map((meta) => {
    const progresso = Motor.calcularProgressoMeta(meta, contexto);
    const descricao = TelaMetas._descrever(meta, progresso);
    return TelaMetas._construirCartaoMeta(meta, descricao, true);
  }).join('');

  alvo.innerHTML = `
    <div class="cartao">
      <h2>Metas ativas</h2>
      <div class="lista-cartoes-meta">${cartoes}</div>
    </div>
  `;

  alvo.querySelectorAll('.cartao-meta').forEach((cartao) => {
    cartao.addEventListener('click', () => App.navegarPara('metas'));
  });
};

// --- Formulário de criação ---

TelaMetas._construirSelectMedida = function _construirSelectMedida() {
  return Schema.CAMPOS_MEDIDAS.map((c) => `<option value="${c}">${TelaMedidas.ROTULOS_CAMPO[c]}</option>`).join('');
};

TelaMetas._construirSelectMarcador = function _construirSelectMarcador() {
  return TelaMetas._catalogoMarcadores.map((m) => `<option value="${m.codigo}">${m.nome}</option>`).join('');
};

TelaMetas._construirSelectTipoTreino = function _construirSelectTipoTreino() {
  return `<option value="">Qualquer tipo</option>${Schema.TIPOS_TREINO.map((t) => `<option value="${t}">${TelaTreino.ROTULOS_TIPO[t]}</option>`).join('')}`;
};

TelaMetas._construirFormulario = function _construirFormulario() {
  return `
    <div class="cartao">
      <h2>Nova meta</h2>
      <form id="formulario-meta">
        <div class="campo">
          <label>Tipo</label>
          <div class="segmentado" id="segmentado-tipo-meta">
            <button type="button" data-tipo="valor" class="selecionado">Valor-alvo</button>
            <button type="button" data-tipo="frequencia">Frequência</button>
          </div>
        </div>

        <div id="bloco-meta-valor">
          <div class="campo">
            <label for="campo-meta-metrica-valor">Métrica</label>
            <select id="campo-meta-metrica-valor">
              <option value="pesoKg">Peso</option>
              <option value="medidas">Medida corporal</option>
              <option value="duracaoMinSemanal">Duração semanal de treino</option>
              <option value="marcador">Marcador</option>
            </select>
          </div>
          <div class="campo" id="campo-meta-submetrica-medida" hidden>
            <label for="campo-meta-medida-campo">Qual medida</label>
            <select id="campo-meta-medida-campo">${TelaMetas._construirSelectMedida()}</select>
          </div>
          <div class="campo" id="campo-meta-submetrica-marcador" hidden>
            <label for="campo-meta-marcador-codigo">Qual marcador</label>
            <select id="campo-meta-marcador-codigo">${TelaMetas._construirSelectMarcador()}</select>
          </div>
          <div class="campo">
            <label>Direção</label>
            <div class="segmentado" id="segmentado-direcao-meta">
              <button type="button" data-direcao="reduzir" class="selecionado">Reduzir</button>
              <button type="button" data-direcao="aumentar">Aumentar</button>
            </div>
          </div>
          <div class="grade-campos-2">
            <div class="campo">
              <label for="campo-meta-valor-inicial">Valor inicial</label>
              <input type="number" id="campo-meta-valor-inicial" inputmode="decimal" step="0.1">
            </div>
            <div class="campo">
              <label for="campo-meta-alvo-valor">Alvo</label>
              <input type="number" id="campo-meta-alvo-valor" inputmode="decimal" step="0.1">
            </div>
          </div>
          <div class="campo">
            <label for="campo-meta-prazo">Prazo</label>
            <input type="date" id="campo-meta-prazo">
          </div>
        </div>

        <div id="bloco-meta-frequencia" hidden>
          <div class="campo">
            <label for="campo-meta-filtro-tipo">Tipo de treino</label>
            <select id="campo-meta-filtro-tipo">${TelaMetas._construirSelectTipoTreino()}</select>
          </div>
          <div class="grade-campos-2">
            <div class="campo">
              <label for="campo-meta-alvo-frequencia">Quantidade alvo</label>
              <input type="number" id="campo-meta-alvo-frequencia" inputmode="numeric" min="1" step="1" value="4">
            </div>
            <div class="campo">
              <label>Janela</label>
              <div class="segmentado" id="segmentado-janela-meta">
                <button type="button" data-janela="semana" class="selecionado">Semana</button>
                <button type="button" data-janela="mes">Mês</button>
              </div>
            </div>
          </div>
        </div>

        <div class="linha-botoes">
          <button type="submit" class="botao botao-primario">Salvar meta</button>
        </div>
      </form>
    </div>
  `;
};

TelaMetas._preencherValorInicialAutomatico = function _preencherValorInicialAutomatico(container) {
  const metricaSelecionada = container.querySelector('#campo-meta-metrica-valor').value;
  const metrica = metricaSelecionada === 'medidas'
    ? `medidas.${container.querySelector('#campo-meta-medida-campo').value}`
    : metricaSelecionada === 'marcador'
      ? container.querySelector('#campo-meta-marcador-codigo').value
      : metricaSelecionada;
  const serie = Motor._serieMetrica(metrica, TelaMetas._contexto).slice().sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const campoValorInicial = container.querySelector('#campo-meta-valor-inicial');
  if (serie.length > 0 && campoValorInicial.value === '') {
    campoValorInicial.value = serie[serie.length - 1].valor;
  }
};

TelaMetas._atualizarVisibilidadeSubmetrica = function _atualizarVisibilidadeSubmetrica(container) {
  const metricaSelecionada = container.querySelector('#campo-meta-metrica-valor').value;
  container.querySelector('#campo-meta-submetrica-medida').hidden = metricaSelecionada !== 'medidas';
  container.querySelector('#campo-meta-submetrica-marcador').hidden = metricaSelecionada !== 'marcador';
};

TelaMetas._ligarFormulario = function _ligarFormulario(container) {
  container.querySelector('#segmentado-tipo-meta').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-tipo]');
    if (!botao) return;
    TelaMetas._tipoSelecionado = botao.dataset.tipo;
    container.querySelectorAll('#segmentado-tipo-meta button').forEach((b) => b.classList.toggle('selecionado', b === botao));
    container.querySelector('#bloco-meta-valor').hidden = TelaMetas._tipoSelecionado !== 'valor';
    container.querySelector('#bloco-meta-frequencia').hidden = TelaMetas._tipoSelecionado !== 'frequencia';
  });

  container.querySelector('#campo-meta-metrica-valor').addEventListener('change', (evento) => {
    TelaMetas._atualizarVisibilidadeSubmetrica(container);
    container.querySelector('#campo-meta-valor-inicial').value = '';
    TelaMetas._preencherValorInicialAutomatico(container);
  });

  container.querySelector('#campo-meta-medida-campo').addEventListener('change', () => {
    container.querySelector('#campo-meta-valor-inicial').value = '';
    TelaMetas._preencherValorInicialAutomatico(container);
  });

  container.querySelector('#campo-meta-marcador-codigo').addEventListener('change', () => {
    container.querySelector('#campo-meta-valor-inicial').value = '';
    TelaMetas._preencherValorInicialAutomatico(container);
  });

  container.querySelector('#segmentado-direcao-meta').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-direcao]');
    if (!botao) return;
    TelaMetas._direcaoSelecionada = botao.dataset.direcao;
    container.querySelectorAll('#segmentado-direcao-meta button').forEach((b) => b.classList.toggle('selecionado', b === botao));
  });

  container.querySelector('#segmentado-janela-meta').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-janela]');
    if (!botao) return;
    TelaMetas._janelaSelecionada = botao.dataset.janela;
    container.querySelectorAll('#segmentado-janela-meta button').forEach((b) => b.classList.toggle('selecionado', b === botao));
  });

  container.querySelector('#formulario-meta').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    let dados;
    if (TelaMetas._tipoSelecionado === 'valor') {
      const metricaSelecionada = container.querySelector('#campo-meta-metrica-valor').value;
      const metrica = metricaSelecionada === 'medidas'
        ? `medidas.${container.querySelector('#campo-meta-medida-campo').value}`
        : metricaSelecionada === 'marcador'
          ? container.querySelector('#campo-meta-marcador-codigo').value
          : metricaSelecionada;
      const prazoValor = container.querySelector('#campo-meta-prazo').value;
      dados = {
        tipo: 'valor',
        metrica,
        alvo: parseFloat(container.querySelector('#campo-meta-alvo-valor').value),
        direcao: TelaMetas._direcaoSelecionada,
        valorInicial: parseFloat(container.querySelector('#campo-meta-valor-inicial').value),
        inicio: Util.hojeISO(),
        prazo: prazoValor || null,
        ativa: true,
      };
    } else {
      const filtroTipo = container.querySelector('#campo-meta-filtro-tipo').value;
      dados = {
        tipo: 'frequencia',
        metrica: 'treinos',
        filtro: filtroTipo ? { tipo: filtroTipo } : null,
        alvo: parseInt(container.querySelector('#campo-meta-alvo-frequencia').value, 10),
        janela: TelaMetas._janelaSelecionada,
        inicio: Util.hojeISO(),
        prazo: null,
        ativa: true,
      };
    }

    try {
      await Dados.criarMeta(dados);
      App.mostrarConfirmacao('Meta salva.');
      await App._rotear();
    } catch (erro) {
      window.alert(erro.message);
    }
  });
};

// --- Lista completa de metas ---

TelaMetas._renderizarLista = async function _renderizarLista(container) {
  const alvo = container.querySelector('#lista-metas');
  const todasMetas = await Dados.listarMetas();
  if (todasMetas.length === 0) {
    alvo.innerHTML = '<p class="texto-vazio">Nenhuma meta cadastrada ainda.</p>';
    return;
  }
  const ativas = todasMetas.filter((m) => m.ativa);
  const pausadas = todasMetas.filter((m) => !m.ativa);

  const construirBloco = (lista) => lista.map((meta) => {
    const progresso = Motor.calcularProgressoMeta(meta, TelaMetas._contexto);
    const descricao = TelaMetas._descrever(meta, progresso);
    return TelaMetas._construirCartaoMeta(meta, descricao, false);
  }).join('');

  alvo.innerHTML = `
    ${ativas.length ? `<div class="lista-cartoes-meta">${construirBloco(ativas)}</div>` : '<p class="texto-vazio">Nenhuma meta ativa no momento.</p>'}
    ${pausadas.length ? `
      <h2 class="titulo-secao-metas">Pausadas</h2>
      <div class="lista-cartoes-meta">${construirBloco(pausadas)}</div>
    ` : ''}
  `;

  alvo.querySelectorAll('.botao-pausar-meta').forEach((botao) => {
    botao.addEventListener('click', async (evento) => {
      evento.stopPropagation();
      const meta = todasMetas.find((m) => m.id === botao.dataset.id);
      await Dados.atualizarMeta(botao.dataset.id, { ativa: !meta.ativa });
      await TelaMetas._renderizarLista(container);
    });
  });

  alvo.querySelectorAll('.botao-excluir-meta').forEach((botao) => {
    botao.addEventListener('click', async (evento) => {
      evento.stopPropagation();
      if (!window.confirm('Excluir esta meta?')) return;
      await Dados.removerMeta(botao.dataset.id);
      await TelaMetas._renderizarLista(container);
    });
  });
};

TelaMetas.renderizar = async function renderizar(container) {
  TelaMetas._tipoSelecionado = 'valor';
  TelaMetas._direcaoSelecionada = 'reduzir';
  TelaMetas._janelaSelecionada = 'semana';

  const { contexto, catalogoMarcadores } = await TelaMetas._buscarContexto();
  TelaMetas._contexto = contexto;
  TelaMetas._catalogoMarcadores = catalogoMarcadores;

  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Metas</h1>
      <p class="subtitulo">Valor-alvo com prazo ou frequência por janela</p>
    </div>
    ${TelaMetas._construirFormulario()}
    <div id="lista-metas"></div>
  `;

  TelaMetas._ligarFormulario(container);
  TelaMetas._preencherValorInicialAutomatico(container);
  await TelaMetas._renderizarLista(container);
};
