// ----------------------------------------------------------------------------
// A SALA e as ZONAS do piso.
//
// Tudo aqui e construido a partir de PLANTA (que por sua vez vem do desenho):
// nenhuma medida de sala aparece escrita no HTML, entao mudar SALA_LARGURA_M
// reescala o ambiente inteiro sem tocar em mais nada.
//
// As zonas do piso sao a propria planta baixa desenhada no chao: o retangulo
// verde da camada de dados brutos (sob a mesa) e o retangulo da camada textual.
// Em VR isso vira wayfinding - o visitante SABE onde esta pisando.
// ----------------------------------------------------------------------------

function buildSala() {
  const S = PLANTA.sala;
  const raiz = dom.sala;
  raiz.innerHTML = "";

  // Piso e teto
  raiz.appendChild(
    el("a-plane", {
      rotation: "-90 0 0",
      width: S.w,
      height: S.d,
      position: "0 0 0",
      material: `color: ${CORES.piso}; roughness: 0.92; metalness: 0.04`,
    })
  );
  raiz.appendChild(
    el("a-plane", {
      rotation: "90 0 0",
      width: S.w,
      height: S.d,
      position: `0 ${S.h} 0`,
      material: "color: #070b16; roughness: 1; metalness: 0",
    })
  );

  const parede = (w, x, y, z, rotY) =>
    el("a-plane", {
      width: w,
      height: S.h,
      position: `${round2(x)} ${round2(y)} ${round2(z)}`,
      rotation: `0 ${rotY} 0`,
      material: `color: ${CORES.parede}; roughness: 0.95; side: double`,
    });

  const meioY = S.h / 2;
  raiz.appendChild(parede(S.w, 0, meioY, -S.d / 2, 0)); // fundo
  raiz.appendChild(parede(S.d, -S.w / 2, meioY, 0, 90)); // esquerda
  raiz.appendChild(parede(S.d, S.w / 2, meioY, 0, -90)); // direita

  // Parede proxima COM VAO: a "entrada" do desenho e um buraco de verdade.
  const vao = 1.15;
  const ex = PLANTA.entrada.x;
  const zf = S.d / 2;
  const larguraEsq = ex - vao / 2 + S.w / 2;
  const larguraDir = S.w / 2 - (ex + vao / 2);
  raiz.appendChild(parede(larguraEsq, -S.w / 2 + larguraEsq / 2, meioY, zf, 180));
  raiz.appendChild(parede(larguraDir, S.w / 2 - larguraDir / 2, meioY, zf, 180));

  // Batentes luminosos do vao: leem como porta mesmo de longe.
  [-1, 1].forEach((s) => {
    raiz.appendChild(
      el("a-box", {
        width: 0.05,
        height: 2.1,
        depth: 0.06,
        position: `${round2(ex + (s * vao) / 2)} 1.05 ${round2(zf)}`,
        material: `color: #4cc9f0; emissive: #4cc9f0; emissiveIntensity: 0.8; shader: flat`,
      })
    );
  });

  // Rodape luminoso nas tres paredes fechadas: acha a borda da sala no escuro.
  const rodape = (w, x, z, rotY) =>
    el("a-box", {
      width: w,
      height: 0.04,
      depth: 0.03,
      position: `${round2(x)} 0.045 ${round2(z)}`,
      rotation: `0 ${rotY} 0`,
      material: "color: #2a5380; emissive: #2a5380; emissiveIntensity: 0.6; shader: flat",
    });
  raiz.appendChild(rodape(S.w, 0, -S.d / 2 + 0.02, 0));
  raiz.appendChild(rodape(S.d, -S.w / 2 + 0.02, 0, 90));
  raiz.appendChild(rodape(S.d, S.w / 2 - 0.02, 0, 90));

  // Luz: ambiente baixo + um foco sobre a mesa (o mapa e o assunto da sala).
  raiz.appendChild(el("a-entity", { light: "type: ambient; color: #9fb0d0; intensity: 0.45" }));
  raiz.appendChild(
    el("a-entity", {
      light: `type: point; color: #cfe0ff; intensity: 0.9; distance: 7`,
      position: `${PLANTA.mapa.cx} 2.6 ${PLANTA.mapa.cz}`,
    })
  );
  raiz.appendChild(
    el("a-entity", {
      light: `type: point; color: #9fc4e8; intensity: 0.45; distance: 5`,
      position: `${PLANTA.contexto.cx} 2.4 ${PLANTA.contexto.cz}`,
    })
  );

  buildPlacaSala(raiz);

  applyPendingTransforms(raiz);
  buildZonas();
}

