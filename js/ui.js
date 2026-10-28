/**
 * js/ui.js — Manipulasi DOM dan render komponen UI
 *
 * Modul ini menampilkan:
 * - F2 & F12: Dua kartu terpisah (Risiko Cuaca BMKG & Hotspot Satelit NASA)
 * - F12: Pesan perhatian gabungan (jika cuaca SEDANG/TINGGI & hotspot <= 5 km)
 * - F10: Rincian radius hotspot NASA FIRMS (5 km, 10 km, 25 km, jarak terdekat)
 * - F11: Peta mini Leaflet interaktif lazy-loaded dengan legenda umur deteksi
 * - F3: 4 angka kunci cuaca
 * - F4: Grafik per 3 jam & ringkasan harian
 * - F5: Banner peringatan dini BMKG
 * - F6: Saran tindakan
 * - F7 & F8: Tautan sumber resmi & tombol share WhatsApp
 */

import { LEVEL_INFO } from './risk.js';

// ─────────────────────────────────────────────────────────────────────────────
// Elemen DOM
// ─────────────────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);

export const el = {
  selectProv:     $('#select-provinsi'),
  selectKab:      $('#select-kabupaten'),
  selectKec:      $('#select-kecamatan'),
  inputDesa:      $('#input-desa'),
  daftarDesa:     $('#daftar-desa'),
  lokasiTerpilih: $('#lokasi-terpilih'),
  kontenUtama:    $('#konten-utama'),
  placeholder:    $('#placeholder-pilih'),
};

// Variable penampung instance peta Leaflet (agar tidak dobel init)
let petaInstance = null;

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton / Loading State
// ─────────────────────────────────────────────────────────────────────────────

