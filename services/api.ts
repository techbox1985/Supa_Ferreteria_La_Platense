// PROMPT 031: Anular venta por legacy_sale_id
export const annulSaleByLegacyIdSupabase = async (legacySaleId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!legacySaleId) throw new Error('legacySaleId inválido');
    console.log('[ANNUL_BY_LEGACY_START]', legacySaleId);
    const { data: sale, error } = await supabase
        .from('st_sales')
        .select('id')
        .eq('legacy_sale_id', legacySaleId)
        .single();
    if (error || !sale?.id) {
        throw new Error(`No se encontró venta con legacy_sale_id=${legacySaleId}`);
    }
    console.log('[ANNUL_BY_LEGACY_RESOLVED]', { legacySaleId, saleId: sale.id });
    await annulSaleSupabase(sale.id);

    // PROMPT 032: Eliminar movimiento de cuenta corriente asociado
    const { error: txDeleteError } = await supabase
        .from('st_account_transactions')
        .delete()
        .eq('original_sale_id', legacySaleId)
        .eq('type', 'Venta');
    if (txDeleteError) {
        console.warn('[ANNUL_BY_LEGACY_TRANSACTION_DELETE_ERROR]', txDeleteError);
    } else {
        console.log('[ANNUL_BY_LEGACY_TRANSACTION_DELETED]', { legacySaleId });
    }
};

export const annulSaleByLegacyId = annulSaleByLegacyIdSupabase;
import { normalizeProductCode } from '../src/utils/importNormalizer';
// ...existing code...
// Elimina cualquier transacción de st_account_transactions por id (pago, nota de crédito, etc)
export const deleteAccountTransactionById = async (transactionId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!transactionId) throw new Error('ID de transacción inválido');
    const { error } = await supabase
        .from('st_account_transactions')
        .delete()
        .eq('id', transactionId);
    if (error) throw error;
};
// Elimina un pago de st_account_transactions por id
export const deletePayment = async (paymentId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!paymentId) throw new Error('ID de movimiento inválido');
    const { error } = await supabase
        .from('st_account_transactions')
        .delete()
        .eq('id', paymentId);
    if (error) throw error;
};
// --- PRODUCTOS SUPABASE: Métodos CRUD mínimos para ProductAdminView ---
const buildProductSupabasePayload = (productData: any, options?: { includeUpdatedAt?: boolean }): Record<string, any> => {
    const mapping: Record<string, any> = {};
    const textOrNull = (value: any): string | null => {
        const normalized = String(value ?? '').trim();
        return normalized === '' ? null : normalized;
    };

    if (productData.cod !== undefined) mapping.cod = productData.cod;
    if (productData.Producto !== undefined) mapping.name = textOrNull(productData.Producto);
    if (productData.category_id !== undefined) mapping.category_id = productData.category_id;
    if (productData['Sub Categoria'] !== undefined) mapping.sub_category = productData['Sub Categoria'] || null;
    // Siempre incluir supplier_id, null explícito si corresponde
    mapping.supplier_id = productData.supplier_id ?? null;
    if (productData['cod.barras'] !== undefined) mapping.barcode = textOrNull(productData['cod.barras']);
    if (productData['P.Costo'] !== undefined) mapping.cost_price = productData['P.Costo'];
    if (productData.cost_currency !== undefined) mapping.cost_currency = productData.cost_currency;
    if (productData.cost_price_usd !== undefined) mapping.cost_price_usd = productData.cost_price_usd;
    if (productData.last_exchange_rate !== undefined) mapping.last_exchange_rate = productData.last_exchange_rate;
    if (productData.Precio !== undefined) mapping.list_price = productData.Precio;
    if (productData['Precio Final'] !== undefined) mapping.final_price = productData['Precio Final'];
    // PROMPT 031: Si viene null, pasar null explícitamente
    if (productData['Precio de Oferta'] !== undefined) {
        mapping.offer_price = productData['Precio de Oferta'] === null ? null : productData['Precio de Oferta'];
    }
    if (productData.offer_price !== undefined) {
        mapping.offer_price = productData.offer_price;
    }
    if (productData.auto_price !== undefined) mapping.auto_price = !!productData.auto_price;
    if (productData.stockk !== undefined) mapping.current_stock = productData.stockk;
    if (productData.Minimo !== undefined) mapping.min_stock = productData.Minimo;
    if (productData.Activo !== undefined) mapping.is_active = !!productData.Activo;
    if (productData.Online !== undefined) mapping.is_online = !!productData.Online;
    if (productData.FOTOGRAFIA !== undefined) mapping.photo_url = textOrNull(productData.FOTOGRAFIA);
    if (productData.Imagen !== undefined) mapping.image_url = textOrNull(productData.Imagen);
    if (productData.Eliminado !== undefined) mapping.is_deleted = !!productData.Eliminado;
    if (productData.product_type !== undefined) mapping.product_type = productData.product_type === 'kit' ? 'kit' : 'simple';
    if (options?.includeUpdatedAt) mapping.updated_at = new Date().toISOString();

    return mapping;
};

export const updateProductSupabase = async (productData: any): Promise<any> => {
    console.log('[SUPABASE_UPDATE_QUERY_START]', { productData });
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!productData.cod && !productData.id) throw new Error('Falta el código o id de producto');
    const mapping = buildProductSupabasePayload(productData, { includeUpdatedAt: true });
    console.log('[SUPABASE_UPDATE_MAPPING]', { mapping, id: productData.id, cod: productData.cod });
    let query = supabase.from('st_products').update(mapping);
    if (productData.id) {
        query = query.eq('id', productData.id);
    } else {
        query = query.eq('cod', productData.cod);
    }
    console.log('[SUPABASE_UPDATE_BEFORE_EXECUTE]', { mapping });
    const { data, error } = await query.select();
    if (error) {
        console.log('[SUPABASE_UPDATE_ERROR]', { error });
        throw error;
    }
    console.log('[SUPABASE_UPDATE_SUCCESS]', { data });
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
    SupplierCostImportPreviewResponse,
    SupplierCostImportSummary,
    SupplierMissingProduct,
    SupplierAccountSummary,
    SupplierInvoiceBalance,
    SupplierPayment,
    Supplier,
    User,
    SupplierPriceImportTempRow,
    SupplierPriceImportSessionResult,
    SupplierPriceImportMatchSummary,
    SupplierPriceUpdateResult,
    SupplierVsExcelSummary,
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

const mapUserRowToUser = (item: any): User => {
    const nombre = item?.nombre ?? item?.Nombre ?? item?.name ?? item?.full_name ?? '';
    const pin = item?.pin ?? item?.PIN ?? '';
    const rol = item?.rol ?? item?.Rol ?? item?.role ?? '';
    const activoRaw = item?.activo ?? item?.is_active ?? item?.active ?? item?.Activo ?? item?.estado ?? true;
    const activo =
        activoRaw === true ||
        activoRaw === 'SI' ||
        activoRaw === 'si' ||
        activoRaw === 'Sí' ||
        activoRaw === 'sí' ||
        activoRaw === 1 ||
        activoRaw === '1';

    return {
        ID_Usuario: String(item?.id ?? item?.ID_Usuario ?? ''),
        Nombre: String(nombre || ''),
        PIN: String(pin || ''),
        Rol: String(rol || '') as User['Rol'],
        Activo: activo ? 'SI' : 'NO'
    } as User;
};

const isAdminRoleValue = (role: any): boolean => {
    const normalized = String(role || '').trim().toLowerCase();
    return normalized === 'admin' || normalized === 'administrador';
};

type ECheqSnapshot = { amount: number; days: number };

const ECHEQ_NOTES_PREFIX = '[ECHEQS_JSON]:';

const normalizeEcheqs = (value: any): ECheqSnapshot[] => {
    if (!Array.isArray(value)) return [];

    return value
        .map((item: any) => ({
            amount: Number(item?.amount ?? 0),
            days: Number(item?.days ?? 0),
        }))
        .filter((item: ECheqSnapshot) => Number.isFinite(item.amount) && item.amount > 0)
        .map((item: ECheqSnapshot) => ({
            amount: Number(item.amount),
            days: Number.isFinite(item.days) ? Number(item.days) : 0,
        }));
};

const buildSaleNotesWithEcheqs = (adjustmentDescription: string | null | undefined, echeqs: any): string | null => {
    const baseDescription = String(adjustmentDescription || '').trim();
    const normalizedEcheqs = normalizeEcheqs(echeqs);

    if (normalizedEcheqs.length === 0) {
        return baseDescription || null;
    }

    const serialized = JSON.stringify(normalizedEcheqs);
    return baseDescription
        ? `${baseDescription}\n${ECHEQ_NOTES_PREFIX}${serialized}`
        : `${ECHEQ_NOTES_PREFIX}${serialized}`;
};

const extractSaleNotesAndEcheqs = (notesRaw: any): { adjustmentDescription: string; echeqs: ECheqSnapshot[] } => {
    const notesText = String(notesRaw || '');
    const markerIndex = notesText.indexOf(ECHEQ_NOTES_PREFIX);

    if (markerIndex === -1) {
        return {
            adjustmentDescription: notesText.trim(),
            echeqs: [],
        };
    }

    const descriptionPart = notesText.slice(0, markerIndex).trim();
    const jsonPart = notesText.slice(markerIndex + ECHEQ_NOTES_PREFIX.length).trim();

    try {
        return {
            adjustmentDescription: descriptionPart,
            echeqs: normalizeEcheqs(JSON.parse(jsonPart)),
        };
    } catch {
        return {
            adjustmentDescription: notesText.trim(),
            echeqs: [],
        };
    }
};

const persistInvoiceForSale = async (
    saleId: string,
    facturaInfo: Sale['facturaInfo'],
    facturacion?: string
): Promise<void> => {
    if (!supabase || !saleId || !facturaInfo?.cae) return;

    const normalizedInvoiceType = String(facturacion || '').trim() || 'N';
    const normalizedPdfUrl = String(facturaInfo.url || '').trim() || null;
    const normalizedTicketUrl = String(facturaInfo.ticketUrl || '').trim() || null;
    const normalizedCae = String(facturaInfo.cae || '').trim();
    const normalizedNro = String(facturaInfo.nro || '').trim();
    const normalizedVtoCae = String(facturaInfo.vtoCae || '').trim() || null;
    const normalizedQrData = String(facturaInfo.qrData || '').trim() || null;

    const salesBillingPayload = {
        invoice_type: normalizedInvoiceType,
        billing_cae: normalizedCae || null,
        billing_number: normalizedNro || null,
        billing_pdf_url: normalizedPdfUrl,
        billing_ticket_url: normalizedTicketUrl,
        billing_qr_data: normalizedQrData,
        billing_vto_cae: normalizedVtoCae,
    };

    const { error: saleUpdateError } = await supabase
        .from('st_sales')
        .update(salesBillingPayload)
        .eq('id', saleId);

    if (saleUpdateError) {
        throw new Error(`Factura emitida pero no persistida en st_sales: ${saleUpdateError.message}`);
    }

    const { data: persistedSale, error: persistedSaleError } = await supabase
        .from('st_sales')
        .select('billing_cae, billing_number, billing_pdf_url, billing_ticket_url')
        .eq('id', saleId)
        .maybeSingle();

    if (persistedSaleError) {
        throw new Error(`No se pudo validar persistencia de factura en st_sales: ${persistedSaleError.message}`);
    }

    const hasBillingEvidence = Boolean(
        String(persistedSale?.billing_cae || '').trim() ||
        String(persistedSale?.billing_number || '').trim() ||
        String(persistedSale?.billing_pdf_url || '').trim() ||
        String(persistedSale?.billing_ticket_url || '').trim()
    );

    if (!hasBillingEvidence) {
        throw new Error('Persistencia incompleta de factura en st_sales.');
    }
};

const buildSaleItemsPayload = (saleId: string, items: CartItem[], productMap: Map<string, string>) => (
    items.map((item) => ({
        sale_id: saleId,
        product_id: productMap.get(item.product.cod) || null,
        product_code: item.product.cod || null,
        product_name_snapshot: item.product.Producto || 'Producto',
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.price ?? 0),
        line_total: Number(item.quantity ?? 0) * Number(item.price ?? 0)
    }))
);

const getProductIdMap = async (items: CartItem[]): Promise<Map<string, string>> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const productCodes = items.map((item) => item.product?.cod).filter(Boolean);
    if (productCodes.length === 0) return new Map<string, string>();

    const { data: productRows, error: productError } = await supabase
        .from('st_products')
        .select('id, cod')
        .in('cod', productCodes);

    if (productError) throw productError;
    return new Map((productRows || []).map((product: any) => [product.cod, product.id]));
};

const syncSaleAccountTransaction = async (sale: Sale, shiftId?: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const customerId =
        sale.customer?.Id_Cliente &&
        sale.customer.Id_Cliente !== '0' &&
        !String(sale.customer.Id_Cliente).startsWith('CLAD')
            ? sale.customer.Id_Cliente
            : null;

    const creditAmount = Number(sale.payment?.credit ?? 0);
    const { data: existingTx, error: existingTxError } = await supabase
        .from('st_account_transactions')
        .select('id')
        .eq('original_sale_id', sale.id)
        .eq('type', 'Venta')
        .limit(1)
        .maybeSingle();

    if (existingTxError) throw existingTxError;

    if (!customerId || creditAmount <= 0) {
        if (existingTx?.id) {
            const { error } = await supabase
                .from('st_account_transactions')
                .delete()
                .eq('id', existingTx.id);

            if (error) throw error;
        }
        return;
    }

    const soldAt = sale.date instanceof Date ? sale.date.toISOString() : new Date(sale.date).toISOString();
    const payload = {
        customer_id: customerId,
        type: 'Venta',
        description: 'Venta a cuenta corriente',
        debit: creditAmount,
        credit: 0,
        original_sale_id: sale.id,
        shift_id: shiftId || sale.shiftId || null,
        items: sale.items ? JSON.stringify(sale.items) : null,
        factura_info: sale.facturaInfo ? JSON.stringify(sale.facturaInfo) : null,
        date: soldAt,
        updated_at: new Date().toISOString(),
    };

    if (existingTx?.id) {
        const { error } = await supabase
            .from('st_account_transactions')
            .update(payload)
            .eq('id', existingTx.id);

        if (error) throw error;
        return;
    }

    const { error } = await supabase
        .from('st_account_transactions')
        .insert([{ ...payload, created_at: new Date().toISOString() }]);

    if (error) throw error;
};

const calculateFinalPriceFromCost = (costPrice: number, markupPct: number): number => {
    return Number((costPrice * (1 + markupPct / 100)).toFixed(2));
};

type SupplierPricingMode = 'taxes' | 'markup';

const parsePercentValue = (value: any): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};


export const calculateFinalPriceFromSupplierTaxes = (
    costPrice: number,
    tax1Percent: number,
    tax2Percent: number,
    tax3Percent: number,
    tax4Percent: number = 0
): number => {
    const t1 = parsePercentValue(tax1Percent);
    const t2 = parsePercentValue(tax2Percent);
    const t3 = parsePercentValue(tax3Percent);
    const t4 = parsePercentValue(tax4Percent);
    return Number((costPrice * (1 + t1 / 100) * (1 + t2 / 100) * (1 + t3 / 100) * (1 + t4 / 100)).toFixed(2));
};

