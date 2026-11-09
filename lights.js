/**
 * FieldLight 3D - Light Fixture & Rigging Manager
 * Manages SpotLights, SpotLightHelpers, 3D tripod/mast models, aim markers,
 * and user-configurable light presets.
 */

// Preset Definitions per specifications
const LIGHT_PRESETS = {
  'preset-basic': {
    name: 'Basic Work Light',
    type: 'preset-basic',
    lumens: 10000,
    beamAngle: 110,   // Wide beam angle (degrees)
    heightZ: 2.0,     // Default height 2m
    penumbra: 0.5,
    poleType: 'tripod-single',
    color: 0xfff3e0   // Warm-neutral daylight LED
  },
  'preset-tripod': {
    name: 'Pro Tripod Work Light (3-Head)',
    type: 'preset-tripod',
    lumens: 21000,
    beamAngle: 135,   // Ultra-wide beam angle (degrees)
    heightZ: 2.0,     // Default height 2m
    penumbra: 0.6,
    poleType: 'tripod-triple',
    color: 0xffffff   // High-CRI white LED
  },
  'preset-stadium': {
    name: 'Stadium Flood Light',
    type: 'preset-stadium',
    lumens: 112000,
    beamAngle: 50,    // Focused directional beam (degrees)
    heightZ: 18.0,    // Default height 18m
    penumbra: 0.35,
    poleType: 'stadium-mast',
    color: 0xf5f8ff   // 5700K Stadium metal-halide / LED array
  },
  'preset-custom': {
    name: 'Custom Configurable Light',
    type: 'preset-custom',
    lumens: 45000,
    beamAngle: 75,
    heightZ: 10.0,
    penumbra: 0.4,
    poleType: 'stadium-mast',
    color: 0xffffff
  }
};

class LightRigManager {
  constructor(scene, field) {
    this.scene = scene;
    this.field = field;
    this.lights = [];
    this.selectedLightId = null;
    this.nextId = 1;

    // Toggleable visual overlays
    this.showHelpers = true;
    this.showPoles = true;

    // Group for 3D poles and helpers
    this.rigGroup = new THREE.Group();
    this.scene.add(this.rigGroup);
  }

  /**
   * Adds a new light based on preset or custom config
   */
  addLight(presetKey = 'preset-stadium', initialPos = null, initialAim = null) {
    const preset = LIGHT_PRESETS[presetKey] || LIGHT_PRESETS['preset-custom'];
    const id = this.nextId++;

    // Default placement around field boundary if none provided
    const halfL = this.field.length / 2;
    const halfW = this.field.width / 2;

    const defaultPos = initialPos || {
      x: -(halfL + 4),
      y: -(halfW + 4),
      z: preset.heightZ
    };

    const defaultAim = initialAim || {
      x: -halfL * 0.4,
      y: -halfW * 0.4
    };

    const lightData = {
      id,
      name: `Light #${id} (${preset.name})`,
      presetType: presetKey,
      enabled: true,
      
      // Coordinates (User convention: X=Length, Y=Width, Z=Height)
      x: defaultPos.x,
      y: defaultPos.y,
      z: defaultPos.z !== undefined ? defaultPos.z : preset.heightZ,

      // Target Aim coordinates on pitch
      targetX: defaultAim.x,
      targetY: defaultAim.y,

      // Photometric properties
      lumens: preset.lumens,
      beamAngle: preset.beamAngle, // cone angle degrees
      penumbra: preset.penumbra,
      color: preset.color || 0xffffff,
      poleType: preset.poleType,

      // Three.js object references
      threeLight: null,
      threeTarget: null,
      threeHelper: null,
      poleMesh: null,
      aimMarkerMesh: null,
      aimLineMesh: null
    };

    this.buildThreeLightObjects(lightData);
    this.lights.push(lightData);
    this.selectedLightId = id;

    return lightData;
  }

