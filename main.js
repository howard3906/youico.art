import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull";

let scene;
let camera;
let renderer;
let controls;
let pointCloud = null;
let outlineLines = null;
let surfaceMesh = null;
let lineMode = false;
let faceMode = false;
let pointCloudOriginalPositions = null;
let pointCloudVertexCount = 0;
const ModelQualitySettings = {
  low: 20000,
  medium: 70000,
  high: 130000,
};
let currentMaxPoints = ModelQualitySettings.high;
let partialFraction = 0.25;
let isPartialMode = false;
let isInteractive = true;
let subdivideLevel = 0;
let surfaceColor = new THREE.Color(0xefc3f9);
let surfaceOpacity = 0.38;
let liquidParams = {
  waveStrength: 0,
  targetWaveStrength: 0,
  distortionStrength: 0,
  targetDistortionStrength: 0,
  wavePhase: 0,
};
let isLiquidMode = false;
let lastPointer = null;
let currentModelURL = null;

init();
animate();

window.addEventListener("unhandledrejection", (event) => {
  console.warn("未处理的Promise拒绝：", event.reason);
  setStatusText("检测到异步错误（可能由浏览器扩展导致），请刷新页面。", true);
});

window.addEventListener("error", (event) => {
  console.warn("窗口错误：", event.error || event.message);
  if (event.error && event.error.message && event.error.message.includes("Extension context invalidated")) {
    setStatusText("检测到扩展上下文被中断，建议关闭浏览器扩展后重试。", true);
  }
});

function init() {
  const container = document.getElementById("scene-container");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050816);

  const fov = 60;
  const aspect = window.innerWidth / window.innerHeight;
  const near = 0.1;
  const far = 2000;
  camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(0, 120, 260);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 5.4;
  container.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1f2933, 5.0);
  hemiLight.position.set(0, 400, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 4.5);
  dirLight.position.set(150, 200, 100);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const ambient = new THREE.AmbientLight(0xffffff, 3.0);
  scene.add(ambient);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.7;
  controls.panSpeed = 0.4;
  controls.target.set(0, 0, 0);

  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  setStatusText(`模型加载中... 当前质量: 低 (1)`, false);
  window.addEventListener("keydown", onQualityKeyDown);
  document.getElementById("btn-partial")?.addEventListener("click", () => {
    isPartialMode = true;
    partialFraction = 0.25;
    setStatusText("已切换为部分展示，正在重新加载...", false);
    loadAndRenderPointCloud();
  });
  document.getElementById("btn-showAll")?.addEventListener("click", () => {
    isPartialMode = false;
    setStatusText("已切换为全部展示，正在重新加载...", false);
    loadAndRenderPointCloud();
  });
  document.getElementById("btn-interactive")?.addEventListener("click", () => {
    isInteractive = !isInteractive;
    controls.enabled = isInteractive;
    setStatusText(isInteractive ? "交互已开启" : "交互已关闭", false);
    document.getElementById("btn-interactive").textContent = isInteractive ? "关闭交互" : "开启交互";
  });

  document.getElementById("btn-outline")?.addEventListener("click", () => {
    lineMode = !lineMode;
    document.getElementById("btn-outline").textContent = lineMode ? "关闭线" : "线";
    setStatusText(lineMode ? "已开启线模式，正在刷新..." : "已关闭线模式，正在刷新...", false);
    loadAndRenderPointCloud();
  });

  document.getElementById("btn-surface")?.addEventListener("click", () => {
    faceMode = !faceMode;
    document.getElementById("btn-surface").textContent = faceMode ? "关闭面" : "面";
    setStatusText(faceMode ? "已开启面模式，正在刷新..." : "已关闭面模式，正在刷新...", false);
    loadAndRenderPointCloud();
  });

  document.getElementById("btn-subdivide")?.addEventListener("click", () => {
    subdivideLevel = (subdivideLevel + 1) % 3;
    const levels = [0, 1, 2];
    document.getElementById("btn-subdivide").textContent = `细分 x${levels[subdivideLevel] + 1}`;
    setStatusText(`细分级别：${levels[subdivideLevel] + 1}，正在刷新...`, false);
    if (faceMode) loadAndRenderPointCloud();
  });

  const colorInput = document.getElementById("surface-color");
  if (colorInput) {
    colorInput.addEventListener("input", (event) => {
      try {
        const value = (event.target && event.target.value) || "#efc3f9";
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
          surfaceColor = new THREE.Color(value);
        } else {
          console.warn("无效颜色值，保留当前颜色：", value);
        }
      } catch (err) {
        console.warn("surfaceColor 解析失败：", err);
      }
      if (faceMode) {
        loadAndRenderPointCloud();
      }
    });
  }

  // 文件选择
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".ply";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  document.getElementById("btn-open")?.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (currentModelURL) URL.revokeObjectURL(currentModelURL);
    currentModelURL = URL.createObjectURL(file);
    setStatusText(`加载 ${file.name} ...`, false);
    loadAndRenderPointCloud();
  });

  window.addEventListener("resize", onWindowResize);
}

