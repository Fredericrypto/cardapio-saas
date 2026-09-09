import { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Check, Timer } from 'lucide-react';

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
// rosto" quebrada, construí algo honesto: guia OVAL vertical (padrão
// de apps de verificação de documento/rosto) + um botão que o próprio
// cliente aperta pra ligar a contagem regressiva, dando tempo de se
// ajustar antes do disparo — em vez de disparar sozinho assim que a
// câmera liga.
export function VerificationCameraCapture({
  primaryColor,
  onCancel,
  onCapture,
}: VerificationCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'starting' | 'live' | 'counting' | 'error' | 'preview'>(
    'starting',
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);

  function openCamera() {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
  }

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
        const stream = await openCamera();
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

  // Só dispara quando o CLIENTE aperta o botão (handleStartCountdown) —
  // nunca sozinho ao vivo. 3 segundos dá tempo de ajeitar a postura
  // depois de já ter apertado.
  function handleStartCountdown() {
    setPhase('counting');
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
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth;
    const height = Math.min(video.videoHeight, width * 1.3);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    const offsetY = (video.videoHeight - height) / 2;
    ctx.drawImage(video, 0, offsetY, width, height, 0, 0, width, height);
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
    openCamera()
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

  const showLiveGuide = phase === 'live' || phase === 'counting' || phase === 'starting';

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
              className="w-56 h-72 rounded-[9999px] object-cover ring-4 ring-white/20"
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
          <div className="relative w-60 h-80">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)', borderRadius: '9999px' }}
            />
            {showLiveGuide && (
              <div
                className="absolute inset-0 ring-4 ring-white/40 pointer-events-none"
                style={{ borderRadius: '9999px' }}
              />
            )}
            {phase === 'counting' && countdown !== null && (
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
            Posicione seu rosto dentro da guia, num local bem iluminado. Quando estiver pronto,
            toque no botão abaixo.
          </p>
        )}
        {phase === 'counting' && (
          <p className="text-white/60 text-xs text-center mt-6 max-w-xs">
            Se ajeite — a foto é tirada sozinha ao fim da contagem.
          </p>
        )}
      </div>

      {phase === 'live' && (
        <div className="flex justify-center pb-10">
          <button
            onClick={handleStartCountdown}
            aria-label="Iniciar contagem pra tirar a foto"
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <Timer size={24} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