const computeFinalPriceFromSupplier = (
    product: any,
    inputCost: number,
    exchangeRate: number,
    fileCurrency: 'ARS' | 'USD',
    pricing: {
        mode: SupplierPricingMode;
        tax1Percent?: number;
        tax2Percent?: number;
        tax3Percent?: number;
        markupPct?: number;
    }
) => {
    const safeInputCost = Number(inputCost || 0);
    const safeExchangeRate = Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
    const currentCost = Number(product?.cost_price ?? 0);
    const currentFinalPrice = Number(product?.final_price ?? 0);
    const convertedCostArs = fileCurrency === 'USD'
        ? Number((safeInputCost * safeExchangeRate).toFixed(2))
        : Number(safeInputCost.toFixed(2));

    const recalculatedFinalPrice = pricing.mode === 'markup'
        ? calculateFinalPriceFromCost(convertedCostArs, parsePercentValue(pricing.markupPct))
        : calculateFinalPriceFromSupplierTaxes(
            convertedCostArs,
            parsePercentValue(pricing.tax1Percent),
            parsePercentValue(pricing.tax2Percent),
            parsePercentValue(pricing.tax3Percent)
        );

    const shouldRecalculateFinalPrice = product ? Boolean(product.auto_price ?? true) : true;
    const finalPriceToPersist = shouldRecalculateFinalPrice ? recalculatedFinalPrice : currentFinalPrice;
    const willUpdate = !!product && (currentCost !== convertedCostArs || currentFinalPrice !== finalPriceToPersist);

    return {
        inputCost: safeInputCost,
        exchangeRate: safeExchangeRate,
        convertedCostArs,
        currentCost,
        currentFinalPrice,
        recalculatedFinalPrice,
        shouldRecalculateFinalPrice,
        finalPriceToPersist,
        willUpdate,
    };
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


export let supabase: ReturnType<typeof createClient<Database>> | null = null;

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

    // 1. Cargar solo metadatos livianos para destrabar el primer render de admin productos.
    const [
        { data: categoriesData, error: categoriesError },
        { data: suppliersData, error: suppliersError },
    ] = await Promise.all([
        supabase.from('st_categories').select('id, name'),
        supabase.from('st_suppliers').select('id, nombre, markup_pct'),
    ]);

    if (categoriesError) throw categoriesError;
    const categories = Array.isArray(categoriesData) ? categoriesData : [];

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
        'is_online',
        'photo_url',
        'image_url',
        'is_deleted',
        'updated_at',
        'final_price',
        'product_type'
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

            return {
            cod: item.cod ?? '',
            Producto: item.name ?? '',
            Categoria: categoryMap.get(item.category_id) || '',
            category_id: item.category_id ?? undefined,
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
            'Stock-Inicial': currentStock,
            Ingresos: 0,
            'Venta.PV': 0,
            stockk: currentStock,
            Minimo: Number(item.min_stock ?? 0),
            Activo: Boolean(item.is_active ?? true),
            Online: Boolean(item.is_online ?? false),
            FOTOGRAFIA: item.photo_url ?? item.image_url ?? '',
            Imagen: item.image_url ?? item.photo_url ?? '',
            Eliminado: Boolean(item.is_deleted ?? false),
            'Ultima.Actualizacion': item.updated_at ?? '',
            'Precio Final': Number(item.final_price ?? 0),
            product_type: String(item.product_type ?? 'simple') as 'simple' | 'kit',
            id: item.product_id ?? item.id ?? undefined
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
        'id',
        'name',
        'category_id',
        'barcode',
        'description',
        'offer_price',
        'final_price',
        'current_stock',
        'min_stock',
        'is_active',
        'is_online',
        'photo_url',
        'image_url',
        'is_deleted',
        'updated_at',
        'product_type',
        'list_price'
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
        Online: Boolean(item.is_online ?? false),
        FOTOGRAFIA: item.photo_url ?? item.image_url ?? '',
        Imagen: item.image_url ?? item.photo_url ?? '',
        Eliminado: Boolean(item.is_deleted ?? false),
        'Ultima.Actualizacion': item.updated_at ?? '',
        product_type: String(item.product_type ?? 'simple') as 'simple' | 'kit',
        id: item.id ?? undefined,
        Precio: Number(item.list_price ?? 0)
    }));
};

export const getCategoriesSupabase = async (): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_categories')
        .select('id, name');
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

type SupplierImportMatchedBy = 'code' | 'barcode' | 'code_prefix' | 'barcode_prefix' | 'none';
type SupplierImportMatchReason = 'exact_code' | 'exact_barcode' | 'not_found' | 'invalid_row';

interface SupplierImportInvalidRow {
    row: SupplierCostImportRow;
    reason: 'invalid_row';
}

interface SupplierImportMatchResult {
    product: any | null;
    matchedBy: SupplierImportMatchedBy;
    reason: SupplierImportMatchReason;
}

interface SupplierImportPreviewMetadata {
    matched: boolean;
    matchedBy: SupplierImportMatchedBy;
    reason: SupplierImportMatchReason;
    willUpdate: boolean;
}

