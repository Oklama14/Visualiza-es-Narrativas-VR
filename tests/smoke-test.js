const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DEBUG = process.env.DEBUG_SMOKE === "1";
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (typeof WebSocket !== "function") {
    throw new Error("Node.js precisa expor WebSocket global para rodar este teste.");
  }

  const browserPath = findBrowser();
  const server = await startServer();
  const chrome = await startBrowser(browserPath, server.url);

  try {
    const cdp = await connectToPage(chrome.port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    await waitFor(
      cdp,
      "window.AFRAME && document.querySelector('a-scene')?.hasLoaded && typeof DADOS !== 'undefined' && DADOS && document.querySelectorAll('#mapHotspots .selection-clickable').length === DADOS.regioes.length",
      "cena inicial com o mapa de regioes"
    );

    await assertOnboarding(cdp);
    await assertInitialState(cdp);
    await assertSelectionAndDrill(cdp);
    await assertIndicatorsAndTimeline(cdp);
    await assertBrasilDirectFlow(cdp);
    await assertTour(cdp);
    await assertVrCursorMode(cdp);
    assertNoBrowserErrors(cdp.events);

    cdp.close();
    console.log("Smoke test concluido com sucesso.");
  } finally {
    chrome.process.kill();
    await new Promise((resolve) => server.instance.close(resolve));
  }
}

async function assertOnboarding(cdp) {
  const visible = await evalValue(cdp, "!document.querySelector('#onboardOverlay').hasAttribute('hidden')");
  assert(visible, "Onboarding deveria aparecer na primeira visita.");
  const temPlaca = await evalValue(cdp, "Boolean(document.querySelector('#roomSign'))");
  assert(temPlaca, "Placa de controles in-world (#roomSign) ausente.");
  // Dispensa o overlay (senao ele intercepta os cliques projetados na cena).
  await evalValue(cdp, "document.querySelector('#onboardStart').click(); true");
  await waitFor(
    cdp,
    "document.querySelector('#onboardOverlay').hasAttribute('hidden')",
    "onboarding dispensado apos 'Comecar'"
  );
}

async function assertInitialState(cdp) {
  const st = await evalJson(
    cdp,
    `({
      aframeLoaded: Boolean(window.AFRAME),
      sceneLoaded: document.querySelector('a-scene')?.hasLoaded === true,
      dataLoaded: typeof DADOS !== 'undefined' && Boolean(DADOS),
      anos: (typeof DADOS !== 'undefined' && DADOS) ? DADOS.anos.length : 0,
      regioes: (typeof DADOS !== 'undefined' && DADOS) ? DADOS.regioes.length : 0,
      mapHotspots: document.querySelectorAll('#mapHotspots .selection-clickable').length,
      mapVisible: document.querySelector('#mapView')?.object3D.visible,
      brasilBtn: document.querySelectorAll('#brasilBtn .selection-clickable').length,
      selectionVisible: document.querySelector('#selectionWorld')?.object3D.visible,
      explorationVisible: document.querySelector('#explorationWorld')?.object3D.visible,
      selectionClickables: document.querySelectorAll('.selection-clickable.clickable').length,
      explorationClickables: document.querySelectorAll('.exploration-clickable.clickable').length,
      timelineClickables: document.querySelectorAll('.timeline-clickable.clickable').length,
      sceneCursor: document.querySelector('#scene')?.getAttribute('cursor')?.rayOrigin,
      gazeFuse: document.querySelector('#gazeCursor')?.getAttribute('cursor')?.fuse,
      gazeVisible: document.querySelector('#gazeCursor')?.object3D.visible,
      roomVisible: document.querySelector('#room')?.object3D.visible,
      notaBody: document.querySelector('#notaBody')?.textContent || ''
    })`
  );

  assert(st.notaBody.length > 30, "Nota explicativa (HUD) deveria estar preenchida na selecao.");
  assert(st.roomVisible, "A sala (room) deveria estar visivel.");
  assert(st.gazeVisible === false, "O reticulo de gaze deve ficar oculto no desktop (so aparece em VR).");
  assert(st.aframeLoaded, "A-Frame nao carregou.");
  assert(st.sceneLoaded, "A cena A-Frame nao terminou de carregar.");
  assert(st.dataLoaded, "dados.json nao carregou.");
  assert(st.anos === 8, `Esperado 8 anos na serie historica, veio ${st.anos}.`);
  assert(st.regioes === 5, `Esperado 5 regioes, veio ${st.regioes}.`);
  assert(st.mapVisible, "Mapa de regioes deveria estar visivel na selecao.");
  assert(st.mapHotspots === st.regioes, "Deveria haver um hotspot por regiao no mapa.");
  assert(st.brasilBtn === 1, "Botao Brasil deveria existir na selecao.");
  assert(st.selectionVisible, "Ambiente de selecao deveria estar visivel.");
  assert(!st.explorationVisible, "Ambiente de exploracao deveria iniciar oculto.");
  assert(st.selectionClickables === st.regioes + 5, "Selecao deveria ter 5 hotspots + Brasil + Multiplos + 3 Tours clicaveis.");
  assert(st.explorationClickables === 0, "Exploracao nao deve ter clickables ativos no inicio.");
  assert(st.timelineClickables === 0, "Timeline nao deve ter clickables ativos no inicio.");
  assert(st.sceneCursor === "mouse", "Cursor desktop deve usar rayOrigin: mouse.");
  assert(st.gazeFuse === false, "Gaze fuse deve iniciar desligado no desktop.");
}

