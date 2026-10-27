/**
 * api/forecast.js — Serverless function untuk prakiraan cuaca BMKG
 *
 * Query: ?adm4=61.71.04.1001
 * - Validasi format kode adm4 (hanya Kalimantan: 61-65)
 * - Ambil dari BMKG, rapikan field, kembalikan JSON
 * - Cache 3 jam di Vercel CDN (s-maxage=10800)
 * - Jika BMKG gagal, kembalikan error 502 dengan pesan jelas
 *
 * Catatan: cache stale-while-revalidate ditangani di CDN Vercel —
 * kita tidak perlu menyimpan data sendiri.
 */

const BMKG_BASE  = 'https://api.bmkg.go.id/publik/prakiraan-cuaca';
const ADM4_REGEX = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/;
const PROV_VALID = new Set(['61', '62', '63', '64', '65']);

/** Petakan kode adm1 ke zona waktu IANA */
const TIMEZONE_MAP = {
  '61': 'Asia/Pontianak',  // Kalbar  — WIB
  '62': 'Asia/Pontianak',  // Kalteng — WIB
  '63': 'Asia/Makassar',   // Kalsel  — WITA
  '64': 'Asia/Makassar',   // Kaltim  — WITA
  '65': 'Asia/Makassar',   // Kaltara — WITA
};

/** Rapikan satu titik prakiraan — hanya field yang dibutuhkan frontend */
function rapiTitik(t) {
  return {
    dt_utc:      t.datetime,
    dt_lokal:    t.local_datetime,
    suhu:        t.t,         // °C
    kelembapan:  t.hu,        // %
    hujan:       t.tp ?? 0,   // mm per 3 jam (null → 0)
    angin_kmjam: t.ws,        // km/jam
    arah_angin:  t.wd,        // "NE"
    cuaca_kode:  t.weather,
    cuaca_teks:  t.weather_desc,
    ikon_url:    t.image,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adm4 } = req.query;

  // ── Validasi input ───────────────────────────────────────────────────────
  if (!adm4) {
    return res.status(400).json({ error: 'Parameter adm4 wajib diisi. Contoh: ?adm4=61.71.04.1001' });
  }
  if (!ADM4_REGEX.test(adm4)) {
    return res.status(400).json({ error: 'Format adm4 tidak valid. Contoh: 61.71.04.1001' });
  }
  const provKode = adm4.substring(0, 2);
  if (!PROV_VALID.has(provKode)) {
    return res.status(400).json({ error: 'Hanya wilayah Kalimantan (kode 61–65) yang didukung.' });
  }

  // ── Ambil dari BMKG ──────────────────────────────────────────────────────
  try {
    const bmkgRes = await fetch(
      `${BMKG_BASE}?adm4=${encodeURIComponent(adm4)}`,
      {
        headers: { 'User-Agent': 'PeatGuard-Cuaca/1.0 (karhutla monitoring Kalimantan)' },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!bmkgRes.ok) {
      return res.status(502).json({
        error: `BMKG mengembalikan status ${bmkgRes.status}. Coba lagi nanti.`,
        stale: false,
      });
    }

    const raw = await bmkgRes.json();

    // ── Susun payload ────────────────────────────────────────────────────
    const lokRaw   = raw.lokasi ?? {};
    const cuacaRaw = raw.data?.[0]?.cuaca ?? [];

    // Array flat semua titik (untuk kalkulasi risiko di frontend)
    const prakiraan = cuacaRaw.flat().map(rapiTitik);

    // Array per hari (3 sub-array, untuk grafik & ringkasan harian)
    const per_hari = cuacaRaw.map(hari => hari.map(rapiTitik));

    const timezone = TIMEZONE_MAP[provKode] ?? lokRaw.timezone ?? 'Asia/Jakarta';

    const payload = {
      stale:      false,
      diperbarui: new Date().toISOString(),
      lokasi: {
        adm4:      lokRaw.adm4,
        adm3:      lokRaw.adm3,
        adm2:      lokRaw.adm2,
        adm1:      lokRaw.adm1,
        provinsi:  lokRaw.provinsi,
        kotkab:    lokRaw.kotkab,
        kecamatan: lokRaw.kecamatan,
        desa:      lokRaw.desa,
        lat:       lokRaw.lat,
        lon:       lokRaw.lon,
        timezone,  // IANA — dipakai frontend untuk format waktu lokal
      },
      prakiraan,   // ~20 titik flat
      per_hari,    // [[4 titik], [8 titik], [8 titik]]
    };

    // Cache 3 jam di CDN; klien boleh pakai data lama selama 30 menit
    res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=1800');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(payload);

  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return res.status(502).json({
      error: isTimeout
        ? 'Permintaan ke BMKG melebihi batas waktu (10 detik). Coba lagi nanti.'
        : `Gagal mengambil data dari BMKG: ${err.message}`,
      stale: false,
    });
  }
}
