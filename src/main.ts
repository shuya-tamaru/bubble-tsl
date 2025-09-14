import "./style.css";
import * as THREE from "three/webgpu";
import {
  abs,
  color,
  float,
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  length,
  Loop,
  normalize,
  Switch,
  uint,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec4,
  smoothstep,
} from "three/tsl";
import GUI from "lil-gui";

//setup
let width = window.innerWidth;
let height = window.innerHeight;
let aspect = height ? width / height : 16 / 9;

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1.0);
camera.position.z = 1;

const renderer = new THREE.WebGPURenderer();
renderer.setSize(width, height);
renderer.setClearColor("#000");
document.body.appendChild(renderer.domElement);

//params
const particleCount = 10000;
const typeCount = 6;
const timeScale = uniform(0.4);
const delta = float(1 / 60).mul(timeScale);
const interactionRadius = uniform(0.2);
const transitionRadius = uniform(0.4);
const forceScale = uniform(20);

let positionBuffer = instancedArray(particleCount, "vec2");
let velocityBuffer = instancedArray(particleCount, "vec2");
let typeBuffer = instancedArray(particleCount, "uint");

//colors
const color0 = uniform(color("#9933FF")); // アメジストパープル (深みのある紫)
const color1 = uniform(color("#00CCFF")); // エレクトリックブルー
const color2 = uniform(color("#FF33CC")); // ホットピンク
const color3 = uniform(color("#FFD700")); // ゴールド (光沢感)
const color4 = uniform(color("#00FF66")); // エメラルドグリーン
const color5 = uniform(color("#FFFFFF")); // ホワイト (ハイライト用)

//scale
const scale0 = uniform(0.015);
const scale1 = uniform(0.015);
const scale2 = uniform(0.025);
const scale3 = uniform(0.015);
const scale4 = uniform(0.025);
const scale5 = uniform(0.025);

//prettier-ignore
const interactionMatrix = [
    0.2 , 0.1 , -0.1 , 0.0 , 0.03 , 0.0 ,   //0番目の粒子
    0.03 , 0.0 , -0.2 , 0.2 , 0.1 , 0.0 ,   //1番目の粒子
    0.1 , 0.0 , 0.0 , 0.0 , 0.0 , -0.2 ,   //2番目の粒子
    0.0 , 0.2 , -0.2 , 0.0 , 0.03 , 0.0 ,   //3番目の粒子
    0.03 , 0.0 , 0.0 , 0.01 , -0.01 , 0.01 ,   //4番目の粒子
    0.001 , 0.001 , 0.01 , 0.001 , -0.3 , 0.0,   //5番目の粒子
]

const interactionMatrixNode = uniformArray(interactionMatrix);

//initial compute
const init = Fn(() => {
  const pos = positionBuffer.element(instanceIndex);
  const vel = velocityBuffer.element(instanceIndex);
  const type = typeBuffer.element(instanceIndex);

  const initialPosition = vec2(
    hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
      .sub(0.5)
      .mul(2.0 * aspect),
    hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
      .sub(0.5)
      .mul(2.0)
  );
  const initialVelocity = vec2(0.0);
  const randType = hash(instanceIndex).mul(typeCount).floor().toUint();

  pos.assign(initialPosition);
  vel.assign(initialVelocity);
  type.assign(randType);
});

const initCompute = init().compute(particleCount);
renderer.compute(initCompute);

//update compute
const update = Fn(() => {
  const pos_i = positionBuffer.element(instanceIndex);
  const vel_i = velocityBuffer.element(instanceIndex);
  const type_i = typeBuffer.element(instanceIndex);
  const force_i = vec2(0);

  let j = uint(0);
  Loop(particleCount, () => {
    If(j.equal(instanceIndex), () => {
      j.assign(j.add(uint(1)));
      return;
    });

    const pos_j = positionBuffer.element(j);
    const type_j = typeBuffer.element(j);
    const dir = pos_j.sub(pos_i);
    const dist = dir.length();

    If(dist.greaterThan(interactionRadius), () => {
      j.assign(j.add(uint(1)));
      return;
    });

    let normal = vec2(1.0, 0.0);
    If(dist.greaterThan(float(0.00000000001)), () => {
      normal.assign(normalize(dir));
    }).Else(() => {
      normal.assign(normalize(vec2(1.0, 1.0)));
    });

    const idx = type_i.mul(uint(typeCount)).add(type_j);
    const k = interactionMatrixNode.element(idx);
    const r = dist.div(interactionRadius);
    let w = float(0.0);
    const beta = transitionRadius;
    If(r.lessThan(beta), () => {
      w.assign(r.div(beta).sub(1.0));
    })
      .ElseIf(r.lessThan(1.0), () => {
        const range = float(1.0).sub(beta);
        const center = float(1.0).add(beta).mul(0.5);
        const distance = abs(r.sub(center)).mul(2.0).div(range);
        w.assign(k.mul(float(1.0).sub(distance)));
      })
      .Else(() => {
        w.assign(float(0.0));
      });

    force_i.assign(force_i.add(normal.mul(w).mul(forceScale)));
    j.assign(j.add(uint(1)));
  });

  const frictionFactor = 0.7;
  let new_vel = vel_i.add(force_i.mul(delta));
  new_vel.assign(new_vel.mul(frictionFactor));
  let new_pos = pos_i.add(new_vel.mul(delta));

  If(new_pos.x.greaterThan(float(1.2 * aspect)), () => {
    new_pos.assign(vec2(-1.2 * aspect, new_pos.y));
  })
    .ElseIf(new_pos.x.lessThan(float(-1.2 * aspect)), () => {
      new_pos.assign(vec2(1.2 * aspect, new_pos.y));
    })
    .ElseIf(new_pos.y.greaterThan(float(1.2)), () => {
      new_pos.assign(vec2(new_pos.x, -1.2));
    })
    .ElseIf(new_pos.y.lessThan(float(-1.2)), () => {
      new_pos.assign(vec2(new_pos.x, 1.2));
    });

  vel_i.assign(new_vel);
  pos_i.assign(new_pos);
});

