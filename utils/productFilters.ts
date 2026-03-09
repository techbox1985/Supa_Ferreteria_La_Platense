export const isDeleted = (value: any): boolean => {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '1' || lower === 'true') return true;
  }
  return false;
};
