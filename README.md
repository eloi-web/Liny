# Liny

A real-time object detection progressive web app designed with a "Cyber-Detective" interface. Point your camera at anything, and watch it get sketched in real-time.

## Features

- **Real-Time Detection:** Uses TensorFlow.js and the pre-trained COCO-SSD (`lite_mobilenet_v2`) model for fast, local object detection.
- **Sketchy Bounding Boxes:** Uses Rough.js to draw hand-drawn, cross-hatched bounding boxes with dynamic styling over identified objects.
- **Voice Announcements:** Optional Web Speech API integration that speaks out recognized objects ("Detected a chair", etc.) as they enter the frame.
- **Glitch & Scanline UI:** A dark, moody, futuristic HUD with scanlines, interactive log views, custom thresholds, and glassmorphism.
- **Client-Side Processing:** All machine learning processing naturally happens entirely within the browser, avoiding round-trips to the server for maximum privacy and framerate performance.

## Tech Stack

- **React 19 & TypeScript:** Scalable, typed component architecture.
- **Vite:** High-performance frontend tooling.
- **Tailwind CSS:** For layout styling, glassmorphism UI, and glitch effects.
- **TensorFlow.js (`@tensorflow/tfjs`) & COCO-SSD:** Client-side object detection.
- **Rough.js:** For the sketchy, hand-drawn vector graphics on the Canvas.
- **React Webcam:** Flexible webcam handling for different devices (mobile/desktop).

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
