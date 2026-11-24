# BukuKas — pembukuan & kasir offline, tanpa langganan

Aplikasi Android (Rust + Tauri v2 + SQLite). Semua data tersimpan di HP, tanpa akun dan tanpa internet.

## Fitur
- **Beranda**: saldo kas & bank, laba bulan ini, piutang, hutang, grafik 6 bulan, stok menipis
- **Kas**: pemasukan, pengeluaran, transfer antar kas/bank (tambah / ubah / hapus)
- **Penjualan & Pembelian**: faktur multi-item, diskon, PPN, jatuh tempo, pembayaran sebagian/cicilan, piutang & hutang, cetak/PDF, salin teks
- **Kasir (POS)**: grid produk, keranjang, diskon, kembalian, struk
- **Produk & Stok**: harga beli/jual, HPP rata-rata, stok minimum, stok opname, kartu stok, jasa (tanpa stok)
- **Kontak**: pelanggan & pemasok
- **Akuntansi**: bagan akun bawaan, saldo awal, jurnal umum manual, jurnal otomatis dari semua transaksi
- **Aset tetap**: penyusutan garis lurus bulanan
- **Laporan**: Laba Rugi, Neraca, Arus Kas, Neraca Saldo, Buku Besar, Penjualan, Pembelian, Laba per Produk, Piutang, Hutang, Nilai Persediaan, Kartu Stok (ekspor CSV)
- **Pengaturan**: data usaha, PPN, mata uang, PIN kunci tampilan, backup/restore JSON

## Membuat APK (cara termudah, tanpa install apa pun)
1. Buat repository baru di GitHub (boleh private), unggah seluruh isi folder ini (termasuk folder `.github`).
2. Buka tab **Actions → Build APK → Run workflow**.
3. Tunggu ±15–30 menit, lalu unduh artifact **BukuKas-apk** → ekstrak → `BukuKas.apk`.
4. Salin ke HP, buka, izinkan "install dari sumber tidak dikenal".

## Build lokal
Jalankan `./build-android.sh` (butuh Rust, Node 20+, JDK 17, Android SDK + NDK 26).

## Tes
`npm test` menjalankan 16 tes logika akuntansi (jurnal seimbang, stok, HPP, piutang/hutang, backup, dll).

## Catatan
- `release.jks` (password `bukukas123`) dipakai menandatangani APK agar update bisa menimpa versi lama. Ganti bila ingin kunci pribadi.
- PIN hanya mengunci tampilan, data tidak dienkripsi.
- Backup rutin sangat disarankan (Menu → Backup & Restore).
