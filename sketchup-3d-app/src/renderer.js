import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- Scene setup ----------

const viewport = document.getElementById('viewport');
const statusEl = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  55,
  viewport.clientWidth / viewport.clientHeight,
  0.01,
  2000
);
camera.position.set(8, 8, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

window.addEventListener('resize', () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(10, 20, 10);
scene.add(sun);

const grid = new THREE.GridHelper(60, 60, 0x445, 0x667);
scene.add(grid);
const axes = new THREE.AxesHelper(3);
scene.add(axes);

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- Model data ----------

let nextId = 1;
/** @type {Map<number, {id:number, points:{x:number,z:number}[], height:number, color:number, mesh: THREE.Mesh}>} */
const solids = new Map();

function triangulateFootprint(points) {
  const vec2 = points.map((p) => new THREE.Vector2(p.x, p.z));
  return THREE.ShapeUtils.triangulateShape(vec2, []);
}

function buildPrismGeometry(points, height) {
  const n = points.length;
  const h = Math.max(height, 0.01);
  const triangles = triangulateFootprint(points);

  const positions = [];
  const pushTri = (a, b, c) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const bottom = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const top = points.map((p) => new THREE.Vector3(p.x, h, p.z));

  for (const [a, b, c] of triangles) {
    pushTri(top[a], top[b], top[c]);
    pushTri(bottom[a], bottom[c], bottom[b]);
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pushTri(bottom[i], bottom[j], top[j]);
    pushTri(bottom[i], top[j], top[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSolid(points, height, color) {
  const geometry = buildPrismGeometry(points, height);
  const material = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.0
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.solidId = nextId;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x1a1a1a })
  );
  mesh.add(edges);

  const solid = { id: nextId, points, height, color, mesh };
  solids.set(nextId, solid);
  scene.add(mesh);
  nextId++;
  return solid;
}

function rebuildSolidGeometry(solid) {
  const newGeometry = buildPrismGeometry(solid.points, solid.height);
  solid.mesh.geometry.dispose();
  solid.mesh.geometry = newGeometry;
  const oldEdges = solid.mesh.children[0];
  if (oldEdges) {
    oldEdges.geometry.dispose();
    oldEdges.geometry = new THREE.EdgesGeometry(newGeometry);
  }
}

function randomColor() {
  const palette = [0xd8c9a3, 0xb5c9d6, 0xc9b6a3, 0xa3c9b0, 0xd6c1c1, 0xc3c9d6];
  return palette[Math.floor(Math.random() * palette.length)];
}

// ---------- Tools ----------

const TOOL = { SELECT: 'select', DRAW: 'draw', PUSHPULL: 'pushpull' };
let currentTool = TOOL.SELECT;

const toolButtons = {
  [TOOL.SELECT]: document.getElementById('tool-select'),
  [TOOL.DRAW]: document.getElementById('tool-draw'),
  [TOOL.PUSHPULL]: document.getElementById('tool-pushpull')
};

function setTool(tool) {
  currentTool = tool;
  for (const key of Object.keys(toolButtons)) {
    toolButtons[key].classList.toggle('active', key === tool);
  }
  controls.enabled = tool === TOOL.SELECT;
  cancelDraw();

  if (tool === TOOL.SELECT) statusEl.textContent = 'Sélection : cliquez-glissez pour orbiter la caméra';
  if (tool === TOOL.DRAW) statusEl.textContent = 'Dessiner : cliquez pour poser des points, Entrée pour fermer la forme, Échap pour annuler';
  if (tool === TOOL.PUSHPULL) statusEl.textContent = 'Push/Pull : cliquez une forme puis faites glisser verticalement pour changer sa hauteur';
}

toolButtons[TOOL.SELECT].addEventListener('click', () => setTool(TOOL.SELECT));
toolButtons[TOOL.DRAW].addEventListener('click', () => setTool(TOOL.DRAW));
toolButtons[TOOL.PUSHPULL].addEventListener('click', () => setTool(TOOL.PUSHPULL));

// ---------- Drawing ----------

let drawPoints = [];
let drawMarkers = [];
let previewLine = null;

function cancelDraw() {
  for (const m of drawMarkers) scene.remove(m);
  drawMarkers = [];
  drawPoints = [];
  if (previewLine) {
    scene.remove(previewLine);
    previewLine.geometry.dispose();
    previewLine = null;
  }
}

function addDrawPoint(point) {
  drawPoints.push({ x: point.x, z: point.z });
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff5533 })
  );
  marker.position.set(point.x, 0.01, point.z);
  scene.add(marker);
  drawMarkers.push(marker);
  updatePreviewLine();
}

function updatePreviewLine(mousePoint) {
  if (previewLine) {
    scene.remove(previewLine);
    previewLine.geometry.dispose();
    previewLine = null;
  }
  const pts = drawPoints.map((p) => new THREE.Vector3(p.x, 0.01, p.z));
  if (mousePoint) pts.push(new THREE.Vector3(mousePoint.x, 0.01, mousePoint.z));
  if (pts.length < 2) return;
  const geometry = new THREE.BufferGeometry().setFromPoints(pts);
  previewLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffaa33 }));
  scene.add(previewLine);
}

