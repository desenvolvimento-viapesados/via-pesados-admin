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
export const LOJISTA_APP_URL = 'https://viapesados.com.br';
