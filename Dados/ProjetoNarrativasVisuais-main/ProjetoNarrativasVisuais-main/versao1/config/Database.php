<?php
class Database {
    private $host = "localhost";
    private $db_name = "testeapi";
    private $username = "root";
    private $password = "";
    public $conn;

    public function getConnection(): ?mysqli {
        $this->conn = null;

        $this->conn = new mysqli(
            $this->host,
            $this->username,
            $this->password,
            $this->db_name
        );

        if ($this->conn->connect_error) {
            throw new Exception("Erro de conexão: " . $this->conn->connect_error);
        }

        $this->conn->set_charset("utf8");

        return $this->conn;
    }
}
