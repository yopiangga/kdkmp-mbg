.PHONY: install up down seed dev test collect geo build schedule schedule-list backup prod-up prod-logs

install:
	npm install

# Jalankan dengan Docker (backend :4000, frontend :5173)
up:
	docker compose up -d --build

down:
	docker compose down

# Bangun ulang tabel JSON di data/db dari data/seed (baris dari admin/collector dipertahankan)
seed:
	npm run seed

# Pengganti `make migrate` selama masih JSON: seed membuat semua tabel
migrate: seed

dev:
	npm run dev

test:
	npm test

# Contoh: make collect target=wilayah
collect:
	npm run collect -- $(target)

# Bangun GeoJSON batas wilayah dari data/raw/wilayah_boundaries
geo:
	npm run build-geo -w collector

build:
	npm run build

# Penjadwal collector (daemon) dan daftar jadwal (pengganti schedule:list)
schedule:
	npm run schedule

schedule-list:
	npm run schedule -- --list

backup:
	node scripts/backup.js

# Produksi (VPS)
prod-up:
	docker compose -f docker-compose.prod.yml up -d --build

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f --tail=100
