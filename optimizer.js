/**
 * FieldLight 3D - Auto-Optimize Solver
 * Solves for the optimal combination of Target Aims (X, Y) and Pole Heights (Z)
 * across all active lights to maximize soccer field illuminance coverage and uniformity.
 * Runs non-blocking asynchronous iterations with real-time progress feedback.
 */

class LightingOptimizer {
  constructor(photometrics, lightManager, field) {
    this.photometrics = photometrics;
    this.lightManager = lightManager;
    this.field = field;
    this.isRunning = false;
  }

  /**
   * Evaluates fitness of a configuration candidate
   */
  computeFitness(lights, fieldL, fieldW, threshold) {
    const evalResult = this.photometrics.evaluateField(lights, fieldL, fieldW, threshold);
    // Fitness composite: Primary = Coverage percentage, Secondary = Uniformity & Avg Lux
    const coverageScore = evalResult.coveragePercent;
    const avgLuxBonus = Math.min(1.0, evalResult.avgLux / threshold) * 20;
    const uniformityBonus = evalResult.uniformity * 15;
    const fitness = (coverageScore * 100) + avgLuxBonus + uniformityBonus;

    return {
      fitness,
      coveragePercent: evalResult.coveragePercent,
      avgLux: evalResult.avgLux,
      uniformity: evalResult.uniformity
    };
  }

  /**
   * Generates smart heuristic initial aim seeds based on light geometry relative to field
   */
  generateSeedAim(light, index, totalLights, fieldL, fieldW) {
    const halfL = fieldL / 2;
    const halfW = fieldW / 2;

    // Corner Light detection
    const isLeft = light.x < -halfL * 0.3;
    const isRight = light.x > halfL * 0.3;
    const isTop = light.y < -halfW * 0.3;
    const isBottom = light.y > halfW * 0.3;

    if (totalLights <= 2) {
      // Aim towards opposing halves
      return {
        targetX: isLeft ? -halfL * 0.3 : halfL * 0.3,
        targetY: 0
      };
    } else if (totalLights === 4) {
      // 4 corners: Cross-aim towards quadrant centers
      return {
        targetX: isLeft ? -halfL * 0.4 : halfL * 0.4,
        targetY: isTop ? -halfW * 0.4 : halfW * 0.4
      };
    } else {
      // Multi-pole sideline: distribute along field longitudinal slices
      const fraction = (index + 0.5) / totalLights;
      const xAim = -halfL * 0.8 + fraction * (fieldL * 0.8);
      // Cross touchline aim towards center / opposite half
      const yAim = light.y < 0 ? -halfW * 0.2 : halfW * 0.2;
      return { targetX: xAim, targetY: yAim };
    }
  }

  /**
   * Returns reasonable physical height boundaries based on light type
   */
  getHeightBounds(light) {
    if (light.presetType === 'preset-basic' || light.poleType === 'tripod-single') {
      return { min: 1.5, max: 4.5 };
    } else if (light.presetType === 'preset-tripod' || light.poleType === 'tripod-triple') {
      return { min: 2.0, max: 6.0 };
    } else if (light.presetType === 'preset-stadium' || light.poleType === 'stadium-mast') {
      return { min: 12.0, max: 28.0 };
    }
    return { min: 2.0, max: 25.0 };
  }

