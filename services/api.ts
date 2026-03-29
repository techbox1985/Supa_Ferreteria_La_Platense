// --- PRODUCTOS SUPABASE: Métodos CRUD mínimos para ProductAdminView ---
const buildProductSupabasePayload = (productData: any, options?: { includeUpdatedAt?: boolean }): Record<string, any> => {
    const mapping: Record<string, any> = {};

    if (productData.cod !== undefined) mapping.cod = productData.cod;
    if (productData.Producto !== undefined) mapping.name = productData.Producto;
    if (productData.category_id !== undefined) mapping.category_id = productData.category_id;
    if (productData['Sub Categoria'] !== undefined) mapping.sub_category = productData['Sub Categoria'] || null;
    if (productData.supplier_id !== undefined) mapping.supplier_id = productData.supplier_id || null;
    if (productData['cod.barras'] !== undefined) mapping.barcode = productData['cod.barras'];
    if (productData['P.Costo'] !== undefined) mapping.cost_price = productData['P.Costo'];
    if (productData.cost_currency !== undefined) mapping.cost_currency = productData.cost_currency;
    if (productData.cost_price_usd !== undefined) mapping.cost_price_usd = productData.cost_price_usd;
    if (productData.last_exchange_rate !== undefined) mapping.last_exchange_rate = productData.last_exchange_rate;
    if (productData.Precio !== undefined) mapping.list_price = productData.Precio;
    if (productData['Precio Final'] !== undefined) mapping.final_price = productData['Precio Final'];
    if (productData['Precio de Oferta'] !== undefined) mapping.offer_price = productData['Precio de Oferta'];
    if (productData.auto_price !== undefined) mapping.auto_price = !!productData.auto_price;
    if (productData.stockk !== undefined) mapping.current_stock = productData.stockk;
    if (productData.Minimo !== undefined) mapping.min_stock = productData.Minimo;
    if (productData.Activo !== undefined) mapping.is_active = !!productData.Activo;
    if (productData.FOTOGRAFIA !== undefined) mapping.photo_url = productData.FOTOGRAFIA;
    if (productData.Imagen !== undefined) mapping.image_url = productData.Imagen;
    if (productData.Eliminado !== undefined) mapping.is_deleted = !!productData.Eliminado;
    if (options?.includeUpdatedAt) mapping.updated_at = new Date().toISOString();

    return mapping;
};

export const updateProductSupabase = async (productData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!productData.cod) throw new Error('Falta el código de producto');
    const mapping = buildProductSupabasePayload(productData, { includeUpdatedAt: true });
    const { data, error } = await supabase
        .from('st_products')
        .update(mapping)
        .eq('cod', productData.cod)
        .select();
    if (error) throw error;
    return data?.[0] || null;
};

export const addProductSupabase = async (productData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const mapping = buildProductSupabasePayload(productData);
    const { data, error } = await supabase
        .from('st_products')
        .insert([mapping])
        .select();
    if (error) throw error;
    return data?.[0] || null;
};

export const deleteProductSupabase = async (cod: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_products')
        .update({ is_deleted: true, updated_at: new Date() })
        .eq('cod', cod)
        .select();
    if (error) throw error;
    return data?.[0] || null;
};
// --- Helpers mínimos para destrabar build ---
// Implementación temporal de postToScript: simula una llamada y devuelve un objeto vacío o echo
async function postToScript(_action: string, _payload: any, _options?: any): Promise<any> {
    // Puedes personalizar el mock según la acción si lo necesitas
    return { data: {} };
}

// Implementación temporal de formatDateForSheet: retorna fecha en formato ISO simple
function formatDateForSheet(date: Date): string {
    return date.toISOString().split('T')[0];
}
// FIX: Imported all necessary types from the central types file.
import {
    AccountTransaction,
    Budget,
    CartItem,
    Customer,
    Expense,
    Product,
    Sale,
    Shift,
    StockEntryItem,
    SupplierInvoiceDetail,
    SupplierInvoiceDetailItem,
    SupplierInvoiceHistory,
    SupplierInvoice,
    SupplierInvoiceItem,
    SupplierCostImportRow,
    SupplierCostImportPreviewRow,
    SupplierCostImportSummary,
    SupplierAccountSummary,
    SupplierInvoiceBalance,
    SupplierPayment,
    Supplier,
    User
} from '../types';
// import { offlineService } from './offlineService';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

// =============================================================================
// --- SUPABASE SERVICES ---
// =============================================================================

/// <reference types="vite/client" />
const viteEnv = (import.meta as ImportMeta & {
    env: {
        VITE_SUPABASE_URL: string;
        VITE_SUPABASE_ANON_KEY: string;
    };
}).env;

const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = viteEnv.VITE_SUPABASE_ANON_KEY;

const calculateFinalPriceFromCost = (costPrice: number, markupPct: number): number => {
    return Number((costPrice * (1 + markupPct / 100)).toFixed(2));
};

const parsePercentValue = (value: any): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeImportKey = (value: any): string => String(value || '').trim().toLowerCase();

export const calculateFinalPriceFromSupplierTaxes = (
    costPrice: number,
    tax1Percent: number,
    tax2Percent: number,
    tax3Percent: number
): number => {
    const t1 = parsePercentValue(tax1Percent);
    const t2 = parsePercentValue(tax2Percent);
    const t3 = parsePercentValue(tax3Percent);
    return Number((costPrice * (1 + t1 / 100) * (1 + t2 / 100) * (1 + t3 / 100)).toFixed(2));
};

export const fetchUsdArsExchangeRateSuggestion = async (): Promise<{ rate: number; source: string; updatedAt?: string }> => {
    const attempts: Array<() => Promise<{ rate: number; source: string; updatedAt?: string }>> = [
        async () => {
            const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
            if (!response.ok) throw new Error('dolarapi oficial no disponible');
            const payload = await response.json();
            const rate = Number(payload?.venta ?? payload?.promedio ?? payload?.compra);
            if (!Number.isFinite(rate) || rate <= 0) throw new Error('dolarapi oficial sin valor valido');
            return {
                rate: Number(rate.toFixed(2)),
                source: 'dolarapi/oficial',
                updatedAt: String(payload?.fechaActualizacion || payload?.fecha || ''),
            };
        },
        async () => {
            const response = await fetch('https://dolarapi.com/v1/dolares/blue');
            if (!response.ok) throw new Error('dolarapi blue no disponible');
            const payload = await response.json();
            const rate = Number(payload?.venta ?? payload?.promedio ?? payload?.compra);
            if (!Number.isFinite(rate) || rate <= 0) throw new Error('dolarapi blue sin valor valido');
            return {
                rate: Number(rate.toFixed(2)),
                source: 'dolarapi/blue',
                updatedAt: String(payload?.fechaActualizacion || payload?.fecha || ''),
            };
        },
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(lastError instanceof Error ? lastError.message : 'No se pudo obtener cotizacion USD/ARS');
};

let supabase: ReturnType<typeof createClient<Database>> | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
} else {
    console.warn('Supabase URL o Anon Key no están configuradas. Las funciones de facturación electrónica no funcionarán.');
}

export const getProductsSupabase = async (): Promise<Product[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    // 1. Cargar categorías primero
    const { data: categoriesData, error: categoriesError } = await supabase
        .from('st_categories')
        .select('id, name');

    if (categoriesError) throw categoriesError;
    const categories = Array.isArray(categoriesData) ? categoriesData : [];

    // 1.1 Cargar proveedores para resolver nombre y markup por supplier_id
    const { data: suppliersData, error: suppliersError } = await supabase
        .from('st_suppliers')
        .select('id, nombre, markup_pct');

    if (suppliersError) throw suppliersError;
    const suppliers = Array.isArray(suppliersData) ? suppliersData : [];

    // 2. Cargar TODOS los productos mediante paginación automática
    const PAGE_SIZE = 1000;
    let from = 0;
    let allProducts: any[] = [];

    // Solo los campos mínimos necesarios para el POS
    const PRODUCT_FIELDS = [
        'id',
        'cod',
        'name',
        'category_id',
        'sub_category',
        'supplier_id',
        'barcode',
        'cost_price',
        'cost_currency',
        'cost_price_usd',
        'last_exchange_rate',
        'list_price',
        'offer_price',
        'auto_price',
        'current_stock',
        'min_stock',
        'is_active',
        'photo_url',
        'image_url',
        'is_deleted',
        'updated_at',
        'legacy_last_update',
        'final_price'
    ];
    while (true) {
        const { data, error } = await supabase
            .from('st_products')
            .select(PRODUCT_FIELDS.join(','))
            .eq('is_deleted', false)
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        const batch = Array.isArray(data) ? data : [];
        allProducts = allProducts.concat(batch);

        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    const rows = allProducts;

    const salesByProductId = new Map<string, number>();
    const salesByProductCode = new Map<string, number>();
    try {
        // Ventas automáticas por producto: suma de st_sale_items excluyendo ventas anuladas/eliminadas.
        const { data: saleItemsData, error: saleItemsError } = await supabase
            .from('st_sale_items')
            .select('product_id, product_code, quantity, st_sales!inner(status)');

        if (saleItemsError) throw saleItemsError;

        for (const row of saleItemsData || []) {
            const status = String((row as any)?.st_sales?.status || '').toLowerCase();
            if (status === 'annulled' || status === 'deleted') continue;

            const quantity = Number((row as any)?.quantity ?? 0);
            if (!Number.isFinite(quantity) || quantity <= 0) continue;

            const productId = String((row as any)?.product_id || '').trim();
            if (productId) {
                salesByProductId.set(productId, (salesByProductId.get(productId) || 0) + quantity);
            }

            const productCode = String((row as any)?.product_code || '').trim();
            if (productCode) {
                salesByProductCode.set(productCode, (salesByProductCode.get(productCode) || 0) + quantity);
            }
        }
    } catch (error) {
        // Fallback seguro: si falla el agregado de ventas, no rompemos la carga de productos.
        console.warn('[getProductsSupabase] No se pudo agregar ventas reales, se usará 0 temporalmente.', error);
    }

    // Ingresos automáticos por producto: suma real de compras registradas en supplier_invoice_items.
    const productIds = rows.map((item: any) => String(item.id || '').trim()).filter(Boolean);
    const ingresosByProductId = new Map<string, number>();

    if (productIds.length > 0) {
        try {
            // Evita URLs excesivas al consultar con .in() sobre muchos IDs.
            const BATCH_SIZE = 200;
            for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
                const batchIds = productIds.slice(i, i + BATCH_SIZE);
                const { data: supplierInvoiceItems, error: supplierInvoiceItemsError } = await supabase
                    .from('supplier_invoice_items')
                    .select('product_id, quantity')
                    .in('product_id', batchIds);

                if (supplierInvoiceItemsError) throw supplierInvoiceItemsError;

                for (const row of supplierInvoiceItems || []) {
                    const productId = String((row as any)?.product_id || '').trim();
                    if (!productId) continue;

                    const quantity = Number((row as any)?.quantity ?? 0);
                    if (!Number.isFinite(quantity) || quantity <= 0) continue;

                    ingresosByProductId.set(productId, (ingresosByProductId.get(productId) || 0) + quantity);
                }
            }
        } catch (error) {
            // Fallback seguro: si falla el agregado de ingresos, mantenemos la carga con ingresos=0.
            console.warn('[getProductsSupabase] No se pudo agregar ingresos reales, se usará 0 temporalmente.', error);
        }
    }

    const categoryMap = new Map(
        categories.map((cat: any) => [cat.id, cat.name])
    );

    const supplierMap = new Map(
        suppliers.map((supplier: any) => [supplier.id, supplier])
    );

    return rows
        .filter((item: any) => item.is_deleted !== true)
        .map((item: any) => {
            const supplier = supplierMap.get(item.supplier_id);
            const currentStock = Number(item.current_stock ?? 0);
            const productId = String(item.id || '').trim();
            const productCode = String(item.cod || '').trim();

            // Fuente real de ingresos: supplier_invoice_items (no usamos income_count legacy para UI automática).
            const ingresos = Number(ingresosByProductId.get(productId) ?? 0);
            const ventas = Number(
                salesByProductId.get(productId)
                ?? salesByProductCode.get(productCode)
                ?? 0
            );
            const stockInicialRaw = currentStock - ingresos + ventas;
            const stockInicial = Math.max(0, Number.isFinite(stockInicialRaw) ? stockInicialRaw : 0);
            const stockActual = stockInicial + ingresos - ventas;

            return {
            cod: item.cod ?? '',
            Producto: item.name ?? '',
            Categoria: categoryMap.get(item.category_id) || '',
            'Sub Categoria': item.sub_category ?? '',
            Proveedor: supplier?.nombre ?? supplier?.name ?? '',
            'cod.barras': item.barcode ?? '',
            'P.Costo': Number(item.cost_price ?? 0),
            cost_currency: String(item.cost_currency || 'ARS').toUpperCase() === 'USD' ? 'USD' : 'ARS',
            cost_price_usd: item.cost_price_usd !== null && item.cost_price_usd !== undefined ? Number(item.cost_price_usd) : undefined,
            last_exchange_rate: item.last_exchange_rate !== null && item.last_exchange_rate !== undefined ? Number(item.last_exchange_rate) : undefined,
            Precio: Number(item.list_price ?? 0),
            'Precio de Oferta': Number(item.offer_price ?? 0),
            supplier_id: item.supplier_id ?? undefined,
            auto_price: Boolean(item.auto_price ?? false),
            markup_pct: Number(supplier?.markup_pct ?? 0),
            'Stock-Inicial': stockInicial,
            Ingresos: Number.isFinite(ingresos) ? ingresos : 0,
            'Venta.PV': Number.isFinite(ventas) ? ventas : 0,
            stockk: Number.isFinite(stockActual) ? stockActual : 0,
            Minimo: Number(item.min_stock ?? 0),
            Activo: Boolean(item.is_active ?? true),
            FOTOGRAFIA: item.photo_url ?? item.image_url ?? '',
            Imagen: item.image_url ?? item.photo_url ?? '',
            Eliminado: Boolean(item.is_deleted ?? false),
            'Ultima.Actualizacion': item.updated_at ?? item.legacy_last_update ?? '',
            'Precio Final': Number(item.final_price ?? 0)
        } as any;
        });
};

