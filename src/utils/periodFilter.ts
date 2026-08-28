/**
 * Returns { start, end } date strings (YYYY-MM-DD) for a given period key.
 */
export function getDateRangeForPeriod(periodo: string): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const fmt = (date: Date) => date.toISOString().split('T')[0];

  if (periodo.startsWith('custom:')) {
    const parts = periodo.split(':');
    return { start: parts[1], end: parts[2] };
  }

  switch (periodo) {
    case 'semana': {
      const dayOfWeek = now.getDay(); // 0=Sun
      const startDate = new Date(y, m, d - dayOfWeek);
      const endDate = new Date(y, m, d - dayOfWeek + 6);
      return { start: fmt(startDate), end: fmt(endDate) };
    }
    case 'mes': {
      const startDate = new Date(y, m, 1);
      const endDate = new Date(y, m + 1, 0);
      return { start: fmt(startDate), end: fmt(endDate) };
    }
    case 'mes_passado': {
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0);
      return { start: fmt(startDate), end: fmt(endDate) };
    }
    case 'trimestre': {
      const qStart = Math.floor(m / 3) * 3;
      const startDate = new Date(y, qStart, 1);
      const endDate = new Date(y, qStart + 3, 0);
      return { start: fmt(startDate), end: fmt(endDate) };
    }
    case 'ano': {
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case 'todo': {
      return { start: '2000-01-01', end: '2099-12-31' };
    }
    default: {
      // fallback to current month
      const startDate = new Date(y, m, 1);
      const endDate = new Date(y, m + 1, 0);
      return { start: fmt(startDate), end: fmt(endDate) };
    }
  }
}