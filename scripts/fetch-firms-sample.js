/**
 * scripts/fetch-firms-sample.js
 * Skrip untuk mengambil sampel data NASA FIRMS Area API untuk Kalimantan
 * Membaca FIRMS_MAP_KEY dari file .env (tanpa mencatat key ke log/console)
 *
 * Jalankan: node scripts/fetch-firms-sample.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// 1. Baca .env secara manual tanpa dependensi eksternal
function muatEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ Berkas .env tidak ditemukan di root!');
    process.exit(1);
  }

  const baris = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const b of baris) {
    const trimmed = b.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [k, ...v] = trimmed.split('=');
      if (k.trim() === 'FIRMS_MAP_KEY') {
        return v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return null;
}

const mapKey = muatEnv();
if (!mapKey || mapKey === 'masukkan_map_key_anda_di_sini') {
  console.error('❌ FIRMS_MAP_KEY belum diisi di .env!');
  process.exit(1);
}

// Sensor yang akan diambil
const SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'];

// Bounding box pulau Kalimantan: west,south,east,north
const BBOX_KALIMANTAN = '108.5,-4.5,119.5,4.5';
const DAY_RANGE = '1';

async function ambil(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent': 'PeatGuard-Cuaca/1.0 (karhutla monitoring Kalimantan)'
      }
    });
    if (!res.ok) {
      return { status: res.status, ok: false, data: null };
    }
    const text = await res.text();
    return { status: res.status, ok: true, data: text };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function main() {
  console.log('🚀 Memulai pengujian API NASA FIRMS (Tahap N0)...');
  console.log('🔒 Key disamarkan demi keamanan: ' + mapKey.substring(0, 4) + '****' + mapKey.substring(mapKey.length - 4));

  // A. Cek Data Availability (all)
  console.log('\n--- 1. Memeriksa Ketersediaan Data (data_availability) ---');
  const availUrl = `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${mapKey}/all`;
  const availRes = await ambil(availUrl);

  if (!availRes.ok) {
    console.error(`❌ Gagal mengakses data_availability: status HTTP ${availRes.status}`);
    process.exit(1);
  }

  const availPath = path.join(root, 'fixtures/firms-data-availability.csv');
  fs.writeFileSync(availPath, availRes.data, 'utf8');
  console.log(`✅ Ketersediaan data berhasil diunduh ke fixtures/firms-data-availability.csv (${availRes.data.length} bytes)`);

  // B. Ambil sampel kueri area Kalimantan untuk tiap sumber
  console.log('\n--- 2. Mengambil Sampel CSV Hotspot Kalimantan (1 Hari) ---');
  const ringkasan = [];

  for (const src of SOURCES) {
    const areaUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${src}/${BBOX_KALIMANTAN}/${DAY_RANGE}`;
    const areaRes = await ambil(areaUrl);

    if (areaRes.ok) {
      const fileName = `firms-hotspot-${src.toLowerCase()}.csv`;
      const filePath = path.join(root, 'fixtures', fileName);
      fs.writeFileSync(filePath, areaRes.data, 'utf8');

      const lines = areaRes.data.trim().split('\n');
      const header = lines[0] || '';
      const rowCount = Math.max(0, lines.length - 1);
      const sampleRow = lines.length > 1 ? lines[1] : '(header saja / tidak ada titik terdeteksi)';

      ringkasan.push({
        source: src,
        status: 'OK',
        header,
        rowCount,
        sampleRow,
        fileName
      });
      console.log(`✅ ${src}: ${rowCount} baris deteksi -> fixtures/${fileName}`);
    } else {
      ringkasan.push({
        source: src,
        status: `Gagal (HTTP ${areaRes.status})`
      });
      console.log(`⚠️ ${src}: Gagal (HTTP ${areaRes.status})`);
    }
  }

  // Tulis ringkasan hasil
  console.log('\n======================================================');
  console.log('📊 LAPORAN HASIL PENGUJIAN API NASA FIRMS NYATA');
  console.log('======================================================');
  for (const r of ringkasan) {
    console.log(`\nSumber: ${r.source}`);
    console.log(`Status: ${r.status}`);
    if (r.header) console.log(`Header: ${r.header}`);
    if (r.rowCount !== undefined) console.log(`Jumlah deteksi: ${r.rowCount}`);
    if (r.sampleRow) console.log(`Contoh baris: ${r.sampleRow}`);
  }
}

main().catch(err => {
  console.error('Terjadi kesalahan:', err.message);
});
