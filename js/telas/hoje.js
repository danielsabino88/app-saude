const TelaHoje = {};

TelaHoje.ROTULOS_CONTEXTO = {
  jejum: 'Jejum',
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  pos_treino: 'Pós-treino',
};

TelaHoje._formularioPesoAberto = false;
TelaHoje._contextoRapido = 'jejum';

TelaHoje._construirBotaoAcao = function _construirBotaoAcao(icone, rotulo, rota, ativo) {
  return `
    <button type="button" class="botao-acao ${ativo ? 'ativo' : ''}" data-acao="${rota}">
      <span class="icone-acao">${icone}</span>
      <span>${rotulo}</span>
    </button>
  `;
};

TelaHoje._construirFormularioRapidoPeso = function _construirFormularioRapidoPeso() {
  const segmentado = Schema.CONTEXTOS_PESO.map((codigo) => `
    <button type="button" data-contexto="${codigo}" class="${codigo === TelaHoje._contextoRapido ? 'selecionado' : ''}">
      ${TelaHoje.ROTULOS_CONTEXTO[codigo]}
    </button>
  `).join('');

  return `
    <div class="cartao" id="cartao-peso-rapido">
      <h2>Registrar peso agora</h2>
      <form id="formulario-peso-rapido">
        <div class="campo">
          <label for="campo-hoje-peso-data">Data e hora</label>
          <input type="datetime-local" id="campo-hoje-peso-data" required>
        </div>
        <div class="campo">
          <label for="campo-hoje-peso-kg">Peso (kg)</label>
          <input type="number" id="campo-hoje-peso-kg" inputmode="decimal" step="0.1" min="0" max="500" required>
        </div>
        <div class="campo">
          <label>Contexto</label>
          <div class="segmentado" id="segmentado-hoje-contexto">${segmentado}</div>
        </div>
        <div class="linha-botoes">
          <button type="button" id="botao-fechar-peso-rapido" class="botao botao-secundario">Cancelar</button>
          <button type="submit" class="botao botao-primario">Salvar peso</button>
        </div>
      </form>
    </div>
  `;
};

TelaHoje._iconePorTipo = {
  peso: '⚖️',
  medidas: '📏',
  marcador: '🩺',
  treino: '🏋️',
};

TelaHoje._montarResumoDoDia = async function _montarResumoDoDia() {
  const hoje = Util.hojeISO();
  const dentroDoDia = (iso) => Util.diaEmSaoPaulo(new Date(iso)) === hoje;

  const [pesos, medidas, marcadores, catalogo, treinos] = await Promise.all([
    Dados.listarPeso(),
    Dados.listarMedidas(),
    Dados.listarMarcadores(),
    Dados.listarCatalogoMarcadores(),
    Dados.listarTreinos(),
  ]);

  const itens = [];

  pesos.filter((r) => dentroDoDia(r.dataHora)).forEach((r) => {
    itens.push({
      tipo: 'peso',
      dataHora: r.dataHora,
      texto: `Peso: ${Util.formatarNumero(r.pesoKg, 1)} kg (${TelaHoje.ROTULOS_CONTEXTO[r.contexto] || r.contexto})`,
    });
  });

  medidas.filter((r) => dentroDoDia(r.dataHora)).forEach((r) => {
    const quantidade = Object.keys(r.medidas || {}).filter((c) => r.medidas[c] !== null && r.medidas[c] !== undefined).length;
    itens.push({
      tipo: 'medidas',
      dataHora: r.dataHora,
      texto: `Medidas: ${quantidade} campo${quantidade === 1 ? '' : 's'} registrado${quantidade === 1 ? '' : 's'}`,
    });
  });

  marcadores.filter((r) => dentroDoDia(r.dataHora)).forEach((r) => {
    const doCatalogo = catalogo.find((m) => m.codigo === r.codigo);
    const nome = doCatalogo ? doCatalogo.nome : r.codigo;
    const unidade = doCatalogo ? doCatalogo.unidade : '';
    itens.push({
      tipo: 'marcador',
      dataHora: r.dataHora,
      texto: `${nome}: ${Util.formatarNumero(r.valor, doCatalogo ? doCatalogo.casasDecimais : 1)} ${unidade}`,
    });
  });

  const rotulosTipoTreino = { forca: 'Força', cardio: 'Cardio', mobilidade: 'Mobilidade', esporte: 'Esporte', outro: 'Treino' };
  treinos.filter((t) => dentroDoDia(t.inicio)).forEach((t) => {
    itens.push({
      tipo: 'treino',
      dataHora: t.inicio,
      texto: `${rotulosTipoTreino[t.tipo] || t.tipo}: ${Util.formatarDuracao(t.duracaoMin)}`,
    });
  });

  itens.sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  return itens;
};

