import { useCallback, useEffect, useState } from 'react';
import { BellOff, Send, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchInternalPreferences, sendInternalPushTest, updateInternalPreferences } from '../../lib/admin-api';
import {
  disableDevicePush,
  enableDevicePush,
  getPermission,
  isDeviceEnabled,
  isPushSupported,
  needsInstallOnIos,
  type EnableResult,
} from '../../lib/internalPush';
import type { NotificationTarget } from '../../types/notes';

// Gerenciamento das notificações da equipe (aparelho + quem recebe).
// Usado em Configurações > "Configurações de Notificações" e na aba
// "Preferências" da página /notificacoes (mesma tela, uma só fonte).

const TARGET_OPTIONS: { value: NotificationTarget; label: string; hint: string }[] = [
  { value: 'owner', label: 'Apenas o Admin (CEO)', hint: 'Só o administrador do restaurante recebe os alertas.' },
  { value: 'owner_manager', label: 'Admin e Gerentes', hint: 'O administrador e os gerentes recebem; funcionários não.' },
  { value: 'all', label: 'Todos os funcionários', hint: 'Toda a equipe cadastrada recebe os alertas.' },
];

const ENABLE_ERRORS: Partial<Record<EnableResult, string>> = {
  denied: 'A permissão está bloqueada neste navegador. Libere as notificações nas configurações do site e tente de novo.',
  unsupported: 'Este navegador não suporta notificações push.',
  'no-vapid': 'O servidor ainda não tem as chaves de push configuradas (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
  error: 'Não foi possível ativar agora. Tente novamente em instantes.',
};

export function NotificationPreferences() {
  const { admin } = useAuth();
  const isOwner = admin?.role === 'owner';
  const [target, setTarget] = useState<NotificationTarget>('all');
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const supported = isPushSupported();
  const [permission, setPermission] = useState(getPermission());

  const refreshDevice = useCallback(async () => setDeviceOn(await isDeviceEnabled()), []);
  useEffect(() => {
    void refreshDevice();
    fetchInternalPreferences().then((p) => setTarget(p.target)).catch(() => undefined);
  }, [refreshDevice]);

  async function toggleDevice() {
    setBusy(true);
    setMessage(null);
    try {
      if (deviceOn) {
        await disableDevicePush();
        setDeviceOn(false);
      } else {
        const result = await enableDevicePush();
        setPermission(getPermission());
        if (result === 'enabled') setDeviceOn(true);
        // Permissão bloqueada já tem o aviso fixo acima — não repete.
        else if (result !== 'denied' || getPermission() !== 'denied') {
          setMessage({ tone: 'error', text: ENABLE_ERRORS[result] ?? ENABLE_ERRORS.error! });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function chooseTarget(next: NotificationTarget) {
    if (!isOwner || next === target) return;
    const prev = target;
    setTarget(next);
    try {
      await updateInternalPreferences(next);
      setMessage({ tone: 'ok', text: 'Preferência salva.' });
    } catch {
      setTarget(prev);
      setMessage({ tone: 'error', text: 'Não foi possível salvar a preferência.' });
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const { sent } = await sendInternalPushTest();
      setMessage(
        sent > 0
          ? { tone: 'ok', text: 'Teste enviado. Ele deve aparecer na barra de notificações em instantes.' }
          : { tone: 'error', text: 'Nenhum aparelho recebeu. Confirme se o servidor tem as chaves VAPID e se este aparelho está ativado.' },
      );
    } catch {
      setMessage({ tone: 'error', text: 'Não foi possível enviar o teste.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
              <Smartphone size={17} />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">Notificações neste aparelho</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Recebe os avisos na barra de notificações do celular ou do computador, mesmo com o painel fechado.
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={deviceOn}
            aria-label="Notificações neste aparelho"
            disabled={busy || !supported}
            onClick={() => void toggleDevice()}
            className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-40 ${deviceOn ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${deviceOn ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {!supported && <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Este navegador não suporta notificações push.</p>}
        {supported && needsInstallOnIos() && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            No iPhone/iPad, as notificações só funcionam com o painel instalado: abra no Safari, toque em Compartilhar e escolha "Adicionar à Tela de Início".
          </p>
        )}
        {supported && permission === 'denied' && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
            As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.
          </p>
        )}

        <button
          onClick={() => void sendTest()}
          disabled={busy || !deviceOn}
          className="self-start flex items-center gap-1.5 text-xs font-semibold text-gray-600 px-3 py-2 rounded-xl border border-gray-200 disabled:opacity-40"
        >
          {deviceOn ? <Send size={14} /> : <BellOff size={14} />}
          Enviar notificação de teste
        </button>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Quem recebe os alertas no celular</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Vale para o restaurante todo. {isOwner ? '' : 'Só o Admin pode alterar.'}
          </p>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Quem recebe os alertas">
          {TARGET_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${target === o.value ? 'border-gray-900 bg-gray-50' : 'border-gray-200'} ${isOwner ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
            >
              <input
                type="radio"
                name="target"
                checked={target === o.value}
                disabled={!isOwner}
                onChange={() => void chooseTarget(o.value)}
                className="mt-1 accent-gray-900"
              />
              <span>
                <span className="block text-sm font-semibold text-gray-800">{o.label}</span>
                <span className="block text-xs text-gray-400">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">Quem fez a ação (criar, editar ou excluir) não recebe o próprio alerta.</p>
      </section>

      {message && (
        <p className={`text-sm rounded-xl px-4 py-2.5 ${message.tone === 'ok' ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>{message.text}</p>
      )}
    </div>
  );
}
