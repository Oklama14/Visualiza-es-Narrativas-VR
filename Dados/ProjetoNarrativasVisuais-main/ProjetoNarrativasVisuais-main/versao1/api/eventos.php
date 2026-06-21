<?php
header("Content-Type: application/json; charset=utf-8");

require_once "../config/Database.php";

function criarTabelaEventos(mysqli $db): void {
    $sql = "CREATE TABLE IF NOT EXISTS eventos_educacao (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ano INT NOT NULL,
        titulo VARCHAR(180) NOT NULL,
        descricao TEXT NOT NULL,
        tipo ENUM('positivo', 'negativo', 'neutro') NOT NULL DEFAULT 'neutro',
        impacto ENUM('alto', 'medio', 'baixo') NOT NULL DEFAULT 'medio',
        fonte VARCHAR(255) NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    if (!$db->query($sql)) {
        throw new Exception($db->error);
    }
}

function popularEventosIniciais(mysqli $db): void {
    $result = $db->query("SELECT COUNT(*) AS total FROM eventos_educacao");
    $row = $result ? $result->fetch_assoc() : ["total" => 0];

    if ((int)$row["total"] > 0) {
        return;
    }

    $eventos = [
        [2017, "Consolidacao de politicas de permanencia", "Expansao de acoes de acompanhamento estudantil, auxilios e monitoramento de trajetorias pode ter favorecido permanencia e conclusao.", "positivo", "medio", "Base contextual interna"],
        [2018, "Aprimoramento da gestao academica", "Uso mais frequente de indicadores, revisoes curriculares e acompanhamento pedagogico pode ter melhorado respostas institucionais.", "positivo", "baixo", "Base contextual interna"],
        [2019, "Ultimo ciclo regular antes da pandemia", "A estabilidade do ensino presencial antes da ruptura sanitaria pode ter contribuido para trajetorias mais previsiveis.", "positivo", "medio", "Base contextual interna"],
        [2020, "Pandemia de COVID-19", "Suspensao de atividades presenciais, ensino remoto emergencial e desigualdade de acesso digital podem ter afetado permanencia, conclusao e eficiencia.", "negativo", "alto", "Base contextual interna"],
        [2021, "Persistencia dos efeitos do ensino remoto", "Perdas de aprendizagem, dificuldades socioeconomicas e desgaste emocional podem ter mantido pressao sobre os indicadores.", "negativo", "alto", "Base contextual interna"],
        [2022, "Retorno gradual e recomposicao academica", "Retomada presencial, busca ativa e recuperacao de aprendizagem podem ter reduzido parte dos impactos acumulados.", "positivo", "medio", "Base contextual interna"],
        [2023, "Reorganizacao pos-pandemia", "Ajustes de calendario, permanencia estudantil e acompanhamento de estudantes podem ter contribuido para estabilizacao.", "positivo", "medio", "Base contextual interna"],
        [2024, "Eventos climaticos extremos no Rio Grande do Sul", "Enchentes e interrupcoes regionais podem ter afetado deslocamentos, renda familiar, calendario e continuidade dos estudos.", "negativo", "alto", "Base contextual interna"]
    ];

    $stmt = $db->prepare("INSERT INTO eventos_educacao (ano, titulo, descricao, tipo, impacto, fonte) VALUES (?, ?, ?, ?, ?, ?)");

    foreach ($eventos as $evento) {
        $stmt->bind_param("isssss", $evento[0], $evento[1], $evento[2], $evento[3], $evento[4], $evento[5]);
        $stmt->execute();
    }
}

try {
    $database = new Database();
    $db = $database->getConnection();

    criarTabelaEventos($db);
    popularEventosIniciais($db);

    $ano = isset($_GET["ano"]) ? (int)$_GET["ano"] : null;
    $tipo = $_GET["tipo"] ?? null;

    $where = ["ativo = 1"];
    $params = [];
    $types = "";

    if ($ano) {
        $where[] = "ano BETWEEN ? AND ?";
        $params[] = $ano - 1;
        $params[] = $ano + 1;
        $types .= "ii";
    }

    if ($tipo && in_array($tipo, ["positivo", "negativo", "neutro"], true)) {
        $where[] = "tipo = ?";
        $params[] = $tipo;
        $types .= "s";
    }

    $sql = "SELECT id, ano, titulo, descricao, tipo, impacto, fonte
            FROM eventos_educacao
            WHERE " . implode(" AND ", $where) . "
            ORDER BY ano, FIELD(impacto, 'alto', 'medio', 'baixo'), titulo";

    $stmt = $db->prepare($sql);

    if ($params) {
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $result = $stmt->get_result();

    $eventos = [];
    while ($row = $result->fetch_assoc()) {
        $eventos[] = $row;
    }

    echo json_encode($eventos, JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["erro" => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
