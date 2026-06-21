let graficoBarras;

async function carregarGraficoBarras(ano) {

    let dadosSelecionados = JSON.parse(localStorage.getItem("posterDados"));

    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        dadosSelecionados = [{ tipo: "brasil", valor: "Brasil" }];
    }

    const response = await fetch("api/barras.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ano: ano,
            dados: dadosSelecionados
        })
    });

    const data = await response.json();

    if (!response.ok || data.erro || !Array.isArray(data.datasets)) {
        throw new Error(data.erro || "Nao foi possivel carregar os dados do grafico de barras.");
    }

    return data;
}

async function initGrafico(ano = 2024) {

    const data = await carregarGraficoBarras(ano);

    const ctx = document.getElementById('grafico-barras');

    graficoBarras = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
{
    label: 'Retidos',
    data: data.datasets[0].data,
    backgroundColor: '#1c2137'
},
{
    label: 'Concluídos',
    data: data.datasets[1].data,
    backgroundColor: '#4da6ff'
},
{
    label: 'Evadidos',
    data: data.datasets[2].data,
    backgroundColor: '#6f42c1'
}
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            datasets: {
                bar: {
                    categoryPercentage: 0.6,
                    barPercentage: 0.6
                }
            },
            scales: {
                x: {
                    ticks: { color: 'black' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: 'black' }
                }
            }
        }
    });
}

document.getElementById('yearRange').addEventListener('input', async function (e) {

    const ano = parseInt(e.target.value);
    document.getElementById('selectedYearDisplay').innerText = ano;

    const data = await carregarGraficoBarras(ano);

    graficoBarras.data.labels = data.labels;
    graficoBarras.data.datasets[0].data = data.datasets[0].data;
    graficoBarras.data.datasets[1].data = data.datasets[1].data;
    graficoBarras.data.datasets[2].data = data.datasets[2].data;

    graficoBarras.update();
});

initGrafico();


window.atualizarGraficoBarras = async function() {

    const ano = parseInt(document.getElementById('yearRange').value);

    const data = await carregarGraficoBarras(ano);

    graficoBarras.data.labels = data.labels;
    graficoBarras.data.datasets[0].data = data.datasets[0].data;
    graficoBarras.data.datasets[1].data = data.datasets[1].data;
    graficoBarras.data.datasets[2].data = data.datasets[2].data;

    graficoBarras.update();
};
