console.log('[boot] main.js loaded');
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

console.log('[boot] THREE version:', THREE.REVISION);

const PRESETS = [
  { name: '经典白', baseColor: '#f7f8f9', eyeColor: '#111111', badgeColor: '#f5b6d8', showBadge: false },
  { name: '奶油白', baseColor: '#f7f2e8', eyeColor: '#141414', badgeColor: '#f7c6a7', showBadge: false },
  { name: '樱花粉', baseColor: '#f6d6e2', eyeColor: '#1a1a1a', badgeColor: '#f08ab8', showBadge: true },
  { name: '天空蓝', baseColor: '#cfe6ff', eyeColor: '#0f2234', badgeColor: '#6ea9ff', showBadge: true },
  { name: '薄荷绿', baseColor: '#d3f1e5', eyeColor: '#163228', badgeColor: '#78d9b3', showBadge: true },
  { name: '梦幻紫', baseColor: '#ddd2ff', eyeColor: '#231844', badgeColor: '#ab8eff', showBadge: true },
  { name: '钛灰', baseColor: '#c8ced4', eyeColor: '#1c1f22', badgeColor: '#8d99a6', showBadge: true },
  { name: '夜行黑', baseColor: '#1d2127', eyeColor: '#fafafa', badgeColor: '#677288', showBadge: true }
];

const state = {
  params: { ...PRESETS[0] },
  currentAction: 'idle',
  targetAction: 'idle',
  phase: 'action',
  elapsed: 0,
  blink: 1,
  bodyTurn: 0
};

let scene;
let camera;
let renderer;
let controls;
let clock;
let baymax;

const ui = {
  baseColor: document.getElementById('base-color'),
  eyeColor: document.getElementById('eye-color'),
  badgeColor: document.getElementById('badge-color'),
  showBadge: document.getElementById('show-chest-badge'),
  enableShadows: document.getElementById('enable-shadows'),
  resetView: document.getElementById('reset-view'),
  capture: document.getElementById('capture'),
  presetButtons: document.getElementById('preset-buttons')
};

const neutralPose = {
  shoulderL: { x: 0.1, y: -0.08, z: 0.26 },
  shoulderR: { x: 0.1, y: 0.08, z: -0.26 },
  elbowL: { x: 0.17 },
  elbowR: { x: 0.17 },
  hipL: { x: 0.05, y: 0, z: 0.08 },
  hipR: { x: 0.05, y: 0, z: -0.08 },
  kneeL: { x: -0.12 },
  kneeR: { x: -0.12 },
  body: { x: 0, y: 0, z: 0 },
  head: { x: 0, y: 0, z: 0 },
  rootY: 0,
  rootYaw: 0
};

const torsoCollider = {
  center: new THREE.Vector3(0, 1.36, 0.03),
  radii: new THREE.Vector3(0.92, 1.08, 0.8)
};

const armMeta = {
  L: { shoulderPos: new THREE.Vector3(-0.95, 1.62, 0.08), sideSign: -1, outMin: 0.08, yawMin: -1.05, yawMax: 0.24 },
  R: { shoulderPos: new THREE.Vector3(0.95, 1.62, 0.08), sideSign: 1, outMin: -0.08, yawMin: -0.24, yawMax: 1.05 }
};

function clampAngle(v, min, max) {
  return THREE.MathUtils.clamp(v, min, max);
}

function makeBodyMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.64,
    metalness: 0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.64
  });
}

function initScene() {
  const container = document.getElementById('scene-wrap');
  const canvas = document.getElementById('three-canvas');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const width = canvas.clientWidth || container.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || container.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!renderer.domElement.parentElement) container.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 1.9, 4.6);
  camera.lookAt(0, 1.25, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.25, 0);
  controls.minDistance = 2.2;
  controls.maxDistance = 7.6;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x95a7b8, 0.86);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.18);
  key.position.set(2.8, 4.5, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdce9f8, 0.46);
  fill.position.set(-3.4, 2.4, -2.4);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 96),
    new THREE.MeshStandardMaterial({ color: '#cdd8e2', roughness: 0.95, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);

  baymax = createBaymax();
  scene.add(baymax.root);

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
}

