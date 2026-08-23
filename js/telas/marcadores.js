const TelaMarcadores = {};

TelaMarcadores.ROTULOS_ORIGEM = {
  aparelho: 'Aparelho',
  exame_laboratorio: 'Exame de laboratório',
  manual: 'Manual',
};

TelaMarcadores.ROTULOS_DIRECAO = {
  aumentar: 'Aumentar',
  reduzir: 'Reduzir',
  manter: 'Manter',
};

TelaMarcadores._catalogo = [];
TelaMarcadores._codigoSelecionado = null;
TelaMarcadores._contextoSelecionado = null;
TelaMarcadores._origemSelecionada = 'manual';
TelaMarcadores._idEmEdicao = null;

TelaMarcadores._obterMarcadorSelecionado = function _obterMarcadorSelecionado() {
  return TelaMarcadores._catalogo.find((m) => m.codigo === TelaMarcadores._codigoSelecionado) || null;
};

TelaMarcadores._construirSeletorMarcador = function _construirSeletorMarcador() {
  const opcoes = TelaMarcadores._catalogo
    .map((m) => `<option value="${m.codigo}">${m.nome} (${m.unidade})</option>`)
    .join('');
  return `
    <div class="campo">
      <label for="campo-marcador-codigo">Marcador</label>
      <select id="campo-marcador-codigo">${opcoes}</select>
    </div>
  `;
};

TelaMarcadores._renderizarSegmentoContexto = function _renderizarSegmentoContexto(container) {
  const alvo = container.querySelector('#area-contexto-marcador');
  const marcador = TelaMarcadores._obterMarcadorSelecionado();
  const contextos = marcador && Array.isArray(marcador.contextos) ? marcador.contextos : [];
  if (contextos.length === 0) {
    TelaMarcadores._contextoSelecionado = TelaMarcadores._contextoSelecionado || 'manual';
    alvo.innerHTML = `
      <label for="campo-marcador-contexto-livre">Contexto</label>
      <input type="text" id="campo-marcador-contexto-livre" maxlength="40" value="${TelaMarcadores._contextoSelecionado}">
    `;
    return;
  }
  if (!contextos.includes(TelaMarcadores._contextoSelecionado)) {
    TelaMarcadores._contextoSelecionado = contextos[0];
  }
  alvo.innerHTML = `
    <label>Contexto</label>
    <div class="segmentado" id="segmentado-contexto-marcador">
      ${contextos.map((c) => `<button type="button" data-contexto="${c}" class="${c === TelaMarcadores._contextoSelecionado ? 'selecionado' : ''}">${c.replace(/_/g, ' ')}</button>`).join('')}
    </div>
  `;
  alvo.querySelector('#segmentado-contexto-marcador').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-contexto]');
    if (!botao) return;
    TelaMarcadores._contextoSelecionado = botao.dataset.contexto;
    alvo.querySelectorAll('button').forEach((b) => b.classList.toggle('selecionado', b === botao));
  });
};

TelaMarcadores._ajustarCampoValor = function _ajustarCampoValor(container) {
  const marcador = TelaMarcadores._obterMarcadorSelecionado();
  const campo = container.querySelector('#campo-marcador-valor');
  const rotuloUnidade = container.querySelector('#unidade-marcador-valor');
  if (!marcador) return;
  const casas = marcador.casasDecimais || 0;
  campo.step = casas > 0 ? (1 / (10 ** casas)).toString() : '1';
  campo.inputMode = casas > 0 ? 'decimal' : 'numeric';
  rotuloUnidade.textContent = marcador.unidade;
};

