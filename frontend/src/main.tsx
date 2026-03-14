import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { DashboardAuthProvider } from './hooks/use-dashboard-auth';
import { WsStatusProvider } from './hooks/use-ws-status';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DashboardAuthProvider>
        <WsStatusProvider>
          <App />
        </WsStatusProvider>
      </DashboardAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