function clearPointCloud() {
  if (pointCloud) {
    scene.remove(pointCloud);
    if (pointCloud.geometry) pointCloud.geometry.dispose();
    if (pointCloud.material) pointCloud.material.dispose();
  }
  pointCloud = null;
  pointCloudOriginalPositions = null;
  pointCloudVertexCount = 0;

  if (outlineLines) {
    scene.remove(outlineLines);
    if (outlineLines.geometry) outlineLines.geometry.dispose();
    if (outlineLines.material) outlineLines.material.dispose();
    outlineLines = null;
  }
  if (surfaceMesh) {
    scene.remove(surfaceMesh);
    if (surfaceMesh.geometry) surfaceMesh.geometry.dispose();
    if (surfaceMesh.material) surfaceMesh.material.dispose();
    surfaceMesh = null;
  }
}

async function loadAndRenderPointCloud() {
  clearPointCloud();
  const url = loadModelURL();
  if (!url) {
    setStatusText("请选择一个 PLY 文件", false);
    return;
  }
  const loader = new PLYLoader();
  loader.load(
    url,
    (geometry) => {
      const position = geometry.getAttribute("position");
      if (!position) {
        setStatusText("PLY 模型没有位置属性，显示回退点云。", true);
        createFallbackScene();
        return;
      }

      geometry.center();
      if (isPartialMode) {
        geometry = cropPointCloudPortion(geometry, partialFraction);
      }
      geometry = downsamplePoints(geometry, currentMaxPoints);

      const reducedPos = geometry.getAttribute("position");
      const bbox = new THREE.Box3().setFromBufferAttribute(reducedPos);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1.0;
      const scale = 150 / maxDim;
      geometry.scale(scale, scale, scale);
      applyRadialBrightness(geometry);

      const colorAttribute = geometry.getAttribute("color");
      const hasRGBAttributes =
        geometry.getAttribute("red") &&
        geometry.getAttribute("green") &&
        geometry.getAttribute("blue");
      let finalColorAttr = colorAttribute;
      if (!finalColorAttr && hasRGBAttributes) {
        const red = geometry.getAttribute("red");
        const green = geometry.getAttribute("green");
        const blue = geometry.getAttribute("blue");
        const count = red.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          colors[i * 3 + 0] = (red.getX(i) || 0) / 255;
          colors[i * 3 + 1] = (green.getX(i) || 0) / 255;
          colors[i * 3 + 2] = (blue.getX(i) || 0) / 255;
        }
        finalColorAttr = new THREE.BufferAttribute(colors, 3);
        geometry.setAttribute("color", finalColorAttr);
      }

      const pointsMaterial = new THREE.PointsMaterial({
        size: 0.05,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1.4,
        vertexColors: !!finalColorAttr,
        color: 0xffffff,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const fogColor = new THREE.Color(0x020617);
      scene.fog = new THREE.FogExp2(fogColor, 0.0045);
      scene.background = fogColor.clone();

      const points = new THREE.Points(geometry, pointsMaterial);
      scene.add(points);
      pointCloud = points;

      const posAttr = geometry.getAttribute("position");
      pointCloudOriginalPositions = new Float32Array(posAttr.array);
      pointCloudVertexCount = posAttr.count;

      if (lineMode) {
        if (outlineLines) {
          scene.remove(outlineLines);
          outlineLines.geometry.dispose();
          outlineLines.material.dispose();
          outlineLines = null;
        }
        outlineLines = createOutlineLines(geometry, 2200);
        if (outlineLines) scene.add(outlineLines);
      }
      if (faceMode) {
        if (surfaceMesh) {
          scene.remove(surfaceMesh);
          surfaceMesh.geometry.dispose();
          surfaceMesh.material.dispose();
          surfaceMesh = null;
        }
        surfaceMesh = createSurfaceMesh(geometry);
        if (surfaceMesh) scene.add(surfaceMesh);
      }

      setStatusText(`点云已加载：${pointCloudVertexCount} 点.`, false);
    },
    undefined,
    (error) => {
      console.error("加载 PLY 文件出错:", error);
      setStatusText("模型加载失败，显示回退点云。", true);
      createFallbackScene();
    },
  );
}

function setStatusText(text, isError = false) {
  const statusEl = document.getElementById("status-text");
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#f87171" : "#d1d5db";
}

function createFallbackScene() {
  const fallbackCount = 18000;
  const fallbackPos = new Float32Array(fallbackCount * 3);
  const fallbackColor = new Float32Array(fallbackCount * 3);
  for (let i = 0; i < fallbackCount; i++) {
    const phi = Math.random() * Math.PI * 2;
    const cost = Math.random() * 2 - 1;
    const r = 40 + Math.random() * 20;
    const st = Math.sqrt(1 - cost * cost);
    fallbackPos[i * 3 + 0] = r * st * Math.cos(phi);
    fallbackPos[i * 3 + 1] = r * st * Math.sin(phi);
    fallbackPos[i * 3 + 2] = r * cost;
    fallbackColor[i * 3 + 0] = 0.2 + Math.random() * 0.8;
    fallbackColor[i * 3 + 1] = 0.5 + Math.random() * 0.5;
    fallbackColor[i * 3 + 2] = 0.7 + Math.random() * 0.3;
  }
  const fallbackGeometry = new THREE.BufferGeometry();
  fallbackGeometry.setAttribute("position", new THREE.BufferAttribute(fallbackPos, 3));
  fallbackGeometry.setAttribute("color", new THREE.BufferAttribute(fallbackColor, 3));
  const fallbackMaterial = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const fallbackPoints = new THREE.Points(fallbackGeometry, fallbackMaterial);
  scene.add(fallbackPoints);
  pointCloud = fallbackPoints;
  pointCloudOriginalPositions = fallbackPos;
  pointCloudVertexCount = fallbackCount;

  controls.target.set(0, 0, 0);
  setStatusText("回退点云已加载。按住 Shift 拖动查看液体效果。", false);
}

function downsamplePoints(geometry, maxCount) {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count <= maxCount) return geometry;

  const step = Math.max(1, Math.floor(pos.count / maxCount));
  const keep = Math.min(maxCount, pos.count);

  const outPos = new Float32Array(keep * 3);
  const colorAttr = geometry.getAttribute("color");
  const outColor = colorAttr ? new Float32Array(keep * 3) : null;

  let outIdx = 0;
  for (let i = 0; i < pos.count && outIdx < keep; i += step) {
    outPos[outIdx * 3 + 0] = pos.getX(i);
    outPos[outIdx * 3 + 1] = pos.getY(i);
    outPos[outIdx * 3 + 2] = pos.getZ(i);
    if (outColor && colorAttr) {
      outColor[outIdx * 3 + 0] = colorAttr.getX(i);
      outColor[outIdx * 3 + 1] = colorAttr.getY(i);
      outColor[outIdx * 3 + 2] = colorAttr.getZ(i);
    }
    outIdx += 1;
  }

  const reduced = new THREE.BufferGeometry();
  reduced.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
  if (outColor) {
    reduced.setAttribute("color", new THREE.BufferAttribute(outColor, 3));
  }
  return reduced;
}

