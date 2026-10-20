# Integração com os arquivos oficiais do TSE

Este documento descreve **como a aplicação obtém e interpreta** os resultados oficiais.
Tudo aqui foi verificado diretamente nos arquivos publicados em
`https://resultados.tse.jus.br/oficial` em outubro de 2026.

> **Nota sobre a documentação técnica:** a página
> <https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados>
> respondeu **HTTP 403** a todas as tentativas automatizadas de acesso feitas durante o
> desenvolvimento (bloqueio do servidor do TSE a clientes não-navegador). Por isso, os
> caminhos e campos foram validados **empiricamente nos próprios arquivos oficiais** — em
> especial no arquivo de configuração `comum/config/ele-c.json`, que publica os padrões de
> diretório — e conferidos entre si (ver "Verificações de consistência"). Recomenda-se que
> o mantenedor revise essa página num navegador antes de cada eleição.

## 1. Identificação das eleições

Arquivo: `GET /oficial/comum/config/ele-c.json`

| Pleito (`pl.cd`) | Data       | Eleição (`e.cd`) | Descrição                                 | Turno |
| ---------------- | ---------- | ---------------- | ----------------------------------------- | ----- |
| 3220             | 04/10/2026 | **6257**         | Eleição Ordinária Federal - 2026 1º Turno | 1     |
| 3221             | 25/10/2026 | **6258**         | Eleição Ordinária Federal - 2026 2º Turno | 2     |

O 1º turno referencia o 2º por `cdt2: "6258"`. Ciclo (diretório): `ele2026`.
Cargo Presidente: `cd: "1"`.

Esses códigos estão em `src/data/elections.ts`.

## 2. Arquivos utilizados

Padrões publicados em `ele-c.json` → `arq`:
`<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>` e `.../config`.

| Uso                     | Caminho (exemplo do 1º turno)                                 |
| ----------------------- | ------------------------------------------------------------- |
| Resultado nacional      | `/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json`      |
| Resultado por UF        | `/oficial/ele2026/6257/dados/sp/sp-c0001-e006257-u.json`      |
| Resultado no exterior   | `/oficial/ele2026/6257/dados/zz/zz-c0001-e006257-u.json`      |
| Resultado por município | `/oficial/ele2026/6257/dados/sp/sp71072-c0001-e006257-u.json` |
| Andamento por UF        | `/oficial/ele2026/6257/dados/br/br-e006257-ab.json`           |
| Andamento por município | `/oficial/ele2026/6257/dados/sp/sp-e006257-ab.json`           |
| Lista de municípios     | `/oficial/ele2026/6257/config/mun-e006257-cm.json`            |

`c0001` = cargo com 4 dígitos; `e006257` = eleição com 6 dígitos. O código do município é o
código **TSE** de 5 dígitos (não o do IBGE; o IBGE vem em `cdi` na lista de municípios).
Os caminhos são montados em `src/services/tse/paths.ts`.

Os arquivos do 2º turno (6258) já estavam publicados antes da votação, **zerados**
(`st: "0"`, `and: "n"`), e são atualizados pelo TSE durante a apuração. Antes da publicação, o
servidor responde 404 — tratado como "ainda não publicado".

## 3. Campos utilizados (`*-u.json`)

Todos os números chegam como **string**. Decimais usam vírgula.

| Campo                           | Significado                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `ele`, `t`                      | Código da eleição e turno — **validados** contra o turno pedido   |
| `tpabr`, `cdabr`                | Tipo (`br`/`uf`/`mu`) e código da abrangência — **validados**     |
| `idg`                           | Identificador de geração (crescente) — impede regressão           |
| `dg`, `hg`                      | Data/hora de geração do arquivo (Brasília)                        |
| `dt`, `ht`                      | Data/hora da última totalização (vazios antes do início)          |
| `tf`                            | `s` quando a totalização está finalizada                          |
| `and`                           | Andamento: `n` (não iniciada), `p` (parcial), `f` (finalizada)    |
| `s.ts`, `s.st`                  | Seções esperadas e totalizadas                                    |
| `v.vv`                          | Votos válidos (denominador dos percentuais)                       |
| `v.vb`                          | Votos brancos                                                     |
| `v.tvn`                         | Total de nulos (`vn` declarados + `vnt` técnicos)                 |
| `v.tv`                          | Total de votos apurados                                           |
| `v.vnom`                        | Votos nominais (soma dos candidatos)                              |
| `carg[cd=1].agr[].par[].cand[]` | Candidatos                                                        |
| `cand.sqcand`                   | **Identificador da candidatura**                                  |
| `cand.n`                        | Número de urna                                                    |
| `cand.vap`                      | Votos apurados do candidato                                       |
| `cand.pvapn`                    | % oficial sobre válidos (usado para conferência nos testes)       |
| `cand.st`                       | Situação oficial ("2º turno", "Eleito"...) — exibida só se `tf=s` |

