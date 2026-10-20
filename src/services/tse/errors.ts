export type TseErrorKind =
  | 'not-published'
  | 'http'
  | 'network'
  | 'timeout'
  | 'invalid-json'
  | 'invalid-data'
  | 'wrong-election'
  | 'aborted';

export class TseError extends Error {
  readonly kind: TseErrorKind;
  readonly status?: number;
  readonly url?: string;

  constructor(kind: TseErrorKind, message: string, opts: { status?: number; url?: string } = {}) {
    super(message);
    this.name = 'TseError';
    this.kind = kind;
    this.status = opts.status;
    this.url = opts.url;
  }
}

export function isTseError(e: unknown, kind?: TseErrorKind): e is TseError {
  return e instanceof TseError && (kind === undefined || e.kind === kind);
}

export function describeError(e: unknown): string {
  if (e instanceof TseError) {
    switch (e.kind) {
      case 'not-published':
        return 'Arquivo ainda não publicado pelo TSE.';
      case 'http':
        return `O TSE respondeu com erro HTTP ${e.status ?? ''}.`.trim();
      case 'network':
        return 'Falha de rede ao consultar o TSE.';
      case 'timeout':
        return 'A consulta ao TSE excedeu o tempo limite.';
      case 'invalid-json':
        return 'Resposta do TSE não é um JSON válido.';
      case 'wrong-election':
      case 'invalid-data':
        return e.message;
      case 'aborted':
        return 'Consulta cancelada.';
    }
  }
  return e instanceof Error ? e.message : 'Erro desconhecido.';
}
