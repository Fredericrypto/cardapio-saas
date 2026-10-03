import { useEffect, useState } from 'react';
import { Plus, Trash2, Image as ImageIcon, Info, SlidersHorizontal } from 'lucide-react';
import {
  fetchCategories,
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
} from '../lib/admin-api';
import { ProductOptionsEditor } from '../components/ProductOptionsEditor';
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
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '' });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', price: '' });

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
    });
    setNewProduct({ name: '', description: '', price: '' });
    setIsAddingProduct(false);
    loadAll();
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      description: product.description ?? '',
      price: String(product.price),
    });
  }

  async function handleSaveEdit() {
    if (!editingProduct) return;
    await updateProduct(editingProduct.id, {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined,
      price: Number(editForm.price),
    } as Partial<Product>);
    setEditingProduct(null);
    loadAll();
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

  async function handleImageUpload(productId: string, file: File) {
    await uploadProductImage(productId, file);
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
                  cortada nas bordas, principalmente em cima e embaixo na tela do item. Para trocar, clique na miniatura.
                </p>
              </div>
              <div className="flex flex-col gap-3 mb-4">
                {productsInCategory.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => openEditProduct(product)}
                    className="bg-white border border-gray-100 rounded-xl p-3 flex gap-3 cursor-pointer hover:border-gray-300 transition-colors"
                  >
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center cursor-pointer relative"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon size={18} className="text-gray-300" />
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(product.id, file);
                        }}
                      />
                    </label>

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
                  <input
                    type="number"
                    step="0.01"
                    value={newProduct.price}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, price: e.target.value }))
                    }
                    placeholder="Preço (ex: 24.90)"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                  />
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
            <p className="font-display font-bold text-gray-900">Editar produto</p>

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
            <input
              type="number"
              step="0.01"
              value={editForm.price}
              onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
              placeholder="Preço"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold"
              >
                Salvar alterações
              </button>
            </div>

            <ProductOptionsEditor
              product={editingProduct}
              onSaved={(updated) => {
                setEditingProduct(updated);
                setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              }}
            />
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