const normalizeSupplierImportRows = (
    rows: SupplierCostImportRow[],
    summary: SupplierCostImportSummary
): { normalizedRows: SupplierCostImportRow[]; invalidRows: SupplierImportInvalidRow[] } => {
    const seenCodes = new Set<string>();
    const normalizedRows: SupplierCostImportRow[] = [];
    const invalidRows: SupplierImportInvalidRow[] = [];

    for (const row of rows) {
        const rawCode = String(row.cod || '').trim();
        const normalizedCode = normalizeProductCode(rawCode);
        const cost = Number(row.cost_price);

        if (!normalizedCode || !Number.isFinite(cost)) {
            summary.ignored += 1;
            invalidRows.push({ row, reason: 'invalid_row' });
            continue;
        }

        if (seenCodes.has(normalizedCode)) {
            summary.ignored += 1;
            invalidRows.push({ row, reason: 'invalid_row' });
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

    return { normalizedRows, invalidRows };
};

const resolveSupplierImportProductMatch = (
    row: SupplierCostImportRow,
    productByCode: Map<string, any>,
    productByBarcode: Map<string, any>
): SupplierImportMatchResult => {
    // eslint-disable-next-line no-console
    console.log('[REAL_IMPORT_FLOW]', 'ESTA ES LA FUNCION REAL');
    const DEBUG_CODE = 'CRQD-U05PG+';
    const DEBUG_CODE_BASE = 'CRQD-U05PG';
    const dumpChars = (value: string) =>
        Array.from(String(value || '')).map((ch) => ({
            ch,
            code: ch.charCodeAt(0),
        }));
    const shouldDebugExactCode = (value: string) => {
        const raw = String(value || '');
        return raw.includes(DEBUG_CODE_BASE) || raw.includes(DEBUG_CODE);
    };

    const excelCodeOriginal = row.cod;
    const excelBarcodeOriginal = row.barcode;
    const excelCodeNorm = normalizeProductCode(excelCodeOriginal || '');
    const excelBarcodeNorm = normalizeProductCode(excelBarcodeOriginal || '');

    if (shouldDebugExactCode(String(excelCodeOriginal || '')) || shouldDebugExactCode(String(excelBarcodeOriginal || ''))) {
        const productCandidateByCode = Array.from(productByCode.entries()).find(([productCodeNorm, product]) =>
            shouldDebugExactCode(productCodeNorm) || shouldDebugExactCode(product?.cod || '')
        )?.[1] || null;
        const productCandidateByBarcode = Array.from(productByBarcode.entries()).find(([productBarcodeNorm, product]) =>
            shouldDebugExactCode(productBarcodeNorm) || shouldDebugExactCode(product?.barcode || product?.['cod.barras'] || '')
        )?.[1] || null;
        const productCandidate = productCandidateByCode || productCandidateByBarcode;
        const productOriginal = String(productCandidate?.cod || productCandidate?.barcode || productCandidate?.['cod.barras'] || '');
        const productNormalized = normalizeProductCode(productOriginal || '');

        // eslint-disable-next-line no-console
        console.log('[EXACT_CODE_DEBUG]', {
            excelOriginal: excelCodeOriginal,
            productOriginal,
            excelNormalized: excelCodeNorm,
            productNormalized,
            excelTrimmed: String(excelCodeOriginal || '').trim(),
            productTrimmed: String(productOriginal || '').trim(),
            excelChars: dumpChars(String(excelCodeOriginal || '')),
            productChars: dumpChars(String(productOriginal || '')),
            excelNormalizedChars: dumpChars(String(excelCodeNorm || '')),
            productNormalizedChars: dumpChars(String(productNormalized || '')),
            equalsOriginal: String(excelCodeOriginal || '') === String(productOriginal || ''),
            equalsTrimmed: String(excelCodeOriginal || '').trim() === String(productOriginal || '').trim(),
            equalsNormalized: String(excelCodeNorm || '') === String(productNormalized || ''),
        });
    }

    let matchedProduct: any = null;
    let matchedBy: SupplierImportMatchedBy | null = null;
    let reason: 'exact_code' | 'exact_barcode' | 'not_found' = 'not_found';


    // Buscar por code
    if (excelCodeNorm && productByCode.has(excelCodeNorm)) {
        matchedProduct = productByCode.get(excelCodeNorm);
        matchedBy = 'code';
        reason = 'exact_code';
    }
    // Buscar por barcode si no encontró por code
    if (!matchedProduct && excelCodeNorm && productByBarcode.has(excelCodeNorm)) {
        matchedProduct = productByBarcode.get(excelCodeNorm);
        matchedBy = 'barcode';
        reason = 'exact_barcode';
    }
    // Buscar por code usando barcode del excel
    if (!matchedProduct && excelBarcodeNorm && productByCode.has(excelBarcodeNorm)) {
        matchedProduct = productByCode.get(excelBarcodeNorm);
        matchedBy = 'code';
        reason = 'exact_code';
    }
    // Buscar por barcode usando barcode del excel
    if (!matchedProduct && excelBarcodeNorm && productByBarcode.has(excelBarcodeNorm)) {
        matchedProduct = productByBarcode.get(excelBarcodeNorm);
        matchedBy = 'barcode';
        reason = 'exact_barcode';
    }

    // Fallback: prefijo controlado SOLO si no hubo match exacto
    if (!matchedProduct && excelCodeNorm) {
        // Buscar por code_prefix
        const codePrefixProduct = Array.from(productByCode.entries()).find(([productCodeNorm]) =>
            productCodeNorm.startsWith(excelCodeNorm + ' ') ||
            productCodeNorm.startsWith(excelCodeNorm + '-')
        );
        if (codePrefixProduct) {
            matchedProduct = codePrefixProduct[1];
            matchedBy = 'code_prefix';
            reason = 'exact_code';
        }
    }
    if (!matchedProduct && excelCodeNorm) {
        // Buscar por barcode_prefix
        const barcodePrefixProduct = Array.from(productByBarcode.entries()).find(([productBarcodeNorm]) =>
            productBarcodeNorm.startsWith(excelCodeNorm + ' ') ||
            productBarcodeNorm.startsWith(excelCodeNorm + '-')
        );
        if (barcodePrefixProduct) {
            matchedProduct = barcodePrefixProduct[1];
            matchedBy = 'barcode_prefix';
            reason = 'exact_barcode';
        }
    }


        // Log quirúrgico de decisión final
        // eslint-disable-next-line no-console
        console.log('[MASS_MATCH_DECISION]', {
                excelCodeOriginal,
                excelCodeNorm,
                excelBarcodeOriginal,
                excelBarcodeNorm,
                matchedBy: matchedProduct
                        ? (
                                normalizeProductCode(matchedProduct.cod || '') === excelCodeNorm ||
                                normalizeProductCode(matchedProduct.cod || '') === excelBarcodeNorm
                                    ? 'code'
                                    : normalizeProductCode(matchedProduct.barcode || '') === excelCodeNorm ||
                                        normalizeProductCode(matchedProduct.barcode || '') === excelBarcodeNorm
                                        ? 'barcode'
                                        : matchedBy === 'code_prefix'
                                            ? 'code_prefix'
                                            : matchedBy === 'barcode_prefix'
                                                ? 'barcode_prefix'
                                                : 'unknown'
                            )
                        : null,
                matchedProductId: matchedProduct?.id || null,
                matchedProductCode: matchedProduct?.cod || null,
                matchedProductBarcode: matchedProduct?.barcode || matchedProduct?.['cod.barras'] || null,
        });

    if (matchedProduct) {
        if (shouldDebugExactCode(excelCodeOriginal) || shouldDebugExactCode(matchedProduct?.cod || '') || shouldDebugExactCode(matchedProduct?.barcode || matchedProduct?.['cod.barras'] || '')) {
            // eslint-disable-next-line no-console
            console.log('[EXACT_CODE_MATCH_DECISION]', {
                excelOriginal: excelCodeOriginal,
                productOriginal: matchedProduct?.cod || matchedProduct?.barcode || matchedProduct?.['cod.barras'] || '',
                excelNormalized: excelCodeNorm,
                productNormalized: normalizeProductCode(matchedProduct?.cod || matchedProduct?.barcode || matchedProduct?.['cod.barras'] || ''),
                matched: true,
            });
        }
        return { product: matchedProduct, matchedBy: matchedBy || 'none', reason };
    }
    if (shouldDebugExactCode(String(excelCodeOriginal || '')) || shouldDebugExactCode(String(excelBarcodeOriginal || ''))) {
        // eslint-disable-next-line no-console
        console.log('[EXACT_CODE_MATCH_DECISION]', {
            excelOriginal: excelCodeOriginal,
            productOriginal: '',
            excelNormalized: excelCodeNorm,
            productNormalized: '',
            matched: false,
        });
    }
    return { product: null, matchedBy: 'none', reason: 'not_found' };
};

// Shared source of truth for import matching (preview + process).
const resolveMatch = (
    row: SupplierCostImportRow,
    productByCode: Map<string, any>,
    productByBarcode: Map<string, any>
): SupplierImportMatchResult => resolveSupplierImportProductMatch(row, productByCode, productByBarcode);

const computeSupplierImportPriceOutcome = (
    product: any,
    row: SupplierCostImportRow,
    fileCurrency: 'ARS' | 'USD',
    safeExchangeRate: number,
    supplierTax1Percent: number,
    supplierTax2Percent: number,
    supplierTax3Percent: number
) => computeFinalPriceFromSupplier(
    product,
    Number(row.cost_price || 0),
    safeExchangeRate,
    fileCurrency,
    {
        mode: 'taxes',
        tax1Percent: supplierTax1Percent,
        tax2Percent: supplierTax2Percent,
        tax3Percent: supplierTax3Percent,
    }
);

const buildSupplierImportUpdatePayload = (
    fileCurrency: 'ARS' | 'USD',
    safeExchangeRate: number,
    inputCost: number,
    convertedCostArs: number,
    finalPriceToPersist: number,
    shouldRecalculateFinalPrice: boolean
): Record<string, any> => ({
    cost_price: convertedCostArs,
    final_price: shouldRecalculateFinalPrice ? finalPriceToPersist : undefined,
    cost_currency: fileCurrency,
    cost_price_usd: fileCurrency === 'USD' ? inputCost : null,
    last_exchange_rate: fileCurrency === 'USD' ? safeExchangeRate : null,
    updated_at: new Date().toISOString(),
});

const prepareSupplierImportContext = async (supplierId: string, rows: SupplierCostImportRow[]) => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!supplierId) throw new Error('Debe seleccionar un proveedor');

    const summary = buildSupplierImportSummary(rows.length);
    const { normalizedRows, invalidRows } = normalizeSupplierImportRows(rows, summary);

    const { data: supplierProductsData, error: supplierProductsError } = await supabase
        .from('st_products')
        .select('id, cod, barcode, name, cost_price, final_price, auto_price')
        .eq('supplier_id', supplierId)
        .eq('is_deleted', false);

    if (supplierProductsError) throw supplierProductsError;

    const supplierProducts = supplierProductsData || [];
    const DEBUG_CODE = 'W180CO112';
    // eslint-disable-next-line no-console
    console.log('[SUPPLIER_PRODUCTS_DEBUG]', {
        total: supplierProducts.length,
        matchingProducts: supplierProducts
            .filter((p: any) =>
                String(p?.cod || p?.code || p?.barcode || p?.['cod.barras'] || '').includes(DEBUG_CODE)
            )
            .map((p: any) => ({
                id: p?.id,
                cod: p?.cod,
                code: p?.code,
                barcode: p?.barcode,
                codBarras: p?.['cod.barras'],
                name: p?.name,
                supplier_id: p?.supplier_id,
            })),
    });
    summary.existingSupplierProducts = supplierProducts.length;

    const fileCodeSet = new Set(
        normalizedRows.flatMap((row) => [normalizeProductCode(row.cod || ''), normalizeProductCode(row.barcode || '')]).filter(Boolean)
    );
    summary.foundInFile = supplierProducts.reduce((acc: number, product: any) => {
        const codKey = normalizeProductCode(product.cod || product.code || '');
        const barcodeKey = normalizeProductCode(product.barcode || product['cod.barras'] || '');
        return (fileCodeSet.has(codKey) || fileCodeSet.has(barcodeKey)) ? acc + 1 : acc;
    }, 0);
    summary.notFoundInFile = Math.max(summary.existingSupplierProducts - summary.foundInFile, 0);
    summary.found = summary.foundInFile;

    const productByCode = new Map<string, any>();
    const productByBarcode = new Map<string, any>();
    for (const product of supplierProducts as any[]) {
        const codeKey = normalizeProductCode(product.cod || product.code || '');
        const barcodeKey = normalizeProductCode(product.barcode || product['cod.barras'] || '');
        if (codeKey) {
            productByCode.set(codeKey, product);
        }
        if (barcodeKey) {
            productByBarcode.set(barcodeKey, product);
        }
    }
    const normalizedDebugCode = normalizeProductCode(DEBUG_CODE);
    // eslint-disable-next-line no-console
    console.log('[PRODUCT_INDEX_DEBUG]', {
        debugCode: DEBUG_CODE,
        normalizedDebugCode,
        hasByCode: productByCode.has(normalizedDebugCode),
        byCodeValue: productByCode.get(normalizedDebugCode) || null,
        hasByBarcode: productByBarcode.has(normalizedDebugCode),
        byBarcodeValue: productByBarcode.get(normalizedDebugCode) || null,
        productByCodeSize: productByCode.size,
        productByBarcodeSize: productByBarcode.size,
    });

    const { data: supplierData, error: supplierError } = await supabase
        .from('st_suppliers')
        .select('tax_1_percent, tax_2_percent, tax_3_percent')
        .eq('id', supplierId)
        .maybeSingle();

    if (supplierError) throw supplierError;

    return {
        summary,
        supplierProducts,
        normalizedRows,
        invalidRows,
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
): Promise<SupplierCostImportPreviewResponse> => {
    const fileCurrency: 'ARS' | 'USD' = options?.fileCurrency === 'USD' ? 'USD' : 'ARS';
    const exchangeRate = Number(options?.exchangeRate ?? 1);
    const safeExchangeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;

    const {
        supplierProducts,
        normalizedRows,
        invalidRows,
        productByCode,
        productByBarcode,
        supplierTax1Percent,
        supplierTax2Percent,
        supplierTax3Percent,
    } = await prepareSupplierImportContext(supplierId, rows);

    const matchedKeysSet = new Set<string>();
    const matchedProductIds = new Set<string>();
    const validPreviewRows: Array<SupplierCostImportPreviewRow & SupplierImportPreviewMetadata> = normalizedRows.map((row) => {
        const matchResult = resolveMatch(row, productByCode, productByBarcode);
        const priceOutcome = computeSupplierImportPriceOutcome(
            matchResult.product,
            row,
            fileCurrency,
            safeExchangeRate,
            supplierTax1Percent,
            supplierTax2Percent,
            supplierTax3Percent
        );

        // Guardar claves matcheadas (code, barcode, code_prefix, barcode_prefix)
        if (matchResult.product && matchResult.matchedBy) {
            const normalizedKey = normalizeProductCode(row.cod || row.barcode || '');
            if (normalizedKey) {
                matchedKeysSet.add(normalizedKey);
                matchedProductIds.add(String(matchResult.product.id || ''));
                // eslint-disable-next-line no-console
                console.log('[MATCHED_KEY_ADDED]', {
                    key: normalizedKey,
                    matchedProductCode: matchResult.product.cod || matchResult.product.barcode || matchResult.product['cod.barras'] || '',
                    matchedBy: matchResult.matchedBy,
                });
                // eslint-disable-next-line no-console
                console.log('[PREVIEW_MATCH]', {
                    key: normalizedKey,
                    matched: !!matchResult.product,
                });
            }
        }

        const status: 'found' | 'not found' = matchResult.product ? 'found' : 'not found';
        const result: 'will update' | 'no change' | 'not found' = matchResult.product
            ? (priceOutcome.willUpdate ? 'will update' : 'no change')
            : 'not found';

        return {
            cod: String(row.cod || '').trim(),
            product_name: String(matchResult.product?.name || row.name || ''),
            current_cost: priceOutcome.currentCost,
            input_currency: fileCurrency,
            input_cost: priceOutcome.inputCost,
            exchange_rate: safeExchangeRate,
            converted_cost_ars: priceOutcome.convertedCostArs,
            new_cost: priceOutcome.convertedCostArs,
            supplier_tax_1_percent: supplierTax1Percent,
            supplier_tax_2_percent: supplierTax2Percent,
            supplier_tax_3_percent: supplierTax3Percent,
            current_final_price: priceOutcome.currentFinalPrice,
            new_calculated_final_price: priceOutcome.finalPriceToPersist,
            status,
            result,
            matched: !!matchResult.product,
            matchedBy: matchResult.matchedBy,
            reason: matchResult.reason,
            willUpdate: priceOutcome.willUpdate,
        };
    });

    const invalidPreviewRows: Array<SupplierCostImportPreviewRow & SupplierImportPreviewMetadata> = invalidRows.map(({ row }) => ({
        cod: String(row.cod || '').trim(),
        product_name: String(row.name || ''),
        current_cost: 0,
        input_currency: fileCurrency,
        input_cost: Number(row.cost_price || 0),
        exchange_rate: safeExchangeRate,
        converted_cost_ars: 0,
        new_cost: 0,
        supplier_tax_1_percent: supplierTax1Percent,
        supplier_tax_2_percent: supplierTax2Percent,
        supplier_tax_3_percent: supplierTax3Percent,
        current_final_price: 0,
        new_calculated_final_price: 0,
        status: 'not found' as const,
        result: 'not found' as const,
        matched: false,
        matchedBy: 'none' as const,
        reason: 'invalid_row' as const,
        willUpdate: false,
    }));

    const previewRows = [...validPreviewRows, ...invalidPreviewRows];
    const providerMissingProducts: SupplierMissingProduct[] = (supplierProducts || [])
        .filter((product: any) => !matchedProductIds.has(String(product?.id || '')))
        .map((product: any) => ({
            id: String(product?.id || ''),
            cod: String(product?.cod || product?.code || '').trim(),
            barcode: String(product?.barcode || product?.['cod.barras'] || '').trim(),
            description: String(product?.name || product?.description || '').trim(),
            price: Number.isFinite(Number(product?.final_price))
                ? Number(product?.final_price)
                : Number.isFinite(Number(product?.cost_price))
                    ? Number(product?.cost_price)
                    : null,
        }));

    // eslint-disable-next-line no-console
    console.log('[MATCHED_KEYSSET_FINAL_BACKEND]', {
        size: matchedKeysSet.size,
        providerMissingProducts: providerMissingProducts.length,
    });

    return {
        previewRows,
        matchedKeysArray: Array.from(matchedKeysSet),
        providerMissingProducts,
    };
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
        const matchResult = resolveMatch(row, productByCode, productByBarcode);
        if (!matchResult.product) {
            summary.notFound += 1;
            continue;
        }

        const priceOutcome = computeSupplierImportPriceOutcome(
            matchResult.product,
            row,
            fileCurrency,
            safeExchangeRate,
            supplierTax1Percent,
            supplierTax2Percent,
            supplierTax3Percent
        );

        if (!priceOutcome.willUpdate) {
            continue;
        }

        const updatePayload = buildSupplierImportUpdatePayload(
            fileCurrency,
            safeExchangeRate,
            priceOutcome.inputCost,
            priceOutcome.convertedCostArs,
            priceOutcome.finalPriceToPersist,
            priceOutcome.shouldRecalculateFinalPrice
        );

        if (!priceOutcome.shouldRecalculateFinalPrice) {
            delete updatePayload.final_price;
        }

        const { error: updateError } = await supabaseClient
            .from('st_products')
            .update(updatePayload)
            .eq('id', matchResult.product.id);

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
        .select('id, supplier_id, cost_price_usd, cost_price, final_price, auto_price')
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
        const priceOutcome = computeFinalPriceFromSupplier(
            product,
            costUsd,
            safeExchangeRate,
            'USD',
            {
                mode: 'taxes',
                tax1Percent: taxes.tax1,
                tax2Percent: taxes.tax2,
                tax3Percent: taxes.tax3,
            }
        );

        if (!priceOutcome.willUpdate) {
            const savePercentSkip = 55 + Math.round(((i + 1) / total) * 35);
            onProgress?.('saving', savePercentSkip);
            continue;
        }

        const updatePayload: Record<string, any> = {
            cost_price: priceOutcome.convertedCostArs,
            last_exchange_rate: safeExchangeRate,
            updated_at: new Date().toISOString(),
        };

        if (priceOutcome.shouldRecalculateFinalPrice) {
            updatePayload.final_price = priceOutcome.finalPriceToPersist;
        }

        const { error: updateError } = await supabase
            .from('st_products')
            .update(updatePayload)
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
        condicion_iva: supplierData.Condicion_IVA,
        email: supplierData.Email,
        telefono: supplierData.Telefono,
        contacto: supplierData.Contacto,
        direccion: supplierData.Direccion,
        activo: supplierData.Activo === 'SI',
        tax_1_percent: parsePercentValue(supplierData.tax_1_percent),
        tax_2_percent: parsePercentValue(supplierData.tax_2_percent),
        tax_3_percent: parsePercentValue(supplierData.tax_3_percent),
        tax_4_percent: parsePercentValue(supplierData.tax_4_percent)
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

    const textOrNull = (value: any): string | null => {
        const normalized = String(value ?? '').trim();
        return normalized === '' ? null : normalized;
    };

    const mapping: any = {};
    if (supplierData.Nombre !== undefined) mapping.nombre = supplierData.Nombre;
    if (supplierData.CUIT !== undefined) mapping.cuit = supplierData.CUIT;
    if (supplierData.Condicion_IVA !== undefined) mapping.condicion_iva = textOrNull(supplierData.Condicion_IVA);
    if (supplierData.Email !== undefined) mapping.email = textOrNull(supplierData.Email);
    if (supplierData.Telefono !== undefined) mapping.telefono = textOrNull(supplierData.Telefono);
    if (supplierData.Contacto !== undefined) mapping.contacto = textOrNull(supplierData.Contacto);
    if (supplierData.Direccion !== undefined) mapping.direccion = textOrNull(supplierData.Direccion);
    if (supplierData.Activo !== undefined) mapping.activo = supplierData.Activo === 'SI';
    // Agregado explícito de los 4 impuestos para persistencia en edición
    if (supplierData.tax_1_percent !== undefined) mapping.tax_1_percent = supplierData.tax_1_percent;
    if (supplierData.tax_2_percent !== undefined) mapping.tax_2_percent = supplierData.tax_2_percent;
    if (supplierData.tax_3_percent !== undefined) mapping.tax_3_percent = supplierData.tax_3_percent;
    if (supplierData.tax_4_percent !== undefined) mapping.tax_4_percent = supplierData.tax_4_percent;

    const { data, error } = await supabase
        .from('st_suppliers')
        .update(mapping)
        .eq('id', id)
        .select()
        .maybeSingle();
    
    if (error) throw error;
    if (!data) {
        throw new Error('No se encontró el proveedor a actualizar o no hubo cambios persistidos.');
    }
    return data;
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
            iva_condition: customerData.Condicion_IVA
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

// --- FACTURACIÓN ELECTRÓNICA (SUPABASE HYBRID) ---

const normalizeCustomerForTusFacturas = (customer: any) => {
    if (!customer) return null;
    const normalized = { ...customer };
    
    const iva = String(customer.Condicion_IVA || '').toUpperCase();
    if (iva.includes('RESPONSABLE INSCRIPTO')) normalized.Condicion_IVA = 'RI';
    else if (iva.includes('MONOTRIBUTO')) normalized.Condicion_IVA = 'M';
    else if (iva.includes('CONSUMIDOR FINAL')) normalized.Condicion_IVA = 'CF';
    else if (
        iva.includes('EXENTO') ||
        iva.includes('SUJETO EXENTO') ||
        iva.includes('IVA EXENTO')
    ) {
        normalized.Condicion_IVA = 'E'; // Código TusFacturas para Exento
    }
    else normalized.Condicion_IVA = 'CF';

    const docType = String(customer['Tipo.Documento'] || '').toUpperCase();
    if (normalized.Condicion_IVA === 'CF') {
        normalized['Tipo.Documento'] = '99';
    } else if (docType.includes('CUIT')) normalized['Tipo.Documento'] = 'CUIT';
    else if (docType.includes('DNI')) normalized['Tipo.Documento'] = 'DNI';
    else normalized['Tipo.Documento'] = 'DNI';

    const doc = String(customer.Documento || '').replace(/\D/g, '');
    if (normalized['Tipo.Documento'] === 'CUIT' && doc.length !== 11) {
        if (normalized.Condicion_IVA === 'E') {
            // Para exentos sin CUIT válido, asignar tipo y número genéricos pero mantener exento
            normalized['Tipo.Documento'] = '99';
            normalized.Documento = '0';
        } else {
            normalized.Condicion_IVA = 'CF';
            normalized['Tipo.Documento'] = '99';
            normalized.Documento = '0';
        }
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

const parseVatRateCandidate = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value > 0 && value <= 1) return Number((value * 100).toFixed(2));
        if (value > 0 && value <= 100) return Number(value.toFixed(2));
        return null;
    }
    const parsed = Number(String(value).replace(',', '.').trim());
    if (!Number.isFinite(parsed)) return null;
    if (parsed > 0 && parsed <= 1) return Number((parsed * 100).toFixed(2));
    if (parsed > 0 && parsed <= 100) return Number(parsed.toFixed(2));
    return null;
};

const resolveItemVatRate = (item: any): number | null => {
    const itemCandidates = [
        item?.iva,
        item?.IVA,
        item?.alicuota_iva,
        item?.alicuotaIva,
        item?.aliquot,
        item?.vat_rate,
        item?.tax_rate,
        item?.AlicIva,
        item?.ImpIVA,
    ];

    for (const candidate of itemCandidates) {
        const parsed = parseVatRateCandidate(candidate);
        if (parsed !== null) return parsed;
    }

    const product = item?.product || {};
    const productCandidates = [
        product?.iva,
        product?.IVA,
        product?.alicuota_iva,
        product?.alicuotaIva,
        product?.aliquot,
        product?.vat_rate,
        product?.tax_rate,
        product?.AlicIva,
        product?.ImpIVA,
    ];

    for (const candidate of productCandidates) {
        const parsed = parseVatRateCandidate(candidate);
        if (parsed !== null) return parsed;
    }

    return null;
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
        const isFacturaB = cbteTipo === 6;
        const isExemptCustomer = normalizedCustomer?.Condicion_IVA === 'E';
        const forceTaxedBForExempt = isFacturaB && isExemptCustomer;

        let fallback21UsedCount = 0;
        const fiscalItems = (sale.items || []).map((item: any, index: number) => {
            const detectedVatRate = resolveItemVatRate(item);
            const fallback21Used = forceTaxedBForExempt && detectedVatRate === null;
            if (fallback21Used) fallback21UsedCount += 1;
            const appliedVatRate = forceTaxedBForExempt
                ? (detectedVatRate ?? 21)
                : detectedVatRate;

            return {
                ...item,
                vat_rate: appliedVatRate,
                fiscal_vat_rate: appliedVatRate,
                fiscal_meta: {
                    index,
                    detectedVatRate,
                    appliedVatRate,
                    fallback21Used,
                    forceTaxedBForExempt,
                },
            };
        });

        console.log('[EXEMPT_B_TAX_RULE]', {
            cbteTipo,
            condicionIVACliente: normalizedCustomer?.Condicion_IVA,
            forceTaxedBForExempt,
            appliedVatRates: fiscalItems.map((item: any) => item?.fiscal_meta?.appliedVatRate),
            fallback21UsedCount,
        });

        console.log('[DIAG097 invoice sale id][api.generateElectronicInvoice input]', {
            saleId: sale.id,
            facturacion: sale.facturacion,
            cbteTipo,
        });

        const saleForInvoice = { 
            ...sale, 
            items: fiscalItems,
            customer: normalizedCustomer,
            cbteTipo: cbteTipo,
            comprobante_tipo: comprobante_tipo,
            requested_tipo: sale.facturacion,
            sent_tipo: comprobante_tipo,
            fiscal_rules: {
                forceTaxedBForExempt,
                defaultVatRate: 21,
                applyVatByItemEvenForExemptOnFacturaB: forceTaxedBForExempt,
            },
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
            fiscal_rules: saleForInvoice.fiscal_rules,
            appliedVatRates: fiscalItems.map((item: any) => item?.fiscal_meta?.appliedVatRate),
            fallback21UsedCount,
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
            const parseMaybeJson = (value: any) => {
                if (value == null) return null;
                if (typeof value === 'string') {
                    try {
                        return JSON.parse(value);
                    } catch {
                        return value;
                    }
                }
                return value;
            };

            const errorAny = error as any;
            const edgeBody =
                parseMaybeJson(errorAny?.body) ??
                parseMaybeJson(errorAny?.context?.body) ??
                parseMaybeJson(errorAny?.context?.responseBody) ??
                null;
            const edgeMessage =
                (typeof edgeBody === 'object' && (edgeBody?.message || edgeBody?.error || edgeBody?.detail)) ||
                error.message ||
                'Respuesta non-2xx sin detalle explícito.';
            const invokeErrorInfo = {
                status: error.status,
                message: error.message,
                body: edgeBody,
                context: errorAny?.context,
            };
            console.error('Error al invocar Edge Function create-electronic-invoice-tolosa:', invokeErrorInfo);
            console.error('[DIAG132][api.generateElectronicInvoice][edge non-2xx]', {
                saleId: sale.id,
                httpStatus: error.status || null,
                edgeBody,
                readableMessage: edgeMessage,
            });
            return {
                status: 'facturación pendiente',
                reason: 'INVOKE_ERROR',
                message: `Error al invocar facturación electrónica (HTTP ${error.status || 'desconocido'}): ${edgeMessage}`,
                debug: [
                    'Invoke error en create-electronic-invoice-tolosa.',
                    `HTTP Status: ${error.status || 'desconocido'}`,
                    `Edge Body: ${JSON.stringify(edgeBody)}`,
                    `Mensaje legible: ${String(edgeMessage)}`,
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

export const getUserProfileById = async (userId: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_user_profiles')
        .select('id, nombre, rol, activo')
        .eq('id', userId)
        .maybeSingle();
    
    if (error) {
        console.error(`Error buscando perfil para user id: ${userId}`, error);
        throw new Error(`No se encontró un perfil de usuario para el ID: ${userId}.`);
    }

    if (!data) {
        throw new Error(`No se encontró un perfil de usuario para el ID: ${userId}.`);
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
                id,
                nombre
            )
        `)
        .order('opened_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(item => ({
        ID_Turno: item.id,
        ID_Usuario: item.st_user_profiles?.id || 'Unknown',
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

export const openShiftSupabase = async (userId: string, openingAmount: number): Promise<Shift> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const profile = await getUserProfileById(userId);
    
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
                id
            )
        `)
        .single();
    
    if (error) throw error;
    
    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.id || userId,
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

export const getExpensesSupabase = async (currentUser?: User | null): Promise<Expense[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const isCurrentUserAdmin = isAdminRoleValue(currentUser?.Rol);

    const { data: expensesData, error: expensesError } = await supabase
        .from('st_expenses')
        .select('*')
        .order('spent_at', { ascending: false });

    if (expensesError) throw expensesError;

    const { data: profilesData, error: profilesError } = await supabase
        .from('st_user_profiles')
        .select('id, nombre, rol');

    if (profilesError) throw profilesError;

    const profilesById = new Map(
        (profilesData || []).map((profile: any) => [String(profile?.id || ''), profile])
    );

    const rows = (expensesData || []) as any[];
    const filteredRows = !currentUser || isCurrentUserAdmin
        ? rows
        : rows.filter((item) => {
            const loaderId = String(item?.user_profile_id || '').trim();
            if (!loaderId) return false;
            const loaderProfile = profilesById.get(loaderId);
            if (!loaderProfile) return false;
            return !isAdminRoleValue(loaderProfile?.rol);
        });

    return filteredRows.map(item => {
        const loaderId = String(item?.user_profile_id || '').trim();
        const loaderProfile = loaderId ? profilesById.get(loaderId) : null;

        return {
            id_gastos: item.id,
            Fecha: new Date(item.spent_at),
            FechaRaw: item.spent_at,
            Monto: Number(item.amount),
            Detalle: item.detail,
            Tipo: item.category || item.tipo || item.type || 'Otros',
            Efectivo: Number(item.payment_cash || 0),
            Digital: Number(item.payment_digital || 0),
            shiftId: item.shift_id,
            user_profile_id: item.user_profile_id || undefined,
            CargadoPor: loaderProfile?.nombre || loaderId || 'Sin usuario',
        } as Expense;
    });
};

export const addExpenseSupabase = async (expenseData: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'; shiftId?: string; spentAt?: string; userId?: string; }): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    let authorProfileId: string | null = null;
    if (expenseData.userId) {
        const profile = await getUserProfileById(expenseData.userId);
        authorProfileId = profile?.id ? String(profile.id) : null;
    }

    const insertPayload: any = {
        shift_id: expenseData.shiftId || null,
        spent_at: expenseData.spentAt || new Date().toISOString(),
        amount: expenseData.monto,
        detail: expenseData.detalle,
        category: expenseData.tipo || 'Otros',
        payment_cash: expenseData.paymentType === 'Efectivo' ? expenseData.monto : 0,
        payment_digital: expenseData.paymentType === 'Digital' ? expenseData.monto : 0,
    };

    if (authorProfileId) {
        insertPayload.user_profile_id = authorProfileId;
    }
    
    const { data, error } = await supabase
        .from('st_expenses')
        .insert([insertPayload])
        .select();
    
    if (error) throw error;
    return data[0];
};

export const updateExpenseSupabase = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'; userId?: string; }): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    let authorPatch: Record<string, any> = {};
    if (expenseData.userId) {
        const { data: existingExpense, error: existingError } = await supabase
            .from('st_expenses')
            .select('id, user_profile_id')
            .eq('id', expenseData.id_gastos)
            .maybeSingle();
        if (existingError) throw existingError;

        const hasUserProfile = Boolean(String(existingExpense?.user_profile_id || '').trim());
        if (!hasUserProfile) {
            const profile = await getUserProfileById(expenseData.userId);
            const profileId = profile?.id ? String(profile.id) : '';
            if (profileId) {
                if (!hasUserProfile) authorPatch.user_profile_id = profileId;
            }
        }
    }
    
    const { data, error } = await supabase
        .from('st_expenses')
        .update({
            amount: expenseData.monto,
            detail: expenseData.detalle,
            category: expenseData.tipo || 'Otros',
            payment_cash: expenseData.paymentType === 'Efectivo' ? expenseData.monto : 0,
            payment_digital: expenseData.paymentType === 'Digital' ? expenseData.monto : 0,
            updated_at: new Date(),
            ...authorPatch,
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
                id
            )
        `)
        .single();
    
    if (error) throw error;
    
    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.id || 'Unknown',
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

export const getActiveShiftSupabase = async (userId: string): Promise<Shift | null> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const profile = await getUserProfileById(userId);
    
    const { data, error } = await supabase
        .from('st_shifts')
        .select(`
            *,
            st_user_profiles (
                id
            )
        `)
        .eq('user_profile_id', profile.id)
        .eq('status', 'open')
        .maybeSingle();
    
    if (error) throw error;
    if (!data) return null;
    
    return {
        ID_Turno: data.id,
        ID_Usuario: data.st_user_profiles?.id || userId,
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
                id
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
        ID_Usuario: data.st_user_profiles?.id || 'Unknown',
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

    const normalized: User[] = rows.map((item: any) => mapUserRowToUser(item)).filter((u) => !!u.ID_Usuario);

    return onlyActive ? normalized.filter((u) => u.Activo === 'SI') : normalized;
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
                converted_to_sale_id,
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
        converted_to_sale_id: b.converted_to_sale_id || null,
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

    const billingCae = String(item?.billing_cae || '').trim();
    const billingNumber = String(item?.billing_number || '').trim();
    const billingTicketUrl = String(item?.billing_ticket_url || '').trim();
    const billingPdfUrl = String(item?.billing_pdf_url || '').trim();
    const billingQrData = String(item?.billing_qr_data || '').trim();
    const billingVtoCae = String(item?.billing_vto_cae || '').trim();

    const cae =
        (isCreditNoteInvoice ? undefined : linkedInvoice?.cae) ||
        billingCae ||
        '';
    const nro =
        (isCreditNoteInvoice ? undefined : linkedInvoice?.nro) ||
        billingNumber ||
        '';
    const vtoCae = linkedInvoice?.vto_cae || billingVtoCae || '';
    const qrData = linkedInvoice?.qr_data || billingQrData || '';
    const canonicalPdfUrl = linkedInvoice?.pdf_url || undefined;
    const canonicalTicketUrl = linkedInvoice?.ticket_url || undefined;

    const pdfUrl =
        (isCreditNoteInvoice ? undefined : canonicalPdfUrl) ||
        billingPdfUrl ||
        undefined;
    const ticketUrl =
        (isCreditNoteInvoice ? undefined : canonicalTicketUrl) ||
        billingTicketUrl ||
        undefined;
    const hasBillingEvidence = Boolean(
        billingCae ||
        billingNumber ||
        billingTicketUrl ||
        billingPdfUrl
    );
    const hasLinkedInvoiceEvidence = Boolean(
        linkedInvoice?.cae ||
        linkedInvoice?.nro ||
        linkedInvoice?.pdf_url ||
        linkedInvoice?.comprobante_pdf_url ||
        linkedInvoice?.url ||
        linkedInvoice?.comprobante_url ||
        linkedInvoice?.ticket_url ||
        linkedInvoice?.comprobante_ticket_url
    );
    const invoiceType =
        linkedInvoice?.invoice_type ||
        item.invoice_type ||
        (hasLinkedInvoiceEvidence || hasBillingEvidence ? 'FACTURADA' : 'N');
    const fecha = linkedInvoice?.issued_at || linkedInvoice?.created_at || item.sold_at;

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

export const getSales = async (options?: { startDate?: string; endDate?: string; defaultToToday?: boolean }): Promise<any[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const buildLocalDayBoundsFromString = (day: string): { startIso: string; endIso: string } | null => {
        const [yearRaw, monthRaw, dayRaw] = String(day || '').split('-').map((value) => Number(value));
        if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw) || !Number.isFinite(dayRaw)) return null;
        if (monthRaw < 1 || monthRaw > 12 || dayRaw < 1 || dayRaw > 31) return null;

        const start = new Date(yearRaw, monthRaw - 1, dayRaw, 0, 0, 0, 0);
        const end = new Date(yearRaw, monthRaw - 1, dayRaw, 23, 59, 59, 999);
        return { startIso: start.toISOString(), endIso: end.toISOString() };
    };

    const resolveSalesRange = (rangeOptions?: { startDate?: string; endDate?: string; defaultToToday?: boolean }): { startIso?: string; endIso?: string } => {
        const defaultToToday = rangeOptions?.defaultToToday === true;
        const startDay = String(rangeOptions?.startDate || '').trim();
        const endDay = String(rangeOptions?.endDate || '').trim();

        if (!startDay && !endDay) {
            if (!defaultToToday) return {};
            const today = new Date();
            const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const todayBounds = buildLocalDayBoundsFromString(todayLocal);
            return todayBounds ? { startIso: todayBounds.startIso, endIso: todayBounds.endIso } : {};
        }

        const normalizedStartDay = startDay || endDay;
        const normalizedEndDay = endDay || startDay;
        const startBounds = buildLocalDayBoundsFromString(normalizedStartDay);
        const endBounds = buildLocalDayBoundsFromString(normalizedEndDay);

        if (!startBounds || !endBounds) return {};
        return {
            startIso: startBounds.startIso,
            endIso: endBounds.endIso,
        };
    };

    const { startIso, endIso } = resolveSalesRange(options);

    const PAGE_SIZE = 1000;
    let from = 0;
    let keepFetching = true;
    const salesRowsMap = new Map<string, any>();
    const salesRowsNoId: any[] = [];

    while (keepFetching) {
        let salesQuery = supabase
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

        if (startIso) {
            salesQuery = salesQuery.gte('sold_at', startIso);
        }
        if (endIso) {
            salesQuery = salesQuery.lte('sold_at', endIso);
        }

        const { data, error } = await salesQuery.range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        const batch = Array.isArray(data) ? data : [];
        for (const row of batch) {
            const rowId = String(row?.id || '').trim();
            if (!rowId) {
                salesRowsNoId.push(row);
                continue;
            }
            if (!salesRowsMap.has(rowId)) {
                salesRowsMap.set(rowId, row);
            }
        }

        if (batch.length < PAGE_SIZE) {
            keepFetching = false;
        } else {
            from += PAGE_SIZE;
        }
    }

    const salesRows = [...salesRowsMap.values(), ...salesRowsNoId];
    console.log('[getSales] Total ventas traidas desde st_sales:', salesRows.length, { startIso, endIso });

    return salesRows.map((item: any) => {
        const linkedInvoice = null;
        const invoiceData = buildInvoiceData(item, linkedInvoice);
        const parsedNotes = extractSaleNotesAndEcheqs(item.notes);
        const items = (item.st_sale_items || []).map((si: any) => ({
            product: {
                cod: si.st_products?.cod || si.product_code || '',
                Producto: si.st_products?.name || si.product_name_snapshot || '',
                Precio: Number(si.unit_price ?? 0)
            },
            quantity: Number(si.quantity ?? 0),
            price: Number(si.unit_price ?? 0)
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
            Descripcion_Ajuste: parsedNotes.adjustmentDescription,
            Pago_Efectivo: Number(item.payment_cash ?? 0),
            Pago_Digital: Number(item.payment_digital ?? 0),
            Pago_Cuenta_Corriente: Number(item.payment_credit ?? 0),
            'Productos (JSON)': JSON.stringify(items),
            'Echeqs (JSON)': JSON.stringify(parsedNotes.echeqs),
            Estado: estado,
            ID_Turno: item.shift_id || undefined,
            Facturacion: invoiceData.invoiceType,
            Factura_CAE: invoiceData.cae,
            Factura_Nro: invoiceData.nro,
            Factura_Fecha: invoiceData.fecha,
            Factura_Vto_CAE: invoiceData.vtoCae,
            Factura_QR_Data: invoiceData.qrData,
            Factura_URL: invoiceData.pdfUrl,
            Factura_Ticket_URL: invoiceData.ticketUrl,
            billing_cae: item.billing_cae || null,
            billing_number: item.billing_number || null,
            billing_ticket_url: item.billing_ticket_url || null,
            billing_pdf_url: item.billing_pdf_url || null,
            billing_qr_data: item.billing_qr_data || null,
            billing_vto_cae: item.billing_vto_cae || null
        };
    });
};

export const getExpenses = async (currentUser?: User | null): Promise<Expense[]> => {
    return getExpensesSupabase(currentUser);
};

export const addExpense = async (data: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'; shiftId?: string; userId?: string; }): Promise<void> => {
    await addExpenseSupabase(data);
};

export const updateExpense = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros'; userId?: string; }): Promise<void> => {
    await updateExpenseSupabase(expenseData);
};

export const deleteExpense = async (expenseId: string): Promise<void> => {
    await deleteExpenseSupabase(expenseId);
};

export const getUsers = async (): Promise<User[]> => {
    return getUsersSupabase(true);
};

export const login = async (userId: string, pin: string): Promise<{user: User, activeShift: Shift | null}> => {
    const users = await getUsersSupabase(true);
    const user = users.find((item) => item.ID_Usuario === userId && item.PIN === pin);
    if (!user) throw new Error('Usuario o PIN incorrecto.');

    const activeShift = user.Rol === 'Admin'
        ? await getAnyActiveShiftSupabase()
        : await getActiveShiftSupabase(user.ID_Usuario);

    return { user, activeShift };
};

export const openShift = async (userId: string, openingAmount: number): Promise<Shift> => {
    return openShiftSupabase(userId, openingAmount);
};

export const closeShift = async (shiftId: string, closingAmount: number): Promise<Shift> => {
    return closeShiftSupabase(shiftId, closingAmount);
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

// =============================================================================
// --- KIT SUPPORT HELPERS ---
// =============================================================================

export interface KitComponent {
    component_product_id?: string;
    component_product_cod: string;
    component_product_name?: string;
    quantity_per_kit: number;
    current_stock?: number;
}

export const getKitComponents = async (kitProductId: string): Promise<KitComponent[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_product_kits')
        .select('component_product_id, quantity_per_kit')
        .eq('kit_product_id', kitProductId);

    if (error) throw error;

    const componentRows = Array.isArray(data) ? data : [];
    const componentIds = componentRows
        .map((item: any) => String(item.component_product_id || '').trim())
        .filter(Boolean);

    if (componentIds.length === 0) return [];

    const { data: productsData, error: productsError } = await supabase
        .from('st_products')
        .select('id, cod, name, current_stock')
        .in('id', componentIds);

    if (productsError) throw productsError;

    const productById = new Map(
        (productsData || []).map((product: any) => [String(product.id), product])
    );

    return componentRows
        .map((item: any) => {
            const componentId = String(item.component_product_id || '').trim();
            const product = productById.get(componentId);
            if (!product) return null;

            return {
                component_product_id: componentId,
                component_product_cod: String(product.cod || ''),
                component_product_name: String(product.name || ''),
                quantity_per_kit: Number(item.quantity_per_kit ?? 0),
                current_stock: Number(product.current_stock ?? 0),
            } as KitComponent;
        })
        .filter(Boolean) as KitComponent[];
};

export const getKitAvailability = async (kitProductId: string): Promise<number> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const components = await getKitComponents(kitProductId);
    
    if (components.length === 0) {
        console.warn('[getKitAvailability] Kit sin componentes:', { kitProductId });
        return 0;
    }
    
    // Calcular cantidad de kits disponibles según el componente con menos stock relativo
    const availabilities = components.map(comp => {
        const stock = comp.current_stock ?? 0;
        const qtyPerKit = comp.quantity_per_kit || 1;
        return Math.floor(stock / qtyPerKit);
    });
    
    return Math.min(...availabilities);
};

export const decrementKitComponentsStock = async (kitProductId: string, quantitySold: number): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (quantitySold <= 0) throw new Error('Cantidad a descontar debe ser mayor a 0');

    const components = await getKitComponents(kitProductId);

    if (components.length === 0) {
        throw new Error('El kit no tiene componentes definidos');
    }

    const currentByCod = new Map<string, number>();
    for (const component of components) {
        const cod = String(component.component_product_cod || '').trim();
        if (!cod) continue;
        currentByCod.set(cod, Number(component.current_stock ?? 0));
    }

    for (const component of components) {
        const componentCode = String(component.component_product_cod || '').trim();
        if (!componentCode) {
            throw new Error('Componente inválido en kit');
        }

        const decrementBy = quantitySold * (component.quantity_per_kit || 1);
        const currentStock = Number(currentByCod.get(componentCode) ?? 0);
        if (currentStock < decrementBy) {
            throw new Error(`Stock insuficiente para componente ${componentCode}`);
        }

        const newStock = Math.max(0, currentStock - decrementBy);
        const { error: updateError } = await supabase
            .from('st_products')
            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
            .eq('cod', componentCode);

        if (updateError) throw updateError;
    }
};

export const saveProductKitComponents = async (kitProductId: string, components: Array<{ cod: string; quantity: number }>): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    // Primero, eliminar componentes existentes
    const { error: deleteError } = await supabase
        .from('st_product_kits')
        .delete()
        .eq('kit_product_id', kitProductId);
    
    if (deleteError) throw deleteError;
    
    if (components.length === 0) return; // Kit sin componentes (conversión a simple)
    
    // Mapear códigos de producto a sus IDs (UUID)
    const { data: productMap, error: mapError } = await supabase
        .from('st_products')
        .select('id, cod')
        .in('cod', components.map(c => c.cod));
    
    if (mapError) throw mapError;
    
    const idByCod = new Map((productMap || []).map((p: any) => [String(p.cod), String(p.id)]));
    const validComponents = components.filter(c => idByCod.has(String(c.cod)));
    
    if (validComponents.length === 0) throw new Error('No hay componentes válidos para el kit');
    
    const kitComponentsToInsert = validComponents.map(comp => ({
        kit_product_id: kitProductId,
        component_product_id: idByCod.get(String(comp.cod)),
        quantity_per_kit: Math.max(1, Number(comp.quantity ?? 1))
    }));
    
    const { error: insertError } = await supabase
        .from('st_product_kits')
        .insert(kitComponentsToInsert);
    
    if (insertError) throw insertError;
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
        notes: buildSaleNotesWithEcheqs(sale.adjustmentDescription, sale.payment?.echeqs)
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
        await persistInvoiceForSale(insertedSale.id, sale.facturaInfo, sale.facturacion);
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

    const productMap = await getProductIdMap(sale.items);
    const itemsToInsert = buildSaleItemsPayload(insertedSale.id, sale.items, productMap);

    if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
            .from('st_sale_items')
            .insert(itemsToInsert);

        if (itemsError) {
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw itemsError;
        }
    }

    // Descuento de stock para kits en venta real.
    // Presupuestos usan otro flujo y no pasan por addSale, por lo que no se descuenta stock allí.
    const soldCodes = sale.items.map((item) => String(item.product?.cod || '').trim()).filter(Boolean);
    if (soldCodes.length > 0) {
        const { data: soldProducts, error: soldProductsError } = await supabase
            .from('st_products')
            .select('id, cod, product_type')
            .in('cod', soldCodes);

        if (soldProductsError) {
            await supabase.from('st_sale_items').delete().eq('sale_id', insertedSale.id);
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw soldProductsError;
        }

        const productMetaByCode = new Map((soldProducts || []).map((product: any) => [String(product.cod), product]));

        for (const item of sale.items) {
            const itemCode = String(item.product?.cod || '').trim();
            if (!itemCode) continue;

            const productMeta = productMetaByCode.get(itemCode);
            if (!productMeta) continue;

            if (String(productMeta.product_type || 'simple') === 'kit') {
                const kitId = String(productMeta.id || '').trim();
                if (!kitId) {
                    await supabase.from('st_sale_items').delete().eq('sale_id', insertedSale.id);
                    await supabase.from('st_sales').delete().eq('id', insertedSale.id);
                    throw new Error(`Kit ${itemCode} sin id válido`);
                }

                const kitAvailability = await getKitAvailability(kitId);
                if (kitAvailability < Number(item.quantity ?? 0)) {
                    await supabase.from('st_sale_items').delete().eq('sale_id', insertedSale.id);
                    await supabase.from('st_sales').delete().eq('id', insertedSale.id);
                    throw new Error(`Stock insuficiente para kit ${item.product?.Producto || itemCode}`);
                }

                await decrementKitComponentsStock(kitId, Number(item.quantity ?? 0));
            }
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
    if (!supabase) throw new Error('Supabase no inicializado');

    const customerId =
        updatedSale.customer?.Id_Cliente &&
        updatedSale.customer.Id_Cliente !== '0' &&
        !String(updatedSale.customer.Id_Cliente).startsWith('CLAD')
            ? updatedSale.customer.Id_Cliente
            : null;

    const soldAt = updatedSale.date instanceof Date ? updatedSale.date.toISOString() : new Date(updatedSale.date).toISOString();
    const updatePayload = {
        sold_at: soldAt,
        customer_id: customerId,
        subtotal: Number(updatedSale.subtotal ?? 0),
        adjustment_amount: Number(updatedSale.adjustmentAmount ?? 0),
        total: Number(updatedSale.total ?? 0),
        payment_cash: Number(updatedSale.payment?.cash ?? 0),
        payment_digital: Number(updatedSale.payment?.digital ?? 0),
        payment_credit: Number(updatedSale.payment?.credit ?? 0),
        invoice_type: updatedSale.facturacion || 'N',
        customer_name_snapshot: updatedSale.customer?.['Nombre y Apellido'] || 'Consumidor Final',
        customer_document_snapshot: updatedSale.customer?.Documento || null,
        notes: buildSaleNotesWithEcheqs(updatedSale.adjustmentDescription, updatedSale.payment?.echeqs),
        updated_at: new Date().toISOString(),
    };

    const { error: saleError } = await supabase
        .from('st_sales')
        .update(updatePayload)
        .eq('id', originalSale.id);

    if (saleError) throw saleError;

    const { error: deleteItemsError } = await supabase
        .from('st_sale_items')
        .delete()
        .eq('sale_id', originalSale.id);

    if (deleteItemsError) throw deleteItemsError;

    const productMap = await getProductIdMap(updatedSale.items);
    const itemsToInsert = buildSaleItemsPayload(originalSale.id, updatedSale.items, productMap);

    if (itemsToInsert.length > 0) {
        const { error: insertItemsError } = await supabase
            .from('st_sale_items')
            .insert(itemsToInsert);

        if (insertItemsError) throw insertItemsError;
    }

    await syncSaleAccountTransaction({ ...updatedSale, id: originalSale.id }, updatedSale.shiftId);

    if (updatedSale.facturaInfo?.cae) {
        await persistInvoiceForSale(originalSale.id, updatedSale.facturaInfo, updatedSale.facturacion);
    }
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

export const updateSaleAdjustmentSupabase = async (
    saleId: string,
    payload: { subtotal: number; adjustmentAmount: number; adjustmentDescription?: string | null; echeqs?: any }
): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!saleId) throw new Error('ID de venta inválido');

    const subtotal = Number(payload.subtotal ?? 0);
    const adjustmentAmount = Number(payload.adjustmentAmount ?? 0);

    if (!Number.isFinite(subtotal)) throw new Error('Subtotal inválido');
    if (!Number.isFinite(adjustmentAmount)) throw new Error('Ajuste inválido');

    const total = Number((subtotal + adjustmentAmount).toFixed(2));
    const notes = buildSaleNotesWithEcheqs(payload.adjustmentDescription, payload.echeqs);

    const { error } = await supabase
        .from('st_sales')
        .update({
            adjustment_amount: adjustmentAmount,
            total,
            notes,
            updated_at: new Date().toISOString(),
        })
        .eq('id', saleId);

    if (error) throw error;
};

export const updateSaleAdjustment = async (
    saleId: string,
    payload: { subtotal: number; adjustmentAmount: number; adjustmentDescription?: string | null; echeqs?: any }
): Promise<void> => {
    return updateSaleAdjustmentSupabase(saleId, payload);
};

export const addCustomer = async (customerData: any): Promise<void> => {
    await addCustomerSupabase(customerData);
};

export const recordPayment = async (customerId: string, amount: number, description: string, paymentMethod: string, shiftId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { error } = await supabase
        .from('st_account_transactions')
        .insert([{
            customer_id: customerId,
            type: 'Pago',
            description: description || `Pago registrado (${paymentMethod})`,
            debit: 0,
            credit: Number(amount || 0),
            shift_id: shiftId || null,
            date: new Date().toISOString(),
            created_at: new Date().toISOString(),
        }]);

    if (error) throw error;
};

export const createCreditNote = async (payload: any): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const requestId = payload?.requestId || (typeof window !== 'undefined' && window.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random()*10000)}`);
    console.log('[NC TRACE] createCreditNote start', requestId);

    if (!payload?.facturaInfo) {
        console.error('[NCS_DB_INSERT] factura_info faltante, se aborta el insert de la NC', {
            requestId,
            customerId: payload?.customerId,
            originalSaleId: payload?.originalSaleId,
            total: payload?.total,
        });
        throw new Error('No se puede insertar la nota de credito sin factura_info fiscal.');
    }

    // Defensa anti-duplicado: buscar NC idéntica en los últimos 10 segundos
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10000).toISOString();
    const { data: existing, error: fetchError } = await supabase
        .from('st_account_transactions')
        .select('id, customer_id, credit, type, date, description')
        .eq('customer_id', payload.customerId)
        .eq('type', 'Nota de Crédito')
        .eq('credit', Number(payload.total || 0))
        .gte('date', tenSecondsAgo)
        .order('date', { ascending: false });
    if (fetchError) {
        console.warn('[NC TRACE] error buscando duplicados', requestId, fetchError);
    }
    if (existing && existing.length > 0) {
        console.warn('[NC TRACE] duplicate prevented by recent existing transaction', requestId, existing[0]);
        return;
    }

    console.log('[NC TRACE] createCreditNote before insert', requestId, {
        customer_id: payload.customerId,
        credit: Number(payload.total || 0),
        description: payload.description,
        itemsCount: Array.isArray(payload.items) ? payload.items.length : 0
    });
    console.log('[NCS_DB_INSERT]', {
        requestId,
        customerId: payload.customerId,
        originalSaleId: payload.originalSaleId || null,
        facturaInfo: payload.facturaInfo,
    });
    const { data, error } = await supabase
        .from('st_account_transactions')
        .insert([{
            customer_id: payload.customerId,
            type: 'Nota de Crédito',
            description: payload.description || 'Nota de crédito',
            debit: 0,
            credit: Number(payload.total || 0),
            original_sale_id: payload.originalSaleId || null,
            shift_id: payload.shiftId || null,
            items: payload.items ? JSON.stringify(payload.items) : null,
            factura_info: payload.facturaInfo ? JSON.stringify(payload.facturaInfo) : null,
            date: new Date().toISOString(),
            created_at: new Date().toISOString(),
        }])
        .select('id');
    if (error) throw error;
    console.log('[NC TRACE] createCreditNote after insert', requestId, data?.[0]?.id);
};

export const restoreStockFromCreditNoteItems = async (items: CartItem[]): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const qtyByCod = new Map<string, number>();
    for (const item of items || []) {
        const cod = String(item?.product?.cod || '').trim();
        const quantity = Number(item?.quantity || 0);
        if (!cod || !Number.isFinite(quantity) || quantity <= 0) continue;
        qtyByCod.set(cod, (qtyByCod.get(cod) || 0) + quantity);
    }

    const productCodes = Array.from(qtyByCod.keys());
    if (productCodes.length === 0) return;

    const { data: products, error: fetchError } = await supabase
        .from('st_products')
        .select('cod, current_stock')
        .in('cod', productCodes);

    if (fetchError) throw fetchError;

    const productMap = new Map((products || []).map((product: any) => [String(product.cod || ''), product]));

    for (const [cod, qtyToRestore] of qtyByCod.entries()) {
        const dbProduct = productMap.get(cod);
        if (!dbProduct) continue;

        const newCurrentStock = (Number(dbProduct.current_stock) || 0) + qtyToRestore;
        const { error: updateError } = await supabase
            .from('st_products')
            .update({ current_stock: newCurrentStock, updated_at: new Date().toISOString() })
            .eq('cod', cod);

        if (updateError) throw updateError;
    }
};

export const isSaleFullyReturnedByQuantity = async (saleId: string): Promise<boolean> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedSaleId = String(saleId || '').trim();
    if (!normalizedSaleId) return false;

    const { data: saleItems, error: saleItemsError } = await supabase
        .from('st_sale_items')
        .select('product_code, quantity')
        .eq('sale_id', normalizedSaleId);

    if (saleItemsError) throw saleItemsError;

    const soldByCode = new Map<string, number>();
    for (const row of saleItems || []) {
        const code = String((row as any)?.product_code || '').trim();
        const qty = Number((row as any)?.quantity || 0);
        if (!code || !Number.isFinite(qty) || qty <= 0) continue;
        soldByCode.set(code, (soldByCode.get(code) || 0) + qty);
    }

    if (soldByCode.size === 0) return false;

    const { data: creditNotes, error: creditNotesError } = await supabase
        .from('st_account_transactions')
        .select('items')
        .eq('original_sale_id', normalizedSaleId)
        .eq('type', 'Nota de Crédito');

    if (creditNotesError) throw creditNotesError;

    const returnedByCode = new Map<string, number>();

    for (const note of creditNotes || []) {
        let itemsRaw: any = (note as any)?.items;

        if (typeof itemsRaw === 'string') {
            try {
                itemsRaw = JSON.parse(itemsRaw);
            } catch {
                itemsRaw = [];
            }
        }

        if (!Array.isArray(itemsRaw)) continue;

        for (const item of itemsRaw) {
            const code = String(item?.product?.cod || item?.product_code || '').trim();
            const qty = Number(item?.quantity || 0);
            if (!code || !Number.isFinite(qty) || qty <= 0) continue;
            returnedByCode.set(code, (returnedByCode.get(code) || 0) + qty);
        }
    }

    for (const [code, soldQty] of soldByCode.entries()) {
        const returnedQty = returnedByCode.get(code) || 0;
        if (returnedQty < soldQty) return false;
    }

    return true;
};

export const annulSaleSupabase = async (saleId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedSaleId = String(saleId || '').trim();
    if (!normalizedSaleId) throw new Error('ID de venta inválido para anulación.');

    const { data, error } = await supabase
        .from('st_sales')
        .update({ 
            status: 'annulled',
            updated_at: new Date().toISOString()
        })
        .eq('id', normalizedSaleId)
        .select('id, status')
        .maybeSingle();

    if (error) throw error;
    if (!data || String((data as any).status || '').trim() !== 'annulled') {
        throw new Error('No se pudo confirmar la anulación de la venta en st_sales.');
    }
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
        const mapped = mapAccountTransactionRow(item);
        balance += mapped.debit - mapped.credit;
        return {
            ...mapped,
            balance,
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
    return (data || []).map((item: any) => mapAccountTransactionRow(item));
};

const parseTransactionItems = (itemsRaw: unknown): CartItem[] | undefined => {
    let parsedItems = itemsRaw;

    if (typeof parsedItems === 'string') {
        try {
            parsedItems = JSON.parse(parsedItems);
        } catch {
            parsedItems = undefined;
        }
    }

    return Array.isArray(parsedItems) ? (parsedItems as CartItem[]) : undefined;
};

const parseTransactionFacturaInfo = (facturaInfoRaw: unknown): AccountTransaction['facturaInfo'] | undefined => {
    let parsedFacturaInfo = facturaInfoRaw;

    if (typeof parsedFacturaInfo === 'string') {
        try {
            parsedFacturaInfo = JSON.parse(parsedFacturaInfo);
        } catch {
            parsedFacturaInfo = undefined;
        }
    }

    if (!parsedFacturaInfo || typeof parsedFacturaInfo !== 'object') return undefined;

    const facturaInfo = parsedFacturaInfo as Record<string, any>;
    const nro = String(facturaInfo.nro || facturaInfo.invoiceNumber || '').trim();
    const pdfUrl = String(facturaInfo.pdfUrl || facturaInfo.url || '').trim() || undefined;
    const ticketUrl = String(facturaInfo.ticketUrl || '').trim() || undefined;
    const cae = String(facturaInfo.cae || '').trim();
    const fecha = String(facturaInfo.fecha || '').trim();
    const vtoCae = String(facturaInfo.vtoCae || '').trim();
    const qrData = String(facturaInfo.qrData || '').trim();

    if (!cae && !nro && !pdfUrl && !ticketUrl) return undefined;

    return {
        cae,
        fecha,
        nro,
        invoiceNumber: nro,
        vtoCae,
        qrData,
        url: pdfUrl,
        pdfUrl,
        ticketUrl,
    };
};

const extractQrPayloadType = (qrData: string): number | null => {
        const rawQrData = String(qrData || '').trim();
        if (!rawQrData) return null;

        const tryParseType = (value: unknown): number | null => {
            const numericValue = Number(value);
            return Number.isFinite(numericValue) ? numericValue : null;
        };

        const extractFromObject = (candidate: any): number | null => {
            if (!candidate || typeof candidate !== 'object') return null;
            return tryParseType(candidate.tipoCmp ?? candidate.cbteTipo ?? candidate.tipoComprobante ?? candidate.comprobante_tipo);
        };

        try {
            const parsedJson = JSON.parse(rawQrData);
            const fromJson = extractFromObject(parsedJson);
            if (fromJson !== null) return fromJson;
        } catch {
            // continue
        }

        try {
            const url = new URL(rawQrData);
            const pValue = url.searchParams.get('p');
            if (pValue) {
                const decodedBase64 = atob(decodeURIComponent(pValue));
                try {
                    const parsedPayload = JSON.parse(decodedBase64);
                    const fromPayload = extractFromObject(parsedPayload);
                    if (fromPayload !== null) return fromPayload;
                } catch {
                    const maybeNumeric = tryParseType(decodedBase64);
                    if (maybeNumeric !== null) return maybeNumeric;
                }
            }
        } catch {
            // continue
        }

        const matchTipoCmp = rawQrData.match(/(?:tipoCmp|cbteTipo|tipoComprobante|comprobante_tipo)\D*(\d{1,2})/i);
        if (matchTipoCmp) {
            return tryParseType(matchTipoCmp[1]);
        }

        return null;
};

export const isCreditNoteFiscalDocument = (facturaInfo: AccountTransaction['facturaInfo'] | null | undefined): boolean => {
        if (!facturaInfo) return false;

    const facturaInfoAny = facturaInfo as any;

        const explicitTypeCandidates = [
        facturaInfoAny.cbteTipo,
        facturaInfoAny.tipoComprobante,
        facturaInfoAny.comprobante_tipo,
        ];

        for (const candidate of explicitTypeCandidates) {
                const numericValue = Number(candidate);
                if ([3, 8, 13].includes(numericValue)) return true;
                if ([1, 6, 11].includes(numericValue)) return false;
        }

        const qrType = extractQrPayloadType(facturaInfo.qrData || '');
        if (qrType !== null) {
                if ([3, 8, 13].includes(qrType)) return true;
                if ([1, 6, 11].includes(qrType)) return false;
        }

        const hasCae = Boolean(String(facturaInfoAny.cae || '').trim());
        const hasNumber = Boolean(String(facturaInfoAny.nro || facturaInfoAny.invoiceNumber || '').trim());
        const hasPdf = Boolean(String(facturaInfoAny.pdfUrl || facturaInfoAny.url || '').trim());

        const comprobanteTipoText = String(facturaInfoAny.comprobante_tipo || facturaInfoAny.tipoComprobante || '').toUpperCase();
        const requestedTipoText = String(facturaInfoAny.requestedTipoEnviado || facturaInfoAny.requested_tipo || '').toUpperCase();
        const sentTipoText = String(facturaInfoAny.sentTipoEnviado || facturaInfoAny.sent_tipo || '').toUpperCase();
        const hasInvoiceNumberFromNcFlow = Boolean(String(facturaInfoAny.invoiceNumber || '').trim());

        const hasCreditNoteFlowHint =
            comprobanteTipoText.includes('NOTA DE CREDITO') ||
            requestedTipoText.includes('NOTA DE CREDITO') ||
            sentTipoText.includes('NOTA DE CREDITO') ||
            hasInvoiceNumberFromNcFlow;

        if (hasCae && hasNumber && hasPdf && hasCreditNoteFlowHint) {
            console.log('[NC_FISCAL_FALLBACK_ACCEPTED]', facturaInfo);
            return true;
        }

        return false;
};

const mapAccountTransactionRow = (item: any): AccountTransaction => ({
    id: String(item?.id || ''),
    date: new Date(item?.date || item?.created_at || Date.now()),
    type: item?.type,
    description: item?.description || '',
    customer_id: item?.customer_id ? String(item.customer_id) : undefined,
    debit: Number(item?.debit) || 0,
    credit: Number(item?.credit) || 0,
    balance: Number(item?.balance) || 0,
    originalSaleId: item?.original_sale_id ? String(item.original_sale_id) : undefined,
    items: parseTransactionItems(item?.items),
    shiftId: item?.shift_id ? String(item.shift_id) : undefined,
    facturaInfo: parseTransactionFacturaInfo(item?.factura_info),
});

export const getCreditNotesLinkedToSale = async (sale: Pick<Sale, 'id'>): Promise<AccountTransaction[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const saleId = String(sale?.id || '').trim();
    if (!saleId) throw new Error('ID de venta inválido.');

    const { data, error } = await supabase
        .from('st_account_transactions')
        .select('*')
        .eq('type', 'Nota de Crédito')
        .eq('original_sale_id', saleId)
        .order('date', { ascending: false });

    if (error) throw error;

    return (data || []).map((item: any) => mapAccountTransactionRow(item));
};

export const upsertCreditNoteFiscalInfoForSale = async (payload: {
    saleId: string;
    customerId?: string;
    shiftId?: string;
    total?: number;
    description?: string;
    items?: CartItem[];
    facturaInfo: any;
}): Promise<AccountTransaction> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const saleId = String(payload?.saleId || '').trim();
    if (!saleId) throw new Error('ID de venta inválido para NC pendiente.');
    if (!payload?.facturaInfo) throw new Error('factura_info fiscal inválido para NC pendiente.');

    const { data: existingRows, error: existingError } = await supabase
        .from('st_account_transactions')
        .select('*')
        .eq('type', 'Nota de Crédito')
        .eq('original_sale_id', saleId)
        .order('date', { ascending: false });

    if (existingError) throw existingError;

    const nowIso = new Date().toISOString();
    const normalizedFacturaInfo = payload.facturaInfo;

    if ((existingRows || []).length > 0) {
        const target = existingRows![0];
        const updatePayload = {
            factura_info: normalizedFacturaInfo,
            items: payload.items ? JSON.stringify(payload.items) : target.items,
        };
        console.log('[PENDING_NC_DB_PAYLOAD]', {
            saleId,
            transactionId: String(target.id),
            payload: updatePayload,
        });

        const { data: updated, error: updateError } = await supabase
            .from('st_account_transactions')
            .update(updatePayload)
            .eq('original_sale_id', saleId)
            .eq('type', 'Nota de Crédito')
            .select('*')
            .limit(1)
            .single();

        if (updateError) {
            console.error('[PENDING_NC_DB_ERROR]', updateError);
            throw new Error(updateError.message || JSON.stringify(updateError));
        }
        return mapAccountTransactionRow(updated);
    }

    const fallbackCustomerId = String(payload.customerId || '').trim();
    if (!fallbackCustomerId) {
        throw new Error('No existe movimiento contable de NC y no se recibió customerId para crearlo.');
    }

    const insertPayload = {
        customer_id: fallbackCustomerId,
        type: 'Nota de Crédito',
        description: payload.description || 'Nota de crédito',
        debit: 0,
        credit: Number(payload.total || 0),
        original_sale_id: saleId,
        shift_id: payload.shiftId || null,
        items: payload.items ? JSON.stringify(payload.items) : null,
        factura_info: normalizedFacturaInfo,
        date: nowIso,
        created_at: nowIso,
    };

    console.log('[PENDING_NC_DB_PAYLOAD]', {
        saleId,
        transactionId: null,
        payload: insertPayload,
    });

    const { data: inserted, error: insertError } = await supabase
        .from('st_account_transactions')
        .insert([insertPayload])
        .select('*')
        .single();

    if (insertError) {
        console.error('[PENDING_NC_DB_ERROR]', insertError);
        throw new Error(insertError.message || JSON.stringify(insertError));
    }
    return mapAccountTransactionRow(inserted);
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


    // --- Normalización defensiva de customer e items (solo propiedades reales) ---
    // Normalizar customer
    const safeCustomer = customer && typeof customer === 'object' ? customer : {};
    const safeCustomerId = (typeof safeCustomer.Id_Cliente === 'string' && safeCustomer.Id_Cliente !== '0' && !safeCustomer.Id_Cliente.startsWith('CLAD'))
        ? safeCustomer.Id_Cliente : null;
    const safeCustomerName = typeof safeCustomer['Nombre y Apellido'] === 'string' && safeCustomer['Nombre y Apellido'].trim() !== ''
        ? safeCustomer['Nombre y Apellido'] : 'Consumidor Final';
    const safeCustomerDocumento = typeof safeCustomer.Documento === 'string' ? safeCustomer.Documento : null;

    // Normalizar items (CartItem shape: { product: Product, quantity: number, price: number })
    const rawItems = Array.isArray(budget?.items) ? budget.items : [];
    const normalizedItems = rawItems.map((item) => {
        const product = item && typeof item === 'object' && item.product && typeof item.product === 'object' ? item.product : null;
        const productCode = product && typeof product.cod === 'string' ? product.cod : null;
        const productName = product && typeof product.Producto === 'string' ? product.Producto : '';
        const quantity = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0;
        const price = typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0;
        const subtotal = quantity * price;
        return {
            productCode,
            productName,
            quantity,
            price,
            subtotal,
            _original: item
        };
    });

    // Validaciones defensivas
    if (!safeCustomerId) {
        // ...existing code...
        throw new Error('Presupuesto sin cliente válido');
    }
    if (!normalizedItems.length) {
        // ...existing code...
        throw new Error('Presupuesto sin ítems válidos para convertir');
    }
    for (const item of normalizedItems) {
        if (!item.productCode || !item.productName || item.quantity <= 0) {
            // ...existing code...
            throw new Error('Ítem de presupuesto inválido: falta código, nombre o cantidad');
        }
    }

    // Log de diagnóstico de normalización
    // ...existing code...

    // ...existing code...
    // ...existing code...
    // payload eliminado: no se usaba
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data: currentBudget, error: currentBudgetError } = await supabase
        .from('st_budgets')
        .select('id, converted_to_sale_id, status')
        .eq('id', budget.id)
        .maybeSingle();

    if (currentBudgetError) {
        // ...existing code...
        throw currentBudgetError;
    }
    if (!currentBudget) {
        // ...existing code...
        throw new Error('No se encontró el presupuesto.');
    }
    if (currentBudget.converted_to_sale_id) {
        // ...existing code...
        throw new Error('Este presupuesto ya fue convertido a venta.');
    }

    const { data: lastSale, error: lastSaleError } = await supabase
        .from('st_sales')
        .select('sale_number')
        .order('sale_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastSaleError) {
        // ...existing code...
        throw lastSaleError;
    }

    const nextSaleNumber = Number(lastSale?.sale_number ?? 0) + 1;


    // Usar siempre safeCustomerId
    const customerId = safeCustomerId;

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
        customer_name_snapshot: safeCustomerName,
        customer_document_snapshot: safeCustomerDocumento,
        notes: buildSaleNotesWithEcheqs(adjustmentDescription, payment?.echeqs)
    };

    const { data: insertedSale, error: saleError } = await supabase
        .from('st_sales')
        .insert([saleInsert])
        .select()
        .single();

    if (saleError) {
        // ...existing code...
        throw saleError;
    }
    // ...existing code...


    const productCodes = normalizedItems.map(i => i.productCode).filter((c): c is string => !!c);

    let productMap = new Map<string, string>();

    if (productCodes.length > 0) {
        const { data: productRows, error: productError } = await supabase
            .from('st_products')
            .select('id, cod')
            .in('cod', productCodes);

        if (productError) {
            // ...existing code...
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw productError;
        }

        productMap = new Map((productRows || []).map((p: any) => [p.cod, p.id]));
        // ...existing code...
    }


    const itemsToInsert = normalizedItems.map(item => ({
        sale_id: insertedSale.id,
        product_id: item.productCode ? productMap.get(item.productCode) || null : null,
        product_code: item.productCode,
        product_name_snapshot: item.productName,
        quantity: item.quantity,
        unit_price: item.price,
        line_total: item.subtotal
    }));

    if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
            .from('st_sale_items')
            .insert(itemsToInsert);

        if (itemsError) {
            // ...existing code...
            await supabase.from('st_sales').delete().eq('id', insertedSale.id);
            throw itemsError;
        }
        // ...existing code...
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
            items: JSON.stringify(normalizedItems),
            factura_info: null,
            date: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };

        const { error: debitError } = await supabase
            .from('st_account_transactions')
            .insert([debitMovement]);

        if (debitError) {
            // ...existing code...
        } else {
            // ...existing code...
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
        // ...existing code...
        await supabase.from('st_sale_items').delete().eq('sale_id', insertedSale.id);
        await supabase.from('st_sales').delete().eq('id', insertedSale.id);
        throw budgetUpdateError;
    }

    // ...existing code...
    return insertedSale;
}

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
        .select('cod, income_count, current_stock, supplier_id, auto_price, cost_price, final_price')
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
            const priceOutcome = computeFinalPriceFromSupplier(
                dbProduct,
                Number(item.costPrice),
                1,
                'ARS',
                {
                    mode: 'markup',
                    markupPct,
                }
            );
            updateData.final_price = priceOutcome.finalPriceToPersist;
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

