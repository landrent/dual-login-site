# Setup Supabase untuk Vercel

Aplikasi ini sekarang mendukung Supabase untuk deployment di Vercel. Ikuti langkah-langkah berikut:

## 1. Buat Supabase Project

1. Buka https://supabase.com
2. Login atau buat akun baru
3. Buat project baru
4. Tunggu project selesai diinisialisasi
5. Copy **Project URL** dan **API Key** (ada dua opsi: anon key atau service role key)

## 2. Setup Database Schema

1. Buka Dashboard Supabase → **SQL Editor**
2. Buat query baru
3. Copy-paste isi file `supabase_schema.sql` dari project ini
4. Jalankan query

## 3. Set Environment Variables di Vercel

1. Buka https://vercel.com dan login ke project
2. Buka **Settings** → **Environment Variables**
3. Tambahkan 2 variable baru:
   - `SUPABASE_URL`: Isi dengan Project URL dari Supabase
   - `SUPABASE_SERVICE_KEY`: Isi dengan service role key dari Supabase
   
   OR gunakan:
   - `SUPABASE_ANON_KEY`: Isi dengan anon key dari Supabase

## 4. Deploy ke Vercel

```bash
git add .
git commit -m "Add Supabase support"
git push
```

Vercel akan otomatis deploy dengan environment variables baru.

## 5. Test

- Buka aplikasi di Vercel URL
- Coba register akun baru
- Coba login dengan akun yang baru didaftarkan
- Data akan tersimpan di Supabase (bukan file JSON)

## Troubleshooting

### Error: "SUPABASE_URL not configured"
- Pastikan environment variables sudah diset di Vercel
- Tunggu beberapa menit setelah set environment variable untuk deploy ulang

### Error: "Akun sudah terdaftar" tapi tidak pernah register sebelumnya
- Mungkin ada data lama di Supabase
- Buka Supabase Dashboard → Table **accounts** dan hapus baris jika perlu

### Masih menggunakan file-based storage
- Server.js akan fallback ke file JSON jika Supabase tidak configured
- Pastikan `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY`/`SUPABASE_ANON_KEY` sudah set
