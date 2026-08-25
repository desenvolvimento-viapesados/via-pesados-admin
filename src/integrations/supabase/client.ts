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

// As amostras vivem num host próprio, fora da raiz reservada ao marketplace.
// A empresa vem do caminho — o Vercel só emite certificado curinga se o domínio
// usar os nameservers dele, o que tiraria o DNS (e o e-mail) do Cloudflare.
export const DEMO_BASE_URL = 'https://amostra.viapesados.com.br';
// abre direto no sistema — a amostra não passa por tela de login
export const demoUrl = (slug: string) => `${DEMO_BASE_URL}/${slug}/sistema`;
