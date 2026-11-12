/**
 * Telefone brasileiro no formato local: DDD + número, sem o 55, com o 9 do celular ("33988887777").
 *
 * O banco guarda de dois jeitos: com máscara "(33) 98888-7777" (digitado no painel) e com o 55
 * "5533988887777" (cards do assistente, que vêm da conversa do WhatsApp — e o WhatsApp às vezes
 * entrega o celular sem o 9). Celular é o que começa de 6 a 9 depois do DDD; fixo (2 a 5) fica
 * com 8 dígitos. Sem dependências: o painel e as funções usam o mesmo arquivo.
 */
export function telefoneLocal(tel: string | null | undefined): string {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  return d;
}
