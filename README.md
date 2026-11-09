# FieldLight 3D - Soccer Pitch Lighting CAD & Auto-Optimize Solver

A high-fidelity single-page WebGL application for simulating and optimizing outdoor sports lighting on customizable soccer fields, built with **Three.js** and physics-grounded photometrics.

---

## 🌟 Key Features

### 1. Pitch Black Environment & Field Customization
- **100% Pitch Black Night**: The base scene has **zero ambient light** (`0.00 lx`), so active simulated lights are the exact and only source of illumination.
- **Customizable Dimensions**: Define pitch Length and Width in meters (defaults to standard FIFA recommendation `105m × 68m`, or switch to 7-a-side `60m × 40m` or Futsal `40m × 20m`).
- **3D Pitch Markings & Fixtures**: Procedural high-contrast pitch stripes, touchlines, center circle, penalty areas, corner arcs, 3D goalposts, and corner flags.
- **False-Color Heatmap Mode**: Instant toggle between realistic turf lighting and an engineering illuminance heatmap (Turbo/Thermal gradient from deep navy `0 lx` to bright red `500+ lx`) with an on-screen colorbar scale.

### 2. Pre-Configured Presets & Deep Manual Controls
- **Preset 1: Basic Work Light**: `10,000 Lumens`, wide beam angle (`110°`), default height `2m`, portable single tripod stand.
- **Preset 2: Pro Tripod Work Light (3-Head)**: `21,000 Lumens`, ultra-wide beam angle (`135°`), default height `2m`, heavy-duty 3-head tripod stand.
- **Preset 3: Stadium Flood Light**: `112,000 Lumens`, focused directional beam (`50°`), default height `18m`, high-mast steel pole with 4-floodlight fixture bank.
- **Preset 4: Custom**: Fully configurable power, cone angle, and dimensions.
- **Responsive Live Sliders for Every Light**:
  - **Height (Z)**: Pole/stand elevation above pitch ($1\text{m} - 35\text{m}$).
  - **Position (X & Y)**: Coordinate placement around or on the field.
  - **Target Aim (X & Y)**: Exact coordinate point on the pitch where the fixture points.
  - **Flux (Lumens)**: Light power ($5,000\text{ lm} - 250,000\text{ lm}$).
  - **Beam Spread Angle**: Cone cutoff angle ($15^\circ - 150^\circ$).
  - **Penumbra Softness**: Edge falloff ($0\% - 100\%$).
  - **Quick Aim Buttons**: Center spot, near goal, far goal, nearest quadrant.

### 3. Real-Time Coverage Scoring & Auto-Optimize Solver
- **Instant Coverage Gauge**: Live metric calculating the percentage of the field surface meeting the usable lux threshold (default $\ge 50\text{ Lux}$ for recreational play, adjustable from $10 - 250\text{ Lux}$).
- **Photometric Engineering Metrics**:
  - **Average Illuminance ($E_{avg}$)**
  - **Minimum Illuminance ($E_{min}$)**
  - **Maximum Illuminance ($E_{max}$)**
  - **Uniformity Ratio ($U_1 = E_{min}/E_{avg}$)**: Standard FIFA/CIE sports lighting metric.
- **⚡ Auto-Optimize Solver**:
  - Uses an asynchronous **Simulated Annealing & Stochastic Search** algorithm.
  - Rapidly simulates hundreds of combinations of **Z-Heights** and **Target Aims** to find the setup yielding maximum field coverage and uniform illumination.
  - Displays a real-time progress bar with live coverage score climbing.
  - Automatically **snaps all UI sliders directly to the winning values** upon completion, allowing you to seamlessly continue manual tweaking from the optimized baseline.

### 4. Interactive 3D Visualization
- **Physically Correct Inverse-Square Attenuation**: $E = \frac{I_0 \cdot \cos(\alpha)}{d^2}$ with Three.js `SpotLight` (`decay = 2.0`).
- **Visual Rigging**:
  - `SpotLightHelper` cone wireframes.
  - Dashed guide rays from fixture heads to ground targets.
  - Glowing circular target reticles on the pitch.
  - 3D poles and tripod stands that automatically scale with height.
- **Camera Presets**:
  - **Perspective 3D** (isometric overview)
  - **Top-Down (Plan)** (bird's-eye photometric view)
  - **Sideline** (touchline pitch-level view)
  - **Behind Goal** (axial stadium view)
  - Smooth pan, zoom, and rotate with `OrbitControls`.

---

## 🚀 How to Run

1. Simply double-click [`index.html`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/index.html) or open it in any modern web browser (Chrome, Edge, Firefox, Safari).
2. Or serve via any local web server:
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```

---

## 📁 File Structure

| File | Purpose |
|------|---------|
| [`index.html`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/index.html) | HTML structure, sidebar control panel, HUD overlays, CDN links |
| [`style.css`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/style.css) | Dark-mode CAD styling, glassmorphism, responsive split layout |
| [`field.js`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/field.js) | Procedural soccer field markings, 3D goalposts, corner flags |
| [`photometrics.js`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/photometrics.js) | Physics engine: inverse-square lux calculations, coverage scoring |
| [`heatmap.js`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/heatmap.js) | False-color lux heatmap texture generator and pitch line overlay |
| [`lights.js`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/lights.js) | SpotLight management, 3D poles/tripods, presets, aim helpers |
| [`optimizer.js`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/optimizer.js) | Asynchronous simulated annealing solver for aims & heights |
| [`app.js`](file:///c:/Users/fmone/Documents/Antigravity/FieldLight/app.js) | Main application coordinator, event listeners, render loop |

