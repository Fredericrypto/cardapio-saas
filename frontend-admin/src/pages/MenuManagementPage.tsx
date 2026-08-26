import { useEffect, useState } from 'react';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import {
  fetchCategories,
  createCategory,
  deleteCategory,
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
} from '../lib/admin-api';
import { ProductOptionsEditor } from '../components/ProductOptionsEditor';
import type { Category, Product } from '../types';

export function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [newCategoryName, setNewCategoryName] = useState('');
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
    if (categoriesData.length > 0 && !activeCategoryId) {
      setActiveCategoryId(categoriesData[0].id);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    await createCategory({ name: newCategoryName.trim() });
    setNewCategoryName('');
    loadAll();
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Remover esta categoria? Os produtos dentro dela também somem do cardápio.')) return;
    await deleteCategory(id);
    if (activeCategoryId === id) setActiveCategoryId(null);
    loadAll();
  }

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

  const productsInCategory = products.filter((p) => p.categoryId === activeCategoryId);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Carregando...</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-xl font-bold text-gray-900 mb-6">
        Cardápio
      </h1>

      <div className="flex gap-6">
        <div className="w-56 shrink-0">
          <div className="flex flex-col gap-1 mb-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between items-center group ${
                  activeCategoryId === category.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {category.name}
                <Trash2
                  size={13}
                  className="opacity-0 group-hover:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(category.id);
                  }}
                />
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Nova categoria"
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none"
            />
            <button
              onClick={handleAddCategory}
              className="bg-gray-900 text-white rounded-lg px-2.5 shrink-0"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {!activeCategoryId ? (
            <p className="text-sm text-gray-400">
              Crie uma categoria para começar a cadastrar produtos.
            </p>
          ) : (
            <>
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
    </div>
  );
}
