import { ref } from 'vue';
import { api } from '../api/client';

export interface Airport {
  iata: string;
  city: string;
  name: string;
}

const airports = ref<Airport[]>([]);
let loading: Promise<void> | null = null;

/** The airport list rarely changes, so it is fetched once per session. */
export function useAirports() {
  loading ??= api<Airport[]>('/airports')
    .then((list) => {
      airports.value = list;
    })
    .catch(() => {
      loading = null;
    });
  const label = (iata: string) => {
    const a = airports.value.find((x) => x.iata === iata);
    return a ? `${a.city} (${a.iata})` : iata;
  };
  return { airports, label };
}
