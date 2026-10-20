// Servidor local de FIXTURES (dados FICTÍCIOS) que imita os caminhos e o formato dos
// arquivos oficiais do TSE. Serve para testar a interface sem depender de resultados
// reais mudando a cada consulta.
//
// Uso:
//   npm run fixtures:serve                      # apuração simulada de 0% a 100% em 20 min
//   npm run fixtures:serve -- --minutes=5       # simulação mais rápida
//   npm run fixtures:serve -- --freeze=40       # congela em 40% das seções
//   npm run fixtures:serve -- --fail-rate=0.3   # 30% das respostas falham (HTTP 503)
//   npm run fixtures:serve -- --turno2=off      # 2º turno ainda "não publicado" (404)
//
// Depois: VITE_TSE_BASE_URL=http://localhost:8787/oficial npm run dev
// A interface exibe a faixa "MODO DE TESTE" sempre que a base não é a oficial.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const arg = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};
const PORT = Number(arg('port', 8787));
const MINUTES = Number(arg('minutes', 20));
const FREEZE = arg('freeze', null);
const FAIL_RATE = Number(arg('fail-rate', 0));
const TURNO2 = arg('turno2', 'on') !== 'off';
const START = Date.now();

const UFS =
  'ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to zz'.split(' ');
const SECOES = {
  sp: 2000,
  mg: 1200,
  rj: 1000,
  ba: 900,
  rs: 700,
  pr: 650,
  pe: 600,
  ce: 580,
  pa: 520,
  sc: 480,
  go: 450,
  ma: 420,
  am: 300,
  es: 280,
  pb: 260,
  rn: 230,
  mt: 220,
  al: 210,
  pi: 200,
  df: 190,
  ms: 180,
  se: 150,
  ro: 120,
  to: 110,
  ac: 60,
  ap: 55,
  rr: 50,
  zz: 40,
};
const LULA = {
  n: '13',
  sqcand: '280002542548',
  nm: 'LUIZ INÁCIO LULA DA SILVA',
  nmu: 'LULA',
  sg: 'PT',
};
const FLAVIO = {
  n: '22',
  sqcand: '280002551544',
  nm: 'FLAVIO NANTES BOLSONARO',
  nmu: 'FLAVIO BOLSONARO',
  sg: 'PL',
};
const OUTRO = {
  n: '99',
  sqcand: '999999999999',
  nm: 'CANDIDATO FICTÍCIO DE TESTE',
  nmu: 'FICTÍCIO',
  sg: 'XX',
};

function seeded(str) {
  const h = createHash('sha1').update(str).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}
function progress() {
  if (FREEZE != null) return Math.min(1, Number(FREEZE) / 100);
  return Math.min(1, (Date.now() - START) / (MINUTES * 60_000));
}
const pad2 = (n) => String(n).padStart(2, '0');
function brDate(d = new Date()) {
  const b = new Date(d.getTime() - 3 * 3600_000);
  return [
    `${pad2(b.getUTCDate())}/${pad2(b.getUTCMonth() + 1)}/${b.getUTCFullYear()}`,
    `${pad2(b.getUTCHours())}:${pad2(b.getUTCMinutes())}:${pad2(b.getUTCSeconds())}`,
  ];
}

/** Votos fictícios de uma abrangência num instante (determinístico + progresso). */
function area(ele, turno, code, ts) {
  const p = progress();
  const lag = seeded(`lag-${code}`) * 0.25;
  const frac = Math.max(0, Math.min(1, (p - lag) / (1 - lag || 1)));
  const st = Math.round(ts * frac);
  const eleitores = st * 300;
  const base = seeded(`${ele}-${code}`);
  const lulaShare = turno === 2 ? 0.38 + base * 0.24 : 0.3 + base * 0.3;
  const flavioShare = turno === 2 ? 1 - lulaShare : 0.75 - lulaShare - 0.05;
  const brancos = Math.round(eleitores * 0.02);
  const nulos = Math.round(eleitores * 0.03);
  const vv = eleitores - brancos - nulos;
  const lula = Math.round(vv * lulaShare);
  const flavio = Math.round(vv * flavioShare);
  const cands =
    turno === 2
      ? [
          [LULA, lula],
          [FLAVIO, vv - lula],
        ]
      : [
          [LULA, lula],
          [FLAVIO, flavio],
          [OUTRO, vv - lula - flavio],
        ];
  return { st, ts, vv, brancos, nulos, cands, done: st === ts && p >= 1 };
}

function sum(areas) {
  const out = {
    st: 0,
    ts: 0,
    vv: 0,
    brancos: 0,
    nulos: 0,
    cands: areas[0].cands.map(([c]) => [c, 0]),
    done: areas.every((a) => a.done),
  };
  for (const a of areas) {
    out.st += a.st;
    out.ts += a.ts;
    out.vv += a.vv;
    out.brancos += a.brancos;
    out.nulos += a.nulos;
    a.cands.forEach(([, v], i) => (out.cands[i][1] += v));
  }
  return out;
}

const idg = () => String(1_000_000 + Math.floor((Date.now() - START) / 1000));