export const addUser = async (userData: any): Promise<User> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_user_profiles')
        .insert([{
            nombre: userData.Nombre,
            pin: userData.PIN,
            rol: userData.Rol,
            activo: userData.Activo === 'SI',
            updated_at: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) throw error;
    return mapUserRowToUser(data);
};

export const updateUser = async (userData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data, error } = await supabase
        .from('st_user_profiles')
        .update({
            nombre: userData.Nombre,
            pin: userData.PIN,
            rol: userData.Rol,
            activo: userData.Activo === 'SI',
            updated_at: new Date().toISOString(),
        })
        .eq('id', userData.ID_Usuario)
        .select()
        .single();

    if (error) throw error;
    return mapUserRowToUser(data);
};

export const addProduct = async (productData: any): Promise<any> => {
    return addProductSupabase(productData);
};

export const updateProduct = async (productData: any): Promise<any> => {
    return updateProductSupabase(productData);
};

export const deleteProduct = async (cod: string): Promise<any> => {
    return deleteProductSupabase(cod);
};

export const massUpdatePrices = async (data: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    let categoryId: string | null = null;
    let supplierId: string | null = null;

    if (data.filterBy === 'Categoria' && data.filterValue && data.filterValue !== 'All') {
        const { data: category, error } = await supabase
            .from('st_categories')
            .select('id')
            .ilike('name', String(data.filterValue).trim())
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        categoryId = category?.id || null;
        if (!categoryId) return { updated: 0 };
    }

    if (data.filterBy === 'Proveedor' && data.filterValue && data.filterValue !== 'All') {
        const { data: supplier, error } = await supabase
            .from('st_suppliers')
            .select('id')
            .ilike('nombre', String(data.filterValue).trim())
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        supplierId = supplier?.id || null;
        if (!supplierId) return { updated: 0 };
    }

    let query = supabase.from('st_products').select('id, cost_price, list_price').eq('is_deleted', false);
    if (categoryId) query = query.eq('category_id', categoryId);
    if (supplierId) query = query.eq('supplier_id', supplierId);

    const { data: productsToUpdate, error: productsError } = await query;
    if (productsError) throw productsError;

    const rows = Array.isArray(productsToUpdate) ? productsToUpdate : [];
    const fieldName = data.targetPrice === 'P.Costo' ? 'cost_price' : 'list_price';
    const updateValue = Number(data.updateValue || 0);

    await Promise.all(rows.map(async (row: any) => {
        const currentValue = Number(row?.[fieldName] ?? 0);
        const nextValue = data.updateType === 'percentage'
            ? Number((currentValue * (1 + updateValue / 100)).toFixed(2))
            : Number((currentValue + updateValue).toFixed(2));

        if (!supabase) throw new Error('Supabase no inicializado');
        const { error } = await supabase
            .from('st_products')
            .update({ [fieldName]: nextValue, updated_at: new Date().toISOString() })
            .eq('id', row.id);

        if (error) throw error;
    }));

    return { updated: rows.length };
};

