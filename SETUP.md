# Running Moments

## Locally, with no accounts

    npm install
    npm run dev     # http://localhost:8930, data is lost when it stops
    npm test        # database and access-rule tests

`tools/dev-server.mjs` stands in for Supabase and replaces `dist/config.js` while it runs.
Phones cannot reach localhost, so use "Use this computer instead" for selfies.

## With Supabase

1. Create a project and run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Put the project URL and anon key in `dist/config.js`. Never use the service_role key.
3. Under Authentication → URL Configuration, set the site URL and add `<site>/**` as a redirect.
4. Host `dist/` (for example on Cloudflare Pages, no build step). HTTPS is needed for cameras.

## Live test site

https://moments-dcj.pages.dev, on Cloudflare Pages project `moments`.
To redeploy after `npx wrangler login`: `npm run deploy`.

The face match threshold is `match_distance` in `private.settings`. Lower is stricter.
