import React from 'react';
import { Icon } from '../ui/Icon';

type View =
    | 'pos' | 'customers' | 'budgets' | 'expenses' | 'sales-history' | 'cashier-pending-sales'
    | 'low-stock'
    | 'admin-products' | 'admin-quick-edit' | 'admin-stock-entry' | 'admin-suppliers'
    | 'admin-users' | 'admin-shifts' | 'admin-monthly-billing' | 'admin-top-products'
    | 'admin-top-customers' | 'admin-printing';

import type { User } from '../../types';
interface SidebarProps {
    currentView: View;
    onNavigate: (view: View) => void;
    isAdmin: boolean;
    canSeeLowStock: boolean;
    currentUser?: User | null;
}

const SidebarItem: React.FC<{
    label: string;
    iconPath: string;
    isActive: boolean;
    onClick: () => void;
}> = ({ label, iconPath, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center space-x-3 px-3 py-2.5 w-full text-left rounded-lg transition-colors duration-200 ${
            isActive
                ? 'bg-primary-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-primary-800'
        }`}
    >
        <Icon
            path={iconPath}
            className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}
        />
        <span className="font-medium text-sm truncate">{label}</span>
    </button>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="pt-3 pb-1 mt-1 border-t border-slate-200 first:border-t-0 first:pt-0">
        <p className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">{children}</p>
    </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, isAdmin, canSeeLowStock, currentUser }) => {
    // LOG TEMPORAL para diagnóstico de visibilidad de impresión
    const printMenuVisible = currentUser?.Rol === 'Admin' || currentUser?.Rol === 'Vendedor';
    // eslint-disable-next-line no-console
    console.log('[PRINT_MENU_ROLE]', {
        currentUser,
        rol: currentUser?.Rol,
        printMenuVisible
    });
    return (
        <aside className="w-52 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
            <nav className="p-3 space-y-0.5">
                <SectionTitle>Ventas</SectionTitle>
                {currentUser?.Rol !== 'Cajero' && (
                    <SidebarItem
                        label="POS"
                        iconPath="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c.51 0 .962-.343 1.087-.835l.383-1.437M7.5 14.25L5.106 5.165A2.25 2.25 0 002.894 3H2.25"
                        isActive={currentView === 'pos'}
                        onClick={() => onNavigate('pos')}
                    />
                )}
                {(currentUser?.Rol === 'Cajero' || currentUser?.Rol === 'Admin') && (
                    <SidebarItem
                        label="Pedidos pendientes"
                        iconPath="M9 12h6m-6 4.5h6m2.25 4.5H6.75A2.25 2.25 0 014.5 18.75V5.25A2.25 2.25 0 016.75 3h7.5L19.5 8.25v10.5A2.25 2.25 0 0117.25 21z"
                        isActive={currentView === 'cashier-pending-sales'}
                        onClick={() => onNavigate('cashier-pending-sales')}
                    />
                )}
                <SidebarItem
                    label="Historial"
                    iconPath="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    isActive={currentView === 'sales-history'}
                    onClick={() => onNavigate('sales-history')}
                />
                {currentUser?.Rol !== 'Cajero' && (
                    <SidebarItem
                        label="Gastos"
                        iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25"
                        isActive={currentView === 'expenses'}
                        onClick={() => onNavigate('expenses')}
                    />
                )}
                <SidebarItem
                    label="Clientes"
                    iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985"
                    isActive={currentView === 'customers'}
                    onClick={() => onNavigate('customers')}
                />
                {canSeeLowStock && (
                    <SidebarItem
                        label="Bajo Stock"
                        iconPath="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                        isActive={currentView === 'low-stock'}
                        onClick={() => onNavigate('low-stock')}
                    />
                )}

                {/* Menú de configuración solo para admin */}
                {isAdmin && (
                    <>
                        <SectionTitle>Configuración</SectionTitle>
                        <SidebarItem
                            label="Productos"
                            iconPath="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                            isActive={currentView === 'admin-products'}
                            onClick={() => onNavigate('admin-products')}
                        />
                        <SidebarItem
                            label="Compras e Ingresos"
                            iconPath="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                            isActive={currentView === 'admin-stock-entry'}
                            onClick={() => onNavigate('admin-stock-entry')}
                        />
                        <SidebarItem
                            label="Proveedores"
                            iconPath="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5h12.75m0 0v-4.125c0-.621-.504-1.125-1.125-1.125H11.25c-.621 0-1.125.504-1.125 1.125v4.125m0 0a2.25 2.25 0 104.5 0m-4.5 0a2.25 2.25 0 014.5 0M12 10.875a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
                            isActive={currentView === 'admin-suppliers'}
                            onClick={() => onNavigate('admin-suppliers')}
                        />
                        <SidebarItem
                            label="Usuarios"
                            iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985"
                            isActive={currentView === 'admin-users'}
                            onClick={() => onNavigate('admin-users')}
                        />
                        <SidebarItem
                            label="Turnos de Caja"
                            iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25"
                            isActive={currentView === 'admin-shifts'}
                            onClick={() => onNavigate('admin-shifts')}
                        />
                        <SectionTitle>Reportes e Informes</SectionTitle>
                        <SidebarItem
                            label="Facturación"
                            iconPath="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
                            isActive={currentView === 'admin-monthly-billing'}
                            onClick={() => onNavigate('admin-monthly-billing')}
                        />
                        <SidebarItem
                            label="Top Productos"
                            iconPath="M16.5 18.75h-9a2.25 2.25 0 00-2.25 2.25v.003c0 .621.504 1.125 1.125 1.125h11.25c.621 0 1.125-.504 1.125-1.125v-.003a2.25 2.25 0 00-2.25-2.25zM10.5 2.25a2.25 2.25 0 00-2.25 2.25v11.25a2.25 2.25 0 002.25 2.25h3.375c.621 0 1.125-.504 1.125-1.125V16.5M10.5 16.5h-3.375a2.25 2.25 0 01-2.25-2.25V5.625a2.25 2.25 0 012.25-2.25H10.5"
                            isActive={currentView === 'admin-top-products'}
                            onClick={() => onNavigate('admin-top-products')}
                        />
                        <SidebarItem
                            label="Top Clientes"
                            iconPath="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.512 2.72a9.094 9.094 0 013.741-.479 3 3 0 01-4.682-2.72M13.5 3A3.375 3.375 0 0010.125 6.375v3.75c0 .621.504 1.125 1.125 1.125h.375m0 0c-.375.621.504 1.125 1.125 1.125h.375m0 0c.621-.504 1.125-1.125 1.125-1.125v-3.75A3.375 3.375 0 0013.5 3z"
                            isActive={currentView === 'admin-top-customers'}
                            onClick={() => onNavigate('admin-top-customers')}
                        />
                    </>
                )}

                {/* Menú de impresión para admin y vendedor — Cajero no tiene acceso en esta etapa */}
                {(currentUser?.Rol === 'Admin' || currentUser?.Rol === 'Vendedor') && (
                    <SidebarItem
                        label="Impresión"
                        iconPath="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
                        isActive={currentView === 'admin-printing'}
                        onClick={() => onNavigate('admin-printing')}
                    />
                )}
            </nav>
        </aside>
    );
};
