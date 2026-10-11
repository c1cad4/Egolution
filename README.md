# Egolution — from Big Bang to ROBOTCYB

A buildless, full-window browser game for mouse, keyboard, phone and tablet. Seven forms: cosmic spark → molecule → cell → egg → creature → mind → ROBOTCYB. Collect light, avoid anomalies and pick free speed, resilience or collection-range adaptations. Fill ROBOTCYB's core to begin another universe. This is a fictional evolution story, not a scientific simulation.

## Run and test

Node.js 22+ for tests; Python 3 for the local static preview. No installation is needed.

```sh
npm test
npm start
```

Open http://127.0.0.1:8767/. Drag on the field with a finger or hold the mouse, or use WASD / arrow keys. Space pauses. Progress stays in this browser; signed-wallet shell ownership is stored on the server. EN, RU and Chinese are available. Audio starts only after pressing the sound button.

## Optional shells and payments

The complete journey is free. Crystal, Galaxy and Aurora shells cost 1,000 / 2,000 / 3,000 ROBOTCYB, respectively; they do not affect abilities. Preview before buying. Phantom and Solflare sign a one-use Ed25519 login challenge, then separately approve a quoted payment. Wallet webviews are supported through their injected provider. No redirect/deep-link login or X login is included.

Merchant: `ARxc7VD9vXBWLtrRxEGyM3cwRPmqxcWu6s9gjgUvzwwP`

ROBOTCYB mint: `8WZiguAp8NyFnwm8Z97k6sCbSRCWaW1YYXKeCTpupump` (classic SPL, 6 decimals). Network / token-account rent is additional SOL. The browser builds the exact quoted TransferChecked instruction plus a unique memo. The server checks finalized success, payer signature, memo, quote window, exact mint and net payer debit / merchant credit before granting a shell. Receipts cannot be reused. A pending receipt is persisted and verification can be retried without another payment. Keep the receipt in the wallet; blocked browser storage may prevent local pending-receipt recovery.

`public/commerce.js` is the canonical catalogue shared with `server/accounts.js`. No RPC credential is present in the frontend. The backend uses Cloudflare's existing private `SOLANA_RPC_URL` secret.

## Hosting integration

Frontend: https://cicadafarm.pages.dev/egolution/

Canonical source: https://github.com/c1cad4/Egolution

`public/` is mirrored into the CicadaFarm repository's `egolution/` directory for Cloudflare Pages. The account module is mirrored into `multiplayer/egolution/` in CicadaFarm and cicadafarm-game (adjusting the commerce import to `./commerce.js`). The existing Worker routes `/egolution/api/*` to a separate SQLite Durable Object `EGOLUTION_ACCOUNTS` / `EgolutionAccounts`, migration `v3`. Egolution and Swarm do not share sessions, ownership, receipts or merchants. Public status: `/egolution/health`.

Rendering is capped near 60 FPS during play, 10 FPS in dialogs / pause, suspended in hidden tabs and capped to 1.8 million canvas pixels. Particle counts are bounded. Actual performance depends on the device; browser viewport testing is not physical-device certification. This first version is single-player, with no tradable rewards or earnings.

## Assets

The original ROBOTCYB JPEG is provided by the project owner and copied without modification. Forms, backgrounds and particles are drawn in canvas. The optional wallet bundle is @solana/web3.js; its license is preserved in `public/vendor/SOLANA-LICENSE`. It loads only when confirming checkout.
