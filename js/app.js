/**
 * js/app.js — Entry point aplikasi PeatGuard Cuaca
 *
 * Orkestrasi: pemilih lokasi → fetch data → kalkulasi risiko → render UI.
 */

import { ambilPrakiraan, ambilPeringatan, muatWilayahProvinsi } from './api.js';
import {
  hitungRisiko,
  hitungAngkaKunci,
  ringkasanPerHari,
} from './risk.js';
import {
  el,
  isiDropdownProvinsi,
  isiDropdownKabupaten,
  isiDropdownKecamatan,
  tampilkanDaftarDesa,
  tampilkanSkeleton,
  renderKonten,
  tampilkanError,
  setVisibel,
} from './ui.js';
// ─────────────────────────────────────────────────────────────────────────────
// State aplikasi
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  wilayahProv:    null,  // data wilayah provinsi yang sedang aktif
  kabupatenAktif: null,  // objek kabupaten terpilih
  kecamatanAktif: null,  // objek kecamatan terpilih
  lokasiAktif:    null,  // { adm4, desa, kecamatan, kotkab, provinsi, timezone }
};

// ─────────────────────────────────────────────────────────────────────────────
// Inisialisasi
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // Isi dropdown provinsi
  isiDropdownProvinsi(el.selectProv);

  // Pasang event listeners
  el.selectProv?.addEventListener('change', onProvChanged);
  el.selectKab?.addEventListener('change',  onKabChanged);
  el.selectKec?.addEventListener('change',  onKecChanged);
  el.inputDesa?.addEventListener('input',   onInputDesa);
  el.daftarDesa?.addEventListener('click',  onDesaClick);

  // Cek URL ?lokasi= untuk deep link (F1)
  const params = new URLSearchParams(location.search);
  const lokasiParam = params.get('lokasi');
  if (lokasiParam && /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(lokasiParam)) {
    await muatLangsung(lokasiParam);
  }

  // Cek localStorage untuk lokasi terakhir
  else {
    const lokTerakhir = localStorage.getItem('peatguard_lokasi');
    if (lokTerakhir && /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(lokTerakhir)) {
      await muatLangsung(lokTerakhir);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Muat data berdasarkan adm4 langsung (dari URL atau localStorage)
// ─────────────────────────────────────────────────────────────────────────────

async function muatLangsung(adm4) {
  tampilkanSkeleton();
  try {
    const provKode = adm4.substring(0, 2);
    // Muat data wilayah provinsi dulu agar nama provinsi tersedia untuk filter peringatan
    if (!state.wilayahProv || state.wilayahProv.kode !== provKode) {
      state.wilayahProv = await muatWilayahProvinsi(provKode);
    }
    // Cari kecamatan dari adm4 agar filter peringatan lebih akurat
    const kabKode = adm4.substring(0, 5);
    const kecKode = adm4.substring(0, 8);
    const kab = state.wilayahProv?.kabupaten?.find(k => k.kode === kabKode);
    state.kabupatenAktif = kab ?? null;
    state.kecamatanAktif = kab?.kecamatan?.find(k => k.kode === kecKode) ?? null;

    // Sinkronkan dropdown (best-effort, tidak wajib berhasil)
    if (el.selectProv) el.selectProv.value = provKode;
    if (el.selectKab && kab) {
      isiDropdownKabupaten(el.selectKab, state.wilayahProv);
      el.selectKab.value = kabKode;
    }
    if (el.selectKec && state.kecamatanAktif) {
      isiDropdownKecamatan(el.selectKec, state.kabupatenAktif);
      el.selectKec.value = kecKode;
    }

    await muatData(adm4);
  } catch (err) {
    tampilkanError(err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event handlers pemilih lokasi
// ─────────────────────────────────────────────────────────────────────────────

async function onProvChanged() {
  const kode = el.selectProv.value;
  resetKecamatan();
  resetKabupaten();
  sembunyikanKonten();

  if (!kode) return;

  el.selectKab.disabled = true;
  el.selectKab.innerHTML = `<option>Memuat...</option>`;

  try {
    state.wilayahProv = await muatWilayahProvinsi(kode);
    isiDropdownKabupaten(el.selectKab, state.wilayahProv);
  } catch (err) {
    el.selectKab.innerHTML = `<option>Gagal memuat</option>`;
    console.error('Gagal muat wilayah:', err);
  }
}

function onKabChanged() {
  const kode = el.selectKab.value;
  resetKecamatan();
  sembunyikanKonten();

  if (!kode || !state.wilayahProv) return;

  state.kabupatenAktif = state.wilayahProv.kabupaten.find(k => k.kode === kode);
  if (state.kabupatenAktif) {
    isiDropdownKecamatan(el.selectKec, state.kabupatenAktif);
  }
}

function onKecChanged() {
  const kode = el.selectKec.value;
  sembunyikanKonten();

  if (!kode || !state.kabupatenAktif) {
    el.daftarDesa.innerHTML = '';
    el.inputDesa.value = '';
    return;
  }

  state.kecamatanAktif = state.kabupatenAktif.kecamatan.find(k => k.kode === kode);
  if (state.kecamatanAktif) {
    el.inputDesa.value = '';
    tampilkanDaftarDesa(el.daftarDesa, state.kecamatanAktif.desa, '');
  }
}

function onInputDesa() {
  if (!state.kecamatanAktif) return;
  tampilkanDaftarDesa(el.daftarDesa, state.kecamatanAktif.desa, el.inputDesa.value);
}

async function onDesaClick(e) {
  const btn = e.target.closest('button[data-adm4]');
  if (!btn) return;

  const adm4 = btn.dataset.adm4;
  const namaDesa = btn.textContent.trim();

  // Highlight pilihan aktif
  el.daftarDesa.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', 'false'));
  btn.setAttribute('aria-selected', 'true');

  // Update input teks
  el.inputDesa.value = namaDesa;

  // Simpan ke localStorage
  localStorage.setItem('peatguard_lokasi', adm4);

  // Update URL tanpa reload (deep link F1)
  const url = new URL(location.href);
  url.searchParams.set('lokasi', adm4);
  history.replaceState(null, '', url);

  // Muat data
  tampilkanSkeleton();
  try {
    await muatData(adm4);
  } catch (err) {
    tampilkanError(err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Muat dan render data cuaca
// ─────────────────────────────────────────────────────────────────────────────

async function muatData(adm4) {
  // Ambil prakiraan dulu untuk mendapatkan nama kecamatan dan provinsi yang akurat
  let dataPrakiraan;
  try {
    dataPrakiraan = await ambilPrakiraan(adm4);
  } catch (err) {
    throw new Error(err.message ?? 'Gagal mengambil prakiraan cuaca.');
  }

  const lokasi = dataPrakiraan.lokasi;

  // Ambil peringatan secara paralel setelah tahu nama lokasi
  let dataPeringatan = { peringatan: [], total: 0 };
  try {
    dataPeringatan = await ambilPeringatan(lokasi.provinsi, lokasi.kecamatan);
  } catch {
    // Peringatan gagal tidak menghentikan tampilan — tampilkan tanpa banner
    console.warn('Peringatan dini tidak berhasil dimuat.');
  }

  const perHari   = dataPrakiraan.per_hari;
  const titikFlat = dataPrakiraan.prakiraan;
  const risiko    = hitungRisiko(titikFlat);
  const kunci     = hitungAngkaKunci(perHari);
  const ringkasan = ringkasanPerHari(perHari, lokasi.timezone);

  // Update label lokasi terpilih di atas form
  if (el.lokasiTerpilih) {
    el.lokasiTerpilih.textContent =
      `📍 ${lokasi.desa}, ${lokasi.kecamatan}, ${lokasi.kotkab}`;
  }

  state.lokasiAktif = { ...lokasi, adm4 };

  renderKonten({
    risiko,
    kunci,
    ringkasan,
    prakiraan:      dataPrakiraan,
    peringatan:     dataPeringatan,
    lokasiTerpilih: state.lokasiAktif,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers reset state
// ─────────────────────────────────────────────────────────────────────────────

function resetKabupaten() {
  el.selectKab.innerHTML = `<option value="">— Pilih Kabupaten/Kota —</option>`;
  el.selectKab.disabled = true;
  state.kabupatenAktif = null;
}

function resetKecamatan() {
  el.selectKec.innerHTML = `<option value="">— Pilih Kecamatan —</option>`;
  el.selectKec.disabled = true;
  el.daftarDesa.innerHTML = '';
  el.inputDesa.value = '';
  state.kecamatanAktif = null;
}

function sembunyikanKonten() {
  if (el.kontenUtama) el.kontenUtama.innerHTML = '';
  if (el.placeholder) el.placeholder.style.display = 'block';
  state.lokasiAktif = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
