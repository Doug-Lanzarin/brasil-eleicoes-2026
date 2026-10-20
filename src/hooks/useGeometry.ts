import { useQuery } from '@tanstack/react-query';
import { loadUfGeometry } from '../data/geo';

export function useUfGeometry() {
  return useQuery({
    queryKey: ['geometry', 'ibge-uf'],
    queryFn: loadUfGeometry,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
}
