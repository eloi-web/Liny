import rough from 'roughjs';

export interface Prediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

interface TrackedItem {
  firstSeen: number;
  lastSeen: number;
}

const trackedItemsMap = new Map<string, TrackedItem>();
let cachedCanvas: HTMLCanvasElement | null = null;
let cachedRc: ReturnType<typeof rough.canvas> | null = null;

interface ClassColor {
  hex: string;
  r: number;
  g: number;
  b: number;
}

// High-contrast palette that stays readable over a live camera feed.
const CLASS_PALETTE: ClassColor[] = [
  { hex: '#FF3B30', r: 255, g: 59, b: 48 }, // red
  { hex: '#00E5FF', r: 0, g: 229, b: 255 }, // cyan
  { hex: '#76FF03', r: 118, g: 255, b: 3 }, // lime
  { hex: '#FFC400', r: 255, g: 196, b: 0 }, // amber
  { hex: '#FF4081', r: 255, g: 64, b: 129 }, // magenta
  { hex: '#FF9100', r: 255, g: 145, b: 0 }, // orange
  { hex: '#40C4FF', r: 64, g: 196, b: 255 }, // sky blue
  { hex: '#00E676', r: 0, g: 230, b: 118 }, // spring green
  { hex: '#B388FF', r: 179, g: 136, b: 255 }, // violet
  { hex: '#FFEA00', r: 255, g: 234, b: 0 }, // yellow
];

// Deterministic class -> color mapping so "cup" is always the same color
// across frames and sessions.
export function getClassColor(className: string): ClassColor {
  const clean = className.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) | 0;
  }
  return CLASS_PALETTE[Math.abs(hash) % CLASS_PALETTE.length];
}

