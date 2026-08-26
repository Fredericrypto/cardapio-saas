import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { fetchProducts } from '../lib/menu-api';
import type { Product, SelectedCartOption } from '../types';
import { useCart } from '../contexts/CartContext';
import { useTenant } from '../contexts/TenantContext';

// Texto mínimo necessário pro grupo, no estilo iFood: nada quando é
// realmente livre (0 a 1), "Escolha até N" quando é opcional com teto,
// "Escolha N" quando é obrigatório com N fixo, ou a faixa quando o
// mínimo e o máximo são diferentes.
function groupHint(minSelect: number, maxSelect: number): string | null {
  if (minSelect === 0 && maxSelect <= 1) return null;
  if (minSelect === 0) return `Escolha até ${maxSelect}`;
  if (minSelect === maxSelect) return minSelect === 1 ? 'Escolha 1' : `Escolha ${minSelect}`;
  return `Escolha de ${minSelect} a ${maxSelect}`;
}

export function ProductDetailPage() {
  const { slug, productId, qrCodeToken } = useParams<{
    slug: string;
    productId: string;
    qrCodeToken?: string;
  }>();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const { tenant } = useTenant();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  // groupId -> array de valueIds escolhidos nesse grupo
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant || !productId) return;

    async function load() {
      const products = await fetchProducts(tenant!.id);
      const found = products.find((p) => p.id === productId) ?? null;
      setProduct(found);
      setIsLoading(false);
    }

    load();
  }, [tenant, productId]);

  // Mesma lógica do cardápio: atualiza sozinho a cada 15s, silenciosamente
  // — se o admin desmarcar um adicional como indisponível enquanto o
  // cliente está decidindo aqui, some da lista sem precisar de F5.
  useEffect(() => {
    if (!tenant?.id || !productId) return;
    const interval = setInterval(() => {
      fetchProducts(tenant.id)
        .then((products) => {
          const found = products.find((p) => p.id === productId);
          if (found) setProduct(found);
        })
        .catch(() => {
          // Falha pontual — tenta de novo no próximo ciclo.
        });
    }, 15000);
    return () => clearInterval(interval);
  }, [tenant?.id, productId]);

  if (isLoading || !tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
        <p className="text-gray-500">Produto não encontrado.</p>
      </div>
    );
  }

  // Grupo sem nenhuma opção cadastrada não aparece pro cliente — ficaria
  // um título "morto" sem nada clicável embaixo (bug visto em produção:
  // grupo criado no admin sem nenhuma opção preenchida).
  const optionGroups = (product.options ?? []).filter((g) => g.values.length > 0);

  function toggleValue(groupId: string, groupName: string, valueId: string, maxSelect: number) {
    setValidationError(null);
    setSelections((prev) => {
      const current = prev[groupId] ?? [];

      if (maxSelect === 1) {
        // Rádio: escolher de novo o mesmo desmarca (permitido mesmo em
        // grupo obrigatório — a validação de mínimo só barra no "Adicionar").
        const next = current[0] === valueId ? [] : [valueId];
        return { ...prev, [groupId]: next };
      }

      if (current.includes(valueId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== valueId) };
      }
      if (current.length >= maxSelect) {
        setValidationError(`Máximo de ${maxSelect} opções em "${groupName}".`);
        return prev;
      }
      return { ...prev, [groupId]: [...current, valueId] };
    });
  }

  // Preço = base + soma dos adicionais escolhidos, em todos os grupos.
  const selectedOptionsList: SelectedCartOption[] = optionGroups.flatMap((group) =>
    (selections[group.id] ?? []).flatMap((valueId) => {
      const value = group.values.find((v) => v.id === valueId);
      if (!value) return [];
      return [{ valueId: value.id, groupName: group.name, label: value.label, priceDelta: Number(value.priceDelta) }];
    }),
  );
  const optionsDelta = selectedOptionsList.reduce((sum, o) => sum + o.priceDelta, 0);
  const displayPrice = Number(product.promoPrice ?? product.price) + optionsDelta;
  const subtotal = displayPrice * quantity;

  function handleAddToCart() {
    if (!product) return;

    // Confere grupos obrigatórios antes de deixar adicionar — mesma
    // regra que o backend também confere (defesa em profundidade: aqui
    // é só pra dar feedback rápido, quem garante de verdade é o server).
    for (const group of optionGroups) {
      const chosenCount = (selections[group.id] ?? []).length;
      if (chosenCount < group.minSelect) {
        setValidationError(
          group.minSelect === 1
            ? `Escolha uma opção em "${group.name}" antes de continuar.`
            : `Escolha pelo menos ${group.minSelect} opções em "${group.name}" antes de continuar.`,
        );
        return;
      }
    }

    addItem(product, selectedOptionsList, quantity);
    navigate(qrCodeToken ? `/${slug}/mesa/${qrCodeToken}` : `/${slug}`);
  }

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto pb-28">
      <div className="relative h-72 bg-gray-100">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            Sem foto
          </div>
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-md"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <div className="p-4">
        <h1 className="font-display text-xl font-bold text-gray-900">
          {product.name}
        </h1>
        {product.description && (
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {product.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-6">
          <span className="text-2xl font-bold" style={{ color: tenant.primaryColor }}>
            R$ {Number(product.promoPrice ?? product.price).toFixed(2).replace('.', ',')}
          </span>

          <div className="flex items-center gap-3 bg-gray-100 rounded-full px-1 py-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-gray-600 shadow-sm"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-gray-600 shadow-sm"
            >
              +
            </button>
          </div>
        </div>

        {optionGroups.length > 0 && (
          <div className="mt-6 flex flex-col gap-6">
            {optionGroups.map((group) => (
              <div key={group.id}>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <p className="text-sm font-bold text-gray-900">{group.name}</p>
                  {groupHint(group.minSelect, group.maxSelect) && (
                    <span className="text-xs text-gray-400">
                      · {groupHint(group.minSelect, group.maxSelect)}
                    </span>
                  )}
                </div>

                <div className="flex flex-col divide-y divide-gray-100 border-t border-b border-gray-100">
                  {group.values.map((value) => {
                    const isSelected = (selections[group.id] ?? []).includes(value.id);
                    return (
                      <button
                        key={value.id}
                        onClick={() => toggleValue(group.id, group.name, value.id, group.maxSelect)}
                        className="w-full flex items-center justify-between py-3"
                      >
                        <span className="text-sm text-gray-700">{value.label}</span>
                        <div className="flex items-center gap-2.5">
                          {value.priceDelta > 0 && (
                            <span className="text-xs text-gray-400">
                              + R$ {Number(value.priceDelta).toFixed(2).replace('.', ',')}
                            </span>
                          )}
                          <div
                            className={`w-[18px] h-[18px] flex items-center justify-center border-2 shrink-0 ${
                              group.maxSelect > 1 ? 'rounded-[5px]' : 'rounded-full'
                            }`}
                            style={{
                              borderColor: isSelected ? tenant.primaryColor : '#d1d5db',
                              backgroundColor: isSelected ? tenant.primaryColor : 'transparent',
                            }}
                          >
                            {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {validationError && (
          <p className="text-sm text-red-500 mt-4">{validationError}</p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white border-t border-gray-100">
        <button
          onClick={handleAddToCart}
          className="w-full py-3.5 rounded-xl text-white font-semibold flex justify-between items-center px-5"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          <span>Adicionar</span>
          <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
        </button>
      </div>
    </div>
  );
}
