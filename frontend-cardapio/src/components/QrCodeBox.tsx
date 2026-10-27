import { QRCodeSVG } from 'qrcode.react';

// REGRA DO PRODUTO: QR Code é SEMPRE preto sobre branco, com zona de silêncio
// (~4 módulos), em qualquer tema. O branco é inline de propósito: as classes
// bg-white/bg-gray-* são remapeadas pelo tema escuro; o style não. Todo QR do
// app passa por aqui (exceto o de mesas, que já tem o próprio QrBox).
export function QrCodeBox({
  value,
  size,
  level = 'L',
}: {
  value: string;
  size: number;
  level?: 'L' | 'M' | 'Q' | 'H';
}) {
  const padding = Math.max(10, Math.round(size * 0.1));
  return (
    <div className="shrink-0 rounded-lg" style={{ backgroundColor: '#FFFFFF', padding, lineHeight: 0 }}>
      <QRCodeSVG value={value} size={size} level={level} bgColor="#FFFFFF" fgColor="#000000" />
    </div>
  );
}