function resultado(ele, turno, tpabr, cdabr, a) {
  const [dg, hg] = brDate();
  const tot = a.vv + a.brancos + a.nulos;
  return {
    _fixture: 'DADOS FICTÍCIOS PARA TESTE — NÃO SÃO RESULTADOS OFICIAIS',
    ele,
    t: String(turno),
    f: 'o',
    sup: 'n',
    tpabr,
    cdabr,
    dg,
    hg,
    idg: idg(),
    dt: a.st ? dg : '',
    ht: a.st ? hg : '',
    dv: 's',
    tf: a.done ? 's' : 'n',
    and: a.done ? 'f' : a.st ? 'p' : 'n',
    carg: [
      {
        cd: '1',
        nmn: 'Presidente',
        agr: a.cands.map(([c, v], i) => ({
          n: `9${i}`,
          nm: `AGREMIAÇÃO ${c.sg}`,
          tp: 'i',
          par: [
            {
              n: c.n,
              sg: c.sg,
              nm: `PARTIDO ${c.sg}`,
              cand: [
                {
                  n: c.n,
                  sqcand: c.sqcand,
                  nm: c.nm,
                  nmu: c.nmu,
                  vap: String(v),
                  pvapn: a.vv ? String(((v / a.vv) * 100).toFixed(9)).replace('.', ',') : '0',
                  e: 'n',
                  st: '',
                },
              ],
            },
          ],
        })),
      },
    ],
    s: { ts: String(a.ts), st: String(a.st), snt: String(a.ts - a.st) },
    e: { te: String(a.ts * 400), c: String(tot), a: '0' },
    v: {
      tv: String(tot),
      vv: String(a.vv),
      vnom: String(a.vv),
      vb: String(a.brancos),
      tvn: String(a.nulos),
      vn: String(a.nulos),
      vnt: '0',
      van: '0',
      vansj: '0',
    },
  };
}

const MUNS = (uf) =>
  [1, 2, 3].map((i) => ({
    cd: String((seeded(`${uf}${i}`) * 90000 + 10000) | 0).padStart(5, '0'),
    cdi: '0000000',
    nm: `MUNICÍPIO FICTÍCIO ${uf.toUpperCase()} ${i}`,
    c: i === 1 ? 's' : 'n',
    z: ['0001'],
  }));

function route(path) {
  const m = /^\/oficial\/ele2026\/(6257|6258)\/(dados|config)\/(.+)$/.exec(path);
  if (!m) return null;
  const ele = m[1];
  const turno = ele === '6257' ? 1 : 2;
  if (turno === 2 && !TURNO2) return null;
  const rest = m[3];
  if (m[2] === 'config') {
    if (rest !== `mun-e00${ele}-cm.json`) return null;
    const [dg, hg] = brDate();
    return {
      dg,
      hg,
      idg: '1',
      f: 'o',
      abr: UFS.map((uf) => ({ cd: uf, ds: uf.toUpperCase(), mu: MUNS(uf) })),
    };
  }
  let x;
  if ((x = new RegExp(`^br/br-e00${ele}-ab\\.json$`).exec(rest))) {
    const [dg, hg] = brDate();
    return {
      ele,
      t: String(turno),
      dg,
      hg,
      idg: idg(),
      abr: UFS.map((uf) => {
        const a = area(ele, turno, uf, SECOES[uf]);
        return {
          and: a.done ? 'f' : a.st ? 'p' : 'n',
          tpabr: 'uf',
          cdabr: uf,
          dt: dg,
          ht: hg.slice(0, 5) + ':00',
          s: { ts: String(a.ts), st: String(a.st) },
        };
      }),
    };
  }
  if (rest === `br/br-c0001-e00${ele}-u.json`) {
    return resultado(
      ele,
      turno,
      'br',
      'br',
      sum(UFS.map((uf) => area(ele, turno, uf, SECOES[uf]))),
    );
  }
  if (
    (x = new RegExp(`^([a-z]{2})/([a-z]{2})-e00${ele}-ab\\.json$`).exec(rest)) &&
    x[1] === x[2] &&
    SECOES[x[1]]
  ) {
    const [dg, hg] = brDate();
    return {
      ele,
      t: String(turno),
      dg,
      hg,
      idg: idg(),
      abr: MUNS(x[1]).map((mu) => {
        const a = area(ele, turno, x[1] + mu.cd, 10);
        return { tpabr: 'mun', cdabr: mu.cd, dt: dg, ht: hg, s: { ts: '10', st: String(a.st) } };
      }),
    };
  }
  if (
    (x = new RegExp(`^([a-z]{2})/([a-z]{2})-c0001-e00${ele}-u\\.json$`).exec(rest)) &&
    x[1] === x[2] &&
    SECOES[x[1]]
  ) {
    return resultado(ele, turno, 'uf', x[1], area(ele, turno, x[1], SECOES[x[1]]));
  }
  if (
    (x = new RegExp(`^([a-z]{2})/([a-z]{2})(\\d{5})-c0001-e00${ele}-u\\.json$`).exec(rest)) &&
    x[1] === x[2]
  ) {
    return resultado(ele, turno, 'mu', x[3], area(ele, turno, x[1] + x[3], 10));
  }
  return null;
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  const path = new URL(req.url, 'http://x').pathname;
  if (FAIL_RATE > 0 && Math.random() < FAIL_RATE) {
    res.writeHead(503).end('falha simulada');
    console.log(503, path);
    return;
  }
  const body = route(path);
  if (!body) {
    res.writeHead(404).end('not found');
    console.log(404, path);
    return;
  }
  const json = JSON.stringify(body);
  const etag = `"${createHash('md5')
    .update(json.replace(/"(dg|hg|idg)":"[^"]*"/g, ''))
    .digest('hex')}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag }).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', ETag: etag }).end(json);
  console.log(200, path);
}).listen(PORT, () => {
  console.log(`Fixtures (DADOS FICTÍCIOS) em http://localhost:${PORT}/oficial`);
  console.log(
    `Apuração simulada: ${FREEZE != null ? `congelada em ${FREEZE}%` : `${MINUTES} min até 100%`}`,
  );
});
