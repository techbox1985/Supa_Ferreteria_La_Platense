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
            const loginResult = await api.login(userId, pin);
            const { user, activeShift: fetchedShift } = loginResult;

            setCurrentUser(user);
            if (fetchedShift) {
                setActiveShift({
                    ...fetchedShift,
                    Fecha_Apertura: new Date(fetchedShift.Fecha_Apertura),
                });
            } else {
                setActiveShift(null);
                openOpenShiftModal();
            }
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
        const newShift = await api.openShift(currentUser.ID_Usuario, openingAmount);
        setActiveShift(newShift);
        closeShiftModal();
    };

    const handleCloseShiftAndLogout = async (closingAmount: number) => {
        if (!activeShift) throw new Error("No hay turno activo para cerrar.");
        const closedShift = await api.closeShift(activeShift.ID_Turno, closingAmount);
        // You can use the `closedShift` data to show a final summary if you want
        console.log("Turno cerrado:", closedShift);
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