const TelaTreino = {};

TelaTreino.ROTULOS_TIPO = {
  forca: 'Força',
  cardio: 'Cardio',
  mobilidade: 'Mobilidade',
  esporte: 'Esporte',
  outro: 'Outro',
};

TelaTreino.GRUPOS_FOCO = ['peito', 'costas', 'ombro', 'biceps', 'triceps', 'abdomen', 'perna', 'gluteos', 'cardio', 'mobilidade'];

TelaTreino.ROTULOS_FOCO = {
  peito: 'Peito',
  costas: 'Costas',
  ombro: 'Ombro',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  abdomen: 'Abdômen',
  perna: 'Perna',
  gluteos: 'Glúteos',
  cardio: 'Cardio',
  mobilidade: 'Mobilidade',
};

TelaTreino.CAMPOS_SENSACAO = ['energia', 'dorMuscular', 'humor', 'rpe'];
TelaTreino.ROTULOS_SENSACAO = {
  energia: 'Energia',
  dorMuscular: 'Dor muscular',
  humor: 'Humor',
  rpe: 'RPE (esforço percebido)',
};

TelaTreino._tipoSelecionado = 'forca';
TelaTreino._focoSelecionado = [];
TelaTreino._sensacao = { energia: 5, dorMuscular: 5, humor: 5, rpe: 5 };
TelaTreino._detalharAberto = false;
TelaTreino._exercicios = [];
TelaTreino._cronRodando = false;
TelaTreino._cronInicio = null;
TelaTreino._intervaloId = null;