TelaMarcadores._construirFormularioRegistro = function _construirFormularioRegistro() {
  return `
    <div class="cartao">
      <h2 id="titulo-formulario-marcador">Novo registro</h2>
      <form id="formulario-marcador">
        ${TelaMarcadores._construirSeletorMarcador()}
        <div class="campo">
          <label for="campo-marcador-data">Data e hora</label>
          <input type="datetime-local" id="campo-marcador-data" required>
        </div>
        <div class="campo">
          <label for="campo-marcador-valor">Valor (<span id="unidade-marcador-valor"></span>)</label>
          <input type="number" id="campo-marcador-valor" required>
        </div>
        <div class="campo" id="area-contexto-marcador"></div>
        <div class="campo">
          <label>Origem</label>
          <div class="segmentado" id="segmentado-origem-marcador">
            ${Schema.ORIGENS_MARCADOR.map((o) => `<button type="button" data-origem="${o}" class="${o === TelaMarcadores._origemSelecionada ? 'selecionado' : ''}">${TelaMarcadores.ROTULOS_ORIGEM[o]}</button>`).join('')}
          </div>
        </div>
        <details class="secao-recolhivel">
          <summary>Observação (opcional)</summary>
          <div class="campo">
            <textarea id="campo-marcador-obs" maxlength="280"></textarea>
          </div>
        </details>
        <div class="linha-botoes">
          <button type="button" id="botao-cancelar-edicao-marcador" class="botao botao-secundario" hidden>Cancelar</button>
          <button type="submit" class="botao botao-primario" id="botao-salvar-marcador">Salvar registro</button>
        </div>
      </form>
    </div>
  `;
};

TelaMarcadores._construirFormularioCatalogo = function _construirFormularioCatalogo() {
  return `
    <details class="secao-recolhivel cartao">
      <summary>Cadastrar novo marcador no catálogo</summary>
      <form id="formulario-catalogo-marcador">
        <div class="grade-campos-2">
          <div class="campo">
            <label for="campo-catalogo-codigo">Código (sem espaços)</label>
            <input type="text" id="campo-catalogo-codigo" pattern="[a-z0-9_]+" placeholder="ex: colesterol_total" required>
          </div>
          <div class="campo">
            <label for="campo-catalogo-nome">Nome</label>
            <input type="text" id="campo-catalogo-nome" placeholder="ex: Colesterol total" required>
          </div>
        </div>
        <div class="grade-campos-2">
          <div class="campo">
            <label for="campo-catalogo-unidade">Unidade</label>
            <input type="text" id="campo-catalogo-unidade" placeholder="ex: mg/dL" required>
          </div>
          <div class="campo">
            <label for="campo-catalogo-casas">Casas decimais</label>
            <input type="number" id="campo-catalogo-casas" inputmode="numeric" min="0" max="4" value="0" required>
          </div>
        </div>
        <div class="campo">
          <label for="campo-catalogo-contextos">Contextos aceitos (separados por vírgula, opcional)</label>
          <input type="text" id="campo-catalogo-contextos" placeholder="ex: jejum, pos_prandial">
        </div>
        <div class="campo">
          <label>Direção desejada</label>
          <div class="segmentado" id="segmentado-direcao-catalogo">
            ${Schema.DIRECOES_MARCADOR.map((d, i) => `<button type="button" data-direcao="${d}" class="${i === 2 ? 'selecionado' : ''}">${TelaMarcadores.ROTULOS_DIRECAO[d]}</button>`).join('')}
          </div>
        </div>
        <button type="submit" class="botao botao-primario">Adicionar ao catálogo</button>
      </form>
      <ul class="lista-registros" id="lista-catalogo-marcadores" style="margin-top:12px;"></ul>
    </details>
  `;
};

TelaMarcadores._formatarItemHistorico = function _formatarItemHistorico(registro) {
  const marcador = TelaMarcadores._catalogo.find((m) => m.codigo === registro.codigo);
  const nome = marcador ? marcador.nome : registro.codigo;
  const unidade = marcador ? marcador.unidade : '';
  const casas = marcador ? marcador.casasDecimais : 1;
  return `
    <li class="item-registro" data-id="${registro.id}">
      <div class="info-principal">
        <span class="valor-principal">${nome}: ${Util.formatarNumero(registro.valor, casas)} ${unidade}</span>
        <span class="meta">${Util.formatarDataHoraBR(registro.dataHora)} · ${registro.contexto.replace(/_/g, ' ')} · ${TelaMarcadores.ROTULOS_ORIGEM[registro.origem] || registro.origem}</span>
      </div>
      <div class="acoes-item">
        <button type="button" class="excluir" aria-label="Excluir" title="Excluir">🗑️</button>
      </div>
    </li>
  `;
};

