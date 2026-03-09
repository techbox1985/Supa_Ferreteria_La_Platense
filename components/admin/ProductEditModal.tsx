import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../../types';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { generateProductDescription } from '../../services/geminiService';
import { useToast } from '../../contexts/ToastContext';

const normalize = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

interface ProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null; // Can be null for creating a new product
  onSave: (productData: Partial<Product> & { cod: string; category_id?: string; supplier_id?: string }) => Promise<void>;
  categoriesData: { [key: string]: string[] };
  providers: string[];
  allProducts: Product[];
  categories?: any[];
  suppliers?: any[];
}

const newProductInitialState: Partial<Product> = {
    Producto: '',
    cod: '',
    'cod.barras': '',
    Categoria: '',
    'Sub Categoria': '',
    Descripcion: '',
    Proveedor: '',
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
  categoriesData,
  providers,
  allProducts,
  categories = [],
  suppliers = [],
}) => {
  const [formData, setFormData] = useState<Partial<Product>>(newProductInitialState);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const { addToast } = useToast();
  
  const isCreating = !product;

  useEffect(() => {
    if (isOpen) {
      if (isCreating) {
        setFormData(newProductInitialState);
      } else if (product) {
        const normalizedProductCategory = normalize(product.Categoria || '');
        const normalizedProductSubCategory = normalize(product['Sub Categoria'] || '');

        let matchedCategory = '';
        if (product.Categoria) {
          matchedCategory = Object.keys(categoriesData).find(catKey => normalize(catKey) === normalizedProductCategory) || '';
        }

        let matchedSubCategory = '';
        if (matchedCategory && product['Sub Categoria']) {
          const subCategories = categoriesData[matchedCategory] || [];
          matchedSubCategory = subCategories.find(subCat => normalize(subCat) === normalizedProductSubCategory) || '';
        }

        console.log("[EDIT] productToEdit keys:", Object.keys(product||{}));
        console.log("[EDIT] productToEdit snapshot:", JSON.stringify(product||{}, null, 2));
        console.log("[EDIT] categoriesData type:", typeof categoriesData, Array.isArray(categoriesData));
        console.log("[EDIT] categoriesData keys/sample:", categoriesData ? Object.keys(categoriesData).slice(0,10) : null);
        if (categoriesData[matchedCategory]) {
          console.log("[EDIT] categoriesData[selectedCategory] type:", typeof categoriesData[matchedCategory], Array.isArray(categoriesData[matchedCategory]));
          console.log("[EDIT] categoriesData[selectedCategory] sample:", categoriesData[matchedCategory].slice(0,10));
        }

        setFormData({
          ...product,
          Categoria: matchedCategory || (product.Categoria || '').trim().toUpperCase(), // Usar la matched o la original normalizada como fallback
          'Sub Categoria': matchedSubCategory || (product['Sub Categoria'] || '').trim().toUpperCase(), // Usar la matched o la original normalizada como fallback
        });
      }
      setIsSaving(false);
      setIsGeneratingDesc(false);
    }
  }, [isOpen, product, isCreating]);

  const stockActual = useMemo(() => {
    const stockInicial = Number(formData['Stock-Inicial'] || 0);
    const ingresos = Number(formData.Ingresos || 0);
    const ventasAjuste = Number(formData['Venta.PV'] || 0);
    return stockInicial + ingresos - ventasAjuste;
  }, [formData['Stock-Inicial'], formData.Ingresos, formData['Venta.PV']]);

  const precioFinal = useMemo(() => {
    return Number(formData.Precio || 0);
  }, [formData.Precio]);

  const displayableSubCategories = useMemo(() => {
    if (!formData.Categoria || !categoriesData) {
        return [];
    }
    let subs = categoriesData[formData.Categoria] || [];
    // Si la subcategoría actual del producto no está en la lista de subcategorías disponibles,
    // la añadimos temporalmente para que se muestre como opción.
    if (formData['Sub Categoria'] && !subs.includes(formData['Sub Categoria'])) {
      subs = [...subs, formData['Sub Categoria']].sort();
    }
    return subs;
  }, [formData.Categoria, categoriesData, formData['Sub Categoria']]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Si cambia la categoría, reseteamos la subcategoría
    if (name === 'Categoria') {
        setFormData(prev => ({ 
            ...prev, 
            Categoria: value,
            'Sub Categoria': '' 
        }));
        return;
    }

    if (name === 'Online' || name === 'Activo' || name === 'Fragil' || name === 'Embalaje_Especial' || name === 'Permitir_Venta_Sin_Stock' || name === 'Destacado') {
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
    setFormData(prev => ({ ...prev, [name]: parsedValue }));
  }


  const handleGenerateDescription = async () => {
    setIsGeneratingDesc(true);
    try {
      const newDescription = await generateProductDescription(formData as Product);
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
    
    setIsSaving(true);
    try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { stockk, 'Precio Final': pf, 'Auto?': auto, ...dataToSave } = formData;
        
        // Lookup de IDs antes de enviar
        const category = categories.find(c => c.name.toUpperCase() === (formData.Categoria || '').toUpperCase());
        const supplier = suppliers.find(s => s.nombre.toUpperCase() === (formData.Proveedor || '').toUpperCase());

        await onSave({ 
          ...dataToSave, 
          cod: formData.cod as string,
          category_id: category?.id,
          supplier_id: supplier?.id
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
                        <input type="text" name="Producto" value={formData.Producto || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Código</label>
                        <input type="text" name="cod" value={formData.cod || ''} onChange={handleChange} className={`mt-1 block w-full border-gray-300 rounded-md ${!isCreating ? 'bg-gray-100' : ''}`} readOnly={!isCreating} required={isCreating} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Cód. Barras</label>
                        <input type="text" name="cod.barras" value={formData['cod.barras'] || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                    </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">Descripción</label>
                  <textarea name="Descripcion" value={formData.Descripcion || ''} onChange={handleChange} rows={3} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving || isGeneratingDesc}></textarea>
                  <button type="button" onClick={handleGenerateDescription} className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 disabled:text-gray-400" disabled={isSaving || isGeneratingDesc}>
                     {isGeneratingDesc ? ( <> <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-4 h-4 animate-spin"/> <span>Generando...</span></> ) : ( <> <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 01-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 013.09-3.09L12 5.25l.813 2.846a4.5 4.5 0 013.09 3.09L18.75 12l-2.846.813a4.5 4.5 0 01-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.455-2.456L12.5 18l1.178-.398a3.375 3.375 0 002.455-2.456L16.5 14.25l.398 1.178a3.375 3.375 0 002.456 2.456L20.25 18l-1.178.398a3.375 3.375 0 00-2.456 2.456z" className="w-4 h-4" /> <span>Generar con IA (Gemini)</span></> )}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium">URL de la Foto</label>
                    <input type="text" name="FOTOGRAFIA" value={formData.FOTOGRAFIA || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="https://ejemplo.com/imagen.jpg"/>
                  </div>
                  <div className="md:col-span-1">
                    <p className="block text-sm font-medium text-center">Vista Previa</p>
                    <img src={formData.FOTOGRAFIA || 'https://via.placeholder.com/150'} alt="Vista previa" className="mt-1 w-24 h-24 object-cover rounded-md mx-auto border"/>
                  </div>
                </div>
            </div>
        </fieldset>
        
        {/* --- PRECIOS --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Precios</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <div>
                    <label className="block text-sm font-medium">P. Costo (Editable)</label>
                    <input type="text" inputMode="decimal" name="P.Costo" value={formData['P.Costo'] || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                 <div>
                    <label className="block text-sm font-medium">Precio Base (Lista)</label>
                    <input type="text" inputMode="decimal" name="Precio" value={formData.Precio || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="bg-red-50 p-2 rounded-lg border border-red-200">
                    <label className="block text-sm font-medium text-red-700">Precio de Oferta (Opcional)</label>
                    <input type="text" inputMode="decimal" name="Precio de Oferta" value={formData['Precio de Oferta'] || ''} onChange={handleNumericChange} className="mt-1 block w-full border-red-200 rounded-md" disabled={isSaving} />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-blue-600">Precio Final (Calculado)</label>
                    <input type="text" value={`$${precioFinal.toLocaleString('es-AR')}`} className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 font-bold" readOnly />
                </div>
            </div>
        </fieldset>
        
        {/* --- STOCK --- */}
        <fieldset className="border p-4 rounded-lg">
             <legend className="text-lg font-semibold px-2">Stock</legend>
            <div className={`grid grid-cols-2 ${!isCreating ? 'md:grid-cols-5' : 'md:grid-cols-3'} gap-4`}>
                 <div>
                    <label className="block text-sm font-medium">Stock Inicial</label>
                    <input type="text" inputMode="decimal" name="Stock-Inicial" value={formData['Stock-Inicial'] || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                
                {!isCreating && (
                    <>
                        <div>
                            <label className="block text-sm font-medium">Ingresos (Ajuste)</label>
                            <input type="text" inputMode="decimal" name="Ingresos" value={formData.Ingresos || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Ventas (Ajuste)</label>
                            <input type="text" inputMode="decimal" name="Venta.PV" value={formData['Venta.PV'] || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                        </div>
                    </>
                )}
                
                <div>
                    <label className="block text-sm font-medium text-blue-600">Stock Actual (Calculado)</label>
                    <input type="text" value={stockActual} className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 font-bold" readOnly />
                </div>
                 <div>
                    <label className="block text-sm font-medium">Stock Mínimo</label>
                    <input type="number" name="Minimo" value={formData.Minimo || 0} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
            </div>
        </fieldset>

         {/* --- CLASIFICACIÓN --- */}
         <fieldset className="border p-4 rounded-lg">
             <legend className="text-lg font-semibold px-2">Clasificación y Estado</legend>
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium">Categoría</label>
                    <select name="Categoria" value={formData.Categoria || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">Seleccionar Categoría</option>
                        {Object.keys(categoriesData).sort().map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium">Subcategoría</label>
                    <select 
                        name="Sub Categoria" 
                        value={formData['Sub Categoria'] || ''} 
                        onChange={handleChange} 
                        className="mt-1 block w-full border-gray-300 rounded-md" 
                        disabled={isSaving || !formData.Categoria || displayableSubCategories.length === 0}
                    >
                        <option value="">Seleccionar Subcategoría</option>
                        {displayableSubCategories.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium">Proveedor</label>
                     <select name="Proveedor" value={formData.Proveedor || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">Seleccionar Proveedor</option>
                        {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
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
                    <select name="Online" value={formData.Online === undefined ? '' : String(!!formData.Online)} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}>
                        <option value="">(Sin definir)</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                    </select>
                </div>
             </div>
        </fieldset>

        {/* --- SECCIÓN TÉCNICA --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Información Técnica</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium">Marca</label>
                    <input type="text" name="Marca" value={formData.Marca || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Modelo Compatible</label>
                    <input type="text" name="Modelo_Compatible" value={formData.Modelo_Compatible || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Tipo Técnico</label>
                    <input type="text" name="Tipo_Tecnico" value={formData.Tipo_Tecnico || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Especificaciones</label>
                    <textarea name="Especificaciones" value={formData.Especificaciones || ''} onChange={handleChange} rows={2} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium">Garantía (Meses)</label>
                    <input type="number" name="Garantia_Meses" value={formData.Garantia_Meses || 0} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">URL Ficha Técnica</label>
                    <input type="text" name="Ficha_Tecnica_URL" value={formData.Ficha_Tecnica_URL || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="https://..."/>
                </div>
                <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Notas Internas</label>
                    <textarea name="Notas_Internas" value={formData.Notas_Internas || ''} onChange={handleChange} rows={2} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}></textarea>
                </div>
            </div>
        </fieldset>

        {/* --- SECCIÓN E-COMMERCE --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">E-commerce</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Título Web</label>
                    <input type="text" name="Titulo_Web" value={formData.Titulo_Web || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Slug URL</label>
                    <input type="text" name="Slug_URL" value={formData.Slug_URL || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="ej-producto-slug"/>
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
                    <input type="text" name="Descripcion_Corta" value={formData.Descripcion_Corta || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Descripción Larga (HTML/Texto)</label>
                    <textarea name="Descripcion_Larga" value={formData.Descripcion_Larga || ''} onChange={handleChange} rows={4} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving}></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium">Imágenes Extra (URLs separadas por coma)</label>
                    <textarea name="Imagenes_Extra_URLs" value={formData.Imagenes_Extra_URLs || ''} onChange={handleChange} rows={2} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} placeholder="url1, url2..."></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium">URL Video (YouTube/Vimeo)</label>
                    <input type="text" name="Video_URL" value={formData.Video_URL || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
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
                    <input type="number" name="Orden_Catalogo" value={formData.Orden_Catalogo || 0} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
            </div>
        </fieldset>

        {/* --- SECCIÓN LOGÍSTICA --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Logística</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Clase de Envío</label>
                    <input type="text" name="Clase_Envio" value={formData.Clase_Envio || ''} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Peso (kg)</label>
                    <input type="text" inputMode="decimal" name="Peso_kg" value={formData.Peso_kg || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
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
                    <input type="text" inputMode="decimal" name="Alto_cm" value={formData.Alto_cm || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Ancho (cm)</label>
                    <input type="text" inputMode="decimal" name="Ancho_cm" value={formData.Ancho_cm || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Profundidad (cm)</label>
                    <input type="text" inputMode="decimal" name="Profundidad_cm" value={formData.Profundidad_cm || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
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
        </fieldset>

        {/* --- SECCIÓN STOCK ONLINE --- */}
        <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-semibold px-2">Stock Online</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium">Stock Online</label>
                    <input type="text" inputMode="decimal" name="Stock_Online" value={formData.Stock_Online || ''} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
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
                    <input type="number" name="Plazo_Reposicion_Dias" value={formData.Plazo_Reposicion_Dias || 0} onChange={handleNumericChange} className="mt-1 block w-full border-gray-300 rounded-md" disabled={isSaving} />
                </div>
            </div>
        </fieldset>

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