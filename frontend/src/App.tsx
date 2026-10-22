import { useState } from 'react';
import type { Product } from './api/types';
import { AdjustStockModal } from './components/AdjustStockModal';
import { ProductTable } from './components/ProductTable';

export function App() {
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductTable onAdjust={setAdjusting} />
      </main>

      {/* Adjust Stock Modal */}
      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}

export default App;
