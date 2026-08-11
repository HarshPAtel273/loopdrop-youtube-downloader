# Loopdrop

A polished local YouTube downloader side project. Paste a link, preview the video, choose 1080p, 720p, 480p, or MP3, and save it to your normal Downloads folder.

## Run it

```bash
npm install
npm start
```

Then open [http://localhost:4173](http://localhost:4173).

`npm install` downloads a local `yt-dlp` binary and a project-scoped FFmpeg binary. Nothing is installed globally.

## Scripts

- `npm run dev` — run with Node's watch mode
- `npm test` — run the focused server and validation tests
- `npm run check` — syntax-check the server and browser code

## Guardrails

- YouTube URLs only; arbitrary remote URLs are rejected.
- Playlists, live streams, videos over two hours, and files over 500 MB are blocked.
- At most two downloads can run at once.
- Temporary server files expire after 30 minutes and are deleted after delivery.
- No database, login, analytics, or cloud upload.

Use Loopdrop only for videos you own or have permission to download. You are responsible for respecting creators' rights and YouTube's terms.