export const getProductsForPOS = async (): Promise<Product[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data: categoriesData, error: categoriesError } = await supabase
        .from('st_categories')
        .select('id, name');

    if (categoriesError) throw categoriesError;

    const categoryMap = new Map(
        (Array.isArray(categoriesData) ? categoriesData : []).map((cat: any) => [cat.id, cat.name])
    );

    const PAGE_SIZE = 1000;
    let from = 0;
    const rows: any[] = [];

    // Consulta liviana para POS: solo campos usados en render, búsqueda, filtro y venta.
    const PRODUCT_FIELDS = [
        'cod',
        'name',
        'category_id',
        'barcode',
        'description',
        'offer_price',
        'final_price',
        'current_stock',
        'min_stock',
        'is_active',
        'photo_url',
        'image_url',
        'is_deleted',
        'updated_at',
        'legacy_last_update'
    ];

    while (true) {
        const { data, error } = await supabase
            .from('st_products')
            .select(PRODUCT_FIELDS.join(','))
            .eq('is_deleted', false)
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        const batch = Array.isArray(data) ? data : [];
        rows.push(...batch);

        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return rows.map((item: any) => ({
        cod: item.cod ?? '',
        Producto: item.name ?? '',
        Categoria: categoryMap.get(item.category_id) || '',
        Descripcion: item.description ?? '',
        'cod.barras': item.barcode ?? '',
        'Precio de Oferta': Number(item.offer_price ?? 0),
        'Precio Final': Number(item.final_price ?? 0),
        stockk: Number(item.current_stock ?? 0),
        Minimo: Number(item.min_stock ?? 0),
        Activo: Boolean(item.is_active ?? true),
        FOTOGRAFIA: item.photo_url ?? item.image_url ?? '',
        Imagen: item.image_url ?? item.photo_url ?? '',
        Eliminado: Boolean(item.is_deleted ?? false),
        'Ultima.Actualizacion': item.updated_at ?? item.legacy_last_update ?? '',
    }));
};

export const getCategoriesSupabase = async (): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_categories')
        .select('*');
    if (error) throw error;
    return data || [];
};

export const getSuppliersSupabase = async (): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_suppliers')
        .select('*');
    if (error) throw error;
    return data || [];
};

const buildSupplierImportSummary = (totalRows: number): SupplierCostImportSummary => ({
    existingSupplierProducts: 0,
    foundInFile: 0,
    notFoundInFile: 0,
    totalRows,
    found: 0,
    updated: 0,
    notFound: 0,
    ignored: 0,
});

interface SupplierImportOptions {
    fileCurrency?: 'ARS' | 'USD';
    exchangeRate?: number;
}

const normalizeSupplierImportRows = (
    rows: SupplierCostImportRow[],
    summary: SupplierCostImportSummary
): SupplierCostImportRow[] => {
    const seenCodes = new Set<string>();
    const normalizedRows: SupplierCostImportRow[] = [];

    for (const row of rows) {
        const rawCode = String(row.cod || '').trim();
        const normalizedCode = normalizeImportKey(rawCode);
        const cost = Number(row.cost_price);

        if (!normalizedCode || !Number.isFinite(cost)) {
            summary.ignored += 1;
            continue;
        }

        if (seenCodes.has(normalizedCode)) {
            summary.ignored += 1;
            continue;
        }

        seenCodes.add(normalizedCode);
        normalizedRows.push({
            ...row,
            cod: normalizedCode,
            barcode: String(row.barcode || '').trim(),
            name: String(row.name || '').trim(),
            category: String(row.category || '').trim(),
            sub_category: String(row.sub_category || '').trim(),
            observations: String(row.observations || '').trim(),
            cost_currency: String(row.cost_currency || '').trim().toUpperCase() === 'USD' ? 'USD' : 'ARS',
            cost_price: cost,
        });
    }

    return normalizedRows;
};

const resolveSupplierImportProductMatch = (
    row: SupplierCostImportRow,
    productByCode: Map<string, any>,
    productByBarcode: Map<string, any>
) => {
    const rowCodeKey = normalizeImportKey(row.cod);
    const rowBarcodeKey = normalizeImportKey(row.barcode);

    return (
        productByCode.get(rowCodeKey)
        || (rowBarcodeKey ? productByBarcode.get(rowBarcodeKey) : undefined)
        || productByBarcode.get(rowCodeKey)
        || null
    );
};

const prepareSupplierImportContext = async (supplierId: string, rows: SupplierCostImportRow[]) => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!supplierId) throw new Error('Debe seleccionar un proveedor');

    const summary = buildSupplierImportSummary(rows.length);
    const normalizedRows = normalizeSupplierImportRows(rows, summary);

    const { data: supplierProductsData, error: supplierProductsError } = await supabase
        .from('st_products')
        .select('id, cod, barcode, name, cost_price, final_price, auto_price')
        .eq('supplier_id', supplierId)
        .eq('is_deleted', false);

    if (supplierProductsError) throw supplierProductsError;

    const supplierProducts = supplierProductsData || [];
    summary.existingSupplierProducts = supplierProducts.length;

    const fileCodeSet = new Set(
        normalizedRows.flatMap((row) => [normalizeImportKey(row.cod), normalizeImportKey(row.barcode)]).filter(Boolean)
    );
    summary.foundInFile = supplierProducts.reduce((acc: number, product: any) => {
        const codKey = normalizeImportKey(product.cod);
        const barcodeKey = normalizeImportKey(product.barcode);
        return (fileCodeSet.has(codKey) || fileCodeSet.has(barcodeKey)) ? acc + 1 : acc;
    }, 0);
    summary.notFoundInFile = Math.max(summary.existingSupplierProducts - summary.foundInFile, 0);
    summary.found = summary.foundInFile;

    const productByCode = new Map(
        supplierProducts
            .map((product: any) => [normalizeImportKey(product.cod), product] as const)
            .filter(([key]) => key.length > 0)
    );
    const productByBarcode = new Map(
        supplierProducts
            .map((product: any) => [normalizeImportKey(product.barcode), product] as const)
            .filter(([key]) => key.length > 0)
    );

    const { data: supplierData, error: supplierError } = await supabase
        .from('st_suppliers')
        .select('tax_1_percent, tax_2_percent, tax_3_percent')
        .eq('id', supplierId)
        .maybeSingle();

    if (supplierError) throw supplierError;

    return {
        summary,
        normalizedRows,
        productByCode,
        productByBarcode,
        supplierTax1Percent: parsePercentValue(supplierData?.tax_1_percent),
        supplierTax2Percent: parsePercentValue(supplierData?.tax_2_percent),
        supplierTax3Percent: parsePercentValue(supplierData?.tax_3_percent),
    };
};

export const previewSupplierCostsSupabase = async (
    supplierId: string,
    rows: SupplierCostImportRow[],
    options?: SupplierImportOptions
): Promise<SupplierCostImportPreviewRow[]> => {
    const fileCurrency: 'ARS' | 'USD' = options?.fileCurrency === 'USD' ? 'USD' : 'ARS';
    const exchangeRate = Number(options?.exchangeRate ?? 1);
    const safeExchangeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;

    const {
        normalizedRows,
        productByCode,
        productByBarcode,
        supplierTax1Percent,
        supplierTax2Percent,
        supplierTax3Percent,
    } = await prepareSupplierImportContext(supplierId, rows);

    return normalizedRows.map((row) => {
        const product = resolveSupplierImportProductMatch(row, productByCode, productByBarcode);
        const currentCost = Number(product?.cost_price ?? 0);
        const currentFinalPrice = Number(product?.final_price ?? 0);
        const inputCost = Number(row.cost_price || 0);
        const convertedCostArs = fileCurrency === 'USD' ? Number((inputCost * safeExchangeRate).toFixed(2)) : inputCost;
        const newFinalPrice = calculateFinalPriceFromSupplierTaxes(
            convertedCostArs,
            supplierTax1Percent,
            supplierTax2Percent,
            supplierTax3Percent
        );
        const willUpdate = !!product && (currentCost !== convertedCostArs || currentFinalPrice !== newFinalPrice);

        return {
            cod: String(row.cod || '').trim(),
            product_name: String(product?.name || row.name || ''),
            current_cost: currentCost,
            input_currency: fileCurrency,
            input_cost: inputCost,
            exchange_rate: safeExchangeRate,
            converted_cost_ars: convertedCostArs,
            new_cost: convertedCostArs,
            supplier_tax_1_percent: supplierTax1Percent,
            supplier_tax_2_percent: supplierTax2Percent,
            supplier_tax_3_percent: supplierTax3Percent,
            current_final_price: currentFinalPrice,
            new_calculated_final_price: newFinalPrice,
            status: product ? 'found' : 'not found',
            result: product ? (willUpdate ? 'will update' : 'no change') : 'not found',
        };
    });
};

export const importSupplierCostsSupabase = async (
    supplierId: string,
    rows: SupplierCostImportRow[],
    options?: SupplierImportOptions
): Promise<SupplierCostImportSummary> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const supabaseClient = supabase;
    const fileCurrency: 'ARS' | 'USD' = options?.fileCurrency === 'USD' ? 'USD' : 'ARS';
    const exchangeRate = Number(options?.exchangeRate ?? 1);
    const safeExchangeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;

    const {
        summary,
        normalizedRows,
        productByCode,
        productByBarcode,
        supplierTax1Percent,
        supplierTax2Percent,
        supplierTax3Percent,
    } = await prepareSupplierImportContext(supplierId, rows);

    for (const row of normalizedRows) {
        const product = resolveSupplierImportProductMatch(row, productByCode, productByBarcode);
        if (!product) {
            summary.notFound += 1;
            continue;
        }

        const inputCost = Number(row.cost_price || 0);
        const convertedCostArs = fileCurrency === 'USD' ? Number((inputCost * safeExchangeRate).toFixed(2)) : inputCost;

        const newFinalPrice = calculateFinalPriceFromSupplierTaxes(
            convertedCostArs,
            supplierTax1Percent,
            supplierTax2Percent,
            supplierTax3Percent
        );
        const currentCost = Number(product.cost_price ?? 0);
        const currentFinalPrice = Number(product.final_price ?? 0);

        if (currentCost === convertedCostArs && currentFinalPrice === newFinalPrice) {
            continue;
        }

        const updatePayload: Record<string, any> = {
            cost_price: convertedCostArs,
            final_price: newFinalPrice,
            cost_currency: fileCurrency,
            cost_price_usd: fileCurrency === 'USD' ? inputCost : null,
            last_exchange_rate: fileCurrency === 'USD' ? safeExchangeRate : null,
            updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabaseClient
            .from('st_products')
            .update(updatePayload)
            .eq('id', product.id);

        if (updateError) throw updateError;
        summary.updated += 1;
    }

    return summary;
};

