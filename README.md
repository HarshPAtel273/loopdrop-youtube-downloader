# Loopdrop

A polished local YouTube downloader side project. Paste a link, preview the video, choose 1080p, 720p, 480p, or MP3, and save it to your normal Downloads folder.

## Run it

```bash
npm install
npm start
```

Then open [http://localhost:4173](http://localhost:4173).

`npm install` downloads a checksum-verified `yt-dlp` binary and bundles FFmpeg and Node.js for YouTube's JavaScript challenges. Nothing is installed globally. Existing `yt-dlp` binaries are updated when a newer stable release is available.

## Scripts

- `npm run dev` — run with Node's watch mode
- `npm run update:downloader` — check for and install the latest stable `yt-dlp`
- `npm run package` and `npm run dmg` — build a versioned macOS desktop installer (Apple Silicon)
- `npm test` — run the focused server and validation tests
- `npm run check` — syntax-check the server, setup, desktop, and browser code

## Guardrails

- YouTube URLs only; arbitrary remote URLs are rejected.
- Playlists, live streams, videos over two hours, and individual media streams over 2 GB are blocked.
- At most two downloads can run at once.
- Temporary server files expire after 30 minutes and are deleted after delivery.
- No database, login, analytics, or cloud upload.

Use Loopdrop only for videos you own or have permission to download. You are responsible for respecting creators' rights and YouTube's terms.

If YouTube changes its playback system and a download stops working, run `npm run update:downloader` and restart the app. The app shows a readable explanation when YouTube blocks a request; no downloader can guarantee every YouTube video will remain accessible. A timestamp in a YouTube link (for example, `&t=64s`) does not trim the download—the entire video is saved.
