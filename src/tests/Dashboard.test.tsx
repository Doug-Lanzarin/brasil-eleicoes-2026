import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { createQueryClient } from '../queryClient';
import { ElectionStore } from '../services/electionStore';
import type { ElectionConfig, RoundConfig } from '../types/election';
import { cand, defaultRouter, FIXTURE_FLAVIO, FIXTURE_LULA, mockFetch } from './fixtures/tse';

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
});