function createOutlineLines(geometry, targetCount = 2200) {
  const pos = geometry.getAttribute("position");
  if (!pos) return null;
  const count = pos.count;
  const step = Math.max(1, Math.floor(count / targetCount));
  const sampleIndices = [];
  for (let i = 0; i < count; i += step) sampleIndices.push(i);

  const positions = [];
  for (let i = 0; i < sampleIndices.length; i++) {
    const idx = sampleIndices[i];
    const x = pos.getX(idx);
    const y = pos.getY(idx);
    const z = pos.getZ(idx);

    let best1 = Infinity;
    let best2 = Infinity;
    let idx1 = -1;
    let idx2 = -1;
    for (let j = 0; j < sampleIndices.length; j++) {
      if (i === j) continue;
      const idx2v = sampleIndices[j];
      const dx = pos.getX(idx2v) - x;
      const dy = pos.getY(idx2v) - y;
      const dz = pos.getZ(idx2v) - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best1) {
        best2 = best1;
        idx2 = idx1;
        best1 = d2;
        idx1 = idx2v;
      } else if (d2 < best2) {
        best2 = d2;
        idx2 = idx2v;
      }
    }

    if (idx1 !== -1) {
      positions.push(x, y, z);
      positions.push(pos.getX(idx1), pos.getY(idx1), pos.getZ(idx1));
    }
    if (idx2 !== -1) {
      positions.push(x, y, z);
      positions.push(pos.getX(idx2), pos.getY(idx2), pos.getZ(idx2));
    }
  }

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.LineSegments(lineGeom, lineMat);
}

