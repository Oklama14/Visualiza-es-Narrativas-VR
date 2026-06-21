<?php

class Indicador {

    private $conn;
    private $table = "eficiencia_academica";

    public function __construct($db) {
        $this->conn = $db;
    }


    public function listarDistintos($coluna) {

    $sql = "SELECT DISTINCT $coluna FROM " . $this->table;

    $result = $this->conn->query($sql);

    $dados = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $dados[] = $row[$coluna];
        }
    }

    return $dados;
    }

    private function primeiraColunaExistente(array $colunas): ?string {

    $permitidas = array_flip($colunas);
    $sql = "SHOW COLUMNS FROM {$this->table}";
    $result = $this->conn->query($sql);

    if (!$result) return null;

    while ($row = $result->fetch_assoc()) {
        $nome = $row["Field"] ?? null;

        if ($nome && isset($permitidas[$nome])) {
            return $nome;
        }
    }

    return null;
    }


    public function getDadosGraficoLinha($tipo, $selecionados) {

    $coluna = $this->mapearColuna($tipo);

    if (!$coluna) {
        return [
            "labels" => [],
            "datasets" => []
        ];
    }

    $datasets = [];
    $anos = [];

    foreach ($selecionados as $item) {

        $label = $item['valor'];
        $tipoFiltro = $item['tipo'];

        switch ($tipoFiltro) {
            case "campus":
                $where = "nome_unidade = ?";
                break;
            case "estado":
                $where = "estado = ?";
                break;
            case "regiao":
                $where = "regiao = ?";
                break;
            case "instituicao":
                $where = "instituicao = ?";
                break;
            case "brasil":
                $where = "1=1";
                break;
            default:
                continue 2;
        }

        if ($tipoFiltro === "brasil") {

            $sql = "SELECT ano, AVG($coluna) as valor
                    FROM {$this->table}
                    GROUP BY ano
                    ORDER BY ano";

            $result = $this->conn->query($sql);

        } else {

            $sql = "SELECT ano, AVG($coluna) as valor
                    FROM {$this->table}
                    WHERE $where
                    GROUP BY ano
                    ORDER BY ano";

            $stmt = $this->conn->prepare($sql);
            $stmt->bind_param("s", $label);
            $stmt->execute();
            $result = $stmt->get_result();
        }

        $dados = [];

        while ($row = $result->fetch_assoc()) {

            $dados[] = (float)($row['valor'] ?? 0);

            if (count($datasets) === 0) {
                $anos[] = $row['ano'];
            }
        }

        $datasets[] = [
            "label" => $label,
            "data" => $dados
        ];
    }

    return [
        "labels" => $anos,
        "datasets" => $datasets
    ];
}

    private function mapearColuna($tipo) {

        switch($tipo) {
            case "evasao": 
                return $this->primeiraColunaExistente(["taxa_evasao", "taxa_avasao"]);

            case "conclusao": 
                return "concluidos_porcentagem";

            case "eficiencia": 
                return "eficiencia_academica";

            case "retencao": 
                return "retidos_porcentagem";

            default: 
                return null;
        }
    }


    public function getDadosBarrasPorLocal($ano, $dadosSelecionados) {

    $labels = [];
    $retidos = [];
    $concluidos = [];
    $evadidos = [];

    foreach ($dadosSelecionados as $item) {

        $tipo = $item['tipo'] ?? null;
        $valor = $item['valor'] ?? null;

        if (!$tipo) continue;

        switch ($tipo) {
            case "campus":
                $where = "nome_unidade = ?";
                break;
            case "estado":
                $where = "estado = ?";
                break;
            case "regiao":
                $where = "regiao = ?";
                break;
            case "instituicao":
                $where = "instituicao = ?";
                break;
            case "brasil":
                $where = "1=1";
                break;
            default:
                continue 2;
        }

        if ($tipo === "brasil") {

            $sql = "SELECT 
                        SUM(retidos_num) as retidos,
                        SUM(concluidos_num) as concluidos,
                        SUM(evadidos_num) as evadidos
                    FROM {$this->table}
                    WHERE ano = ?";

            $stmt = $this->conn->prepare($sql);
            if (!$stmt) continue;

            $stmt->bind_param("i", $ano);

        } else {

            if (!$valor) continue;

            $sql = "SELECT 
                        SUM(retidos_num) as retidos,
                        SUM(concluidos_num) as concluidos,
                        SUM(evadidos_num) as evadidos
                    FROM {$this->table}
                    WHERE $where AND ano = ?";

            $stmt = $this->conn->prepare($sql);
            if (!$stmt) continue;

            $stmt->bind_param("si", $valor, $ano);
        }

        $stmt->execute();
        $result = $stmt->get_result();

        if (!$result) continue;

        $row = $result->fetch_assoc();

        $labels[] = $valor ?? "Brasil";
        $retidos[] = (int)($row['retidos'] ?? 0);
        $concluidos[] = (int)($row['concluidos'] ?? 0);
        $evadidos[] = (int)($row['evadidos'] ?? 0);
    }

    return [
        "labels" => $labels,
        "datasets" => [
            [
                "label" => "Retidos",
                "data" => $retidos
            ],
            [
                "label" => "Concluídos",
                "data" => $concluidos
            ],
            [
                "label" => "Evadidos",
                "data" => $evadidos
            ]
        ]
    ];
}

