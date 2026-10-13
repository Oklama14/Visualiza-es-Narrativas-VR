// ----------------------------------------------------------------------------
// Fase 0.3 - Voxels performantes (visceralizacao em escala).
// createVoxelGrid monta um THREE.InstancedMesh (1 draw call para N blocos) e
// devolve um handle com setSegments([{cor, n}...]) para recolorir por faixas
// sem reconstruir nada. Layouts: "wall" (parede cols x rows) e "tower"
// (torre 2x2 x camadas, como as torres da composicao). THREE vem do proprio
// A-Frame (AFRAME.THREE) - nenhuma biblioteca nova.
// ----------------------------------------------------------------------------

const VOXEL_BASE_COLOR = "#24405f";

// Anexa o mesh ao object3D da entidade (agora ou quando ela carregar).
function attachVoxelMesh(entity, mesh) {
  const anexar = () => entity.setObject3D("voxels", mesh);
  if (entity.hasLoaded) anexar();
  else entity.addEventListener("loaded", anexar, { once: true });
}

// opts: { count, layout: "wall"|"tower"|fn(i)=>[x,y,z], cols, gap, layerH,
//         sizeX/Y/Z, baseColor }
function createVoxelGrid(opts) {
  const THREE = AFRAME.THREE;
  const count = opts.count || 100;

  let layoutFn;
  if (typeof opts.layout === "function") {
    layoutFn = opts.layout;
  } else if (opts.layout === "tower") {
    // 2x2 por camada, `count/4` camadas: replica a torre original da composicao.
    const layerH = opts.layerH || 0.06;
    layoutFn = (i) => {
      const layer = Math.floor(i / 4);
      const p = i % 4;
      const dx = p % 2 === 0 ? -0.125 : 0.125;
      const dz = Math.floor(p / 2) === 0 ? -0.1 : 0.1;
      return [dx, layer * layerH + layerH / 2, dz];
    };
  } else {
    // "wall": preenche linha a linha, de baixo para cima.
    const cols = opts.cols || 10;
    const gap = opts.gap || 0.13;
    const halfW = ((cols - 1) * gap) / 2;
    layoutFn = (i) => [(i % cols) * gap - halfW, Math.floor(i / cols) * gap, 0];
  }

  const geo = new THREE.BoxGeometry(
    opts.sizeX != null ? opts.sizeX : 0.115,
    opts.sizeY != null ? opts.sizeY : 0.115,
    opts.sizeZ != null ? opts.sizeZ : 0.115
  );
  // Cor branca no material: a cor visivel vem de instanceColor (por bloco).
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.08 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const p = layoutFn(i);
    dummy.position.set(p[0], p[1], p[2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const base = new THREE.Color(opts.baseColor || VOXEL_BASE_COLOR);
  for (let i = 0; i < count; i += 1) mesh.setColorAt(i, base);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const handle = {
    mesh,
    count,
    // setSegments: recolore por faixas contiguas na ordem do layout (de baixo
    // para cima). Ex.: [{cor:"#3ad29f", n:41}, {cor:"#ffd166", n:27}, ...].
    // Blocos alem das faixas voltam a cor base ("sem dados" = setSegments([])).
    setSegments(segs) {
      const c = new THREE.Color();
      let i = 0;
      (segs || []).forEach((s) => {
        c.set(s.cor);
        for (let k = 0; k < s.n && i < count; k += 1, i += 1) mesh.setColorAt(i, c);
      });
      c.set(opts.baseColor || VOXEL_BASE_COLOR);
      for (; i < count; i += 1) mesh.setColorAt(i, c);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
  return handle;
}
