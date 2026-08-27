import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Suspense, lazy } from 'react';
import { Layout } from '@/components/Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';

const Home           = lazy(() => import('@/pages/Home'));
const Crm            = lazy(() => import('@/pages/Crm'));
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
  const { user, member, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  // Autenticado no projeto não é o mesmo que ser da equipe: o cadastro é
  // aberto, então quem se registrar sozinho chega até aqui sem convite.
  // Membro desativado cai no mesmo lugar — é isso que faz o botão
  // "Desativar" da Equipe valer alguma coisa.
  if (!member || !member.is_active) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-[15px] font-semibold text-foreground">Acesso não autorizado</p>
          <p className="text-[12.5px] text-foreground/45 mt-2 leading-relaxed">
            Esta conta não pertence à equipe Via Pesados, ou o acesso dela foi desativado.
            Fale com um administrador.
          </p>
          <button
            onClick={signOut}
            className="mt-5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-all"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/"              index element={<Home />} />
          <Route path="/crm"           element={<Crm />} />
          <Route path="/clientes"      element={<Clientes />} />
          <Route path="/clientes/:id"  element={<ClienteDetalhe />} />
          <Route path="/pagamentos"    element={<Pagamentos />} />
          <Route path="/financeiro"    element={<Financeiro />} />
          <Route path="/tickets"       element={<Tickets />} />
          <Route path="/equipe"        element={<Equipe />} />
          <Route path="/relatorios"    element={<Relatorios />} />

          {/* rotas antigas — agora vivem dentro do CRM */}
          <Route path="/funil"     element={<Navigate to="/crm?tab=funil" replace />} />
          <Route path="/reunioes"  element={<Navigate to="/crm?tab=reunioes" replace />} />
          <Route path="/amostras"  element={<Navigate to="/crm?tab=amostras" replace />} />
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
