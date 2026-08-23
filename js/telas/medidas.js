const TelaMedidas = {};

TelaMedidas.ROTULOS_CAMPO = {
  pescoco: 'Pescoço',
  toraxPeito: 'Tórax / peito',
  cintura: 'Cintura',
  abdomen: 'Abdômen',
  quadril: 'Quadril',
  bracoRelaxadoD: 'Braço relaxado (D)',
  bracoRelaxadoE: 'Braço relaxado (E)',
  bracoContraidoD: 'Braço contraído (D)',
  bracoContraidoE: 'Braço contraído (E)',
  antebracoD: 'Antebraço (D)',
  antebracoE: 'Antebraço (E)',
  coxaD: 'Coxa (D)',
  coxaE: 'Coxa (E)',
  panturrilhaD: 'Panturrilha (D)',
  panturrilhaE: 'Panturrilha (E)',
};

TelaMedidas.GRUPOS = [
  { titulo: 'Tronco', campos: ['pescoco', 'toraxPeito', 'cintura', 'abdomen', 'quadril'] },
  { titulo: 'Braços', campos: ['bracoRelaxadoD', 'bracoRelaxadoE', 'bracoContraidoD', 'bracoContraidoE', 'antebracoD', 'antebracoE'] },
  { titulo: 'Pernas', campos: ['coxaD', 'coxaE', 'panturrilhaD', 'panturrilhaE'] },
];

TelaMedidas._idEmEdicao = null;

TelaMedidas._construirCampo = function _construirCampo(codigo, ultimaValor) {
  const placeholder = ultimaValor !== null && ultimaValor !== undefined
    ? `Última: ${Util.formatarNumero(ultimaValor, 1)}` : 'cm';
  return `
    <div class="campo">
      <label for="campo-medida-${codigo}">${TelaMedidas.ROTULOS_CAMPO[codigo]}</label>
      <input type="number" id="campo-medida-${codigo}" data-campo-medida="${codigo}"
             inputmode="decimal" step="0.1" min="0" max="300" placeholder="${placeholder}">
    </div>
  `;
};

TelaMedidas._construirFormulario = function _construirFormulario(ultimoRegistro) {
  const ultimasMedidas = (ultimoRegistro && ultimoRegistro.medidas) || {};
  const grupos = TelaMedidas.GRUPOS.map((grupo) => `
    <div class="campo">
      <label>${grupo.titulo}</label>
      <div class="grade-campos-2">
        ${grupo.campos.map((c) => TelaMedidas._construirCampo(c, ultimasMedidas[c])).join('')}
      </div>
    </div>
  `).join('');

  return `
    <div class="cartao">
      <h2 id="titulo-formulario-medidas">Registrar medidas</h2>
      <form id="formulario-medidas">
        <div class="campo">
          <label for="campo-medidas-data">Data e hora</label>
          <input type="datetime-local" id="campo-medidas-data" required>
        </div>
        <p class="subtitulo">Preencha só o que você mediu hoje.</p>
        ${grupos}
        <details class="secao-recolhivel">
          <summary>Observação (opcional)</summary>
          <div class="campo">
            <textarea id="campo-medidas-obs" maxlength="280"></textarea>
          </div>
        </details>
        <div class="linha-botoes">
          <button type="button" id="botao-cancelar-edicao-medidas" class="botao botao-secundario" hidden>Cancelar</button>
          <button type="submit" class="botao botao-primario" id="botao-salvar-medidas">Salvar medidas</button>
        </div>
      </form>
    </div>
  `;
};

TelaMedidas._limparFormulario = function _limparFormulario(container) {
  TelaMedidas._idEmEdicao = null;
  container.querySelector('#titulo-formulario-medidas').textContent = 'Registrar medidas';
  container.querySelector('#campo-medidas-data').value = Util.agoraParaCampoDataHora();
  container.querySelectorAll('[data-campo-medida]').forEach((input) => { input.value = ''; });
  container.querySelector('#campo-medidas-obs').value = '';
  container.querySelector('#botao-cancelar-edicao-medidas').hidden = true;
  container.querySelector('#botao-salvar-medidas').textContent = 'Salvar medidas';
};

TelaMedidas._preencherParaEdicao = function _preencherParaEdicao(container, registro) {
  TelaMedidas._idEmEdicao = registro.id;
  container.querySelector('#titulo-formulario-medidas').textContent = 'Editar medidas';
  container.querySelector('#campo-medidas-data').value = Util.isoParaCampoDataHora(registro.dataHora);
  container.querySelectorAll('[data-campo-medida]').forEach((input) => {
    const valor = registro.medidas[input.dataset.campoMedida];
    input.value = valor !== null && valor !== undefined ? valor : '';
  });
  container.querySelector('#campo-medidas-obs').value = registro.obs || '';
  container.querySelector('#botao-cancelar-edicao-medidas').hidden = false;
  container.querySelector('#botao-salvar-medidas').textContent = 'Salvar alterações';
  container.querySelector('.cartao').scrollIntoView({ block: 'start', behavior: 'smooth' });
};

