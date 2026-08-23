const App = {};

App.ROTA_PADRAO = 'hoje';

App.ITENS_NAV = [
  { rota: 'hoje', rotulo: 'Hoje', icone: '🏠' },
  { rota: 'treino', rotulo: 'Treino', icone: '🏋️' },
  { rota: 'peso', rotulo: 'Peso', icone: '⚖️' },
  { rota: 'medidas', rotulo: 'Medidas', icone: '📏' },
  { rota: 'marcadores', rotulo: 'Marcadores', icone: '🩺' },
  { rota: 'metas', rotulo: 'Metas', icone: '🎯' },
];

App._telas = null;

App._obterTelas = function _obterTelas() {
  if (!App._telas) {
    App._telas = {
      hoje: TelaHoje,
      treino: TelaTreino,
      peso: TelaPeso,
      medidas: TelaMedidas,
      marcadores: TelaMarcadores,
      metas: TelaMetas,
    };
  }
  return App._telas;
};

App._obterRotaAtual = function _obterRotaAtual() {
  const bruta = location.hash.replace(/^#\/?/, '').split('?')[0];
  const telas = App._obterTelas();
  return telas[bruta] ? bruta : App.ROTA_PADRAO;
};

App.navegarPara = function navegarPara(rota) {
  if (App._obterRotaAtual() === rota && location.hash === `#/${rota}`) {
    App._rotear();
    return;
  }
  location.hash = `#/${rota}`;
};

App._renderizarNav = function _renderizarNav() {
  const nav = document.getElementById('nav-inferior');
  nav.innerHTML = '';
  App.ITENS_NAV.forEach((item) => {
    const botao = document.createElement('button');
    botao.dataset.rota = item.rota;
    botao.innerHTML = `<span class="icone-nav">${item.icone}</span><span>${item.rotulo}</span>`;
    botao.addEventListener('click', () => App.navegarPara(item.rota));
    nav.appendChild(botao);
  });
};

App._marcarNavAtiva = function _marcarNavAtiva(rota) {
  const nav = document.getElementById('nav-inferior');
  Array.from(nav.children).forEach((botao) => {
    botao.classList.toggle('ativo', botao.dataset.rota === rota);
  });
};

App._rotear = async function _rotear() {
  const rota = App._obterRotaAtual();
  const tela = App._obterTelas()[rota];
  App._marcarNavAtiva(rota);
  const container = document.getElementById('tela');
  container.innerHTML = '';
  await tela.renderizar(container);
  container.scrollTop = 0;
};

App.mostrarConfirmacao = function mostrarConfirmacao(mensagem) {
  const existente = document.querySelector('.confirmacao-flutuante');
  if (existente) existente.remove();
  const aviso = document.createElement('div');
  aviso.className = 'confirmacao-flutuante';
  aviso.textContent = mensagem;
  document.getElementById('app-raiz').appendChild(aviso);
  setTimeout(() => aviso.remove(), 1800);
};

App.iniciar = async function iniciar() {
  await Dados.abrir();
  App._renderizarNav();
  window.addEventListener('hashchange', App._rotear);
  await App._rotear();
};
