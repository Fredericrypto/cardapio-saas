import { QRCodeSVG } from 'qrcode.react';

// Bloco de autenticidade do cupom — QR + código em texto, os dois
// SEMPRE visíveis. Antes o texto ficava escondido atrás de um botão
// "Não consigo escanear", mas esse componente é exatamente o que vira
// a imagem quando o cliente salva o cupom em PNG — e nesse momento o
// botão (interativo, só faz sentido numa tela de verdade) fica
// congelado na imagem no lugar do código, que é a informação que
// interessa numa imagem estática. Sempre mostrando os dois, o PNG
// sempre sai correto, e quem estiver vendo na tela também já tem tudo
// visível sem precisar tocar em nada.
export function ReceiptAuthenticityCode({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 pt-1">
      <QRCodeSVG value={code} size={72} level="M" />
      <p className="text-center text-[9px] text-gray-400 break-all leading-tight px-4">{code}</p>
      <p className="text-center text-[9px] text-gray-400">Código de autenticidade</p>
    </div>
  );
}
