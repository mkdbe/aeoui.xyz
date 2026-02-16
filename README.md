# aeoui.xyz — self-hosting guide

## Folder structure

Place all your media files relative to index.html like this:

```
/
├── index.html
└── media/
    ├── audio/
    │   ├── rain-roof.mp3
    │   ├── low-tide.mp3
    │   └── pine-snow.mp3
    └── visuals/
        ├── rain-roof.jpg       ← image background
        ├── low-tide.mp4        ← video background
        ├── low-tide.jpg        ← poster frame for video (used in archive grid)
        └── pine-snow.jpg
```

## Adding a recording

Open `index.html` and find the `recordings` array near the bottom. Add an object:

```js
{
  id: 4,
  title: "Your recording title",
  location: "Place name, Country",
  notes: "A sentence or two about where and when you recorded it.",
  audio: "media/audio/your-file.mp3",
  visual: "media/visuals/your-image.jpg",   // or .mp4 for video
  visualType: "image",                       // "image" or "video"
  duration: "6:30",                          // displayed text only
  poster: "media/visuals/your-poster.jpg",   // only needed if visual is video
}
```

## Audio tips
- **Format**: MP3 at 192–320kbps works well. FLAC/WAV are too large for web.
- **Length**: Anywhere from 5 min to 30+ min is fine. Howler.js streams via HTML5.
- **Normalization**: Normalize to around -16 LUFS for a consistent listening level.

## Visual tips
- **Images**: JPEG at ~80% quality, 3840×2160 max. Under 2MB per image is ideal.
- **Videos**: H.264 MP4, 1920×1080, 15–25fps for a slow/dreamy feel. 
  Keep bitrate around 3–5 Mbps. Loop-friendly edits (matching start/end frames) look great.
- **Aspect**: Anything works — the CSS covers and crops to fit the viewport.

## Hosting options (self-hosted)

### Simple: nginx on a VPS
```nginx
server {
    listen 80;
    server_name aeoui.xyz www.aeoui.xyz;
    root /var/www/aeoui;
    index index.html;

    # Enable range requests for audio seeking
    location ~* \.(mp3|mp4|ogg|webm)$ {
        add_header Accept-Ranges bytes;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(jpg|jpeg|png|webp)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```
Run `certbot --nginx -d aeoui.xyz` for free HTTPS.

### Lightweight: Caddy
```
aeoui.xyz {
    root * /var/www/aeoui
    file_server
    encode gzip
}
```
Caddy handles HTTPS automatically.

### Storage: keep media off your VPS
If your audio/video files are large, consider serving media from 
**Cloudflare R2** (free egress) or **Backblaze B2** (very cheap).
Just update the `audio` and `visual` paths in the recordings array to full URLs:
```js
audio: "https://pub-xxxx.r2.dev/audio/rain-roof.mp3",
visual: "https://pub-xxxx.r2.dev/visuals/rain-roof.jpg",
```

## Browser note
Audio requires a user gesture to start (browser policy). The entry screen
handles this — visitors click "enter" before any audio loads.
