
// FIX: Imported all necessary types from the central types file.
import {
    AccountTransaction,
    Budget,
    CartItem,
    Customer,
    ECheq,
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

// The ID of the Google Sheet provided by the user
const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID || '1L2wt60AlSlD32IrURe5wSSGWhCunVwRPIx5PslkSsY8';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzr8tHiiAxOTm6WH27niuF0UHm6d3W5dZqlQ6SPj-dRcsAU2sGB79LuCCYIzfIfwsoo7Q/exec';
const WEBHOOK_TOKEN = import.meta.env.VITE_GAS_WEBHOOK_TOKEN || '';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn('Supabase URL o Anon Key no están configuradas. Las funciones de facturación electrónica no funcionarán.');
}


// Base URL for the Google Sheets gviz API (for read-only operations)
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;

/**
 * Helper to clean up image URLs that might have extra characters appended after the extension.
 */
const cleanImageUrl = (url: any): string => {
    if (typeof url !== 'string' || !url) {
        return '';
    }
    const match = url.match(/^(.*?\.(?:jpe?g|png|gif|webp))/i);
    return match ? match[1] : url;
};


/**
 * Helper robusto para interpretar números desde la hoja de cálculo.
 */
const parseSheetNumber = (value: any): number => {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value !== 'string' || !value) {
        return 0;
    }
    const sanitizedValue = value.replace(/[$\s.]/g, '').replace(',', '.');
    const number = parseFloat(sanitizedValue);
    return isNaN(number) ? 0 : number;
};

/**
 * Helper para campos numéricos opcionales (devuelve undefined si está vacío)
 */
const parseOptionalNumber = (val: any): number | undefined => {
    if (val === null || val === undefined || String(val).trim() === '') return undefined;
    const sanitized = String(val).replace(/[$\s.]/g, '').replace(',', '.');
    const n = parseFloat(sanitized);
    return isNaN(n) ? undefined : n;
};

/**
 * Helper para campos booleanos opcionales (devuelve undefined si está vacío)
 */
const parseOptionalBoolean = (val: any): boolean | undefined => {
    if (val === null || val === undefined || String(val).trim() === '') return undefined;
    const s = String(val).trim().toUpperCase();
    if (s === 'TRUE' || s === 'SI') return true;
    if (s === 'FALSE' || s === 'NO') return false;
    return undefined;
};

/**
 * Helper robusto para parsear fechas de Google Sheets preservando hora LOCAL.
 */
export const robustParseDate = (dateVal: any): Date => {
    if (dateVal instanceof Date) {
        return isNaN(dateVal.getTime()) ? new Date() : dateVal;
    }
    
    if (!dateVal) return new Date();
    
    const s = String(dateVal).trim();

    const regex = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2})[:-](\d{1,2})(?:[:-](\d{1,2}))?)?/;
    const match = s.match(regex);
    
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; 
        const day = parseInt(match[3], 10);
        const hour = match[4] ? parseInt(match[4], 10) : 0;
        const min = match[5] ? parseInt(match[5], 10) : 0;
        const sec = match[6] ? parseInt(match[6], 10) : 0;
        
        const d = new Date(year, month, day, hour, min, sec);
        if (!isNaN(d.getTime())) return d;
    }

    const parts = s.split(' ');
    if (parts.length === 2 && parts[1].includes('-')) {
        const corrected = `${parts[0]}T${parts[1].replace(/-/g, ':')}`;
        const d = new Date(corrected);
        if (!isNaN(d.getTime())) return d;
    }

    const dFallback = new Date(s);
    return isNaN(dFallback.getTime()) ? new Date() : dFallback;
};


/**
 * Formats a Date object into a 'YYYY-MM-DD HH:mm:ss' string representing LOCAL time.
 * FIXED: Uses colons for time separation as requested by the user.
 */
const formatDateForSheet = (date: Date): string => {
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
};

/**
 * Formats a Date object into a 'YYYY-MM-DD' string for use in Gviz queries.
 */
const getGvizDateString = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};


/**
 * This function ONLY performs the fetch request.
 */
