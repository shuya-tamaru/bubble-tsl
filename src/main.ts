import "./style.css";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  abs,
  float,
  Fn,
  If,
  Loop,
  uniform,
  uv,
  vec4,
  fract,
  floor,
  mix,
  vec3,
  normalLocal,
  positionLocal,
  mod,
  dot,
  texture,
  clamp,
} from "three/tsl";
import GUI from "lil-gui";

//setup
let width = window.innerWidth;
let height = window.innerHeight;
let aspect = width / height;
let resolution = uniform(new THREE.Vector2(width, height));
let timeStep = uniform(0.0);

//scene
const scene = new THREE.Scene();
scene.background = new THREE.Color("#fff");

//camera
const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
camera.position.y = -3;
camera.position.z = 8;

//renderer
const renderer = new THREE.WebGPURenderer();
renderer.setSize(width, height);
renderer.setClearColor("#000");
document.body.appendChild(renderer.domElement);

// environment
const hdrLoader = new HDRLoader();
hdrLoader.load("./hdr.hdr", (environmentMap) => {
  environmentMap.mapping = THREE.EquirectangularReflectionMapping;

  scene.background = environmentMap;
  scene.environment = environmentMap;
});

//controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.1;
controls.maxDistance = 50;

let geometry = new THREE.IcosahedronGeometry(2.5, 50) as THREE.BufferGeometry;
geometry = mergeVertices(geometry);
geometry.computeTangents();
const material = new THREE.MeshPhysicalNodeMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  envMapIntensity: 3,
  metalness: 0.9,
  roughness: 0.0,
  ior: 1.5,
  thickness: 1.5,
});

const ambientLight = new THREE.AmbientLight(0xffffff, 3.5);
scene.add(ambientLight);

//params
const uNoiseTexture = new THREE.TextureLoader().load("./noiseTexture.png");
const uTimeFrequency = uniform(0.032);
const uFrequency = uniform(0.005);
const uOctaves = uniform(3);
const uAmplitude = uniform(1);
const uNoiseStrength = uniform(2.0);
const uOpacity = uniform(0.4);
const wireframe = uniform(false);
const subdivisions = uniform(50);
const uMinWavelength = uniform(380.0);
const uMaxWavelength = uniform(780.0);
let uCameraPosition = uniform(camera.position);

//@ts-ignore
const permute = Fn(([x]) => {
  return mod(x.mul(34.0).add(1.0).mul(x), 289.0);
});

//@ts-ignore
const noise = Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(vec3(3.0).sub(f.mul(2.0)));

  //@ts-ignore
  const n000 = dot(permute(i.add(vec3(0, 0, 0))), f.sub(vec3(0, 0, 0)));
  //@ts-ignore
  const n100 = dot(permute(i.add(vec3(1, 0, 0))), f.sub(vec3(1, 0, 0)));
  //@ts-ignore
  const n010 = dot(permute(i.add(vec3(0, 1, 0))), f.sub(vec3(0, 1, 0)));
  //@ts-ignore
  const n110 = dot(permute(i.add(vec3(1, 1, 0))), f.sub(vec3(1, 1, 0)));
  //@ts-ignore
  const n001 = dot(permute(i.add(vec3(0, 0, 1))), f.sub(vec3(0, 0, 1)));
  //@ts-ignore
  const n101 = dot(permute(i.add(vec3(1, 0, 1))), f.sub(vec3(1, 0, 1)));
  //@ts-ignore
  const n011 = dot(permute(i.add(vec3(0, 1, 1))), f.sub(vec3(0, 1, 1)));
  //@ts-ignore
  const n111 = dot(permute(i.add(vec3(1, 1, 1))), f.sub(vec3(1, 1, 1)));

  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
});
//@ts-ignore
const fractalNoise = Fn(([p, octaves]) => {
  const noiseValue = float(0.0);
  const amplitude = uniform(1.0).mul(uAmplitude); // 初期振幅
  const frequency = float(1.0);

  Loop(octaves, () => {
    //@ts-ignore
    noiseValue.addAssign(noise(p.mul(frequency)).mul(amplitude));
    amplitude.mulAssign(0.5);
    frequency.mulAssign(2.0);
  });

  return noiseValue;
});

//@ts-ignore
const getDisplacement = Fn(([p]) => {
  const shifted = p.mul(uFrequency).add(vec3(timeStep.mul(uTimeFrequency)));
  //@ts-ignore
  return fractalNoise(shifted, uOctaves);
});

//@ts-ignore
const getDisplacementEffect = Fn(([noiseValue]) => {
  return noiseValue.sin().mul(noiseValue.cos());
});

material.positionNode = Fn(() => {
  //@ts-ignore
  const displacement = getDisplacementEffect(getDisplacement(positionLocal));
  positionLocal.addAssign(normalLocal.mul(displacement));

  return positionLocal;
})();

