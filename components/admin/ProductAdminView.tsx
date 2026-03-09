import React, { useState, useMemo, useEffect } from 'react';
import { Product, Supplier } from '../../types';
import { isDeleted } from '../../utils/productFilters';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { ProductEditModal } from './ProductEditModal';
import { MassPriceUpdateModal } from './MassPriceUpdateModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface ProductAdminViewProps {
  products: Product[];
  suppliers: Supplier[];
  refreshProducts: () => void;
  isLoading: boolean;
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const ProductAdminView: React.FC<ProductAdminViewProps> = ({
  products: _legacyProducts,
  suppliers: _legacySuppliers,
  refreshProducts: _legacyRefreshProducts,
  isLoading: _legacyIsLoading,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [providerFilter, setProviderFilter] = useState('All');
  const [onlineFilter, setOnlineFilter] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [isMassUpdateOpen, setIsMassUpdateOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const [categoriesData, setCategoriesData] = useState<{ [key: string]: string[] }>({});

  const { addToast } = useToast();

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const refreshProducts = async () => {
    setIsLoading(true);
    try {
      const [p, s, c] = await Promise.all([
        api.getProductsSupabase(),
        api.getSuppliersSupabase(),
        api.getCategoriesSupabase(),
      ]);
      setProducts(p);
      setSuppliers(s);
      setCategories(c);

      // Estructurar categorías para el modal y filtros
      const structuredData: { [key: string]: string[] } = {};
      c.forEach((cat: any) => {
        const name = cat.name.toUpperCase();
        if (!structuredData[name]) structuredData[name] = [];
      });
      // Nota: st_categories no tiene subcategorías en este diseño simplificado aún
      // pero mantenemos la estructura para compatibilidad con el modal
      setCategoriesData(structuredData);
    } catch (error) {
      console.error('Error fetching Supabase data:', error);
      addToast('Error al cargar datos desde Supabase.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProducts();
  }, []);

  const { providers } = useMemo(() => {
    const uniqueProviders = new Set(products.map((p) => p.Proveedor).filter(Boolean));
    return { providers: ['All', ...Array.from(uniqueProviders).sort()] };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();

    return products
      .filter((p) => {
        // Filtrar productos eliminados (aunque getProductsSupabase ya lo hace)
        if (isDeleted(p.Eliminado)) return false;

        const matchesOnline =
          onlineFilter === 'All' || (onlineFilter === 'Yes' ? !!p.Online : !p.Online);

        const matchesActive =
          activeFilter === 'All' || (activeFilter === 'Active' ? !!p.Activo : !p.Activo);

        const matchesCategory = categoryFilter === 'All' || p.Categoria === categoryFilter;
        const matchesProvider = providerFilter === 'All' || p.Proveedor === providerFilter;

        const matchesSearch =
          String(p.Producto || '').toLowerCase().includes(lowerSearchTerm) ||
          String(p.cod || '').toLowerCase().includes(lowerSearchTerm) ||
          String(p.Descripcion || '').toLowerCase().includes(lowerSearchTerm) ||
          String((p as any)['cod.barras'] || '').toLowerCase().includes(lowerSearchTerm);

        return matchesCategory && matchesProvider && matchesOnline && matchesActive && matchesSearch;
      })
      .sort((a, b) => (a.Producto || '').localeCompare(b.Producto || ''));
  }, [products, searchTerm, categoryFilter, providerFilter, onlineFilter, activeFilter]);

  const handleEditProduct = (product: Product) => {
    setProductToEdit(product);
    setIsEditModalOpen(true);
  };

  const handleNewProduct = () => {
    setProductToEdit(null);
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = async (productData: Partial<Product> & { cod: string }) => {
    try {
      setIsProcessingAction(true);
      
      // Lookup de IDs
      const category = categories.find(c => c.name.toUpperCase() === (productData.Categoria || '').toUpperCase());
      const supplier = suppliers.find(s => s.nombre.toUpperCase() === (productData.Proveedor || '').toUpperCase());

      const dataWithIds = {
        ...productData,
        category_id: category?.id,
        supplier_id: supplier?.id,
      };

      if (productToEdit) {
        await api.updateProductSupabase(dataWithIds);
      } else {
        await api.addProductSupabase(dataWithIds);
      }

      await refreshProducts();
      addToast('Producto guardado en Supabase con éxito.', 'success');
      setIsEditModalOpen(false);
    } catch (error) {
      console.error('Failed to save product to Supabase:', error);
      addToast(
        `Error al guardar el producto: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'error'
      );
      throw error;
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleToggleStatus = (product: Product, field: 'Activo' | 'Online') => {
    const newValue = !product[field];
    const fieldName = field === 'Activo' ? 'estado' : 'visibilidad online';
    const newStatus = newValue ? (field === 'Activo' ? 'Activo' : 'Sí') : field === 'Activo' ? 'Inactivo' : 'No';

    const action = async () => {
      setIsProcessingAction(true);
      try {
        await api.updateProductSupabase({ cod: product.cod, [field]: newValue } as any);
        addToast(`El producto se ha actualizado a "${newStatus}" en Supabase.`, 'success');
        await refreshProducts();
      } catch (error) {
        console.error(`Failed to toggle ${field} status in Supabase`, error);
        addToast(`No se pudo actualizar el producto en Supabase.`, 'error');
      } finally {
        setIsProcessingAction(false);
        setConfirmModalState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
      }
    };

    setConfirmModalState({
      isOpen: true,
      title: `Confirmar Cambio de ${fieldName}`,
      message: `¿Está seguro que desea cambiar el ${fieldName} de "${product.Producto}" a "${newStatus}"?`,
      onConfirm: action,
    });
  };

  const handleDeleteProduct = (product: Product) => {
    const action = async () => {
      setIsProcessingAction(true);
      try {
        await api.deleteProductSupabase(product.cod);
        addToast('Producto eliminado lógicamente de Supabase.', 'success');
        await refreshProducts();
      } catch (error) {
        console.error('Failed to delete product from Supabase', error);
        addToast(
          `Error al eliminar el producto: ${error instanceof Error ? error.message : 'Error desconocido'}`,
          'error'
        );
      } finally {
        setIsProcessingAction(false);
        setConfirmModalState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
      }
    };

    setConfirmModalState({
      isOpen: true,
      title: 'Eliminar Producto (Borrado Lógico)',
      message: `¿Está seguro que desea eliminar el producto "${product.Producto}" de Supabase?`,
      onConfirm: action,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Administrador de Productos</h1>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setIsCategoryManagerOpen(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center space-x-2"
          >
            <Icon
              path="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
              className="w-5 h-5"
            />
            <span>Gestionar Categorías</span>
          </button>

          <button
            onClick={handleNewProduct}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5" />
            <span>Nuevo Producto</span>
          </button>

          <button
            onClick={() => setIsMassUpdateOpen(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <Icon
              path="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
              className="w-5 h-5"
            />
            <span>Actualización Masiva de Precios</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:flex-grow border-gray-300 rounded-md shadow-sm"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full md:w-auto border-gray-300 rounded-md shadow-sm"
        >
          <option value="All">Todas las Categorías</option>
          {Object.keys(categoriesData)
            .sort()
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>

        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="w-full md:w-auto border-gray-300 rounded-md shadow-sm"
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {p === 'All' ? 'Todos los Proveedores' : p}
            </option>
          ))}
        </select>

        <select
          value={onlineFilter}
          onChange={(e) => setOnlineFilter(e.target.value)}
          className="w-full md:w-auto border-gray-300 rounded-md shadow-sm"
        >
          <option value="All">Estado Online (Todos)</option>
          <option value="Yes">Sí</option>
          <option value="No">No</option>
        </select>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="w-full md:w-auto border-gray-300 rounded-md shadow-sm"
        >
          <option value="All">Estado (Todos)</option>
          <option value="Active">Activo</option>
          <option value="Inactive">Inactivo</option>
        </select>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          {isLoading ? (
            <div className="p-10 text-center text-gray-500">Cargando productos...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. Costo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. Venta</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mínimo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="relative px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product) => {
                  const isLowStock =
                    product.Activo && (product as any).stockk < (product as any).Minimo && (product as any).Minimo > 0;

                  return (
                    <tr key={product.cod} className={`hover:bg-gray-50 ${isLowStock ? 'bg-orange-50' : ''}`}>
                      <td className="px-4 py-3">
                        <img
                          src={(product as any).FOTOGRAFIA || 'https://via.placeholder.com/150'}
                          alt={product.Producto}
                          className="w-16 h-16 object-cover rounded-md"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150';
                          }}
                        />
                      </td>

                      <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs truncate" title={product.Producto}>
                        {product.Producto}
                      </td>

                      <td className="px-4 py-3 text-sm text-right">{formatCurrency((product as any)['P.Costo'] || 0)}</td>

                      <td className="px-4 py-3 text-sm text-right font-bold">
                        {formatCurrency((product as any)['Precio Final'] || 0)}
                      </td>

                      <td className="px-4 py-3 text-sm text-center font-semibold">{(product as any).stockk ?? 0}</td>

                      <td className="px-4 py-3 text-sm text-center">{(product as any).Minimo ?? 0}</td>

                      <td className="px-4 py-3 text-sm text-gray-600">{product.Categoria}</td>

                      <td className="px-4 py-3 text-center">
                        <span
                          onClick={() => handleToggleStatus(product, 'Activo')}
                          title="Clic para cambiar estado"
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer ${
                            product.Activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {product.Activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end items-center space-x-2">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Editar Producto"
                          >
                            <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </button>

                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="text-red-600 hover:text-red-800"
                            title="Eliminar Producto"
                          >
                            <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ProductEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        product={productToEdit}
        onSave={handleSaveProduct}
        categoriesData={categoriesData}
        allProducts={products}
        providers={suppliers
          .filter((s: any) => s.activo !== false)
          .map((s: any) => s.nombre)
          .sort()}
        categories={categories}
        suppliers={suppliers}
      />

      <MassPriceUpdateModal
        isOpen={isMassUpdateOpen}
        onClose={() => setIsMassUpdateOpen(false)}
        categories={Object.keys(categoriesData)}
        providers={providers.filter((p) => p !== 'All')}
        onUpdate={refreshProducts}
      />

      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        onDataChange={() => {
          refreshProducts();
        }}
      />

      <ConfirmationModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState({ ...confirmModalState, isOpen: false })}
        onConfirm={confirmModalState.onConfirm}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText="Sí, Confirmar"
        isProcessing={isProcessingAction}
      />
    </div>
  );
};