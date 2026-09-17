# AJ Trade Value pra Ste <3

Calculadora de trocas do **Animal Jam Classic**. Você coloca até 4 itens de cada lado, igual à janela de troca do jogo, e a balança diz se **vale muito**, **vale**, é **justo**, **não vale** ou **não aceite**.

## Aplicativo para Windows

Tem uma versão em aplicativo, que abre em janela própria e **atualiza os valores sozinho uma vez por dia**.

- **Pronto para usar:** baixe o `.exe` em [Releases](https://github.com/yurirubim1/AJ-trade/releases) ou na aba Actions, no artefato da última execução. O instalador cria o atalho; o arquivo sem "instalador" no nome abre direto, sem instalar.
- **Gerar aqui no seu PC:** `npm install` e depois `npm run exe`. Os arquivos saem na pasta `dist/`.
- **Testar sem empacotar:** `npm start`.

Na primeira vez o Windows pode mostrar o aviso "Windows protegeu o computador", porque o programa não é assinado digitalmente. Clique em **Mais informações → Executar assim mesmo**.

Dentro do aplicativo, a barra no topo mostra quando os valores foram baixados e tem o botão **Atualizar agora** (ou tecla F5). A atualização leva menos de um minuto e acontece sozinha quando o aplicativo abre, se já passou um dia da última. Sem internet, o aplicativo continua funcionando com os valores que já tem.

### Aba Automação

O aplicativo tem uma segunda aba, para automatizar tarefas repetitivas no computador (editor, ferramenta de desenvolvimento, formulário). Nada a ver com o Animal Jam: é um utilitário à parte, na mesma janela.

Passos disponíveis: **clique** (posição, botão, número de cliques), **mover mouse**, **escrever texto** (aceita acentos, com velocidade por letra), **tecla** (com Ctrl, Shift, Alt, Win), **esperar** e **rolagem**. Cada passo tem sua própria espera, e a automação inteira pode repetir quantas vezes quiser, com intervalo entre as voltas.

- **F8**, em qualquer lugar da tela, marca a posição do mouse no passo escolhido. Sem passo escolhido, cria um clique novo ali.
- **F9** para tudo na hora, mesmo com outro programa na frente.
- A espera antes de começar (3 segundos por padrão) serve para você trocar de janela.
- As automações ficam salvas por nome e o rascunho atual volta sozinho quando você reabre o app.

Os cliques e teclas são enviados pelo Windows (`SendInput`) através de `app/runner.ps1`, num PowerShell separado — por isso o F9 consegue interromper na hora. Detalhes que importam: as teclas vão para a **janela que estiver em foco**, então confira qual janela está na frente antes de rodar; e programas abertos como administrador só recebem os comandos se o aplicativo também estiver como administrador.

## Como usar (versão site)

Abra o `index.html` no navegador. Não precisa instalar nada.

- Toque num espaço vazio e busque o item em português ou inglês: `preta longa`, `pl`, `cocar azul`, `asas`, `pet foca`, `beta`, `headdress`…
- Sem digitar nada, o catálogo mostra os itens mais negociados e depois **todos os itens com foto de cada cor**, em ordem de valor ou A–Z, com o botão "Mostrar mais".
- Os filtros separam Spikes, Pets (incluindo códigos de pet), Betas, RIMs, Cabeça, Pescoço, Costas, Pernas, Cauda e Toca.
- Cada item escolhido tem um link "ver no wiki" para conferir a página original.
- A troca fica salva no navegador e no link (`#t=...`). Dá para mandar o link para um amigo.

## De onde vêm os valores

Todos os valores vêm do [AJ Item Worth Wiki](https://aj-item-worth.fandom.com), o wiki mais completo e atualizado de valores do AJ Classic (cerca de 1.280 páginas). O script lê as tabelas de cada página: cada item e cada cor.

O wiki usa várias "moedas". A balança converte tudo para diamantes, com a escala do próprio wiki (as páginas de spikes listam o valor em diamantes ao lado de cada cor), e mostra o resultado em **Pretas Longas (PL)**:

| Unidade do wiki | Diamantes |
|---|---|
| RIM obtenível | ~0,35 |
| Beta de roupa | 1 |
| Beta de toca | 3 |
| Pulseira longa ruim / média / boa / preta | 19 / 27,5 / 32,5 / 47,5 |
| Coleira curta ruim / média / boa / preta | 62,5 / 77 / 110 / 170 |
| Coleira longa ruim / média / boa / vermelha | 160 / 200 / 247,5 / 320 |
| **Coleira longa preta (PL)** ou 1 "Variety" | **475** |

Quando o wiki mostra duas colunas (por exemplo "2 Good Long Collars" e "450-500 Diamonds"), vale a de diamantes, que é a mais precisa.

### Veredito

Razão = valor que você recebe ÷ valor que você dá.

| Razão | Resultado |
|---|---|
| ≥ 1,40 | VALE MUITO (W grande) |
| 1,10 a 1,40 | VALE (W) |
| 0,90 a 1,10 | JUSTO |
| 0,70 a 0,90 | NÃO VALE (L) |
| ≤ 0,70 | NÃO ACEITE (L grande) |

A balança também avisa sobre itens "difíceis de avaliar" (que ficam fora da conta), valores mínimos (pets), itens à venda na loja, "talvez mais/menos" e upgrade/downgrade.

## Atualizar os valores

Os valores mudam toda semana. Para baixar a versão mais recente (precisa do [Node.js](https://nodejs.org) 18 ou mais novo):

```bash
npm install                       # só na primeira vez (instala o sharp, que monta as fotos)
node scripts/atualizar-valores.mjs
```

Gera um `items.js` novo e as fotos em `img/`. Na primeira vez as ~18 mil fotos são baixadas e demora uns 20 minutos. Depois elas ficam guardadas em `scripts/.cache/` e só as fotos novas são baixadas. Para atualizar só os valores, sem mexer nas fotos, use `--sem-fotos`.

### Fotos

Cada foto do wiki é reduzida para 64×64 e agrupada em folhas de 256 fotos (`img/s0.webp`, `img/s1.webp`…). O navegador só baixa uma folha quando precisa mostrar uma foto dela, então o site continua leve. Se uma foto faltar, aparece uma bolinha com a cor do item.

## Colocar no ar de graça

É um site estático: basta enviar `index.html`, `items.js` e a pasta `img/` para qualquer um destes:

- **Netlify Drop**: arraste a pasta em https://app.netlify.com/drop
- **GitHub Pages**: suba num repositório e ative Pages
- **Vercel** / **Cloudflare Pages**

As fotos ficam dentro do próprio site (pasta `img/`), então funcionam também sem internet ao abrir o `index.html` direto.

## Arquivos

```
index.html                  o site (HTML + CSS + JS, sem dependências)
items.js                    base de itens gerada (não edite à mão)
img/s*.webp                 fotos dos itens em folhas de sprites (geradas)
scripts/atualizar-valores.mjs
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
```

Para adicionar gírias ou nomes em português, edite `PT_NAMES` e `ALIASES` em `scripts/lib/ptdict.mjs` (e `SLANG` no `index.html` para gírias que apontam para uma cor específica) e rode o script de novo.

## Créditos

Valores e imagens: AJ Item Worth Wiki (Fandom), sob licença CC BY-SA. Nomes oficiais em português: Wiki Animal Jam pt-BR. Projeto feito por fãs, sem afiliação com a WildWorks ou o Animal Jam.
