import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PendingSale } from '../../types';
import * as api from '../../services/api';
import { Icon } from '../ui/Icon';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const formatCurrency = (value: number) =>
    `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatTime = (value: Date | null): string => {
    if (!value || Number.isNaN(value.getTime())) return '-';
    return value.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
};

// ─── Status badge ──────────────────────────────────────────────────────────────

type BadgeVariant = 'yellow' | 'blue' | 'green' | 'gray';

const STATUS_CONFIG: Record<
    PendingSale['status'],
    { label: string; variant: BadgeVariant; icon: string }
> = {
    waiting: {
        label: 'Esperando caja',
        variant: 'yellow',
        icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    claimed: {
        label: 'Tomado por cajero',
        variant: 'blue',
        icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    paid: {
        label: 'Cobrado',
        variant: 'green',
        icon: 'M9 12.75L11.25 15 15 9.75m-2.25 2.25A9 9 0 1112 3a9 9 0 010 18z',
    },
    cancelled: {
        label: 'Cancelado',
        variant: 'gray',
        icon: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
};

const BADGE_CLASSES: Record<BadgeVariant, string> = {
    yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    gray: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const StatusBadge: React.FC<{ status: PendingSale['status'] }> = ({ status }) => {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.waiting;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${BADGE_CLASSES[cfg.variant]}`}
        >
            <Icon path={cfg.icon} className="w-3.5 h-3.5 flex-shrink-0" />
            {cfg.label}
        </span>
    );
};

// ─── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; sub?: string }> = ({
    label,
    value,
    sub,
}) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
);

// ─── Main view ─────────────────────────────────────────────────────────────────

const SellerPendingSalesTrackingView: React.FC = () => {
    const { currentUser } = useContext(AuthContext);
    const { addToast } = useToast();
    const [sales, setSales] = useState<PendingSale[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const sellerId = currentUser?.ID_Usuario;
        if (!sellerId) {
            setError('No se pudo identificar al vendedor.');
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getMyTodayPendingSalesSupabase(sellerId);
            setSales(data);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.';
            setError(msg);
            addToast(msg, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, addToast]);

    useEffect(() => {
        load();
    }, [load]);

    const stats = useMemo(() => {
        const waiting = sales.filter(s => s.status === 'waiting').length;
        const paid = sales.filter(s => s.status === 'paid').length;
        const totalAmount = sales
            .filter(s => s.status !== 'cancelled')
            .reduce((sum, s) => sum + s.total, 0);
        return { total: sales.length, waiting, paid, totalAmount };
    }, [sales]);

    return (
        <div className="p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Mis pedidos enviados</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Seguimiento de pedidos enviados a caja durante el día de hoy.
                    </p>
                </div>
                <button
                    onClick={load}
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

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Pedidos enviados hoy" value={stats.total} />
                <StatCard label="Esperando" value={stats.waiting} />
                <StatCard label="Cobrados" value={stats.paid} />
                <StatCard label="Total enviado" value={formatCurrency(stats.totalAmount)} />
            </div>

            {/* Error */}
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {isLoading ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center text-slate-500">
                        <Icon
                            path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                            className="mb-3 h-8 w-8 animate-spin text-primary-700"
                        />
                        <span className="text-sm font-medium">Cargando pedidos...</span>
                    </div>
                ) : sales.length === 0 ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <Icon
                                path="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                                className="h-7 w-7"
                            />
                        </div>
                        <h2 className="text-base font-semibold text-slate-900">No enviaste pedidos a caja hoy</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Cuando envíes un carrito a caja desde el POS, los pedidos aparecerán aquí.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Pedido
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Estado
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Cliente
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Ítems
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Total
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Enviado
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Cajero
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        Cobrado
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {sales.map(sale => (
                                    <tr key={sale.id} className="hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                                            #{sale.pending_number}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                                            <StatusBadge status={sale.status} />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-700 max-w-[160px] truncate">
                                            {sale.customer_name_snapshot || 'Consumidor Final'}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600">
                                            {sale.items.reduce((sum, i) => sum + i.quantity, 0)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                            {formatCurrency(sale.total)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                                            {formatTime(sale.sent_to_cashier_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 max-w-[140px] truncate">
                                            {sale.cashier_name_snapshot || (
                                                sale.status === 'waiting'
                                                    ? <span className="text-slate-400 italic">—</span>
                                                    : <span className="text-slate-400 italic">—</span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                                            {sale.status === 'paid'
                                                ? formatTime(sale.paid_at)
                                                : sale.status === 'cancelled'
                                                ? formatTime(sale.cancelled_at)
                                                : <span className="text-slate-400 italic">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SellerPendingSalesTrackingView;
