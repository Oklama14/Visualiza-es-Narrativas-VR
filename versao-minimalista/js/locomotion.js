// ----------------------------------------------------------------------------
// Fase 0.5 - Locomocao e conforto.
// - Em VR o WASD e DESLIGADO (movimento artificial continuo = cinetose;
//   LaViola 2000): o deslocamento vem de passos reais ou de teleporte.
// - teleportTo(x, z): "blink" de conforto (escurecimento ~150 ms) e reposiciona
//   o rig. Sera o fallback de espaco pequeno entre as estacoes (Fase 1).
// ----------------------------------------------------------------------------

function setWasdEnabled(enabled) {
  const cam = document.getElementById("camera");
  if (cam) cam.setAttribute("wasd-controls", "enabled", !!enabled);
}

// Escurecimento rapido (desktop: overlay 2D; VR: plano acoplado a camera).
function comfortBlink(ms = 150) {
  const overlay = document.getElementById("transitionOverlay");
  if (overlay) {
    const trans = overlay.style.transition;
    overlay.style.transition = "opacity 90ms ease";
    overlay.classList.add("is-active");
    setTimeout(() => {
      overlay.classList.remove("is-active");
      setTimeout(() => { overlay.style.transition = trans; }, 200);
    }, ms);
  }
  const vrFade = document.getElementById("vrFade");
  if (vrFade) {
    vrFade.setAttribute("visible", "true");
    vrFade.setAttribute("material", "opacity", 1);
    setTimeout(() => {
      vrFade.setAttribute("material", "opacity", 0);
      setTimeout(() => vrFade.setAttribute("visible", "false"), 120);
    }, ms);
  }
}

async function teleportTo(x, z, faceDeg) {
  const rig = document.getElementById("cameraRig");
  if (!rig) return;
  comfortBlink();
  await new Promise((r) => setTimeout(r, 90));
  rig.setAttribute("position", `${x} 1.6 ${z}`);
  if (faceDeg != null) rig.setAttribute("rotation", `0 ${faceDeg} 0`);
  tlog("teleporte", { x, z });
}

// Teleporta para uma estacao registrada (usa o componente `station` da 0.2).
function teleportToStation(id, offsetZ = 1.6) {
  const st = getStation(id);
  if (!st) return;
  const p = new AFRAME.THREE.Vector3();
  st.el.object3D.getWorldPosition(p);
  teleportTo(+p.x.toFixed(2), +(p.z + offsetZ).toFixed(2));
}
