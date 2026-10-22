const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatRupiah(n: number): string {
  return rupiahFormatter.format(n);
}

export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return '—';
  }

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return 'just now';
  }

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) {
    return 'just now';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
