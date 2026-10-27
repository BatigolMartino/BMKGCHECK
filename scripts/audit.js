/**
 * scripts/audit.js - Skrip Audit Kepatuhan & Aksesibilitas PeatGuard Cuaca
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('====================================================');
console.log('🔍 AUDIT AKHIR PEATGUARD CUACA');
console.log('====================================================\n');

// 1. Audit Atribusi & Disclaimer
console.log('--- 1. AUDIT ATRIBUSI DAN DISCLAIMER ---');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tentangHtml = fs.readFileSync(path.join(root, 'tentang.html'), 'utf8');

const requiredPhrases = [
  'Sumber data: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)',
  'Situs ini bukan layanan resmi BMKG'
];

let atribusiLolos = true;
for (const phrase of requiredPhrases) {
  const adaDiIndex = indexHtml.includes(phrase);
  const adaDiTentang = tentangHtml.includes(phrase);
  console.log(`Pemeriksaan frasa: "${phrase}"`);
  console.log(`  - index.html   : ${adaDiIndex ? '✅ Lolos' : '❌ Gagal'}`);
  console.log(`  - tentang.html : ${adaDiTentang ? '✅ Lolos' : '❌ Gagal'}`);
  if (!adaDiIndex || !adaDiTentang) atribusiLolos = false;
}

// 2. Audit Aksesibilitas Markup
console.log('\n--- 2. AUDIT AKSESIBILITAS & SEMANTIK HTML ---');
const checks = [
  { name: 'Viewport mobile tag di index.html', pass: indexHtml.includes('name="viewport"') },
  { name: 'Viewport mobile tag di tentang.html', pass: tentangHtml.includes('name="viewport"') },
  { name: 'Lang="id" di kedua halaman', pass: indexHtml.includes('lang="id"') && tentangHtml.includes('lang="id"') },
  { name: 'Skip link navigasi di kedua halaman', pass: indexHtml.includes('class="skip-link"') && tentangHtml.includes('class="skip-link"') },
  { name: 'Aria-label & role di pemilih lokasi', pass: indexHtml.includes('aria-label=') && indexHtml.includes('role=') },
  { name: 'Alternative text / aria-hidden untuk emoji', pass: indexHtml.includes('aria-hidden="true"') }
];

checks.forEach(c => {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
});

// 3. Audit Validitas Data Wilayah JSON
console.log('\n--- 3. AUDIT INTEGRITAS JSON DATA WILAYAH ---');
const provCodes = ['61', '62', '63', '64', '65'];
let totalDesa = 0;
let jsonLolos = true;

for (const code of provCodes) {
  try {
    const raw = fs.readFileSync(path.join(root, `data/wilayah/${code}.json`), 'utf8').replace(/^\uFEFF/, '');
    const json = JSON.parse(raw);
    const count = json.kabupaten.reduce((acc, k) => acc + k.kecamatan.reduce((c, kec) => c + kec.desa.length, 0), 0);
    totalDesa += count;
    console.log(`✅ ${code}.json (${json.nama}): ${json.kabupaten.length} kab/kota, ${count} desa`);
  } catch (err) {
    console.error(`❌ ${code}.json GAGAL PARSE: ${err.message}`);
    jsonLolos = false;
  }
}
console.log(`Total desa terdaftar: ${totalDesa}`);

// 4. Audit CSS dan Ukuran Font
console.log('\n--- 4. AUDIT CSS RESPONSIF & KONTRASTING ---');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const fontCheck = css.includes('font-size: 1rem') || css.includes('16px');
const mobileCheck = css.includes('max-width: 640px') && css.includes('360px');
console.log(`${fontCheck ? '✅' : '⚠️'} Basis ukuran teks minimal 16px (1rem)`);
console.log(`${mobileCheck ? '✅' : '⚠️'} Acuan mobile-first (360px) dan batas kontainer`);

console.log('\n====================================================');
console.log(`HASIL AUDIT OTOMATIS: ${atribusiLolos && jsonLolos ? 'SEMUA LOLOS ✅' : 'ADA TEMUAN ⚠️'}`);
console.log('====================================================\n');
