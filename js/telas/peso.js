const TelaPeso = {};

TelaPeso.ROTULOS_CONTEXTO = {
  jejum: 'Jejum',
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  pos_treino: 'Pós-treino',
};

TelaPeso._contextoSelecionado = 'jejum';
TelaPeso._idEmEdicao = null;

TelaPeso._construirFormulario = function _construirFormulario() {
  const secoesContexto = Schema.CONTEXTOS_PESO.map((codigo) => `
    <button type="button" data-contexto="${codigo}" class="${codigo === TelaPeso._contextoSelecionado ? 'selecionado' : ''}">
      ${TelaPeso.ROTULOS_CONTEXTO[codigo]}
    </button>
  `).join('');

  return `
    <div class="cartao">
      <h2 id="titulo-formulario-peso">Registrar peso</h2>
      <form id="formulario-peso">
        <div class="campo">
          <label for="campo-peso-data">Data e hora</label>
          <input type="datetime-local" id="campo-peso-data" required>
        </div>
        <div class="grade-campos-2">
          <div class="campo">
            <label for="campo-peso-kg">Peso (kg)</label>
            <input type="number" id="campo-peso-kg" inputmode="decimal" step="0.1" min="0" max="500" required autofocus>
          </div>
          <div class="campo">
            <label for="campo-peso-gordura">Gordura (%)</label>
            <input type="number" id="campo-peso-gordura" inputmode="decimal" step="0.1" min="0" max="100">
          </div>
        </div>
        <div class="campo">
          <label>Contexto</label>
          <div class="segmentado" id="segmentado-contexto-peso">${secoesContexto}</div>
        </div>
        <details class="secao-recolhivel">
          <summary>Observação (opcional)</summary>
          <div class="campo">
            <textarea id="campo-peso-obs" maxlength="280"></textarea>
          </div>
        </details>
        <div class="linha-botoes">
          <button type="button" id="botao-cancelar-edicao-peso" class="botao botao-secundario" hidden>Cancelar</button>
          <button type="submit" class="botao botao-primario" id="botao-salvar-peso">Salvar peso</button>
        </div>
      </form>
    </div>
  `;
};

TelaPeso._preencherFormularioPadrao = function _preencherFormularioPadrao(container) {
  TelaPeso._idEmEdicao = null;
  container.querySelector('#titulo-formulario-peso').textContent = 'Registrar peso';
  container.querySelector('#campo-peso-data').value = Util.agoraParaCampoDataHora();
  container.querySelector('#campo-peso-kg').value = '';
  container.querySelector('#campo-peso-gordura').value = '';
  container.querySelector('#campo-peso-obs').value = '';
  container.querySelector('#botao-cancelar-edicao-peso').hidden = true;
  container.querySelector('#botao-salvar-peso').textContent = 'Salvar peso';
  TelaPeso._contextoSelecionado = 'jejum';
  container.querySelectorAll('#segmentado-contexto-peso button').forEach((botao) => {
    botao.classList.toggle('selecionado', botao.dataset.contexto === 'jejum');
  });
};

TelaPeso._preencherParaEdicao = function _preencherParaEdicao(container, registro) {
  TelaPeso._idEmEdicao = registro.id;
  container.querySelector('#titulo-formulario-peso').textContent = 'Editar peso';
  container.querySelector('#campo-peso-data').value = Util.isoParaCampoDataHora(registro.dataHora);
  container.querySelector('#campo-peso-kg').value = registro.pesoKg;
  container.querySelector('#campo-peso-gordura').value = registro.gorduraPct ?? '';
  container.querySelector('#campo-peso-obs').value = registro.obs || '';
  container.querySelector('#botao-cancelar-edicao-peso').hidden = false;
  container.querySelector('#botao-salvar-peso').textContent = 'Salvar alterações';
  TelaPeso._contextoSelecionado = registro.contexto;
  container.querySelectorAll('#segmentado-contexto-peso button').forEach((botao) => {
    botao.classList.toggle('selecionado', botao.dataset.contexto === registro.contexto);
  });
  container.querySelector('#campo-peso-kg').scrollIntoView({ block: 'center', behavior: 'smooth' });
};

