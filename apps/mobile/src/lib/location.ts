import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useCallback } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

type Permission = 'granted' | 'denied' | 'undetermined';

// ~100 m precision: plenty for "nearby", and keeps query keys stable as GPS jitters.
const round = (n: number) => Math.round(n * 1000) / 1000;

async function readPosition(): Promise<Coords | null> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return pos ? { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) } : null;
}

/**
 * The device location, if the user has allowed it. Never prompts on its own:
 * call `request()` from a button the user pressed ("Center on me", "Nearest").
 */
export function useLocation() {
  const queryClient = useQueryClient();
  const permission = useQuery({
    queryKey: ['location', 'permission'],
    queryFn: async (): Promise<Permission> => (await Location.getForegroundPermissionsAsync()).status as Permission,
    staleTime: Infinity,
  });
  const position = useQuery({
    queryKey: ['location', 'position'],
    queryFn: readPosition,
    enabled: permission.data === 'granted',
    staleTime: 5 * 60_000,
  });

  /** Asks for permission if needed; resolves to the location, or null if refused. */
  const request = useCallback(async (): Promise<Coords | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    queryClient.setQueryData(['location', 'permission'], status);
    if (status !== 'granted') return null;
    return queryClient.fetchQuery({ queryKey: ['location', 'position'], queryFn: readPosition, staleTime: 5 * 60_000 });
  }, [queryClient]);

  return { coords: position.data ?? null, permission: permission.data ?? 'undetermined', request };
}
