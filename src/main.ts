import "./style.css";
import * as THREE from "three/webgpu";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { bootstrap } from "./app/bootstrap";

const hdrLoader = new HDRLoader();
hdrLoader.load("./hdr.hdr", (environmentMap) => {
  environmentMap.mapping = THREE.EquirectangularReflectionMapping;
  const spinner = document.getElementById("spinner");
  if (spinner) spinner.style.display = "none";
  bootstrap(environmentMap);
});
