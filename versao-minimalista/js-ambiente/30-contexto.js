// ----------------------------------------------------------------------------
// CAMADA TEXTUAL: a zona de contexto.
//
// No desenho e um retangulo ao lado do mapa: "contexto - anotacoes narrativas -
// camada textual". Aqui a pegada continua no piso (alinhada aos eixos, como na
// planta) e as anotacoes ficam em pe DENTRO dela, viradas para quem observa o
// mapa. O texto nunca esta sobre a visualizacao: e uma camada a parte, com
// lugar proprio na sala - que e a tese do desenho.
// ----------------------------------------------------------------------------

const CTX_SLABS = 3;
const CTX_SLAB = { w: 1.5, h: 0.44, gap: 0.07, topY: 1.98 };

const slabEls = [];

function buildContexto() {
  dom.contextoSlabs.innerHTML = "";

  for (let i = 0; i < CTX_SLABS; i += 1) {
    const y = CTX_SLAB.topY - i * (CTX_SLAB.h + CTX_SLAB.gap);
    const grupo = el("a-entity", { position: `0 ${round2(y)} 0` });

    const fundo = el("a-plane", {
      width: CTX_SLAB.w,
      height: CTX_SLAB.h,
      material: `color: ${CORES.contextoZona}; opacity: 0.93; transparent: true; shader: flat`,
    });
    grupo.appendChild(fundo);

    // Filete lateral: marca a anotacao como camada, nao como rotulo do dado.
    const acento = el("a-plane", {
      width: 0.022,
      height: CTX_SLAB.h,
      position: `${-CTX_SLAB.w / 2 + 0.011} 0 0.004`,
      material: `color: ${CORES.mapaBorda}; shader: flat`,
    });
    grupo.appendChild(acento);

    const x0 = -CTX_SLAB.w / 2 + 0.07;

    const kicker = el("a-text", {
      value: "",
      position: `${round2(x0)} ${CTX_SLAB.h / 2 - 0.07} 0.006`,
      width: 0.32,
      "wrap-count": 10,
      align: "left",
      anchor: "left",
      color: "#7fd4ff",
      font: FONTE,
    });
    grupo.appendChild(kicker);

    const titulo = el("a-text", {
      value: "",
      position: `${round2(x0)} ${CTX_SLAB.h / 2 - 0.16} 0.006`,
      width: 1.5,
      align: "left",
      anchor: "left",
      color: CORES.texto,
      font: FONTE,
      "wrap-count": 34,
    });
    grupo.appendChild(titulo);

    const corpo = el("a-text", {
      value: "",
      position: `${round2(x0)} ${-0.04} 0.006`,
      width: 1.34,
      align: "left",
      anchor: "left",
      baseline: "top",
      color: "#c6d4ea",
      font: FONTE,
      "wrap-count": 46,
    });
    grupo.appendChild(corpo);

    dom.contextoSlabs.appendChild(grupo);
    applyPendingTransforms(grupo);
    slabEls.push({ grupo, kicker, titulo, corpo, acento });
  }
}

// Reescreve a camada textual a partir do contexto/indicador/ano em foco.
function updateContexto() {
  const ctx = contextoById(state.regiaoId || state.focoId);

  if (!ctx) {
    slabEls.forEach((s, i) => {
      setText(s.kicker, i === 0 ? "CAMADA TEXTUAL" : "");
      setText(s.titulo, i === 0 ? "Anotações narrativas" : "");
      setText(
        s.corpo,
        i === 0 ? "Olhe para uma região do mapa. A leitura dela aparece aqui, ao lado da visualização." : ""
      );
      s.acento.setAttribute("material", "color", CORES.contextoBorda);
    });
    return;
  }

  const ind = indicadorByKey(state.indicadorKey);
  const blocos = anotacoes(ctx, state.indicadorKey, state.anoIdx);

  slabEls.forEach((s, i) => {
    const b = blocos[i];
    setText(s.kicker, b ? b.kicker : "");
    setText(s.titulo, b ? b.titulo : "");
    setText(s.corpo, b ? b.corpo : "");
    s.acento.setAttribute("material", "color", i === 0 ? ind.cor : CORES.mapaBorda);
  });
}