function createBaymax() {
  const root = new THREE.Group();

  const bodyMat = makeBodyMaterial(state.params.baseColor);
  const eyeMat = new THREE.MeshBasicMaterial({ color: state.params.eyeColor });
  const badgeMat = new THREE.MeshStandardMaterial({ color: state.params.badgeColor, roughness: 0.5, metalness: 0.02 });

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.84;
  root.add(pelvis);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.5;
  pelvis.add(bodyGroup);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 46), bodyMat);
  torso.scale.set(1.0, 1.2, 0.9);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  const chestLine = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.009, 12, 100),
    new THREE.MeshStandardMaterial({ color: '#dfe4ea', roughness: 0.8, metalness: 0 })
  );
  chestLine.rotation.x = Math.PI / 2;
  chestLine.position.set(0, 0.34, 0.01);
  bodyGroup.add(chestLine);

  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.08, 30), badgeMat);
  badge.position.set(0.3, 0.32, 0.81);
  badge.visible = state.params.showBadge;
  bodyGroup.add(badge);

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.58;
  pelvis.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 36, 26), bodyMat);
  head.scale.set(1.28, 0.82, 0.98);
  head.castShadow = true;
  headPivot.add(head);

  const eyeSpacing = 0.112;
  const eyeZ = 0.305;
  const eyeY = 0.02;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 16), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-eyeSpacing, eyeY, eyeZ);
  eyeR.position.set(eyeSpacing, eyeY, eyeZ);
  headPivot.add(eyeL, eyeR);

  const eyeBridge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, eyeSpacing * 2, 10), eyeMat);
  eyeBridge.rotation.z = Math.PI / 2;
  eyeBridge.position.set(0, eyeY, eyeZ + 0.002);
  headPivot.add(eyeBridge);

  // 1) 手臂枢轴与 neutral pose 设置：肩枢轴贴体外侧略前，前臂与手掌按层级挂接
  const shoulderL = new THREE.Group();
  const shoulderR = new THREE.Group();
  shoulderL.position.copy(armMeta.L.shoulderPos);
  shoulderR.position.copy(armMeta.R.shoulderPos);
  pelvis.add(shoulderL, shoulderR);

  const upperArmGeo = new THREE.CapsuleGeometry(0.13, 0.66, 9, 18);
  const foreArmGeo = new THREE.CapsuleGeometry(0.115, 0.58, 9, 18);

  const upperArmL = new THREE.Mesh(upperArmGeo, bodyMat);
  upperArmL.position.y = -0.44;
  upperArmL.castShadow = true;
  shoulderL.add(upperArmL);

  const upperArmR = upperArmL.clone();
  shoulderR.add(upperArmR);

  const elbowL = new THREE.Group();
  const elbowR = new THREE.Group();
  elbowL.position.y = -0.86;
  elbowR.position.y = -0.86;
  shoulderL.add(elbowL);
  shoulderR.add(elbowR);

  const foreArmL = new THREE.Mesh(foreArmGeo, bodyMat);
  foreArmL.position.y = -0.35;
  foreArmL.castShadow = true;
  elbowL.add(foreArmL);

  const foreArmR = foreArmL.clone();
  elbowR.add(foreArmR);

  const handGeo = new THREE.SphereGeometry(0.165, 24, 20);
  const handL = new THREE.Mesh(handGeo, bodyMat);
  handL.scale.set(1.02, 0.9, 1.08);
  handL.position.y = -0.72;
  handL.castShadow = true;
  elbowL.add(handL);

  const handR = handL.clone();
  elbowR.add(handR);

  const hipL = new THREE.Group();
  const hipR = new THREE.Group();
  hipL.position.set(-0.35, 0.02, 0);
  hipR.position.set(0.35, 0.02, 0);
  pelvis.add(hipL, hipR);

  const thighGeo = new THREE.CapsuleGeometry(0.185, 0.26, 8, 14);
  const shinGeo = new THREE.CapsuleGeometry(0.168, 0.24, 8, 14);

  const thighL = new THREE.Mesh(thighGeo, bodyMat);
  thighL.position.y = -0.25;
  thighL.castShadow = true;
  hipL.add(thighL);

  const thighR = thighL.clone();
  hipR.add(thighR);

  const kneeL = new THREE.Group();
  const kneeR = new THREE.Group();
  kneeL.position.y = -0.52;
  kneeR.position.y = -0.52;
  hipL.add(kneeL);
  hipR.add(kneeR);

  const shinL = new THREE.Mesh(shinGeo, bodyMat);
  shinL.position.y = -0.22;
  shinL.castShadow = true;
  kneeL.add(shinL);

  const shinR = shinL.clone();
  kneeR.add(shinR);

  const footGeo = new THREE.SphereGeometry(0.21, 26, 18);
  const footL = new THREE.Mesh(footGeo, bodyMat);
  footL.scale.set(1.42, 0.58, 1.62);
  footL.position.set(0, -0.45, 0.12);
  footL.castShadow = true;
  footL.rotation.y = 0.05;
  kneeL.add(footL);

  const footR = footL.clone();
  footR.rotation.y = -0.05;
  kneeR.add(footR);

  const heart = createHeartMesh();
  heart.visible = false;
  heart.position.set(0, 1.28, 0.95);
  pelvis.add(heart);

  return {
    root,
    pelvis,
    bodyGroup,
    headPivot,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    hipL,
    hipR,
    kneeL,
    kneeR,
    heart,
    badge,
    eyeMat,
    materials: { bodyMat, badgeMat }
  };
}

