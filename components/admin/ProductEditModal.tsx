import React, { useState, useEffect, useMemo } from 'react';
import { Product, Supplier } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { generateProductDescription } from '../../services/geminiService';
import { calculateFinalPriceFromSupplierTaxes, getKitComponents } from '../../services/api';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useToast } from '../../contexts/ToastContext';

const normalize = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const toInputValue = (value: string | number | undefined | null) => value ?? '';

type CategoryOption = {
  id: string;
  name: string;
};

type SupplierOption = Supplier & {
  nombre?: string;
  activo?: boolean;
};

type CategoryTreeNode = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

const getSupplierId = (supplier: SupplierOption) => String(supplier.id || supplier.ID_Proveedor || '').trim();
const getSupplierName = (supplier: SupplierOption) => String(supplier.nombre || supplier.name || supplier.Nombre || '').trim();

interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, isOpen, onToggle, children }) => {
  return (
    <fieldset className="border p-4 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-lg font-semibold">{title}</span>
        <Icon
          path={isOpen ? 'M5.25 15.75L12 9l6.75 6.75' : 'M18.75 8.25L12 15l-6.75-6.75'}
          className="h-5 w-5 text-gray-600"
        />
      </button>
      {isOpen && <div className="mt-4">{children}</div>}
    </fieldset>
  );
};

interface ProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null; // Can be null for creating a new product
  onSave: (productData: Partial<Product> & { cod: string; category_id?: string; supplier_id?: string; product_type?: 'simple' | 'kit'; kitComponents?: Array<{ cod: string; quantity: number }> }) => Promise<void>;
  categoriesData?: { [key: string]: string[] };
  categoryTree?: CategoryTreeNode[];
  providers: string[];
  allProducts: Product[];
  categories?: CategoryOption[];
  suppliers?: SupplierOption[];
}

const newProductInitialState: Partial<Product> = {
    Producto: '',
    cod: '',
  product_type: 'simple',
    'cod.barras': '',
    Categoria: '',
    'Sub Categoria': '',
    Descripcion: '',
    Proveedor: '',
  auto_price: false,
    'P.Costo': undefined,
    Precio: undefined,
    'Precio de Oferta': undefined,
    'Stock-Inicial': undefined,
    Minimo: undefined,
    Ingresos: undefined,
    'Venta.PV': undefined,
    FOTOGRAFIA: '',
    Online: false,
    Activo: true,
    // Nuevos campos
    Marca: '',
    Modelo_Compatible: '',
    Tipo_Tecnico: '',
    Especificaciones: '',
    Clase_Envio: '',
    Titulo_Web: '',
    Slug_URL: '',
    Descripcion_Corta: '',
    Descripcion_Larga: '',
    Imagenes_Extra_URLs: '',
    Video_URL: '',
    Ficha_Tecnica_URL: '',
    Peso_kg: undefined,
    Alto_cm: undefined,
    Ancho_cm: undefined,
    Profundidad_cm: undefined,
    Fragil: undefined,
    Embalaje_Especial: undefined,
    Stock_Online: undefined,
    Permitir_Venta_Sin_Stock: undefined,
    Plazo_Reposicion_Dias: undefined,
    Estado_Publicacion: 'Borrador',
    Destacado: undefined,
    Orden_Catalogo: undefined,
    Garantia_Meses: undefined,
    Notas_Internas: '',
};


