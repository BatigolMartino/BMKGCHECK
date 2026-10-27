/**
 * api/alerts.js — Serverless function peringatan dini BMKG (RSS/CAP)
 *
 * Query: ?prov=Kalimantan+Barat&kecamatan=Pontianak+Utara
 * - Ambil RSS feed peringatan dini nasional BMKG
 * - Filter berdasarkan nama provinsi (judul) + nama kecamatan (deskripsi)
 * - Sertakan tautan ke infografis CAP jika tersedia
 * - Cache 5 menit (peringatan bersifat nowcast, berubah cepat)
 *
 * Pencocokan menggunakan teks karena RSS/CAP BMKG tidak menyertakan kode adm.
 */

const RSS_URL = 'https://cuaca.bmkg.go.id/data/public/cap/feed/id/rss.xml';

/** Kode BPS provinsi Kalimantan — untuk validasi GUID sebagai konfirmasi */
const PROV_KODE_BPS = {
  'KALIMANTAN BARAT':  '61',
  'KALIMANTAN TENGAH': '62',
  'KALIMANTAN SELATAN':'63',
  'KALIMANTAN TIMUR':  '64',
  'KALIMANTAN UTARA':  '65',
};

/** Normalisasi string untuk pencocokan case-insensitive */
const norm = (s) => (s ?? '').toUpperCase().trim();

/** Ekstrak teks dari satu tag XML */
const getTag = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
};

/** Parse semua <item> dari RSS XML */
function parseRSS(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const x     = m[1];
    const guid  = getTag(x, 'guid');
    // Kode provinsi ada di posisi ke-10 dalam GUID (0-indexed)
    // Format: 2.49.0.1.360.0.YYYY.MM.DD.HH.{kode_prov}.{nomor}
    const gParts = guid.split('.');
    const provKodeGuid = gParts.length >= 12 ? gParts[10] : null;

    items.push({
      judul:        getTag(x, 'title'),
      deskripsi:    getTag(x, 'description'),
      tautan:       getTag(x, 'link'),
      diterbitkan:  getTag(x, 'pubDate'),
      guid,
      provKodeGuid,
    });
  }
  return items;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prov, kecamatan } = req.query;
  if (!prov) {
    return res.status(400).json({ error: 'Parameter prov wajib diisi.' });
  }

  try {
    const upstream = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'PeatGuard-Cuaca/1.0 (karhutla monitoring Kalimantan)' },
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `BMKG RSS mengembalikan ${upstream.status}.` });
    }

    const xml     = await upstream.text();
    const semua   = parseRSS(xml);

    const provNorm     = norm(prov);
    const kecNorm      = kecamatan ? norm(kecamatan) : null;
    const targetKode   = PROV_KODE_BPS[provNorm] ?? null;

    const relevan = semua.filter(item => {
      const judulNorm = norm(item.judul);
      const descNorm  = norm(item.deskripsi);

      // Cocokkan provinsi: dari judul ATAU dari kode GUID
      const cocokJudul = judulNorm.includes(provNorm);
      const cocokGuid  = targetKode ? item.provKodeGuid === targetKode : false;
      const cocokProv  = cocokJudul || cocokGuid;

      if (!cocokProv) return false;

      // Jika ada kecamatan, cek di deskripsi (nama kecamatan di CAP = huruf kapital)
      if (kecNorm) {
        return descNorm.includes(kecNorm);
      }
      return true;
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      diperbarui: new Date().toISOString(),
      total:      relevan.length,
      peringatan: relevan,
    });

  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return res.status(502).json({
      error: isTimeout
        ? 'Permintaan ke BMKG RSS melebihi batas waktu.'
        : `Gagal mengambil peringatan: ${err.message}`,
    });
  }
}
