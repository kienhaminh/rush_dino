import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { DashboardAuthProvider } from './hooks/use-dashboard-auth';
import { ChatWsProvider } from './hooks/use-chat-ws';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DashboardAuthProvider>
        <ChatWsProvider>
          <App />
        </ChatWsProvider>
      </DashboardAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