export const updateUsdProductsByExchangeRateSupabase = async (
    exchangeRate: number,
    onProgress?: (stage: string, percent: number) => void
): Promise<{ updated: number }> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const safeExchangeRate = Number(exchangeRate);
    if (!Number.isFinite(safeExchangeRate) || safeExchangeRate <= 0) {
        throw new Error('Tipo de cambio inválido.');
    }

    onProgress?.('searching', 10);

    const { data: usdProducts, error: productsError } = await supabase
        .from('st_products')
        .select('id, supplier_id, cost_price_usd')
        .eq('is_deleted', false)
        .eq('cost_currency', 'USD')
        .not('cost_price_usd', 'is', null);

    if (productsError) throw productsError;

    const products = usdProducts || [];
    if (products.length === 0) {
        onProgress?.('done', 100);
        return { updated: 0 };
    }

    onProgress?.('recalculating', 35);

    const supplierIds = Array.from(new Set(products.map((product: any) => String(product.supplier_id || '')).filter(Boolean)));
    const taxBySupplierId = new Map<string, { tax1: number; tax2: number; tax3: number }>();

    if (supplierIds.length > 0) {
        const { data: suppliers, error: suppliersError } = await supabase
            .from('st_suppliers')
            .select('id, tax_1_percent, tax_2_percent, tax_3_percent')
            .in('id', supplierIds);

        if (suppliersError) throw suppliersError;

        for (const supplier of suppliers || []) {
            taxBySupplierId.set(String((supplier as any).id || ''), {
                tax1: parsePercentValue((supplier as any).tax_1_percent),
                tax2: parsePercentValue((supplier as any).tax_2_percent),
                tax3: parsePercentValue((supplier as any).tax_3_percent),
            });
        }
    }

    onProgress?.('saving', 55);

    let updated = 0;
    const total = products.length;

    for (let i = 0; i < total; i += 1) {
        const product = products[i];
        const costUsd = Number((product as any).cost_price_usd ?? 0);
        if (!Number.isFinite(costUsd) || costUsd <= 0) continue;

        const supplierId = String((product as any).supplier_id || '');
        const taxes = taxBySupplierId.get(supplierId) || { tax1: 0, tax2: 0, tax3: 0 };
        const newCostArs = Number((costUsd * safeExchangeRate).toFixed(2));
        const newFinalArs = calculateFinalPriceFromSupplierTaxes(newCostArs, taxes.tax1, taxes.tax2, taxes.tax3);

        const { error: updateError } = await supabase
            .from('st_products')
            .update({
                cost_price: newCostArs,
                final_price: newFinalArs,
                last_exchange_rate: safeExchangeRate,
                updated_at: new Date().toISOString(),
            })
            .eq('id', (product as any).id);

        if (updateError) throw updateError;
        updated += 1;

        const savePercent = 55 + Math.round(((i + 1) / total) * 35);
        onProgress?.('saving', savePercent);
    }

    onProgress?.('finalizing', 95);

    return { updated };
};

export const addSupplierSupabase = async (supplierData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const mapping = {
        nombre: supplierData.Nombre,
        cuit: supplierData.CUIT,
        iva_condition: supplierData.Condicion_IVA,
        email: supplierData.Email,
        phone: supplierData.Telefono,
        contact_person: supplierData.Contacto,
        address: supplierData.Direccion,
        is_active: supplierData.Activo === 'SI',
        tax_1_percent: parsePercentValue(supplierData.tax_1_percent),
        tax_2_percent: parsePercentValue(supplierData.tax_2_percent),
        tax_3_percent: parsePercentValue(supplierData.tax_3_percent),
        is_deleted: false
    };

    const { data, error } = await supabase
        .from('st_suppliers')
        .insert([mapping])
        .select();
    
    if (error) throw error;
    return data[0];
};

export const updateSupplierSupabase = async (supplierData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const id = supplierData.id || supplierData.ID_Proveedor;
    if (!id) throw new Error('ID de proveedor no proporcionado');

    const mapping: any = {};
    if (supplierData.Nombre !== undefined) mapping.nombre = supplierData.Nombre;
    if (supplierData.CUIT !== undefined) mapping.cuit = supplierData.CUIT;
    if (supplierData.Condicion_IVA !== undefined) mapping.iva_condition = supplierData.Condicion_IVA;
    if (supplierData.Email !== undefined) mapping.email = supplierData.Email;
    if (supplierData.Telefono !== undefined) mapping.phone = supplierData.Telefono;
    if (supplierData.Contacto !== undefined) mapping.contact_person = supplierData.Contacto;
    if (supplierData.Direccion !== undefined) mapping.address = supplierData.Direccion;
    if (supplierData.Activo !== undefined) mapping.is_active = supplierData.Activo === 'SI';
    if (supplierData.tax_1_percent !== undefined) mapping.tax_1_percent = parsePercentValue(supplierData.tax_1_percent);
    if (supplierData.tax_2_percent !== undefined) mapping.tax_2_percent = parsePercentValue(supplierData.tax_2_percent);
    if (supplierData.tax_3_percent !== undefined) mapping.tax_3_percent = parsePercentValue(supplierData.tax_3_percent);
    if (supplierData.is_deleted !== undefined) mapping.is_deleted = supplierData.is_deleted;

    const { data, error } = await supabase
        .from('st_suppliers')
        .update(mapping)
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
};

// --- CLIENTES SUPABASE ---

export const getCustomersSupabase = async (): Promise<Customer[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_customers')
        .select('*');

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    return rows
        .filter((item: any) => {
            const deletedRaw =
                item?.is_deleted ??
                item?.deleted ??
                item?.eliminado ??
                item?.Eliminado ??
                false;

            const isDeleted =
                deletedRaw === true ||
                deletedRaw === 'SI' ||
                deletedRaw === 'si' ||
                deletedRaw === 1 ||
                deletedRaw === '1';

            return !isDeleted;
        })
        .map((item: any) => ({
            Id_Cliente: item.id,
            'Nombre y Apellido':
                item.full_name ??
                item.nombre ??
                item['Nombre y Apellido'] ??
                '',
            Whatsapp: item.whatsapp || '',
            'Tipo.Documento': item.document_type || 'DNI',
            Documento: item.document_number || '',
            Condicion_IVA: item.iva_condition || 'Consumidor Final',
            Deuda: Number(item.current_debt) || 0,
            Pagos: Number(item.total_payments) || 0,
        } as Customer));
};

export const addCustomerSupabase = async (customerData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_customers')
        .insert([{
            full_name: customerData['Nombre y Apellido'],
            whatsapp: customerData.Whatsapp,
            document_type: customerData['Tipo.Documento'],
            document_number: customerData.Documento,
            iva_condition: customerData.Condicion_IVA,
            legacy_customer_id: customerData.Id_Cliente || null,
            is_deleted: false
        }])
        .select();
    if (error) throw error;
    return data[0];
};

export const updateCustomerSupabase = async (customerData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { Id_Cliente } = customerData;
    const { data, error } = await supabase
        .from('st_customers')
        .update({
            full_name: customerData['Nombre y Apellido'],
            whatsapp: customerData.Whatsapp,
            document_type: customerData['Tipo.Documento'],
            document_number: customerData.Documento,
            iva_condition: customerData.Condicion_IVA
        })
        .eq('id', Id_Cliente)
        .select();
    if (error) throw error;
    return data[0];
};

export const deleteCustomerSupabase = async (id: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_customers')
        .update({ is_deleted: true, updated_at: new Date() })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data[0];
};

// --- FACTURACIÓN ELECTRÓNICA (SUPABASE HYBRID) ---

const normalizeCustomerForTusFacturas = (customer: any) => {
    if (!customer) return null;
    const normalized = { ...customer };
    
    const iva = String(customer.Condicion_IVA || '').toUpperCase();
    if (iva.includes('RESPONSABLE INSCRIPTO')) normalized.Condicion_IVA = 'RI';
    else if (iva.includes('MONOTRIBUTO')) normalized.Condicion_IVA = 'M';
    else if (iva.includes('CONSUMIDOR FINAL')) normalized.Condicion_IVA = 'CF';
    else normalized.Condicion_IVA = 'CF';

    const docType = String(customer['Tipo.Documento'] || '').toUpperCase();
    if (normalized.Condicion_IVA === 'CF') {
        normalized['Tipo.Documento'] = '99';
    } else if (docType.includes('CUIT')) normalized['Tipo.Documento'] = 'CUIT';
    else if (docType.includes('DNI')) normalized['Tipo.Documento'] = 'DNI';
    else normalized['Tipo.Documento'] = 'DNI';

    const doc = String(customer.Documento || '').replace(/\D/g, '');
    if (normalized['Tipo.Documento'] === 'CUIT' && doc.length !== 11) {
        normalized.Condicion_IVA = 'CF';
        normalized['Tipo.Documento'] = '99';
        normalized.Documento = '0';
    } else if (normalized['Tipo.Documento'] === 'DNI' && (!doc || parseInt(doc) <= 0)) {
        normalized.Documento = '';
    } else {
        normalized.Documento = doc;
    }

    // Fiscal default for Consumidor Final when no explicit document is provided.
    if (normalized.Condicion_IVA === 'CF' && (!normalized.Documento || String(normalized.Documento).trim() === '')) {
        normalized['Tipo.Documento'] = '99';
        normalized.Documento = '0';
    }

    // Always force AFIP generic consumer document for Consumidor Final.
    if (normalized.Condicion_IVA === 'CF') {
        normalized['Tipo.Documento'] = '99';
        normalized.Documento = '0';
    }

    return normalized;
};

const determineInvoiceType = (sale: any) => {
    const isCreditNote = !!sale.isCreditNote;
    const facturacion = sale.facturacion || (sale.cbteTipo === 1 ? 'A' : 'B');
    
    if (isCreditNote) {
        return facturacion === 'A' ? 'NOTA DE CREDITO A' : 'NOTA DE CREDITO B';
    } else {
        return facturacion === 'A' ? 'FACTURA A' : 'FACTURA B';
    }
};

const getCbteTipo = (sale: any) => {
    const isCreditNote = !!sale.isCreditNote;
    const facturacion = sale.facturacion || (sale.cbteTipo === 1 ? 'A' : 'B');
    if (isCreditNote) {
        return facturacion === 'A' ? 3 : 8;
    } else {
        return facturacion === 'A' ? 1 : 6;
    }
};

