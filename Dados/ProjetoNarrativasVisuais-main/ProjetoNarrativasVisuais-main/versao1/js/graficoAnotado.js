const corLinha = "#0a2d50";
const corPico = "#17803d";
const corVale = "#b42318";

let graficoAnotado;
let dadosEficiencia = null;
let dadosEvasao = null;
let eventosEducacao = [];
let serieSelecionada = 0;

function obterConfiguracaoAtual() {
    const dados = JSON.parse(localStorage.getItem("posterDados"));
    return dados && dados.length ? dados : [{ tipo: "brasil", valor: "Brasil" }];
}

function numeroValido(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function formatarPercentual(valor) {
    const numero = numeroValido(valor);
    return numero === null ? "--" : `${numero.toFixed(2)}%`;
}

function criarSpan(classe, texto) {
    const span = document.createElement("span");
    span.className = classe;
    span.textContent = texto;
    return span;
}

async function carregarIndicador(tipo) {
    const response = await fetch("api/grafico.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tipo,
            dados: obterConfiguracaoAtual()
        })
    });

    const data = await response.json();

    if (!response.ok || data.erro || !Array.isArray(data.datasets)) {
        throw new Error(data.erro || "Não foi possível carregar os dados do gráfico.");
    }

    return data;
}

async function carregarEventos() {
    const response = await fetch("api/eventos.php");
    const data = await response.json();

    if (!response.ok || data.erro || !Array.isArray(data)) {
        throw new Error(data.erro || "Não foi possível carregar os eventos.");
    }

    eventosEducacao = data.map(evento => ({
        ano: Number(evento.ano),
        tipo: evento.tipo,
        impacto: evento.impacto,
        titulo: evento.titulo,
        texto: evento.descricao
    }));
}

function encontrarExtremos(labels, valores) {
    let pico = { valor: -Infinity, index: -1, ano: "" };
    let vale = { valor: Infinity, index: -1, ano: "" };

    valores.forEach((valorOriginal, index) => {
        const valor = numeroValido(valorOriginal);
        if (valor === null) return;

        if (valor > pico.valor) {
            pico = { valor, index, ano: labels[index] };
        }

        if (valor < vale.valor) {
            vale = { valor, index, ano: labels[index] };
        }
    });

    return { pico, vale };
}

function pesoEvento(evento) {
    if (evento.tipo === "negativo" && evento.impacto === "alto") return 5;
    if (evento.tipo === "negativo") return 4;
    if (evento.impacto === "alto") return 3;
    if (evento.impacto === "medio") return 2;
    return 1;
}

function eventosAssociados(ano) {
    const anoNumero = Number(ano);
    return eventosEducacao
        .filter(evento => Math.abs(evento.ano - anoNumero) <= 1)
        .sort((a, b) => {
            const peso = pesoEvento(b) - pesoEvento(a);
            if (peso !== 0) return peso;
            return Math.abs(a.ano - anoNumero) - Math.abs(b.ano - anoNumero);
        })
        .slice(0, 3);
}

function textoEventos(eventos) {
    if (!eventos.length) return "nenhum evento associado encontrado para o período";
    return eventos.map(evento => `${evento.ano}: ${evento.titulo}`).join("; ");
}

function atualizarContexto() {
    const container = document.getElementById("contexto-selecao");
    if (!container) return;

    const nomes = {
        brasil: "Brasil",
        regiao: "Região",
        estado: "Estado",
        instituicao: "Instituição",
        campus: "Campus"
    };

    container.textContent = "";

    obterConfiguracaoAtual().forEach(item => {
        const itemContexto = document.createElement("div");
        itemContexto.className = "item-contexto";
        itemContexto.appendChild(criarSpan("tipo-contexto", nomes[item.tipo] || item.tipo));
        itemContexto.appendChild(criarSpan("valor-contexto", item.valor));
        container.appendChild(itemContexto);
    });
}

function preencherSeletorSeries() {
    const seletor = document.getElementById("seletorSerie");
    if (!seletor || !dadosEficiencia) return;

    seletor.textContent = "";

    dadosEficiencia.datasets.forEach((dataset, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = dataset.label;
        seletor.appendChild(option);
    });

    if (serieSelecionada >= dadosEficiencia.datasets.length) {
        serieSelecionada = 0;
    }

    seletor.value = String(serieSelecionada);
}

function evasaoNoIndice(index) {
    const dataset = dadosEvasao?.datasets?.[serieSelecionada];
    return dataset ? numeroValido(dataset.data[index]) : null;
}

