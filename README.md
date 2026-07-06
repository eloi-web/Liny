# Liny

A real-time object detection progressive web app designed with a clean, high-performance "Cyber-Detective" interface. Point your camera at anything, and watch it get recognized and precisely tracked in real-time.

## Features

- **Real-Time Detection:** Uses Transformers.js for DETR ResNet-50 object detection directly within the browser.
- **Sketchy Object Tracking:** Draws stylistic bounding boxes using Rough.js to frame detected objects.
- **Mobile Optimized Inference:** Employs an intelligent offscreen downsampling mechanism and a Web Worker architecture to prevent the UI thread from blocking, ensuring lag-free high-FPS UI on any device.
- **Toggleable HUD:** Allows users to hide all overlays and outlines for an immersive, distraction-free view of the camera feed.
- **Voice Announcements:** Optional Web Speech API integration that speaks out recognized objects (e.g., "Detected a chair") as they enter the frame.
- **Capture Gallery & History:** Take diagnostic snapshots that save directly into an in-app slide-up gallery drawer, complete with timestamps and detected object tags.
- **Haptic Feedback:** Subtle tactile vibrations utilizing the browser's Haptic API for interactive UI feedback, shutter capture, and new object discovery pulses.
- **Futuristic UI:** A dark, moody HUD with custom thresholds, rounded interactive elements, and minimal neon accents.
- **100% Client-Side:** All machine learning and box rendering happens entirely on-device, ensuring maximum privacy without server round-trips.

## Tech Stack

- **React 19 & TypeScript:** Scalable, typed component architecture.
- **Vite:** High-performance frontend tooling.
- **Tailwind CSS:** For layout styling, glassmorphism UI, and dark aesthetic.
- **Transformers.js (`@huggingface/transformers`):** Client-side neural object detection with the DETR ResNet-50 model.
- **Rough.js:** For the sketchy, hand-drawn vector graphics on the Canvas.
- **React Webcam:** Flexible webcam handling for different devices.

## Development 

To run this project locally:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

   To test on a phone over your local network:
   ```bash
   npm run dev:lan
   ```

## Production Build

To build the project for production, which compiles to static assets inside the `dist/` folder:

```bash
npm run build
```

You can preview the built static output with:
```bash
npm run preview
```
