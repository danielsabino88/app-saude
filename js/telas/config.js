const TelaConfig = {};

TelaConfig._forcarAtualizacao = async function _forcarAtualizacao() {
  const confirmar = window.confirm(
    'Isso apaga os arquivos guardados para uso offline e baixa tudo de novo. Continuar?',
  );
  if (!confirmar) return;

  if ('serviceWorker' in navigator) {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map((registro) => registro.unregister()));
  }
  if ('caches' in window) {
    const chaves = await caches.keys();
    await Promise.all(chaves.map((chave) => caches.delete(chave)));
  }
  location.reload();
};

// ---------------------------------------------------------------------------
// Sincronização com o Google Drive (Fase 7)
// ---------------------------------------------------------------------------

TelaConfig._ROTULO_STATUS = {
  desconectado: 'status-neutro',
  pendente: 'status-pendente',
  erro: 'status-erro',
  sincronizado: 'status-ok',
};

TelaConfig._renderizarStatusSync = async function _renderizarStatusSync(container) {
  const area = container.querySelector('#area-status-sync');
  if (!area) return;
  const status = await Sync.obterStatusExibicao();
  const classeStatus = TelaConfig._ROTULO_STATUS[status.chave] || 'status-neutro';
  area.innerHTML = `
    <div class="linha-status-sync">
      <span class="ponto-status ${classeStatus}"></span>
      <span>${status.rotulo}</span>
    </div>
  `;
};

TelaConfig._construirCartaoSync = function _construirCartaoSync() {
  return `
    <div class="cartao">
      <h2>Sincronização com o Google Drive</h2>
      <div id="area-status-sync"><p style="color: var(--cor-texto-fraco);">Carregando status…</p></div>
      <div class="linha-botoes">
        <button type="button" class="botao botao-secundario" id="botao-conectar-drive">Conectar ao Drive</button>
        <button type="button" class="botao botao-primario" id="botao-sincronizar-agora">Sincronizar agora</button>
      </div>
      <button type="button" class="botao-texto" id="botao-desconectar-drive" style="color: var(--cor-perigo);">Desconectar</button>

      <h2 style="margin-top: 18px;">Configuração do Drive</h2>
      <p style="color: var(--cor-texto-fraco); font-size: 0.85rem; margin-bottom: 10px;">
        Preenchido uma vez por aparelho. Fica só no IndexedDB deste aparelho — nunca é enviado
        para o Drive nem para o repositório do app. Veja o passo a passo no GUIA-SYNC.md para
        criar essas credenciais no Google Cloud Console.
      </p>
      <form id="formulario-config-sync">
        <div class="campo">
          <label for="campo-client-id">ID do cliente (Client ID)</label>
          <input type="text" id="campo-client-id" autocomplete="off" spellcheck="false">
        </div>
        <div class="campo">
          <label for="campo-client-secret">Chave secreta do cliente (Client Secret)</label>
          <input type="text" id="campo-client-secret" autocomplete="off" spellcheck="false">
        </div>
        <div class="campo">
          <label for="campo-passphrase">Frase de sincronização (criptografia)</label>
          <input type="text" id="campo-passphrase" autocomplete="off" spellcheck="false">
          <p style="color: var(--cor-texto-fraco); font-size: 0.8rem; margin-top: 4px;">
            Precisa ser exatamente igual em todos os seus aparelhos (iPhone, iPad, Mac) — é ela
            que decifra o que cada um envia ao Drive. Se você esquecer essa frase, o backup no
            Drive fica ilegível para sempre; os dados no aparelho continuam intactos.
          </p>
        </div>
        <button type="submit" class="botao botao-secundario">Salvar configuração</button>
      </form>
    </div>

    <div class="cartao">
      <h2>Backup manual</h2>
      <p style="color: var(--cor-texto-fraco); font-size: 0.85rem; margin-bottom: 10px;">
        Um arquivo JSON com tudo, para guardar onde você quiser. Importar nunca substitui —
        funde com o que já está no aparelho (mesma regra da sincronização).
      </p>
      <div class="linha-botoes">
        <button type="button" class="botao botao-secundario" id="botao-exportar-backup">Exportar JSON</button>
        <button type="button" class="botao botao-secundario" id="botao-importar-backup">Importar JSON</button>
      </div>
      <input type="file" id="campo-arquivo-backup" accept=".json,application/json" style="display:none;">
    </div>

    <div class="cartao">
      <h2>Exportar para o cockpit</h2>
      <p style="color: var(--cor-texto-fraco); font-size: 0.85rem; margin-bottom: 10px;">
        Gera o <code>saude.json</code> no formato do Contrato de Dados dos Quatro Pilares — salve na pasta
        <code>Quatro Pilares/dados/</code> para o cockpit ler.
      </p>
      <div class="linha-botoes">
        <button type="button" class="botao botao-secundario" id="botao-exportar-cockpit">Exportar saude.json</button>
      </div>
    </div>

    <div class="cartao">
      <h2>Exportar CSV</h2>
      <p style="color: var(--cor-texto-fraco); font-size: 0.85rem; margin-bottom: 10px;">
        Uma planilha por tipo de registro, pronta para abrir no Excel/Sheets.
      </p>
      <div class="linha-botoes-csv" id="area-botoes-csv"></div>
    </div>
  `;
};

