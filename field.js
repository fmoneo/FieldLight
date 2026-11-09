/**
 * FieldLight 3D - Soccer Pitch Geometry & Markings Generator
 * Generates accurate FIFA-scale or custom pitch geometry, grass texture,
 * markings (lines, penalty boxes, arcs, center circle), goalposts, and flags.
 */

class SoccerField {
  constructor(scene, length = 105, width = 68) {
    this.scene = scene;
    this.length = length; // meters (X axis)
    this.width = width;   // meters (Z axis in Three.js, Y axis in user UI)
    
    // Group holding all pitch objects
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // References to materials & meshes for mode toggling (Realistic vs Heatmap)
    this.pitchMesh = null;
    this.realisticMaterial = null;
    this.heatmapMaterial = null;
    this.goalPosts = [];

    this.init();
  }

  init() {
    this.buildPitch();
    this.buildSurroundingBuffer();
    this.buildGoalPosts();
    this.buildCornerFlags();
  }

  /**
   * Generates procedural canvas texture with photorealistic lawn stripes and crisp FIFA markings
   */
  createMarkingsTexture() {
    const canvas = document.createElement('canvas');
    // High-resolution texture for crisp markings
    const scale = 20; // 20 pixels per meter
    canvas.width = Math.round(this.length * scale);
    canvas.height = Math.round(this.width * scale);
    const ctx = canvas.getContext('2d');

    const w = canvas.width;
    const h = canvas.height;
    const m2px = (m) => m * scale;

    // 1. Base Grass with alternating mower stripes
    const stripeCount = 20;
    const stripeWidth = w / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#1b4d24' : '#235f2d';
      ctx.fillRect(i * stripeWidth, 0, stripeWidth, h);
    }