function atualizarTextos(dataset, extremos, eventosVale) {
    const evasaoVale = evasaoNoIndice(extremos.vale.index);

    document.getElementById("subtituloSerie").textContent =
        `Série selecionada: ${dataset.label}`;

    document.getElementById("tituloGraficoAnotado").textContent =
        `Eficiência acadêmica de ${dataset.label}`;

    document.getElementById("resumoValeTopo").textContent =
        `${formatarPercentual(extremos.vale.valor)} em ${extremos.vale.ano}`;

    document.getElementById("tituloPeriodoCritico").textContent =
        `${dataset.label}: menor ponto em ${extremos.vale.ano}`;

    document.getElementById("textoPeriodoCritico").textContent =
        `A eficiência acadêmica de ${formatarPercentual(extremos.vale.valor)} em ${extremos.vale.ano} pode estar relacionada à evasão de ${formatarPercentual(evasaoVale)}. Possíveis eventos associados: ${textoEventos(eventosVale)}.`;
}

function quebrarTexto(ctx, texto, larguraMaxima, limiteLinhas = 4) {
    const palavras = texto.split(" ");
    const linhas = [];
    let linha = "";

    palavras.forEach(palavra => {
        const teste = linha ? `${linha} ${palavra}` : palavra;
        if (ctx.measureText(teste).width > larguraMaxima && linha) {
            linhas.push(linha);
            linha = palavra;
        } else {
            linha = teste;
        }
    });

    if (linha) linhas.push(linha);
    return linhas.slice(0, limiteLinhas);
}

function limitar(valor, minimo, maximo) {
    return Math.min(Math.max(valor, minimo), maximo);
}

function retanguloArredondado(ctx, x, y, largura, altura, raio) {
    if (ctx.roundRect) {
        ctx.roundRect(x, y, largura, altura, raio);
        return;
    }

    ctx.moveTo(x + raio, y);
    ctx.lineTo(x + largura - raio, y);
    ctx.quadraticCurveTo(x + largura, y, x + largura, y + raio);
    ctx.lineTo(x + largura, y + altura - raio);
    ctx.quadraticCurveTo(x + largura, y + altura, x + largura - raio, y + altura);
    ctx.lineTo(x + raio, y + altura);
    ctx.quadraticCurveTo(x, y + altura, x, y + altura - raio);
    ctx.lineTo(x, y + raio);
    ctx.quadraticCurveTo(x, y, x + raio, y);
}

