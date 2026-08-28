import { useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import viaPesadosLogoLight from '@/assets/via-pesados-icon-color.png';
import viaPesadosLogoDark from '@/assets/via-pesados-icon-white.png';

export default function Login() {
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    if (error) setError(error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        <img
          src={theme === 'dark' ? viaPesadosLogoDark : viaPesadosLogoLight}
          alt="Via Pesados"
          className="h-12 w-auto object-contain select-none"
        />

        <div className="w-full rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/15 text-primary">
              <Lock className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-foreground leading-tight">Painel da empresa</p>
              <p className="text-[11px] text-foreground/40">Acesso restrito à equipe Via Pesados</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              required
              autoComplete="email"
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              required
              autoComplete="current-password"
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-black/[0.1] dark:border-white/[0.1] text-[13px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 transition-colors"
            />

            {error && (
              <p className="text-[12px] text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>
        </div>

        <p className="text-[11px] text-foreground/25">
          Precisa de acesso? Fale com um administrador.
        </p>
      </div>
    </div>
  );
}
