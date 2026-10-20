import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createQueryClient } from '../queryClient';
import { ElectionStore } from '../services/electionStore';
import type { ElectionConfig, RoundConfig } from '../types/election';
import {
  cand,
  defaultRouter,
  FIXTURE_FLAVIO,
  FIXTURE_LULA,
  makeResultado,
  mockFetch,
} from './fixtures/tse';

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query);
    const matches = m ? width >= Number(m[1]) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
}

/** Turno 1: Lula à frente em todas as UFs, exceto SP (Flávio) e MG (empate). Turno 2: não iniciado. */
const turno1 = defaultRouter({
  national: { candidates: [cand(FIXTURE_LULA, 5000), cand(FIXTURE_FLAVIO, 4000)], st: 90 },
  perUf: (c) =>
    c === 'sp'
      ? { candidates: [cand(FIXTURE_LULA, 300), cand(FIXTURE_FLAVIO, 700)] }
      : c === 'mg'
        ? { candidates: [cand(FIXTURE_LULA, 500), cand(FIXTURE_FLAVIO, 500)] }
        : undefined,
});
const turno2 = defaultRouter({
  ele: '6258',
  t: '2',
  ab: { ele: '6258', t: '2', stamps: {} },
  national: {
    candidates: [cand(FIXTURE_LULA, 0), cand(FIXTURE_FLAVIO, 0)],
    st: 0,
    brancos: 0,
    nulos: 0,
  },
  perUf: () => ({
    candidates: [cand(FIXTURE_LULA, 0), cand(FIXTURE_FLAVIO, 0)],
    st: 0,
    brancos: 0,
    nulos: 0,
  }),
});

function setup() {
  const { impl, calls } = mockFetch((url) => (url.includes('/6258/') ? turno2(url) : turno1(url)));
  const stores: ElectionStore[] = [];
  const storeFactory = (election: ElectionConfig, round: RoundConfig) => {
    const s = new ElectionStore({
      base: 'https://fixture.test/oficial',
      election,
      round,
      refreshSeconds: 30,
      persistedMaxAgeDays: 7,
      fetchImpl: impl,
      persist: false,
    });
    stores.push(s);
    return s;
  };
  const user = userEvent.setup();
  render(<App storeFactory={storeFactory} queryClient={createQueryClient()} />);
  return { calls, stores, user };
}

async function mapPath(uf: string) {
  const map = await screen.findByTestId('brazil-map');
  await waitFor(() => expect(map.querySelectorAll('path[data-uf]').length).toBe(27));
  return map.querySelector(`path[data-uf="${uf}"]`) as SVGPathElement;
}

