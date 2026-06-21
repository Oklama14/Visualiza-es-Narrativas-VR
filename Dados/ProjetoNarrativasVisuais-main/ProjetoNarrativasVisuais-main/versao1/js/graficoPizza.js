
const configPizzaBase = {
    type: 'doughnut',
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        }
    }
};

async function getDadosPizzaAPI(ano) {

    let dadosSelecionados = JSON.parse(localStorage.getItem("posterDados"));

    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        dadosSelecionados = [{ tipo: "brasil", valor: "Brasil" }];
    }

    const response = await fetch("api/pizza.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ano: ano,
            dados: dadosSelecionados
        })
    });

    return await response.json();
}

function montarPizza(dados) {

    return {
        labels: ['Retidos', 'Concluídos', 'Evadidos'],
        datasets: [{
            label: dados.label,
            data: [
                dados.retidos,
                dados.concluidos,
                dados.evadidos
            ],
            backgroundColor: [
                'rgb(255, 99, 132)',
                'rgb(54, 162, 235)',
                'rgb(255, 205, 86)'
            ],
            borderWidth: 0
        }]
    };
}

let pizza1, pizza2, pizza3;

async function initPizzas(ano = 2024) {

    const dados = await getDadosPizzaAPI(ano);
    if (dados[0]) document.getElementById('tituloPizza1').innerText = dados[0].label;
if (dados[1]) document.getElementById('tituloPizza2').innerText = dados[1].label;
if (dados[2]) document.getElementById('tituloPizza3').innerText = dados[2].label;

    pizza1 = new Chart(
        document.getElementById('grafico-pizza1'),
        { ...configPizzaBase, data: montarPizza(dados[0]) }
    );

    pizza2 = new Chart(
        document.getElementById('grafico-pizza2'),
        { ...configPizzaBase, data: montarPizza(dados[1] || dados[0]) }
    );

    pizza3 = new Chart(
        document.getElementById('grafico-pizza3'),
        { ...configPizzaBase, data: montarPizza(dados[2] || dados[0]) }
    );
}

document.getElementById('yearRange').addEventListener('input', async function (e) {

    const year = parseInt(e.target.value);

    document.getElementById('selectedYearDisplay').innerText = year;

    const dados = await getDadosPizzaAPI(year);

    pizza1.data = montarPizza(dados[0]);
    pizza2.data = montarPizza(dados[1] || dados[0]);
    pizza3.data = montarPizza(dados[2] || dados[0]);

    pizza1.update();
    pizza2.update();
    pizza3.update();
});

initPizzas();