export interface CategoryTreeNode {
    id: string;
    name: string;
    subcategories: Array<{ id: string; name: string }>;
}

export const getCategoryTreeSupabase = async (): Promise<CategoryTreeNode[]> => {
    if (!supabase) return [];

    const [categories, subcategories] = await Promise.all([
        getCategoriesSupabase(),
        (async () => {
            const { data, error } = await supabase
                .from('st_subcategories')
                .select('id, name, category_id');
            if (error) throw error;
            return Array.isArray(data) ? data : [];
        })(),
    ]);

    const nodes = (Array.isArray(categories) ? categories : [])
        .map((category: any) => ({
            id: String(category?.id || '').trim(),
            name: String(category?.name || '').trim(),
            subcategories: [] as Array<{ id: string; name: string }>,
        }))
        .filter((node: CategoryTreeNode) => node.id !== '' && node.name !== '');

    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    (Array.isArray(subcategories) ? subcategories : []).forEach((sub: any) => {
        const subId = String(sub?.id || '').trim();
        const subName = String(sub?.name || '').trim();
        const categoryId = String(sub?.category_id || '').trim();
        if (!subId || !subName || !categoryId) return;
        const parent = nodeById.get(categoryId);
        if (!parent) return;
        parent.subcategories.push({ id: subId, name: subName });
    });

    nodes.forEach((node) => {
        node.subcategories.sort((a, b) => a.name.localeCompare(b.name));
    });

    return nodes.sort((a, b) => a.name.localeCompare(b.name));
};