function desenharAnotacao(ctx, config) {
    const { x, y, boxX, boxY, largura, titulo, texto, cor, destaque } = config;
    const padding = destaque ? 16 : 12;

    ctx.save();
    ctx.font = "800 13px Montserrat, sans-serif";
    const tituloLinhas = quebrarTexto(ctx, titulo, largura - padding * 2, 3);
    ctx.font = "600 12px Segoe UI, sans-serif";
    const textoLinhas = texto ? quebrarTexto(ctx, texto, largura - padding * 2, destaque ? 5 : 3) : [];
    const altura = padding * 2 + tituloLinhas.length * 17 + textoLinhas.length * 16 + (textoLinhas.length ? 8 : 0);

    const pontoBoxX = boxX + largura / 2;
    const pontoBoxY = boxY + altura / 2;

    ctx.strokeStyle = destaque ? "rgba(180, 35, 24, 0.45)" : "rgba(15, 23, 42, 0.32)";
    ctx.lineWidth = destaque ? 1.8 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(pontoBoxX, pontoBoxY);
    ctx.stroke();

    ctx.fillStyle = destaque ? "rgba(255, 255, 255, 0.98)" : "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = destaque ? "rgba(180, 35, 24, 0.35)" : "rgba(15, 23, 42, 0.14)";
    ctx.lineWidth = destaque ? 1.6 : 1;
    ctx.beginPath();
    retanguloArredondado(ctx, boxX, boxY, largura, altura, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = destaque ? 4 : 3;
    ctx.beginPath();
    ctx.arc(x, y, destaque ? 9 : 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(x, y, destaque ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = destaque ? "#7f1d1d" : "#0f172a";
    ctx.font = "800 13px Montserrat, sans-serif";
    let cursorY = boxY + padding + 12;
    tituloLinhas.forEach(linha => {
        ctx.fillText(linha, boxX + padding, cursorY);
        cursorY += 17;
    });

    if (textoLinhas.length) {
        cursorY += 5;
        ctx.fillStyle = "#475569";
        ctx.font = "600 12px Segoe UI, sans-serif";
        textoLinhas.forEach(linha => {
            ctx.fillText(linha, boxX + padding, cursorY);
            cursorY += 16;
        });
    }

    ctx.restore();
}

const pluginExtremos = {
    id: "pluginExtremos",
    afterDraw(chart) {
        const extremos = chart.options.plugins.pluginExtremos?.extremos;
        if (!extremos) return;

        const { ctx, chartArea, scales } = chart;
        const labels = chart.data.labels;
        const dataset = chart.data.datasets[0];
        const largura = chart.width < 720 ? 230 : 315;

        const desenharPonto = (ponto, tipo) => {
            const dataIndex = labels.indexOf(String(ponto.ano));
            if (dataIndex < 0) return;

            const valor = numeroValido(dataset.data[dataIndex]);
            if (valor === null) return;

            const x = scales.x.getPixelForValue(dataIndex);
            const y = scales.y.getPixelForValue(valor);
            const ficaNaDireita = x < chartArea.left + chartArea.width * 0.55;
            const boxX = ficaNaDireita
                ? limitar(x + 34, chartArea.left + 8, chartArea.right - largura)
                : limitar(x - largura - 34, chartArea.left + 8, chartArea.right - largura);
            const deslocamentoY = tipo === "pico" ? -92 : -138;
            const boxY = limitar(
                y + deslocamentoY,
                Math.max(12, chartArea.top - 118),
                chartArea.bottom - (tipo === "pico" ? 82 : 154)
            );

            if (tipo === "pico") {
                desenharAnotacao(ctx, {
                    x,
                    y,
                    boxX,
                    boxY,
                    largura,
                    titulo: `Maior eficiência acadêmica: ${formatarPercentual(ponto.valor)} em ${ponto.ano}.`,
                    texto: "",
                    cor: corPico,
                    destaque: false
                });
            } else {
                desenharAnotacao(ctx, {
                    x,
                    y,
                    boxX,
                    boxY,
                    largura,
                    titulo: `Eficiência acadêmica de ${formatarPercentual(ponto.valor)} em ${ponto.ano}`,
                    texto: `Pode estar relacionada à evasão de ${formatarPercentual(extremos.evasaoVale)}. Eventos: ${textoEventos(extremos.eventosVale)}.`,
                    cor: corVale,
                    destaque: true
                });
            }
        };

        desenharPonto(extremos.pico, "pico");
        desenharPonto(extremos.vale, "vale");
    }
};

function renderizarGrafico() {
    if (!dadosEficiencia?.datasets?.length) return;

    const dataset = dadosEficiencia.datasets[serieSelecionada];
    const valores = dataset.data.map(numeroValido);
    const extremos = encontrarExtremos(dadosEficiencia.labels, valores);
    const eventosVale = eventosAssociados(extremos.vale.ano);
    const evasaoVale = evasaoNoIndice(extremos.vale.index);

    atualizarTextos(dataset, extremos, eventosVale);

    if (graficoAnotado) {
        graficoAnotado.destroy();
    }

    graficoAnotado = new Chart(document.getElementById("graficoAnotado"), {
        type: "line",
        data: {
            labels: dadosEficiencia.labels,
            datasets: [{
                label: dataset.label,
                data: valores,
                borderColor: corLinha,
                backgroundColor: corLinha,
                borderWidth: 4,
                pointRadius: 4,
                pointHoverRadius: 7,
                tension: 0.34,
                fill: false
            }]
        },
        plugins: [pluginExtremos],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            layout: {
                padding: {
                    top: 132,
                    right: 36,
                    bottom: 118,
                    left: 10
                }
            },
            plugins: {
                pluginExtremos: {
                    extremos: {
                        ...extremos,
                        eventosVale,
                        evasaoVale
                    }
                },
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0f172a",
                    titleColor: "#fff",
                    bodyColor: "#e5e7eb",
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: contexto => ` ${contexto.dataset.label}: ${formatarPercentual(contexto.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#4b5563", font: { weight: "700" } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#4b5563",
                        callback: valor => `${valor}%`
                    },
                    grid: { color: "rgba(148, 163, 184, 0.24)" },
                    title: {
                        display: true,
                        text: "Eficiência acadêmica (%)",
                        color: "#475569",
                        font: { weight: "700" }
                    }
                }
            }
        }
    });
}

async function atualizarGraficoAnotado() {
    const seletor = document.getElementById("seletorSerie");

    try {
        [dadosEficiencia, dadosEvasao] = await Promise.all([
            carregarIndicador("eficiencia"),
            carregarIndicador("evasao"),
            carregarEventos()
        ]);

        preencherSeletorSeries();
        atualizarContexto();
        renderizarGrafico();

        if (seletor && !seletor.dataset.listener) {
            seletor.addEventListener("change", event => {
                serieSelecionada = Number(event.target.value);
                renderizarGrafico();
            });
            seletor.dataset.listener = "true";
        }
    } catch (erro) {
        const texto = document.getElementById("textoPeriodoCritico");
        if (texto) texto.textContent = erro.message;
        console.error(erro);
    }
}

window.atualizarGraficoLinha = atualizarGraficoAnotado;
document.addEventListener("DOMContentLoaded", atualizarGraficoAnotado);
