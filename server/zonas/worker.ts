/**
 * Processo que calcula resultados por ZONA ELEITORAL a partir dos Boletins de Urna (BU).
 *
 * O TSE não publica resultados por zona nos arquivos de divulgação; publica o BU de cada
 * seção em `arquivo-urna/<pleito>/dados/<uf>/<municipio>/<zona>/<secao>/`. Este processo:
 *   1. lê a configuração de seções de cada UF (`arquivo-urna/<pleito>/config/<uf>/<uf>-p<pleito>-cs.json`),
 *      que traz o horário de chegada de cada BU;
 *   2. para cada seção nova ou alterada, lê o índice da seção (`...-aux.json`), baixa o BU
 *      totalizado e o decodifica (src/services/tse/bu.ts);
 *   3. soma por município e zona e grava `<out>/<eleicao>/<uf>.json` (src/types/zonas.ts);
 *   4. repete a cada `--interval` segundos (mínimo 30), até `--max-minutes`.
 *
 * Uso:
 *   npm run zonas:worker -- --turno 2 --out zonas-out --state zonas-state
 *   npm run zonas:worker -- --turno 1 --ufs ac --once          # um ciclo, só o Acre
 *   npm run zonas:worker -- --turno 2 --serve 8790             # também serve os arquivos via HTTP
 *
 * Opções: --interval 60  --concurrency 16  --rate 40 (req/s)  --max-minutes 0 (sem limite)
 *         --max-per-uf 3000 (seções por UF por ciclo, para revezar entre UFs)
 *         --publish-cmd "<comando>" --publish-every 5 (min)  --base <url do TSE>
 *         --only-active (sai imediatamente fora da janela do dia da eleição + 3 dias)
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, normalize, resolve } from 'node:path';
import { ELECTIONS } from '../../src/data/elections';
import { TSE_EXTERIOR_CODE, UFS } from '../../src/data/ufs';
import { decodeBoletimUrna, votosDoCargo } from '../../src/services/tse/bu';
import { RequestLimiter } from '../../src/services/tse/limiter';
import {
  agregarZonas,
  secaoKey,
  type SecaoEsperada,
  type SecaoEstado,
} from '../../src/services/zonas/aggregate';
import type { ZonasArquivo } from '../../src/types/zonas';

// ---------------------------------------------------------------- argumentos

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--'))
    return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const election = ELECTIONS[0]!;
const turno = Number(arg('turno') ?? '1');
const round = election.rounds.find((r) => r.turno === turno);
if (!round) throw new Error(`Turno inválido: ${turno}`);
const BASE = (arg('base') ?? 'https://resultados.tse.jus.br/oficial').replace(/\/+$/, '');
const OUT = resolve(arg('out') ?? 'zonas-out');
const STATE = resolve(arg('state') ?? 'zonas-state');
const INTERVAL_S = Math.max(30, Number(arg('interval') ?? 60));
const CONCURRENCY = Math.max(1, Number(arg('concurrency') ?? 16));
const RATE = Math.max(1, Number(arg('rate') ?? 40));
const MAX_MINUTES = Number(arg('max-minutes') ?? 0);
const PUBLISH_CMD = arg('publish-cmd');
const PUBLISH_EVERY_MIN = Number(arg('publish-every') ?? 5);
const ONCE = flag('once');
const SERVE = arg('serve');
const PENDING_RETRY_MS = 5 * 60_000;
/** Máximo de seções por UF em cada ciclo: faz o processamento revezar entre as UFs. */
const MAX_PER_UF = Math.max(100, Number(arg('max-per-uf') ?? 3000));
const ufsArg = arg('ufs')?.toLowerCase().split(',').filter(Boolean);
const UF_CODES = ufsArg ?? [...UFS.map((u) => u.tse), TSE_EXTERIOR_CODE];

const eleicao = round.codigoEleicao;
const pleito = round.pleito;
const pad = (s: string | number, n: number) => String(s).padStart(n, '0');
const startedAt = Date.now();
const deadline = MAX_MINUTES > 0 ? startedAt + MAX_MINUTES * 60_000 : Infinity;

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}

if (flag('only-active')) {
  // Janela: do dia da eleição até 3 dias depois (horário de Brasília).
  const start = Date.parse(`${round.date}T07:00:00-03:00`);
  const end = start + 4 * 86_400_000;
  if (Date.now() < start || Date.now() > end) {
    log(`Fora da janela do ${round.label} (${round.date}). Nada a fazer.`);
    process.exit(0);
  }
}

