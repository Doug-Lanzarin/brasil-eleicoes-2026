/**
 * FIXTURES DE TESTE — dados FICTÍCIOS no formato dos arquivos oficiais do TSE.
 *
 * A estrutura (nomes de campos, tipos string, aninhamento carg → agr → par → cand) reproduz
 * os arquivos reais de 2026, mas TODOS os números são inventados para os testes.
 * Nunca use estes valores como resultados oficiais.
 */
import { UFS } from '../../data/ufs';

export const FIXTURE_LULA = {
  n: '13',
  sqcand: '280002542548',
  nmu: 'LULA',
  nm: 'LUIZ INÁCIO LULA DA SILVA',
  sg: 'PT',
};
export const FIXTURE_FLAVIO = {
  n: '22',
  sqcand: '280002551544',
  nmu: 'FLAVIO BOLSONARO',
  nm: 'FLAVIO NANTES BOLSONARO',
  sg: 'PL',
};
export const FIXTURE_OTHER = {
  n: '99',
  sqcand: '999999999999',
  nmu: 'CANDIDATO FICTÍCIO',
  nm: 'CANDIDATO FICTÍCIO DE TESTE',
  sg: 'XX',
};

export interface FixtureCandidate {
  n: string;
  sqcand: string;
  nmu: string;
  nm: string;
  sg: string;
  vap: number;
}

export interface ResultadoFixtureOptions {
  ele?: string;
  t?: string;
  tpabr?: 'br' | 'uf' | 'mu';
  cdabr?: string;
  idg?: number;
  candidates?: FixtureCandidate[];
  brancos?: number;
  nulos?: number;
  ts?: number;
  st?: number;
  tf?: 's' | 'n';
  dt?: string;
  ht?: string;
}

export function cand(base: Omit<FixtureCandidate, 'vap'>, vap: number): FixtureCandidate {
  return { ...base, vap };
}

export function makeResultado(o: ResultadoFixtureOptions = {}) {
  const candidates = o.candidates ?? [cand(FIXTURE_LULA, 600), cand(FIXTURE_FLAVIO, 400)];
  const vv = candidates.reduce((a, c) => a + c.vap, 0);
  const vb = o.brancos ?? 30;
  const tvn = o.nulos ?? 20;
  const ts = o.ts ?? 100;
  const st = o.st ?? 50;
  return {
    ele: o.ele ?? '6257',
    t: o.t ?? '1',
    f: 'o',
    sup: 'n',
    tpabr: o.tpabr ?? 'br',
    cdabr: o.cdabr ?? 'br',
    dg: '04/10/2026',
    hg: '20:00:00',
    idg: String(o.idg ?? 1000),
    dt: o.dt ?? (st > 0 ? '04/10/2026' : ''),
    ht: o.ht ?? (st > 0 ? '19:59:00' : ''),
    dv: 's',
    tf: o.tf ?? 'n',
    and: st === 0 ? 'n' : o.tf === 's' ? 'f' : 'p',
    carg: [
      {
        cd: '1',
        nmn: 'Presidente',
        agr: candidates.map((c, i) => ({
          n: `28000180000${i}`,
          nm: `AGREMIAÇÃO FICTÍCIA ${i}`,
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
                  vap: String(c.vap),
                  pvap: vv ? ((c.vap / vv) * 100).toFixed(2).replace('.', ',') : '0,00',
                  pvapn: vv ? ((c.vap / vv) * 100).toFixed(9).replace('.', ',') : '0',
                  e: 'n',
                  st: '',
                },
              ],
            },
          ],
        })),
      },
    ],
    s: {
      ts: String(ts),
      st: String(st),
      pst: ((st / ts) * 100).toFixed(2).replace('.', ','),
      snt: String(ts - st),
    },
    e: { te: '10000', c: String(vv + vb + tvn), a: '0' },
    v: {
      tv: String(vv + vb + tvn),
      vv: String(vv),
      vnom: String(vv),
      vb: String(vb),
      tvn: String(tvn),
      vn: String(tvn),
      vnt: '0',
      van: '0',
      vansj: '0',
    },
  };
}

export function makeAbrangencia(
  o: {
    ele?: string;
    t?: string;
    idg?: number;
    stamps?: Record<string, { st: number; ts?: number; ht?: string }>;
  } = {},
) {
  const codes = [...UFS.map((u) => u.tse), 'zz'];
  return {
    ele: o.ele ?? '6257',
    t: o.t ?? '1',
    dg: '04/10/2026',
    hg: '20:00:00',
    idg: String(o.idg ?? 1000),
    abr: codes.map((cd) => {
      const s = o.stamps?.[cd] ?? { st: 50 };
      const ts = s.ts ?? 100;
      return {
        and: s.st === 0 ? 'n' : 'p',
        tpabr: 'uf',
        cdabr: cd,
        dt: '04/10/2026',
        ht: s.ht ?? '19:59:00',
        s: { ts: String(ts), st: String(s.st) },
      };
    }),
  };
}

type Handler = (url: string) => unknown | Response | Promise<unknown | Response>;

/** fetch simulado: roteia por URL e registra as chamadas. */
export function mockFetch(handler: Handler) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const out = await handler(url);
    if (out instanceof Response) return out;
    if (out === undefined) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

/** Roteador padrão: nacional + andamento + todas as UFs com resultados fictícios. */
export function defaultRouter(opts: {
  ele?: string;
  t?: string;
  perUf?: (code: string) => ResultadoFixtureOptions | Response | undefined;
  national?: ResultadoFixtureOptions;
  ab?: Parameters<typeof makeAbrangencia>[0] | Response;
}): Handler {
  const ele = opts.ele ?? '6257';
  const t = opts.t ?? '1';
  return (url) => {
    if (url.endsWith(`br-e00${ele}-ab.json`)) {
      return opts.ab instanceof Response ? opts.ab : makeAbrangencia({ ele, t, ...opts.ab });
    }
    if (url.endsWith(`br-c0001-e00${ele}-u.json`)) {
      return makeResultado({ ele, t, tpabr: 'br', cdabr: 'br', ...opts.national });
    }
    const m = /dados\/([a-z]{2})\/([a-z]{2})-c0001-e00\d+-u\.json$/.exec(url);
    if (m && m[1] === m[2]) {
      const custom = opts.perUf?.(m[1]!);
      if (custom instanceof Response) return custom;
      return makeResultado({ ele, t, tpabr: 'uf', cdabr: m[1], ...custom });
    }
    return undefined;
  };
}
