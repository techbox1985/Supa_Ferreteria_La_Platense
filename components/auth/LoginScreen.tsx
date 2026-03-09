import React, { useState, useEffect, useContext } from 'react';
import { User } from '../../types';
import { Icon } from '../ui/Icon';
import * as api from '../../services/api';
import { AuthContext } from '../../contexts/AuthContext';
import { OpenShiftModal } from '../cash-register/OpenShiftModal';
import { CloseShiftModal } from '../cash-register/CloseShiftModal';

interface LoginScreenProps {
    children: React.ReactNode;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ children }) => {
    const { 
        currentUser, 
        activeShift, 
        login, 
        isLoggingIn, 
        shiftModalState, 
        openOpenShiftModal,
        closeShiftModal, 
        handleOpenShift, 
        handleCloseShiftAndLogout 
    } = useContext(AuthContext);
    
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const fetchedUsers = await api.getUsers();
                setUsers(fetchedUsers);
                if (fetchedUsers.length > 0) {
                    // Correctly find 'vendedor1' without a space
                    const vendedor1 = fetchedUsers.find(user => user.Nombre.toLowerCase() === 'vendedor1');
                    if (vendedor1) {
                        setSelectedUserId(vendedor1.ID_Usuario);
                    } else {
                        setSelectedUserId(fetchedUsers[0].ID_Usuario);
                    }
                }
            } catch (err) {
                setError('No se pudieron cargar los usuarios.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        if (!currentUser) {
            fetchUsers();
        }
    }, [currentUser]);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!selectedUserId || pin.length !== 4) {
            setError('Seleccione un usuario e ingrese un PIN de 4 dígitos.');
            return;
        }
        try {
            await login(selectedUserId, pin);
            setPin(''); // Clear pin on successful login attempt
        } catch (err) {
            // The error message from the API layer is now user-friendly.
            const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
            setError(errorMessage);
            setPin(''); // Clear pin on failed attempt too
        }
    };
    
    // If user is logged in and has an active shift, render the main app
    if (currentUser && activeShift) {
        return (
            <>
                {children}
                <CloseShiftModal
                    isOpen={shiftModalState.type === 'close'}
                    onClose={closeShiftModal}
                    onConfirmClose={handleCloseShiftAndLogout}
                    activeShift={activeShift}
                    allSales={[]} // This should be fetched within the component if needed
                    allExpenses={[]} // This should be fetched within the component if needed
                />
            </>
        );
    }

    // If user is logged in but has no active shift, show the OpenShiftModal
    if (currentUser && !activeShift) {
        return (
            <OpenShiftModal
                isOpen={true}
                onClose={() => {}} // Can't close this modal
                onConfirmOpen={handleOpenShift}
                userName={currentUser.Nombre}
            />
        );
    }

    // Otherwise, show the login form
    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <div className="p-10 bg-white rounded-2xl shadow-premium border border-slate-200/60 w-full max-w-md m-4 transform transition-all duration-500 hover:scale-[1.01]">
                <div className="text-center mb-10">
                    <div className="relative inline-block">
                        <img src="https://tolosarefrigeracion.com.ar/wp-content/uploads/2024/12/LOGO-min.png" alt="Refrigeración Tolosa Logo" className="h-20 mx-auto mb-6 drop-shadow-sm" />
                        <span className="absolute -top-2 -right-8 bg-primary-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm tracking-wider uppercase">
                            Nueva
                        </span>
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Acceso al Sistema</h1>
                    <p className="text-slate-500 mt-2 font-medium">Gestión Profesional · Supabase Edition</p>
                </div>
                
                {isLoading ? (
                    <div className="text-center p-8">
                        <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-10 h-10 text-primary-600 animate-spin mx-auto"/>
                        <p className="mt-4 text-slate-500 font-medium">Cargando entorno...</p>
                    </div>
                ) : (
                    <form onSubmit={handleLoginSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="user-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Usuario</label>
                            <select
                                id="user-select"
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="mt-1 block w-full pl-4 pr-10 py-3 text-base border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-xl bg-slate-50/50 transition-all"
                                disabled={isLoggingIn}
                            >
                                {users.map(user => (
                                    <option key={user.ID_Usuario} value={user.ID_Usuario}>{user.Nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="pin-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">PIN de Seguridad</label>
                            <input
                                type="password"
                                id="pin-input"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className="mt-1 block w-full px-4 py-3 border border-slate-200 rounded-xl shadow-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-slate-50/50 transition-all"
                                placeholder="••••"
                                maxLength={4}
                                pattern="\d{4}"
                                required
                                disabled={isLoggingIn}
                                autoFocus
                            />
                        </div>
                        
                        {error && <p className="text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 font-medium animate-shake">{error}</p>}
                        
                        <button
                            type="submit"
                            disabled={isLoggingIn}
                            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-soft text-sm font-bold text-white bg-primary-900 hover:bg-primary-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-slate-300 transition-all duration-300 active:scale-95"
                        >
                            {isLoggingIn ? (
                                <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                            ) : (
                                'Ingresar al Sistema'
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};