export const generateElectronicInvoice = async (sale: Sale): Promise<any> => {
    try {
        if (!supabase) {
            console.warn('Supabase no está inicializado. Verifique las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
            return {
                status: 'facturación pendiente',
                reason: 'SUPABASE_NOT_INITIALIZED',
                message: 'Supabase no está inicializado para facturación.',
                debug: ['Supabase no está inicializado en generateElectronicInvoice.'],
            };
        }

        const normalizedCustomer = normalizeCustomerForTusFacturas(sale.customer);
        const comprobante_tipo = determineInvoiceType(sale);
        const cbteTipo = getCbteTipo(sale);

        console.log('[DIAG097 invoice sale id][api.generateElectronicInvoice input]', {
            saleId: sale.id,
            facturacion: sale.facturacion,
            cbteTipo,
        });

        const saleForInvoice = { 
            ...sale, 
            customer: normalizedCustomer,
            cbteTipo: cbteTipo,
            comprobante_tipo: comprobante_tipo,
            requested_tipo: sale.facturacion,
            sent_tipo: comprobante_tipo
        };

        const payloadSummary = {
            saleId: sale.id,
            cbteTipo,
            comprobante_tipo,
            requestedType: sale.facturacion,
            total: sale.total,
            itemCount: sale.items?.length || 0,
            shiftId: sale.shiftId,
            customer: {
                condicionIVA: normalizedCustomer?.Condicion_IVA,
                tipoDocumento: normalizedCustomer?.['Tipo.Documento'],
                documento: normalizedCustomer?.Documento,
            },
        };
        console.log('[DIAG094][api.generateElectronicInvoice][payload]', payloadSummary);

        const { data, error } = await supabase.functions.invoke('create-electronic-invoice-tolosa', { body: { sale: saleForInvoice } });
        console.log('[DIAG094][api.generateElectronicInvoice][edge raw response]', data);
        console.log('[DIAG097 invoice sale id][api.generateElectronicInvoice response]', {
            sentSaleId: sale.id,
            invoiceSaleId: data?.sale_id || null,
            invoiceNumber: data?.nro || null,
        });

        if (error) {
            const invokeErrorInfo = {
                status: error.status,
                message: error.message,
                body: (error as any).body,
                context: (error as any).context,
            };
            console.error('Error al invocar Edge Function create-electronic-invoice-tolosa:', invokeErrorInfo);
            return {
                status: 'facturación pendiente',
                reason: 'INVOKE_ERROR',
                message: `Error al invocar facturación electrónica: ${error.message || 'sin mensaje'}`,
                debug: [
                    'Invoke error en create-electronic-invoice-tolosa.',
                    JSON.stringify(invokeErrorInfo),
                    JSON.stringify(payloadSummary),
                ],
            };
        }

        const cbteTipoFinal = data?.cbteTipo;
        const effectiveType = cbteTipoFinal === 1 ? 'A' : (cbteTipoFinal === 6 ? 'B' : sale.facturacion);

        if (effectiveType !== sale.facturacion && sale.facturacion !== 'N') {
            console.error(`[BUG_DETECTED] Mismatch de tipo de factura. Solicitado: ${sale.facturacion}, Emitido: ${effectiveType}`);
        }

        if (!data?.nro || !data?.cae) {
            console.error('INVALID_INVOICE_RESPONSE: La respuesta de la Edge Function no contiene los campos Nro y CAE esperados para la factura.', data);
            const providerHint = data?.message || data?.error || data?.detail || data?.reason || '';
            return {
                status: 'facturación pendiente',
                reason: 'INVALID_RESPONSE',
                message: `Respuesta de facturación inválida: faltan Nro o CAE.${providerHint ? ` ${providerHint}` : ''}`,
                data,
                debug: [
                    'Respuesta inválida de create-electronic-invoice-tolosa (sin nro/cae).',
                    JSON.stringify(data),
                    JSON.stringify(payloadSummary),
                ],
            };
        }

        return {
            status: 'facturado',
            data: { ...data, effectiveType },
            debug: [
                'Facturación exitosa.',
                JSON.stringify({ cae: data?.cae, nro: data?.nro, cbteTipoFinal, effectiveType }),
            ],
        };
    } catch (e: any) {
        console.error('Fallo la facturación electrónica para la venta', sale.id, e.message || e);
        return {
            status: 'facturación pendiente',
            reason: 'UNEXPECTED_ERROR',
            message: e.message || 'Error inesperado durante la facturación.',
            debug: ['Excepción inesperada en generateElectronicInvoice.', JSON.stringify({ error: e?.message || String(e) })],
        };
    }
};

export const generateElectronicCreditNote = async (sale: Sale, items: CartItem[]): Promise<any> => {
    try {
        if (!supabase) {
            console.warn('Supabase no está inicializado. Verifique las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
            return { status: 'facturación pendiente', reason: 'SUPABASE_NOT_INITIALIZED' };
        }

        const normalizedCustomer = normalizeCustomerForTusFacturas(sale.customer);
        const saleWithCreditNoteFlag = { ...sale, isCreditNote: true };
        const comprobante_tipo = determineInvoiceType(saleWithCreditNoteFlag);
        const cbteTipo = getCbteTipo(saleWithCreditNoteFlag);

        const saleForInvoice = { 
            ...sale, 
            customer: normalizedCustomer,
            items, 
            isCreditNote: true,
            cbteTipo: cbteTipo,
            comprobante_tipo: comprobante_tipo,
            requested_tipo: sale.facturacion,
            sent_tipo: comprobante_tipo
        };

        const { data, error } = await supabase.functions.invoke('create-electronic-invoice-tolosa', { body: { sale: saleForInvoice } });

        if (error) {
            console.error('Error al invocar Edge Function create-electronic-invoice-tolosa (Nota de Crédito):', { status: error.status, message: error.message, body: (error as any).body });
            return { status: 'facturación pendiente', reason: 'INVOKE_ERROR', message: error.message };
        }

        const cbteTipoFinal = data?.cbteTipo;
        const effectiveType = cbteTipoFinal === 3 ? 'A' : (cbteTipoFinal === 8 ? 'B' : sale.facturacion);

        return { status: 'facturado', data: { ...data, effectiveType } }; 
    } catch (e: any) {
        console.error('Fallo la generación de nota de crédito electrónica para la venta', sale.id, e.message || e);
        return { status: 'facturación pendiente', reason: 'UNEXPECTED_ERROR', message: e.message || 'Error inesperado durante la generación de nota de crédito.' };
    }
};

// --- TURNOS SUPABASE ---

export const getUserProfileByLegacyId = async (legacyUserId: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_user_profiles')
        .select('id, nombre, rol, activo, legacy_user_id')
        .eq('legacy_user_id', legacyUserId)
        .maybeSingle();
    
    if (error) {
        console.error(`Error buscando perfil para legacy_user_id: ${legacyUserId}`, error);
        throw new Error(`No se encontró un perfil de usuario migrado para el ID: ${legacyUserId}.`);
    }

    if (!data) {
        throw new Error(`No se encontró un perfil de usuario migrado para el ID: ${legacyUserId}.`);
    }
    
    return data;
};

export const getShiftsSupabase = async (): Promise<Shift[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_shifts')
        .select(`
            *,
            st_user_profiles (
                nombre,
                legacy_user_id
            )
        `)
        .order('opened_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(item => ({
        ID_Turno: item.id,
        ID_Usuario: item.st_user_profiles?.legacy_user_id || 'Unknown',
        Fecha_Apertura: new Date(item.opened_at),
        Fecha_Cierre: item.closed_at ? new Date(item.closed_at) : null,
        Monto_Apertura: Number(item.opening_amount),
        Monto_Cierre_Declarado: Number(item.closing_amount_declared || 0),
        Estado: item.status === 'open' ? 'Abierto' : 'Cerrado',
        Notas: item.notes || '',
        Total_Ventas_Efectivo: 0,
        Total_Gastos_Efectivo: 0,
        Efectivo_Esperado: 0,
        Diferencia: 0
    } as Shift));
};

export const openShiftSupabase = async (legacyUserId: string, openingAmount: number): Promise<Shift> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const profile = await getUserProfileByLegacyId(legacyUserId);
    
    const { data, error } = await supabase
        .from('st_shifts')
        .insert([{
            user_profile_id: profile.id,
            opening_amount: openingAmount,
            status: 'open',
            opened_at: new Date()
        }])
        .select(`
            *,
            st_user_profiles (
                legacy_user_id
            )
        `)
        .single();
    
    if (error) throw error;
    
    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.legacy_user_id || legacyUserId,
        Fecha_Apertura: new Date(data.opened_at),
        Fecha_Cierre: null,
        Monto_Apertura: Number(data.opening_amount),
        Monto_Cierre_Declarado: 0,
        Estado: 'Abierto',
        Total_Ventas_Efectivo: 0,
        Total_Gastos_Efectivo: 0,
        Efectivo_Esperado: 0,
        Diferencia: 0
    } as Shift;
};

// --- GASTOS SUPABASE ---

export const getExpensesSupabase = async (): Promise<Expense[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_expenses')
        .select('*')
        .order('spent_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(item => ({
        id_gastos: item.id,
        Fecha: new Date(item.spent_at),
        FechaRaw: item.spent_at,
        Monto: Number(item.amount),
        Detalle: item.detail,
        Tipo: item.category || item.tipo || item.type || 'Otros',
        Efectivo: Number(item.payment_cash || 0),
        Digital: Number(item.payment_digital || 0),
        shiftId: item.shift_id
    } as Expense));
};

export const addExpenseSupabase = async (expenseData: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'; shiftId?: string; spentAt?: string; }): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const { data, error } = await supabase
        .from('st_expenses')
        .insert([{
            shift_id: expenseData.shiftId || null,
            spent_at: expenseData.spentAt || new Date().toISOString(),
            amount: expenseData.monto,
            detail: expenseData.detalle,
            category: expenseData.tipo || 'Otros',
            payment_cash: expenseData.paymentType === 'Efectivo' ? expenseData.monto : 0,
            payment_digital: expenseData.paymentType === 'Digital' ? expenseData.monto : 0,
            legacy_expense_id: null
        }])
        .select();
    
    if (error) throw error;
    return data[0];
};

export const updateExpenseSupabase = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros' }): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const { data, error } = await supabase
        .from('st_expenses')
        .update({
            amount: expenseData.monto,
            detail: expenseData.detalle,
            category: expenseData.tipo || 'Otros',
            payment_cash: expenseData.paymentType === 'Efectivo' ? expenseData.monto : 0,
            payment_digital: expenseData.paymentType === 'Digital' ? expenseData.monto : 0,
            updated_at: new Date()
        })
        .eq('id', expenseData.id_gastos)
        .select();
    
    if (error) throw error;
    return data[0];
};

export const deleteExpenseSupabase = async (id: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_expenses')
        .delete()
        .eq('id', id)
        .select();
    
    if (error) throw error;
    return data[0];
};

export const closeShiftSupabase = async (shiftId: string, closingAmount: number): Promise<Shift> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const { data, error } = await supabase
        .from('st_shifts')
        .update({
            closing_amount_declared: closingAmount,
            status: 'closed',
            closed_at: new Date()
        })
        .eq('id', shiftId)
        .select(`
            *,
            st_user_profiles (
                legacy_user_id
            )
        `)
        .single();
    
    if (error) throw error;
    
    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.legacy_user_id || 'Unknown',
        Fecha_Apertura: new Date(data.opened_at),
        Fecha_Cierre: new Date(data.closed_at),
        Monto_Apertura: Number(data.opening_amount),
        Monto_Cierre_Declarado: Number(data.closing_amount_declared),
        Estado: 'Cerrado',
        Total_Ventas_Efectivo: 0,
        Total_Gastos_Efectivo: 0,
        Efectivo_Esperado: 0,
        Diferencia: 0
    } as Shift;
};

export const getActiveShiftSupabase = async (legacyUserId: string): Promise<Shift | null> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const profile = await getUserProfileByLegacyId(legacyUserId);
    
    const { data, error } = await supabase
        .from('st_shifts')
        .select(`
            *,
            st_user_profiles (
                legacy_user_id
            )
        `)
        .eq('user_profile_id', profile.id)
        .eq('status', 'open')
        .maybeSingle();
    
    if (error) throw error;
    if (!data) return null;
    
    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.legacy_user_id || legacyUserId,
        Fecha_Apertura: new Date(data.opened_at),
        Fecha_Cierre: null,
        Monto_Apertura: Number(data.opening_amount),
        Monto_Cierre_Declarado: 0,
        Estado: 'Abierto',
        Total_Ventas_Efectivo: 0,
        Total_Gastos_Efectivo: 0,
        Efectivo_Esperado: 0,
        Diferencia: 0
    } as Shift;
};

export const getAnyActiveShiftSupabase = async (): Promise<Shift | null> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_shifts')
        .select(`
            *,
            st_user_profiles (
                legacy_user_id
            )
        `)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.legacy_user_id || 'Unknown',
        Fecha_Apertura: new Date(data.opened_at),
        Fecha_Cierre: null,
        Monto_Apertura: Number(data.opening_amount),
        Monto_Cierre_Declarado: 0,
        Estado: 'Abierto',
        Total_Ventas_Efectivo: 0,
        Total_Gastos_Efectivo: 0,
        Efectivo_Esperado: 0,
        Diferencia: 0,
    } as Shift;
};

// --- VENTAS Y USUARIOS SUPABASE ---

export const getUsersSupabase = async (onlyActive = true): Promise<User[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_user_profiles')
        .select('*');

    if (error) {
        console.error('getUsersSupabase error:', error);
        throw error;
    }

    const rows = Array.isArray(data) ? data : [];

    const normalized: User[] = rows
        .map((item: any) => {
            const nombre =
                item?.nombre ??
                item?.Nombre ??
                item?.name ??
                item?.full_name ??
                '';

            const pin =
                item?.pin ??
                item?.PIN ??
                '';

            const rol =
                item?.rol ??
                item?.Rol ??
                item?.role ??
                '';

            const activoRaw =
                item?.activo ??
                item?.is_active ??
                item?.active ??
                item?.Activo ??
                item?.estado ??
                true;

            const activo =
                activoRaw === true ||
                activoRaw === 'SI' ||
                activoRaw === 'si' ||
                activoRaw === 'Sí' ||
                activoRaw === 'sí' ||
                activoRaw === 1 ||
                activoRaw === '1';

            return {
                ID_Usuario:
                    item?.legacy_user_id ||
                    item?.id ||
                    item?.ID_Usuario ||
                    '',
                Nombre: String(nombre || ''),
                PIN: String(pin || ''),
                Rol: String(rol || ''),
                Activo: activo ? 'SI' : 'NO'
            } as User;
        })
        .filter((u) => !!u.ID_Usuario);

    return onlyActive ? normalized.filter((u) => u.Activo === 'SI') : normalized;
};

