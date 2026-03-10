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
    Supplier,
    User
} from '../types';
import { offlineService } from './offlineService';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// --- SUPABASE SERVICES ---
// =============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

    // 2. Cargar TODOS los productos mediante paginación automática
    const PAGE_SIZE = 1000;
    let from = 0;
    let allProducts: any[] = [];

    while (true) {
        const { data, error } = await supabase
            .from('st_products')
            .select('*')
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

    return rows
        .filter((item: any) => item.is_deleted !== true)
        .map((item: any) => ({
            cod: item.cod ?? '',
            Producto: item.name ?? '',
            Categoria: categoryMap.get(item.category_id) || '',
            'Sub Categoria': item.sub_category ?? '',
            Descripcion: item.description ?? '',
            'cod.barras': item.barcode ?? '',
            Proveedor: item.supplier_id ? String(item.supplier_id) : '',
            'P.Costo': Number(item.cost_price ?? 0),
            Precio: Number(item.list_price ?? 0),
            'Precio de Oferta': Number(item.offer_price ?? 0),
            'Stock-Inicial': Number(item.initial_stock ?? 0),
            Vendidos: Number(item.sold_count ?? 0),
            Ingresos: Number(item.income_count ?? 0),
            stockk: Number(item.current_stock ?? 0),
            'Precio Final': Number(item.final_price ?? 0),
            Minimo: Number(item.min_stock ?? 0),
            'Venta.PV': Number(item.pv_sale ?? 0),
            Online: Boolean(item.is_online ?? false),
            Activo: Boolean(item.is_active ?? true),
            FOTOGRAFIA: item.photo_url ?? item.image_url ?? '',
            Imagen: item.image_url ?? item.photo_url ?? '',
            Eliminado: Boolean(item.is_deleted ?? false),
            Marca: item.brand ?? '',
            Modelo_Compatible: item.compatible_model ?? '',
            Tipo_Tecnico: item.technical_type ?? '',
            Garantia_Meses: Number(item.warranty_months ?? 0),
            Notas_Internas: item.internal_notes ?? '',
            'Ultima.Actualizacion': item.legacy_last_update ?? ''
        } as any));
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

export const addSupplierSupabase = async (supplierData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const mapping = {
        name: supplierData.Nombre,
        cuit: supplierData.CUIT,
        iva_condition: supplierData.Condicion_IVA,
        email: supplierData.Email,
        phone: supplierData.Telefono,
        contact_person: supplierData.Contacto,
        address: supplierData.Direccion,
        is_active: supplierData.Activo === 'SI',
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
    if (supplierData.Nombre !== undefined) mapping.name = supplierData.Nombre;
    if (supplierData.CUIT !== undefined) mapping.cuit = supplierData.CUIT;
    if (supplierData.Condicion_IVA !== undefined) mapping.iva_condition = supplierData.Condicion_IVA;
    if (supplierData.Email !== undefined) mapping.email = supplierData.Email;
    if (supplierData.Telefono !== undefined) mapping.phone = supplierData.Telefono;
    if (supplierData.Contacto !== undefined) mapping.contact_person = supplierData.Contacto;
    if (supplierData.Direccion !== undefined) mapping.address = supplierData.Direccion;
    if (supplierData.Activo !== undefined) mapping.is_active = supplierData.Activo === 'SI';
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
    if (docType.includes('CUIT')) normalized['Tipo.Documento'] = 'CUIT';
    else if (docType.includes('DNI')) normalized['Tipo.Documento'] = 'DNI';
    else normalized['Tipo.Documento'] = 'DNI';

    const doc = String(customer.Documento || '').replace(/\D/g, '');
    if (normalized['Tipo.Documento'] === 'CUIT' && doc.length !== 11) {
        normalized.Condicion_IVA = 'CF';
        normalized['Tipo.Documento'] = 'DNI';
        normalized.Documento = '';
    } else if (normalized['Tipo.Documento'] === 'DNI' && (!doc || parseInt(doc) <= 0)) {
        normalized.Documento = '';
    } else {
        normalized.Documento = doc;
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
            return { status: 'facturación pendiente', reason: 'SUPABASE_NOT_INITIALIZED' };
        }

        const normalizedCustomer = normalizeCustomerForTusFacturas(sale.customer);
        const comprobante_tipo = determineInvoiceType(sale);
        const cbteTipo = getCbteTipo(sale);

        const saleForInvoice = { 
            ...sale, 
            customer: normalizedCustomer,
            cbteTipo: cbteTipo,
            comprobante_tipo: comprobante_tipo,
            requested_tipo: sale.facturacion,
            sent_tipo: comprobante_tipo
        };

        console.log('[invoice_request_debug]', {
            selectedInvoiceType: sale.facturacion,
            determinedType: comprobante_tipo,
            cbteTipo: cbteTipo,
            customerIVA: normalizedCustomer?.Condicion_IVA,
            tipoDoc: normalizedCustomer?.['Tipo.Documento'],
            nroDoc: normalizedCustomer?.Documento ? `***${normalizedCustomer.Documento.slice(-3)}` : 'N/A'
        });

        const { data, error } = await supabase.functions.invoke('create-electronic-invoice', { body: { sale: saleForInvoice } });

        console.log('[invoice_provider_response]', {
            cbteTipo_final: data?.cbteTipo,
            cae: data?.cae,
            nro: data?.nro,
            error: error
        });

        if (error) {
            console.error('Error al invocar Edge Function create-electronic-invoice:', { status: error.status, message: error.message, body: (error as any).body });
            return { status: 'facturación pendiente', reason: 'INVOKE_ERROR', message: error.message };
        }

        const cbteTipoFinal = data?.cbteTipo;
        const effectiveType = cbteTipoFinal === 1 ? 'A' : (cbteTipoFinal === 6 ? 'B' : sale.facturacion);

        if (effectiveType !== sale.facturacion && sale.facturacion !== 'N') {
            console.error(`[BUG_DETECTED] Mismatch de tipo de factura. Solicitado: ${sale.facturacion}, Emitido: ${effectiveType}`);
        }

        if (!data?.nro || !data?.cae) {
            console.error('INVALID_INVOICE_RESPONSE: La respuesta de la Edge Function no contiene los campos Nro y CAE esperados para la factura.', data);
            return { status: 'facturación pendiente', reason: 'INVALID_RESPONSE', message: 'Respuesta de facturación inválida: faltan Nro o CAE.', data };
        }

        return { status: 'facturado', data: { ...data, effectiveType } }; 
    } catch (e: any) {
        console.error('Fallo la facturación electrónica para la venta', sale.id, e.message || e);
        return { status: 'facturación pendiente', reason: 'UNEXPECTED_ERROR', message: e.message || 'Error inesperado durante la facturación.' };
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

        console.log('[credit_note_request_debug]', {
            selectedInvoiceType: sale.facturacion,
            determinedType: comprobante_tipo,
            cbteTipo: cbteTipo,
            customerIVA: normalizedCustomer?.Condicion_IVA,
            tipoDoc: normalizedCustomer?.['Tipo.Documento'],
            nroDoc: normalizedCustomer?.Documento ? `***${normalizedCustomer.Documento.slice(-3)}` : 'N/A'
        });

        const { data, error } = await supabase.functions.invoke('create-electronic-invoice', { body: { sale: saleForInvoice } });

        if (error) {
            console.error('Error al invocar Edge Function create-electronic-invoice (Nota de Crédito):', { status: error.status, message: error.message, body: (error as any).body });
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
        Efectivo: Number(item.payment_cash || 0),
        Digital: Number(item.payment_digital || 0),
        shiftId: item.shift_id
    } as Expense));
};

