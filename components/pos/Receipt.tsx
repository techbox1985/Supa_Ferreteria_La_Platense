
import { Sale, Budget, CreditNote, Customer, AccountTransaction, PrintStyles } from '../../types';
import { getPrintStyles } from '../../utils/printStyles';

// Function to format currency in ARS format, rounding to the nearest integer (no cents).
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const COMPANY_LOGO = 'https://tolosarefrigeracion.com.ar/wp-content/uploads/2024/12/LOGO-min.png';
const COMPANY_ADDRESS = 'Calle 526 N° 1024 - La Plata';
const COMPANY_RAZON_SOCIAL = 'RODRIGUEZ LUCAS ANDRES Y MARCUCCI';
const COMPANY_CUIT = '30-71624467-3';
const COMPANY_IVA = 'Responsable Inscripto';
const COMPANY_IIBB = '30-71624467-3';
const COMPANY_INICIO_ACT = '01/01/2019';

export const generateReceiptHtml = (sale: Sale, customStyles?: PrintStyles): string => {
    const styles = customStyles || getPrintStyles();
    const totalItems = sale.items.reduce((acc, item) => acc + item.quantity, 0);
    
    // Determinar el peso de la fuente: si boldAll es true, todo es bold. Si no, usa la configuración individual.
    const bodyFontWeight = styles.boldAll ? 'bold' : styles.baseFontWeight;
    const headerFontWeight = styles.boldAll ? 'bold' : (styles.boldHeader ? 'bold' : 'normal');
    const totalFontWeight = styles.boldAll ? 'bold' : (styles.boldTotal ? 'bold' : 'normal');
    const unitPriceFontWeight = styles.boldAll ? 'bold' : styles.unitPriceFontWeight;

    const itemsHtml = sale.items.map(item => `
        <div class="item">
            <div class="item-info">
                <span>${item.quantity}x</span>
                <span class="description">${item.product.Producto}</span>
            </div>
            <div class="price">${formatCurrency(item.price * item.quantity)}</div>
        </div>
        ${item.quantity !== 1 ? `
        <div class="item-unit-price">
            (${formatCurrency(item.price)} c/u)
        </div>` : ''}
    `).join('');

    const roundedTotal = Math.round(sale.total);
    const effectiveAdjustment = roundedTotal - sale.subtotal;

    const adjustmentHtml = effectiveAdjustment !== 0 ? `
      <tr>
        <td class="label">${sale.adjustmentDescription || (effectiveAdjustment < 0 ? 'Descuento' : 'Recargo')}:</td>
        <td class="value">${formatCurrency(effectiveAdjustment)}</td>
      </tr>
    ` : '';
    
    const subtotalHtml = effectiveAdjustment !== 0 ? `
        <tr>
          <td class="label">Subtotal:</td>
          <td class="value">${formatCurrency(sale.subtotal)}</td>
        </tr>
    ` : '';

    const totalEcheqs = sale.payment.echeqs?.reduce((sum, echeq) => sum + echeq.amount, 0) || 0;
    const totalPaid = sale.payment.cash + sale.payment.digital + sale.payment.credit + totalEcheqs;
    const balance = totalPaid - sale.total;


    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ticket de Venta - Refrigeración Tolosa</title>
            <style>
                @media print {
                  @page {
                    margin-left: ${styles.leftMargin}mm;
                    margin-right: ${styles.rightMargin}mm;
                    margin-top: 0;
                    margin-bottom: 0;
                  }
                }
                body {
                    font-family: ${styles.fontFamily}, monospace;
                    font-size: ${styles.baseFontSize}px;
                    font-weight: ${bodyFontWeight};
                    width: ${styles.ticketWidth}px;
                    margin: 0 auto;
                    padding: ${styles.padding}px;
                    box-sizing: border-box;
                    color: #000;
                    background-color: #fff;
                    line-height: ${styles.lineHeight};
                }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .mb-1 { margin-bottom: 4px; }
                .mb-2 { margin-bottom: 8px; }
                .hr {
                    border: 0;
                    border-top: 1px ${styles.separatorStyle} #000;
                    margin: 8px 0;
                }
                .header h1 {
                    font-size: ${styles.headerFontSize}px;
                    font-weight: ${headerFontWeight};
                    margin-top: 5px;
                }
                .header p { margin: 2px 0; }
                .header, .footer { padding: 5px 0; }
                .items-section { padding: 5px 0; }
                .item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 2px;
                }
                .item-info {
                    display: flex;
                    flex-grow: 1;
                    margin-right: 5px;
                }
                .item-info .description {
                    padding-left: 5px;
                    word-break: break-word;
                }
                .item .price {
                    text-align: right;
                    flex-shrink: 0;
                }
                .item-unit-price {
                    font-size: ${styles.unitPriceFontSize}px;
                    font-weight: ${unitPriceFontWeight};
                    color: #555;
                    padding-left: 25px;
                    margin-bottom: 4px;
                }
                .summary-table { width: 100%; }
                .summary-table td { padding: 1px 0; }
                .summary-table .label { text-align: left; padding-right: 10px; font-weight: bold; }
                .summary-table .value { text-align: right; }
                .total-row {
                    font-size: ${styles.totalFontSize}px;
                    font-weight: ${totalFontWeight};
                }
            </style>
        </head>
        <body>
            <div class="text-center header">
                <img src="${COMPANY_LOGO}" style="max-width: 180px; margin-bottom: 5px;" />
                <h1>Refrigeración Tolosa</h1>
                <p>${COMPANY_ADDRESS}</p>
            </div>
            
            <hr class="hr" />

            <div class="mb-2">
                <p>Fecha: ${sale.date.toLocaleDateString('es-AR')} ${sale.date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
                <p>Cliente: ${sale.customer ? sale.customer['Nombre y Apellido'] : 'Consumidor Final'}</p>
                <p>Venta ID: ${sale.id.slice(0, 8)}</p>
            </div>
            
            <hr class="hr" />
            
            <div class="items-section">
                ${itemsHtml}
            </div>
            
            <hr class="hr" />

            <table class="summary-table">
                <tbody>
                    <tr>
                        <td class="label">Total Items:</td>
                        <td class="value">${totalItems}</td>
                    </tr>
                    ${subtotalHtml}
                    ${adjustmentHtml}
                    <tr class="total-row">
                        <td class="label">TOTAL:</td>
                        <td class="value">${formatCurrency(sale.total)}</td>
                    </tr>
                </tbody>
            </table>

            <hr class="hr" />
            
            <table class="summary-table">
                <tbody>
                     <tr class="font-bold">
                        <td class="label">Efectivo:</td>
                        <td class="value">${formatCurrency(sale.payment.cash)}</td>
                    </tr>
                     <tr class="font-bold">
                        <td class="label">Digital:</td>
                        <td class="value">${formatCurrency(sale.payment.digital)}</td>
                    </tr>
                    ${sale.payment.echeqs?.map(echeq => `
                    <tr class="font-bold">
                        <td class="label">E-Cheq (${echeq.days || 0} días):</td>
                        <td class="value">${formatCurrency(echeq.amount)}</td>
                    </tr>
                    `).join('') || ''}
                    ${sale.payment.credit > 0 ? `
                    <tr class="font-bold">
                        <td class="label">Cta. Cte.:</td>
                        <td class="value">${formatCurrency(sale.payment.credit)}</td>
                    </tr>
                    ` : ''}
                     ${balance > 0 ? `
                     <tr class="font-bold">
                        <td class="label">Cambio:</td>
                        <td class="value">${formatCurrency(Math.floor(balance))}</td>
                    </tr>
                    ` : ''}
                    ${balance < 0 ? `
                     <tr class="font-bold">
                        <td class="label">SALDO PENDIENTE:</td>
                        <td class="value">${formatCurrency(Math.abs(balance))}</td>
                    </tr>
                    ` : ''}
                </tbody>
            </table>
            
            <hr class="hr" />

            <div class="text-center footer">
                <p>¡Gracias por su compra!</p>
                <p>¡Vuelva pronto!</p>
            </div>
        </body>
        </html>
    `;
};

export const generateInvoiceHtml = (sale: Sale, customStyles?: PrintStyles): string => {
    if (!sale.facturaInfo) {
        return '<html><body>Error: Faltan datos de la factura.</body></html>';
    }

    const styles = customStyles || getPrintStyles();
    
    const bodyFontWeight = styles.boldAll ? 'bold' : styles.baseFontWeight;
    const headerFontWeight = styles.boldAll ? 'bold' : (styles.boldHeader ? 'bold' : 'normal');
    const totalFontWeight = styles.boldAll ? 'bold' : (styles.boldTotal ? 'bold' : 'normal');

    const itemsHtml = sale.items.map(item => `
        <div class="item">
            <div class="item-info">
                <span>${item.quantity}x</span>
                <span class="description">${item.product.Producto}</span>
            </div>
            <div class="price">${formatCurrency(item.price * item.quantity)}</div>
        </div>
    `).join('');

    // Asegurarse de que el QR se genere únicamente con el contenido de qrData (que suele ser el enlace oficial de ARCA/AFIP)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(sale.facturaInfo.qrData)}`;

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Factura Electrónica - Refrigeración Tolosa</title>
            <style>
                @media print {
                  @page {
                    margin-left: ${styles.leftMargin}mm;
                    margin-right: ${styles.rightMargin}mm;
                    margin-top: 0;
                    margin-bottom: 0;
                  }
                }
                body {
                    font-family: ${styles.fontFamily}, monospace;
                    font-size: ${styles.baseFontSize}px;
                    width: ${styles.ticketWidth}px;
                    font-weight: ${bodyFontWeight};
                    margin: 0 auto; padding: ${styles.padding}px;
                    color: #000; background-color: #fff;
                }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .hr { border: 0; border-top: 1px ${styles.separatorStyle} #000; margin: 8px 0; }
                .header img { max-width: 150px; margin-bottom: 5px; }
                .header h1 { font-size: 16px; margin: 0; font-weight: ${headerFontWeight}; }
                .header p { margin: 2px 0; font-size: 11px; }
                .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .item-info { display: flex; flex-grow: 1; margin-right: 5px; }
                .item-info .description { padding-left: 5px; word-break: break-word; }
                .item .price { text-align: right; flex-shrink: 0; }
                .summary-table { width: 100%; font-size: 12px; }
                .summary-table .label { text-align: left; padding-right: 10px; }
                .summary-table .value { text-align: right; font-weight: bold; }
                .total-row { font-size: 16px; font-weight: ${totalFontWeight}; }
                .fiscal-data { font-size: 11px; word-break: break-all; }
                .qr-code { 
                    margin: 10px auto; 
                    display: block;
                    width: 120px;
                    height: 120px;
                }
            </style>
        </head>
        <body>
            <div class="text-center header">
                <img src="${COMPANY_LOGO}" />
                <h1 class="font-bold">Refrigeración Tolosa</h1>
                <p>Razón Social: ${COMPANY_RAZON_SOCIAL}</p>
                <p>Domicilio: 32 747, TOLOSA (CP: 1900), BUENOS AIRES</p>
                <p>Cond. frente al IVA: ${COMPANY_IVA}</p>
            </div>
            
            <hr class="hr" />

            <div>
                <p class="font-bold text-center" style="font-size: 18px;">FACTURA ${sale.facturacion}</p>
                <p><strong>Nro:</strong> ${sale.facturaInfo.nro}</p>
                <p><strong>Fecha:</strong> ${new Date(sale.date).toLocaleString('es-AR')}</p>
            </div>

            <hr class="hr" />

            <div>
                <p><strong>Cliente:</strong> ${sale.customer?.['Nombre y Apellido'] || 'Consumidor Final'}</p>
                <p><strong>CUIT/DNI:</strong> ${sale.customer?.Documento || 'N/A'}</p>
                <p><strong>Cond. IVA:</strong> ${sale.customer?.Condicion_IVA || 'Consumidor Final'}</p>
            </div>
            
            <hr class="hr" />
            
            <div class="items-section">
                ${itemsHtml}
            </div>
            
            <hr class="hr" />

            <table class="summary-table">
                <tbody>
                    <tr class="total-row">
                        <td class="label">TOTAL:</td>
                        <td class="value">${formatCurrency(sale.total)}</td>
                    </tr>
                </tbody>
            </table>
            
            <hr class="hr" />

            <div class="fiscal-data text-center">
                <img src="${qrCodeUrl}" alt="Código QR ARCA" class="qr-code" />
                <p style="font-size: 10px; margin-top: 0;">Escaneá para verificar el comprobante</p>
                <p><strong>CAE:</strong> ${sale.facturaInfo.cae}</p>
                <p><strong>Vto. CAE:</strong> ${sale.facturaInfo.vtoCae}</p>
                <div style="margin-top: 10px;">
                    <p style="font-size: 18px; font-weight: bold; margin: 0; line-height: 1;">ARCA</p>
                    <p style="font-weight: bold; margin: 0; font-size: 12px;">Comprobante Autorizado</p>
                    <p style="font-size: 9px; margin-top: 5px;">Esta Agencia de Recaudación y Control Aduanero no se responsabiliza por los datos ingresados en el detalle de la operación.</p>
                </div>
                <p style="margin-top: 10px; font-weight: bold;">¡Gracias por su compra!</p>
            </div>
        </body>
        </html>
    `;
};

// FIX: Implementación de generateBudgetHtml para el componente BudgetsView
export const generateBudgetHtml = (budget: Budget): string => {
    const totalItems = budget.items.reduce((acc, item) => acc + item.quantity, 0);

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Presupuesto - Refrigeración Tolosa</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; line-height: 1.6; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 20px; }
                .logo { max-width: 200px; }
                .company-info { text-align: right; }
                .budget-title { text-align: center; margin: 30px 0; }
                .customer-info { margin-bottom: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
                .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                .items-table th { background: #f4f4f4; text-align: left; padding: 12px; border-bottom: 2px solid #ddd; }
                .items-table td { padding: 12px; border-bottom: 1px solid #eee; }
                .total-section { text-align: right; font-size: 1.1em; }
                .footer { margin-top: 50px; text-align: center; font-size: 0.9em; color: #777; border-top: 1px solid #eee; padding-top: 20px; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${COMPANY_LOGO}" class="logo" />
                <div class="company-info">
                    <h2 style="margin:0">${COMPANY_RAZON_SOCIAL}</h2>
                    <p style="margin:5px 0">${COMPANY_ADDRESS}</p>
                    <p style="margin:5px 0">CUIT: ${COMPANY_CUIT}</p>
                </div>
            </div>
            <div class="budget-title">
                <h1 style="margin:0">PRESUPUESTO</h1>
                <p>ID: ${budget.id.slice(0, 8)} | Fecha: ${budget.date.toLocaleDateString('es-AR')}</p>
            </div>
            <div class="customer-info">
                <h3 style="margin-top:0">Cliente:</h3>
                <p style="margin:5px 0"><strong>Nombre:</strong> ${budget.customer['Nombre y Apellido']}</p>
                ${budget.customer.Documento ? `<p style="margin:5px 0"><strong>Documento:</strong> ${budget.customer.Documento}</p>` : ''}
            </div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Descripción</th>
                        <th class="text-center">Cant.</th>
                        <th class="text-right">P. Unit.</th>
                        <th class="text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${budget.items.map(item => `
                        <tr>
                            <td>${item.product.Producto}</td>
                            <td class="text-center">${item.quantity}</td>
                            <td class="text-right">${formatCurrency(item.price)}</td>
                            <td class="text-right">${formatCurrency(item.price * item.quantity)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="total-section">
                <p>Total Items: <strong>${totalItems}</strong></p>
                <p style="font-size:1.5em; color: #2563eb;">TOTAL: <strong>${formatCurrency(budget.total)}</strong></p>
            </div>
            <div class="footer">
                <p>Este presupuesto tiene una validez de 7 días corridos.</p>
                <p>Precios sujetos a modificación sin previo aviso.</p>
                <p>¡Gracias por elegir Refrigeración Tolosa!</p>
            </div>
        </body>
        </html>
    `;
};

// FIX: Implementación de generateCustomerStatementHtml para CustomerStatementModal
export const generateCustomerStatementHtml = (customer: Customer, transactions: AccountTransaction[]): string => {
    const totalDebit = transactions.reduce((sum, tx) => sum + tx.debit, 0);
    const totalCredit = transactions.reduce((sum, tx) => sum + tx.credit, 0);
    const finalBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Estado de Cuenta - ${customer['Nombre y Apellido']}</title>
            <style>
                body { font-family: sans-serif; padding: 30px; color: #333; line-height: 1.4; }
                .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .customer-data { margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.9em; }
                th { background: #f4f4f4; padding: 10px; border: 1px solid #ddd; text-align: left; }
                td { padding: 10px; border: 1px solid #ddd; }
                .text-right { text-align: right; }
                .summary { margin-top: 20px; float: right; width: 300px; }
                .summary-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
                .total { font-weight: bold; font-size: 1.1em; border-bottom: 2px solid #333; }
                .logo { max-width: 150px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1 style="margin:0">Estado de Cuenta</h1>
                    <p style="margin:5px 0">Refrigeración Tolosa</p>
                    <p style="margin:2px 0; font-size: 0.8em; color: #666;">${COMPANY_ADDRESS}</p>
                </div>
                <img src="${COMPANY_LOGO}" class="logo" />
            </div>
            <div class="customer-data">
                <p style="margin:4px 0"><strong>Cliente:</strong> ${customer['Nombre y Apellido']}</p>
                <p style="margin:4px 0"><strong>Documento:</strong> ${customer.Documento || 'N/A'}</p>
                <p style="margin:4px 0"><strong>Fecha de Emisión:</strong> ${new Date().toLocaleString('es-AR')}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Descripción</th>
                        <th class="text-right">Debe</th>
                        <th class="text-right">Haber</th>
                        <th class="text-right">Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(tx => `
                        <tr>
                            <td style="white-space: nowrap;">${new Date(tx.date).toLocaleDateString('es-AR')}</td>
                            <td>${tx.type}</td>
                            <td>${tx.description}</td>
                            <td class="text-right">${tx.debit > 0 ? formatCurrency(tx.debit) : '-'}</td>
                            <td class="text-right">${tx.credit > 0 ? formatCurrency(tx.credit) : '-'}</td>
                            <td class="text-right" style="font-weight: bold;">${formatCurrency(tx.balance)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="summary">
                <div class="summary-row"><span>Total Debe:</span> <span>${formatCurrency(totalDebit)}</span></div>
                <div class="summary-row"><span>Total Haber:</span> <span>${formatCurrency(totalCredit)}</span></div>
                <div class="summary-row total"><span>Saldo Final:</span> <span>${formatCurrency(finalBalance)}</span></div>
            </div>
        </body>
        </html>
    `;
};

// FIX: Implementación de generateCreditNoteHtml para SalesDashboard
export const generateCreditNoteHtml = (note: CreditNote, customStyles?: PrintStyles): string => {
    const styles = customStyles || getPrintStyles();
    const bodyFontWeight = styles.boldAll ? 'bold' : styles.baseFontWeight;
    const headerFontWeight = styles.boldAll ? 'bold' : (styles.boldHeader ? 'bold' : 'normal');

    const itemsHtml = note.items.map(item => `
        <div class="item">
            <div class="item-info">
                <span>${item.quantity}x</span>
                <span class="description">${item.product.Producto}</span>
            </div>
            <div class="price">${formatCurrency(item.price * item.quantity)}</div>
        </div>
    `).join('');

    const qrCodeUrl = note.facturaInfo ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(note.facturaInfo.qrData)}` : null;

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Nota de Crédito - Refrigeración Tolosa</title>
            <style>
                @media print {
                  @page {
                    margin-left: ${styles.leftMargin}mm;
                    margin-right: ${styles.rightMargin}mm;
                    margin-top: 0;
                    margin-bottom: 0;
                  }
                }
                body {
                    font-family: ${styles.fontFamily}, monospace;
                    font-size: ${styles.baseFontSize}px;
                    font-weight: ${bodyFontWeight};
                    width: ${styles.ticketWidth}px;
                    margin: 0 auto;
                    padding: ${styles.padding}px;
                    color: #000; background-color: #fff;
                    line-height: ${styles.lineHeight};
                }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .hr { border-top: 1px ${styles.separatorStyle} #000; margin: 8px 0; }
                .header h1 { font-size: ${styles.headerFontSize}px; font-weight: ${headerFontWeight}; margin-bottom: 4px; }
                .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .item-info { display: flex; flex-grow: 1; }
                .description { padding-left: 5px; word-break: break-word; }
                .qr-code { margin: 10px auto; display: block; width: 100px; height: 100px; }
            </style>
        </head>
        <body>
            <div class="text-center">
                <img src="${COMPANY_LOGO}" style="max-width: 150px; margin-bottom: 5px;" />
                <h1>Refrigeración Tolosa</h1>
                <p class="font-bold">NOTA DE CRÉDITO ${note.facturaInfo ? 'ELECTRÓNICA' : ''}</p>
                ${note.facturaInfo ? `<p>Nro: ${note.facturaInfo.nro}</p>` : `<p>Ref: ${note.id.slice(0, 8)}</p>`}
                <p>Fecha: ${new Date(note.date).toLocaleString('es-AR')}</p>
            </div>
            <hr class="hr" />
            <p><strong>Cliente:</strong> ${note.customer['Nombre y Apellido']}</p>
            <p><strong>Motivo:</strong> ${note.description}</p>
            ${note.originalSaleId ? `<p><strong>Venta Original:</strong> ${note.originalSaleId.slice(0, 8)}</p>` : ''}
            <hr class="hr" />
            <div class="items-section">${itemsHtml}</div>
            <hr class="hr" />
            <div class="font-bold text-center" style="font-size: 1.2em;">
                TOTAL ACREDITADO: ${formatCurrency(note.total)}
            </div>
            ${qrCodeUrl ? `
                <hr class="hr" />
                <div class="text-center">
                    <img src="${qrCodeUrl}" class="qr-code" />
                    <p style="font-size: 10px;">CAE: ${note.facturaInfo?.cae}</p>
                    <p style="font-size: 10px;">Vto. CAE: ${note.facturaInfo?.vtoCae}</p>
                </div>
            ` : ''}
            <hr class="hr" />
            <p class="text-center" style="font-size: 0.8em;">Comprobante de devolución / crédito</p>
        </body>
        </html>
    `;
};

// FIX: Implementación de generateRemitoHtml para SalesDashboard
export const generateRemitoHtml = (sale: Sale): string => {
    const renderRemitoContent = (copyLabel: string) => `
        <div class="remito-box">
            <div class="header">
                <img src="${COMPANY_LOGO}" class="logo" />
                <div style="text-align: right;">
                    <h2 style="margin:0">${COMPANY_RAZON_SOCIAL}</h2>
                    <p style="margin:4px 0;">${COMPANY_ADDRESS}</p>
                    <p style="margin:4px 0;">CUIT: ${COMPANY_CUIT}</p>
                    <p style="margin:4px 0;">IIBB: ${COMPANY_IIBB}</p>
                </div>
            </div>
            <div class="remito-header-row">
                <div class="remito-title">REMITO</div>
                <div class="copy-label">${copyLabel}</div>
            </div>
            <div style="text-align:right; margin: 15px 0;"><strong>Fecha:</strong> ${new Date(sale.date).toLocaleDateString('es-AR')}</div>
            <div class="data-row">
                <div><strong>Cliente:</strong> ${sale.customer?.['Nombre y Apellido'] || 'Consumidor Final'}</div>
                <div><strong>Documento:</strong> ${sale.customer?.Documento || 'N/A'}</div>
            </div>
            <div class="data-row">
                <div><strong>Cond. IVA:</strong> ${sale.customer?.Condicion_IVA || 'Consumidor Final'}</div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 80px; text-align: center;">Cantidad</th>
                        <th>Descripción del Artículo</th>
                    </tr>
                </thead>
                <tbody>
                    ${sale.items.map(item => `
                        <tr>
                            <td style="text-align:center;">${item.quantity}</td>
                            <td>${item.product.Producto}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <p><strong>Referencia interna:</strong> Venta #${sale.id.slice(0, 8)}</p>
            <div class="footer">
                <div class="signature">Firma del Cliente / Receptor</div>
                <div class="signature">Aclaración y DNI</div>
            </div>
            <div style="margin-top: 40px; font-size: 0.8em; text-align: center; color: #666;">
                Documento no válido como factura. Mercadería recibida conforme.
            </div>
        </div>
    `;

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Remito - Refrigeración Tolosa</title>
            <style>
                body { font-family: sans-serif; padding: 20px; color: #333; max-width: 900px; margin: 0 auto; }
                .remito-box { border: 2px solid #333; padding: 20px; position: relative; margin-bottom: 40px; page-break-inside: avoid; }
                .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .logo { max-width: 150px; }
                .remito-header-row { display: flex; align-items: center; justify-content: center; position: relative; margin: 20px 0; }
                .remito-title { text-align: center; font-size: 1.8em; font-weight: bold; border: 2px solid #333; padding: 10px; width: 180px; }
                .copy-label { position: absolute; right: 0; font-weight: bold; text-transform: uppercase; border: 1px solid #333; padding: 4px 8px; font-size: 0.8em; }
                .data-row { display: flex; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th { border: 1px solid #333; padding: 8px; background: #eee; text-align: left; }
                td { border: 1px solid #333; padding: 8px; }
                .footer { margin-top: 40px; display: flex; justify-content: space-around; }
                .signature { border-top: 1px solid #333; width: 220px; text-align: center; padding-top: 10px; font-size: 0.9em; }
                .separator { border-top: 2px dashed #ccc; margin: 40px 0; position: relative; }
                .separator::after { content: 'TIJERAS'; position: absolute; top: -10px; left: 50%; background: white; padding: 0 10px; font-size: 0.7em; color: #999; }
                @media print {
                    .separator { margin: 60px 0; }
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            ${renderRemitoContent('Original - Copia Cliente')}
            <div class="separator"></div>
            ${renderRemitoContent('Duplicado - Copia Empresa')}
        </body>
        </html>
    `;
};
