# Liny

A real-time image segmentation and object recognition progressive web app designed with a clean, high-performance "Cyber-Detective" interface. Point your camera at anything, and watch it get recognized and precisely outlined in real-time.

## Features

- **Real-Time Segmentation:** Uses Transformers.js for SegFormer B0 image segmentation directly within the browser.
- **Precise Object Outlines:** Replaces standard bounding boxes with contour-traced, sketchy polygon outlines (using Rough.js and d3-contour) that perfectly trace the shape of the object.
- **Mobile Optimized Inference:** Employs an intelligent offscreen downsampling mechanism and a Web Worker architecture to prevent the UI thread from blocking, ensuring lag-free high-FPS UI on any device.
- **Toggleable HUD:** Allows users to hide all overlays and outlines for an immersive, distraction-free view of the camera feed.
- **Voice Announcements:** Optional Web Speech API integration that speaks out recognized objects (e.g., "Detected a chair") as they enter the frame.
- **Capture Gallery & History:** Take diagnostic snapshots that save directly into an in-app slide-up gallery drawer, complete with timestamps and detected object tags.
- **Haptic Feedback:** Subtle tactile vibrations utilizing the browser's Haptic API for interactive UI feedback, shutter capture, and new object discovery pulses.
- **Futuristic UI:** A dark, moody HUD with custom thresholds, rounded interactive elements, and minimal neon accents.
- **100% Client-Side:** All machine learning and mask processing happens entirely on-device, ensuring maximum privacy without server round-trips.

## Tech Stack

- **React 19 & TypeScript:** Scalable, typed component architecture.
- **Vite:** High-performance frontend tooling.
- **Tailwind CSS:** For layout styling, glassmorphism UI, and dark aesthetic.
- **Transformers.js (`@huggingface/transformers`):** Client-side neural segmentation with the SegFormer B0 model.
- **Rough.js:** For the sketchy, hand-drawn vector graphics on the Canvas.
- **d3-contour:** To convert dense tensor masks into crisp SVG polygon rings for drawing.
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

## Production Build

To build the project for production, which compiles to static assets inside the `dist/` folder:

```bash
npm run build
```

You can preview the built static output with:
```bash
npm run preview
```
