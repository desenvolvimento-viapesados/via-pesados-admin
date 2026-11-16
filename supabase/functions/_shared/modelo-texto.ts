/* O texto de um modelo como a pessoa recebeu. Fica fora do wa.ts porque é puro (sem Deno):
   a tela e os testes também importam. */
import { MODELOS } from './modelos.ts';
import { textoDoModelo } from './prospeccao-regras.ts';

type ParamsDoTexto = {
  header?: string[]; body?: string[];
  documento?: { filename: string }; video?: unknown; urlSuffix?: string;
};

/** O texto do modelo como a pessoa recebeu: cabeçalho, corpo e botões. */
export function textoDoModeloEnviado(template: string, params: ParamsDoTexto | undefined): string {
  const comps = MODELOS.find((m) => m.name === template)?.components ?? [];
  const partes: string[] = [];
  const header = comps.find((c) => c.type === 'HEADER');
  if (params?.video) partes.push('[vídeo]');
  else if (params?.documento) partes.push(`[documento: ${params.documento.filename}]`);
  else if (header?.text) partes.push(textoDoModelo(String(header.text), params?.header ?? []));
  const corpo = comps.find((c) => c.type === 'BODY');
  partes.push(corpo?.text ? textoDoModelo(String(corpo.text), params?.body ?? []) : `[modelo ${template}]`);
  const botoes = (comps.find((c) => c.type === 'BUTTONS')?.buttons ?? []) as Array<{ text?: string }>;
  const rotulos = botoes.map((b) => b.text).filter(Boolean);
  if (rotulos.length) partes.push(rotulos.map((t) => `[${t}]`).join(' '));
  return partes.filter(Boolean).join('\n\n');
}

