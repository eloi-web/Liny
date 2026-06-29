# Liny

A real-time object detection progressive web app designed with a clean, high-performance "Cyber-Detective" interface. Point your camera at anything, and watch it get recognized and sketched in real-time.

## Features

- **Real-Time Detection:** Uses TensorFlow.js and the pre-trained COCO-SSD (`lite_mobilenet_v2`) model for fast, local object detection.
- **Mobile Optimized Inference:** Employs a custom offscreen canvas downsampling matrix (300x300) before tensor operations, ensuring lag-free high-FPS scanning on mobile devices.
- **Sketchy Bounding Boxes:** Uses Rough.js to draw hand-drawn, cross-hatched bounding boxes with dynamic styling over identified objects.
- **Toggleable HUD:** Allows users to hide all overlays and bounding boxes for an immersive, distraction-free view of the camera feed.
- **Voice Announcements:** Optional Web Speech API integration that speaks out recognized objects ("Detected a chair", etc.) as they enter the frame.
- **Capture Gallery & History:** Take diagnostic snapshots that save directly into an in-app slide-up gallery drawer, complete with timestamps and detected object tags.
- **Haptic Feedback:** Subtle tactile vibrations utilizing the browser's Haptic API for interactive UI feedback, shutter capture, and new object discovery pulses.
- **Futuristic UI:** A dark, moody HUD with custom thresholds, rounded-xl interactive buttons, and glassmorphism.
- **100% Client-Side:** All machine learning processing naturally happens entirely within the browser, ensuring maximum privacy and framerate performance without server round-trips.

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

## Progress

This project is still under experiment because of the following points:
- **Lagging:** This app lags on the phone when using big modals, which means only small modals are only available.
- **Modal Limits:** The available modal is pre-trained, so it has limited objects to recognize, but they are other robust options to choose from but the device can lag or take a while to recognize something based on a device.

