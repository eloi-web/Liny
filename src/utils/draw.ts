import rough from 'roughjs';

export interface Prediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

// Persisted tracking of detected objects in space to drive entry animations 
interface TrackedItem {
  firstSeen: number;
  lastSeen: number;
}
const trackedItemsMap = new Map<string, TrackedItem>();

export function getSciFiLabel(className: string): string {
  const dictionary: Record<string, string> = {
    'person': 'Person',
    'bicycle': 'Bicycle',
    'car': 'Car',
    'motorcycle': 'Motorcycle',
    'airplane': 'Airplane',
    'bus': 'Bus',
    'train': 'Train',
    'truck': 'Truck',
    'boat': 'Boat',
    'traffic light': 'Traffic Light',
    'fire hydrant': 'Fire Hydrant',
    'stop sign': 'Stop Sign',
    'parking meter': 'Parking Meter',
    'bench': 'Bench',
    'bird': 'Bird',
    'cat': 'Cat',
    'dog': 'Dog',
    'horse': 'Horse',
    'sheep': 'Sheep',
    'cow': 'Cow',
    'elephant': 'Elephant',
    'bear': 'Bear',
    'zebra': 'Zebra',
    'giraffe': 'Giraffe',
    'backpack': 'Backpack / Bag',
    'umbrella': 'Umbrella',
    'handbag': 'Handbag',
    'tie': 'Tie',
    'suitcase': 'Suitcase / Luggage',
    'frisbee': 'Frisbee',
    'skis': 'Skis',
    'snowboard': 'Snowboard',
    'sports ball': 'Ball',
    'kite': 'Kite',
    'baseball bat': 'Baseball Bat',
    'baseball glove': 'Baseball Glove',
    'skateboard': 'Skateboard',
    'surfboard': 'Surfboard',
    'tennis racket': 'Tennis Racket',
    'bottle': 'Bottle',
    'wine glass': 'Wine Glass',
    'cup': 'Cup / Mug',
    'fork': 'Fork',
    'knife': 'Knife',
    'spoon': 'Spoon',
    'bowl': 'Bowl',
    'banana': 'Banana',
    'apple': 'Apple',
    'sandwich': 'Sandwich',
    'orange': 'Orange',
    'broccoli': 'Broccoli',
    'carrot': 'Carrot',
    'hot dog': 'Hot Dog',
    'pizza': 'Pizza',
    'donut': 'Donut',
    'cake': 'Cake',
    'chair': 'Chair',
    'couch': 'Couch / Sofa',
    'potted plant': 'Plant / Flower',
    'bed': 'Bed',
    'dining table': 'Table',
    'toilet': 'Toilet',
    'tv': 'TV',
    'laptop': 'Laptop',
    'mouse': 'Mouse',
    'remote': 'Remote',
    'keyboard': 'Keyboard',
    'cell phone': 'Phone',
    'microwave': 'Microwave',
    'oven': 'Oven',
    'toaster': 'Toaster',
    'sink': 'Sink',
    'refrigerator': 'Refrigerator',
    'book': 'Book',
    'clock': 'Clock',
    'vase': 'Vase',
    'scissors': 'Scissors',
    'teddy bear': 'Teddy Bear',
    'hair dryer': 'Hair Dryer',
    'toothbrush': 'Toothbrush'
  };

  const cleanClass = className.toLowerCase().trim();
  if (dictionary[cleanClass]) {
    return dictionary[cleanClass];
  }
  return cleanClass.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function drawSketchyBoxes(canvas: HTMLCanvasElement, predictions: Prediction[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Clear previous drawings
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const rc = rough.canvas(canvas);
  const now = Date.now();

  // Prune any entries that haven't been detected in 1.5 seconds to keep spatial indexing clean
  for (const [key, item] of Array.from(trackedItemsMap.entries())) {
    if (now - item.lastSeen > 1500) {
      trackedItemsMap.delete(key);
    }
  }
  
  predictions.forEach(pred => {
    const [x, y, width, height] = pred.bbox;
    
    // Generate a spatial tracking key based on coordinate quadrants to distinguish multiple nearby objects of the same class
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

    // A. Main Interactive Target Frame - Red sketchy lines like the reference
    rc.rectangle(x, y, width, height, {
      stroke: '#FF0000', // Intense red lines
      strokeWidth: isLockingInProgress ? 4 : 2.5,
      roughness: isLockingInProgress ? 2.5 : 3.5, // Much more sketchy and messy
      fill: isLockingInProgress ? 'rgba(255, 0, 0, 0.1)' : 'rgba(255, 0, 0, 0.05)',
      fillStyle: 'zigzag', // Adds to the chaotic sketchy feel
      bowing: 2, // Curve the lines more for hand-drawn look
    });
    
    // B. Context-aware sci-fi immersive label translations
    const sciFiLabel = getSciFiLabel(pred.class);
    const labelText = `${sciFiLabel} [${Math.round(pred.score * 100)}%]`;
    
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    const textWidth = ctx.measureText(labelText).width;
    
    // UI Label Box Frame
    ctx.fillStyle = '#000000'; // Pure black background for label
    ctx.fillRect(x - 2, y - 24, textWidth + 12, 20);
    ctx.strokeStyle = '#FF0000'; // Red border
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2, y - 24, textWidth + 12, 20);
    
    // Label String Text placement
    ctx.fillStyle = '#FFFFFF'; // White text
    ctx.fillText(labelText, x + 4, y - 10);
    
    // C. Static Corner bracket decals
    ctx.fillStyle = '#FF0000'; // Red corner brackets
    // Top-Left corner bracket
    ctx.fillRect(x - 3, y - 3, 16, 3);
    ctx.fillRect(x - 3, y - 3, 3, 16);
    // Top-Right corner bracket
    ctx.fillRect(x + width - 13, y - 3, 16, 3);
    ctx.fillRect(x + width - 0, y - 3, 3, 16);
    // Bottom-Left corner bracket
    ctx.fillRect(x - 3, y + height - 0, 16, 3);
    ctx.fillRect(x - 3, y + height - 13, 3, 16);
    // Bottom-Right corner bracket
    ctx.fillRect(x + width - 13, y + height - 0, 16, 3);
    ctx.fillRect(x + width - 0, y + height - 13, 3, 16);

    // D. Radiating "Neural Lock-on" Vector Lines Animation
    if (isLockingInProgress) {
      // Calculate age percentage to expand radiating lines outward 
      const ageNorm = Math.min(1.0, age / 500); 
      const radialOffset = ageNorm * 26; // Radiating lines travel 26px outwards
      const opacity = 1.0 - ageNorm;     // Fades nicely toward completion
      
      ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);

      // Outer projecting target indicators
      ctx.strokeRect(
        x - radialOffset, 
        y - radialOffset, 
        width + (radialOffset * 2), 
        height + (radialOffset * 2)
      );

      // Lock status telemetry text inside the box
      ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText('[ NEURAL SYNAPSE ENGAGED ]', x + 10, y + 20);

      // Micro crosshairs in the absolute center
      const centerX = x + (width / 2);
      const centerY = y + (height / 2);
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY);
      ctx.lineTo(centerX + 10, centerY);
      ctx.moveTo(centerX, centerY - 10);
      ctx.lineTo(centerX, centerY + 10);
      ctx.stroke();

      ctx.setLineDash([]); // Reset line dashes
    }
  });
}
