# Laboratório VR de Dados - Eficiência Acadêmica da Rede Federal

Uma experiência educacional imersiva em realidade virtual (WebXR) que transforma os indicadores de eficiência acadêmica da Rede Federal (Plataforma Nilo Peçanha) em uma narrativa interativa. O projeto visa melhorar a compreensão sobre a evasão, conclusão, eficiência e retenção de alunos nas instituições brasileiras através de visualizações de dados imersivas em 3D.

## 🚀 Tecnologias e Stack

- **HTML5, CSS3 e JavaScript (Vanilla)**: Sem o uso de frameworks de frontend como React ou Vue.
- **A-Frame (1.5.0)**: Principal (e única) biblioteca externa, responsável por renderizar a cena e os elementos em 3D para a web e prover suporte ao WebXR.
- **Web Speech API**: Utilizada nativamente pelo navegador para narração em áudio da experiência, sem depender de bibliotecas de terceiros.
- **Node.js**: Utilizado apenas para execução do pipeline de dados (`build-dados.js`) e rotinas de testes automatizados.

## 📊 Fonte de Dados

- A base de dados oficial é derivada da Plataforma Nilo Peçanha / SETEC-MEC (`Dados/EficienciaAcademica.csv`), contendo dados a nível de campus, abrangendo o período de 2017 a 2024.
- Os dados processados pela aplicação ficam no arquivo estático `dados.json`, o qual é consumido ativamente via `fetch` pela experiência.

## 🛠️ Como Executar Localmente

### 1. Processamento dos Dados
Primeiro, garanta que o arquivo `dados.json` esteja atualizado com base no arquivo CSV fornecido, rodando o script de build:
```powershell
node .\build-dados.js
```

### 2. Subindo o Servidor Local
Para carregar corretamente o ambiente A-Frame e conseguir realizar o `fetch` dos dados (e principalmente para ativar o WebXR), suba um servidor HTTP simples. Se possuir Python instalado, você pode executar:
```powershell
python -m http.server 4173 --bind 127.0.0.1
```
Em seguida, acesse `http://127.0.0.1:4173/` no seu navegador (recomendado usar Chrome ou Edge para garantir o funcionamento do WebXR e das vozes). Também funciona com `node server.js` (sem Python).

### 3. No Meta Quest 2 (navegador do headset)
O WebXR só funciona em **HTTPS** (ou localhost). Pelo IP da rede em `http://`, o botão VR vira uma tela cheia 2D, sem erro (a página mostra um aviso laranja). Por isso:
```powershell
node server.js --quest
```
O servidor gera um certificado autoassinado em `.certs/` (que nunca é servido) e mostra o endereço `https://SEU-IP:4443/` para abrir no Quest. Na primeira visita, toque em **Avançado → Continuar**. PC e Quest precisam estar no mesmo Wi-Fi; se o Windows perguntar, libere o Node no firewall para redes privadas.

Para comparar no headset sem editar código: `?fps=1` (medidor de quadros dentro do VR), `?hz=90` (padrão 72 Hz), `?aa=0` (antialias), `?fov=0..1` (foveação; padrão 0,5).

> Esta versão precisa de **internet** para as fontes do A-Frame (cdn.aframe.io): sem ela, o texto 3D não aparece. O A-Frame em si e o modelo das mãos já estão no projeto (`assets/`).

## 🥽 Controles da Experiência (Desktop vs VR)

- **Desktop (Mouse)**: Explore o cenário apenas apontando o mouse. A aplicação não utiliza drag/arraste, priorizando a funcionalidade de "apontar e clicar".
- **Realidade Virtual (WebXR)** — o modo de seleção acompanha o que o headset está rastreando:
  - **Controles Touch**: aponte o laser e aperte o gatilho.
  - **Mãos (hand tracking)**: mire com o olhar (retículo central) e **belisque** (polegar + indicador, palma virada para fora). Olhar parado não seleciona sozinho.
  - **Sem mãos nem controles**: mire com o olhar e segure (fuse de 850 ms).

## 🧪 Testes

O projeto acompanha testes automatizados cobrindo a integridade dos dados e o fluxo de uso da aplicação web:

Validar a sintaxe:
```powershell
node --check .\app.js
node --check .\build-dados.js
node --check .\tests\smoke-test.js
```

Para rodar os testes de integridade dos dados e lógicas (Node puro):
```powershell
node .\tests\logic-check.js
```

Para rodar o teste E2E / Smoke Test que percorre todo o fluxo de navegação usando o Chrome DevTools Protocol no modo headless:
```powershell
node .\tests\smoke-test.js
```

Para simular o Meta Quest 2 (WebXR emulado pelo IWER, da Meta, com mãos, controles e a internet bloqueada):
```powershell
npm i -D playwright iwer
node .\tests\quest-sim.js            # --angulos imprime onde cada alvo fica no campo de visão
```
