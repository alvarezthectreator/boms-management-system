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

Staff sign-in does not create or import sample guests, rooms, inventory, reviews, or finance records. Management screens display records returned by the configured database; an empty database stays empty until staff add real property data. Existing browser-cached prototype data is ignored.

## Staff authentication

Staff sign in with their work email and an individual password. Passwords use Node.js scrypt hashes; sessions use hashed, expiring database tokens in HttpOnly, SameSite cookies, and Secure cookies in production. The app does not lock out sign-in after failed attempts; deploy an edge-level rate limit to mitigate password guessing. Managers can create worker accounts and reset staff passwords from Team & settings; CEOs can create any role and control account status. Passwords must be at least 12 characters. Run `npm run setup:manager` to create or reset a manager account, or `npm run setup:admin` to reset an existing CEO account.

Production deployment still requires HTTPS at the public edge, a correctly configured reverse proxy, protected database/backups, monitoring, and an account recovery procedure. Set `NODE_ENV=production` and `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops so secure cookies and client-address throttling work correctly. The API binds to loopback by default. Review deployment access controls before exposing the service to the internet; this project has not undergone an independent security audit.

For Vercel serverless deployments backed by Supabase Postgres, configure `DATABASE_URL` with Supabase's **Transaction pooler** connection string (port `6543`), not the Session pooler. The server uses one PostgreSQL client per function instance to stay within Supabase's client limit; `PG_POOL_MAX` cannot increase this limit. Apply the `DATABASE_URL` configuration to Production and Preview environments as needed, then redeploy. Keep the connection string secret; never commit it or paste it into chat.

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