async function assertSelectionAndDrill(cdp) {
  // Olhar/hover num hotspot do mapa revela o preview da regiao.
  await moveProjected(cdp, "#mapHotspots .selection-clickable.clickable", 0);
  await waitFor(
    cdp,
    "document.querySelector('#mapPreview')?.object3D.visible",
    "preview da regiao ao olhar o mapa"
  );
  const prev = await evalJson(
    cdp,
    `({
      title: document.querySelector('#mapPrevTitle').getAttribute('value'),
      vals: document.querySelector('#mapPrevVals').getAttribute('value'),
      comment: document.querySelector('#mapPrevComment').getAttribute('value')
    })`
  );
  assert(prev.title && prev.title.length > 0, "Preview do mapa sem nome de regiao.");
  assert(/Eficiencia/i.test(prev.vals), "Preview do mapa sem indicadores.");
  assert(prev.comment && prev.comment.length > 5, "Preview do mapa sem comentario.");

  // Clicar num hotspot abre o drill-down da regiao.
  await clickProjected(cdp, "#mapHotspots .selection-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.stage === 'drill' && document.querySelector('#drillCards')?.object3D.visible && state.drillRegion",
    "drill-down apos clicar no mapa"
  );
  const drillState = await evalJson(
    cdp,
    `(() => {
      const reg = state.drillRegion;
      return {
        qtd: reg ? reg.instituicoes.length : -1,
        mapHidden: !document.querySelector('#mapView').object3D.visible,
        drillVisible: document.querySelector('#drillCards').object3D.visible,
        drillBackVisible: document.querySelector('#drillBack').object3D.visible,
        mapClickables: document.querySelectorAll('#mapHotspots .selection-clickable.clickable').length,
        drillClickables: document.querySelectorAll('#drillCards .drill-clickable.clickable').length,
        drillBackClickable: document.querySelectorAll('#drillBack .drill-clickable.clickable').length
      };
    })()`
  );

  assert(drillState.mapHidden, "Mapa deveria ocultar no drill-down.");
  assert(drillState.drillVisible, "Cards de drill deveriam aparecer.");
  assert(drillState.drillBackVisible, "Botao de voltar do drill deveria aparecer.");
  assert(drillState.mapClickables === 0, "Hotspots do mapa nao podem continuar clicaveis no drill.");
  assert(drillState.drillClickables === drillState.qtd + 1, "Cards de instituicao != instituicoes + 1.");
  assert(drillState.drillBackClickable === 1, "Botao de voltar do drill deveria estar clicavel.");

  // Voltar do drill para o mapa.
  await clickProjected(cdp, "#drillBack .drill-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.stage === 'selection' && document.querySelector('#mapView').object3D.visible && document.querySelectorAll('#mapHotspots .selection-clickable.clickable').length === DADOS.regioes.length",
    "retorno do drill para o mapa"
  );
}

