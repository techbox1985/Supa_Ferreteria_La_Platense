import React, { useState, useMemo, useCallback } from 'react';
import { PrintStyles, Sale, Customer, Product } from '../../types';
import { getPrintStyles, savePrintStyles, defaultPrintStyles } from '../../utils/printStyles';
import { generateReceiptHtml } from '../pos/Receipt';
import { Icon } from '../ui/Icon';
import { useToast } from '../../contexts/ToastContext';

const sampleSale: Sale = {
  id: 'PREVIEW-123',
  date: new Date(),
  customer: { 'Nombre y Apellido': 'Cliente de Ejemplo' } as Customer,
  items: [
    { product: { Producto: 'Compresor 1/4 HP' } as Product, quantity: 1, price: 15000 },
    { product: { Producto: 'Caño de Cobre (metro)' } as Product, quantity: 2.5, price: 800 },
    { product: { Producto: 'Gas Refrigerante R22' } as Product, quantity: 1, price: 5500 },
  ],
  subtotal: 22500,
  adjustmentAmount: -2250,
  adjustmentDescription: 'Descuento (10%)',
  total: 20250,
  // FIX: Replaced `echeq: 0` with `echeqs: []` to match the Sale type definition.
  payment: { cash: 20250, digital: 0, credit: 0, echeqs: [] },
  itemCount: 4.5,
  facturacion: 'N',
  shiftId: 'shift-1'
};

const ControlSlider: React.FC<{label: string, value: number, onChange: (v: number) => void, min: number, max: number, step: number, unit: string}> = 
  ({label, value, onChange, min, max, step, unit}) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center space-x-2">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded w-20 text-center">{value}{unit}</span>
        </div>
    </div>
);

