// FIX: Replaced the entire file content which contained API logic and a circular import.
// This file now correctly defines and exports all shared types for the application.

export interface Product {
  id?: string;
  cod: string;
  Producto: string;
  Categoria?: string;
  'Sub Categoria'?: string;
  Descripcion?: string;
  'cod.barras'?: string;
  Proveedor?: string;
  'P.Costo'?: number;
  Precio?: number; // Precio de lista
  'Precio de Oferta'?: number; // Precio promocional opcional
  'Stock-Inicial'?: number;
  Vendidos?: number;
  Ingresos?: number;
  stockk?: number; // Stock actual
  'Precio Final'?: number; // Precio de venta final
  Minimo?: number;
  'Venta.PV'?: number;
  Online?: boolean;
  Activo?: boolean;
  FOTOGRAFIA?: string;
  Imagen?: string;
  'Ultima.Actualizacion'?: string;
  Eliminado?: boolean;
  Eliminado_At?: string;
  supplier_id?: string | null;
  product_type?: 'simple' | 'kit';
  auto_price?: boolean;
  markup_pct?: number;
  cost_currency?: 'ARS' | 'USD';
  cost_price_usd?: number;
  last_exchange_rate?: number;
  // Nuevos campos opcionales
  Marca?: string;
  Modelo_Compatible?: string;
  Tipo_Tecnico?: string;
  Especificaciones?: string;
  Clase_Envio?: string;
  Titulo_Web?: string;
  Slug_URL?: string;
  Descripcion_Corta?: string;
  Descripcion_Larga?: string;
  Imagenes_Extra_URLs?: string;
  Video_URL?: string;
  Ficha_Tecnica_URL?: string;
  Peso_kg?: number;
  Alto_cm?: number;
  Ancho_cm?: number;
  Profundidad_cm?: number;
  Fragil?: boolean;
  Embalaje_Especial?: boolean;
  Stock_Online?: number;
  Permitir_Venta_Sin_Stock?: boolean;
  Plazo_Reposicion_Dias?: number;
  Estado_Publicacion?: string;
  Destacado?: boolean;
  Orden_Catalogo?: number;
  Garantia_Meses?: number;
  Notas_Internas?: string;
  'Auto?'?: any;
}

export interface Customer {
  Id_Cliente: string;
  'Nombre y Apellido': string;
  Whatsapp: string;
  'Tipo.Documento': string;
  Documento: string;
  Condicion_IVA:
    | 'Responsable Inscripto'
    | 'Consumidor Final'
    | 'Responsable Monotributo'
    | 'Sujeto Exento'
    | 'Sujeto no Categorizado'
    | 'IVA No Alcanzado';
  Deuda: number;
  Pagos: number;
  'Fecha Creacion'?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
}

export interface AccountTransaction {
  id: string;
  date: Date;
  type: 'Venta' | 'Pago' | 'Nota de Crédito' | 'Ajuste';
  description: string;
  customer_id?: string;
  payment_method?: string;
  debit: number;
  credit: number;
  balance: number;
  originalSaleId?: string;
  items?: CartItem[];
  shiftId?: string;
  facturaInfo?: {
    cae: string;
    fecha: string;
    nro: string;
    invoiceNumber?: string;
    vtoCae: string;
    qrData: string;
    url?: string;
    pdfUrl?: string;
    ticketUrl?: string;
  };
}

export interface ECheq {
  amount: number;
  days: number;
}

export interface Sale {
  id: string;
  legacySaleId?: string;
  date: Date;
  customer: Customer | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  adjustmentAmount?: number;
  adjustmentDescription?: string;
  total: number;
  payment: {
    cash: number;
    digital: number;
    credit: number;
    echeqs: ECheq[];
  };
  shiftId?: string;
  facturacion: 'A' | 'B' | 'N';
  status?: 'active' | 'annulled';
  returnedTotal?: number;
  creditNotes?: AccountTransaction[];
  facturaInfo?: {
    cae: string;
    fecha: string;
    nro: string;
    invoiceNumber?: string;
    vtoCae: string;
    qrData: string;
    url?: string;
    pdfUrl?: string;
    ticketUrl?: string;
  };
  paymentCondition?: string;
  isPendingSync?: boolean;
  document_type?: 'sale' | 'budget';
}

