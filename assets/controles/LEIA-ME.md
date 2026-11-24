# Modelos de controle (Meta Quest 3 Touch Plus)

`quest-touch-plus-left.glb` e `quest-touch-plus-right.glb` são os modelos oficiais de controle **Meta Quest Touch Plus** distribuídos pelo A-Frame (`cdn.aframe.io/controllers/meta/`), derivados do repositório `@webxr-input-profiles/assets` (Immersive Web).

São carregados localmente pelo componente `controles-locais` em `headset.js` no lugar do download pela CDN, garantindo que os controles do Meta Quest 3 apareçam completos mesmo em redes locais sem acesso à internet.
