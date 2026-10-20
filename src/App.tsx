import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './queryClient';
import { useState } from 'react';
import { Dashboard, type DashboardProps } from './pages/Dashboard';

export default function App(props: DashboardProps & { queryClient?: QueryClient }) {
  const [client] = useState(() => props.queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <Dashboard storeFactory={props.storeFactory} />
    </QueryClientProvider>
  );
}
