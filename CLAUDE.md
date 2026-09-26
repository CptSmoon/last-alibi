# Last Alibi / Last Stop, Simplon-Orient: working rules

Full context: `CONTEXT.md`. Setup and layout: `README.md` and `docs/`.

## After every push, deploy (you do it: there is no CI)
- The game is live at **https://simplon-orient.kaisspace.workers.dev** (Cloudflare Worker `simplon-orient`, personal account bd96kais@gmail.com, pinned by `account_id` in `wrangler.jsonc`).
- **Every time you push to `main`, run `npm run deploy` straight after.** There is no GitHub Actions workflow on purpose; do not add one.
- `npm run deploy` (`tools/deploy.mjs`) checks that wrangler is logged into the right account and deploys exactly the committed `HEAD` from a clean checkout, never uncommitted work from other sessions.
  If it says the account is wrong, stop and ask the user; never deploy to the Rowads "Extra Staging" account.
- Then check it's live: `curl -s https://simplon-orient.kaisspace.workers.dev/api/status` should return `"live":true`. Report the deployed commit (`wrangler deployments list` shows `git <hash>`).
- A change is not done until it is pushed **and** deployed.

## Deploy safety
- Only `dist/` is published, and `tools/build-web.mjs` builds it from an allow-list. Never add `scenario/`, `prompts/`, `server/`, `.env` or `.dev.vars` to it: the scenario holds the solution, `.env` the keys.
- The API keys live as Worker secrets (`wrangler secret put GEMINI_API_KEY` / `GRADIUM_API_KEY`). They survive deploys. Never print them, commit them, or put them in `wrangler.jsonc`.
- `worker/index.mjs` `/api/talk` duplicates `server/server.mjs` `talk()`. When you change how characters answer (inputs, events, the confession gate, tool validation), change both, then redeploy.
- A new client call to the API must use `(window.API_BASE || '') + '/api/...'`, so the itch.io build (`npm run build:itch`) keeps working.
- A new static folder the page needs must be referenced from `index.html`, or added to the allow-list in `tools/build-web.mjs`, or it won't be deployed.

## Runtime providers
The game runtime uses only Gemini (character brains, images) and Gradium (voice). Cloudflare is only the host.
