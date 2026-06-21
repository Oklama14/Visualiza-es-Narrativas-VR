let dadosSelecionados = JSON.parse(localStorage.getItem("posterDados"));

if (!dadosSelecionados || dadosSelecionados.length === 0) {
    dadosSelecionados = [{ tipo: "brasil", valor: "Brasil" }];
}

const cores = [
    "#4da6ff", "#1c2137", "#6f42c1", "#17a2b8"
];

function criarElementoContexto(classe, texto) {
    const elemento = document.createElement("span");
    elemento.className = classe;
    elemento.textContent = texto;
    return elemento;
}

function valorNumerico(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function gerarNarrativa(dados) {

    if (!dados || !Array.isArray(dados.datasets) || !dados.datasets.length) return;

    const metric = document.getElementById("metric-select").value;

    let maiorValor = -Infinity;
    let menorValor = Infinity;

    let localMaior = "";
    let localMenor = "";

    let anoMaior = "";
    let anoMenor = "";

    let seriePrincipal = null;

    dados.datasets.forEach(dataset => {

        dataset.data.forEach((valorOriginal, index) => {

            const valor = valorNumerico(valorOriginal);
            if (valor === null) return;

            if (valor > maiorValor) {
                maiorValor = valor;
                localMaior = dataset.label;
                anoMaior = dados.labels[index];
                seriePrincipal = dataset;
            }

            if (valor < menorValor) {
                menorValor = valor;
                localMenor = dataset.label;
                anoMenor = dados.labels[index];
            }

        });

    });

    const indiceAnoMaior = dados.labels.indexOf(anoMaior);

    let comparacoes = [];

    dados.datasets.forEach(dataset => {

        if (dataset.label === localMaior) return;

        const valorMesmoAno = valorNumerico(dataset.data[indiceAnoMaior]);

        if (valorMesmoAno === null) return;

        comparacoes.push(
            `${dataset.label} registrou ${valorMesmoAno.toFixed(2)}%`
        );

    });

    if (!seriePrincipal) return;

    const valoresSerie = seriePrincipal.data.map(valorNumerico).filter(valor => valor !== null);
    const primeiroValor = valoresSerie[0];
    const ultimoValor = valoresSerie[valoresSerie.length - 1];

    let tendencia = "";

    if (ultimoValor > primeiroValor) {
        tendencia = "crescimento";
    } else if (ultimoValor < primeiroValor) {
        tendencia = "redução";
    } else {
        tendencia = "estabilidade";
    }

    let titulo = "";
    let texto = "";

    switch (metric) {

        case "evasao":

            titulo =
                `O maior índice de evasão ocorreu em ${localMaior}`;

            texto =
                `O maior índice observado na série histórica foi registrado por ${localMaior} em ${anoMaior}, quando a evasão atingiu ${maiorValor.toFixed(2)}%. Entre os demais contextos analisados no mesmo ano, ${comparacoes.join(", enquanto ")}. A evolução da série indica uma tendência de ${tendencia} ao longo do período analisado.`;

            break;

        case "conclusao":

            titulo =
                `O melhor resultado de conclusão ocorreu em ${localMaior}`;

            texto =
                `${localMaior} apresentou o maior percentual de conclusão da série histórica em ${anoMaior}, alcançando ${maiorValor.toFixed(2)}%. No mesmo período, ${comparacoes.join(", enquanto ")}. A trajetória do indicador sugere uma tendência de ${tendencia} ao longo dos anos observados.`;

            break;

        case "eficiencia":

            titulo =
                `O maior índice de eficiência ocorreu em ${localMaior}`;

            texto =
                `${localMaior} registrou o melhor desempenho acadêmico da série em ${anoMaior}, atingindo ${maiorValor.toFixed(2)}%. Entre os demais contextos avaliados, ${comparacoes.join(", enquanto ")}. A evolução histórica demonstra uma tendência de ${tendencia} para este indicador.`;

            break;

        case "retencao":

            titulo =
                `O maior índice de retenção ocorreu em ${localMaior}`;

            texto =
                `${localMaior} apresentou a maior taxa de retenção observada na série histórica em ${anoMaior}, alcançando ${maiorValor.toFixed(2)}%. No mesmo ano, ${comparacoes.join(", enquanto ")}. O comportamento temporal indica uma tendência de ${tendencia} ao longo do período analisado.`;

            break;
    }

    const destaque = document.getElementById("narrativa-destaque");
    const complementar = document.getElementById("narrativa-complementar");

    if (destaque) destaque.innerText = titulo;
    if (complementar) complementar.innerText = texto;
}
async function carregarGraficoLinha(tipo = "evasao") {

    let dadosSelecionadosAtual = JSON.parse(localStorage.getItem("posterDados"));

    if (!dadosSelecionadosAtual || dadosSelecionadosAtual.length === 0) {
        dadosSelecionadosAtual = [{ tipo: "brasil", valor: "Brasil" }];
    }

    const response = await fetch("api/grafico.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            tipo: tipo,
            dados: dadosSelecionadosAtual
        })
    });

    const data = await response.json();

    if (!response.ok || data.erro || !Array.isArray(data.datasets)) {
        throw new Error(data.erro || "Nao foi possivel carregar os dados do grafico.");
    }

    return {
        labels: data.labels,
        datasets: data.datasets.map((ds, index) => ({
            label: ds.label,
            data: ds.data,
            borderColor: cores[index % cores.length],
            borderWidth: ds.label.includes("Brasil") ? 2 : 4,
            tension: 0.4,
            pointRadius: 4,
            fill: false
        }))
    };
}