export interface Expense {
  id_gastos: string;
  Fecha: Date;
  FechaRaw?: string;
  Monto: number;
  Detalle: string;
  Tipo?: 'Fijos' | 'Impuestos' | 'Sueldos' | 'Proveedores' | 'Otros';
  Efectivo: number;
  Digital: number;
  shiftId?: string;
  // Campos de autoría para filtro quirúrgico
  user_profile_id?: string;
  CargadoPor?: string;
}

export interface User {
  ID_Usuario: string;
  Nombre: string;
  PIN: string;
  Rol: 'Admin' | 'Vendedor' | 'Cajero';
  Activo: 'SI' | 'NO';
}

export interface Shift {
  ID_Turno: string;
  ID_Usuario: string;
  Fecha_Apertura: Date;
  Fecha_Cierre: Date | null;
  Monto_Apertura: number;
  Monto_Cierre_Declarado: number;
  Total_Ventas_Efectivo: number;
  Total_Gastos_Efectivo: number;
  Efectivo_Esperado: number;
  Diferencia: number;
  Estado: 'Abierto' | 'Cerrado';
  Notas?: string;
}

export interface Budget {
  id: string;
  budget_number?: number;
  date: Date;
  customer: Customer;
  items: CartItem[];
  subtotal?: number;
  adjustmentAmount?: number;
  adjustment_amount?: number;
  total: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  notes?: string | null;
  created_at?: string;
  converted_to_sale_id?: string | null;
  shiftId: string;
}

export interface StockEntryItem {
  product: Product;
  quantity: number;
  costPrice: number;
  salePrice: number;
  reactivate?: boolean;
}

export interface BillingSettings {
  apiUrl: string;
  apiKey: string;
  apiToken: string;
  userToken: string;
}

export interface CreditNote {
  id: string;
  date: Date;
  customer: Customer;
  items: CartItem[];
  total: number;
  description: string;
  originalSaleId: string;
  facturaInfo?: {
    cae: string;
    fecha: string;
    nro: string;
    invoiceNumber?: string;
    vtoCae: string;
    qrData: string;
    url?: string;
    pdfUrl?: string;
    ticketUrl?: string;
  };
}

export interface PrintStyles {
  fontFamily: string;
  baseFontSize: number;
  baseFontWeight: number;
  headerFontSize: number;
  totalFontSize: number;
  unitPriceFontSize: number;
  unitPriceFontWeight: number;
  ticketWidth: number;
  padding: number;
  lineHeight: number;
  boldHeader: boolean;
  boldTotal: boolean;
  boldAll: boolean; // Nuevo campo para negrita global
  separatorStyle: 'dashed' | 'solid' | 'dotted';
  paperSize: '58mm' | '80mm';
  leftMargin: number;
  rightMargin: number;
}

export interface SyncRequest {
  id: string;
  action: string;
  payload: any;
  timestamp: number;
  status?: 'queued' | 'syncing' | 'error';
  retryCount?: number;
  lastError?: string;
}

export interface Supplier {
  ID_Proveedor: string;
  Nombre: string;
  id?: string;
  name?: string;
  is_active?: boolean;
  tax_1_percent?: number;
  tax_2_percent?: number;
  tax_3_percent?: number;
  tax_4_percent?: number;
  CUIT?: string;
  Condicion_IVA?:
    | 'Responsable Inscripto'
    | 'Consumidor Final'
    | 'Responsable Monotributo'
    | 'Sujeto Exento'
    | 'Sujeto no Categorizado'
    | 'IVA No Alcanzado';
  Email?: string;
  Telefono?: string;
  Contacto?: string;
  Direccion?: string;
  Activo: 'SI' | 'NO';
  Fecha_Creacion?: string;
}