TelaMarcadores._renderizarHistorico = async function _renderizarHistorico(container) {
  const listaEl = container.querySelector('#lista-historico-marcadores');
  const filtro = container.querySelector('#campo-filtro-historico-marcador').value;
  const registros = await Dados.listarMarcadores(filtro || undefined);
  const ordenados = registros.slice().reverse();
  listaEl.innerHTML = ordenados.length
    ? ordenados.map(TelaMarcadores._formatarItemHistorico).join('')
    : '<li class="texto-vazio">Nenhum registro ainda.</li>';
};

TelaMarcadores._renderizarListaCatalogo = function _renderizarListaCatalogo(container) {
  const listaEl = container.querySelector('#lista-catalogo-marcadores');
  if (!listaEl) return;
  listaEl.innerHTML = TelaMarcadores._catalogo.map((m) => `
    <li class="item-registro" data-codigo="${m.codigo}">
      <div class="info-principal">
        <span class="valor-principal">${m.nome}</span>
        <span class="meta">${m.codigo} · ${m.unidade} · ${TelaMarcadores.ROTULOS_DIRECAO[m.direcaoDesejada] || m.direcaoDesejada}</span>
      </div>
      <div class="acoes-item">
        <button type="button" class="excluir" aria-label="Remover" title="Remover">🗑️</button>
      </div>
    </li>
  `).join('');
};

TelaMarcadores._limparFormularioRegistro = function _limparFormularioRegistro(container) {
  TelaMarcadores._idEmEdicao = null;
  container.querySelector('#titulo-formulario-marcador').textContent = 'Novo registro';
  container.querySelector('#campo-marcador-data').value = Util.agoraParaCampoDataHora();
  container.querySelector('#campo-marcador-valor').value = '';
  container.querySelector('#campo-marcador-obs').value = '';
  container.querySelector('#botao-cancelar-edicao-marcador').hidden = true;
  container.querySelector('#botao-salvar-marcador').textContent = 'Salvar registro';
};

TelaMarcadores._atualizarSelecaoAtual = function _atualizarSelecaoAtual(container) {
  TelaMarcadores._renderizarSegmentoContexto(container);
  TelaMarcadores._ajustarCampoValor(container);
};

