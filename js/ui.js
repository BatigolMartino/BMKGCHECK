/**
 * js/ui.js — Manipulasi DOM dan render komponen UI
 *
 * Modul ini tidak mengandung logika bisnis (itu ada di risk.js).
 * Hanya bertanggung jawab menampilkan data ke layar.
 */

import { LEVEL_INFO } from './risk.js';

// ─────────────────────────────────────────────────────────────────────────────
// Elemen DOM (diambil sekali, disimpan untuk efisiensi)
// ─────────────────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);

export const el = {
  // Pemilih lokasi
  selectProv:    $('#select-provinsi'),
  selectKab:     $('#select-kabupaten'),
  selectKec:     $('#select-kecamatan'),
  inputDesa:     $('#input-desa'),
  daftarDesa:    $('#daftar-desa'),
  lokasiTerpilih:$('#lokasi-terpilih'),

  // Konten utama
  kontenUtama:   $('#konten-utama'),
  placeholder:   $('#placeholder-pilih'),

  // Kartu risiko (F2)
  kartuRisiko:   $('#kartu-risiko'),
  risikoEmoji:   $('#risiko-emoji'),
  risikoLabel:   $('#risiko-label'),
  risikoSubLabel:$('#risiko-sublabel'),
  risikoPenjelasan: $('#risiko-penjelasan'),

  // Banner peringatan (F5)
  bannerPeringatan: $('#banner-peringatan'),
  bannerJudul:      $('#banner-judul-teks'),
  bannerDeskripsi:  $('#banner-deskripsi'),
  bannerTautan:     $('#banner-tautan'),
  bannerLebih:      $('#banner-lebih'),

  // Angka kunci (F3)
  nilaiSuhu:      $('#nilai-suhu'),
  nilaiHujan:     $('#nilai-hujan'),
  nilaiLembap:    $('#nilai-lembap'),
  nilaiAngin:     $('#nilai-angin'),

  // Ringkasan 3 hari (F4)
  ringkasanHari:  $('#ringkasan-hari'),

  // Saran tindakan (F6)
  saranList:      $('#saran-list'),

  // Bagikan (F8)
  tombolBagikan:  $('#tombol-bagikan'),

  // Meta
  infoUpdate:     $('#info-diperbarui'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton / Loading
// ─────────────────────────────────────────────────────────────────────────────

export function tampilkanSkeleton() {
  if (!el.kontenUtama) return;
  // Tampilkan dengan flex agar gap antar kartu bekerja
  el.kontenUtama.style.display = 'flex';
  el.kontenUtama.style.flexDirection = 'column';
  el.kontenUtama.style.gap = '1rem';
  if (el.placeholder) el.placeholder.style.display = 'none';

  el.kontenUtama.innerHTML = `
    <div class="kartu">
      <div class="skeleton skeleton-besar" style="width:60%;margin:0 auto"></div>
      <div class="skeleton skeleton-teks" style="width:80%;margin:.5rem auto"></div>
      <div class="skeleton skeleton-teks" style="width:90%;margin:.25rem auto"></div>
    </div>
    <div class="kartu angka-kunci">
      ${[1,2,3,4].map(() => `<div class="kartu-angka"><div class="skeleton skeleton-besar"></div></div>`).join('')}
    </div>
    <div class="kartu"><div class="skeleton skeleton-grafik"></div></div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render semua komponen konten
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render seluruh halaman utama setelah data tersedia.
 * @param {object} risiko   — hasil hitungRisiko()
 * @param {object} kunci    — hasil hitungAngkaKunci()
 * @param {Array}  ringkasan — hasil ringkasanPerHari()
 * @param {object} prakiraan — payload dari /api/forecast (untuk grafik)
 * @param {object} peringatan — payload dari /api/alerts
 * @param {object} lokasiTerpilih — {desa, kecamatan, kotkab, provinsi, adm4}
 */
export function renderKonten({ risiko, kunci, ringkasan, prakiraan, peringatan, lokasiTerpilih: lok }) {
  if (!el.kontenUtama) return;

  el.kontenUtama.style.display = 'flex';
  el.kontenUtama.style.flexDirection = 'column';
  el.kontenUtama.style.gap = '1rem';
  el.kontenUtama.innerHTML = templateKonten();

  // Re-ambil elemen setelah innerHTML diubah
  const r = {
    kartuRisiko:      $('#kartu-risiko'),
    risikoEmoji:      $('#risiko-emoji'),
    risikoLabel:      $('#risiko-label'),
    risikoPenjelasan: $('#risiko-penjelasan'),
    bannerPeringatan: $('#banner-peringatan'),
    angkaKunci:       $('#angka-kunci-section'),
    ringkasanHari:    $('#ringkasan-hari'),
    saranList:        $('#saran-list'),
    tombolBagikan:    $('#tombol-bagikan'),
    infoUpdate:       $('#info-diperbarui'),
    grafik:           $('#grafik-cuaca'),
  };

  // F2: Kartu risiko
  renderRisiko(r, risiko);

  // F5: Banner peringatan
  renderBannerPeringatan(r, peringatan, lok);

  // F3: Angka kunci
  renderAngkaKunci(r, kunci);

  // F4: Grafik + ringkasan 3 hari
  renderGrafik(r, prakiraan, ringkasan);
  renderRingkasanHari(r, ringkasan);

  // F6: Saran tindakan
  renderSaran(r, risiko);

  // F7+F8: Tautan & bagikan
  renderTombolBagikan(r, lok);

  // Waktu diperbarui
  if (r.infoUpdate && prakiraan?.diperbarui) {
    const tgl = new Date(prakiraan.diperbarui);
    r.infoUpdate.textContent = `Data diperbarui: ${formatWaktuLokal(tgl, lok.timezone)}`;
  }

  if (el.placeholder) el.placeholder.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Template HTML konten utama
// ─────────────────────────────────────────────────────────────────────────────

function templateKonten() {
  return `
  <!-- F2: Kartu Indikator Risiko -->
  <section class="kartu kartu-risiko" id="kartu-risiko" aria-live="polite" aria-atomic="true">
    <div id="risiko-emoji" class="risiko-emoji" aria-hidden="true"></div>
    <div id="risiko-label" class="risiko-label"></div>
    <div class="risiko-sublabel">Risiko Kebakaran Lahan &amp; Gambut</div>
    <p id="risiko-penjelasan" class="risiko-penjelasan"></p>
  </section>

  <!-- F5: Banner Peringatan -->
  <aside id="banner-peringatan" class="banner-peringatan" aria-label="Peringatan dini cuaca BMKG">
    <div class="banner-judul">
      <span class="banner-ikon" aria-hidden="true">⚠️</span>
      <span id="banner-judul-teks">Peringatan Dini BMKG</span>
    </div>
    <p id="banner-deskripsi" class="banner-deskripsi"></p>
    <a id="banner-tautan" class="banner-tautan" href="#" target="_blank" rel="noopener noreferrer">
      Lihat detail peringatan →
    </a>
    <p id="banner-lebih" class="banner-lebih"></p>
  </aside>

  <!-- F3: Empat Angka Kunci -->
  <section class="kartu" aria-labelledby="judul-angka-kunci">
    <div class="angka-kunci" id="angka-kunci-section">
      <h2 id="judul-angka-kunci">Prakiraan 3 Hari ke Depan</h2>
      <div class="kartu-angka">
        <div class="angka-ikon" aria-hidden="true">🌡️</div>
        <div class="angka-nilai" id="nilai-suhu">—</div>
        <div class="angka-satuan">°C</div>
        <div class="angka-label">Suhu Maks</div>
      </div>
      <div class="kartu-angka">
        <div class="angka-ikon" aria-hidden="true">💧</div>
        <div class="angka-nilai" id="nilai-lembap">—</div>
        <div class="angka-satuan">%</div>
        <div class="angka-label">Kelembapan Min</div>
      </div>
      <div class="kartu-angka">
        <div class="angka-ikon" aria-hidden="true">🌧️</div>
        <div class="angka-nilai" id="nilai-hujan">—</div>
        <div class="angka-satuan">mm</div>
        <div class="angka-label">Total Hujan</div>
      </div>
      <div class="kartu-angka">
        <div class="angka-ikon" aria-hidden="true">💨</div>
        <div class="angka-nilai" id="nilai-angin">—</div>
        <div class="angka-satuan">km/jam</div>
        <div class="angka-label">Angin Maks</div>
      </div>
    </div>
  </section>

  <!-- F4: Grafik -->
  <section class="kartu kartu-grafik" aria-labelledby="judul-grafik">
    <h2 id="judul-grafik">Grafik Cuaca per 3 Jam</h2>
    <div class="grafik-wrap">
      <canvas id="grafik-cuaca" role="img" aria-label="Grafik suhu dan curah hujan 3 hari ke depan"></canvas>
    </div>
  </section>

  <!-- F4: Ringkasan 3 Hari -->
  <section class="kartu ringkasan-hari" aria-labelledby="judul-ringkasan">
    <h2 id="judul-ringkasan">Ringkasan Harian</h2>
    <div id="ringkasan-hari"></div>
  </section>

  <!-- F6: Saran Tindakan -->
  <section class="kartu saran-tindakan" aria-labelledby="judul-saran">
    <h2 id="judul-saran">💡 Saran Tindakan</h2>
    <ul id="saran-list"></ul>
  </section>

  <!-- F8: Tombol Bagikan -->
  <a id="tombol-bagikan" class="tombol-bagikan" href="#" target="_blank" rel="noopener noreferrer"
     aria-label="Bagikan ke WhatsApp">
    <span aria-hidden="true">📲</span> Bagikan ke WhatsApp
  </a>

  <!-- F7: Tautan Sumber Resmi -->
  <section class="kartu" aria-labelledby="judul-tautan-resmi">
    <h2 id="judul-tautan-resmi" style="font-size:1rem;color:var(--hijau);margin-bottom:.6rem">
      🔗 Sumber Resmi
    </h2>
    <nav aria-label="Tautan sumber resmi BMKG">
      <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:.4rem;">
        <li><a href="https://cuaca.bmkg.go.id" target="_blank" rel="noopener noreferrer"
               style="font-size:.875rem;color:var(--hijau)">⚡ Peringatan Dini Cuaca — BMKG</a></li>
        <li><a href="https://www.bmkg.go.id/cuaca/prakiraan-cuaca-indonesia.bmkg" target="_blank" rel="noopener noreferrer"
               style="font-size:.875rem;color:var(--hijau)">🌤️ Prakiraan Cuaca Indonesia — BMKG</a></li>
        <li><a href="https://sipongi.menlhk.go.id" target="_blank" rel="noopener noreferrer"
               style="font-size:.875rem;color:var(--hijau)">🔥 SiPongi — Pemantauan Karhutla KLHK</a></li>
        <li><a href="tentang.html" style="font-size:.875rem;color:var(--hijau)">ℹ️ Tentang metode indikator ini</a></li>
      </ul>
    </nav>
  </section>

  <!-- Waktu diperbarui -->
  <p id="info-diperbarui" class="info-diperbarui"></p>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render per komponen
// ─────────────────────────────────────────────────────────────────────────────

function renderRisiko(r, risiko) {
  if (!r.kartuRisiko) return;
  const info = risiko.info;

  // Reset kelas risiko lama
  r.kartuRisiko.className = `kartu kartu-risiko ${info.kelas_css}`;
  r.risikoEmoji.textContent     = info.emoji;
  r.risikoLabel.textContent     = info.label;
  r.risikoPenjelasan.textContent = risiko.penjelasanDinamis;

  // Tambahkan aria-label yang komprehensif untuk screen reader
  r.kartuRisiko.setAttribute('aria-label',
    `Status risiko kebakaran: ${info.label}. ${risiko.penjelasanDinamis}`);
}

function renderBannerPeringatan(r, peringatan, lok) {
  if (!r.bannerPeringatan || !peringatan) return;
  const items = peringatan.peringatan ?? [];
  if (items.length === 0) {
    r.bannerPeringatan.classList.remove('aktif');
    return;
  }
  const pertama = items[0];
  r.bannerPeringatan.classList.add('aktif');
  document.getElementById('banner-judul-teks').textContent = pertama.judul;
  document.getElementById('banner-deskripsi').textContent  =
    pertama.deskripsi.substring(0, 200) + (pertama.deskripsi.length > 200 ? '…' : '');
  const tautanEl = document.getElementById('banner-tautan');
  tautanEl.href = pertama.tautan;

  if (items.length > 1) {
    document.getElementById('banner-lebih').textContent =
      `+${items.length - 1} peringatan lain untuk wilayah ini`;
  }
}

function renderAngkaKunci(r, kunci) {
  const nilaiEl = (id, val, desimal = 0) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null ? val.toFixed(desimal) : '—';
  };
  nilaiEl('nilai-suhu',   kunci?.suhuMax,       0);
  nilaiEl('nilai-lembap', kunci?.kelembapanMin,  0);
  nilaiEl('nilai-hujan',  kunci?.totalHujan,     1);
  nilaiEl('nilai-angin',  kunci?.anginMax,       1);
}

function renderGrafik(r, prakiraan, ringkasan) {
  const canvas = document.getElementById('grafik-cuaca');
  if (!canvas || !prakiraan?.prakiraan) return;

  // Batasi ke 24 titik (3 hari × 8 titik) untuk keterbacaan
  const titik = prakiraan.prakiraan.slice(0, 24);
  const labels = titik.map(t => {
    // Format waktu lokal: "Sel 13:00"
    const d = new Date(t.dt_utc);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  });

  // Warnai titik berdasarkan curah hujan (biru jika hujan)
  const warnaBatang = titik.map(t =>
    (t.hujan ?? 0) > 0
      ? 'rgba(54, 162, 235, 0.7)'
      : 'rgba(224, 165, 38, 0.5)'
  );

  if (window._grafikInstance) {
    window._grafikInstance.destroy();
  }

  window._grafikInstance = new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Suhu (°C)',
          data: titik.map(t => t.suhu),
          borderColor: '#DC3545',
          backgroundColor: 'rgba(220,53,69,.1)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: 'Hujan (mm)',
          data: titik.map(t => t.hujan ?? 0),
          backgroundColor: warnaBatang,
          borderColor: 'rgba(54,162,235,.8)',
          borderWidth: 1,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.startsWith('Suhu')) return `Suhu: ${ctx.raw}°C`;
              return `Hujan: ${ctx.raw} mm`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 10, // jangan terlalu padat di 360px
          },
          grid: { display: false },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '°C', font: { size: 10 } },
          ticks: { font: { size: 10 } },
        },
        y2: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'mm', font: { size: 10 } },
          ticks: { font: { size: 10 } },
          grid: { drawOnChartArea: false },
          min: 0,
        },
      },
    },
  });
}

