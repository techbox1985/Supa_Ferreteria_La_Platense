import type { Product } from '../types';

export const isDeleted = (value: any): boolean => {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '1' || lower === 'true') return true;
  }
  return false;
};

type ProductSearchCandidate = Partial<Product> & {
  name?: string;
  description?: string;
  barcode?: string;
};

const productSearchTextCache = new WeakMap<object, string>();

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

// Handles common mojibake fragments from legacy imports (e.g. "caÃ±o", "ca�o").
const normalizeMojibake = (value: string): string =>
  value
    .replace(/Ã±|ã±/g, 'n')
    .replace(/Ã¡|ã¡/g, 'a')
    .replace(/Ã©|ã©/g, 'e')
    .replace(/Ã­|ã­/g, 'i')
    .replace(/Ã³|ã³/g, 'o')
    .replace(/Ãº|ãº/g, 'u')
    .replace(/Ã¼|ã¼/g, 'u')
    .replace(/�/g, 'n');

export const normalizeSearchText = (value: unknown): string => {
  const base = String(value ?? '').toLowerCase().trim();
  if (!base) return '';

  const mojibakeFixed = normalizeMojibake(base);
  const noDiacritics = mojibakeFixed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalized = noDiacritics
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s]/g, ' ');

  return collapseWhitespace(normalized);
};

export const getProductSearchText = (product: ProductSearchCandidate): string => {
  if (product && typeof product === 'object') {
    const cached = productSearchTextCache.get(product as object);
    if (cached !== undefined) return cached;
  }

  const parts = [
    product.Producto,
    product.name,
    product.Descripcion,
    product.description,
    product.cod,
    product['cod.barras'],
    product.barcode,
  ];

  const searchText = parts
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(' ');

  if (product && typeof product === 'object') {
    productSearchTextCache.set(product as object, searchText);
  }

  return searchText;
};

export const matchesProductSearch = (product: ProductSearchCandidate, query: string): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = getProductSearchText(product);
  if (haystack.includes(normalizedQuery)) return true;

  // Minor plural/singular tolerance for common searches like "cano" / "canos".
  const singularQuery = normalizedQuery.endsWith('s') ? normalizedQuery.slice(0, -1) : normalizedQuery;
  if (singularQuery !== normalizedQuery && haystack.includes(singularQuery)) return true;

  const pluralQuery = normalizedQuery.endsWith('s') ? normalizedQuery : `${normalizedQuery}s`;
  if (pluralQuery !== normalizedQuery && haystack.includes(pluralQuery)) return true;

  return false;
};

const getQueryVariants = (normalizedQuery: string): string[] => {
  if (!normalizedQuery) return [];
  const variants = new Set<string>([normalizedQuery]);
  if (normalizedQuery.endsWith('s')) {
    variants.add(normalizedQuery.slice(0, -1));
  } else {
    variants.add(`${normalizedQuery}s`);
  }
  return Array.from(variants).filter(Boolean);
};

const matchesAnyVariant = (value: string, variants: string[]): boolean => {
  if (!value || variants.length === 0) return false;
  return variants.some((variant) => value.includes(variant));
};

export const getProductSearchRelevance = (product: ProductSearchCandidate, query: string): number => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 99;

  const variants = getQueryVariants(normalizedQuery);
  const productName = normalizeSearchText(product.Producto || product.name || '');

  // 0: nombre empieza exactamente con la búsqueda.
  if (variants.some((variant) => productName.startsWith(variant))) return 0;

  // 1: alguna palabra del nombre empieza con la búsqueda.
  const productNameWords = productName.split(' ').filter(Boolean);
  if (productNameWords.some((word) => variants.some((variant) => word.startsWith(variant)))) return 1;

  // 2: nombre contiene la búsqueda.
  if (matchesAnyVariant(productName, variants)) return 2;

  // 3: coincidencias en campos secundarios ya usados por el filtro actual.
  const secondaryFields = [
    normalizeSearchText(product.cod || ''),
    normalizeSearchText(product['cod.barras'] || product.barcode || ''),
    normalizeSearchText(product.Descripcion || product.description || ''),
  ];
  if (secondaryFields.some((field) => matchesAnyVariant(field, variants))) return 3;

  return 4;
};

export const sanitizeProductDisplayText = (value: unknown): string => {
  const raw = String(value ?? '');
  if (!raw) return '';

  const fixedMojibake = raw
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/Ã/g, 'í')
    .replace(/â€™/g, '’')
    .replace(/â€œ/g, '“')
    .replace(/â€/g, '”')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—');

  // Heuristic for replacement char between letters (e.g. CA�O => CAÑO).
  const fixedReplacement = fixedMojibake.replace(
    /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])�([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g,
    (_match, left: string, right: string) => {
      const isUpper = left === left.toUpperCase() && right === right.toUpperCase();
      return `${left}${isUpper ? 'Ñ' : 'ñ'}${right}`;
    }
  );

  return fixedReplacement;
};