async function assertIndicatorsAndTimeline(cdp) {
  const anos = await evalValue(cdp, "DADOS.anos.length");

  // Abrir o drill por um hotspot do mapa e escolher "Regiao inteira" (primeiro card).
  await clickProjected(cdp, "#mapHotspots .selection-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.stage === 'drill' && document.querySelectorAll('#drillCards .drill-clickable.clickable').length > 0",
    "drill aberto para indicadores"
  );
  await clickProjected(cdp, "#drillCards .drill-clickable.clickable", 0);

  await waitFor(
    cdp,
    "!state.transitioning && state.stage === 'indicators' && document.querySelector('#explorationWorld')?.object3D.visible && document.querySelectorAll('#indicatorObjects .indicator-clickable.clickable').length === 4",
    "indicadores da regiao"
  );

  const indState = await evalJson(
    cdp,
    `({
      selectionVisible: document.querySelector('#selectionWorld').object3D.visible,
      explorationVisible: document.querySelector('#explorationWorld').object3D.visible,
      indicatorView: document.querySelector('#indicatorView').object3D.visible,
      timelineView: document.querySelector('#timelineView').object3D.visible,
      indicators: document.querySelectorAll('#indicatorObjects .indicator-clickable.clickable').length,
      selectionClickables: document.querySelectorAll('.selection-clickable.clickable').length,
      backActive: document.querySelectorAll('#backButton .exploration-clickable.clickable').length,
      timelineActive: document.querySelectorAll('.timeline-clickable.clickable').length,
      contextTitle: document.querySelector('#contextTitle').getAttribute('value')
    })`
  );

  assert(!indState.selectionVisible, "Selecao precisa ficar oculta nos indicadores.");
  assert(indState.explorationVisible, "Exploracao precisa ficar visivel.");
  assert(indState.indicatorView, "Sub-modo de indicadores deveria estar visivel.");
  assert(!indState.timelineView, "Linha do tempo deveria iniciar oculta.");
  assert(indState.indicators === 4, "Deveria haver 4 indicadores clicaveis.");
  assert(indState.selectionClickables === 0, "Cards de selecao nao podem continuar clicaveis na exploracao.");
  assert(indState.backActive === 1, "Botao Voltar deveria estar ativo nos indicadores.");
  assert(indState.timelineActive === 0, "Controles de timeline nao devem estar ativos nos indicadores.");
  assert(indState.contextTitle && indState.contextTitle.length > 0, "Titulo de contexto vazio.");

  // Etapa de composicao "Para onde vao os alunos".
  await clickProjected(cdp, "#compEnter .indicator-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.stage === 'composicao' && document.querySelector('#composicaoView')?.object3D.visible && document.querySelectorAll('#compScene .comp-seg').length >= 3",
    "etapa de composicao com barras empilhadas"
  );
  const comp = await evalJson(
    cdp,
    `({
      legendHidden: document.querySelector('#compLegend').hidden,
      segs: document.querySelectorAll('#compScene .comp-seg').length,
      yearLabel: document.querySelector('#compYearLabel').getAttribute('value'),
      readout: document.querySelector('#compReadout').getAttribute('value'),
      indicatorView: document.querySelector('#indicatorView').object3D.visible
    })`
  );
  assert(!comp.legendHidden, "Legenda da composicao deveria aparecer.");
  assert(comp.segs >= 3, "Composicao deveria ter segmentos empilhados.");
  assert(!comp.indicatorView, "Indicadores deveriam ocultar na composicao.");
  assert(/^\d{4}$/.test(comp.yearLabel), "Ano da composicao invalido.");
  assert(/matric|evad|concl|retid/i.test(comp.readout), "Readout da composicao vazio.");

  // Navegar um ano na composicao.
  const compAno = comp.yearLabel;
  await clickProjected(cdp, "#compPrev .composicao-clickable.clickable", 0);
  await waitFor(
    cdp,
    `document.querySelector('#compYearLabel').getAttribute('value') !== ${JSON.stringify(compAno)}`,
    "ano anterior na composicao"
  );

  // Voltar aos indicadores.
  await clickProjected(cdp, "#compBack .composicao-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.stage === 'indicators' && document.querySelectorAll('#indicatorObjects .indicator-clickable.clickable').length === 4",
    "retorno aos indicadores apos composicao"
  );

  // Hover em um indicador deve abrir o painel interpretativo.
  await moveProjected(cdp, "#indicatorObjects .indicator-clickable.clickable", 0);
  await waitFor(
    cdp,
    "document.querySelector('#infoPanel')?.object3D.visible",
    "painel do indicador no hover"
  );

  // Ao tirar o mouse do gauge, o painel deve sumir (fade-out), nao ficar fixado.
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
  await waitFor(
    cdp,
    "document.querySelector('#infoPanel')?.object3D.visible === false",
    "painel some (fade) ao tirar o mouse do gauge"
  );
  // Volta a passar o mouse para seguir o fluxo.
  await moveProjected(cdp, "#indicatorObjects .indicator-clickable.clickable", 0);
  await waitFor(
    cdp,
    "document.querySelector('#infoPanel')?.object3D.visible",
    "painel reaparece no hover"
  );

  // Clicar no indicador abre a linha do tempo, que inicia com a abertura guiada.
  await clickProjected(cdp, "#indicatorObjects .indicator-clickable.clickable", 0);
  await waitFor(
    cdp,
    `state.stage === 'timeline' && document.querySelector('#timelineView')?.object3D.visible && document.querySelectorAll('#timelineBars .timeline-clickable.clickable').length === ${anos} && state.guided === true && document.querySelector('#ctrlSkip')?.object3D.visible`,
    "abertura guiada (martini glass) iniciada"
  );

  // Durante a guiada, os controles de exploracao NAO podem ser clicaveis (anti clique-fantasma).
  const guiadoClick = await evalJson(
    cdp,
    `({
      scrubber: document.querySelectorAll('#scrubberRow .timeline-clickable.clickable').length,
      action: document.querySelectorAll('#actionRow .timeline-clickable.clickable').length,
      skip: document.querySelectorAll('#ctrlSkip .timeline-clickable.clickable').length
    })`
  );
  assert(guiadoClick.scrubber === 0, "Controles de ano nao podem ser clicaveis durante a abertura guiada.");
  assert(guiadoClick.action === 0, "Controles de acao nao podem ser clicaveis durante a abertura guiada.");
  assert(guiadoClick.skip === 1, "Botao Pular deveria ser o unico controle clicavel na abertura guiada.");

  // Pular a introducao libera a exploracao livre.
  await clickProjected(cdp, "#ctrlSkip .timeline-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.guided === false && document.querySelector('#scrubberRow')?.object3D.visible && document.querySelector('#actionRow')?.object3D.visible && !document.querySelector('#ctrlSkip')?.object3D.visible",
    "exploracao livre apos pular a introducao"
  );

  const tlState = await evalJson(
    cdp,
    `({
      bars: document.querySelectorAll('#timelineBars .timeline-clickable.clickable').length,
      indicatorView: document.querySelector('#indicatorView').object3D.visible,
      narrativeTitle: document.querySelector('#narrativeTitle').getAttribute('value'),
      narrative: document.querySelector('#narrativeText').getAttribute('value'),
      yearLabel: document.querySelector('#ctrlYearLabel').getAttribute('value'),
      controls: document.querySelectorAll('#scrubberRow .timeline-clickable.clickable, #actionRow .timeline-clickable.clickable').length,
      gridLines: document.querySelectorAll('#chartGrid a-text').length,
      markers: document.querySelectorAll('#markers [data-idx]').length,
      trendSegments: document.querySelectorAll('#trendLine a-box').length,
      annotations: document.querySelectorAll('#annotations a-plane').length
    })`
  );

  assert(tlState.bars === anos, "Numero de barras/hitboxes da linha do tempo inesperado.");
  assert(!tlState.indicatorView, "Sub-modo de indicadores deveria ocultar na linha do tempo.");
  assert(tlState.narrativeTitle && tlState.narrativeTitle.length > 5, "Manchete narrativa vazia.");
  assert(tlState.narrative && tlState.narrative.length > 10, "Narrativa automatica vazia.");
  assert(/^\d{4}$/.test(tlState.yearLabel), "Rotulo de ano invalido.");
  assert(tlState.controls === 6, `Esperados 6 controles na exploracao livre, veio ${tlState.controls}.`);
  assert(tlState.gridLines === 5, `Esperadas 5 marcacoes de % no eixo, veio ${tlState.gridLines}.`);
  assert(tlState.markers === anos, "Deveria haver um marcador por ano.");
  assert(tlState.trendSegments >= 1, "Linha de tendencia sem segmentos.");
  assert(tlState.annotations >= 1, "Deveria haver pelo menos uma anotacao de pico/vale.");

  // Numeros absolutos, anotacao de 2020 e nota explicativa (HUD).
  const contexto2 = await evalJson(
    cdp,
    `({
      narrativeYear: document.querySelector('#narrativeYear').getAttribute('value'),
      eventoPandemia: [...document.querySelectorAll('#annotations a-text')].some(t => /Pandemia/.test(t.getAttribute('value') || '')),
      notaTitle: document.querySelector('#notaTitle').textContent,
      notaBody: document.querySelector('#notaBody').textContent
    })`
  );
  assert(/matriculas/.test(contexto2.narrativeYear), "Linha do ano deveria mostrar numeros absolutos (matriculas).");
  assert(contexto2.eventoPandemia, "Anotacao da pandemia de 2020 ausente na linha do tempo.");
  assert(contexto2.notaTitle && contexto2.notaBody.length > 30, "Nota explicativa (HUD) vazia na linha do tempo.");

  // Navegar um ano para tras.
  const anoAntes = await evalValue(cdp, "document.querySelector('#ctrlYearLabel').getAttribute('value')");
  await clickProjected(cdp, "#ctrlPrevYear .timeline-clickable.clickable", 0);
  await waitFor(
    cdp,
    `document.querySelector('#ctrlYearLabel').getAttribute('value') !== ${JSON.stringify(anoAntes)}`,
    "ano anterior apos clicar <"
  );
  const anoDepois = await evalValue(cdp, "document.querySelector('#ctrlYearLabel').getAttribute('value')");
  assert(Number(anoDepois) === Number(anoAntes) - 1, "Ano nao recuou exatamente 1.");

  // Ativar comparacao (regiao vs Brasil).
  await clickProjected(cdp, "#ctrlCompare .timeline-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.compareOn === true && document.querySelector('#compareBars')?.object3D.visible",
    "modo comparacao ativo"
  );
  const cmp = await evalJson(
    cdp,
    `({
      legendHidden: document.querySelector('#hudLegend').hidden,
      compareSegments: document.querySelectorAll('#compareBars a-box').length
    })`
  );
  assert(!cmp.legendHidden, "Legenda de comparacao deveria aparecer.");
  assert(cmp.compareSegments > 0, "Linha de comparacao deveria existir.");

  // Desativar comparacao.
  await clickProjected(cdp, "#ctrlCompare .timeline-clickable.clickable", 0);
  await waitFor(cdp, "state.compareOn === false", "comparacao desativada");

  // Reproduzir reinicia a abertura guiada; pular novamente volta a exploracao.
  await clickProjected(cdp, "#ctrlReplay .timeline-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.guided === true && document.querySelector('#ctrlSkip')?.object3D.visible",
    "reproduzir reinicia a abertura guiada"
  );
  await clickProjected(cdp, "#ctrlSkip .timeline-clickable.clickable", 0);
  await waitFor(cdp, "state.guided === false", "exploracao livre apos reproduzir");

  // Voltar para os indicadores.
  await clickProjected(cdp, "#ctrlBackIndicators .timeline-clickable.clickable", 0);
  await waitFor(
    cdp,
    "state.stage === 'indicators' && document.querySelector('#indicatorView')?.object3D.visible && document.querySelectorAll('#indicatorObjects .indicator-clickable.clickable').length === 4",
    "retorno aos indicadores"
  );

  // Voltar para a selecao.
  await clickProjected(cdp, "#backButton .exploration-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.stage === 'selection' && document.querySelector('#selectionWorld')?.object3D.visible && !document.querySelector('#explorationWorld')?.object3D.visible",
    "retorno para selecao apos indicadores"
  );
}