  /**
   * Constructs the Three.js SpotLight, Target, Helper, and 3D Pole
   */
  buildThreeLightObjects(light) {
    // 1. Three.js SpotLight
    // Convert lumens to Three.js physical intensity:
    // With decay=2 (physically correct inverse-square attenuation)
    const intensity = this.lumensToThreeIntensity(light.lumens, light.beamAngle);
    const halfAngleRad = (light.beamAngle * Math.PI / 180) / 2;

    const spotLight = new THREE.SpotLight(light.color, intensity);
    spotLight.decay = 2.0;
    spotLight.distance = 0; // Infinite range with realistic inverse square falloff
    spotLight.angle = halfAngleRad;
    spotLight.penumbra = light.penumbra;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 250;
    spotLight.shadow.bias = -0.0005;

    // Position mapping: (X=x, Y=z(height), Z=y(width))
    spotLight.position.set(light.x, light.z, light.y);

    // 2. SpotLight Target Object
    const targetObj = new THREE.Object3D();
    targetObj.position.set(light.targetX, 0, light.targetY);
    this.scene.add(targetObj);
    spotLight.target = targetObj;

    this.scene.add(spotLight);
    light.threeLight = spotLight;
    light.threeTarget = targetObj;

    // 3. Three.js SpotLightHelper
    const helperColor = 0x38bdf8;
    const helper = new THREE.SpotLightHelper(spotLight, helperColor);
    helper.visible = this.showHelpers && light.enabled;
    this.scene.add(helper);
    light.threeHelper = helper;

    // 4. Ground Target Aim Marker (Glowing Ring on Pitch)
    const ringGeo = new THREE.RingGeometry(0.8, 1.1, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const aimMarker = new THREE.Mesh(ringGeo, ringMat);
    aimMarker.position.set(light.targetX, 0.05, light.targetY);
    aimMarker.visible = this.showHelpers && light.enabled;
    this.rigGroup.add(aimMarker);
    light.aimMarkerMesh = aimMarker;

    // 5. Connecting Line from Light Fixture to Aim Target
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(light.x, light.z, light.y),
      new THREE.Vector3(light.targetX, 0, light.targetY)
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 1,
      gapSize: 0.8,
      transparent: true,
      opacity: 0.5
    });
    const aimLine = new THREE.Line(lineGeo, lineMat);
    aimLine.computeLineDistances();
    aimLine.visible = this.showHelpers && light.enabled;
    this.rigGroup.add(aimLine);
    light.aimLineMesh = aimLine;