function cropPointCloudPortion(geometry, fraction) {
  const pos = geometry.getAttribute("position");
  if (!pos || fraction <= 0 || fraction >= 1) return geometry;

  const zValues = [];
  for (let i = 0; i < pos.count; i++) {
    zValues.push(pos.getZ(i));
  }
  zValues.sort((a, b) => a - b);
  const threshold = zValues[Math.floor((1 - fraction) * zValues.length)];

  const keepIndices = [];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) >= threshold) {
      keepIndices.push(i);
    }
  }
  if (keepIndices.length === 0) return geometry;

  const outPos = new Float32Array(keepIndices.length * 3);
  const colorAttr = geometry.getAttribute("color");
  const outColor = colorAttr ? new Float32Array(keepIndices.length * 3) : null;

  for (let i = 0; i < keepIndices.length; i++) {
    const idx = keepIndices[i];
    outPos[i * 3 + 0] = pos.getX(idx);
    outPos[i * 3 + 1] = pos.getY(idx);
    outPos[i * 3 + 2] = pos.getZ(idx);
    if (outColor && colorAttr) {
      outColor[i * 3 + 0] = colorAttr.getX(idx);
      outColor[i * 3 + 1] = colorAttr.getY(idx);
      outColor[i * 3 + 2] = colorAttr.getZ(idx);
    }
  }

  const cropped = new THREE.BufferGeometry();
  cropped.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
  if (outColor) cropped.setAttribute("color", new THREE.BufferAttribute(outColor, 3));
  return cropped;
}

function applyRadialBrightness(geometry) {
  const position = geometry.getAttribute("position");
  if (!position) return;

  const count = position.count;
  let maxDist = 0;
  for (let i = 0; i < count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > maxDist) maxDist = r;
  }
  if (maxDist <= 0) maxDist = 1;

  const colorAttr = geometry.getAttribute("color");
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    const inner = 1 - Math.min(1, r / maxDist);
    const brightness = 0.35 + 0.65 * Math.pow(inner, 0.7);

    if (colorAttr) {
      colors[i * 3 + 0] = (colorAttr.getX(i) || 1.0) * brightness;
      colors[i * 3 + 1] = (colorAttr.getY(i) || 1.0) * brightness;
      colors[i * 3 + 2] = (colorAttr.getZ(i) || 1.0) * brightness;
    } else {
      colors[i * 3 + 0] = brightness;
      colors[i * 3 + 1] = 0.9 * brightness;
      colors[i * 3 + 2] = 0.6 * brightness;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function subdivideTriangle(v0, v1, v2) {
  const a = new THREE.Vector3().addVectors(v0, v1).multiplyScalar(0.5);
  const b = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
  const c = new THREE.Vector3().addVectors(v2, v0).multiplyScalar(0.5);
  return [v0, a, c, a, v1, b, c, b, v2, a, b, c];
}

function subdivideGeometry(geometry, levels = 1) {
  if (levels <= 0) return geometry;
  const pos = geometry.getAttribute("position");
  if (!pos) return geometry;

  let verts = [];
  for (let i = 0; i < pos.count; i += 3) {
    const v0 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const v1 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
    const v2 = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    verts.push(v0, v1, v2);
  }

  for (let l = 0; l < levels; l++) {
    const next = [];
    for (let i = 0; i < verts.length; i += 3) {
      const t = subdivideTriangle(verts[i], verts[i + 1], verts[i + 2]);
      for (let j = 0; j < t.length; j += 3) {
        next.push(t[j], t[j + 1], t[j + 2]);
      }
    }
    verts = next;
  }

  const out = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    out[i * 3] = verts[i].x;
    out[i * 3 + 1] = verts[i].y;
    out[i * 3 + 2] = verts[i].z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

function createSurfaceMesh(geometry) {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count < 3) return null;

  const points = [];
  for (let i = 0; i < pos.count; i++) {
    points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }

  const hull = new ConvexHull().setFromPoints(points);
  let face = hull.faces;
  if (!face || !face.edge) {
    console.warn("ConvexHull 未能生成有效面，跳过面生成。");
    return null;
  }

  const triangleVerts = [];
  let current = face;
  let iterations = 0;
  const maxIterations = 1000; // 防止无限循环
  do {
    if (!current.edge) {
      console.warn("面边无效，跳过此面。");
      current = current.next;
      continue;
    }
    const edge = current.edge;
    const a = edge.tail().point;
    const b = edge.head().point;
    const c = edge.next.head().point;
    if (a && b && c) {
      triangleVerts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    current = current.next;
    iterations++;
  } while (current !== face && iterations < maxIterations);

  if (triangleVerts.length === 0) {
    console.warn("无有效三角形生成，跳过面。");
    return null;
  }

  const baseGeom = new THREE.BufferGeometry();
  baseGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(triangleVerts), 3));
  let meshGeom = baseGeom;
  if (subdivideLevel > 0) {
    meshGeom = subdivideGeometry(baseGeom, subdivideLevel);
  }

  const meshMat = new THREE.MeshStandardMaterial({
    color: surfaceColor,
    transparent: true,
    opacity: surfaceOpacity,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x333355),
    emissiveIntensity: 0.2,
    flatShading: false,
  });
  return new THREE.Mesh(meshGeom, meshMat);
}

