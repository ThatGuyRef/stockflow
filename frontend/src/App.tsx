import { useState } from 'react';
import type { Product } from './api/types';
import { AdjustStockModal } from './components/AdjustStockModal';
import { CreateOrderModal } from './components/CreateOrderModal';
import { ProductTable } from './components/ProductTable';
import { SummaryCards } from './components/SummaryCards';

export function App() {
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              S
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-base leading-tight">Stockflow</h1>
              <p className="text-xs text-slate-500">Inventory & Order Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreatingOrder(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="text-sm font-bold">+</span> Buat Pesanan
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Ringkasan Inventaris */}
        <SummaryCards />

        {/* Tabel Utama Produk */}
        <ProductTable onAdjust={setAdjusting} />
      </main>

      {/* Modal Penyesuaian Stok */}
      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}

      {/* Modal Pembuatan Order */}
      {isCreatingOrder && (
        <CreateOrderModal
          onClose={() => setIsCreatingOrder(false)}
        />
      )}
    </div>
  );
}

export default App;