TelaTreino._escapar = function _escapar(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

TelaTreino._formatarTempo = function _formatarTempo(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// --- Cronômetro ---

TelaTreino._atualizarDisplayCronometro = function _atualizarDisplayCronometro(container, ms) {
  const el = container.querySelector('#cronometro-display');
  if (el) el.textContent = TelaTreino._formatarTempo(ms);
};

TelaTreino._iniciarTicker = function _iniciarTicker(container) {
  clearInterval(TelaTreino._intervaloId);
  const atualizar = () => {
    const decorrido = Date.now() - new Date(TelaTreino._cronInicio).getTime();
    TelaTreino._atualizarDisplayCronometro(container, decorrido);
  };
  atualizar();
  TelaTreino._intervaloId = setInterval(atualizar, 1000);
};

TelaTreino._atualizarBotaoCronometro = function _atualizarBotaoCronometro(container) {
  const botao = container.querySelector('#botao-cronometro');
  const status = container.querySelector('#cronometro-status');
  if (TelaTreino._cronRodando) {
    botao.textContent = 'Finalizar treino';
    botao.classList.remove('botao-primario');
    botao.classList.add('botao-perigo');
    status.textContent = 'Treino em andamento...';
  } else {
    botao.textContent = 'Iniciar treino';
    botao.classList.remove('botao-perigo');
    botao.classList.add('botao-primario');
    status.textContent = 'Toque em Iniciar quando começar o treino.';
  }
};

TelaTreino._iniciarCronometro = async function _iniciarCronometro(container) {
  TelaTreino._cronInicio = Util.agoraISO();
  TelaTreino._cronRodando = true;
  await Dados.salvarCronometroTreino({ inicio: TelaTreino._cronInicio });
  container.querySelector('#campo-treino-inicio').value = Util.isoParaCampoDataHora(TelaTreino._cronInicio);
  container.querySelector('#campo-treino-duracao').value = '';
  TelaTreino._atualizarBotaoCronometro(container);
  TelaTreino._iniciarTicker(container);
};

TelaTreino._finalizarCronometro = async function _finalizarCronometro(container) {
  const agora = Util.agoraISO();
  const duracao = Math.max(1, Util.calcularDuracaoMin(TelaTreino._cronInicio, agora) || 1);
  TelaTreino._cronRodando = false;
  clearInterval(TelaTreino._intervaloId);
  await Dados.limparCronometroTreino();
  container.querySelector('#campo-treino-duracao').value = duracao;
  TelaTreino._atualizarDisplayCronometro(container, duracao * 60000);
  TelaTreino._atualizarBotaoCronometro(container);
  container.querySelector('#cronometro-status').textContent = `Treino finalizado — ${Util.formatarDuracao(duracao)}. Ajuste e salve abaixo.`;
  container.querySelector('#campo-treino-descricao').focus();
};

// --- Sliders de sensação ---

TelaTreino._construirSlider = function _construirSlider(campo) {
  const valor = TelaTreino._sensacao[campo];
  return `
    <div class="campo-slider">
      <div class="cabecalho-slider">
        <span>${TelaTreino.ROTULOS_SENSACAO[campo]}</span>
        <span class="valor-slider" data-valor-slider="${campo}">${valor}</span>
      </div>
      <input type="range" min="1" max="10" step="1" value="${valor}" data-slider="${campo}">
    </div>
  `;
};

// --- Bloco de exercícios detalhados ---

TelaTreino._construirLinhaSerie = function _construirLinhaSerie(serie, j) {
  return `
    <div class="linha-serie" data-indice-serie="${j}">
      <span class="numero-serie">${j + 1}</span>
      <input type="number" class="campo-serie-reps" inputmode="numeric" placeholder="Reps" min="0" value="${serie.reps ?? ''}">
      <input type="number" class="campo-serie-carga" inputmode="decimal" step="0.5" placeholder="Kg" min="0" value="${serie.cargaKg ?? ''}">
      <input type="number" class="campo-serie-rpe" inputmode="numeric" placeholder="RPE" min="1" max="10" value="${serie.rpe ?? ''}">
      <button type="button" class="botao-remover-serie" aria-label="Remover série">✕</button>
    </div>
  `;
};

TelaTreino._construirCartaoExercicio = function _construirCartaoExercicio(exercicio, i) {
  return `
    <div class="cartao-exercicio" data-indice-exercicio="${i}">
      <div class="campo">
        <label>Exercício</label>
        <input type="text" class="campo-nome-exercicio" list="lista-catalogo-exercicios"
               value="${TelaTreino._escapar(exercicio.nome)}" placeholder="Ex: Supino reto">
      </div>
      <div class="lista-series">
        ${exercicio.series.map((s, j) => TelaTreino._construirLinhaSerie(s, j)).join('')}
      </div>
      <div class="linha-botoes">
        <button type="button" class="botao botao-secundario botao-add-serie">+ Série</button>
        <button type="button" class="botao botao-perigo botao-remover-exercicio">Remover exercício</button>
      </div>
    </div>
  `;
};

TelaTreino._rerenderizarExercicios = function _rerenderizarExercicios(container) {
  container.querySelector('#lista-exercicios-detalhe').innerHTML = TelaTreino._exercicios
    .map((ex, i) => TelaTreino._construirCartaoExercicio(ex, i)).join('');
};

TelaTreino._sincronizarExercicioDoDOM = function _sincronizarExercicioDoDOM(cartao) {
  const i = Number(cartao.dataset.indiceExercicio);
  TelaTreino._exercicios[i].nome = cartao.querySelector('.campo-nome-exercicio').value;
  cartao.querySelectorAll('.linha-serie').forEach((linha) => {
    const j = Number(linha.dataset.indiceSerie);
    const reps = linha.querySelector('.campo-serie-reps').value;
    const carga = linha.querySelector('.campo-serie-carga').value;
    const rpe = linha.querySelector('.campo-serie-rpe').value;
    TelaTreino._exercicios[i].series[j] = {
      reps: reps === '' ? null : parseInt(reps, 10),
      cargaKg: carga === '' ? null : parseFloat(carga),
      rpe: rpe === '' ? null : parseInt(rpe, 10),
    };
  });
};

// --- Catálogo de exercícios (autocomplete) ---

TelaTreino._construirDatalist = function _construirDatalist(catalogo) {
  const opcoes = catalogo.map((e) => `<option value="${TelaTreino._escapar(e.nome)}"></option>`).join('');
  return `<datalist id="lista-catalogo-exercicios">${opcoes}</datalist>`;
};

TelaTreino._aprenderExerciciosNoCatalogo = async function _aprenderExerciciosNoCatalogo(exercicios) {
  await Promise.all(exercicios.map(async (ex) => {
    const existente = await Dados.obterExercicioCatalogo(ex.nome);
    if (!existente) {
      try {
        await Dados.criarExercicioCatalogo({ nome: ex.nome, foco: [...TelaTreino._focoSelecionado] });
      } catch (erro) {
        // nome inválido ou já existente por corrida concorrente: ignora, não é crítico
      }
    }
  }));
};

// --- Lista de treinos recentes ---

TelaTreino._formatarItem = function _formatarItem(treino) {
  const focoTxt = (treino.foco && treino.foco.length)
    ? treino.foco.map((f) => TelaTreino.ROTULOS_FOCO[f] || f).join(', ') : '';
  const detalheTxt = (treino.exercicios && treino.exercicios.length)
    ? ` · ${treino.exercicios.length} exercício${treino.exercicios.length === 1 ? '' : 's'}` : '';
  const sensacaoTxt = treino.sensacao ? ` · RPE ${treino.sensacao.rpe}` : '';
  const descricaoTxt = treino.descricao
    ? `<span class="meta">${TelaTreino._escapar(treino.descricao)}</span>` : '';
  return `
    <li class="item-registro" data-id="${treino.id}">
      <div class="info-principal">
        <span class="valor-principal">${TelaTreino.ROTULOS_TIPO[treino.tipo] || treino.tipo} · ${Util.formatarDuracao(treino.duracaoMin)}</span>
        <span class="meta">${Util.formatarDataHoraBR(treino.inicio)}${focoTxt ? ` · ${focoTxt}` : ''}${detalheTxt}${sensacaoTxt}</span>
        ${descricaoTxt}
      </div>
      <div class="acoes-item">
        <button type="button" class="excluir" aria-label="Excluir" title="Excluir">🗑️</button>
      </div>
    </li>
  `;
};

TelaTreino._renderizarLista = async function _renderizarLista(container) {
  const listaEl = container.querySelector('#lista-treinos');
  const todos = await Dados.listarTreinos();
  const limite = Date.now() - 30 * 86400000;
  const recentes = todos.filter((t) => new Date(t.inicio).getTime() >= limite).reverse();
  listaEl.innerHTML = recentes.length
    ? recentes.map(TelaTreino._formatarItem).join('')
    : '<li class="texto-vazio">Nenhum treino nos últimos 30 dias.</li>';
};

// --- Formulário ---

TelaTreino._resetarFormulario = async function _resetarFormulario(container) {
  TelaTreino._tipoSelecionado = 'forca';
  TelaTreino._focoSelecionado = [];
  TelaTreino._sensacao = { energia: 5, dorMuscular: 5, humor: 5, rpe: 5 };
  TelaTreino._detalharAberto = false;
  TelaTreino._exercicios = [];
  TelaTreino._cronRodando = false;
  TelaTreino._cronInicio = null;
  clearInterval(TelaTreino._intervaloId);
  await Dados.limparCronometroTreino();

  container.querySelector('#campo-treino-inicio').value = Util.agoraParaCampoDataHora();
  container.querySelector('#campo-treino-duracao').value = '';
  container.querySelector('#campo-treino-descricao').value = '';

  container.querySelectorAll('#segmentado-tipo-treino button').forEach((b) => {
    b.classList.toggle('selecionado', b.dataset.tipo === 'forca');
  });
  container.querySelectorAll('#segmentado-foco-treino button').forEach((b) => b.classList.remove('selecionado'));

  TelaTreino.CAMPOS_SENSACAO.forEach((campo) => {
    container.querySelector(`input[data-slider="${campo}"]`).value = 5;
    container.querySelector(`[data-valor-slider="${campo}"]`).textContent = '5';
  });

  container.querySelector('#bloco-exercicios').hidden = true;
  container.querySelector('#botao-detalhar-exercicios').textContent = 'Detalhar exercícios';
  container.querySelector('#lista-exercicios-detalhe').innerHTML = '';

  TelaTreino._atualizarDisplayCronometro(container, 0);
  TelaTreino._atualizarBotaoCronometro(container);
};

TelaTreino._construirHTML = function _construirHTML(catalogoExercicios) {
  const tiposHTML = Schema.TIPOS_TREINO.map((t) => `
    <button type="button" data-tipo="${t}" class="${t === TelaTreino._tipoSelecionado ? 'selecionado' : ''}">${TelaTreino.ROTULOS_TIPO[t]}</button>
  `).join('');

  const focoHTML = TelaTreino.GRUPOS_FOCO.map((f) => `
    <button type="button" data-foco="${f}" class="${TelaTreino._focoSelecionado.includes(f) ? 'selecionado' : ''}">${TelaTreino.ROTULOS_FOCO[f]}</button>
  `).join('');

  const slidersHTML = TelaTreino.CAMPOS_SENSACAO.map((c) => TelaTreino._construirSlider(c)).join('');
  const exerciciosHTML = TelaTreino._exercicios.map((ex, i) => TelaTreino._construirCartaoExercicio(ex, i)).join('');

  return `
    <div class="cabecalho-tela">
      <h1>Treino</h1>
      <p class="subtitulo">Cronômetro + registro rápido. Detalhar exercícios é opcional.</p>
    </div>

    <div class="cartao" id="cartao-cronometro">
      <h2>Cronômetro</h2>
      <div class="cronometro-display" id="cronometro-display">00:00</div>
      <div class="cronometro-status" id="cronometro-status">Toque em Iniciar quando começar o treino.</div>
      <button type="button" class="botao botao-primario" id="botao-cronometro">Iniciar treino</button>
    </div>

    <div class="cartao">
      <h2>Registro</h2>
      <form id="formulario-treino">
        <div class="grade-campos-2">
          <div class="campo">
            <label for="campo-treino-inicio">Início</label>
            <input type="datetime-local" id="campo-treino-inicio" required>
          </div>
          <div class="campo">
            <label for="campo-treino-duracao">Duração (min)</label>
            <input type="number" id="campo-treino-duracao" inputmode="numeric" min="1" max="600" placeholder="min" required>
          </div>
        </div>
        <div class="campo">
          <label>Tipo</label>
          <div class="segmentado" id="segmentado-tipo-treino">${tiposHTML}</div>
        </div>
        <div class="campo">
          <label>Foco</label>
          <div class="segmentado" id="segmentado-foco-treino">${focoHTML}</div>
        </div>
        <div class="campo">
          <label for="campo-treino-descricao">Descrição</label>
          <textarea id="campo-treino-descricao" maxlength="500" placeholder="Como foi o treino..."></textarea>
        </div>
        ${slidersHTML}
        <div class="campo">
          <button type="button" class="botao botao-secundario" id="botao-detalhar-exercicios">Detalhar exercícios</button>
        </div>
        <div id="bloco-exercicios" ${TelaTreino._detalharAberto ? '' : 'hidden'}>
          <div id="lista-exercicios-detalhe">${exerciciosHTML}</div>
          <button type="button" class="botao botao-secundario" id="botao-add-exercicio">+ Exercício</button>
        </div>
        ${TelaTreino._construirDatalist(catalogoExercicios)}
        <div class="linha-botoes">
          <button type="submit" class="botao botao-primario" id="botao-salvar-treino">Salvar treino</button>
        </div>
      </form>
    </div>

    <div class="cartao">
      <h2>Últimos 30 dias</h2>
      <ul class="lista-registros" id="lista-treinos"></ul>
    </div>
  `;
};

TelaTreino.renderizar = async function renderizar(container) {
  clearInterval(TelaTreino._intervaloId);

  TelaTreino._tipoSelecionado = 'forca';
  TelaTreino._focoSelecionado = [];
  TelaTreino._sensacao = { energia: 5, dorMuscular: 5, humor: 5, rpe: 5 };
  TelaTreino._detalharAberto = false;
  TelaTreino._exercicios = [];

  const [cronometroSalvo, catalogoExercicios] = await Promise.all([
    Dados.obterCronometroTreino(),
    Dados.listarCatalogoExercicios(),
  ]);
  TelaTreino._cronRodando = !!(cronometroSalvo && cronometroSalvo.inicio);
  TelaTreino._cronInicio = TelaTreino._cronRodando ? cronometroSalvo.inicio : null;

  container.innerHTML = TelaTreino._construirHTML(catalogoExercicios);

  container.querySelector('#campo-treino-inicio').value = TelaTreino._cronRodando
    ? Util.isoParaCampoDataHora(TelaTreino._cronInicio)
    : Util.agoraParaCampoDataHora();

  TelaTreino._atualizarBotaoCronometro(container);
  if (TelaTreino._cronRodando) TelaTreino._iniciarTicker(container);

  container.querySelector('#botao-cronometro').addEventListener('click', async () => {
    if (TelaTreino._cronRodando) {
      await TelaTreino._finalizarCronometro(container);
    } else {
      await TelaTreino._iniciarCronometro(container);
    }
  });

  container.querySelector('#segmentado-tipo-treino').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-tipo]');
    if (!botao) return;
    TelaTreino._tipoSelecionado = botao.dataset.tipo;
    container.querySelectorAll('#segmentado-tipo-treino button').forEach((b) => b.classList.toggle('selecionado', b === botao));
  });

  container.querySelector('#segmentado-foco-treino').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-foco]');
    if (!botao) return;
    const foco = botao.dataset.foco;
    const indice = TelaTreino._focoSelecionado.indexOf(foco);
    if (indice === -1) TelaTreino._focoSelecionado.push(foco);
    else TelaTreino._focoSelecionado.splice(indice, 1);
    botao.classList.toggle('selecionado');
  });

  container.querySelectorAll('input[data-slider]').forEach((input) => {
    input.addEventListener('input', () => {
      const campo = input.dataset.slider;
      TelaTreino._sensacao[campo] = Number(input.value);
      container.querySelector(`[data-valor-slider="${campo}"]`).textContent = input.value;
    });
  });

  container.querySelector('#botao-detalhar-exercicios').addEventListener('click', () => {
    TelaTreino._detalharAberto = !TelaTreino._detalharAberto;
    const bloco = container.querySelector('#bloco-exercicios');
    bloco.hidden = !TelaTreino._detalharAberto;
    container.querySelector('#botao-detalhar-exercicios').textContent = TelaTreino._detalharAberto ? 'Ocultar exercícios' : 'Detalhar exercícios';
    if (TelaTreino._detalharAberto && TelaTreino._exercicios.length === 0) {
      TelaTreino._exercicios.push({ nome: '', series: [{ reps: null, cargaKg: null, rpe: null }] });
      TelaTreino._rerenderizarExercicios(container);
    }
  });

  const blocoExercicios = container.querySelector('#bloco-exercicios');

  blocoExercicios.addEventListener('input', (evento) => {
    const cartao = evento.target.closest('.cartao-exercicio');
    if (cartao) TelaTreino._sincronizarExercicioDoDOM(cartao);
  });

  blocoExercicios.addEventListener('click', (evento) => {
    if (evento.target.closest('#botao-add-exercicio')) {
      TelaTreino._exercicios.push({ nome: '', series: [{ reps: null, cargaKg: null, rpe: null }] });
      TelaTreino._rerenderizarExercicios(container);
      return;
    }
    const cartao = evento.target.closest('.cartao-exercicio');
    if (!cartao) return;
    const i = Number(cartao.dataset.indiceExercicio);

    if (evento.target.closest('.botao-add-serie')) {
      TelaTreino._sincronizarExercicioDoDOM(cartao);
      TelaTreino._exercicios[i].series.push({ reps: null, cargaKg: null, rpe: null });
      TelaTreino._rerenderizarExercicios(container);
      return;
    }

    if (evento.target.closest('.botao-remover-exercicio')) {
      TelaTreino._exercicios.splice(i, 1);
      TelaTreino._rerenderizarExercicios(container);
      return;
    }

    const linha = evento.target.closest('.linha-serie');
    if (linha && evento.target.closest('.botao-remover-serie')) {
      TelaTreino._sincronizarExercicioDoDOM(cartao);
      const j = Number(linha.dataset.indiceSerie);
      TelaTreino._exercicios[i].series.splice(j, 1);
      if (TelaTreino._exercicios[i].series.length === 0) {
        TelaTreino._exercicios[i].series.push({ reps: null, cargaKg: null, rpe: null });
      }
      TelaTreino._rerenderizarExercicios(container);
    }
  });

  container.querySelector('#formulario-treino').addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const inicioISO = Util.campoDataHoraParaISO(container.querySelector('#campo-treino-inicio').value);
    const duracaoMin = parseInt(container.querySelector('#campo-treino-duracao').value, 10);
    if (!inicioISO || !Number.isInteger(duracaoMin) || duracaoMin <= 0) {
      window.alert('Preencha início e duração (ou use o cronômetro).');
      return;
    }
    const fimISO = Util.dataParaISOSaoPaulo(new Date(new Date(inicioISO).getTime() + duracaoMin * 60000));

    const exerciciosValidos = TelaTreino._detalharAberto
      ? TelaTreino._exercicios
        .filter((ex) => ex.nome && ex.nome.trim() !== '')
        .map((ex) => ({
          nome: ex.nome.trim(),
          series: ex.series
            .filter((s) => s.reps !== null && s.reps !== undefined)
            .map((s) => ({ reps: s.reps, cargaKg: s.cargaKg, rpe: s.rpe })),
        }))
        .filter((ex) => ex.series.length > 0)
      : [];

    const dados = {
      inicio: inicioISO,
      fim: fimISO,
      duracaoMin,
      tipo: TelaTreino._tipoSelecionado,
      foco: [...TelaTreino._focoSelecionado],
      local: '',
      descricao: container.querySelector('#campo-treino-descricao').value.trim(),
      sensacao: { ...TelaTreino._sensacao },
      exercicios: exerciciosValidos,
      tags: [],
    };

    try {
      await Dados.criarTreino(dados);
      await TelaTreino._aprenderExerciciosNoCatalogo(exerciciosValidos);
      await TelaTreino._resetarFormulario(container);
      await TelaTreino._renderizarLista(container);
      App.mostrarConfirmacao('Treino salvo.');
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  container.querySelector('#lista-treinos').addEventListener('click', async (evento) => {
    const item = evento.target.closest('.item-registro');
    if (!item) return;
    if (evento.target.closest('.excluir')) {
      if (!window.confirm('Excluir este treino?')) return;
      await Dados.removerTreino(item.dataset.id);
      await TelaTreino._renderizarLista(container);
    }
  });

  await TelaTreino._renderizarLista(container);
};