// Placa com o nome do ambiente e as acoes do leitor. Nao esta na planta (uma
// vista de cima nao mostra parede). Na v0 ela ficava na parede do fundo, para
// quem entrava pela porta; na v1 o painel fica sempre a vista e, da linha do
// tempo, cobre a parede do fundo inteira - a placa aparecia cortada pela borda
// dele. Agora ela fica na parede da ESQUERDA, ao lado de 2017 (onde a pessoa
// comeca), virada para a sala: nada fica na frente dela.
function buildPlacaSala(raiz) {
  const x = round2(-PLANTA.sala.w / 2 + 0.04);
  const z = round2(PLANTA.faixa.z - 1.2);
  const g = el("a-entity", { position: `${x} 1.7 ${z}`, rotation: "0 90 0" });

  g.appendChild(
    el("a-plane", {
      width: 2.8,
      height: 0.72,
      material: "color: #0a111f; shader: flat",
    })
  );
  g.appendChild(
    el("a-plane", {
      width: 2.8,
      height: 0.012,
      position: "0 0.354 0.004",
      material: `color: ${CORES.mapaBorda}; shader: flat`,
    })
  );
  g.appendChild(
    el("a-text", Object.assign({
      value: "AMBIENTE VR NARRATIVO",
      position: "0 0.23 0.006",
      align: "center",
      color: "#5f7797",
      font: FONTE,
    }, escalaTexto(21, 0.026)))
  );
  g.appendChild(
    el("a-text", Object.assign({
      value: "CAMADAS RETÓRICAS VISÍVEIS",
      position: "0 0.05 0.006",
      align: "center",
      color: CORES.texto,
      font: FONTE,
    }, escalaTexto(26, 0.072)))
  );
  g.appendChild(
    el("a-text", Object.assign({
      value: "ANDE DE LADO: CADA PASSO É UM ANO   ·   OLHE UMA REGIÃO E BELISQUE",
      position: "0 -0.19 0.006",
      align: "center",
      color: "#7fd4ff",
      font: FONTE,
    }, escalaTexto(68, 0.036)))
  );

  raiz.appendChild(g);
}

// ---------------------------------------------------------------------------
// Pegadas das camadas no piso (a planta baixa desenhada no chao)
// ---------------------------------------------------------------------------

function buildZonas() {
  const raiz = dom.zonas;
  raiz.innerHTML = "";

  contorno(raiz, PLANTA.mapa.cx, PLANTA.mapa.cz, PLANTA.mapa.w + 0.34, PLANTA.mapa.d + 0.34, CORES.mapaBorda, 0.5);
  contorno(raiz, PLANTA.contexto.cx, PLANTA.contexto.cz, PLANTA.contexto.w, PLANTA.contexto.d, CORES.contextoBorda, 0.35);

  // Rotulos das zonas, deitados no piso perto da borda de quem chega.
  raiz.appendChild(
    el("a-text", Object.assign({
      value: "CAMADA TEXTUAL · ANOTAÇÕES NARRATIVAS",
      position: `${PLANTA.contexto.cx} 0.012 ${round2(PLANTA.contexto.cz + PLANTA.contexto.d / 2 - 0.16)}`,
      rotation: "-90 0 0",
      align: "center",
      color: "#6d7d93",
      font: FONTE,
    }, escalaTexto(37, M_CHAR.miudo)))
  );
  raiz.appendChild(
    el("a-text", Object.assign({
      value: "CAMADA DE DADOS BRUTOS",
      position: `${PLANTA.mapa.cx} 0.012 ${round2(PLANTA.mapa.cz + PLANTA.mapa.d / 2 + 0.24)}`,
      rotation: "-90 0 0",
      align: "center",
      color: "#3f7f68",
      font: FONTE,
    }, escalaTexto(29, 0.032))) // caixa alta: folga para nao quebrar em "... / BRUTOS"
  );

  applyPendingTransforms(raiz);
  posicionarDiscos();
}

function contorno(raiz, cx, cz, w, d, cor, opacidade) {
  const t = 0.02;
  const faixa = (fw, fd, x, z) =>
    el("a-plane", {
      rotation: "-90 0 0",
      width: fw,
      height: fd,
      position: `${round2(x)} 0.006 ${round2(z)}`,
      material: `color: ${cor}; shader: flat; opacity: ${opacidade}; transparent: true`,
    });
  raiz.appendChild(faixa(w, t, cx, cz - d / 2));
  raiz.appendChild(faixa(w, t, cx, cz + d / 2));
  raiz.appendChild(faixa(t, d, cx - w / 2, cz));
  raiz.appendChild(faixa(t, d, cx + w / 2, cz));
}

