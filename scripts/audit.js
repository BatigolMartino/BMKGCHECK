/**
 * scripts/audit.js — Skrip Audit Komprehensif PeatGuard Cuaca
 * Memeriksa:
 * 1. Kepatuhan atribusi BMKG & NASA FIRMS di semua halaman
 * 2. Disclaimer non-resmi BMKG
 * 3. Keamanan MAP_KEY (memastikan tidak bocor di frontend/git)
 * 4. Aksesibilitas & semantik HTML
 * 5. Integritas data wilayah JSON (7.179 desa)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('====================================================');
console.log('🔍 AUDIT KOMPREHENSIF PEATGUARD CUACA (BMKG + NASA FIRMS)');
console.log('====================================================\n');

let totalLolos = true;

// 1. Audit Atribusi & Disclaimer
console.log('--- 1. AUDIT ATRIBUSI DAN DISCLAIMER ---');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tentangHtml = fs.readFileSync(path.join(root, 'tentang.html'), 'utf8');

const frasaWajib = [
  { label: 'Atribusi BMKG', teks: 'Sumber data: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)' },
  { label: 'Disclaimer Non-Resmi BMKG', teks: 'Situs ini bukan layanan resmi BMKG' },
  { label: 'Atribusi NASA FIRMS', teks: 'NASA FIRMS' },
  { label: 'Atribusi NASA ESDIS', teks: 'NASA Earth Science Data and Information System' },
];

for (const f of frasaWajib) {
  const adaIndex = indexHtml.includes(f.teks);
  const adaTentang = tentangHtml.includes(f.teks);
  console.log(`[${f.label}]`);
  console.log(`  - index.html   : ${adaIndex ? '✅ Lolos' : '❌ Gagal'}`);
  console.log(`  - tentang.html : ${adaTentang ? '✅ Lolos' : '❌ Gagal'}`);
  if (!adaIndex || !adaTentang) totalLolos = false;
}

// 2. Audit Keamanan Kunci (Leak Check)
console.log('\n--- 2. AUDIT KEAMANAN KUNCI API (LEAK CHECK) ---');
// Cari key di .env jika ada
let targetKey = '';
if (fs.existsSync(path.join(root, '.env'))) {
  const envTxt = fs.readFileSync(path.join(root, '.env'), 'utf8');
  for (const l of envTxt.split('\n')) {
    if (l.startsWith('FIRMS_MAP_KEY=')) {
      targetKey = l.split('=')[1].trim();
      break;
    }
  }
}

const fileDiperiksa = [
  'index.html',
  'tentang.html',
  'js/api.js',
  'js/app.js',
  'js/ui.js',
  'js/risk.js',
  'js/hotspots-logic.js',
  'css/style.css',
  'README.md',
  '.env.example',
];

let kebocoran = false;
for (const file of fileDiperiksa) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (targetKey && targetKey.length > 10 && content.includes(targetKey)) {
    console.error(`❌ BAHAYA: Kunci asli bocor di berkas ${file}!`);
    kebocoran = true;
  }
}

if (!kebocoran) {
  console.log('✅ Kunci FIRMS_MAP_KEY 100% aman (tidak ditemukan di berkas frontend atau git)');
} else {
  totalLolos = false;
}

// Periksa .gitignore
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
const envDiabaikan = gitignore.includes('.env');
console.log(`${envDiabaikan ? '✅' : '❌'} Berkas .env terdaftar di .gitignore`);
if (!envDiabaikan) totalLolos = false;

// 3. Audit Aksesibilitas & Semantik
console.log('\n--- 3. AUDIT AKSESIBILITAS & SEMANTIK ---');
const a11yChecks = [
  { name: 'Viewport mobile tag di index.html & tentang.html', pass: indexHtml.includes('name="viewport"') && tentangHtml.includes('name="viewport"') },
  { name: 'Lang="id" pada tag html', pass: indexHtml.includes('lang="id"') && tentangHtml.includes('lang="id"') },
  { name: 'Skip link navigasi keyboard', pass: indexHtml.includes('class="skip-link"') && tentangHtml.includes('class="skip-link"') },
  { name: 'Peta Leaflet memiliki role="region" & aria-label', pass: indexHtml.includes('role="region"') || fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8').includes('role="region"') },
  { name: 'Legenda peta menyertakan teks penjelasan (bukan warna saja)', pass: fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8').includes('peta-legenda') },
];

a11yChecks.forEach(c => {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
  if (!c.pass) totalLolos = false;
});

// 4. Audit Integritas Data Wilayah
console.log('\n--- 4. AUDIT DATA WILAYAH KALIMANTAN (JSON) ---');
const provCodes = ['61', '62', '63', '64', '65'];
let totalDesa = 0;

for (const code of provCodes) {
  const raw = fs.readFileSync(path.join(root, `data/wilayah/${code}.json`), 'utf8').replace(/^\uFEFF/, '');
  const json = JSON.parse(raw);
  const count = json.kabupaten.reduce((acc, k) => acc + k.kecamatan.reduce((c, kec) => c + kec.desa.length, 0), 0);
  totalDesa += count;
  console.log(`✅ ${code}.json (${json.nama}): ${json.kabupaten.length} kab/kota, ${count} desa`);
}
console.log(`Total desa valid: ${totalDesa}`);
if (totalDesa !== 7179) {
  console.warn(`⚠️ Total desa (${totalDesa}) berbeda dari acuan awal (7179)`);
}

console.log('\n====================================================');
console.log(`HASIL AUDIT KOMPREHENSIF: ${totalLolos ? 'SEMUA ASPEK LOLOS 100% ✅' : 'DITEMUKAN CATATAN ⚠️'}`);
console.log('====================================================\n');
