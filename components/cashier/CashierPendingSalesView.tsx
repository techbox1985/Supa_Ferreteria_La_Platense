import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CartItem, Customer, PendingSale, Sale } from '../../types';
import * as api from '../../services/api';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CheckoutModal } from '../pos/CheckoutModal';

interface CashierPendingSalesViewProps {
    customers: Customer[];
    refreshData: () => void | Promise<void>;
}

const formatCurrency = (value: number) =>
    `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatDateTime = (value: Date | null) => {
    if (!value || Number.isNaN(value.getTime())) return '-';
    return value.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getStatusLabel = (status: PendingSale['status']) => {
    if (status === 'waiting') return 'Esperando';
    if (status === 'claimed') return 'Tomado';
    return status;
};

const getStatusClasses = (status: PendingSale['status']) =>
    status === 'claimed'
        ? 'bg-sky-50 text-sky-700 ring-sky-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';

const getClaimLabel = (sale: PendingSale, currentUserId?: string) => {
    if (sale.status !== 'claimed') return null;
    if (sale.cashier_id && sale.cashier_id === currentUserId) return 'Tomado por vos';
    return `Tomado por: ${sale.cashier_name_snapshot || 'otro cajero'}`;
};

const canCurrentCashierCharge = (sale: PendingSale, currentUserId?: string) =>
    sale.status === 'claimed' &&
    Boolean(sale.cashier_id) &&
    sale.cashier_id === currentUserId;

const buildCheckoutCartFromPendingSale = (sale: PendingSale): CartItem[] =>
    sale.items.map((item, index) => ({
        product: {
            id: item.product_id || undefined,
            cod: item.product_code || `PENDING_${sale.id}_${index}`,
            Producto: item.product_name_snapshot || 'Producto',
            Precio: item.unit_price,
            'Precio Final': item.unit_price,
        },
        quantity: item.quantity,
        price: item.unit_price,
    }));

const CashierPendingSalesView: React.FC<CashierPendingSalesViewProps> = ({ customers, refreshData }) => {
    const { currentUser, activeShift } = useContext(AuthContext);
    const { addToast } = useToast();
    const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
    const [selectedSale, setSelectedSale] = useState<PendingSale | null>(null);
    const [saleToCharge, setSaleToCharge] = useState<PendingSale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [claimingSaleId, setClaimingSaleId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadPendingSales = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const sales = await api.getPendingSalesSupabase();
            setPendingSales(sales);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudieron cargar los pedidos pendientes.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPendingSales();
    }, [loadPendingSales]);

    const handleClaimSale = useCallback(async (sale: PendingSale) => {
        if (sale.status !== 'waiting') {
            addToast('El pedido ya no estÃ¡ disponible para tomar.', 'error');
            await loadPendingSales();
            return;
        }

        if (!currentUser?.ID_Usuario) {
            addToast('No se pudo identificar al cajero actual.', 'error');
            return;
        }

        setClaimingSaleId(sale.id);
        setError(null);

        try {
            await api.claimPendingSaleSupabase(
                sale.id,
                currentUser.ID_Usuario,
                currentUser.Nombre || 'Cajero'
            );
            addToast('Pedido tomado correctamente.', 'success');
            await loadPendingSales();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo tomar el pedido.';
            setError(message);
            addToast(message, 'error');
            await loadPendingSales();
        } finally {
            setClaimingSaleId(null);
        }
    }, [addToast, currentUser, loadPendingSales]);

    const summary = useMemo(() => {
        const total = pendingSales.reduce((sum, sale) => sum + sale.total, 0);
        const itemCount = pendingSales.reduce((sum, sale) => sum + sale.items.length, 0);
        return { total, itemCount };
    }, [pendingSales]);

    const checkoutCart = useMemo(() => (
        saleToCharge ? buildCheckoutCartFromPendingSale(saleToCharge) : []
    ), [saleToCharge]);

    // Pre-seleccionar el cliente del pedido pendiente en CheckoutModal para
    // que el descuento automático del cliente se aplique automáticamente.
    const preSelectedCustomerForCheckout = useMemo(() => {
        if (!saleToCharge?.customer_id) return null;
        return customers.find(c => c.Id_Cliente === saleToCharge.customer_id) || null;
    }, [saleToCharge, customers]);

    const handleFinalizePendingSale = useCallback(async (checkoutSale: Sale, generateInvoice: boolean) => {
        if (!saleToCharge) throw new Error('No hay pedido seleccionado para cobrar.');
        if (!currentUser?.ID_Usuario) throw new Error('No se pudo identificar al cajero actual.');
        if (saleToCharge.status !== 'claimed') throw new Error('El pedido no esta tomado.');
        if (saleToCharge.cashier_id !== currentUser.ID_Usuario) {
            throw new Error('El pedido fue tomado por otro cajero.');
        }
        if (!saleToCharge.items || saleToCharge.items.length === 0) {
            throw new Error('El pedido no tiene items.');
        }
        if (Number(saleToCharge.total || 0) <= 0) {
            throw new Error('El total del pedido debe ser mayor a cero.');
        }

        const latestClaimedSales = await api.getPendingSalesSupabase(['claimed']);
        const latestPendingSale = latestClaimedSales.find((item) => item.id === saleToCharge.id);
        if (!latestPendingSale) {
            throw new Error('El pedido ya no esta disponible para cobrar.');
        }
        if (latestPendingSale.status !== 'claimed' || latestPendingSale.cashier_id !== currentUser.ID_Usuario) {
            throw new Error('El pedido ya no esta tomado por el cajero actual.');
        }

        let operationalShift = activeShift;
        if (!operationalShift) {
            operationalShift = await api.getAnyActiveShiftSupabase();
        }

        if (!operationalShift) {
            throw new Error('No hay un turno activo. No se puede registrar la venta.');
        }

        const saleWithPendingData: Sale = {
            ...checkoutSale,
            items: checkoutCart,
            itemCount: checkoutCart.reduce((sum, item) => sum + item.quantity, 0),
            // subtotal base viene del pedido pendiente (total de lista sin descuento)
            subtotal: Number(saleToCharge.subtotal ?? checkoutSale.subtotal ?? 0),
            adjustmentAmount: Number(saleToCharge.adjustment_amount ?? checkoutSale.adjustmentAmount ?? 0),
            // total viene de CheckoutModal (ya aplica descuento automático del cliente)
            // NO usar saleToCharge.total porque ese valor no tiene el descuento
            total: Number(checkoutSale.total ?? saleToCharge.total ?? 0),
            // campos de descuento vienen de ...checkoutSale (spread arriba)
            shiftId: operationalShift.ID_Turno,
        };

        let finalSaleObject: Sale = { ...saleWithPendingData };

        if (generateInvoice) {
            addToast('Generando factura electronica...', 'info');
            const invoiceResponse = await api.generateElectronicInvoice(finalSaleObject);

            if (invoiceResponse?.status !== 'facturado' || !invoiceResponse?.data) {
                const providerMessage = invoiceResponse?.message || 'No se pudo obtener un comprobante fiscal valido.';
                const reason = invoiceResponse?.reason ? ` (${invoiceResponse.reason})` : '';
                const debugDetail = Array.isArray(invoiceResponse?.debug) && invoiceResponse.debug.length > 0
                    ? ` Detalle: ${invoiceResponse.debug.join(' | ')}`
                    : '';
                throw new Error(`${providerMessage}${reason}.${debugDetail}`);
            }

            const invoiceData = invoiceResponse.data;
            const effectiveType = invoiceData?.effectiveType || finalSaleObject.facturacion;
            if (effectiveType !== finalSaleObject.facturacion) {
                finalSaleObject.facturacion = effectiveType;
            }
            if (!invoiceData || !invoiceData.cae || invoiceData.cae === 'DEV_MODE_NO_CAE') {
                const providerHint = invoiceData?.message || invoiceData?.error || invoiceResponse?.message || 'Sin detalle adicional del proveedor.';
                throw new Error(`El proveedor de facturacion respondio sin un CAE. ${providerHint}`);
            }

            finalSaleObject.facturaInfo = {
                cae: invoiceData.cae || '',
                nro: invoiceData.nro || '',
                vtoCae: invoiceData.vtoCae || '',
                qrData: invoiceData.qrData || '',
                fecha: new Date().toLocaleString('es-AR'),
                url: invoiceData.comprobante_pdf_url || invoiceData.url,
                ticketUrl: invoiceData.comprobante_ticket_url || invoiceData.ticketUrl,
            };
            (finalSaleObject as any).Factura_Ticket_URL =
                invoiceData.comprobante_ticket_url ||
                invoiceData.ticketUrl ||
                '';
            addToast(`Factura ${invoiceData.nro} generada.`, 'success');
        }

        const addSaleResult = await api.addSale(finalSaleObject, operationalShift.ID_Turno);
        const createdSaleId = addSaleResult?.sale_id || finalSaleObject.id;

        await api.markPendingSaleAsPaidSupabase(
            saleToCharge.id,
            createdSaleId,
            currentUser.ID_Usuario,
            currentUser.Nombre || 'Cajero'
        );

        addToast('Pedido cobrado correctamente.', 'success');
        setSaleToCharge(null);
        await refreshData();
        await loadPendingSales();
    }, [activeShift, addToast, checkoutCart, currentUser, loadPendingSales, refreshData, saleToCharge]);

    const handleAddNewCustomerFromCashier = useCallback(() => {
        addToast('El alta de clientes desde el cobro de Cajero se mantiene para la proxima etapa.', 'info');
    }, [addToast]);

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pedidos pendientes</h1>
                    <p className="text-sm text-slate-500 mt-1">Pedidos enviados desde POS para revisar en caja.</p>
                </div>
                <button
                    onClick={loadPendingSales}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    <Icon
                        path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                        className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`}
                    />
                    Refrescar
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pedidos</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{pendingSales.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Items</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{summary.itemCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total pendiente</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(summary.total)}</p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {isLoading ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center text-slate-500">
                        <Icon
                            path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                            className="mb-3 h-8 w-8 animate-spin text-primary-700"
                        />
                        <span className="text-sm font-medium">Cargando pedidos pendientes...</span>
                    </div>
                ) : pendingSales.length === 0 ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <Icon
                                path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                className="h-7 w-7"
                            />
                        </div>
                        <h2 className="text-base font-semibold text-slate-900">No hay pedidos pendientes</h2>
                        <p className="mt-1 text-sm text-slate-500">Cuando un vendedor envie un carrito a caja va a aparecer aca.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Pedido</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Vendedor</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Cliente</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Items</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Enviado</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Toma</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Detalle</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {pendingSales.map((sale) => (
                                    <tr key={sale.id} className="hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">#{sale.pending_number}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusClasses(sale.status)}`}>
                                                {getStatusLabel(sale.status)}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{sale.seller_name_snapshot || '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{sale.customer_name_snapshot || 'Consumidor Final'}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">{sale.items.length}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(sale.total)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDateTime(sale.sent_to_cashier_at)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                                            {sale.status === 'waiting' ? (
                                                <button
                                                    onClick={() => handleClaimSale(sale)}
                                                    disabled={claimingSaleId === sale.id}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                                                >
                                                    <Icon
                                                        path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                        className={`h-4 w-4 ${claimingSaleId === sale.id ? 'animate-spin' : ''}`}
                                                    />
                                                    {claimingSaleId === sale.id ? 'Tomando...' : 'Tomar pedido'}
                                                </button>
                                            ) : (
                                                <span className="text-sm font-medium text-slate-600">
                                                    {getClaimLabel(sale, currentUser?.ID_Usuario) || 'Tomado'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                            {canCurrentCashierCharge(sale, currentUser?.ID_Usuario) && (
                                                <button
                                                    onClick={() => setSaleToCharge(sale)}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                                                >
                                                    <Icon
                                                        path="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z"
                                                        className="h-4 w-4"
                                                    />
                                                    Cobrar
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setSelectedSale(sale)}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
                                            >
                                                <Icon
                                                    path="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                    className="h-4 w-4"
                                                />
                                                Ver
                                            </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                isOpen={!!selectedSale}
                onClose={() => setSelectedSale(null)}
                title={selectedSale ? `Pedido #${selectedSale.pending_number}` : 'Detalle del pedido'}
                size="3xl"
            >
                {selectedSale && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vendedor</p>
                                <p className="mt-1 text-sm font-medium text-slate-800">{selectedSale.seller_name_snapshot || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cliente</p>
                                <p className="mt-1 text-sm font-medium text-slate-800">{selectedSale.customer_name_snapshot || 'Consumidor Final'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Enviado</p>
                                <p className="mt-1 text-sm font-medium text-slate-800">{formatDateTime(selectedSale.sent_to_cashier_at)}</p>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Cantidad</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Unitario</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedSale.items.map((item) => (
                                        <tr key={item.id || `${item.product_code}-${item.product_name_snapshot}`}>
                                            <td className="px-4 py-3 text-sm text-slate-800">
                                                <p className="font-medium">{item.product_name_snapshot}</p>
                                                {item.product_code && <p className="text-xs text-slate-400">Cod. {item.product_code}</p>}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">{item.quantity}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(item.unit_price)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(item.line_total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end">
                            <div className="w-full max-w-xs rounded-lg bg-slate-50 p-4">
                                <div className="flex justify-between text-sm text-slate-600">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(selectedSale.subtotal)}</span>
                                </div>
                                {selectedSale.adjustment_amount !== 0 && (
                                    <div className="mt-2 flex justify-between text-sm text-slate-600">
                                        <span>Ajuste</span>
                                        <span>{formatCurrency(selectedSale.adjustment_amount)}</span>
                                    </div>
                                )}
                                <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-900">
                                    <span>Total</span>
                                    <span>{formatCurrency(selectedSale.total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <CheckoutModal
                isOpen={!!saleToCharge}
                onClose={() => setSaleToCharge(null)}
                cart={checkoutCart}
                customers={customers}
                onFinalizeSale={handleFinalizePendingSale}
                onAddNewCustomer={handleAddNewCustomerFromCashier}
                saleBeingEdited={null}
                isBudgetMode={false}
                preSelectedCustomer={preSelectedCustomerForCheckout}
            />
        </div>
    );
};

export default CashierPendingSalesView;