    // Add fine grass noise / grain texture
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * 1.2));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // 2. Soccer Field White Markings (standard 12cm line width)
    const lineWidth = Math.max(2, m2px(0.12));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';

    // Touchlines & Goal lines (Outer perimeter boundary)
    const inset = lineWidth / 2;
    ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);

    // Halfway Line
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Center Circle (Radius 9.15m)
    const centerRadius = m2px(9.15);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, centerRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Center Spot (Radius 0.22m)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, m2px(0.24), 0, Math.PI * 2);
    ctx.fill();

    // Penalty Boxes & Goal Areas (Both Ends)
    const penaltyBoxDepth = m2px(16.5);
    const penaltyBoxWidth = m2px(40.32);
    const goalBoxDepth = m2px(5.5);
    const goalBoxWidth = m2px(18.32);
    const penaltySpotDist = m2px(11.0);

    // Left End Penalty Box & Goal Box
    const penaltyTop = (h - penaltyBoxWidth) / 2;
    const goalTop = (h - goalBoxWidth) / 2;

    // Left Penalty Area
    ctx.strokeRect(0, penaltyTop, penaltyBoxDepth, penaltyBoxWidth);
    // Left Goal Area
    ctx.strokeRect(0, goalTop, goalBoxDepth, goalBoxWidth);
    // Left Penalty Spot
    ctx.beginPath();
    ctx.arc(penaltySpotDist, h / 2, m2px(0.22), 0, Math.PI * 2);
    ctx.fill();
    // Left Penalty Arc (9.15m from spot, outside box)
    ctx.beginPath();
    const arcAngle = Math.acos((penaltyBoxDepth - penaltySpotDist) / centerRadius);
    ctx.arc(penaltySpotDist, h / 2, centerRadius, -arcAngle, arcAngle, false);
    ctx.stroke();

    // Right End Penalty Box & Goal Box
    // Right Penalty Area
    ctx.strokeRect(w - penaltyBoxDepth, penaltyTop, penaltyBoxDepth, penaltyBoxWidth);
    // Right Goal Area
    ctx.strokeRect(w - goalBoxDepth, goalTop, goalBoxDepth, goalBoxWidth);
    // Right Penalty Spot
    ctx.beginPath();
    ctx.arc(w - penaltySpotDist, h / 2, m2px(0.22), 0, Math.PI * 2);
    ctx.fill();
    // Right Penalty Arc
    ctx.beginPath();
    ctx.arc(w - penaltySpotDist, h / 2, centerRadius, Math.PI - arcAngle, Math.PI + arcAngle, false);
    ctx.stroke();

    // Corner Arcs (Radius 1.0m)
    const cornerR = m2px(1.0);
    // Top-Left
    ctx.beginPath(); ctx.arc(0, 0, cornerR, 0, Math.PI / 2); ctx.stroke();
    // Bottom-Left
    ctx.beginPath(); ctx.arc(0, h, cornerR, -Math.PI / 2, 0); ctx.stroke();
    // Top-Right
    ctx.beginPath(); ctx.arc(w, 0, cornerR, Math.PI / 2, Math.PI); ctx.stroke();
    // Bottom-Right
    ctx.beginPath(); ctx.arc(w, h, cornerR, Math.PI, Math.PI * 1.5); ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
  }

  /**
   * Builds the flat field plane
   */
  buildPitch() {
    if (this.pitchMesh) {
      this.group.remove(this.pitchMesh);
      this.pitchMesh.geometry.dispose();
    }

    const geometry = new THREE.PlaneGeometry(this.length, this.width, 32, 32);
    // Orient horizontally: Three.js PlaneGeometry starts in XY plane. Rotate -90deg around X so it lies flat on X-Z ground
    geometry.rotateX(-Math.PI / 2);

    const texture = this.createMarkingsTexture();
    this.realisticMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.FrontSide
    });

    this.heatmapMaterial = new THREE.MeshBasicMaterial({
      side: THREE.FrontSide
    });

    this.pitchMesh = new THREE.Mesh(geometry, this.realisticMaterial);
    this.pitchMesh.receiveShadow = true;
    this.pitchMesh.position.set(0, 0.01, 0); // Slight offset above buffer
    this.group.add(this.pitchMesh);
  }

  /**
   * Buffer turf surrounding the pitch (safety runoff margin)
   */
  buildSurroundingBuffer() {
    if (this.bufferMesh) {
      this.group.remove(this.bufferMesh);
      this.bufferMesh.geometry.dispose();
    }

    const margin = 8; // 8 meters margin around pitch
    const bufferGeo = new THREE.PlaneGeometry(this.length + margin * 2, this.width + margin * 2);
    bufferGeo.rotateX(-Math.PI / 2);

    const bufferMat = new THREE.MeshStandardMaterial({
      color: 0x142b1a, // Darker turf apron
      roughness: 0.95,
      metalness: 0.02
    });

    this.bufferMesh = new THREE.Mesh(bufferGeo, bufferMat);
    this.bufferMesh.position.set(0, 0, 0);
    this.bufferMesh.receiveShadow = true;
    this.group.add(this.bufferMesh);
  }

  /**
   * 3D Goal Posts (7.32m wide, 2.44m high) at both ends of the pitch
   */
  buildGoalPosts() {
    // Clear old goals
    this.goalPosts.forEach(g => this.group.remove(g));
    this.goalPosts = [];

    const goalWidth = 7.32;
    const goalHeight = 2.44;
    const goalDepth = 2.0;
    const postRadius = 0.06; // 12cm diameter posts

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.4
    });

    const netMaterial = new THREE.MeshBasicMaterial({
      color: 0xdde4ec,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });

    const createGoal = (posX, rotY) => {
      const goalGroup = new THREE.Group();

      // Uprights (Left & Right)
      const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16);
      const postLeft = new THREE.Mesh(postGeo, postMaterial);
      postLeft.position.set(0, goalHeight / 2, -goalWidth / 2);
      postLeft.castShadow = true;
      goalGroup.add(postLeft);

      const postRight = new THREE.Mesh(postGeo, postMaterial);
      postRight.position.set(0, goalHeight / 2, goalWidth / 2);
      postRight.castShadow = true;
      goalGroup.add(postRight);

      // Crossbar
      const barGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth + postRadius * 2, 16);
      barGeo.rotateX(Math.PI / 2);
      const crossbar = new THREE.Mesh(barGeo, postMaterial);
      crossbar.position.set(0, goalHeight, 0);
      crossbar.castShadow = true;
      goalGroup.add(crossbar);

      // Back support frame
      const backGeo = new THREE.CylinderGeometry(postRadius * 0.7, postRadius * 0.7, goalDepth, 12);
      backGeo.rotateZ(Math.PI / 2);
      const backLeft = new THREE.Mesh(backGeo, postMaterial);
      backLeft.position.set(-goalDepth / 2, postRadius, -goalWidth / 2);
      goalGroup.add(backLeft);

      const backRight = new THREE.Mesh(backGeo, postMaterial);
      backRight.position.set(-goalDepth / 2, postRadius, goalWidth / 2);
      goalGroup.add(backRight);

      // Netting box
      const netGeo = new THREE.BoxGeometry(goalDepth, goalHeight, goalWidth, 8, 6, 12);
      const netMesh = new THREE.Mesh(netGeo, netMaterial);
      netMesh.position.set(-goalDepth / 2, goalHeight / 2, 0);
      goalGroup.add(netMesh);

      goalGroup.position.set(posX, 0, 0);
      goalGroup.rotation.y = rotY;
      return goalGroup;
    };

    // Left Goal
    const goalLeft = createGoal(-this.length / 2, 0);
    this.group.add(goalLeft);
    this.goalPosts.push(goalLeft);

    // Right Goal
    const goalRight = createGoal(this.length / 2, Math.PI);
    this.group.add(goalRight);
    this.goalPosts.push(goalRight);
  }

  /**
   * Corner Flags at the 4 corners of the field
   */
  buildCornerFlags() {
    if (this.flagsGroup) {
      this.group.remove(this.flagsGroup);
    }
    this.flagsGroup = new THREE.Group();

    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const flagGeo = new THREE.PlaneGeometry(0.35, 0.25);
    const flagMat = new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide });

    const corners = [
      [-this.length / 2, -this.width / 2],
      [-this.length / 2, this.width / 2],
      [this.length / 2, -this.width / 2],
      [this.length / 2, this.width / 2],
    ];

    corners.forEach(([cx, cz]) => {
      const flagUnit = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 0.75;
      flagUnit.add(pole);

      const cloth = new THREE.Mesh(flagGeo, flagMat);
      cloth.position.set(0.18, 1.35, 0);
      flagUnit.add(cloth);

      flagUnit.position.set(cx, 0, cz);
      this.flagsGroup.add(flagUnit);
    });

    this.group.add(this.flagsGroup);
  }

  /**
   * Updates field dimensions dynamically
   */
  updateDimensions(newLength, newWidth) {
    this.length = Math.max(20, parseFloat(newLength));
    this.width = Math.max(15, parseFloat(newWidth));
    this.buildPitch();
    this.buildSurroundingBuffer();
    this.buildGoalPosts();
    this.buildCornerFlags();
  }

  /**
   * Set display mode: 'realistic' or 'heatmap'
   */
  setHeatmapMode(enabled, heatmapTexture = null) {
    if (enabled && heatmapTexture) {
      this.heatmapMaterial.map = heatmapTexture;
      this.heatmapMaterial.needsUpdate = true;
      this.pitchMesh.material = this.heatmapMaterial;
    } else {
      this.pitchMesh.material = this.realisticMaterial;
    }
  }

  /**
   * Coordinate Helpers:
   * Maps UI coordinates (X = length, Y = width, Z = height)
   * to Three.js scene coordinates (X = length, Y = height, Z = width)
   */
  toScenePos(uiX, uiY, uiZ = 0) {
    return new THREE.Vector3(uiX, uiZ, uiY);
  }

  fromScenePos(vec3) {
    return {
      x: vec3.x,
      y: vec3.z,
      z: vec3.y
    };
  }
}

