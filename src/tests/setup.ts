import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach } from 'vitest';
import { resetMunicipalCacheConnection } from '../services/municipalCache';

beforeEach(() => {
  // Banco IndexedDB novo e vazio a cada teste.
  globalThis.indexedDB = new IDBFactory();
  resetMunicipalCacheConnection();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