public function getRanking($tipo, $ano, $dadosSelecionados) {

    $coluna = $this->mapearColuna("eficiencia");

    if (!$coluna) return [];

    switch ($tipo) {
        case "campus": $group = "nome_unidade"; break;
        case "estado": $group = "estado"; break;
        case "regiao": $group = "regiao"; break;
        case "instituicao": $group = "instituicao"; break;
        default: return [];
    }

    $sql = "SELECT $group as nome, AVG($coluna) as valor
            FROM {$this->table}
            WHERE ano = ?
            GROUP BY $group
            ORDER BY valor DESC
            LIMIT 4";

    $stmt = $this->conn->prepare($sql);
    $stmt->bind_param("i", $ano);
    $stmt->execute();

    $result = $stmt->get_result();

    $ranking = [];

    while ($row = $result->fetch_assoc()) {
        $ranking[] = [
            "label" => $row['nome'],
            "valor" => round($row['valor'], 2)
        ];
    }

    foreach ($dadosSelecionados as $item) {

        $tipoSel = $item['tipo'];
        $valorSel = $item['valor'];

        switch ($tipoSel) {
            case "campus": $where = "nome_unidade = ?"; break;
            case "estado": $where = "estado = ?"; break;
            case "regiao": $where = "regiao = ?"; break;
            case "instituicao": $where = "instituicao = ?"; break;
            case "brasil": $where = "1=1"; break;
            default: continue 2;
        }

        if ($tipoSel === "brasil") {

            $sqlSel = "SELECT AVG($coluna) as valor
                       FROM {$this->table}
                       WHERE ano = ?";

            $stmtSel = $this->conn->prepare($sqlSel);
            $stmtSel->bind_param("i", $ano);

        } else {

            $sqlSel = "SELECT AVG($coluna) as valor
                       FROM {$this->table}
                       WHERE $where AND ano = ?";

            $stmtSel = $this->conn->prepare($sqlSel);
            $stmtSel->bind_param("si", $valorSel, $ano);
        }

        $stmtSel->execute();
        $resSel = $stmtSel->get_result();
        $rowSel = $resSel->fetch_assoc();

        $ranking[] = [
            "label" => $valorSel,
            "valor" => round($rowSel['valor'] ?? 0, 2)
        ];
    }

    $unique = [];
    foreach ($ranking as $item) {
        $unique[$item['label']] = $item;
    }

    $ranking = array_values($unique);

    usort($ranking, function($a, $b) {
        return $b['valor'] <=> $a['valor'];
    });

    return array_slice($ranking, 0, 7);
}
}