//@ts-ignore
const wavelengthToRGB = Fn(([wavelength]) => {
  const color = vec3(0.0).toVar();
  const factor = float(0.1).toVar();

  //@ts-ignore
  If(wavelength.greaterThanEqual(380.0).and(wavelength.lessThan(440.0)), () => {
    //@ts-ignore
    color.assign(
      vec3(float(440).sub(wavelength).div(float(440).sub(380)), 0.0, 1.0)
    );
  })
    .ElseIf(
      wavelength.greaterThanEqual(440.0).and(wavelength.lessThan(490.0)),
      () => {
        color.assign(
          vec3(0.0, wavelength.sub(440).div(float(490.0).sub(440.0)), 1.0)
        );
      }
    )
    .ElseIf(
      wavelength.greaterThanEqual(490.0).and(wavelength.lessThan(510.0)),
      () => {
        color.assign(
          vec3(
            0.0,
            1.0,
            float(510.0).sub(wavelength).div(float(510.0).sub(490.0))
          )
        );
      }
    )
    .ElseIf(
      wavelength.greaterThanEqual(510.0).and(wavelength.lessThan(580.0)),
      () => {
        color.assign(
          vec3(wavelength.sub(510).div(float(580.0).sub(510.0)), 1.0, 0.0)
        );
      }
    )
    .ElseIf(
      wavelength.greaterThanEqual(580.0).and(wavelength.lessThan(645.0)),
      () => {
        color.assign(
          vec3(
            1.0,
            float(645.0).sub(wavelength).div(float(645.0).sub(580.0)),
            0.0
          )
        );
      }
    )
    .ElseIf(
      wavelength.greaterThanEqual(645.0).and(wavelength.lessThanEqual(780.0)),
      () => {
        color.assign(vec3(1.0, 0.0, 0.0));
      }
    )
    .Else(() => {
      color.assign(vec3(0.0, 0.0, 0.0));
    });

  // factor adjustment
  If(wavelength.greaterThanEqual(380.0).and(wavelength.lessThan(420.0)), () => {
    factor.assign(
      float(0.1).add(
        float(0.9).mul(wavelength.sub(380.0)).div(float(420.0).sub(380.0))
      )
    );
  })
    .ElseIf(
      wavelength.greaterThanEqual(420.0).and(wavelength.lessThanEqual(700.0)),
      () => {
        factor.assign(1.0);
      }
    )
    .ElseIf(
      wavelength.greaterThan(700.0).and(wavelength.lessThanEqual(780.0)),
      () => {
        factor.assign(
          float(0.1).add(
            float(0.9)
              .mul(float(700.0).sub(wavelength))
              .div(float(780.0).sub(float(700.0)))
          )
        );
      }
    );

  return color.mul(factor);
});

//@ts-ignore
const applyGammaCorrection = Fn(([color, gamma]) => {
  return color.pow(vec3(float(1.0).div(gamma)));
});

material.colorNode = Fn(() => {
  const viewDirection = uCameraPosition.sub(positionLocal).normalize();
  const dotProduct = dot(normalLocal, viewDirection);
  const wavelength = mix(
    uMinWavelength,
    uMaxWavelength,
    abs(dotProduct)
  ).toVar();
  const baseColor = mix(
    vec3(1.0),
    //@ts-ignore
    wavelengthToRGB(clamp(wavelength, uMinWavelength, uMaxWavelength)),
    float(1.0).sub(abs(dotProduct))
  );
  const repeatUv = fract(uv().mul(uNoiseStrength));
  const noiseValue = texture(uNoiseTexture, repeatUv).r;

  wavelength.assign(wavelength.add(noiseValue));
  baseColor.assign(
    mix(
      baseColor,
      //@ts-ignore
      wavelengthToRGB(clamp(wavelength, uMinWavelength, uMaxWavelength)),
      noiseValue
    )
  );
  //@ts-ignore
  baseColor.assign(applyGammaCorrection(baseColor, 2.2));

  //@ts-ignore
  return vec4(baseColor, uOpacity);
})();

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

//gui
const gui = new GUI();
gui.add(uOctaves, "value", 1, 10, 1).name("Octaves");
gui.add(uTimeFrequency, "value", 0.001, 0.1, 0.001).name("Time Frequency");
gui.add(uAmplitude, "value", 0, 2, 0.001).name("Amplitude");
gui.add(uFrequency, "value", 0.001, 0.05, 0.001).name("Frequency");

gui.add(uMinWavelength, "value", 380.0, 780.0, 1).name("Min Wavelength");
gui.add(uMaxWavelength, "value", 380.0, 780.0, 1).name("Max Wavelength");

gui.add(uNoiseStrength, "value", 0, 10, 1.0).name("Noise Strength");
gui.add(uOpacity, "value", 0, 1, 0.1).name("Opacity");

gui
  .add(wireframe, "value")
  .name("Wireframe")
  .onChange(() => {
    material.wireframe = wireframe.value;
  });
gui
  .add(subdivisions, "value", 0, 50, 1)
  .name("Subdivisions")
  .onChange(() => {
    geometry = new THREE.IcosahedronGeometry(2.5, subdivisions.value);
    geometry = mergeVertices(geometry);
    geometry.computeTangents();
    mesh.geometry = geometry;
  });

window.addEventListener("resize", () => {
  aspect = window.innerWidth / window.innerHeight;
  resolution.value.set(window.innerWidth, window.innerHeight);

  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  timeStep.value = 0.0;
});

function animate() {
  timeStep.value += 0.01;
  uCameraPosition.value = camera.position;

  requestAnimationFrame(animate);
  controls.update();
  renderer.renderAsync(scene, camera);
}

animate();
