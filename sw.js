importScripts('js/versao.js');

const NOME_CACHE = `app-saude-${VERSAO_APP}`;

const ARQUIVOS_PARA_CACHE = [
  './',
  'index.html',
  'manifest.json',
  'assets/estilo.css',
  'assets/icones/icone-180.png',
  'assets/icones/icone-192.png',
  'assets/icones/icone-512.png',
  'assets/vendor/chart.umd.js',
  'js/versao.js',
  'js/util.js',
  'js/schema.js',
  'js/dados.js',
  'js/sync.js',
  'js/motor.js',
  'js/insights.js',
  'js/graficos.js',
  'js/telas/hoje.js',
  'js/telas/peso.js',
  'js/telas/medidas.js',
  'js/telas/marcadores.js',
  'js/telas/treino.js',
  'js/telas/metas.js',
  'js/telas/relatorio.js',
  'js/telas/config.js',
  'js/app.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE)
      .then((cache) => cache.addAll(ARQUIVOS_PARA_CACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves
          .filter((chave) => chave !== NOME_CACHE)
          .map((chave) => caches.delete(chave)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  if (new URL(evento.request.url).origin !== location.origin) return;

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      if (respostaCache) return respostaCache;
      return fetch(evento.request).then((respostaRede) => {
        const copia = respostaRede.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(evento.request, copia));
        return respostaRede;
      });
    }),
  );
});