// O botao Brasil (visao nacional) vai direto para os indicadores, sem drill.
async function assertBrasilDirectFlow(cdp) {
  await clickProjected(cdp, "#brasilBtn .selection-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.stage === 'indicators' && state.context && state.context.tipo === 'brasil' && document.querySelectorAll('#indicatorObjects .indicator-clickable.clickable').length === 4",
    "fluxo direto do Brasil para indicadores"
  );

  const drillVisible = await evalValue(cdp, "document.querySelector('#drillCards').object3D.visible");
  assert(!drillVisible, "Brasil nao deveria abrir drill-down.");

  await clickProjected(cdp, "#backButton .exploration-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.stage === 'selection' && document.querySelector('#selectionWorld')?.object3D.visible",
    "retorno para selecao apos Brasil"
  );
}

async function assertVrCursorMode(cdp) {
  const cursorState = await evalJson(
    cdp,
    `(() => {
      const scene = document.querySelector('#scene');
      const cursor = document.querySelector('#gazeCursor');
      scene.emit('enter-vr');
      const enterFuse = cursor.getAttribute('cursor').fuse;
      scene.emit('exit-vr');
      const exitFuse = cursor.getAttribute('cursor').fuse;
      return { enterFuse, exitFuse };
    })()`
  );

  assert(cursorState.enterFuse === true, "Cursor gaze precisa ativar fuse ao entrar em VR.");
  assert(cursorState.exitFuse === false, "Cursor gaze precisa desligar fuse ao sair de VR.");
}

