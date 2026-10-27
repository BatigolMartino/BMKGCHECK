/**
 * Script build: ekstrak data wilayah dari SQL dump cahyadsn/wilayah
 * Hasilkan JSON statis per provinsi di folder data/wilayah/
 *
 * Jalankan: node scripts/build-wilayah.js
 */

const fs = require('fs');
const path = require('path');

// Hanya proses 5 provinsi Kalimantan
const PROVINSI_TARGET = {
  '61': 'Kalimantan Barat',
  '62': 'Kalimantan Tengah',
  '63': 'Kalimantan Selatan',
  '64': 'Kalimantan Timur',
  '65': 'Kalimantan Utara',
};

const sqlFile = path.join(__dirname, '../fixtures/wilayah-raw.sql');
const outDir  = path.join(__dirname, '../data/wilayah');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sql = fs.readFileSync(sqlFile, 'utf8');

// Kumpulkan semua baris INSERT: ('kode','nama')
// Format SQL: ('61.01.01.2001','Dalam Kaum'),
const rowRegex = /\('(\d{2}(?:\.\d{2}(?:\.\d{2}(?:\.\d{4})?)?)?)',\s*'([^']+)'\)/g;

// Struktur: { prov_kode: { provinsi, kabupaten: { kab_kode: { nama, kecamatan: { kec_kode: { nama, desa: [{adm4,nama}] } } } } } }
const data = {};

let match;
while ((match = rowRegex.exec(sql)) !== null) {
  const [, kode, nama] = match;
  const parts = kode.split('.');
  const provKode = parts[0];

  // Abaikan jika bukan Kalimantan
  if (!PROVINSI_TARGET[provKode]) continue;

  if (!data[provKode]) {
    data[provKode] = { kode: provKode, nama: PROVINSI_TARGET[provKode], kabupaten: {} };
  }

  if (parts.length === 1) {
    // Level provinsi — sudah diset di atas
  } else if (parts.length === 2) {
    // Level kabupaten/kota
    const kabKode = kode;
    if (!data[provKode].kabupaten[kabKode]) {
      data[provKode].kabupaten[kabKode] = { kode: kabKode, nama, kecamatan: {} };
    }
  } else if (parts.length === 3) {
    // Level kecamatan
    const kabKode = parts.slice(0, 2).join('.');
    const kecKode = kode;
    if (!data[provKode].kabupaten[kabKode]) {
      data[provKode].kabupaten[kabKode] = { kode: kabKode, nama: '?', kecamatan: {} };
    }
    if (!data[provKode].kabupaten[kabKode].kecamatan[kecKode]) {
      data[provKode].kabupaten[kabKode].kecamatan[kecKode] = { kode: kecKode, nama, desa: [] };
    }
  } else if (parts.length === 4) {
    // Level desa/kelurahan
    const kabKode = parts.slice(0, 2).join('.');
    const kecKode = parts.slice(0, 3).join('.');
    // Pastikan parent ada
    if (!data[provKode].kabupaten[kabKode]) {
      data[provKode].kabupaten[kabKode] = { kode: kabKode, nama: '?', kecamatan: {} };
    }
    if (!data[provKode].kabupaten[kabKode].kecamatan[kecKode]) {
      data[provKode].kabupaten[kabKode].kecamatan[kecKode] = { kode: kecKode, nama: '?', desa: [] };
    }
    data[provKode].kabupaten[kabKode].kecamatan[kecKode].desa.push({ adm4: kode, nama });
  }
}

// Tulis output JSON per provinsi
let totalDesa = 0;
for (const [provKode, prov] of Object.entries(data)) {
  // Ubah map ke array untuk JSON yang lebih mudah dipakai frontend
  const output = {
    kode: prov.kode,
    nama: prov.nama,
    kabupaten: Object.values(prov.kabupaten).map(kab => ({
      kode: kab.kode,
      nama: kab.nama,
      kecamatan: Object.values(kab.kecamatan).map(kec => ({
        kode: kec.kode,
        nama: kec.nama,
        desa: kec.desa, // sudah array [{adm4, nama}]
      })),
    })),
  };

  const desaCount = output.kabupaten.reduce(
    (sum, kab) => sum + kab.kecamatan.reduce((s, kec) => s + kec.desa.length, 0), 0
  );
  totalDesa += desaCount;

  const outPath = path.join(outDir, `${provKode}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Ditulis: ${outPath} | Kab: ${output.kabupaten.length} | Desa: ${desaCount}`);
}

console.log(`\nTotal desa Kalimantan: ${totalDesa}`);
