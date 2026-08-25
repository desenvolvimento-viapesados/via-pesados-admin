import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Suspense, lazy } from 'react';
import { Layout } from '@/components/Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';

const Home           = lazy(() => import('@/pages/Home'));
const Funil          = lazy(() => import('@/pages/Funil'));
const Reunioes       = lazy(() => import('@/pages/Reunioes'));
const Amostras       = lazy(() => import('@/pages/Amostras'));
const Clientes       = lazy(() => import('@/pages/Clientes'));
const ClienteDetalhe = lazy(() => import('@/pages/ClienteDetalhe'));
const Pagamentos     = lazy(() => import('@/pages/Pagamentos'));
const Financeiro     = lazy(() => import('@/pages/Financeiro'));
const Tickets        = lazy(() => import('@/pages/Tickets'));
const Equipe         = lazy(() => import('@/pages/Equipe'));
const Relatorios     = lazy(() => import('@/pages/Relatorios'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const Loader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
  </div>
);

const Gate = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Layout>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/"              index element={<Home />} />
          <Route path="/funil"         element={<Funil />} />
          <Route path="/reunioes"      element={<Reunioes />} />
          <Route path="/amostras"      element={<Amostras />} />
          <Route path="/clientes"      element={<Clientes />} />
          <Route path="/clientes/:id"  element={<ClienteDetalhe />} />
          <Route path="/pagamentos"    element={<Pagamentos />} />
          <Route path="/financeiro"    element={<Financeiro />} />
          <Route path="/tickets"       element={<Tickets />} />
          <Route path="/equipe"        element={<Equipe />} />
          <Route path="/relatorios"    element={<Relatorios />} />
        </Routes>
      </Suspense>
    </Layout>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <AuthProvider>
          <TooltipProvider>
            <Gate />
            <Toaster theme="dark" position="top-center" richColors />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
