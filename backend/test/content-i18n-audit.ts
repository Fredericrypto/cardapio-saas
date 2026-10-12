// Auditoria da tradução de conteúdo do catálogo. Sem banco, sem rede (fetch falso).
import 'reflect-metadata';
import { sanitizeTranslations } from '../src/common/i18n/content-translations';
import { GLOSSARY_SIZE, normalizeMenuText, translateFromGlossary } from '../src/common/i18n/menu-glossary';
import { TranslationService } from '../src/modules/translations/translation.service';
import { createChecker } from './helpers';

const { ok, finish } = createChecker();

async function main() {
  // --- sanitize ---
  ok(sanitizeTranslations(null, ['name']) === null && sanitizeTranslations('x', ['name']) === null && sanitizeTranslations([], ['name']) === null, 'entrada inválida -> null');
  const clean = sanitizeTranslations({ en: { name: '  Beef   dumplings ', description: '', evil: 'x' }, fr: { name: 'Raviolis' }, es: 5 }, ['name', 'description']);
  ok(JSON.stringify(clean) === JSON.stringify({ en: { name: 'Beef dumplings' } }), 'só línguas/campos conhecidos, texto aparado, vazios descartados');
  ok(sanitizeTranslations({ en: { title: 'x'.repeat(500) } }, ['title'])!.en!.title!.length === 60, 'limite por campo (título 60)');
  ok(sanitizeTranslations({ en: { name: '' } }, ['name']) === null, 'nada sobrou -> null (limpa a tradução)');

  // --- glossário ---
  ok(normalizeMenuText('  Promoções! ') === 'promocoes', 'normaliza acento, caixa e pontuação final');
  ok(translateFromGlossary('Promoções', 'en') === 'Deals', '"Promoções" -> Deals');
  ok(translateFromGlossary('dumplings DE carne', 'en') === 'Beef dumplings', 'ignora maiúsculas');
  ok(translateFromGlossary('Dumplings de carne', 'es') === 'Dumplings de carne', 'es');
  ok(translateFromGlossary('Prato exótico do chef João', 'en') === null, 'desconhecido -> null (nunca chuta palavra a palavra)');
  ok(GLOSSARY_SIZE >= 140, `glossário com ${GLOSSARY_SIZE} termos`);

  // --- serviço ---
  const svc = new TranslationService();
  delete process.env.ANTHROPIC_API_KEY;
  let r = await svc.suggest({ name: 'Promoções', description: 'Feito com carinho pela vovó' });
  ok(r.source === 'glossary' && r.translations.en?.name === 'Deals' && !r.translations.en?.description, 'sem chave: glossário resolve o que sabe');
  ok(r.warnings.includes('ai_not_configured') && r.warnings.includes('untranslated_fields'), 'avisa que a IA não está configurada e que sobrou campo');
  r = await svc.suggest({ name: 'xyz desconhecido' });
  ok(r.source === 'none' && Object.keys(r.translations).length === 0, 'nada traduzido -> source none');

  let threw = false;
  try { await svc.suggest({}); } catch { threw = true; }
  ok(threw, 'sem texto: 400');
  threw = false;
  try { await svc.suggest({ title: 'x'.repeat(61) }); } catch { threw = true; }
  ok(threw, 'texto acima do limite: 400');

  // IA (fetch falso)
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  let sent: { url: string; headers: Record<string, string>; body: { model: string; messages: Array<{ content: string }> } } | null = null;
  svc.fetchFn = async (url, init) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'Claro!\n{"en":{"description":"Made with love by grandma","hack":"x"},"es":{"description":"Hecho con cariño por la abuela"},"fr":{"description":"non"}}' }] }),
    };
  };
  r = await svc.suggest({ name: 'Promoções', description: 'Feito com carinho pela vovó' });
  ok(r.source === 'mixed', 'glossário + IA = mixed');
  ok(r.translations.en?.name === 'Deals' && r.translations.en?.description === 'Made with love by grandma' && r.translations.es?.description === 'Hecho con cariño por la abuela', 'IA completa só o que faltava');
  ok(!('fr' in r.translations) && !('hack' in (r.translations.en ?? {})), 'línguas/campos não pedidos da resposta são ignorados');
  ok(sent !== null && (sent as { url: string }).url === 'https://api.anthropic.com/v1/messages' && (sent as { headers: Record<string, string> }).headers['x-api-key'] === 'sk-test', 'chamada à API com a chave do ambiente');
  const sentBody = (sent as unknown as { body: { messages: Array<{ content: string }> } }).body.messages[0].content;
  ok(!sentBody.includes('Deals') && !sentBody.includes('Promoções'), 'o que o glossário já resolveu NÃO é enviado à IA');
  ok(r.warnings.length === 0, 'tudo traduzido: sem avisos');

  svc.fetchFn = async () => ({ ok: false, status: 500, json: async () => ({}) });
  r = await svc.suggest({ name: 'Promoções', description: 'Texto novo' });
  ok(r.source === 'glossary' && r.warnings.includes('ai_unavailable') && r.translations.en?.name === 'Deals', 'IA fora do ar: devolve o glossário + aviso (não quebra)');
  svc.fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'sem json aqui' }] }) });
  r = await svc.suggest({ description: 'Texto novo' });
  ok(r.source === 'none' && r.warnings.includes('untranslated_fields'), 'resposta sem JSON: nada aplicado');
  ok(TranslationService.parseAiReply({ content: [] }, { en: { name: 'x' } }) === null, 'corpo sem texto -> null');
  delete process.env.ANTHROPIC_API_KEY;
}

main().then(() => process.exit(finish()), (e) => { console.error(e); process.exit(1); });