export function tampilkanSkeleton() {
  if (!el.kontenUtama) return;
  el.kontenUtama.style.display = 'flex';
  el.kontenUtama.style.flexDirection = 'column';
  el.kontenUtama.style.gap = '1rem';
  if (el.placeholder) el.placeholder.style.display = 'none';

  el.kontenUtama.innerHTML = `
    <div class="grid-dua-kartu">
      <div class="kartu">
        <div class="skeleton skeleton-besar" style="width:60%;margin:0 auto"></div>
        <div class="skeleton skeleton-teks" style="width:80%;margin:.5rem auto"></div>
      </div>
      <div class="kartu">
        <div class="skeleton skeleton-besar" style="width:60%;margin:0 auto"></div>
        <div class="skeleton skeleton-teks" style="width:80%;margin:.5rem auto"></div>
      </div>
    </div>
    <div class="kartu angka-kunci">
      ${[1,2,3,4].map(() => `<div class="kartu-angka"><div class="skeleton skeleton-besar"></div></div>`).join('')}
    </div>
    <div class="kartu"><div class="skeleton skeleton-grafik"></div></div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Semua Komponen
// ─────────────────────────────────────────────────────────────────────────────

export function renderKonten({ risiko, kunci, ringkasan, prakiraan, peringatan, hotspot, lokasiTerpilih: lok }) {
  if (!el.kontenUtama) return;

  el.kontenUtama.style.display = 'flex';
  el.kontenUtama.style.flexDirection = 'column';
  el.kontenUtama.style.gap = '1rem';
  el.kontenUtama.innerHTML = templateKonten();

  const r = {
    kartuRisiko:       $('#kartu-risiko'),
    risikoEmoji:       $('#risiko-emoji'),
    risikoLabel:       $('#risiko-label'),
    risikoPenjelasan:  $('#risiko-penjelasan'),
    bannerPeringatan:  $('#banner-peringatan'),
    angkaKunci:        $('#angka-kunci-section'),
    ringkasanHari:     $('#ringkasan-hari'),
    saranList:         $('#saran-list'),
    tombolBagikan:     $('#tombol-bagikan'),
    infoUpdate:        $('#info-diperbarui'),
    grafik:            $('#grafik-cuaca'),
    // Modul Hotspot
    kartuHotspot:      $('#kartu-hotspot'),
    hotspotAngka:      $('#hotspot-angka'),
    hotspotPenjelasan: $('#hotspot-penjelasan'),
    hotspotMeta:       $('#hotspot-meta'),
    hotspotR5:         $('#hotspot-r5'),
    hotspotR10:        $('#hotspot-r10'),
    hotspotR25:        $('#hotspot-r25'),
    perhatianGabungan: $('#perhatian-gabungan'),
  };

  // 1. F2: Kartu Risiko Cuaca BMKG
  renderRisiko(r, risiko);

  // 2. F10 & F12: Kartu Hotspot NASA FIRMS & Perhatian Gabungan
  renderHotspot(r, hotspot, lok, risiko);

  // 3. F11: Peta Mini Leaflet
  renderPeta(lok, hotspot);

  // 4. F5: Banner Peringatan Dini BMKG
  renderBannerPeringatan(r, peringatan, lok);

  // 5. F3: 4 Angka Kunci Cuaca
  renderAngkaKunci(r, kunci);

  // 6. F4: Grafik & Ringkasan Harian
  renderGrafik(r, prakiraan, ringkasan);
  renderRingkasanHari(r, ringkasan);

  // 7. F6: Saran Tindakan
  renderSaran(r, risiko);

  // 8. F7 & F8: Tautan & Bagikan
  renderTombolBagikan(r, lok, hotspot, risiko);

  // Waktu pembaruan cuaca
  if (r.infoUpdate && prakiraan?.diperbarui) {
    const tgl = new Date(prakiraan.diperbarui);
    r.infoUpdate.textContent = `Data cuaca BMKG diperbarui: ${formatWaktuLokal(tgl, lok.timezone)}`;
  }

  if (el.placeholder) el.placeholder.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Template HTML Konten Utama
// ─────────────────────────────────────────────────────────────────────────────

function templateKonten() {
  return `
  <!-- F12: Dua Kartu Terpisah (BMKG Cuaca & NASA Hotspot) -->
  <div class="grid-dua-kartu">
    <!-- Kartu Cuaca BMKG -->
    <section class="kartu kartu-risiko" id="kartu-risiko" aria-live="polite" aria-atomic="true">
      <div style="font-size:.75rem;font-weight:700;color:var(--teks-tipis);text-transform:uppercase;margin-bottom:.25rem">
        Cuaca Mendukung Karhutla (BMKG)
      </div>
      <div id="risiko-emoji" class="risiko-emoji" aria-hidden="true"></div>
      <div id="risiko-label" class="risiko-label"></div>
      <div class="risiko-sublabel">Risiko Kebakaran Gambut</div>
      <p id="risiko-penjelasan" class="risiko-penjelasan"></p>
    </section>

    <!-- F10: Kartu Hotspot Satelit NASA -->
    <section class="kartu kartu-hotspot" id="kartu-hotspot" aria-live="polite" aria-atomic="true">
      <div>
        <div class="hotspot-header">
          <h2>🔥 Hotspot Sekitar</h2>
          <span class="hotspot-badge-sumber">NASA FIRMS</span>
        </div>
        <div class="hotspot-angka-utama" id="hotspot-angka">—</div>
        <div style="font-size:.8rem;font-weight:600;color:#B25900">titik panas radius 10 km</div>
        
        <div class="hotspot-rincian-radius">
          <div class="hotspot-ring">
            <div class="hotspot-ring-angka" id="hotspot-r5">0</div>
            <div class="hotspot-ring-label">≤ 5 km</div>
          </div>
          <div class="hotspot-ring">
            <div class="hotspot-ring-angka" id="hotspot-r10">0</div>
            <div class="hotspot-ring-label">≤ 10 km</div>
          </div>
          <div class="hotspot-ring">
            <div class="hotspot-ring-angka" id="hotspot-r25">0</div>
            <div class="hotspot-ring-label">≤ 25 km</div>
          </div>
        </div>

        <p class="hotspot-keterangan" id="hotspot-penjelasan"></p>
      </div>

      <div class="hotspot-meta" id="hotspot-meta"></div>
    </section>
  </div>

  <!-- F12: Pesan Perhatian Gabungan (BMKG + NASA) -->
  <aside id="perhatian-gabungan" class="perhatian-gabungan" role="alert">
    <div class="perhatian-judul">
      <span aria-hidden="true">🚨</span>
      <span>Perlu Perhatian Khusus</span>
    </div>
    <p class="perhatian-teks">
      Ada hotspot terdeteksi di dekat lokasi (≤ 5 km) dan kondisi cuaca mendukung api menyebar.
      Segera cek kondisi lapangan dan hubungi BPBD / Masyarakat Peduli Api (MPA) bila terlihat asap atau api.
    </p>
  </aside>

  <!-- F11: Peta Mini Hotspot & Lokasi Desa (Leaflet) -->
  <section class="kartu kartu-peta" aria-labelledby="judul-peta">
    <div class="kartu-peta-header">
      <h2 id="judul-peta">🗺️ Peta Hotspot di Sekitar Desa</h2>
      <span style="font-size:.75rem;color:var(--teks-tipis)">Radius s/d 50 km</span>
    </div>
    
    <div id="peta-hotspot" role="region" aria-label="Peta sebaran hotspot di sekitar lokasi desa"></div>
    
    <div class="peta-legenda" aria-label="Legenda peta">
      <div class="legenda-item">
        <span class="legenda-dot desa" aria-hidden="true"></span>
        <span>Lokasi Desa</span>
      </div>
      <div class="legenda-item">
        <span class="legenda-dot merah" aria-hidden="true"></span>
        <span>0–6 jam lalu</span>
      </div>
      <div class="legenda-item">
        <span class="legenda-dot oranye" aria-hidden="true"></span>
        <span>6–24 jam lalu</span>
      </div>
      <div class="legenda-item">
        <span class="legenda-dot kuning" aria-hidden="true"></span>
        <span>24–48 jam lalu</span>
      </div>
    </div>
  </section>

  <!-- F5: Banner Peringatan Dini BMKG -->
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
      <h2 id="judul-angka-kunci">Prakiraan 3 Hari ke Depan (BMKG)</h2>
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

  <!-- F4: Grafik Cuaca 3 Jam -->
  <section class="kartu kartu-grafik" aria-labelledby="judul-grafik">
    <h2 id="judul-grafik">Grafik Cuaca per 3 Jam (BMKG)</h2>
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
    <nav aria-label="Tautan sumber resmi BMKG dan NASA">
      <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:.4rem;">
        <li><a href="https://cuaca.bmkg.go.id" target="_blank" rel="noopener noreferrer"
               style="font-size:.875rem;color:var(--hijau)">⚡ Peringatan Dini Cuaca — BMKG</a></li>
        <li><a href="https://firms.modaps.eosdis.nasa.gov" target="_blank" rel="noopener noreferrer"
               style="font-size:.875rem;color:var(--hijau)">🛰️ NASA FIRMS (Fire Information for Resource Management System)</a></li>
        <li><a href="https://sipongi.menlhk.go.id" target="_blank" rel="noopener noreferrer"
               style="font-size:.875rem;color:var(--hijau)">🔥 SiPongi — Pemantauan Karhutla KLHK</a></li>
        <li><a href="tentang.html" style="font-size:.875rem;color:var(--hijau)">ℹ️ Metodologi, Hubungan Sensor PeatGuard &amp; Batasan</a></li>
      </ul>
    </nav>
  </section>

  <!-- Waktu diperbarui -->
  <p id="info-diperbarui" class="info-diperbarui"></p>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Per Komponen
// ─────────────────────────────────────────────────────────────────────────────

function renderRisiko(r, risiko) {
  if (!r.kartuRisiko) return;
  const info = risiko.info;

  r.kartuRisiko.className = `kartu kartu-risiko ${info.kelas_css}`;
  r.risikoEmoji.textContent      = info.emoji;
  r.risikoLabel.textContent      = info.label;
  r.risikoPenjelasan.textContent = risiko.penjelasanDinamis;

  r.kartuRisiko.setAttribute('aria-label',
    `Status risiko kebakaran lahan: ${info.label}. ${risiko.penjelasanDinamis}`);
}

function renderHotspot(r, hotspot, lok, risiko) {
  if (!r.kartuHotspot) return;

  const ringkasan = hotspot?.ringkasan || { radius_5km: 0, radius_10km: 0, radius_25km: 0 };
  const r5  = ringkasan.radius_5km || 0;
  const r10 = ringkasan.radius_10km || 0;
  const r25 = ringkasan.radius_25km || 0;

  if (r.hotspotR5)  r.hotspotR5.textContent  = r5;
  if (r.hotspotR10) r.hotspotR10.textContent = r10;
  if (r.hotspotR25) r.hotspotR25.textContent = r25;

  if (r.hotspotAngka) {
    r.hotspotAngka.textContent = r10;
  }

  // Teks penjelasan jujur sesuai spesifikasi
  if (r.hotspotPenjelasan) {
    if (r10 === 0) {
      r.hotspotPenjelasan.textContent =
        'Satelit tidak mendeteksi hotspot di sekitar lokasi ini dalam 24 jam terakhir. ' +
        'Ini bukan jaminan tidak ada api: satelit hanya melintas beberapa kali sehari, dan awan atau asap tebal dapat menghalangi deteksi.';
    } else {
      r.hotspotPenjelasan.textContent =
        `Satelit mendeteksi ${r10} hotspot dalam radius 10 km (terdekat: ${ringkasan.jarak_terdekat_km ?? '—'} km). ` +
        'Hotspot adalah titik panas dari satelit, belum tentu api. Periksa kondisi lapangan dan laporkan asap atau api ke BPBD setempat.';
    }
  }

  // Meta pembaruan & satelit
  if (r.hotspotMeta) {
    const waktuTeks = hotspot?.diperbarui
      ? formatWaktuLokal(new Date(hotspot.diperbarui), lok?.timezone)
      : 'Baru saja';
    r.hotspotMeta.innerHTML = `
      Data NASA FIRMS (hampir real-time, tertunda s/d beberapa jam).<br>
      Terakhir diperbarui: <strong>${escHtml(waktuTeks)}</strong>.
    `;
  }

  // F12: Tampilkan pesan perhatian gabungan bila r5 >= 1 DAN cuaca SEDANG/TINGGI
  if (r.perhatianGabungan) {
    const cuacaMendukung = risiko?.level === 'SEDANG' || risiko?.level === 'TINGGI';
    if (r5 >= 1 && cuacaMendukung) {
      r.perhatianGabungan.classList.add('aktif');
    } else {
      r.perhatianGabungan.classList.remove('aktif');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F11: Render Peta Mini Leaflet (Lazy-loaded)
// ─────────────────────────────────────────────────────────────────────────────

function renderPeta(lok, hotspot) {
  const container = document.getElementById('peta-hotspot');
  if (!container || !window.L) return;

  const lat = lok.lat || 0;
  const lon = lok.lon || 109.3;

  // Hancurkan map sebelumnya jika sudah ada
  if (petaInstance) {
    petaInstance.remove();
    petaInstance = null;
  }

  // Inisialisasi peta berpusat pada koordinat desa terpilih
  petaInstance = window.L.map('peta-hotspot', {
    center: [lat, lon],
    zoom: 11,
    scrollWheelZoom: false, // mencegah scroll halaman terganggu
  });

  // Base map OpenStreetMap lengkap dengan atribusi resmi
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | NASA FIRMS',
  }).addTo(petaInstance);

  // 1. Marker Desa
  const desaIcon = window.L.divIcon({
    className: 'desa-marker',
    html: `<div style="background:#1F4D3A;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.3);border:2px solid #fff">📍 ${escHtml(lok.desa)}</div>`,
    iconSize: [80, 24],
    iconAnchor: [40, 12],
  });

  window.L.marker([lat, lon], { icon: desaIcon })
    .addTo(petaInstance)
    .bindPopup(`<strong>${escHtml(lok.desa)}</strong><br>${escHtml(lok.kecamatan)}, ${escHtml(lok.kotkab)}`);

  // 2. Lingkaran Radius Transparan (5 km, 10 km, 25 km)
  window.L.circle([lat, lon], {
    radius: 5000,
    color: '#DC3545',
    fillColor: '#DC3545',
    fillOpacity: 0.05,
    weight: 1,
    dashArray: '4, 4',
  }).addTo(petaInstance);

  window.L.circle([lat, lon], {
    radius: 10000,
    color: '#FF8C00',
    fillColor: '#FF8C00',
    fillOpacity: 0.03,
    weight: 1,
    dashArray: '4, 4',
  }).addTo(petaInstance);

  window.L.circle([lat, lon], {
    radius: 25000,
    color: '#1F4D3A',
    fillColor: '#1F4D3A',
    fillOpacity: 0.02,
    weight: 1,
  }).addTo(petaInstance);

  // 3. Titik Hotspot Satelit (warna menurut umur deteksi)
  const titikList = hotspot?.hotspots || [];

  titikList.forEach(h => {
    let warna = '#FFD700'; // kuning (>24 jam)
    let labelUmur = '24–48 jam lalu';

    if (h.umur_jam <= 6) {
      warna = '#E60000'; // merah terang (0-6 jam)
      labelUmur = `${h.umur_jam} jam lalu (Sangat baru)`;
    } else if (h.umur_jam <= 24) {
      warna = '#FF8C00'; // oranye (6-24 jam)
      labelUmur = `${h.umur_jam} jam lalu`;
    }

    const circleMarker = window.L.circleMarker([h.lat, h.lon], {
      radius: 6,
      fillColor: warna,
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85,
    }).addTo(petaInstance);

    const waktuLokal = formatWaktuLokal(new Date(h.iso_utc), lok?.timezone);

    circleMarker.bindPopup(`
      <div style="font-size:12px;line-height:1.4">
        <strong>🔥 Hotspot Satelit (${escHtml(h.satellite || 'VIIRS')})</strong><br>
        Jarak ke desa: <strong>${h.jarak_km} km</strong><br>
        Waktu deteksi: ${waktuLokal} (${labelUmur})<br>
        Intensitas (FRP): ${h.frp} MW<br>
        Kepercayaan: ${h.confidence === 'h' ? 'Tinggi' : 'Sedang'}
      </div>
    `);
  });

  // Pastikan Leaflet menghitung ulang ukuran kontainer setelah render
  setTimeout(() => {
    petaInstance?.invalidateSize();
  }, 200);
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
  const judulEl = document.getElementById('banner-judul-teks');
  if (judulEl) judulEl.textContent = pertama.judul;
  const descEl = document.getElementById('banner-deskripsi');
  if (descEl) {
    descEl.textContent = pertama.deskripsi.substring(0, 200) + (pertama.deskripsi.length > 200 ? '…' : '');
  }
  const tautanEl = document.getElementById('banner-tautan');
  if (tautanEl) tautanEl.href = pertama.tautan;

  const lebihEl = document.getElementById('banner-lebih');
  if (lebihEl && items.length > 1) {
    lebihEl.textContent = `+${items.length - 1} peringatan lain untuk wilayah ini`;
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
  if (!canvas || !prakiraan?.prakiraan || !window.Chart) return;

  const titik = prakiraan.prakiraan.slice(0, 24);
  const labels = titik.map(t => {
    const d = new Date(t.dt_utc);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  });

  const warnaBatang = titik.map(t =>
    (t.hujan ?? 0) > 0
      ? 'rgba(54, 162, 235, 0.7)'
      : 'rgba(224, 165, 38, 0.5)'
  );

  if (window._grafikInstance) {
    window._grafikInstance.destroy();
  }

  window._grafikInstance = new window.Chart(canvas, {
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
            maxTicksLimit: 10,
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

function renderTombolBagikan(r, lok, hotspot, risiko) {
  const a = document.getElementById('tombol-bagikan');
  if (!a || !lok) return;
  const url  = `${location.origin}${location.pathname}?lokasi=${encodeURIComponent(lok.adm4)}`;
  const hs10 = hotspot?.ringkasan?.radius_10km ?? 0;
  const levelRisiko = risiko?.level || 'PEMANTAUAN';
  const emojiRisiko = risiko?.info?.emoji || '🟢';
  const terdekatTeks = hotspot?.ringkasan?.jarak_terdekat_km
    ? ` (terdekat: ${hotspot.ringkasan.jarak_terdekat_km} km)`
    : '';

  const teks = `🔥 *Laporan Cuaca & Hotspot — ${lok.desa}*\n` +
               `Kec. ${lok.kecamatan}, ${lok.kotkab}\n\n` +
               `• Cuaca Karhutla: ${emojiRisiko} *${levelRisiko}*\n` +
               `• Hotspot NASA (radius 10 km): *${hs10} titik*${terdekatTeks}\n\n` +
               `Pantau peta & prakiraan lengkap:\n${url}\n\n` +
               `_Sumber: BMKG & NASA FIRMS via PeatGuard Cuaca_`;
  a.href = `https://wa.me/?text=${encodeURIComponent(teks)}`;
}

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

export function isiDropdownKabupaten(selectEl, wilayahProv) {
  selectEl.innerHTML =
    `<option value="">— Pilih Kabupaten/Kota —</option>` +
    wilayahProv.kabupaten
      .map(k => `<option value="${k.kode}">${escHtml(k.nama)}</option>`)
      .join('');
  selectEl.disabled = false;
}

export function isiDropdownKecamatan(selectEl, kabupaten) {
  selectEl.innerHTML =
    `<option value="">— Pilih Kecamatan —</option>` +
    kabupaten.kecamatan
      .map(k => `<option value="${k.kode}">${escHtml(k.nama)}</option>`)
      .join('');
  selectEl.disabled = false;
}

export function tampilkanDaftarDesa(listEl, desa, kata) {
  const q = kata.toLowerCase().trim();
  const terfilter = q
    ? desa.filter(d => d.nama.toLowerCase().includes(q))
    : desa;

  listEl.innerHTML = terfilter.slice(0, 50)
    .map(d => `
      <button type="button" data-adm4="${d.adm4}" aria-selected="false">
        ${escHtml(d.nama)}
      </button>
    `).join('');

  if (terfilter.length === 0) {
    listEl.innerHTML = `<div style="padding:.5rem .75rem;color:var(--teks-tipis);font-size:.875rem">Desa tidak ditemukan</div>`;
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWaktuLokal(tgl, timezone = 'Asia/Jakarta') {
  return tgl.toLocaleString('id-ID', {
    timeZone: timezone,
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function setVisibel(el, visibel) {
  if (el) el.style.display = visibel ? '' : 'none';
}
