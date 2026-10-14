// Carregamento do SDK do Mercado Pago (MercadoPago.js v2) sob demanda — só
// quando o cliente chega na tela de pagamento por cartão, nunca no app inteiro.
//
// O SDK gera o card token DENTRO de campos seguros (iframes do Mercado Pago):
// o número do cartão nunca passa pelo nosso código nem pelo nosso servidor.

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const SECURITY_URL = 'https://www.mercadopago.com/v2/security.js';

// Dados que o Card Payment Brick entrega no onSubmit.
export interface CardPaymentFormData {
  token: string;
  issuer_id?: string | number;
  payment_method_id: string;
  transaction_amount?: number;
  installments?: number;
  payer?: {
    email?: string;
    identification?: { type?: string; number?: string };
  };
}

export interface BrickController {
  unmount: () => void;
}

export interface CardPaymentBrickSettings {
  initialization: { amount: number };
  customization?: {
    visual?: { style?: { theme?: 'default' | 'dark' | 'bootstrap' | 'flat' } };
    paymentMethods?: { minInstallments?: number; maxInstallments?: number };
  };
  callbacks: {
    onReady?: () => void;
    onSubmit: (formData: CardPaymentFormData) => Promise<void>;
    onError?: (error: unknown) => void;
  };
}

interface MercadoPagoInstance {
  bricks: () => {
    create: (brick: 'cardPayment', containerId: string, settings: CardPaymentBrickSettings) => Promise<BrickController>;
  };
}

type MercadoPagoConstructor = new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance;

interface MercadoPagoWindow {
  MercadoPago?: MercadoPagoConstructor;
  MP_DEVICE_SESSION_ID?: string;
}

const mpWindow = (): MercadoPagoWindow => window as unknown as MercadoPagoWindow;

let sdkPromise: Promise<MercadoPagoConstructor> | null = null;

export function loadMercadoPagoSdk(): Promise<MercadoPagoConstructor> {
  if (mpWindow().MercadoPago) return Promise.resolve(mpWindow().MercadoPago as MercadoPagoConstructor);
  if (!sdkPromise) {
    sdkPromise = new Promise<MercadoPagoConstructor>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => {
        const ctor = mpWindow().MercadoPago;
        if (ctor) resolve(ctor);
        else {
          sdkPromise = null;
          reject(new Error('Mercado Pago SDK indisponível'));
        }
      };
      script.onerror = () => {
        sdkPromise = null; // permite tentar de novo
        script.remove();
        reject(new Error('Falha ao carregar o SDK do Mercado Pago'));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

// Script de segurança do Mercado Pago (antifraude): gera o device id em
// `window.MP_DEVICE_SESSION_ID`. Sem ele o pagamento funciona, mas a
// aprovação pode ser menor. Disparado e esquecido.
export function loadMercadoPagoSecurity(): void {
  if (document.querySelector(`script[src="${SECURITY_URL}"]`)) return;
  const script = document.createElement('script');
  script.src = SECURITY_URL;
  script.async = true;
  script.setAttribute('view', 'checkout');
  document.head.appendChild(script);
}

export function readMercadoPagoDeviceId(): string | undefined {
  const id = mpWindow().MP_DEVICE_SESSION_ID;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

// Idioma do SDK a partir do idioma do app.
export function mercadoPagoLocale(language: string): string {
  if (language === 'en') return 'en-US';
  if (language === 'es') return 'es-AR';
  return 'pt-BR';
}