export interface SupplierCostImportRow {
  cod: string;
  cost_price: number;
  barcode?: string;
  name?: string;
  category?: string;
  sub_category?: string;
  observations?: string;
  cost_currency?: 'ARS' | 'USD';
  line?: number;
}

export interface SupplierCostImportPreviewRow {
  cod: string;
  product_name: string;
  current_cost: number;
  input_currency: 'ARS' | 'USD';
  input_cost: number;
  exchange_rate: number;
  converted_cost_ars: number;
  new_cost: number;
  supplier_tax_1_percent: number;
  supplier_tax_2_percent: number;
  supplier_tax_3_percent: number;
  current_final_price: number;
  new_calculated_final_price: number;
  status: 'found' | 'not found';
  result: 'will update' | 'no change' | 'not found';
}

export interface SupplierMissingProduct {
  id: string;
  cod: string;
  barcode: string;
  description: string;
  price: number | null;
}

export interface SupplierCostImportPreviewResponse {
  previewRows: SupplierCostImportPreviewRow[];
  matchedKeysArray: string[];
  providerMissingProducts: SupplierMissingProduct[];
}

export interface SupplierCostImportSummary {
  existingSupplierProducts: number;
  foundInFile: number;
  notFoundInFile: number;
  totalRows: number;
  found: number;
  updated: number;
  notFound: number;
  ignored: number;
}

export interface SupplierInvoice {
  id?: string;
  supplier_id: string;
  invoice_number: string;
  total_amount: number;
  paid: boolean;
  created_at?: string;
}

export interface SupplierInvoiceItem {
  invoice_id: string;
  product_id: string;
  quantity: number;
  cost_price: number;
}

export interface SupplierInvoiceHistory {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  total_amount: number;
  paid: boolean;
  created_at: string;
  item_count: number;
}

export interface SupplierInvoiceDetailItem {
  invoice_id: string;
  product_id: string;
  product_name: string;
  product_code?: string;
  quantity: number;
  cost_price: number;
}

export interface SupplierInvoiceDetail {
  invoice: SupplierInvoiceHistory;
  items: SupplierInvoiceDetailItem[];
}

export interface SupplierAccountSummary {
  supplier_id: string;
  supplier_nombre: string;
  total_facturado: number;
  total_pagado: number;
  saldo_pendiente: number;
}

export interface SupplierInvoiceBalance {
  id: string;
  supplier_id: string;
  invoice_number: string;
  total_amount: number;
  total_pagado: number;
  saldo_pendiente: number;
  estado_pago: string;
  created_at: string;
}

export interface SupplierPayment {
  id?: string;
  supplier_id: string;
  invoice_id?: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes?: string;
}

// ─── PROMPT 010: Flujo "Actualización" con tabla temporal ───────────────────

export interface SupplierPriceImportTempRow {
  id?: string;
  import_session_id: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  source_filename: string;
  file_currency: 'ARS' | 'USD';
  exchange_rate: number;
  row_number: number;
  excel_code: string;
  excel_name: string;
  excel_price: number | null;
  created_at?: string;
}

export interface SupplierPriceImportSessionResult {
  sessionId: string;
  supplierId: string;
  supplierName: string;
  sourceFilename: string;
  rowsUploaded: number;
  fileCurrency: 'ARS' | 'USD';
  exchangeRate: number;
}

export interface SupplierPriceImportMatchSummary {
  sessionId: string;
  totalRows: number;
  matchedByCod: number;
  matchedByBarcode: number;
  notMatched: number;
}

export interface SupplierPriceUpdateResult {
  sessionId: string;
  updatedCount: number;
  skippedCount: number;
  notFoundCount: number;
}

export interface SupplierVsExcelSummary {
  totalSupplier: number;
  matchedByCod: number;
  matchedByBarcode: number;
  missingFromExcel: number;
}
