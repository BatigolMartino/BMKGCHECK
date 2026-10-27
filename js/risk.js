/**
 * js/risk.js — Logika indikator risiko karhutla
 *
 * Modul ini MURNI fungsi (tidak ada DOM, tidak ada fetch).
 * Bisa dipakai di browser (import) maupun Node.js (untuk testing).
 *
 * Semua ambang batas disimpan sebagai konstanta di satu tempat agar
 * mudah diubah tanpa menyentuh logika.
 */

// ─────────────────────────────────────────────────────────────────────────────
// KONSTANTA AMBANG BATAS
// Ubah hanya di sini jika perlu kalibrasi ulang indikator.
// ─────────────────────────────────────────────────────────────────────────────

// Deep freeze: bekukan objek secara rekursif agar nested object juga immutable
function deepFreeze(obj) {
  Object.freeze(obj);
  Object.values(obj).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
  return obj;
}

export const AMBANG = deepFreeze({
  // Total curah hujan 72 jam (mm)
  HUJAN: {
    SANGAT_KERING: 1,   // < 1 mm → 2 poin
    KERING:        10,  // 1–10 mm → 1 poin  |  > 10 mm → 0 poin
  },

  // Kelembapan relatif minimum (%)
  KELEMBAPAN: {
    SANGAT_KERING: 60,  // < 60% → 2 poin
    KERING:        75,  // 60–75% → 1 poin  |  > 75% → 0 poin
  },

  // Suhu udara maksimum (°C)
  SUHU: {
    SANGAT_PANAS:  34,  // ≥ 34°C → 2 poin
    PANAS:         32,  // 32–33,9°C → 1 poin  |  < 32°C → 0 poin
  },

  // Kecepatan angin maksimum (km/jam) — field `ws` BMKG sudah dalam km/jam
  ANGIN: {
    KENCANG:       20,  // ≥ 20 km/jam → 1 poin  |  < 20 km/jam → 0 poin
  },

  // Ambang total skor → level risiko
  SKOR: {
    SEDANG: 3,  // skor ≥ 3 → SEDANG
    TINGGI: 5,  // skor ≥ 5 → TINGGI
  },
});