export const _forcePostToScript = async (action: string, payload: any) => {
    // QUIRÚRGICO: Normalización de seguridad para evitar crashes de echeqs/payment
    if (payload && typeof payload === 'object') {
        payload.payment = payload.payment ?? { cash: 0, digital: 0, credit: 0, echeqs: [] };
    }

    const requestBody = JSON.stringify({ webhook_token: WEBHOOK_TOKEN, action, payload });

    console.debug(`[SALE_POST_SENT] Action: ${action}`, payload);
    
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: requestBody,
        headers: {
            'Content-Type': 'text/plain;charset=utf-8', 
        },
        mode: 'cors',
        cache: 'no-store',
        redirect: 'follow',
    });

    const responseText = await response.text();
    if (responseText.includes('<title>Error</title>') || responseText.includes('needs access to your Google Account')) {
        console.error(`[SALE_POST_FAIL] Google Script Configuration Error`);
        throw new Error("Error de Configuración del Script de Google.");
    }

    const jsonResponse = JSON.parse(responseText);
    if (jsonResponse.status === 'error') {
        console.error(`[SALE_POST_FAIL] Action: ${action}`, jsonResponse.message);
        const error = new Error(jsonResponse.message || `Error en la acción '${action}'.`);
        (error as any).debugInfo = jsonResponse.debug;
        throw error;
    }
    console.debug(`[SALE_POST_OK] Action: ${action}`);
    return jsonResponse;
}

const postToScript = async (action: string, payload: any, options: { allowQueue?: boolean } = { allowQueue: true }) => {
    const { allowQueue } = options;
    console.debug(`[SALE_SUBMIT_START] Action: ${action}`);

    if (!navigator.onLine && !allowQueue) {
        throw new Error("No hay conexión a internet y esta operación no puede ser guardada para más tarde.");
    }

    if (!navigator.onLine && allowQueue) {
        try {
            console.debug(`[SALE_ENQUEUED] Action: ${action} (Offline)`);
            await offlineService.addToQueue({ action, payload });
            return { status: 'queued', message: 'La operación se ha guardado y se sincronizará cuando vuelva la conexión.' };
        } catch (error) {
            console.error('[Offline Error] Could not queue request:', error);
            throw new Error("Error de Red: No se pudo guardar la operación para más tarde.", { cause: error });
        }
    }
    
    try {
        return await _forcePostToScript(action, payload);
    } catch (networkError) {
        console.error(`[API Network Error] Action: ${action}`, networkError);
        if (allowQueue) {
            try {
                console.debug(`[SALE_ENQUEUED] Action: ${action} (Network Error Fallback)`);
                await offlineService.addToQueue({ action, payload });
                return { status: 'queued', message: 'La conexión falló. La operación se guardó para sincronizar más tarde.' };
            } catch (queueError) {
                console.error('[Offline Fallback Error] Could not queue request after network error:', queueError);
                throw new Error("Error de Red: No se pudo conectar con el servidor ni guardar la operación para más tarde.", { cause: queueError });
            }
        }
        throw networkError;
    }
};

/**
 * Helper function to fetch data using Google's gviz API.
 */