// ---------------------------------------------------------------- HTTP com limitador

const limiter = new RequestLimiter({
  maxConcurrent: CONCURRENCY,
  maxConcurrentLow: CONCURRENCY,
  lowGapMs: Math.ceil(1000 / RATE),
  baseCooldownMs: 5_000,
  maxCooldownMs: 60_000,
});
let requests = 0;
let rateLimited = 0;

class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const release = await limiter.acquire('low');
  try {
    requests++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      limiter.report(res.status);
      if (res.status === 429) rateLimited++;
      return res;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    limiter.report('error');
    throw e;
  } finally {
    release();
  }
}

const etags = new Map<string, { etag: string; body: unknown }>();

/** GET JSON com If-None-Match: arquivos grandes inalterados não são baixados de novo. */
async function getJsonCached(url: string): Promise<{ body: unknown; changed: boolean }> {
  const prev = etags.get(url);
  const res = await get(url, prev ? { 'If-None-Match': prev.etag } : {});
  if (res.status === 304 && prev) return { body: prev.body, changed: false };
  if (!res.ok) throw new HttpError(res.status, url);
  const body = await res.json();
  const etag = res.headers.get('etag');
  if (etag) etags.set(url, { etag, body });
  return { body, changed: true };
}

// ---------------------------------------------------------------- estado

interface UfEstado {
  secoes: Map<string, SecaoEstado>;
}
const estados = new Map<string, UfEstado>();

async function loadEstado(uf: string): Promise<UfEstado> {
  const cached = estados.get(uf);
  if (cached) return cached;
  const file = join(STATE, eleicao, `${uf}.json`);
  let secoes = new Map<string, SecaoEstado>();
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as {
        eleicao: string;
        secoes: [string, SecaoEstado][];
      };
      if (raw.eleicao === eleicao) secoes = new Map(raw.secoes);
    } catch (e) {
      log(`Estado de ${uf} ilegível, recomeçando:`, (e as Error).message);
    }
  }
  const st = { secoes };
  estados.set(uf, st);
  return st;
}

async function writeAtomic(file: string, data: string) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function saveEstado(uf: string, st: UfEstado) {
  await writeAtomic(
    join(STATE, eleicao, `${uf}.json`),
    JSON.stringify({ eleicao, secoes: [...st.secoes.entries()] }),
  );
}

// ---------------------------------------------------------------- candidatos válidos

