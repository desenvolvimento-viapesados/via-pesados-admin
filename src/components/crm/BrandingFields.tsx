import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImgKey = 'site_logo' | 'logo' | 'brand_icon' | 'banner' | 'favicon';

export const IMG_KEYS: ImgKey[] = ['site_logo', 'logo', 'brand_icon', 'banner', 'favicon'];

/** Mapa vazio com todas as chaves — evita esquecer alguma ao adicionar peças. */
export const emptyImgs = <T,>(v: T): Record<ImgKey, T> =>
  Object.fromEntries(IMG_KEYS.map((k) => [k, v])) as Record<ImgKey, T>;

/** Cada peça da identidade, com o tamanho recomendado sempre à vista. */
export const IMG_FIELDS: { key: ImgKey; label: string; hint: string; ratio: string }[] = [
  { key: 'site_logo',  label: 'Logo do site',    hint: 'PNG transparente · 600×200px · o site tem fundo claro, então use a versão escura/colorida da marca', ratio: 'aspect-[3/1]' },
  { key: 'logo',       label: 'Logo do sistema', hint: 'PNG transparente · 600×200px · o sistema tem fundo escuro, então use a versão clara/branca da marca', ratio: 'aspect-[3/1]' },
  { key: 'brand_icon', label: 'Ícone de marca', hint: 'PNG transparente · 256×256px · só o símbolo, sem o texto. É o que aparece à esquerda em toda seção do sistema — sem ele entra o símbolo padrão', ratio: 'aspect-square' },
  { key: 'banner',     label: 'Banner',         hint: 'JPG ou PNG · 2400×800px (3:1) · a faixa é larga e baixa — um 16:9 tem metade cortada. Assunto no centro, longe das bordas', ratio: 'aspect-[3/1]' },
  { key: 'favicon',    label: 'Favicon',        hint: 'PNG transparente · 512×512px · só o símbolo, sem o nome escrito', ratio: 'aspect-square' },
];

/** Campo de imagem com prévia na proporção real de uso. */
export function ImageField({
  label, hint, ratio, preview, onPick, onClear,
}: {
  label: string;
  hint: string;
  ratio: string;
  preview: string | null;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[11.5px] font-semibold text-foreground/70">{label}</p>
        {preview && (
          <button onClick={onClear} className="text-[10.5px] text-foreground/35 hover:text-red-400 transition-colors">
            remover
          </button>
        )}
      </div>
      <button
        onClick={() => ref.current?.click()}
        className={cn(
          'w-full rounded-xl border border-dashed border-black/[0.15] dark:border-white/[0.15]',
          'bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden flex items-center justify-center',
          'hover:border-primary/50 transition-colors',
          ratio,
        )}
      >
        {preview
          ? <img src={preview} alt="" className="h-full w-full object-contain p-1.5" />
          : <Upload className="h-4 w-4 text-foreground/25" />}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
      />
      <p className="text-[10px] text-foreground/35 mt-1 leading-snug">{hint}</p>
    </div>
  );
}
