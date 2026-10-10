// Retorno sonoro/tátil da leitura de cupom. Tudo "melhor esforço": sem áudio
// liberado pelo navegador ou sem vibração, simplesmente não faz nada.
let audioContext: AudioContext | null = null;

function beep(frequencies: number[], durationMs: number): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = audioContext ?? new Ctor();
    const ctx = audioContext;
    let startAt = ctx.currentTime;
    for (const frequency of frequencies) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationMs / 1000 + 0.02);
      startAt += durationMs / 1000;
    }
  } catch {
    /* sem áudio: segue sem som */
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem vibração */
  }
}

export function feedbackSuccess(): void {
  beep([880, 1320], 110);
  vibrate(60);
}

export function feedbackError(): void {
  beep([300, 220], 160);
  vibrate([80, 60, 80]);
}

// Leu um QR (ainda não validado): bip curto.
export function feedbackScan(): void {
  beep([1040], 70);
  vibrate(30);
}
