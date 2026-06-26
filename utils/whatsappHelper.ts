import { Sale } from '../types';

// The Toast function is passed as an argument to decouple the helper from the context hook.
export const sendTicketViaWhatsApp = (
  sale: Sale,
  addToast: (message: string, type: 'info' | 'success' | 'error') => void
) => {
  const customer = sale.customer;
  if (!customer || !customer.Whatsapp) {
    addToast("Este cliente no tiene un número de WhatsApp registrado.", 'info');
    return;
  }

  // PROMPT 107: Si la venta tiene factura electrónica, enviar comprobante fiscal
  const hasFiscalInvoice = Boolean(sale.facturaInfo?.cae);
  const fiscalReceiptUrl =
    sale.facturaInfo?.ticketUrl ||
    sale.facturaInfo?.url ||
    (sale.facturaInfo as any)?.pdfUrl;

  if (hasFiscalInvoice) {
    if (!fiscalReceiptUrl) {
      addToast(
        'La venta tiene factura electrónica, pero no se encontró el comprobante fiscal para enviar.',
        'error'
      );
      return;
    }

    const tipoFactura = sale.facturacion && sale.facturacion !== 'N'
      ? `Tipo ${sale.facturacion} `
      : '';
    const nroFactura = sale.facturaInfo?.nro
      ? `N° ${sale.facturaInfo.nro}`
      : '';
    const facturaLine = tipoFactura || nroFactura
      ? `Factura: ${tipoFactura}${nroFactura}`
      : 'Comprobante fiscal emitido';

    const netTotal = sale.total - (sale.returnedTotal || 0);

    const fiscalMessageParts = [
      `Hola *${customer['Nombre y Apellido']}*,`,
      `Te enviamos el comprobante fiscal de tu compra en *Ferreteria La Platense*.`,
      '',
      facturaLine,
      `CAE: ${sale.facturaInfo!.cae}`,
      `Total: *$${netTotal.toLocaleString('es-AR')}*`,
      '',
      'Comprobante fiscal:',
      fiscalReceiptUrl,
      '',
      'Gracias por tu compra.',
      '_Ferreteria La Platense_',
    ];

    const fiscalMessage = fiscalMessageParts.join('\n');
    window.open(`https://wa.me/${customer.Whatsapp}?text=${encodeURIComponent(fiscalMessage)}`, '_blank');
    return;
  }

  // 1. Items List
  const itemsText = sale.items.map(item => 
    `${item.quantity}x ${item.product.Producto} - $${(item.price * item.quantity).toLocaleString('es-AR')}`
  ).join('\n');

  // 2. Totals
  const netTotal = sale.total - (sale.returnedTotal || 0);

  // Conditional subtotal text
  const subtotalText = (sale.adjustmentAmount && sale.adjustmentAmount !== 0) 
    ? `Subtotal: $${sale.subtotal.toLocaleString('es-AR')}`
    : '';
  
  // Conditional adjustment text
  const adjustmentText = (sale.adjustmentAmount && sale.adjustmentAmount !== 0)
    ? `${sale.adjustmentDescription || (sale.adjustmentAmount < 0 ? 'Descuento' : 'Recargo')}: $${sale.adjustmentAmount.toLocaleString('es-AR')}`
    : '';

  // Conditional returns text
  const returnedText = sale.returnedTotal && sale.returnedTotal > 0
    ? `Total Original: $${sale.total.toLocaleString('es-AR')}\nDevoluciones: -$${sale.returnedTotal.toLocaleString('es-AR')}`
    : '';

  // --- Assembling the final message with WhatsApp formatting ---

  const messageParts = [
    '*Ferreteria La Platense*',
    '_Comprobante de Venta_',
    '', // Spacer
    `Estimado/a *${customer['Nombre y Apellido']}*,`,
    'Gracias por su compra. A continuación, el detalle de su operación:',
    '-----------------------------------',
    `*Fecha:* ${new Date(sale.date).toLocaleString('es-AR')}`,
    `*Venta ID:* ${sale.id.slice(0, 8)}`,
    '-----------------------------------',
    '', // Spacer
    '*PRODUCTOS*',
    itemsText,
    '-----------------------------------',
    '', // Spacer
    '*RESUMEN*',
  ];

  if (subtotalText) messageParts.push(subtotalText);
  if (adjustmentText) messageParts.push(adjustmentText);
  if (returnedText) messageParts.push(returnedText);

  messageParts.push(`*TOTAL FINAL: $${netTotal.toLocaleString('es-AR')}*`);
  messageParts.push('-----------------------------------');
  messageParts.push(''); // Spacer
  messageParts.push('¡Esperamos verlo/a pronto!');

  const message = messageParts.join('\n');

  const whatsappUrl = `https://wa.me/${customer.Whatsapp}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
};
