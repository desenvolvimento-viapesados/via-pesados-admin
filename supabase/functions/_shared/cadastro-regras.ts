/**
 * Cadastro novo → ferramenta de marketing da Escala SaaS, a agência contratada pelo dono (pedido de 12/11/2026).
 *
 * Aqui ficam só as regras: o formato que a agência pede, o telefone, quem fica de fora e quando tentar de novo.
 *   - O gatilho do banco põe na fila (cadastro_envios) todo lead novo do funil e todo cliente novo.
 *     Teste grátis é cliente: nasce no mesmo clique do Registrar venda.
 *   - A função cadastro-enviar esvazia a fila.
 *
 * Formato da agência: POST JSON {"name", "email", "phone": "11999998888", "custom_fields": {...}}.
 * "name" é obrigatório (a API responde 400 "name é obrigatório"). Campo sem valor não vai: dado vazio
 * suja a base dela. E-mail nunca é inventado; o lead do funil chega sem e-mail.
 */
import { ehNumeroDeTeste } from './assistente-regras.ts';
import { telefoneLocal } from './telefone.ts';

export type OrigemDoCadastro = 'lead' | 'cliente';

export interface CadastroParaEscala {
  name: string;
  email?: string;
  phone?: string;
  custom_fields: Record<string, string>;
}

/** As colunas lidas de prospects (lead) ou de clients (cliente). Nunca a linha inteira:
 *  clients guarda senha de acesso, CPF do representante e o token do checkout. */
export interface RegistroDoCadastro {
  company_name?: string | null;
  contact_name?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  frente?: string | null;
  stage?: string | null;
  proposal_value?: number | string | null;
  plan?: string | null;
  mrr?: number | string | null;
}

export interface ExtrasDoCadastro {
  /** Nome do canal de aquisição do lead (acquisition_channels.name). */
  canal?: string | null;
  /** Nome do plano do cliente (plans.name pelo plan_id). */
  plano?: string | null;
  /** O cliente nasceu como teste grátis. */
  testeGratis?: boolean;
}

/** A agência pede DDD + número, sem o 55 e com o 9: "11999998888" (ver telefone.ts). */
export const telefoneParaEscala = telefoneLocal;

/** Número de teste do dono (assistente_config.telefones_teste), com ou sem o 9: não vai para marketing. */
export function ehCadastroDeTeste(tel: string | null | undefined, telefonesTeste: readonly string[] | null | undefined): boolean {
  const d = telefoneParaEscala(tel);
  if (d.length !== 10 && d.length !== 11) return false;
  return ehNumeroDeTeste('55' + d, telefonesTeste);
}

/** Valor em reais por extenso ("R$ 1.437,00"); zero, vazio ou inválido não vira campo. */
export function reais(v: number | string | null | undefined): string | null {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n) || n <= 0) return null;
  const [inteiro, centavos] = n.toFixed(2).split('.');
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
}

const ETAPA: Record<string, string> = {
  contato: 'Contato',
  amostra: 'Envio de Amostra',
  oportunidade: 'Oportunidade',
  reuniao: 'Reunião',
  teste: 'Teste grátis',
  vendido: 'Fechado',
  perdido: 'Perdido',
};

const FRENTE: Record<string, string> = { lojista: 'Lojista', transportadora: 'Transportadora' };

const limpo = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim();
  return s ? s : null;
};

/** O assistente usa o telefone como nome da empresa quando não sabe o nome: isso não é empresa. */
const soTelefone = (s: string) => /^[\d\s()+.-]+$/.test(s);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** O corpo que vai para a agência. null quando não há como chamar a pessoa (sem nome nem telefone). */
export function montarCadastro(
  origem: OrigemDoCadastro,
  r: RegistroDoCadastro,
  x: ExtrasDoCadastro = {},
): CadastroParaEscala | null {
  const empresaInformada = limpo(r.company_name);
  const empresa = empresaInformada && !soTelefone(empresaInformada) ? empresaInformada : null;
  const phone = telefoneParaEscala(r.whatsapp);
  const name = limpo(r.contact_name) ?? empresa ?? (phone || null);
  if (!name) return null;
  const email = limpo(r.email)?.toLowerCase() ?? null;

  const custom_fields: Record<string, string> = {};
  const campo = (nome: string, valor: unknown) => {
    const s = limpo(valor);
    if (s) custom_fields[nome] = s;
  };
  campo('Tipo de cadastro', origem === 'lead' ? 'Lead' : x.testeGratis ? 'Teste grátis' : 'Cliente');
  campo('Empresa', empresa);
  campo('Cidade', r.city);
  campo('UF', limpo(r.state)?.toUpperCase());
  campo('Frente', FRENTE[r.frente ?? ''] ?? r.frente);
  if (origem === 'lead') {
    campo('Origem', x.canal);
    campo('Etapa', ETAPA[r.stage ?? ''] ?? r.stage);
    campo('Mensalidade proposta', reais(r.proposal_value));
  } else {
    campo('Mensalidade', reais(r.mrr));
  }
  campo('Plano escolhido', limpo(x.plano) ?? r.plan);

  return {
    name,
    ...(email && EMAIL.test(email) ? { email } : {}),
    ...(phone ? { phone } : {}),
    custom_fields,
  };
}

/* ── Quando tentar de novo ─────────────────────────────────────────────── */

/** Espera depois de cada tentativa que não deu certo (em minutos): cerca de 2 dias no total. */
export const ESPERA_ENTRE_TENTATIVAS_MIN = [1, 5, 15, 60, 180, 360, 720, 1440] as const;

export type DesfechoDoEnvio = 'enviado' | 'tentar' | 'falhou' | 'configuracao';

/**
 * O que fazer com a resposta da agência. null = não houve resposta (rede ou tempo esgotado).
 *   - 2xx: chegou.
 *   - 408, 429 e 5xx: "agora não" ou agência fora do ar → tenta de novo.
 *   - 401, 403, 404: o endereço ou o token estão errados (a API responde 401 a token inválido).
 *     Não é culpa do cadastro: ele fica na fila, a rodada para, e tudo sai quando corrigirem.
 *   - Outro 4xx (400 "name é obrigatório", 422): este cadastro foi recusado; repetir não resolve.
 */
export function desfechoDaResposta(status: number | null): DesfechoDoEnvio {
  if (status === null) return 'tentar';
  if (status >= 200 && status < 300) return 'enviado';
  if (status === 408 || status === 429 || status >= 500) return 'tentar';
  if (status === 401 || status === 403 || status === 404) return 'configuracao';
  return 'falhou';
}

/** Quando tentar de novo depois de `feitas` tentativas (1, 2, …). null = desistir. */
export function proximaTentativa(feitas: number, agora: Date): Date | null {
  const minutos = ESPERA_ENTRE_TENTATIVAS_MIN[feitas - 1];
  return minutos === undefined ? null : new Date(agora.getTime() + minutos * 60_000);
}
