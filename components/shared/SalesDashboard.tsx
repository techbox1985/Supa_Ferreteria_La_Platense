import React, { useState, useMemo, useContext, useCallback, useEffect } from 'react';
import { Sale, Product, Customer, CartItem, CreditNote, AccountTransaction, Budget, ECheq } from '../../types';
import { isCreditNoteFiscalDocument } from '../../services/api';

// Local type for sales with document_type
type SaleWithDocumentType = Sale & { document_type: string; customer: NonNullable<Sale['customer']> };

import * as api from '../../services/api';
import { Icon } from '../ui/Icon';
import {
  generateReceiptHtml,
  generateCreditNoteHtml,
  generateRemitoHtml,
  generateInvoiceHtml,
  generateBudgetHtml,
} from '../pos/Receipt';
import { CreditNoteModal } from '../customers/CreditNoteModal';
import { StatCard } from '../dashboard/StatCard';
import { StatDetailModal } from '../dashboard/StatDetailModal';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { sendTicketViaWhatsApp } from '../../utils/whatsappHelper';
import { getPrintStyles } from '../../utils/printStyles';
import { BillingModal } from './BillingModal';
import { CheckoutModal } from '../pos/CheckoutModal';

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatMoneyInput = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return String(value).replace('.', ',');
};

const isSaleAlreadyBilled = (sale: Sale): boolean => {
  const hasBillingEvidence = Boolean(
    sale.facturaInfo?.cae ||
    sale.facturaInfo?.nro ||
    sale.facturaInfo?.ticketUrl ||
    sale.facturaInfo?.url
  );
  return hasBillingEvidence;
};

const PAYMENT_EDIT_TOLERANCE = 0.05;

const isSaleCancelled = (sale: Sale): boolean => {
  const status = String((sale as any)?.status || '').trim().toLowerCase();
  return status === 'annulled' || status === 'anulada' || status === 'cancelled';
};

const hasTotalCreditNote = (sale: Sale): boolean => {
  const total = Number(sale.total || 0);
  const returnedTotal = Number(sale.returnedTotal || 0);
  return total > 0 && returnedTotal >= total - PAYMENT_EDIT_TOLERANCE;
};

const toFiniteNumber = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeEcheqsForEdit = (value: any): ECheq[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ amount: toFiniteNumber(item?.amount), days: toFiniteNumber(item?.days) }))
    .filter((item) => item.amount > 0);
};

const resolveSalePaymentForEdit = (sale: Sale): Sale['payment'] => {
  const source: any = sale as any;
  const paymentSource: any = source?.payment || {};

  const cash = toFiniteNumber(
    paymentSource.cash ?? source.payment_cash ?? source.paymentCash ?? source.Pago_Efectivo ?? source['Pago Efectivo'] ?? source.Efectivo
  );
  const digital = toFiniteNumber(
    paymentSource.digital ?? source.payment_digital ?? source.paymentDigital ?? source.Pago_Digital ?? source['Pago Digital'] ?? source.Digital
  );
  const credit = toFiniteNumber(
    paymentSource.credit ?? source.payment_credit ?? source.paymentCredit ?? source.Pago_Cuenta_Corriente ?? source['Pago Cuenta Corriente'] ?? source.CtaCte
  );

  let echeqs = normalizeEcheqsForEdit(paymentSource.echeqs);
  if (echeqs.length === 0) {
    const rawEcheqs = source['Echeqs (JSON)'] || source['Echeqs JSON'] || source['Echeqs(JSON)'];
    if (typeof rawEcheqs === 'string' && rawEcheqs.trim()) {
      try {
        echeqs = normalizeEcheqsForEdit(JSON.parse(rawEcheqs));
      } catch {
        echeqs = [];
      }
    }
  }

  return { cash, digital, credit, echeqs };
};

const normalizeSaleForPaymentEdit = (sale: Sale): Sale => ({
  ...sale,
  payment: resolveSalePaymentForEdit(sale),
});

const buildCheckoutCartFromBudget = (sale: SaleWithDocumentType): CartItem[] => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  return items
    .map((item, index) => {
      const price = Number(item?.price ?? item?.product?.Precio ?? item?.product?.['Precio Final'] ?? 0);
      const quantity = Number(item?.quantity ?? 0);
      const productName = String(item?.product?.Producto || 'Producto').trim();
      const productCode = String(item?.product?.cod || `BUDGET_ITEM_${sale.id}_${index}`).trim();

      return {
        product: {
          ...item.product,
          cod: productCode,
          Producto: productName,
          Precio: price,
          'Precio Final': price,
        },
        quantity,
        price,
      } as CartItem;
    })
    .filter((item) => item.quantity > 0);
};

const buildSyntheticFinalConsumer = (): Customer => ({
  Id_Cliente: '0',
  'Nombre y Apellido': 'Consumidor Final',
  Whatsapp: '',
  'Tipo.Documento': 'DNI',
  Documento: '',
  Condicion_IVA: 'Consumidor Final',
  Deuda: 0,
  Pagos: 0,
});

// Una venta está electrónicamente facturada solo si tiene AMBOS: un CAE real y un número de comprobante.
// No basta con tener un ticketUrl interno, una URL de impresión común ni un campo billing_cae
// sin número de comprobante asociado.
const isElectronicallyBilledSale = (sale: Sale): boolean => {
  const cae = String(sale.facturaInfo?.cae || '').trim();
  const nro = String(sale.facturaInfo?.nro || '').trim();
  return Boolean(cae) && Boolean(nro);
};

const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
};

const pickFirstNonEmptyString = (nodes: any[], keys: string[]): string => {
  for (const key of keys) {
    for (const node of nodes) {
      const value = getNestedValue(node, key);
      if (value === null || value === undefined) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return '';
};

const tryComposeInvoiceNumber = (nodes: any[]): string => {
  const ptoVtaRaw = pickFirstNonEmptyString(nodes, ['ptoVta', 'pto_vta', 'puntoVenta', 'punto_venta']);
  const cbteNroRaw = pickFirstNonEmptyString(nodes, ['cbteNro', 'cbte_nro', 'nroComprobante', 'numeroComprobante']);
  if (!ptoVtaRaw || !cbteNroRaw) return '';

  const ptoVtaDigits = ptoVtaRaw.replace(/\D/g, '');
  const cbteDigits = cbteNroRaw.replace(/\D/g, '');
  if (!ptoVtaDigits || !cbteDigits) return '';

  return `${ptoVtaDigits.padStart(5, '0')}-${cbteDigits.padStart(8, '0')}`;
};

type NormalizedCreditNoteFacturaInfo = {
  cae: string;
  nro: string;
  invoiceNumber: string;
  vtoCae: string;
  qrData: string;
  fecha: string;
  url?: string;
  pdfUrl?: string;
  ticketUrl?: string;
  [key: string]: any;
};

const normalizeCreditNoteFiscalResponse = (
  response: any,
  sale: Sale
): {
  isValid: boolean;
  facturaInfo?: NormalizedCreditNoteFacturaInfo;
  rawStatus: string;
} => {
  const nodes: any[] = [];
  const seen = new Set<any>();

  const pushNode = (node: any) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
  };

  pushNode(response);
  pushNode(response?.data);
  pushNode(response?.invoice);
  pushNode(response?.data?.invoice);
  pushNode(response?.data?.data);
  pushNode(response?.result);
  pushNode(response?.data?.result);
  pushNode(response?.comprobante);
  pushNode(response?.data?.comprobante);
  pushNode(response?.arca);
  pushNode(response?.data?.arca);
  pushNode(response?.providerResponse);
  pushNode(response?.data?.providerResponse);

  const cae = pickFirstNonEmptyString(nodes, [
    'cae',
    'CAE',
    'cAE',
    'codAut',
    'codigoAutorizacion',
    'codigo_autorizacion',
    'cae_nro',
    'authorizationCode',
  ]);

  const nroDirect = pickFirstNonEmptyString(nodes, [
    'nro',
    'numero',
    'number',
    'comprobante',
    'comprobanteNumero',
    'comprobante_numero',
    'numeroComprobante',
    'invoiceNumber',
    'billing_number',
    'cbteNro',
    'nroComprobante',
  ]);
  const nro = nroDirect || tryComposeInvoiceNumber(nodes);

  const pdfUrlRaw = pickFirstNonEmptyString(nodes, [
    'pdfUrl',
    'pdf_url',
    'comprobante_pdf_url',
    'billing_pdf_url',
    'url',
    'link',
    'downloadUrl',
    'comprobanteUrl',
    'pdf',
    'urlPdf',
  ]);
  const ticketUrlRaw = pickFirstNonEmptyString(nodes, [
    'ticketUrl',
    'ticket_url',
    'comprobante_ticket_url',
    'billing_ticket_url',
    'url',
    'link',
    'comprobanteUrl',
    'ticket',
    'urlTicket',
  ]);
  const genericUrl = pickFirstNonEmptyString(nodes, ['url', 'comprobanteUrl', 'link', 'downloadUrl']);

  const finalPdfUrl = pdfUrlRaw || ticketUrlRaw || genericUrl;
  const finalTicketUrl = ticketUrlRaw || pdfUrlRaw || genericUrl;

  const qrData = pickFirstNonEmptyString(nodes, [
    'qrData',
    'qr_data',
    'billing_qr_data',
    'qr',
    'codigoQr',
    'qrUrl',
  ]);
  const vtoCae = pickFirstNonEmptyString(nodes, [
    'vtoCae',
    'vto_cae',
    'vencimientoCae',
    'vencimiento_cae',
    'billing_vto_cae',
    'fechaVencimientoCAE',
  ]);
  const cbteTipo = pickFirstNonEmptyString(nodes, [
    'cbteTipo',
    'comprobante_tipo',
    'tipoComprobante',
    'tipo',
    'documentType',
  ]);

  const rawStatus = String(response?.status || '').trim().toLowerCase();
  const isValid = Boolean(cae) && Boolean(nro) && Boolean(finalPdfUrl || finalTicketUrl);

  if (!isValid) {
    return { isValid, rawStatus };
  }

  return {
    isValid,
    rawStatus,
    facturaInfo: {
      cae,
      nro,
      invoiceNumber: nro,
      vtoCae,
      qrData,
      fecha: new Date().toLocaleString('es-AR'),
      url: finalPdfUrl || finalTicketUrl,
      pdfUrl: finalPdfUrl,
      ticketUrl: finalTicketUrl,
      cbteTipo,
      isCreditNote: true,
      originalSaleId: sale.id,
      originalBillingNumber: String(sale.facturaInfo?.nro || ''),
    },
  };
};

const openHtmlInNewWindow = (
  html: string,
  features = 'width=900,height=700,scrollbars=yes,resizable=yes'
) => {
  const win = window.open('', '_blank', features);
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
  return win;
};

const getSafeItemProductName = (item: any): string => {
  return (
    item?.product?.Producto ||
    item?.product?.name ||
    item?.product?.Nombre ||
    item?.product_name_snapshot ||
    item?.name ||
    item?.description ||
    item?.Descripcion ||
    item?.product_code ||
    item?.cod ||
    'Producto sin nombre'
  );
};

const formatCreditNoteItemsSummary = (items: any[] | undefined): string => {
  if (!Array.isArray(items) || items.length === 0) return 'Sin detalle de ítems';
  return items
    .map((item) => `${Number(item?.quantity || 0)}x ${getSafeItemProductName(item)}`)
    .join(', ');
};

const getCreditNoteFiscalDocumentUrl = (note: AccountTransaction, preferred: 'ticket' | 'pdf'): string => {
  const facturaInfoAny = (note?.facturaInfo || {}) as any;
  const ticketUrl = String(facturaInfoAny?.ticketUrl || '').trim();
  const pdfUrl = String(facturaInfoAny?.pdfUrl || facturaInfoAny?.url || '').trim();
  const a4Url = String(facturaInfoAny?.a4Url || '').trim();

  if (preferred === 'ticket') {
    return ticketUrl || pdfUrl || a4Url || '';
  }

  return pdfUrl || a4Url || ticketUrl || '';
};

const normalizeCreditNoteItemsForPrint = (items: any[] | undefined): CartItem[] => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item: any) => {
      const quantity = Number(item?.quantity || 0);
      const price = Number(item?.unit_price || item?.price || 0);
      const name = getSafeItemProductName(item);
      const code = String(item?.product_code || item?.product?.cod || item?.cod || '').trim();

      const product: Product = {
        cod: code || 'SIN-CODIGO',
        Producto: name,
        Precio: price,
        'Precio Final': price,
      };

      return {
        product,
        quantity,
        price,
      } as CartItem;
    })
    .filter((item) => Number(item.quantity) > 0);
};

