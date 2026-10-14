import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Twisted silk with real depth, surface normals and double-sided lighting. */
function silkGeometry(phase: number) {
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 100; i++) {
    const t = (i / 100) * Math.PI * 2;
    for (const edge of [-1, 1]) {
      const width = (5 + 7 * Math.pow(Math.sin(t), 2)) * edge;
      const twist = t * 2 + phase;
      positions.push(
        (325 + width * Math.cos(twist)) * Math.cos(t),
        (195 + width * Math.cos(twist)) * Math.sin(t),
        Math.sin(t * 2 + phase) * 65 + width * Math.sin(twist),
      );
    }
    if (i < 100) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.rest = new Float32Array(positions);
  return geometry;
}

function petalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -12);
  shape.bezierCurveTo(-18, -2, -14, 17, 0, 19);
  shape.bezierCurveTo(15, 16, 12, 1, 0, -12);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i);
    position.setZ(i, x * x * 0.035 + y * y * 0.009);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function mountStage(canvas: HTMLCanvasElement, host: HTMLElement) {
  let renderer: THREE.WebGLRenderer;
  try {
    const context = canvas.getContext('webgl2', { alpha: true, antialias: false });
    if (!context) return () => {};
    renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  } catch {
    return () => {};
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 4000);
  scene.add(new THREE.HemisphereLight(0xffe7d6, 0x280711, 2.4));
  const key = new THREE.DirectionalLight(0xffe5c9, 3.2);
  key.position.set(-200, 400, 550);
  scene.add(key);
  const stage = new THREE.Group();
  scene.add(stage);
  const ribbons = [0, 1].map((i) => {
    const mesh = new THREE.Mesh(
      silkGeometry(i * 1.8),
      new THREE.MeshStandardMaterial({
        color: i ? 0x80614b : 0xa7090e,
        metalness: 0.65,
        roughness: 0.36,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.set(0.35 + i * 0.8, -0.25, -0.32 + i * 0.45);
    mesh.scale.setScalar(i ? 1.09 : 1);
    stage.add(mesh);
    return mesh;
  });
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xa7090e,
    roughness: 0.55,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const petalShape = petalGeometry();
  const petals = Array.from({ length: 12 }, (_, i) => {
    const mesh = new THREE.Mesh(petalShape, petalMaterial);
    mesh.scale.setScalar(0.45 + (i % 3) * 0.2);
    stage.add(mesh);
    return mesh;
  });
  const pearlMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5a783,
    metalness: 0.35,
    roughness: 0.25,
  });
  const pearlShape = new THREE.SphereGeometry(13, 20, 12);
  const pearls = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(pearlShape, pearlMaterial);
    stage.add(mesh);
    return mesh;
  });
  const textures = new Set<THREE.Texture>();
  const smokeTexture = new THREE.TextureLoader().load('/models/stage/smoke.png');
  textures.add(smokeTexture);
  const smoke = Array.from({ length: 2 }, (_, i) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 230),
      new THREE.MeshBasicMaterial({
        map: smokeTexture,
        color: i ? 0x8b6570 : 0x9b263c,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(i ? -80 : 110, -215, i ? -80 : 65);
    stage.add(mesh);
    return mesh;
  });
  let disposed = false,
    lost = false,
    visible = false,
    frame = 0,
    previous = 0,
    time = 0;
  let mobile = false,
    pointerX = 0,
    pointerY = 0,
    scroll = 0,
    width = 1,
    height = 1;
  const flowers: THREE.Group[] = [];
  const disposeObject = (object: THREE.Object3D) =>
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
    });
  // Tiny CC0 models are served locally. No third-party requests at runtime.
  for (const [i, name] of ['flower-red', 'flower-red-cluster'].entries()) {
    new GLTFLoader().load(
      `/models/stage/${name}.glb`,
      ({ scene: flower }) => {
        if (disposed) {
          disposeObject(flower);
          textures.forEach((texture) => texture.dispose());
          return;
        }
        const bounds = new THREE.Box3().setFromObject(flower);
        const center = bounds.getCenter(new THREE.Vector3()),
          size = bounds.getSize(new THREE.Vector3());
        flower.position.sub(center);
        const group = new THREE.Group();
        group.add(flower);
        group.scale.setScalar(65 / Math.max(size.x, size.y, size.z, 0.01));
        group.position.set(i ? 300 : -280, i ? -165 : 130, -15);
        flower.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(child.material)
            ? child.material
            : [child.material]) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.color.multiplyScalar(0.7);
              material.roughness = 0.65;
            }
          }
        });
        group.userData.index = i;
        stage.add(group);
        flowers.push(group);
      },
      undefined,
      () => {
        /* A missing optional model must not break the stage. */
      },
    );
  }
  const resize = () => {
    const rect = host.getBoundingClientRect();
    const logo = host.querySelector('.crown-stage')?.getBoundingClientRect() ?? rect;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    mobile = width <= 900;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.25, 1600 / width));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = height / (2 * Math.tan(Math.PI / 8));
    camera.updateProjectionMatrix();
    stage.position.set(
      logo.left - rect.left + logo.width / 2 - width / 2,
      height / 2 - (logo.top - rect.top + logo.height / 2),
      -20,
    );
    stage.scale.setScalar(Math.min(logo.width / 700, mobile ? 0.68 : 1.1));
    petals.forEach((petal, i) => {
      petal.visible = i < (mobile ? 5 : 12);
    });
    pearls[2].visible = !mobile;
    smoke[1].visible = !mobile;
  };
  const render = (now: number) => {
    frame = 0;
    if (disposed || lost || !visible || document.hidden) {
      previous = 0;
      return;
    }
    frame = requestAnimationFrame(render);
    if (previous && now - previous < 1000 / 30) return;
    time += previous ? Math.min(now - previous, 70) / 1000 : 0;
    previous = now;
    stage.rotation.y += (pointerX * 0.1 + scroll * 0.2 - stage.rotation.y) * 0.08;
    stage.rotation.x += (pointerY * 0.05 - stage.rotation.x) * 0.08;
    ribbons.forEach((mesh, i) => {
      mesh.rotation.z = -0.32 + i * 0.45 + Math.sin(time * 0.18 + i) * 0.15;
      mesh.rotation.y = Math.sin(time * 0.22 + i) * 0.3;
      mesh.rotation.x = 0.35 + i * 0.8 + Math.sin(time * 0.14) * 0.16;
      const position = mesh.geometry.attributes.position;
      const rest = mesh.geometry.userData.rest as Float32Array;
      for (let j = 0; j < position.count; j++) {
        position.setZ(j, rest[j * 3 + 2] + Math.sin(j / 20 + time * 0.55 + i) * 9);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
    petals.forEach((mesh, i) => {
      mesh.position.set(
        Math.sin(i * 4.1 + time * 0.2) * 280,
        340 - ((time * (15 + (i % 3) * 3) + i * 69) % 680),
        Math.sin(i * 2.7 + time * 0.15) * 100,
      );
      mesh.rotation.set(time * 0.4 + i, time * 0.65 + i * 2, Math.sin(time * 0.5 + i));
    });
    pearls.forEach((mesh, i) => {
      const a = i * 2.1 + time * 0.1;
      mesh.position.set(Math.cos(a) * 325, Math.sin(a) * 220, Math.sin(a) * 90);
      mesh.scale.setScalar(0.6 + i * 0.3);
    });
    smoke.forEach((mesh, i) => {
      mesh.rotation.z = Math.sin(time * 0.07 + i) * 0.12;
      mesh.rotation.y = Math.sin(time * 0.12 + i) * 0.22;
      mesh.position.x = (i ? -80 : 110) + Math.sin(time * 0.13 + i) * 50;
      mesh.scale.setScalar(1 + Math.sin(time * 0.17 + i) * 0.12);
    });
    flowers.forEach((flower) => {
      const i = flower.userData.index as number;
      flower.visible = !mobile || i === 0;
      flower.rotation.set(
        0.2 + Math.sin(time * 0.2) * 0.12,
        time * 0.12 + i,
        (i ? -0.3 : 0.3) + Math.sin(time * 0.3) * 0.08,
      );
      flower.position.y = (i ? -165 : 130) + Math.sin(time * 0.4 + i) * 14;
    });
    renderer.render(scene, camera);
    if (host.dataset.sceneReady !== 'true') host.dataset.sceneReady = 'true';
  };
  const sync = () => {
    const running = visible && !document.hidden && !lost && !disposed;
    host.dataset.sceneRunning = String(running);
    if (running && !frame) frame = requestAnimationFrame(render);
    else if (!running) {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    }
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const rect = host.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / width - 0.5;
    pointerY = (event.clientY - rect.top) / height - 0.5;
  };
  const leave = () => {
    pointerX = pointerY = 0;
  };
  const onScroll = () => {
    scroll = Math.max(0, Math.min(1, -host.getBoundingClientRect().top / height));
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    delete host.dataset.sceneReady;
    sync();
  };
  const onRestored = () => {
    lost = false;
    resize();
    sync();
  };
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  intersection.observe(host);
  host.addEventListener('pointermove', move, { passive: true });
  host.addEventListener('pointerleave', leave);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  resize();
  onScroll();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerleave', leave);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    disposeObject(scene);
    textures.forEach((texture) => texture.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    delete host.dataset.sceneReady;
    delete host.dataset.sceneRunning;
  };
}