function createHeartMesh() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0, 0.18, -0.25, 0.22, -0.25, 0.02);
  shape.bezierCurveTo(-0.25, -0.18, 0, -0.27, 0, -0.12);
  shape.bezierCurveTo(0, -0.27, 0.25, -0.18, 0.25, 0.02);
  shape.bezierCurveTo(0.25, 0.22, 0, 0.18, 0, 0);
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ff6fa8',
    emissive: '#ff4f96',
    emissiveIntensity: 0.62,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(0.4);
  return mesh;
}

function applyParams(syncUI = true) {
  const p = state.params;
  baymax.materials.bodyMat.color.set(p.baseColor);
  baymax.eyeMat.color.set(p.eyeColor);
  baymax.materials.badgeMat.color.set(p.badgeColor);
  baymax.badge.visible = p.showBadge;

  if (syncUI) {
    ui.baseColor.value = p.baseColor;
    ui.eyeColor.value = p.eyeColor;
    ui.badgeColor.value = p.badgeColor;
    ui.showBadge.checked = p.showBadge;
  }
}

function setAction(action) {
  if (state.targetAction === action) return;
  state.targetAction = action;
  state.phase = 'toNeutral';
}

function damp(current, target, speed, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * dt));
}

function makePose() {
  return JSON.parse(JSON.stringify(neutralPose));
}

function applyActionPose(pose, action, t) {
  if (action === 'wave') {
    pose.shoulderR.x = -1.15;
    pose.shoulderR.z = -0.34;
    pose.shoulderR.y = 0.26;
    pose.elbowR.x = 0.9;
    pose.shoulderL.z = 0.3;
    pose.head.y = Math.sin(t * 2.5) * 0.08;
  }

  if (action === 'heart') {
    pose.shoulderL.x = -0.78;
    pose.shoulderR.x = -0.78;
    pose.shoulderL.y = -0.14;
    pose.shoulderR.y = 0.14;
    pose.shoulderL.z = 0.34;
    pose.shoulderR.z = -0.34;
    pose.elbowL.x = 1.28;
    pose.elbowR.x = 1.28;
    pose.body.x = 0.04;
  }

  if (action === 'dance') {
    pose.body.z = Math.sin(t * 2.2) * 0.22;
    pose.head.y = Math.sin(t * 2.2) * 0.24;
    pose.shoulderL.z = 0.34 + Math.sin(t * 4.3) * 0.36;
    pose.shoulderR.z = -0.34 - Math.sin(t * 4.3 + 0.8) * 0.36;
    pose.hipL.x = 0.06 + Math.sin(t * 3.2) * 0.18;
    pose.hipR.x = 0.06 + Math.sin(t * 3.2 + Math.PI) * 0.18;
    pose.rootY = Math.abs(Math.sin(t * 3.2)) * 0.05;
  }

  if (action === 'spin') {
    pose.rootYaw = (t * 0.85) % (Math.PI * 2);
    pose.head.y = Math.sin(t * 1.1) * 0.14;
  }

  if (action === 'hug') {
    pose.shoulderL.x = -0.72;
    pose.shoulderR.x = -0.72;
    pose.shoulderL.z = 0.28;
    pose.shoulderR.z = -0.28;
    pose.shoulderL.y = -0.18;
    pose.shoulderR.y = 0.18;
    pose.elbowL.x = 1.18;
    pose.elbowR.x = 1.18;
    pose.body.x = 0.13;
    pose.head.x = -0.07;
  }

  if (action === 'comfort') {
    pose.head.x = Math.sin(t * 3) * 0.16;
    pose.shoulderR.x = -0.6;
    pose.elbowR.x = 0.84 + Math.sin(t * 3) * 0.2;
    pose.shoulderL.z = 0.27;
    pose.body.z = Math.sin(t * 3) * 0.05;
  }

  return pose;
}