// Label dan penjelasan per level risiko
export const LEVEL_INFO = Object.freeze({
  RENDAH: {
    label:      'RENDAH',
    emoji:      '🟢',
    kelas_css:  'risiko-rendah',
    penjelasan: 'Cuaca belum mendukung kebakaran. Tetap jangan membakar lahan atau sampah.',
    saran: [
      'Tidak ada tindakan khusus yang diperlukan.',
      'Tetap patuhi larangan membakar lahan dan sampah.',
      'Laporkan jika melihat titik api ke BPBD setempat.',
    ],
  },
  SEDANG: {
    label:      'SEDANG',
    emoji:      '🟡',
    kelas_css:  'risiko-sedang',
    penjelasan: 'Cuaca mulai kering. Waspada dan hindari api terbuka, terutama di dekat lahan gambut.',
    saran: [
      'Periksa kanal dan sumber air di sekitar lahan gambut.',
      'Siapkan peralatan pemadam api sederhana (pompa, selang).',
      'Sampaikan informasi kewaspadaan kepada warga desa.',
      'Hindari semua aktivitas yang melibatkan api terbuka.',
    ],
  },
  TINGGI: {
    label:      'TINGGI',
    emoji:      '🔴',
    kelas_css:  'risiko-tinggi',
    penjelasan: 'Cuaca sangat mendukung api menyebar. Jangan membakar apa pun. Laporkan asap atau api ke BPBD/pihak berwenang setempat.',
    saran: [
      'Tingkatkan patroli di area gambut dan lahan kering.',
      'Koordinasi segera dengan MPA (Masyarakat Peduli Api) dan BPBD.',
      'Segera laporkan asap atau titik api yang terlihat.',
      'Pastikan semua warga tahu larangan membakar berlaku ketat.',
      'Siapkan jalur evakuasi jika diperlukan.',
    ],
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNGSI UTAMA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hitung skor dan level risiko karhutla dari array titik prakiraan.
 *
 * @param {Array<{suhu, kelembapan, hujan, angin_kmjam}>} titik
 *   Array titik prakiraan (output field dari /api/forecast → prakiraan[])
 *   Boleh kosong — akan mengembalikan level RENDAH dengan skor 0.
 *
 * @returns {{
 *   skor: number,          // 0–7
 *   level: string,         // 'RENDAH' | 'SEDANG' | 'TINGGI'
 *   info: object,          // LEVEL_INFO[level]
 *   detail: {              // rincian per parameter (untuk debug & penjelasan)
 *     totalHujan:    number,
 *     suhuMax:       number,
 *     kelembapanMin: number,
 *     anginMax:      number,
 *     skorHujan:     number,
 *     skorSuhu:      number,
 *     skorKelembapan:number,
 *     skorAngin:     number,
 *   },
 *   faktorUtama: string,   // faktor paling berpengaruh (untuk kalimat penjelasan)
 *   penjelasanDinamis: string, // penjelasan dengan sebutan faktor utama
 * }}
 */
export function hitungRisiko(titik) {
  // Tangani array kosong — kembalikan level aman dengan penanda
  if (!titik || titik.length === 0) {
    return {
      skor:   0,
      level:  'RENDAH',
      info:   LEVEL_INFO.RENDAH,
      detail: {
        totalHujan: 0, suhuMax: 0, kelembapanMin: 100, anginMax: 0,
        skorHujan: 0, skorSuhu: 0, skorKelembapan: 0, skorAngin: 0,
      },
      faktorUtama:       'data tidak tersedia',
      penjelasanDinamis: LEVEL_INFO.RENDAH.penjelasan,
      dataKosong:        true,
    };
  }

  // ── Hitung statistik dari seluruh titik ──────────────────────────────────

  const totalHujan    = titik.reduce((sum, t) => sum + (t.hujan ?? 0), 0);
  const suhuMax       = Math.max(...titik.map(t => t.suhu ?? 0));
  const kelembapanMin = Math.min(...titik.map(t => t.kelembapan ?? 100));
  const anginMax      = Math.max(...titik.map(t => t.angin_kmjam ?? 0));

  // ── Hitung skor per parameter ─────────────────────────────────────────────

  // Hujan: 0–2 poin
  let skorHujan;
  if (totalHujan < AMBANG.HUJAN.SANGAT_KERING)      skorHujan = 2;
  else if (totalHujan <= AMBANG.HUJAN.KERING)         skorHujan = 1;
  else                                                 skorHujan = 0;

  // Kelembapan: 0–2 poin
  let skorKelembapan;
  if (kelembapanMin < AMBANG.KELEMBAPAN.SANGAT_KERING)      skorKelembapan = 2;
  else if (kelembapanMin <= AMBANG.KELEMBAPAN.KERING)         skorKelembapan = 1;
  else                                                         skorKelembapan = 0;

  // Suhu: 0–2 poin
  let skorSuhu;
  if (suhuMax >= AMBANG.SUHU.SANGAT_PANAS)      skorSuhu = 2;
  else if (suhuMax >= AMBANG.SUHU.PANAS)         skorSuhu = 1;
  else                                            skorSuhu = 0;

  // Angin: 0–1 poin
  const skorAngin = anginMax >= AMBANG.ANGIN.KENCANG ? 1 : 0;

  // ── Total skor & level ────────────────────────────────────────────────────

  const skor = skorHujan + skorKelembapan + skorSuhu + skorAngin;

  let level;
  if (skor >= AMBANG.SKOR.TINGGI)       level = 'TINGGI';
  else if (skor >= AMBANG.SKOR.SEDANG)  level = 'SEDANG';
  else                                   level = 'RENDAH';

  // ── Tentukan faktor utama (poin tertinggi) ────────────────────────────────
  // Dipakai untuk membuat kalimat penjelasan yang lebih spesifik.

  const kontribusi = [
    { nama: `tidak ada hujan 3 hari ke depan (${totalHujan.toFixed(1)} mm)`, poin: skorHujan },
    { nama: `kelembapan sangat rendah (min ${kelembapanMin}%)`,              poin: skorKelembapan },
    { nama: `suhu sangat panas (maks ${suhuMax}°C)`,                          poin: skorSuhu },
    { nama: `angin kencang (maks ${anginMax.toFixed(1)} km/jam)`,             poin: skorAngin },
  ];

  // Urutkan berdasarkan poin tertinggi, ambil yang pertama
  kontribusi.sort((a, b) => b.poin - a.poin);
  const faktorUtama = kontribusi[0].poin > 0
    ? kontribusi[0].nama
    : 'kondisi cuaca relatif aman';

  // Buat kalimat penjelasan yang menyebut faktor utama
  const penjelasanDinamis = level === 'RENDAH'
    ? LEVEL_INFO.RENDAH.penjelasan
    : `${LEVEL_INFO[level].penjelasan} (Faktor utama: ${faktorUtama}.)`;

  return {
    skor,
    level,
    info:   LEVEL_INFO[level],
    detail: {
      totalHujan,
      suhuMax,
      kelembapanMin,
      anginMax,
      skorHujan,
      skorSuhu,
      skorKelembapan,
      skorAngin,
    },
    faktorUtama,
    penjelasanDinamis,
  };
}

/**
 * Hitung statistik ringkasan untuk "4 angka kunci" yang ditampilkan di UI.
 *
 * @param {Array} perHari — array 3 sub-array (output per_hari dari /api/forecast)
 * @returns {{ suhuMax, kelembapanMin, totalHujan, anginMax }}
 */
export function hitungAngkaKunci(perHari) {
  const flat = perHari.flat();
  return {
    suhuMax:       Math.max(...flat.map(t => t.suhu ?? 0)),
    kelembapanMin: Math.min(...flat.map(t => t.kelembapan ?? 100)),
    totalHujan:    flat.reduce((s, t) => s + (t.hujan ?? 0), 0),
    anginMax:      Math.max(...flat.map(t => t.angin_kmjam ?? 0)),
  };
}

/**
 * Hitung ringkasan per hari: label hari, cuaca dominan, suhu min-max, total hujan.
 *
 * @param {Array[]} perHari  — array 3 sub-array titik
 * @param {string}  timezone — IANA timezone string, mis. "Asia/Pontianak"
 * @returns {Array<{label, cuacaDominan, suhuMin, suhuMax, totalHujan, anginMax}>}
 */
export function ringkasanPerHari(perHari, timezone = 'Asia/Jakarta') {
  return perHari.map((hari, i) => {
    if (!hari || hari.length === 0) return null;

    // Label hari dari tanggal titik pertama
    const tglStr  = hari[0].dt_utc;
    const tgl     = new Date(tglStr);
    let label;
    if (i === 0)      label = 'Hari ini';
    else if (i === 1) label = 'Besok';
    else              label = 'Lusa';

    // Cuaca dominan: modus weather_desc
    const cuacaCount = {};
    hari.forEach(t => {
      cuacaCount[t.cuaca_teks] = (cuacaCount[t.cuaca_teks] || 0) + 1;
    });
    const cuacaDominan = Object.entries(cuacaCount)
      .sort((a, b) => b[1] - a[1])[0][0];

    return {
      label,
      tanggal:     tglStr.substring(0, 10), // "2026-10-27"
      cuacaDominan,
      suhuMin:     Math.min(...hari.map(t => t.suhu ?? Infinity)),
      suhuMax:     Math.max(...hari.map(t => t.suhu ?? -Infinity)),
      totalHujan:  hari.reduce((s, t) => s + (t.hujan ?? 0), 0),
      anginMax:    Math.max(...hari.map(t => t.angin_kmjam ?? 0)),
      kelembapanMin: Math.min(...hari.map(t => t.kelembapan ?? 100)),
    };
  }).filter(Boolean);
}