export const getSalesSupabase = async (statusFilter: string[] = ['active', 'annulled']): Promise<Sale[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_sales')
        .select(`
            *,
            st_sale_items (
                *,
                st_products (
                    name,
                    cod
                    
                )
            ),
            st_customers (
                full_name,
                whatsapp,
                document_type,
                document_number,
                iva_condition
            )
        `)
        .in('status', statusFilter)
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(item => {
        const items: CartItem[] = (item.st_sale_items || []).map((si: any) => ({
    product: {
        cod: si.st_products?.cod || si.product_cod_legacy,
        Producto: si.st_products?.name || si.product_name_legacy,
        Categoria: ''
    } as Product,
    quantity: si.quantity,
    price: si.unit_price
}));

        const customer: Customer | null = item.st_customers ? {
            Id_Cliente: item.customer_id,
            'Nombre y Apellido': item.st_customers.full_name,
            Whatsapp: item.st_customers.whatsapp || '',
            'Tipo.Documento': item.st_customers.document_type || 'DNI',
            Documento: item.st_customers.document_number || '',
            Condicion_IVA: item.st_customers.iva_condition || 'Consumidor Final',
            Deuda: 0,
            Pagos: 0
        } : null;

        return {
            id: item.id,
            date: new Date(item.created_at),
            customer,
            items,
            itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
            subtotal: Number(item.subtotal),
            total: Number(item.total),
            payment: {
                cash: Number(item.payment_cash || 0),
                digital: Number(item.payment_digital || 0),
                credit: Number(item.payment_credit || 0),
                echeqs: item.payment_echeqs || []
            },
            facturacion: item.billing_type || 'N',
            status: item.status === 'active' ? 'active' : 'annulled',
            facturaInfo: item.billing_cae ? {
                cae: item.billing_cae,
                nro: item.billing_number,
                vtoCae: item.billing_vto_cae,
                qrData: item.billing_qr_data,
                fecha: item.billing_date,
                url: item.billing_pdf_url,
                ticketUrl: item.billing_ticket_url
            } : undefined
        } as Sale;
    });
};

export const addBudgetSupabase = async (budget: Budget): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    // Obtener el último budget_number
    const { data: lastBudget } = await supabase
        .from('st_budgets')
        .select('budget_number')
        .order('budget_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextBudgetNumber = Number(lastBudget?.budget_number ?? 0) + 1;
    const customerId = budget.customer?.Id_Cliente && budget.customer.Id_Cliente !== '0' ? budget.customer.Id_Cliente : null;

    const { data: insertedBudget, error: budgetError } = await supabase
        .from('st_budgets')
        .insert([{
            budget_number: nextBudgetNumber,
            customer_id: customerId,
            budgeted_at: budget.date instanceof Date ? budget.date.toISOString() : new Date().toISOString(),
            subtotal: typeof budget.subtotal === 'number' ? budget.subtotal : budget.total,
            adjustment_amount: typeof budget.adjustmentAmount === 'number' ? budget.adjustmentAmount : 0,
            total: budget.total,
            status: 'pending',
            customer_name_snapshot: budget.customer?.['Nombre y Apellido'] || 'Consumidor Final',
            customer_document_snapshot: budget.customer?.Documento || null
        }])
        .select()
        .single();

    if (budgetError) throw budgetError;

    const productCodes = budget.items.map(i => i.product?.cod).filter(Boolean);
    let productMap = new Map<string, string>();
    if (productCodes.length > 0) {
        const { data: productRows } = await supabase.from('st_products').select('id, cod').in('cod', productCodes);
        productMap = new Map((productRows || []).map((p: any) => [p.cod, p.id]));
    }

    const itemsToInsert = budget.items.map(item => ({
        budget_id: insertedBudget.id,
        product_id: productMap.get(item.product.cod) || null,
        product_code: item.product.cod || null,
        product_name_snapshot: item.product.Producto || 'Producto',
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.price ?? 0),
        line_total: Number(item.quantity ?? 0) * Number(item.price ?? 0)
    }));

    if (itemsToInsert.length > 0) {
        await supabase.from('st_budget_items').insert(itemsToInsert);
    }
};

export const updateBudgetSupabase = async (budget: Budget): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const customerId = budget.customer?.Id_Cliente && budget.customer.Id_Cliente !== '0' ? budget.customer.Id_Cliente : null;

    const { error: saleError } = await supabase
        .from('st_sales')
        .update({
            customer_id: customerId,
            total: budget.total,
            subtotal: budget.total,
            customer_name_snapshot: budget.customer?.['Nombre y Apellido'] || 'Consumidor Final',
            customer_document_snapshot: budget.customer?.Documento || null,
            updated_at: new Date()
        })
        .eq('id', budget.id);

    if (saleError) throw saleError;

    await supabase.from('st_sale_items').delete().eq('sale_id', budget.id);

    const productCodes = budget.items.map(i => i.product?.cod).filter(Boolean);
    let productMap = new Map<string, string>();
    if (productCodes.length > 0) {
        const { data: productRows } = await supabase.from('st_products').select('id, cod').in('cod', productCodes);
        productMap = new Map((productRows || []).map((p: any) => [p.cod, p.id]));
    }

    const itemsToInsert = budget.items.map(item => ({
        sale_id: budget.id,
        product_id: productMap.get(item.product.cod) || null,
        product_code: item.product.cod || null,
        product_name_snapshot: item.product.Producto || 'Producto',
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.price ?? 0),
        line_total: Number(item.quantity ?? 0) * Number(item.price ?? 0)
    }));

    if (itemsToInsert.length > 0) {
        await supabase.from('st_sale_items').insert(itemsToInsert);
    }
};

export const updateBudgetStatusSupabase = async (budgetId: string, status: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { error } = await supabase
        .from('st_sales')
        .update({ status, updated_at: new Date() })
        .eq('id', budgetId);
    if (error) throw error;
};

export const deleteBudgetSupabase = async (budgetId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { error } = await supabase
        .from('st_sales')
        .update({ status: 'deleted', updated_at: new Date() })
        .eq('id', budgetId);
    if (error) throw error;
};

export const getBudgetsSupabase = async (): Promise<Budget[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    // Traer presupuestos y sus items
    const { data: budgetsRaw, error: budgetsError } = await supabase
        .from('st_budgets')
        .select(`
            id,
            budget_number,
            customer_id,
            budgeted_at,
            subtotal,
            adjustment_amount,
            total,
            status,
            customer_name_snapshot,
            customer_document_snapshot,
            st_budget_items (
                id,
                product_id,
                product_code,
                product_name_snapshot,
                quantity,
                unit_price,
                line_total
            )
        `)
        .in('status', ['pending', 'approved']);

    if (budgetsError) throw budgetsError;
    if (!budgetsRaw) return [];

    return budgetsRaw.map((b: any) => ({
        id: b.id,
        date: b.budgeted_at ? new Date(b.budgeted_at) : new Date(),
        customer: {
            Id_Cliente: b.customer_id || '',
            'Nombre y Apellido': b.customer_name_snapshot || 'Consumidor Final',
            Whatsapp: '',
            'Tipo.Documento': '',
            Documento: b.customer_document_snapshot || '',
            Condicion_IVA: 'Consumidor Final',
            Deuda: 0,
            Pagos: 0
        },
        items: (b.st_budget_items || []).map((item: any) => ({
            product: {
                cod: item.product_code || '',
                Producto: item.product_name_snapshot || '',
            },
            quantity: Number(item.quantity ?? 0),
            price: Number(item.unit_price ?? 0),
            line_total: Number(item.line_total ?? 0),
        })),
        total: Number(b.total ?? 0),
        status: b.status,
        shiftId: '',
        subtotal: typeof b.subtotal === 'number' ? b.subtotal : undefined,
        adjustmentAmount: typeof b.adjustment_amount === 'number' ? b.adjustment_amount : undefined,
    }));
};

// =============================================================================
// --- LEGACY SERVICES (PENDING MIGRATION) ---
// =============================================================================

const buildInvoiceData = (item: any, linkedInvoice: any) => {
    const invoiceTypeRaw = String(linkedInvoice?.invoice_type || '').toUpperCase();
    const isCreditNoteInvoice =
        invoiceTypeRaw.includes('NC') ||
        invoiceTypeRaw.includes('NOTA') ||
        invoiceTypeRaw.includes('CREDITO');

    const cae = (isCreditNoteInvoice ? undefined : linkedInvoice?.cae) || item.billing_cae || item.legacy_cae || '';
    const nro = (isCreditNoteInvoice ? undefined : linkedInvoice?.nro) || item.billing_number || item.legacy_invoice_number || '';
    const vtoCae = linkedInvoice?.vto_cae || item.billing_vto_cae || '';
    const qrData = linkedInvoice?.qr_data || item.billing_qr_data || '';
    const pdfUrl =
        (isCreditNoteInvoice ? undefined : linkedInvoice?.pdf_url) ||
        item.billing_pdf_url ||
        (isCreditNoteInvoice ? undefined : linkedInvoice?.url) ||
        item.legacy_invoice_url ||
        undefined;
    const ticketUrl =
        (isCreditNoteInvoice ? undefined : linkedInvoice?.comprobante_ticket_url) ||
        (isCreditNoteInvoice ? undefined : linkedInvoice?.ticket_url) ||
        (isCreditNoteInvoice ? undefined : linkedInvoice?.url) ||
        item.billing_ticket_url ||
        undefined;
    const invoiceType = linkedInvoice?.invoice_type || item.billing_type || item.invoice_type || 'N';
    const fecha = linkedInvoice?.issued_at || linkedInvoice?.created_at || item.billing_date || item.sold_at;

    return {
        cae,
        nro,
        vtoCae,
        qrData,
        pdfUrl,
        ticketUrl,
        invoiceType,
        fecha,
    };
};

export const getSales = async (): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_sales')
        .select(`
            *,
            st_sale_items (
                *,
                st_products (
                    name,
                    cod
                )
            ),
            st_customers (
                full_name,
                whatsapp,
                document_type,
                document_number,
                iva_condition
            )
        `)
        .in('status', ['active', 'annulled', 'pending', 'approved'])
        .order('sold_at', { ascending: false });

    if (error) throw error;

    const salesRows = Array.isArray(data) ? data : [];
    const saleIds = salesRows.map((row: any) => String(row?.id || '')).filter(Boolean);
    const invoiceBySaleId = new Map<string, any>();

    // Try to enrich sales with the real fiscal source (public.invoices) linked by sale_id.
    // If this query fails for any reason, we keep legacy st_sales fields as fallback.
    if (saleIds.length > 0) {
        const baseOrder = { ascending: false };
        const primarySelect = 'sale_id, cae, nro, qr_data, pdf_url, ticket_url, comprobante_ticket_url, url, vto_cae, invoice_type, created_at, issued_at';
        const fallbackSelect = 'sale_id, cae, nro, qr_data, pdf_url, created_at';

        let invoicesData: any[] = [];
        let invoicesError: any = null;

        try {
            const primaryResponse = await supabase
                .from('invoices')
                .select(primarySelect)
                .in('sale_id', saleIds)
                .order('created_at', baseOrder);
            invoicesData = Array.isArray(primaryResponse.data) ? primaryResponse.data : [];
            invoicesError = primaryResponse.error;

            if (invoicesError) {
                const fallbackResponse = await supabase
                    .from('invoices')
                    .select(fallbackSelect)
                    .in('sale_id', saleIds)
                    .order('created_at', baseOrder);

                invoicesData = Array.isArray(fallbackResponse.data) ? fallbackResponse.data : [];
                invoicesError = fallbackResponse.error;
            }
        } catch {
            // Non-blocking: if invoices lookup fails, st_sales fallback fields are used.
        }

        if (!invoicesError && Array.isArray(invoicesData)) {
            for (const invoice of invoicesData) {
                const linkedSaleId = String(invoice?.sale_id || '').trim();
                if (!linkedSaleId) continue;
                // Query ordered by newest first, keep the first invoice per sale.
                if (!invoiceBySaleId.has(linkedSaleId)) {
                    invoiceBySaleId.set(linkedSaleId, invoice);
                }
            }
        }

    }

    return salesRows.map((item: any) => {
        const linkedInvoice = invoiceBySaleId.get(String(item.id || ''));
        const invoiceData = buildInvoiceData(item, linkedInvoice);
        const items = (item.st_sale_items || []).map((si: any) => ({
            product: {
                cod: si.st_products?.cod || si.product_code || '',
                Producto: si.st_products?.name || si.product_name_snapshot || '',
                Precio: Number(si.unit_price ?? 0)
            },
            quantity: Number(si.quantity ?? 0)
        }));

        const estado =
            item.status === 'pending'
                ? 'Pendiente'
                : item.status === 'approved'
                ? 'Aprobado'
                : item.status === 'annulled'
                ? 'Anulada'
                : 'Completada';

        return {
            ID_Venta: item.id,
            Fecha: item.sold_at,
            ID_Cliente: item.customer_id || '0',
            Nombre_Cliente:
                item.st_customers?.full_name ||
                item.customer_name_snapshot ||
                'Consumidor Final',
            Cant_Productos: items.reduce((acc: number, i: any) => acc + Number(i.quantity || 0), 0),
            Subtotal: Number(item.subtotal ?? 0),
            Total: Number(item.total ?? 0),
            Monto_Ajuste: Number(item.adjustment_amount ?? 0),
            Descripcion_Ajuste: item.notes || '',
            Pago_Efectivo: Number(item.payment_cash ?? 0),
            Pago_Digital: Number(item.payment_digital ?? 0),
            Pago_Cuenta_Corriente: Number(item.payment_credit ?? 0),
            'Productos (JSON)': JSON.stringify(items),
            'Echeqs (JSON)': JSON.stringify([]),
            Estado: estado,
            ID_Turno: item.shift_id || undefined,
            Facturacion: invoiceData.invoiceType,
            Factura_CAE: invoiceData.cae,
            Factura_Nro: invoiceData.nro,
            Factura_Fecha: invoiceData.fecha,
            Factura_Vto_CAE: invoiceData.vtoCae,
            Factura_QR_Data: invoiceData.qrData,
            Factura_URL: invoiceData.pdfUrl,
            Factura_Ticket_URL: invoiceData.ticketUrl
        };
    });
};

