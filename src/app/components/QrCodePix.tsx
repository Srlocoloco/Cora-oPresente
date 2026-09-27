// Componente QrCodePix
//
// Desenha o QR Code do PIX aqui mesmo, no navegador. Antes a imagem vinha de
// um site de terceiros (api.qrserver.com): o código de pagamento de cada
// cliente era enviado para fora da loja, e se aquele site caísse o cliente
// ficava sem QR para pagar.

import { useMemo } from "react";
import qrcode from "qrcode-generator";

export function QrCodePix({ codigo, tamanho = 232 }: { codigo: string; tamanho?: number }) {
  const matriz = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(codigo);
    qr.make();
    const n = qr.getModuleCount();
    const escuros: [number, number][] = [];
    for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) if (qr.isDark(l, c)) escuros.push([l, c]);
    return { n, escuros };
  }, [codigo]);

  const margem = 2;
  const lado = matriz.n + margem * 2;
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR Code para pagar com PIX"
      className="block"
    >
      <rect width={lado} height={lado} fill="#fff" />
      {matriz.escuros.map(([l, c]) => (
        <rect key={`${l}-${c}`} x={c + margem} y={l + margem} width={1} height={1} fill="#111" />
      ))}
    </svg>
  );
}