const gvizFetch = async (query: string, sheetName: string): Promise<any[]> => {
    const url = `${GVIZ_URL}?tq=${encodeURIComponent(query)}&sheet=${encodeURIComponent(sheetName)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`GViz fetch failed with status ${res.status}`);
        }
        const text = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\)/);
        if (!match || !match[1]) {
            throw new Error('Invalid GViz response format.');
        }
        const json = JSON.parse(match[1]);
        if (json.status === 'error') {
            console.error('GViz API Error:', json.errors);
            throw new Error(json.errors.map((e: any) => e.detailed_message).join(', '));
        }
        const data: any[] = [];
        if (json.table.rows.length > 0) {
            json.table.rows.forEach((row: any) => {
                const item: { [key: string]: any } = {};
                json.table.cols.forEach((col: any, index: number) => {
                    const key = col.label || `col${index}`;
                    const cell = row.c[index];
                    
                    if (cell === null || cell === undefined || cell.v === null) {
                        item[key] = null;
                    } else if ((col.type === 'date' || col.type === 'datetime') && typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
                        const parts = cell.v.substring(5, cell.v.length - 1).split(',');
                        item[key] = new Date(
                            parseInt(parts[0], 10),
                            parseInt(parts[1], 10),
                            parseInt(parts[2], 10),
                            parseInt(parts[3] || '0', 10),
                            parseInt(parts[4] || '0', 10),
                            parseInt(parts[5] || '0', 10)
                        );
                        // Store raw formatted value too if present
                        if (cell.f) {
                            item[`${key}_raw`] = cell.f;
                        }
                    } else {
                        item[key] = (cell.f !== undefined && cell.f !== null) ? cell.f : cell.v;
                    }
                });
                data.push(item);
            });
        }
        return data;
    } catch (error) {
        console.error(`Error fetching from sheet ${sheetName}:`, error);
        throw error;
    }
};


// --- API Functions ---

export const getSales = async (): Promise<any[]> => {
  const rows = await gvizFetch(`SELECT * ORDER BY B DESC`, 'Ventas');

  return rows.map((r: any) => {
    // Construimos facturaInfo SOLO si hay al menos un dato de factura
    const hasBilling =
      !!r.Factura_URL ||
      !!r.Factura_Ticket_URL ||
      !!r.Factura_QR_Data ||
      !!r.Factura_Fecha;

    const facturaInfo = hasBilling
      ? {
          // Mantener compatibilidad con lo que ya usa el historial:
          url: r.Factura_URL || '',
          ticketUrl: r.Factura_Ticket_URL || '',
          qrData: r.Factura_QR_Data || '',
          fecha: r.Factura_Fecha || '',
        }
      : undefined;

    return {
      ...r,
      facturaInfo,
    };
  });
};

export const getExpenses = async (): Promise<Expense[]> => {
    const data = await gvizFetch(`SELECT * ORDER BY B DESC`, 'Gastos');
    
    return data.map(item => {
        const efectivo = parseSheetNumber(item.Efectivo || item.efectivo || item.EFECTIVO || 0);
        const digital = parseSheetNumber(item.Digital || item.digital || item.DIGITAL || 0);
        const montoTotal = parseSheetNumber(item.Monto || item.monto || item.MONTO || 0);
        const id_gastos = String(item.id_gastos || item.id_gasto || item.ID_Gasto || item.id || '');
        const detalle = String(item.Detalle || item.detalle || item.DETALLE || '');
        const shiftId = item.ID_Turno || item.id_turno || item.ID_turno || item.shiftId || undefined;
        
        const fechaCol = item.Fecha || item.fecha || item.FECHA || item.date || item.Date || item.col1;
        const fechaRaw = item.Fecha_raw || item.fecha_raw || item.col1_raw || String(fechaCol || '');

        return {
            id_gastos,
            Fecha: robustParseDate(fechaCol),
            FechaRaw: fechaRaw,
            Monto: montoTotal || (efectivo + digital),
            Detalle: detalle,
            Efectivo: efectivo,
            Digital: digital,
            shiftId: shiftId
        };
    });
};

export const addExpense = async (data: { detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital'; shiftId: string; }): Promise<void> => {
    const payload = {
        id_gastos: crypto.randomUUID(),
        Fecha: formatDateForSheet(new Date()),
        Monto: data.monto,
        Detalle: data.detalle,
        Efectivo: data.paymentType === 'Efectivo' ? data.monto : 0,
        Digital: data.paymentType === 'Digital' ? data.monto : 0,
        ID_Turno: data.shiftId
    };
    await postToScript('addExpense', payload);
};

export const updateExpense = async (expenseData: { id_gastos: string; detalle: string; monto: number; paymentType: 'Efectivo' | 'Digital' }): Promise<void> => {
    const payload = {
        id_gastos: expenseData.id_gastos,
        Monto: expenseData.monto,
        Detalle: expenseData.detalle,
        Efectivo: expenseData.paymentType === 'Efectivo' ? expenseData.monto : 0,
        Digital: expenseData.paymentType === 'Digital' ? expenseData.monto : 0,
    };
    await postToScript('updateExpense', payload);
};

export const deleteExpense = async (expenseId: string): Promise<void> => {
    await postToScript('deleteExpense', { id_gastos: expenseId });
};

export const getUsers = async (): Promise<User[]> => {
    const data = await gvizFetch("SELECT * WHERE E = 'SI'", 'Usuarios');
    return data.map((item: any) => ({
        ID_Usuario: item.ID_Usuario,
        Nombre: item.Nombre,
        PIN: String(item.PIN || ''),
        Rol: item.Rol,
        Activo: item.Activo,
    } as User));
};

export const login = async (userId: string, pin: string): Promise<{user: User, activeShift: Shift | null}> => {
    const response = await postToScript('login', { userId, pin }, { allowQueue: false });
    // El Apps Script unificado puede devolver el objeto directamente o dentro de 'data'
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
    const data = await gvizFetch('SELECT * ORDER BY C DESC', 'Turnos');
    return data.map(item => ({
        ...item,
        Fecha_Apertura: new Date(item.Fecha_Apertura),
        Fecha_Cierre: item.Fecha_Cierre ? new Date(item.Fecha_Cierre) : null,
        Monto_Apertura: parseSheetNumber(item.Monto_Apertura),
        Monto_Cierre_Declarado: parseSheetNumber(item.Monto_Cierre_Declarado),
        Total_Ventas_Efectivo: parseSheetNumber(item.Total_Ventas_Efectivo),
        Total_Gastos_Efectivo: parseSheetNumber(item.Total_Gastos_Efectivo),
        Efectivo_Esperado: parseSheetNumber(item.Efectivo_Esperado),
        Diferencia: parseSheetNumber(item.Diferencia),
    } as Shift));
};

export const getProducts = async (): Promise<Product[]> => {
    // Read operations should not be queued if offline; they should fail or return cached data.
    const response = await postToScript('getProductsAndSyncStatus', {}, { allowQueue: false });
    
    // Safety check: ensure we have an array to map over
    const data = response?.data;
    if (!Array.isArray(data)) {
        console.warn('getProductsAndSyncStatus returned invalid data format:', response);
        return [];
    }

    return data.map((item: any) => ({
        ...item,
        cod: String(item.cod || ''), 
        'P.Costo': parseOptionalNumber(item['P.Costo']),
        Precio: parseOptionalNumber(item.Precio),
        'Precio de Oferta': parseOptionalNumber(item['Precio de Oferta']),
        'Stock-Inicial': parseOptionalNumber(item['Stock-Inicial']),
        Vendidos: parseOptionalNumber(item.Vendidos),
        Ingresos: parseOptionalNumber(item.Ingresos),
        stockk: parseOptionalNumber(item.stockk),
        'Precio Final': parseOptionalNumber(item['Precio Final']),
        Minimo: parseOptionalNumber(item.Minimo),
        Online: item.Online === true || String(item.Online).toUpperCase() === 'TRUE' || String(item.Online).toUpperCase() === 'SI',
        Activo: item.Activo === true || String(item.Activo).trim().toUpperCase() === 'SI',
        FOTOGRAFIA: cleanImageUrl(item.FOTOGRAFIA),
        // Nuevos campos numéricos opcionales
        Peso_kg: parseOptionalNumber(item.Peso_kg),
        Alto_cm: parseOptionalNumber(item.Alto_cm),
        Ancho_cm: parseOptionalNumber(item.Ancho_cm),
        Profundidad_cm: parseOptionalNumber(item.Profundidad_cm),
        Stock_Online: parseOptionalNumber(item.Stock_Online),
        Plazo_Reposicion_Dias: parseOptionalNumber(item.Plazo_Reposicion_Dias),
        Orden_Catalogo: parseOptionalNumber(item.Orden_Catalogo),
        Garantia_Meses: parseOptionalNumber(item.Garantia_Meses),
        // Nuevos campos booleanos opcionales
        Fragil: parseOptionalBoolean(item.Fragil),
        Embalaje_Especial: parseOptionalBoolean(item.Embalaje_Especial),
        Permitir_Venta_Sin_Stock: parseOptionalBoolean(item.Permitir_Venta_Sin_Stock),
        Destacado: parseOptionalBoolean(item.Destacado),
    })).filter((p: any) => p.cod);
};

export const getCustomers = async (): Promise<Customer[]> => {
    const data = await gvizFetch('SELECT *', 'Clientes');
     return data.map(item => ({
        ...item,
        Deuda: parseSheetNumber(item.Deuda),
        Pagos: parseSheetNumber(item.Pagos),
    }));
};

export const addSale = async (sale: Sale, shiftId: string): Promise<any> => {
  const payload = {
    id: sale.id,
    date: formatDateForSheet(sale.date),
    customer: sale.customer || { Id_Cliente: '0', 'Nombre y Apellido': 'Consumidor Final' },
    items: sale.items.map(item => ({
      product: { cod: item.product.cod, Producto: item.product.Producto, Precio: item.price },
      quantity: item.quantity,
    })),
    itemCount: sale.itemCount,
    subtotal: sale.subtotal,
    total: sale.total,
    payment: {
      cash: sale.payment.cash || 0,
      digital: sale.payment.digital || 0,
      credit: sale.payment.credit || 0,
      echeqs: sale.payment.echeqs || [],
    },
    shiftId: shiftId,
    facturacion: sale.facturacion || 'N',
  };
  
  const response = await postToScript('addSale', payload);
  
  // VALIDACIÓN DE ACK (CONFIRMACIÓN FUERTE)
  if (response.status === 'success') {
    if (response.sale_id && response.sale_id !== sale.id) {
       console.warn('[ACK_MISMATCH] El ID de venta devuelto no coincide:', { sent: sale.id, received: response.sale_id });
    }
    return response;
  }
  
  throw new Error(response.message || 'Error desconocido al guardar la venta.');
};

export const updateSale = async (originalSale: Sale, updatedSale: Sale): Promise<void> => {
    await postToScript('updateSale', { originalSale, updatedSale });
};

export const addCustomer = async (customerData: any): Promise<void> => {
    await postToScript('addCustomer', { ...customerData, 'Fecha Creacion': formatDateForSheet(new Date()) });
};

export const updateCustomer = async (customerData: any): Promise<void> => {
    await postToScript('updateCustomer', customerData);
};

export const recordPayment = async (customerId: string, amount: number, description: string, paymentMethod: string, shiftId: string): Promise<void> => {
    await postToScript('recordPayment', { customerId, amount, paymentMethod, description, date: formatDateForSheet(new Date()), shiftId });
};

export const createCreditNote = async (payload: any): Promise<void> => {
    await postToScript('createCreditNote', { ...payload, date: formatDateForSheet(new Date()) });
};

export const annulSale = async (saleId: string): Promise<void> => {
    await postToScript('annulSale', { saleId, date: formatDateForSheet(new Date()) });
}

export const getCustomerStatement = async (customerId: string): Promise<AccountTransaction[]> => {
    // FIX: Se traen todas las transacciones y se filtran localmente para máxima compatibilidad
    // con IDs de cliente que puedan tener inconsistencias (espacios, etc.), replicando la lógica
    // robusta que ya funciona en la vista principal de la app.
    const allTransactions = await gvizFetch(`SELECT * ORDER BY B ASC`, 'CuentaCorriente');
    
    const customerIdStr = String(customerId).trim();

    const customerTransactions = allTransactions.filter(t => {
        const txCustomerId = String(t.Id_Cliente || t.customerId || t['ID_Cliente'] || t['ID Cliente'] || t['IDCliente'] || '').trim();
        return txCustomerId === customerIdStr;
    });

    let balance = 0;
    return customerTransactions.map(item => {
        const debit = parseSheetNumber(item.Debe);
        const credit = parseSheetNumber(item.Haber);
        balance += debit - credit;
        return {
            id: item.ID_Transaccion,
            date: robustParseDate(item.Fecha) || new Date(0),
            type: item.Tipo as any,
            description: item.Description,
            debit,
            credit,
            balance,
            originalSaleId: item.Venta_Original_ID,
        }
    });
};

export const getAccountTransactions = async (): Promise<any[]> => {
    return gvizFetch('SELECT *', 'CuentaCorriente');
};

export const getBudgets = async (): Promise<Budget[]> => {
    const data = await gvizFetch('SELECT * ORDER BY B DESC', 'Ventas');
    return data.filter(i => i.Estado === 'Pendiente' || i.Estado === 'Aprobado').map(item => ({
        id: item.ID_Venta,
        date: robustParseDate(item.Fecha) || new Date(0),
        customer: { Id_Cliente: item.Id_Cliente, 'Nombre y Apellido': item.Nombre_Cliente } as any,
        items: JSON.parse(item['Productos (JSON)'] || '[]'),
        total: parseSheetNumber(item.Total),
        status: item.Estado === 'Aprobado' ? 'approved' : 'pending',
    }));
};

export const addBudget = async (budget: Budget): Promise<void> => {
    await postToScript('addBudget', { ...budget, date: formatDateForSheet(budget.date) });
};

export const updateBudget = async (budget: Budget): Promise<void> => {
    await postToScript('updateBudget', { ...budget, date: formatDateForSheet(budget.date) });
};

export const updateBudgetStatus = async (budgetId: string, status: string): Promise<void> => {
    await postToScript('updateBudgetStatus', { budgetId, status });
};

export const deleteBudget = async (budgetId: string): Promise<void> => {
    await postToScript('deleteBudget', { budgetId });
};

export const convertBudgetToSale = async (budget: Budget, payment: any, shiftId: string, facturacion: string, customer: any, total: number, adjustmentAmount: number, adjustmentDescription: string): Promise<void> => {
    await postToScript('updateBudgetToSale', { id: budget.id, date: formatDateForSheet(new Date()), customer, items: budget.items, total, payment, shiftId, facturacion, adjustmentAmount, adjustmentDescription });
};

export const recordStockEntry = async (items: StockEntryItem[], userId: string): Promise<any> => {
    return postToScript('recordStockEntry', { items, userId });
};

export const getAllUsersForAdmin = async (): Promise<User[]> => {
    const res = await postToScript('getAllUsersForAdmin', {}, { allowQueue: false });
    return res?.data || [];
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

// --- HELPERS PARA FACTURACIÓN ELECTRÓNICA ---

const normalizeCustomerForTusFacturas = (customer: any) => {
    if (!customer) return null;
    const normalized = { ...customer };
    
    // 1. Condicion IVA: Normalizar a RI, CF, M
    const iva = String(customer.Condicion_IVA || '').toUpperCase();
    if (iva.includes('RESPONSABLE INSCRIPTO')) normalized.Condicion_IVA = 'RI';
    else if (iva.includes('MONOTRIBUTO')) normalized.Condicion_IVA = 'M';
    else if (iva.includes('CONSUMIDOR FINAL')) normalized.Condicion_IVA = 'CF';
    else normalized.Condicion_IVA = 'CF';

    // 2. Tipo Documento: Normalizar a CUIT, DNI
    const docType = String(customer['Tipo.Documento'] || '').toUpperCase();
    if (docType.includes('CUIT')) normalized['Tipo.Documento'] = 'CUIT';
    else if (docType.includes('DNI')) normalized['Tipo.Documento'] = 'DNI';
    else normalized['Tipo.Documento'] = 'DNI';

    // 3. Documento: Limpiar y validar
    const doc = String(customer.Documento || '').replace(/\D/g, '');
    if (normalized['Tipo.Documento'] === 'CUIT' && doc.length !== 11) {
        // Si es CUIT pero no tiene 11 digitos, fallback a CF
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
    // A) PRIMERO: Guardar la venta en el Sheet
    const salePayloadForSheet = {
        id: sale.id,
        date: formatDateForSheet(sale.date),
        customer: sale.customer || { Id_Cliente: '0', 'Nombre y Apellido': 'Consumidor Final' },
        items: sale.items.map(item => ({
            product: { cod: item.product.cod, Producto: item.product.Producto, Precio: item.price },
            quantity: item.quantity,
        })),
        itemCount: sale.itemCount,
        subtotal: sale.subtotal,
        total: sale.total,
        payment: {
            cash: sale.payment.cash || 0,
            digital: sale.payment.digital || 0,
            credit: sale.payment.credit || 0,
            echeqs: sale.payment.echeqs || [],
        },
        shiftId: sale.shiftId, // Usar sale.shiftId aquí
        facturacion: sale.facturacion || 'N',
    };
    await postToScript('addSale', salePayloadForSheet);

    // B) DESPUÉS: intentar facturar por Supabase Edge Function
    try {
        if (!supabase) {
            console.warn('Supabase no está inicializado. Verifique las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
            return { status: 'facturación pendiente', reason: 'SUPABASE_NOT_INITIALIZED' };
        }

        // Normalizar cliente y determinar tipos
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

        // A) TRAZABILIDAD: Log de depuración solicitado
        console.log('[invoice_request_debug]', {
            selectedInvoiceType: sale.facturacion,
            determinedType: comprobante_tipo,
            cbteTipo: cbteTipo,
            customerIVA: normalizedCustomer?.Condicion_IVA,
            tipoDoc: normalizedCustomer?.['Tipo.Documento'],
            nroDoc: normalizedCustomer?.Documento ? `***${normalizedCustomer.Documento.slice(-3)}` : 'N/A'
        });

        const { data, error } = await supabase.functions.invoke('create-electronic-invoice', { body: { sale: saleForInvoice } });

        // B.3) Log de respuesta del proveedor
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

        // Validar que la respuesta contenga los campos esperados
        const nro = data?.nro ?? null;
        const cae = data?.cae ?? null;
        const vtoCae = data?.vtoCae ?? null;
        const qrData = data?.qrData ?? null;
        const url = data?.url ?? '';
        const ticketUrl = data?.ticketUrl ?? '';
        const cbteTipoFinal = data?.cbteTipo;

        const effectiveType = cbteTipoFinal === 1 ? 'A' : (cbteTipoFinal === 6 ? 'B' : sale.facturacion);

        if (effectiveType !== sale.facturacion && sale.facturacion !== 'N') {
            console.error(`[BUG_DETECTED] Mismatch de tipo de factura. Solicitado: ${sale.facturacion}, Emitido: ${effectiveType}`);
            // No bloqueamos el flujo pero dejamos constancia clara en el log
        }

        // Validar contra las variables extraídas
        if (!nro || !cae) {
            console.error('INVALID_INVOICE_RESPONSE: La respuesta de la Edge Function no contiene los campos Nro y CAE esperados para la factura.', data);
            return { status: 'facturación pendiente', reason: 'INVALID_RESPONSE', message: 'Respuesta de facturación inválida: faltan Nro o CAE.', data };
        }

        // C) Si facturación OK: llamar markSaleAsBilled (solo si nro y cae existen)
        await markSaleAsBilled(
            sale.id,
            cae,
            nro,
            vtoCae || '', 
            qrData || '', 
            new Date(),
            url || '', 
            ticketUrl || '',
            effectiveType // Pasar el tipo efectivo
        );
        return { status: 'facturado', data: { ...data, effectiveType } }; 
    } catch (e: any) {
        // D) Si facturación falla: NO lanzar error que impida el guardado.
        console.error('Fallo la facturación electrónica para la venta', sale.id, e.message || e);
        return { status: 'facturación pendiente', reason: 'UNEXPECTED_ERROR', message: e.message || 'Error inesperado durante la facturación.' };
    }
};

export const generateElectronicCreditNote = async (sale: Sale, items: CartItem[]): Promise<any> => {
    // A) PRIMERO: Guardar la nota de crédito en el Sheet
    const creditNotePayloadForSheet = {
        id: sale.id,
        date: formatDateForSheet(sale.date),
        customer: sale.customer || { Id_Cliente: '0', 'Nombre y Apellido': 'Consumidor Final' },
        items: items.map(item => ({
            product: { cod: item.product.cod, Producto: item.product.Producto, Precio: item.price },
            quantity: item.quantity,
        })),
        itemCount: sale.itemCount,
        subtotal: sale.subtotal,
        total: sale.total,
        payment: {
            cash: sale.payment.cash || 0,
            digital: sale.payment.digital || 0,
            credit: sale.payment.credit || 0,
            echeqs: sale.payment.echeqs || [],
        },
        shiftId: sale.shiftId, // Usar sale.shiftId aquí
        facturacion: sale.facturacion || 'N', // Mantener 'N' o el valor original para el Sheet
        isCreditNote: true, // Indicar que es una nota de crédito para el Apps Script
    };
    await postToScript('addSale', creditNotePayloadForSheet);

    // B) DESPUÉS: intentar generar la nota de crédito electrónica por Supabase Edge Function
    try {
        if (!supabase) {
            console.warn('Supabase no está inicializado. Verifique las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
            return { status: 'facturación pendiente', reason: 'SUPABASE_NOT_INITIALIZED' };
        }

        // Normalizar cliente y determinar tipos
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

        // A) TRAZABILIDAD: Log de depuración solicitado
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

        // Validar que la respuesta contenga los campos esperados
        const nro = data?.nro ?? null;
        const cae = data?.cae ?? null;
        const vtoCae = data?.vtoCae ?? null;
        const qrData = data?.qrData ?? null;
        const url = data?.url ?? '';
        const ticketUrl = data?.ticketUrl ?? '';

        // Validar contra las variables extraídas
        if (!nro || !cae) {
            console.error('INVALID_INVOICE_RESPONSE: La respuesta de la Edge Function no contiene los campos Nro y CAE esperados para la nota de crédito.', data);
            return { status: 'facturación pendiente', reason: 'INVALID_RESPONSE', message: 'Respuesta de facturación inválida: faltan Nro o CAE.', data };
        }

        const cbteTipoFinal = data?.cbteTipo;
        const effectiveType = cbteTipoFinal === 3 ? 'A' : (cbteTipoFinal === 8 ? 'B' : sale.facturacion);

        // C) Si facturación OK: llamar markSaleAsBilled (solo si nro y cae existen)
        await markSaleAsBilled(
            sale.id,
            cae,
            nro,
            vtoCae || '', 
            qrData || '', 
            new Date(),
            url || '', 
            ticketUrl || '',
            effectiveType
        );
        return { status: 'facturado', data: { ...data, effectiveType } }; 
    } catch (e: any) {
        // D) Si facturación falla: NO lanzar error que impida el guardado.
        console.error('Fallo la generación de nota de crédito electrónica para la venta', sale.id, e.message || e);
        return { status: 'facturación pendiente', reason: 'UNEXPECTED_ERROR', message: e.message || 'Error inesperado durante la generación de nota de crédito.' };
    }
};

export const markSaleAsBilled = async (saleId: string, cae: string, nro: string, vtoCae: string, qrData: string, date: Date, url: string, ticketUrl?: string, facturacion?: string): Promise<void> => {
    await postToScript('markSaleAsBilled', { saleId, cae, nro, vtoCae, qrData, date: formatDateForSheet(date), url, ticketUrl, facturacion });
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
    const data = await gvizFetch("SELECT *", 'Proveedores');
    return data.map(item => ({ ...item, Activo: item.Activo }) as Supplier);
};

export const addSupplier = async (data: any): Promise<Supplier> => {
    const res = await postToScript('addSupplier', data);
    return res.data;
};

export const updateSupplier = async (data: any): Promise<any> => {
    return postToScript('updateSupplier', data);
};

export const getProductsSupabase = async (): Promise<Product[]> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_products')
        .select('*')
        .eq('is_deleted', false);
    
    if (error) throw error;
    
    return (data || []).map(item => ({
        ...item,
        Producto: item.name,
        Categoria: item.category_name_legacy, // Fallback o mapeo temporal
        Proveedor: item.supplier_name_legacy, // Fallback o mapeo temporal
        'P.Costo': item.cost_price,
        Precio: item.list_price,
        'Precio de Oferta': item.offer_price,
        'Stock-Inicial': item.initial_stock,
        Vendidos: item.sold_count,
        Ingresos: item.income_count,
        stockk: item.current_stock,
        'Precio Final': item.final_price,
        Minimo: item.min_stock,
        'Venta.PV': item.pv_sale,
        Online: item.is_online,
        Activo: item.is_active,
        FOTOGRAFIA: item.photo_url,
        Eliminado: item.is_deleted,
        'Ultima.Actualizacion': item.legacy_ultima_actualizacion
    } as any));
};

export const addProductSupabase = async (productData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const mapping = {
        cod: productData.cod,
        name: productData.Producto,
        category_id: productData.category_id,
        category_name_legacy: productData.Categoria,
        sub_category: productData['Sub Categoria'],
        description: productData.Descripcion,
        barcode: productData['cod.barras'],
        supplier_id: productData.supplier_id,
        supplier_name_legacy: productData.Proveedor,
        cost_price: productData['P.Costo'],
        list_price: productData.Precio,
        offer_price: productData['Precio de Oferta'],
        initial_stock: productData['Stock-Inicial'],
        income_count: productData.Ingresos,
        sold_count: productData.Vendidos,
        pv_sale: productData['Venta.PV'],
        current_stock: productData.stockk,
        final_price: productData['Precio Final'],
        min_stock: productData.Minimo,
        is_online: productData.Online,
        is_active: productData.Activo,
        photo_url: productData.FOTOGRAFIA,
        brand: productData.Marca,
        compatible_model: productData.Modelo_Compatible,
        technical_type: productData.Tipo_Tecnico,
        specifications: productData.Especificaciones,
        warranty_months: productData.Garantia_Meses,
        internal_notes: productData.Notas_Internas,
        is_deleted: false
    };

    const { data, error } = await supabase
        .from('st_products')
        .insert([mapping])
        .select();
    
    if (error) throw error;
    return data[0];
};

export const updateProductSupabase = async (productData: any): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    
    const { cod, ...rest } = productData;
    const mapping: any = {};
    
    if (rest.Producto !== undefined) mapping.name = rest.Producto;
    if (rest.category_id !== undefined) mapping.category_id = rest.category_id;
    if (rest.Categoria !== undefined) mapping.category_name_legacy = rest.Categoria;
    if (rest['Sub Categoria'] !== undefined) mapping.sub_category = rest['Sub Categoria'];
    if (rest.Descripcion !== undefined) mapping.description = rest.Descripcion;
    if (rest['cod.barras'] !== undefined) mapping.barcode = rest['cod.barras'];
    if (rest.supplier_id !== undefined) mapping.supplier_id = rest.supplier_id;
    if (rest.Proveedor !== undefined) mapping.supplier_name_legacy = rest.Proveedor;
    if (rest['P.Costo'] !== undefined) mapping.cost_price = rest['P.Costo'];
    if (rest.Precio !== undefined) mapping.list_price = rest.Precio;
    if (rest['Precio de Oferta'] !== undefined) mapping.offer_price = rest['Precio de Oferta'];
    if (rest['Stock-Inicial'] !== undefined) mapping.initial_stock = rest['Stock-Inicial'];
    if (rest.Ingresos !== undefined) mapping.income_count = rest.Ingresos;
    if (rest.Vendidos !== undefined) mapping.sold_count = rest.Vendidos;
    if (rest['Venta.PV'] !== undefined) mapping.pv_sale = rest['Venta.PV'];
    if (rest.stockk !== undefined) mapping.current_stock = rest.stockk;
    if (rest['Precio Final'] !== undefined) mapping.final_price = rest['Precio Final'];
    if (rest.Minimo !== undefined) mapping.min_stock = rest.Minimo;
    if (rest.Online !== undefined) mapping.is_online = rest.Online;
    if (rest.Activo !== undefined) mapping.is_active = rest.Activo;
    if (rest.FOTOGRAFIA !== undefined) mapping.photo_url = rest.FOTOGRAFIA;
    if (rest.Marca !== undefined) mapping.brand = rest.Marca;
    if (rest.Modelo_Compatible !== undefined) mapping.compatible_model = rest.Modelo_Compatible;
    if (rest.Tipo_Tecnico !== undefined) mapping.technical_type = rest.Tipo_Tecnico;
    if (rest.Especificaciones !== undefined) mapping.specifications = rest.Especificaciones;
    if (rest.Garantia_Meses !== undefined) mapping.warranty_months = rest.Garantia_Meses;
    if (rest.Notas_Internas !== undefined) mapping.internal_notes = rest.Notas_Internas;

    const { data, error } = await supabase
        .from('st_products')
        .update(mapping)
        .eq('cod', cod)
        .select();
    
    if (error) throw error;
    return data[0];
};

export const deleteProductSupabase = async (cod: string): Promise<any> => {
    if (!supabase) throw new Error('Supabase no inicializado');
    const { data, error } = await supabase
        .from('st_products')
        .update({ is_deleted: true, deleted_at: new Date() })
        .eq('cod', cod)
        .select();
    
    if (error) throw error;
    return { deleted: true, data: data[0] };
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


