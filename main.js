import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";

let scene;
let camera;
let renderer;
let controls;

init();
animate();

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
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1f2933, 1.1);
  hemiLight.position.set(0, 400, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(150, 200, 100);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const ambient = new THREE.AmbientLight(0x334155, 0.5);
  scene.add(ambient);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.7;
  controls.panSpeed = 0.4;
  controls.target.set(0, 0, 0);

  const loader = new PLYLoader();
  loader.load(
    "centralPark.ply",
    (geometry) => {
      const position = geometry.getAttribute("position");
      if (!position) {
        console.warn("PLY 几何没有 position attribute，无法渲染点云。");
        return;
      }

      geometry.center();
      const bbox = new THREE.Box3().setFromBufferAttribute(position);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1.0;
      const scale = 150 / maxDim;
      geometry.scale(scale, scale, scale);

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

      const useVertexColors = !!finalColorAttr;

      const pointsMaterial = new THREE.PointsMaterial({
        size: 0.014,
        color: 0x6ee7b7,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        vertexColors: useVertexColors,
      });

      const fogColor = new THREE.Color(0x020617);
      scene.fog = new THREE.FogExp2(fogColor, 0.0045);
      scene.background = fogColor.clone();

      const points = new THREE.Points(geometry, pointsMaterial);
      scene.add(points);
    },
    undefined,
    (error) => {
      console.error("加载 PLY 文件出错:", error);
    },
  );

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
