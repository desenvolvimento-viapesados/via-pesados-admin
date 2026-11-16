// Avatar compartilhado — mostra a foto de perfil ou as iniciais do nome
import { useState, useEffect } from "react";

type Props = {
  name: string;
  src?: string | null;
  isGroup?: boolean;
  className?: string;
  size?: number; // px — usado para o texto das iniciais
  onImageError?: () => void;
};

const GroupIcon = ({ className, size }: { className: string; size?: number }) => {
  const px = size ? Math.round(size * 0.6) : 26;
  return (
    <div className={`${className} rounded-full flex items-center justify-center shrink-0`} style={{ background: "var(--wa-icone)" }}>
      <svg width={px} height={px} viewBox="0 0 32 32" fill="white" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10.5" cy="12" r="4" />
        <path d="M3 26c0-4.4 3.4-7 7.5-7" strokeWidth="0" />
        <circle cx="21.5" cy="11" r="4.5" />
        <path d="M11.5 26c0-4.5 3.8-7 10-7s10 2.5 10 7" strokeWidth="0" />
        <circle cx="10.5" cy="12" r="4" />
        <path fillRule="evenodd" clipRule="evenodd" d="M3.5 26c0-3.8 3.1-6.5 7-6.5 1.2 0 2.4.3 3.3.8C12.3 21.5 11 23.6 11 26H3.5z" />
      </svg>
    </div>
  );
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Paleta de cores semelhante ao WhatsApp para avatares com iniciais.
// Letra sempre branca, como no WhatsApp — por isso nenhuma cor clara aqui:
// o bege do fundo do WhatsApp (#ECE5DD) estava na lista e o "RS" sumia.
const COLORS = [
  "#25D366", "#128C7E", "#075E54", "#34B7F1",
  "#b0793f", "#ff6b6b", "#a29bfe", "#fd79a8",
  "#6c5ce7", "#00b894", "#e17055", "#0984e3",
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export const WaAvatar = ({ name, src, isGroup, className = "w-10 h-10", size, onImageError }: Props) => {
  const [imgFailed, setImgFailed] = useState(false);
  const bg = colorFor(name);
  const letters = initials(name);
  const fontSize = size ? `${Math.round(size * 0.38)}px` : undefined;

  // Reset failure state when src changes (e.g. a fresh URL arrives after re-fetch)
  useEffect(() => { setImgFailed(false); }, [src]);

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt={name}
        className={`${className} rounded-full object-cover`}
        onError={() => {
          setImgFailed(true);
          onImageError?.();
        }}
      />
    );
  }

  if (isGroup) {
    return <GroupIcon className={className} size={size} />;
  }

  return (
    <div
      className={`${className} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: bg, color: "#ffffff", fontSize }}
    >
      {letters}
    </div>
  );
};
