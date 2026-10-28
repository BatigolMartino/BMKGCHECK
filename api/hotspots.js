/**
 * api/hotspots.js — Serverless function untuk data hotspot satelit NASA FIRMS
 *
 * Query: ?lat=-0.0006&lon=109.3627&radius=50
 * - Validasi parameter lat & lon dalam wilayah Kalimantan
 * - Cache regional Kalimantan di-fetch SEKALI per 30 menit (menghemat kuota NASA)
 * - Menggabungkan satelit VIIRS SNPP, NOAA-20, NOAA-21
 * - Filter confidence (buang 'l') & deduplikasi otomatis (<0.5km & <3jam)
 * - Kembalikan hotspot yang relevan di sekitar lokasi desa
 */

import {
  parseFirmsCsv,
  filterConfidence,
  deduplikasiHotspot,
  prosesHotspotDesa,
} from '../js/hotspots-logic.js';

// Bounding box Kalimantan
const BBOX_KALIMANTAN = '108.5,-4.5,119.5,4.5';
const DAY_RANGE = '2'; // Ambil 2 hari terakhir untuk cakupan 24-48 jam

// Sumber satelit VIIRS resolusi tinggi 375m
const SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];

// Cache global di memory serverless instance
let cacheKalimantan = {
  data: [],
  diperbarui: 0,
  stale: false,
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit

/**
 * Mengambil data dari FIRMS secara aman tanpa mengekspos MAP_KEY.
 */
async function ambilDataFirms(mapKey) {
  const semuaTitik = [];

  for (const src of SOURCES) {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${src}/${BBOX_KALIMANTAN}/${DAY_RANGE}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PeatGuard-Cuaca/1.0 (karhutla monitoring Kalimantan)' },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const text = await res.text();
        const titik = parseFirmsCsv(text, 'VIIRS');
        semuaTitik.push(...titik);
      }
    } catch {
      // Jika salah satu satelit gagal, lanjutkan dengan satelit yang lain
    }
  }

  // 1. Saring kepercayaan (buang 'l')
  const terpercaya = filterConfidence(semuaTitik);

  // 2. Deduplikasi multi-satelit (<0.5 km & <3 jam)
  const terdedup = deduplikasiHotspot(terpercaya);

  return terdedup;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lat, lon, radius } = req.query;

  // ── 1. Validasi Parameter ────────────────────────────────────────────────
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Parameter lat dan lon wajib diisi.' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const radNum = Math.min(50, Math.max(1, parseFloat(radius) || 50));

  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'Parameter lat dan lon harus berupa angka valid.' });
  }

  // Validasi batas geografis Kalimantan: lat (-4.5 s/d 4.5), lon (108.5 s/d 119.5)
  if (latNum < -4.8 || latNum > 4.8 || lonNum < 108.0 || lonNum > 120.0) {
    return res.status(400).json({
      error: 'Koordinat di luar wilayah cakupan Kalimantan (-4.5 s/d 4.5 LS/LU, 108.5 s/d 119.5 BT).'
    });
  }

  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    // Mode fallback aman jika env belum dipasang di hosting
    return res.status(503).json({
      error: 'Layanan data satelit NASA FIRMS belum dikonfigurasi (FIRMS_MAP_KEY tidak ditemukan).',
      stale: false,
    });
  }

  // ── 2. Pemeriksaan Cache In-Memory ────────────────────────────────────────
  const sekarang = Date.now();
  const butuhRefresh = (sekarang - cacheKalimantan.diperbarui) > CACHE_TTL_MS;

  if (butuhRefresh) {
    try {
      const freshData = await ambilDataFirms(mapKey);
      cacheKalimantan = {
        data: freshData,
        diperbarui: sekarang,
        stale: false,
      };
    } catch (err) {
      // Jika fetch gagal tetapi ada data cache lama, tandai stale
      if (cacheKalimantan.data && cacheKalimantan.data.length > 0) {
        cacheKalimantan.stale = true;
      } else {
        return res.status(502).json({
          error: 'Gagal mengambil data dari NASA FIRMS. Silakan coba lagi nanti.',
          stale: false,
        });
      }
    }
  }

  // ── 3. Proses Titik Terhadap Lokasi Desa ──────────────────────────────────
  const hasil = prosesHotspotDesa(latNum, lonNum, cacheKalimantan.data, radNum, 48);

  const payload = {
    stale: cacheKalimantan.stale,
    diperbarui: new Date(cacheKalimantan.diperbarui || sekarang).toISOString(),
    lokasi_acuan: {
      lat: latNum,
      lon: lonNum,
      radius_km: radNum,
    },
    ringkasan: {
      total: hasil.total,
      jarak_terdekat_km: hasil.jarakTerdekatKm,
      deteksi_terbaru: hasil.deteksiTerbaru ? {
        iso_utc:      hasil.deteksiTerbaru.iso_utc,
        satellite:    hasil.deteksiTerbaru.satellite,
        frp:          hasil.deteksiTerbaru.frp,
        confidence:   hasil.deteksiTerbaru.confidence,
        jarak_km:     hasil.deteksiTerbaru.jarak_km,
        umur_jam:     hasil.deteksiTerbaru.umur_jam,
      } : null,
      radius_5km:  hasil.ringkasanRadius.r5,
      radius_10km: hasil.ringkasanRadius.r10,
      radius_25km: hasil.ringkasanRadius.r25,
      radius_50km: hasil.ringkasanRadius.r50,
    },
    hotspots: hasil.hotspots.map(h => ({
      lat:        h.lat,
      lon:        h.lon,
      iso_utc:    h.iso_utc,
      satellite:  h.satellite,
      instrument: h.instrument,
      confidence: h.confidence,
      frp:        h.frp,
      brightness: h.brightness,
      jarak_km:   h.jarak_km,
      umur_jam:   h.umur_jam,
    })),
  };

  // Cache CDN Vercel 15 menit, stale 30 menit
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(payload);
}