const ctx = document.getElementById('myChart');
let myLineChart;

window.atualizarTextoExplicativo = function() {

    const metric = document.getElementById('metric-select').value;

    const explicacao = {
        evasao: "Percentual de estudantes que deixaram o curso antes da conclusão.",
        conclusao: "Percentual de estudantes que concluíram o curso no período analisado.",
        eficiencia: "Indicador de aproveitamento acadêmico considerando permanência e conclusão.",
        retencao: "Percentual de estudantes que permaneceram no curso além do tempo previsto."
    };

    document.getElementById('quadrado2').innerText = explicacao[metric];
};

window.atualizarTituloExplicativo = function() {

    const metric = document.getElementById('metric-select').value;

    const titulo = {
        evasao: "Evasão",
        conclusao: "Conclusão",
        eficiencia: "Efeciência Acadêmica",
        retencao: "Retenção"
    };

    document.getElementById('quadrado1').innerText = titulo[metric];
};

window.atualizarContextoMagazine = function () {

    let dadosSelecionados = JSON.parse(localStorage.getItem("posterDados"));

    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        dadosSelecionados = [{ tipo: "brasil", valor: "Brasil" }];
    }

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

    const label = document.createElement("div");
    label.className = "contexto-label";
    label.textContent = "Contexto da análise";
    container.appendChild(label);

    dadosSelecionados.forEach(item => {
        const itemContexto = document.createElement("div");
        itemContexto.className = "item-contexto";

        itemContexto.appendChild(criarElementoContexto("tipo-contexto", nomes[item.tipo] || item.tipo));
        itemContexto.appendChild(criarElementoContexto("valor-contexto", item.valor));
        container.appendChild(itemContexto);
    });
};
async function initChart() {

    const dados = await carregarGraficoLinha("evasao");

    myLineChart = new Chart(ctx, {
        type: 'line',
        data: dados,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: 'black' }
                }
            },
            scales: {
                x: {
                    ticks: { color: 'black' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: 'black' },
                    grid: { color: 'rgba(138, 131, 131, 0.1)' }
                }
            }
        }
    });

    gerarNarrativa(dados);
}

(async () => {
    await initChart();

    atualizarTituloExplicativo();
    atualizarTextoExplicativo();
    atualizarContextoMagazine();
})();
document.getElementById('metric-select').addEventListener('change', async function(e) {

    const metric = e.target.value;

    const novosDados = await carregarGraficoLinha(metric);

    const titulos = {
        evasao: "TAXA DE EVASÃO %",
        conclusao: "TAXA DE CONCLUSÃO %",
        eficiencia: "ÍNDICE DE EFICIÊNCIA ACADÊMICA",
        retencao: "TAXA DE RETENÇÃO %"
    };

    document.getElementById('titulo-grafico-linha').innerText = titulos[metric];

    myLineChart.data.labels = novosDados.labels;
    myLineChart.data.datasets = novosDados.datasets;

myLineChart.update();
gerarNarrativa(novosDados);
atualizarTituloExplicativo();
atualizarTextoExplicativo();
atualizarContextoMagazine();
    
});



window.atualizarGraficoLinha = async function() {

    const metric = document.getElementById('metric-select').value;

    const novosDados = await carregarGraficoLinha(metric);

    const titulos = {
        evasao: "TAXA DE EVASÃO %",
        conclusao: "TAXA DE CONCLUSÃO %",
        eficiencia: "ÍNDICE DE EFICIÊNCIA ACADÊMICA",
        retencao: "TAXA DE RETENÇÃO %"
    };

    document.getElementById('titulo-grafico-linha').innerText = titulos[metric];

    myLineChart.data.labels = novosDados.labels;
    myLineChart.data.datasets = novosDados.datasets;

    myLineChart.update();

    gerarNarrativa(novosDados);

    atualizarTituloExplicativo();
    atualizarTextoExplicativo();
    atualizarContextoMagazine();
};

