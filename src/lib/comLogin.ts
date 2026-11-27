import { supabase } from '@/integrations/supabase/client';

/**
 * Cabeçalhos com o login de quem está no painel.
 *
 * As funções do servidor conferem quem chama (auditoria de 27/11/2026): sem
 * o login, as de diagnóstico e de domínio respondem 401.
 */
export async function comLogin(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { ...extra, Authorization: `Bearer ${session?.access_token ?? ''}` };
}
