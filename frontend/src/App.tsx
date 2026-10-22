import { useState, type FormEvent } from 'react';
import type { Product } from './api/types';
import { AdjustStockModal } from './components/AdjustStockModal';
import { CreateOrderModal } from './components/CreateOrderModal';
import { OrderDetail } from './components/OrderDetail';
import { ProductTable } from './components/ProductTable';
import { SummaryCards } from './components/SummaryCards';

export function App() {
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null);

  const [orderSearch, setOrderSearch] = useState('');
  const [orderSearchError, setOrderSearchError] = useState<string | null>(null);

  const handleOpenOrder = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = orderSearch.trim();
    if (!trimmed) {
      setOrderSearchError('ID wajib diisi');
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setOrderSearchError('ID harus bilangan bulat');
      return;
    }
    const id = parseInt(trimmed, 10);
    if (id <= 0) {
      setOrderSearchError('ID harus > 0');
      return;
    }

    setOrderSearchError(null);
    setViewingOrderId(id);
    setOrderSearch('');
  };

  const handleOrderCreated = (orderId: number) => {
    setIsCreatingOrder(false);
    setViewingOrderId(orderId);
  };

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
            {/* Input Open Order # */}
            <form onSubmit={handleOpenOrder} className="flex items-center gap-1.5 relative">
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Open order #..."
                  value={orderSearch}
                  onChange={(e) => {
                    setOrderSearch(e.target.value);
                    if (orderSearchError) setOrderSearchError(null);
                  }}
                  className={`w-36 sm:w-44 px-3 py-1.5 text-xs bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                    orderSearchError
                      ? 'border-rose-400 focus:ring-rose-500/20'
                      : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
                  }`}
                />
                {orderSearchError && (
                  <span className="absolute -bottom-4.5 left-0 text-[10px] text-rose-600 font-medium whitespace-nowrap">
                    {orderSearchError}
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                Open
              </button>
            </form>

            <button
              type="button"
              onClick={() => setIsCreatingOrder(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="text-sm font-bold">+</span> Create Order
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Inventory Summary */}
        <SummaryCards />

        {/* Main Products Table */}
        <ProductTable onAdjust={setAdjusting} />
      </main>

      {/* Stock Adjustment Modal */}
      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}

      {/* Create Order Modal */}
      {isCreatingOrder && (
        <CreateOrderModal
          onClose={() => setIsCreatingOrder(false)}
          onCreated={handleOrderCreated}
        />
      )}

      {/* Order Detail Modal */}
      {viewingOrderId !== null && (
        <OrderDetail
          orderId={viewingOrderId}
          onClose={() => setViewingOrderId(null)}
        />
      )}
    </div>
  );
}

export default App;