TelaPeso._formatarItem = function _formatarItem(registro) {
  const gordura = registro.gorduraPct !== null && registro.gorduraPct !== undefined
    ? ` · ${Util.formatarNumero(registro.gorduraPct, 1)}% gordura`
    : '';
  return `
    <li class="item-registro" data-id="${registro.id}">
      <div class="info-principal">
        <span class="valor-principal">${Util.formatarNumero(registro.pesoKg, 1)} kg</span>
        <span class="meta">${Util.formatarDataHoraBR(registro.dataHora)} · ${TelaPeso.ROTULOS_CONTEXTO[registro.contexto] || registro.contexto}${gordura}</span>
      </div>
      <div class="acoes-item">
        <button type="button" class="editar" aria-label="Editar" title="Editar">✏️</button>
        <button type="button" class="excluir" aria-label="Excluir" title="Excluir">🗑️</button>
      </div>
    </li>
  `;
};

TelaPeso._renderizarLista = async function _renderizarLista(container) {
  const listaEl = container.querySelector('#lista-peso');
  const todos = await Dados.listarPeso();
  const limite = Date.now() - 30 * 86400000;
  const recentes = todos.filter((r) => new Date(r.dataHora).getTime() >= limite).reverse();
  listaEl.innerHTML = recentes.length
    ? recentes.map(TelaPeso._formatarItem).join('')
    : '<li class="texto-vazio">Nenhum registro nos últimos 30 dias.</li>';
};

TelaPeso.renderizar = async function renderizar(container) {
  TelaPeso._idEmEdicao = null;
  TelaPeso._contextoSelecionado = 'jejum';

  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Peso</h1>
      <p class="subtitulo">Registro rápido e histórico dos últimos 30 dias</p>
    </div>
    ${TelaPeso._construirFormulario()}
    <div class="cartao">
      <h2>Últimos 30 dias</h2>
      <ul class="lista-registros" id="lista-peso"></ul>
    </div>
  `;

  container.querySelector('#campo-peso-data').value = Util.agoraParaCampoDataHora();

  container.querySelector('#segmentado-contexto-peso').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-contexto]');
    if (!botao) return;
    TelaPeso._contextoSelecionado = botao.dataset.contexto;
    container.querySelectorAll('#segmentado-contexto-peso button').forEach((b) => {
      b.classList.toggle('selecionado', b === botao);
    });
  });

  container.querySelector('#botao-cancelar-edicao-peso').addEventListener('click', () => {
    TelaPeso._preencherFormularioPadrao(container);
  });

  container.querySelector('#formulario-peso').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = {
      dataHora: Util.campoDataHoraParaISO(container.querySelector('#campo-peso-data').value),
      pesoKg: parseFloat(container.querySelector('#campo-peso-kg').value),
      gorduraPct: container.querySelector('#campo-peso-gordura').value === ''
        ? null : parseFloat(container.querySelector('#campo-peso-gordura').value),
      massaMagraKg: null,
      contexto: TelaPeso._contextoSelecionado,
      obs: container.querySelector('#campo-peso-obs').value.trim(),
    };
    try {
      if (TelaPeso._idEmEdicao) {
        await Dados.atualizarPeso(TelaPeso._idEmEdicao, dados);
      } else {
        await Dados.criarPeso(dados);
      }
      TelaPeso._preencherFormularioPadrao(container);
      await TelaPeso._renderizarLista(container);
      App.mostrarConfirmacao('Peso salvo.');
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  container.querySelector('#lista-peso').addEventListener('click', async (evento) => {
    const item = evento.target.closest('.item-registro');
    if (!item) return;
    const { id } = item.dataset;
    if (evento.target.closest('.excluir')) {
      if (!window.confirm('Excluir este registro de peso?')) return;
      await Dados.removerPeso(id);
      await TelaPeso._renderizarLista(container);
      if (TelaPeso._idEmEdicao === id) TelaPeso._preencherFormularioPadrao(container);
      return;
    }
    if (evento.target.closest('.editar')) {
      const registro = await Dados.obterPeso(id);
      if (registro) TelaPeso._preencherParaEdicao(container, registro);
    }
  });

  await TelaPeso._renderizarLista(container);
};
