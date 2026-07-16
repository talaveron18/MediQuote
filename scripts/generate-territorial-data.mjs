import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const municipalities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/municipalities.json'), 'utf8'));

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const SOURCES = {
  Madrid: {
    reference: 'BOCM-20251212-34',
    url: 'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/12/12/BOCM-20251212-34.PDF',
    localPath: '/tmp/madrid-fiestas-2026.html',
  },
  Albacete: { reference: 'DOCM 12/12/2025', url: 'https://docm.jccm.es/docm/verArchivoHtml.do?ruta=2025%2F12%2F12%2Fhtml%2F2025_9468.html&tipo=rutaDocm', localPath: '/tmp/clm-fiestas-2026.html' },
  'Ciudad Real': { reference: 'DOCM 12/12/2025', url: 'https://docm.jccm.es/docm/verArchivoHtml.do?ruta=2025%2F12%2F12%2Fhtml%2F2025_9468.html&tipo=rutaDocm', localPath: '/tmp/clm-fiestas-2026.html' },
  Cuenca: { reference: 'DOCM 12/12/2025', url: 'https://docm.jccm.es/docm/verArchivoHtml.do?ruta=2025%2F12%2F12%2Fhtml%2F2025_9468.html&tipo=rutaDocm', localPath: '/tmp/clm-fiestas-2026.html' },
  Guadalajara: { reference: 'DOCM 12/12/2025', url: 'https://docm.jccm.es/docm/verArchivoHtml.do?ruta=2025%2F12%2F12%2Fhtml%2F2025_9468.html&tipo=rutaDocm', localPath: '/tmp/clm-fiestas-2026.html' },
  Toledo: { reference: 'DOCM 12/12/2025', url: 'https://docm.jccm.es/docm/verArchivoHtml.do?ruta=2025%2F12%2F12%2Fhtml%2F2025_9468.html&tipo=rutaDocm', localPath: '/tmp/clm-fiestas-2026.html' },
  'Ávila': { reference: 'BOP Ávila 186/2025', url: 'https://www.diputacionavila.es/bops/2025/26-09-2025.pdf', localPath: '/tmp/avila-fiestas-2026.txt' },
  Burgos: { reference: 'BOP Burgos 164/2025', url: 'https://bopbur.diputaciondeburgos.es/sites/default/files/private/publicado/2025-09/20250903-CV-04120.pdf', localPath: '/tmp/burgos-fiestas-2026-ocr.txt' },
  León: { reference: 'BOP León 178/2025', url: 'https://www.iberley.es/legislacion/resolucion-15-septiembre-2025-fijan-fiestas-locales-distintos-municipios-provincia-leon-ano-2026-27284512', localPath: '/tmp/leon-article.html' },
  Palencia: { reference: 'BOP Palencia 113/2025', url: 'https://www.iberley.es/legislacion/calendario-fiestas-locales-ano-2026-palencia-27284513', localPath: '/tmp/palencia-article.html' },
  Salamanca: { reference: 'BOP Salamanca 184/2025', url: 'https://www.iberley.es/legislacion/acuerdo-16-septiembre-2025-oficina-territorial-trabajo-salamanca-determinacion-fiestas-locales-efectos-laborales-municipios-provincia-27284526', localPath: '/tmp/salamanca-article.html' },
  Segovia: { reference: 'BOP Segovia 116/2025', url: 'https://www.iberley.es/legislacion/fiestas-locales-provincia-segovia-ano-2026-27284527', localPath: '/tmp/segovia-article.html' },
  Soria: { reference: 'BOP Soria 108/2025', url: 'https://www.iberley.es/legislacion/fiestas-laborales-ano-2026-provincia-soria-27284543', localPath: '/tmp/soria-article.html' },
  Valladolid: { reference: 'BOP Valladolid 181/2025', url: 'https://www.iberley.es/legislacion/anuncio-oficina-territorial-trabajo-valladolid-determinan-fiestas-locales-ano-2026-efectos-laborales-municipios-provincia-valladolid-27284528', localPath: '/tmp/valladolid-article.html' },
  Zamora: { reference: 'BOP Zamora 106/2025', url: 'https://www.diputaciondezamora.es/opencms/export/sites/dipu-zamora/servicios/bop/2025/09/BOP-20250919-106.pdf', localPath: '/tmp/zamora-fiestas-2026.txt' },
};

