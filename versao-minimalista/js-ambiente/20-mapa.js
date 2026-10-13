// ----------------------------------------------------------------------------
// CAMADA DE DADOS BRUTOS: a mesa do mapa.
//
// O tampo e a "planta baixa" do desenho vista de perto: as 5 regioes deitadas
// no lugar geografico, cada uma com uma placa de 100 blocos (1 bloco = 1%) do
// indicador ativo em 2024. Na borda proxima ficam os 4 indicadores, tambem em
// blocos - o leitor escolhe COM O OLHAR qual pergunta esta fazendo ao mapa.
//
// Nada aqui interpreta: o mapa mostra os numeros. A interpretacao sobe no
// painel emergente; o texto mora na zona de contexto.
// ----------------------------------------------------------------------------

const regioesEls = {}; // id -> { grupo, placa, halo, rotulo, valor, handle, hit }
const colunaEls = {}; // key -> { grupo, handle, valor, halo, hit }

function buildMapa() {
  buildRegioes();
  buildColunas();
  updateMapa();
}

// ---------------------------------------------------------------------------
// Regioes
// ---------------------------------------------------------------------------

function buildRegioes() {
  dom.regioes.innerHTML = "";

  REGIOES_MESA.forEach((r) => {
    const reg = contextoById(r.id);
    if (!reg) return;

    const grupo = el("a-entity", { position: `${r.x} 0 ${r.z}` });

    // Pegada geografica da regiao (o retangulo do desenho).
    const placa = el("a-box", {
      width: r.w,
      height: 0.012,
      depth: r.d,
      position: "0 0.006 0",
      material: `color: ${CORES.mapaZona}; roughness: 0.85; metalness: 0.05; emissive: ${CORES.mapaBorda}; emissiveIntensity: 0.05`,
    });
    grupo.appendChild(placa);

    // Halo ambar: so acende na regiao em foco (a "regiao em foco" do desenho).
    const halo = el("a-box", {
      width: r.w + 0.05,
      height: 0.006,
      depth: r.d + 0.05,
      position: "0 0.002 0",
      visible: false,
      material: `color: ${CORES.focoBorda}; shader: flat; opacity: 0.85; transparent: true`,
    });
    grupo.appendChild(halo);

    // Placa de 100 blocos deitada: 1 bloco = 1% do indicador ativo em 2024.
    const voxHost = el("a-entity", { position: "0 0.028 0" });
    grupo.appendChild(voxHost);
    const handle = createVoxelGrid({
      count: PLACA.cols * PLACA.cols,
      layout: placaDeitada,
      sizeX: PLACA.size,
      sizeY: PLACA.size,
      sizeZ: PLACA.size,
      baseColor: "#1c3346",
    });
    attachVoxelMesh(voxHost, handle.mesh);

    // Rotulos deitados no tampo, legiveis de quem observa (lado +Z).
    const rotulo = el("a-text", Object.assign({
      value: r.nome.toUpperCase(),
      position: `0 0.05 ${r.d / 2 - 0.09}`,
      rotation: "-90 0 0",
      align: "center",
      color: CORES.textoFraco,
      font: FONTE,
    }, escalaTexto(r.nome.length, M_CHAR.mesa)));
    grupo.appendChild(rotulo);

    const valor = el("a-text", Object.assign({
      value: "",
      position: `0 0.05 ${-r.d / 2 + 0.08}`,
      rotation: "-90 0 0",
      align: "center",
      color: CORES.texto,
      font: FONTE,
    }, escalaTexto(9, 0.028)));
    grupo.appendChild(valor);

    // Alvo do olhar: plano horizontal invisivel cobrindo a regiao.
    const hit = el("a-plane", {
      class: "hit clickable alvo-regiao",
      width: r.w,
      height: r.d,
      rotation: "-90 0 0",
      position: "0 0.09 0",
      // Sem depthWrite: false, este plano quase invisivel flutua ACIMA dos
      // rotulos deitados no tampo e os apaga para quem olha de cima.
      material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
    });
    hit.dataset.regiao = r.id;
    grupo.appendChild(hit);

    dom.regioes.appendChild(grupo);
    applyPendingTransforms(grupo);

    regioesEls[r.id] = { grupo, placa, halo, rotulo, valor, handle, hit, geo: r };
  });
}

