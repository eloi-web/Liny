# Liny

A real-time object detection progressive web app with a cyber-detective HUD. Point your camera at anything and watch it get recognized and tracked on-device.

## Features

- **Real-Time Detection:** Uses Transformers.js with the **YOLOS Tiny** model for client-side object detection.
- **Sketchy Object Tracking:** Draws stylistic, per-class colored bounding boxes with Rough.js.
- **Mobile Optimized Inference:** Web Worker + offscreen downsampling, WASM thread caps, adaptive input retuning, and stale-result cleanup so the camera UI stays usable on phones.
- **Toggleable HUD:** Hide overlays for a distraction-free camera view.
- **Voice Announcements:** Optional Web Speech API that announces recognized objects.
- **Capture Gallery:** Snapshots with timestamps and detected object tags.
- **Haptic Feedback:** Light vibration on interactive UI actions where supported.
- **Persisted Settings:** Scan interval, threshold, voice, camera facing, zoom, and HUD prefs survive reloads.
- **100% Client-Side:** ML and rendering run on-device — no video leaves the browser.

## Tech Stack

- **React 19 & TypeScript**
- **Vite 6**
- **Tailwind CSS v4**
- **Transformers.js (`@huggingface/transformers`)** — YOLOS Tiny (`Xenova/yolos-tiny`)
- **Rough.js** — sketchy canvas overlays
- **React Webcam** — camera capture

## Development

```bash
npm install
npm run dev
```

To test on a phone over your local network, the page must be served over **HTTPS** (iOS Safari blocks the camera on plain HTTP):

```bash
npm run dev:lan
```

Then open the URL shown in the terminal from your phone. For reliable mobile camera access, deploy to a host with HTTPS (e.g. Vercel) or use a tunnel (ngrok, Cloudflare Tunnel).

## Production Build

```bash
npm run build
npm run preview
```

### Deploy notes (Vercel)

[`vercel.json`](vercel.json) sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` so browsers can enable multi-threaded WASM inference (`crossOriginIsolated`). Redeploy after pulling those headers for the live site to pick them up.

**First visit:** the model downloads from Hugging Face and may take a while on slow networks; later visits use the browser cache.
