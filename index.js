import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import getStarfield from "./src/getStarfield.js";
import countries from './src/countriesLatLng.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 0, 4);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const popup = document.createElement("div");
popup.id = "hoverPopup";
popup.style.position = "absolute";
popup.style.top = "10px";
popup.style.left = "10px";
popup.style.background = "rgba(0,0,0,0.7)";
popup.style.color = "white";
popup.style.padding = "8px 12px";
popup.style.borderRadius = "6px";
popup.style.fontFamily = "sans-serif";
popup.style.pointerEvents = "none";
popup.style.display = "none";
popup.style.zIndex = 10;
document.body.appendChild(popup);

const orbitCtrl = new OrbitControls(camera, renderer.domElement);
orbitCtrl.enableDamping = true;

const raycaster = new THREE.Raycaster();
const pointerPos = new THREE.Vector2();
const globeUV = new THREE.Vector2();

const textureLoader = new THREE.TextureLoader();
const starSprite = textureLoader.load("./src/circle.png");
const otherMap = textureLoader.load("./src/04_rainbow1k.jpg");
const colorMap = textureLoader.load("./src/00_earthmap1k.jpg");
const elevMap = textureLoader.load("./src/01_earthbump1k.jpg");
const alphaMap = textureLoader.load("./src/02_earthspec1k.jpg");

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const geo = new THREE.IcosahedronGeometry(1, 16);
const mat = new THREE.MeshBasicMaterial({ 
  color: 0x0099ff,
  wireframe: true,
  transparent: true,
  opacity: 0.1
});
const globe = new THREE.Mesh(geo, mat);
globeGroup.add(globe);

const detail = 120;
const pointsGeo = new THREE.IcosahedronGeometry(1, detail);

const vertexShader = `
  uniform float size;
  uniform sampler2D elevTexture;
  uniform vec2 mouseUV;

  varying vec2 vUv;
  varying float vVisible;
  varying float vDist;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    float elv = texture2D(elevTexture, vUv).r;
    vec3 vNormal = normalMatrix * normal;
    vVisible = step(0.0, dot( -normalize(mvPosition.xyz), normalize(vNormal)));
    mvPosition.z += 0.35 * elv;

    float dist = distance(mouseUV, vUv);
    float zDisp = 0.0;
    float thresh = 0.04;
    if (dist < thresh) {
      zDisp = (thresh - dist) * 10.0;
    }
    vDist = dist;
    mvPosition.z += zDisp;

    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const fragmentShader = `
  uniform sampler2D colorTexture;
  uniform sampler2D alphaTexture;
  uniform sampler2D otherTexture;

  varying vec2 vUv;
  varying float vVisible;
  varying float vDist;

  void main() {
    if (floor(vVisible + 0.1) == 0.0) discard;
    float alpha = 1.0 - texture2D(alphaTexture, vUv).r;
    vec3 color = texture2D(colorTexture, vUv).rgb;
    vec3 other = texture2D(otherTexture, vUv).rgb;
    float thresh = 0.04;
    if (vDist < thresh) {
      color = mix(color, other, (thresh - vDist) * 50.0);
    }
    gl_FragColor = vec4(color, alpha);
  }
`;
const uniforms = {
  size: { type: "f", value: 4.0 },
  colorTexture: { type: "t", value: colorMap },
  otherTexture: { type: "t", value: otherMap },
  elevTexture: { type: "t", value: elevMap },
  alphaTexture: { type: "t", value: alphaMap },
  mouseUV: { type: "v2", value: new THREE.Vector2(0.0, 0.0) },
};
const pointsMat = new THREE.ShaderMaterial({
  uniforms: uniforms,
  vertexShader,
  fragmentShader,
  transparent: true
});

const points = new THREE.Points(pointsGeo, pointsMat);
globeGroup.add(points);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080820, 3);
scene.add(hemiLight);

const stars = getStarfield({ numStars:4500, sprite: starSprite });
scene.add(stars);

function uvToLatLng(uv) {
  const lon = uv.x * 360 - 180;
  const lat = 90 - uv.y * 180;
  return { lat, lon };
}

function getTimezoneInfo(lat, lon) {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time = new Date().toLocaleString("en-US", {
      timeZone: timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return { timeZone, time };
  } catch {
    return { timeZone: "Unknown", time: "Unknown" };
  }
}

function getCountryName(lat, lon) {
  for (let country of countries) {
    if (
      lat >= country.latMin && lat <= country.latMax &&
      lon >= country.lonMin && lon <= country.lonMax
    ) {
      return country.name;
    }
  }
  return "Unknown";
}

function handleRaycast(evt) {
  raycaster.setFromCamera(pointerPos, camera);
  const intersects = raycaster.intersectObjects([globe], false);
  if (intersects.length > 0) {
    const uv = intersects[0].uv;
    globeUV.copy(uv);
    uniforms.mouseUV.value = globeUV;

    const { lat, lon } = uvToLatLng(uv);
    const country = getCountryName(lat, lon);
    const { timeZone, time } = getTimezoneInfo(lat, lon);

    popup.innerHTML = `
      <strong>${country}</strong><br>
      Timezone: ${timeZone}<br>
      Local Time: ${time}
    `;
    popup.style.left = evt.clientX + 15 + "px";
    popup.style.top = evt.clientY + 15 + "px";
    popup.style.display = "block";
  } else {
    popup.style.display = "none";
  }
}

function animate() {
  renderer.render(scene, camera);
  globeGroup.rotation.y += 0.002;
  requestAnimationFrame(animate);
  orbitCtrl.update();
};
animate();

window.addEventListener('mousemove', (evt) => {
  pointerPos.set(
    (evt.clientX / window.innerWidth) * 2 - 1,
    -(evt.clientY / window.innerHeight) * 2 + 1
  );
  handleRaycast(evt);
});

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}, false);
