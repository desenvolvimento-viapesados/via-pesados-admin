import { useEffect, useState } from 'react';

/**
 * Input que aplica máscara enquanto digita e só grava ao sair do campo.
 *
 * Existe porque a alternativa — input não-controlado reescrevendo
 * `e.target.value` dentro do onChange — joga o cursor para o fim a cada
 * tecla, o que só não incomoda quem digita sempre no final.
 */
export function CampoMascarado({
  valorInicial, mascara, aoSair, className, ...resto
}: {
  /** Já mascarado, como veio do banco. */
  valorInicial: string;
  mascara: (v: string) => string;
  /** Recebe o texto mascarado; quem chama decide como gravar. */
  aoSair: (v: string) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'defaultValue'>) {
  const [v, setV] = useState(valorInicial);
  // Troca de registro (outro prospect na mesma tela) tem de repovoar o campo.
  useEffect(() => { setV(valorInicial); }, [valorInicial]);
  return (
    <input
      {...resto}
      className={className}
      value={v}
      inputMode="numeric"
      onChange={(e) => setV(mascara(e.target.value))}
      onBlur={() => aoSair(v.trim())}
    />
  );
}
