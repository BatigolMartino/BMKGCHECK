/**
 * js/api.js — Modul fetch ke serverless functions /api/
 *
 * Semua fetch ke BMKG melewati fungsi serverless kita,
 * bukan langsung ke BMKG (untuk cache dan kontrol rate limit).
 */

/**
 * Ambil prakiraan cuaca untuk satu desa/kelurahan.
 * @param {string} adm4 — kode wilayah, mis. "61.71.04.1001"
 * @returns {Promise<object>} payload dari /api/forecast
 */
export async function ambilPrakiraan(adm4) {
  const res = await fetch(`/api/forecast?adm4=${encodeURIComponent(adm4)}`);
  if (!res.ok) {
    // Coba baca pesan error dari server
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Gagal mengambil data (${res.status})`);
  }
  return res.json();
}

/**
 * Ambil peringatan dini yang relevan untuk provinsi/kecamatan.
 * @param {string} prov      — nama provinsi, mis. "Kalimantan Barat"
 * @param {string} kecamatan — nama kecamatan (opsional)
 * @returns {Promise<object>} payload dari /api/alerts
 */
export async function ambilPeringatan(prov, kecamatan = '') {
  const params = new URLSearchParams({ prov });
  if (kecamatan) params.set('kecamatan', kecamatan);
  const res = await fetch(`/api/alerts?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Gagal mengambil peringatan (${res.status})`);
  }
  return res.json();
}

/**
 * Ambil data hotspot satelit NASA FIRMS di sekitar koordinat desa.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radius — dalam kilometer (maks 50)
 * @returns {Promise<object>} payload dari /api/hotspots
 */
export async function ambilHotspot(lat, lon, radius = 50) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius: radius.toString(),
  });
  const res = await fetch(`/api/hotspots?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Gagal mengambil data hotspot (${res.status})`);
  }
  return res.json();
}

/**
 * Muat data wilayah satu provinsi secara lazy (hanya saat dibutuhkan).
 * File JSON disimpan di /data/wilayah/{kode}.json
 * @param {string} kode — kode BPS provinsi, mis. "61"
 * @returns {Promise<object>} data wilayah provinsi
 */
export async function muatWilayahProvinsi(kode) {
  const res = await fetch(`/data/wilayah/${kode}.json`);
  if (!res.ok) throw new Error(`Data wilayah provinsi ${kode} tidak ditemukan.`);
  return res.json();
}