async function assertTour(cdp) {
  // Verificar que os cards de tour existem na galeria.
  const tourBtnExists = await evalValue(cdp, "Boolean(document.querySelector('#tourGallery .selection-clickable.clickable'))");
  assert(tourBtnExists, "Card de tour guiado deveria existir e ser clicavel na selecao.");

  // Iniciar o tour clicando no primeiro card.
  await clickProjected(cdp, "#tourGallery .selection-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.tourActive === true && state.tourStep === 0 && document.querySelector('#explorationWorld')?.object3D.visible",
    "tour iniciado (cena 1)"
  );

  const tourState1 = await evalJson(
    cdp,
    `({
      tourActive: state.tourActive,
      tourStep: state.tourStep,
      tourControlsVisible: document.querySelector('#tourControls')?.object3D.visible,
      tourBarHidden: document.querySelector('#tourBar')?.hidden,
      manchete: document.querySelector('#hudTitle')?.textContent || '',
      selectionVisible: document.querySelector('#selectionWorld')?.object3D.visible,
      tourPanelVisible: document.querySelector('#tourPanel')?.object3D.visible,
      tourClickables: document.querySelectorAll('.tour-clickable.clickable').length
    })`
  );

  assert(tourState1.tourActive, "Tour deveria estar ativo.");
  assert(tourState1.tourStep === 0, "Tour deveria estar na cena 0.");
  assert(tourState1.tourControlsVisible, "Controles do tour deveriam estar visiveis.");
  assert(!tourState1.tourBarHidden, "Barra de progresso do tour deveria estar visivel.");
  assert(tourState1.manchete.length > 5, "Manchete do tour vazia.");
  assert(tourState1.tourPanelVisible, "Cena de abertura deveria mostrar o painel de tese (texto).");
  assert(!tourState1.selectionVisible, "Selecao deveria estar oculta durante o tour.");
  assert(tourState1.tourClickables >= 2, "Botoes Anterior/Proximo do tour deveriam ser clicaveis.");

  // Avancar para a cena 2.
  const manchete1 = tourState1.manchete;
  await clickProjected(cdp, "#tourNextBtn .tour-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.tourStep === 1",
    "tour avancou para cena 2"
  );

  const manchete2 = await evalValue(cdp, "document.querySelector('#hudTitle')?.textContent || ''");
  assert(manchete2 !== manchete1, "Manchete deveria mudar ao avancar de cena.");

  // Voltar para a cena 1.
  await clickProjected(cdp, "#tourPrevBtn .tour-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.tourStep === 0",
    "tour voltou para cena 1"
  );

  const manchete1b = await evalValue(cdp, "document.querySelector('#hudTitle')?.textContent || ''");
  assert(manchete1b === manchete1, "Manchete deveria voltar ao retornar a cena 1.");

  // Avancar ate a ultima cena.
  const totalScenes = await evalValue(cdp, "state.tourScenes.length");
  for (let i = 0; i < totalScenes - 1; i += 1) {
    await clickProjected(cdp, "#tourNextBtn .tour-clickable.clickable", 0);
    await waitFor(
      cdp,
      `!state.transitioning && state.tourStep === ${i + 1}`,
      `tour avancou para cena ${i + 2}`
    );
  }

  // Ultima cena = fechamento (painel de texto com CTA); botao diz "Concluir".
  const fim = await evalJson(
    cdp,
    `({
      label: document.querySelector('#tourNextLabel')?.getAttribute('value') || '',
      painelVisivel: document.querySelector('#tourPanel')?.object3D.visible,
      ctaVisivel: document.querySelector('#tourCta')?.object3D.visible
    })`
  );
  assert(/conclui/i.test(fim.label), `Botao da ultima cena deveria dizer 'Concluir', veio '${fim.label}'.`);
  assert(fim.painelVisivel, "Cena de fechamento deveria mostrar o painel de texto.");
  assert(fim.ctaVisivel, "Cena de fechamento deveria mostrar a chamada a acao (CTA).");

  // Concluir encerra o tour e volta ao mapa (selecao).
  await clickProjected(cdp, "#tourNextBtn .tour-clickable.clickable", 0);
  await waitFor(
    cdp,
    "!state.transitioning && state.tourActive === false && state.stage === 'selection' && document.querySelector('#mapView')?.object3D.visible",
    "tour encerrado volta ao mapa"
  );

  const afterTour = await evalJson(
    cdp,
    `({
      tourBarHidden: document.querySelector('#tourBar')?.hidden,
      tourControlsVisible: document.querySelector('#tourControls')?.object3D.visible,
      tourPanelVisible: document.querySelector('#tourPanel')?.object3D.visible
    })`
  );
  assert(afterTour.tourBarHidden, "Barra de progresso deveria sumir apos tour.");
  assert(!afterTour.tourControlsVisible, "Controles do tour deveriam sumir apos encerrar.");
  assert(!afterTour.tourPanelVisible, "Painel do tour deveria sumir apos encerrar.");
}