export const addExpenseSupabase = async (expenseData: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; shiftId: string; }): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const { data, error } = await supabase
        .from('st_expenses')
        .insert([{
            shift_id: expenseData.shiftId,
            spent_at: new Date(),
            amount: expenseData.monto,
            detail: expenseData.detalle,
            payment_cash: expenseData.paymentType === 'Efectivo' ? expenseData.monto : 0,
            payment_digital: expenseData.paymentType === 'Digital' ? expenseData.monto : 0,
            legacy_expense_id: null
        }])
        .select();
    
    if (error) throw error;
    return data[0];
};

export const updateExpenseSupabase = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital' }): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const { data, error } = await supabase
        .from('st_expenses')
        .update({
            amount: expenseData.monto,
            detail: expenseData.detalle,
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

    const { data: lastSale } = await supabase
        .from('st_sales')
        .select('sale_number')
        .order('sale_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextSaleNumber = Number(lastSale?.sale_number ?? 0) + 1;
    const customerId = budget.customer?.Id_Cliente && budget.customer.Id_Cliente !== '0' ? budget.customer.Id_Cliente : null;

    const { data: insertedSale, error: saleError } = await supabase
        .from('st_sales')
        .insert([{
            sale_number: nextSaleNumber,
            sold_at: budget.date instanceof Date ? budget.date.toISOString() : new Date().toISOString(),
            customer_id: customerId,
            subtotal: budget.total,
            total: budget.total,
            status: 'pending',
            customer_name_snapshot: budget.customer?.['Nombre y Apellido'] || 'Consumidor Final',
            customer_document_snapshot: budget.customer?.Documento || null,
        }])
        .select()
        .single();

    if (saleError) throw saleError;

    const productCodes = budget.items.map(i => i.product?.cod).filter(Boolean);
    let productMap = new Map<string, string>();
    if (productCodes.length > 0) {
        const { data: productRows } = await supabase.from('st_products').select('id, cod').in('cod', productCodes);
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
        await supabase.from('st_sale_items').insert(itemsToInsert);
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
    const sales = await getSalesSupabase(['pending', 'approved']);
    return sales.map(s => ({
        id: s.id,
        date: s.date,
        customer: s.customer!,
        items: s.items,
        total: s.total,
        status: s.status === 'approved' ? 'approved' : 'pending'
    } as Budget));
};

// =============================================================================
// --- LEGACY SERVICES (PENDING MIGRATION) ---
// =============================================================================

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

    return (data || []).map((item: any) => {
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
            Facturacion: item.invoice_type || 'N',
            Factura_CAE: item.legacy_cae || '',
            Factura_Nro: item.legacy_invoice_number || '',
            Factura_Fecha: item.sold_at,
            Factura_Vto_CAE: '',
            Factura_QR_Data: '',
            Factura_URL: undefined,
            Factura_Ticket_URL: undefined
        };
    });
};

export const getExpenses = async (): Promise<Expense[]> => {
    return getExpensesSupabase();
};

export const addExpense = async (data: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; shiftId: string; }): Promise<void> => {
    await addExpenseSupabase(data);
};

