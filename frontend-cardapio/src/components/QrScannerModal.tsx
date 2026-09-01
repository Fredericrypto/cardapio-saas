import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import jsQR from 'jsqr';
import { X } from 'lucide-react';

interface QrScannerModalProps {
  onClose: () => void;
}

// Scanner de QR code DENTRO do app — evita o cliente ter que sair e abrir
// a câmera nativa do celular manualmente. Decodifica frame a frame de um
// <video> ao vivo (jsQR, puro JS, sem dependência nativa nenhuma).
//
// PROTEÇÃO CRÍTICA: nunca navega direto pra onde o QR mandar. Só aceita
// um QR se o conteúdo decodificado for um CAMINHO RELATIVO no formato
// exato `/<slug-desse-restaurante>/mesa/<token>` — nunca uma URL
// absoluta de outro domínio, nunca uma mesa de outro restaurante (slug
// tem que bater com o `:slug` da rota atual). Qualquer coisa fora desse
// formato é recusada com uma mensagem clara, nunca aberta — é isso que
// impede um QR falso/de outro estabelecimento ser reconhecido.
const MESA_URL_PATTERN = /^\/([a-z0-9-]+)\/mesa\/([a-f0-9-]+)\/?$/i;

export function QrScannerModal({ onClose }: QrScannerModalProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanLoop();
        }
      } catch {
        if (!cancelled) {
          setError(
            'Não foi possível acessar a câmera. Confirma que deu permissão pro navegador, ou escaneia com a câmera do celular mesmo.',
          );
        }
      }
    }

    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if (result?.data) {
        handleDecoded(result.data);
        return; // para o loop — já achou
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    }

    function handleDecoded(raw: string) {
      setHasResult(true);
      // Aceita tanto o caminho relativo puro quanto uma URL completa
      // (o QR de verdade, gerado pelo painel, é sempre `origin +
      // caminho relativo` — extrai só o pathname pra comparar).
      let path = raw;
      try {
        path = new URL(raw).pathname;
      } catch {
        // já era só o caminho, sem protocolo — segue com o valor cru
      }
      const match = path.match(MESA_URL_PATTERN);
      if (!match) {
        setError('Esse QR code não é reconhecido. Escaneia o QR code da mesa do restaurante.');
        return;
      }
      const [, scannedSlug] = match;
      if (scannedSlug !== slug) {
        setError('Esse QR code é de outro restaurante — não dá pra abrir por aqui.');
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      navigate(path, { replace: true });
      onClose();
    }

    startCamera();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <p className="text-white text-sm font-semibold">Escanear QR code da mesa</p>
        <button onClick={onClose} className="text-white p-1">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {!hasResult && !error && (
          <div className="relative w-64 h-64 border-2 border-white/70 rounded-2xl" />
        )}
      </div>

      {error && (
        <div className="p-4 bg-black">
          <p className="text-red-300 text-sm text-center mb-3">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setHasResult(false);
            }}
            className="w-full py-3 rounded-xl bg-white text-gray-900 text-sm font-semibold"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
