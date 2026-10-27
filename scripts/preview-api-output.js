/**
 * scripts/preview-api-output.js
 * Tampilkan contoh output JSON persis seperti yang dikembalikan /api/forecast
 * dan /api/alerts — tanpa memanggil API asli.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const readText = (f) => readFileSync(f, 'utf8');

// ── /api/forecast output ──────────────────────────────────────────────────
const raw      = readJson(path.join(root, 'fixtures/bmkg-prakiraan-kalbar.json'));
const lokasi   = raw.lokasi;
const cuacaRaw = raw.data[0].cuaca;

const mapTitik = (t) => ({
  dt_utc:       t.datetime,
  dt_lokal:     t.local_datetime,
  suhu:         t.t,
  kelembapan:   t.hu,
  hujan:        t.tp,
  angin_kmjam:  t.ws,
  arah_angin:   t.wd,
  cuaca_kode:   t.weather,
  cuaca_teks:   t.weather_desc,
  ikon_url:     t.image,
});

const forecastOutput = {
  stale: false,
  diperbarui: new Date().toISOString(),
  lokasi: {
    adm4:      lokasi.adm4,
    provinsi:  lokasi.provinsi,
    kotkab:    lokasi.kotkab,
    kecamatan: lokasi.kecamatan,
    desa:      lokasi.desa,
    lat:       lokasi.lat,
    lon:       lokasi.lon,
    timezone:  lokasi.timezone,
  },
  // Hanya tampilkan 3 titik pertama dari array flat (20 total)
  prakiraan: cuacaRaw.flat().slice(0, 3).map(mapTitik),
  '(... dst total 20 titik)': '...',
  // Per hari: ringkasan jumlah elemen
  per_hari_ringkasan: cuacaRaw.map((hari, i) => `Hari ${i+1}: ${hari.length} titik`),
};

console.log('\n=== CONTOH OUTPUT /api/forecast?adm4=61.71.04.1001 ===\n');
console.log(JSON.stringify(forecastOutput, null, 2));

// ── /api/alerts output ────────────────────────────────────────────────────
const xml = readText(path.join(root, 'fixtures/bmkg-alerts-rss.xml'));

function parseRSSItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const x = m[1];
    const getTag = (tag) => {
      const r = x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return r ? r[1].trim() : '';
    };
    items.push({
      title:       getTag('title'),
      link:        getTag('link'),
      description: getTag('description'),
      pubDate:     getTag('pubDate'),
      guid:        getTag('guid'),
    });
  }
  return items;
}

const kaltaraItems = parseRSSItems(xml)
  .filter(i => i.title.toUpperCase().includes('KALIMANTAN UTARA'))
  .map(i => ({
    judul:       i.title,
    deskripsi:   i.description,
    tautan:      i.link,
    diterbitkan: i.pubDate,
    guid:        i.guid,
  }));

const alertsOutput = {
  diperbarui: new Date().toISOString(),
  total: kaltaraItems.length,
  peringatan: kaltaraItems,
};

console.log('\n=== CONTOH OUTPUT /api/alerts?prov=Kalimantan+Utara&kecamatan=Malinau+Selatan+Hulu ===\n');
console.log(JSON.stringify(alertsOutput, null, 2));