### Identificação dos candidatos

| Candidato                 | `sqcand`       | `n` | Partido |
| ------------------------- | -------------- | --- | ------- |
| Luiz Inácio Lula da Silva | `280002542548` | 13  | PT      |
| Flávio Nantes Bolsonaro   | `280002551544` | 22  | PL      |

O `sqcand` é o identificador primário e é o mesmo nos arquivos do 1º e do 2º turno
(verificado). O número de urna é conferido como segunda chave: se divergir, o candidato é
tratado como **não localizado** (o estado fica "sem dados" e um aviso de integridade é exibido),
nunca como zero.

## 4. Cálculos

- `% válidos = votos do candidato / v.vv × 100`
- `diferença (votos) = |votos Lula − votos Flávio|`
- `diferença (p.p.) = |%Lula − %Flávio|`
- `% de seções totalizadas = s.st / s.ts × 100`
- Cor da UF: compara **somente** Lula × Flávio (no 1º turno, os demais candidatos entram nos
  totais de válidos, mas não na cor). Empate → cinza claro; sem votos → cinza; sem arquivo
  válido → hachurado.
- "Totalização finalizada" apenas com `tf = "s"`; nunca se declara vencedor por liderança.

Funções puras em `src/utils/calc.ts`; validação e adaptação em `src/services/tse/adapter.ts`.

## 5. Verificações de consistência (dados reais, 1º turno)

Durante o desenvolvimento foi verificado, com os arquivos oficiais do 1º turno:

- a soma dos votos de cada candidato nas 27 UFs + exterior (`zz`) é **idêntica** ao
  arquivo nacional, bem como válidos, brancos, nulos e seções;
- os percentuais calculados coincidem com `pvapn`;
- os valores exibidos para um município (Acrelândia/AC) coincidem com o arquivo oficial.

O total nacional **inclui o exterior**, que não aparece no mapa (é exibido à parte).

## 6. Estratégia de consulta

- Um único agendador por turno (`src/services/poller.ts`) — sem consultas simultâneas, mínimo de
  30 s entre inícios (inclusive no botão "Atualizar" e ao reconectar), backoff exponencial em
  falhas (60 s, 120 s, ... até 300 s).
- A cada ciclo: `br-...-ab.json` + `br-...-u.json`; arquivos de UF só são baixados quando o
  carimbo de andamento (`dt`/`ht`/`st`/`and`) daquela UF mudou.
- Todas as requisições usam `cache: 'no-cache'`: o navegador revalida com `If-None-Match`
  (ETag) e o TSE responde **304** para arquivos inalterados — sem novo download.
- Respostas com `idg` menor que o já exibido são descartadas.
- Falha numa UF mantém o último dado válido dela (marcado como desatualizado).
- O servidor do TSE envia `Access-Control-Allow-Origin` para a origem solicitante, por isso
  **não foi necessário backend**: o navegador consulta os arquivos oficiais diretamente. Os
  cabeçalhos observados incluem `x-ratelimit-limit: 5000` e `cache-control: max-age` curto
  (CDN Akamai), muito acima da carga gerada pela aplicação.

Se o TSE passar a bloquear CORS, a camada `src/services/tse/client.ts` permite apontar
`VITE_TSE_BASE_URL` para um proxy próprio que replique os mesmos caminhos (por exemplo, uma
função serverless que encaminhe `GET /oficial/*` para `resultados.tse.jus.br` com cache de
30 s). Não use proxies públicos.
