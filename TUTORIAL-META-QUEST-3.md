# Tutorial de Uso no Meta Quest 3 — Laboratório VR de Dados

Este guia explica passo a passo como preparar, abrir e navegar no **Laboratório VR de Dados (Eficiência Acadêmica da Rede Federal)** usando o **Meta Quest 3**.

---

## 1. Pré-requisitos

- **PC (Windows)** com [Node.js](https://nodejs.org/) (v18 ou superior) instalado e a pasta do projeto (`vr-gpt`).
- **Meta Quest 3** carregado e com o **Meta Quest Browser** (navegador padrão do óculos).
- **Mesma rede Wi-Fi** no PC e no Meta Quest 3.
  - *Atenção em redes universitárias ou corporativas:* muitas redes institucionais ativam isolamento de dispositivos (*client isolation*), impedindo o Quest de enxergar o PC. Se isso acontecer, use um **roteador local / hotspot do celular** (mesmo sem dados móveis) ou o **método via cabo USB** descrito na Seção 4.
- **Espaço de uso:** esta versão funciona muito bem **sentado** ou **em pé** no modo de limite **Estacionário** (*Stationary Boundary*) do Quest 3, pois toda a navegação ocorre por apontamento/clique, sem precisar caminhar pela sala.

---

## 2. Subindo o ambiente no PC

1. Abra o **PowerShell** (ou Terminal) dentro da pasta do projeto (`c:\Users\Dell\Desktop\vr-gpt`).
2. *(Opcional, apenas se o CSV de dados tiver sido alterado)* Atualize o `dados.json`:
   ```powershell
   node .\build-dados.js
   ```
3. Inicie o servidor local no **modo HTTPS para Quest**:
   ```powershell
   node .\server.js --quest
   ```
   > **Por que usar `--quest`?** O WebXR só é liberado pelo navegador do Quest em **HTTPS** (ou `localhost`). Se você abrir por `http://192.168.x.x`, o botão VR abrirá apenas uma tela 2D expandida e a página exibirá um aviso laranja.

4. Na primeira execução, se o **Firewall do Windows** perguntar, marque **Redes privadas** e clique em **Permitir acesso** para o Node.js.
5. Anote o endereço `https://...` exibido no terminal ao lado da sua placa Wi-Fi principal (ignore endereços marcados como `(placa virtual)`, como WSL, VirtualBox, VMware ou Hyper-V). Exemplo:
   ```text
   https://192.168.0.15:4443/
   ```

---

## 3. Abrindo no Meta Quest 3

1. Coloque o **Meta Quest 3**, abra o **Meta Quest Browser** e digite na barra de endereços o link mostrado no PC:
   ```text
   https://192.168.0.15:4443/
   ```
2. **Perfil padrão já otimizado para o Meta Quest 3:** o ambiente inicia automaticamente em **90 Hz** e **foveação 0** (aproveitando a nitidez de borda a borda das lentes *pancake*).
   *(Parâmetros opcionais na URL para testes ou uso em Quest 2: `?fps=1` para exibir o contador de FPS e draw calls dentro do VR; `?hz=72&fov=0.5` para perfil mais leve; `?aa=0` para desativar antialiasing.)*
3. **Na primeira visita**, o navegador exibirá o aviso *"Sua conexão não é particular"* (*Your connection is not private*), porque o certificado HTTPS é autoassinado localmente pelo `server.js`:
   - Clique em **Avançado** (*Advanced*).
   - Clique em **Continuar para `<IP>` (não seguro)** (*Proceed to `<IP>`*).
4. Aguarde o carregamento da cena (o aviso inicial de carregamento desaparecerá).
5. Aponte e clique no botão **VR** (ícone de óculos no **canto inferior direito** da janela do navegador) para entrar no modo imersivo.
6. **Ajuste de enquadramento:** se a sala ou o mapa parecerem tortos ou deslocados, olhe reto para a frente e **segure o botão Meta** (no controle direito) por ~2 segundos para **recentralizar** a visão.

---

## 4. Alternativa sem Wi-Fi ou sem aviso de certificado (Cabo USB)

Se o Wi-Fi bloquear a conexão entre PC e óculos, você pode usar um **cabo USB-C** (requer *Modo Desenvolvedor* ativado no Quest 3 e `adb` instalado no PC):

1. No PC, inicie o servidor simples:
   ```powershell
   node .\server.js
   ```
2. Conecte o Meta Quest 3 ao PC via USB-C, aceite a depuração USB dentro do óculos e execute no PC:
   ```powershell
   adb reverse tcp:4173 tcp:4173
   ```
3. No **Meta Quest Browser**, abra:
   ```text
   http://localhost:4173/
   ```
   *(Como `localhost` é considerado contexto seguro, o WebXR funciona sem HTTPS e sem aviso de certificado.)*

---

## 5. Como interagir dentro do VR

O ambiente detecta automaticamente o que o Meta Quest 3 está rastreando no momento e alterna entre três modos de interação:

| Modo ativo | Como ativar | Como mirar | Como selecionar |
| --- | --- | --- | --- |
| **Controles Touch Plus** *(recomendado)* | Segure os controles do Quest 3 | Aponte o **raio laser azul** para o cartão, região ou botão | Aperte o **Gatilho** (*Trigger*, dedo indicador) |
| **Mãos (Hand Tracking)** | Deixe os controles pousados fora de vista e levante as mãos | Olhe para o alvo com o **anel central** (ele aumenta e fica **âmbar** sobre itens clicáveis) | Faça **pinça** (junte polegar + indicador) com a **palma virada para fora** |
| **Somente Olhar (Gaze)** | Sem controles e sem mãos detectadas | Mantenha o **anel central** parado sobre o alvo | Segure o olhar por **~0,85 s** (o anel cresce até confirmar) |

### Atalhos nos controles Touch Plus (Meta Quest 3)

| Botão / Ação | O que faz |
| --- | --- |
| **Gatilho (Trigger)** | Seleciona o alvo apontado pelo laser azul *(apertar o gatilho na outra mão transfere o laser único para ela)* |
| **Botão B** *(direito)* ou **Y** *(esquerdo)* | **Voltar** para a tela anterior (mesma função do botão *Voltar* / *< Regiões*) |
| **Analógico Esquerda / Direita** | Troca de **ano** (Linha do Tempo / Composição), muda de **cena** (Tour) ou alterna o **indicador** (*Comparar Regiões*) |
| **Botão X** *(esquerdo)* | Abre ou fecha o cartão **"Como ler"** no canto superior esquerdo da sala |
| **Botão A** *(direito)* | **Ação rápida:** pula a introdução guiada (se ativa), liga/para a **Narração** na Linha do Tempo ou abre **"Como ler"** |
| **Clique no Analógico** | Alterna manualmente a altura entre **Em pé** e **Sentado** *(além do ajuste automático ao entrar sentado em VR)* |

### Dicas importantes de uso no Meta Quest 3

- **Laser único e háptica:** ambos os controles aparecem nas suas mãos, mas apenas a mão ativa emite o raio laser (evitando *hovers* acidentais da mão em repouso). Para trocar de mão, basta apertar o gatilho do outro controle. O controle vibra suavemente ao passar sobre alvos e ao confirmar cliques.
- **Uso sentado ou em pé:** ao entrar em VR, o ambiente detecta automaticamente se você está sentado (altura dos olhos abaixo de 1,42 m) e eleva o palco para a linha dos olhos. Você também pode alternar a qualquer momento no botão **Altura: Em pé / Sentado** (canto superior esquerdo) ou clicando no analógico.
- **Painel "Como ler" e Trilha em VR:** ficam ancorados no canto superior esquerdo da sala (não presos ao rosto). O cartão **"Como ler"** inicia recolhido para manter os controles livres — clique em **Como ler +** ou aperte **X** quando quiser ler a explicação da etapa.
- **Com as mãos (Hand Tracking):**
  - Olhar parado **não clica sozinho** quando suas mãos estão sendo rastreadas — a confirmação depende da pinça.
  - Faça a pinça com a **palma voltada para fora/frente** (e não voltada para o seu rosto), para evitar acionar o menu do sistema Meta Horizon OS sem querer.
- **Para sair do modo VR:** aperte rapidamente o **botão Meta** (controle direito) ou faça o gesto de menu na mão direita e selecione sair da experiência imersiva no navegador.

---

## 6. Guia rápido do que explorar no ambiente

1. **Tela inicial — Mapa do Brasil:**
   - **Aponte sobre uma região** (Norte, Nordeste, Centro-Oeste, Sudeste ou Sul) para abrir o cartão lateral com Eficiência e Evasão de 2024.
   - **Selecione a região** para abrir o *drill-down* com todas as instituições federais daquela região (ou a opção **Região inteira**).
   - **À esquerda do mapa:** botão **Brasil** (vai direto aos 4 indicadores nacionais) e botão **Comparar Regiões** (grade 3×2 na mesma escala 0–100%).
   - **Na base da sala:** **3 Tours Guiados** (*Panorama Nacional*, *O Abismo Regional* e *A Jornada do Aluno*), narrados por cenas em sequência com botões `< Anterior` e `Próximo >`.
2. **Indicadores (4 Medidores Radiais):**
   - Aponte sobre cada medidor (*Taxa de Evasão*, *Taxa de Conclusão*, *Eficiência Acadêmica*, *Taxa de Retenção*) para abrir o painel explicativo.
   - Selecione um medidor para abrir sua **Linha do Tempo (2017–2024)**.
   - Clique em **Para onde vão os alunos >** (na base central) para ver a **Composição** por ano (concluídos, retidos e evadidos).
3. **Linha do Tempo (Gráfico Anotado):**
   - Ao entrar, inicia-se a **abertura guiada** ano a ano (você pode interromper a qualquer momento no botão **Pular introdução**).
   - No modo livre, use `<` e `>` (ou clique direto nas barras dos anos), ative **Comparar** (quando estiver em uma região/instituição, para comparar com a média do Brasil), **Narrar** (áudio + legendas 3D), **Reproduzir** ou volte para **Indicadores**.
4. **Atalhos sempre disponíveis na sala de exploração:**
   - **Trocar região** (canto superior direito, abaixo do *Voltar*): abre o mini-mapa para trocar rapidamente de região sem voltar ao início.
   - **Voltar** (canto superior direito): retorna à etapa anterior.

---

## 7. Solução de problemas comuns

| Problema | Causa provável | Como resolver |
| --- | --- | --- |
| **Aviso laranja: "O modo VR está bloqueado nesta página"** | Página aberta em `http://` pelo IP da rede | Rode `node server.js --quest` e acesse com **`https://`** na porta **`:4443`**. |
| **Página não abre no Quest (tempo esgotado)** | Firewall bloqueando Node, Wi-Fi diferente ou isolamento de rede (*AP isolation*) | Libere o Node.js no Firewall do Windows (rede privada), confirme que PC e Quest estão no mesmo Wi-Fi, ou use hotspot do celular / cabo USB (`adb reverse`). |
| **Narração sem voz em português** | O navegador do Quest pode não ter voz TTS `pt-BR` instalada | Comportamento esperado: as **legendas 3D aparecem automaticamente** na parte inferior do campo de visão e a abertura guiada avança no tempo de leitura. |
| **Queda de FPS ou sensação de engasgo** | Perfil padrão do Quest 3 (90 Hz, foveação 0) em cena mais pesada ou rodando num Quest 2 | Teste abrir com **`?hz=72&fov=0.25`** (ou `?fov=0.5` no Quest 2) e acompanhe com `?fps=1`. |
| **Controles não aparecem ou travam** | Bateria baixa ou rastreamento de mãos ativo | Pressione qualquer botão do controle Touch Plus para acordá-lo. Os modelos 3D dos controles Touch Plus e das mãos ficam salvos localmente no projeto (`assets/`), funcionando **100% offline**. |
| **O menu do Quest abre ao tentar clicar com as mãos** | Pinça feita com a palma virada para o rosto | Gire levemente a mão deixando a **palma para fora/frente** ao fazer a pinça. |
| **Alterações no código não aparecem no óculos** | Cache do navegador do Quest | Use sempre `node server.js --quest` (que desativa cache) e recarregue a página antes de entrar em VR. |
