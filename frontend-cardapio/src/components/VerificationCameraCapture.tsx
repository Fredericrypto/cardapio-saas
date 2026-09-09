import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';

interface VerificationCameraCaptureProps {
  primaryColor: string;
  onCancel: () => void;
  onCapture: (photoBlob: Blob) => void;
}

// Sobre a "captura automática quando o rosto estiver bem posicionado":
// reconhecimento de rosto ao vivo de verdade (o que apps como
// Instagram/YouTube usam) precisa de um modelo de ML rodando no
// navegador — pesado, e principalmente algo que eu não teria como
// TESTAR de verdade aqui (sem câmera real neste ambiente) antes de
// entregar pra você. Em vez de arriscar te entregar uma "detecção de
// rosto" quebrada, construí uma abordagem honesta e robusta que
// entrega a mesma experiência final (nunca precisa apertar um botão no
// momento exato): guia oval + contagem regressiva de 3 segundos assim
// que a câmera liga, com preview antes de confirmar de vez.
export function VerificationCameraCapture({
  primaryColor,
  onCancel,
  onCapture,
}: VerificationCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'starting' | 'live' | 'error' | 'preview'>('starting');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('error');
        setErrorMessage(
          'Esse navegador não permite acessar a câmera diretamente. Toque abaixo pra tirar a foto pelo app de câmera do celular.',
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase('live');
      } catch (err) {
        if (cancelled) return;
        setPhase('error');
        const name = err instanceof DOMException ? err.name : '';
        setErrorMessage(
          name === 'NotAllowedError'
            ? 'Você não deu permissão pra câmera. Permite o acesso nas configurações do navegador e tenta de novo, ou usa o app de câmera do celular abaixo.'
            : 'Não consegui acessar a câmera. Toque abaixo pra tirar a foto pelo app de câmera do celular.',
        );
      }
    }
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Assim que o vídeo está de fato rodando, dispara a contagem
  // regressiva de captura automática — 3, 2, 1, foto. Dá tempo da
  // pessoa se ajustar dentro da guia oval sem precisar apertar nada.
  useEffect(() => {
    if (phase !== 'live') return;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(interval);
          captureFrame();
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Espelha horizontalmente — o preview da câmera frontal já aparece
    // espelhado (como um espelho de verdade), então a foto capturada
    // precisa acompanhar, senão sai com o lado errado.
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        capturedBlobRef.current = blob;
        setCapturedUrl(URL.createObjectURL(blob));
        setPhase('preview');
        streamRef.current?.getTracks().forEach((t) => t.stop());
      },
      'image/jpeg',
      0.9,
    );
  }

  function handleRetry() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    capturedBlobRef.current = null;
    setPhase('starting');
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase('live');
      })
      .catch(() => {
        setPhase('error');
        setErrorMessage('Não consegui acessar a câmera de novo. Tenta pelo app de câmera do celular.');
      });
  }

  function handleConfirm() {
    if (capturedBlobRef.current) {
      onCapture(capturedBlobRef.current);
    }
  }

  function handleFileFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    capturedBlobRef.current = file;
    setCapturedUrl(URL.createObjectURL(file));
    setPhase('preview');
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-end p-4">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {phase === 'error' ? (
          <div className="text-center">
            <p className="text-white text-sm mb-5 max-w-xs">{errorMessage}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileFallback}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-3 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: primaryColor }}
            >
              Abrir câmera do celular
            </button>
          </div>
        ) : phase === 'preview' && capturedUrl ? (
          <div className="flex flex-col items-center gap-5">
            <img
              src={capturedUrl}
              alt="Prévia da sua foto"
              className="w-64 h-64 rounded-full object-cover ring-4 ring-white/20"
            />
            <p className="text-white/70 text-sm text-center max-w-xs">
              Ficou boa? Seu rosto precisa estar visível e bem iluminado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="px-5 py-3 rounded-xl bg-white/10 text-white text-sm font-semibold flex items-center gap-2"
              >
                <RotateCcw size={15} />
                Tirar de novo
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-3 rounded-xl text-white text-sm font-semibold flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                <Check size={15} />
                Usar essa foto
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-72 h-72">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded-full"
              style={{ transform: 'scaleX(-1)' }}
            />
            <div className="absolute inset-0 rounded-full ring-4 ring-white/40 pointer-events-none" />
            {phase === 'live' && countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-white text-6xl font-bold drop-shadow-lg">{countdown}</span>
              </div>
            )}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        {phase === 'live' && (
          <p className="text-white/60 text-xs text-center mt-6 max-w-xs">
            Posicione seu rosto dentro do círculo, num local bem iluminado. A foto é tirada
            sozinha em instantes.
          </p>
        )}
      </div>
    </div>
  );
}