function cleanText(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function key(value) {
  return value.toLocaleLowerCase('es')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(de|del)\s+(la|el)\b/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function aliases(name) {
  const result = new Set([key(name)]);
  const comma = name.match(/^(.+),\s*(El|La|Los|Las)$/i);
  if (comma) {
    result.add(key(`${comma[2]} ${comma[1]}`));
    result.add(key(`${comma[1]} ${comma[2]}`));
  }
  for (const value of [...result]) {
    result.add(value.replace(/\bdel\b/g, 'de'));
    result.add(value.replace(/\bde\b/g, 'del'));
  }
  return [...result];
}

function iso(day, month) {
  const d = Number(day);
  const m = typeof month === 'number' ? month : MONTHS[key(month)];
  if (!m || d < 1 || d > 31) return null;
  return `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDates(text) {
  const value = key(text);
  const found = new Set();
  for (const match of text.matchAll(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*2026\b/g)) {
    const date = iso(match[1], Number(match[2]));
    if (date) found.add(date);
  }
  for (const match of value.matchAll(/\b(\d{1,2})\s+y\s+(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g)) {
    found.add(iso(match[1], match[3]));
    found.add(iso(match[2], match[3]));
  }
  for (const match of value.matchAll(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g)) {
    found.add(iso(match[1], match[2]));
  }
  return [...found].filter(Boolean).sort().slice(0, 2);
}

function matchMunicipality(line, candidates) {
  const normalized = key(line.replace(/^[-—–•]+\s*/, ''));
  return candidates.find(({ names }) => names.some((name) => (
    normalized === name || normalized.startsWith(`${name} `)
  )));
}

function parseGenericProvince(province) {
  const rows = municipalities.filter((row) => row.province === province)
    .map((row) => ({ row, names: aliases(row.name) }))
    .sort((a, b) => Math.max(...b.names.map((n) => n.length)) - Math.max(...a.names.map((n) => n.length)));
  const source = SOURCES[province];
  const lines = cleanText(fs.readFileSync(source.localPath, 'utf8'));
  const result = new Map();
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const municipality = matchMunicipality(line, rows);
    if (municipality) current = municipality;
    if (!current) continue;
    const dates = parseDates(`${line} ${lines[index + 1] ?? ''}`);
    if (dates.length && !result.has(current.row.ineCode)) {
      result.set(current.row.ineCode, dates);
      current = null;
    } else if (/no comunicado/i.test(line) && !result.has(current.row.ineCode)) {
      result.set(current.row.ineCode, []);
      current = null;
    }
  }
  return result;
}

function parseMadrid() {
  const source = SOURCES.Madrid;
  const html = fs.readFileSync(source.localPath, 'utf8');
  const lines = cleanText(html.replace(/[—–]/g, '\n—')).filter((line) => /^[—–-]/.test(line));
  const rows = municipalities.filter((row) => row.province === 'Madrid')
    .map((row) => ({ row, names: aliases(row.name) }));
  const result = new Map();
  for (const line of lines) {
    const municipality = matchMunicipality(line, rows);
    const dates = parseDates(line);
    if (municipality && dates.length) result.set(municipality.row.ineCode, dates);
  }
  return result;
}

function parseClm() {
  const html = fs.readFileSync(SOURCES.Albacete.localPath, 'utf8');
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((cells) => cells.length >= 2);
  const candidates = municipalities.filter((row) => row.autonomousCommunity === 'Castilla-La Mancha')
    .map((row) => ({ row, names: aliases(row.name) }));
  const result = new Map();
  for (const cells of rows) {
    const municipality = matchMunicipality(cells[0], candidates);
    const dates = parseDates(cells.slice(1).join(' '));
    if (municipality && dates.length) result.set(municipality.row.ineCode, dates);
  }
  return result;
}

const parsed = new Map();
for (const [ineCode, dates] of parseMadrid()) parsed.set(ineCode, dates);
for (const [ineCode, dates] of parseClm()) parsed.set(ineCode, dates);
for (const province of ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora']) {
  for (const [ineCode, dates] of parseGenericProvince(province)) parsed.set(ineCode, dates);
}

const records = municipalities.map((municipality) => {
  const dates = parsed.get(municipality.ineCode) ?? [];
  const source = SOURCES[municipality.province];
  return {
    ineCode: municipality.ineCode,
    autonomousCommunity: municipality.autonomousCommunity,
    province: municipality.province,
    municipality: municipality.name,
    dates,
    status: dates.length >= 2 ? 'verified' : dates.length === 1 ? 'partial' : 'not_communicated',
    sourceReference: source.reference,
    sourceUrl: source.url,
  };
});

fs.writeFileSync(path.join(ROOT, 'src/data/local-holidays-2026.json'), `${JSON.stringify(records, null, 2)}\n`);
const coverage = Object.fromEntries(Object.keys(SOURCES).map((province) => {
  const provinceRows = records.filter((row) => row.province === province);
  return [province, {
    municipalities: provinceRows.length,
    verified: provinceRows.filter((row) => row.status === 'verified').length,
    partial: provinceRows.filter((row) => row.status === 'partial').length,
    notCommunicated: provinceRows.filter((row) => row.status === 'not_communicated').length,
  }];
}));
console.log(JSON.stringify(coverage, null, 2));
