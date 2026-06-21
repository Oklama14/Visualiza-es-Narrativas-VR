document.addEventListener("DOMContentLoaded", () => {

    const dados = {
        regiao: [],
        estado: [],
        instituicao: [],
        campus: []
    };

    const mapaAPI = {
        campus: "nome_unidade",
        estado: "estado",
        regiao: "regiao",
        instituicao: "instituicao"
    };

    const carregado = {};

    function carregarDados(tipo) {

        if (carregado[tipo]) return;

        const coluna = mapaAPI[tipo];

        fetch(`api/campus.php?tipo=${coluna}`)
            .then(res => res.json())
            .then(data => {
                console.log(`Dados de ${tipo}:`, data);

                dados[tipo] = data;
                carregado[tipo] = true;
            });
    }

    document.querySelectorAll('.box-menu-lateral').forEach(box => {

        const select = box.querySelector('.nivel');
        const input = box.querySelector('.search');
        const sugestoes = box.querySelector('.sugestoes');
        const clearBtn = box.querySelector('.clear-btn');

        select.addEventListener('change', () => {

            input.value = '';
            sugestoes.innerHTML = '';
            sugestoes.style.display = 'none';
            clearBtn.classList.remove('show');

            if (select.value === '') {
                input.disabled = true;
                input.placeholder = "Escolha um nível...";
                return;
            }

            if (select.value === 'brasil') {
                input.disabled = true;
                input.value = 'Brasil';
                return;
            }

            carregarDados(select.value);

            input.disabled = false;
            input.placeholder = "Buscar " + select.value;
        });

        input.addEventListener('input', () => {

            const valor = input.value.toLowerCase();

            clearBtn.classList.toggle('show', valor.length > 0);
            sugestoes.innerHTML = '';

            const lista = dados[select.value];

            if (!lista || lista.length === 0) return;

            const filtrados = lista.filter(item =>
                item.toLowerCase().includes(valor)
            );

            filtrados.forEach(item => {
                const div = document.createElement('div');
                div.textContent = item;

                div.onclick = () => {
                    input.value = item;
                    sugestoes.style.display = 'none';
                };

                sugestoes.appendChild(div);
            });

            sugestoes.style.display = filtrados.length ? 'block' : 'none';
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.classList.remove('show');
            sugestoes.innerHTML = '';
            sugestoes.style.display = 'none';
            input.focus();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input.value = '';
                clearBtn.classList.remove('show');
                sugestoes.innerHTML = '';
                sugestoes.style.display = 'none';
            }
        });
    });

});


function gerarPoster() {
    const resultados = [];

    document.querySelectorAll('.box-menu-lateral').forEach(box => {
        const select = box.querySelector('.nivel').value;
        const input = box.querySelector('.search').value;

        if (select === 'brasil') {
            resultados.push({ tipo: 'brasil', valor: 'Brasil' });
        } else if (input) {
            resultados.push({ tipo: select, valor: input });
        }
    });

    if (resultados.length === 0) {
        alert("Selecione algo antes.");
        return;
    }

    localStorage.setItem("posterDados", JSON.stringify(resultados));

    if (window.atualizarGraficoLinha) {
        window.atualizarGraficoLinha();
    }

    if (window.atualizarGraficoBarras) {
        window.atualizarGraficoBarras();
    }
}