/** Números com candidatura válida, do arquivo oficial nacional do turno. */
async function candidatosValidos(): Promise<Set<string>> {
  const url = `${BASE}/${election.ciclo}/${eleicao}/dados/br/br-c${pad(election.cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
  const { body } = await getJsonCached(url);
  const r = body as {
    ele: string;
    t: string;
    carg: { cd: string; agr: { par: { cand: { n: string; dvt?: string }[] }[] }[] }[];
  };
  if (r.ele !== eleicao || r.t !== String(turno))
    throw new Error('Arquivo nacional de outro turno.');
  const out = new Set<string>();
  for (const c of r.carg
    .find((x) => x.cd === election.cargo)
    ?.agr.flatMap((a) => a.par.flatMap((p) => p.cand)) ?? []) {
    // "dvt" ausente antes da apuração no 2º turno: os dois candidatos são válidos.
    if (!c.dvt || c.dvt.startsWith('Válido')) out.add(c.n);
  }
  if (!out.size) throw new Error('Nenhum candidato válido encontrado.');
  return out;
}

// ---------------------------------------------------------------- processamento

interface CsRaw {
  cdp: string;
  abr: {
    cd: string;
    mu: {
      cd: string;
      zon: { cd: string; sec: { ns: string; nsp?: string; da?: string; ha?: string }[] }[];
    }[];
  }[];
}

async function processSecao(uf: string, s: SecaoEsperada, st: UfEstado) {
  const dir = `${BASE}/${election.ciclo}/arquivo-urna/${pleito}/dados/${uf}/${s.municipio}/${s.zona}/${s.secao}`;
  const prefix = `p${pad(pleito, 6)}-${uf}-m${s.municipio}-z${s.zona}-s${s.secao}`;
  const key = secaoKey(s);
  const now = Date.now();
  try {
    const auxRes = await get(`${dir}/${prefix}-aux.json`);
    if (auxRes.status === 404) {
      st.secoes.set(key, { stamp: null, status: 'pendente', tentativaEm: now });
      return;
    }
    if (!auxRes.ok) throw new HttpError(auxRes.status, auxRes.url);
    const aux = (await auxRes.json()) as {
      hashes?: { hash: string; st: string; arq: { nm: string; tp: string }[] }[];
    };
    const tot = (aux.hashes ?? []).filter((h) => h.st === 'Totalizado');
    const h = tot[tot.length - 1];
    const buName = h?.arq.find((a) => a.tp === 'bu')?.nm;
    if (!h || !buName) {
      // Ainda não totalizada (ou anulada/não instalada): tenta de novo mais tarde.
      st.secoes.set(key, { stamp: null, status: 'pendente', tentativaEm: now });
      return;
    }
    const prev = st.secoes.get(key);
    if (prev?.status === 'ok' && prev.hash === h.hash) {
      st.secoes.set(key, { ...prev, stamp: s.stamp });
      return;
    }
    const buRes = await get(`${dir}/${h.hash}/${buName}`);
    if (!buRes.ok) throw new HttpError(buRes.status, buRes.url);
    const bu = decodeBoletimUrna(new Uint8Array(await buRes.arrayBuffer()));
    if (
      bu.pleito !== Number(pleito) ||
      bu.municipio !== Number(s.municipio) ||
      bu.zona !== Number(s.zona) ||
      bu.secao !== Number(s.secao)
    ) {
      throw new Error(
        `BU não corresponde à seção ${key} (pleito ${bu.pleito}, ${bu.municipio}/${bu.zona}/${bu.secao}).`,
      );
    }
    const votos = votosDoCargo(bu, Number(eleicao), Number(election.cargo));
    st.secoes.set(
      key,
      votos
        ? { stamp: s.stamp, status: 'ok', hash: h.hash, votos }
        : { stamp: s.stamp, status: 'sem-cargo', hash: h.hash },
    );
  } catch (e) {
    st.secoes.set(key, {
      ...(st.secoes.get(key) ?? {}),
      stamp: null, // força nova tentativa no próximo ciclo
      status: st.secoes.get(key)?.votos ? 'ok' : 'erro',
      tentativaEm: now,
      erro: (e as Error).message,
    });
  }
}

/** "dd/mm/aaaa hh:mm:ss" → número comparável. */
function stampMs(stamp: string): number {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp);
  return m ? Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!, +m[6]!) : 0;
}

async function processUf(
  uf: string,
  validos: Set<string>,
): Promise<{ novas: number; total: number } | null> {
  const url = `${BASE}/${election.ciclo}/arquivo-urna/${pleito}/config/${uf}/${uf}-p${pad(pleito, 6)}-cs.json`;
  let cs: CsRaw;
  try {
    cs = (await getJsonCached(url)).body as CsRaw;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null; // UF sem configuração (ainda)
    throw e;
  }
  if (cs.cdp !== pleito) throw new Error(`Configuração de seções de outro pleito (${cs.cdp}).`);
  const esperadas: SecaoEsperada[] = [];
  for (const a of cs.abr) {
    if (a.cd !== uf) continue;
    for (const m of a.mu)
      for (const z of m.zon)
        for (const sec of z.sec) {
          // Seção agregada (nsp = seção principal): vota na urna da principal, sem BU próprio.
          if (sec.nsp) continue;
          esperadas.push({
            municipio: m.cd,
            zona: z.cd,
            secao: sec.ns,
            stamp: sec.da && sec.ha ? `${sec.da} ${sec.ha}` : null,
          });
        }
  }
  const st = await loadEstado(uf);
  const now = Date.now();
  const todo = esperadas.filter((s) => {
    if (!s.stamp) return false; // BU ainda não chegou
    const cur = st.secoes.get(secaoKey(s));
    if (!cur) return true;
    if (cur.stamp === s.stamp && (cur.status === 'ok' || cur.status === 'sem-cargo')) return false;
    if (cur.stamp === s.stamp) return false;
    // Pendentes/erros: no máximo uma tentativa a cada 5 min.
    return !cur.tentativaEm || now - cur.tentativaEm > PENDING_RETRY_MS || cur.status === 'ok';
  });
  // Mais antigas primeiro (ordem de chegada dos boletins); no máximo MAX_PER_UF por ciclo.
  todo.sort((a, b) => (stampMs(a.stamp!) < stampMs(b.stamp!) ? -1 : 1));
  todo.splice(MAX_PER_UF);

  let done = 0;
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
    while (next < todo.length && Date.now() < deadline) {
      await processSecao(uf, todo[next++]!, st);
      if (++done % 500 === 0) {
        log(`${uf}: ${done}/${todo.length} seções (${requests} req, ${rateLimited}×429)`);
        await writeUf(uf, esperadas, st, validos);
      }
    }
  });
  await Promise.all(workers);
  await writeUf(uf, esperadas, st, validos);
  await saveEstado(uf, st);
  return { novas: done, total: esperadas.length };
}

async function writeUf(uf: string, esperadas: SecaoEsperada[], st: UfEstado, validos: Set<string>) {
  const arquivo: ZonasArquivo = {
    versao: 1,
    fonte: 'Soma dos Boletins de Urna (BU) totalizados publicados pelo TSE (arquivo-urna).',
    eleicao,
    turno: turno as 1 | 2,
    pleito,
    uf,
    cargo: election.cargo,
    geradoEm: new Date().toISOString(),
    candidatosValidos: [...validos].sort(),
    municipios: agregarZonas(esperadas, st.secoes, validos),
  };
  await writeAtomic(join(OUT, eleicao, `${uf}.json`), JSON.stringify(arquivo));
}

// ---------------------------------------------------------------- publicação / servidor

let lastPublish = 0;
async function publish(force = false) {
  if (!PUBLISH_CMD) return;
  if (!force && Date.now() - lastPublish < PUBLISH_EVERY_MIN * 60_000) return;
  lastPublish = Date.now();
  await new Promise<void>((res) => {
    const p = spawn(PUBLISH_CMD, { shell: true, stdio: 'inherit' });
    p.on('exit', (code) => {
      if (code) log(`Publicação terminou com código ${code}`);
      res();
    });
  });
}

function serve(port: number) {
  createServer(async (req, res) => {
    const path = normalize(
      decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname),
    ).replace(/^\/+/, '');
    const file = join(OUT, path);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (
      !file.startsWith(OUT) ||
      !file.endsWith('.json') ||
      !existsSync(file) ||
      !(await stat(file)).isFile()
    ) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30',
    });
    createReadStream(file).pipe(res);
  }).listen(port, () => log(`Servindo ${OUT} em http://localhost:${port}/<eleicao>/<uf>.json`));
}

