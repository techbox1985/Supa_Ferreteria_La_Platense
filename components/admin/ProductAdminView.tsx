import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, Supplier } from '../../types';
import { isDeleted, matchesProductSearch, sanitizeProductDisplayText } from '../../utils/productFilters';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { ProductEditModal } from './ProductEditModal';
import { MassPriceUpdateModal } from './MassPriceUpdateModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';

type CategoryRow = {
  id: string;
  name: string;
};

type CategoryTreeNode = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

type SupplierRow = Supplier & {
  id?: string;
  nombre?: string;
  activo?: boolean;
  name?: string;
};

type ProductRow = Product & {
  category_id?: string;
  supplier_id?: string;
};

interface ProductAdminViewProps {
  products: Product[];
  suppliers: Supplier[];
  refreshProducts: () => void;
  isLoading: boolean;
}

type SortKey =
  | 'Producto'
  | 'cod'
  | 'Categoria'
  | 'Proveedor'
  | 'P.Costo'
  | 'Precio Final'
  | 'stockk'
  | 'Minimo'
  | 'Online'
  | 'Activo'
  | 'Ultima.Actualizacion';

type SortDirection = 'asc' | 'desc';

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const getSupplierName = (supplier: SupplierRow): string =>
  String(supplier.nombre || supplier.name || supplier.Nombre || '').trim();

const resolveProductProviderName = (
  product: ProductRow,
  supplierNameById: Map<string, string>
): string => {
  const directName = String(product.Proveedor || '').trim();
  if (directName) return directName;
  const supplierId = String(product.supplier_id || '').trim();
  if (!supplierId) return '';
  return String(supplierNameById.get(supplierId) || '').trim();
};

const getProductDisplayName = (product: ProductRow): string => sanitizeProductDisplayText(product.Producto);
const getProductDisplayCategory = (product: ProductRow): string => sanitizeProductDisplayText(product.Categoria);
const getProductDisplayProvider = (product: ProductRow, supplierNameById: Map<string, string>): string =>
  sanitizeProductDisplayText(resolveProductProviderName(product, supplierNameById));

const formatDateTime = (value: any): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PRODUCT_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

