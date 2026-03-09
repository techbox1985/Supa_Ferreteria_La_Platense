import React, { ReactNode } from 'react';
import { Modal } from '../ui/Modal';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => ReactNode);
  className?: string;
  headerClassName?: string;
}

interface StatDetailModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: Column<T>[];
  data: T[];
  summary?: ReactNode;
}

const get = <T,>(obj: T, path: keyof T | ((item: T) => ReactNode)): ReactNode => {
    if (typeof path === 'function') {
        return path(obj);
    }
    return obj[path as keyof T] as ReactNode;
}


export const StatDetailModal = <T extends object>({ isOpen, onClose, title, columns, data, summary }: StatDetailModalProps<T>) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="max-h-[70vh] flex flex-col">
        <div className="overflow-y-auto flex-grow pr-2">
          {data.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {columns.map((col, index) => (
                    <th key={index} scope="col" className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.headerClassName || ''}`}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    {columns.map((col, colIndex) => (
                      <td key={colIndex} className={`px-4 py-3 text-sm text-gray-700 ${col.className || ''}`}>
                        {get(item, col.accessor)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
             <p className="text-center text-gray-500 py-8">No hay datos para mostrar para el período seleccionado.</p>
          )}
        </div>
        {summary && (
          <div className="border-t mt-4 pt-4 text-right font-bold text-gray-800">
            {summary}
          </div>
        )}
      </div>
    </Modal>
  );
};
