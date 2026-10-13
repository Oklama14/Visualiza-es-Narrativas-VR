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

// Reavalia TODAS as estacoes contra a posicao atual da camera. Necessario apos
// um teleporte: sem isto, uma estacao cuja zona ainda contem o destino continua
// com inside=true e nunca reemite `station-enter` quando o visitante volta a pe
// (o Corredor do Tempo, que tem zona larga, ficava travado e a sala vazia).
function resyncStations() {
  STATIONS.forEach((st) => st.evaluate());
}

if (window.AFRAME) {
  AFRAME.registerComponent("station", {
    schema: {
      id: { type: "string", default: "" },
      radius: { default: 2.0 },
      hysteresis: { default: 0.35 },
      // Zona RETANGULAR opcional (metade da largura em X e em Z, no espaco local
      // da estacao). Usada pelo Corredor do Tempo, onde o visitante caminha 6 m
      // de lado a lado: um circulo grande o bastante invadiria as estacoes
      // vizinhas, e um circulo pequeno faria a cena piscar ao andar.
      halfX: { default: 0 },
      halfZ: { default: 0 },
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

    // Testa a camera contra a zona e emite enter/leave na borda. `d` no evento e
    // sempre a distancia radial (util para telemetria), mesmo em zona retangular.
    evaluate() {
      const cam = document.getElementById("camera");
      if (!cam || !cam.object3D || !this.el.object3D) return;

      cam.object3D.getWorldPosition(this.camPos);
      this.el.object3D.getWorldPosition(this.selfPos);
      this.camPos.y = 0;
      this.selfPos.y = 0;
      const d = this.camPos.distanceTo(this.selfPos);

      const h = this.data.hysteresis;
      let dentro;
      let fora;
      if (this.data.halfX > 0 && this.data.halfZ > 0) {
        const dx = Math.abs(this.camPos.x - this.selfPos.x);
        const dz = Math.abs(this.camPos.z - this.selfPos.z);
        dentro = dx <= this.data.halfX && dz <= this.data.halfZ;
        fora = dx >= this.data.halfX + h || dz >= this.data.halfZ + h;
      } else {
        dentro = d <= this.data.radius;
        fora = d >= this.data.radius + h;
      }

      if (!this.inside && dentro) {
        this.inside = true;
        this.el.emit("station-enter", { id: this.sid, dist: d });
        tlog("estacao", { id: this.sid, evento: "enter" });
      } else if (this.inside && fora) {
        this.inside = false;
        this.el.emit("station-leave", { id: this.sid, dist: d });
        tlog("estacao", { id: this.sid, evento: "leave" });
      }
    },

    tick(time) {
      if (time - this.lastTick < 150) return; // ~6 Hz e suficiente
      this.lastTick = time;
      this.evaluate();
    },
  });
}
