/**
 * Pré-carregamento dos resultados municipais de todas as UFs, em segundo plano, para que
 * abrir um estado seja instantâneo (os dados vão para o cache do aparelho — IndexedDB — e
 * para a memória do TanStack Query).
 *
 * Cuidados:
 *  - usa a prioridade "background" do limitador: só acessa o TSE quando o painel e o estado
 *    aberto não estão pedindo nada, com no máximo 2 requisições simultâneas;
 *  - aproveita o cache: a cada passada só baixa municípios cujo andamento mudou; UFs com
 *    apuração finalizada e cache completo são puladas;
 *  - intervalo mínimo entre passadas (padrão 5 min);
 *  - pode ser pausado (aba oculta, sem conexão, economia de dados, preferência do usuário).
 */
import { UFS } from '../data/ufs';
import type { ElectionConfig, RoundConfig } from '../types/election';
import { loadMunicipalCache, saveMunicipalCache } from './municipalCache';
import type { MunicipioInfo } from './tse/adapter';
import { TseError } from './tse/errors';
import type { RequestLimiter } from './tse/limiter';
import { loadMunicipalSnapshot, type MunicipalSnapshot } from './tse/municipal';

export interface PrefetchStatus {
  state: 'idle' | 'running' | 'paused' | 'waiting' | 'done';
  /** UFs já verificadas nesta passada. */
  done: number;
  total: number;
  current: string | null;
  /** Municípios da UF atual já processados. */
  currentProgress: { done: number; total: number } | null;
  pausedReason?: string;
  /** Momento previsto da próxima passada (ms). */
  nextPassAt?: number;
}

export interface PrefetcherOptions {
  base: string;
  election: ElectionConfig;
  round: RoundConfig;
  maxAgeDays: number;
  /** Lista oficial de municípios por UF (compartilhada com o app). */
  getMunicipios: (signal: AbortSignal) => Promise<Map<string, MunicipioInfo[]>>;
  /** UF aberta pelo usuário (tratada em primeiro plano; o pré-carregamento a pula). */
  getOpenUf: () => string | null;
  /** A apuração da UF está finalizada? (para pular UFs completas). */
  isUfFinalized: (uf: string) => boolean;
  /** Entrega o resultado para a memória do app (ex.: queryClient.setQueryData). */
  onSnapshot?: (uf: string, snap: MunicipalSnapshot) => void;
  onStatus?: (s: PrefetchStatus) => void;
  /** Ordem das UFs (padrão: menos municípios primeiro). */
  ufs?: string[];
  passIntervalMs?: number;
  fetchImpl?: typeof fetch;
  limiter?: RequestLimiter | null;
}

export class MunicipalPrefetcher {
  private opts: PrefetcherOptions;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pauseReasons = new Set<string>();
  private running = false;
  private stopped = false;
  private status: PrefetchStatus = {
    state: 'idle',
    done: 0,
    total: 0,
    current: null,
    currentProgress: null,
  };

  constructor(opts: PrefetcherOptions) {
    this.opts = opts;
  }

  getStatus() {
    return this.status;
  }

  private setStatus(patch: Partial<PrefetchStatus>) {
    this.status = { ...this.status, ...patch };
    this.opts.onStatus?.(this.status);
  }

  start() {
    this.stopped = false;
    if (!this.running && this.pauseReasons.size === 0) void this.pass();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
  }

  /** Pausa (ex.: "aba oculta"); a passada atual é interrompida e retomada depois. */
  pause(reason: string) {
    this.pauseReasons.add(reason);
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.setStatus({ state: 'paused', pausedReason: reason });
  }

  resume(reason: string) {
    this.pauseReasons.delete(reason);
    if (this.pauseReasons.size === 0 && !this.stopped && !this.running) {
      this.setStatus({ state: 'idle', pausedReason: undefined });
      void this.pass();
    }
  }

