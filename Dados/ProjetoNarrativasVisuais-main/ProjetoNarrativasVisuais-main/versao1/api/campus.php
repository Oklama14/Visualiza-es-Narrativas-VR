<?php
header("Content-Type: application/json");

require_once "../config/Database.php";
require_once "../models/Indicador.php";

$database = new Database();
$db = $database->getConnection();

$indicador = new Indicador($db);

$tipo = $_GET['tipo'] ?? null;

$permitidos = ['nome_unidade', 'estado', 'regiao', 'instituicao'];

if (!$tipo || !in_array($tipo, $permitidos)) {
    echo json_encode(["erro" => "Tipo inválido"]);
    exit;
}

$dados = $indicador->listarDistintos($tipo);

echo json_encode($dados);
