
FROM node:16-alpine

# Buat direktori app
WORKDIR /usr/src/app

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Port yang akan diexpose
EXPOSE 8080

# Command untuk menjalankan aplikasi
ENV NODE_ENV=production
CMD ["npm", "start"]
```

Langkah-langkah:
1. Buat file `Dockerfile` di root repository GitHub Anda
2. Copy kode di atas ke dalam file tersebut
3. Commit dan push ke GitHub
4. Di Back4app:
   - Pilih repository Anda
   - Pilih branch yang akan dideploy
   - Klik deploy

Note:
- Pastikan di `package.json` Anda sudah ada script "start"
- Jika port aplikasi Anda bukan 8080, sesuaikan bagian `EXPOSE`
- Menggunakan node:16-alpine untuk image yang lebih ringan
- Sudah ditambahkan environment production

Apakah ada yang perlu disesuaikan lagi dengan aplikasi Anda?