  private async pass() {
    if (this.running || this.stopped || this.pauseReasons.size) return;
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    const { election, round } = this.opts;
    try {
      const muns = await this.opts.getMunicipios(controller.signal);
      const order =
        this.opts.ufs ??
        UFS.map((u) => u.tse).sort(
          (a, b) => (muns.get(a)?.length ?? 0) - (muns.get(b)?.length ?? 0),
        );
      this.setStatus({ state: 'running', done: 0, total: order.length, current: null });
      for (const [i, uf] of order.entries()) {
        if (controller.signal.aborted) break;
        const list = muns.get(uf);
        if (!list?.length || uf === this.opts.getOpenUf()) {
          this.setStatus({ done: i + 1 });
          continue;
        }
        const cached = await loadMunicipalCache(
          { electionId: election.id, codigoEleicao: round.codigoEleicao, turno: round.turno, uf },
          this.opts.maxAgeDays,
        );
        const complete =
          cached &&
          list.every(
            (m) =>
              cached.snapshot.entries[m.codigo]?.result && cached.snapshot.entries[m.codigo]?.stamp,
          );
        if (complete && this.opts.isUfFinalized(uf)) {
          this.opts.onSnapshot?.(uf, cached.snapshot);
          this.setStatus({ done: i + 1 });
          continue;
        }
        this.setStatus({ current: uf, currentProgress: { done: 0, total: list.length } });
        let lastSave = Date.now();
        const previous = cached?.snapshot ?? null;
        const snap = await loadMunicipalSnapshot({
          base: this.opts.base,
          election,
          round,
          uf,
          municipios: list,
          previous,
          signal: controller.signal,
          fetchImpl: this.opts.fetchImpl,
          limiter: this.opts.limiter,
          priority: 'background',
          onProgress: (done, total) => this.setStatus({ currentProgress: { done, total } }),
          onPartial: (entries) => {
            if (Date.now() - lastSave < 5_000) return;
            lastSave = Date.now();
            void saveMunicipalCache(
              {
                ...(previous ?? {
                  electionId: election.id,
                  turno: round.turno,
                  codigoEleicao: round.codigoEleicao,
                  uf,
                  fetchedAt: '',
                }),
                entries: { ...(previous?.entries ?? {}), ...entries },
                fetchedAt: new Date().toISOString(),
              },
              election,
            );
          },
        });
        await saveMunicipalCache(snap, election);
        this.opts.onSnapshot?.(uf, snap);
        this.setStatus({ done: i + 1, current: null, currentProgress: null });
      }
      if (!controller.signal.aborted) {
        const next = Date.now() + (this.opts.passIntervalMs ?? 5 * 60_000);
        this.setStatus({
          state: 'waiting',
          current: null,
          currentProgress: null,
          nextPassAt: next,
        });
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.pass();
        }, next - Date.now());
      }
    } catch (e) {
      if (!(e instanceof TseError && e.kind === 'aborted') && !controller.signal.aborted) {
        // Falha na passada (ex.: lista de municípios indisponível): tenta de novo mais tarde.
        const next = Date.now() + (this.opts.passIntervalMs ?? 5 * 60_000);
        this.setStatus({
          state: 'waiting',
          current: null,
          currentProgress: null,
          nextPassAt: next,
        });
        if (!this.stopped) {
          this.timer = setTimeout(() => {
            this.timer = null;
            void this.pass();
          }, next - Date.now());
        }
      }
    } finally {
      this.running = false;
      if (this.controller === controller) this.controller = null;
      // Interrompida por uma pausa que já terminou: recomeça (o cache evita refazer o feito).
      if (
        controller.signal.aborted &&
        !this.stopped &&
        this.pauseReasons.size === 0 &&
        !this.timer
      ) {
        queueMicrotask(() => void this.pass());
      }
    }
  }
}

/** Política padrão: não pré-carrega com economia de dados, conexão lenta ou rede celular. */
export function connectionAllowsPrefetch(nav: Navigator | undefined = globalThis.navigator): {
  allowed: boolean;
  reason?: string;
} {
  const c = (
    nav as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string; type?: string };
    }
  )?.connection;
  if (!c) return { allowed: true };
  if (c.saveData) return { allowed: false, reason: 'economia de dados ativada' };
  if (c.type === 'cellular') return { allowed: false, reason: 'conexão de dados móveis' };
  if (c.effectiveType && /(^|-)2g$|^3g$/.test(c.effectiveType)) {
    return { allowed: false, reason: 'conexão lenta' };
  }
  return { allowed: true };
}