export const ProductEditModal: React.FC<ProductEditModalProps> = ({
  isOpen,
  onClose,
  product,
  onSave,
  categoriesData = {},
  categoryTree = [],
  providers,
  allProducts,
  categories = [],
  suppliers = [],
}) => {
  const [formData, setFormData] = useState<Partial<Product>>(newProductInitialState);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showEcommerce, setShowEcommerce] = useState(false);
  const [showLogistics, setShowLogistics] = useState(false);
  const [showStockOnline, setShowStockOnline] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [productType, setProductType] = useState<'simple' | 'kit'>('simple');
  const [kitComponents, setKitComponents] = useState<Array<{ cod: string; quantity: number }>>([]);
  const [showComponentSelector, setShowComponentSelector] = useState(false);
  const [selectedComponentCod, setSelectedComponentCod] = useState('');
  const [componentQuantity, setComponentQuantity] = useState(1);
  const { addToast } = useToast();
  
  const isCreating = !product;
  const isKitProduct = productType === 'kit';

  const effectiveCategoryTree = useMemo(() => {
    if (categoryTree.length > 0) {
      return categoryTree;
    }

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      subcategories: (categoriesData[category.name] || []).map((subName) => ({ id: subName, name: subName })),
    }));
  }, [categoryTree, categories, categoriesData]);

  const categoryNameById = useMemo(() => {
    return new Map(effectiveCategoryTree.map((node) => [node.id, node.name]));
  }, [effectiveCategoryTree]);

  const selectedCategoryNode = useMemo(() => {
    return effectiveCategoryTree.find((node) => node.id === selectedCategoryId) || null;
  }, [effectiveCategoryTree, selectedCategoryId]);

  useEffect(() => {
    if (isOpen) {
      if (isCreating) {
        setFormData(newProductInitialState);
        setSelectedCategoryId('');
        setProductType('simple');
        setKitComponents([]);
        setSelectedComponentCod('');
        setComponentQuantity(1);
      } else if (product) {
        const initialCategoryId = String((product as any).category_id || '').trim();
        const categoryName = initialCategoryId
          ? categoryNameById.get(initialCategoryId) || String(product.Categoria || '').trim()
          : String(product.Categoria || '').trim();

        const subOptions = effectiveCategoryTree.find((node) => node.id === initialCategoryId)?.subcategories || [];
        const currentSubCategory = String(product['Sub Categoria'] || '').trim();
        const validSubCategory = subOptions.some((sub) => sub.name === currentSubCategory)
          ? currentSubCategory
          : '';

        setFormData({
          ...product,
          Categoria: categoryName,
          'Sub Categoria': validSubCategory,
        });
        setSelectedCategoryId(initialCategoryId);
        const resolvedType = (product as any).product_type === 'kit' ? 'kit' : 'simple';
        setProductType(resolvedType);
        setKitComponents([]);
        setSelectedComponentCod('');
        setComponentQuantity(1);

        if (resolvedType === 'kit' && (product as any).id) {
          void getKitComponents((product as any).id)
            .then((components) => {
              setKitComponents(
                components
                  .filter((component) => component.component_product_cod)
                  .map((component) => ({
                    cod: component.component_product_cod,
                    quantity: Math.max(1, Number(component.quantity_per_kit ?? 1)),
                  }))
              );
            })
            .catch((error) => {
              console.warn('[ProductEditModal] No se pudieron cargar componentes del kit:', error);
              setKitComponents([]);
            });
        }
      }

      setIsSaving(false);
      setIsGeneratingDesc(false);
    }
  }, [isOpen, product, isCreating, effectiveCategoryTree, categoryNameById]);

  const stockActual = useMemo(() => {
    const stockInicial = Math.max(0, Number(formData['Stock-Inicial'] || 0));
    const ingresos = Number(formData.Ingresos || 0);
    const ventasAjuste = Number(formData['Venta.PV'] || 0);
    return stockInicial + ingresos - ventasAjuste;
  }, [formData['Stock-Inicial'], formData.Ingresos, formData['Venta.PV']]);

  const stockInicialValue = Math.max(0, Number(formData['Stock-Inicial'] || 0));
  const ingresosAutoValue = Number(formData.Ingresos || 0);
  const ventasAutoValue = Number(formData['Venta.PV'] || 0);

  const selectedSupplier = useMemo(() => {
    const supplierId = String(formData.supplier_id || '').trim();
    const supplierName = String(formData.Proveedor || '').trim().toLowerCase();
    if (!supplierId && !supplierName) return null;

    return suppliers.find((supplier) => {
      const currentId = getSupplierId(supplier);
      const currentName = getSupplierName(supplier).toLowerCase();
      return (supplierId && currentId === supplierId) || (supplierName && currentName === supplierName);
    }) || null;
  }, [formData.Proveedor, formData.supplier_id, suppliers]);

  const supplierTax1 = Number.isFinite(Number(selectedSupplier?.tax_1_percent)) ? Number(selectedSupplier?.tax_1_percent) : 0;
  const supplierTax2 = Number.isFinite(Number(selectedSupplier?.tax_2_percent)) ? Number(selectedSupplier?.tax_2_percent) : 0;
  const supplierTax3 = Number.isFinite(Number(selectedSupplier?.tax_3_percent)) ? Number(selectedSupplier?.tax_3_percent) : 0;
  const supplierTax4 = Number.isFinite(Number(selectedSupplier?.tax_4_percent)) ? Number(selectedSupplier?.tax_4_percent) : 0;

  const calculatedSupplierFinalPrice = useMemo(() => {
    const costValue = Number(formData['P.Costo']);
    if (!selectedSupplier || !Number.isFinite(costValue)) {
      return undefined;
    }
    return calculateFinalPriceFromSupplierTaxes(costValue, supplierTax1, supplierTax2, supplierTax3, supplierTax4);
  }, [formData['P.Costo'], selectedSupplier, supplierTax1, supplierTax2, supplierTax3, supplierTax4]);

  // --- NEW: Pricing Priority Logic ---
  // Priority: Precio de Oferta (if > 0) > Automatic Supplier Price > undefined
  const precioOferta = Number(formData['Precio de Oferta'] ?? 0);
  
  const activeSellPrice = useMemo(() => {
    // If offer price is present and > 0, use it (manual override)
    if (precioOferta > 0) {
      return precioOferta;
    }
    // Otherwise use automatic supplier calculated price
    return calculatedSupplierFinalPrice;
  }, [precioOferta, calculatedSupplierFinalPrice]);

  const pricingMode = useMemo(() => {
    if (precioOferta > 0) {
      return 'MANUAL / OFERTA';
    }
    return 'AUTOMÁTICO';
  }, [precioOferta]);

  const formatPercent = (value: number) => `${value.toFixed(2)}%`;

  const displayableSubCategories = useMemo(() => {
    if (selectedCategoryNode) {
      return selectedCategoryNode.subcategories.map((sub) => sub.name);
    }
    if (!formData.Categoria) return [];
    return categoriesData[formData.Categoria] || [];
  }, [selectedCategoryNode, formData.Categoria, categoriesData]);

  const handleCategorySelectChange = (categoryId: string) => {
    const categoryName = categoryNameById.get(categoryId) || '';
    setSelectedCategoryId(categoryId);
    setFormData((prev) => ({
      ...prev,
      Categoria: categoryName,
      'Sub Categoria': '',
    }));
  };

  const handleAddKitComponent = () => {
    if (!selectedComponentCod || selectedComponentCod.trim() === '') {
      addToast('Por favor selecciona un producto', 'error');
      return;
    }
    
    if (kitComponents.some(c => c.cod === selectedComponentCod)) {
      addToast('Este producto ya está en los componentes del kit', 'error');
      return;
    }

    const component = allProducts.find(p => p.cod === selectedComponentCod);
    if (!component) {
      addToast('Producto no encontrado', 'error');
      return;
    }

    setKitComponents([...kitComponents, { cod: selectedComponentCod, quantity: Math.max(1, componentQuantity) }]);
    setSelectedComponentCod('');
    setComponentQuantity(1);
    setShowComponentSelector(false);
  };

  const handleRemoveKitComponent = (codToRemove: string) => {
    setKitComponents(kitComponents.filter(c => c.cod !== codToRemove));
  };

  const handleUpdateComponentQuantity = (cod: string, newQuantity: number) => {
    setKitComponents(kitComponents.map(c => 
      c.cod === cod ? { ...c, quantity: Math.max(1, newQuantity) } : c
    ));
  };


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'Online' || name === 'Activo') {
      // Online y Activo nunca son undefined: solo true o false
      setFormData(prev => ({ ...prev, [name]: value === 'true' }));
    } else if (name === 'Fragil' || name === 'Embalaje_Especial' || name === 'Permitir_Venta_Sin_Stock' || name === 'Destacado' || name === 'auto_price') {
      if (value === '') {
        setFormData(prev => ({ ...prev, [name]: undefined }));
      } else {
        setFormData(prev => ({ ...prev, [name]: value === 'true' }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (value.trim() === '') {
      setFormData(prev => ({ ...prev, [name]: undefined }));
      return;
    }
    const parsedValue = parseFloat(value.replace(',', '.')) || 0;
    const normalizedValue = name === 'Stock-Inicial' ? Math.max(0, parsedValue) : parsedValue;
    setFormData(prev => ({ ...prev, [name]: normalizedValue }));
  }


  const handleGenerateDescription = async () => {
    setIsGeneratingDesc(true);
    try {
      const productForDescription: Product = {
        ...newProductInitialState,
        ...formData,
        cod: String(formData.cod || 'TEMP').trim() || 'TEMP',
        Producto: String(formData.Producto || 'Producto sin nombre').trim() || 'Producto sin nombre',
      };

      const newDescription = await generateProductDescription(productForDescription);
      setFormData(prev => ({ ...prev, Descripcion: newDescription }));
      addToast('Descripción generada con IA.', 'success');
    } catch (error) {
        console.error("Error generating AI description", error);
        addToast("No se pudo generar la descripción.", 'error');
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isCreating) {
        if (!formData.cod || formData.cod.trim() === '') {
            addToast('El campo "Código" es obligatorio para crear un producto.', 'error');
            return;
        }
        if (!formData.Producto || formData.Producto.trim() === '') {
            addToast('El campo "Nombre del Producto" es obligatorio.', 'error');
            return;
        }
    }
    
    if (productType === 'kit' && kitComponents.length === 0) {
        addToast('Un kit debe tener al menos un componente.', 'error');
        return;
    }
    
    setIsSaving(true);
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { stockk, 'Auto?': auto, ...dataToSave } = formData;
      // Fuente única para stock: persistimos current_stock usando la fórmula oficial del modal.
      const normalizedStockInicial = Math.max(0, Number(formData['Stock-Inicial'] || 0));
      const savePayload: Partial<Product> & { stockk?: number; product_type?: string; kitComponents?: any[] } = {
        ...dataToSave,
        'Stock-Inicial': normalizedStockInicial,
        stockk: normalizedStockInicial + ingresosAutoValue - ventasAutoValue,
        product_type: productType,
        kitComponents: productType === 'kit' ? kitComponents : undefined
      };
      
      // Precio final para kit: manual (Precio de Oferta). Para simple: lógica existente.
      savePayload['Precio Final'] = isKitProduct
        ? Number(formData['Precio de Oferta'] ?? 0)
        : activeSellPrice;

      if (isKitProduct) {
        // Para kits no enviamos datos de proveedor/costos/stock manual.
        savePayload.Proveedor = '';
        savePayload.supplier_id = undefined;
        savePayload['P.Costo'] = undefined;
        savePayload.Precio = undefined;
        savePayload.auto_price = false;
        savePayload['Stock-Inicial'] = 0;
        savePayload.Ingresos = 0;
        savePayload['Venta.PV'] = 0;
        savePayload.stockk = 0;
        savePayload.Minimo = 0;
        savePayload.Categoria = '';
        savePayload['Sub Categoria'] = '';
      }
        
        const selectedSupplierName = normalize(String(formData.Proveedor || ''));
        const supplier = suppliers.find((item) => normalize(getSupplierName(item)) === selectedSupplierName);
        const normalizedSubCategory = String(formData['Sub Categoria'] || '').trim();
        const validSubCategory = displayableSubCategories.includes(normalizedSubCategory)
          ? normalizedSubCategory
          : selectedCategoryId
          ? ''
          : normalizedSubCategory;
        const resolvedCategoryName = selectedCategoryId
          ? categoryNameById.get(selectedCategoryId) || ''
          : String(formData.Categoria || '').trim();

        await onSave({ 
          ...savePayload, 
          id: product?.id, // Pass the original id for updates
          Categoria: isKitProduct ? '' : resolvedCategoryName,
          'Sub Categoria': isKitProduct ? '' : validSubCategory,
          cod: formData.cod as string,
          category_id: isKitProduct ? undefined : (selectedCategoryId || undefined),
          supplier_id: isKitProduct ? undefined : (supplier ? getSupplierId(supplier) || undefined : undefined)
        });
    } catch (error) {
      // Error is handled by the parent component, which will show an alert.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isCreating ? "Nuevo Producto" : `Editando: ${product?.Producto}`} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* --- DATOS GENERALES --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Datos Generales</legend>
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium">Nombre del Producto</label>
                        <input type="text" name="Producto" value={toInputValue(formData.Producto)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Código</label>
                        <input type="text" name="cod" value={toInputValue(formData.cod)} onChange={handleChange} className={`mt-1 block w-full border-gray-300 rounded-md ${!isCreating ? 'bg-gray-100' : ''}`} required={isCreating} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Cód. Barras</label>
                        <input type="text" name="cod.barras" value={toInputValue(formData['cod.barras'])} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                    </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">Descripción</label>
                      <textarea name="Descripcion" value={toInputValue(formData.Descripcion)} onChange={handleChange} rows={3} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving || isGeneratingDesc}></textarea>
                  <button type="button" onClick={handleGenerateDescription} className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 disabled:text-gray-400" disabled={isSaving || isGeneratingDesc}>
                     {isGeneratingDesc ? ( <> <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin"/> <span>Generando...</span></> ) : ( <> <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 01-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 013.09-3.09L12 5.25l.813 2.846a4.5 4.5 0 013.09 3.09L18.75 12l-2.846.813a4.5 4.5 0 01-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.455-2.456L12.5 18l1.178-.398a3.375 3.375 0 002.455-2.456L16.5 14.25l.398 1.178a3.375 3.375 0 002.456 2.456L20.25 18l-1.178.398a3.375 3.375 0 00-2.456 2.456z" className="w-4 h-4" /> <span>Generar con IA (Gemini)</span></> )}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium">URL de la Foto</label>
                    <input type="text" name="FOTOGRAFIA" value={toInputValue(formData.FOTOGRAFIA)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="https://ejemplo.com/imagen.jpg"/>
                  </div>
                  <div className="md:col-span-1">
                    <p className="block text-sm font-medium text-center">Vista Previa</p>
                    {formData.FOTOGRAFIA && typeof formData.FOTOGRAFIA === 'string' && formData.FOTOGRAFIA.trim() !== '' ? (
                      <img
                        src={formData.FOTOGRAFIA}
                        alt="Vista previa"
                        className="mt-1 w-24 h-24 object-cover rounded-md mx-auto border"
                        onError={e => {
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                          const fallback = img.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      style={{ display: (!formData.FOTOGRAFIA || typeof formData.FOTOGRAFIA !== 'string' || formData.FOTOGRAFIA.trim() === '') ? 'flex' : 'none' }}
                      className="mt-1 w-24 h-24 rounded-md bg-gray-100 border flex items-center justify-center text-gray-400 text-xs font-medium mx-auto select-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25C3 4.007 4.007 3 5.25 3h13.5C19.993 3 21 4.007 21 5.25v13.5A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75V5.25z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17.25l5.25-5.25a2.25 2.25 0 013.182 0l5.318 5.318" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9.75h.008v.008h-.008V9.75z" />
                      </svg>
                      Sin imagen
                    </div>
                  </div>
                </div>
            </div>
        </fieldset>
        
        {/* --- TIPO DE PRODUCTO Y COMPOSICIÓN DE KIT --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Tipo de Producto</legend>
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Tipo</label>
                        <select 
                          value={productType} 
                          onChange={(e) => { 
                            setProductType(e.target.value as 'simple' | 'kit'); 
                            if (e.target.value === 'simple') setKitComponents([]);
                          }}
                          disabled={isSaving}
                          className="mt-1 block w-full border-gray-300 rounded-md"
                        >
                          <option value="simple">Producto Simple</option>
                          <option value="kit">Kit (Múltiples Componentes)</option>
                        </select>
                    </div>
                </div>

                {productType === 'kit' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Componentes del Kit</label>
                    <div className="bg-blue-50 p-3 rounded mb-3 text-sm text-blue-800">
                      El stock de este kit depende de sus componentes. Stock disponible = min(stock_componente / cantidad_por_kit).
                    </div>
                    
                    {kitComponents.length > 0 ? (
                      <table className="w-full text-sm border-collapse mb-3">
                        <thead>
                          <tr className="bg-gray-100 border">
                            <th className="border px-2 py-1 text-left">Producto</th>
                            <th className="border px-2 py-1 text-center">Cantidad</th>
                            <th className="border px-2 py-1 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kitComponents.map(comp => {
                            const product = allProducts.find(p => p.cod === comp.cod);
                            return (
                              <tr key={comp.cod} className="border">
                                <td className="border px-2 py-1">{product?.Producto || comp.cod}</td>
                                <td className="border px-2 py-1 text-center">
                                  <input 
                                    type="number" 
                                    min="1" 
                                    value={comp.quantity}
                                    onChange={(e) => handleUpdateComponentQuantity(comp.cod, parseInt(e.target.value) || 1)}
                                    disabled={isSaving}
                                    className="w-12 text-center border-gray-300 rounded-md"
                                  />
                                </td>
                                <td className="border px-2 py-1 text-center">
                                  <button 
                                    type="button"
                                    onClick={() => handleRemoveKitComponent(comp.cod)}
                                    disabled={isSaving}
                                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-gray-600 mb-3 italic">Sin componentes aún</p>
                    )}

                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setShowComponentSelector(true)}
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-2 rounded-md text-sm font-medium"
                      >
                        + Agregar Componente
                      </button>
                    </div>

                    {showComponentSelector && (
                      <div className="mt-3 border-t pt-3">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium">Seleccionar Producto</label>
                          <SearchableSelect
                            options={allProducts
                              .filter(p => p.product_type !== 'kit' && !kitComponents.some(c => c.cod === p.cod))
                              .map(p => ({ value: p.cod, label: p.Producto }))}
                            value={selectedComponentCod}
                            onChange={setSelectedComponentCod}
                            placeholder="Buscar producto por nombre..."
                            disabled={isSaving}
                          />
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-sm font-medium">Cantidad por Kit</label>
                              <input 
                                type="number" 
                                min="1" 
                                value={componentQuantity}
                                onChange={(e) => setComponentQuantity(parseInt(e.target.value) || 1)}
                                className="w-full border-gray-300 rounded-md"
                              />
                            </div>
                            <div className="flex gap-1 items-end">
                              <button 
                                type="button"
                                onClick={handleAddKitComponent}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-2 py-2 rounded-md text-sm font-medium"
                              >
                                Agregar
                              </button>
                              <button 
                                type="button"
                                onClick={() => setShowComponentSelector(false)}
                                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-2 py-2 rounded-md text-sm font-medium"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
        </fieldset>
        
        {/* --- PRECIOS --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Precios</legend>
          {isKitProduct ? (
            <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg">
              <label className="block text-sm font-medium text-amber-800">Precio de Oferta (Manual)</label>
              <input
              type="text"
              inputMode="decimal"
              name="Precio de Oferta"
              value={toInputValue(formData['Precio de Oferta'])}
              onChange={handleNumericChange}
              className="mt-2 block w-full border-amber-300 rounded-md text-lg font-semibold text-amber-900"
              disabled={isSaving}
              placeholder="Ingresar precio del kit"
              />
              <p className="mt-1 text-xs text-amber-700">Precio final del kit.</p>
            </div>
            </div>
          ) : (
            <>
            <div className="space-y-6">
              {/* Row 1: Cost and Base Price */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">P. Costo (Editable)</label>
                  <input type="text" inputMode="decimal" name="P.Costo" value={toInputValue(formData['P.Costo'])} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Precio Base (Lista) - Referencia</label>
                  <input type="text" inputMode="decimal" name="Precio" value={toInputValue(formData.Precio)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="Informativo, no afecta el precio final" />
                  <p className="mt-1 text-xs text-gray-500">Solo informativo, no afecta el precio de venta real.</p>
                </div>
              </div>

              {/* Row 2: Automatic Price (Read-Only) and Offer Price (Manual Override) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  <label className="block text-sm font-medium text-blue-700">Precio Automático (Sugerido)</label>
                  <p className="mt-2 text-2xl font-bold text-blue-900">
                    ${(calculatedSupplierFinalPrice ?? 0).toLocaleString('es-AR')}
                  </p>
                  <p className="mt-1 text-xs text-blue-600">
                    Calculado desde costo + impuestos del proveedor
                  </p>
                </div>
                        
                <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg">
                  <label className="block text-sm font-medium text-amber-800">Precio de Oferta (Manual Override)</label>
                  <input type="text" inputMode="decimal" name="Precio de Oferta" value={toInputValue(formData['Precio de Oferta'])} onChange={handleNumericChange} className="mt-2 block w-full border-amber-300 rounded-md text-lg font-semibold text-amber-900" disabled={isSaving} placeholder="Dejar vacío para usar automático" />
                  <p className="mt-1 text-xs text-amber-700">
                    Si tiene valor, OVERRIDE el precio automático
                  </p>
                </div>
              </div>

              {/* Row 3: Active Selling Price (Computed) */}
              <div className="border-t pt-4">
                <div className={`rounded-lg p-4 border-2 ${pricingMode === 'MANUAL / OFERTA' ? 'bg-red-50 border-red-400' : 'bg-green-50 border-green-400'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <label className="block text-sm font-medium">PRECIO FINAL DE VENTA (Se guardará este)</label>
                      <p className={`mt-2 text-3xl font-bold ${pricingMode === 'MANUAL / OFERTA' ? 'text-red-900' : 'text-green-900'}`}>
                        ${(activeSellPrice ?? 0).toLocaleString('es-AR')}
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-semibold ${pricingMode === 'MANUAL / OFERTA' ? 'bg-red-200 text-red-900' : 'bg-green-200 text-green-900'}`}>
                      {pricingMode}
                    </div>
                  </div>
                  <p className={`text-sm ${pricingMode === 'MANUAL / OFERTA' ? 'text-red-700' : 'text-green-700'}`}>
                    {pricingMode === 'MANUAL / OFERTA' 
                      ? `Usando Precio de Oferta manual ($${precioOferta.toLocaleString('es-AR')})`
                      : `Usando precio automático del proveedor`
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Supplier Tax Info Section */}
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">📌 Información de Precios por Proveedor</p>
              <p className="mt-1 text-xs leading-relaxed">
                El precio automático se calcula multiplicando el costo por los impuestos del proveedor asociado.
                Puedes usar "Precio de Oferta" para establecer un precio diferente cuando necesites una excepción.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Proveedor asociado</p>
                  <p className="font-medium text-slate-900">{formData.Proveedor || 'Sin asignar'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Impuesto 1</p>
                  <p className="font-medium text-slate-900">{formatPercent(supplierTax1)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Impuesto 2</p>
                  <p className="font-medium text-slate-900">{formatPercent(supplierTax2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Impuesto 3</p>
                  <p className="font-medium text-slate-900">{formatPercent(supplierTax3)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Impuesto 4</p>
                  <p className="font-medium text-slate-900">{formatPercent(supplierTax4)}</p>
                </div>
              </div>
            </div>
            </>
          )}
        </fieldset>
        
        {/* --- STOCK --- */}
        {!isKitProduct && (
        <fieldset className="border p-4 rounded-lg">
             <legend className="text-lg font-semibold px-2">Stock</legend>
            <div className={`grid grid-cols-2 ${!isCreating ? 'md:grid-cols-5' : 'md:grid-cols-3'} gap-4`}>
                 <div>
                    <label className="block text-sm font-medium">Stock Inicial</label>
                    <input type="text" inputMode="decimal" name="Stock-Inicial" value={toInputValue(formData['Stock-Inicial'])} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                
            {!isCreating && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Ingresos (Automático)</label>
                  <input type="text" inputMode="decimal" name="Ingresos" value={toInputValue(formData.Ingresos ?? 0)} className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 text-slate-700" readOnly />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Ventas (Automático)</label>
                  <input type="text" inputMode="decimal" name="Venta.PV" value={toInputValue(formData['Venta.PV'] ?? 0)} className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 text-slate-700" readOnly />
                </div>
              </>
            )}
                
                <div>
                    <label className="block text-sm font-medium text-blue-600">Stock Actual (Calculado)</label>
                    <input type="text" value={stockActual} className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 font-bold" readOnly />
                </div>
                 <div>
                    <label className="block text-sm font-medium">Stock Mínimo</label>
                    <input type="number" name="Minimo" value={toInputValue(formData.Minimo)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
            </div>
            {!isCreating && (
              <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-semibold">Fórmula de stock</p>
                <p className="mt-1">Stock actual = Stock inicial + Ingresos - Ventas</p>
                <p className="mt-1 font-medium">
                  {stockInicialValue} + {ingresosAutoValue} - {ventasAutoValue} = {stockActual}
                </p>
              </div>
            )}
        </fieldset>
        )}

         {/* --- CLASIFICACIÓN --- */}
         <fieldset className="border p-4 rounded-lg">
             <legend className="text-lg font-semibold px-2">Clasificación y Estado</legend>
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
                {!isKitProduct && (
                  <>
                    <div>
                        <label className="block text-sm font-medium">Categoría</label>
                      <select
                        name="Categoria"
                        value={toInputValue(selectedCategoryId)}
                        onChange={(e) => handleCategorySelectChange(e.target.value)}
                        className="mt-1 block w-full border-gray-300 rounded-md"
                        disabled={isSaving}
                      >
                            <option value="">Seleccionar Categoría</option>
                        {effectiveCategoryTree.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Subcategoría</label>
                        <select 
                            name="Sub Categoria" 
                            value={toInputValue(formData['Sub Categoria'])} 
                            onChange={handleChange} 
                            className="mt-1 block w-full border-gray-300 rounded-md" 
                            disabled={isSaving || !selectedCategoryId || displayableSubCategories.length === 0}
                        >
                            <option value="">Seleccionar Subcategoría</option>
                            {displayableSubCategories.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Proveedor</label>
                         <select name="Proveedor" value={toInputValue(formData.Proveedor)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                            <option value="">Seleccionar Proveedor</option>
                            {providers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                         {formData.Proveedor || 'Sin proveedor asociado'}
                        </p>
                    </div>
                  </>
                )}
                <div>
                    <label className="block text-sm font-medium">Estado</label>
                    <select name="Activo" value={formData.Activo === undefined ? '' : String(!!formData.Activo)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">(Sin definir)</option>
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium">Visible Online</label>
                    <select name="Online" value={String(!!formData.Online)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                    </select>
                </div>
             </div>
        </fieldset>

        {/* --- SECCIÓN TÉCNICA --- */}
        <CollapsibleSection title="Información Técnica" isOpen={showTechnical} onToggle={() => setShowTechnical(prev => !prev)}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium">Marca</label>
                    <input type="text" name="Marca" value={toInputValue(formData.Marca)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Modelo Compatible</label>
                    <input type="text" name="Modelo_Compatible" value={toInputValue(formData.Modelo_Compatible)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Tipo Técnico</label>
                    <input type="text" name="Tipo_Tecnico" value={toInputValue(formData.Tipo_Tecnico)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Especificaciones</label>
                    <textarea name="Especificaciones" value={toInputValue(formData.Especificaciones)} onChange={handleChange} rows={2} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium">Garantía (Meses)</label>
                    <input type="number" name="Garantia_Meses" value={toInputValue(formData.Garantia_Meses)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">URL Ficha Técnica</label>
                    <input type="text" name="Ficha_Tecnica_URL" value={toInputValue(formData.Ficha_Tecnica_URL)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="https://..."/>
                </div>
                <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Notas Internas</label>
                    <textarea name="Notas_Internas" value={toInputValue(formData.Notas_Internas)} onChange={handleChange} rows={2} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}></textarea>
                </div>
            </div>
            </CollapsibleSection>

        {/* --- SECCIÓN E-COMMERCE --- */}
            <CollapsibleSection title="E-commerce" isOpen={showEcommerce} onToggle={() => setShowEcommerce(prev => !prev)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Título Web</label>
                    <input type="text" name="Titulo_Web" value={toInputValue(formData.Titulo_Web)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Slug URL</label>
                    <input type="text" name="Slug_URL" value={toInputValue(formData.Slug_URL)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="ej-producto-slug"/>
                </div>
                <div>
                    <label className="block text-sm font-medium">Estado Publicación</label>
                    <select name="Estado_Publicacion" value={formData.Estado_Publicacion || 'Borrador'} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="Borrador">Borrador</option>
                        <option value="Publicado">Publicado</option>
                        <option value="Archivado">Archivado</option>
                    </select>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Descripción Corta</label>
                    <input type="text" name="Descripcion_Corta" value={toInputValue(formData.Descripcion_Corta)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Descripción Larga (HTML/Texto)</label>
                    <textarea name="Descripcion_Larga" value={toInputValue(formData.Descripcion_Larga)} onChange={handleChange} rows={4} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium">Imágenes Extra (URLs separadas por coma)</label>
                    <textarea name="Imagenes_Extra_URLs" value={toInputValue(formData.Imagenes_Extra_URLs)} onChange={handleChange} rows={2} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="url1, url2..."></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium">URL Video (YouTube/Vimeo)</label>
                    <input type="text" name="Video_URL" value={toInputValue(formData.Video_URL)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Destacado</label>
                    <select name="Destacado" value={formData.Destacado === undefined ? '' : String(!!formData.Destacado)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">(Sin definir)</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium">Orden en Catálogo</label>
                    <input type="number" name="Orden_Catalogo" value={toInputValue(formData.Orden_Catalogo)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
            </div>
            </CollapsibleSection>

        {/* --- SECCIÓN LOGÍSTICA --- */}
            <CollapsibleSection title="Logística" isOpen={showLogistics} onToggle={() => setShowLogistics(prev => !prev)}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Clase de Envío</label>
                    <input type="text" name="Clase_Envio" value={toInputValue(formData.Clase_Envio)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Peso (kg)</label>
                    <input type="text" inputMode="decimal" name="Peso_kg" value={toInputValue(formData.Peso_kg)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Frágil</label>
                    <select name="Fragil" value={formData.Fragil === undefined ? '' : String(!!formData.Fragil)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">(Sin definir)</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium">Alto (cm)</label>
                    <input type="text" inputMode="decimal" name="Alto_cm" value={toInputValue(formData.Alto_cm)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Ancho (cm)</label>
                    <input type="text" inputMode="decimal" name="Ancho_cm" value={toInputValue(formData.Ancho_cm)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Profundidad (cm)</label>
                    <input type="text" inputMode="decimal" name="Profundidad_cm" value={toInputValue(formData.Profundidad_cm)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Embalaje Especial</label>
                    <select name="Embalaje_Especial" value={formData.Embalaje_Especial === undefined ? '' : String(!!formData.Embalaje_Especial)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">(Sin definir)</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                    </select>
                </div>
            </div>
                </CollapsibleSection>

        {/* --- SECCIÓN STOCK ONLINE --- */}
                <CollapsibleSection title="Stock Online" isOpen={showStockOnline} onToggle={() => setShowStockOnline(prev => !prev)}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium">Stock Online</label>
                    <input type="text" inputMode="decimal" name="Stock_Online" value={toInputValue(formData.Stock_Online)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Permitir Venta Sin Stock</label>
                    <select name="Permitir_Venta_Sin_Stock" value={formData.Permitir_Venta_Sin_Stock === undefined ? '' : String(!!formData.Permitir_Venta_Sin_Stock)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">(Sin definir)</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium">Plazo Reposición (Días)</label>
                    <input type="number" name="Plazo_Reposicion_Dias" value={toInputValue(formData.Plazo_Reposicion_Dias)} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
            </div>
            </CollapsibleSection>

        {/* Save/Cancel Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
          <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={isSaving} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 flex items-center space-x-2 w-48 justify-center">
             {isSaving ? (
                <>
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                    <span>Guardando...</span>
                </>
            ) : (
                <>
                    <Icon path="M4.5 12.75l6 6 9-13.5" className="w-5 h-5"/>
                    <span>{isCreating ? 'Crear Producto' : 'Guardar Cambios'}</span>
                </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};