TelaHoje._renderizarResumo = async function _renderizarResumo(container) {
  const listaEl = container.querySelector('#lista-resumo-hoje');
  const itens = await TelaHoje._montarResumoDoDia();
  listaEl.innerHTML = itens.length
    ? itens.map((item) => `
      <li class="item-registro">
        <div class="info-principal">
          <span class="valor-principal">${TelaHoje._iconePorTipo[item.tipo]} ${item.texto}</span>
          <span class="meta">${Util.formatarDataHoraBR(item.dataHora).split(' ')[1]}</span>
        </div>
      </li>
    `).join('')
    : '<li class="texto-vazio">Nenhum registro hoje ainda.</li>';
};

TelaHoje._alternarFormularioPeso = function _alternarFormularioPeso(container, aberto) {
  TelaHoje._formularioPesoAberto = aberto;
  const existente = container.querySelector('#cartao-peso-rapido');
  if (aberto) {
    if (existente) return;
    container.querySelector('#area-formulario-rapido').innerHTML = TelaHoje._construirFormularioRapidoPeso();
    TelaHoje._ligarFormularioPeso(container);
    const campoData = container.querySelector('#campo-hoje-peso-data');
    campoData.value = Util.agoraParaCampoDataHora();
    container.querySelector('#campo-hoje-peso-kg').focus();
    container.querySelector('[data-acao="peso"]').classList.add('ativo');
  } else {
    container.querySelector('#area-formulario-rapido').innerHTML = '';
    const botaoPeso = container.querySelector('[data-acao="peso"]');
    if (botaoPeso) botaoPeso.classList.remove('ativo');
  }
};

TelaHoje._ligarFormularioPeso = function _ligarFormularioPeso(container) {
  container.querySelector('#segmentado-hoje-contexto').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-contexto]');
    if (!botao) return;
    TelaHoje._contextoRapido = botao.dataset.contexto;
    container.querySelectorAll('#segmentado-hoje-contexto button').forEach((b) => b.classList.toggle('selecionado', b === botao));
  });

  container.querySelector('#botao-fechar-peso-rapido').addEventListener('click', () => {
    TelaHoje._alternarFormularioPeso(container, false);
  });

  container.querySelector('#formulario-peso-rapido').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    try {
      await Dados.criarPeso({
        dataHora: Util.campoDataHoraParaISO(container.querySelector('#campo-hoje-peso-data').value),
        pesoKg: parseFloat(container.querySelector('#campo-hoje-peso-kg').value),
        gorduraPct: null,
        massaMagraKg: null,
        contexto: TelaHoje._contextoRapido,
        obs: '',
      });
      TelaHoje._alternarFormularioPeso(container, false);
      await TelaHoje._renderizarResumo(container);
      App.mostrarConfirmacao('Peso salvo.');
    } catch (erro) {
      window.alert(erro.message);
    }
  });
};

TelaHoje.renderizar = async function renderizar(container) {
  TelaHoje._formularioPesoAberto = false;
  TelaHoje._contextoRapido = 'jejum';

  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Hoje</h1>
      <p class="subtitulo">${dataFormatada}</p>
    </div>
    <div id="area-metas-hoje"></div>
    <div class="grade-acoes">
      ${TelaHoje._construirBotaoAcao('🏋️', 'Treino', 'treino')}
      ${TelaHoje._construirBotaoAcao('⚖️', 'Peso', 'peso')}
      ${TelaHoje._construirBotaoAcao('📏', 'Medidas', 'medidas')}
      ${TelaHoje._construirBotaoAcao('🩺', 'Marcador', 'marcadores')}
    </div>
    <div id="area-formulario-rapido"></div>
    <div class="cartao">
      <h2>Resumo do dia</h2>
      <ul class="lista-registros" id="lista-resumo-hoje"></ul>
    </div>
  `;

  container.querySelectorAll('.botao-acao').forEach((botao) => {
    botao.addEventListener('click', () => {
      const acao = botao.dataset.acao;
      if (acao === 'peso') {
        TelaHoje._alternarFormularioPeso(container, !TelaHoje._formularioPesoAberto);
      } else {
        App.navegarPara(acao);
      }
    });
  });

  await Promise.all([
    TelaHoje._renderizarResumo(container),
    TelaMetas.renderizarResumoEmHoje(container),
  ]);
};
