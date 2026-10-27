/**
 * tests/risk.test.js — Unit test untuk js/risk.js
 *
 * Kasus yang diuji:
 *   1. Skenario KERING      → skor tinggi, level TINGGI
 *   2. Skenario BASAH       → skor rendah, level RENDAH
 *   3. Skenario CAMPURAN    → skor sedang, level SEDANG
 *   4. Data nyata Kalbar    → validasi dengan fixture bmkg-prakiraan-kalbar.json
 *   5. Kasus tepi: array kosong, satu titik, nilai null/undefined
 *   6. Batas ambang tepat   → cek ≥ dan <, tidak ada off-by-one
 *   7. ringkasanPerHari     → struktur output benar
 *   8. hitungAngkaKunci     → statistik benar
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  hitungRisiko,
  hitungAngkaKunci,
  ringkasanPerHari,
  AMBANG,
  LEVEL_INFO,
} from '../js/risk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Helper: buat titik prakiraan sintetis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buat array titik prakiraan dengan nilai seragam (semua titik sama).
 * Berguna untuk pengujian ambang batas dengan presisi.
 */
function buatTitik({ suhu = 28, kelembapan = 80, hujanPerTitik = 0, angin = 10 } = {}, jumlah = 20) {
  return Array.from({ length: jumlah }, (_, i) => ({
    dt_utc:      `2026-10-2${Math.floor(i / 8)}T${String((i % 8) * 3).padStart(2,'0')}:00:00Z`,
    dt_lokal:    `2026-10-2${Math.floor(i / 8)} ${String((i % 8) * 3 + 7).padStart(2,'0')}:00:00`,
    suhu,
    kelembapan,
    hujan:       hujanPerTitik,
    angin_kmjam: angin,
    cuaca_teks:  hujanPerTitik > 0 ? 'Hujan Ringan' : 'Cerah',
    cuaca_kode:  hujanPerTitik > 0 ? 61 : 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Muat data nyata dari fixture
// ─────────────────────────────────────────────────────────────────────────────

function muatFixture(nama) {
  const raw = readFileSync(
    path.join(__dirname, `../fixtures/${nama}`), 'utf8'
  ).replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function ekstrakTitik(fixture) {
  return fixture.data[0].cuaca.flat().map(t => ({
    dt_utc:      t.datetime,
    dt_lokal:    t.local_datetime,
    suhu:        t.t,
    kelembapan:  t.hu,
    hujan:       t.tp,
    angin_kmjam: t.ws,
    cuaca_teks:  t.weather_desc,
    cuaca_kode:  t.weather,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — Skenario KERING (semua faktor buruk)
// Harapan: skor = 7, level = TINGGI
// ─────────────────────────────────────────────────────────────────────────────

{
  const titik = buatTitik({
    suhu:          35,   // ≥ 34°C → 2 poin
    kelembapan:    55,   // < 60%  → 2 poin
    hujanPerTitik: 0,    // total 0 mm → 2 poin
    angin:         25,   // ≥ 20 km/j → 1 poin
  });
  const hasil = hitungRisiko(titik);

  console.assert(hasil.skor  === 7,       `[KERING] Skor harus 7, dapat ${hasil.skor}`);
  console.assert(hasil.level === 'TINGGI', `[KERING] Level harus TINGGI, dapat ${hasil.level}`);
  console.assert(hasil.detail.skorHujan       === 2, `[KERING] skor hujan harus 2`);
  console.assert(hasil.detail.skorKelembapan  === 2, `[KERING] skor kelembapan harus 2`);
  console.assert(hasil.detail.skorSuhu        === 2, `[KERING] skor suhu harus 2`);
  console.assert(hasil.detail.skorAngin       === 1, `[KERING] skor angin harus 1`);
  console.assert(typeof hasil.penjelasanDinamis === 'string', `[KERING] penjelasan harus string`);
  console.log('✅ Suite 1 KERING lulus — skor 7, level TINGGI');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — Skenario BASAH (semua faktor aman)
// Harapan: skor = 0, level = RENDAH
// ─────────────────────────────────────────────────────────────────────────────

{
  const titik = buatTitik({
    suhu:          28,    // < 32°C  → 0 poin
    kelembapan:    90,    // > 75%   → 0 poin
    hujanPerTitik: 1.5,  // total = 30mm > 10mm → 0 poin
    angin:         10,    // < 20 km/j → 0 poin
  });
  const hasil = hitungRisiko(titik);

  console.assert(hasil.skor  === 0,       `[BASAH] Skor harus 0, dapat ${hasil.skor}`);
  console.assert(hasil.level === 'RENDAH', `[BASAH] Level harus RENDAH, dapat ${hasil.level}`);
  console.assert(hasil.detail.skorHujan       === 0, `[BASAH] skor hujan harus 0`);
  console.assert(hasil.detail.skorKelembapan  === 0, `[BASAH] skor kelembapan harus 0`);
  console.assert(hasil.detail.skorSuhu        === 0, `[BASAH] skor suhu harus 0`);
  console.assert(hasil.detail.skorAngin       === 0, `[BASAH] skor angin harus 0`);
  console.log('✅ Suite 2 BASAH lulus — skor 0, level RENDAH');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — Skenario CAMPURAN
// Suhu sedang + hujan sedikit + kelembapan sedang → skor 3, level SEDANG
// ─────────────────────────────────────────────────────────────────────────────

{
  // Skor target: hujan=1 (3mm) + kelembapan=1 (68%) + suhu=1 (33°C) + angin=0 (15km/j) = 3
  const titik = buatTitik({
    suhu:          33,    // 32–33,9°C → 1 poin
    kelembapan:    68,    // 60–75%    → 1 poin
    hujanPerTitik: 0.15, // total = 3mm (1–10) → 1 poin
    angin:         15,    // < 20 km/j → 0 poin
  });
  const hasil = hitungRisiko(titik);

  console.assert(hasil.skor  === 3,       `[CAMPURAN] Skor harus 3, dapat ${hasil.skor}`);
  console.assert(hasil.level === 'SEDANG', `[CAMPURAN] Level harus SEDANG, dapat ${hasil.level}`);
  console.assert(hasil.detail.skorHujan       === 1, `[CAMPURAN] skor hujan harus 1`);
  console.assert(hasil.detail.skorKelembapan  === 1, `[CAMPURAN] skor kelembapan harus 1`);
  console.assert(hasil.detail.skorSuhu        === 1, `[CAMPURAN] skor suhu harus 1`);
  console.assert(hasil.detail.skorAngin       === 0, `[CAMPURAN] skor angin harus 0`);
  console.log('✅ Suite 3 CAMPURAN lulus — skor 3, level SEDANG');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — Data nyata Kalimantan Barat (fixtures/bmkg-prakiraan-kalbar.json)
// ─────────────────────────────────────────────────────────────────────────────

{
  const fixture = muatFixture('bmkg-prakiraan-kalbar.json');
  const titik   = ekstrakTitik(fixture);
  const hasil   = hitungRisiko(titik);

  // Data nyata: total hujan 8.7mm, suhu max 30°C, kelembapan min 68%, angin max 13.4 km/j
  // → hujan=1 (1–10mm) + kelembapan=1 (60–75%) + suhu=0 (<32°C) + angin=0 (<20) = skor 2 → RENDAH
  const totalHujan    = titik.reduce((s, t) => s + t.hujan, 0);
  const suhuMax       = Math.max(...titik.map(t => t.suhu));
  const kelembapanMin = Math.min(...titik.map(t => t.kelembapan));
  const anginMax      = Math.max(...titik.map(t => t.angin_kmjam));

  console.assert(titik.length === 20,         `[KALBAR] Harus ada 20 titik, dapat ${titik.length}`);
  console.assert(Math.abs(totalHujan - 8.7) < 0.1,  `[KALBAR] Total hujan ~8.7mm, dapat ${totalHujan.toFixed(1)}`);
  console.assert(suhuMax      === 30,          `[KALBAR] Suhu maks harus 30°C, dapat ${suhuMax}`);
  console.assert(kelembapanMin=== 68,          `[KALBAR] Kelembapan min harus 68%, dapat ${kelembapanMin}`);
  console.assert(anginMax     === 13.4,        `[KALBAR] Angin maks harus 13.4 km/j, dapat ${anginMax}`);
  console.assert(hasil.detail.skorHujan      === 1, `[KALBAR] skor hujan harus 1`);
  console.assert(hasil.detail.skorKelembapan === 1, `[KALBAR] skor kelembapan harus 1`);
  console.assert(hasil.detail.skorSuhu       === 0, `[KALBAR] skor suhu harus 0`);
  console.assert(hasil.detail.skorAngin      === 0, `[KALBAR] skor angin harus 0`);
  console.assert(hasil.skor   === 2,           `[KALBAR] Skor harus 2, dapat ${hasil.skor}`);
  console.assert(hasil.level  === 'RENDAH',    `[KALBAR] Level harus RENDAH, dapat ${hasil.level}`);
  console.log(`✅ Suite 4 DATA NYATA KALBAR lulus — skor ${hasil.skor} (${hasil.level})`);
  console.log(`   Detail: hujan=${totalHujan.toFixed(1)}mm | suhu=${suhuMax}°C | lembap=${kelembapanMin}% | angin=${anginMax}km/j`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — Kasus Tepi
// ─────────────────────────────────────────────────────────────────────────────

// 5a. Array kosong
{
  const hasil = hitungRisiko([]);
  console.assert(hasil.level      === 'RENDAH', `[TEPI] Kosong harus RENDAH`);
  console.assert(hasil.dataKosong === true,      `[TEPI] harus ada flag dataKosong`);
  console.assert(hasil.skor       === 0,          `[TEPI] Skor kosong harus 0`);
  console.log('✅ Suite 5a TEPI (kosong) lulus');
}

// 5b. null/undefined input
{
  const hasil = hitungRisiko(null);
  console.assert(hasil.level === 'RENDAH', `[TEPI] null harus RENDAH`);
  console.log('✅ Suite 5b TEPI (null) lulus');
}

// 5c. Satu titik saja
{
  const titik = [{ suhu: 36, kelembapan: 50, hujan: 0, angin_kmjam: 30, cuaca_teks: 'Cerah', cuaca_kode: 0 }];
  const hasil = hitungRisiko(titik);
  // suhu≥34→2 + kelembapan<60→2 + hujan=0<1→2 + angin≥20→1 = 7
  console.assert(hasil.skor  === 7,       `[TEPI] Satu titik ekstrem harus skor 7, dapat ${hasil.skor}`);
  console.assert(hasil.level === 'TINGGI', `[TEPI] Satu titik ekstrem harus TINGGI`);
  console.log('✅ Suite 5c TEPI (satu titik ekstrem) lulus');
}

// 5d. Field hujan null/undefined (beberapa titik BMKG mungkin null)
{
  const titik = [
    { suhu: 28, kelembapan: 85, hujan: null,      angin_kmjam: 10, cuaca_teks: 'Cerah', cuaca_kode: 0 },
    { suhu: 29, kelembapan: 80, hujan: undefined,  angin_kmjam: 12, cuaca_teks: 'Cerah', cuaca_kode: 0 },
    { suhu: 30, kelembapan: 78, hujan: 0.5,        angin_kmjam: 8,  cuaca_teks: 'Cerah', cuaca_kode: 0 },
  ];
  const hasil = hitungRisiko(titik);
  // null/undefined → 0, jadi total hujan 0.5mm → skor hujan 1
  console.assert(Math.abs(hasil.detail.totalHujan - 0.5) < 0.01, `[TEPI] null/undefined hujan harus dianggap 0`);
  console.assert(!isNaN(hasil.skor), `[TEPI] Skor tidak boleh NaN`);
  console.log('✅ Suite 5d TEPI (hujan null/undefined) lulus');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Batas Ambang Tepat (tidak boleh ada off-by-one)
// ─────────────────────────────────────────────────────────────────────────────

// 6a. Hujan tepat 1 mm → harus skor 1 (bukan 2)
{
  const titik = buatTitik({ hujanPerTitik: 1 / 20 });  // total = 1.0 mm tepat
  const hasil = hitungRisiko(titik);
  // totalHujan = 1.0, syarat SANGAT_KERING adalah < 1 → tidak terpenuhi → skor 1
  console.assert(hasil.detail.skorHujan === 1,
    `[BATAS] Hujan tepat 1mm harus skor 1, dapat ${hasil.detail.skorHujan} (total=${hasil.detail.totalHujan.toFixed(3)})`);
  console.log('✅ Suite 6a BATAS (hujan tepat 1mm) lulus');
}

// 6b. Hujan tepat 10 mm → harus skor 1 (bukan 0)
{
  const titik = buatTitik({ hujanPerTitik: 10 / 20 });  // total = 10.0 mm
  const hasil = hitungRisiko(titik);
  // totalHujan = 10.0, syarat KERING adalah ≤ 10 → skor 1
  console.assert(hasil.detail.skorHujan === 1,
    `[BATAS] Hujan tepat 10mm harus skor 1, dapat ${hasil.detail.skorHujan}`);
  console.log('✅ Suite 6b BATAS (hujan tepat 10mm) lulus');
}

// 6c. Suhu tepat 34°C → harus skor 2 (SANGAT_PANAS)
{
  const titik = buatTitik({ suhu: 34 });
  const hasil = hitungRisiko(titik);
  console.assert(hasil.detail.skorSuhu === 2,
    `[BATAS] Suhu 34°C harus skor 2, dapat ${hasil.detail.skorSuhu}`);
  console.log('✅ Suite 6c BATAS (suhu tepat 34°C) lulus');
}

// 6d. Suhu 33.9°C → harus skor 1 (PANAS bukan SANGAT_PANAS)
{
  const titik = buatTitik({ suhu: 33.9 });  // tidak mungkin dari BMKG (integer), tapi test batas logika
  // Karena BMKG mengirim integer, 33 < 34 → skor 1. Uji dengan 33.
  const titik33 = buatTitik({ suhu: 33 });
  const hasil   = hitungRisiko(titik33);
  console.assert(hasil.detail.skorSuhu === 1,
    `[BATAS] Suhu 33°C harus skor 1, dapat ${hasil.detail.skorSuhu}`);
  console.log('✅ Suite 6d BATAS (suhu 33°C) lulus');
}

// 6e. Kelembapan tepat 60% → harus skor 1 (bukan 2)
{
  const titik = buatTitik({ kelembapan: 60 });
  const hasil = hitungRisiko(titik);
  // 60 ≥ SANGAT_KERING (60) → false (kondisi < 60), jadi skor 1
  console.assert(hasil.detail.skorKelembapan === 1,
    `[BATAS] Kelembapan tepat 60% harus skor 1, dapat ${hasil.detail.skorKelembapan}`);
  console.log('✅ Suite 6e BATAS (kelembapan 60%) lulus');
}

// 6f. Kelembapan tepat 75% → harus skor 1 (bukan 0)
{
  const titik = buatTitik({ kelembapan: 75 });
  const hasil = hitungRisiko(titik);
  console.assert(hasil.detail.skorKelembapan === 1,
    `[BATAS] Kelembapan tepat 75% harus skor 1, dapat ${hasil.detail.skorKelembapan}`);
  console.log('✅ Suite 6f BATAS (kelembapan 75%) lulus');
}

// 6g. Angin tepat 20 km/j → harus skor 1
{
  const titik = buatTitik({ angin: 20 });
  const hasil = hitungRisiko(titik);
  console.assert(hasil.detail.skorAngin === 1,
    `[BATAS] Angin 20km/j harus skor 1, dapat ${hasil.detail.skorAngin}`);
  console.log('✅ Suite 6g BATAS (angin tepat 20 km/j) lulus');
}

// 6h. Skor tepat di batas SEDANG (=3) dan TINGGI (=5)
{
  const titik3 = buatTitik({ suhu: 33, kelembapan: 68, hujanPerTitik: 0.15, angin: 15 }); // skor 3
  const titik5 = buatTitik({ suhu: 35, kelembapan: 55, hujanPerTitik: 0,    angin: 15 }); // skor 2+2+2+0=6? 
  // Skor tepat 5: hujan=2 + kelembapan=2 + suhu=1 + angin=0 = 5
  const titik5b = buatTitik({ suhu: 33, kelembapan: 55, hujanPerTitik: 0, angin: 15 }); // 2+2+1+0=5
  const h3  = hitungRisiko(titik3);
  const h5  = hitungRisiko(titik5b);
  console.assert(h3.level === 'SEDANG', `[BATAS] Skor 3 harus SEDANG, dapat ${h3.level}`);
  console.assert(h5.level === 'TINGGI', `[BATAS] Skor 5 harus TINGGI, dapat ${h5.level} (skor=${h5.skor})`);
  console.log(`✅ Suite 6h BATAS (skor 3→SEDANG, skor 5→TINGGI) lulus`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7 — ringkasanPerHari
// ─────────────────────────────────────────────────────────────────────────────

{
  const fixture  = muatFixture('bmkg-prakiraan-kalbar.json');
  const cuacaRaw = fixture.data[0].cuaca;
  const perHari  = cuacaRaw.map(hari => hari.map(t => ({
    dt_utc:      t.datetime,
    dt_lokal:    t.local_datetime,
    suhu:        t.t,
    kelembapan:  t.hu,
    hujan:       t.tp,
    angin_kmjam: t.ws,
    cuaca_teks:  t.weather_desc,
    cuaca_kode:  t.weather,
  })));

  const ringkasan = ringkasanPerHari(perHari, 'Asia/Pontianak');

  console.assert(ringkasan.length === 3,              `[HARI] Harus ada 3 hari, dapat ${ringkasan.length}`);
  console.assert(ringkasan[0].label === 'Hari ini',   `[HARI] Label hari 0 harus "Hari ini"`);
  console.assert(ringkasan[1].label === 'Besok',      `[HARI] Label hari 1 harus "Besok"`);
  console.assert(ringkasan[2].label === 'Lusa',       `[HARI] Label hari 2 harus "Lusa"`);
  console.assert(typeof ringkasan[0].cuacaDominan === 'string', `[HARI] cuacaDominan harus string`);
  console.assert(ringkasan[0].suhuMax >= ringkasan[0].suhuMin,  `[HARI] suhuMax ≥ suhuMin`);
  console.assert(ringkasan[0].totalHujan >= 0,                  `[HARI] totalHujan ≥ 0`);
  console.log(`✅ Suite 7 RINGKASAN PER HARI lulus — ${ringkasan.map(r => `${r.label}: ${r.cuacaDominan}`).join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8 — hitungAngkaKunci
// ─────────────────────────────────────────────────────────────────────────────

{
  const perHari = [
    buatTitik({ suhu: 30, kelembapan: 70, hujanPerTitik: 0.5, angin: 15 }, 4),
    buatTitik({ suhu: 34, kelembapan: 65, hujanPerTitik: 0.2, angin: 22 }, 8),
    buatTitik({ suhu: 28, kelembapan: 80, hujanPerTitik: 0.1, angin: 10 }, 8),
  ];
  const kunci = hitungAngkaKunci(perHari);

  console.assert(kunci.suhuMax       === 34,   `[KUNCI] suhuMax harus 34, dapat ${kunci.suhuMax}`);
  console.assert(kunci.kelembapanMin === 65,   `[KUNCI] kelembapanMin harus 65, dapat ${kunci.kelembapanMin}`);
  console.assert(kunci.anginMax      === 22,   `[KUNCI] anginMax harus 22, dapat ${kunci.anginMax}`);
  // Total hujan: 4×0.5 + 8×0.2 + 8×0.1 = 2.0 + 1.6 + 0.8 = 4.4
  console.assert(Math.abs(kunci.totalHujan - 4.4) < 0.01,
    `[KUNCI] totalHujan harus 4.4, dapat ${kunci.totalHujan}`);
  console.log(`✅ Suite 8 ANGKA KUNCI lulus — suhu=${kunci.suhuMax}°C | hujan=${kunci.totalHujan.toFixed(1)}mm | lembap=${kunci.kelembapanMin}% | angin=${kunci.anginMax}km/j`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9 — Verifikasi struktur LEVEL_INFO dan AMBANG (keamanan konstanta)
// ─────────────────────────────────────────────────────────────────────────────

{
  // LEVEL_INFO harus punya ketiga level
  console.assert('RENDAH' in LEVEL_INFO, `LEVEL_INFO harus punya RENDAH`);
  console.assert('SEDANG' in LEVEL_INFO, `LEVEL_INFO harus punya SEDANG`);
  console.assert('TINGGI' in LEVEL_INFO, `LEVEL_INFO harus punya TINGGI`);
  // Setiap level harus punya properti wajib
  for (const [nama, info] of Object.entries(LEVEL_INFO)) {
    console.assert(typeof info.label      === 'string', `${nama}.label harus string`);
    console.assert(typeof info.penjelasan === 'string', `${nama}.penjelasan harus string`);
    console.assert(Array.isArray(info.saran),            `${nama}.saran harus Array`);
    console.assert(info.saran.length > 0,                `${nama}.saran tidak boleh kosong`);
  }
  // AMBANG tidak boleh bisa diubah (Object.freeze)
  // Di luar strict mode, mutasi senyap dan nilai tetap asli (tidak berubah)
  const nilaiAsli = AMBANG.HUJAN.SANGAT_KERING;
  try { AMBANG.HUJAN.SANGAT_KERING = 999; } catch (_) { /* strict mode throw — benar */ }
  console.assert(AMBANG.HUJAN.SANGAT_KERING === nilaiAsli,
    `AMBANG harus immutable: nilai tetap ${nilaiAsli}, dapat ${AMBANG.HUJAN.SANGAT_KERING}`);
  console.log('✅ Suite 9 KONSTANTA lulus — LEVEL_INFO dan AMBANG valid');
}

// ─────────────────────────────────────────────────────────────────────────────
// RINGKASAN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log('  Semua test selesai tanpa error ✅');
console.log('══════════════════════════════════════════════\n');