function getLimbSamples(side, shoulderRot, elbowRot) {
  const meta = armMeta[side];
  const shoulder = meta.shoulderPos.clone();
  const upperLen = 0.78;
  const foreLen = 0.72;

  const upperDir = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(shoulderRot.x, shoulderRot.y, shoulderRot.z, 'XYZ'));
  const elbowPos = shoulder.clone().addScaledVector(upperDir, upperLen);
  const foreDir = new THREE.Vector3(0, -1, 0).applyEuler(
    new THREE.Euler(shoulderRot.x + elbowRot.x * 0.88, shoulderRot.y, shoulderRot.z, 'XYZ')
  );

  const wristPos = elbowPos.clone().addScaledVector(foreDir, foreLen);

  return [
    shoulder.clone().lerp(elbowPos, 0.3),
    shoulder.clone().lerp(elbowPos, 0.7),
    elbowPos.clone().lerp(wristPos, 0.33),
    elbowPos.clone().lerp(wristPos, 0.66),
    wristPos
  ];
}

function isInsideTorso(point) {
  const d = point.clone().sub(torsoCollider.center);
  const q = (d.x * d.x) / (torsoCollider.radii.x * torsoCollider.radii.x)
          + (d.y * d.y) / (torsoCollider.radii.y * torsoCollider.radii.y)
          + (d.z * d.z) / (torsoCollider.radii.z * torsoCollider.radii.z);
  return q < 1;
}

// 2) 关节约束 clamp：肩/肘角度范围与内收限制，避免反折和向体内卷入
function applyArmConstraints(side, pose) {
  const shoulder = side === 'L' ? pose.shoulderL : pose.shoulderR;
  const elbow = side === 'L' ? pose.elbowL : pose.elbowR;
  const meta = armMeta[side];

  shoulder.x = clampAngle(shoulder.x, -1.35, 0.9);
  shoulder.y = clampAngle(shoulder.y, meta.yawMin, meta.yawMax);
  shoulder.z = side === 'L' ? clampAngle(shoulder.z, meta.outMin, 1.25) : clampAngle(shoulder.z, -1.25, meta.outMin);
  elbow.x = clampAngle(elbow.x, 0, 2.05);

  // 3) 简易碰撞（椭球检测 + push-out）：采样手臂点进入躯干则向外推回
  for (let i = 0; i < 4; i++) {
    const samples = getLimbSamples(side, shoulder, elbow);
    const hit = samples.some(isInsideTorso);
    if (!hit) break;

    if (side === 'L') {
      shoulder.y -= 0.08;
      shoulder.z += 0.05;
    } else {
      shoulder.y += 0.08;
      shoulder.z -= 0.05;
    }
    shoulder.x += 0.04;

    shoulder.x = clampAngle(shoulder.x, -1.35, 0.9);
    shoulder.y = clampAngle(shoulder.y, meta.yawMin, meta.yawMax);
    shoulder.z = side === 'L' ? clampAngle(shoulder.z, meta.outMin, 1.25) : clampAngle(shoulder.z, -1.25, meta.outMin);
  }
}

function applyPose(pose, dt) {
  applyArmConstraints('L', pose);
  applyArmConstraints('R', pose);

  baymax.shoulderL.rotation.x = damp(baymax.shoulderL.rotation.x, pose.shoulderL.x, 10, dt);
  baymax.shoulderL.rotation.y = damp(baymax.shoulderL.rotation.y, pose.shoulderL.y, 10, dt);
  baymax.shoulderL.rotation.z = damp(baymax.shoulderL.rotation.z, pose.shoulderL.z, 10, dt);

  baymax.shoulderR.rotation.x = damp(baymax.shoulderR.rotation.x, pose.shoulderR.x, 10, dt);
  baymax.shoulderR.rotation.y = damp(baymax.shoulderR.rotation.y, pose.shoulderR.y, 10, dt);
  baymax.shoulderR.rotation.z = damp(baymax.shoulderR.rotation.z, pose.shoulderR.z, 10, dt);

  baymax.elbowL.rotation.x = damp(baymax.elbowL.rotation.x, pose.elbowL.x, 12, dt);
  baymax.elbowR.rotation.x = damp(baymax.elbowR.rotation.x, pose.elbowR.x, 12, dt);

  baymax.hipL.rotation.x = damp(baymax.hipL.rotation.x, pose.hipL.x, 8, dt);
  baymax.hipR.rotation.x = damp(baymax.hipR.rotation.x, pose.hipR.x, 8, dt);
  baymax.hipL.rotation.z = damp(baymax.hipL.rotation.z, pose.hipL.z, 8, dt);
  baymax.hipR.rotation.z = damp(baymax.hipR.rotation.z, pose.hipR.z, 8, dt);

  baymax.kneeL.rotation.x = damp(baymax.kneeL.rotation.x, pose.kneeL.x, 8, dt);
  baymax.kneeR.rotation.x = damp(baymax.kneeR.rotation.x, pose.kneeR.x, 8, dt);

  baymax.bodyGroup.rotation.x = damp(baymax.bodyGroup.rotation.x, pose.body.x, 7, dt);
  baymax.bodyGroup.rotation.y = damp(baymax.bodyGroup.rotation.y, pose.body.y, 7, dt);
  baymax.bodyGroup.rotation.z = damp(baymax.bodyGroup.rotation.z, pose.body.z, 7, dt);

  baymax.headPivot.rotation.x = damp(baymax.headPivot.rotation.x, pose.head.x, 7, dt);
  baymax.headPivot.rotation.y = damp(baymax.headPivot.rotation.y, pose.head.y, 7, dt);
  baymax.headPivot.rotation.z = damp(baymax.headPivot.rotation.z, pose.head.z, 7, dt);

  baymax.root.position.y = damp(baymax.root.position.y, pose.rootY, 8, dt);
  state.bodyTurn = damp(state.bodyTurn, pose.rootYaw, 7, dt);
  baymax.root.rotation.y = state.bodyTurn;
}