    // 6. 3D Pole / Mast / Tripod Mesh
    this.buildPoleModel(light);
  }

  /**
   * Builds high-fidelity procedural 3D model for the light stand/pole
   */
  buildPoleModel(light) {
    if (light.poleMesh) {
      this.rigGroup.remove(light.poleMesh);
    }

    const poleGroup = new THREE.Group();
    const height = Math.max(1, light.z);
    const isMast = light.poleType === 'stadium-mast' || height > 6;

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      roughness: 0.4,
      metalness: 0.8
    });

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: light.color,
      emissiveIntensity: light.enabled ? 1.5 : 0.0,
      roughness: 0.2
    });

    if (isMast) {
      // Stadium High-Mast Pole (tapered steel column + light bracket array)
      const poleGeo = new THREE.CylinderGeometry(0.2, 0.5, height, 16);
      const mast = new THREE.Mesh(poleGeo, metalMat);
      mast.position.y = height / 2;
      mast.castShadow = true;
      poleGroup.add(mast);

      // Top Crossbars / Platform
      const barGeo = new THREE.BoxGeometry(2.8, 0.2, 0.8);
      const crossbar = new THREE.Mesh(barGeo, metalMat);
      crossbar.position.set(0, height, 0);
      poleGroup.add(crossbar);

      // Multiple Lamp Heads (Bank of 4 floodlights)
      for (let i = -1.2; i <= 1.2; i += 0.8) {
        const headGeo = new THREE.BoxGeometry(0.5, 0.35, 0.3);
        const head = new THREE.Mesh(headGeo, lampMat);
        head.position.set(i, height + 0.3, 0);
        poleGroup.add(head);
      }
    } else {
      // Portable Tripod Work Light Stand
      // 1. Central Vertical Telescopic Pole
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, height, 12);
      const mast = new THREE.Mesh(poleGeo, metalMat);
      mast.position.y = height / 2;
      poleGroup.add(mast);

      // 2. Tripod Legs (3 angled legs spreading to base)
      const legRadius = Math.min(1.2, height * 0.45);
      const legLen = Math.sqrt(legRadius * legRadius + 0.7 * 0.7);
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3;
        const legGeo = new THREE.CylinderGeometry(0.025, 0.025, legLen, 8);
        const leg = new THREE.Mesh(legGeo, metalMat);
        leg.position.set(Math.cos(angle) * (legRadius / 2), 0.35, Math.sin(angle) * (legRadius / 2));
        leg.rotation.y = -angle;
        leg.rotation.z = 0.55;
        poleGroup.add(leg);
      }

      // 3. Lamp Head(s)
      if (light.poleType === 'tripod-triple') {
        // 3-Head Pro Work Light (T-bar with 3 adjustable flood heads)
        const tbarGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8);
        tbarGeo.rotateZ(Math.PI / 2);
        const tbar = new THREE.Mesh(tbarGeo, metalMat);
        tbar.position.set(0, height, 0);
        poleGroup.add(tbar);

        [-0.45, 0, 0.45].forEach(offset => {
          const headGeo = new THREE.BoxGeometry(0.25, 0.2, 0.15);
          const head = new THREE.Mesh(headGeo, lampMat);
          head.position.set(offset, height + 0.15, 0);
          poleGroup.add(head);
        });
      } else {
        // Single Head Basic Work Light
        const headGeo = new THREE.BoxGeometry(0.35, 0.25, 0.2);
        const head = new THREE.Mesh(headGeo, lampMat);
        head.position.set(0, height + 0.15, 0);
        poleGroup.add(head);
      }
    }

    poleGroup.position.set(light.x, 0, light.y);
    poleGroup.visible = this.showPoles;
    this.rigGroup.add(poleGroup);
    light.poleMesh = poleGroup;
  }

  /**
   * Updates an existing light's parameters and 3D representations
   */
  updateLight(lightId, changes) {
    const light = this.getLightById(lightId);
    if (!light) return;

    let needsPoleRebuild = false;

    if (changes.x !== undefined) light.x = parseFloat(changes.x);
    if (changes.y !== undefined) light.y = parseFloat(changes.y);
    if (changes.z !== undefined) {
      light.z = parseFloat(changes.z);
      needsPoleRebuild = true;
    }
    if (changes.targetX !== undefined) light.targetX = parseFloat(changes.targetX);
    if (changes.targetY !== undefined) light.targetY = parseFloat(changes.targetY);
    if (changes.lumens !== undefined) light.lumens = parseFloat(changes.lumens);
    if (changes.beamAngle !== undefined) light.beamAngle = parseFloat(changes.beamAngle);
    if (changes.penumbra !== undefined) light.penumbra = parseFloat(changes.penumbra);
    if (changes.enabled !== undefined) light.enabled = !!changes.enabled;
    if (changes.name !== undefined) light.name = changes.name;

    // Update Three.js SpotLight & Target
    if (light.threeLight) {
      light.threeLight.position.set(light.x, light.z, light.y);
      light.threeLight.visible = light.enabled;
      light.threeLight.angle = (light.beamAngle * Math.PI / 180) / 2;
      light.threeLight.penumbra = light.penumbra;
      light.threeLight.intensity = this.lumensToThreeIntensity(light.lumens, light.beamAngle);

      light.threeTarget.position.set(light.targetX, 0, light.targetY);
      light.threeLight.target.updateMatrixWorld();
    }

    // Update Helper
    if (light.threeHelper) {
      light.threeHelper.visible = this.showHelpers && light.enabled;
      light.threeHelper.update();
    }

    // Update Aim Marker & Line
    if (light.aimMarkerMesh) {
      light.aimMarkerMesh.position.set(light.targetX, 0.05, light.targetY);
      light.aimMarkerMesh.visible = this.showHelpers && light.enabled;
    }

    if (light.aimLineMesh) {
      const positions = light.aimLineMesh.geometry.attributes.position.array;
      positions[0] = light.x;
      positions[1] = light.z;
      positions[2] = light.y;
      positions[3] = light.targetX;
      positions[4] = 0;
      positions[5] = light.targetY;
      light.aimLineMesh.geometry.attributes.position.needsUpdate = true;
      light.aimLineMesh.computeLineDistances();
      light.aimLineMesh.visible = this.showHelpers && light.enabled;
    }

    // Update or Rebuild Pole Model
    if (light.poleMesh) {
      if (needsPoleRebuild) {
        this.buildPoleModel(light);
      } else {
        light.poleMesh.position.set(light.x, 0, light.y);
      }
    }
  }

  /**
   * Converts real luminous flux (lumens) to Three.js physical intensity units
   */
  lumensToThreeIntensity(lumens, beamAngleDeg) {
    const halfAngleRad = (beamAngleDeg * Math.PI / 180) / 2;
    const solidAngle = 2 * Math.PI * (1 - Math.cos(halfAngleRad));
    // Three.js SpotLight physical intensity is in candelas (cd = lumens / solidAngle)
    const candelas = lumens / Math.max(0.01, solidAngle);
    // Calibration factor for realistic Three.js rendering
    return candelas * 0.08;
  }

  /**
   * Removes a light fixture and disposes Three.js objects
   */
  removeLight(lightId) {
    const index = this.lights.findIndex(l => l.id === lightId);
    if (index === -1) return;

    const light = this.lights[index];

    if (light.threeLight) this.scene.remove(light.threeLight);
    if (light.threeTarget) this.scene.remove(light.threeTarget);
    if (light.threeHelper) this.scene.remove(light.threeHelper);
    if (light.poleMesh) this.rigGroup.remove(light.poleMesh);
    if (light.aimMarkerMesh) this.rigGroup.remove(light.aimMarkerMesh);
    if (light.aimLineMesh) this.rigGroup.remove(light.aimLineMesh);

    this.lights.splice(index, 1);

    if (this.selectedLightId === lightId) {
      this.selectedLightId = this.lights.length > 0 ? this.lights[0].id : null;
    }
  }

  /**
   * Duplicates an existing light with slight positional offset
   */
  duplicateLight(lightId) {
    const source = this.getLightById(lightId);
    if (!source) return null;

    const newLight = this.addLight(source.presetType, {
      x: source.x + 4,
      y: source.y + 4,
      z: source.z
    }, {
      x: source.targetX,
      y: source.targetY
    });

    this.updateLight(newLight.id, {
      lumens: source.lumens,
      beamAngle: source.beamAngle,
      penumbra: source.penumbra,
      color: source.color
    });

    return newLight;
  }

  /**
   * Removes all lights from the scene
   */
  clearAllLights() {
    const ids = this.lights.map(l => l.id);
    ids.forEach(id => this.removeLight(id));
  }

  getLightById(id) {
    return this.lights.find(l => l.id === id);
  }

  getSelectedLight() {
    return this.getLightById(this.selectedLightId);
  }

  setSelectedLight(id) {
    this.selectedLightId = id;
    this.highlightSelectedLight();
  }

  /**
   * Highlights the selected light with a distinct helper color & scale
   */
  highlightSelectedLight() {
    this.lights.forEach(l => {
      const isSelected = l.id === this.selectedLightId;
      if (l.threeHelper) {
        l.threeHelper.color = isSelected ? 0xf59e0b : 0x38bdf8;
        l.threeHelper.update();
      }
      if (l.aimMarkerMesh) {
        l.aimMarkerMesh.material.color.setHex(isSelected ? 0xf59e0b : 0x38bdf8);
        l.aimMarkerMesh.scale.setScalar(isSelected ? 1.3 : 1.0);
      }
    });
  }

  /**
   * Toggles visibility of cone helpers and 3D poles
   */
  toggleHelpers(visible) {
    this.showHelpers = visible;
    this.lights.forEach(l => {
      if (l.threeHelper) l.threeHelper.visible = visible && l.enabled;
      if (l.aimMarkerMesh) l.aimMarkerMesh.visible = visible && l.enabled;
      if (l.aimLineMesh) l.aimLineMesh.visible = visible && l.enabled;
    });
  }

  togglePoles(visible) {
    this.showPoles = visible;
    this.lights.forEach(l => {
      if (l.poleMesh) l.poleMesh.visible = visible;
    });
  }

  /**
   * Installs standard pre-configured layouts
   */
  load4CornerStadiumSetup() {
    this.clearAllLights();
    const halfL = this.field.length / 2;
    const halfW = this.field.width / 2;
    const mastHeight = 18;

    // Corner Mast positions (8m offset outside touchline and goal line)
    const corners = [
      { x: -(halfL + 8), y: -(halfW + 8), tx: -halfL * 0.35, ty: -halfW * 0.35 },
      { x: (halfL + 8),  y: -(halfW + 8), tx: halfL * 0.35,  ty: -halfW * 0.35 },
      { x: -(halfL + 8), y: (halfW + 8),  tx: -halfL * 0.35, ty: halfW * 0.35 },
      { x: (halfL + 8),  y: (halfW + 8),  tx: halfL * 0.35,  ty: halfW * 0.35 }
    ];

    corners.forEach(c => {
      this.addLight('preset-stadium', { x: c.x, y: c.y, z: mastHeight }, { x: c.tx, y: c.ty });
    });
  }

  load6MastSidelineSetup() {
    this.clearAllLights();
    const halfL = this.field.length / 2;
    const halfW = this.field.width / 2;
    const mastHeight = 16;
    const sideOffset = halfW + 6;

    const positions = [
      // Top Sideline (3 masts)
      { x: -halfL * 0.7, y: -sideOffset, tx: -halfL * 0.5, ty: -halfW * 0.2 },
      { x: 0,            y: -sideOffset, tx: 0,            ty: 0 },
      { x: halfL * 0.7,  y: -sideOffset, tx: halfL * 0.5,  ty: -halfW * 0.2 },
      // Bottom Sideline (3 masts)
      { x: -halfL * 0.7, y: sideOffset,  tx: -halfL * 0.5, ty: halfW * 0.2 },
      { x: 0,            y: sideOffset,  tx: 0,            ty: 0 },
      { x: halfL * 0.7,  y: sideOffset,  tx: halfL * 0.5,  ty: halfW * 0.2 }
    ];

    positions.forEach(p => {
      this.addLight('preset-stadium', { x: p.x, y: p.y, z: mastHeight }, { x: p.tx, y: p.ty });
    });
  }

  loadMobileTrainingSetup() {
    this.clearAllLights();
    const halfL = this.field.length / 2;
    const halfW = this.field.width / 2;

    const positions = [
      { x: -25, y: -(halfW + 2), z: 2.5, tx: -25, ty: -10 },
      { x: 0,   y: -(halfW + 2), z: 2.5, tx: 0,   ty: -10 },
      { x: 25,  y: -(halfW + 2), z: 2.5, tx: 25,  ty: -10 },
      { x: 0,   y: (halfW + 2),  z: 2.5, tx: 0,   ty: 10 }
    ];

    positions.forEach(p => {
      this.addLight('preset-tripod', { x: p.x, y: p.y, z: p.z }, { x: p.tx, y: p.ty });
    });
  }
}

