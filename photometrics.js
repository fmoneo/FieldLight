/**
 * FieldLight 3D - Photometrics & Illuminance Physics Engine
 * Implements physically correct inverse-square law, conical beam cutoff,
 * and cosine angle of incidence to calculate exact horizontal illuminance (lux).
 */

class PhotometricsEngine {
  constructor() {
    // Default grid sampling density (e.g. 40x26 = 1040 points)
    this.gridCols = 40;
    this.gridRows = 26;
  }

  /**
   * Sets sampling grid resolution
   */
  setGridResolution(cols, rows) {
    this.gridCols = cols;
    this.gridRows = rows;
  }

  /**
   * Calculates peak luminous intensity I0 (candelas) from total luminous flux (lumens)
   * and beam cone angle with penumbra.
   * Solid angle Omega = 2 * PI * (1 - cos(theta_half))
   */
  getPeakIntensity(lumens, halfAngleRad, penumbraFactor) {
    const cosAngle = Math.cos(halfAngleRad);
    // Solid angle of a cone: Omega = 2 * PI * (1 - cos(halfAngle))
    const solidAngle = 2 * Math.PI * Math.max(0.001, 1 - cosAngle);
    // Effective solid angle taking penumbra falloff into account
    const penumbraSoftness = Math.max(0.01, Math.min(1.0, penumbraFactor));
    const effectiveOmega = solidAngle * (1 - 0.3 * penumbraSoftness);
    return lumens / Math.max(0.01, effectiveOmega);
  }

  /**
   * Calculates horizontal illuminance (lux) at a single ground point (px, py, 0)
   * from a single light fixture.
   */
  calculateLightLuxAtPoint(light, px, py) {
    if (!light.enabled) return 0;

    // Light source position: (sx, sy, sz) where sz is Height above ground
    const sx = light.x;
    const sy = light.y;
    const sz = Math.max(0.1, light.z);

    // Aim target position on ground: (tx, ty, 0)
    const tx = light.targetX;
    const ty = light.targetY;
    const tz = 0;

    // 1. Aim vector from source to target
    const adx = tx - sx;
    const ady = ty - sy;
    const adz = tz - sz;
    const aimDist = Math.sqrt(adx * adx + ady * ady + adz * adz);
    if (aimDist < 0.0001) return 0;
    const ax = adx / aimDist;
    const ay = ady / aimDist;
    const az = adz / aimDist;

    // 2. Ray vector from source to ground point (px, py, 0)
    const rdx = px - sx;
    const rdy = py - sy;
    const rdz = 0 - sz;
    const dSq = rdx * rdx + rdy * rdy + rdz * rdz;
    const dist = Math.sqrt(dSq);
    if (dist < 0.001) return 0;

    const rx = rdx / dist;
    const ry = rdy / dist;
    const rz = rdz / dist;

    // 3. Cosine of angle between aim axis and ray: cos(theta) = dot(ray, aim)
    const cosTheta = rx * ax + ry * ay + rz * az;
    if (cosTheta <= 0) return 0; // Behind the light beam

    const theta = Math.acos(Math.min(1.0, Math.max(-1.0, cosTheta)));
    const halfAngle = (light.beamAngle * Math.PI / 180) / 2;

    if (theta >= halfAngle) return 0; // Outside the spotlight cone

    // 4. Penumbra falloff (smooth cosine transition between inner cone and outer cutoff)
    const penumbra = Math.max(0.01, Math.min(1.0, light.penumbra || 0.4));
    const innerAngle = halfAngle * (1 - penumbra);
    let angularFactor = 1.0;

    if (theta > innerAngle) {
      // Smooth Hermite or Cosine falloff from 1.0 down to 0.0
      const t = (theta - innerAngle) / (halfAngle - innerAngle);
      angularFactor = 0.5 * (1 + Math.cos(Math.PI * t));
    }

    // 5. Angle of incidence cosine on the horizontal ground plane (ground normal is [0, 0, 1])
    // cos(alpha) = -ray.z = sz / dist
    const cosAlpha = sz / dist;
    if (cosAlpha <= 0) return 0;

    // 6. Peak intensity I0 (candelas)
    const I0 = this.getPeakIntensity(light.lumens, halfAngle, penumbra);

    // 7. Inverse-square law: E = (I0 * angularFactor * cosAlpha) / dist^2
    const lux = (I0 * angularFactor * cosAlpha) / dSq;
    return lux;
  }

  /**
   * Calculates total horizontal illuminance (lux) at a single ground point (px, py)
   * across all active lights.
   */
  evaluatePointLux(lights, px, py) {
    let total = 0;
    for (let i = 0; i < lights.length; i++) {
      if (lights[i].enabled) {
        total += this.calculateLightLuxAtPoint(lights[i], px, py);
      }
    }
    return total;
  }

  /**
   * Evaluates the full grid across field dimensions:
   * Returns a complete metrics summary and illuminance matrix.
   */
  evaluateField(lights, fieldLength, fieldWidth, thresholdLux = 50) {
    const cols = this.gridCols;
    const rows = this.gridRows;
    const totalPoints = cols * rows;

    const halfL = fieldLength / 2;
    const halfW = fieldWidth / 2;

    const stepX = fieldLength / (cols - 1);
    const stepY = fieldWidth / (rows - 1);

    const activeLights = lights.filter(l => l.enabled);
    
    // Matrix of lux values for each grid point
    const luxMatrix = new Float32Array(totalPoints);
    let aboveThresholdCount = 0;
    let sumLux = 0;
    let minLux = Infinity;
    let maxLux = 0;

    if (activeLights.length === 0) {
      return {
        coveragePercent: 0,
        avgLux: 0,
        minLux: 0,
        maxLux: 0,
        uniformity: 0,
        totalPoints,
        aboveThresholdCount: 0,
        thresholdLux,
        luxMatrix: new Float32Array(totalPoints),
        cols,
        rows
      };
    }

    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const py = -halfW + r * stepY;
      for (let c = 0; c < cols; c++) {
        const px = -halfL + c * stepX;

        // Sum contributions from all active lights
        let pointLux = 0;
        for (let i = 0; i < activeLights.length; i++) {
          pointLux += this.calculateLightLuxAtPoint(activeLights[i], px, py);
        }

        luxMatrix[idx] = pointLux;
        sumLux += pointLux;

        if (pointLux >= thresholdLux) {
          aboveThresholdCount++;
        }
        if (pointLux < minLux) minLux = pointLux;
        if (pointLux > maxLux) maxLux = pointLux;

        idx++;
      }
    }

    const avgLux = sumLux / totalPoints;
    const coveragePercent = (aboveThresholdCount / totalPoints) * 100;
    // Uniformity ratio U1 = Emin / Eavg (FIFA sports lighting metric)
    const uniformity = avgLux > 0.1 ? Math.min(1.0, minLux / avgLux) : 0;

    return {
      coveragePercent: parseFloat(coveragePercent.toFixed(1)),
      avgLux: Math.round(avgLux),
      minLux: Math.round(minLux),
      maxLux: Math.round(maxLux),
      uniformity: parseFloat(uniformity.toFixed(2)),
      totalPoints,
      aboveThresholdCount,
      thresholdLux,
      luxMatrix,
      cols,
      rows
    };
  }
}

