/**
 * scripts/test-local.js — Uji fungsi serverless secara lokal menggunakan fixtures
 *
 * Tidak memanggil API BMKG sungguhan; pakai file fixtures/ sebagai pengganti.
 * Jalankan: node scripts/test-local.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// ────────────────────────────────────────────────────────────────────────────
// Simulasi: forecast untuk Kalbar (Siantan Hulu, Pontianak)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== UJI FORECAST: 61.71.04.1001 (Siantan Hulu, Kalbar) ===\n');

// Hapus BOM (Byte Order Mark) jika ada, lalu parse JSON
const rawForecast = JSON.parse(
  readFileSync(path.join(root, 'fixtures/bmkg-prakiraan-kalbar.json'), 'utf8').replace(/^\uFEFF/, '')
);

const lokasi    = rawForecast.lokasi;
const cuacaRaw  = rawForecast.data?.[0]?.cuaca ?? [];

const titikFlat = cuacaRaw.flat().map((titik) => ({
  dt_lokal:    titik.local_datetime,
  suhu:        titik.t,
  kelembapan:  titik.hu,
  hujan:       titik.tp,
  angin_kmjam: titik.ws,
  cuaca_teks:  titik.weather_desc,
}));

console.log('Lokasi:', lokasi.desa, '|', lokasi.kecamatan, '|', lokasi.kotkab);
console.log('Total titik prakiraan:', titikFlat.length);
console.log('Titik pertama:', JSON.stringify(titikFlat[0], null, 2));
console.log('Titik terakhir:', JSON.stringify(titikFlat[titikFlat.length - 1], null, 2));

// Statistik untuk cek indikator
const totalHujan   = titikFlat.reduce((sum, t) => sum + (t.hujan ?? 0), 0);
const suhuMax      = Math.max(...titikFlat.map(t => t.suhu));
const kelembapanMin= Math.min(...titikFlat.map(t => t.kelembapan));
const anginMax     = Math.max(...titikFlat.map(t => t.angin_kmjam));

console.log('\n--- Statistik 72 jam ---');
console.log('Total hujan (mm)    :', totalHujan.toFixed(1));
console.log('Suhu maksimum (°C)  :', suhuMax);
console.log('Kelembapan minimum %:', kelembapanMin);
console.log('Angin maksimum km/h :', anginMax);

// ────────────────────────────────────────────────────────────────────────────
// Simulasi: filter peringatan dini untuk Kalimantan Barat
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== UJI ALERTS: Kalimantan Barat ===\n');

const xml = readFileSync(path.join(root, 'fixtures/bmkg-alerts-rss.xml'), 'utf8');

const itemRegex = /<item>([\s\S]*?)<\/item>/g;
let itemMatch;
const semua = [];
while ((itemMatch = itemRegex.exec(xml)) !== null) {
  const itemXml = itemMatch[1];
  const getTag = (tag) => {
    const m = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : '';
  };
  semua.push({
    title: getTag('title'),
    description: getTag('description').substring(0, 120) + '...',
    guid: getTag('guid'),
  });
}

const targetProv = 'KALIMANTAN BARAT';
const kalbarItems = semua.filter(item =>
  item.title.toUpperCase().includes(targetProv)
);

console.log(`Total item RSS: ${semua.length}`);
console.log(`Relevan untuk ${targetProv}: ${kalbarItems.length}`);
if (kalbarItems.length > 0) {
  console.log('Contoh peringatan:', JSON.stringify(kalbarItems[0], null, 2));
} else {
  console.log('(Tidak ada peringatan aktif untuk Kalbar saat ini — normal)');
}

// Cek Kaltara (ada di fixture)
const kaltaraItems = semua.filter(item =>
  item.title.toUpperCase().includes('KALIMANTAN UTARA')
);
console.log(`\nRelevan untuk KALIMANTAN UTARA: ${kaltaraItems.length}`);
if (kaltaraItems.length > 0) {
  console.log('Judul:', kaltaraItems[0].title);
  console.log('Deskripsi singkat:', kaltaraItems[0].description);
}

// ────────────────────────────────────────────────────────────────────────────
// Cek data wilayah Kalbar
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== UJI DATA WILAYAH: Kalbar (61.json) ===\n');

const wilayah61 = JSON.parse(
  readFileSync(path.join(root, 'data/wilayah/61.json'), 'utf8').replace(/^\uFEFF/, '')
);

console.log('Provinsi:', wilayah61.nama);
console.log('Jumlah Kabupaten/Kota:', wilayah61.kabupaten.length);

const sambas = wilayah61.kabupaten.find(k => k.kode === '61.01');
console.log('\nKabupaten Sambas:');
console.log('  Jumlah kecamatan:', sambas?.kecamatan.length ?? 'tidak ditemukan');
console.log('  Kecamatan pertama:', sambas?.kecamatan[0]?.nama);
console.log('  Desa pertama:', sambas?.kecamatan[0]?.desa[0]);

const pontianak = wilayah61.kabupaten.find(k => k.kode === '61.71');
console.log('\nKota Pontianak:');
console.log('  Jumlah kecamatan:', pontianak?.kecamatan.length);
const pontUtara = pontianak?.kecamatan.find(k => k.kode === '61.71.04');
console.log('  Kec Pontianak Utara, desa pertama:', pontUtara?.desa[0]);

console.log('\n✅ Semua uji lokal selesai.\n');