describe('Dashboard', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?turno=1');
  });

  describe('desktop (1440 px)', () => {
    beforeEach(() => setViewport(1440));

    it('renderiza o mapa com as 27 UFs coloridas pelos votos', async () => {
      setup();
      await waitFor(async () => expect((await mapPath('SP')).dataset.fill).toBe('flavio'));
      expect((await mapPath('BA')).dataset.fill).toBe('lula');
      expect((await mapPath('MG')).dataset.fill).toBe('tie');
      const national = await screen.findByTestId('national-panel');
      expect(within(national).getByText(/à frente entre os dois/)).toBeInTheDocument();
      expect(within(national).getByText('Apuração parcial')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar').dataset.freshness).toBe('fresh');
    });

    it('abre o painel lateral ao clicar num estado', async () => {
      const { user } = setup();
      await waitFor(async () => expect((await mapPath('SP')).dataset.fill).toBe('flavio'));
      await user.click(await mapPath('SP'));
      const detail = await screen.findByTestId('state-detail');
      expect(within(detail).getByRole('heading', { name: /São Paulo/ })).toBeInTheDocument();
      expect(within(detail).getAllByText('70,00%').length).toBeGreaterThan(0);
      expect(window.location.search).toContain('uf=SP');
      expect(screen.queryByTestId('bottom-sheet')).toBeNull();
    });

    it('permite selecionar estados pelo teclado', async () => {
      const { user } = setup();
      const ba = await mapPath('BA');
      ba.focus();
      await user.keyboard('{Enter}');
      expect(await screen.findByRole('heading', { name: /Bahia/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Fechar detalhes/ }));
      expect(screen.queryByTestId('state-detail')).toBeNull();
    });

    it('troca do 1º para o 2º turno descartando os dados do turno anterior', async () => {
      const { user, stores, calls } = setup();
      await waitFor(async () => expect((await mapPath('SP')).dataset.fill).toBe('flavio'));
      const radio = screen.getAllByRole('radio', { name: '2º turno' })[0]!;
      await user.click(radio);
      await waitFor(async () => expect((await mapPath('SP')).dataset.fill).toBe('no-data'));
      expect(window.location.search).toContain('turno=2');
      expect(calls.some((c) => c.includes('/6258/dados/br/br-c0001-e006258-u.json'))).toBe(true);
      const current = stores[stores.length - 1]!;
      expect(current.getState().snapshot?.codigoEleicao).toBe('6258');
      expect(
        within(await screen.findByTestId('national-panel')).getByText('Apuração não iniciada'),
      ).toBeInTheDocument();
      // Store do 1º turno foi parado (não agenda novas consultas).
      expect(
        stores
          .filter((s) => s.opts.round.turno === 1)
          .every((s) => s.getState().poller.nextRunAt === null),
      ).toBe(true);
    });

    it('seleciona estado pela lista acessível', async () => {
      const { user } = setup();
      await mapPath('SP');
      await user.click(
        await screen.findByRole('button', { name: /Rio de Janeiro: Lula à frente/ }),
      );
      expect(await screen.findByRole('heading', { name: /Rio de Janeiro/ })).toBeInTheDocument();
    });
  });

  describe('mobile (390 px)', () => {
    beforeEach(() => setViewport(390));

    it('usa painel inferior e controles de turno na barra inferior', async () => {
      const { user } = setup();
      await waitFor(async () => expect((await mapPath('SP')).dataset.fill).toBe('flavio'));
      const nav = screen.getByRole('navigation', { name: 'Controles da eleição' });
      expect(within(nav).getByRole('radio', { name: '1º turno' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await user.click(await mapPath('PE'));
      const sheet = await screen.findByTestId('bottom-sheet');
      expect(sheet.dataset.expanded).toBe('false');
      expect(within(sheet).getByRole('heading', { name: /Pernambuco/ })).toBeInTheDocument();
      await user.click(within(sheet).getByRole('button', { name: 'Expandir painel' }));
      expect(sheet.dataset.expanded).toBe('true');
      await user.click(within(sheet).getByRole('button', { name: /Fechar detalhes/ }));
      expect(screen.queryByTestId('bottom-sheet')).toBeNull();
    });

    it('mostra os indicadores nacionais compactos', async () => {
      setup();
      const kpi = await screen.findByTestId('kpi-strip');
      await waitFor(() => expect(within(kpi).getByText('55,56%')).toBeInTheDocument());
      expect(within(kpi).getByText('44,44%')).toBeInTheDocument();
    });
  });

  describe('estado aberto por municípios', () => {
    // Malha real do IBGE para o Acre + lista de municípios FICTÍCIA ligada aos códigos IBGE.
    const acGeo = readFileSync(resolve(__dirname, '../../public/geo/mun/ac.json'), 'utf8');
    const acCodes: string[] = JSON.parse(acGeo).features.map(
      (f: { properties: { codarea: string } }) => f.properties.codarea,
    );
    const muns = acCodes.map((cdi, i) => ({
      cd: String(10000 + i),
      cdi,
      nm: `MUNICÍPIO FICTÍCIO ${i}`,
      c: i === 0 ? 's' : 'n',
    }));

    /** Arquivo de zonas FICTÍCIO para o município 10000: zona 4 com Lula, zona 9 com Flávio. */
    let zonasFixture: unknown = {
      versao: 1,
      fonte: 'FIXTURE DE TESTE',
      eleicao: '6257',
      turno: 1,
      pleito: '3220',
      uf: 'ac',
      cargo: '1',
      geradoEm: new Date().toISOString(),
      candidatosValidos: ['13', '22'],
      municipios: {
        '10000': {
          secoes: 10,
          secoesProcessadas: 8,
          zonas: {
            '0004': {
              secoes: 4,
              secoesProcessadas: 4,
              votos: { '13': 70, '22': 30 },
              validos: 100,
              brancos: 2,
              nulos: 3,
              comparecimento: 105,
            },
            '0009': {
              secoes: 6,
              secoesProcessadas: 4,
              votos: { '13': 20, '22': 60 },
              validos: 80,
              brancos: 1,
              nulos: 1,
              comparecimento: 82,
            },
          },
        },
      },
    };

    beforeEach(() => {
      setViewport(1440);
      const global = mockFetch((url) => {
        if (url.endsWith('/geo/mun/ac.json')) return JSON.parse(acGeo);
        if (url.endsWith('/config/mun-e006257-cm.json')) {
          return {
            dg: '01/10/2026',
            hg: '10:00:00',
            idg: '1',
            abr: [{ cd: 'ac', ds: 'ACRE', mu: muns }],
          };
        }
        if (url.endsWith('/dados/ac/ac-e006257-ab.json')) return undefined; // sem andamento: consulta todos
        if (url.endsWith('/zonas/6257/ac.json')) return zonasFixture;
        const m = /ac(\d{5})-c0001-e006257-u\.json$/.exec(url);
        if (m) {
          const flavioLeads = m[1] === '10000';
          return makeResultado({
            tpabr: 'mu',
            cdabr: m[1],
            candidates: flavioLeads
              ? [cand(FIXTURE_LULA, 10), cand(FIXTURE_FLAVIO, 90)]
              : [cand(FIXTURE_LULA, 60), cand(FIXTURE_FLAVIO, 40)],
          });
        }
        return undefined;
      });
      vi.stubGlobal('fetch', global.impl);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('ao clicar no estado mostra só o estado, dividido e colorido por município', async () => {
      const { user } = setup();
      await user.click(await mapPath('AC'));
      const stateMap = await screen.findByTestId('state-map');
      expect(screen.queryByTestId('brazil-map')).toBeNull();
      await waitFor(() =>
        expect(stateMap.querySelectorAll('path[data-mun]').length).toBe(acCodes.length),
      );
      await waitFor(
        () =>
          expect(stateMap.querySelector('path[data-mun="10000"]')!.getAttribute('data-fill')).toBe(
            'flavio',
          ),
        // O limitador espaça as requisições municipais (150 ms): 22 municípios ≈ 3,5 s.
        { timeout: 10_000 },
      );
      expect(stateMap.querySelector('path[data-mun="10001"]')!.getAttribute('data-fill')).toBe(
        'lula',
      );
      expect(screen.getByText('Lula · AC')).toBeInTheDocument();

      // Clicar num município abre o detalhe dele.
      await user.click(stateMap.querySelector('path[data-mun="10000"]')!);
      const munDetail = await screen.findByTestId('municipality-detail');
      expect(within(munDetail).getByText(/Município Fictício 0/)).toBeInTheDocument();
      expect(within(munDetail).getAllByText('90,00%').length).toBeGreaterThan(0);
      expect(window.location.search).toContain('mun=10000');

      // A cidade aberta: mapa aproximado nela e resultado separado por zonas.
      await waitFor(() =>
        expect(stateMap.querySelector('svg > g')!.getAttribute('transform')).not.toBe(
          'translate(0,0) scale(1)',
        ),
      );
      const zonas = await within(munDetail).findByTestId('zone-breakdown');
      expect(within(zonas).getByText('Zona 4')).toBeInTheDocument();
      expect(within(zonas).getByText('Zona 9')).toBeInTheDocument();
      expect(zonas.querySelector('[data-zona="0004"]')!.getAttribute('data-leader')).toBe('lula');
      expect(zonas.querySelector('[data-zona="0009"]')!.getAttribute('data-leader')).toBe('flavio');
      expect(within(zonas).getByText(/8 de 10 seções com boletim processado/)).toBeInTheDocument();

      // A lista de municípios também seleciona.
      await user.click(screen.getByRole('button', { name: /Município Fictício 1: Lula à frente/ }));
      expect(window.location.search).toContain('mun=10001');

      // Voltar ao Brasil.
      await user.click(screen.getByRole('button', { name: '← Brasil' }));
      expect(await screen.findByTestId('brazil-map')).toBeInTheDocument();
      expect(window.location.search).not.toContain('mun=');
    }, 20_000);

    it('informa quando ainda não há resultados por zona', async () => {
      zonasFixture = undefined; // 404
      const { user } = setup();
      await user.click(await mapPath('AC'));
      const stateMap = await screen.findByTestId('state-map');
      await waitFor(() => expect(stateMap.querySelector('path[data-mun="10001"]')).not.toBeNull());
      await user.click(stateMap.querySelector('path[data-mun="10001"]')!);
      expect(
        await screen.findByText(/Resultados por zona ainda não disponíveis/),
      ).toBeInTheDocument();
    }, 20_000);
  });
});