function animateLoop() {
  const dt = clock.getDelta();
  state.elapsed += dt;
  const t = state.elapsed;

  controls.update();

  let pose = makePose();

  pose.rootY += Math.sin(t * 2.1) * 0.015;
  pose.body.z += Math.sin(t * 1.4) * 0.035;
  pose.head.y += Math.sin(t * 0.9) * 0.08;

  if (Math.sin(t * 2.9) > 0.992) state.blink = 0.2;
  state.blink = damp(state.blink, 1, 14, dt);
  const eyeScale = THREE.MathUtils.clamp(state.blink, 0.2, 1);
  baymax.headPivot.children.forEach((obj) => {
    if (obj.geometry && obj.geometry.type === 'SphereGeometry' && obj.material === baymax.eyeMat) {
      obj.scale.y = eyeScale;
    }
  });

  if (state.phase === 'toNeutral') {
    const totalDelta =
      Math.abs(baymax.shoulderL.rotation.z - neutralPose.shoulderL.z)
      + Math.abs(baymax.shoulderR.rotation.z - neutralPose.shoulderR.z)
      + Math.abs(baymax.elbowL.rotation.x - neutralPose.elbowL.x)
      + Math.abs(baymax.elbowR.rotation.x - neutralPose.elbowR.x)
      + Math.abs(baymax.bodyGroup.rotation.x)
      + Math.abs(baymax.bodyGroup.rotation.z)
      + Math.abs(baymax.root.rotation.y);

    if (totalDelta < 0.05) {
      state.currentAction = state.targetAction;
      state.phase = 'action';
    }
  } else {
    pose = applyActionPose(pose, state.currentAction, t);
  }

  baymax.heart.visible = false;
  if (state.currentAction === 'heart' && state.phase === 'action') {
    baymax.heart.visible = true;
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    baymax.heart.scale.setScalar(0.4 * pulse);
    baymax.heart.material.opacity = 0.66 + 0.26 * (Math.sin(t * 6) * 0.5 + 0.5);
  }

  applyPose(pose, dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animateLoop);
}

function captureScreenshot() {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `baymax-${Date.now()}.png`;
  a.click();
}

function onResize() {
  const container = document.getElementById('scene-wrap');
  const w = renderer.domElement.clientWidth || container.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function bindUI() {
  PRESETS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.textContent = preset.name;
    btn.addEventListener('click', () => {
      state.params = { ...preset };
      applyParams(true);
    });
    ui.presetButtons.appendChild(btn);
  });

  ui.baseColor.addEventListener('input', (e) => {
    state.params.baseColor = e.target.value;
    applyParams(false);
  });
  ui.eyeColor.addEventListener('input', (e) => {
    state.params.eyeColor = e.target.value;
    applyParams(false);
  });
  ui.badgeColor.addEventListener('input', (e) => {
    state.params.badgeColor = e.target.value;
    applyParams(false);
  });
  ui.showBadge.addEventListener('change', (e) => {
    state.params.showBadge = e.target.checked;
    applyParams(false);
  });

  ui.enableShadows.addEventListener('change', (e) => {
    renderer.shadowMap.enabled = e.target.checked;
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = e.target.checked;
        if (obj !== baymax.badge) obj.receiveShadow = e.target.checked;
      }
    });
  });

  ui.resetView.addEventListener('click', () => {
    camera.position.set(0, 1.9, 4.6);
    controls.target.set(0, 1.25, 0);
    controls.update();
  });

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => setAction(btn.dataset.action));
  });

  ui.capture.addEventListener('click', captureScreenshot);
}

initScene();
bindUI();
applyParams(true);
animateLoop();
