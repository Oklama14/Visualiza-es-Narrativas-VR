// ----------------------------------------------------------------------------
// Utilidades de dados.
// ----------------------------------------------------------------------------

function indicadorByKey(key) {
  return DADOS.indicadores.find((i) => i.key === key);
}

function latestValue(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (serie[i] != null) return serie[i];
  }
  return null;
}

function lastValidIndex(serie) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (serie[i] != null) return i;
  }
  return serie.length - 1;
}

function extremos(serie) {
  let peakIdx = -1;
  let valleyIdx = -1;
  let max = -Infinity;
  let min = Infinity;
  serie.forEach((v, i) => {
    if (v == null) return;
    if (v > max) { max = v; peakIdx = i; }
    if (v < min) { min = v; valleyIdx = i; }
  });
  return { peakIdx, valleyIdx };
}

function resolveCompareContext(ctx) {
  if (ctx.tipo === "instituicao") return state.parentRegion || DADOS.brasil;
  if (ctx.tipo === "regiao") return DADOS.brasil;
  return null;
}

function rotuloContexto(ctx) {
  if (!ctx) return "";
  if (ctx.tipo === "brasil") return "Brasil";
  if (ctx.tipo === "regiao") return `Regiao ${ctx.nome}`;
  return ctx.nome;
}

function rotuloCurto(ctx) {
  if (!ctx) return "";
  if (ctx.tipo === "brasil") return "Brasil";
  if (ctx.tipo === "regiao") return ctx.nome;
  return ctx.sigla || ctx.nome;
}

function clampIdx(value, length) {
  return Math.max(0, Math.min(length - 1, value));
}

function fmt(value) {
  if (value == null) return "-";
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function clickable(controlEntity) {
  return controlEntity.querySelector(".timeline-clickable");
}

// ----------------------------------------------------------------------------
// Layout de cards.
// ----------------------------------------------------------------------------

function gridPositions(n, cols, gapX, gapY, topY, z) {
  const positions = [];
  for (let i = 0; i < n; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rowCount = Math.min(cols, n - row * cols);
    const x = (col - (rowCount - 1) / 2) * gapX;
    const y = topY - row * gapY;
    positions.push({ position: `${round2(x)} ${round2(y)} ${z}`, rotation: "0 0 0" });
  }
  return positions;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// ----------------------------------------------------------------------------
// Criacao de elementos A-Frame (com reaplicacao explicita de transform).
// ----------------------------------------------------------------------------

function el(tagName, attributes = {}) {
  const element = document.createElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === "class") {
      String(value).split(" ").filter(Boolean).forEach((c) => element.classList.add(c));
      return;
    }
    const normalizedName = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (["position", "rotation", "scale"].includes(normalizedName)) {
      const vector = parseVector(value);
      if (vector) {
        element.dataset[`vr${capitalize(normalizedName)}`] = `${vector.x} ${vector.y} ${vector.z}`;
      }
      setVectorAttribute(element, normalizedName, value);
      return;
    }
    element.setAttribute(normalizedName, value);
  });
  return element;
}

function setVectorAttribute(element, name, value) {
  const vector = parseVector(value);
  if (!vector) {
    element.setAttribute(name, value);
    return;
  }
  element.setAttribute(name, `x: ${vector.x}; y: ${vector.y}; z: ${vector.z}`);
  applyObject3DVector(element, name, vector);
}

function parseVector(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const parts = value.trim().split(/\s+/).map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function applyPendingTransforms(root) {
  const targets = [
    root,
    ...root.querySelectorAll("[data-vr-position], [data-vr-rotation], [data-vr-scale]"),
  ];
  const applyAll = () => {
    targets.forEach((target) => {
      if (target.dataset.vrPosition) setVectorAttribute(target, "position", target.dataset.vrPosition);
      if (target.dataset.vrRotation) setVectorAttribute(target, "rotation", target.dataset.vrRotation);
      if (target.dataset.vrScale) setVectorAttribute(target, "scale", target.dataset.vrScale);
    });
  };
  applyAll();
  requestAnimationFrame(applyAll);
}

function applyObject3DVector(element, name, vector) {
  if (!element.object3D) return;
  if (name === "position") { element.object3D.position.set(vector.x, vector.y, vector.z); return; }
  if (name === "scale") { element.object3D.scale.set(vector.x, vector.y, vector.z); return; }
  if (name === "rotation") {
    const toRad = Math.PI / 180;
    element.object3D.rotation.set(vector.x * toRad, vector.y * toRad, vector.z * toRad);
  }
}

function setEntityVisible(entity, isVisible) {
  entity.setAttribute("visible", isVisible);
  const apply = () => { if (entity.object3D) entity.object3D.visible = isVisible; };
  apply();
  requestAnimationFrame(apply);
}

function setObjectGlow(entity, color, intensity) {
  if (!entity.object3D) return;
  entity.object3D.traverse((object) => {
    if (!object.material) return;
    if (object.material.emissive) object.material.emissive.set(color);
    if ("emissiveIntensity" in object.material) object.material.emissiveIntensity = intensity;
    object.material.needsUpdate = true;
  });
}

function refreshRaycasters() {
  requestAnimationFrame(() => {
    document.querySelectorAll("[raycaster]").forEach((entity) => {
      const component = entity.components?.raycaster;
      if (component) component.refreshObjects();
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shadeColor(hex, percent) {
  const normalized = hex.replace("#", "");
  const amount = Math.round(2.55 * percent);
  const red = clamp(parseInt(normalized.slice(0, 2), 16) + amount);
  const green = clamp(parseInt(normalized.slice(2, 4), 16) + amount);
  const blue = clamp(parseInt(normalized.slice(4, 6), 16) + amount);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

// ----------------------------------------------------------------------------
// Small Multiples (Comparacao Regional)
// ----------------------------------------------------------------------------

