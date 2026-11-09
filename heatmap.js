/**
 * FieldLight 3D - False-Color Photometric Heatmap Renderer
 * Visualizes ground illuminance (lux) as a false-color heatmap on the soccer field.
 * Smoothly gradients from deep navy (0 lx) -> cyan (50 lx) -> yellow (200 lx) -> red (500+ lx).
 */

class HeatmapRenderer {
  constructor(fieldLength = 105, fieldWidth = 68) {
    this.fieldLength = fieldLength;
    this.fieldWidth = fieldWidth;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Colormap stops: [luxValue, [r, g, b]]
    this.colorScale = [
      { lux: 0,   rgb: [12, 7, 134] },    // Deep indigo / dark navy
      { lux: 15,  rgb: [44, 2, 147] },    // Blue
      { lux: 35,  rgb: [75, 3, 161] },    // Violet
      { lux: 50,  rgb: [31, 180, 198] },  // Cyan (Threshold level)
      { lux: 90,  rgb: [53, 183, 121] },  // Green
      { lux: 160, rgb: [253, 231, 37] },  // Yellow
      { lux: 280, rgb: [250, 125, 16] },  // Orange
      { lux: 450, rgb: [229, 31, 32] },   // Bright Red
      { lux: 650, rgb: [255, 255, 255] }  // White saturation
    ];
  }

  setDimensions(length, width) {
    this.fieldLength = length;
    this.fieldWidth = width;
  }

  /**
   * Maps a lux value to an [r, g, b] color
   */
  luxToRgb(lux) {
    if (lux <= 0) return this.colorScale[0].rgb;
    const len = this.colorScale.length;
    if (lux >= this.colorScale[len - 1].lux) {
      return this.colorScale[len - 1].rgb;
    }

    for (let i = 0; i < len - 1; i++) {
      const lower = this.colorScale[i];
      const upper = this.colorScale[i + 1];
      if (lux >= lower.lux && lux <= upper.lux) {
        const factor = (lux - lower.lux) / (upper.lux - lower.lux);
        return [
          Math.round(lower.rgb[0] + factor * (upper.rgb[0] - lower.rgb[0])),
          Math.round(lower.rgb[1] + factor * (upper.rgb[1] - lower.rgb[1])),
          Math.round(lower.rgb[2] + factor * (upper.rgb[2] - lower.rgb[2]))
        ];
      }
    }
    return [255, 255, 255];
  }

  /**
   * Updates the heatmap canvas with the evaluated lux matrix and overlays field lines
   */
  update(evaluation) {
    const { luxMatrix, cols, rows } = evaluation;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    // 1. Create offscreen small grid image data matching evaluation matrix
    const gridImg = ctx.createImageData(cols, rows);
    const data = gridImg.data;

    let pIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Direct row indexing aligns canvas top with -Z in Three.js world space
        const lux = luxMatrix[r * cols + c];
        const [red, green, blue] = this.luxToRgb(lux);
        data[pIdx]     = red;
        data[pIdx + 1] = green;
        data[pIdx + 2] = blue;
        data[pIdx + 3] = 255;
        pIdx += 4;
      }
    }

    // 2. Scale up smoothly to canvas size using bilinear filtering
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cols;
    tempCanvas.height = rows;
    tempCanvas.getContext('2d').putImageData(gridImg, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tempCanvas, 0, 0, w, h);

    // 3. Overlay high-contrast crisp white pitch lines on top of the heatmap
    this.drawPitchOverlay(ctx, w, h);

    // 4. Signal Three.js texture to update on GPU
    this.texture.needsUpdate = true;
    return this.texture;
  }

  /**
   * Draws white soccer pitch markings on top of the heatmap
   */
  drawPitchOverlay(ctx, w, h) {
    const scaleX = w / this.fieldLength;
    const scaleY = h / this.fieldWidth;
    const m2pxX = (m) => m * scaleX;
    const m2pxY = (m) => m * scaleY;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'square';

    // Touchlines & Goal lines
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Center Circle (9.15m)
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, m2pxX(9.15), m2pxY(9.15), 0, 0, Math.PI * 2);
    ctx.stroke();

    // Penalty Boxes & Goal Areas
    const penDepth = m2pxX(16.5);
    const penWidth = m2pxY(40.32);
    const goalDepth = m2pxX(5.5);
    const goalWidth = m2pxY(18.32);

    const penTop = (h - penWidth) / 2;
    const goalTop = (h - goalWidth) / 2;

    // Left box & goal
    ctx.strokeRect(0, penTop, penDepth, penWidth);
    ctx.strokeRect(0, goalTop, goalDepth, goalWidth);

    // Right box & goal
    ctx.strokeRect(w - penDepth, penTop, penDepth, penWidth);
    ctx.strokeRect(w - goalDepth, goalTop, goalDepth, goalWidth);
  }
}
