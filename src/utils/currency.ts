const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatCurrencyINR(amount?: number | null) {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) {
    return '₹0';
  }
  return INR_FORMATTER.format(Math.round(value));
}

export function formatNumberIN(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return amount.toLocaleString('en-IN');
}
