const rankingPosicoesPlugin = {
    id: "rankingPosicoes",
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const yScale = scales.y;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "800 12px Montserrat, sans-serif";

        chart.data.labels.forEach((_, index) => {
            const y = yScale.getPixelForValue(index);
            const x = Math.max(28, chartArea.left - yScale.width - 34);

            ctx.fillStyle = index === 0 ? "#0a74df" : "#e2e8f0";
            ctx.beginPath();
            ctx.roundRect(x - 14, y - 13, 28, 26, 8);
            ctx.fill();

            ctx.fillStyle = index === 0 ? "#ffffff" : "#334155";
            ctx.fillText(String(index + 1), x, y);
        });

        ctx.restore();
    }
};

async function carregarRanking() {
    const tipo = document.getElementById("metrica1").value;
    const ano = document.getElementById("metrica2").value;
    const dadosSelecionados = JSON.parse(localStorage.getItem("posterDados")) || [];

    try {
        const response = await fetch("api/ranking.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tipo,
                ano,
                dados: dadosSelecionados
            })
        });

        const data = await response.json();

        if (!response.ok || data.erro || !Array.isArray(data)) {
            console.warn(data.erro || "Nao foi possivel carregar o ranking");
            return;
        }

        if (!data.length) {
            console.warn("Sem dados");
            return;
        }

        const labels = data.map(item => item.label);
        const valores = data.map(item => Number(item.valor));
        const cores = valores.map((_, index) => {
            if (index === 0) return "#0a74df";
            if (index === 1) return "#2563eb";
            if (index === 2) return "#4f46e5";
            if (index === 3) return "#6f42c1";
            if (index === 4) return "#1c2137";
            if (index === 5) return "#334155";
            if (index === 6) return "#64748b";

            return "#94a3b8";
        });

        const canvas = document.getElementById("ranking");
        const ctx = canvas.getContext("2d");

        if (window.graficoRanking) {
            window.graficoRanking.destroy();
        }

        window.graficoRanking = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Eficiência acadêmica",
                    data: valores,
                    backgroundColor: cores,
                    borderColor: "rgba(255,255,255,0.9)",
                    borderWidth: 2,
                    borderRadius: 12,
                    barThickness: 30,
                    maxBarThickness: 36
                }]
            },
            plugins: [rankingPosicoesPlugin],
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 18,
                        right: 14,
                        bottom: 18,
                        left: 84
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#111827",
                        titleColor: "#ffffff",
                        bodyColor: "#e5e7eb",
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: contexto => ` Eficiência: ${Number(contexto.raw).toFixed(2)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: {
                            color: "rgba(148, 163, 184, 0.22)"
                        },
                        ticks: {
                            color: "#64748b",
                            callback: valor => `${valor}%`
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: "#0f172a",
                            padding: 12,
                            font: {
                                size: 12,
                                weight: "700"
                            }
                        }
                    }
                }
            }
        });
    } catch (erro) {
        console.error("Erro ao carregar ranking:", erro);
    }
}

document.getElementById("metrica1").addEventListener("change", carregarRanking);
document.getElementById("metrica2").addEventListener("change", carregarRanking);

carregarRanking();
