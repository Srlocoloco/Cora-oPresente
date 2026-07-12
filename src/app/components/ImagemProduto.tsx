// Componente ImagemProduto

import { IMAGEM_PADRAO } from "../constantes";

export function ImagemProduto({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return (
    <img
      src={src && src.trim() ? src : IMAGEM_PADRAO}
      alt={alt}
      className={className}
      onError={(e) => {
        const img = e.currentTarget as HTMLImageElement;
        if (img.src !== IMAGEM_PADRAO) img.src = IMAGEM_PADRAO;
      }}
    />
  );
}
