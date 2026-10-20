# Brasil Eleitoral — apuração em tempo real

PWA para acompanhar a apuração da **eleição presidencial de 2026** com os **arquivos oficiais
de divulgação do TSE**. O mapa do Brasil (malha oficial do IBGE) colore cada UF conforme quem
recebeu mais votos entre **Lula** (vermelho) e **Flávio Bolsonaro** (azul), com totais
nacionais, detalhamento por estado e por município, e suporte a 1º e 2º turno.

- Dados: `https://resultados.tse.jus.br/oficial` (sem scraping de HTML, sem dados inventados).
- Geometrias: IBGE — API de Malhas Territoriais v3 (27 UFs).
- Atualização automática a cada 30 s (mínimo garantido), sem requisições simultâneas.
- Funciona offline com o último resultado válido, sempre identificado com data e hora.

Detalhes técnicos da integração: [`docs/INTEGRACAO-TSE.md`](docs/INTEGRACAO-TSE.md).

## Requisitos

- Node.js ≥ 20.19 (testado com 22)
- npm 10+

## Comandos

```bash
npm ci                # instala dependências (versões travadas no package-lock.json)
npm run dev           # desenvolvimento em http://localhost:5173
npm run build         # typecheck + build de produção (dist/), gera service worker
npm run preview       # serve o build em http://localhost:4173 (teste do PWA)
npm test              # testes (Vitest + Testing Library)
npm run lint          # ESLint
npm run format        # Prettier (format:check para apenas verificar)
npm run geo:update    # baixa novamente a malha das UFs do IBGE
npm run fixtures:serve  # servidor local com dados FICTÍCIOS (ver "Testar sem dados reais")
npm run icons         # regera os ícones PNG do PWA (requer Playwright)
```

## Configuração (`.env`)

Copie `.env.example` para `.env` se quiser alterar algo. Nenhuma variável é obrigatória e não
há segredos: tudo é público e embutido no frontend.

| Variável                        | Padrão                                  | Descrição                                                            |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `VITE_TSE_BASE_URL`             | `https://resultados.tse.jus.br/oficial` | Base dos arquivos. Outra base ativa a faixa "MODO DE TESTE".         |
| `VITE_REFRESH_INTERVAL_SECONDS` | `30`                                    | Intervalo da atualização. **Valores < 30 são elevados a 30.**        |
| `VITE_STALE_AFTER_SECONDS`      | `120`                                   | Idade a partir da qual os dados são sinalizados como desatualizados. |
| `VITE_DEFAULT_TURNO`            | `1`                                     | Turno aberto por padrão (`1` ou `2`).                                |

### Alterar o intervalo de atualização

Defina `VITE_REFRESH_INTERVAL_SECONDS` (ex.: `60`) e gere novo build. O mínimo de 30 s é
imposto em código (`src/data/appConfig.ts` → `clampRefreshSeconds` e no `Poller`), também
para o botão "Atualizar" e para a reconexão. Em caso de falhas, o intervalo cresce
(backoff) até 5 minutos e volta ao normal após o primeiro sucesso.

## Como selecionar o turno

- Na interface: seletor **1º turno / 2º turno** (no topo no desktop; barra inferior no celular).
- Por link: `?turno=2`, opcionalmente com estado: `?turno=2&uf=SP`.
- Padrão do build: `VITE_DEFAULT_TURNO`.

Ao trocar de turno, o agendador anterior é parado (requisição em curso cancelada), os dados e
caches municipais do turno anterior são descartados e todos os arquivos do novo turno passam
pela validação de `ele`/`t` — um arquivo de outro turno é rejeitado. O estado selecionado e
demais preferências de interface são preservados.

Se o TSE ainda não tiver publicado o turno, a página informa isso e continua consultando.

### Incluir outra eleição

Acrescente um objeto em `src/data/elections.ts` (ciclo, cargo, códigos de cada turno,
`sqcand`/número dos candidatos). Os componentes visuais não têm códigos fixos. Valide os
códigos em `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`.

## Testar sem depender de resultados reais

```bash
npm run fixtures:serve -- --minutes=10     # simula a apuração de 0% a 100% em 10 min
# em outro terminal:
VITE_TSE_BASE_URL=http://localhost:8787/oficial npm run dev
```

Opções do servidor: `--freeze=40` (congela em 40% das seções), `--fail-rate=0.3` (30% das
respostas com HTTP 503, para ver a recuperação e a preservação do último dado válido),
`--turno2=off` (2º turno ainda não publicado), `--port=8787`.

Os dados do servidor de fixtures são **fictícios** e a interface mostra a faixa
**"MODO DE TESTE — dados simulados"** sempre que a base não é a oficial.

Os testes automatizados usam fixtures em `src/tests/fixtures/tse.ts`, com a estrutura dos
arquivos reais e números inventados.

## Arquitetura

```
src/
  data/            elections.ts (configuração das eleições), ufs.ts (UF↔IBGE↔TSE),
                   appConfig.ts, geo/br-uf.json (malha IBGE)
  types/           tse.ts (formato oficial) e election.ts (modelo interno)
  services/tse/    paths.ts, client.ts (fetch+erros), adapter.ts (validação/normalização),
                   snapshot.ts (Brasil + 27 UFs + exterior por ciclo)
  services/        poller.ts (agendamento), electionStore.ts (fonte única por turno),
                   persistence.ts (último resultado válido no dispositivo)
  utils/           calc.ts (cálculos puros), format.ts, dates.ts, numbers.ts, status.ts
  hooks/           useElectionData, useMunicipal (TanStack Query), useGeometry, ...
  components/      painéis, KPIs, lista acessível, bottom sheet
  components/map/  BrazilMap (d3-geo + SVG + d3-zoom), legenda, cores
  features/election/ seletores de eleição/turno/abrangência e estado na URL
  pages/           Dashboard
  tests/           testes e fixtures
scripts/           update-geometry.mjs, fixture-server.mjs, generate-icons.mjs
```

