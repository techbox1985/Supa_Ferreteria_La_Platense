
import React, { useContext } from 'react';
import { Icon } from '../ui/Icon';
import { AuthContext } from '../../contexts/AuthContext';

type View = 'pos' | 'customers' | 'budgets' | 'expenses' | 'admin-panel' | 'sales-history';

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  onOpenSyncQueue: () => void;
}

const NavButton: React.FC<{
  label: string;
  iconPath: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, iconPath, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl transition-all duration-300 ${
      isActive
        ? 'bg-primary-900 text-white shadow-soft scale-105'
        : 'text-slate-600 hover:bg-slate-100 hover:text-primary-800'
    }`}
  >
    <Icon path={iconPath} className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
    <span className="font-semibold text-sm">{label}</span>
  </button>
);

const OfflineIndicator: React.FC<{ isOnline: boolean; pendingCount: number }> = ({ isOnline, pendingCount }) => {
    const status = isOnline ? 
        (pendingCount > 0 ? { text: `Sincronizando ${pendingCount}...`, color: 'text-yellow-600', icon: 'M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z', iconColor: 'text-yellow-500', spin: true } 
                             : { text: 'En línea', color: 'text-green-600', icon: 'M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z', iconColor: 'text-green-500', spin: false }) 
        : { text: `Sin conexión (${pendingCount})`, color: 'text-red-600', icon: 'M11.373 3.827a5.25 5.25 0 015.223 6.643l-6.643-5.223a5.25 5.25 0 011.42-1.42zM3.827 11.373a5.25 5.25 0 016.643 5.223l-5.223-6.643a5.25 5.25 0 01-1.42 1.42zM19.5 6.75a4.5 4.5 0 00-5.32-4.26L4.26 14.32A4.5 4.5 0 006.75 19.5h11.25a4.5 4.5 0 004.26-5.32L19.5 6.75z', iconColor: 'text-red-500', spin: false };

    return (
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${isOnline && pendingCount === 0 ? 'bg-green-50' : isOnline ? 'bg-yellow-50' : 'bg-red-50'}`}>
            <Icon path={status.icon} className={`w-5 h-5 ${status.iconColor} ${status.spin ? 'animate-spin' : ''}`} />
            <span className={status.color}>{status.text}</span>
        </div>
    );
};


