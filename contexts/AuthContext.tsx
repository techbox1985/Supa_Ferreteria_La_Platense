import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { User, Shift } from '../types';
import * as api from '../services/api';

interface AuthContextType {
    currentUser: User | null;
    activeShift: Shift | null;
    isLoggingIn: boolean;
    shiftModalState: { type: 'open' | 'close' | 'closed'; shiftData?: Shift };
    login: (userId: string, pin: string) => Promise<void>;
    logout: () => void;
    openOpenShiftModal: () => void;
    openCloseShiftModal: () => void;
    closeShiftModal: () => void;
    handleOpenShift: (openingAmount: number) => Promise<void>;
    handleCloseShiftAndLogout: (closingAmount: number) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>(null!);

export const AuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [activeShift, setActiveShift] = useState<Shift | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [shiftModalState, setShiftModalState] = useState<AuthContextType['shiftModalState']>({ type: 'closed' });

    const login = useCallback(async (userId: string, pin: string) => {
        setIsLoggingIn(true);
        try {
            const users = await api.getUsersSupabase();
            const user = users.find(u => u.ID_Usuario === userId);

            if (!user) {
                throw new Error("Usuario no encontrado");
            }

            if (String(user.PIN) !== String(pin)) {
                throw new Error("PIN incorrecto");
            }
            
            if (user.Rol === 'Cajero') {
                // Solo el cajero gestiona turnos propios
                const fetchedShift = await api.getActiveShiftSupabase(user.ID_Usuario);

                if (fetchedShift) {
                    setActiveShift(fetchedShift);
                } else {
                    setActiveShift(null);
                    openOpenShiftModal();
                }
            } else {
                // Admin y Vendedor: usan cualquier turno activo, sin forzar apertura de caja
                const anyOpenShift = await api.getAnyActiveShiftSupabase();
                setActiveShift(anyOpenShift);
                setShiftModalState({ type: 'closed' });
            }

            // Seteamos el usuario al final para evitar parpadeos y asegurar que el estado del turno esté listo
            setCurrentUser(user);
        } catch (error) {
            console.error('Login failed:', error);
            throw error; // Re-throw to be caught by the login form
        } finally {
            setIsLoggingIn(false);
        }
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
        setActiveShift(null);
    }, []);

    const openOpenShiftModal = () => setShiftModalState({ type: 'open' });
    const openCloseShiftModal = () => setShiftModalState({ type: 'close' });
    const closeShiftModal = () => setShiftModalState({ type: 'closed' });

    const handleOpenShift = async (openingAmount: number) => {
        if (!currentUser) throw new Error("No hay usuario para abrir el turno.");
        if (currentUser.Rol !== 'Cajero') throw new Error("Solo el cajero puede abrir caja.");
        const newShift = await api.openShiftSupabase(currentUser.ID_Usuario, openingAmount);
        setActiveShift(newShift);
        closeShiftModal();
    };

    const handleCloseShiftAndLogout = async (closingAmount: number) => {
        if (!currentUser) throw new Error("No hay usuario para cerrar el turno.");
        if (currentUser.Rol !== 'Cajero') throw new Error("Solo el cajero puede cerrar caja.");
        if (!activeShift) throw new Error("No hay turno activo para cerrar.");
        await api.closeShiftSupabase(activeShift.ID_Turno, closingAmount);
        logout();
        closeShiftModal();
    };
    
    const value = {
        currentUser,
        activeShift,
        isLoggingIn,
        shiftModalState,
        login,
        logout,
        openOpenShiftModal,
        openCloseShiftModal,
        closeShiftModal,
        handleOpenShift,
        handleCloseShiftAndLogout
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};