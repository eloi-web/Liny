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
    'person': 'BIO-ORGANISM SIGNATURE DETECTED',
    'bicycle': 'DIPHASE TRANSPORT FRAME',
    'car': 'MOBILE COMBUSTION ENGINE',
    'motorcycle': 'RAPID RADIAL WHEEL ASSEMBLY',
    'airplane': 'ATMOSPHERIC JET TRANSMISSION',
    'bus': 'MASS TRANSIT LOGISTICS CARRIER',
    'train': 'GUIDED RAIL ENERGY COLLECTOR',
    'truck': 'HEAVY HAULAGE CHASSIS',
    'boat': 'STABLE AQUATIC FLUID HULL',
    'traffic light': 'FLOW REGULATOR SENSOR PATH',
    'fire hydrant': 'HIGH-PRESSURE FLUID VALVE',
    'stop sign': 'VELOCITY TERMINATION SIGNBOARD',
    'parking meter': 'TEMPORAL CREDIT INTERFACE',
    'bench': 'STATIONARY SUPPORT PLATE',
    'bird': 'AERIAL AVIAN BIO-OBJECT',
    'cat': 'FELINE BIO-SIGNATURE',
    'dog': 'CANINE BIO-SIGNATURE',
    'horse': 'EQUINE QUADRUPED MODULE',
    'sheep': 'WOOLLEN RESOURCE BIO-SIGNATURE',
    'cow': 'BOVINE THERMAL MATRIX',
    'elephant': 'MEGAFAUNA CHASSIS DETECTED',
    'bear': 'URSINE APEX PREDATOR DETECTED',
    'zebra': 'STRIPED MAMMALIAN MATRIX',
    'giraffe': 'LONG-NECKED ARBOREAL VEG-NODE',
    'backpack': 'CARGO STORAGE BACK-STRAP',
    'umbrella': 'HYDRODYNAMIC THERMAL SHIELD',
    'handbag': 'PORTABLE CONTAINER RECEPTACLE',
    'tie': 'VOCATIONAL STRAP protocol',
    'suitcase': 'WHEELED SOLID LUGGAGE GRID',
    'frisbee': 'AERODYNAMIC SPINNING DISK',
    'skis': 'GLIDE-SPEED SNOW RUNNERS',
    'snowboard': 'SOLID SNOW GLIDER BOARD',
    'sports ball': 'DYNAMIC SPHERICAL BOUNCE BODY',
    'kite': 'TETHERED HIGH-ALTITUDE GLIDER',
    'baseball bat': 'SOLID VELOCITY IMPACTOR',
    'baseball glove': 'TARGET CAUGHT SHIELD',
    'skateboard': 'FOUR-WHEELED URBAN DECK',
    'surfboard': 'HYDRODYNAMIC HYDRO-GLIDER',
    'tennis racket': 'TENSION MESH PROJECTILE RACK',
    'bottle': 'LIQUID RETENTION VESSEL',
    'wine glass': 'CRYSTAL BEVERAGE FLUID CELL',
    'cup': 'DRINKING INFUSION HOUSING',
    'fork': 'TINED NUTRIENT PIERCER',
    'knife': 'HONED HEAVY SHEAR BLADE',
    'spoon': 'CONCAVE NUTRIENT INGESTER',
    'bowl': 'CONCAVE CORE SEGREGATION CELL',
    'banana': 'CURVED POTASSIUM ENERGY CELL',
    'apple': 'SPHERICAL POMACEOUS BIO-NODE',
    'sandwich': 'LAYERED CARBOHYDRATE STACK',
    'orange': 'ASCORBIC ENERGY RECEPTACLE',
    'broccoli': 'PHOTOSYNTHETIC MINI-ARBOREAL',
    'carrot': 'TAPROOT VEGETABLE BETA UNIT',
    'hot dog': 'CYLINDRICAL ENERGY SPECTRUM',
    'pizza': 'FLATBREAD INFUSED ENERGY DISC',
    'donut': 'TOROIDAL SUGAR VALVE',
    'cake': 'MULTI-LAYER ENERGY CELEBRATION',
    'chair': 'QUADRUPED ERGONOMIC SUPPORT UNIT',
    'couch': 'MULTI-SEAT LEATHER CONSOLE',
    'potted plant': 'PLANTED PHOTOSYNTHETIC SHIELD',
    'bed': 'STRUCTURAL SLEEP COMFORT SURFACE',
    'dining table': 'ELEVATED SOLID WORK BENCH',
    'toilet': 'WATER-SEALED SANITARY VACUUM',
    'tv': 'VIDEO VISUAL EMISSION GRID',
    'laptop': 'PORTABLE CORE COMPUTATION TERM',
    'mouse': 'MANUAL COORDINATE TRACKER UNIT',
    'remote': 'INFRARED COMMAND BEAM SWITCH',
    'keyboard': 'MULTI-KEY DATA INPUT PANEL',
    'cell phone': 'POCKET MOBILE TELEMETRY WAVEPHONE',
    'microwave': 'HIGH-FREQUENCY ATOMIC REACTOR',
    'oven': 'CONVECTION THERMAL CHAMBER',
    'toaster': 'SLICED GRAIN TOASTING GRID',
    'sink': 'HYDRAULIC WASH WATER RECEPTACLE',
    'refrigerator': 'SEALED COOL-STORAGE VAULT',
    'book': 'ARCHIVAL WOOD-PULP DATA CODEX',
    'clock': 'ROTATIONAL CHRONOMETER COUNTER',
    'vase': 'CERAMIC BOTANICAL STABILIZER',
    'scissors': 'DUAL-AXIS SHEARING APPARATUS',
    'teddy bear': 'PLUSH COMFORT EMULATOR NODE',
    'hair dryer': 'CONCENTRATED HEAT VECTOR COMPRESSOR',
    'toothbrush': 'BRISTLED DENTAL CLEANSING SHIELD'
  };

  const cleanClass = className.toLowerCase().trim();
  return dictionary[cleanClass] || `${cleanClass.toUpperCase()} TARGET`;
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

    // A. Main Interactive Target Frame
    rc.rectangle(x, y, width, height, {
      stroke: isLockingInProgress ? '#39FF14' : '#B6FFA1', // Intense green during active lock-on
      strokeWidth: isLockingInProgress ? 3 : 2,
      roughness: isLockingInProgress ? 0.8 : 1.6, // Tighter control during lock-on
      fill: isLockingInProgress ? 'rgba(57, 255, 20, 0.08)' : 'rgba(182, 255, 161, 0.03)',
      fillStyle: 'cross-hatch',
    });
    
    // B. Context-aware sci-fi immersive label translations
    const sciFiLabel = getSciFiLabel(pred.class);
    const labelText = `${sciFiLabel} [${Math.round(pred.score * 100)}%]`;
    
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const textWidth = ctx.measureText(labelText).width;
    
    // UI Label Box Frame
    ctx.fillStyle = '#0C0C0C';
    ctx.fillRect(x - 2, y - 24, textWidth + 12, 18);
    ctx.strokeStyle = isLockingInProgress ? '#39FF14' : '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 24, textWidth + 12, 18);
    
    // Label String Text placement
    ctx.fillStyle = isLockingInProgress ? '#39FF14' : '#FFFFFF';
    ctx.fillText(labelText, x + 4, y - 11);
    
    // C. Static Corner bracket decals
    ctx.fillStyle = '#B6FFA1';
    // Top-Left corner bracket
    ctx.fillRect(x - 3, y - 3, 12, 2);
    ctx.fillRect(x - 3, y - 3, 2, 12);
    // Top-Right corner bracket
    ctx.fillRect(x + width - 9, y - 3, 12, 2);
    ctx.fillRect(x + width - 1, y - 3, 2, 12);
    // Bottom-Left corner bracket
    ctx.fillRect(x - 3, y + height - 1, 12, 2);
    ctx.fillRect(x - 3, y + height - 11, 2, 12);
    // Bottom-Right corner bracket
    ctx.fillRect(x + width - 9, y + height - 1, 12, 2);
    ctx.fillRect(x + width - 1, y + height - 11, 2, 12);

    // D. Radiating "Neural Lock-on" Vector Lines Animation
    if (isLockingInProgress) {
      // Calculate age percentage to expand radiating lines outward 
      const ageNorm = Math.min(1.0, age / 500); 
      const radialOffset = ageNorm * 26; // Radiating lines travel 26px outwards
      const opacity = 1.0 - ageNorm;     // Fades nicely toward completion
      
      ctx.strokeStyle = `rgba(57, 255, 20, ${opacity})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);

      // Outer projecting target indicators
      ctx.strokeRect(
        x - radialOffset, 
        y - radialOffset, 
        width + (radialOffset * 2), 
        height + (radialOffset * 2)
      );

      // Lock status telemetry text inside the box
      ctx.fillStyle = `rgba(57, 255, 20, ${opacity})`;
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
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