export const updateExpense = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital' }): Promise<void> => {
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

    const saleInsert = {
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
        return {
            id: item.id,
            date: item.date ? new Date(item.date) : new Date(0),
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
): Promise<void> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const customerId = customer?.Id_Cliente && customer.Id_Cliente !== '0' && !String(customer.Id_Cliente).startsWith('CLAD')
        ? customer.Id_Cliente
        : null;

    const updateData: any = {
        status: 'active',
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
        billing_type: facturacion || 'N',
        customer_name_snapshot: customer?.['Nombre y Apellido'] || 'Consumidor Final',
        customer_document_snapshot: customer?.Documento || null,
        notes: adjustmentDescription || null,
        updated_at: new Date().toISOString()
    };

    const { error: saleError } = await supabase
        .from('st_sales')
        .update(updateData)
        .eq('id', budget.id);

    if (saleError) throw saleError;

    // Update items to ensure they match the budget being converted
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
        const { error: itemsError } = await supabase.from('st_sale_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
    }
};

export const convertBudgetToSale = async (budget: Budget, payment: any, shiftId: string, facturacion: string, customer: any, total: number, adjustmentAmount: number, adjustmentDescription: string): Promise<void> => {
    return convertBudgetToSaleSupabase(budget, payment, shiftId, facturacion, customer, total, adjustmentAmount, adjustmentDescription);
};

export const recordStockEntrySupabase = async (items: StockEntryItem[], _userId: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');

    const productCodes = items.map(i => i.product.cod);
    const { data: products, error: fetchError } = await supabase
        .from('st_products')
        .select('*')
        .in('cod', productCodes);

    if (fetchError) throw fetchError;

    const productMap = new Map((products || []).map((p: any) => [p.cod, p]));
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
    const res = await postToScript('getCategoriesData', {}, { allowQueue: false });
    return res?.data || [];
};

export const addCategory = async (name: string): Promise<any> => {
    return postToScript('addCategory', { name });
};

export const addSubCategory = async (category: string, name: string): Promise<any> => {
    return postToScript('addSubCategory', { category, name });
};

export const renameCategory = async (oldName: string, newName: string): Promise<any> => {
    return postToScript('renameCategory', { oldName, newName });
};

export const renameSubCategory = async (category: string, oldName: string, newName: string): Promise<any> => {
    return postToScript('renameSubCategory', { category, oldName, newName });
};

export const deleteCategory = async (name: string): Promise<any> => {
    return postToScript('deleteCategory', { name });
};

export const deleteSubCategory = async (category: string, name: string): Promise<any> => {
    return postToScript('deleteSubCategory', { category, name });
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
            Nombre: item.name || item.Nombre || '',
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
        Nombre: item.name,
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