const CreditNoteRow: React.FC<{
  note: AccountTransaction;
  onOpenActions: (note: AccountTransaction) => void;
}> = React.memo(({ note, onOpenActions }) => {
  const itemsSummary = formatCreditNoteItemsSummary(note.items as any[] | undefined);
  const facturaInfoAny = (note.facturaInfo || {}) as any;
  const noteNumber = String(facturaInfoAny?.nro || facturaInfoAny?.invoiceNumber || '').trim();
  const cae = String(facturaInfoAny?.cae || '').trim();
  const isExternalManual =
    facturaInfoAny?.externalManualCreditNote === true ||
    String(facturaInfoAny?.source || '').trim() === 'manual_provider_registration';
  const externalProvider = String(facturaInfoAny?.provider || '').trim();

  return (
    <tr
      className="bg-red-50 hover:bg-red-100 transition-colors cursor-pointer select-none"
      onClick={() => onOpenActions(note)}
    >
      <td className="px-2 py-4 text-center min-w-[140px] whitespace-nowrap">
        <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-5 h-5 text-red-500 mx-auto" />
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm font-mono text-gray-500 w-20 min-w-[80px]">
        {note.id.slice(0, 8)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm min-w-[200px]">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">{new Date(note.date).toLocaleString('es-AR')}</span>
          <span className="font-medium text-red-700 italic">Nota de Crédito</span>
          <div
            className="text-xs font-normal text-gray-600 truncate"
            title={note.facturaInfo ? `(Oficial ${note.facturaInfo.nro})` : `(Ref: ${note.originalSaleId?.slice(0, 8)})`}
          >
            {note.facturaInfo ? `(Oficial ${note.facturaInfo.nro})` : `(Ref: ${note.originalSaleId?.slice(0, 8)})`}
          </div>
          {noteNumber && (
            <div className="text-xs font-normal text-gray-700 truncate" title={`Comprobante ${noteNumber}`}>
              {`Comprobante ${noteNumber}`}
            </div>
          )}
          {cae && (
            <div className="text-xs font-normal text-gray-700 truncate" title={`CAE ${cae}`}>
              {`CAE ${cae}`}
            </div>
          )}
          {isExternalManual && (
            <div
              className="text-xs font-normal text-indigo-700 truncate"
              title={externalProvider ? `Emitida externamente (${externalProvider})` : 'Emitida externamente'}
            >
              {externalProvider ? `Emitida externamente (${externalProvider})` : 'Emitida externamente'}
            </div>
          )}
          <div
            className="text-xs font-normal text-gray-600 truncate"
            title={itemsSummary}
          >
            {itemsSummary}
          </div>
        </div>
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-center w-16 min-w-[60px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-16 min-w-[70px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right font-bold text-red-700 w-20 min-w-[90px]">
        -${note.credit.toLocaleString('es-AR')}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]"></td>
      <td className="px-2 py-4 whitespace-nowrap text-right text-sm font-medium w-32 min-w-[120px]">
        <button
          onClick={e => {
            e.stopPropagation();
            onOpenActions(note);
          }}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Icon
            path="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
            className="w-5 h-5"
          />
        </button>
      </td>
    </tr>
  );
});
CreditNoteRow.displayName = 'CreditNoteRow';

const PaymentRow: React.FC<{
  payment: AccountTransaction;
  customersMap: Map<string, Customer>;
}> = React.memo(({ payment, customersMap }) => {
  const customer = payment.customer_id ? customersMap.get(payment.customer_id) : undefined;
  const customerName = customer?.['Nombre y Apellido'] || '(sin cliente)';
  const isCash = payment.payment_method === 'efectivo';
  const isDigital = payment.payment_method === 'digital';
  const dateStr = (payment.date instanceof Date ? payment.date : new Date(payment.date)).toLocaleString('es-AR');
  return (
    <tr className="bg-teal-50 hover:bg-teal-100 transition-colors border-b">
      <td className="px-2 py-4 text-center min-w-[140px] whitespace-nowrap">
        <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-teal-100 text-teal-800">
          Cobro de deuda
        </span>
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm font-mono text-gray-500 w-20 min-w-[80px]">
        {payment.id.slice(0, 8)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm min-w-[200px]">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">{dateStr}</span>
          <span className="font-medium text-teal-700 truncate" title={customerName}>{customerName}</span>
          {payment.description && (
            <span className="text-xs text-gray-500 truncate" title={payment.description}>{payment.description}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-center w-16 min-w-[60px]">-</td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">-</td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-16 min-w-[70px]">-</td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right font-bold text-teal-700 w-20 min-w-[90px]">
        ${payment.credit.toLocaleString('es-AR')}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isCash ? `$${payment.credit.toLocaleString('es-AR')}` : '-'}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isDigital ? `$${payment.credit.toLocaleString('es-AR')}` : '-'}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">-</td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">-</td>
      <td className="px-2 py-4 whitespace-nowrap text-right text-sm font-medium w-32 min-w-[120px]"></td>
    </tr>
  );
});
PaymentRow.displayName = 'PaymentRow';

const SaleRow: React.FC<{
  sale: Sale & { document_type?: string };
  onOpenActions: (sale: Sale) => void;
}> = React.memo(({ sale, onOpenActions }) => {
  const isAnnulled = sale.status === 'annulled';
  const isBudget = sale.document_type === 'budget';
  const hasOfficialInvoice = isSaleAlreadyBilled(sale);
  const isBilled = !isBudget && hasOfficialInvoice;
  const showBilledBadge = hasOfficialInvoice;
  const hasTicket80 = Boolean(sale.facturaInfo?.ticketUrl);
  const hasA4 = Boolean(sale.facturaInfo?.url);
  const officialTicket80Url = sale.facturaInfo?.ticketUrl;
  const officialTicketA4Url = sale.facturaInfo?.url;
  const hasCreditNotes = Array.isArray(sale.creditNotes) && sale.creditNotes.length > 0;
  const returnedTotal = Number(sale.returnedTotal || 0);
  const saleTotal = Number(sale.total || 0);
  const isNcTotal = hasCreditNotes && (returnedTotal > saleTotal || Math.abs(returnedTotal - saleTotal) < 0.05);
  const ncBadgeLabel = isNcTotal ? 'NC Total' : 'NC Parcial';
  const returnedTotalLabel = returnedTotal.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const hasPartialReturn = !isAnnulled && (sale.returnedTotal || 0) > 0;
  const finalTotal = sale.total - (sale.returnedTotal || 0);

  const rowBg = isAnnulled ? 'bg-red-50 text-gray-500' : hasPartialReturn ? 'bg-orange-50' : 'bg-white';
  const hoverBg = isAnnulled ? 'hover:bg-red-100' : hasPartialReturn ? 'hover:bg-orange-100' : 'hover:bg-gray-50';

  const totalEcheqs = useMemo(
    () => sale.payment.echeqs?.reduce((sum, e) => sum + e.amount, 0) || 0,
    [sale.payment.echeqs]
  );

  return (
    <tr
      className={`${rowBg} ${hoverBg} transition-colors border-b cursor-pointer select-none`}
      onClick={() => onOpenActions(sale)}
    >
      <td className="px-2 py-4 text-center min-w-[140px]">
        <div className="flex flex-col items-center gap-1">
          <span className="inline-block px-2 py-1 text-xs font-semibold rounded" style={{background: isBudget ? '#dbeafe' : isAnnulled ? '#fee2e2' : '#dcfce7', color: isBudget ? '#1e40af' : isAnnulled ? '#991b1b' : '#166534'}}>
            {isBudget ? 'Presupuesto' : isAnnulled ? 'Venta Anulada' : 'Venta'}
          </span>
          {isAnnulled && (
            <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">
              Anulada
            </span>
          )}
          {showBilledBadge && (
            <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
              Facturada
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-4 text-sm font-mono w-20 min-w-[80px]">
        <div className="flex flex-col items-start gap-0.5">
          <span>{sale.saleNumber ? `#${sale.saleNumber}` : sale.id.slice(0, 8)}</span>
          {hasCreditNotes && returnedTotal > 0 && (
            <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-100 text-amber-800 whitespace-nowrap">
              {`${ncBadgeLabel} $${returnedTotalLabel}`}
            </span>
          )}
          {sale.cashierPendingNumber && (
            <span className="text-xs text-blue-600 font-sans font-medium whitespace-nowrap">
              Pedido caja #{sale.cashierPendingNumber}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm min-w-[200px]">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">{new Date(sale.date).toLocaleString('es-AR')}</span>
          <span className="font-medium truncate" title={sale.customer ? sale.customer['Nombre y Apellido'] : 'Consumidor Final'}>
            {sale.customer ? sale.customer['Nombre y Apellido'] : 'Consumidor Final'}
          </span>
        </div>
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-center w-16 min-w-[60px]">{sale.itemCount}</td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isAnnulled ? '-' : formatCurrency(sale.subtotal)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-16 min-w-[70px]">
        {isAnnulled ? '-' : formatCurrency(sale.adjustmentAmount || 0)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[90px]">
        {hasPartialReturn || isAnnulled ? (
          <div>
            <span className="line-through text-gray-400 mr-2">${sale.total.toLocaleString('es-AR')}</span>
            <span className="font-bold text-gray-900">${finalTotal.toLocaleString('es-AR')}</span>
          </div>
        ) : (
          <span className="font-bold text-gray-900">${sale.total.toLocaleString('es-AR')}</span>
        )}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isAnnulled ? '-' : formatCurrency(sale.payment.cash)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isAnnulled ? '-' : formatCurrency(sale.payment.digital)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isAnnulled ? '-' : formatCurrency(totalEcheqs)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-sm text-right w-20 min-w-[80px]">
        {isAnnulled ? '-' : formatCurrency(sale.payment.credit)}
      </td>
      <td className="px-2 py-4 whitespace-nowrap text-right text-sm font-medium w-32 min-w-[120px]">
        <div className="flex items-center justify-end space-x-2">
          {isBilled && hasTicket80 && officialTicket80Url && (
            <a
              href={officialTicket80Url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="px-2 py-1 text-[11px] rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              title={`Ver/Reimprimir ticket oficial 80 mm ${sale.facturaInfo?.nro || ''}`}
            >
              80mm
            </a>
          )}
          {isBilled && hasA4 && officialTicketA4Url && (
            <a
              href={officialTicketA4Url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="px-2 py-1 text-[11px] rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              title={`Ver/Reimprimir ticket oficial A4 ${sale.facturaInfo?.nro || ''}`}
            >
              A4
            </a>
          )}
          <button
            onClick={e => {
              e.stopPropagation();
              onOpenActions(sale);
            }}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
          >
            <Icon
              path="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
              className="w-5 h-5"
            />
          </button>
        </div>
      </td>
    </tr>
  );
});
SaleRow.displayName = 'SaleRow';

interface SalesDashboardProps {
  title: string;
  salesData: Sale[];
  customers: Customer[];
  refreshData: () => void;
  isLoading: boolean;
  headerChildren?: React.ReactNode;
  noDataMessage: string;
  statTitlePrefix?: string;
  showStats?: boolean;
  searchBarAddon?: React.ReactNode;
  onEditSale?: (sale: Sale) => void;
  accountTransactions?: AccountTransaction[];
}

export const SalesDashboard: React.FC<
  SalesDashboardProps & { searchTerm?: string; stickyStats?: boolean; stickyFilters?: boolean }
> = ({
  salesData,
  customers,
  refreshData,
  headerChildren,
  noDataMessage,
  statTitlePrefix = '',
  showStats = true,
  onEditSale,
  searchTerm: externalSearchTerm,
  stickyStats = false,
  stickyFilters = false,
  accountTransactions = [],
}) => {
  const [internalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  const [saleForCreditNote, setSaleForCreditNote] = useState<Sale | null>(null);
  const [saleToBill, setSaleToBill] = useState<Sale | null>(null);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    columns: any[];
    data: any[];
    summary?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  }>({
    isOpen: false,
    title: '',
    columns: [],
    data: [],
  });

  const [selectedItemForActions, setSelectedItemForActions] = useState<{
    type: 'sale' | 'note';
    item: Sale | AccountTransaction;
  } | null>(null);
  const [linkedCreditNotesForSelectedSale, setLinkedCreditNotesForSelectedSale] = useState<AccountTransaction[]>([]);
  const [isLoadingLinkedCreditNotes, setIsLoadingLinkedCreditNotes] = useState(false);
  const [isGeneratingPendingNc, setIsGeneratingPendingNc] = useState(false);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [saleToDeleteId, setSaleToDeleteId] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const [sendModalState, setSendModalState] = useState<{ isOpen: boolean; sale: Sale | null }>({
    isOpen: false,
    sale: null,
  });
  const [targetCustomerId, setTargetCustomerId] = useState<string>('');

  // Eliminados duplicados de estados y contextos
  const [paymentEditState, setPaymentEditState] = useState<{
    isOpen: boolean;
    sale: Sale | null;
    cash: string;
    digital: string;
    credit: string;
    isSaving: boolean;
  }>({
    isOpen: false,
    sale: null,
    cash: '0',
    digital: '0',
    credit: '0',
    isSaving: false,
  });
  const [budgetCheckoutState, setBudgetCheckoutState] = useState<{
    isOpen: boolean;
    sale: SaleWithDocumentType | null;
    preSelectedCustomer: Customer | null;
    isSaving: boolean;
  }>({
    isOpen: false,
    sale: null,
    preSelectedCustomer: null,
    isSaving: false,
  });
  const [patchedPayments, setPatchedPayments] = useState<Map<string, { cash: number; digital: number; credit: number }>>(new Map());
  const [patchedAdjustments, setPatchedAdjustments] = useState<Map<string, { adjustmentAmount: number; adjustmentDescription: string; total: number }>>(new Map());
  const [patchedSaleVisualState, setPatchedSaleVisualState] = useState<
    Map<string, { status?: 'active' | 'annulled'; returnedTotal?: number }>
  >(new Map());
  const { activeShift, currentUser } = useContext(AuthContext);
  const { addToast } = useToast();
  const isSellerRole = currentUser?.Rol === 'Vendedor';
  const canEditPaymentRole = currentUser ? ['Admin', 'Cajero'].includes(currentUser.Rol) : false;
  // Permisos: permitir eliminar a Admin, Oficina, Encargado y Cajero
  const canDeleteSale = currentUser && ['Admin', 'Oficina', 'Encargado', 'Cajero'].includes(currentUser.Rol);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenActions = useCallback((item: Sale | AccountTransaction, type: 'sale' | 'note') => {
    setSelectedItemForActions({ type, item });
  }, []);

  const loadLinkedCreditNotesForSale = useCallback(
    async (sale: SaleWithDocumentType) => {
      setIsLoadingLinkedCreditNotes(true);
      try {
        const notes = await api.getCreditNotesLinkedToSale(sale);
        setLinkedCreditNotesForSelectedSale(notes);
      } catch (error) {
        console.error('Failed to load linked credit notes:', error);
        addToast(
          `No se pudieron cargar las notas de credito vinculadas: ${
            error instanceof Error ? error.message : 'Error desconocido'
          }`,
          'error'
        );
        setLinkedCreditNotesForSelectedSale([]);
      } finally {
        setIsLoadingLinkedCreditNotes(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (!selectedItemForActions || selectedItemForActions.type !== 'sale') {
      setLinkedCreditNotesForSelectedSale([]);
      setIsLoadingLinkedCreditNotes(false);
      return;
    }

    const selectedSale = selectedItemForActions.item as SaleWithDocumentType;
    if (selectedSale.document_type === 'budget') {
      setLinkedCreditNotesForSelectedSale([]);
      setIsLoadingLinkedCreditNotes(false);
      return;
    }

    let isCancelled = false;

    void (async () => {
      await loadLinkedCreditNotesForSale(selectedSale);
      if (isCancelled) return;
    })();

    return () => {
      isCancelled = true;
    };
  }, [selectedItemForActions, loadLinkedCreditNotesForSale]);

  // Clear optimistic patches when parent provides fresh salesData after a real refresh
  useEffect(() => {
    setPatchedPayments(prev => (prev.size === 0 ? prev : new Map()));
    setPatchedAdjustments(prev => (prev.size === 0 ? prev : new Map()));
    setPatchedSaleVisualState(prev => (prev.size === 0 ? prev : new Map()));
  }, [salesData]);

  // Apply optimistic payment and adjustment patches so the UI updates immediately after save.
  const effectiveSalesData = useMemo(() => {
    if (patchedPayments.size === 0 && patchedAdjustments.size === 0 && patchedSaleVisualState.size === 0) return salesData;
    return salesData.map(sale => {
      let nextSale = sale;

      const adjustmentPatch = patchedAdjustments.get(sale.id);
      if (adjustmentPatch) {
        nextSale = {
          ...nextSale,
          adjustmentAmount: adjustmentPatch.adjustmentAmount,
          adjustmentDescription: adjustmentPatch.adjustmentDescription,
          total: adjustmentPatch.total,
        };
      }

      const patch = patchedPayments.get(sale.id);
      if (patch) {
        nextSale = {
          ...nextSale,
          payment: { ...nextSale.payment, cash: patch.cash, digital: patch.digital, credit: patch.credit },
        };
      }

      const visualPatch = patchedSaleVisualState.get(sale.id);
      if (visualPatch) {
        nextSale = {
          ...nextSale,
          status: visualPatch.status ?? nextSale.status,
          returnedTotal:
            typeof visualPatch.returnedTotal === 'number' ? visualPatch.returnedTotal : nextSale.returnedTotal,
        };
      }

      return nextSale;
    });
  }, [salesData, patchedAdjustments, patchedPayments, patchedSaleVisualState]);

  const selectedSaleAnyCreditNotes = useMemo(() => {
    if (!selectedItemForActions || selectedItemForActions.type !== 'sale') return [];

    const sourceNotes = linkedCreditNotesForSelectedSale.length > 0
      ? linkedCreditNotesForSelectedSale
      : ((selectedItemForActions.item as Sale).creditNotes || []);

    return sourceNotes.slice().sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedItemForActions, linkedCreditNotesForSelectedSale]);

  const selectedSaleCreditNotes = useMemo(() => {
    const sourceNotes = selectedSaleAnyCreditNotes;

    const validNotes = sourceNotes
      .filter(note => isCreditNoteFiscalDocument(note.facturaInfo))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (sourceNotes.length > 0 && validNotes.length === 0) {
      console.warn('[NC_FISCAL_INVALID_OR_MISSING]', {
        saleId: selectedItemForActions && selectedItemForActions.type === 'sale'
          ? (selectedItemForActions.item as Sale).id
          : null,
        noteIds: sourceNotes.map(note => note.id),
      });
    }

    return validNotes;
  }, [selectedItemForActions, selectedSaleAnyCreditNotes]);

  const selectedSaleAccountingCreditNote = useMemo(
    () => selectedSaleAnyCreditNotes[0] || null,
    [selectedSaleAnyCreditNotes]
  );

  const selectedSaleGeneratedCreditNote = useMemo(
    () =>
      selectedSaleCreditNotes.find(note => note.facturaInfo?.ticketUrl || note.facturaInfo?.pdfUrl || note.facturaInfo?.url) ||
      selectedSaleCreditNotes.find(note => note.facturaInfo?.cae || note.facturaInfo?.invoiceNumber || note.facturaInfo?.nro) ||
      null,
    [selectedSaleCreditNotes]
  );

  const filteredSales = useMemo(() => {
    if (!effectiveSalesData) return [];
    const term = debouncedSearchTerm.toLowerCase().trim();
    if (!term) return effectiveSalesData;

    return effectiveSalesData.filter(s => {
      const customer = s.customer;
      const customerName = customer ? customer['Nombre y Apellido'] : 'Consumidor Final';
      const customerDoc = customer?.Documento || '';
      const customerId = customer?.Id_Cliente || '';
      const saleId = s.id || '';
      const saleNumber = s.saleNumber ? String(s.saleNumber) : '';
      const invoiceNro = s.facturaInfo?.nro || '';
      const whatsapp = customer?.Whatsapp || '';

      return (
        customerName.toLowerCase().includes(term) ||
        customerDoc.toLowerCase().includes(term) ||
        customerId.toLowerCase().includes(term) ||
        saleId.toLowerCase().includes(term) ||
        saleNumber.includes(term) ||
        invoiceNro.toLowerCase().includes(term) ||
        whatsapp.toLowerCase().includes(term)
      );
    });
  }, [effectiveSalesData, debouncedSearchTerm]);

  const stats = useMemo(() => {
    const completedSales = filteredSales.filter(sale => sale.status !== 'annulled');
    const completedRealSales = completedSales.filter(sale => sale.document_type !== 'budget');
    const salesRevenue = completedRealSales.reduce((sum, sale) => sum + (sale.total - (sale.returnedTotal || 0)), 0);

    const totalProductsSold = completedRealSales.reduce((sum, sale) => {
      const originalCount = sale.itemCount;
      const returnedCount =
        sale.creditNotes?.reduce((noteSum, note) => {
          return noteSum + (note.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0);
        }, 0) || 0;
      return sum + (originalCount - returnedCount);
    }, 0);

    const salesCash = completedRealSales.reduce((sum, sale) => sum + sale.payment.cash, 0);
    const salesDigital = completedRealSales.reduce((sum, sale) => sum + sale.payment.digital, 0);
    const totalCredit = completedRealSales.reduce((sum, sale) => sum + sale.payment.credit, 0);
    const totalEcheq = completedRealSales.reduce(
      (sum, sale) => sum + (sale.payment.echeqs?.reduce((eSum, e) => eSum + e.amount, 0) || 0),
      0
    );

    // Pagos de cuenta corriente (registrados desde Clientes)
    const customerPayments = accountTransactions.filter(
      t => t.type === 'Pago' && t.credit > 0
    );
    const customerPaymentsCash = customerPayments
      .filter(t => t.payment_method === 'efectivo')
      .reduce((sum, t) => sum + t.credit, 0);
    const customerPaymentsDigital = customerPayments
      .filter(t => t.payment_method === 'digital')
      .reduce((sum, t) => sum + t.credit, 0);
    const customerPaymentsTotal = customerPayments.reduce((sum, t) => sum + t.credit, 0);

    const customerPaymentsKpi = {
      count: customerPayments.length,
      total: customerPaymentsTotal,
      cash: customerPaymentsCash,
      digital: customerPaymentsDigital,
    };
    console.log('[HIST_CUSTOMER_PAYMENTS_KPI]', customerPaymentsKpi);

    const totalRevenue = salesRevenue;
    const totalCash = salesCash + customerPaymentsCash;
    const totalDigital = salesDigital + customerPaymentsDigital;

    const finalKpis = { totalRevenue, totalCash, totalDigital, totalCredit, totalEcheq, customerPaymentsTotal };
    console.log('[HIST_FINAL_KPI_WITH_CUSTOMER_PAYMENTS]', finalKpis);

    return {
      totalRevenue,
      salesCount: completedRealSales.length,
      totalProductsSold,
      totalCash,
      totalDigital,
      totalCredit,
      totalEcheq,
      customerPaymentsTotal,
    };
  }, [filteredSales, accountTransactions]);

  const differenceData = useMemo(() => {
    const completedSales = filteredSales.filter(
      sale => sale.status !== 'annulled' && sale.document_type !== 'budget'
    );

    const saleDiffRows = completedSales
      .map(sale => {
        const echeqTotal = sale.payment.echeqs?.reduce((sum, e) => sum + e.amount, 0) || 0;
        const paymentSum = sale.payment.cash + sale.payment.digital + sale.payment.credit + echeqTotal;
        const difference = sale.total - paymentSum;
        const absDifference = Math.abs(difference);

        return {
          sale,
          paymentSum,
          difference,
          absDifference,
        };
      })
      .filter(item => item.absDifference > 1)
      .sort((a, b) => b.absDifference - a.absDifference);

    const detailRows = saleDiffRows;
    const differenceTotal = detailRows.reduce((sum, item) => sum + item.difference, 0);

    return {
      differenceTotal,
      isMinorOnly: Math.abs(differenceTotal) <= 1,
      detailRows,
    };
  }, [filteredSales]);

  const whatsAppCustomers = useMemo(
    () =>
      customers
        .filter(c => c.Whatsapp && c.Id_Cliente !== '0')
        .sort((a, b) => a['Nombre y Apellido'].localeCompare(b['Nombre y Apellido'])),
    [customers]
  );

  const customersMap = useMemo(
    () => new Map(customers.map(c => [c.Id_Cliente, c])),
    [customers]
  );

  const paymentTransactions = useMemo(
    () => (accountTransactions || []).filter(t => t.type === 'Pago' && t.credit > 0),
    [accountTransactions]
  );

  type DisplayItem =
    | { type: 'sale'; date: Date; id: string; sale: Sale & { document_type?: string } }
    | { type: 'payment'; date: Date; id: string; payment: AccountTransaction };

  const mergedDisplayItems = useMemo((): DisplayItem[] => {
    const salesItems: DisplayItem[] = filteredSales.map(s => ({
      type: 'sale' as const,
      date: s.date instanceof Date ? s.date : new Date(s.date as any),
      id: s.id,
      sale: s as Sale & { document_type?: string },
    }));
    const paymentItems: DisplayItem[] = paymentTransactions.map(t => ({
      type: 'payment' as const,
      date: t.date instanceof Date ? t.date : new Date(t.date as any),
      id: t.id,
      payment: t,
    }));
    return [...salesItems, ...paymentItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredSales, paymentTransactions]);

  const handleShowRevenueDetails = useCallback(() => {
    const completedSales = salesData.filter(s => s.status !== 'annulled' && s.document_type !== 'budget');
    setModalConfig({
      isOpen: true,
      title: `Detalle de Ingresos ${statTitlePrefix}`,
      columns: [
        {
          header: 'Fecha/Hora',
          accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR'),
          className: 'whitespace-nowrap',
        },
        {
          header: 'Cliente',
          accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final',
        },
        {
          header: 'Total',
          accessor: (s: Sale) => formatCurrency(s.total - (s.returnedTotal || 0)),
          className: 'text-right font-medium',
        },
      ],
      data: completedSales,
      summary: <p>Total: {formatCurrency(stats.totalRevenue)}</p>,
    });
  }, [salesData, statTitlePrefix, stats.totalRevenue]);

  const handleShowCashDetails = useCallback(() => {
    const cashSales = salesData.filter(
      s => s.status !== 'annulled' && s.document_type !== 'budget' && s.payment.cash > 0
    );
    setModalConfig({
      isOpen: true,
      title: `Detalle de Ingresos en Efectivo ${statTitlePrefix}`,
      columns: [
        { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
        { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
        {
          header: 'Monto Efectivo',
          accessor: (s: Sale) => formatCurrency(s.payment.cash),
          className: 'text-right font-medium',
        },
      ],
      data: cashSales,
      summary: <p>Total Efectivo: {formatCurrency(stats.totalCash)}</p>,
    });
  }, [salesData, statTitlePrefix, stats.totalCash]);

  const handleShowDigitalDetails = useCallback(() => {
    const digitalSales = salesData.filter(
      s => s.status !== 'annulled' && s.document_type !== 'budget' && s.payment.digital > 0
    );
    setModalConfig({
      isOpen: true,
      title: `Detalle de Ingresos Digitales ${statTitlePrefix}`,
      columns: [
        { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
        { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
        {
          header: 'Monto Digital',
          accessor: (s: Sale) => formatCurrency(s.payment.digital),
          className: 'text-right font-medium',
        },
      ],
      data: digitalSales,
      summary: <p>Total Digital: {formatCurrency(stats.totalDigital)}</p>,
    });
  }, [salesData, statTitlePrefix, stats.totalDigital]);

  const handleShowCreditDetails = useCallback(() => {
    const creditSales = salesData.filter(
      s => s.status !== 'annulled' && s.document_type !== 'budget' && s.payment.credit > 0
    );
    setModalConfig({
      isOpen: true,
      title: `Detalle de Ventas a Crédito ${statTitlePrefix}`,
      columns: [
        { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
        { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
        {
          header: 'Monto a Crédito',
          accessor: (s: Sale) => formatCurrency(s.payment.credit),
          className: 'text-right font-medium',
        },
      ],
      data: creditSales,
      summary: <p>Total a Crédito: {formatCurrency(stats.totalCredit)}</p>,
    });
  }, [salesData, statTitlePrefix, stats.totalCredit]);

  const handleShowEcheqDetails = useCallback(() => {
    const echeqSales = salesData.filter(s => s.status !== 'annulled' && s.payment.echeqs?.length > 0);
    setModalConfig({
      isOpen: true,
      title: `Detalle de Pagos con E-Cheq ${statTitlePrefix}`,
      columns: [
        { header: 'Fecha/Hora', accessor: (s: Sale) => new Date(s.date).toLocaleString('es-AR') },
        { header: 'Cliente', accessor: (s: Sale) => s.customer?.['Nombre y Apellido'] || 'Consumidor Final' },
        {
          header: 'Monto E-Cheq',
          accessor: (s: Sale) => formatCurrency(s.payment.echeqs.reduce((sum, e) => sum + e.amount, 0)),
          className: 'text-right font-medium',
        },
        {
          header: 'Detalle',
          accessor: (s: Sale) => s.payment.echeqs.map(e => `$${e.amount} (${e.days}d)`).join(', '),
          className: 'text-center',
        },
      ],
      data: echeqSales,
      summary: <p>Total E-Cheq: {formatCurrency(stats.totalEcheq)}</p>,
    });
  }, [salesData, statTitlePrefix, stats.totalEcheq]);

  const handleShowPaymentsDetails = useCallback(() => {
    setModalConfig({
      isOpen: true,
      title: `Detalle de Cobros de Deuda ${statTitlePrefix}`,
      columns: [
        { header: 'Fecha', accessor: (t: AccountTransaction) => new Date(t.date).toLocaleString('es-AR') },
        { header: 'Cliente', accessor: (t: AccountTransaction) => customersMap.get(t.customer_id || '')?.['Nombre y Apellido'] || '(sin cliente)' },
        { header: 'Método', accessor: (t: AccountTransaction) => t.payment_method || '-' },
        { header: 'Descripción', accessor: (t: AccountTransaction) => t.description || '-' },
        { header: 'Monto', accessor: (t: AccountTransaction) => formatCurrency(t.credit), className: 'text-right font-medium' },
      ],
      data: paymentTransactions,
      summary: <p>Total Cobros CC: {formatCurrency(stats.customerPaymentsTotal)}</p>,
    });
  }, [paymentTransactions, statTitlePrefix, stats.customerPaymentsTotal, customersMap]);

  const handleShowProductsSoldDetails = useCallback(() => {
    const soldItems = new Map<string, { product: Product; quantity: number }>();

    salesData
      .filter(s => s.status !== 'annulled')
      .forEach(sale => {
        sale.items.forEach(item => {
          const current = soldItems.get(item.product.cod) || { product: item.product, quantity: 0 };
          current.quantity += item.quantity;
          soldItems.set(item.product.cod, current);
        });

        sale.creditNotes?.forEach(note => {
          note.items?.forEach(item => {
            const current = soldItems.get(item.product.cod);
            if (current) current.quantity -= item.quantity;
          });
        });
      });

    const productsSoldList = Array.from(soldItems.values())
      .filter(item => item.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);

    setModalConfig({
      isOpen: true,
      title: `Detalle de Productos Vendidos ${statTitlePrefix}`,
      columns: [
        { header: 'Producto', accessor: (item: { product: Product }) => item.product.Producto },
        { header: 'Código', accessor: (item: { product: Product }) => item.product.cod },
        { header: 'Cantidad Neta Vendida', accessor: 'quantity', className: 'text-center font-bold' },
      ],
      data: productsSoldList,
      summary: <p>Total Unidades: {stats.totalProductsSold}</p>,
    });
  }, [salesData, statTitlePrefix, stats.totalProductsSold]);

  const handleShowDifferenceDetails = useCallback(() => {
    setModalConfig({
      isOpen: true,
      title: `Detalle de Diferencias ${statTitlePrefix}`,
      size: '5xl',
      columns: [
        {
          header: 'ID Venta',
          accessor: (item: { sale: Sale }) => item.sale.id.slice(0, 8),
          className: 'whitespace-nowrap font-mono text-xs',
        },
        {
          header: 'Fecha',
          accessor: (item: { sale: Sale }) => new Date(item.sale.date).toLocaleDateString('es-AR'),
          className: 'whitespace-nowrap text-xs',
        },
        {
          header: 'Cliente',
          accessor: (item: { sale: Sale }) => item.sale.customer?.['Nombre y Apellido'] || 'Cons. Final',
          className: 'max-w-[160px] truncate text-xs',
        },
        {
          header: 'Total',
          accessor: (item: { sale: Sale }) => formatCurrency(item.sale.total),
          className: 'text-right font-medium whitespace-nowrap text-xs',
          headerClassName: 'text-right',
        },
        {
          header: 'Suma Pagos',
          accessor: (item: { paymentSum: number }) => formatCurrency(item.paymentSum),
          className: 'text-right font-medium whitespace-nowrap text-xs',
          headerClassName: 'text-right',
        },
        {
          header: 'Diferencia',
          accessor: (item: { difference: number }) => formatCurrency(item.difference),
          className: 'text-right font-bold whitespace-nowrap text-xs',
          headerClassName: 'text-right',
        },
        {
          header: 'Acción',
          accessor: (item: { sale: Sale }) => (
            <button
              type="button"
              onClick={() => {
                handleOpenPaymentEditModal(item.sale, { closeSummaryModal: true });
              }}
              className="px-2 py-1 text-xs font-medium rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              Editar
            </button>
          ),
          className: 'text-center',
          headerClassName: 'text-center',
        },
      ],
      data: differenceData.detailRows,
      summary: <p>Diferencia total: {formatCurrency(differenceData.differenceTotal)}</p>,
    });
  }, [differenceData.detailRows, differenceData.differenceTotal, statTitlePrefix]);

  const handleOpenPaymentEditModal = useCallback((sale: Sale, options?: { closeSummaryModal?: boolean; closeActionsMenu?: boolean }) => {
    const canEditPayment = currentUser && ['Admin', 'Cajero'].includes(currentUser.Rol);
    if (!canEditPayment) {
      addToast('Solo Admin o Cajero pueden editar el cobro.', 'error');
      return;
    }

    if (isSaleCancelled(sale)) {
      addToast('No se puede editar el cobro de una venta anulada.', 'error');
      return;
    }

    if (hasTotalCreditNote(sale)) {
      addToast('No se puede editar el cobro de una venta con nota de crédito total.', 'error');
      return;
    }

    if (options?.closeSummaryModal) {
      setModalConfig(prev => ({ ...prev, isOpen: false }));
    }

    if (options?.closeActionsMenu) {
      setSelectedItemForActions(null);
    }

    const saleForEdit = normalizeSaleForPaymentEdit(sale);
    const saleAny = sale as any;
    const normalizedPayment = saleForEdit.payment;

    if ((import.meta as any)?.env?.DEV) {
      console.debug('[EDIT_PAYMENT_SOURCE_DEBUG]', {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        total: sale.total,
        payment: saleAny?.payment,
        paymentCash: saleAny?.payment?.cash,
        paymentDigital: saleAny?.payment?.digital,
        paymentCredit: saleAny?.payment?.credit,
        paymentEcheqs: saleAny?.payment?.echeqs,
        payment_cash: saleAny?.payment_cash,
        payment_digital: saleAny?.payment_digital,
        payment_credit: saleAny?.payment_credit,
        paymentCashAlias: saleAny?.paymentCash,
        paymentDigitalAlias: saleAny?.paymentDigital,
        paymentCreditAlias: saleAny?.paymentCredit,
        Pago_Efectivo: saleAny?.Pago_Efectivo,
        Pago_Digital: saleAny?.Pago_Digital,
        Pago_Cuenta_Corriente: saleAny?.Pago_Cuenta_Corriente,
        Efectivo: saleAny?.Efectivo,
        Digital: saleAny?.Digital,
        CtaCte: saleAny?.CtaCte,
        normalizedPayment,
      });
    }

    setPaymentEditState({
      isOpen: true,
      sale: saleForEdit,
      cash: formatMoneyInput(Number(normalizedPayment.cash || 0)),
      digital: formatMoneyInput(Number(normalizedPayment.digital || 0)),
      credit: formatMoneyInput(Number(normalizedPayment.credit || 0)),
      isSaving: false,
    });
  }, [addToast, currentUser]);

  const handleClosePaymentEditModal = useCallback(() => {
    if (paymentEditState.isSaving) return;
    setPaymentEditState({
      isOpen: false,
      sale: null,
      cash: '0',
      digital: '0',
      credit: '0',
      isSaving: false,
    });
  }, [paymentEditState.isSaving]);

  const handleCloseBudgetCheckoutModal = useCallback(() => {
    if (budgetCheckoutState.isSaving) return;
    setBudgetCheckoutState({
      isOpen: false,
      sale: null,
      preSelectedCustomer: null,
      isSaving: false,
    });
  }, [budgetCheckoutState.isSaving]);

  const handleFinalizeCheckoutPaymentEdit = useCallback(async (updatedSale: Sale) => {
    if (!paymentEditState.sale) throw new Error('No hay venta para editar.');

    const payment = updatedSale.payment || { cash: 0, digital: 0, credit: 0, echeqs: [] };
    const cash = Number(payment.cash || 0);
    const digital = Number(payment.digital || 0);
    const credit = Number(payment.credit || 0);
    const echeqs = Array.isArray(payment.echeqs) ? payment.echeqs : [];
    const echeqTotal = echeqs.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
    const expectedTotal = Number(paymentEditState.sale.total || 0);
    const totalPaid = cash + digital + credit + echeqTotal;

    if (Math.abs(totalPaid - expectedTotal) > PAYMENT_EDIT_TOLERANCE) {
      throw new Error('La suma de medios de pago debe coincidir con el total de la venta.');
    }

    setPaymentEditState(prev => ({ ...prev, isSaving: true }));

    try {
      await api.updateSalePaymentAllocation(paymentEditState.sale.id, { cash, digital, credit, echeqs } as any);

      const savedSaleId = paymentEditState.sale.id;
      setPatchedPayments(prev => {
        const next = new Map(prev);
        next.set(savedSaleId, { cash, digital, credit });
        return next;
      });

      addToast('Cobro actualizado correctamente.', 'success');
      handleClosePaymentEditModal();
      await refreshData();
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : typeof (error as any)?.message === 'string'
            ? (error as any).message
            : JSON.stringify(error);
      addToast(`No se pudo actualizar los pagos: ${errMsg}`, 'error');
      setPaymentEditState(prev => ({ ...prev, isSaving: false }));
      throw error;
    }
  }, [addToast, handleClosePaymentEditModal, paymentEditState.sale, refreshData]);


  const handleView = useCallback(
    (sale: Sale) => {
      if (sale.facturaInfo) {
        const officialUrl = sale.facturaInfo.ticketUrl || sale.facturaInfo.url;
        if (officialUrl) {
          window.open(officialUrl, '_blank');
          return;
        }
      }

      const printStyles = getPrintStyles();
      const ticketHtml =
        sale.facturaInfo && sale.facturaInfo.cae
          ? generateInvoiceHtml(sale, printStyles)
          : generateReceiptHtml(sale, printStyles);

      const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
      if (ticketWindow) {
        ticketWindow.document.write(ticketHtml);
        ticketWindow.document.close();
      } else {
        addToast('La ventana del ticket fue bloqueada. Habilite las ventanas emergentes.', 'error');
      }
    },
    [addToast]
  );

  const handleOpenRegeneratedFiscalDocument = useCallback(
    async (sale: Sale, docType: 'a4' | 'ticket80') => {
      try {
        const regenerated = await api.regenerateBillingUrlsForSale(sale.id);
        const targetUrl = docType === 'a4' ? regenerated.pdf_url : regenerated.ticket_url;

        if (!targetUrl) {
          addToast(
            docType === 'a4'
              ? 'No se obtuvo una URL vigente para el PDF A4 oficial.'
              : 'No se obtuvo una URL vigente para el Ticket 80mm oficial.',
            'error'
          );
          return;
        }

        const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        if (!win) {
          addToast('La ventana fue bloqueada. Habilite las ventanas emergentes.', 'error');
        }
      } catch (error) {
        const errMsg =
          error instanceof Error
            ? error.message
            : typeof (error as any)?.message === 'string'
              ? (error as any).message
              : 'Error desconocido';
        addToast(`No se pudo regenerar el comprobante fiscal: ${errMsg}`, 'error');
      }
    },
    [addToast]
  );

  const handleOpenCreditNoteFiscalDocument = useCallback(
    (note: AccountTransaction, docType: 'ticket' | 'pdf') => {
      const targetUrl = getCreditNoteFiscalDocumentUrl(note, docType);

      if (!targetUrl) {
        addToast(
          docType === 'pdf'
            ? 'La nota de credito no tiene PDF fiscal disponible.'
            : 'La nota de credito no tiene ticket fiscal disponible.',
          'error'
        );
        return;
      }

      const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        addToast('La ventana fue bloqueada. Habilite las ventanas emergentes.', 'error');
      }
    },
    [addToast]
  );

  const handleGeneratePendingFiscalCreditNote = useCallback(
    async (sale: SaleWithDocumentType) => {
      if (sale.document_type === 'budget') return;
      if (!sale.facturaInfo?.cae) {
        addToast('La venta no tiene una factura original fiscal valida para generar NC pendiente.', 'error');
        return;
      }

      setIsGeneratingPendingNc(true);
      console.log('[PENDING_NC_START]', sale);

      try {
        const accountingNote = selectedSaleAccountingCreditNote;
        const itemsForNc = accountingNote?.items?.length ? accountingNote.items : sale.items;
        const totalForNc = Number(accountingNote?.credit || sale.total || 0);
        const descriptionForNc =
          accountingNote?.description || 'Nota de credito fiscal pendiente regularizada';

        if (!itemsForNc?.length || totalForNc <= 0) {
          throw new Error('No hay datos de items o total para generar la NC fiscal pendiente.');
        }

        const originalInvoiceType = String(sale.facturacion || '').toUpperCase();
        const requestedTipo = originalInvoiceType;
        const sentTipo =
          requestedTipo === 'A'
            ? 'NOTA DE CREDITO A'
            : requestedTipo === 'B'
              ? 'NOTA DE CREDITO B'
              : requestedTipo === 'C'
                ? 'NOTA DE CREDITO C'
                : 'NOTA DE CREDITO B';
        const expectedCbteTipo =
          requestedTipo === 'A' ? 3 : requestedTipo === 'B' ? 8 : requestedTipo === 'C' ? 13 : 8;
        const payloadToArca = {
          saleForInvoice: {
            ...sale,
            items: itemsForNc,
            isCreditNote: true,
            cbteTipo: expectedCbteTipo,
            comprobante_tipo: sentTipo,
            requested_tipo: requestedTipo,
            sent_tipo: sentTipo,
            facturaInfo: sale.facturaInfo,
          },
        };

        console.log('[PENDING_NC_PAYLOAD_TO_ARCA]', payloadToArca);

        const response = await api.generateElectronicCreditNote(sale, itemsForNc);
        console.log('[PENDING_NC_ARCA_RESPONSE]', {
          response,
          data: response?.data,
          cbteTipoEnviado: payloadToArca.saleForInvoice.cbteTipo,
          comprobanteTipoEnviado: payloadToArca.saleForInvoice.comprobante_tipo,
          requestedTipoEnviado: payloadToArca.saleForInvoice.requested_tipo,
          sentTipoEnviado: payloadToArca.saleForInvoice.sent_tipo,
          saleForInvoiceIsCreditNote: payloadToArca.saleForInvoice.isCreditNote,
          saleForInvoiceFacturaInfo: payloadToArca.saleForInvoice.facturaInfo,
          tipoOriginalFactura: originalInvoiceType,
          cbteTipoDevuelto: response?.data?.cbteTipo,
          tipoCmpDevuelto: response?.data?.tipoCmp,
          comprobanteTipoDevuelto: response?.data?.comprobante_tipo,
          qrDataDevuelto: response?.data?.qrData,
        });

        const invoiceData = response?.data || {};

        const cae = String(invoiceData.cae || '').trim();
        const nro = String(invoiceData.nro || invoiceData.invoiceNumber || '').trim();
        const pdfUrl = String(
          invoiceData.pdfUrl ||
          invoiceData.url ||
          invoiceData.comprobante_pdf_url ||
          invoiceData.pdf_url ||
          ''
        ).trim();
        const ticketUrl = String(
          invoiceData.ticketUrl ||
          invoiceData.comprobante_ticket_url ||
          invoiceData.ticket_url ||
          pdfUrl ||
          ''
        ).trim();
        const qrData = String(
          invoiceData.qrData ||
          invoiceData.qr_data ||
          invoiceData.billing_qr_data ||
          invoiceData.qr ||
          ''
        ).trim();
        const vtoCae = String(
          invoiceData.vtoCae ||
          invoiceData.vto_cae ||
          invoiceData.vencimiento_cae ||
          ''
        ).trim();

        console.log('[PENDING_NC_NORMALIZED_RESPONSE]', {
          cae,
          nro,
          pdfUrl,
          ticketUrl,
          qrData,
          vtoCae,
        });

        const facturaInfo: any = {
          cae,
          nro,
          invoiceNumber: nro,
          url: pdfUrl,
          pdfUrl,
          ticketUrl,
          qrData,
          vtoCae,
          fecha: new Date().toISOString().slice(0, 10),
          cbteTipo: 3,
          tipoCmp: 3,
          comprobante_tipo: 'NOTA DE CREDITO A',
          requestedTipoEnviado: 'NOTA DE CREDITO A',
          sentTipoEnviado: 'NOTA DE CREDITO A',
        };
        console.log('[NC_FACTURA_INFO_FINAL]', facturaInfo);

        if (!cae || !nro || !pdfUrl || !ticketUrl || !qrData) {
          throw new Error('La respuesta fiscal no contiene cae, nro, pdf, ticket y qrData validos.');
        }

        console.log('[PENDING_NC_FACTURA_INFO]', facturaInfo);

        const result = await api.upsertCreditNoteFiscalInfoForSale({
          saleId: sale.id,
          customerId: sale.customer?.Id_Cliente,
          shiftId: sale.shiftId || activeShift?.ID_Turno,
          total: totalForNc,
          description: descriptionForNc,
          items: itemsForNc,
          facturaInfo,
        });

        console.log('[PENDING_NC_UPDATED_TRANSACTION]', result);

        await refreshData();
        await loadLinkedCreditNotesForSale(sale);
        addToast('NC fiscal pendiente generada y vinculada correctamente.', 'success');
      } catch (error) {
        const errMsg =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null
              ? JSON.stringify(error)
              : String(error);
        addToast(`No se pudo generar la NC fiscal pendiente: ${errMsg}`, 'error');
      } finally {
        setIsGeneratingPendingNc(false);
      }
    },
    [activeShift?.ID_Turno, addToast, loadLinkedCreditNotesForSale, refreshData, selectedSaleAccountingCreditNote]
  );

  const handleViewBudget = useCallback((sale: SaleWithDocumentType) => {
    if (!sale.customer) {
      throw new Error('El presupuesto no tiene cliente asignado.');
    }

    const printableBudget: Budget = {
      id: sale.id,
      date: sale.date,
      customer: sale.customer,
      items: sale.items,
      total: sale.total,
      status: 'pending',
      shiftId: (sale as any).shiftId || '',
      subtotal: sale.subtotal,
      adjustmentAmount: sale.adjustmentAmount,
    };

    const html = generateBudgetHtml(printableBudget);
    openHtmlInNewWindow(html);
  }, []);

  const handleGenerateRemito = useCallback((sale: Sale) => {
    const remitoHtml = generateRemitoHtml(sale);
    openHtmlInNewWindow(remitoHtml, 'width=800,height=600,scrollbars=yes,resizable=yes');
  }, []);

  const handleOpenBudgetCheckout = useCallback((sale: SaleWithDocumentType) => {
    if (sale.document_type !== 'budget') return;

    if (sale.converted_to_sale_id) {
      addToast('Este presupuesto ya fue convertido a venta.', 'info');
      return;
    }

    const customerId = String(sale.customer?.Id_Cliente || '').trim();
    const customerFromList = customerId ? customers.find((c) => c.Id_Cliente === customerId) || null : null;
    const fallbackFinalConsumer =
      customers.find(
        (c) => c.Id_Cliente === '0' || String(c['Nombre y Apellido'] || '').trim().toLowerCase() === 'consumidor final'
      ) || null;

    const preSelectedCustomer = customerFromList || sale.customer || fallbackFinalConsumer || buildSyntheticFinalConsumer();

    setBudgetCheckoutState({
      isOpen: true,
      sale,
      preSelectedCustomer,
      isSaving: false,
    });
  }, [addToast, customers]);

  const handleFinalizeBudgetCheckout = useCallback(async (checkoutSale: Sale, generateInvoice: boolean) => {
    const selectedBudget = budgetCheckoutState.sale;
    if (!selectedBudget) throw new Error('No hay presupuesto seleccionado para convertir.');

    if (selectedBudget.converted_to_sale_id) {
      throw new Error('El presupuesto ya fue convertido anteriormente.');
    }

    if (!currentUser?.ID_Usuario) {
      throw new Error('No se pudo identificar al usuario actual.');
    }

    if (generateInvoice) {
      throw new Error('La conversión de presupuesto no emite factura electrónica en este paso. Convertí sin facturar y facturá desde la venta si corresponde.');
    }

    let operationalShift = activeShift;
    if (!operationalShift && currentUser?.Rol === 'Admin') {
      operationalShift = await api.getAnyActiveShiftSupabase();
    }

    if (!operationalShift) {
      throw new Error('Caja no abierta: abrí un turno activo para convertir el presupuesto.');
    }

    setBudgetCheckoutState((prev) => ({ ...prev, isSaving: true }));

    try {
      const payment = checkoutSale.payment || { cash: 0, digital: 0, credit: 0, echeqs: [] };
      const budgetPayload: Budget = {
        id: selectedBudget.id,
        date: selectedBudget.date,
        customer: selectedBudget.customer,
        items: selectedBudget.items,
        subtotal: Number(selectedBudget.subtotal ?? 0),
        adjustmentAmount: Number(selectedBudget.adjustmentAmount ?? 0),
        total: Number(selectedBudget.total ?? 0),
        status: 'pending',
        converted_to_sale_id: selectedBudget.converted_to_sale_id || null,
        shiftId: selectedBudget.shiftId || '',
      };

      const result = await api.convertBudgetToSaleSupabase(
        budgetPayload,
        payment,
        operationalShift.ID_Turno,
        checkoutSale.facturacion || 'N',
        checkoutSale.customer,
        Number(checkoutSale.total ?? selectedBudget.total ?? 0),
        Number(checkoutSale.adjustmentAmount ?? selectedBudget.adjustmentAmount ?? 0),
        checkoutSale.adjustmentDescription || '',
        currentUser.ID_Usuario
      );

      addToast(
        `Presupuesto convertido correctamente. Venta #${result?.sale_number || '-'} creada.`,
        'success'
      );

      setBudgetCheckoutState({
        isOpen: false,
        sale: null,
        preSelectedCustomer: null,
        isSaving: false,
      });

      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo convertir el presupuesto.';
      addToast(message, 'error');
      setBudgetCheckoutState((prev) => ({ ...prev, isSaving: false }));
      throw error;
    }
  }, [activeShift, addToast, budgetCheckoutState.sale, currentUser, refreshData]);

  const handleOpenSendModal = useCallback(
    (sale: Sale) => {
      setSendModalState({ isOpen: true, sale });

      const originalCustomerIsValid = whatsAppCustomers.some(c => c.Id_Cliente === sale.customer?.Id_Cliente);

      if (originalCustomerIsValid && sale.customer) {
        setTargetCustomerId(sale.customer.Id_Cliente);
      } else if (whatsAppCustomers.length > 0) {
        setTargetCustomerId(whatsAppCustomers[0].Id_Cliente);
      } else {
        setTargetCustomerId('');
      }
    },
    [whatsAppCustomers]
  );

  const handleConfirmAndSend = useCallback(() => {
    const { sale } = sendModalState;

    if (!sale || !targetCustomerId) {
      addToast('Por favor, seleccione un cliente de destino.', 'error');
      return;
    }

    const targetCustomer = customers.find(c => c.Id_Cliente === targetCustomerId);

    if (!targetCustomer || !targetCustomer.Whatsapp) {
      addToast('El cliente seleccionado no tiene un número de WhatsApp válido.', 'error');
      return;
    }

    const saleForSending: Sale = {
      ...sale,
      customer: targetCustomer,
    };

    sendTicketViaWhatsApp(saleForSending, addToast);
    setSendModalState({ isOpen: false, sale: null });
    addToast(`Ticket enviado a ${targetCustomer['Nombre y Apellido']}.`, 'success');
  }, [sendModalState, targetCustomerId, addToast, customers]);

  const handleReprintCreditNote = useCallback(
    (note: AccountTransaction) => {
      const fiscalUrl = getCreditNoteFiscalDocumentUrl(note, 'ticket');
      if (fiscalUrl) {
        const win = window.open(fiscalUrl, '_blank', 'noopener,noreferrer');
        if (!win) {
          addToast('La ventana fue bloqueada. Habilite las ventanas emergentes.', 'error');
        }
        return;
      }

      const normalizedItems = normalizeCreditNoteItemsForPrint(note.items as any[] | undefined);

      const noteAny = note as any;
      const customerNameSnapshot = String(
        noteAny?.customer_name_snapshot || noteAny?.customerName || noteAny?.customer_name || ''
      ).trim();
      const customerDocumentSnapshot = String(
        noteAny?.customer_document_snapshot || noteAny?.customer_document || ''
      ).trim();

      const customer =
        customers.find(c => c.Id_Cliente === String(note.customer_id || '')) ||
        customers.find(c => c.Id_Cliente === '0') ||
        {
          Id_Cliente: '0',
          'Nombre y Apellido': customerNameSnapshot || 'Consumidor Final',
          Whatsapp: '',
          'Tipo.Documento': 'DNI',
          Documento: customerDocumentSnapshot,
          Condicion_IVA: 'Consumidor Final',
          Deuda: 0,
          Pagos: 0,
        };

      if (normalizedItems.length === 0 || !customer) {
        alert('No se puede reimprimir: faltan datos del cliente o de los items.');
        return;
      }

      const creditNote: CreditNote = {
        id: note.id,
        date: note.date,
        customer,
        items: normalizedItems,
        total: note.credit,
        description: note.description,
        originalSaleId: note.originalSaleId || '',
        facturaInfo: note.facturaInfo,
      };

      const printStyles = getPrintStyles();
      const ticketHtml = generateCreditNoteHtml(creditNote, printStyles);

      const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
      if (ticketWindow) {
        ticketWindow.document.write(ticketHtml);
        ticketWindow.document.close();
      }
    },
    [customers, addToast]
  );

  const handleAddCreditNote = useCallback(
    (sale: Sale) => {
      const customerForNote = sale.customer || customers.find(c => c.Id_Cliente === '0');
      if (!customerForNote) {
        alert('No se pudo determinar el cliente para la nota de crédito.');
        return;
      }

      const finalTotal = sale.total - (sale.returnedTotal || 0);
      if (finalTotal <= 0) {
        alert('Esta venta ya ha sido devuelta en su totalidad o anulada. No se puede generar otra nota de crédito.');
        return;
      }

      setSaleForCreditNote({ ...sale, customer: customerForNote });
    },
    [customers]
  );

  const handleSaveCreditNote = useCallback(
    async (data: { items: CartItem[]; description: string; total: number }) => {
      if (!saleForCreditNote || !saleForCreditNote.customer) {
        throw new Error('Venta o cliente no seleccionado.');
      }

      if (!activeShift) {
        addToast('No se puede crear una nota de crédito sin un turno activo.', 'error');
        throw new Error('No active shift');
      }

      const ticketWindow = window.open('', '_blank', 'width=350,height=650,scrollbars=yes,resizable=yes');
      if (ticketWindow) ticketWindow.document.write('Procesando...');

      try {
        console.log('[NCS_FLOW_START]', {
          saleId: saleForCreditNote.id,
          customerId: saleForCreditNote.customer.Id_Cliente,
          itemsCount: data.items.length,
        });

        // Detectar si la venta tiene factura electrónica real: requiere TANTO CAE COMO NRO de comprobante.
        const hasFiscalInvoice = isElectronicallyBilledSale(saleForCreditNote);

        let ncBillingInfo: NormalizedCreditNoteFacturaInfo | undefined;

        if (hasFiscalInvoice) {
          console.log('[NC_FISCAL_FLOW_START]', { saleId: saleForCreditNote.id });

          const userConfirmed = window.confirm(
            `La venta original tiene una factura electrónica (Nro: ${saleForCreditNote.facturaInfo?.nro || 'sin número visible'}).\n¿Desea generar una NOTA DE CRÉDITO ELECTRÓNICA oficial?`
          );

          if (!userConfirmed) {
            if (ticketWindow) ticketWindow.close();
            return;
          }

          addToast('Generando Nota de Crédito Electrónica...', 'info');
          const apiResponse = await api.generateElectronicCreditNote(saleForCreditNote, data.items);
          console.log('[NCS_ARCA_RESPONSE]', apiResponse);

          const normalizedFiscal = normalizeCreditNoteFiscalResponse(apiResponse, saleForCreditNote);
          if (!normalizedFiscal.isValid) {
            if (normalizedFiscal.rawStatus === 'facturado') {
              console.error('[NCS_FISCAL_RESPONSE_INVALID_BUT_EMITTED]', {
                saleId: saleForCreditNote.id,
                response: apiResponse,
              });
              throw new Error('La nota de crédito fue emitida por el proveedor, pero el sistema no pudo guardar sus datos fiscales. No vuelva a intentar. Contacte a administración.');
            }

            throw new Error('El proveedor de facturacion no devolvio datos fiscales validos para la Nota de Credito.');
          }

          ncBillingInfo = normalizedFiscal.facturaInfo;

          console.log('[NCS_BILLING_INFO]', ncBillingInfo);
        } else {
          console.log('[NC_COMMON_FLOW_START]', { saleId: saleForCreditNote.id });
        }

        await api.createCreditNote({
          customerId: saleForCreditNote.customer.Id_Cliente,
          originalSaleId: saleForCreditNote.id,
          shiftId: activeShift.ID_Turno,
          ...data,
          isFiscalCreditNote: hasFiscalInvoice,
          facturaInfo: ncBillingInfo,
        });

        console.log('[NCS_SUCCESS]', {
          saleId: saleForCreditNote.id,
          customerId: saleForCreditNote.customer.Id_Cliente,
          ncNumber: ncBillingInfo?.nro,
        });

        const stockRestoreResult = await api.restoreStockFromCreditNoteItems(data.items);

        const isFullyReturned = await api.isSaleFullyReturnedByQuantity(saleForCreditNote.id);
        if (isFullyReturned) {
          await api.annulSale(saleForCreditNote.id);
        }

        setPatchedSaleVisualState(prev => {
          const next = new Map(prev);
          next.set(saleForCreditNote.id, {
            status: isFullyReturned ? 'annulled' : 'active',
            returnedTotal: Number(saleForCreditNote.returnedTotal || 0) + Number(data.total || 0),
          });
          return next;
        });

        // REFRESH SALES HISTORY IMMEDIATELY
        await refreshData();

        if (ticketWindow) {
          const creditNote: CreditNote = {
            id: ncBillingInfo?.nro || `NC-${saleForCreditNote.id}`,
            date: new Date(),
            ...data,
            customer: saleForCreditNote.customer,
            originalSaleId: saleForCreditNote.id,
            facturaInfo: ncBillingInfo,
          };

          const printStyles = getPrintStyles();
          ticketWindow.document.open();
          ticketWindow.document.write(generateCreditNoteHtml(creditNote, printStyles));
          ticketWindow.document.close();
        }

        if (stockRestoreResult.restoredCount === 0 && stockRestoreResult.skippedNonStockCount > 0) {
          addToast('Nota de crédito generada correctamente. Los ítems comunes o manuales no modifican stock.', 'success');
        } else {
          addToast('Nota de crédito procesada con éxito.', 'success');
        }
        setSaleForCreditNote(null);
      } catch (error) {
        if (ticketWindow) ticketWindow.close();
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Credit Note Error:', error);
        addToast(`Error al procesar la nota de crédito: ${errMsg}`, 'error');
        throw error;
      }
    },
    [saleForCreditNote, refreshData, addToast, activeShift]
  );

  const handleDeleteSale = useCallback(
    async (saleId: string) => {
      if (!canDeleteSale) {
        addToast('Solo usuarios autorizados pueden anular ventas o presupuestos.', 'error');
        return;
      }
      setIsProcessingAction(true);
      try {
        await api.annulSale(saleId);
        addToast('Venta anulada con éxito. El stock ha sido revertido.', 'success');
        refreshData();
      } catch (error) {
        console.error('Failed to annul sale:', error);
        addToast(`Error al anular la venta: ${error instanceof Error ? error.message : 'Error desconocido'}`, 'error');
      } finally {
        setIsProcessingAction(false);
        setSaleToDeleteId(null);
      }
    },
    [addToast, refreshData, canDeleteSale]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!saleToDeleteId) return;
    handleDeleteSale(saleToDeleteId);
  }, [saleToDeleteId, handleDeleteSale]);

  const handleBillingSuccess = useCallback(() => {
    setSaleToBill(null);
    addToast('Venta marcada como facturada (simulación).', 'success');
    refreshData();
  }, [addToast, refreshData]);

  // Eliminado: handleOpenBudgetToSaleModal (ya no se usa)

  
  return (
    <div className="p-2 space-y-3 md:space-y-4">
      {showStats && (
        <div
          className={
            stickyStats
              ? 'z-30 bg-white sticky left-0 right-0 shadow-sm top-0 md:top-0'
              : ''
          }
          style={stickyStats ? { paddingTop: 0, paddingBottom: 0 } : {}}
        >
          <div className="flex flex-nowrap gap-2 md:gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 pb-1 md:pb-2">
            <StatCard
              title={`Ingresos ${statTitlePrefix}`}
              value={formatCurrency(stats.totalRevenue)}
              iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125-.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125-1.125h-.375m1.5-1.5H21a.75.75 0 00-.75-.75v-.75m0 0l-3.75-3.75M3 12m0 0l3.75 3.75M3.75 12H18m-9.75 6.75h1.5"
              iconBgColor="bg-blue-500"
              onClick={handleShowRevenueDetails}
            />
            <StatCard
              title={`Ventas ${statTitlePrefix}`}
              value={stats.salesCount.toLocaleString('es-AR')}
              iconPath="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344-.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v3.026"
              iconBgColor="bg-green-500"
              onClick={handleShowRevenueDetails}
            />
            <StatCard
              title={`Productos ${statTitlePrefix}`}
              value={stats.totalProductsSold.toLocaleString('es-AR')}
              iconPath="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
              iconBgColor="bg-purple-500"
              onClick={handleShowProductsSoldDetails}
            />
            <StatCard
              title={`Efectivo ${statTitlePrefix}`}
              value={formatCurrency(stats.totalCash)}
              iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25"
              iconBgColor="bg-teal-500"
              onClick={handleShowCashDetails}
            />
            <StatCard
              title={`Digital ${statTitlePrefix}`}
              value={formatCurrency(stats.totalDigital)}
              iconPath="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z"
              iconBgColor="bg-sky-500"
              onClick={handleShowDigitalDetails}
            />
            <StatCard
              title={`Cobros CC ${statTitlePrefix}`}
              value={formatCurrency(stats.customerPaymentsTotal)}
              iconPath="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.826-2.997.11-2.003 1.189z"
              iconBgColor="bg-teal-500"
              onClick={handleShowPaymentsDetails}
            />
            <StatCard
              title={`Cta. Cte. ${statTitlePrefix}`}
              value={formatCurrency(stats.totalCredit)}
              iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985"
              iconBgColor="bg-red-500"
              onClick={handleShowCreditDetails}
            />
            <StatCard
              title={`E-Cheq ${statTitlePrefix}`}
              value={formatCurrency(stats.totalEcheq)}
              iconPath="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              iconBgColor="bg-indigo-500"
              onClick={handleShowEcheqDetails}
            />
            <StatCard
              title={`Diferencia ${statTitlePrefix}`}
              value={formatCurrency(differenceData.differenceTotal)}
              iconPath="M18 12H6m0 0l3-3m-3 3l3 3m12 0H9m12 0l-3-3m3 3l-3 3"
              iconBgColor={differenceData.isMinorOnly ? 'bg-emerald-500' : 'bg-red-500'}
              description="Ingresos - suma de medios de pago"
              onClick={handleShowDifferenceDetails}
            />
          </div>
        </div>
      )}

      {headerChildren && (
        <div
          className={
            stickyFilters
              ? 'z-20 bg-white md:sticky md:top-[56px] left-0 right-0 shadow-sm'
              : ''
          }
          style={stickyFilters ? { marginTop: 0 } : {}}
        >
          <div className="p-2 md:p-0">{headerChildren}</div>
        </div>
      )}

      <div className="relative">
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                <thead className="bg-gray-50 z-10 md:sticky md:top-[104px]" style={{ zIndex: 11, background: '#f9fafb' }}>
                  <tr>
                    <th scope="col" className="px-2 py-3 min-w-[140px] text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Tipo / Doc</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[80px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">ID Venta</th>
                    <th scope="col" className="px-2 py-3 min-w-[200px] text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Fecha / Cliente</th>
                    <th scope="col" className="px-2 py-3 w-16 min-w-[60px] text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Items</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[80px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Subtotal</th>
                    <th scope="col" className="px-2 py-3 w-16 min-w-[70px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Desc</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[90px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[80px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Efectivo</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[80px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Digital</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[80px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">E-Cheq</th>
                    <th scope="col" className="px-2 py-3 w-20 min-w-[80px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Cta. Cte.</th>
                    <th scope="col" className="px-2 py-3 w-32 min-w-[120px] text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Acciones</th>
                  </tr>
                </thead>
              </table>

              <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                  <tbody className="bg-white divide-y-0">
                    {mergedDisplayItems.length > 0 ? (
                      mergedDisplayItems.map(item =>
                        item.type === 'sale' ? (
                          <React.Fragment key={item.id}>
                            <SaleRow sale={item.sale} onOpenActions={s => handleOpenActions(s, 'sale')} />
                            {item.sale.creditNotes &&
                              item.sale.creditNotes.map(note => (
                                <CreditNoteRow key={note.id} note={note} onOpenActions={n => handleOpenActions(n, 'note')} />
                              ))}
                          </React.Fragment>
                        ) : (
                          <PaymentRow key={item.id} payment={item.payment} customersMap={customersMap} />
                        )
                      )
                    ) : (
                      <tr>
                        <td colSpan={12} className="text-center py-10 text-gray-500">
                          {noDataMessage}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {saleForCreditNote && saleForCreditNote.customer && (
        <CreditNoteModal
          isOpen={!!saleForCreditNote}
          onClose={() => setSaleForCreditNote(null)}
          customer={saleForCreditNote.customer}
          products={salesData.flatMap(sale => sale.items.map(item => item.product))}
          onSave={handleSaveCreditNote}
          initialItems={saleForCreditNote.items}
          allCreditNotesForSale={saleForCreditNote.creditNotes}
        />
      )}

      <StatDetailModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={modalConfig.title}
        columns={modalConfig.columns}
        data={modalConfig.data}
        summary={modalConfig.summary}
        size={modalConfig.size}
      />

      <CheckoutModal
        isOpen={paymentEditState.isOpen}
        onClose={handleClosePaymentEditModal}
        cart={paymentEditState.sale?.items || []}
        customers={customers}
        onFinalizeSale={async (sale) => {
          await handleFinalizeCheckoutPaymentEdit(sale);
        }}
        onAddNewCustomer={() => {
          addToast('El alta de clientes no está habilitada en edición de cobro.', 'info');
        }}
        saleBeingEdited={paymentEditState.sale}
        isBudgetMode={false}
      />

      <CheckoutModal
        isOpen={budgetCheckoutState.isOpen}
        onClose={handleCloseBudgetCheckoutModal}
        cart={budgetCheckoutState.sale ? buildCheckoutCartFromBudget(budgetCheckoutState.sale) : []}
        customers={customers}
        onFinalizeSale={handleFinalizeBudgetCheckout}
        onAddNewCustomer={() => {
          addToast('El alta de clientes no está habilitada desde esta conversión.', 'info');
        }}
        saleBeingEdited={null}
        isBudgetMode={false}
        preSelectedCustomer={budgetCheckoutState.preSelectedCustomer}
      />

      {saleToBill && (
        <BillingModal
          isOpen={!!saleToBill}
          onClose={() => setSaleToBill(null)}
          sale={saleToBill}
          onSuccess={handleBillingSuccess}
          autoOpen={false}
        />
      )}

      {/* Solo administrador puede ver el modal de anulación */}
      {canDeleteSale && (
        <ConfirmationModal
          isOpen={!!saleToDeleteId}
          onClose={() => setSaleToDeleteId(null)}
          onConfirm={handleConfirmDelete}
          isProcessing={isProcessingAction}
          title="Anular Venta"
          message="¿Está seguro de que desea anular esta venta? Esta acción revertirá el stock y no se puede deshacer."
          confirmText="Sí, Anular"
        />
      )}

      {sendModalState.isOpen && sendModalState.sale && (
        <Modal
          isOpen={sendModalState.isOpen}
          onClose={() => setSendModalState({ isOpen: false, sale: null })}
          title={`Reenviar Ticket #${sendModalState.sale.id.slice(0, 8)}`}
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Venta Original para:</p>
              <p className="font-semibold">{sendModalState.sale.customer?.['Nombre y Apellido'] || 'Consumidor Final'}</p>
              <p className="font-bold text-lg">${sendModalState.sale.total.toLocaleString('es-AR')}</p>
            </div>

            <div>
              <label htmlFor="send-customer" className="block text-sm font-medium text-gray-700">
                Seleccionar cliente para enviar por WhatsApp:
              </label>
              <div className="mt-1">
                <SearchableSelect
                  options={whatsAppCustomers.map(c => ({
                    value: c.Id_Cliente,
                    label: `${c['Nombre y Apellido']} (${c.Whatsapp})`,
                  }))}
                  value={targetCustomerId}
                  onChange={value => setTargetCustomerId(value)}
                  placeholder="Buscar cliente para enviar..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <button
                type="button"
                onClick={() => setSendModalState({ isOpen: false, sale: null })}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSend}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center space-x-2"
              >
                <Icon path="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.056 3 12s4.03 8.25 9 8.25z" className="w-5 h-5" />
                <span>Enviar</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Eliminado: Modal de conversión de presupuesto a venta */}

      {selectedItemForActions && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 transition-opacity duration-300"
          onClick={() => setSelectedItemForActions(null)}
        >
          <div
            className={`bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl transform transition-transform duration-300 ease-out ${isMobile ? 'animate-slide-up' : 'animate-fade-in-up'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-900">
                  {selectedItemForActions.type === 'sale' &&
                  (selectedItemForActions.item as SaleWithDocumentType).document_type === 'budget'
                    ? 'Acciones de Presupuesto'
                    : selectedItemForActions.type === 'sale'
                    ? 'Acciones de Venta'
                    : 'Acciones de Nota de Crédito'}
                </h3>
                <p className="text-xs text-gray-500 font-mono">ID: {selectedItemForActions.item.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => setSelectedItemForActions(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
              </button>
            </div>

            <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
              <div className="text-sm">
                <p className="font-medium text-gray-700">
                  {selectedItemForActions.type === 'sale'
                    ? (selectedItemForActions.item as Sale).customer?.['Nombre y Apellido'] || 'Consumidor Final'
                    : 'Nota de Crédito'}
                </p>
                <p className="text-xs text-gray-500">{new Date(selectedItemForActions.item.date).toLocaleString('es-AR')}</p>
                {selectedItemForActions.type === 'sale' && (() => {
                  const s = selectedItemForActions.item as Sale;
                  const discPct = Number(s.customer_discount_percentage) || 0;
                  const discAmt = Number(s.customer_discount_amount) || 0;
                  const subtotalBeforeDisc = s.subtotal_before_customer_discount ?? null;
                  if (discPct > 0) {
                    return (
                      <div className="mt-1 space-y-0.5">
                        {subtotalBeforeDisc != null && (
                          <p className="text-xs text-gray-500">Subtotal original: {formatCurrency(subtotalBeforeDisc)}</p>
                        )}
                        <p className="text-xs text-green-700 font-semibold">Descuento cliente: {discPct}% (-{formatCurrency(discAmt)})</p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-gray-900">
                  $
                  {(
                    selectedItemForActions.type === 'sale'
                      ? (selectedItemForActions.item as Sale).total
                      : (selectedItemForActions.item as AccountTransaction).credit
                  ).toLocaleString('es-AR')}
                </p>
              </div>
            </div>

            <div className="p-2 grid grid-cols-1 gap-1 max-h-[60vh] overflow-y-auto">
              {selectedItemForActions.type === 'sale' &&
              (selectedItemForActions.item as SaleWithDocumentType).document_type === 'budget' ? (
                <>
                  {!isSellerRole && onEditSale && (selectedItemForActions.item as Sale).status !== 'annulled' && !isSaleAlreadyBilled(selectedItemForActions.item as Sale) && (
                    <button
                      onClick={() => {
                        onEditSale(selectedItemForActions.item as Sale);
                        setSelectedItemForActions(null);
                      }}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-cyan-50 text-cyan-700 rounded-xl transition-colors"
                    >
                      <Icon path="M4.5 7.5h15m-15 4.5h15m-15 4.5h10.5M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" className="w-6 h-6" />
                      <span className="font-medium">Editar Presupuesto</span>
                    </button>
                  )}

                  {!isSellerRole && (
                    <button
                      onClick={() => {
                        handleOpenBudgetCheckout(selectedItemForActions.item as SaleWithDocumentType);
                        setSelectedItemForActions(null);
                      }}
                      disabled={Boolean((selectedItemForActions.item as SaleWithDocumentType).converted_to_sale_id)}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors"
                    >
                      <Icon path="M12 4v16m8-8H4" className="w-6 h-6" />
                      <span className="font-medium">
                        {Boolean((selectedItemForActions.item as SaleWithDocumentType).converted_to_sale_id)
                          ? 'Ya convertido'
                          : 'Convertir a Venta'}
                      </span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      handleViewBudget(selectedItemForActions.item as SaleWithDocumentType);
                      setSelectedItemForActions(null);
                    }}
                    className="flex items-center space-x-3 w-full p-3 text-left hover:bg-indigo-50 text-indigo-700 rounded-xl transition-colors"
                  >
                    <Icon path="M2.036 12.322a1.012 1.012 0 010-.639l4.418-5.523A1.012 1.012 0 017.5 6h9a1.012 1.012 0 01.946.689l4.418 5.523a1.012 1.012 0 010 .639l-4.418 5.523A1.012 1.012 0 0116.5 18h-9a1.012 1.012 0 01-.946-.689L2.036 12.322zM15 12a3 3 0 11-6 0 3 3 0 016 0z" className="w-6 h-6" />
                    <span className="font-medium">Ver Presupuesto</span>
                  </button>

                  <button
                    onClick={() => {
                      handleOpenSendModal(selectedItemForActions.item as Sale);
                      setSelectedItemForActions(null);
                    }}
                    className="flex items-center space-x-3 w-full p-3 text-left hover:bg-green-50 text-green-700 rounded-xl transition-colors"
                  >
                    <Icon path="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.794 9 8.25z" className="w-6 h-6" />
                    <span className="font-medium">Enviar por WhatsApp</span>
                  </button>
                </>
              ) : selectedItemForActions.type === 'sale' ? (
                <>
                  {canEditPaymentRole &&
                    !isSaleCancelled(selectedItemForActions.item as Sale) &&
                    !hasTotalCreditNote(selectedItemForActions.item as Sale) && (
                      <button
                        onClick={() => {
                          handleOpenPaymentEditModal(selectedItemForActions.item as Sale, { closeActionsMenu: true });
                        }}
                        className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors"
                      >
                        <Icon path="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" className="w-6 h-6" />
                        <span className="font-medium">Editar cobro</span>
                      </button>
                    )}

                  {!isSellerRole && onEditSale && (selectedItemForActions.item as Sale).status !== 'annulled' && !isSaleAlreadyBilled(selectedItemForActions.item as Sale) && (
                    <button
                      onClick={() => {
                        onEditSale(selectedItemForActions.item as Sale);
                        setSelectedItemForActions(null);
                      }}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-cyan-50 text-cyan-700 rounded-xl transition-colors"
                    >
                      <Icon path="M4.5 7.5h15m-15 4.5h15m-15 4.5h10.5M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" className="w-6 h-6" />
                      <span className="font-medium">Editar venta</span>
                    </button>
                  )}

                  {!isSaleAlreadyBilled(selectedItemForActions.item as Sale) ? (
                    !isSellerRole ? (
                    <button
                      onClick={() => {
                        setSaleToBill(selectedItemForActions.item as Sale);
                        setSelectedItemForActions(null);
                      }}
                      disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Icon path="M18 3H9v18M9 12h6" className="w-6 h-6" />
                      <span className="font-medium">Facturar Venta</span>
                    </button>
                    ) : null
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-green-50 text-green-700 rounded-xl">
                      <div className="flex items-center space-x-3">
                        <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6" />
                        <span className="font-medium">
                          Facturado: {(selectedItemForActions.item as Sale).facturaInfo?.nro || 'Comprobante oficial'}
                        </span>
                      </div>
                    </div>
                  )}

                  {(selectedItemForActions.item as Sale).facturaInfo?.ticketUrl && (
                    <button
                      onClick={() => {
                        const sale = selectedItemForActions.item as Sale;
                        setSelectedItemForActions(null);
                        void handleOpenRegeneratedFiscalDocument(sale, 'ticket80');
                      }}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors"
                    >
                      <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-6 h-6" />
                      <span className="font-medium">Ver Ticket 80mm</span>
                    </button>
                  )}

                  {(selectedItemForActions.item as Sale).facturaInfo?.url && (
                    <button
                      onClick={() => {
                        const sale = selectedItemForActions.item as Sale;
                        setSelectedItemForActions(null);
                        void handleOpenRegeneratedFiscalDocument(sale, 'a4');
                      }}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-indigo-50 text-indigo-700 rounded-xl transition-colors"
                    >
                      <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-6 h-6" />
                      <span className="font-medium">Ver PDF A4 Oficial</span>
                    </button>
                  )}

                  {(isLoadingLinkedCreditNotes || selectedSaleGeneratedCreditNote) && (
                    <div className="mx-1 my-2 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
                            Nota de Credito Generada
                          </p>
                          <h4 className="mt-1 text-sm font-semibold text-gray-900">Comprobante fiscal de cancelacion</h4>
                        </div>
                        {!isLoadingLinkedCreditNotes && selectedSaleGeneratedCreditNote && (
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                              selectedSaleGeneratedCreditNote.facturaInfo?.ticketUrl &&
                              (selectedSaleGeneratedCreditNote.facturaInfo?.pdfUrl ||
                                selectedSaleGeneratedCreditNote.facturaInfo?.url)
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            NC Generada
                          </span>
                        )}
                      </div>

                      {isLoadingLinkedCreditNotes && !selectedSaleGeneratedCreditNote ? (
                        <div className="mt-3 h-16 animate-pulse rounded-xl bg-white/70" />
                      ) : selectedSaleGeneratedCreditNote ? (
                        <>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white bg-white/90 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">Numero NC</p>
                              <p className="mt-1 text-sm font-semibold text-gray-900">
                                {selectedSaleGeneratedCreditNote.facturaInfo?.invoiceNumber ||
                                  selectedSaleGeneratedCreditNote.facturaInfo?.nro ||
                                  'Sin numero fiscal'}
                              </p>
                            </div>
                            <div className="rounded-xl border border-white bg-white/90 p-3">
                              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">CAE NC</p>
                              <p className="mt-1 text-sm font-semibold text-gray-900">
                                {selectedSaleGeneratedCreditNote.facturaInfo?.cae || 'Sin CAE'}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            {selectedSaleGeneratedCreditNote.facturaInfo?.ticketUrl && (
                              <button
                                onClick={() => {
                                  handleOpenCreditNoteFiscalDocument(selectedSaleGeneratedCreditNote, 'ticket');
                                  setSelectedItemForActions(null);
                                }}
                                className="flex w-full items-center space-x-3 rounded-xl border border-orange-200 bg-white p-3 text-left text-orange-700 transition-colors hover:bg-orange-50"
                              >
                                <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-6 h-6" />
                                <span className="font-medium">Ver Ticket NC</span>
                              </button>
                            )}

                            {(selectedSaleGeneratedCreditNote.facturaInfo?.pdfUrl ||
                              selectedSaleGeneratedCreditNote.facturaInfo?.url) && (
                              <button
                                onClick={() => {
                                  handleOpenCreditNoteFiscalDocument(selectedSaleGeneratedCreditNote, 'pdf');
                                  setSelectedItemForActions(null);
                                }}
                                className="flex w-full items-center space-x-3 rounded-xl border border-amber-200 bg-white p-3 text-left text-amber-700 transition-colors hover:bg-amber-50"
                              >
                                <Icon path="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-6 h-6" />
                                <span className="font-medium">Ver PDF NC</span>
                              </button>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}

                  {!isSellerRole && (selectedItemForActions.item as Sale).status === 'annulled' &&
                    isSaleAlreadyBilled(selectedItemForActions.item as Sale) &&
                    !selectedSaleGeneratedCreditNote && (
                      <button
                        onClick={() => {
                          void handleGeneratePendingFiscalCreditNote(
                            selectedItemForActions.item as SaleWithDocumentType
                          );
                        }}
                        disabled={isGeneratingPendingNc || isLoadingLinkedCreditNotes}
                        className="flex items-center space-x-3 w-full p-3 text-left bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-6 h-6" />
                        <span className="font-medium">
                          {isGeneratingPendingNc ? 'Generando NC Fiscal...' : 'Generar NC Fiscal Pendiente'}
                        </span>
                      </button>
                    )}

                  {!isSaleAlreadyBilled(selectedItemForActions.item as Sale) && (
                    <button
                      onClick={() => {
                        handleView(selectedItemForActions.item as Sale);
                        setSelectedItemForActions(null);
                      }}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-indigo-50 text-indigo-700 rounded-xl transition-colors"
                    >
                      <Icon path="M2.036 12.322a1.012 1.012 0 010-.639l4.418-5.523A1.012 1.012 0 017.5 6h9a1.012 1.012 0 01.946.689l4.418 5.523a1.012 1.012 0 010 .639l-4.418 5.523A1.012 1.012 0 0116.5 18h-9a1.012 1.012 0 01-.946-.689L2.036 12.322zM15 12a3 3 0 11-6 0 3 3 0 016 0z" className="w-6 h-6" />
                      <span className="font-medium">Ver Ticket Interno</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      handleOpenSendModal(selectedItemForActions.item as Sale);
                      setSelectedItemForActions(null);
                    }}
                    disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                    className="flex items-center space-x-3 w-full p-3 text-left hover:bg-green-50 text-green-700 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Icon path="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.794 9 8.25z" className="w-6 h-6" />
                    <span className="font-medium">Enviar por WhatsApp</span>
                  </button>

                  {!isSellerRole && (
                    <button
                      onClick={() => {
                        handleGenerateRemito(selectedItemForActions.item as Sale);
                        setSelectedItemForActions(null);
                      }}
                      disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-gray-100 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-6 h-6" />
                      <span className="font-medium">Generar Remito</span>
                    </button>
                  )}

                  {!isSellerRole && (
                    <button
                      onClick={() => {
                        handleAddCreditNote(selectedItemForActions.item as Sale);
                        setSelectedItemForActions(null);
                      }}
                      disabled={
                        (selectedItemForActions.item as Sale).status === 'annulled' ||
                        (selectedItemForActions.item as Sale).total -
                          ((selectedItemForActions.item as Sale).returnedTotal || 0) <=
                          0
                      }
                      className="flex items-center space-x-3 w-full p-3 text-left hover:bg-orange-50 text-orange-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Icon path="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-6 h-6" />
                      <span className="font-medium">Generar Nota de Crédito</span>
                    </button>
                  )}

                  {/* Restaurado botón Eliminar Venta - PROMPT 013 */}
                  {/* Solo mostrar Eliminar Venta si el usuario tiene permiso */}
                  {canDeleteSale && (
                    <button
                      onClick={() => {
                        const id = (selectedItemForActions.item as Sale).id;
                        console.log('[DELETE_SALE_UI] click en Eliminar Venta, id:', id);
                        setSaleToDeleteId(id);
                        console.log('[DELETE_SALE_UI] después de setSaleToDeleteId, saleToDeleteId:', id);
                        setTimeout(() => {
                          // Delay para ver si el modal se monta
                          console.log('[DELETE_SALE_UI] setSelectedItemForActions(null) ejecutado');
                          setSelectedItemForActions(null);
                        }, 100);
                      }}
                      disabled={(selectedItemForActions.item as Sale).status === 'annulled'}
                      className="flex items-center space-x-3 w-full p-3 text-left bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors disabled:opacity-50"
                    >
                      {/* Icono destructivo: papelera o warning, reutilizado si existe */}
                      <Icon path="M6 18L18 6M6 6l12 12" className="w-6 h-6" />
                      <span className="font-medium">Eliminar Venta</span>
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => {
                    handleReprintCreditNote(selectedItemForActions.item as AccountTransaction);
                    setSelectedItemForActions(null);
                  }}
                  className="flex items-center space-x-3 w-full p-3 text-left hover:bg-blue-50 text-blue-700 rounded-xl transition-colors"
                >
                  <Icon path="M6.75 7.5h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-10.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75z" className="w-6 h-6" />
                  <span className="font-medium">Reimprimir Nota de Crédito</span>
                </button>
              )}
            </div>

            <div className="h-6 sm:h-0"></div>
          </div>

          <style>{`
            @keyframes slide-up {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            .animate-slide-up {
              animation: slide-up 0.3s ease-out forwards;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