Fluxo: `fetch (client)` → `adapter` (valida e converte) → `snapshot` (monta a fotografia) →
`ElectionStore` (um por turno, poller único) → componentes (só leem; não consultam o TSE).

**Sem backend:** o TSE responde com `Access-Control-Allow-Origin` para a origem do app, então
o navegador lê os arquivos diretamente. O tráfego por usuário é pequeno: a cada 30 s, dois
arquivos nacionais (~40 KB) e somente as UFs que mudaram; arquivos inalterados são
revalidados por ETag (HTTP 304). Ver `docs/INTEGRACAO-TSE.md` para o plano caso isso mude.

### Estados exibidos

- Atualização: _Carregando_, _Atualizando…_, _Dados atualizados_, _Dados desatualizados_
  (idade > `VITE_STALE_AFTER_SECONDS` ou dados salvos), _Falha temporária_, _Sem conexão_,
  _Ainda não publicado_.
- Apuração: _Apuração não iniciada_, _Apuração parcial_, _Totalização finalizada_
  (somente com o indicador oficial `tf = s`).

## Mapa e geometrias

A malha vem da API de Malhas do IBGE (`qualidade=intermediaria`, ~250 KB, carregada em chunk
separado e pré-cacheada pelo service worker). Para atualizar:

```bash
npm run geo:update                         # padrão: intermediaria
npm run geo:update -- --qualidade=minima   # mais leve
npm test -- ufs                            # valida as 27 UFs e as correspondências
```

O script verifica que existem exatamente as 27 UFs e corrige a orientação dos polígonos para
o d3-geo. A correspondência UF ↔ código IBGE ↔ código TSE está em `src/data/ufs.ts` e é
testada contra a malha e contra a lista oficial de UFs do TSE.

Interação: passar o mouse/focar mostra nome e sigla; clique, toque ou Enter abre o
detalhamento; zoom por roda/pinça ou botões; Esc fecha. A tabela "Resultado por estado" é a
alternativa acessível ao mapa.

## PWA e offline

- `vite-plugin-pwa` (Workbox `generateSW`): manifesto, ícones (192, 512 e maskable), precache
  de todos os arquivos estáticos (inclusive a malha), aviso de nova versão.
- Arquivos de **resultados** do TSE nunca são servidos pelo service worker (`NetworkOnly`).
  O último resultado válido é guardado em `localStorage` com data/hora e exibido como
  "últimos dados disponíveis" quando offline; é descartado após 7 dias e nunca é usado para
  outro turno.
- Instalação exige HTTPS em produção (ou `localhost`).

Validação feita: build de produção servido via `npm run preview`, service worker ativo,
página controlada pelo SW, recarregada **offline** exibindo o mapa e o aviso "Você está sem
conexão… últimos dados disponíveis, obtidos em …".

## Deploy

O build é estático (`dist/`). Qualquer hospedagem com HTTPS serve:

- **Vercel / Netlify / Cloudflare Pages:** comando `npm run build`, diretório `dist`.
- **GitHub Pages / S3 + CloudFront / Nginx:** publique `dist/`. Sirva `sw.js` e `index.html`
  com `Cache-Control: no-cache` para que novas versões sejam detectadas.

A aplicação usa uma única rota (`/`) com parâmetros de consulta; não precisa de reescrita.
Se publicar num subdiretório, ajuste `base` em `vite.config.ts` e `start_url`/`scope` do
manifesto.

## Testes

`npm test` executa 66 testes, cobrindo:

1. identificação de Lula e Flávio por `sqcand` + número (`calc.test.ts`);
2. percentuais sobre válidos e conferência com o percentual oficial;
3. diferença de votos e em pontos percentuais;
4. cor de cada estado (só os dois candidatos, mesmo com terceiro à frente);
5. empate;
6. estado sem resultado / não publicado / inválido;
7. troca do 1º para o 2º turno (store, snapshot e interface);
8. rejeição de arquivos de outro turno/eleição/abrangência e de candidatos duplicados;
9. atualização automática sem requisições simultâneas, mínimo de 30 s, backoff, cancelamento;
10. preservação dos últimos dados válidos após erro (por UF e global) e persistência;
11. correspondência UF ↔ IBGE ↔ TSE ↔ geometria (e orientação dos polígonos);
12. renderização e interação em 1440 px (painel lateral, teclado, lista) e 390 px (bottom
    sheet, barra inferior, KPIs).

## Limitações conhecidas

- A página de documentação técnica do TSE bloqueou acesso automatizado (HTTP 403); a
  integração foi validada diretamente nos arquivos oficiais (ver `docs/INTEGRACAO-TSE.md`).
- Os significados de `and` e `tf` foram inferidos dos arquivos (valores observados em turnos
  concluídos e não iniciados). O status "finalizada" só é usado com `tf = s`.
- Votos municipais exigem um arquivo por município; por isso só são baixados quando o usuário
  pede ("Carregar votos dos N municípios") e não são atualizados automaticamente.
- O exterior (`zz`) entra no total nacional, mas não aparece no mapa (é mostrado à parte).
- O `sqcand` dos candidatos está fixado na configuração; se o TSE alterar o identificador, a
  interface mostra o aviso de integridade e a UF fica "sem dados" até a configuração ser
  corrigida.