export const getExpenses = async (): Promise<Expense[]> => {
    return getExpensesSupabase();
};

export const addExpense = async (data: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'; shiftId?: string; }): Promise<void> => {
    await addExpenseSupabase(data);
};

export const updateExpense = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros' }): Promise<void> => {
    await updateExpenseSupabase(expenseData);
};

export const deleteExpense = async (expenseId: string): Promise<void> => {
    await deleteExpenseSupabase(expenseId);
};

export const getUsers = async (): Promise<User[]> => {
    return getUsersSupabase(true);
};

export const login = async (userId: string, pin: string): Promise<{user: User, activeShift: Shift | null}> => {
    const response = await postToScript('login', { userId, pin }, { allowQueue: false });
    return response.data || response;
};

export const openShift = async (userId: string, openingAmount: number): Promise<Shift> => {
    const response = await postToScript('openShift', { userId, openingAmount });
    const shift = response.data;
    return { ...shift, Fecha_Apertura: new Date(shift.Fecha_Apertura) };
};

export const closeShift = async (shiftId: string, closingAmount: number): Promise<Shift> => {
    const response = await postToScript('closeShift', { shiftId, closingAmount });
    const shift = response.data;
    return { 
      ...shift, 
      Fecha_Apertura: new Date(shift.Fecha_Apertura),
      Fecha_Cierre: shift.Fecha_Cierre ? new Date(shift.Fecha_Cierre) : null,
    };
};

export const getShifts = async (): Promise<Shift[]> => {
    return getShiftsSupabase();
};

export const getProducts = async (): Promise<Product[]> => {
    return getProductsSupabase();
};

export const getCustomers = async (): Promise<Customer[]> => {
    return getCustomersSupabase();
};

export const addSale = async (sale: Sale, shiftId: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

    const { data: lastSale, error: lastSaleError } = await supabase
        .from('st_sales')
        .select('sale_number')
        .order('sale_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastSaleError) throw lastSaleError;

    const nextSaleNumber = Number(lastSale?.sale_number ?? 0) + 1;

    const customerId =
        sale.customer?.Id_Cliente &&
        sale.customer.Id_Cliente !== '0' &&
        !String(sale.customer.Id_Cliente).startsWith('CLAD')
            ? sale.customer.Id_Cliente
            : null;

    console.log('[DIAG097 addSale sale id][api.addSale input]', {
        saleId: sale.id,
        shiftId,
        customerId,
        invoiceType: sale.facturacion || 'N',
    });

    const saleInsert = {
        ...(isUuid(String(sale.id || '')) ? { id: sale.id } : {}),
        sale_number: nextSaleNumber,
        sold_at: sale.date instanceof Date ? sale.date.toISOString() : new Date().toISOString(),
        customer_id: customerId,
        shift_id: shiftId || null,
        subtotal: Number(sale.subtotal ?? 0),
        adjustment_amount: Number(sale.adjustmentAmount ?? 0),
        total: Number(sale.total ?? 0),
        payment_cash: Number(sale.payment?.cash ?? 0),
        payment_digital: Number(sale.payment?.digital ?? 0),
        payment_credit: Number(sale.payment?.credit ?? 0),
        invoice_type: sale.facturacion || 'N',
        status: 'active',
        customer_name_snapshot: sale.customer?.['Nombre y Apellido'] || 'Consumidor Final',
        customer_document_snapshot: sale.customer?.Documento || null,
        notes: sale.adjustmentDescription || null
    };

    const { data: insertedSale, error: saleError } = await supabase
        .from('st_sales')
        .insert([saleInsert])
        .select()
        .single();

    if (saleError) throw saleError;

    console.log('[DIAG097 inserted st_sales id][api.addSale result]', {
        requestedSaleId: sale.id,
        insertedSaleId: insertedSale.id,
        matches: String(sale.id || '') === String(insertedSale.id || ''),
    });

    const hasFiscalData = Boolean(sale.facturaInfo);
    if (hasFiscalData) {
        const facturaInfo: any = sale.facturaInfo || {};
        const billingUpdate = {
            billing_cae: facturaInfo?.cae ?? null,
            billing_number: facturaInfo?.nro ?? null,
            billing_vto_cae: facturaInfo?.vtoCae ?? facturaInfo?.vto_cae ?? null,
            billing_qr_data: facturaInfo?.qrData ?? facturaInfo?.qr_data ?? null,
            billing_pdf_url: facturaInfo?.url ?? facturaInfo?.pdf_url ?? null,
            billing_ticket_url: facturaInfo?.ticketUrl ?? facturaInfo?.ticket_url ?? null,
            billing_date: new Date().toISOString(),
            legacy_cae: facturaInfo?.cae ?? null,
            legacy_invoice_number: facturaInfo?.nro ?? null,
            legacy_invoice_url: facturaInfo?.url ?? facturaInfo?.pdf_url ?? null,
            updated_at: new Date().toISOString(),
        };

        const { error: billingUpdateError } = await supabase
            .from('st_sales')
            .update(billingUpdate)
            .eq('id', insertedSale.id);

        if (billingUpdateError) {
            console.error('[DIAG098][api.addSale billing persist error]', {
                saleId: insertedSale.id,
                message: billingUpdateError.message,
            });
        } else {
            Object.assign(insertedSale, billingUpdate);
            console.log('[DIAG098][api.addSale billing persisted]', {
                saleId: insertedSale.id,
                cae: billingUpdate.billing_cae,
                nro: billingUpdate.billing_number,
                hasPdfUrl: Boolean(billingUpdate.billing_pdf_url),
                hasTicketUrl: Boolean(billingUpdate.billing_ticket_url),
            });
        }
    }

    if ((sale.facturacion || 'N') !== 'N') {
        const { data: linkedInvoice, error: linkedInvoiceError } = await supabase
            .from('invoices')
            .select('sale_id, nro, created_at')
            .eq('sale_id', insertedSale.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (linkedInvoiceError) {
            console.warn('[DIAG097 invoice sale id][api.addSale invoice lookup error]', {
                saleId: insertedSale.id,
                error: linkedInvoiceError.message,
            });
        } else {
            console.log('[DIAG097 invoice sale id][api.addSale invoice lookup]', {
                insertedSaleId: insertedSale.id,
                invoiceSaleId: linkedInvoice?.sale_id || null,
                invoiceNumber: linkedInvoice?.nro || null,
                matches: String(insertedSale.id || '') === String(linkedInvoice?.sale_id || ''),
            });
        }
    }

    const productCodes = sale.items
        .map(i => i.product?.cod)
        .filter(Boolean);

    let productMap = new Map<string, string>();

    if (productCodes.length > 0) {
        const { data: productRows, error: productError } = await supabase
            .from('st_products')
            .select('id, cod')
            .in('cod', productCodes);

        if (productError) throw productError;

        productMap = new Map((productRows || []).map((p: any) => [p.cod, p.id]));
    }

    const itemsToInsert = sale.items.map(item => ({
        sale_id: insertedSale.id,
        product_id: productMap.get(item.product.cod) || null,
        product_code: item.product.cod || null,
        product_name_snapshot: item.product.Producto || 'Producto',
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.price ?? 0),
        line_total: Number(item.quantity ?? 0) * Number(item.price ?? 0)
    }));

    if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
            .from('st_sale_items')
            .insert(itemsToInsert);

        if (itemsError) {
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw itemsError;
        }
    }

    // --- FIX: Insertar movimiento de débito en cuenta corriente si corresponde ---
    if (customerId && Number(sale.payment?.credit ?? 0) > 0) {
        const debitMovement = {
            customer_id: customerId,
            type: 'Venta',
            description: 'Venta a cuenta corriente',
            debit: Number(sale.payment.credit),
            credit: 0,
            original_sale_id: insertedSale.id,
            shift_id: shiftId || null,
            items: sale.items ? JSON.stringify(sale.items) : null,
            factura_info: null,
            date: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };
        const { error: debitError } = await supabase
            .from('st_account_transactions')
            .insert([debitMovement]);
        if (debitError) {
            // Si falla, no revertimos la venta, pero logueamos el error
            console.error('[Cuenta Corriente] Error al insertar movimiento de débito:', debitError);
        }
    }

    return {
        status: 'success',
        sale_id: insertedSale.id,
        data: insertedSale
    };
};

export const updateSale = async (originalSale: Sale, updatedSale: Sale): Promise<void> => {
    await postToScript('updateSale', { originalSale, updatedSale });
};

export const updateSalePaymentAllocationSupabase = async (
    saleId: string,
    payment: { cash: number; digital: number; credit: number }
): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!saleId) throw new Error('ID de venta inválido');

    const { error } = await supabase
        .from('st_sales')
        .update({
            payment_cash: Number(payment.cash || 0),
            payment_digital: Number(payment.digital || 0),
            payment_credit: Number(payment.credit || 0),
            updated_at: new Date().toISOString(),
        })
        .eq('id', saleId);

    if (error) throw error;
};

export const updateSalePaymentAllocation = async (
    saleId: string,
    payment: { cash: number; digital: number; credit: number }
): Promise<void> => {
    return updateSalePaymentAllocationSupabase(saleId, payment);
};

export const addCustomer = async (customerData: any): Promise<void> => {
    await addCustomerSupabase(customerData);
};

export const updateCustomer = async (customerData: any): Promise<void> => {
    await updateCustomerSupabase(customerData);
};

export const recordPayment = async (customerId: string, amount: number, description: string, paymentMethod: string, shiftId: string): Promise<void> => {
    await postToScript('recordPayment', { customerId, amount, paymentMethod, description, date: formatDateForSheet(new Date()), shiftId });
};

export const createCreditNote = async (payload: any): Promise<void> => {
    await postToScript('createCreditNote', { ...payload, date: formatDateForSheet(new Date()) });
};

export const annulSaleSupabase = async (saleId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { error } = await supabase
        .from('st_sales')
        .update({ 
            status: 'annulled',
            updated_at: new Date().toISOString()
        })
        .eq('id', saleId);

    if (error) throw error;
};

export const annulSale = async (saleId: string): Promise<void> => {
    return annulSaleSupabase(saleId);
};

export const getCustomerStatement = async (customerId: string): Promise<AccountTransaction[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_account_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .order('date', { ascending: true });
    if (error) throw error;
    let balance = 0;
    return (data || []).map((item: any) => {
        const debit = Number(item.debit) || 0;
        const credit = Number(item.credit) || 0;
        balance += debit - credit;
        let parsedDate: Date = new Date(item.date || item.created_at || Date.now());
        return {
            id: item.id,
            date: parsedDate,
            type: item.type,
            description: item.description,
            debit,
            credit,
            balance,
            originalSaleId: item.original_sale_id,
        };
    });
};

export const getAccountTransactions = async (): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_account_transactions')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
};

export const getBudgets = async (): Promise<Budget[]> => {
    return getBudgetsSupabase();
};

export const addBudget = async (budget: Budget): Promise<void> => {
    await addBudgetSupabase(budget);
};

export const updateBudget = async (budget: Budget): Promise<void> => {
    await updateBudgetSupabase(budget);
};

export const updateBudgetStatus = async (budgetId: string, status: string): Promise<void> => {
    await updateBudgetStatusSupabase(budgetId, status);
};

export const deleteBudget = async (budgetId: string): Promise<void> => {
    await deleteBudgetSupabase(budgetId);
};

