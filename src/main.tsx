import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/ui';
import App from './App';
import './styles/app.css';

// Tras publicar una versión nueva, los archivos de la versión anterior ya no existen: si una
// pestaña vieja intenta cargar uno (p. ej. el generador de PDF), recarga la página una vez.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('aforo-reloaded') === location.pathname) return;
    sessionStorage.setItem('aforo-reloaded', location.pathname);
  } catch {
    /* sin almacenamiento: recargamos de todos modos */
  }
  e.preventDefault();
  location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
