import { useState } from 'react';
import { Check, Copy, ExternalLink, Phone, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ESTACOES, numeroDaEstacao, type ItemDaEsteira, type Tela } from '@/lib/esteira';
import { diaFalado, horaFalada, reuniaoPassou, telefoneFalado } from '@/lib/oportunidades';
import { IconeWhatsApp } from '../wa/IconeWhatsApp';
import { APOIO, CAMPO, Casca, Opcao } from './Casca';

/**
 * A esteira de UMA loja, uma tela de cada vez (dono, 18/11/2026: "uma tela que não tem mais
 * nada: estou na reunião, cliente apareceu, cliente fechou, o link para ele pagar").
 *
 * A tela que aparece sai de onde a loja está (lib/esteira, telaDo). Aqui só o desenho e o que
 * cada botão pede; quem grava é a página (EsteiraDaLoja), então dá para ver com dados de exemplo.
 */

export type AcoesDaLoja = {
  voltar: () => void;
  conversa: () => void;
  marcar: (quando: Date) => Promise<void>;
  montarAmostra: () => void;
  apareceu: () => Promise<void>;
  naoApareceu: () => Promise<void>;
  remarcar: (quando: Date) => Promise<void>;
  fechou: () => void;
  vaiTestar: () => void;
  ficouDePensar: () => Promise<void>;
  naoQuer: (motivo: string) => Promise<void>;
  abrirCobranca: () => void;
  abrirImplantacao: () => void;
  abrirFicha: () => void;
  /** Falou com ela por fora do CRM (ligação, o seu WhatsApp): anota e ela para de esperar você. */
  jaRespondi: () => Promise<void>;
};

export type DadosDaLoja = {
  /** O endereço da amostra da loja, quando já existe. */
  amostraUrl: string | null;
  /** O link de boas-vindas e pagamento do cliente. */
  linkDePagamento: string | null;
};

/** datetime-local quer o horário LOCAL, sem fuso. */
const paraCampo = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const amanhaAs10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return paraCampo(d); };

/* As seis paradas de uma loja (a Prospecção fica antes de ela existir como oportunidade). */
const PARADAS = ESTACOES.filter((e) => e.chave !== 'prospeccao');

