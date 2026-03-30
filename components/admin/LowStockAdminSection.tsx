
import React, { useEffect, useMemo, useState } from 'react';
import { Product, Supplier } from '../../types';
import { Icon } from '../ui/Icon';
import { ProductEditModal } from './ProductEditModal';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../services/api';

interface LowStockAdminSectionProps {
  products: Product[];
  suppliers: Supplier[];
}

export const LowStockAdminSection: React.FC<LowStockAdminSectionProps> = ({ products }) => {
  type LocalProduct = Product & { category_id?: string; supplier_id?: string };
  type CategoryOption = { id: string; name: string };

  const [localProducts, setLocalProducts] = useState<LocalProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LocalProduct | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useToast();
  const NO_PROVIDER_FILTER = '__NO_PROVIDER__';

  useEffect(() => {
    setLocalProducts((products || []) as LocalProduct[]);
  }, [products]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await api.getCategoriesSupabase();
        const normalized = (Array.isArray(data) ? data : [])
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            name: String(item?.name || '').trim(),
          }))
          .filter((item: CategoryOption) => item.id !== '' && item.name !== '');
        setCategories(normalized);
      } catch {
        setCategories([]);
      }
    };

    void loadCategories();
  }, []);

  const getProviderFilterValue = (provider?: string): string => {
    const raw = String(provider || '').trim();
    return raw ? raw : NO_PROVIDER_FILTER;
  };

  const getProviderLabel = (filterValue: string): string => {
    if (filterValue === 'All') return 'Todos';
    if (filterValue === NO_PROVIDER_FILTER) return 'Sin proveedor';
    return filterValue;
  };

  const getStock = (product: Product): number => Number(product.stockk ?? 0);
  const getMinStock = (product: Product): number => Number(product.Minimo ?? 0);

  const getStockStatus = (product: Product): 'sin-stock' | 'bajo-stock' | 'ok' => {
    const stock = getStock(product);
    const min = getMinStock(product);
    if (stock <= 0) return 'sin-stock';
    if (min > 0 && stock > 0 && stock <= min) return 'bajo-stock';
    return 'ok';
  };

  const getMissing = (product: Product): number => {
    const stock = getStock(product);
    const min = getMinStock(product);
    return Math.max(min - stock, 0);
  };

  const normalize = (value: string): string =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const getCategoryLabel = (product: Product): string => String(product.Categoria || '').trim();

  const openEditModal = (product: LocalProduct) => {
    setSelectedProduct(product);
    setIsEditModalOpen(true);
  };

  const categoriesData = useMemo(() => {
    const map: Record<string, string[]> = {};
    localProducts.forEach((product) => {
      const category = String(product.Categoria || '').trim();
      const subCategory = String(product['Sub Categoria'] || '').trim();
      if (!category) return;
      if (!map[category]) map[category] = [];
      if (subCategory && !map[category].includes(subCategory)) {
        map[category].push(subCategory);
      }
    });

    Object.keys(map).forEach((key) => {
      map[key] = [...map[key]].sort((a, b) => a.localeCompare(b));
    });

    return map;
  }, [localProducts]);

  const allLowStockProducts = useMemo(() => {
    return localProducts.filter((product) => {
      if (!product.Activo) return false;
      return getStockStatus(product) !== 'ok';
    });
  }, [localProducts]);

  const filteredLowStock = useMemo(() => {
    const normalizedSearch = normalize(searchTerm);

    const filtered = allLowStockProducts.filter((product) => {
      const matchesProvider =
        providerFilter === 'All' || getProviderFilterValue(product.Proveedor) === providerFilter;
      const matchesCategory =
        categoryFilter === 'All' || getCategoryLabel(product) === categoryFilter;
      const matchesSearch =
        normalizedSearch === '' ||
        normalize(product.Producto || '').includes(normalizedSearch) ||
        normalize(product.cod || '').includes(normalizedSearch);

      return matchesProvider && matchesCategory && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      const statusRank = (product: Product): number => {
        const status = getStockStatus(product);
        if (status === 'sin-stock') return 0;
        if (status === 'bajo-stock') return 1;
        return 2;
      };

      const rankDiff = statusRank(a) - statusRank(b);
      if (rankDiff !== 0) return rankDiff;

      const missingDiff = getMissing(b) - getMissing(a);
      if (missingDiff !== 0) return missingDiff;

      const aStock = getStock(a);
      const bStock = getStock(b);
      const aMin = getMinStock(a);
      const bMin = getMinStock(b);
      const aRatio = aMin > 0 ? aStock / aMin : Number.POSITIVE_INFINITY;
      const bRatio = bMin > 0 ? bStock / bMin : Number.POSITIVE_INFINITY;
      if (aRatio !== bRatio) {
        return aRatio - bRatio;
      }

      return String(a.Producto || '').localeCompare(String(b.Producto || ''));
    });
  }, [allLowStockProducts, providerFilter, categoryFilter, searchTerm]);

  const activeProviders = useMemo(() => {
    const providerValues = Array.from(
      new Set(allLowStockProducts.map((p) => getProviderFilterValue(p.Proveedor)))
    );

    const namedProviders = providerValues
      .filter((value) => value !== NO_PROVIDER_FILTER)
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    const hasNoProvider = providerValues.includes(NO_PROVIDER_FILTER);
    return ['All', ...namedProviders, ...(hasNoProvider ? [NO_PROVIDER_FILTER] : [])];
  }, [allLowStockProducts]);

  const activeCategories = useMemo(() => {
    const categoriesSet = new Set(
      allLowStockProducts
        .map((product) => getCategoryLabel(product))
        .filter((category) => category !== '')
    );
    return ['All', ...Array.from(categoriesSet).sort((a, b) => a.localeCompare(b))];
  }, [allLowStockProducts]);

  const providerFilterLabel = getProviderLabel(providerFilter);

  const handleSaveProduct = async (
    productData: Partial<Product> & { cod: string; category_id?: string; supplier_id?: string }
  ) => {
    if (!selectedProduct) return;

    setIsSaving(true);
    try {
      await api.updateProductSupabase(productData);
      setLocalProducts((prev) =>
        prev.map((product) =>
          product.cod === selectedProduct.cod
            ? {
                ...product,
                ...productData,
              }
            : product
        )
      );
      setIsEditModalOpen(false);
      setSelectedProduct(null);
      addToast('Producto actualizado correctamente.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      addToast(`No se pudo guardar el producto: ${message}`, 'error');
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-6 h-6 text-orange-500" />
            Productos bajo stock / sin stock
          </h2>
          <p className="text-sm text-gray-500 mt-1">Control operativo de mercadería crítica</p>
        </div>

        <div className="text-sm text-gray-600">
          Total críticos: <span className="font-semibold text-gray-900">{filteredLowStock.length}</span>
          {providerFilter !== 'All' ? ` · ${providerFilterLabel}` : ''}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por producto o código"
            className="border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
          />

          <select 
            value={providerFilter} 
            onChange={(e) => setProviderFilter(e.target.value)}
            className="border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="All">Todos los proveedores</option>
            {activeProviders.filter((provider) => provider !== 'All').map((provider) => (
              <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="All">Todos los rubros</option>
            {activeCategories.filter((category) => category !== 'All').map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código / SKU</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría / Rubro</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock actual</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock mínimo</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Faltante</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLowStock.length > 0 ? filteredLowStock.map((p) => {
                const stock = getStock(p);
                const min = getMinStock(p);
                const missing = getMissing(p);
                const status = getStockStatus(p);
                const statusLabel = status === 'sin-stock' ? 'Sin stock' : 'Bajo stock';

                return (
                  <tr key={p.cod} className={`hover:bg-gray-50 ${status === 'sin-stock' ? 'bg-red-50/40' : 'bg-orange-50/30'}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.Producto}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">{p.cod}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{getCategoryLabel(p) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{p.Proveedor || 'Sin proveedor'}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${stock <= 0 ? 'text-red-600' : 'text-orange-600'}`}>{stock}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">{min}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold text-blue-700">{missing}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status === 'sin-stock' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                      >
                        <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-500">
                    No hay productos críticos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductEditModal
        isOpen={isEditModalOpen}
        onClose={isSaving ? () => {} : () => { setIsEditModalOpen(false); setSelectedProduct(null); }}
        product={selectedProduct}
        onSave={handleSaveProduct}
        categoriesData={categoriesData}
        allProducts={localProducts}
        providers={Array.from(new Set(localProducts.map((p) => String(p.Proveedor || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))}
        categories={categories}
        suppliers={[]}
      />
    </div>
  );
};