// Layout de placa DEITADA (10 x 10 no plano XZ), preenchida linha a linha de
// tras para a frente - assim "encher" a placa e um movimento em direcao a quem
// observa, coerente com a leitura de baixo para cima das colunas.
function placaDeitada(i) {
  const cols = PLACA.cols;
  const gap = PLACA.gap;
  const half = ((cols - 1) * gap) / 2;
  const col = i % cols;
  const row = Math.floor(i / cols);
  return [col * gap - half, 0, half - row * gap];
}

// ---------------------------------------------------------------------------
// Colunas de indicador (borda proxima do tampo)
// ---------------------------------------------------------------------------

function buildColunas() {
  dom.colunas.innerHTML = "";

  DADOS.indicadores.forEach((ind, i) => {
    const x = COLUNAS.xs[i];
    if (x == null) return;

    // A coluna encara o ponto de observacao do desenho. Sem isto, quem esta na
    // marca ve os quatro rotulos de esguelha (o grupo e local a mesa, entao a
    // conta e feita em coordenadas de mesa).
    const obsLocal = { x: PLANTA.usuario.x - PLANTA.mapa.cx, z: PLANTA.usuario.z - PLANTA.mapa.cz };
    const guinada = encarar({ x, z: COLUNAS.z }, obsLocal);
    const grupo = el("a-entity", {
      position: `${x} ${COLUNAS.y0} ${COLUNAS.z}`,
      rotation: `0 ${guinada} 0`,
    });

    const largura = (COLUNAS.cols - 1) * COLUNAS.gap + COLUNAS.size + 0.06;

    // Base acesa na cor do indicador: identidade visual antes de qualquer texto.
    const base = el("a-box", {
      width: largura,
      height: 0.014,
      depth: 0.08,
      position: "0 0.007 0",
      material: `color: ${ind.cor}; shader: flat; opacity: 0.55; transparent: true`,
    });
    grupo.appendChild(base);

    const halo = el("a-box", {
      width: largura + 0.05,
      height: 0.008,
      depth: 0.12,
      position: "0 0.002 0",
      visible: false,
      material: `color: ${CORES.focoBorda}; shader: flat; opacity: 0.9; transparent: true`,
    });
    grupo.appendChild(halo);

    // 10 x 10 em pe: trilho de 100 blocos, acesos ate o valor de 2024.
    const voxHost = el("a-entity", { position: "0 0.03 0" });
    grupo.appendChild(voxHost);
    const handle = createVoxelGrid({
      count: COLUNAS.cols * COLUNAS.cols,
      cols: COLUNAS.cols,
      gap: COLUNAS.gap,
      sizeX: COLUNAS.size,
      sizeY: COLUNAS.size,
      sizeZ: COLUNAS.size,
      baseColor: "#1c3346",
    });
    attachVoxelMesh(voxHost, handle.mesh);

    const alturaVox = (COLUNAS.cols - 1) * COLUNAS.gap + 0.03;

    const valor = el("a-text", Object.assign({
      value: "",
      position: `0 ${alturaVox + 0.06} 0`,
      align: "center",
      color: CORES.texto,
      font: FONTE,
    }, escalaTexto(6, 0.022)));
    grupo.appendChild(valor);

    // Primeira palavra: "Eficiencia Academica" nao cabe na largura da coluna,
    // e "Eficiencia" ja identifica sozinha (a cor faz o resto).
    const curto = rotulo(ind.label).replace("Taxa de ", "").split(" ")[0];
    const nome = el("a-text", Object.assign({
      value: curto,
      position: `0 ${alturaVox + 0.115} 0`,
      align: "center",
      color: ind.cor,
      font: FONTE,
    }, escalaTexto(Math.max(curto.length, 10), 0.02)));
    grupo.appendChild(nome);

    const hit = el("a-plane", {
      class: "hit clickable alvo-indicador",
      width: largura + 0.06,
      height: alturaVox + 0.22,
      position: `0 ${(alturaVox + 0.22) / 2} 0.07`,
      material: "color: #ffffff; opacity: 0.001; transparent: true; depthWrite: false",
    });
    hit.dataset.indicador = ind.key;
    grupo.appendChild(hit);

    dom.colunas.appendChild(grupo);
    applyPendingTransforms(grupo);

    colunaEls[ind.key] = { grupo, handle, valor, halo, hit, ind };
  });
}