  /**
   * Runs the optimization loop asynchronously
   * @param {Object} options { allowHeight, thresholdLux, onProgress, onComplete }
   */
  optimize(options = {}) {
    if (this.isRunning) return;
    this.isRunning = true;

    const activeLights = this.lightManager.lights.filter(l => l.enabled);
    if (activeLights.length === 0) {
      this.isRunning = false;
      if (options.onComplete) options.onComplete(null, 'No active lights to optimize');
      return;
    }

    const fieldL = this.field.length;
    const fieldW = this.field.width;
    const halfL = fieldL / 2;
    const halfW = fieldW / 2;
    const threshold = options.thresholdLux || 50;
    const allowHeight = options.allowHeight !== undefined ? options.allowHeight : true;

    // Save initial state in case user cancels or for comparison
    const initialSnapshot = activeLights.map(l => ({
      id: l.id,
      targetX: l.targetX,
      targetY: l.targetY,
      z: l.z
    }));

    // Create mutable candidate states
    let currentState = activeLights.map((l, idx) => {
      const seed = this.generateSeedAim(l, idx, activeLights.length, fieldL, fieldW);
      return {
        id: l.id,
        targetX: seed.targetX,
        targetY: seed.targetY,
        z: l.z,
        boundsZ: this.getHeightBounds(l)
      };
    });

    // Temporary light objects for fast evaluation
    const simLights = activeLights.map(l => Object.assign({}, l));

    const applyStateToSim = (state) => {
      for (let i = 0; i < state.length; i++) {
        simLights[i].targetX = state[i].targetX;
        simLights[i].targetY = state[i].targetY;
        simLights[i].z = state[i].z;
      }
    };

    applyStateToSim(currentState);
    let currentScore = this.computeFitness(simLights, fieldL, fieldW, threshold);
    let bestState = JSON.parse(JSON.stringify(currentState));
    let bestScore = Object.assign({}, currentScore);

    // Iteration parameters
    const totalIterations = 1000;
    const batchSize = 40; // Evaluations per frame to keep UI butter-smooth
    let currentIteration = 0;
    let initialTemp = 1.0;

    const runBatch = () => {
      if (!this.isRunning) return;

      const batchEnd = Math.min(totalIterations, currentIteration + batchSize);

      for (; currentIteration < batchEnd; currentIteration++) {
        const progress = currentIteration / totalIterations;
        // Temperature decays exponentially for simulated annealing
        const temp = Math.max(0.05, initialTemp * Math.pow(0.02, progress));

        // Perturb candidate state
        const candidateState = JSON.parse(JSON.stringify(currentState));
        
        // Pick one or multiple lights to perturb
        const lightIdx = Math.floor(Math.random() * candidateState.length);
        const lCand = candidateState[lightIdx];

        // Step sizes scale with field dimensions and annealing temperature
        const stepX = (Math.random() - 0.5) * fieldL * 0.4 * temp;
        const stepY = (Math.random() - 0.5) * fieldW * 0.4 * temp;

        lCand.targetX = Math.max(-halfL, Math.min(halfL, lCand.targetX + stepX));
        lCand.targetY = Math.max(-halfW, Math.min(halfW, lCand.targetY + stepY));

        // Height perturbation (if enabled)
        if (allowHeight) {
          const heightStep = (Math.random() - 0.5) * 6.0 * temp;
          lCand.z = Math.max(lCand.boundsZ.min, Math.min(lCand.boundsZ.max, lCand.z + heightStep));
        }

        applyStateToSim(candidateState);
        const candScore = this.computeFitness(simLights, fieldL, fieldW, threshold);

        // Metropolis acceptance criterion
        const delta = candScore.fitness - currentScore.fitness;
        if (delta > 0 || Math.random() < Math.exp(delta / (temp * 50))) {
          currentState = candidateState;
          currentScore = candScore;

          if (candScore.fitness > bestScore.fitness) {
            bestScore = Object.assign({}, candScore);
            bestState = JSON.parse(JSON.stringify(candidateState));
          }
        }
      }

      // Progress callback
      const percent = Math.round((currentIteration / totalIterations) * 100);
      if (options.onProgress) {
        options.onProgress({
          iteration: currentIteration,
          total: totalIterations,
          percent,
          bestCoverage: bestScore.coveragePercent,
          currentCoverage: currentScore.coveragePercent
        });
      }

      // Periodically reflect winning candidate visually in the 3D scene
      if (currentIteration % (batchSize * 3) === 0) {
        this.applyStateToScene(bestState);
      }

      if (currentIteration < totalIterations) {
        requestAnimationFrame(runBatch);
      } else {
        // Optimization finished: Apply best state and snap UI
        this.isRunning = false;
        this.applyStateToScene(bestState);
        if (options.onComplete) {
          options.onComplete({
            bestState,
            bestScore,
            initialSnapshot
          });
        }
      }
    };

    // Kick off asynchronous loop
    requestAnimationFrame(runBatch);
  }

  /**
   * Applies state to real Three.js lights and rigs
   */
  applyStateToScene(state) {
    state.forEach(s => {
      this.lightManager.updateLight(s.id, {
        targetX: s.targetX,
        targetY: s.targetY,
        z: s.z
      });
    });
  }

  /**
   * Cancels running optimization
   */
  cancel() {
    this.isRunning = false;
  }
}