function renderRingkasanHari(r, ringkasan) {
  const wrap = document.getElementById('ringkasan-hari');
  if (!wrap || !ringkasan) return;
  wrap.innerHTML = ringkasan.map(h => `
    <div class="baris-hari">
      <span class="hari-label">${escHtml(h.label)}</span>
      <span class="hari-cuaca">${escHtml(h.cuacaDominan)}</span>
      <span class="hari-stats">
        ${h.suhuMin}–${h.suhuMax}°C &nbsp;|&nbsp;
        🌧️ ${h.totalHujan.toFixed(1)} mm
      </span>
    </div>
  `).join('');
}

function renderSaran(r, risiko) {
  const ul = document.getElementById('saran-list');
  if (!ul) return;
  ul.innerHTML = (risiko.info.saran ?? [])
    .map(s => `<li>${escHtml(s)}</li>`)
    .join('');
}

function renderTombolBagikan(r, lok) {
  const a = document.getElementById('tombol-bagikan');
  if (!a || !lok) return;
  const url  = `${location.origin}${location.pathname}?lokasi=${encodeURIComponent(lok.adm4)}`;
  const teks = `🔥 Cek status cuaca karhutla di ${lok.desa}, ${lok.kecamatan} (${lok.kotkab}):\n${url}\n\n_Data dari BMKG via PeatGuard Cuaca_`;
  a.href = `https://wa.me/?text=${encodeURIComponent(teks)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tampilkan pesan error
// ─────────────────────────────────────────────────────────────────────────────

export function tampilkanError(pesan, dataLama = null) {
  if (!el.kontenUtama) return;
  el.kontenUtama.innerHTML = `
    <div class="pesan-error" role="alert">
      <strong>⚠️ Gagal memuat data</strong>
      ${escHtml(pesan)}
      ${dataLama ? `<p class="pesan-stale">Menampilkan data terakhir yang tersedia.</p>` : ''}
    </div>
  `;
  el.kontenUtama.style.display = 'block';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pemilih Lokasi (F1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Isi dropdown provinsi dengan 5 provinsi Kalimantan.
 */
export function isiDropdownProvinsi(selectEl) {
  const provinsi = [
    { kode: '61', nama: 'Kalimantan Barat' },
    { kode: '62', nama: 'Kalimantan Tengah' },
    { kode: '63', nama: 'Kalimantan Selatan' },
    { kode: '64', nama: 'Kalimantan Timur' },
    { kode: '65', nama: 'Kalimantan Utara' },
  ];
  selectEl.innerHTML =
    `<option value="">— Pilih Provinsi —</option>` +
    provinsi.map(p => `<option value="${p.kode}">${escHtml(p.nama)}</option>`).join('');
}

/**
 * Isi dropdown kabupaten dari data wilayah provinsi.
 */
export function isiDropdownKabupaten(selectEl, wilayahProv) {
  selectEl.innerHTML =
    `<option value="">— Pilih Kabupaten/Kota —</option>` +
    wilayahProv.kabupaten
      .map(k => `<option value="${k.kode}">${escHtml(k.nama)}</option>`)
      .join('');
  selectEl.disabled = false;
}

/**
 * Isi dropdown kecamatan dari data kabupaten terpilih.
 */
export function isiDropdownKecamatan(selectEl, kabupaten) {
  selectEl.innerHTML =
    `<option value="">— Pilih Kecamatan —</option>` +
    kabupaten.kecamatan
      .map(k => `<option value="${k.kode}">${escHtml(k.nama)}</option>`)
      .join('');
  selectEl.disabled = false;
}

/**
 * Tampilkan daftar desa yang difilter berdasarkan kata kunci pencarian.
 */
export function tampilkanDaftarDesa(listEl, desa, kata) {
  const q = kata.toLowerCase().trim();
  const terfilter = q
    ? desa.filter(d => d.nama.toLowerCase().includes(q))
    : desa;

  listEl.innerHTML = terfilter.slice(0, 50) // batasi 50 hasil agar tidak berat
    .map(d => `
      <button type="button" data-adm4="${d.adm4}" aria-selected="false">
        ${escHtml(d.nama)}
      </button>
    `).join('');

  if (terfilter.length === 0) {
    listEl.innerHTML = `<div style="padding:.5rem .75rem;color:var(--teks-tipis);font-size:.875rem">Desa tidak ditemukan</div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Escape HTML untuk mencegah XSS saat menyisipkan teks ke innerHTML */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format tanggal ke waktu lokal yang mudah dibaca */
function formatWaktuLokal(tgl, timezone = 'Asia/Jakarta') {
  return tgl.toLocaleString('id-ID', {
    timeZone: timezone,
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Tampilkan/sembunyikan elemen */
export function setVisibel(el, visibel) {
  if (el) el.style.display = visibel ? '' : 'none';
}
