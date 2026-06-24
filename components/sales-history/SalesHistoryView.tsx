
import React, { useState, useMemo, useContext, useEffect, useCallback, useRef } from 'react';
import { Sale, Product, Customer, User, Shift, AccountTransaction, PendingSale } from '../../types';
import { Icon } from '../ui/Icon';
import { SalesDashboard } from '../shared/SalesDashboard';
import { AuthContext } from '../../contexts/AuthContext';


interface SalesHistoryViewProps {
    processedSales: Sale[];
    products: Product[];
    customers: Customer[];
    allUsers: User[];
    shifts: Shift[];
    isLoading: boolean;
    refreshData: () => void;
    fetchSalesForDateRange?: (startDate: string, endDate: string) => Promise<void>;
    onEditSale?: (sale: Sale) => void;
    accountTransactions?: AccountTransaction[];
    pendingSales?: PendingSale[];
}

const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({ processedSales, customers, allUsers, shifts, isLoading, refreshData, fetchSalesForDateRange, onEditSale, accountTransactions = [], pendingSales = [] }) => {
    const { currentUser } = useContext(AuthContext);
    const isSeller = currentUser?.Rol === 'Vendedor';
    const currentUserId = String(currentUser?.ID_Usuario || '').trim();

    // Helper para obtener YYYY-MM-DD en hora local
    const getLocalDateString = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getInitialStartDate = () => {
        const now = new Date();
        return getLocalDateString(now);
    };

    const [startDate, setStartDate] = useState(getInitialStartDate);
    
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        // Por defecto: hoy (fecha local del usuario)
        return getLocalDateString(now);
    });

    const [draftStartDate, setDraftStartDate] = useState(startDate);
    const [draftEndDate, setDraftEndDate] = useState(endDate);

    const [sellerFilter, setSellerFilter] = useState('All');
    // Nuevo filtro de tipo de documento: 'all' | 'sale' | 'budget'
    const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'sale' | 'budget'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const normalizeText = (value: unknown) =>
        String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();

    const isDevMode = Boolean((import.meta as any)?.env?.DEV);

    const sellerIdentity = useMemo(() => {
        const currentUserAny = (currentUser || {}) as any;
        return {
            profileId: String(currentUserAny?.id || currentUserAny?.ID_Usuario || '').trim(),
            authUserId: String(currentUserAny?.user_id || currentUserAny?.userId || '').trim(),
            email: normalizeText(currentUserAny?.email || currentUserAny?.Email || ''),
            name: normalizeText(currentUserAny?.nombre || currentUserAny?.Nombre || ''),
        };
    }, [currentUser]);

    const sellerOwnedShiftIds = useMemo(() => {
        if (!isSeller) return new Set<string>();

        const candidateProfileId = sellerIdentity.profileId;
        const candidateAuthUserId = sellerIdentity.authUserId;
        const candidateEmail = sellerIdentity.email;
        const candidateName = sellerIdentity.name;

        const ids = new Set<string>();

        for (const shift of shifts || []) {
            const profileId = String((shift as any)?.user_profile_id || shift.ID_Usuario || '').trim();
            const profileUserId = String((shift as any)?.user_profile_user_id || '').trim();
            const profileEmail = normalizeText((shift as any)?.user_profile_email || '');
            const profileName = normalizeText((shift as any)?.user_profile_nombre || '');

            const matchByProfileId = Boolean(candidateProfileId) && Boolean(profileId) && profileId === candidateProfileId;
            const matchByAuthUserId = Boolean(candidateAuthUserId) && Boolean(profileUserId) && profileUserId === candidateAuthUserId;
            const matchByEmail = Boolean(candidateEmail) && Boolean(profileEmail) && profileEmail === candidateEmail;
            const canFallbackByName = !candidateProfileId && !candidateAuthUserId && !candidateEmail;
            const matchByName = canFallbackByName && Boolean(candidateName) && Boolean(profileName) && profileName === candidateName;

            if (matchByProfileId || matchByAuthUserId || matchByEmail || matchByName) {
                ids.add(shift.ID_Turno);
            }
        }

        if (ids.size === 0) {
            console.warn('[SELLER_HISTORY_SCOPE_WARNING] No se pudo asociar vendedor con shift/user_profile.', {
                currentUserId: candidateProfileId || null,
                currentAuthUserId: candidateAuthUserId || null,
                currentEmail: candidateEmail || null,
                currentName: candidateName || null,
                shiftsLoaded: Array.isArray(shifts) ? shifts.length : 0,
            });
        }

        return ids;
    }, [isSeller, shifts, sellerIdentity]);

    const convertedSaleSellerMap = useMemo(() => {
        const map = new Map<string, { sellerId: string; sellerName: string; pendingNumber?: number }>();
        (pendingSales || []).forEach((ps) => {
            const convertedSaleId = String(ps?.converted_sale_id || '').trim();
            if (!convertedSaleId) return;
            map.set(convertedSaleId, {
                sellerId: String(ps?.seller_id || '').trim(),
                sellerName: String(ps?.seller_name_snapshot || '').trim(),
                pendingNumber: Number.isFinite(Number(ps?.pending_number)) ? Number(ps.pending_number) : undefined,
            });
        });
        return map;
    }, [pendingSales]);

    const budgetScopeWarningShownRef = useRef(false);
    const budgetScopeDebugCountRef = useRef(0);

    const isSaleOwnedBySeller = useCallback((sale: Sale): boolean => {
        const documentType = String((sale as any)?.document_type || '').trim().toLowerCase();
        const isBudget = documentType === 'budget';
        const convertedSeller =
            convertedSaleSellerMap.get(String(sale.id || '').trim()) ||
            convertedSaleSellerMap.get(String((sale as any)?.converted_to_sale_id || '').trim());

        if (convertedSeller) {
            const bySellerId =
                Boolean(convertedSeller.sellerId) &&
                (
                    convertedSeller.sellerId === sellerIdentity.profileId ||
                    convertedSeller.sellerId === currentUserId ||
                    convertedSeller.sellerId === sellerIdentity.authUserId
                );
            const bySellerName =
                !bySellerId &&
                Boolean(convertedSeller.sellerName) &&
                normalizeText(convertedSeller.sellerName) === sellerIdentity.name;
            const matched = bySellerId || bySellerName;

            if (isDevMode && isBudget && budgetScopeDebugCountRef.current < 5) {
                budgetScopeDebugCountRef.current += 1;
                console.debug('[SELLER_BUDGET_SCOPE_DEBUG]', {
                    saleNumber: sale.saleNumber || null,
                    documentType: documentType || null,
                    shiftId: sale.shiftId || null,
                    sellerId: convertedSeller.sellerId || null,
                    sellerName: convertedSeller.sellerName || null,
                    pendingNumber: convertedSeller.pendingNumber || (sale as any)?.pendingNumber || null,
                    currentUserId: sellerIdentity.profileId || currentUserId || null,
                    currentUserName: sellerIdentity.name || null,
                    match: matched,
                    source: 'pending_converted_sale_map',
                });
            }

            return matched;
        }

        const ownSellerId = String(
            (sale as any)?.sellerId ||
            (sale as any)?.seller_id ||
            (sale as any)?.userProfileId ||
            (sale as any)?.user_profile_id ||
            (sale as any)?.createdBy ||
            (sale as any)?.created_by ||
            (sale as any)?.userId ||
            (sale as any)?.user_id ||
            ''
        ).trim();
        const ownSellerName = String(
            (sale as any)?.sellerName ||
            (sale as any)?.seller_name_snapshot ||
            (sale as any)?.seller_name ||
            (sale as any)?.vendedor ||
            ''
        ).trim();

        if (isBudget && (ownSellerId || ownSellerName)) {
            const bySellerId = Boolean(ownSellerId) && (
                ownSellerId === sellerIdentity.profileId ||
                ownSellerId === currentUserId ||
                ownSellerId === sellerIdentity.authUserId
            );
            const bySellerName =
                !bySellerId &&
                Boolean(ownSellerName) &&
                normalizeText(ownSellerName) === sellerIdentity.name;
            const matched = bySellerId || bySellerName;

            if (isDevMode && budgetScopeDebugCountRef.current < 5) {
                budgetScopeDebugCountRef.current += 1;
                console.debug('[SELLER_BUDGET_SCOPE_DEBUG]', {
                    saleNumber: sale.saleNumber || null,
                    documentType: documentType || null,
                    shiftId: sale.shiftId || null,
                    sellerId: ownSellerId || null,
                    sellerName: ownSellerName || null,
                    pendingNumber: (sale as any)?.pendingNumber || null,
                    currentUserId: sellerIdentity.profileId || currentUserId || null,
                    currentUserName: sellerIdentity.name || null,
                    match: matched,
                    source: 'budget_own_fields',
                });
            }

            return matched;
        }

        const byShift = sellerOwnedShiftIds.has(String(sale.shiftId || '').trim());
        if (byShift) {
            if (isDevMode && isBudget && budgetScopeDebugCountRef.current < 5) {
                budgetScopeDebugCountRef.current += 1;
                console.debug('[SELLER_BUDGET_SCOPE_DEBUG]', {
                    saleNumber: sale.saleNumber || null,
                    documentType: documentType || null,
                    shiftId: sale.shiftId || null,
                    sellerId: ownSellerId || null,
                    sellerName: ownSellerName || null,
                    pendingNumber: (sale as any)?.pendingNumber || null,
                    currentUserId: sellerIdentity.profileId || currentUserId || null,
                    currentUserName: sellerIdentity.name || null,
                    match: true,
                    source: 'shift_fallback',
                });
            }
            return true;
        }

        if (isBudget && !budgetScopeWarningShownRef.current) {
            budgetScopeWarningShownRef.current = true;
            console.warn('[SELLER_BUDGET_SCOPE_WARNING] Presupuesto sin señales confiables de vendedor. Se incluye para evitar filtro destructivo.', {
                saleId: sale.id,
                saleNumber: sale.saleNumber || null,
                documentType: documentType || null,
                shiftId: sale.shiftId || null,
                sellerId: ownSellerId || null,
                sellerName: ownSellerName || null,
                pendingNumber: (sale as any)?.pendingNumber || null,
                currentUserId: sellerIdentity.profileId || currentUserId || null,
                currentUserName: sellerIdentity.name || null,
            });
        }

        if (isBudget) {
            if (isDevMode && budgetScopeDebugCountRef.current < 5) {
                budgetScopeDebugCountRef.current += 1;
                console.debug('[SELLER_BUDGET_SCOPE_DEBUG]', {
                    saleNumber: sale.saleNumber || null,
                    documentType: documentType || null,
                    shiftId: sale.shiftId || null,
                    sellerId: ownSellerId || null,
                    sellerName: ownSellerName || null,
                    pendingNumber: (sale as any)?.pendingNumber || null,
                    currentUserId: sellerIdentity.profileId || currentUserId || null,
                    currentUserName: sellerIdentity.name || null,
                    match: true,
                    source: 'non_destructive_budget_fallback',
                });
            }
            return true;
        }

        // Fallback para ventas directas sin pending convertido: por turno.
        return false;
    }, [convertedSaleSellerMap, sellerIdentity, currentUserId, sellerOwnedShiftIds]);

    useEffect(() => {
        if (isSeller && currentUserId) {
            setSellerFilter(currentUserId);
        }
    }, [isSeller, currentUserId]);

    const applyStartDate = async () => {
        if (!draftStartDate || draftStartDate === startDate) return;
        setStartDate(draftStartDate);
        if (!fetchSalesForDateRange || !endDate) return;
        await fetchSalesForDateRange(draftStartDate, endDate);
    };

    const applyEndDate = async () => {
        if (!draftEndDate || draftEndDate === endDate) return;
        setEndDate(draftEndDate);
        if (!fetchSalesForDateRange || !startDate) return;
        await fetchSalesForDateRange(startDate, draftEndDate);
    };
    
    const shiftUserMap = useMemo(() => {
        return new Map(shifts.map(shift => [shift.ID_Turno, (shift as any).user_profile_id || shift.ID_Usuario]));
    }, [shifts]);

    const toLocalDayKey = (value: Date | string) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return getLocalDateString(d);
    };

    // Filtrado por fecha y vendedor
    const salesInDateRange = useMemo(() => {
        if (!startDate || !endDate || !processedSales.length) return [];

        // Comparar por clave de fecha local YYYY-MM-DD para evitar desfasajes UTC/local
        // y exclusiones por hora/minutos al filtrar por rango diario.
        const fromDayKey = startDate;
        const toDayKey = endDate;

        const filtered = processedSales.filter(sale => {
            const saleDayKey = toLocalDayKey(sale.date);
            if (!saleDayKey) return false;

            const isInDateRange = saleDayKey >= fromDayKey && saleDayKey <= toDayKey;
            if (!isInDateRange) return false;

            // Scope vendedor: prioridad por pedido convertido -> seller original.
            if (isSeller) {
                return isSaleOwnedBySeller(sale);
            }

            const saleUserId = shiftUserMap.get(sale.shiftId || '');

            if (sellerFilter === 'All') {
                return true;
            }

            return saleUserId === sellerFilter;
        });

        // Logs mínimos útiles para validar la lógica real de inclusión por día.
        console.log('[HIST][filter-summary]', {
            totalProcessed: processedSales.length,
            fromDayKey,
            toDayKey,
            sellerFilter,
            matched: filtered.length,
        });

        if (filtered.length === 0 && processedSales.length > 0) {
            const sample = processedSales.slice(0, 5).map((sale) => {
                const saleDayKey = toLocalDayKey(sale.date);
                return {
                    saleId: sale.id,
                    saleDateOriginal: sale.date,
                    saleDateISO: new Date(sale.date).toISOString(),
                    saleDayKey,
                    fromDayKey,
                    toDayKey,
                    inRange: saleDayKey >= fromDayKey && saleDayKey <= toDayKey,
                };
            });
            console.log('[HIST][filter-debug-sample]', sample);
        }

        return filtered;
    }, [processedSales, startDate, endDate, sellerFilter, shiftUserMap, isSeller, isSaleOwnedBySeller]);

    // Filtrado por tipo de documento (venta/presupuesto)
    const filteredByDocType = useMemo(() => {
        if (docTypeFilter === 'all') return salesInDateRange;
        if (docTypeFilter === 'sale') {
            return salesInDateRange.filter(sale => sale.document_type !== 'budget');
        }
        if (docTypeFilter === 'budget') {
            return salesInDateRange.filter(sale => sale.document_type === 'budget');
        }
        return salesInDateRange;
    }, [salesInDateRange, docTypeFilter]);

    // Pagos de cuenta corriente filtrados por el mismo rango de fechas del historial
    const accountTransactionsInRange = useMemo(() => {
        if (isSeller) return [];
        if (!accountTransactions || accountTransactions.length === 0) return [];
        return accountTransactions.filter(t => {
            if (t.type !== 'Pago' || t.credit <= 0) return false;
            const dayKey = toLocalDayKey(t.date);
            return dayKey >= startDate && dayKey <= endDate;
        });
    }, [accountTransactions, startDate, endDate, isSeller]);

    if (isLoading) {
        return (
            <div className="grow flex items-center justify-center h-[calc(100vh-80px)]">
                <div className="text-center">
                    <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-12 h-12 text-blue-500 animate-spin mx-auto"/>
                    <p className="mt-2 text-gray-600">Cargando ventas...</p>
                </div>
            </div>
        );
    }

    // Filtros y buscador reales integrados visualmente
    // Control segmentado visual para tipo de documento
    const docTypeSegmented = (
        <div className="flex space-x-2 mb-2">
            <button
                className={`px-4 py-1 rounded-full border text-sm font-medium transition-colors ${docTypeFilter === 'all' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'}`}
                onClick={() => setDocTypeFilter('all')}
            >
                Todos
            </button>
            <button
                className={`px-4 py-1 rounded-full border text-sm font-medium transition-colors ${docTypeFilter === 'sale' ? 'bg-green-600 text-white border-green-600 shadow' : 'bg-white text-gray-700 border-gray-300 hover:bg-green-50'}`}
                onClick={() => setDocTypeFilter('sale')}
            >
                Ventas
            </button>
            <button
                className={`px-4 py-1 rounded-full border text-sm font-medium transition-colors ${docTypeFilter === 'budget' ? 'bg-blue-500 text-white border-blue-500 shadow' : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50'}`}
                onClick={() => setDocTypeFilter('budget')}
            >
                Presupuestos
            </button>
        </div>
    );

    const filtersAndSearch = (
        <div className="bg-white p-2 md:p-4 rounded-lg shadow-md flex flex-col md:flex-row md:items-end gap-2 md:gap-4 mt-2 md:mt-4">
            <div className="w-full md:w-auto md:mr-4">{docTypeSegmented}</div>
            <div className="grow">
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">Desde</label>
                <input 
                    type="date" 
                    id="start-date"
                    value={draftStartDate}
                    onChange={e => setDraftStartDate(e.target.value)}
                    onBlur={() => {
                        void applyStartDate();
                    }}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div className="grow">
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">Hasta</label>
                <input 
                    type="date" 
                    id="end-date"
                    value={draftEndDate}
                    onChange={e => setDraftEndDate(e.target.value)}
                    onBlur={() => {
                        void applyEndDate();
                    }}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            {!isSeller && (
                <div className="grow">
                    <label htmlFor="seller-filter" className="block text-sm font-medium text-gray-700">Vendedor</label>
                    <select 
                        id="seller-filter"
                        value={sellerFilter}
                        onChange={e => setSellerFilter(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="All">Todos los Vendedores</option>
                        {allUsers
                            .filter(u => u.Rol === 'Vendedor' || u.Rol === 'Admin')
                            .map(user => (
                                <option key={user.ID_Usuario} value={user.ID_Usuario}>{user.Nombre}</option>
                            ))
                        }
                    </select>
                </div>
            )}
            {/* Buscador real */}
            <div className="grow md:max-w-xs relative mt-4 md:mt-0">
                <label htmlFor="search-term" className="block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative mt-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        id="search-term"
                        type="text"
                        placeholder="Buscar cliente, ID, CUIT, factura..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>
            </div>
        </div>
    );

    const handleEditSale = (sale: Sale) => {
        if (onEditSale) onEditSale(sale);
    };
    // Refresco inmediato tras anulación
    const handleRefreshAfterDelete = async () => {
        if (fetchSalesForDateRange) {
            await fetchSalesForDateRange(startDate, endDate);
        } else {
            refreshData();
        }
    };

    return (
        <div className="h-full p-2 space-y-3 md:space-y-4">
            {/* Historial de Ventas */}
            <SalesDashboard
                title=""
                salesData={filteredByDocType}
                customers={customers}
                refreshData={handleRefreshAfterDelete}
                isLoading={isLoading}
                headerChildren={filtersAndSearch}
                noDataMessage="No se encontraron ventas para el período o filtro seleccionado."
                statTitlePrefix="en Período"
                showStats={true}
                searchTerm={searchTerm}
                stickyStats={true}
                stickyFilters={true}
                onEditSale={handleEditSale}
                accountTransactions={accountTransactionsInRange}
            />
        </div>
    );
};

export default SalesHistoryView;