export const convertBudgetToSaleSupabase = async (
    budget: Budget,
    payment: any,
    shiftId: string,
    facturacion: string,
    customer: any,
    total: number,
    adjustmentAmount: number,
    adjustmentDescription: string
): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data: currentBudget, error: currentBudgetError } = await supabase
        .from('st_budgets')
        .select('id, converted_to_sale_id, status')
        .eq('id', budget.id)
        .maybeSingle();

    if (currentBudgetError) throw currentBudgetError;
    if (!currentBudget) throw new Error('No se encontró el presupuesto.');
    if (currentBudget.converted_to_sale_id) {
        throw new Error('Este presupuesto ya fue convertido a venta.');
    }

    const { data: lastSale, error: lastSaleError } = await supabase
        .from('st_sales')
        .select('sale_number')
        .order('sale_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastSaleError) throw lastSaleError;

    const nextSaleNumber = Number(lastSale?.sale_number ?? 0) + 1;

    const customerId =
        customer?.Id_Cliente &&
        customer.Id_Cliente !== '0' &&
        !String(customer.Id_Cliente).startsWith('CLAD')
            ? customer.Id_Cliente
            : null;

    const saleInsert = {
        sale_number: nextSaleNumber,
        sold_at: new Date().toISOString(),
        customer_id: customerId,
        shift_id: shiftId || null,
        subtotal: Number(total ?? 0) - Number(adjustmentAmount ?? 0),
        adjustment_amount: Number(adjustmentAmount ?? 0),
        total: Number(total ?? 0),
        payment_cash: Number(payment?.cash ?? 0),
        payment_digital: Number(payment?.digital ?? 0),
        payment_credit: Number(payment?.credit ?? 0),
        invoice_type: facturacion || 'N',
        status: 'active',
        customer_name_snapshot: customer?.['Nombre y Apellido'] || 'Consumidor Final',
        customer_document_snapshot: customer?.Documento || null,
        notes: adjustmentDescription || null
    };

    const { data: insertedSale, error: saleError } = await supabase
        .from('st_sales')
        .insert([saleInsert])
        .select()
        .single();

    if (saleError) throw saleError;

    const productCodes = budget.items
        .map(i => i.product?.cod)
        .filter(Boolean);

    let productMap = new Map<string, string>();

    if (productCodes.length > 0) {
        const { data: productRows, error: productError } = await supabase
            .from('st_products')
            .select('id, cod')
            .in('cod', productCodes);

        if (productError) {
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw productError;
        }

        productMap = new Map((productRows || []).map((p: any) => [p.cod, p.id]));
    }

    const itemsToInsert = budget.items.map(item => ({
        sale_id: insertedSale.id,
        product_id: productMap.get(item.product.cod) || null,
        product_code: item.product.cod || null,
        product_name_snapshot: item.product.Producto || 'Producto',
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.price ?? 0),
        line_total: Number(item.quantity ?? 0) * Number(item.price ?? 0)
    }));

    if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
            .from('st_sale_items')
            .insert(itemsToInsert);

        if (itemsError) {
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw itemsError;
        }
    }

    if (customerId && Number(payment?.credit ?? 0) > 0) {
        const debitMovement = {
            customer_id: customerId,
            type: 'Venta',
            description: 'Venta generada desde presupuesto',
            debit: Number(payment.credit),
            credit: 0,
            original_sale_id: insertedSale.id,
            shift_id: shiftId || null,
            items: budget.items ? JSON.stringify(budget.items) : null,
            factura_info: null,
            date: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };

        const { error: debitError } = await supabase
            .from('st_account_transactions')
            .insert([debitMovement]);

        if (debitError) {
            console.error('[Cuenta Corriente] Error al insertar movimiento de débito:', debitError);
        }
    }

    const { error: budgetUpdateError } = await supabase
        .from('st_budgets')
        .update({
            converted_to_sale_id: insertedSale.id,
            status: 'approved',
            updated_at: new Date().toISOString()
        })
        .eq('id', budget.id);

    if (budgetUpdateError) {
        await supabase.from('st_sale_items').delete().eq('sale_id', insertedSale.id);
        await supabase.from('st_sales').delete().eq('id', insertedSale.id);
        throw budgetUpdateError;
    }

    return insertedSale;
};

export const convertBudgetToSale = async (
    budget: Budget,
    payment: any,
    shiftId: string,
    facturacion: string,
    customer: any,
    total: number,
    adjustmentAmount: number,
    adjustmentDescription: string
): Promise<any> => {
    return convertBudgetToSaleSupabase(
        budget,
        payment,
        shiftId,
        facturacion,
        customer,
        total,
        adjustmentAmount,
        adjustmentDescription
    );
};

export const recordStockEntrySupabase = async (items: StockEntryItem[], _userId: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const productCodes = items.map(i => i.product.cod);
    const { data: products, error: fetchError } = await supabase
        .from('st_products')
        .select('cod, income_count, current_stock, supplier_id, auto_price')
        .in('cod', productCodes);

    if (fetchError) throw fetchError;

    const productMap = new Map((products || []).map((p: any) => [p.cod, p]));
    const supplierIds = Array.from(
        new Set(
            (products || [])
                .map((p: any) => p.supplier_id)
                .filter((id: any) => !!id)
                .map((id: any) => String(id))
        )
    );

    const supplierMarkupMap = new Map<string, number>();
    if (supplierIds.length > 0) {
        const { data: suppliers, error: suppliersError } = await supabase
            .from('st_suppliers')
            .select('id, markup_pct')
            .in('id', supplierIds);

        if (suppliersError) throw suppliersError;

        for (const supplier of suppliers || []) {
            const markup = Number((supplier as any)?.markup_pct);
            supplierMarkupMap.set(
                String((supplier as any)?.id || ''),
                Number.isFinite(markup) ? markup : 40
            );
        }
    }

    let updatedCostCount = 0;

    for (const item of items) {
        const dbProduct = productMap.get(item.product.cod);
        if (!dbProduct) continue;

        const newIncomeCount = (Number(dbProduct.income_count) || 0) + Number(item.quantity);
        const newCurrentStock = (Number(dbProduct.current_stock) || 0) + Number(item.quantity);
        
        const updateData: any = {
            income_count: newIncomeCount,
            current_stock: newCurrentStock,
            cost_price: Number(item.costPrice),
            list_price: Number(item.salePrice),
            updated_at: new Date()
        };

        if (dbProduct.auto_price === true) {
            const supplierId = dbProduct.supplier_id ? String(dbProduct.supplier_id) : '';
            const markupPct = supplierMarkupMap.get(supplierId) ?? 40;
            updateData.final_price = calculateFinalPriceFromCost(Number(item.costPrice), markupPct);
        }

        if (item.reactivate) {
            updateData.is_active = true;
        }

        const { error: updateError } = await supabase
            .from('st_products')
            .update(updateData)
            .eq('cod', item.product.cod);

        if (updateError) throw updateError;
        updatedCostCount++;
    }

    return { status: 'success', updatedCostCount };
};

export const recordStockEntry = async (items: StockEntryItem[], userId: string): Promise<any> => {
    return recordStockEntrySupabase(items, userId);
};

export const createSupplierInvoice = async (invoice: SupplierInvoice) => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('supplier_invoices')
        .insert([invoice])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const createSupplierInvoiceItems = async (items: SupplierInvoiceItem[]) => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { error } = await supabase
        .from('supplier_invoice_items')
        .insert(items);

    if (error) throw error;
};

export const getProductIdsByCodes = async (codes: string[]): Promise<Record<string, string>> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedCodes = Array.from(new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean)));
    if (normalizedCodes.length === 0) return {};

    const { data, error } = await supabase
        .from('st_products')
        .select('id, cod')
        .in('cod', normalizedCodes);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    return rows.reduce((acc: Record<string, string>, row: any) => {
        const cod = String(row.cod || '').trim();
        const id = String(row.id || '').trim();
        if (cod && id) acc[cod] = id;
        return acc;
    }, {});
};

export const getSupplierInvoicesHistorySupabase = async (): Promise<SupplierInvoiceHistory[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data: invoices, error: invoicesError } = await supabase
        .from('supplier_invoices')
        .select('*')
        .order('created_at', { ascending: false });

    if (invoicesError) throw invoicesError;

    const invoiceRows = Array.isArray(invoices) ? invoices : [];
    if (invoiceRows.length === 0) return [];

    const supplierIds = Array.from(new Set(invoiceRows.map((i: any) => String(i.supplier_id || '')).filter(Boolean)));
    const invoiceIds = invoiceRows.map((i: any) => String(i.id || '')).filter(Boolean);

    const { data: suppliers } = await supabase
        .from('st_suppliers')
        .select('id, nombre')
        .in('id', supplierIds);

    const supplierNameMap = new Map<string, string>(
        (suppliers || []).map((s: any) => [String(s.id), String(s.nombre || 'Proveedor sin nombre')])
    );

    const { data: invoiceItems } = await supabase
        .from('supplier_invoice_items')
        .select('invoice_id')
        .in('invoice_id', invoiceIds);

    const itemCountMap = (invoiceItems || []).reduce((acc: Record<string, number>, item: any) => {
        const key = String(item.invoice_id || '');
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return invoiceRows.map((invoice: any) => ({
        id: String(invoice.id || ''),
        supplier_id: String(invoice.supplier_id || ''),
        supplier_name: supplierNameMap.get(String(invoice.supplier_id || '')) || 'Proveedor sin nombre',
        invoice_number: String(invoice.invoice_number || ''),
        total_amount: Number(invoice.total_amount || 0),
        paid: Boolean(invoice.paid),
        created_at: String(invoice.created_at || ''),
        item_count: Number(itemCountMap[String(invoice.id || '')] || 0),
    }));
};

export const getSupplierInvoiceDetailSupabase = async (invoiceId: string): Promise<SupplierInvoiceDetail> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!invoiceId) throw new Error('ID de compra no proporcionado');

    const { data: invoice, error: invoiceError } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

    if (invoiceError) throw invoiceError;

    const { data: supplier } = await supabase
        .from('st_suppliers')
        .select('id, nombre')
        .eq('id', invoice.supplier_id)
        .maybeSingle();

    const { data: rawItems, error: itemsError } = await supabase
        .from('supplier_invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);

    if (itemsError) throw itemsError;

    const items = Array.isArray(rawItems) ? rawItems : [];
    const productIds = Array.from(new Set(items.map((i: any) => String(i.product_id || '')).filter(Boolean)));

    const { data: products } = await supabase
        .from('st_products')
        .select('id, cod, name')
        .in('id', productIds);

    const productMap = new Map<string, any>((products || []).map((p: any) => [String(p.id), p]));

    const detailItems: SupplierInvoiceDetailItem[] = items.map((item: any) => {
        const product = productMap.get(String(item.product_id || ''));
        return {
            invoice_id: String(item.invoice_id || ''),
            product_id: String(item.product_id || ''),
            product_name: String(product?.name || item.product_id || 'Producto'),
            product_code: String(product?.cod || ''),
            quantity: Number(item.quantity || 0),
            cost_price: Number(item.cost_price || 0),
        };
    });

    return {
        invoice: {
            id: String(invoice.id || ''),
            supplier_id: String(invoice.supplier_id || ''),
            supplier_name: String(supplier?.nombre || 'Proveedor sin nombre'),
            invoice_number: String(invoice.invoice_number || ''),
            total_amount: Number(invoice.total_amount || 0),
            paid: Boolean(invoice.paid),
            created_at: String(invoice.created_at || ''),
            item_count: detailItems.length,
        },
        items: detailItems,
    };
};

export const deleteSupplierInvoiceSupabase = async (invoiceId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!invoiceId) throw new Error('ID de compra no proporcionado');

    const { error: itemsError } = await supabase
        .from('supplier_invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);

    if (itemsError) throw itemsError;

    const { error: invoiceError } = await supabase
        .from('supplier_invoices')
        .delete()
        .eq('id', invoiceId);

    if (invoiceError) throw invoiceError;
};

export const getAllUsersForAdmin = async (): Promise<User[]> => {
    return getUsersSupabase(false);
};

export const addUser = async (userData: any): Promise<User> => {
    const res = await postToScript('addUser', userData);
    return res.data;
};

export const updateUser = async (userData: any): Promise<any> => {
    return postToScript('updateUser', userData);
};

export const addProduct = async (productData: any): Promise<any> => {
    return postToScript('addProduct', productData);
};

export const updateProduct = async (productData: any): Promise<any> => {
    return postToScript('updateProduct', productData);
};

export const deleteProduct = async (cod: string): Promise<any> => {
    return postToScript('deleteProduct', { cod });
};

export const massUpdatePrices = async (data: any): Promise<any> => {
    return postToScript('massUpdatePrices', data);
};

export const getCategoriesData = async (): Promise<any[]> => {
    if (!supabase) return [];

    try {
        const { data, error } = await supabase
            .from('st_subcategories')
            .select('name, st_categories(name)');

        if (error) {
            console.error('Error loading subcategories from Supabase:', error);
            return [];
        }

        return (data || [])
            .map((row: any) => {
                const categoryRel = row?.st_categories;
                const categoryName = Array.isArray(categoryRel)
                    ? categoryRel[0]?.name
                    : categoryRel?.name;
                const subCategoryName = row?.name;

                if (typeof categoryName !== 'string' || typeof subCategoryName !== 'string') {
                    return null;
                }

                const categoria = categoryName.trim();
                const subCategoria = subCategoryName.trim();

                if (!categoria || !subCategoria) {
                    return null;
                }

                return { categoria, subCategoria };
            })
            .filter((item): item is { categoria: string; subCategoria: string } => item !== null);
    } catch (error) {
        console.error('Unexpected error loading subcategories from Supabase:', error);
        return [];
    }
};