TelaConfig._ligarCartaoSync = function _ligarCartaoSync(container) {
  container.querySelector('#botao-conectar-drive').addEventListener('click', async () => {
    try {
      await Sync.iniciarConexao();
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  container.querySelector('#botao-desconectar-drive').addEventListener('click', async () => {
    if (!window.confirm('Desconectar o Google Drive deste aparelho? Os dados locais não são apagados.')) return;
    await Sync.desconectar();
    await TelaConfig._renderizarStatusSync(container);
    App.mostrarConfirmacao('Drive desconectado.');
  });

  container.querySelector('#botao-sincronizar-agora').addEventListener('click', async (evento) => {
    const botao = evento.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Sincronizando…';
    try {
      await Sync.sincronizar();
      App.mostrarConfirmacao('Sincronizado com o Google Drive.');
    } catch (erro) {
      window.alert(`Falha ao sincronizar: ${erro.message}`);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Sincronizar agora';
      await TelaConfig._renderizarStatusSync(container);
    }
  });

  container.querySelector('#formulario-config-sync').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const config = {
      clientId: container.querySelector('#campo-client-id').value.trim(),
      clientSecret: container.querySelector('#campo-client-secret').value.trim(),
      passphrase: container.querySelector('#campo-passphrase').value,
    };
    await Sync.salvarConfig(config);
    App.mostrarConfirmacao('Configuração salva neste aparelho.');
  });

  container.querySelector('#botao-exportar-backup').addEventListener('click', async () => {
    try {
      await Sync.exportarBackupJSON();
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  container.querySelector('#botao-exportar-cockpit').addEventListener('click', async () => {
    try {
      await Cockpit.exportarJSON();
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  const campoArquivo = container.querySelector('#campo-arquivo-backup');
  container.querySelector('#botao-importar-backup').addEventListener('click', () => campoArquivo.click());
  campoArquivo.addEventListener('change', async () => {
    const arquivo = campoArquivo.files[0];
    campoArquivo.value = '';
    if (!arquivo) return;
    if (!window.confirm(`Importar "${arquivo.name}"? Os dados do arquivo serão fundidos com os que já estão neste aparelho.`)) return;
    try {
      await Sync.importarBackupJSON(arquivo);
      App.mostrarConfirmacao('Backup importado.');
      await TelaConfig._renderizarStatusSync(container);
    } catch (erro) {
      window.alert(erro.message);
    }
  });

  const areaCsv = container.querySelector('#area-botoes-csv');
  Object.entries(Sync.DEFINICOES_CSV).forEach(([nomeEntidade, definicao]) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao botao-secundario';
    botao.textContent = definicao.rotulo;
    botao.addEventListener('click', async () => {
      try {
        await Sync.exportarCSV(nomeEntidade);
      } catch (erro) {
        window.alert(erro.message);
      }
    });
    areaCsv.appendChild(botao);
  });
};

TelaConfig._preencherFormularioSync = async function _preencherFormularioSync(container) {
  const config = await Sync.obterConfig();
  if (!config) return;
  container.querySelector('#campo-client-id').value = config.clientId || '';
  container.querySelector('#campo-client-secret').value = config.clientSecret || '';
  container.querySelector('#campo-passphrase').value = config.passphrase || '';
};

TelaConfig.renderizar = async function renderizar(container) {
  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Config</h1>
      <p class="subtitulo">Sincronização, backup e sobre o app</p>
    </div>
    ${TelaConfig._construirCartaoSync()}
    <div class="cartao">
      <h2>Versão</h2>
      <p style="color: var(--cor-texto-fraco);">
        Versão instalada: <strong style="color: var(--cor-texto);">${VERSAO_APP}</strong>
      </p>
      <p style="color: var(--cor-texto-fraco); font-size: 0.9rem;">
        Se algo parecer desatualizado depois de uma nova versão publicada, use o botão abaixo.
      </p>
      <div class="linha-botoes">
        <button type="button" class="botao botao-secundario" id="botao-forcar-atualizacao">Forçar atualização</button>
      </div>
    </div>
  `;

  container.querySelector('#botao-forcar-atualizacao').addEventListener('click', TelaConfig._forcarAtualizacao);

  TelaConfig._ligarCartaoSync(container);
  await TelaConfig._preencherFormularioSync(container);
  await TelaConfig._renderizarStatusSync(container);
};
