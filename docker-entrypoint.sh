#!/bin/sh
set -eu

for migration in drizzle/*.sql; do
  [ -f "$migration" ] || continue
  marker="/data/.nourish-$(basename "$migration").applied"
  [ -f "$marker" ] && continue
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to /data --file "$migration"
  touch "$marker"
done

exec node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to /data --ip 0.0.0.0 --port 3000