export const addCategory = async (name: string): Promise<any> => {
    return postToScript('addCategory', { name });
};

export const addSubCategory = async (category: string, name: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const categoryName = String(category || '').trim();
    const subCategoryName = String(name || '').trim();

    if (!categoryName || !subCategoryName) {
        throw new Error('Categoría y subcategoría son obligatorias.');
    }

    try {
        const { data: categoryRow, error: categoryError } = await supabase
            .from('st_categories')
            .select('id, name')
            .ilike('name', categoryName)
            .limit(1)
            .maybeSingle();

        if (categoryError) throw categoryError;
        if (!categoryRow?.id) throw new Error(`No se encontró la categoría '${categoryName}'.`);

        const { data: existingSub, error: existingError } = await supabase
            .from('st_subcategories')
            .select('id')
            .eq('category_id', categoryRow.id)
            .ilike('name', subCategoryName)
            .limit(1)
            .maybeSingle();

        if (existingError) throw existingError;
        if (existingSub?.id) {
            throw new Error(`La subcategoría '${subCategoryName}' ya existe en '${categoryName}'.`);
        }

        const { data, error } = await supabase
            .from('st_subcategories')
            .insert([{ category_id: categoryRow.id, name: subCategoryName }])
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error adding subcategory in Supabase:', error);
        throw error instanceof Error ? error : new Error('No se pudo crear la subcategoría.');
    }
};

export const renameCategory = async (oldName: string, newName: string): Promise<any> => {
    return postToScript('renameCategory', { oldName, newName });
};

export const renameSubCategory = async (category: string, oldName: string, newName: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const categoryName = String(category || '').trim();
    const previousName = String(oldName || '').trim();
    const nextName = String(newName || '').trim();

    if (!categoryName || !previousName || !nextName) {
        throw new Error('Categoría, nombre actual y nombre nuevo son obligatorios.');
    }

    try {
        const { data: categoryRow, error: categoryError } = await supabase
            .from('st_categories')
            .select('id, name')
            .ilike('name', categoryName)
            .limit(1)
            .maybeSingle();

        if (categoryError) throw categoryError;
        if (!categoryRow?.id) throw new Error(`No se encontró la categoría '${categoryName}'.`);

        const { data: currentSub, error: currentError } = await supabase
            .from('st_subcategories')
            .select('id, name')
            .eq('category_id', categoryRow.id)
            .ilike('name', previousName)
            .limit(1)
            .maybeSingle();

        if (currentError) throw currentError;
        if (!currentSub?.id) {
            throw new Error(`No se encontró la subcategoría '${previousName}' en '${categoryName}'.`);
        }

        if (previousName.toLowerCase() === nextName.toLowerCase()) {
            return currentSub;
        }

        const { data: duplicatedSub, error: duplicateError } = await supabase
            .from('st_subcategories')
            .select('id')
            .eq('category_id', categoryRow.id)
            .ilike('name', nextName)
            .neq('id', currentSub.id)
            .limit(1)
            .maybeSingle();

        if (duplicateError) throw duplicateError;
        if (duplicatedSub?.id) {
            throw new Error(`La subcategoría '${nextName}' ya existe en '${categoryName}'.`);
        }

        const { data, error } = await supabase
            .from('st_subcategories')
            .update({ name: nextName })
            .eq('id', currentSub.id)
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error renaming subcategory in Supabase:', error);
        throw error instanceof Error ? error : new Error('No se pudo renombrar la subcategoría.');
    }
};

export const deleteCategory = async (name: string): Promise<any> => {
    return postToScript('deleteCategory', { name });
};

export const deleteSubCategory = async (category: string, name: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const categoryName = String(category || '').trim();
    const subCategoryName = String(name || '').trim();

    if (!categoryName || !subCategoryName) {
        throw new Error('Categoría y subcategoría son obligatorias.');
    }

    try {
        const { data: categoryRow, error: categoryError } = await supabase
            .from('st_categories')
            .select('id, name')
            .ilike('name', categoryName)
            .limit(1)
            .maybeSingle();

        if (categoryError) throw categoryError;
        if (!categoryRow?.id) throw new Error(`No se encontró la categoría '${categoryName}'.`);

        const { data: currentSub, error: currentError } = await supabase
            .from('st_subcategories')
            .select('id, name')
            .eq('category_id', categoryRow.id)
            .ilike('name', subCategoryName)
            .limit(1)
            .maybeSingle();

        if (currentError) throw currentError;
        if (!currentSub?.id) {
            throw new Error(`No se encontró la subcategoría '${subCategoryName}' en '${categoryName}'.`);
        }

        const { data, error } = await supabase
            .from('st_subcategories')
            .delete()
            .eq('id', currentSub.id)
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error deleting subcategory in Supabase:', error);
        throw error instanceof Error ? error : new Error('No se pudo eliminar la subcategoría.');
    }
};

export const getSuppliers = async (): Promise<Supplier[]> => {
    const data = await getSuppliersSupabase();
    return data
        .filter((item: any) => {
            const isDeleted = item.is_deleted || item.Eliminado || item.eliminado || false;
            return !isDeleted;
        })
        .map((item: any) => ({
            ID_Proveedor: String(item.id || item.ID_Proveedor || ''),
            Nombre: item.nombre || item.name || item.Nombre || '',
            tax_1_percent: parsePercentValue(item.tax_1_percent),
            tax_2_percent: parsePercentValue(item.tax_2_percent),
            tax_3_percent: parsePercentValue(item.tax_3_percent),
            CUIT: item.cuit || item.CUIT || '',
            Condicion_IVA: item.iva_condition || item.Condicion_IVA || 'Responsable Inscripto',
            Email: item.email || item.Email || '',
            Telefono: item.phone || item.Telefono || '',
            Contacto: item.contact_person || item.Contacto || '',
            Direccion: item.address || item.Direccion || '',
            Activo: item.is_active !== undefined ? (item.is_active ? 'SI' : 'NO') : (item.Activo || 'SI'),
            Fecha_Creacion: item.created_at || item.Fecha_Creacion || ''
        } as Supplier));
};

export const addSupplier = async (data: any): Promise<Supplier> => {
    const item = await addSupplierSupabase(data);
    return {
        ID_Proveedor: String(item.id),
        Nombre: item.nombre || item.name || '',
        tax_1_percent: parsePercentValue(item.tax_1_percent),
        tax_2_percent: parsePercentValue(item.tax_2_percent),
        tax_3_percent: parsePercentValue(item.tax_3_percent),
        CUIT: item.cuit,
        Condicion_IVA: item.iva_condition,
        Email: item.email,
        Telefono: item.phone,
        Contacto: item.contact_person,
        Direccion: item.address,
        Activo: item.is_active ? 'SI' : 'NO',
        Fecha_Creacion: item.created_at
    } as Supplier;
};

export const updateSupplier = async (data: any): Promise<any> => {
    return updateSupplierSupabase(data);
};

export const searchProducts = async (params: {
    searchTerm?: string;
    page?: number;
    pageSize?: number;
    filters?: {
        categoria?: string | 'All';
        proveedor?: string | 'All';
        activo?: 'All'|'Active'|'Inactive';
        online?: 'All'|'Yes'|'No';
    };
}): Promise<{ items: Product[]; total:number; page:number; pageSize:number }> => {
    const response = await postToScript('searchProducts', params);
    if (response.status === 'error') throw new Error(response.message);
    return response.data;
};

// =============================================================================
// --- LEGACY INFRASTRUCTURE (SHEETS / APPS SCRIPT) ---
// =============================================================================


export const markSaleAsBilled = async (saleId: string, cae: string, nro: string, vtoCae: string, qrData: string, date: Date, url: string, ticketUrl?: string, facturacion?: string): Promise<void> => {
    await postToScript('markSaleAsBilled', { saleId, cae, nro, vtoCae, qrData, date: formatDateForSheet(date), url, ticketUrl, facturacion });
};

// Helper para calcular el balance de un cliente a partir de sus transacciones
export function calculateCustomerBalance(transactions: { debit?: number; credit?: number }[]): { debt: number; payments: number } {
  const debit = transactions.reduce((s, t) => s + Number(t.debit || 0), 0);
  const credit = transactions.reduce((s, t) => s + Number(t.credit || 0), 0);
  return {
    debt: debit - credit,
    payments: credit
  };
}

// =============================================================================
// --- CUENTA CORRIENTE DE PROVEEDORES ---
// =============================================================================

export const getSupplierAccountSummaries = async (): Promise<SupplierAccountSummary[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('supplier_account_summary_vw')
        .select('*');
    if (error) throw error;
    return (data || []).map((row: any) => ({
        supplier_id: String(row.supplier_id || ''),
        supplier_nombre: String(row.supplier_nombre || row.nombre || ''),
        total_facturado: Number(row.total_facturado || 0),
        total_pagado: Number(row.total_pagado || 0),
        saldo_pendiente: Number(row.saldo_pendiente || 0),
    }));
};

export const getSupplierAccountSummary = async (supplierId: string): Promise<SupplierAccountSummary | null> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('supplier_account_summary_vw')
        .select('*')
        .eq('supplier_id', supplierId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        supplier_id: String(data.supplier_id || ''),
        supplier_nombre: String(data.supplier_nombre || data.nombre || ''),
        total_facturado: Number(data.total_facturado || 0),
        total_pagado: Number(data.total_pagado || 0),
        saldo_pendiente: Number(data.saldo_pendiente || 0),
    };
};

export const getSupplierInvoiceBalances = async (supplierId: string): Promise<SupplierInvoiceBalance[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('supplier_invoice_balance_vw')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
        id: String(row.id || ''),
        supplier_id: String(row.supplier_id || ''),
        invoice_number: String(row.invoice_number || ''),
        total_amount: Number(row.total_amount || 0),
        total_pagado: Number(row.total_pagado || 0),
        saldo_pendiente: Number(row.saldo_pendiente || 0),
        estado_pago: String(row.estado_pago || ''),
        created_at: String(row.created_at || ''),
    }));
};

export const recordSupplierPayment = async (payment: SupplierPayment): Promise<SupplierPayment> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('supplier_payments')
        .insert([{
            supplier_id: payment.supplier_id,
            invoice_id: payment.invoice_id || null,
            amount: payment.amount,
            payment_date: payment.payment_date,
            payment_method: payment.payment_method,
            notes: payment.notes || null,
        }])
        .select()
        .single();

    if (error) throw error;

    try {
        const { data: supplierData } = await supabase
            .from('st_suppliers')
            .select('nombre')
            .eq('id', payment.supplier_id)
            .maybeSingle();

        const supplierName = String(supplierData?.nombre || payment.supplier_id || '').trim();
        const normalizedMethod = String(payment.payment_method || '').toLowerCase();
        const paymentType: 'Efectivo' | 'Digital' = normalizedMethod.includes('efectivo') ? 'Efectivo' : 'Digital';

        await addExpenseSupabase({
            detalle: 'Pago a proveedor ' + supplierName,
            monto: Number(payment.amount || 0),
            paymentType,
            tipo: 'Proveedores',
            spentAt: payment.payment_date,
        });
    } catch (expenseError) {
        console.error('[SupplierPayment] Pago registrado pero no se pudo crear gasto automático:', expenseError);
    }

    return data as SupplierPayment;
};

export const getSupplierPayments = async (supplierId: string): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('supplier_payments')
        .select('id, supplier_id, invoice_id, amount, payment_date, payment_method, notes, created_at, supplier_invoices(invoice_number)')
        .eq('supplier_id', supplierId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
        id: String(row.id || ''),
        supplier_id: String(row.supplier_id || ''),
        invoice_id: row.invoice_id ? String(row.invoice_id) : null,
        invoice_number: row?.supplier_invoices?.invoice_number || null,
        amount: Number(row.amount || 0),
        payment_date: String(row.payment_date || row.created_at || ''),
        payment_method: String(row.payment_method || ''),
        notes: String(row.notes || ''),
        created_at: String(row.created_at || ''),
    }));
};

export const updateSupplierPayment = async (
    paymentId: string,
    updates: {
        amount: number;
        payment_date: string;
        payment_method: string;
        notes?: string;
        invoice_id?: string | null;
    }
): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedInvoiceId =
        typeof updates.invoice_id === 'string' && updates.invoice_id.trim() === ''
            ? null
            : updates.invoice_id ?? null;

    const { error } = await supabase
        .from('supplier_payments')
        .update({
            amount: updates.amount,
            payment_date: updates.payment_date,
            payment_method: updates.payment_method,
            notes: updates.notes || null,
            invoice_id: normalizedInvoiceId,
        })
        .eq('id', paymentId);

    if (error) throw error;
};

export const deleteSupplierPayment = async (paymentId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { error } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', paymentId);

    if (error) throw error;
};