const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, onRefresh, isRefreshing, isOnline, pendingSyncCount, onOpenSyncQueue }) => {
  const { currentUser, activeShift, openCloseShiftModal, logout } = useContext(AuthContext);
  const isAdmin = currentUser?.Rol === 'Admin';

  return (
    <header className="bg-white/80 backdrop-blur-md px-4 sm:px-6 py-2 sm:py-3 shadow-soft flex flex-col sm:flex-row items-center sticky top-0 z-40 border-b border-slate-200/60">
      <div className="flex flex-col sm:flex-row sm:justify-between w-full items-center">
        {/* Bloque Izquierdo */}
        <div className="flex items-center space-x-4 sm:space-x-6 flex-shrink-0 min-w-0">
        <div className="relative group">
          <img src="https://tolosarefrigeracion.com.ar/wp-content/uploads/2024/12/LOGO-min.png" alt="Refrigeración Tolosa Logo" className="h-10 transition-transform duration-300 group-hover:scale-105" />
          <span className="absolute -top-2 -right-12 bg-primary-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm tracking-wider uppercase">
            Nueva
          </span>
        </div>
        <div className="h-8 w-px bg-slate-200 mx-2"></div>
        <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-primary-600 transition-all disabled:cursor-not-allowed disabled:opacity-30"
            title="Actualizar datos"
        >
            <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
            onClick={onOpenSyncQueue}
            disabled={pendingSyncCount === 0 && isOnline}
            className="rounded-xl transition-all hover:bg-slate-100 disabled:cursor-not-allowed"
            title={pendingSyncCount > 0 ? `Ver ${pendingSyncCount} operaciones pendientes` : isOnline ? 'En línea y sincronizado' : 'Sin conexión'}
        >
          <OfflineIndicator isOnline={isOnline} pendingCount={pendingSyncCount} />
        </button>
        </div>
        {/* Bloque Central */}
        <nav className="flex-1 min-w-0 flex justify-center">
          <div className="flex items-center space-x-1 bg-slate-50/50 p-1 rounded-2xl border border-slate-200/50 overflow-x-auto max-w-3xl w-full justify-center scrollbar-thin scrollbar-thumb-slate-300">
        <NavButton
          label="POS"
          iconPath="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c.51 0 .962-.343 1.087-.835l.383-1.437M7.5 14.25L5.106 5.165A2.25 2.25 0 002.894 3H2.25"
          isActive={currentView === 'pos'}
          onClick={() => onNavigate('pos')}
        />

        <NavButton
          label="Historial"
          iconPath="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          isActive={currentView === 'sales-history'}
          onClick={() => onNavigate('sales-history')}
        />
         <NavButton
          label="Gastos"
          iconPath="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75m-15.75 0v-2.25a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 16.5v2.25"
          isActive={currentView === 'expenses'}
          onClick={() => onNavigate('expenses')}
        />
        <NavButton
          label="Clientes"
          iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.231 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.67c.12-.24.232-.487.335-.737m-3.05-2.828c.328.316.63.645.913.985"
          isActive={currentView === 'customers'}
          onClick={() => onNavigate('customers')}
        />

        {/* Admin Only Buttons */}
        {isAdmin && (
            <>
                <div className="h-6 border-l border-slate-300 mx-1"></div>
                <NavButton
                    label="Admin"
                    iconPath="M10.343 3.94c.09-.542.56-1.008 1.11-1.212l2.148-.859A1.875 1.875 0 0115.75 3.51V4.5a1.875 1.875 0 01-1.256 1.766l-2.148.858c-.55.204-1.02.67-1.11 1.212l-.322 1.933a1.875 1.875 0 001.256 2.234l2.148.859a1.875 1.875 0 002.09-.286l.001-.001 1.006-1.006a1.875 1.875 0 012.652 2.652l-1.006 1.006a1.875 1.875 0 00.286 2.09l.859 2.148A1.875 1.875 0 0119.5 20.25h-1.001a1.875 1.875 0 01-1.766-1.256l-.859-2.148a1.875 1.875 0 00-2.234-1.256l-1.933-.322c-.542-.09-1.008-.56-1.212-1.11l-.859-2.148A1.875 1.875 0 014.5 15.75V14.75a1.875 1.875 0 011.256-1.766l2.148-.858c.55-.204 1.02-.67 1.11-1.212l.322-1.933a1.875 1.875 0 00-1.256-2.234L4.744 5.992A1.875 1.875 0 002.653 6.28l-.001.001-1.006 1.006a1.875 1.875 0 01-2.652-2.652l1.006-1.006a1.875 1.875 0 00-.286-2.09l-.859-2.148A1.875 1.875 0 014.5 3.75h1.001a1.875 1.875 0 011.766 1.256l.859 2.148a1.875 1.875 0 002.234 1.256l1.933.322z"
                    isActive={currentView === 'admin-panel'}
                    onClick={() => onNavigate('admin-panel')}
                />
            </>
        )}
          </div>
        </nav>
        {/* Bloque Derecho */}
        {currentUser && (
          <div className="flex items-center space-x-4 sm:space-x-6 mt-2 sm:mt-0 flex-shrink-0 min-w-0">
            <div className="text-right border-r border-slate-200 pr-4">
              <p className="font-bold text-slate-800 text-sm">{currentUser.Nombre}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {isAdmin ? 'Admin' : (activeShift ? 'Caja Abierta' : 'Sin Caja')}
              </p>
            </div>
            {isAdmin ? (
              <button
                onClick={logout}
                className="bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-700 hover:text-white transition-all duration-300 flex items-center space-x-2 font-bold text-sm shadow-sm"
                title="Salir"
              >
                <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" className="w-5 h-5" />
                <span>Salir</span>
              </button>
            ) : (
              <button
                onClick={openCloseShiftModal}
                disabled={!activeShift}
                className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl hover:bg-red-600 hover:text-white transition-all duration-300 flex items-center space-x-2 font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cerrar Caja y Salir"
              >
                <Icon path="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" className="w-5 h-5" />
                <span>Cerrar Caja</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
