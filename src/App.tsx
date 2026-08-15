import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Suspense, lazy } from 'react';

const Dashboard      = lazy(() => import('@/pages/Dashboard'));
const Clientes       = lazy(() => import('@/pages/Clientes'));
const ClienteDetalhe = lazy(() => import('@/pages/ClienteDetalhe'));
const FunilVendas    = lazy(() => import('@/pages/FunilVendas'));
const Financeiro     = lazy(() => import('@/pages/Financeiro'));
const Pagamentos     = lazy(() => import('@/pages/Pagamentos'));
const Tickets        = lazy(() => import('@/pages/Tickets'));
const Relatorios     = lazy(() => import('@/pages/Relatorios'));
const NovaVenda      = lazy(() => import('@/pages/NovaVenda'));
const NovoCliente    = lazy(() => import('@/pages/NovoCliente'));
const NovoAcesso     = lazy(() => import('@/pages/NovoAcesso'));

const Loader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="h-8 w-8 rounded-full border border-primary/30 border-t-primary animate-spin" />
  </div>
);

function App() {
  return (
    <BrowserRouter basename="/admin">
      <TooltipProvider>
        <Layout>
          <Suspense fallback={<Loader />}>
            <Routes>
              <Route path="/"                index element={<Dashboard />} />
              <Route path="/clientes"        element={<Clientes />} />
              <Route path="/clientes/:id"    element={<ClienteDetalhe />} />
              <Route path="/funil"           element={<FunilVendas />} />
              <Route path="/financeiro"      element={<Financeiro />} />
              <Route path="/pagamentos"      element={<Pagamentos />} />
              <Route path="/tickets"         element={<Tickets />} />
              <Route path="/relatorios"      element={<Relatorios />} />
              <Route path="/nova-venda"      element={<NovaVenda />} />
              <Route path="/novo-cliente"    element={<NovoCliente />} />
              <Route path="/novo-acesso"     element={<NovoAcesso />} />
            </Routes>
          </Suspense>
        </Layout>
      </TooltipProvider>
    </BrowserRouter>
  );
}

export default App;
