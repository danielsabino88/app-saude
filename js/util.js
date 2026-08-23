const Util = {};

Util.FUSO_SAO_PAULO = 'America/Sao_Paulo';

const ULID_ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function partesEmFuso(data, fuso) {
  try {
    const formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const partes = formatador.formatToParts(data);
    const mapa = {};
    partes.forEach((p) => {
      if (p.type !== 'literal') mapa[p.type] = p.value;
    });
    return {
      ano: mapa.year,
      mes: mapa.month,
      dia: mapa.day,
      hora: mapa.hour === '24' ? '00' : mapa.hour,
      minuto: mapa.minute,
      segundo: mapa.second,
    };
  } catch (erro) {
    return {
      ano: String(data.getFullYear()),
      mes: String(data.getMonth() + 1).padStart(2, '0'),
      dia: String(data.getDate()).padStart(2, '0'),
      hora: String(data.getHours()).padStart(2, '0'),
      minuto: String(data.getMinutes()).padStart(2, '0'),
      segundo: String(data.getSeconds()).padStart(2, '0'),
    };
  }
}

function offsetEmFuso(data, fuso) {
  try {
    const formatador = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' });
    const parte = formatador.formatToParts(data).find((p) => p.type === 'timeZoneName');
    const casamento = parte && parte.value.match(/GMT([+-]\d{2}:\d{2})/);
    if (casamento) return casamento[1];
  } catch (erro) {
    // segue para o padrão abaixo
  }
  return '-03:00';
}

Util.diaEmSaoPaulo = function diaEmSaoPaulo(data) {
  const p = partesEmFuso(data, Util.FUSO_SAO_PAULO);
  return `${p.ano}-${p.mes}-${p.dia}`;
};

Util.hojeISO = function hojeISO() {
  return Util.diaEmSaoPaulo(new Date());
};

Util.dataParaISOSaoPaulo = function dataParaISOSaoPaulo(data) {
  const p = partesEmFuso(data, Util.FUSO_SAO_PAULO);
  const offset = offsetEmFuso(data, Util.FUSO_SAO_PAULO);
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}:${p.segundo}${offset}`;
};

Util.agoraISO = function agoraISO() {
  return Util.dataParaISOSaoPaulo(new Date());
};

Util.ehNumero = function ehNumero(valor) {
  return typeof valor === 'number' && Number.isFinite(valor);
};

Util.ehDataISOValida = function ehDataISOValida(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return false;
  const data = new Date(iso);
  return !Number.isNaN(data.getTime());
};

Util.arredondar = function arredondar(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
};

Util.formatarNumero = function formatarNumero(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
};

Util.formatarDataBR = function formatarDataBR(iso) {
  if (!iso) return '';
  const dataParte = iso.split('T')[0];
  const [ano, mes, dia] = dataParte.split('-');
  return `${dia}/${mes}/${ano}`;
};

Util.formatarDataHoraBR = function formatarDataHoraBR(iso) {
  if (!iso) return '';
  const p = partesEmFuso(new Date(iso), Util.FUSO_SAO_PAULO);
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.minuto}`;
};

Util.calcularDuracaoMin = function calcularDuracaoMin(inicioISO, fimISO) {
  const inicio = new Date(inicioISO).getTime();
  const fim = new Date(fimISO).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return null;
  return Math.round((fim - inicio) / 60000);
};

Util.formatarDuracao = function formatarDuracao(minutos) {
  if (minutos === null || minutos === undefined || Number.isNaN(minutos)) return '—';
  const horas = Math.floor(minutos / 60);
  const min = minutos % 60;
  if (horas === 0) return `${min}min`;
  return `${horas}h${String(min).padStart(2, '0')}min`;
};

Util.gerarUlid = function gerarUlid() {
  const agora = Date.now();
  let tempo = '';
  let ms = agora;
  for (let i = 0; i < 10; i += 1) {
    tempo = ULID_ALFABETO[ms % 32] + tempo;
    ms = Math.floor(ms / 32);
  }
  let aleatorio = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    for (let i = 0; i < 16; i += 1) aleatorio += ULID_ALFABETO[buffer[i] % 32];
  } else {
    for (let i = 0; i < 16; i += 1) aleatorio += ULID_ALFABETO[Math.floor(Math.random() * 32)];
  }
  return tempo + aleatorio;
};

Util.gerarId = function gerarId(prefixo) {
  return `${prefixo}_${Util.gerarUlid()}`;
};
