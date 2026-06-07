import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StoreIncomingOrder } from '../../types';
import * as api from '../../services/api';
import { Icon } from '../ui/Icon';
import { useToast } from '../../contexts/ToastContext';

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

const getStatusClasses = (order: StoreIncomingOrder) => {
    if (order.status === 'delivered') {
        return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    }
    if (order.status === 'prepared') {
        return 'bg-sky-50 text-sky-700 ring-sky-200';
    }
    if (order.status === 'processed') {
        return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
    }
    if (order.status === 'pending') {
        return 'bg-amber-50 text-amber-700 ring-amber-200';
    }
    if (order.status === 'cancelled') {
        return 'bg-slate-100 text-slate-700 ring-slate-200';
    }
    if (order.status === 'error') {
        return 'bg-red-50 text-red-700 ring-red-200';
    }
    return 'bg-slate-50 text-slate-700 ring-slate-200';
};

const getStatusLabel = (order: StoreIncomingOrder) => {
    if (order.status === 'processed') return 'Stock descontado';
    if (order.status === 'prepared') return 'Preparado';
    if (order.status === 'delivered') return 'Entregado';
    if (order.status === 'pending') return 'Pendiente';
    if (order.status === 'cancelled') return 'Cancelado';
    if (order.status === 'error') return 'Error';
    return order.status || '-';
};

const getOrderItems = (order: StoreIncomingOrder) =>
    Array.isArray(order.items) && order.items.length > 0
        ? order.items
        : [{
            sku: order.item_sku,
            product_name: order.item_product_name,
            quantity: order.item_quantity,
            subtotal: order.total,
            matched_product: order.matched_product,
        }];

const getProductSummary = (order: StoreIncomingOrder) => {
    const items = getOrderItems(order);
    if (items.length <= 1) return items[0]?.product_name || '-';

    return `Pedido con ${items.length} productos`;
};

const getProductSubtitle = (order: StoreIncomingOrder) => {
    const items = getOrderItems(order);
    if (items.length <= 1) return null;

    const firstName = items[0]?.product_name || 'Producto';
    const remaining = items.length - 1;
    return `${firstName}${remaining > 0 ? ` + ${remaining} mas` : ''}`;
};

const canProcessOrder = (order: StoreIncomingOrder) =>
    order.status === 'pending' &&
    !order.stock_processed &&
    getOrderItems(order).length > 0 &&
    getOrderItems(order).every((item) =>
        Boolean(item.sku) &&
        Boolean(item.matched_product) &&
        Number(item.matched_product?.current_stock ?? 0) >= Number(item.quantity || 0)
    );

const getProcessBlockReason = (order: StoreIncomingOrder) => {
    if (order.status === 'processed') return 'Stock descontado';
    if (order.status === 'prepared') return 'Preparado';
    if (order.status === 'delivered') return 'Entregado';
    if (order.status === 'cancelled') return 'Cancelado';
    if (order.status === 'error') return 'Error';
    if (order.status !== 'pending' || order.stock_processed) return 'Ya procesado';
    const items = getOrderItems(order);
    if (items.some((item) => !item.sku || !item.matched_product)) return 'Producto no encontrado';
    if (items.some((item) => Number(item.matched_product?.current_stock || 0) < Number(item.quantity || 0))) return 'Sin stock';
    return null;
};

const canCancelOrder = (order: StoreIncomingOrder) =>
    ['pending', 'processed', 'prepared'].includes(String(order.status || ''));

