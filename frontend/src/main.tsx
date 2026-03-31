import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { DashboardAuthProvider } from './hooks/use-dashboard-auth';
import { ChatWsProvider } from './hooks/use-chat-ws';
import { queryClient } from './lib/query-client';
import './styles/globals.css';

// Lazy-load devtools so Vite excludes the entire module from the production bundle
const LazyReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : () => null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DashboardAuthProvider>
          <ChatWsProvider>
            <App />
          </ChatWsProvider>
        </DashboardAuthProvider>
      </BrowserRouter>
      {import.meta.env.DEV && <LazyReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>,
);
