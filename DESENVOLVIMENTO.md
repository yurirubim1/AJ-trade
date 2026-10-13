# Desenvolvimento

Notas para quem mexe no código do AJ Trade Value. Para usar a balança, veja o [README](README.md).

## Rodar e gerar o app

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install      # só na primeira vez
npm start        # abre o app sem empacotar
npm run exe      # gera os .exe na pasta dist/
```

O GitHub Actions (`.github/workflows/aplicativo-windows.yml`) gera os `.exe` a cada push no `main`; eles ficam no artefato da execução, na aba Actions. Uma tag começando com `v` (ex.: `v1.6.1`) também publica os `.exe` numa Release. Antes de criar a tag, atualize a versão no `package.json`.

O site ([aj-trade.vercel.app](https://aj-trade.vercel.app)) é publicado pelo Vercel a cada push no `main`.

## Atualizar os valores

O app baixa os valores sozinho. O site usa o `items.js` e as fotos que estão no repositório, e o GitHub Actions (`.github/workflows/atualizar-site.yml`) atualiza o `items.js` todo dia às 6h, horário de Brasília. Ele roda `scripts/atualizar-site.mjs`, que segue o mesmo caminho do app: reaproveita os sprites de `img/` e só sobe um commit se algum valor mudou no wiki. Itens novos mostram a foto direto do wiki.

Para remontar também os sprites de fotos, rode o script completo e suba o resultado:

```bash
npm install                       # só na primeira vez (instala o sharp, que monta as fotos)
node scripts/atualizar-valores.mjs
```

Gera um `items.js` novo e as fotos em `img/`. Na primeira vez as ~18 mil fotos são baixadas e demora uns 20 minutos. Depois elas ficam guardadas em `scripts/.cache/` e só as fotos novas são baixadas. Para atualizar só os valores, sem mexer nas fotos, use `--sem-fotos`.

O script lê as tabelas de cada página do [AJ Item Worth Wiki](https://aj-item-worth.fandom.com) pela API do Fandom e converte tudo para diamantes (veja a tabela no README).

### Fotos

Cada foto do wiki é reduzida para 64×64 e agrupada em folhas de 256 fotos (`img/s0.webp`, `img/s1.webp`…). O navegador só baixa uma folha quando precisa mostrar uma foto dela, então o site continua leve. Se uma foto faltar, aparece uma bolinha com a cor do item.

As fotos ficam dentro do próprio site (pasta `img/`), então funcionam também sem internet ao abrir o `index.html` direto.

## Automação: detalhes técnicos

- Os cliques e teclas são enviados pelo Windows (`SendInput`) através de `app/runner.ps1`, num PowerShell separado. Por isso o F9 consegue interromper na hora.
- Programas abertos como administrador só recebem os comandos se o app também estiver como administrador.
- Enquanto a aba Automação estiver aberta, a tecla de gravar fica reservada e não chega nos outros programas.
- Os tempos ficam guardados em milissegundos, mesmo quando a tela mostra segundos.
- A busca de imagem compara as cores ponto a ponto, com tolerância ajustável. Numa tela de 1920×1080 leva uns 25 ms quando acha e uns 250 ms quando não acha; com área marcada, bem menos.

## Arquivos

```
index.html                  o site e o app (HTML + CSS + JS, sem dependências)
mini.html                   janela pequena da automação
recorte.html                tela de recortar imagem da tela
items.js                    base de itens gerada (não edite à mão)
img/s*.webp                 fotos dos itens em folhas de sprites (geradas)
scripts/atualizar-valores.mjs
scripts/gerar-icone.mjs     gera build/icon.ico a partir do desenho da balança
scripts/lib/wiki.mjs        downloads pela API do Fandom
scripts/lib/extract.mjs     lê as tabelas do wikitext
scripts/lib/worth.mjs       converte "3 Good Long Wrists" etc. em diamantes
scripts/lib/ptdict.mjs      nomes em português, gírias, cores e palavras para a busca
scripts/lib/build.mjs       monta a base (categorias, códigos de pet)
scripts/lib/photos.mjs      baixa as fotos e monta os sprites
app/main.mjs                janela, menus, atalhos globais e atualização diária
app/update.mjs              refaz a base de valores dentro do aplicativo
app/macros.mjs              guarda e executa as automações
app/runner.ps1              envia cliques, textos e teclas para o Windows
app/recorder.ps1            grava os cliques e teclas da automação
```

Para adicionar gírias ou nomes em português, edite `PT_NAMES` e `ALIASES` em `scripts/lib/ptdict.mjs` (e `SLANG` no `index.html` para gírias que apontam para uma cor específica) e rode o script de novo.