const StoreOrdersView: React.FC = () => {
    const { addToast } = useToast();
    const [orders, setOrders] = useState<StoreIncomingOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadOrders = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await api.getStoreIncomingOrdersSupabase();
            setOrders(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudieron cargar los pedidos de tienda.';
            setError(message);
            addToast(message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    const summary = useMemo(() => {
        const pending = orders.filter((order) => order.status === 'pending' && !order.stock_processed).length;
        const matched = orders.filter((order) => getOrderItems(order).every((item) => item.matched_product)).length;
        const processable = orders.filter(canProcessOrder).length;
        return { pending, matched, processable };
    }, [orders]);

    const handleProcessOrder = useCallback(async (order: StoreIncomingOrder) => {
        if (!canProcessOrder(order)) {
            addToast(getProcessBlockReason(order) || 'El pedido no se puede procesar.', 'error');
            return;
        }

        setProcessingOrderId(order.id);
        setError(null);

        try {
            await api.processStoreIncomingOrderSupabase(order.id);
            addToast('Pedido de tienda procesado correctamente.', 'success');
            await loadOrders();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo procesar el pedido.';
            setError(message);
            addToast(message, 'error');
            await loadOrders();
        } finally {
            setProcessingOrderId(null);
        }
    }, [addToast, loadOrders]);

    const handleUpdateOrderStatus = useCallback(async (
        order: StoreIncomingOrder,
        nextStatus: 'prepared' | 'delivered' | 'cancelled'
    ) => {
        const labelByStatus: Record<typeof nextStatus, string> = {
            prepared: 'Pedido marcado como preparado.',
            delivered: 'Pedido marcado como entregado.',
            cancelled: 'Pedido cancelado.',
        };

        setProcessingOrderId(order.id);
        setError(null);

        try {
            await api.updateStoreIncomingOrderStatusSupabase(
                order.id,
                nextStatus,
                labelByStatus[nextStatus]
            );
            addToast(labelByStatus[nextStatus], 'success');
            await loadOrders();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado del pedido.';
            setError(message);
            addToast(message, 'error');
            await loadOrders();
        } finally {
            setProcessingOrderId(null);
        }
    }, [addToast, loadOrders]);

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pedidos tienda</h1>
                    <p className="text-sm text-slate-500 mt-1">Pedidos recibidos desde la tienda externa para procesar stock.</p>
                </div>
                <button
                    onClick={loadOrders}
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pendientes</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{summary.pending}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Con producto</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{summary.matched}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Procesables</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{summary.processable}</p>
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
                        <span className="text-sm font-medium">Cargando pedidos tienda...</span>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <Icon
                                path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                className="h-7 w-7"
                            />
                        </div>
                        <h2 className="text-base font-semibold text-slate-900">No hay pedidos de tienda</h2>
                        <p className="mt-1 text-sm text-slate-500">Cuando entre un pedido externo va a aparecer aca.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha tienda</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Producto</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Cant.</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Direccion / envio</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Accion</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {orders.map((order) => {
                                    const reason = getProcessBlockReason(order);
                                    const items = getOrderItems(order);
                                    const totalQuantity = Number(order.total_quantity || 0) > 0
                                        ? order.total_quantity
                                        : items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                                    const productSubtitle = getProductSubtitle(order);
                                    const isExpanded = expandedOrderId === order.id;
                                    return (
                                        <React.Fragment key={order.id}>
                                            <tr className="hover:bg-slate-50 align-top">
                                                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatDateTime(order.store_created_at || order.created_at)}</td>
                                                <td className="min-w-80 px-4 py-3 text-sm text-slate-700">
                                                    <div className="font-semibold text-slate-900">{getProductSummary(order)}</div>
                                                    {productSubtitle && <div className="mt-1 text-xs text-slate-500">{productSubtitle}</div>}
                                                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                                                        {items.every((item) => item.matched_product) ? (
                                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Productos encontrados</span>
                                                        ) : (
                                                            <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">Producto no encontrado</span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                                            className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
                                                        >
                                                            {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">{totalQuantity}</td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900">{formatCurrency(order.total)}</td>
                                                <td className="min-w-64 px-4 py-3 text-sm text-slate-600">
                                                    <div>{order.customer_address || '-'}</div>
                                                    <div className="text-xs text-slate-400">{order.shipping_method || '-'}</div>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-left">
                                                    <div className="flex flex-col items-start gap-2">
                                                        {order.status === 'pending' && canProcessOrder(order) && (
                                                            <button
                                                                onClick={() => handleProcessOrder(order)}
                                                                disabled={processingOrderId === order.id}
                                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                                                            >
                                                                <Icon
                                                                    path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                                    className={`h-4 w-4 ${processingOrderId === order.id ? 'animate-spin' : ''}`}
                                                                />
                                                                {processingOrderId === order.id ? 'Procesando...' : 'Procesar pedido'}
                                                            </button>
                                                        )}
                                                        {order.status === 'pending' && !canProcessOrder(order) && (
                                                            <span className="text-sm font-medium text-slate-500">{reason || '-'}</span>
                                                        )}
                                                        {order.status === 'processed' && (
                                                            <button
                                                                onClick={() => handleUpdateOrderStatus(order, 'prepared')}
                                                                disabled={processingOrderId === order.id}
                                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                                                            >
                                                                Marcar preparado
                                                            </button>
                                                        )}
                                                        {order.status === 'prepared' && (
                                                            <button
                                                                onClick={() => handleUpdateOrderStatus(order, 'delivered')}
                                                                disabled={processingOrderId === order.id}
                                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-70"
                                                            >
                                                                Marcar entregado
                                                            </button>
                                                        )}
                                                        {canCancelOrder(order) && (
                                                            <button
                                                                onClick={() => handleUpdateOrderStatus(order, 'cancelled')}
                                                                disabled={processingOrderId === order.id}
                                                                className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        )}
                                                        {!canCancelOrder(order) && order.status !== 'pending' && order.status !== 'processed' && order.status !== 'prepared' && (
                                                            <span className="text-sm font-medium text-slate-500">{getStatusLabel(order)}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-sm">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getStatusClasses(order)}`}>
                                                        {getStatusLabel(order)}
                                                    </span>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        stock_processed: {order.stock_processed ? 'true' : 'false'}
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-slate-50">
                                                    <td colSpan={7} className="px-4 py-4">
                                                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                                            <table className="min-w-full divide-y divide-slate-200">
                                                                <thead className="bg-white">
                                                                    <tr>
                                                                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">SKU</th>
                                                                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Nombre</th>
                                                                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Cant.</th>
                                                                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Subtotal</th>
                                                                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Producto interno</th>
                                                                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Stock</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {items.map((item, index) => {
                                                                        const hasStock = Boolean(item.matched_product) &&
                                                                            Number(item.matched_product?.current_stock || 0) >= Number(item.quantity || 0);
                                                                        return (
                                                                            <tr key={`${order.id}-${item.sku || index}`}>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-slate-700">{item.sku || '-'}</td>
                                                                                <td className="min-w-72 px-3 py-2 text-sm text-slate-700">{item.product_name || '-'}</td>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-slate-600">{item.quantity}</td>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-slate-600">{formatCurrency(item.subtotal)}</td>
                                                                                <td className="min-w-64 px-3 py-2 text-sm">
                                                                                    {item.matched_product ? (
                                                                                        <div>
                                                                                            <div className="font-semibold text-slate-900">{item.matched_product.name}</div>
                                                                                            <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                                                                                <span className={`rounded-full px-2 py-0.5 ${item.matched_product.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                                                                    {item.matched_product.is_active ? 'Activo' : 'Inactivo'}
                                                                                                </span>
                                                                                                <span className={`rounded-full px-2 py-0.5 ${item.matched_product.is_online ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                                                    {item.matched_product.is_online ? 'Online' : 'No online'}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="font-medium text-red-700">No encontrado</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="whitespace-nowrap px-3 py-2 text-sm">
                                                                                    {item.matched_product ? (
                                                                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                                                            {item.matched_product.current_stock} disponible{hasStock ? '' : ' - sin stock'}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-sm text-slate-400">-</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoreOrdersView;
