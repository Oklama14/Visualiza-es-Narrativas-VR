# Modelos de mao (hand tracking)

`left.glb` e `right.glb` sao o perfil **generic-hand** do pacote
`@webxr-input-profiles/assets` 1.0.19 (WebXR Input Profiles, Immersive Web).
Os ossos tem os nomes das juntas do WebXR (`wrist`, `thumb-tip`...), que e o
que o `hand-tracking-controls` do A-Frame 1.5 anima. Sao carregados pelo
componente `maos-locais` (`headset.js` na versao principal, `js-ambiente/05-headset.js`
na minimalista) no lugar do modelo que o
A-Frame buscaria em cdn.aframe.io, para as maos aparecerem mesmo sem internet.

Licenca original (MIT):

```
MIT License

Copyright (c) 2019 Amazon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice (including the next
paragraph) shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF
OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
