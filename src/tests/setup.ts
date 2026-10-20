import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach } from 'vitest';
import { resetMunicipalCacheConnection } from '../services/municipalCache';

/** Testes nunca acessam a rede: qualquer fetch não simulado responde 404. */
const offlineFetch = (async () =>
  new Response('sem rede nos testes', { status: 404 })) as typeof fetch;

beforeEach(() => {
  globalThis.fetch = offlineFetch;
  // Banco IndexedDB novo e vazio a cada teste.
  globalThis.indexedDB = new IDBFactory();
  resetMunicipalCacheConnection();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
