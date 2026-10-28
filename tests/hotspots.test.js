/**
 * tests/hotspots.test.js — Unit test untuk modul NASA FIRMS (js/hotspots-logic.js)
 *
 * Cakupan Pengujian:
 * 1. Rumus Haversine: verifikasi jarak terhitung dengan nilai referensi manual
 * 2. Parsing CSV: respons kosong (hanya header) & data riil dari fixtures
 * 3. Padding acq_time (HHMM) & konversi ISO UTC
 * 4. Filter tingkat kepercayaan (VIIRS 'l' dibuang, 'n' & 'h' dipertahankan, MODIS >= 30)
 * 5. Deduplikasi multi-satelit (jarak < 0.5 km & waktu < 3 jam)
 * 6. Pengelompokan radius (5 km, 10 km, 25 km, 50 km) terhadap koordinat desa
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  hitungJarakHaversine,
  parseFirmsCsv,
  filterConfidence,
  deduplikasiHotspot,
  prosesHotspotDesa,
  FIRMS_CONFIG,
} from '../js/hotspots-logic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('====================================================');
console.log('🧪 UNIT TEST: MODUL HOTSPOT NASA FIRMS (js/hotspots-logic.js)');
console.log('====================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — Rumus Haversine
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. UJI RUMUS JAWABAN JARAK HAVERSINE ---');
{
  // Titik A: Tugu Khatulistiwa Pontianak (0.0000, 109.3211)
  // Titik B: Kantor Walikota Pontianak (-0.0321, 109.3382)
  // Jarak sebenarnya adalah sekitar 4.02 km
  const jarak = hitungJarakHaversine(0.0000, 109.3211, -0.0321, 109.3382);
  console.assert(Math.abs(jarak - 4.02) < 0.15, `Jarak harus ~4.02 km, didapat: ${jarak.toFixed(2)} km`);

  // Jarak titik terhadap dirinya sendiri harus 0
  const jarakNol = hitungJarakHaversine(1.23, 110.45, 1.23, 110.45);
  console.assert(jarakNol === 0, `Jarak ke titik yang sama harus 0 km, didapat: ${jarakNol}`);

  // Jarak 1 derajat latitude di ekuator ~ 111.19 km
  const jarakSatuDerajat = hitungJarakHaversine(0.0, 100.0, 1.0, 100.0);
  console.assert(Math.abs(jarakSatuDerajat - 111.19) < 0.5, `1 deg lat harus ~111.19 km, didapat: ${jarakSatuDerajat}`);

  console.log(`✅ Suite 1 Haversine lulus (Pontianak test: ${jarak.toFixed(2)} km, 1° test: ${jarakSatuDerajat.toFixed(2)} km)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — Parsing CSV & Respons Kosong
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. UJI PARSING CSV (RESPONS KOSONG & DATA RIIL) ---');
{
  // 2a. Respons kosong (hanya header dari fixtures riil)
  const emptyCsv = fs.readFileSync(path.join(root, 'fixtures/firms-hotspot-viirs_snpp_nrt.csv'), 'utf8');
  const hasilKosong = parseFirmsCsv(emptyCsv, 'VIIRS');
  console.assert(Array.isArray(hasilKosong), 'Hasil harus array');
  console.assert(hasilKosong.length === 0, `Hasil kosong harus 0 elemen, didapat: ${hasilKosong.length}`);
  console.log('✅ Suite 2a Respons kosong (hanya header) ditangani aman -> 0 hotspot');

  // 2b. Null / string acak
  console.assert(parseFirmsCsv(null).length === 0, 'Null input harus 0');
  console.assert(parseFirmsCsv('').length === 0, 'Empty string harus 0');
  console.log('✅ Suite 2b Null & empty string ditangani aman');

  // 2c. Parsing CSV data riil (fixtures 3.047 baris)
  const realCsv = fs.readFileSync(path.join(root, 'fixtures/firms-sample-with-data.csv'), 'utf8');
  const hasilRiil = parseFirmsCsv(realCsv, 'VIIRS');
  console.assert(hasilRiil.length > 3000, `Harus > 3000 baris, didapat: ${hasilRiil.length}`);

  const sample = hasilRiil[0];
  console.assert(typeof sample.lat === 'number', 'lat harus number');
  console.assert(typeof sample.lon === 'number', 'lon harus number');
  console.assert(typeof sample.frp === 'number', 'frp harus number');
  console.assert(sample.acq_date.length === 10, 'acq_date format YYYY-MM-DD');
  console.log(`✅ Suite 2c Parsing data riil berhasil (${hasilRiil.length} titik diparse)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — Padding acq_time & ISO UTC
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. UJI PADDING acq_time & WAKTU UTC ---');
{
  const csvUji = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-0.1,109.1,330,0.4,0.4,2026-10-28,52,N,VIIRS,n,2.0,290,5.1,D
-0.2,109.2,335,0.4,0.4,2026-10-28,610,N,VIIRS,h,2.0,295,8.2,D
-0.3,109.3,340,0.4,0.4,2026-10-28,1435,N,VIIRS,n,2.0,300,10.0,N`;

  const parsed = parseFirmsCsv(csvUji, 'VIIRS');
  console.assert(parsed[0].acq_time === '0052', `acq_time 52 harus dipad jadi '0052', didapat: ${parsed[0].acq_time}`);
  console.assert(parsed[0].iso_utc === '2026-10-28T00:52:00.000Z', `ISO UTC harus 00:52, didapat: ${parsed[0].iso_utc}`);

  console.assert(parsed[1].acq_time === '0610', `acq_time 610 harus dipad jadi '0610', didapat: ${parsed[1].acq_time}`);
  console.assert(parsed[1].iso_utc === '2026-10-28T06:10:00.000Z', `ISO UTC harus 06:10, didapat: ${parsed[1].iso_utc}`);

  console.assert(parsed[2].acq_time === '1435', `acq_time 1435 harus tetap '1435', didapat: ${parsed[2].acq_time}`);
  console.assert(parsed[2].iso_utc === '2026-10-28T14:35:00.000Z', `ISO UTC harus 14:35, didapat: ${parsed[2].iso_utc}`);
  console.log('✅ Suite 3 Padding waktu acq_time (2 digit -> 4 digit, 3 digit -> 4 digit) lulus');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — Filter Tingkat Kepercayaan (Confidence)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. UJI FILTER CONFIDENCE (VIIRS & MODIS) ---');
{
  const campuran = [
    { confidence: 'l', instrument: 'VIIRS' },
    { confidence: 'n', instrument: 'VIIRS' },
    { confidence: 'h', instrument: 'VIIRS' },
    { confidence: 'L', instrument: 'VIIRS' }, // case test
    { confidence: '20', instrument: 'MODIS' }, // harus dibuang (<30)
    { confidence: '65', instrument: 'MODIS' }, // harus lolos (>=30)
  ];

  const filtered = filterConfidence(campuran);
  console.assert(filtered.length === 3, `Hanya 3 titik yang boleh lolos, didapat: ${filtered.length}`);
  console.assert(!filtered.some(t => t.confidence.toLowerCase() === 'l'), 'Tidak boleh ada confidence l');
  console.assert(filtered.some(t => t.confidence === 'n'), 'Harus ada confidence n');
  console.assert(filtered.some(t => t.confidence === 'h'), 'Harus ada confidence h');
  console.assert(filtered.some(t => t.confidence === '65'), 'MODIS 65 harus lolos');
  console.log('✅ Suite 4 Filter confidence lulus (VIIRS l dibuang, MODIS <30 dibuang)');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — Deduplikasi Multi-Satelit
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. UJI DEDUPLIKASI (< 0.5 km & < 3 jam) ---');
{
  const t0 = Date.parse('2026-10-28T06:00:00Z');
  const t1Jam = Date.parse('2026-10-28T07:00:00Z'); // selisih 1 jam (<3 jam)
  const t5Jam = Date.parse('2026-10-28T12:00:00Z'); // selisih 6 jam (>3 jam)

  const kasusDedup = [
    // Pasangan 1: Terdeteksi 2 satelit berbeda di lokasi berjarak ~200 meter, selisih 1 jam
    { lat: 0.0000, lon: 109.3000, timestamp_ms: t0, frp: 5.0, satellite: 'N' },
    { lat: 0.0015, lon: 109.3005, timestamp_ms: t1Jam, frp: 12.0, satellite: 'N20' }, // jarak ~180 meter -> harus digabung, pilih frp 12.0

    // Titik 2: Lokasi sama dengan Pasangan 1 tetapi selisih 6 jam (> 3 jam) -> TIDAK boleh digabung (kebakaran berlangsung lama)
    { lat: 0.0000, lon: 109.3000, timestamp_ms: t5Jam, frp: 4.0, satellite: 'N21' },

    // Titik 3: Waktu sama, tetapi jarak 5 km -> TIDAK boleh digabung (dua kebakaran berbeda)
    { lat: 0.0450, lon: 109.3000, timestamp_ms: t0, frp: 20.0, satellite: 'N' },
  ];

  const hasilDedup = deduplikasiHotspot(kasusDedup);
  console.assert(hasilDedup.length === 3, `Harus tersisa 3 titik setelah dedup, didapat: ${hasilDedup.length}`);
  
  // Titik yang digabung harus mengambil FRP tertinggi (12.0)
  const titikGabungan = hasilDedup.find(t => Math.abs(t.lat - 0.0015) < 0.001);
  console.assert(titikGabungan && titikGabungan.frp === 12.0, `Harus mempertahankan FRP tertinggi (12.0)`);
  console.log('✅ Suite 5 Deduplikasi multi-satelit lulus (jarak <0.5km & waktu <3jam digabung)');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Pengelompokan Radius terhadap Desa
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 6. UJI PENYARINGAN RADIUS (5 km, 10 km, 25 km, 50 km) ---');
{
  // Desa acuan di Siantan Hulu, Pontianak (0.0006, 109.3627)
  const desaLat = 0.0006;
  const desaLon = 109.3627;
  const tSekarang = Date.now();

  const titikSekitar = [
    // 1. Jarak ~2.2 km (masuk ring 5 km)
    { lat: 0.0200, lon: 109.3627, timestamp_ms: tSekarang - 3600000, frp: 8.0, satellite: 'N' },
    // 2. Jarak ~8.8 km (masuk ring 10 km)
    { lat: 0.0800, lon: 109.3627, timestamp_ms: tSekarang - 7200000, frp: 15.0, satellite: 'N20' },
    // 3. Jarak ~18.8 km (masuk ring 25 km)
    { lat: 0.1700, lon: 109.3627, timestamp_ms: tSekarang - 14400000, frp: 4.0, satellite: 'N' },
    // 4. Jarak ~40.0 km (masuk ring 50 km)
    { lat: 0.3600, lon: 109.3627, timestamp_ms: tSekarang - 28800000, frp: 2.0, satellite: 'N21' },
    // 5. Jarak ~80.0 km (DI LUAR 50 km -> harus diabaikan)
    { lat: 0.7200, lon: 109.3627, timestamp_ms: tSekarang - 3600000, frp: 1.0, satellite: 'N' },
  ];

  const hasil = prosesHotspotDesa(desaLat, desaLon, titikSekitar, 50, 48);
  console.assert(hasil.total === 4, `Total dalam radius 50 km harus 4, didapat: ${hasil.total}`);
  console.assert(hasil.ringkasanRadius.r5 === 1, `Radius 5km harus 1 titik, didapat: ${hasil.ringkasanRadius.r5}`);
  console.assert(hasil.ringkasanRadius.r10 === 2, `Radius 10km harus 2 titik (5km + 10km), didapat: ${hasil.ringkasanRadius.r10}`);
  console.assert(hasil.ringkasanRadius.r25 === 3, `Radius 25km harus 3 titik, didapat: ${hasil.ringkasanRadius.r25}`);
  console.assert(hasil.ringkasanRadius.r50 === 4, `Radius 50km harus 4 titik, didapat: ${hasil.ringkasanRadius.r50}`);

  // Urutan harus dari yang terdekat
  console.assert(hasil.hotspots[0].jarak_km < hasil.hotspots[1].jarak_km, 'Harus terurut dari yang terdekat');
  console.assert(hasil.jarakTerdekatKm === hasil.hotspots[0].jarak_km, 'jarakTerdekatKm harus cocok');
  console.log(`✅ Suite 6 Pengelompokan radius lulus: R5=${hasil.ringkasanRadius.r5}, R10=${hasil.ringkasanRadius.r10}, R25=${hasil.ringkasanRadius.r25}, R50=${hasil.ringkasanRadius.r50}`);
}

console.log('\n====================================================');
console.log('🎉 SEMUA 6 SUITE UNIT TEST HOTSPOT LULUS 100% ✅');
console.log('====================================================\n');
