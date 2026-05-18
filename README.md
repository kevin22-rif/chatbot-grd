# Guardian WhatsApp RAG Chatbot

Project ini dibuat untuk tugas kelompok di luar kelas:

1. Menampilkan 5 kategori: Kosmetik, Skincare, Personal Care, Health, dan Guardian Brand.
2. Dataset aktif yang sudah diisi adalah kategori Personal Care dari file `shopee.csv`.
3. Dashboard memakai tema Guardian dengan tampilan sederhana.
4. Chatbot WhatsApp menggunakan RAG sederhana berbasis CSV dan Groq API.
5. Disediakan tombol WhatsApp untuk setiap kategori.

## Cara Menjalankan

```bash
npm install
copy .env.example .env
npm start
```

Buka:

```text
http://localhost:3001
```

## File yang Perlu Diganti

- `.env`: isi `GROQ_API_KEY` dan `SHOP_WHATSAPP_NUMBER`.
- `config/shop.json`: ganti nama toko dan nomor WhatsApp jika tidak memakai `.env`.
- `data/*.csv`: isi dataset kategori lain jika anggota kelompok sudah punya data.

## Dataset

Dataset Personal Care sudah tersedia di:

```text
data/personal-care.csv
```

Kategori lain sudah dibuatkan template kosong:

```text
data/kosmetik.csv
data/skincare.csv
data/health.csv
data/guardian-brand.csv
```

## Catatan

Bot tidak boleh mengarang harga/stok jika data tersebut tidak ada di CSV. Kalau informasi tidak ditemukan, bot akan menjawab fallback response.
