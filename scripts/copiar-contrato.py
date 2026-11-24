"""Copia os Termos de Uso (docs/contrato; o contrato antigo fica lá como histórico) para dentro das funções. Rode depois de mudar o .md."""
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
md = (raiz / 'docs/contrato/termos-de-uso-via-pesados.md').read_text()
(raiz / 'supabase/functions/_shared/contrato-texto.ts').write_text(
    "/* CÓPIA de docs/contrato/termos-de-uso-via-pesados.md, para a função alcançar o texto.\n"
    "   Não edite aqui: mude o .md e rode `python3 scripts/copiar-contrato.py`. O teste\n"
    "   src/lib/contrato.test.ts falha se os dois divergirem. */\n"
    "export const CONTRATO: string = " + json.dumps(md, ensure_ascii=False) + ";\n")
print('termos copiados')
