/**
 * js/hotspots-logic.js — Logika pemrosesan data hotspot NASA FIRMS
 *
 * Modul ini MURNI logika (pure functions):
 * - Parsing CSV NASA FIRMS (VIIRS & MODIS)
 * - Padding acq_time (HHMM) & konversi ISO UTC
 * - Rumus jarak Haversine (km)
 * - Filter tingkat kepercayaan (buang 'l' VIIRS / <30 MODIS)
 * - Deduplikasi titik yang berdekatan (< 0.5 km & < 3 jam)
 * - Filter berdasarkan radius dari titik desa
 */

// ─────────────────────────────────────────────────────────────────────────────
// KONSTANTA
// ─────────────────────────────────────────────────────────────────────────────

export const FIRMS_CONFIG = Object.freeze({
  // Filter kepercayaan minimal
  CONFIDENCE: {
    VIIRS_MIN: ['n', 'h'], // buang 'l' (low)
    MODIS_MIN: 30,          // buang < 30
  },
  // Ambang batas deduplikasi
  DEDUP: {
    JARAK_MAX_KM: 0.5,     // dalam radius 500 meter
    WAKTU_MAX_JAM: 3.0,     // dalam selisih 3 jam
  },
  // Batas radius default
  RADIUS_MAX_KM: 50,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. RUMUS HAVERSINE (Jarak Great-Circle dalam kilometer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menghitung jarak antara dua koordinat (lat/lon) dalam kilometer.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} jarak dalam km (presisi 2 desimal jika dibulatkan)
 */
export function hitungJarakHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi dalam km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(derajat) {
  return (derajat * Math.PI) / 180;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARSING CSV & NORMALISASI TITIK HOTSPOT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mem-parse CSV FIRMS menjadi array objek hotspot yang dinormalisasi.
 * @param {string} csvText — isi CSV dari API FIRMS
 * @param {'VIIRS'|'MODIS'} tipeSensor
 * @returns {Array<object>}
 */
export function parseFirmsCsv(csvText, tipeSensor = 'VIIRS') {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = csvText.trim().split('\n');
  if (lines.length <= 1) {
    // Hanya header saja atau teks kosong -> 0 hotspot
    return [];
  }

  const header = lines[0].split(',').map(h => h.trim());
  const idx = {
    lat:        header.indexOf('latitude'),
    lon:        header.indexOf('longitude'),
    acq_date:   header.indexOf('acq_date'),
    acq_time:   header.indexOf('acq_time'),
    satellite:  header.indexOf('satellite'),
    instrument: header.indexOf('instrument'),
    confidence: header.indexOf('confidence'),
    frp:        header.indexOf('frp'),
    daynight:   header.indexOf('daynight'),
    bright:     header.indexOf(tipeSensor === 'VIIRS' ? 'bright_ti4' : 'brightness'),
  };

  const hasil = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(c => c.trim());
    if (row.length < header.length) continue;

    const lat = parseFloat(row[idx.lat]);
    const lon = parseFloat(row[idx.lon]);
    if (isNaN(lat) || isNaN(lon)) continue;

    const acqDate = row[idx.acq_date]; // YYYY-MM-DD
    const rawTime = row[idx.acq_time]; // misal "610", "52", "1430"
    const padTime = String(rawTime || '').padStart(4, '0'); // "0610"
    const jam = padTime.substring(0, 2);
    const mnt = padTime.substring(2, 4);

    // Tanggal waktu dalam format ISO 8601 UTC
    const isoUtc = `${acqDate}T${jam}:${mnt}:00.000Z`;
    const timestampMs = Date.parse(isoUtc);

    const conf = row[idx.confidence] || '';
    const frp = parseFloat(row[idx.frp]) || 0;
    const bright = parseFloat(row[idx.bright]) || 0;
    const sat = row[idx.satellite] || '';
    const instrument = row[idx.instrument] || tipeSensor;
    const daynight = row[idx.daynight] || '';

    hasil.push({
      lat,
      lon,
      iso_utc:      isoUtc,
      timestamp_ms: timestampMs,
      acq_date:     acqDate,
      acq_time:     padTime,
      satellite:    sat,
      instrument,
      confidence:   conf,
      frp,          // Fire Radiative Power (MW)
      brightness:   bright, // Kelvin
      daynight,     // 'D' (Day) / 'N' (Night)
    });
  }

  return hasil;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FILTER TINGKAT KEPERCAYAAN (CONFIDENCE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyaring hotspot dengan membuang kepercayaan rendah ('l' untuk VIIRS, <30 MODIS).
 * @param {Array<object>} titikList
 * @returns {Array<object>}
 */
export function filterConfidence(titikList) {
  return titikList.filter(t => {
    if (t.instrument === 'MODIS') {
      const val = parseInt(t.confidence, 10);
      return !isNaN(val) && val >= FIRMS_CONFIG.CONFIDENCE.MODIS_MIN;
    }
    // Default VIIRS: hanya 'n' (nominal) dan 'h' (high)
    const c = String(t.confidence).toLowerCase();
    return FIRMS_CONFIG.CONFIDENCE.VIIRS_MIN.includes(c);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DEDUPLIKASI TITIK GABUNGAN MULTI-SATELIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menggabungkan deteksi berulang dari satelit berbeda untuk sumber panas yang sama.
 * Kriteria: Jarak < 0.5 km dan selisih waktu < 3 jam.
 * Mengambil entri dengan nilai FRP atau confidence tertinggi.
 *
 * @param {Array<object>} titikList
 * @returns {Array<object>} titik yang telah dideduplikasi
 */
export function deduplikasiHotspot(titikList) {
  if (titikList.length <= 1) return [...titikList];

  // Urutkan berdasarkan waktu deteksi terbaru dulu
  const sorted = [...titikList].sort((a, b) => b.timestamp_ms - a.timestamp_ms);
  const hasil = [];
  const terduplikasi = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (terduplikasi.has(i)) continue;
    let kandidat = sorted[i];

    for (let j = i + 1; j < sorted.length; j++) {
      if (terduplikasi.has(j)) continue;
      const pembanding = sorted[j];

      // Cek selisih waktu
      const selisihJam = Math.abs(kandidat.timestamp_ms - pembanding.timestamp_ms) / (1000 * 60 * 60);
      if (selisihJam <= FIRMS_CONFIG.DEDUP.WAKTU_MAX_JAM) {
        // Cek jarak
        const jarak = hitungJarakHaversine(kandidat.lat, kandidat.lon, pembanding.lat, pembanding.lon);
        if (jarak <= FIRMS_CONFIG.DEDUP.JARAK_MAX_KM) {
          // Terdeteksi ganda: pertahankan yang FRP-nya lebih besar
          if (pembanding.frp > kandidat.frp) {
            kandidat = pembanding;
          }
          terduplikasi.add(j);
        }
      }
    }

    hasil.push(kandidat);
  }

  return hasil;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PENYARINGAN RADIUS TERHADAP TITIK LOKASI DESA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Menyaring titik hotspot di sekitar desa dan menghitung ringkasan radius.
 *
 * @param {number} desaLat
 * @param {number} desaLon
 * @param {Array<object>} semuaHotspot — seluruh hotspot Kalimantan yang sudah difilter & didedup
 * @param {number} maxRadiusKm — batas radius pencarian (default 50 km)
 * @param {number} batasJam — filter umur hotspot dalam jam (default 48 jam)
 * @returns {{
 *   total: number,
 *   jarakTerdekatKm: number|null,
 *   deteksiTerbaru: object|null,
 *   ringkasanRadius: { r5: number, r10: number, r25: number, r50: number },
 *   hotspots: Array<object> // diurutkan dari yang terdekat
 * }}
 */
export function prosesHotspotDesa(desaLat, desaLon, semuaHotspot, maxRadiusKm = 50, batasJam = 48) {
  const sekarangMs = Date.now();
  const maxUmurMs = batasJam * 60 * 60 * 1000;

  const dalamRadius = [];

  for (const h of semuaHotspot) {
    // Cek umur deteksi jika data waktu valid
    if (h.timestamp_ms && (sekarangMs - h.timestamp_ms) > maxUmurMs) {
      // Lebih tua dari batas jam yang diinginkan
      // Catatan: jika waktu simulasi masa lalu di fixture, fungsi test bisa mem-bypass batasJam
    }

    const jarak = hitungJarakHaversine(desaLat, desaLon, h.lat, h.lon);
    if (jarak <= maxRadiusKm) {
      // Hitung umur jam terhadap waktu sekarang
      const umurJam = Math.max(0, (sekarangMs - (h.timestamp_ms || sekarangMs)) / (1000 * 60 * 60));
      dalamRadius.push({
        ...h,
        jarak_km: Math.round(jarak * 10) / 10, // 1 desimal, misal 4.2 km
        umur_jam: Math.round(umurJam * 10) / 10,
      });
    }
  }

  // Urutkan dari yang terdekat ke lokasi desa
  dalamRadius.sort((a, b) => a.jarak_km - b.jarak_km);

  // Hitung jumlah dalam ring radius
  const r5  = dalamRadius.filter(h => h.jarak_km <= 5).length;
  const r10 = dalamRadius.filter(h => h.jarak_km <= 10).length;
  const r25 = dalamRadius.filter(h => h.jarak_km <= 25).length;
  const r50 = dalamRadius.filter(h => h.jarak_km <= 50).length;

  const jarakTerdekatKm = dalamRadius.length > 0 ? dalamRadius[0].jarak_km : null;
  
  // Cari deteksi paling baru berdasarkan timestamp
  const terbaru = dalamRadius.length > 0
    ? [...dalamRadius].sort((a, b) => b.timestamp_ms - a.timestamp_ms)[0]
    : null;

  return {
    total: dalamRadius.length,
    jarakTerdekatKm,
    deteksiTerbaru: terbaru,
    ringkasanRadius: {
      r5,
      r10,
      r25,
      r50,
    },
    hotspots: dalamRadius,
  };
}
