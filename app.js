/**
 * FieldLight 3D - Main Application Controller
 * Orchestrates Three.js rendering, photometrics, heatmap updates,
 * UI slider bindings, camera controls, and auto-optimization solver.
 */

class App {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.container = document.getElementById('canvas-container');

    // State
    this.isHeatmapMode = false;
    this.usableThresholdLux = 50;
    this.fpsFrames = 0;
    this.fpsLastTime = performance.now();

    this.initThree();
    this.initComponents();
    this.bindUI();
    this.loadInitialSetup();
    this.animate();
  }

  /**
   * Initializes Three.js Renderer, Scene, Camera, and OrbitControls
   */
  initThree() {
    // 1. Renderer with physically correct lighting
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.physicallyCorrectLights = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Pitch black night sky: simulated lights are the exact and only source of illumination
    this.renderer.setClearColor(0x000000, 1.0);

    // 2. Scene (Zero Ambient Light)
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.002);

    // 3. Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 600);
    this.setCameraPerspective();

    // 4. OrbitControls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground
    this.controls.minDistance = 5;
    this.controls.maxDistance = 350;

    // 5. Raycaster for clicking 3D fixtures
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Instantiates subsystems
   */
  initComponents() {
    // 1. Soccer Pitch (FIFA 105m x 68m default)
    this.field = new SoccerField(this.scene, 105, 68);

    // 2. Photometrics Engine
    this.photometrics = new PhotometricsEngine();

    // 3. False-Color Heatmap Generator
    this.heatmapRenderer = new HeatmapRenderer(105, 68);

    // 4. Lights & Fixtures Rig Manager
    this.lightManager = new LightRigManager(this.scene, this.field);

    // 5. Auto-Optimize Solver
    this.optimizer = new LightingOptimizer(this.photometrics, this.lightManager, this.field);
  }

  /**
   * Initial Setup: Loads 4-Corner Stadium Floodlights
   */
  loadInitialSetup() {
    this.lightManager.load4CornerStadiumSetup();
    this.syncLightsListUI();
    this.syncEditorToSelectedLight();
    this.recalculatePhotometrics();
  }

  /**
   * Binds UI events, sliders, tabs, buttons
   */
  bindUI() {
    // 1. Tabs navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabId = e.currentTarget.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const targetPane = document.getElementById(tabId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 2. Add Light Button
    document.getElementById('btn-add-light').addEventListener('click', () => {
      const presetKey = document.getElementById('select-preset').value;
      const newLight = this.lightManager.addLight(presetKey);
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast(`Added ${newLight.name}`);
    });

    // Quick Templates
    document.getElementById('chip-4corner').addEventListener('click', () => {
      this.lightManager.load4CornerStadiumSetup();
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast('Loaded 4-Corner Stadium Masts');
    });

    document.getElementById('chip-6mast').addEventListener('click', () => {
      this.lightManager.load6MastSidelineSetup();
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast('Loaded 6-Pole Sideline Setup');
    });

    document.getElementById('chip-mobile').addEventListener('click', () => {
      this.lightManager.loadMobileTrainingSetup();
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast('Loaded Mobile Training Tripods');
    });

    document.getElementById('chip-clear').addEventListener('click', () => {
      this.lightManager.clearAllLights();
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast('Cleared all lights');
    });

    // 3. Selected Light Editor Actions
    document.getElementById('btn-duplicate-selected').addEventListener('click', () => {
      const selected = this.lightManager.getSelectedLight();
      if (!selected) return;
      const dup = this.lightManager.duplicateLight(selected.id);
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast(`Duplicated ${selected.name}`);
    });

    document.getElementById('btn-delete-selected').addEventListener('click', () => {
      const selected = this.lightManager.getSelectedLight();
      if (!selected) return;
      this.lightManager.removeLight(selected.id);
      this.syncLightsListUI();
      this.syncEditorToSelectedLight();
      this.recalculatePhotometrics();
      this.showToast('Light removed');
    });

    // 4. Sliders Live Input Listeners (Instant real-time update as dragged!)
    const bindSlider = (sliderId, valId, unit, prop, transform = v => v) => {
      const slider = document.getElementById(sliderId);
      const valDisplay = document.getElementById(valId);
      
      const onInput = () => {
        const val = parseFloat(slider.value);
        valDisplay.textContent = `${transform(val)} ${unit}`;
        const selected = this.lightManager.getSelectedLight();
        if (selected) {
          const changes = {};
          changes[prop] = val;
          this.lightManager.updateLight(selected.id, changes);
          this.recalculatePhotometrics();
        }
      };

      slider.addEventListener('input', onInput);
      slider.addEventListener('change', onInput);
    };

    bindSlider('slider-light-z', 'val-light-z', 'm', 'z', v => v.toFixed(1));
    bindSlider('slider-light-x', 'val-light-x', 'm', 'x', v => v.toFixed(1));
    bindSlider('slider-light-y', 'val-light-y', 'm', 'y', v => v.toFixed(1));
    bindSlider('slider-target-x', 'val-target-x', 'm', 'targetX', v => v.toFixed(1));
    bindSlider('slider-target-y', 'val-target-y', 'm', 'targetY', v => v.toFixed(1));
    bindSlider('slider-light-lumens', 'val-light-lumens', 'lm', 'lumens', v => Number(v).toLocaleString());
    bindSlider('slider-light-angle', 'val-light-angle', '°', 'beamAngle', v => Math.round(v));
    bindSlider('slider-light-penumbra', 'val-light-penumbra', '%', 'penumbra', v => `${Math.round(v)}%`);

    // Override penumbra slider handler to scale 0-100% to 0-1.0
    document.getElementById('slider-light-penumbra').addEventListener('input', (e) => {
      const selected = this.lightManager.getSelectedLight();
      if (selected) {
        this.lightManager.updateLight(selected.id, {
          penumbra: parseFloat(e.target.value) / 100
        });
        this.recalculatePhotometrics();
      }
    });

    // Quick Aim Shortcuts for Selected Light
    document.getElementById('btn-aim-center').addEventListener('click', () => {
      const selected = this.lightManager.getSelectedLight();
      if (!selected) return;
      this.updateSelectedAim(0, 0);
    });

    document.getElementById('btn-aim-near-goal').addEventListener('click', () => {
      const selected = this.lightManager.getSelectedLight();
      if (!selected) return;
      const targetX = selected.x < 0 ? -this.field.length / 2 + 5 : this.field.length / 2 - 5;
      this.updateSelectedAim(targetX, 0);
    });

    document.getElementById('btn-aim-far-goal').addEventListener('click', () => {
      const selected = this.lightManager.getSelectedLight();
      if (!selected) return;
      const targetX = selected.x < 0 ? this.field.length / 2 - 5 : -this.field.length / 2 + 5;
      this.updateSelectedAim(targetX, 0);
    });

    document.getElementById('btn-aim-quadrant').addEventListener('click', () => {
      const selected = this.lightManager.getSelectedLight();
      if (!selected) return;
      const halfL = this.field.length / 2;
      const halfW = this.field.width / 2;
      const qx = selected.x < 0 ? -halfL * 0.45 : halfL * 0.45;
      const qy = selected.y < 0 ? -halfW * 0.45 : halfW * 0.45;
      this.updateSelectedAim(qx, qy);
    });

    // 5. Field Dimensions Controls
    document.getElementById('btn-apply-field-dim').addEventListener('click', () => {
      this.applyFieldDimensions();
    });

    document.getElementById('btn-dim-fifa').addEventListener('click', () => {
      document.getElementById('input-field-length').value = 105;
      document.getElementById('input-field-width').value = 68;
      this.applyFieldDimensions();
    });

    document.getElementById('btn-dim-training').addEventListener('click', () => {
      document.getElementById('input-field-length').value = 60;
      document.getElementById('input-field-width').value = 40;
      this.applyFieldDimensions();
    });

    document.getElementById('btn-dim-futsal').addEventListener('click', () => {
      document.getElementById('input-field-length').value = 40;
      document.getElementById('input-field-width').value = 20;
      this.applyFieldDimensions();
    });

    // 6. Heatmap Mode Toggle
    const toggleHeatmap = document.getElementById('toggle-heatmap');
    toggleHeatmap.addEventListener('change', (e) => {
      this.setHeatmapMode(e.target.checked);
    });

    // Usable Lux Threshold Slider
    const sliderThreshold = document.getElementById('slider-lux-threshold');
    sliderThreshold.addEventListener('input', (e) => {
      this.usableThresholdLux = parseInt(e.target.value);
      document.getElementById('val-lux-threshold').textContent = `${this.usableThresholdLux} lx`;
      document.getElementById('meta-threshold-display').textContent = `≥ ${this.usableThresholdLux} Lux`;
      document.getElementById('legend-threshold-tag').textContent = `Threshold: ${this.usableThresholdLux} lx`;
      this.recalculatePhotometrics();
    });

    // 7. Auto-Optimize Button
    const btnOptimize = document.getElementById('btn-run-optimizer');
    btnOptimize.addEventListener('click', () => {
      this.runOptimization();
    });

    // 8. HUD Camera Presets
    document.getElementById('btn-cam-persp').addEventListener('click', (e) => {
      this.setActiveHudCamBtn(e.currentTarget);
      this.setCameraPerspective();
    });

    document.getElementById('btn-cam-top').addEventListener('click', (e) => {
      this.setActiveHudCamBtn(e.currentTarget);
      this.setCameraTopDown();
    });

    document.getElementById('btn-cam-side').addEventListener('click', (e) => {
      this.setActiveHudCamBtn(e.currentTarget);
      this.setCameraSideline();
    });

    document.getElementById('btn-cam-goal').addEventListener('click', (e) => {
      this.setActiveHudCamBtn(e.currentTarget);
      this.setCameraBehindGoal();
    });

    const btnCamFixture = document.getElementById('btn-cam-fixture');
    if (btnCamFixture) {
      btnCamFixture.addEventListener('click', (e) => {
        this.setActiveHudCamBtn(e.currentTarget);
        this.setCameraFixturePOV();
      });
    }

    // HUD Visual Toggles
    const btnToggleHelpers = document.getElementById('btn-toggle-helpers');
    btnToggleHelpers.addEventListener('click', () => {
      const active = btnToggleHelpers.classList.toggle('active');
      this.lightManager.toggleHelpers(active);
    });

    const btnTogglePoles = document.getElementById('btn-toggle-poles');
    btnTogglePoles.addEventListener('click', () => {
      const active = btnTogglePoles.classList.toggle('active');
      this.lightManager.togglePoles(active);
    });

    this.enableProbe = true;
    const btnToggleProbe = document.getElementById('btn-toggle-probe');
    if (btnToggleProbe) {
      btnToggleProbe.addEventListener('click', () => {
        this.enableProbe = btnToggleProbe.classList.toggle('active');
        const pill = document.getElementById('hud-probe-pill');
        if (!this.enableProbe && pill) pill.classList.add('hidden');
      });
    }

    const btnExportPng = document.getElementById('btn-export-png');
    if (btnExportPng) {
      btnExportPng.addEventListener('click', () => {
        this.exportScreenshot();
      });
    }

    // 3D Canvas Click Selection & Probe Hover
    this.canvas.addEventListener('pointerdown', (e) => this.onCanvasClick(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerleave', () => {
      const pill = document.getElementById('hud-probe-pill');
      if (pill) pill.classList.add('hidden');
    });
  }

  /**
   * Applies new field dimensions from inputs
   */
  applyFieldDimensions() {
    const len = parseFloat(document.getElementById('input-field-length').value) || 105;
    const wid = parseFloat(document.getElementById('input-field-width').value) || 68;

    this.field.updateDimensions(len, wid);
    this.heatmapRenderer.setDimensions(len, wid);

    // Update Slider Ranges based on new field dimensions
    const sliderX = document.getElementById('slider-light-x');
    const sliderY = document.getElementById('slider-light-y');
    const sliderTargetX = document.getElementById('slider-target-x');
    const sliderTargetY = document.getElementById('slider-target-y');

    const padL = Math.round(len / 2 + 25);
    const padW = Math.round(wid / 2 + 20);

    sliderX.min = -padL; sliderX.max = padL;
    sliderY.min = -padW; sliderY.max = padW;
    sliderTargetX.min = -Math.round(len / 2); sliderTargetX.max = Math.round(len / 2);
    sliderTargetY.min = -Math.round(wid / 2); sliderTargetY.max = Math.round(wid / 2);

    document.getElementById('hud-field-dim').textContent = `${len}m × ${wid}m`;
    const area = Math.round(len * wid);
    document.getElementById('meta-area-display').textContent = `${area.toLocaleString()} m²`;

    this.recalculatePhotometrics();
    this.showToast(`Field dimensions updated to ${len}m × ${wid}m`);
  }

  /**
   * Heatmap Mode Toggle Handler
   */
  setHeatmapMode(enabled) {
    this.isHeatmapMode = enabled;
    const badge = document.getElementById('heatmap-status-badge');
    const legend = document.getElementById('heatmap-legend');

    if (enabled) {
      badge.textContent = 'Heatmap Active';
      badge.classList.remove('badge-pulse');
      badge.classList.add('badge-glow');
      legend.classList.remove('hidden');
    } else {
      badge.textContent = 'Realistic';
      badge.classList.add('badge-pulse');
      badge.classList.remove('badge-glow');
      legend.classList.add('hidden');
    }

    this.recalculatePhotometrics();
  }

  /**
   * Instant Real-time Photometrics & Coverage Score Calculation
   */
  recalculatePhotometrics() {
    const evaluation = this.photometrics.evaluateField(
      this.lightManager.lights,
      this.field.length,
      this.field.width,
      this.usableThresholdLux
    );

    // Update UI Metrics Display
    this.updateMetricsUI(evaluation);

    // Update Heatmap Texture
    if (this.isHeatmapMode) {
      const texture = this.heatmapRenderer.update(evaluation);
      this.field.setHeatmapMode(true, texture);
    } else {
      this.field.setHeatmapMode(false);
    }
  }

  /**
   * Updates all score numbers, gauge circle, and summary cards
   */
  updateMetricsUI(evaluation) {
    const { coveragePercent, avgLux, minLux, maxLux, uniformity } = evaluation;

    // 1. Coverage Percentage Text
    document.getElementById('coverage-percentage').textContent = `${coveragePercent.toFixed(0)}%`;

    // 2. Circular SVG Progress Bar
    // Radius is 42, Circumference = 2 * PI * 42 = 263.89
    const circle = document.getElementById('score-bar-circle');
    const circumference = 263.89;
    const offset = circumference - (coveragePercent / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    // Dynamic color gradient based on score
    if (coveragePercent >= 85) {
      circle.style.stroke = '#10b981'; // Green
    } else if (coveragePercent >= 50) {
      circle.style.stroke = '#f59e0b'; // Amber
    } else {
      circle.style.stroke = '#38bdf8'; // Cyan
    }

    // 3. Evaluation Grade Badge
    const gradeBadge = document.getElementById('meta-rating-grade');
    if (coveragePercent >= 90) {
      gradeBadge.textContent = 'Excellent';
      gradeBadge.className = 'meta-val meta-grade grade-good';
    } else if (coveragePercent >= 70) {
      gradeBadge.textContent = 'Good';
      gradeBadge.className = 'meta-val meta-grade grade-good';
    } else if (coveragePercent >= 40) {
      gradeBadge.textContent = 'Partial';
      gradeBadge.className = 'meta-val meta-grade grade-fair';
    } else {
      gradeBadge.textContent = 'Insufficient';
      gradeBadge.className = 'meta-val meta-grade';
    }

    // 4. Metrics Grid
    document.getElementById('metric-avg-lux').innerHTML = `${avgLux} <span class="unit">lx</span>`;
    document.getElementById('metric-min-lux').innerHTML = `${minLux} <span class="unit">lx</span>`;
    document.getElementById('metric-max-lux').innerHTML = `${maxLux} <span class="unit">lx</span>`;
    document.getElementById('metric-uniformity').textContent = uniformity.toFixed(2);

    // 5. Active Lights Count in HUD
    const activeCount = this.lightManager.lights.filter(l => l.enabled).length;
    document.getElementById('hud-active-lights').textContent = `${activeCount} Active`;
    document.getElementById('lights-count').textContent = this.lightManager.lights.length;

    // 6. Standards Compliance Checklist
    this.updateComplianceUI(avgLux, uniformity);
  }

  /**
   * Updates FIFA / EN 12193 standards compliance cards
   */
  updateComplianceUI(avgLux, uniformity) {
    const check = (elId, iconId, statusId, minLux, minU) => {
      const item = document.getElementById(elId);
      const icon = document.getElementById(iconId);
      const status = document.getElementById(statusId);
      if (!item) return;
      const passed = avgLux >= minLux && uniformity >= minU;
      if (passed) {
        item.classList.add('passed');
        icon.textContent = '✓';
        status.textContent = 'Pass';
      } else {
        item.classList.remove('passed');
        icon.textContent = '✕';
        status.textContent = 'Fail';
      }
    };
    check('comp-fifa-1', 'comp-icon-1', 'comp-status-1', 500, 0.60);
    check('comp-fifa-2', 'comp-icon-2', 'comp-status-2', 200, 0.50);
    check('comp-fifa-3', 'comp-icon-3', 'comp-status-3', 75, 0.40);
    check('comp-en-amat', 'comp-icon-amat', 'comp-status-amat', 50, 0.30);
  }

  /**
   * Runs the Auto-Optimization Solver
   */
  runOptimization() {
    const activeLights = this.lightManager.lights.filter(l => l.enabled);
    if (activeLights.length === 0) {
      this.showToast('Please add or enable at least one light first!');
      return;
    }

    const btn = document.getElementById('btn-run-optimizer');
    const progressBox = document.getElementById('solver-progress-box');
    const progressFill = document.getElementById('solver-progress-fill');
    const progressPercent = document.getElementById('solver-progress-percent');
    const progressText = document.getElementById('solver-progress-text');
    const liveBest = document.getElementById('solver-live-best');
    const evalCount = document.getElementById('solver-eval-count');

    const allowHeight = document.getElementById('opt-allow-height').checked;

    btn.disabled = true;
    btn.innerHTML = `<svg class="spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Solving Optimal Lighting...`;
    progressBox.classList.remove('hidden');

    this.showToast('Simulating optimal aim points & heights...');

    this.optimizer.optimize({
      allowHeight,
      thresholdLux: this.usableThresholdLux,
      onProgress: (prog) => {
        progressFill.style.width = `${prog.percent}%`;
        progressPercent.textContent = `${prog.percent}%`;
        liveBest.textContent = `${prog.bestCoverage.toFixed(1)}%`;
        evalCount.textContent = prog.iteration;
        progressText.textContent = `Testing combinations... (${prog.iteration}/${prog.total})`;
        
        // Live update score card during solving
        this.recalculatePhotometrics();
      },
      onComplete: (result, err) => {
        btn.disabled = false;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Auto-Optimize Active Lights`;
        
        if (err) {
          this.showToast(err);
          progressBox.classList.add('hidden');
          return;
        }

        // Snaps winning values to UI sliders!
        this.syncEditorToSelectedLight();
        this.syncLightsListUI();
        this.recalculatePhotometrics();

        progressText.textContent = `Completed! Optimal Coverage: ${result.bestScore.coveragePercent.toFixed(1)}%`;
        setTimeout(() => {
          progressBox.classList.add('hidden');
        }, 3500);

        this.showToast(`Optimization Complete! Coverage: ${result.bestScore.coveragePercent.toFixed(1)}%`);
      }
    });
  }

  /**
   * Synchronizes Sidebar Active Lights Cards List
   */
  syncLightsListUI() {
    const listContainer = document.getElementById('lights-list');
    listContainer.innerHTML = '';

    if (this.lightManager.lights.length === 0) {
      listContainer.innerHTML = `<div class="hint-text" style="padding: 10px; text-align: center;">No lights added yet. Use the presets above to add lights.</div>`;
      document.getElementById('selected-light-editor').style.display = 'none';
      return;
    }

    document.getElementById('selected-light-editor').style.display = 'flex';

    this.lightManager.lights.forEach(light => {
      const isSelected = light.id === this.lightManager.selectedLightId;

      const card = document.createElement('div');
      card.className = `light-item-card ${isSelected ? 'selected' : ''} ${!light.enabled ? 'disabled' : ''}`;
      
      card.innerHTML = `
        <div class="light-item-left">
          <div class="light-item-dot" style="${light.enabled ? `background: #${light.color.toString(16).padStart(6, '0')}` : ''}"></div>
          <div>
            <div class="light-item-name">${light.name}</div>
            <div class="light-item-meta">Z: ${light.z.toFixed(1)}m | ${Number(light.lumens).toLocaleString()} lm | ${light.beamAngle}°</div>
          </div>
        </div>
        <div class="light-item-actions">
          <label class="switch" style="transform: scale(0.75);" title="Toggle on/off">
            <input type="checkbox" class="light-toggle-chk" ${light.enabled ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
      `;

      // Select light on card click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return; // Ignore switch click
        this.lightManager.setSelectedLight(light.id);
        this.syncLightsListUI();
        this.syncEditorToSelectedLight();
      });

      // Toggle enable/disable
      const toggle = card.querySelector('.light-toggle-chk');
      toggle.addEventListener('change', (e) => {
        this.lightManager.updateLight(light.id, { enabled: e.target.checked });
        this.syncLightsListUI();
        this.recalculatePhotometrics();
      });

      listContainer.appendChild(card);
    });
  }

  /**
   * Snaps the selected light editor sliders and numerical displays
   * to the winning or active light values!
   */
  syncEditorToSelectedLight() {
    const selected = this.lightManager.getSelectedLight();
    const editor = document.getElementById('selected-light-editor');

    if (!selected) {
      editor.style.display = 'none';
      return;
    }

    editor.style.display = 'flex';
    document.getElementById('editor-light-title').textContent = `${selected.name}`;
    
    // Preset Type badge
    const badge = document.getElementById('editor-light-type-badge');
    const preset = LIGHT_PRESETS[selected.presetType];
    badge.textContent = preset ? preset.name : 'Custom Light';

    // Height Z
    const sliderZ = document.getElementById('slider-light-z');
    sliderZ.value = selected.z;
    document.getElementById('val-light-z').textContent = `${selected.z.toFixed(1)} m`;

    // Position X & Y
    const sliderX = document.getElementById('slider-light-x');
    sliderX.value = selected.x;
    document.getElementById('val-light-x').textContent = `${selected.x.toFixed(1)} m`;

    const sliderY = document.getElementById('slider-light-y');
    sliderY.value = selected.y;
    document.getElementById('val-light-y').textContent = `${selected.y.toFixed(1)} m`;

    // Target Aim X & Y
    const sliderTx = document.getElementById('slider-target-x');
    sliderTx.value = selected.targetX;
    document.getElementById('val-target-x').textContent = `${selected.targetX.toFixed(1)} m`;

    const sliderTy = document.getElementById('slider-target-y');
    sliderTy.value = selected.targetY;
    document.getElementById('val-target-y').textContent = `${selected.targetY.toFixed(1)} m`;

    // Lumens
    const sliderLumens = document.getElementById('slider-light-lumens');
    sliderLumens.value = selected.lumens;
    document.getElementById('val-light-lumens').textContent = `${Number(selected.lumens).toLocaleString()} lm`;

    // Angle
    const sliderAngle = document.getElementById('slider-light-angle');
    sliderAngle.value = selected.beamAngle;
    document.getElementById('val-light-angle').textContent = `${Math.round(selected.beamAngle)}°`;

    // Penumbra
    const sliderPen = document.getElementById('slider-light-penumbra');
    const penVal = Math.round((selected.penumbra || 0.4) * 100);
    sliderPen.value = penVal;
    document.getElementById('val-light-penumbra').textContent = `${penVal}%`;
  }

  /**
   * Helper to update selected light aim
   */
  updateSelectedAim(tx, ty) {
    const selected = this.lightManager.getSelectedLight();
    if (!selected) return;

    this.lightManager.updateLight(selected.id, { targetX: tx, targetY: ty });
    this.syncEditorToSelectedLight();
    this.recalculatePhotometrics();
  }

  /**
   * Camera Position Presets
   */
  setCameraPerspective() {
    this.camera.position.set(0, 65, 95);
    this.camera.lookAt(0, 0, 0);
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  setCameraTopDown() {
    this.camera.position.set(0, 130, 0.001); // Near top-down, slight offset to prevent gimbal lock
    this.camera.lookAt(0, 0, 0);
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  setCameraSideline() {
    const halfW = this.field.width / 2;
    this.camera.position.set(0, 12, -(halfW + 35));
    this.camera.lookAt(0, 2, 0);
    if (this.controls) {
      this.controls.target.set(0, 2, 0);
      this.controls.update();
    }
  }

  setCameraBehindGoal() {
    const halfL = this.field.length / 2;
    this.camera.position.set(-(halfL + 40), 16, 0);
    this.camera.lookAt(0, 2, 0);
    if (this.controls) {
      this.controls.target.set(0, 2, 0);
      this.controls.update();
    }
  }

  setCameraFixturePOV() {
    const selected = this.lightManager.getSelectedLight();
    if (!selected) {
      this.showToast('Please select a light first');
      return;
    }
    // Hop camera to the fixture head and look down beam towards target
    this.camera.position.set(selected.x, selected.z + 0.5, selected.y);
    this.camera.lookAt(selected.targetX, 0, selected.targetY);
    if (this.controls) {
      this.controls.target.set(selected.targetX, 0, selected.targetY);
      this.controls.update();
    }
    this.showToast(`Viewing from ${selected.name}`);
  }

  exportScreenshot() {
    // Render current frame
    this.renderer.render(this.scene, this.camera);
    const dataURL = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `fieldlight-simulation-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    this.showToast('Snapshot downloaded as PNG');
  }

  onPointerMove(e) {
    if (!this.enableProbe) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObject(this.field.pitchMesh);
    const pill = document.getElementById('hud-probe-pill');
    if (hits.length > 0 && pill) {
      const pt = hits[0].point;
      // In our scene coordinates: pt.x is length, pt.z is width
      const lux = Math.round(this.photometrics.evaluatePointLux(this.lightManager.lights, pt.x, pt.z));
      pill.classList.remove('hidden');
      document.getElementById('probe-coords').textContent = `X: ${pt.x >= 0 ? '+' : ''}${pt.x.toFixed(1)}m, Y: ${pt.z >= 0 ? '+' : ''}${pt.z.toFixed(1)}m`;
      document.getElementById('probe-lux-val').textContent = `${lux} lx`;
    } else if (pill) {
      pill.classList.add('hidden');
    }
  }

  setActiveHudCamBtn(clickedBtn) {
    document.querySelectorAll('.hud-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
  }

  /**
   * Raycasting to select light directly in 3D viewport
   */
  onCanvasClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Collect raycast candidates (Poles & Aim Markers)
    const candidates = [];
    this.lightManager.lights.forEach(light => {
      if (light.poleMesh) candidates.push({ lightId: light.id, obj: light.poleMesh });
      if (light.aimMarkerMesh) candidates.push({ lightId: light.id, obj: light.aimMarkerMesh });
    });

    for (let c of candidates) {
      const intersects = this.raycaster.intersectObject(c.obj, true);
      if (intersects.length > 0) {
        this.lightManager.setSelectedLight(c.lightId);
        this.syncLightsListUI();
        this.syncEditorToSelectedLight();
        this.showToast(`Selected Light #${c.lightId}`);
        break;
      }
    }
  }

  /**
   * Responsive canvas resize handler
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  /**
   * Displays temporary toast notification
   */
  showToast(message) {
    const toast = document.getElementById('status-toast');
    toast.textContent = message;
    toast.classList.add('visible');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }

  /**
   * Render Loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());

    // Update OrbitControls
    this.controls.update();

    // Render Scene
    this.renderer.render(this.scene, this.camera);

    // FPS Meter
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      const badge = document.getElementById('render-fps-badge');
      if (badge) badge.textContent = `${fps} FPS`;
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

