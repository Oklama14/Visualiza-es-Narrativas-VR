<?php
header("Content-Type: application/json");

require_once "../config/Database.php";
require_once "../models/Indicador.php";

$database = new Database();
$db = $database->getConnection();

$indicador = new Indicador($db);

$input = json_decode(file_get_contents("php://input"), true);

$tipo = $input['tipo'] ?? null;
$selecionados = $input['dados'] ?? [];

if (!$tipo || empty($selecionados)) {
    echo json_encode(["erro" => "Dados inválidos"]);
    exit;
}

try {

    $resultado = $indicador->getDadosGraficoLinha($tipo, $selecionados);

    echo json_encode($resultado);

} catch (Exception $e) {
    echo json_encode(["erro" => $e->getMessage()]);
}