export function getSciFiLabel(className: string): string {
  const dictionary: Record<string, string> = {
    person: 'Person',
    bicycle: 'Bicycle',
    car: 'Car',
    motorcycle: 'Motorcycle',
    airplane: 'Airplane',
    bus: 'Bus',
    train: 'Train',
    truck: 'Truck',
    boat: 'Boat',
    'traffic light': 'Traffic Light',
    'fire hydrant': 'Fire Hydrant',
    'stop sign': 'Stop Sign',
    'parking meter': 'Parking Meter',
    bench: 'Bench',
    bird: 'Bird',
    cat: 'Cat',
    dog: 'Dog',
    horse: 'Horse',
    sheep: 'Sheep',
    cow: 'Cow',
    elephant: 'Elephant',
    bear: 'Bear',
    zebra: 'Zebra',
    giraffe: 'Giraffe',
    backpack: 'Backpack / Bag',
    umbrella: 'Umbrella',
    handbag: 'Handbag',
    tie: 'Tie',
    suitcase: 'Suitcase / Luggage',
    frisbee: 'Frisbee',
    skis: 'Skis',
    snowboard: 'Snowboard',
    'sports ball': 'Ball',
    kite: 'Kite',
    'baseball bat': 'Baseball Bat',
    'baseball glove': 'Baseball Glove',
    skateboard: 'Skateboard',
    surfboard: 'Surfboard',
    'tennis racket': 'Tennis Racket',
    bottle: 'Bottle',
    'wine glass': 'Wine Glass',
    cup: 'Cup / Mug',
    fork: 'Fork',
    knife: 'Knife',
    spoon: 'Spoon',
    bowl: 'Bowl',
    banana: 'Banana',
    apple: 'Apple',
    sandwich: 'Sandwich',
    orange: 'Orange',
    broccoli: 'Broccoli',
    carrot: 'Carrot',
    'hot dog': 'Hot Dog',
    pizza: 'Pizza',
    donut: 'Donut',
    cake: 'Cake',
    chair: 'Chair',
    couch: 'Couch / Sofa',
    'potted plant': 'Plant / Flower',
    bed: 'Bed',
    'dining table': 'Table',
    toilet: 'Toilet',
    tv: 'TV',
    laptop: 'Laptop',
    mouse: 'Mouse',
    remote: 'Remote',
    keyboard: 'Keyboard',
    'cell phone': 'Phone',
    microwave: 'Microwave',
    oven: 'Oven',
    toaster: 'Toaster',
    sink: 'Sink',
    refrigerator: 'Refrigerator',
    book: 'Book',
    clock: 'Clock',
    vase: 'Vase',
    scissors: 'Scissors',
    'teddy bear': 'Teddy Bear',
    'hair dryer': 'Hair Dryer',
    toothbrush: 'Toothbrush',
  };

  const cleanClass = className.toLowerCase().trim();
  if (dictionary[cleanClass]) {
    return dictionary[cleanClass];
  }
  return cleanClass.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// True while any tracked box is inside its 500ms lock-on entry animation,
// meaning the overlay needs continuous redraws to animate smoothly.
export function hasActiveAnimations(): boolean {
  const now = Date.now();
  for (const item of trackedItemsMap.values()) {
    if (now - item.firstSeen < 500) return true;
  }
  return false;
}

function getRoughCanvas(canvas: HTMLCanvasElement) {
  if (
    cachedCanvas !== canvas ||
    cachedCanvas.width !== canvas.width ||
    cachedCanvas.height !== canvas.height
  ) {
    cachedCanvas = canvas;
    cachedRc = rough.canvas(canvas);
  }
  return cachedRc!;
}

export function drawSketchyBoxes(canvas: HTMLCanvasElement, predictions: Prediction[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rc = getRoughCanvas(canvas);
  const now = Date.now();

  for (const [key, item] of Array.from(trackedItemsMap.entries())) {
    if (now - item.lastSeen > 1500) {
      trackedItemsMap.delete(key);
    }
  }

  predictions.forEach((pred) => {
    const [x, y, width, height] = pred.bbox;

    if (width <= 0 || height <= 0) return;

    const spatialX = Math.round(x / 40) * 40;
    const spatialY = Math.round(y / 40) * 40;
    const trackingKey = `${pred.class}-${spatialX}-${spatialY}`;

    let isNewLockOn = false;
    let age = 0;

    const existing = trackedItemsMap.get(trackingKey);
    if (!existing) {
      trackedItemsMap.set(trackingKey, { firstSeen: now, lastSeen: now });
      isNewLockOn = true;
    } else {
      existing.lastSeen = now;
      age = now - existing.firstSeen;
    }

    const isLockingInProgress = isNewLockOn || age < 500;

    const color = getClassColor(pred.class);

    rc.rectangle(x, y, width, height, {
      stroke: color.hex,
      strokeWidth: isLockingInProgress ? 2.5 : 1.5,
      roughness: isLockingInProgress ? 2.5 : 3.5,
      fill: `rgba(${color.r}, ${color.g}, ${color.b}, ${isLockingInProgress ? 0.1 : 0.05})`,
      fillStyle: 'zigzag',
      bowing: 1.5,
    });

    const sciFiLabel = getSciFiLabel(pred.class);
    const labelText = `${sciFiLabel} [${Math.round(pred.score * 100)}%]`;

    ctx.font = 'bold 16px "DM Sans", monospace';
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 2, y - 32, textWidth + 14, 26);
    ctx.strokeStyle = color.hex;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 32, textWidth + 14, 26);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labelText, x + 5, y - 12);

    ctx.fillStyle = color.hex;
    ctx.fillRect(x - 2, y - 2, 16, 2);
    ctx.fillRect(x - 2, y - 2, 2, 16);
    ctx.fillRect(x + width - 14, y - 2, 16, 2);
    ctx.fillRect(x + width - 0, y - 2, 2, 16);
    ctx.fillRect(x - 2, y + height - 0, 16, 2);
    ctx.fillRect(x - 2, y + height - 14, 2, 16);
    ctx.fillRect(x + width - 14, y + height - 0, 16, 2);
    ctx.fillRect(x + width - 0, y + height - 14, 2, 16);

    if (isLockingInProgress) {
      const ageNorm = Math.min(1.0, age / 500);
      const radialOffset = ageNorm * 26;
      const opacity = 1.0 - ageNorm;

      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);

      ctx.strokeRect(
        x - radialOffset,
        y - radialOffset,
        width + radialOffset * 2,
        height + radialOffset * 2,
      );

      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
      ctx.font = 'bold 12px "DM Sans", monospace';
      ctx.fillText('[ NEURAL SYNAPSE ENGAGED ]', x + 10, y + 22);

      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY);
      ctx.lineTo(centerX + 10, centerY);
      ctx.moveTo(centerX, centerY - 10);
      ctx.lineTo(centerX, centerY + 10);
      ctx.stroke();

      ctx.setLineDash([]);
    }
  });
}