// ---------------------------------------------------------------------------
// Atualizacao (troca de indicador, troca de foco)
// ---------------------------------------------------------------------------

// Quantos blocos acender para um valor percentual: arredonda ao inteiro e
// respeita o trilho de 100 (nunca estoura nem some com um valor > 0).
function blocosPara(valor) {
  if (valor == null) return 0;
  return Math.max(valor > 0 ? 1 : 0, Math.min(100, Math.round(valor)));
}

function updateMapa() {
  const ind = indicadorByKey(state.indicadorKey);

  Object.values(regioesEls).forEach(({ valor, handle, geo }) => {
    const ctx = contextoById(geo.id);
    const v = ctx ? latestValue(ctx.series[state.indicadorKey]) : null;
    handle.setSegments(v == null ? [] : [{ cor: ind.cor, n: blocosPara(v) }]);
    setText(valor, v == null ? "sem dados" : `${fmt(v)}%`);
  });

  DADOS.indicadores.forEach((i) => {
    const c = colunaEls[i.key];
    if (!c) return;
    const ctxAtivo = contextoById(state.regiaoId || state.focoId) || DADOS.brasil;
    const v = latestValue(ctxAtivo.series[i.key]);
    c.handle.setSegments(v == null ? [] : [{ cor: i.cor, n: blocosPara(v) }]);
    setText(c.valor, v == null ? "-" : `${fmt(v)}%`);
    const ativo = i.key === state.indicadorKey;
    setEntityVisible(c.halo, ativo);
    c.grupo.setAttribute("animation__sel", `property: scale; to: ${ativo ? "1.08 1.08 1.08" : "1 1 1"}; dur: 160`);
  });

  setText(
    dom.mesaValorTitulo,
    `${rotulo(ind.label).toUpperCase()} EM ${DADOS.anos[DADOS.anos.length - 1]}   ·   1 BLOCO = 1%`
  );
}

// Destaque da regiao sob o olhar (hover) e da regiao confirmada.
function pintarFoco() {
  Object.entries(regioesEls).forEach(([id, r]) => {
    const emFoco = id === state.focoId;
    const confirmada = id === state.regiaoId;
    setEntityVisible(r.halo, emFoco || confirmada);
    r.halo.setAttribute("material", "color", confirmada ? CORES.focoBorda : "#7fd4ff");
    r.halo.setAttribute("material", "opacity", confirmada ? 0.9 : 0.5);
    r.placa.setAttribute(
      "material",
      "color",
      confirmada ? CORES.foco : emFoco ? shadeColor(CORES.mapaZona, 12) : CORES.mapaZona
    );
    // Um leve levantar da placa: a regiao em foco "sai" do mapa.
    r.grupo.setAttribute(
      "animation__lift",
      `property: position; to: ${r.geo.x} ${confirmada ? 0.05 : emFoco ? 0.025 : 0} ${r.geo.z}; dur: 180; easing: easeOutQuad`
    );
    setText(r.rotulo, confirmada || emFoco ? r.geo.nome.toUpperCase() : r.geo.nome.toUpperCase());
    r.rotulo.setAttribute("color", confirmada ? "#ffd9a8" : emFoco ? CORES.texto : CORES.textoFraco);
  });
}
