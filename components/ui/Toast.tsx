import React, { useEffect, useState, useCallback } from 'react';
import { Icon } from './Icon';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  id: number;
  message: string;
  type: ToastType;
  onDismiss: (id: number) => void;
}

const icons = {
  success: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  error: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
  info: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
};

const colors = {
  success: { bg: 'bg-green-50', text: 'text-green-800', icon: 'text-green-500' },
  error: { bg: 'bg-red-50', text: 'text-red-800', icon: 'text-red-500' },
  info: { bg: 'bg-blue-50', text: 'text-blue-800', icon: 'text-blue-500' },
};

export const Toast: React.FC<ToastProps> = ({ id, message, type, onDismiss }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const theme = colors[type];

  const handleDismiss = useCallback(() => {
    setIsFadingOut(true);
    setTimeout(() => onDismiss(id), 300); // Wait for fade-out animation
  }, [id, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 2000);

    return () => clearTimeout(timer);
  }, [id, onDismiss, handleDismiss]);

  return (
    <div
      className={`pointer-events-auto min-w-[280px] max-w-[420px] w-full ${theme.bg} shadow-lg rounded-lg ring-1 ring-black ring-opacity-5 overflow-hidden transition-all duration-300 ease-in-out ${
        isFadingOut ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon path={icons[type]} className={`w-6 h-6 ${theme.icon}`} />
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className={`text-sm font-medium ${theme.text}`}>{message}</p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={handleDismiss}
              className={`inline-flex rounded-md p-1 ${theme.text} hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              <span className="sr-only">Close</span>
              <Icon path="M6 18L18 6M6 6l12 12" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