TelaMedidas._formatarDelta = function _formatarDelta(atual, anterior) {
  if (anterior === null || anterior === undefined) return '';
  const delta = Util.arredondar(atual - anterior, 1);
  if (delta === 0) return ' (=)';
  const sinal = delta > 0 ? '+' : '';
  return ` (${sinal}${Util.formatarNumero(delta, 1)})`;
};

TelaMedidas._formatarItem = function _formatarItem(registro, anterior) {
  const camposPreenchidos = Object.keys(registro.medidas || {})
    .filter((c) => registro.medidas[c] !== null && registro.medidas[c] !== undefined);
  const linhas = camposPreenchidos.map((c) => {
    const valor = registro.medidas[c];
    const anteriorValor = anterior && anterior.medidas ? anterior.medidas[c] : null;
    return `${TelaMedidas.ROTULOS_CAMPO[c]}: ${Util.formatarNumero(valor, 1)} cm${TelaMedidas._formatarDelta(valor, anteriorValor)}`;
  });
  return `
    <li class="item-registro" data-id="${registro.id}">
      <div class="info-principal">
        <span class="valor-principal">${Util.formatarDataHoraBR(registro.dataHora)}</span>
        <span class="meta">${linhas.join(' · ') || 'Sem medidas preenchidas'}</span>
      </div>
      <div class="acoes-item">
        <button type="button" class="editar" aria-label="Editar" title="Editar">✏️</button>
        <button type="button" class="excluir" aria-label="Excluir" title="Excluir">🗑️</button>
      </div>
    </li>
  `;
};

TelaMedidas._renderizarLista = async function _renderizarLista(container) {
  const listaEl = container.querySelector('#lista-medidas');
  const todos = await Dados.listarMedidas();
  if (todos.length === 0) {
    listaEl.innerHTML = '<li class="texto-vazio">Nenhuma medida registrada ainda.</li>';
    return;
  }
  const itens = [];
  for (let i = todos.length - 1; i >= 0; i -= 1) {
    itens.push(TelaMedidas._formatarItem(todos[i], todos[i - 1]));
  }
  listaEl.innerHTML = itens.join('');
};

TelaMedidas.renderizar = async function renderizar(container) {
  TelaMedidas._idEmEdicao = null;
  const todos = await Dados.listarMedidas();
  const ultimoRegistro = todos[todos.length - 1] || null;

  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Medidas</h1>
      <p class="subtitulo">Todos os campos são opcionais — registre só o que mediu</p>
    </div>
    ${TelaMedidas._construirFormulario(ultimoRegistro)}
    <div class="cartao">
      <h2>Histórico</h2>
      <ul class="lista-registros" id="lista-medidas"></ul>
    </div>
  `;

  container.querySelector('#campo-medidas-data').value = Util.agoraParaCampoDataHora();

  container.querySelector('#botao-cancelar-edicao-medidas').addEventListener('click', () => {
    TelaMedidas._limparFormulario(container);
  });

  container.querySelector('#formulario-medidas').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const medidas = {};
    container.querySelectorAll('[data-campo-medida]').forEach((input) => {
      if (input.value !== '') medidas[input.dataset.campoMedida] = parseFloat(input.value);
    });
    const dados = {
      dataHora: Util.campoDataHoraParaISO(container.querySelector('#campo-medidas-data').value),
      medidas,
      obs: container.querySelector('#campo-medidas-obs').value.trim(),
    };
    try {
      if (TelaMedidas._idEmEdicao) {
        await Dados.atualizarMedidas(TelaMedidas._idEmEdicao, dados);
      } else {
        await Dados.criarMedidas(dados);
      }
      TelaMedidas._limparFormulario(container);
      await TelaMedidas._renderizarLista(container);
      App.mostrarConfirmacao('Medidas salvas.');
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  container.querySelector('#lista-medidas').addEventListener('click', async (evento) => {
    const item = evento.target.closest('.item-registro');
    if (!item) return;
    const { id } = item.dataset;
    if (evento.target.closest('.excluir')) {
      if (!window.confirm('Excluir este registro de medidas?')) return;
      await Dados.removerMedidas(id);
      await TelaMedidas._renderizarLista(container);
      if (TelaMedidas._idEmEdicao === id) TelaMedidas._limparFormulario(container);
      return;
    }
    if (evento.target.closest('.editar')) {
      const registro = await Dados.obterMedidas(id);
      if (registro) TelaMedidas._preencherParaEdicao(container, registro);
    }
  });

  await TelaMedidas._renderizarLista(container);
};
