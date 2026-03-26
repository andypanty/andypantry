# Andy Pantry Static Site Draft

This folder contains publishable static drafts for:

- `index.html`
- `support.html`
- `privacy.html`

Before publishing, update `config.js` with:

- `supportEmail`
- `homepageUrl`
- `chromeStoreUrl`

Useful commands:

- `npm run site:bundle`
- `npm run preflight:site`
- `npm run site:preview`
- `npm run site:open`
- `npm run fill:launch-values -- --support-email=... --homepage-url=... --chrome-store-url=...`

Recommended order:

1. `npm run fill:launch-values -- --dry-run ...`
2. `npm run fill:launch-values -- ...`
3. `npm run preflight:site`
4. `npm run site:preview`
5. `npm run site:open`
6. `npm run site:bundle`

Then host the folder on any static hosting platform and copy the final URLs back into the business docs.