export function TelaDaLoja({ item, tela: telaDoEstado, dados, acoes, agora = new Date() }: {
  item: ItemDaEsteira; tela: Tela; dados: DadosDaLoja; acoes: AcoesDaLoja; agora?: Date;
}) {
  /* "Estou na reunião" adianta a tela; "Remarcar" e "Não quer" abrem um passo a mais. */
  const [adiantada, setAdiantada] = useState<Tela | null>(null);
  const [extra, setExtra] = useState<'remarcar' | 'nao_quer' | null>(null);
  const [quando, setQuando] = useState(amanhaAs10);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const tela = adiantada && (telaDoEstado === 'preparar' || telaDoEstado === 'reuniao') ? adiantada : telaDoEstado;
  const o = item.o;
  const r = o?.reuniao ?? null;
  const nome = item.nome;
  const horario = r ? `${diaFalado(r.scheduled_at, agora)} às ${horaFalada(r.scheduled_at)}` : '';
  const indice = Math.max(0, numeroDaEstacao(item.estacao) - 2);
  const parada = PARADAS[indice];
  const base = {
    legenda: [nome, item.lugar].filter(Boolean).join(' · '),
    indice, total: PARADAS.length, etapa: `Etapa ${indice + 1} · ${parada.rotulo}`, onVoltar: acoes.voltar,
  };

  const fazer = async (f: () => Promise<void>) => {
    setOcupado(true);
    try { await f(); } catch (e) { toast.error((e as Error)?.message || 'Não consegui salvar. Tente de novo.'); } finally { setOcupado(false); }
  };
  const dataEscolhida = () => { const d = new Date(quando); return Number.isNaN(d.getTime()) ? null : d; };

  const Contato = () => (
    <div className="flex flex-wrap gap-2">
      {(o?.conversaId || item.telefone) && (
        <button className={APOIO} onClick={acoes.conversa}><IconeWhatsApp className="h-4 w-4 text-[#25D366]" /> Abrir conversa</button>
      )}
      {item.telefone && <a className={APOIO} href={`tel:+${item.telefone}`}><Phone className="h-4 w-4" /> Ligar {telefoneFalado(item.telefone)}</a>}
    </div>
  );

  /* ── passos a mais ─────────────────────────────────────────────── */

  if (extra === 'nao_quer') {
    return (
      <Casca {...base} pergunta={`Por que a ${nome} não quis?`} dica="Nas palavras dela. Ajuda a saber onde a venda está travando."
        onVoltar={() => setExtra(null)} rotuloVoltar="Voltar"
        acao={{ rotulo: 'Tirar da esteira', ocupado, onClick: () => fazer(() => acoes.naoQuer(motivo.trim() || 'Não quis.')) }}>
        <input className={CAMPO} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Caro, já tem sistema, agora não…" />
      </Casca>
    );
  }
  if (extra === 'remarcar') {
    return (
      <Casca {...base} pergunta="Para quando ficou a reunião?" onVoltar={() => setExtra(null)} rotuloVoltar="Voltar"
        acao={{ rotulo: 'Remarcar', ocupado, onClick: () => { const d = dataEscolhida(); if (!d) { toast.error('Escolha o dia e a hora.'); return; } fazer(async () => { await acoes.remarcar(d); setExtra(null); setAdiantada(null); }); } }}>
        <input type="datetime-local" className={CAMPO} value={quando} onChange={(e) => setQuando(e.target.value)} />
      </Casca>
    );
  }

  /* ── as telas ──────────────────────────────────────────────────── */

  if (tela === 'marcar') {
    const novo = o?.etapa === 'novo';
    return (
      <Casca {...base}
        pergunta={novo ? `Chame a ${nome} e marque a reunião` : `Quando é a reunião com a ${nome}?`}
        dica={item.fazer}
        acao={{ rotulo: 'Marcar reunião', ocupado, onClick: () => { const d = dataEscolhida(); if (!d) { toast.error('Escolha o dia e a hora.'); return; } fazer(() => acoes.marcar(d)); } }}>
        <Contato />
        {o?.notas && <p className="text-[14px] text-foreground/65 whitespace-pre-line rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] px-4 py-3">{o.notas}</p>}
        <div>
          <p className="text-[13px] font-semibold text-foreground mb-1.5">Dia e hora da demonstração</p>
          <input type="datetime-local" className={CAMPO} value={quando} onChange={(e) => setQuando(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {o?.esperandoVoce && !novo && o.naoLidas === 0 && (
            <button className="text-[13px] text-foreground/45 hover:text-foreground underline underline-offset-2" disabled={ocupado} onClick={() => fazer(acoes.jaRespondi)}>Já respondi por fora</button>
          )}
          <button className="text-[13px] text-foreground/45 hover:text-foreground underline underline-offset-2" onClick={() => setExtra('nao_quer')}>Ela não quer</button>
        </div>
      </Casca>
    );
  }

  if (tela === 'preparar') {
    return (
      <Casca {...base}
        pergunta={item.temAmostra ? `Tudo pronto para a reunião com a ${nome}` : `Monte a amostra da ${nome}`}
        dica={item.temAmostra
          ? `A reunião é ${horario}. Abra a amostra para conferir antes.`
          : `A reunião é ${horario}. Com a amostra, você mostra o sistema com o nome e a cara da loja.`}
        acao={{ rotulo: 'Estou na reunião', calma: !item.temAmostra, onClick: () => setAdiantada('reuniao') }}>
        {item.temAmostra && dados.amostraUrl
          ? <Opcao href={dados.amostraUrl} rotulo="Abrir a amostra" sub={dados.amostraUrl.replace(/^https?:\/\//, '')} />
          : <Opcao destaque rotulo="Montar a amostra agora" sub="Nome, logo e cor da loja. Leva dois minutos." onClick={acoes.montarAmostra} />}
        {item.temAmostra && <button className={APOIO} onClick={acoes.montarAmostra}>Editar a amostra</button>}
        <div className="flex flex-wrap gap-2">
          <Contato />
          <button className={APOIO} onClick={() => { if (r) setQuando(paraCampo(new Date(r.scheduled_at))); setExtra('remarcar'); }}>Remarcar</button>
        </div>
      </Casca>
    );
  }

  if (tela === 'reuniao') {
    const passou = reuniaoPassou(r, agora);
    return (
      <Casca {...base} pergunta="O cliente apareceu?" dica={passou ? `A reunião era ${horario}.` : `Reunião ${horario}.`}>
        {!passou && (
          <div className="flex flex-wrap gap-2">
            {r?.meet_link && <a className={cn(APOIO, 'border-primary/50 text-primary')} href={r.meet_link} target="_blank" rel="noreferrer"><Video className="h-4 w-4" /> Entrar na chamada</a>}
            {dados.amostraUrl && <a className={APOIO} href={dados.amostraUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Abrir a amostra</a>}
          </div>
        )}
        <div className="grid gap-3">
          <Opcao rotulo="Apareceu" sub="Você mostrou o sistema." disabled={ocupado} onClick={() => fazer(async () => { await acoes.apareceu(); setAdiantada('resultado'); })} />
          <Opcao rotulo="Não apareceu" sub="Volta para Conversa, para marcar outra." disabled={ocupado} onClick={() => fazer(async () => { await acoes.naoApareceu(); setAdiantada('marcar'); })} />
          <Opcao rotulo="Remarcar" sub="Combinaram outro dia." disabled={ocupado} onClick={() => setExtra('remarcar')} />
        </div>
      </Casca>
    );
  }

  if (tela === 'resultado') {
    return (
      <Casca {...base} pergunta={`A ${nome} fechou?`} dica={item.fazer}>
        <div className="grid gap-3">
          <Opcao destaque rotulo="Fechou" sub="Registrar a venda e gerar o link de pagamento." onClick={acoes.fechou} />
          <Opcao rotulo="Vai testar grátis" sub="Começar o teste agora." onClick={acoes.vaiTestar} />
          <Opcao rotulo="Ficou de pensar" sub="Fica em Decisão. Em dois dias ela volta para você cobrar." disabled={ocupado} onClick={() => fazer(acoes.ficouDePensar)} />
          <Opcao rotulo="Não quer" sub="Sai da esteira." onClick={() => setExtra('nao_quer')} />
        </div>
        <Contato />
      </Casca>
    );
  }

  if (tela === 'pagamento') {
    const link = dados.linkDePagamento;
    const zap = link && item.telefone
      ? `https://wa.me/${item.telefone}?text=${encodeURIComponent(`Olá! Segue o link para ativar o sistema da ${nome}: ${link}`)}` : null;
    const copiar = async () => {
      if (!link) return;
      try { await navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { toast.error('Não consegui copiar. Selecione o link e copie.'); }
    };
    return (
      <Casca {...base} pergunta={`Mande o link para a ${nome} pagar`}
        dica="É a página de boas-vindas dela, com o nome da loja e o valor. Quando o pagamento entrar, ela anda sozinha para a Implantação."
        acao={{ rotulo: 'Ver a cobrança', calma: true, onClick: acoes.abrirCobranca }}>
        {link ? (
          <>
            <p className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] px-4 py-3.5 text-[14px] text-foreground break-all select-all font-mono">{link}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {zap && <Opcao destaque href={zap} rotulo="Mandar no WhatsApp" sub={`Para ${telefoneFalado(item.telefone)}`} />}
              <button type="button" onClick={copiar} className="w-full text-left px-5 py-4 rounded-2xl border-2 border-black/[0.09] dark:border-white/[0.1] hover:border-primary/40 transition-all">
                <span className="flex items-center gap-2 text-[16px] font-semibold text-foreground">{copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} {copiado ? 'Copiado' : 'Copiar o link'}</span>
                <span className="block text-[13px] text-foreground/50 mt-0.5">Para colar onde quiser.</span>
              </button>
            </div>
          </>
        ) : (
          <Opcao destaque rotulo="Gerar o link de pagamento" sub="Abre a cobrança deste cliente." onClick={acoes.abrirCobranca} />
        )}
        <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.08] divide-y divide-black/[0.06] dark:divide-white/[0.06] text-[14px]">
          <p className="flex items-center gap-2.5 px-4 py-3">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> <span className="text-foreground">Aguardando o pagamento</span>
            {item.cliente?.mensalidade ? <span className="ml-auto text-foreground/50 tabular-nums">R$ {item.cliente.mensalidade.toLocaleString('pt-BR')}/mês</span> : null}
          </p>
          <p className="flex items-center gap-2.5 px-4 py-3">
            <span className={cn('h-2 w-2 rounded-full', item.cliente?.contratoAssinado ? 'bg-emerald-500' : 'bg-foreground/20')} />
            <span className="text-foreground">{item.cliente?.contratoAssinado ? 'Contrato assinado' : 'Contrato ainda não assinado'}</span>
            <button className="ml-auto text-[13px] text-primary font-medium hover:underline" onClick={acoes.abrirFicha}>Abrir a ficha</button>
          </p>
        </div>
      </Casca>
    );
  }

  if (tela === 'implantacao') {
    return (
      <Casca {...base} pergunta={`Coloque a ${nome} no ar`}
        dica={item.cliente?.emTeste ? 'Ela está no teste grátis. Os passos da implantação estão na próxima tela.' : 'O pagamento entrou. Os passos da implantação estão na próxima tela.'}
        acao={{ rotulo: 'Abrir a implantação', onClick: acoes.abrirImplantacao }} />
    );
  }

  if (tela === 'cliente') {
    return (
      <Casca {...base} pergunta={`A ${nome} é cliente`} dica={item.fazer === 'Cliente' ? 'Fim da esteira. A cobrança de todo mês e os avisos saem sozinhos.' : item.fazer}
        acao={{ rotulo: 'Abrir a ficha', calma: true, onClick: acoes.abrirFicha }} />
    );
  }

  return (
    <Casca {...base} pergunta={`A ${nome} saiu da esteira`} dica={o?.motivo ?? 'Disse que não quer.'} acao={{ rotulo: 'Voltar para a esteira', calma: true, onClick: acoes.voltar }} />
  );
}
