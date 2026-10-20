import { TseError } from './errors';

export interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * GET de um arquivo JSON do TSE.
 *
 * `cache: 'no-cache'` faz o navegador revalidar o arquivo com o ETag já armazenado
 * (If-None-Match). Se o arquivo não mudou, o TSE responde 304 e o corpo vem do cache
 * HTTP local — arquivos inalterados não são baixados novamente.
 */
export async function fetchTseJson<T = unknown>(
  url: string,
  { signal, timeoutMs = 20_000, fetchImpl = fetch }: FetchJsonOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) throw new TseError('aborted', 'Consulta cancelada.', { url });
  signal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      signal: controller.signal,
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
  } catch (e) {
    if (timedOut) throw new TseError('timeout', 'Tempo limite excedido.', { url });
    if (signal?.aborted) throw new TseError('aborted', 'Consulta cancelada.', { url });
    throw new TseError('network', e instanceof Error ? e.message : 'Falha de rede', { url });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  // O TSE responde 404 (e, em alguns casos, 403) para arquivos ainda não publicados.
  if (res.status === 404 || res.status === 403) {
    throw new TseError('not-published', 'Arquivo ainda não publicado.', {
      status: res.status,
      url,
    });
  }
  if (!res.ok) {
    throw new TseError('http', `HTTP ${res.status}`, { status: res.status, url });
  }
  try {
    return (await res.json()) as T;
  } catch {
    if (signal?.aborted) throw new TseError('aborted', 'Consulta cancelada.', { url });
    throw new TseError('invalid-json', 'Resposta não é JSON válido.', { url });
  }
}
