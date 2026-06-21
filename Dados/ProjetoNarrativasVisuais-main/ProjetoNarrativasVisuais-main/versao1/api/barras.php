<?php
header("Content-Type: application/json");

require_once "../config/Database.php";
require_once "../models/Indicador.php";

$data = json_decode(file_get_contents("php://input"), true);

$ano = $data['ano'] ?? null;
$dadosSelecionados = $data['dados'] ?? [];

if (!$ano || empty($dadosSelecionados)) {
    echo json_encode(["erro" => "Dados inválidos"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();

$indicador = new Indicador($db);

$resultado = $indicador->getDadosBarrasPorLocal($ano, $dadosSelecionados);

echo json_encode($resultado);