// Discos de teleporte: a volta para a linha do tempo (ao lado de 2017) e a
// zona de contexto. A entrada nao tem mais disco: a pessoa comeca EM 2017.
function posicionarDiscos() {
  const por = (entidade, x, z) => {
    if (!entidade) return;
    entidade.setAttribute("position", `${round2(x)} 0.014 ${round2(z)}`);
    applyPendingTransforms(entidade);
  };
  // O disco verde e a volta para a linha do tempo (alem de 2024; 00-planta.js).
  por(dom.discoUsuario, PLANTA.discoFaixa.x, PLANTA.discoFaixa.z);
  por(dom.discoContexto, PLANTA.contexto.cx, PLANTA.contexto.cz + PLANTA.contexto.d / 2 + 0.55);
}

// ---------------------------------------------------------------------------
// Posiciona os grupos grandes a partir da planta (nada disso vive no HTML).
// ---------------------------------------------------------------------------

function posicionarPlanta() {
  // Mesa do mapa
  dom.mesaMapa.setAttribute("position", `${PLANTA.mapa.cx} 0 ${PLANTA.mapa.cz}`);
  dom.tampo.setAttribute("width", PLANTA.mapa.w);
  dom.tampo.setAttribute("depth", PLANTA.mapa.d);
  dom.tampo.setAttribute("height", PLANTA.mapa.espessura);
  dom.tampo.setAttribute("position", `0 ${round2(PLANTA.mapa.topo - PLANTA.mapa.espessura / 2)} 0`);

  dom.tampoFace.setAttribute("width", round2(PLANTA.mapa.w - 0.06));
  dom.tampoFace.setAttribute("height", round2(PLANTA.mapa.d - 0.06));
  dom.tampoFace.setAttribute("position", `0 ${round2(PLANTA.mapa.topo + 0.002)} 0`);

  dom.plinto.setAttribute("width", round2(PLANTA.mapa.w - 0.26));
  dom.plinto.setAttribute("depth", round2(PLANTA.mapa.d - 0.26));
  dom.plinto.setAttribute("height", round2(PLANTA.mapa.topo - PLANTA.mapa.espessura));
  dom.plinto.setAttribute("position", `0 ${round2((PLANTA.mapa.topo - PLANTA.mapa.espessura) / 2)} 0`);

  dom.regioes.setAttribute("position", `0 ${round2(PLANTA.mapa.topo + 0.004)} 0`);
  dom.colunas.setAttribute("position", `0 ${PLANTA.mapa.topo} 0`);
  // Titulo da mesa na beira de la, baixo (6 cm acima do tampo): da linha do
  // tempo ele aparece por baixo do painel. A 10 cm, a borda do painel o cortava.
  dom.mesaValorTitulo.setAttribute("position", `0 ${round2(PLANTA.mapa.topo + 0.06)} ${round2(-PLANTA.mapa.d / 2 - 0.04)}`);
  // Botao de som na BORDA da mesa, do lado da faixa, inclinado para quem esta
  // nela (os filhos ja deitam a -90; +35 aqui = placa a -55 graus). Na v0 ele
  // ficava na linha das colunas, e da linha do tempo a coluna de Retencao o
  // tapava do olhar. 6 cm alem da beira: o halo da coluna de Retencao (quando
  // ela e o indicador ativo) encostava nele.
  dom.somBtn.setAttribute(
    "position",
    `${round2(PLANTA.mapa.w / 2 - 0.176)} ${round2(PLANTA.mapa.topo + 0.03)} ${round2(PLANTA.mapa.d / 2 + 0.06)}`
  );
  dom.somBtn.setAttribute("rotation", "35 0 0");

  // Zona de contexto: pegada alinhada aos eixos (como na planta), mas as
  // anotacoes viram de frente para o ponto de observacao.
  dom.contextoZona.setAttribute("position", `${PLANTA.contexto.cx} 0 ${PLANTA.contexto.cz}`);
  dom.contextoZona.setAttribute(
    "rotation",
    `0 ${encarar({ x: PLANTA.contexto.cx, z: PLANTA.contexto.cz }, PLANTA.usuario)} 0`
  );

  // Painel emergente (posicao final; a animacao de subida parte da regiao).
  dom.painel.setAttribute("position", `${PLANTA.painel.cx} ${PLANTA.painel.cy} ${PLANTA.painel.cz}`);
  dom.painelFundo.setAttribute("width", PLANTA.painel.w);
  dom.painelFundo.setAttribute("height", PLANTA.painel.h);
  dom.painelTopo.setAttribute("width", PLANTA.painel.w);
  dom.painelTopo.setAttribute("position", `0 ${round2(PLANTA.painel.h / 2 - 0.02)} 0.004`);

  // O rig nasce com a cabeca sobre 2017, na linha do tempo, de frente para a
  // mesa (70-faixa.js): a historia comeca no comeco.
  ancoraInicial();

  applyPendingTransforms(dom.mesaMapa);
  applyPendingTransforms(dom.contextoZona);
  applyPendingTransforms(dom.painel);
}
