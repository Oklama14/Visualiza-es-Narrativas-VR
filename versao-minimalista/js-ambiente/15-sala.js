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

// Placa da parede do fundo, na altura dos olhos e logo acima da mesa.
// Nao esta na planta (uma vista de cima nao mostra parede), mas repete a
// legenda do proprio desenho: o nome do ambiente e as 3 acoes do leitor. E o
// que da assunto a primeira olhada de quem acabou de entrar - sem ela, a porta
// se abre para uma parede vazia, porque o mapa fica abaixo da linha do olhar.
function buildPlacaSala(raiz) {
  const z = round2(-PLANTA.sala.d / 2 + 0.04);
  const g = el("a-entity", { position: `${PLANTA.mapa.cx} 1.78 ${z}` });

  g.appendChild(
    el("a-plane", {
      width: 2.8,
      height: 0.72,
      material: "color: #0a111f; opacity: 0.92; transparent: true; shader: flat",
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
      value: "1 ENTRAR   ·   2 OLHAR PARA UMA REGIÃO   ·   3 A VISUALIZAÇÃO SOBE",
      position: "0 -0.19 0.006",
      align: "center",
      color: "#7fd4ff",
      font: FONTE,
    }, escalaTexto(66, 0.036)))
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
    }, escalaTexto(22, 0.032)))
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

// Discos de "voce esta aqui" / destinos de teleporte. As posicoes sao as do
// desenho: a entrada embaixo e a posicao do usuario na quina do mapa.
function posicionarDiscos() {
  const por = (entidade, x, z) => {
    if (!entidade) return;
    entidade.setAttribute("position", `${round2(x)} 0.014 ${round2(z)}`);
    applyPendingTransforms(entidade);
  };
  por(dom.discoUsuario, PLANTA.usuario.x, PLANTA.usuario.z);
  por(dom.discoEntrada, PLANTA.entrada.x, PLANTA.entrada.z);
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
  dom.mesaValorTitulo.setAttribute("position", `0 ${round2(PLANTA.mapa.topo + 0.1)} ${round2(-PLANTA.mapa.d / 2 - 0.04)}`);
  dom.somBtn.setAttribute(
    "position",
    `${round2(PLANTA.mapa.w / 2 - 0.26)} ${round2(PLANTA.mapa.topo + 0.01)} ${round2(PLANTA.mapa.d / 2 - 0.13)}`
  );

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

  // Rig nasce NA ENTRADA, olhando para o mapa (acao 1 do desenho).
  dom.cameraRig.setAttribute("position", `${PLANTA.entrada.x} 0 ${round2(PLANTA.entrada.z - 0.25)}`);
  dom.cameraRig.setAttribute(
    "rotation",
    `0 ${olharPara({ x: PLANTA.entrada.x, z: PLANTA.entrada.z - 0.25 }, { x: PLANTA.mapa.cx, z: PLANTA.mapa.cz })} 0`
  );

  applyPendingTransforms(dom.mesaMapa);
  applyPendingTransforms(dom.contextoZona);
  applyPendingTransforms(dom.painel);
}
