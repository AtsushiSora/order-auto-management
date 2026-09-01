export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);

export const formatNumber = (amount: number): string =>
  new Intl.NumberFormat("ja-JP").format(amount);

export const formatDate = (date: string | null): string => {
  if (!date) return "—";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

export const formatDateTime = (date: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

