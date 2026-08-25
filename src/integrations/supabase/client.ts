import { createClient } from '@supabase/supabase-js';

// Projeto Supabase: viapesados-admin (painel interno da empresa)
const SUPABASE_URL = 'https://ktjvyysqhsyvjmhumjly.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0anZ5eXNxaHN5dmptaHVtamx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzE0ODgsImV4cCI6MjEwMjMwNzQ4OH0.farEdQD8-IrBw40O2-WOedNervQ-oQdlgCr1131MtTo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Sistema lojista (produto vendido) — usado para provisionar amostras e sistemas de clientes
export const LOJISTA_FUNCTIONS_URL = 'https://ljjkerbczuwmxdbnxfes.supabase.co/functions/v1';

// viapesados.com.br é o domínio-matriz: a raiz fica reservada para o marketplace
// e os produtos vivem em prefixos de caminho.
export const LOJISTA_APP_URL = 'https://viapesados.com.br/lojista';

// Cada amostra ganha o próprio host, fora do domínio do marketplace.
// Depende do curinga *.amostra.viapesados.com.br apontar para o projeto do lojista.
export const DEMO_BASE_DOMAIN = 'amostra.viapesados.com.br';
export const demoHost = (slug: string) => `${slug}.${DEMO_BASE_DOMAIN}`;
export const demoUrl  = (slug: string) => `https://${demoHost(slug)}`;