function finishDraw() {
  if (drawPoints.length < 3) {
    cancelDraw();
    return;
  }
  const solid = createSolid(drawPoints.slice(), 0.05, randomColor());
  cancelDraw();
  setTool(TOOL.PUSHPULL);
  selectedSolidId = solid.id;
  statusEl.textContent = 'Push/Pull : faites glisser verticalement sur la forme pour lui donner de la hauteur';
}

// ---------- Push / Pull ----------

let selectedSolidId = null;
let pushPullActive = false;
let pushPullStartY = 0;
let pushPullStartHeight = 0;
let pushPullSensitivity = 0.02;

function getIntersection(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}

function intersectGround(event) {
  const raycaster = getIntersection(event);
  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, target);
  return hit;
}

function pickSolid(event) {
  const raycaster = getIntersection(event);
  const meshes = Array.from(solids.values()).map((s) => s.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return null;
  return hits[0].object.userData.solidId;
}

renderer.domElement.addEventListener('click', (event) => {
  if (currentTool !== TOOL.DRAW) return;
  const point = intersectGround(event);
  if (point) addDrawPoint(point);
});

renderer.domElement.addEventListener('mousemove', (event) => {
  if (currentTool === TOOL.DRAW && drawPoints.length > 0) {
    const point = intersectGround(event);
    if (point) updatePreviewLine(point);
  }
  if (currentTool === TOOL.PUSHPULL && pushPullActive && selectedSolidId != null) {
    const solid = solids.get(selectedSolidId);
    if (!solid) return;
    const deltaScreen = pushPullStartY - event.clientY;
    const newHeight = Math.max(0.02, pushPullStartHeight + deltaScreen * pushPullSensitivity);
    solid.height = newHeight;
    rebuildSolidGeometry(solid);
  }
});

renderer.domElement.addEventListener('mousedown', (event) => {
  if (currentTool !== TOOL.PUSHPULL) return;
  const id = pickSolid(event);
  if (id == null) return;
  selectedSolidId = id;
  pushPullActive = true;
  pushPullStartY = event.clientY;
  pushPullStartHeight = solids.get(id).height;
  const dist = camera.position.distanceTo(solids.get(id).mesh.position.clone().add(new THREE.Vector3(0, solids.get(id).height / 2, 0)));
  pushPullSensitivity = Math.max(0.002, dist * 0.0025);
});

window.addEventListener('mouseup', () => {
  pushPullActive = false;
});

window.addEventListener('keydown', (event) => {
  if (currentTool !== TOOL.DRAW) return;
  if (event.key === 'Enter') finishDraw();
  if (event.key === 'Escape') cancelDraw();
});

// ---------- Render loop ----------

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---------- New / Save / Open / Export ----------

function clearScene() {
  for (const solid of solids.values()) {
    scene.remove(solid.mesh);
    solid.mesh.geometry.dispose();
    solid.mesh.material.dispose();
  }
  solids.clear();
  selectedSolidId = null;
  cancelDraw();
}

document.getElementById('action-new').addEventListener('click', () => {
  clearScene();
});

document.getElementById('action-save').addEventListener('click', async () => {
  const data = {
    version: 1,
    solids: Array.from(solids.values()).map((s) => ({
      points: s.points,
      height: s.height,
      color: s.color
    }))
  };
  const result = await window.projectAPI.save(JSON.stringify(data, null, 2));
  if (result.ok) statusEl.textContent = `Projet enregistré : ${result.filePath}`;
});

document.getElementById('action-open').addEventListener('click', async () => {
  const result = await window.projectAPI.open();
  if (!result.ok) return;
  const data = JSON.parse(result.content);
  clearScene();
  for (const s of data.solids || []) {
    createSolid(s.points, s.height, s.color);
  }
  statusEl.textContent = `Projet ouvert : ${result.filePath}`;
});

function exportOBJ() {
  let out = '# Exporte depuis Modeleur 3D\n';
  let vertexOffset = 0;
  let objectIndex = 0;
  for (const solid of solids.values()) {
    objectIndex++;
    out += `o solide_${objectIndex}\n`;
    const positions = solid.mesh.geometry.attributes.position;
    const count = positions.count;
    for (let i = 0; i < count; i++) {
      out += `v ${positions.getX(i)} ${positions.getY(i)} ${positions.getZ(i)}\n`;
    }
    for (let i = 0; i < count; i += 3) {
      const a = vertexOffset + i + 1;
      const b = vertexOffset + i + 2;
      const c = vertexOffset + i + 3;
      out += `f ${a} ${b} ${c}\n`;
    }
    vertexOffset += count;
  }
  return out;
}

document.getElementById('action-export').addEventListener('click', async () => {
  if (solids.size === 0) {
    statusEl.textContent = 'Rien à exporter : dessinez au moins une forme.';
    return;
  }
  const objString = exportOBJ();
  const result = await window.projectAPI.exportObj(objString);
  if (result.ok) statusEl.textContent = `Modèle exporté : ${result.filePath}`;
});
