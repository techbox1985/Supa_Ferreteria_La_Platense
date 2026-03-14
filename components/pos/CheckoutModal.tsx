import React, { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { CartItem, Customer, Sale, ECheq } from '../../types';
import { SearchableSelect } from '../ui/SearchableSelect';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  customers: Customer[];
  onFinalizeSale: (
    sale: Sale,
    generateInvoice: boolean,
    billingData: { condicionIVA: Customer['Condicion_IVA']; facturacionType: 'A' | 'B' }
  ) => Promise<void>;
  onAddNewCustomer: () => void;
  saleBeingEdited: Sale | null;
  isBudgetMode?: boolean;
}

const parseLocaleNumber = (value: string): number => {
  if (typeof value !== 'string' || !value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatInput = (value: number) => String(value).replace('.', ',');

const CONSUMIDOR_FINAL_INVOICE_LIMIT = 90000;

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  cart,
  customers,
  onFinalizeSale,
  onAddNewCustomer,
  saleBeingEdited,
  isBudgetMode = false,
}) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cash, setCash] = useState('');
  const [digital, setDigital] = useState('');
  const [credit, setCredit] = useState('');
  const [echeqs, setEcheqs] = useState<ECheq[]>([]);
  const [generateInvoice, setGenerateInvoice] = useState(false);
  const [condicionIVA, setCondicionIVA] = useState<Customer['Condicion_IVA']>('Consumidor Final');
  const [facturacionType, setFacturacionType] = useState<'A' | 'B'>('B');
  const [billingDoc, setBillingDoc] = useState('');
  const [billingDocType, setBillingDocType] = useState('DNI');

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const [discountPercent, setDiscountPercent] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [recargoPercent, setRecargoPercent] = useState('');
  const [recargoAmount, setRecargoAmount] = useState('');

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  const { total, adjustmentAmount, adjustmentDescription } = useMemo(() => {
    let currentTotal = subtotal;
    let adjustment = 0;
    const descriptions: string[] = [];

    const dP = parseLocaleNumber(discountPercent);
    const dA = parseLocaleNumber(discountAmount);
    const rP = parseLocaleNumber(recargoPercent);
    const rA = parseLocaleNumber(recargoAmount);

    if (dP > 0) {
      const discountValue = (subtotal * dP) / 100;
      adjustment -= discountValue;
      descriptions.push(`Desc ${dP}%`);
    }
    if (dA > 0) {
      adjustment -= dA;
      descriptions.push(`Desc ${formatCurrency(dA)}`);
    }

    if (rP > 0) {
      const recargoValue = (subtotal * rP) / 100;
      adjustment += recargoValue;
      descriptions.push(`Recargo ${rP}%`);
    }
    if (rA > 0) {
      adjustment += rA;
      descriptions.push(`Recargo ${formatCurrency(rA)}`);
    }

    currentTotal += adjustment;

    return {
      total: currentTotal > 0 ? currentTotal : 0,
      adjustmentAmount: adjustment,
      adjustmentDescription: descriptions.join(' / '),
    };
  }, [subtotal, discountPercent, discountAmount, recargoPercent, recargoAmount]);

  const totalEcheqs = useMemo(() => echeqs.reduce((sum, echeq) => sum + echeq.amount, 0), [echeqs]);

  const totalPaid = useMemo(() => {
    return parseLocaleNumber(cash) + parseLocaleNumber(digital) + parseLocaleNumber(credit) + totalEcheqs;
  }, [cash, digital, credit, totalEcheqs]);

  const change = useMemo(() => totalPaid - total, [totalPaid, total]);
  const isCtaCteEnabled = useMemo(() => selectedCustomer && selectedCustomer.Id_Cliente !== '0', [selectedCustomer]);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevSaleBeingEdited, setPrevSaleBeingEdited] = useState(saleBeingEdited);
  const [prevSelectedCustomer, setPrevSelectedCustomer] = useState(selectedCustomer);
  const [prevCondicionIVA, setPrevCondicionIVA] = useState(condicionIVA);

  if (isOpen !== prevIsOpen || saleBeingEdited !== prevSaleBeingEdited) {
    setPrevIsOpen(isOpen);
    setPrevSaleBeingEdited(saleBeingEdited);
    
    if (isOpen) {
      setIsProcessing(false);
      setError('');
      const finalConsumer = customers.find(
        (c) => c.Id_Cliente === '0' || c['Nombre y Apellido'].toLowerCase() === 'consumidor final'
      );

      if (saleBeingEdited) {
        setSelectedCustomer(saleBeingEdited.customer);
        setCash(formatInput(saleBeingEdited.payment.cash || 0));
        setDigital(formatInput(saleBeingEdited.payment.digital || 0));
        setCredit(formatInput(saleBeingEdited.payment.credit || 0));
        setEcheqs(saleBeingEdited.payment.echeqs || []);
        setGenerateInvoice(saleBeingEdited.facturacion !== 'N');

        setDiscountPercent('');
        setDiscountAmount('');
        setRecargoPercent('');
        setRecargoAmount('');

        const desc = saleBeingEdited.adjustmentDescription || '';
        if (desc) {
          const parts = desc.split(' / ');
          parts.forEach((part) => {
            const partTrimmed = part.trim();
            const match = partTrimmed.match(/^(Desc|Recargo)\s(.+)$/);
            if (!match) return;

            const type = match[1];
            let valueStr = match[2];

            if (valueStr.endsWith('%')) {
              const value = valueStr.replace('%', '').trim();
              if (type === 'Desc') setDiscountPercent(value);
              else setRecargoPercent(value);
            } else {
              const value = valueStr.replace(/[^\d,.]/g, '').trim();
              if (type === 'Desc') setDiscountAmount(value);
              else setRecargoAmount(value);
            }
          });
        } else {
          const adj = saleBeingEdited.adjustmentAmount || 0;
          if (adj < 0) {
            setDiscountAmount(formatInput(Math.abs(adj)));
          } else if (adj > 0) {
            setRecargoAmount(formatInput(adj));
          }
        }

        setCondicionIVA(saleBeingEdited.customer?.Condicion_IVA || 'Consumidor Final');
        setFacturacionType(saleBeingEdited.facturacion === 'A' ? 'A' : 'B');
        setBillingDoc(saleBeingEdited.customer?.Documento || '');
        setBillingDocType(saleBeingEdited.customer?.['Tipo.Documento'] || 'DNI');
      } else {
        const defaultCustomer = finalConsumer || (customers.length > 0 ? customers[0] : null);

        setSelectedCustomer(defaultCustomer);
        setCondicionIVA(defaultCustomer?.Condicion_IVA || 'Consumidor Final');
        setBillingDoc(defaultCustomer?.Documento || '');
        setBillingDocType(defaultCustomer?.['Tipo.Documento'] || 'DNI');
        setDigital('');
        setCredit('');
        setEcheqs([]);
        setGenerateInvoice(false);
        setDiscountPercent('');
        setDiscountAmount('');
        setRecargoPercent('');
        setRecargoAmount('');
      }
    }
  }

  if (selectedCustomer !== prevSelectedCustomer) {
    setPrevSelectedCustomer(selectedCustomer);
    if (selectedCustomer) {
      setCondicionIVA(selectedCustomer.Condicion_IVA || 'Consumidor Final');
      setBillingDoc(selectedCustomer.Documento || '');
      setBillingDocType(selectedCustomer['Tipo.Documento'] || 'DNI');
      if (!isCtaCteEnabled) {
        setCredit('');
      }
    }
  }

  if (condicionIVA !== prevCondicionIVA) {
    setPrevCondicionIVA(condicionIVA);
    if (condicionIVA === 'Responsable Inscripto') {
      setFacturacionType('A');
      setBillingDocType('CUIT');
    } else {
      setFacturacionType('B');
    }
  }

  // Dynamic cash adjustment - this one is tricky because it depends on many things.
  // We'll keep it as an effect but use a ref or something to avoid the warning if possible,
  // or just move it to render as well.
  const digitalVal = parseLocaleNumber(digital);
  const creditVal = parseLocaleNumber(credit);
  const otherPayments = digitalVal + creditVal + totalEcheqs;
  const cashNeeded = total - otherPayments;
  const roundedCashNeeded = Math.ceil(cashNeeded > 0 ? cashNeeded : 0);
  const formattedCashNeeded = formatInput(roundedCashNeeded);

  if (!saleBeingEdited && isOpen && cash !== formattedCashNeeded) {
    setCash(formattedCashNeeded);
  }

  const handleAddEcheq = () => {
    setEcheqs((prev) => [...prev, { amount: 0, days: 0 }]);
  };

  const handleEcheqChange = (index: number, field: 'amount' | 'days', value: string) => {
    const numericValue = parseInt(value, 10) || 0;
    setEcheqs((prev) => prev.map((echeq, i) => (i === index ? { ...echeq, [field]: numericValue } : echeq)));
  };

  const handleRemoveEcheq = (index: number) => {
    setEcheqs((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * FIX del bug:
   * Si el usuario edita Documento / Condición IVA / Tipo Documento sobre un cliente real (Id_Cliente != '0'),
   * NO enviamos ese Id_Cliente al backend para facturar.
   * Motivo: el Apps Script probablemente “refresca” datos fiscales desde hoja Clientes por Id_Cliente y pisa lo editado.
   */
  const shouldOverrideCustomerIdForInvoice = useMemo(() => {
    if (!generateInvoice) return false;
    if (!selectedCustomer) return false;
    if (selectedCustomer.Id_Cliente === '0') return false;

    const originalDoc = (selectedCustomer.Documento || '').trim();
    const originalIva = (selectedCustomer.Condicion_IVA || '').trim();
    const originalDocType = (selectedCustomer['Tipo.Documento'] || '').trim();

    const currentDoc = (billingDoc || '').trim();
    const currentIva = (condicionIVA || '').trim();
    const currentDocType = (billingDocType || '').trim();

    return currentDoc !== originalDoc || currentIva !== originalIva || currentDocType !== originalDocType;
  }, [generateInvoice, selectedCustomer, billingDoc, condicionIVA, billingDocType]);

  const handleFinalize = async () => {
    setError('');
    if (!selectedCustomer) {
      setError('Por favor, seleccione un cliente.');
      return;
    }
    if (total > 0 && totalPaid < total && !isCtaCteEnabled) {
      setError(`El pago (${formatCurrency(totalPaid)}) es menor que el total (${formatCurrency(total)}). Cubra la diferencia.`);
      return;
    }
    if (generateInvoice && selectedCustomer.Id_Cliente === '0' && total > CONSUMIDOR_FINAL_INVOICE_LIMIT) {
      setError(
        `Para ventas mayores a ${formatCurrency(
          CONSUMIDOR_FINAL_INVOICE_LIMIT
        )}, no se puede facturar a "Consumidor Final" genérico. Por favor, cree o seleccione un cliente con sus datos fiscales.`
      );
      return;
    }

    // Validación extra previa al envío
    if (generateInvoice && condicionIVA === 'Responsable Inscripto' && billingDocType !== 'CUIT') {
      setError('Error: Para Responsable Inscripto el tipo de documento debe ser obligatoriamente CUIT.');
      return;
    }

    if (generateInvoice && !billingDoc) {
      setError('Error: Debe ingresar el número de documento para generar la factura.');
      return;
    }

    setIsProcessing(true);

    // Customer que viaja en el payload:
    // - siempre incluye los valores editados manualmente
    // - si hubo edición fiscal y el cliente era real, forzamos Id_Cliente='0' SOLO para la factura
    const customerForSale: Customer = {
      ...selectedCustomer,
      Condicion_IVA: condicionIVA,
      Documento: billingDoc,
      'Tipo.Documento': billingDocType,
      ...(shouldOverrideCustomerIdForInvoice ? { Id_Cliente: '0' } : {}),
    };

    const saleData: Sale = {
      id: saleBeingEdited ? saleBeingEdited.id : crypto.randomUUID(),
      date: new Date(),
      customer: customerForSale,
      items: cart,
      itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      adjustmentAmount,
      adjustmentDescription,
      total,
      payment: {
        cash: parseLocaleNumber(cash),
        digital: parseLocaleNumber(digital),
        credit: isCtaCteEnabled ? parseLocaleNumber(credit) : 0,
        echeqs: echeqs,
      },
      facturacion: generateInvoice ? facturacionType : 'N',
    };

    try {
      await onFinalizeSale(saleData, generateInvoice, { condicionIVA, facturacionType });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.Id_Cliente,
        label: `${c['Nombre y Apellido']} ${c.Documento ? `(${c.Documento})` : ''}`,
      })),
    [customers]
  );

  const displayedChangeAmount = useMemo(() => {
    if (Math.abs(change) < 0.01) {
      return 0;
    }
    if (change > 0) {
      return Math.floor(change);
    } else {
      return Math.ceil(Math.abs(change));
    }
  }, [change]);

  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => {} : onClose} title={isBudgetMode ? 'Presupuestar' : (saleBeingEdited ? 'Editar Venta' : 'Finalizar Venta')} size="4xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center border border-gray-200">
            <span className="text-xl font-bold text-gray-800">Total a Pagar</span>
            <span className="text-3xl font-bold text-blue-600">{formatCurrency(total)}</span>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Ajustes de Total</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
                <label className="block text-sm font-medium text-green-800">Descuento</label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      className="w-full border-green-300 rounded-md shadow-sm text-sm pl-2 pr-6"
                    />
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 text-sm">%</span>
                  </div>
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="w-full border-green-300 rounded-md shadow-sm text-sm pl-6 pr-2"
                    />
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-gray-500 text-sm">$</span>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-2">
                <label className="block text-sm font-medium text-red-800">Recargo</label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={recargoPercent}
                      onChange={(e) => setRecargoPercent(e.target.value)}
                      className="w-full border-red-300 rounded-md shadow-sm text-sm pl-2 pr-6"
                    />
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 text-sm">%</span>
                  </div>
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={recargoAmount}
                      onChange={(e) => setRecargoAmount(e.target.value)}
                      className="w-full border-red-300 rounded-md shadow-sm text-sm pl-6 pr-2"
                    />
                    <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-gray-500 text-sm">$</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Detalles del Pago</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Efectivo</label>
                <div className="relative mt-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                    className="w-full text-lg border-gray-300 rounded-md py-1.5 pl-6"
                    disabled={isProcessing}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Digital</label>
                <div className="relative mt-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={digital}
                    onChange={(e) => setDigital(e.target.value)}
                    className="w-full text-lg border-gray-300 rounded-md py-1.5 pl-6"
                    disabled={isProcessing}
                  />
                </div>
              </div>
              <div title={!isCtaCteEnabled ? 'Solo disponible para clientes registrados' : ''}>
                <label className={`block text-sm font-medium ${!isCtaCteEnabled ? 'text-gray-400' : 'text-gray-700'}`}>Cta. Cte.</label>
                <div className="relative mt-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={credit}
                    onChange={(e) => setCredit(e.target.value)}
                    className="w-full text-lg border-gray-300 rounded-md py-1.5 pl-6 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isProcessing || !isCtaCteEnabled}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <label className="block text-sm font-medium text-gray-700">E-Cheqs</label>
              {echeqs.map((echeq, index) => (
                <div key={index} className="flex items-center space-x-2 bg-gray-50 p-2 rounded">
                  <input
                    type="number"
                    placeholder="Monto"
                    value={echeq.amount || ''}
                    onChange={(e) => handleEcheqChange(index, 'amount', e.target.value)}
                    className="w-1/2 border-gray-300 rounded-md text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Días"
                    value={echeq.days || ''}
                    onChange={(e) => handleEcheqChange(index, 'days', e.target.value)}
                    className="w-1/3 border-gray-300 rounded-md text-sm"
                  />
                  <button type="button" onClick={() => handleRemoveEcheq(index)} className="text-red-500 hover:text-red-700 p-1">
                    <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={handleAddEcheq} className="text-sm text-blue-600 hover:underline">
                + Agregar E-Cheq
              </button>
              {totalEcheqs > 0 && <p className="text-right text-sm font-semibold">Total E-Cheqs: {formatCurrency(totalEcheqs)}</p>}
            </div>
          </div>

          <div className="bg-gray-100 p-4 rounded-lg space-y-3 border border-gray-200">
            <div className="flex justify-between items-center text-lg">
              <span className="font-semibold text-gray-700">Total Pagado</span>
              <span className="font-bold">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between items-center text-lg">
              <span className={`font-semibold ${change < 0 ? 'text-red-600' : 'text-green-600'}`}>{change < 0 ? 'Faltan' : 'Vuelto'}</span>
              <span className={`font-bold ${change < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(displayedChangeAmount)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6 flex flex-col">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <div className="flex items-center space-x-2">
              <div className="flex-grow">
                <SearchableSelect
                  options={customerOptions}
                  value={selectedCustomer?.Id_Cliente || ''}
                  onChange={(value) => setSelectedCustomer(customers.find((c) => c.Id_Cliente === value) || null)}
                  disabled={isProcessing}
                />
              </div>
              <button
                type="button"
                onClick={onAddNewCustomer}
                className="flex-shrink-0 bg-blue-100 text-blue-700 p-2 rounded-md hover:bg-blue-200"
                disabled={isProcessing}
              >
                <Icon
                  path="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
                  className="w-5 h-5"
                />
              </button>
            </div>
            {selectedCustomer && (
              <div className="mt-2 p-2 bg-gray-50 text-xs text-gray-600 rounded">
                {selectedCustomer.Condicion_IVA} - {selectedCustomer.Documento || 'Sin documento'}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={generateInvoice}
                onChange={(e) => setGenerateInvoice(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-blue-600"
                disabled={isProcessing}
              />
              <span className="font-medium text-gray-700">Generar Factura Electrónica</span>
            </label>

            {generateInvoice && (
              <div className="bg-blue-50 p-4 rounded-lg space-y-4 border border-blue-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Condición ante el IVA</label>
                    <select
                      value={condicionIVA}
                      onChange={(e) => setCondicionIVA(e.target.value as Customer['Condicion_IVA'])}
                      className="mt-1 block w-full border-gray-300 rounded-md"
                      disabled={isProcessing}
                    >
                      <option>Consumidor Final</option>
                      <option>Responsable Inscripto</option>
                      <option>Responsable Monotributo</option>
                      <option>Sujeto Exento</option>
                      <option>Sujeto no Categorizado</option>
                      <option>IVA No Alcanzado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo Factura</label>
                    <select
                      value={facturacionType}
                      onChange={(e) => setFacturacionType(e.target.value as 'A' | 'B')}
                      className="mt-1 block w-full border-gray-300 rounded-md font-bold"
                      disabled={isProcessing}
                    >
                      <option value="A">Factura A</option>
                      <option value="B">Factura B</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo Documento</label>
                    <select
                      value={billingDocType}
                      onChange={(e) => setBillingDocType(e.target.value)}
                      className={`mt-1 block w-full border-gray-300 rounded-md ${
                        condicionIVA === 'Responsable Inscripto' ? 'bg-gray-100 font-bold' : ''
                      }`}
                      disabled={condicionIVA === 'Responsable Inscripto'}
                    >
                      <option value="DNI">DNI</option>
                      <option value="CUIT">CUIT</option>
                      <option value="CUIL">CUIL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Nro. de Documento</label>
                    <input
                      type="text"
                      value={billingDoc}
                      onChange={(e) => setBillingDoc(e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md"
                      placeholder={billingDocType === 'CUIT' ? '20-XXXXXXXX-X' : 'XXXXXXXX'}
                      required={generateInvoice}
                      disabled={isProcessing}
                    />
                  </div>
                </div>
                <div className="flex justify-center pt-2">
                  <img
                    src="https://dgrentas.arcat.gob.ar/IngresosBrutosAFIp/assets/img/Rentas-Logo-nuevo-chico.png"
                    alt="Logo ARCA"
                    className="h-10 opacity-75"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex-grow"></div>

          {error && <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-bold border border-red-200">{error}</div>}

          <div className="pt-4 border-t flex flex-col space-y-3">
            <button
              onClick={handleFinalize}
              disabled={isProcessing}
              className={`w-full ${isBudgetMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} text-white py-3 rounded-lg text-lg font-semibold flex items-center justify-center space-x-2 disabled:bg-gray-400`}
            >
              {isProcessing ? (
                <Icon
                  path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z"
                  className="w-5 h-5 animate-spin"
                />
              ) : (
                <Icon
                  path={isBudgetMode ? "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" : "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z"}
                  className="w-6 h-6"
                />
              )}
              <span>{isProcessing ? 'Procesando...' : (isBudgetMode ? 'Guardar Presupuesto' : 'Confirmar Venta')}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
