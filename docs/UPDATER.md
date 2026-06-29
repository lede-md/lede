# Updater signing

Generate a keypair once (keep the private key secret — store as CI secret
`TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`):

```bash
npm run tauri signer generate -- -w ~/.mdread/updater.key
```

Copy the printed public key into `tauri.conf.json` → `plugins.updater.pubkey`.
The release build (CI) signs the bundle; `tauri build` then emits
`latest.json` + signed artifacts uploaded to the GitHub Release.

## Key management

- **Private key (`updater.key`):** NEVER commit to the repository. Store locally
  in a gitignored location (e.g. `.superpowers/updater.key` — this directory is
  gitignored and will not be committed).
- **CI secret:** Add the private key content as the `TAURI_SIGNING_PRIVATE_KEY`
  secret in your GitHub repository settings (Settings → Secrets → Actions).
- **Optional password:** If you generated the key with a password, also add
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as a CI secret.

## GitHub release endpoint

Update the `OWNER` placeholder in `tauri.conf.json` → `plugins.updater.endpoints`:

```json
"https://github.com/OWNER/mdread/releases/latest/download/latest.json"
```

Replace `OWNER` with the actual GitHub username or organisation that owns the
`mdread` repository.

## Release process (manual / Task 17)

1. CI runs `tauri build` with `TAURI_SIGNING_PRIVATE_KEY` set.
2. The build emits `latest.json` and signed platform bundles.
3. Upload all artifacts (including `latest.json`) to the GitHub Release.
4. On next app launch the updater endpoint is checked; if a newer version exists
   the user is prompted to download and relaunch.

## Local key location (this machine)

The private key for this project was generated at:
`.superpowers/updater.key` (gitignored — local only, never committed)

The corresponding public key is embedded in `src-tauri/tauri.conf.json`
under `plugins.updater.pubkey`.