export const PrintingPanel: React.FC = () => {
    const [styles, setStyles] = useState<PrintStyles>(getPrintStyles());
    const [savedStyles, setSavedStyles] = useState<PrintStyles>(getPrintStyles());
    const [isSaving, setIsSaving] = useState(false);
    const { addToast } = useToast();

    const hasChanges = useMemo(() => JSON.stringify(styles) !== JSON.stringify(savedStyles), [styles, savedStyles]);

    const handleStyleChange = useCallback((updatedStyles: Partial<PrintStyles>) => {
        setStyles(prev => ({ ...prev, ...updatedStyles }));
    }, []);

    const handleSaveChanges = useCallback(() => {
        setIsSaving(true);
        try {
            savePrintStyles(styles);
            setSavedStyles(styles);
            addToast('Configuración de impresión guardada.', 'success');
        } catch (error) {
            addToast('Error al guardar la configuración.', 'error');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    }, [styles, addToast]);
    
    const handlePaperSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSize = e.target.value as '58mm' | '80mm';
        const newWidth = newSize === '58mm' ? 220 : 300;
        handleStyleChange({ paperSize: newSize, ticketWidth: newWidth });
    };

    const handlePrintTest = () => {
        const ticketHtml = generateReceiptHtml(sampleSale, styles);
        const printWindow = window.open('', '_blank', 'width=450,height=750,scrollbars=yes,resizable=yes');
        
        if (printWindow) {
            printWindow.document.write(ticketHtml);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        } else {
            alert("La ventana de impresión fue bloqueada. Por favor, habilite las ventanas emergentes para este sitio.");
        }
    };
    
    const handleResetToDefaults = () => {
        if (window.confirm("¿Está seguro que desea restaurar la configuración a sus valores por defecto? Deberá guardar los cambios para que sean permanentes.")) {
            setStyles(defaultPrintStyles);
            addToast('Configuración restaurada. Presione "Guardar" para aplicar.', 'info');
        }
    };

    const previewHtml = useMemo(() => generateReceiptHtml(sampleSale, styles), [styles]);

    return (
        <div className="flex h-full">
            {/* Controls Column */}
            <div className="w-1/3 bg-white p-6 shadow-lg overflow-y-auto space-y-6">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800">Configurar Ticket</h2>
                        <button onClick={handleResetToDefaults} className="text-sm text-red-500 hover:underline">Restaurar</button>
                    </div>
                    <div className="flex justify-between items-stretch gap-2 p-2 bg-gray-100 rounded-lg">
                        <button onClick={handlePrintTest} className="flex-1 bg-white text-gray-700 px-3 py-2 rounded-md font-medium border border-gray-300 hover:bg-gray-50 flex items-center justify-center space-x-2 text-sm">
                            <Icon path="M6.75 7.5h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-10.5a.75.75 0 01-.75-.75V8.25a.75.75 0 01.75-.75z" className="w-4 h-4"/>
                            <span>Imprimir Prueba</span>
                        </button>
                        <button
                            onClick={handleSaveChanges}
                            disabled={!hasChanges || isSaving}
                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-md font-medium hover:bg-blue-700 flex items-center justify-center space-x-2 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {isSaving 
                                ? <Icon path="M16.023 9.348h4.992v-.001a7.5 7.5 0 00-4.992-4.992v4.993zM9.348 16.023h-4.992v.001a7.5 7.5 0 004.992 4.992v-4.993zM16.023 16.023h4.992A7.5 7.5 0 0021 9.348h-4.993v6.675zM9.348 9.348H4.356a7.5 7.5 0 004.992-4.992v4.992z" className="w-5 h-5 animate-spin"/>
                                : <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-5 h-5"/>
                            }
                            <span>{isSaving ? 'Guardando...' : 'Guardar Configuración'}</span>
                        </button>
                    </div>
                     {hasChanges ? (
                        <div className="text-yellow-800 flex items-center space-x-2 text-sm bg-yellow-100 p-2 rounded-md">
                            <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-5 h-5"/>
                            <span>Hay cambios sin guardar.</span>
                        </div>
                    ) : (
                        <div className="text-green-800 flex items-center space-x-2 text-sm bg-green-50 p-2 rounded-md">
                            <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5"/>
                            <span>Configuración guardada.</span>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold text-lg">Fuente</h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Familia de Fuente</label>
                        <select
                            value={styles.fontFamily}
                            onChange={e => handleStyleChange({ fontFamily: e.target.value })}
                            className="mt-1 block w-full border-gray-300 rounded-md"
                        >
                            <option value="'Courier New', Courier, monospace">Courier New</option>
                            <option value="'Lucida Console', Monaco, monospace">Lucida Console</option>
                            <option value="Consolas, 'Liberation Mono', monospace">Consolas</option>
                            <option value="monospace">Monospace Genérico</option>
                        </select>
                    </div>
                    <ControlSlider label="Tamaño Base" value={styles.baseFontSize} onChange={v => handleStyleChange({baseFontSize: v})} min={8} max={16} step={1} unit="px" />
                    <div>
                        <ControlSlider label="Grosor de Fuente Base" value={styles.baseFontWeight} onChange={v => handleStyleChange({baseFontWeight: v})} min={400} max={700} step={100} unit="" />
                        <p className="text-xs text-gray-500 mt-1 pl-1">400=Normal, 700=Negrita.</p>
                    </div>
                    <ControlSlider label="Tamaño Encabezado" value={styles.headerFontSize} onChange={v => handleStyleChange({headerFontSize: v})} min={10} max={20} step={1} unit="px" />
                    <ControlSlider label="Tamaño Total" value={styles.totalFontSize} onChange={v => handleStyleChange({totalFontSize: v})} min={10} max={20} step={1} unit="px" />
                    <ControlSlider label="Tamaño Precio Unitario" value={styles.unitPriceFontSize} onChange={v => handleStyleChange({unitPriceFontSize: v})} min={8} max={14} step={1} unit="px" />
                    <div>
                        <ControlSlider label="Grosor Precio Unitario" value={styles.unitPriceFontWeight} onChange={v => handleStyleChange({unitPriceFontWeight: v})} min={400} max={700} step={100} unit="" />
                        <p className="text-xs text-gray-500 mt-1 pl-1">400=Normal, 700=Negrita.</p>
                    </div>
                    <ControlSlider label="Interlineado" value={styles.lineHeight} onChange={v => handleStyleChange({lineHeight: v})} min={1.0} max={2.0} step={0.1} unit="" />
                </div>

                <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold text-lg">Diseño</h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tamaño de Papel (Preajuste de Ancho)</label>
                        <div className="mt-2 flex space-x-4 rounded-lg bg-gray-100 p-1">
                            <label className="flex-1 text-center">
                                <input
                                    type="radio"
                                    name="paperSize"
                                    value="58mm"
                                    checked={styles.paperSize === '58mm'}
                                    onChange={handlePaperSizeChange}
                                    className="sr-only"
                                />
                                <div className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${styles.paperSize === '58mm' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600'}`}>58mm</div>
                            </label>
                             <label className="flex-1 text-center">
                                <input
                                    type="radio"
                                    name="paperSize"
                                    value="80mm"
                                    checked={styles.paperSize === '80mm'}
                                    onChange={handlePaperSizeChange}
                                    className="sr-only"
                                />
                                <div className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium ${styles.paperSize === '80mm' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600'}`}>80mm</div>
                            </label>
                        </div>
                    </div>
                    <ControlSlider label="Ancho del Ticket" value={styles.ticketWidth} onChange={v => handleStyleChange({ticketWidth: v})} min={200} max={400} step={2} unit="px" />
                    <ControlSlider label="Márgenes Internos (Padding)" value={styles.padding} onChange={v => handleStyleChange({padding: v})} min={5} max={20} step={1} unit="px" />
                    <ControlSlider label="Margen Izquierdo" value={styles.leftMargin} onChange={v => handleStyleChange({leftMargin: v})} min={0} max={20} step={1} unit="mm" />
                    <ControlSlider label="Margen Derecho" value={styles.rightMargin} onChange={v => handleStyleChange({rightMargin: v})} min={0} max={20} step={1} unit="mm" />
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Estilo de Separadores</label>
                        <select
                            value={styles.separatorStyle}
                            onChange={e => handleStyleChange({ separatorStyle: e.target.value as PrintStyles['separatorStyle'] })}
                            className="mt-1 block w-full border-gray-300 rounded-md"
                        >
                            <option value="dashed">Punteado (Dashed)</option>
                            <option value="solid">Sólido (Solid)</option>
                            <option value="dotted">Puntos (Dotted)</option>
                        </select>
                    </div>
                </div>

                 <div className="space-y-2 border-t pt-4">
                    <h3 className="font-semibold text-lg">Estilo de Texto</h3>
                    <label className="flex items-center space-x-2">
                        <input type="checkbox" checked={styles.boldHeader} onChange={e => handleStyleChange({ boldHeader: e.target.checked })} className="rounded"/>
                        <span>Encabezado en Negrita</span>
                    </label>
                     <label className="flex items-center space-x-2">
                        <input type="checkbox" checked={styles.boldTotal} onChange={e => handleStyleChange({ boldTotal: e.target.checked })} className="rounded"/>
                        <span>Total en Negrita</span>
                    </label>
                    <label className="flex items-center space-x-2 bg-yellow-50 p-2 rounded-md border border-yellow-200">
                        <input type="checkbox" checked={styles.boldAll} onChange={e => handleStyleChange({ boldAll: e.target.checked })} className="rounded text-yellow-600 focus:ring-yellow-500"/>
                        <span className="font-bold text-yellow-900">Todo el Texto en Negrita</span>
                    </label>
                </div>
            </div>

            {/* Preview Column */}
            <div className="w-2/3 bg-gray-200 p-6 flex flex-col items-center justify-center">
                <h3 className="text-xl font-bold text-gray-700 mb-4">Vista Previa en Vivo</h3>
                <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                    <iframe
                        srcDoc={previewHtml}
                        title="Vista previa del ticket"
                        className="border-0"
                        style={{ width: `${styles.ticketWidth + 2 * styles.padding}px`, height: '70vh' }}
                    />
                </div>
            </div>
        </div>
    );
};