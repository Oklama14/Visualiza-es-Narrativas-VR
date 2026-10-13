// ----------------------------------------------------------------------------
// A2: Galeria de historias curadas — 3 percursos tematicos.
// Cada historia segue o arco do A1 (abertura/climax/fechamento).
// O motor (tourGoTo, tourNext/Prev, barra de progresso) e identico.
// ----------------------------------------------------------------------------

const TOURS = {
  panorama: {
    titulo: "Panorama Nacional",
    descricao: "A evasao, a conclusao e a eficiencia de 2017 a 2024 no retrato do Brasil.",
    cor: "#7b61ff",
    icone: "\u25C9", // ◉
    cenas: [
      {
        tipo: "abertura",
        kicker: "PANORAMA NACIONAL",
        manchete: "A Rede Federal forma — e tambem perde — milhares de estudantes por ano",
        corpo: "Vamos percorrer a evasao, a conclusao e a eficiencia academica de 2017 a 2024 e entender para onde vao os alunos.",
        conectivo: "Comecamos pelo retrato nacional.",
      },
      {
        contextoId: "brasil", indicador: "evasao", modo: "timeline",
        manchete: "Quase metade dos estudantes evadia em 2017",
        conectivo: "A evasao caiu ao longo dos anos, mas para onde foram esses estudantes?",
      },
      {
        contextoId: "brasil", indicador: "conclusao", modo: "timeline",
        manchete: "A conclusao acompanhou a queda da evasao",
        conectivo: "Juntando evasao, conclusao e retencao, vemos o retrato completo...",
      },
      {
        contextoId: "brasil", indicador: null, modo: "composicao", climax: true,
        manchete: "Para onde vao os alunos: o retrato completo",
        conectivo: "Esse e o cenario nacional. Mas como esses tres indicadores se combinam?",
      },
      {
        contextoId: "brasil", indicador: null, modo: "indicadores", showLinks: true,
        manchete: "Eficiencia = f(Conclusao, Evasao, Retencao)",
        conectivo: "Mais conclusao e menos evasao elevam a eficiencia. Mais retencao a deprime.",
      },
      {
        tipo: "fechamento",
        kicker: "CONCLUSAO",
        manchete: "A eficiencia melhora — mas as desigualdades persistem",
        corpo: "Reduzir a evasao e elevar a conclusao sao os proximos desafios. Explore os dados da sua regiao.",
        cta: true, conectivo: "",
      },
    ],
  },

  abismo: {
    titulo: "O Abismo Regional",
    descricao: "Cinco regioes, cinco realidades: o contraste entre Norte e Sul/Sudeste.",
    cor: "#ff6b6b",
    icone: "\u25B2", // ▲
    cenas: [
      {
        tipo: "abertura",
        kicker: "ABISMO REGIONAL",
        manchete: "Cinco regioes, cinco realidades",
        corpo: "As medias nacionais escondem diferencas profundas. Vamos comparar Norte, Sudeste e Sul para revelar o abismo da eficiencia academica.",
        conectivo: "Comecamos pelo Norte, onde a evasao e mais alta.",
      },
      {
        contextoId: "norte", indicador: "evasao", modo: "timeline",
        manchete: "O Norte ainda enfrenta evasao acima da media",
        conectivo: "Se a evasao e alta no Norte, como esta a eficiencia?",
      },
      {
        contextoId: "norte", indicador: "eficiencia", modo: "timeline",
        manchete: "A eficiencia academica no Norte cresce devagar",
        conectivo: "Comparando com o Sudeste, a diferenca regional aparece...",
      },
      {
        contextoId: "sudeste", indicador: "eficiencia", modo: "timeline", climax: true,
        manchete: "O Sudeste lidera em eficiencia academica",
        conectivo: "O abismo entre as regioes fica evidente.",
      },
      {
        contextoId: "sul", indicador: "eficiencia", modo: "timeline",
        manchete: "O Sul consolida a maior eficiencia do pais",
        conectivo: "O contraste com o Norte e irrefutavel.",
      },
      {
        tipo: "fechamento",
        kicker: "CONCLUSAO",
        manchete: "O abismo regional persiste",
        corpo: "Enquanto Sul e Sudeste superam 80% de eficiencia, o Norte ainda luta para alcanca-los. Politicas precisam ser regionalizadas.",
        cta: true, conectivo: "",
      },
    ],
  },

  jornada: {
    titulo: "A Jornada do Aluno",
    descricao: "Para onde vao os estudantes? O fluxo entre conclusao, retencao e evasao.",
    cor: "#3ad29f",
    icone: "\u21C4", // ⇄
    cenas: [
      {
        tipo: "abertura",
        kicker: "A JORNADA DO ALUNO",
        manchete: "Para onde vao os estudantes da Rede Federal?",
        corpo: "Cada estudante matriculado segue um de tres caminhos: conclui, e retido ou evade. Vamos visualizar esse fluxo.",
        conectivo: "Comecamos pelo retrato nacional.",
      },
      {
        contextoId: "brasil", indicador: null, modo: "composicao",
        manchete: "O retrato nacional: conclusao, retencao e evasao",
        conectivo: "Esse e o cenario medio. Como esses tres fluxos afetam a eficiencia?",
      },
      {
        contextoId: "brasil", indicador: null, modo: "indicadores", showLinks: true, climax: true,
        manchete: "Eficiencia = f(Conclusao, Evasao, Retencao)",
        conectivo: "A relacao e direta: mais evasao, menos eficiencia.",
      },
      {
        contextoId: "sul", indicador: null, modo: "composicao",
        manchete: "O Sul: o melhor cenario do pais",
        conectivo: "Agora compare com o Norte, onde a evasao e dominante.",
      },
      {
        contextoId: "norte", indicador: null, modo: "composicao",
        manchete: "O Norte: evasao domina a composicao",
        conectivo: "A diferenca na composicao explica o abismo na eficiencia.",
      },
      {
        tipo: "fechamento",
        kicker: "CONCLUSAO",
        manchete: "Cada aluno evadido e uma historia interrompida",
        corpo: "Reduzir a evasao e o caminho mais direto para elevar a eficiencia. Explore os dados da sua regiao e descubra o cenario local.",
        cta: true, conectivo: "",
      },
    ],
  },
};