export const addCategory = async (name: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const categoryName = String(name || '').trim();
    if (!categoryName) throw new Error('El nombre de la categoría es obligatorio.');

    const { data: existing, error: existingError } = await supabase
        .from('st_categories')
        .select('id')
        .ilike('name', categoryName)
        .limit(1)
        .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.id) throw new Error(`La categoría '${categoryName}' ya existe.`);

    const { data, error } = await supabase
        .from('st_categories')
        .insert([{ name: categoryName }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const addSubCategoryByCategoryId = async (categoryId: string, name: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedCategoryId = String(categoryId || '').trim();
    const subCategoryName = String(name || '').trim();
    if (!normalizedCategoryId || !subCategoryName) {
        throw new Error('Categoría y subcategoría son obligatorias.');
    }

    const { data: categoryRow, error: categoryError } = await supabase
        .from('st_categories')
        .select('id')
        .eq('id', normalizedCategoryId)
        .limit(1)
        .maybeSingle();

    if (categoryError) throw categoryError;
    if (!categoryRow?.id) throw new Error('No se encontró la categoría seleccionada.');

    const { data: existingSub, error: existingError } = await supabase
        .from('st_subcategories')
        .select('id')
        .eq('category_id', normalizedCategoryId)
        .ilike('name', subCategoryName)
        .limit(1)
        .maybeSingle();

    if (existingError) throw existingError;
    if (existingSub?.id) {
        throw new Error(`La subcategoría '${subCategoryName}' ya existe en la categoría seleccionada.`);
    }

    const { data, error } = await supabase
        .from('st_subcategories')
        .insert([{ category_id: normalizedCategoryId, name: subCategoryName }])
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
};

export const renameCategory = async (oldName: string, newName: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const previousName = String(oldName || '').trim();
    const nextName = String(newName || '').trim();
    if (!previousName || !nextName) throw new Error('Nombre actual y nuevo nombre son obligatorios.');

    const { data: category, error: categoryError } = await supabase
        .from('st_categories')
        .select('id, name')
        .ilike('name', previousName)
        .limit(1)
        .maybeSingle();

    if (categoryError) throw categoryError;
    if (!category?.id) throw new Error(`No se encontró la categoría '${previousName}'.`);

    const { data: duplicate, error: duplicateError } = await supabase
        .from('st_categories')
        .select('id')
        .ilike('name', nextName)
        .neq('id', category.id)
        .limit(1)
        .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate?.id) throw new Error(`La categoría '${nextName}' ya existe.`);

    const { data, error } = await supabase
        .from('st_categories')
        .update({ name: nextName, updated_at: new Date().toISOString() })
        .eq('id', category.id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const renameSubCategoryById = async (subcategoryId: string, newName: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedSubcategoryId = String(subcategoryId || '').trim();
    const nextName = String(newName || '').trim();

    if (!normalizedSubcategoryId || !nextName) {
        throw new Error('Subcategoría y nombre nuevo son obligatorios.');
    }

    const { data: currentSub, error: currentError } = await supabase
        .from('st_subcategories')
        .select('id, name, category_id')
        .eq('id', normalizedSubcategoryId)
        .limit(1)
        .maybeSingle();

    if (currentError) throw currentError;
    if (!currentSub?.id) throw new Error('No se encontró la subcategoría seleccionada.');

    const currentName = String(currentSub.name || '').trim();
    if (currentName.toLowerCase() === nextName.toLowerCase()) return currentSub;

    const { data: duplicatedSub, error: duplicateError } = await supabase
        .from('st_subcategories')
        .select('id')
        .eq('category_id', currentSub.category_id)
        .ilike('name', nextName)
        .neq('id', currentSub.id)
        .limit(1)
        .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicatedSub?.id) {
        throw new Error(`La subcategoría '${nextName}' ya existe en esta categoría.`);
    }

    const { data, error } = await supabase
        .from('st_subcategories')
        .update({ name: nextName })
        .eq('id', currentSub.id)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
};

export const deleteCategory = async (name: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const categoryName = String(name || '').trim();
    if (!categoryName) throw new Error('El nombre de la categoría es obligatorio.');

    const { data: category, error: categoryError } = await supabase
        .from('st_categories')
        .select('id, name')
        .ilike('name', categoryName)
        .limit(1)
        .maybeSingle();

    if (categoryError) throw categoryError;
    if (!category?.id) throw new Error(`No se encontró la categoría '${categoryName}'.`);

    const { error: productsError } = await supabase
        .from('st_products')
        .update({ category_id: null, sub_category: null, updated_at: new Date().toISOString() })
        .eq('category_id', category.id);

    if (productsError) throw productsError;

    const { error: subcategoriesError } = await supabase
        .from('st_subcategories')
        .delete()
        .eq('category_id', category.id);

    if (subcategoriesError) throw subcategoriesError;

    const { data, error } = await supabase
        .from('st_categories')
        .delete()
        .eq('id', category.id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const deleteSubCategoryById = async (subcategoryId: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedSubcategoryId = String(subcategoryId || '').trim();
    if (!normalizedSubcategoryId) {
        throw new Error('La subcategoría es obligatoria.');
    }

    const { data: currentSub, error: currentError } = await supabase
        .from('st_subcategories')
        .select('id, name')
        .eq('id', normalizedSubcategoryId)
        .limit(1)
        .maybeSingle();

    if (currentError) throw currentError;
    if (!currentSub?.id) {
        throw new Error('No se encontró la subcategoría seleccionada.');
    }

    const subName = String(currentSub.name || '').trim();

    const { error: productsError } = await supabase
        .from('st_products')
        .update({ sub_category: null, updated_at: new Date().toISOString() })
        .ilike('sub_category', subName);

    if (productsError) throw productsError;

    const { data, error } = await supabase
        .from('st_subcategories')
        .delete()
        .eq('id', normalizedSubcategoryId)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
};

export const getSuppliers = async (): Promise<Supplier[]> => {
    const data = await getSuppliersSupabase();
    return data
        .map((item: any) => ({
            ID_Proveedor: String(item.id || item.ID_Proveedor || ''),
            Nombre: item.nombre || item.name || item.Nombre || '',
            tax_1_percent: parsePercentValue(item.tax_1_percent),
            tax_2_percent: parsePercentValue(item.tax_2_percent),
            tax_3_percent: parsePercentValue(item.tax_3_percent),
            tax_4_percent: parsePercentValue(item.tax_4_percent),
            CUIT: item.cuit || item.CUIT || '',
            Condicion_IVA: item.condicion_iva || item.iva_condition || item.Condicion_IVA || 'Responsable Inscripto',
            Email: item.email || item.Email || '',
            Telefono: item.telefono || item.phone || item.Telefono || '',
            Contacto: item.contacto || item.contact_person || item.Contacto || '',
            Direccion: item.direccion || item.address || item.Direccion || '',
            Activo: item.activo !== undefined ? (item.activo ? 'SI' : 'NO') : (item.is_active !== undefined ? (item.is_active ? 'SI' : 'NO') : (item.Activo || 'SI')),
            Fecha_Creacion: item.created_at || item.Fecha_Creacion || ''
        } as Supplier));
};

export const addSupplier = async (data: any): Promise<Supplier> => {
    const item = await addSupplierSupabase(data);
    return {
        ID_Proveedor: String(item.id),
        Nombre: item.nombre || '',
        tax_1_percent: parsePercentValue(item.tax_1_percent),
        tax_2_percent: parsePercentValue(item.tax_2_percent),
        tax_3_percent: parsePercentValue(item.tax_3_percent),
        tax_4_percent: parsePercentValue(item.tax_4_percent),
        CUIT: item.cuit,
        Condicion_IVA: item.condicion_iva,
        Email: item.email,
        Telefono: item.telefono,
        Contacto: item.contacto,
        Direccion: item.direccion,
        Activo: item.activo ? 'SI' : 'NO',
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
    const allProducts = await getProductsSupabase();
    const searchTerm = String(params.searchTerm || '').trim().toLowerCase();
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));

    const filtered = allProducts.filter((product: any) => {
        const matchesCategory = !params.filters?.categoria || params.filters.categoria === 'All' || product.Categoria === params.filters.categoria;
        const matchesProvider = !params.filters?.proveedor || params.filters.proveedor === 'All' || product.Proveedor === params.filters.proveedor;
        const matchesActive = !params.filters?.activo || params.filters.activo === 'All' || (params.filters.activo === 'Active' ? !!product.Activo : !product.Activo);
        const matchesOnline = !params.filters?.online || params.filters.online === 'All' || (params.filters.online === 'Yes' ? !!product.Online : !product.Online);
        const matchesSearch = !searchTerm || [product.Producto, product.cod, product.Descripcion, product['cod.barras']]
            .some((value) => String(value || '').toLowerCase().includes(searchTerm));

        return matchesCategory && matchesProvider && matchesActive && matchesOnline && matchesSearch;
    });

    const start = (page - 1) * pageSize;
    return {
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
    };
};

export const markSaleAsBilled = async (saleId: string, cae: string, nro: string, vtoCae: string, qrData: string, date: Date, url: string, ticketUrl?: string, facturacion?: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    await persistInvoiceForSale(saleId, {
        cae,
        nro,
        vtoCae,
        qrData,
        fecha: date.toISOString(),
        url,
        ticketUrl,
    }, facturacion);
};

const extractRegeneratedBillingUrlsFromPayload = (
    payload: any,
    saleId: string
): { pdf_url: string | null; ticket_url: string | null } => {
    const targetSaleId = String(saleId || '').trim();
    const candidateCollections = [
        payload,
        payload?.data,
        payload?.result,
        payload?.item,
        payload?.row,
        Array.isArray(payload?.results) ? payload.results : null,
        Array.isArray(payload?.items) ? payload.items : null,
        Array.isArray(payload?.rows) ? payload.rows : null,
        Array.isArray(payload?.data) ? payload.data : null,
    ].filter(Boolean);

    const flatCandidates = candidateCollections.flatMap((candidate: any) =>
        Array.isArray(candidate) ? candidate : [candidate]
    );

    const matchingCandidate = flatCandidates.find((candidate: any) => {
        const candidateSaleId = String(candidate?.sale_id || candidate?.saleId || candidate?.id || '').trim();
        if (!targetSaleId || !candidateSaleId) return false;
        return candidateSaleId === targetSaleId;
    }) || flatCandidates[0];

    if (!matchingCandidate) {
        return { pdf_url: null, ticket_url: null };
    }

    return {
        pdf_url:
            String(
                matchingCandidate?.pdf_url ||
                matchingCandidate?.billing_pdf_url ||
                matchingCandidate?.comprobante_pdf_url ||
                matchingCandidate?.url ||
                ''
            ).trim() || null,
        ticket_url:
            String(
                matchingCandidate?.ticket_url ||
                matchingCandidate?.billing_ticket_url ||
                matchingCandidate?.comprobante_ticket_url ||
                matchingCandidate?.ticketUrl ||
                ''
            ).trim() || null,
    };
};

export const regenerateBillingUrlsForSale = async (
    saleId: string
): Promise<{ pdf_url: string | null; ticket_url: string | null }> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const normalizedSaleId = String(saleId || '').trim();
    if (!normalizedSaleId) throw new Error('ID de venta inválido.');

    const { data, error } = await supabase.functions.invoke('regenerate-billing-urls-tolosa', {
        body: {
            dryRun: false,
            force: true,
            limit: 1,
            saleIds: [normalizedSaleId],
        },
    });

    if (error) {
        throw new Error(`No se pudo regenerar los links fiscales: ${error.message}`);
    }

    const payloadErrorMessage =
        (typeof data?.error === 'string' && data.error.trim()) ||
        (typeof data?.detail === 'string' && data.detail.trim()) ||
        (data?.success === false && typeof data?.message === 'string' ? data.message.trim() : '') ||
        '';

    if (payloadErrorMessage) {
        throw new Error(payloadErrorMessage);
    }

    const urlsFromPayload = extractRegeneratedBillingUrlsFromPayload(data, normalizedSaleId);

    const { data: persistedSale, error: persistedSaleError } = await supabase
        .from('st_sales')
        .select('billing_pdf_url, billing_ticket_url')
        .eq('id', normalizedSaleId)
        .maybeSingle();

    if (persistedSaleError) throw persistedSaleError;

    const pdf_url =
        String((persistedSale as any)?.billing_pdf_url || '').trim() ||
        urlsFromPayload.pdf_url ||
        null;
    const ticket_url =
        String((persistedSale as any)?.billing_ticket_url || '').trim() ||
        urlsFromPayload.ticket_url ||
        null;

    if (!pdf_url && !ticket_url) {
        throw new Error('La regeneración no devolvió URLs fiscales válidas para la venta.');
    }

    return { pdf_url, ticket_url };
};

const extractInvoiceNumberParts = (nro: string): { puntoVenta: string; numero: string } => {
    const raw = String(nro || '').trim();
    const splitMatch = raw.match(/^(\d{1,5})\s*[-/]\s*(\d{1,12})$/);
    if (splitMatch) {
        return {
            puntoVenta: splitMatch[1],
            numero: splitMatch[2],
        };
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits || digits.length <= 8) {
        throw new Error('Número fiscal inválido para regeneración histórica.');
    }

    return {
        puntoVenta: digits.slice(0, digits.length - 8),
        numero: digits.slice(-8),
    };
};

export const regenerateHistoricalInvoiceLinksSupabase = async (
    sale: Sale
): Promise<{ billing_pdf_url: string | null; billing_ticket_url: string | null }> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const saleId = String(sale?.id || '').trim();
    if (!saleId) throw new Error('ID de venta inválido.');

    const invoiceType = String(sale?.facturacion || '').trim().toUpperCase();
    const cae = String(sale?.facturaInfo?.cae || '').trim();
    const nro = String(sale?.facturaInfo?.nro || '').trim();

    if (!cae || !nro) {
        throw new Error('La venta no tiene CAE y número fiscal válidos para regeneración histórica.');
    }

    const { puntoVenta, numero } = extractInvoiceNumberParts(nro);

    const { data: currentSale, error: currentSaleError } = await supabase
        .from('st_sales')
        .select('billing_pdf_url, billing_ticket_url')
        .eq('id', saleId)
        .maybeSingle();

    if (currentSaleError) throw currentSaleError;

    const invokeBody = {
        saleId,
        tipo: invoiceType,
        operacion: 'V',
        punto_venta: puntoVenta,
        numero,
        cae,
    };

    const { data, error } = await supabase.functions.invoke('regenerate-historical-invoice-links-tolosa', {
        body: invokeBody,
    });

    if (error) {
        throw new Error(`No se pudo regenerar comprobante histórico: ${error.message}`);
    }

    const regeneratedPdfUrl =
        String((data as any)?.pdf_url || '').trim() ||
        String((data as any)?.comprobante_pdf_url || '').trim() ||
        String((data as any)?.url || '').trim() ||
        null;

    const regeneratedTicketUrl =
        String((data as any)?.ticket_url || '').trim() ||
        String((data as any)?.comprobante_ticket_url || '').trim() ||
        String((data as any)?.ticketUrl || '').trim() ||
        null;

    const nextPdfUrl = regeneratedPdfUrl || String((currentSale as any)?.billing_pdf_url || '').trim() || null;
    const nextTicketUrl = regeneratedTicketUrl || String((currentSale as any)?.billing_ticket_url || '').trim() || null;

    if (!nextPdfUrl && !nextTicketUrl) {
        throw new Error('La regeneración histórica no devolvió links de comprobante.');
    }

    const { error: updateError } = await supabase
        .from('st_sales')
        .update({
            billing_pdf_url: nextPdfUrl,
            billing_ticket_url: nextTicketUrl,
            updated_at: new Date().toISOString(),
        })
        .eq('id', saleId);

    if (updateError) throw updateError;

    const { data: persistedSale, error: persistedError } = await supabase
        .from('st_sales')
        .select('billing_pdf_url, billing_ticket_url')
        .eq('id', saleId)
        .maybeSingle();

    if (persistedError) throw persistedError;

    return {
        billing_pdf_url: String((persistedSale as any)?.billing_pdf_url || '').trim() || null,
        billing_ticket_url: String((persistedSale as any)?.billing_ticket_url || '').trim() || null,
    };
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

// ─── PROMPT 010: Flujo "Actualización" con tabla temporal ───────────────────

/** Crea un session_id único para la sesión de importación temporal */
export const createPriceImportSession = (): string => {
    const uuid = typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });

    // eslint-disable-next-line no-console
    console.log('[TEMP_IMPORT_SESSION_ID]', uuid);
    return uuid;
};