const updateCompute = update().compute(particleCount);

//gft
const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.SpriteNodeMaterial();

material.positionNode = positionBuffer.toAttribute();

material.scaleNode = Fn(() => {
  const type = typeBuffer.element(instanceIndex);
  let scale = float(scale0);

  If(type.equal(0), () => {
    scale.assign(scale0);
  })
    .ElseIf(type.equal(1), () => {
      scale.assign(scale1);
    })
    .ElseIf(type.equal(2), () => {
      scale.assign(scale2);
    })
    .ElseIf(type.equal(3), () => {
      scale.assign(scale3);
    })
    .ElseIf(type.equal(4), () => {
      scale.assign(scale4);
    })
    .ElseIf(type.equal(5), () => {
      scale.assign(scale5);
    });
  return scale;
})();

material.colorNode = Fn(() => {
  const type = typeBuffer.element(instanceIndex);
  let color = vec4(0.0, 0.0, 0.0, 1.0);
  const intensity = float(1.5);

  Switch(type)
    //@ts-ignore
    .Case(uint(0), () => color.assign(color0))
    //@ts-ignore
    .Case(uint(1), () => color.assign(color1))
    //@ts-ignore
    .Case(uint(2), () => color.assign(color2))
    //@ts-ignore
    .Case(uint(3), () => color.assign(color3))
    //@ts-ignore
    .Case(uint(4), () => color.assign(color4))
    //@ts-ignore
    .Case(uint(5), () => color.assign(color5))
    .Default(() => color0);

  return color.mul(intensity);
})();

const shapeSmoothCircle = Fn(() => {
  const st = uv().sub(vec2(0.5));
  const r = length(st);
  const radius = float(0.5);
  const edge = float(0.4);

  const base = float(1.0).sub(smoothstep(radius.sub(edge), radius, r));
  return base.clamp(0.0, 1.0);
});

const shapeDonut = Fn(() => {
  const st = uv().sub(vec2(0.5));
  const r = length(st);
  const outer = float(0.5);
  const inner = float(0.25);

  const ringOuter = r.lessThan(outer).select(float(1.0), float(0.0));
  const ringInner = r.greaterThan(inner).select(float(1.0), float(0.0));

  return ringOuter.mul(ringInner);
});

material.opacityNode = Fn(() => {
  const type = typeBuffer.element(instanceIndex);
  const circle = shapeSmoothCircle();
  const donut = shapeDonut();

  const isDonut = type.greaterThan(uint(2));
  const mask = isDonut.select(donut, circle);

  return mask.mul(1.0);
})();

const mesh = new THREE.InstancedMesh(geometry, material, particleCount);
scene.add(mesh);

//gui
const gui = new GUI();
const particleFolder = gui.addFolder("Particle Params");
particleFolder
  .add(timeScale, "value")
  .name("timeScale")
  .min(0.01)
  .max(1.0)
  .step(0.01);
particleFolder
  .add(interactionRadius, "value")
  .name("interactionRadius")
  .min(0.01)
  .max(1.0)
  .step(0.01);
particleFolder
  .add(transitionRadius, "value")
  .name("transitionRadius")
  .min(0.01)
  .max(1.0)
  .step(0.01);
particleFolder
  .add(forceScale, "value")
  .name("forceScale")
  .min(1.0)
  .max(100.0)
  .step(1.0);
particleFolder
  .add(scale0, "value")
  .name("scale0")
  .min(0.01)
  .max(0.05)
  .step(0.001);
particleFolder
  .add(scale1, "value")
  .name("scale1")
  .min(0.01)
  .max(0.05)
  .step(0.001);
particleFolder
  .add(scale2, "value")
  .name("scale2")
  .min(0.01)
  .max(0.05)
  .step(0.001);
particleFolder
  .add(scale3, "value")
  .name("scale3")
  .min(0.01)
  .max(0.05)
  .step(0.001);
particleFolder
  .add(scale4, "value")
  .name("scale4")
  .min(0.01)
  .max(0.05)
  .step(0.001);
particleFolder
  .add(scale5, "value")
  .name("scale5")
  .min(0.01)
  .max(0.05)
  .step(0.001);

const colorFolder = gui.addFolder("Color");
colorFolder.addColor(color0, "value").name("color0");
colorFolder.addColor(color1, "value").name("color1");
colorFolder.addColor(color2, "value").name("color2");
colorFolder.addColor(color3, "value").name("color3");
colorFolder.addColor(color4, "value").name("color4");
colorFolder.addColor(color5, "value").name("color5");

window.addEventListener("resize", () => {
  aspect = window.innerWidth / window.innerHeight;

  camera.left = -aspect;
  camera.right = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  renderer.computeAsync(updateCompute);
  renderer.render(scene, camera);
}

animate();
