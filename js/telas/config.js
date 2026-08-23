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

TelaConfig.renderizar = async function renderizar(container) {
  container.innerHTML = `
    <div class="cabecalho-tela">
      <h1>Config</h1>
      <p class="subtitulo">Sobre o app</p>
    </div>
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
};
