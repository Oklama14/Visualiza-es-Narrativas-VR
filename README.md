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
Em seguida, acesse `http://127.0.0.1:4173/` no seu navegador (recomendado usar Chrome ou Edge para garantir o funcionamento do WebXR e das vozes).

## 🥽 Controles da Experiência (Desktop vs VR)

- **Desktop (Mouse)**: Explore o cenário apenas apontando o mouse. A aplicação não utiliza drag/arraste, priorizando a funcionalidade de "apontar e clicar".
- **Realidade Virtual (WebXR)**: Através do seu headset VR, o ponteiro central (cursor gaze) guiará a experiência. Aponte e aguarde (fuse click) ou utilize o controle do seu headset para interagir com o ambiente e os gráficos.

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