TelaMarcadores.renderizar = async function renderizar(container) {
  TelaMarcadores._idEmEdicao = null;
  TelaMarcadores._catalogo = await Dados.listarCatalogoMarcadores();

  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Marcadores</h1>
      <p class="subtitulo">Catálogo configurável de exames e aparelhos</p>
    </div>
  `;

  if (TelaMarcadores._catalogo.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="aviso-mensagem">Nenhum marcador cadastrado ainda. Cadastre o primeiro abaixo para começar a registrar.</div>');
  } else {
    TelaMarcadores._codigoSelecionado = TelaMarcadores._catalogo[0].codigo;
    container.insertAdjacentHTML('beforeend', TelaMarcadores._construirFormularioRegistro());
  }

  container.insertAdjacentHTML('beforeend', TelaMarcadores._construirFormularioCatalogo());

  container.insertAdjacentHTML('beforeend', `
    <div class="cartao">
      <h2>Histórico</h2>
      <div class="campo">
        <label for="campo-filtro-historico-marcador">Filtrar por marcador</label>
        <select id="campo-filtro-historico-marcador">
          <option value="">Todos</option>
          ${TelaMarcadores._catalogo.map((m) => `<option value="${m.codigo}">${m.nome}</option>`).join('')}
        </select>
      </div>
      <ul class="lista-registros" id="lista-historico-marcadores"></ul>
    </div>
  `);

  TelaMarcadores._renderizarListaCatalogo(container);
  await TelaMarcadores._renderizarHistorico(container);

  if (TelaMarcadores._catalogo.length > 0) {
    container.querySelector('#campo-marcador-data').value = Util.agoraParaCampoDataHora();
    TelaMarcadores._contextoSelecionado = null;
    TelaMarcadores._atualizarSelecaoAtual(container);

    container.querySelector('#campo-marcador-codigo').addEventListener('change', (evento) => {
      TelaMarcadores._codigoSelecionado = evento.target.value;
      TelaMarcadores._contextoSelecionado = null;
      TelaMarcadores._atualizarSelecaoAtual(container);
    });

    container.querySelector('#segmentado-origem-marcador').addEventListener('click', (evento) => {
      const botao = evento.target.closest('button[data-origem]');
      if (!botao) return;
      TelaMarcadores._origemSelecionada = botao.dataset.origem;
      container.querySelectorAll('#segmentado-origem-marcador button').forEach((b) => b.classList.toggle('selecionado', b === botao));
    });

    container.querySelector('#botao-cancelar-edicao-marcador').addEventListener('click', () => {
      TelaMarcadores._limparFormularioRegistro(container);
    });

    container.querySelector('#formulario-marcador').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const campoContextoLivre = container.querySelector('#campo-marcador-contexto-livre');
      const contexto = campoContextoLivre ? campoContextoLivre.value.trim() : TelaMarcadores._contextoSelecionado;
      const dados = {
        dataHora: Util.campoDataHoraParaISO(container.querySelector('#campo-marcador-data').value),
        codigo: TelaMarcadores._codigoSelecionado,
        valor: parseFloat(container.querySelector('#campo-marcador-valor').value),
        contexto,
        origem: TelaMarcadores._origemSelecionada,
        obs: container.querySelector('#campo-marcador-obs').value.trim(),
      };
      try {
        if (TelaMarcadores._idEmEdicao) {
          await Dados.atualizarMarcador(TelaMarcadores._idEmEdicao, dados);
        } else {
          await Dados.criarMarcador(dados);
        }
        TelaMarcadores._limparFormularioRegistro(container);
        await TelaMarcadores._renderizarHistorico(container);
        App.mostrarConfirmacao('Marcador salvo.');
      } catch (erro) {
        window.alert(erro.message);
      }
    });
  }

  container.querySelector('#campo-filtro-historico-marcador').addEventListener('change', () => {
    TelaMarcadores._renderizarHistorico(container);
  });

  container.querySelector('#lista-historico-marcadores').addEventListener('click', async (evento) => {
    const item = evento.target.closest('.item-registro');
    if (!item || !evento.target.closest('.excluir')) return;
    if (!window.confirm('Excluir este registro?')) return;
    await Dados.removerMarcador(item.dataset.id);
    await TelaMarcadores._renderizarHistorico(container);
  });

  let direcaoSelecionadaCatalogo = 'manter';
  container.querySelector('#segmentado-direcao-catalogo').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-direcao]');
    if (!botao) return;
    direcaoSelecionadaCatalogo = botao.dataset.direcao;
    container.querySelectorAll('#segmentado-direcao-catalogo button').forEach((b) => b.classList.toggle('selecionado', b === botao));
  });

  container.querySelector('#formulario-catalogo-marcador').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const contextosTexto = container.querySelector('#campo-catalogo-contextos').value.trim();
    const contextos = contextosTexto
      ? contextosTexto.split(',').map((c) => c.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean)
      : [];
    const dados = {
      codigo: container.querySelector('#campo-catalogo-codigo').value.trim().toLowerCase(),
      nome: container.querySelector('#campo-catalogo-nome').value.trim(),
      unidade: container.querySelector('#campo-catalogo-unidade').value.trim(),
      casasDecimais: parseInt(container.querySelector('#campo-catalogo-casas').value, 10),
      contextos,
      faixaReferencia: { min: null, max: null },
      direcaoDesejada: direcaoSelecionadaCatalogo,
    };
    try {
      await Dados.criarMarcadorCatalogo(dados);
      await App._rotear();
      App.mostrarConfirmacao('Marcador cadastrado no catálogo.');
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  container.querySelector('#lista-catalogo-marcadores').addEventListener('click', async (evento) => {
    const item = evento.target.closest('.item-registro');
    if (!item || !evento.target.closest('.excluir')) return;
    if (!window.confirm(`Remover "${item.dataset.codigo}" do catálogo? Os registros já salvos com esse código não serão apagados.`)) return;
    await Dados.removerMarcadorCatalogo(item.dataset.codigo);
    await App._rotear();
  });
};
