# Boms Apartment Management System

The React/Tailwind frontend is in `boms-apartment-react/`. The original UI and feature specification are retained at the repository root.

## Run the frontend

```sh
cd boms-apartment-react
npm install
npm run dev
```

The dev command starts the Vite app at `http://localhost:5173/` and the Express API on port `3001`. Rooms, reservations, payments, housekeeping, inventory, purchasing, F&B, guest messages, concierge requests, team directory, property rules, server-audited operational changes, and daily closes use `data/boms.sqlite`. Admins can upload JPG, PNG, or WebP room photos (up to 5 MB) or use an HTTPS image URL. A room needs a nightly rate before it can be reserved.

Checkout defaults to 12:00 p.m. Lagos time. From 11:30 a.m., workers and managers see a dashboard and bell reminder for checked-in departures that day, including a shortcut to the housekeeping board. After 1:00 p.m., workers also see an overdue-checkout alert with a direct guest call link.

Older demo reservations are still browser-local because their room identifiers do not match the current database rooms. Financial totals exclude those records and use persisted hotel and direct F&B transactions only. Sample reviews whose booking records do not exist are not imported. Other prototype-only screens may still use browser-local data.

The sign-in and role selector remain preview controls, not production authentication or server-side identity management. Do not use this build to protect real staff accounts or sensitive guest data until authenticated sessions and server-enforced permissions are implemented.

## Database safeguards

Create a consistent SQLite snapshot and verify its integrity:

```sh
cd boms-apartment-react
npm run db:backup
```

Restore only while the app/API is stopped. The restore command requires `--yes`, verifies the backup, and creates a verified `pre-restore-*.sqlite` copy of the current database under `data/backups/` before replacing it:

```sh
npm run db:restore -- /path/to/boms-backup.sqlite --yes
```

Backups contain guest and financial data; store them securely and keep them out of source control. These commands back up the database only. Back up `public/room-images/` separately. `BOMS_DB_PATH` and `BOMS_BACKUP_DIR` can override the default database and backup locations.

## Checks

```sh
cd boms-apartment-react
npm run lint
npm run build
npm test
```

See [the functions specification](Boms%20Apartment_%20functions%20document.html) for the planned workflows and business rules.

See [the food, beverage, and weekly reporting requirements](Boms%20Apartment%20-%20food%20inventory%20and%20reporting%20features.md) for the next restaurant and accounting features to build.