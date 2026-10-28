/**
 * scripts/preview-hotspots-output.js
 * Mensimulasikan dan menampilkan contoh output JSON dari api/hotspots.js
 * untuk 3 desa berbeda di Kalimantan dengan data riil dari fixtures.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseFirmsCsv,
  filterConfidence,
  deduplikasiHotspot,
  prosesHotspotDesa,
} from '../js/hotspots-logic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Muat data sampel riil VIIRS 3.047 baris
const csv = fs.readFileSync(path.join(root, 'fixtures/firms-sample-with-data.csv'), 'utf8');
const parsed = parseFirmsCsv(csv, 'VIIRS');
const filtered = filterConfidence(parsed);
const deduped = deduplikasiHotspot(filtered);

console.log(`\n======================================================`);
console.log(`📡 TOTAL HOTSPOT KALIMANTAN TERSEDIA: ${deduped.length} TITIK (Setelah Filter & Dedup)`);
console.log(`======================================================\n`);

// 3 Desa Pengujian:
const desaList = [
  {
    nama: 'Desa Siantan Hulu',
    kecamatan: 'Pontianak Utara',
    kotkab: 'Kota Pontianak',
    provinsi: 'Kalimantan Barat',
    lat: 0.000613,
    lon: 109.362752,
    timezone: 'WIB',
  },
  {
    nama: 'Desa Pahandut',
    kecamatan: 'Pahandut',
    kotkab: 'Kota Palangka Raya',
    provinsi: 'Kalimantan Tengah',
    lat: -2.2155,
    lon: 113.9165,
    timezone: 'WIB',
  },
  {
    nama: 'Desa Mantuil',
    kecamatan: 'Banjarmasin Selatan',
    kotkab: 'Kota Banjarmasin',
    provinsi: 'Kalimantan Selatan',
    lat: -3.3486,
    lon: 114.5772,
    timezone: 'WITA',
  },
];

for (const d of desaList) {
  const hasil = prosesHotspotDesa(d.lat, d.lon, deduped, 50, 720); // 720 jam agar mencakup data fixture 5 hari lalu

  const payload = {
    desa: `${d.nama}, ${d.kecamatan}, ${d.kotkab} (${d.provinsi})`,
    koordinat_acuan: { lat: d.lat, lon: d.lon },
    zona_waktu: d.timezone,
    ringkasan_radius: {
      dalam_5km:  hasil.ringkasanRadius.r5,
      dalam_10km: hasil.ringkasanRadius.r10,
      dalam_25km: hasil.ringkasanRadius.r25,
      dalam_50km: hasil.ringkasanRadius.r50,
    },
    jarak_terdekat_km: hasil.jarakTerdekatKm,
    deteksi_terbaru: hasil.deteksiTerbaru ? {
      waktu_utc:    hasil.deteksiTerbaru.iso_utc,
      satelit:      hasil.deteksiTerbaru.satellite,
      instrument:   hasil.deteksiTerbaru.instrument,
      confidence:   hasil.deteksiTerbaru.confidence,
      frp_megawatt: hasil.deteksiTerbaru.frp,
      jarak_km:     hasil.deteksiTerbaru.jarak_km,
    } : null,
    contoh_hotspot_terdekat: hasil.hotspots.slice(0, 3).map(h => ({
      jarak_km:   h.jarak_km,
      koordinat:  `${h.lat}, ${h.lon}`,
      satelit:    h.satellite,
      confidence: h.confidence,
      frp_mw:     h.frp,
      waktu_utc:  h.iso_utc,
    })),
  };

  console.log(`------------------------------------------------------`);
  console.log(`📍 LOKASI: ${payload.desa}`);
  console.log(`------------------------------------------------------`);
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n');
}
