<?php
header("Content-Type: application/json");

require_once "../config/Database.php";
require_once "../models/Indicador.php";

$database = new Database();
$db = $database->getConnection();

$indicador = new Indicador($db);

$input = json_decode(file_get_contents("php://input"), true);

$tipo = $input['tipo'] ?? null;
$ano = $input['ano'] ?? null;
$dados = $input['dados'] ?? [];

if (!$tipo || !$ano) {
    echo json_encode(["erro" => "Dados inválidos"]);
    exit;
}

try {

    $resultado = $indicador->getRanking($tipo, $ano, $dados);

    echo json_encode($resultado);

} catch (Exception $e) {
    echo json_encode(["erro" => $e->getMessage()]);
}