async function clickProjected(cdp, selector, index) {
  const point = await evalJson(
    cdp,
    `(() => {
      const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const target = elements[${index}];
      const scene = document.querySelector('a-scene');
      const camera = document.querySelector('#camera')?.getObject3D('camera');
      if (!target || !target.object3D || !camera) return null;
      const position = new AFRAME.THREE.Vector3();
      scene.object3D.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      target.object3D.updateMatrixWorld(true);
      target.object3D.getWorldPosition(position);
      position.project(camera);
      return {
        x: (position.x + 1) * window.innerWidth / 2,
        y: (1 - position.y) * window.innerHeight / 2,
        height: window.innerHeight,
        width: window.innerWidth,
        visible: target.object3D.visible
      };
    })()`
  );

  assert(point, `Nao foi possivel projetar ${selector}[${index}] na tela.`);
  assert(point.visible, `${selector}[${index}] deveria estar visivel antes do clique.`);
  assert(point.x >= 0 && point.x <= point.width, `${selector}[${index}] ficou fora da viewport no eixo X.`);
  assert(point.y >= 0 && point.y <= point.height, `${selector}[${index}] ficou fora da viewport no eixo Y.`);

  if (DEBUG) {
    console.log("click", selector, index, point);
  }

  await cdp.send("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await sleep(120);
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    button: "left",
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

async function moveProjected(cdp, selector, index) {
  const point = await projectElement(cdp, selector, index);
  assert(point, `Nao foi possivel projetar ${selector}[${index}] na tela.`);
  assert(point.visible, `${selector}[${index}] deveria estar visivel antes do hover.`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await sleep(120);
}

async function projectElement(cdp, selector, index) {
  return evalJson(
    cdp,
    `(() => {
      const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const target = elements[${index}];
      const scene = document.querySelector('a-scene');
      const camera = document.querySelector('#camera')?.getObject3D('camera');
      if (!target || !target.object3D || !camera) return null;
      const position = new AFRAME.THREE.Vector3();
      scene.object3D.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      target.object3D.updateMatrixWorld(true);
      target.object3D.getWorldPosition(position);
      position.project(camera);
      return {
        x: (position.x + 1) * window.innerWidth / 2,
        y: (1 - position.y) * window.innerHeight / 2,
        height: window.innerHeight,
        width: window.innerWidth,
        visible: target.object3D.visible
      };
    })()`
  );
}

async function waitFor(cdp, expression, label, timeoutMs = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await evalValue(cdp, `Boolean(${expression})`);
    if (result === true) return;
    await sleep(100);
  }

  throw new Error(`Timeout aguardando: ${label}`);
}

async function evalJson(cdp, expression) {
  const value = await evalValue(cdp, `JSON.stringify(${expression})`);
  return JSON.parse(value);
}

async function evalValue(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    const exc = result.exceptionDetails;
    const msg = (exc.exception && exc.exception.description) ? exc.exception.description : (exc.text || "Erro em Runtime.evaluate.");
    throw new Error(msg);
  }

  return result.result.value;
}

function assertNoBrowserErrors(events) {
  const runtimeExceptions = events.filter((event) => event.method === "Runtime.exceptionThrown");
  const consoleErrors = events.filter(
    (event) =>
      event.method === "Runtime.consoleAPICalled" &&
      ["error", "assert"].includes(event.params.type)
  );
  const logErrors = events.filter(
    (event) => event.method === "Log.entryAdded" && event.params.entry.level === "error"
  );

  assert(runtimeExceptions.length === 0, `Excecoes no browser: ${runtimeExceptions.length}`);
  assert(consoleErrors.length === 0, `Console errors no browser: ${consoleErrors.length}`);
  assert(logErrors.length === 0, `Log errors no browser: ${logErrors.length}`);
}

async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const filePath = path.resolve(ROOT, safePath);

      if (!filePath.startsWith(ROOT)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await fsp.readFile(filePath);
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { instance: server, url: `http://127.0.0.1:${port}/` };
}

async function startBrowser(browserPath, url) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vr-gpt-smoke-"));
  const browserProcess = spawn(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--window-size=1366,768",
      url,
    ],
    { stdio: "ignore" }
  );

  browserProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Browser saiu com codigo ${code}.`);
    }
  });

  return { port, process: browserProcess };
}

async function connectToPage(port) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const pageTarget = targets.find((target) => target.type === "page");
  assert(pageTarget, "Nenhuma aba do browser foi encontrada.");
  return connectWebSocket(pageTarget.webSocketDebuggerUrl);
}

async function fetchJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome ainda pode estar inicializando a porta de debug.
    }
    await sleep(100);
  }

  throw new Error(`Nao foi possivel acessar ${url}`);
}

function connectWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const events = [];
    let id = 0;

    ws.addEventListener("open", () => {
      resolve({
        events,
        send(method, params = {}) {
          const messageId = ++id;
          ws.send(JSON.stringify({ id: messageId, method, params }));
          return new Promise((res, rej) => pending.set(messageId, { res, rej }));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method) events.push(message);

      if (!message.id || !pending.has(message.id)) return;

      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        rej(new Error(JSON.stringify(message.error)));
      } else {
        res(message.result);
      }
    });

    ws.addEventListener("error", reject);
  });
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);

  const browserPath = candidates.find((candidate) => fs.existsSync(candidate));
  assert(browserPath, "Chrome ou Edge nao encontrado. Defina BROWSER_PATH para rodar o smoke test.");
  return browserPath;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
