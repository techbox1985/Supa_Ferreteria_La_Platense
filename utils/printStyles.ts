import { PrintStyles } from '../types';

const STORAGE_KEY = 'rt-pos-print-styles';

export const defaultPrintStyles: PrintStyles = {
  fontFamily: "'Courier New', Courier, monospace",
  baseFontSize: 12,
  baseFontWeight: 600,
  headerFontSize: 14,
  totalFontSize: 14,
  unitPriceFontSize: 10,
  unitPriceFontWeight: 400,
  ticketWidth: 300,
  padding: 10,
  lineHeight: 1.4,
  boldHeader: true,
  boldTotal: true,
  boldAll: false, // Nuevo valor por defecto
  separatorStyle: 'dashed',
  paperSize: '80mm',
  leftMargin: 0,
  rightMargin: 0,
};

export const getPrintStyles = (): PrintStyles => {
  try {
    const savedStyles = localStorage.getItem(STORAGE_KEY);
    if (savedStyles) {
      // Merge with defaults to ensure new properties are included if the app updates
      return { ...defaultPrintStyles, ...JSON.parse(savedStyles) };
    }
  } catch (error) {
    console.error("Could not parse print styles from localStorage", error);
  }
  return defaultPrintStyles;
};

export const savePrintStyles = (styles: PrintStyles) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
  } catch (error) {
    console.error("Could not save print styles to localStorage", error);
  }
};