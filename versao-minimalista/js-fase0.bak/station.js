// ----------------------------------------------------------------------------
// Fase 0.2 - Componente `station`: motor do strollytelling estrutural.
// Uso (Fase 1): <a-entity station="id: mapa; radius: 2.2"> ... </a-entity>
// Emite `station-enter` quando a camera entra no raio e `station-leave` quando
// sai (raio + histerese, para nao tremer na fronteira). Distancia no plano XZ.
// O registro global STATIONS permite achar estacoes por id (teleporte, mapa
// do percurso, tours guiando o deslocamento).
// ----------------------------------------------------------------------------

const STATIONS = new Map();

function getStation(id) {
  return STATIONS.get(id) || null;
}

if (window.AFRAME) {
  AFRAME.registerComponent("station", {
    schema: {
      id: { type: "string", default: "" },
      radius: { default: 2.0 },
      hysteresis: { default: 0.35 },
    },

    init() {
      this.inside = false;
      this.lastTick = 0;
      this.camPos = new AFRAME.THREE.Vector3();
      this.selfPos = new AFRAME.THREE.Vector3();
      this.sid = this.data.id || this.el.id || `station-${STATIONS.size}`;
      STATIONS.set(this.sid, this);
    },

    remove() {
      STATIONS.delete(this.sid);
    },

    tick(time) {
      if (time - this.lastTick < 150) return; // ~6 Hz e suficiente
      this.lastTick = time;
      const cam = document.getElementById("camera");
      if (!cam || !cam.object3D) return;

      cam.object3D.getWorldPosition(this.camPos);
      this.el.object3D.getWorldPosition(this.selfPos);
      this.camPos.y = 0;
      this.selfPos.y = 0;
      const d = this.camPos.distanceTo(this.selfPos);

      if (!this.inside && d <= this.data.radius) {
        this.inside = true;
        this.el.emit("station-enter", { id: this.sid, dist: d });
        tlog("estacao", { id: this.sid, evento: "enter" });
      } else if (this.inside && d >= this.data.radius + this.data.hysteresis) {
        this.inside = false;
        this.el.emit("station-leave", { id: this.sid, dist: d });
        tlog("estacao", { id: this.sid, evento: "leave" });
      }
    },
  });
}