/**
 * Sube las filas normalizadas del archivo a la tabla temporal `st_supplier_price_import_temp`.
 * Retorna resumen con cantidad de filas subidas.
 */
export const uploadRowsToTempTable = async (
    rows: Omit<SupplierPriceImportTempRow, 'id' | 'created_at'>[],
): Promise<SupplierPriceImportSessionResult> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!rows.length) throw new Error('No hay filas para subir');

    const first = rows[0];
    const supplierId = first?.supplier_id || '';
    const sessionId = first?.import_session_id || '';
    const currency = first?.file_currency || '';
    const exchangeRate = first?.exchange_rate ?? null;

    // eslint-disable-next-line no-console
    console.log('[TEMP_IMPORT_PAYLOAD]', rows.slice(0, 5));
    // eslint-disable-next-line no-console
    console.log('[TEMP_IMPORT_META]', {
        supplierId,
        sessionId,
        currency,
        exchangeRate,
    });

    const { error } = await supabase
        .from('st_supplier_price_import_temp')
        .insert(rows);

    if (error) throw error;

    return {
        sessionId: first.import_session_id,
        supplierId: first.supplier_id,
        supplierName: first.supplier_name_snapshot,
        sourceFilename: first.source_filename,
        rowsUploaded: rows.length,
        fileCurrency: first.file_currency,
        exchangeRate: first.exchange_rate,
    };
};

