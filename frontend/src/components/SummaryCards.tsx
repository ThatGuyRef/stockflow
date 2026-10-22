import { useQuery } from '@tanstack/react-query';
import { getProductSummary } from '../api/client';
import { formatRupiah } from '../lib/format';

export function SummaryCards() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['summary'],
    queryFn: getProductSummary,
  });

  if (isError) {
    return (
      <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
        <span>Gagal memuat ringkasan inventaris.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-medium underline hover:text-rose-900 cursor-pointer"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-pulse"
          >
            <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
            <div className="h-7 bg-slate-200 rounded w-32"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Total Produk */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Produk
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {data.total_products}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg">
          📦
        </div>
      </div>

      {/* 2. Produk Aktif */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Produk Aktif
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {data.active_products}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
          ✅
        </div>
      </div>

      {/* 3. Total Nilai Stok */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Nilai Stok
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {formatRupiah(data.total_stock_value)}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg">
          💰
        </div>
      </div>

      {/* 4. Stok Menipis (<= 10) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Stok Menipis (≤ 10)
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {data.low_stock_count}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
          ⚠️
        </div>
      </div>
    </div>
  );
}
