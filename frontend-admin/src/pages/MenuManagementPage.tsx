import type { ContentTranslations } from '../types/translations';
import { TranslationFields } from '../components/TranslationFields';
import { useEffect, useState } from 'react';
import { CurrencyField } from '../components/MaskedNumberField';
import { Plus, Trash2, Image as ImageIcon, Info, SlidersHorizontal, X, Check, AlertTriangle } from 'lucide-react';
import {
  fetchCategories,
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../lib/admin-api';
import { ProductOptionsEditor } from '../components/ProductOptionsEditor';
import { ProductImagesEditor } from '../components/ProductImagesEditor';
import { ProductBadgesEditor } from '../components/ProductBadgesEditor';
import { resolveDeclaredBadges } from '../lib/productBadges';
import type { DeclaredBadgeCode } from '../types/productBadges';
import { MAX_PRODUCT_IMAGES, getProductImages } from '../lib/productImages';
import type { Category, Product } from '../types';
import { getCategoryIcon } from '../components/CategoryIcon';
import { CategoryManager } from '../components/CategoryManager';

export function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', costPrice: '' });
  const [newTranslations, setNewTranslations] = useState<ContentTranslations>({});
  const [editTranslations, setEditTranslations] = useState<ContentTranslations>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', price: '', costPrice: '' });
  const [newBadges, setNewBadges] = useState<DeclaredBadgeCode[]>([]);
  const [editBadges, setEditBadges] = useState<DeclaredBadgeCode[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // O aviso some sozinho (erro fica mais tempo na tela).
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), notice.kind === 'error' ? 9000 : 3500);
    return () => window.clearTimeout(id);
  }, [notice]);

  async function loadAll() {
    const [categoriesData, productsData] = await Promise.all([
      fetchCategories(),
      fetchProducts(),
    ]);
    setCategories(categoriesData);
    setProducts(productsData);
    const activeOnes = categoriesData.filter((c) => c.isActive);
    if (activeOnes.length > 0 && !activeOnes.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(activeOnes[0].id);
    } else if (activeOnes.length === 0) {
      setActiveCategoryId(null);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddProduct() {
    if (!activeCategoryId || !newProduct.name.trim() || !newProduct.price) return;
    await createProduct({
      categoryId: activeCategoryId,
      name: newProduct.name.trim(),
      description: newProduct.description.trim() || undefined,
      price: Number(newProduct.price),
      costPrice: newProduct.costPrice ? Number(newProduct.costPrice) : undefined,
      translations: newTranslations,
      badges: newBadges,
    });
    setNewProduct({ name: '', description: '', price: '', costPrice: '' });
    setNewTranslations({});
    setNewBadges([]);
    setIsAddingProduct(false);
    loadAll();
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setEditTranslations(product.translations ?? {});
    setEditBadges(resolveDeclaredBadges(product.badges));
    setEditForm({
      name: product.name,
      description: product.description ?? '',
      price: String(product.price),
      costPrice: product.costPrice != null ? String(product.costPrice) : '',
    });
  }

  function errorText(err: unknown, fallback: string): string {
    const message = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && message.length > 0) return message.map(String).join(' ');
    return fallback;
  }

  async function handleSaveEdit() {
    if (!editingProduct || isSavingEdit) return;
    const productId = editingProduct.id;
    setIsSavingEdit(true);
    try {
      await updateProduct(productId, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        price: Number(editForm.price),
        costPrice: editForm.costPrice ? Number(editForm.costPrice) : null,
        translations: editTranslations,
        badges: editBadges,
      } as Partial<Product>);
      // Confere no servidor: se os badges não voltaram, algo não gravou (ex.: backend ainda
      // na versão antiga, que descarta o campo sem avisar). Melhor avisar do que fechar em silêncio.
      const fresh = await fetchProducts();
      const saved = fresh.find((p) => p.id === productId);
      if (resolveDeclaredBadges(saved?.badges).join(',') !== editBadges.join(',')) {
        setNotice({
          kind: 'error',
          text: 'Os dados do produto foram salvos, mas os badges não. Confirme que o backend está rodando a versão nova (reinicie o npm run start:dev e rode a migration) e tente de novo.',
        });
        loadAll();
        return;
      }
      setEditingProduct(null);
      loadAll();
      setNotice({ kind: 'success', text: 'Produto salvo.' });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err, 'Não foi possível salvar o produto. Tente de novo.') });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleToggleAvailability(product: Product) {
    await updateProduct(product.id, { isAvailable: !product.isAvailable });
    loadAll();
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm('Remover este produto do cardápio?')) return;
    await deleteProduct(id);
    loadAll();
  }

  const activeCategories = categories.filter((c) => c.isActive);
  // Itens por categoria (o gerenciador mostra e usa pra decidir excluir × desativar).
  const productCounts: Record<string, number> = {};
  for (const p of products) productCounts[p.categoryId] = (productCounts[p.categoryId] ?? 0) + 1;
  const productsInCategory = products.filter((p) => p.categoryId === activeCategoryId);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Carregando...</div>;
  }

  return (
    <div className="p-6 pl-4 max-w-6xl">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-6">
        Cardápio
      </h1>

      <div className="flex gap-6">
        <div className="w-80 shrink-0">
          <div className="flex flex-col gap-1 mb-3">
            {activeCategories.map((category) => {
              const Icon = getCategoryIcon(category.key, category.name);
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategoryId(category.id)}
                  title={category.name}
                  className={`text-left px-3 py-2 rounded-lg text-[13px] font-medium flex items-center gap-2.5 group ${
                    activeCategoryId === category.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-5 flex justify-center shrink-0">
                    {Icon && <Icon size={18} />}
                  </span>
                  <span className="flex-1 whitespace-nowrap">{category.name}</span>
                </button>
              );
            })}
          </div>

          {/* Escolher, criar, reordenar e remover categorias: tudo num lugar só. */}
          <button
            onClick={() => setIsManagerOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 bg-gray-900 text-white rounded-lg px-3 py-2 text-xs font-semibold"
          >
            <SlidersHorizontal size={14} />
            Gerenciar categorias
          </button>
        </div>

        <div className="flex-1 min-w-0">
          {!activeCategoryId ? (
            <p className="text-sm text-gray-400">
              Escolha as categorias do seu cardápio para começar a cadastrar produtos.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-3 text-xs text-gray-500 leading-relaxed">
                <Info size={14} className="shrink-0 mt-0.5 text-gray-400" />
                <p>
                  <span className="font-semibold text-gray-700">Foto do item:</span> use uma imagem{' '}
                  <span className="font-semibold text-gray-700">quadrada (1:1), de 1080 × 1080 px</span> — mínimo 800 × 800 px.
                  Formatos JPG, PNG ou WebP, até 5 MB. Deixe o prato bem no centro: no cardápio do cliente a foto é
                  cortada nas bordas, principalmente em cima e embaixo na tela do item.{' '}
                  <span className="font-semibold text-gray-700">Até {MAX_PRODUCT_IMAGES} fotos por item</span> (a primeira é a capa;
                  com 2 ou mais, o cliente vê um carrossel). Para adicionar, trocar ou reordenar, clique no item.
                </p>
              </div>
              <div className="flex flex-col gap-3 mb-4">
                {productsInCategory.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => openEditProduct(product)}
                    className="bg-white border border-gray-100 rounded-xl p-3 flex gap-3 cursor-pointer hover:border-gray-300 transition-colors"
                  >
                    <div
                      title={getProductImages(product).length > 0 ? 'Editar fotos do item' : 'Adicionar fotos ao item'}
                      className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center relative"
                    >
                      {getProductImages(product).length > 0 ? (
                        <img
                          src={getProductImages(product)[0]}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon size={18} className="text-gray-300" />
                      )}
                      {getProductImages(product).length > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[10px] font-semibold px-1.5 rounded-full">
                          {getProductImages(product).length}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {product.name}
                      </p>
                      {product.description && (
                        <p className="text-xs text-gray-400 truncate">
                          {product.description}
                        </p>
                      )}
                      <p className="text-sm font-bold text-gray-900 mt-1">
                        R$ {Number(product.price).toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    <div className="flex flex-col items-end justify-between shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }}>
                        <Trash2 size={15} className="text-gray-300" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleAvailability(product); }}
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          product.isAvailable
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {product.isAvailable ? 'Disponível' : 'Indisponível'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {isAddingProduct ? (
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-2">
                  <input
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Nome do produto"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={newProduct.description}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, description: e.target.value }))
                    }
                    placeholder="Descrição (opcional)"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <TranslationFields
                    kind="product"
                    fields={['name', 'description']}
                    source={{ name: newProduct.name, description: newProduct.description }}
                    value={newTranslations}
                    onChange={setNewTranslations}
                  />
                  <CurrencyField
                    value={newProduct.price}
                    onChange={(raw) => setNewProduct((p) => ({ ...p, price: raw }))}
                    placeholder="Preço (ex: R$ 24,90)"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <CurrencyField
                    value={newProduct.costPrice}
                    onChange={(raw) => setNewProduct((p) => ({ ...p, costPrice: raw }))}
                    placeholder="Custo (opcional) — para o CMV real na Análise"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <ProductBadgesEditor value={newBadges} onChange={setNewBadges} />
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setIsAddingProduct(false)}
                      className="flex-1 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleAddProduct}
                      className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold"
                    >
                      Salvar produto
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingProduct(true)}
                  className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 flex items-center justify-center gap-1.5"
                >
                  <Plus size={15} />
                  Adicionar produto
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editingProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-3 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
            className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <p id="edit-product-title" className="font-display font-bold text-gray-900">
                Editar produto
              </p>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                aria-label="Fechar"
                title="Fechar"
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="scroll-modern flex-1 min-h-0 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 items-start">
                {/* Coluna esquerda: fotos e dados básicos */}
                <div className="flex flex-col gap-3 min-w-0">
                  <ProductImagesEditor
                    key={editingProduct.id}
                    product={editingProduct}
                    onChange={(updated) => {
                      setEditingProduct(updated);
                      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                    }}
                  />

                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Nome do produto"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={editForm.description}
                    onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Descrição (opcional)"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <TranslationFields
                    kind="product"
                    fields={['name', 'description']}
                    source={{ name: editForm.name, description: editForm.description }}
                    value={editTranslations}
                    onChange={setEditTranslations}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CurrencyField
                      value={editForm.price}
                      onChange={(raw) => setEditForm((p) => ({ ...p, price: raw }))}
                      placeholder="Preço"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                    <CurrencyField
                      value={editForm.costPrice}
                      onChange={(raw) => setEditForm((p) => ({ ...p, costPrice: raw }))}
                      placeholder="Custo (opcional) — para o CMV real na Análise"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>

                {/* Coluna direita: selos e opções */}
                <div className="flex flex-col gap-4 min-w-0">
                  <ProductBadgesEditor value={editBadges} onChange={setEditBadges} autoBadges={editingProduct.autoBadges} />

                  <ProductOptionsEditor
                    product={editingProduct}
                    onSaved={(updated) => {
                      setEditingProduct(updated);
                      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-5 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-60"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              notice.kind === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {notice.kind === 'success' ? (
              <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            )}
            <span className="leading-snug">{notice.text}</span>
          </div>
        </div>
      )}

      {isManagerOpen && (
        <CategoryManager
          categories={categories}
          productCounts={productCounts}
          onClose={() => setIsManagerOpen(false)}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}