export const ProductAdminView: React.FC<ProductAdminViewProps> = ({
  products: initialProducts,
  suppliers: initialSuppliers,
}) => {
  const [products, setProducts] = useState<ProductRow[]>(
    Array.isArray(initialProducts) ? (initialProducts as ProductRow[]) : []
  );
  const [suppliers, setSuppliers] = useState<SupplierRow[]>(
    Array.isArray(initialSuppliers) ? (initialSuppliers as SupplierRow[]) : []
  );
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(
    !Array.isArray(initialProducts) || initialProducts.length === 0
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilterId, setCategoryFilterId] = useState('All');
  const [providerFilter, setProviderFilter] = useState('All');
  const [onlineFilter, setOnlineFilter] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'Producto',
    direction: 'asc',
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductRow | null>(null);

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
  const [kitAvailabilityByCode, setKitAvailabilityByCode] = useState<Map<string, number>>(new Map());

  // Scroll horizontal sincronizado
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const isSyncingScroll = useRef(false);
  const brokenImageUrlsRef = useRef<Set<string>>(new Set());
  const [tableWidth, setTableWidth] = useState(0);

  const categoryNameById = useMemo(() => {
    const entries = categories
      .map((category) => [String(category.id || '').trim(), String(category.name || '').trim()] as const)
      .filter(([id, name]) => id !== '' && name !== '');
    return new Map(entries);
  }, [categories]);

  const supplierNameById = useMemo(() => {
    const entries = suppliers
      .map((supplier) => [String(supplier.id || '').trim(), getSupplierName(supplier)] as const)
      .filter(([id, name]) => id !== '' && name !== '');
    return new Map(entries);
  }, [suppliers]);

  useEffect(() => {
    setProducts(Array.isArray(initialProducts) ? (initialProducts as ProductRow[]) : []);
  }, [initialProducts]);

  useEffect(() => {
    setSuppliers(Array.isArray(initialSuppliers) ? (initialSuppliers as SupplierRow[]) : []);
  }, [initialSuppliers]);

  useEffect(() => {
    const kits = products.filter((product) => (product as any).product_type === 'kit');
    if (kits.length === 0) {
      setKitAvailabilityByCode(new Map());
      return;
    }

    let isCancelled = false;
    void (async () => {
      const entries = await Promise.all(
        kits.map(async (product) => {
          const cod = String(product.cod || '').trim();
          const id = String((product as any).id || '').trim();
          if (!cod) return null;
          if (!id) return [cod, 0] as const;
          try {
            const availability = await api.getKitAvailability(id);
            return [cod, Number(availability || 0)] as const;
          } catch {
            return [cod, 0] as const;
          }
        })
      );

      if (isCancelled) return;
      const nextMap = new Map<string, number>();
      entries.forEach((entry) => {
        if (!entry) return;
        nextMap.set(entry[0], entry[1]);
      });
      setKitAvailabilityByCode(nextMap);
    })();

    return () => {
      isCancelled = true;
    };
  }, [products]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const refreshProducts = async () => {
    setIsLocalLoading(true);
    try {
      const [p, s, categoryTreeResponse] = await Promise.all([
        api.getProductsSupabase(),
        api.getSuppliersSupabase(),
        api.getCategoryTreeSupabase(),
      ]);

      const normalizedTree: CategoryTreeNode[] = (Array.isArray(categoryTreeResponse) ? categoryTreeResponse : [])
        .map((node: any) => ({
          id: String(node?.id || '').trim(),
          name: String(node?.name || '').trim(),
          subcategories: Array.isArray(node?.subcategories)
            ? node.subcategories
                .map((sub: any) => ({ id: String(sub?.id || '').trim(), name: String(sub?.name || '').trim() }))
                .filter((sub: { id: string; name: string }) => sub.id !== '' && sub.name !== '')
            : [],
        }))
        .filter((node) => node.id !== '' && node.name !== '');

      const normalizedCategories: CategoryRow[] = normalizedTree
        .map((item: any) => ({
          id: String(item?.id || '').trim(),
          name: String(item?.name || '').trim(),
        }))
        .filter((item) => item.id !== '' && item.name !== '');

      const normalizedSuppliers: SupplierRow[] = Array.isArray(s)
        ? s.map((item: any) => item as SupplierRow)
        : [];

      const localCategoryNameById = new Map(
        normalizedCategories.map((category) => [category.id, category.name])
      );

      const normalizedProducts: ProductRow[] = (Array.isArray(p) ? p : []).map((item: any) => {
        const explicitCategoryId = String(item?.category_id || '').trim();
        const categoryName = explicitCategoryId
          ? localCategoryNameById.get(explicitCategoryId) || String(item?.Categoria || '').trim()
          : String(item?.Categoria || '').trim();
        const supplierId = String(item?.supplier_id || '').trim();
        const supplierName = supplierId
          ? getSupplierName((normalizedSuppliers.find((supplier) => String(supplier.id || '').trim() === supplierId) || {}) as SupplierRow)
          : '';

        return {
          ...(item as Product),
          category_id: explicitCategoryId || undefined,
          supplier_id: supplierId || undefined,
          Categoria: categoryName,
          Proveedor: String(item?.Proveedor || '').trim() || supplierName,
        };
      });

      const structuredData: { [key: string]: string[] } = {};
      normalizedTree.forEach((node) => {
        const categoryName = node.name;
        if (!categoryName) return;
        const subcategories = node.subcategories.map((sub) => sub.name).filter((subName) => subName !== '');
        structuredData[categoryName] = [...new Set(subcategories)];
      });

      Object.keys(structuredData).forEach((key) => {
        structuredData[key] = [...structuredData[key]].sort((a, b) => a.localeCompare(b));
      });

      setProducts(normalizedProducts);
      setSuppliers(normalizedSuppliers);
      setCategories(normalizedCategories);
      setCategoryTree(normalizedTree);
      setCategoriesData(structuredData);
    } catch (error) {
      console.error('Error fetching Supabase data:', error);
      addToast('Error al cargar datos desde Supabase.', 'error');
    } finally {
      setIsLocalLoading(false);
    }
  };

  useEffect(() => {
    void refreshProducts();
  }, []);

  const allProviderOptions = useMemo(() => {
    const uniqueProviders = new Set(
      suppliers
        .filter((supplier) => supplier.activo !== false)
        .map((supplier) => getSupplierName(supplier))
        .filter((name) => name !== '')
    );
    return ['All', ...Array.from(uniqueProviders).sort((a, b) => a.localeCompare(b))];
  }, [suppliers]);

  const baseFilteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (isDeleted(product.Eliminado)) return false;
      const matchesOnline =
        onlineFilter === 'All' || (onlineFilter === 'Yes' ? !!product.Online : !product.Online);
      const matchesActive =
        activeFilter === 'All' || (activeFilter === 'Active' ? !!product.Activo : !product.Activo);
      const matchesSearch = matchesProductSearch(product, debouncedSearch);
      return matchesOnline && matchesActive && matchesSearch;
    });
  }, [products, onlineFilter, activeFilter, debouncedSearch]);

  const categoryFilterOptions = useMemo(() => {
    const seenIds = new Set<string>();
    const options: CategoryRow[] = [];

    products
      .filter((product) => {
        if (isDeleted(product.Eliminado)) return false;
        if (providerFilter === 'All') return true;
        return resolveProductProviderName(product as ProductRow, supplierNameById) === providerFilter;
      })
      .forEach((product) => {
        const catId = String((product as ProductRow).category_id || '').trim();
        const catName = String(product.Categoria || '').trim();
        if (catId && catName && !seenIds.has(catId)) {
          seenIds.add(catId);
          options.push({ id: catId, name: catName });
        }
      });

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, providerFilter, supplierNameById]);

  const providerFilterOptions = useMemo(() => {
    const allowedProviders = new Set(
      baseFilteredProducts
        .filter((product) => {
          if (categoryFilterId === 'All') return true;
          return String(product.category_id || '') === categoryFilterId;
        })
        .map((product) => resolveProductProviderName(product, supplierNameById))
        .filter((name) => name !== '')
    );

    return ['All', ...Array.from(allowedProviders).sort((a, b) => a.localeCompare(b))];
  }, [baseFilteredProducts, categoryFilterId, supplierNameById]);

  useEffect(() => {
    if (categoryFilterId === 'All') return;
    const exists = categoryFilterOptions.some((category) => category.id === categoryFilterId);
    if (!exists) setCategoryFilterId('All');
  }, [categoryFilterId, categoryFilterOptions]);

  useEffect(() => {
    if (providerFilter === 'All') return;
    const exists = providerFilterOptions.includes(providerFilter);
    if (!exists) setProviderFilter('All');
  }, [providerFilter, providerFilterOptions]);

  const filteredProductsUnsorted = useMemo(() => {
    return baseFilteredProducts.filter((p) => {
      const matchesCategory = categoryFilterId === 'All' || p.category_id === categoryFilterId;
      const matchesProvider =
        providerFilter === 'All' || resolveProductProviderName(p, supplierNameById) === providerFilter;

      return matchesCategory && matchesProvider;
    });
  }, [baseFilteredProducts, categoryFilterId, providerFilter, supplierNameById]);

  const filteredProducts = useMemo(() => {
    const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
    const getVisibleStock = (product: ProductRow): number => {
      const isKit = (product as any).product_type === 'kit';
      if (!isKit) return Number((product as any).stockk ?? 0);
      const cod = String(product.cod || '').trim();
      return Number(kitAvailabilityByCode.get(cod) ?? 0);
    };

    const getSortValue = (product: ProductRow, key: SortKey): string | number => {
      switch (key) {
        case 'Producto':
          return getProductDisplayName(product);
        case 'cod':
          return String(product.cod || '');
        case 'Categoria':
          return getProductDisplayCategory(product);
        case 'Proveedor':
          return getProductDisplayProvider(product, supplierNameById);
        case 'P.Costo':
          return Number((product as any)['P.Costo'] ?? 0);
        case 'Precio Final':
          return Number((product as any)['Precio Final'] ?? 0);
        case 'stockk':
          return getVisibleStock(product);
        case 'Minimo':
          return Number((product as any).Minimo ?? 0);
        case 'Online':
          return product.Online ? 1 : 0;
        case 'Activo':
          return product.Activo ? 1 : 0;
        case 'Ultima.Actualizacion':
          return new Date((product as any)['Ultima.Actualizacion'] || 0).getTime() || 0;
        default:
          return '';
      }
    };

    const sorted = [...filteredProductsUnsorted].sort((a, b) => {
      const aValue = getSortValue(a, sortConfig.key);
      const bValue = getSortValue(b, sortConfig.key);

      let result = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        result = aValue - bValue;
      } else {
        result = collator.compare(String(aValue), String(bValue));
      }

      if (result === 0) {
        result = collator.compare(String(a.Producto || ''), String(b.Producto || ''));
      }

      return sortConfig.direction === 'asc' ? result : -result;
    });

    return sorted;
  }, [filteredProductsUnsorted, sortConfig, supplierNameById, kitAvailabilityByCode]);

  const showEmptyLoadingState = isLocalLoading && products.length === 0;
  const showEmptyResultsState = !isLocalLoading && filteredProducts.length === 0;

  useEffect(() => {
    const updateWidth = () => {
      if (tableRef.current) {
        setTableWidth(tableRef.current.scrollWidth);
      }
    };

    updateWidth();

    let observer: ResizeObserver | null = null;
    if (tableRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(tableRef.current);
    }

    window.addEventListener('resize', updateWidth);

    return () => {
      window.removeEventListener('resize', updateWidth);
      if (observer) observer.disconnect();
    };
  }, [filteredProducts.length]);

  const handleTopScroll = () => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const handleTableScroll = () => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    if (tableScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const handleEditProduct = (product: ProductRow) => {
    setProductToEdit(product);
    setIsEditModalOpen(true);
  };

  const handleNewProduct = () => {
    setProductToEdit(null);
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = async (
    productData: Partial<Product> & { cod: string; category_id?: string; supplier_id?: string; product_type?: 'simple' | 'kit'; kitComponents?: Array<{ cod: string; quantity: number }> }
  ) => {
    try {
      setIsProcessingAction(true);

      const resolvedCategoryId = String(productData.category_id || '').trim();
      const resolvedSupplierId = String(productData.supplier_id || '').trim();
      const resolvedCategoryName = resolvedCategoryId
        ? categoryNameById.get(resolvedCategoryId) || productData.Categoria
        : productData.Categoria;

      const { kitComponents, ...dataWithoutKit } = productData as any;
      // PROMPT 031: Propagar correctamente offer_price: null si corresponde
      let dataWithIds = {
        ...dataWithoutKit,
        id: productToEdit?.id, // Pass the original id for updates
        Categoria: resolvedCategoryName,
        category_id: resolvedCategoryId || undefined,
        supplier_id: resolvedSupplierId || undefined,
        product_type: (productData as any).product_type || 'simple',
      };
      if (
        ('Precio de Oferta' in dataWithIds) &&
        (dataWithIds['Precio de Oferta'] === null || dataWithIds['Precio de Oferta'] === undefined)
      ) {
        dataWithIds.offer_price = null;
      } else if ('Precio de Oferta' in dataWithIds) {
        dataWithIds.offer_price = dataWithIds['Precio de Oferta'];
      }

      const resolvedSupplierName = resolvedSupplierId
        ? supplierNameById.get(resolvedSupplierId) || productData.Proveedor || ''
        : productData.Proveedor || '';

      if (productToEdit) {
        await api.updateProductSupabase(dataWithIds);

        if ((productToEdit as any).id) {
          if ((productData as any).product_type === 'kit' && kitComponents && kitComponents.length > 0) {
            await api.saveProductKitComponents((productToEdit as any).id, kitComponents);
          } else {
            await api.saveProductKitComponents((productToEdit as any).id, []);
          }
        }

        setProducts((prev) =>
          prev.map((item) =>
            item.cod === dataWithIds.cod
              ? {
                  ...item,
                  ...dataWithIds,
                  Proveedor: resolvedSupplierName,
                  'Ultima.Actualizacion': new Date().toISOString(),
                }
              : item
          )
        );
      } else {
        const created = await api.addProductSupabase(dataWithIds);
        if ((productData as any).product_type === 'kit' && created?.id && kitComponents && kitComponents.length > 0) {
          await api.saveProductKitComponents(created.id, kitComponents);
        }

        const newProduct: ProductRow = {
          ...dataWithIds,
          cod: dataWithIds.cod,
          Producto: String(dataWithIds.Producto || '').trim(),
          Categoria: String(dataWithIds.Categoria || '').trim(),
          Proveedor: String(resolvedSupplierName || '').trim(),
          Activo: dataWithIds.Activo ?? true,
          Eliminado: false,
          'Ultima.Actualizacion': new Date().toISOString(),
        } as ProductRow;
        setProducts((prev) => [...prev, newProduct]);
      }

      setIsEditModalOpen(false);
      addToast('Producto guardado en Supabase con éxito.', 'success');
      void refreshProducts();
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
    const newStatus = newValue
      ? field === 'Activo'
        ? 'Activo'
        : 'Sí'
      : field === 'Activo'
      ? 'Inactivo'
      : 'No';

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

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortConfig.key !== key) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const renderSortableHeader = (label: string, key: SortKey, className: string) => (
    <th
      onClick={() => handleSort(key)}
      className={`${className} cursor-pointer select-none`}
      title={`Ordenar por ${label}`}
    >
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        <span className="text-[10px] text-gray-400">{getSortIndicator(key)}</span>
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-4xl font-bold text-slate-800">Administrador de Productos</h2>
          {isLocalLoading && (
            <p className="mt-2 text-sm text-slate-500">Cargando productos...</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsCategoryManagerOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-3 rounded-xl shadow-sm transition-colors"
          >
            Gestionar Categorías
          </button>

          <button
            onClick={handleNewProduct}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl shadow-sm transition-colors"
          >
            Nuevo Producto
          </button>

          <button
            onClick={() => setIsMassUpdateOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-3 rounded-xl shadow-sm transition-colors"
          >
            Actualización Masiva de Precios
          </button>

          <button
            onClick={() => {
              // Exportar todos los productos visibles a Excel
              import('../../utils/exportProductsExcel').then(({ exportProductsToExcel }) => {
                exportProductsToExcel(products);
              });
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-3 rounded-xl shadow-sm transition-colors"
            title="Exportar todos los productos a Excel para edición masiva"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Buscar producto, código o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-slate-300 rounded-lg px-4 py-2"
          />

          <select
            value={categoryFilterId}
            onChange={(e) => setCategoryFilterId(e.target.value)}
            className="border border-slate-300 rounded-lg px-4 py-2"
          >
            <option value="All">Todas las Categorías</option>
            {categoryFilterOptions
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>

          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-4 py-2"
          >
            <option value="All">Todos los Proveedores</option>
            {providerFilterOptions
              .filter((provider) => provider !== 'All')
              .map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <select
              value={onlineFilter}
              onChange={(e) => setOnlineFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            >
              <option value="All">Estado Online (Todos)</option>
              <option value="Yes">Online</option>
              <option value="No">Offline</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2"
            >
              <option value="All">Estado (Todos)</option>
              <option value="Active">Activos</option>
              <option value="Inactive">Inactivos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div
          ref={topScrollRef}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          style={{ height: 16, marginBottom: 2 }}
          onScroll={handleTopScroll}
        >
          <div style={{ width: tableWidth, height: 1 }} />
        </div>

        <div
          ref={tableScrollRef}
          className="overflow-x-auto max-h-[70vh]"
          onScroll={handleTableScroll}
        >
          <table ref={tableRef} className="min-w-300 w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                {renderSortableHeader('Producto', 'Producto', 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Código', 'cod', 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('P. Costo', 'P.Costo', 'px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('P. Venta', 'Precio Final', 'px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase')}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pricing</th>
                {renderSortableHeader('Stock', 'stockk', 'px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Mínimo', 'Minimo', 'px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Categoría', 'Categoria', 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Proveedor', 'Proveedor', 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Online', 'Online', 'px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Última actualización', 'Ultima.Actualizacion', 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase')}
                {renderSortableHeader('Estado', 'Activo', 'px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase')}
                <th className="relative px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {showEmptyLoadingState ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-sm text-slate-500">
                    Cargando productos y filtros...
                  </td>
                </tr>
              ) : showEmptyResultsState ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-sm text-slate-500">
                    No se encontraron productos con los filtros actuales.
                  </td>
                </tr>
              ) : filteredProducts.map((product: ProductRow) => {
                const rawPhotoPrimary = typeof (product as any).FOTOGRAFIA === 'string' ? (product as any).FOTOGRAFIA : '';
                const rawPhotoFallback = typeof (product as any).Imagen === 'string' ? (product as any).Imagen : '';
                const rawPhoto = rawPhotoPrimary.trim() !== '' ? rawPhotoPrimary : rawPhotoFallback;
                const normalizedPhoto = rawPhoto.trim();
                const normalizedPhotoLower = normalizedPhoto.toLowerCase();
                const isKnownInvalidPhoto =
                  normalizedPhoto === '' ||
                  normalizedPhotoLower === 'gettablefileurl' ||
                  normalizedPhotoLower === 'undefined' ||
                  normalizedPhotoLower === 'null';
                const hasPhoto =
                  !isKnownInvalidPhoto &&
                  !brokenImageUrlsRef.current.has(normalizedPhoto);
                const hasOfferPrice = Number((product as any)['Precio de Oferta'] ?? 0) > 0;
                const pricingBadgeClass = hasOfferPrice
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800';
                const pricingLabel = hasOfferPrice ? 'MANUAL / OFERTA' : 'AUTOMATICO';

                const isLowStock =
                  !!product.Activo &&
                  (((product as any).product_type === 'kit'
                    ? Number(kitAvailabilityByCode.get(String(product.cod || '').trim()) ?? 0)
                    : Number((product as any).stockk ?? 0)) < Number((product as any).Minimo ?? 0)) &&
                  ((product as any).Minimo ?? 0) > 0;

                const visibleStock = (product as any).product_type === 'kit'
                  ? Number(kitAvailabilityByCode.get(String(product.cod || '').trim()) ?? 0)
                  : Number((product as any).stockk ?? 0);

                return (
                  <tr key={product.cod} className={`hover:bg-gray-50 ${isLowStock ? 'bg-orange-50' : ''}`}>
                    <td className="px-4 py-3">
                      {hasPhoto ? (
                        <img
                          src={normalizedPhoto || PRODUCT_IMAGE_PLACEHOLDER}
                          alt={getProductDisplayName(product)}
                          className="w-16 h-16 object-cover rounded-md"
                          onError={(e) => {
                            if (normalizedPhoto) {
                              brokenImageUrlsRef.current.add(normalizedPhoto);
                            }
                            if (e.currentTarget.dataset.fallbackApplied === '1') return;
                            e.currentTarget.dataset.fallbackApplied = '1';
                            e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
                          }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-medium select-none">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 mr-1 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 5.25C3 4.007 4.007 3 5.25 3h13.5C19.993 3 21 4.007 21 5.25v13.5A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75V5.25z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 17.25l5.25-5.25a2.25 2.25 0 013.182 0l5.318 5.318"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15.75 9.75h.008v.008h-.008V9.75z"
                            />
                          </svg>
                          Sin imagen
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-xs truncate" title={getProductDisplayName(product)}>
                      {getProductDisplayName(product)}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {String(product.cod || '')}
                    </td>

                    <td className="px-4 py-3 text-sm text-right">
                      {formatCurrency((product as any)['P.Costo'] || 0)}
                    </td>

                    <td className="px-4 py-3 text-sm text-right font-bold">
                      {formatCurrency((product as any)['Precio Final'] || 0)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${pricingBadgeClass}`}
                      >
                        {pricingLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm text-center font-semibold">
                      {visibleStock}
                    </td>

                    <td className="px-4 py-3 text-sm text-center">
                      {(product as any).Minimo ?? 0}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600">
                      {getProductDisplayCategory(product)}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600">
                      {getProductDisplayProvider(product, supplierNameById) || '-'}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        onClick={() => handleToggleStatus(product, 'Online')}
                        title="Clic para cambiar visibilidad online"
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer ${
                          product.Online ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {product.Online ? 'Online' : 'Offline'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {formatDateTime((product as any)['Ultima.Actualizacion'])}
                    </td>

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
        </div>
      </div>

      <ProductEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        product={productToEdit}
        onSave={handleSaveProduct}
        categoriesData={categoriesData}
        categoryTree={categoryTree}
        allProducts={products}
        providers={suppliers
          .filter((s) => s.activo !== false)
          .map((s) => getSupplierName(s))
          .filter((n: string) => !!n)
          .sort((a, b) => a.localeCompare(b))}
        categories={categories}
        suppliers={suppliers}
      />

      <MassPriceUpdateModal
        isOpen={isMassUpdateOpen}
        onClose={() => setIsMassUpdateOpen(false)}
        categories={categories.map((category) => category.name).sort((a, b) => a.localeCompare(b))}
        providers={allProviderOptions.filter((p): p is string => p !== 'All' && typeof p === 'string')}
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