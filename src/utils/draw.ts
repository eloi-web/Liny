import rough from 'roughjs';

export interface Prediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export function drawSketchyBoxes(canvas: HTMLCanvasElement, predictions: Prediction[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Clear previous drawings
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const rc = rough.canvas(canvas);
  
  predictions.forEach(pred => {
    const [x, y, width, height] = pred.bbox;
    
    // Draw the sketchy box
    rc.rectangle(x, y, width, height, {
      stroke: '#B6FFA1',
      strokeWidth: 2,
      roughness: 1.8,
      fill: 'rgba(182, 255, 161, 0.04)',
      fillStyle: 'cross-hatch',
    });
    
    // Draw label
    const labelText = `${pred.class.toUpperCase()} [${Math.round(pred.score * 100)}%]`;
    
    ctx.font = 'bold 12px "DM Sans", sans-serif';
    const textWidth = ctx.measureText(labelText).width;
    
    // Background for text
    ctx.fillStyle = '#0C0C0C';
    ctx.fillRect(x - 2, y - 24, textWidth + 12, 20); // Border effect
    ctx.strokeStyle = '#FEFFA7';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 24, textWidth + 12, 20);
    
    // Text itself
    ctx.fillStyle = '#FEFFA7';
    ctx.fillText(labelText, x + 4, y - 10);
    
    // Small corner accents
    ctx.fillStyle = '#B6FFA1';
    ctx.fillRect(x - 3, y - 3, 12, 2);
    ctx.fillRect(x - 3, y - 3, 2, 12);
  });
}
