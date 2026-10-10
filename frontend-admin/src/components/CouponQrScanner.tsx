import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { Camera, RefreshCw, X } from 'lucide-react';

interface CouponQrScannerProps {
  // Texto cru lido do QR. O scanner fecha logo depois.
  onDecoded: (raw: string) => void;
  onClose: () => void;
}

// Reduz o quadro antes de decodificar: jsQR é puro JS e 720px já lê QR de cupom
// com folga, sem travar celulares simples.
const MAX_DECODE_WIDTH = 720;

type FacingMode = 'environment' | 'user';

function describeCameraError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (!window.isSecureContext) return 'A câmera só funciona em conexão segura (HTTPS).';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador e tente de novo.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Nenhuma câmera foi encontrada neste aparelho.';
  if (name === 'NotReadableError') return 'A câmera está em uso por outro aplicativo. Feche-o e tente de novo.';
  return 'Não foi possível abrir a câmera. Você ainda pode digitar o código do cupom.';
}

// Leitor de QR code por câmera (celular ou webcam). Decodifica quadro a quadro
// de um <video> ao vivo com jsQR — a mesma biblioteca já usada no app do cliente.
export function CouponQrScanner({ onDecoded, onClose }: CouponQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  const [facing, setFacing] = useState<FacingMode>('environment');
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [canSwitch, setCanSwitch] = useState(false);

  const stopCamera = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    doneRef.current = false;
    setError(null);
    setIsStarting(true);

    function scan() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled || doneRef.current || !video || !canvas) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (result?.data) {
            doneRef.current = true;
            stopCamera();
            onDecodedRef.current(result.data);
            return;
          }
        }
      }
      frameRef.current = requestAnimationFrame(scan);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(describeCameraError(null));
        setIsStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
        setIsStarting(false);
        frameRef.current = requestAnimationFrame(scan);
      } catch (err) {
        if (!cancelled) {
          setError(describeCameraError(err));
          setIsStarting(false);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [facing, stopCamera]);

  // Portal no body: o modal precisa cobrir a tela inteira, mesmo dentro de
  // contêineres com transform/overflow.
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Leitor de QR code do cupom">
      <div className="flex items-center justify-between p-4">
        <p className="flex items-center gap-2 text-white text-sm font-semibold">
          <Camera size={18} strokeWidth={1.5} />
          Aponte para o QR code do cupom
        </p>
        <div className="flex items-center gap-1">
          {canSwitch && (
            <button
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              className="text-white p-2 rounded-lg hover:bg-white/10"
              aria-label="Trocar de câmera"
            >
              <RefreshCw size={20} strokeWidth={1.5} />
            </button>
          )}
          <button onClick={onClose} className="text-white p-2 rounded-lg hover:bg-white/10" aria-label="Fechar leitor">
            <X size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {!error && (
          <div className="relative w-64 h-64 max-w-[70vw] max-h-[70vw]">
            <span className="absolute left-0 top-0 w-10 h-10 border-l-[3px] border-t-[3px] border-white rounded-tl-2xl" />
            <span className="absolute right-0 top-0 w-10 h-10 border-r-[3px] border-t-[3px] border-white rounded-tr-2xl" />
            <span className="absolute left-0 bottom-0 w-10 h-10 border-l-[3px] border-b-[3px] border-white rounded-bl-2xl" />
            <span className="absolute right-0 bottom-0 w-10 h-10 border-r-[3px] border-b-[3px] border-white rounded-br-2xl" />
          </div>
        )}
        {isStarting && !error && <p className="absolute bottom-8 text-white/80 text-xs">Abrindo a câmera...</p>}
      </div>

      {error && (
        <div className="p-5 bg-black text-center">
          <p className="text-red-300 text-sm mb-4">{error}</p>
          <button onClick={onClose} className="w-full max-w-xs py-3 rounded-xl bg-white text-gray-900 text-sm font-semibold">
            Digitar o código
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