/**
 * Obtiene estadísticas de match desde Supabase comparando filas de la sesión temporal
 * con la tabla `st_products` del proveedor.
 * Requiere la función RPC `get_temp_import_match_summary` en Supabase.
 */
export const getMatchSummaryFromTemp = async (
    sessionId: string,
    supplierId: string,
): Promise<SupplierPriceImportMatchSummary> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    void supplierId;

    const { data, error } = await supabase
        .rpc('get_temp_import_match_summary', { p_import_session_id: sessionId });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    return {
        sessionId,
        totalRows: Number(result?.total_rows ?? 0),
        matchedByCod: Number(result?.matched_by_cod ?? 0),
        matchedByBarcode: Number(result?.matched_by_barcode ?? 0),
        notMatched: Number(result?.not_matched ?? 0),
    };
};

/**
 * Ejecuta la actualización de precios desde la tabla temporal.
 * Requiere la función RPC `execute_temp_import_price_update` en Supabase.
 * Solo actualiza productos existentes — NO crea nuevos.
 */
export const executeUpdateFromTempTable = async (
    sessionId: string,
    supplierId: string,
): Promise<SupplierPriceUpdateResult> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    void supplierId;

    const { data, error } = await supabase
        .rpc('execute_temp_import_price_update', { p_import_session_id: sessionId });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    return {
        sessionId,
        updatedCount: Number(result?.updated_count ?? 0),
        skippedCount: Number(result?.skipped_count ?? 0),
        notFoundCount: Number(result?.not_found_count ?? 0),
    };
};

/**
 * Elimina todas las filas de la sesión de la tabla temporal.
 * Llamar siempre al terminar el flujo (éxito o cancelación).
 */
export const cleanupTempImportSession = async (sessionId: string): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    if (!sessionId) return;

    const { error } = await supabase
        .from('st_supplier_price_import_temp')
        .delete()
        .eq('import_session_id', sessionId);

    if (error) throw error;
};

/**
 * Devuelve los productos del proveedor que NO aparecen en el Excel subido a la sesión temporal.
 * Compara por cod y barcode contra excel_code de la sesión.
 */
export const getSupplierProductsMissingInTempImport = async (
    sessionId: string,
    supplierId: string,
): Promise<SupplierMissingProduct[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { data: tempRows, error: tempErr } = await supabase
        .from('st_supplier_price_import_temp')
        .select('excel_code')
        .eq('import_session_id', sessionId);
    if (tempErr) throw tempErr;

    const excelCodes = new Set<string>(
        (tempRows || []).map((r: any) => String(r.excel_code || '').trim().toLowerCase()).filter(Boolean)
    );

    const { data: products, error: prodErr } = await supabase
        .from('st_products')
        .select('id, cod, barcode, name, final_price')
        .eq('supplier_id', supplierId)
        .eq('deleted', false);
    if (prodErr) throw prodErr;

    return (products || [])
        .filter((p: any) => {
            const cod = String(p.cod || '').trim().toLowerCase();
            const bar = String(p.barcode || '').trim().toLowerCase();
            return !(cod && excelCodes.has(cod)) && !(bar && excelCodes.has(bar));
        })
        .map((p: any) => ({
            id: String(p.id || ''),
            cod: String(p.cod || '').trim(),
            barcode: String(p.barcode || '').trim(),
            description: String(p.name || '').trim(),
            price: Number.isFinite(Number(p.final_price)) ? Number(p.final_price) : null,
        }));
};

/**
 * Cuenta los productos activos del proveedor en base.
 * Usar al seleccionar proveedor en el flujo "Actualización", antes de subir el archivo.
 */
export const getSupplierProductCount = async (supplierId: string): Promise<number> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const { count, error } = await supabase
        .from('st_products')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplierId)
        .eq('deleted', false);
    if (error) throw error;
    return count ?? 0;
};

/**
 * Resumen proveedor-vs-Excel para el flujo "Actualización".
 * Perspectiva del proveedor (no del archivo):
 *  - totalSupplier  : total de productos activos del proveedor
 *  - matchedByCod   : productos cuyo cod aparece en el Excel
 *  - matchedByBarcode: productos que NO matchearon por cod pero cuyo barcode aparece en el Excel
 *  - missingFromExcel: productos que no matchearon por ninguna vía
 * También retorna el detalle de los productos faltantes.
 */
export const getSupplierVsExcelSummary = async (
    sessionId: string,
    supplierId: string,
): Promise<{ summary: SupplierVsExcelSummary; missingProducts: SupplierMissingProduct[] }> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const [{ data: tempRows, error: tempErr }, { data: products, error: prodErr }] = await Promise.all([
        supabase.from('st_supplier_price_import_temp').select('excel_code').eq('import_session_id', sessionId),
        supabase.from('st_products').select('id, cod, barcode, name, final_price').eq('supplier_id', supplierId).eq('deleted', false),
    ]);
    if (tempErr) throw tempErr;
    if (prodErr) throw prodErr;

    const excelCodes = new Set<string>(
        (tempRows || []).map((r: any) => String(r.excel_code || '').trim().toLowerCase()).filter(Boolean)
    );

    let matchedByCod = 0;
    let matchedByBarcode = 0;
    const missingProducts: SupplierMissingProduct[] = [];

    for (const p of (products || [])) {
        const cod = String(p.cod || '').trim().toLowerCase();
        const bar = String(p.barcode || '').trim().toLowerCase();
        if (cod && excelCodes.has(cod)) {
            matchedByCod++;
        } else if (bar && excelCodes.has(bar)) {
            matchedByBarcode++;
        } else {
            missingProducts.push({
                id: String(p.id || ''),
                cod: String(p.cod || '').trim(),
                barcode: String(p.barcode || '').trim(),
                description: String(p.name || '').trim(),
                price: Number.isFinite(Number(p.final_price)) ? Number(p.final_price) : null,
            });
        }
    }

    return {
        summary: {
            totalSupplier: (products || []).length,
            matchedByCod,
            matchedByBarcode,
            missingFromExcel: missingProducts.length,
        },
        missingProducts,
    };
};
