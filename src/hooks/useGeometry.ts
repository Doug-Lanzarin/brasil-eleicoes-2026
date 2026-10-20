import { useQuery } from '@tanstack/react-query';
import { loadMunicipalGeometry, loadUfGeometry } from '../data/geo';

export function useUfGeometry() {
  return useQuery({
    queryKey: ['geometry', 'ibge-uf'],
    queryFn: loadUfGeometry,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}

export function useMunicipalGeometry(ufTse: string | null) {
  return useQuery({
    queryKey: ['geometry', 'ibge-mun', ufTse],
    queryFn: () => loadMunicipalGeometry(ufTse!),
    enabled: !!ufTse,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}
