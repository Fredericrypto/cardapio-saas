import { useI18n } from '../i18n/I18nContext';
import { CircleDollarSign } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

// Decisão final do Felipe (30/09): cashback é exclusivo de quem tem conta.
// Convidado não tem NENHUM acesso — em áreas de transação (fechamento de
// conta / pagamento) só vê este aviso, com o caminho pro login/cadastro.
// `returnTo` é o caminho EXATO (com query) pra onde voltar depois de
// entrar/criar a conta: a tela de login navega por dentro do app (sem
// recarregar a página), então a sessão da mesa continua intacta, e
// depois do login o cliente cai de volta exatamente onde ia pagar.
// Só deve ser renderizado em modo convidado (não logado).
export function CashbackLoginNotice({
  returnTo,
  primaryColor,
}: {
  returnTo: string;
  primaryColor: string;
}) {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 flex flex-col gap-2.5">
      <p className="text-sm text-gray-700 flex items-start gap-2">
        <CircleDollarSign size={16} className="mt-0.5 shrink-0 text-gray-400" />
        {t('cashbackLoginNotice.faca_login_ou_crie')}
      </p>
      <button
        type="button"
        onClick={() =>
          navigate(`/${slug}/conta-cliente/entrar?redirect=${encodeURIComponent(returnTo)}`)
        }
        style={{ backgroundColor: primaryColor }}
        className="py-2.5 rounded-xl text-white text-sm font-semibold md:self-start md:px-6 md:hover:brightness-110 md:transition"
      >
        {t('cashbackLoginNotice.entrar_ou_criar_conta')}
      </button>
    </div>
  );
}