// ---------------------------------------------------------------- laço principal

async function cycle() {
  const t0 = Date.now();
  const validos = await candidatosValidos();
  let novas = 0;
  let pendentes = false;
  for (const uf of UF_CODES) {
    if (Date.now() >= deadline) break;
    try {
      const r = await processUf(uf, validos);
      if (r) novas += r.novas;
      if (r?.novas) log(`${uf}: +${r.novas} seções (total esperado ${r.total})`);
      if (r && r.novas >= MAX_PER_UF) pendentes = true;
    } catch (e) {
      log(`Falha em ${uf}:`, (e as Error).message);
    }
    await publish();
  }
  log(
    `Ciclo concluído em ${((Date.now() - t0) / 1000).toFixed(0)} s: ${novas} seções novas; ${requests} req; ${rateLimited}×429`,
  );
  return { novas, pendentes };
}

async function main() {
  log(
    `Zonas — ${election.label}, ${round!.label} (eleição ${eleicao}, pleito ${pleito}); UFs: ${UF_CODES.join(',')}`,
  );
  if (SERVE) serve(Number(SERVE));
  for (;;) {
    const started = Date.now();
    let pendentes = false;
    try {
      pendentes = (await cycle()).pendentes;
    } catch (e) {
      log('Ciclo falhou:', (e as Error).message);
    }
    if ((ONCE && !pendentes) || Date.now() >= deadline) break;
    // Com fila acumulada, emenda o próximo ciclo (cada arquivo de configuração só é
    // baixado de novo se mudou — ETag); sem fila, respeita o intervalo.
    const wait = pendentes ? 0 : Math.max(0, started + INTERVAL_S * 1000 - Date.now());
    if (Date.now() + wait >= deadline) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  await publish(true);
  log('Encerrado.');
  if (!SERVE) process.exit(0);
}

void main();
