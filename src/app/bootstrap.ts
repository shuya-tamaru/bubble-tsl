import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
  positionWorld,
} from "three/tsl";
import GUI from "lil-gui";
export function bootstrap(environmentMap: THREE.Texture) {
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

  scene.background = environmentMap;
  scene.environment = environmentMap;

  //controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 50;

  const geometry = new THREE.IcosahedronGeometry(
    2.5,
    50
  ) as THREE.BufferGeometry;

  const material = new THREE.MeshPhysicalNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    metalness: 1.0,
    roughness: 0.0,
  });

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
    const w380 = float(380.0);
    const w420 = float(420.0);
    const w440 = float(440.0);
    const w490 = float(490.0);
    const w510 = float(510.0);
    const w580 = float(580.0);
    const w645 = float(645.0);
    const w700 = float(700.0);
    const w780 = float(780.0);

    const color = vec3(0.0).toVar();
    const factor = float(1.0).toVar();

    //@ts-ignore
    //(value - min)/ (max - min)
    // 0 ~ 1 : min ~ max
    const lerp = Fn(([value, min, max]) => {
      return value.sub(min).div(max.sub(min));
    });

    //@ts-ignore
    //(max - value)/ (max - min)
    // 1 ~ 0 : min ~ max
    const invLerp = Fn(([value, min, max]) => {
      return max.sub(value).div(max.sub(min));
    });

    If(wavelength.greaterThanEqual(w380).and(wavelength.lessThan(w440)), () => {
      //purple to blue
      //(440 - wavelength)/ (440 - 380)
      //@ts-ignore
      color.assign(vec3(invLerp(wavelength, w380, w440), 0.0, 1.0));
    })
      .ElseIf(
        wavelength.greaterThanEqual(w440).and(wavelength.lessThan(w490)),
        () => {
          //blue to sky blue
          //(wavelength - 490)/ (490 - 440)
          //@ts-ignore
          color.assign(vec3(0.0, lerp(wavelength, w440, w490), 1.0));
        }
      )
      .ElseIf(
        wavelength.greaterThanEqual(w490).and(wavelength.lessThan(w510)),
        () => {
          //sky blue to green
          //(510 - wavelength)/ (510 - 490)
          //@ts-ignore
          color.assign(vec3(0.0, 1.0, invLerp(wavelength, w490, w510)));
        }
      )
      .ElseIf(
        wavelength.greaterThanEqual(w510).and(wavelength.lessThan(w580)),
        () => {
          //green to yellow
          //(wavelength - 580)/ (580 - 510)
          //@ts-ignore
          color.assign(vec3(lerp(wavelength, w510, w580), 1.0, 0.0));
        }
      )
      .ElseIf(
        wavelength.greaterThanEqual(w580).and(wavelength.lessThan(w645)),
        () => {
          //yellow to red
          //(645 - wavelength)/ (645 - 580)
          //@ts-ignore
          color.assign(vec3(1.0, invLerp(wavelength, w580, w645), 0.0));
        }
      )
      .ElseIf(
        wavelength.greaterThanEqual(w645).and(wavelength.lessThanEqual(w780)),
        () => {
          //red
          //@ts-ignore
          color.assign(vec3(1.0, 0.0, 0.0));
        }
      )
      .Else(() => {
        color.assign(vec3(0.0));
      });

    If(wavelength.greaterThanEqual(w380).and(wavelength.lessThan(w420)), () => {
      factor.assign(
        //@ts-ignore
        float(0.1).add(float(0.9).mul(lerp(wavelength, w380, w420)))
      );
    })
      //@ts-ignore
      .ElseIf(
        wavelength.greaterThan(w700).and(wavelength.lessThanEqual(w780)),
        () => {
          factor.assign(
            //@ts-ignore
            float(0.1).add(float(0.9).mul(invLerp(wavelength, w700, w780)))
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
    const viewDirection = uCameraPosition.sub(positionWorld).normalize();
    const dotProduct = dot(normalLocal, viewDirection);
    const wavelength = mix(
      uMinWavelength,
      uMaxWavelength,
      abs(dotProduct)
    ).toVar();
    //@ts-ignore
    const waveColor = wavelengthToRGB(wavelength);
    const whiteColor = vec3(1.0);

    const baseColor = mix(
      whiteColor,
      waveColor,
      float(1.0).sub(abs(dotProduct))
    );
    const repeatUv = fract(uv().mul(uNoiseStrength));
    const noiseValue = texture(uNoiseTexture, repeatUv).r;

    baseColor.assign(mix(baseColor, waveColor, noiseValue));
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
      const geometry = new THREE.IcosahedronGeometry(2.5, subdivisions.value);
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
}