function loadModelURL() {
  return currentModelURL;
}

function onQualityKeyDown(event) {
  if (event.key === "1") {
    currentMaxPoints = ModelQualitySettings.low;
    setStatusText("低质量 20k 点，正在重新加载...", false);
    loadAndRenderPointCloud();
  } else if (event.key === "2") {
    currentMaxPoints = ModelQualitySettings.medium;
    setStatusText("中质量 70k 点，正在重新加载...", false);
    loadAndRenderPointCloud();
  } else if (event.key === "3") {
    currentMaxPoints = ModelQualitySettings.high;
    setStatusText("高质量 130k 点，正在重新加载...", false);
    loadAndRenderPointCloud();
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const t = performance.now() * 0.001;
  // 霓虹闪烁点云
  if (pointCloud) {
    const pulse = 1 + 0.15 * Math.sin(t * 4);
    pointCloud.material.size = 0.014 * pulse;
    pointCloud.material.opacity = 0.65 + 0.2 * Math.sin(t * 5);
    if (!pointCloud.material.vertexColors) {
      pointCloud.material.color.setHSL((t * 0.12) % 1, 0.92, 0.65);
    }
    pointCloud.material.needsUpdate = true;
  }

  updateLiquidDeformation();
  controls.update();
  renderer.render(scene, camera);
}

function updateLiquidDeformation() {
  if (!pointCloud || !pointCloudOriginalPositions) return;

  const posAttr = pointCloud.geometry.getAttribute('position');
  if (!posAttr) return;

  liquidParams.waveStrength += (liquidParams.targetWaveStrength - liquidParams.waveStrength) * 0.18;
  liquidParams.distortionStrength += (liquidParams.targetDistortionStrength - liquidParams.distortionStrength) * 0.18;
  liquidParams.wavePhase += 0.05 + liquidParams.waveStrength * 0.05;

  const positions = posAttr.array;

  if (isLiquidMode) {
    for (let i = 0; i < pointCloudVertexCount; i++) {
      const idx = i * 3;
      const baseX = pointCloudOriginalPositions[idx];
      const baseY = pointCloudOriginalPositions[idx + 1];
      const baseZ = pointCloudOriginalPositions[idx + 2];
      const wave = Math.sin(liquidParams.wavePhase + i * 0.017) * 2.4 * liquidParams.waveStrength;
      const noise = (Math.sin(i * 12.9898 + liquidParams.wavePhase) * 43758.5453) % 1;
      positions[idx] = baseX + (noise - 0.5) * liquidParams.distortionStrength * 3;
      positions[idx + 1] = baseY + wave;
      positions[idx + 2] = baseZ + (noise - 0.5) * liquidParams.distortionStrength * 3;
    }
  } else {
    for (let i = 0; i < pointCloudOriginalPositions.length; i++) {
      positions[i] = pointCloudOriginalPositions[i];
    }
  }

  posAttr.needsUpdate = true;
}

function onPointerDown(event) {
  if (!event.shiftKey) return;
  isLiquidMode = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  controls.enabled = false;
  liquidParams.targetWaveStrength = 1.6;
  liquidParams.targetDistortionStrength = 1.2;
}

function onPointerMove(event) {
  if (!isLiquidMode || !lastPointer) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  const move = Math.sqrt(dx * dx + dy * dy);
  const strength = Math.min(1.4, move / 100);
  liquidParams.targetWaveStrength = 1 + strength * 2;
  liquidParams.targetDistortionStrength = 0.6 + strength * 1.6;
  lastPointer = { x: event.clientX, y: event.clientY };
}

function onPointerUp() {
  if (!isLiquidMode) return;
  isLiquidMode = false;
  controls.enabled = true;
  liquidParams.targetWaveStrength = 0;
  liquidParams.targetDistortionStrength = 0;
}
