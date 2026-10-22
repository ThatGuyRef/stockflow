-- ============================================================================
-- 1. PRODUCTS
-- ============================================================================
INSERT INTO products (sku, name, price, stock, is_active, created_at) VALUES
  ('ATK-001', 'Kertas HVS A4 70gsm (1 rim)', 52000, 110, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-002', 'Pulpen Gel Hitam 0.5mm',         4500,   8, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-003', 'Pensil 2B Joyko',                 3500,  80, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-004', 'Penghapus Karet Putih',           3000,  60, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-005', 'Rautan Pensil Meja Putar',       35000,   4, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-006', 'Penggaris Besi 30cm',             8500,  40, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-007', 'Gunting Kertas Sedang 6 Inch',   12000,  25, FALSE, NOW() - INTERVAL '14 days'),
  ('ATK-008', 'Lem Kertas Stick 21g',            9000,  40, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-009', 'Stapler No. 10 Kangaro',         18500,   7, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-010', 'Isi Staples No. 10 (1 box)',      4000, 120, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-011', 'Map Dokumen Clear Sleeve Folio',  3000, 150, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-012', 'Sticky Notes Pastel 76x76mm',     8000,  45, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-013', 'Spidol Whiteboard Hitam',         9500,  50, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-014', 'Correction Tape / Tipe-X 6m',     7500,   0, TRUE,  NOW() - INTERVAL '14 days'),
  ('ATK-015', 'Binder Clip No. 107 (1 box)',    14000,   0, FALSE, NOW() - INTERVAL '14 days'),
  ('ATK-016', 'Box File Plastik Jaring',        22000,   3, TRUE,  NOW() - INTERVAL '14 days');

-- ============================================================================
-- 2. STOCK MOVEMENTS
-- ============================================================================
INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES
  -- ATK-001 (Stok: 110)
  ((SELECT id FROM products WHERE sku = 'ATK-001'), 'in',  120, 'Stok awal supplier PaperOne', NOW() - INTERVAL '10 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-001'), 'out',  10, 'Order #1',                    NOW() - INTERVAL '3 days'),

  -- ATK-002 (Stok: 8)
  ((SELECT id FROM products WHERE sku = 'ATK-002'), 'in',   20, 'Restock pulpen batch 1',       NOW() - INTERVAL '8 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-002'), 'out',  12, 'Pemakaian divisi operasional', NOW() - INTERVAL '4 hours'),

  -- ATK-003 (Stok: 80)
  ((SELECT id FROM products WHERE sku = 'ATK-003'), 'in',   95, 'Stok awal Joyko',              NOW() - INTERVAL '7 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-003'), 'out',  15, 'Order #1',                    NOW() - INTERVAL '3 days'),

  -- ATK-004 (Stok: 60)
  ((SELECT id FROM products WHERE sku = 'ATK-004'), 'in',   60, 'Stok awal penghapus',          NOW() - INTERVAL '6 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-004'), 'out',  10, 'Order #3',                    NOW() - INTERVAL '18 hours'),
  ((SELECT id FROM products WHERE sku = 'ATK-004'), 'in',   10, 'Cancellation Order #3',       NOW() - INTERVAL '12 hours'),

  -- ATK-005 (Stok: 4)
  ((SELECT id FROM products WHERE sku = 'ATK-005'), 'in',   10, 'Pengadaan rautan meja',        NOW() - INTERVAL '5 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-005'), 'out',   6, 'Distribusi ruang meeting',     NOW() - INTERVAL '2 hours'),

  -- ATK-006 (Stok: 40)
  ((SELECT id FROM products WHERE sku = 'ATK-006'), 'in',   50, 'Stok awal penggaris 30cm',     NOW() - INTERVAL '5 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-006'), 'out',  10, 'Pengambilan tim perancangan',  NOW() - INTERVAL '1 day 3 hours'),

  -- ATK-007 (Stok: 25, is_active: FALSE)
  ((SELECT id FROM products WHERE sku = 'ATK-007'), 'in',   25, 'Stok sisa produk discontinued',NOW() - INTERVAL '4 days'),

  -- ATK-008 (Stok: 40)
  ((SELECT id FROM products WHERE sku = 'ATK-008'), 'in',   50, 'Restock lem kertas stick',     NOW() - INTERVAL '4 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-008'), 'out',  10, 'Order #2',                    NOW() - INTERVAL '1 day 6 hours'),

  -- ATK-009 (Stok: 7)
  ((SELECT id FROM products WHERE sku = 'ATK-009'), 'in',    7, 'Sisa stok pengadaan Q3',       NOW() - INTERVAL '3 days 12 hours'),

  -- ATK-010 (Stok: 120)
  ((SELECT id FROM products WHERE sku = 'ATK-010'), 'in',  140, 'Stok awal isi staples',        NOW() - INTERVAL '4 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-010'), 'out',  20, 'Order #1',                    NOW() - INTERVAL '3 days'),

  -- ATK-011 (Stok: 150)
  ((SELECT id FROM products WHERE sku = 'ATK-011'), 'in',  200, 'Restock map folio clear',      NOW() - INTERVAL '2 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-011'), 'out',  50, 'Order #2',                    NOW() - INTERVAL '1 day 6 hours'),

  -- ATK-012 (Stok: 45)
  ((SELECT id FROM products WHERE sku = 'ATK-012'), 'in',   45, 'Stok awal sticky notes',       NOW() - INTERVAL '2 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-012'), 'out',   5, 'Order #3',                    NOW() - INTERVAL '18 hours'),
  ((SELECT id FROM products WHERE sku = 'ATK-012'), 'in',    5, 'Cancellation Order #3',       NOW() - INTERVAL '12 hours'),

  -- ATK-013 (Stok: 50)
  ((SELECT id FROM products WHERE sku = 'ATK-013'), 'in',   55, 'Restock spidol whiteboard',    NOW() - INTERVAL '2 days'),
  ((SELECT id FROM products WHERE sku = 'ATK-013'), 'out',   5, 'Order #2',                    NOW() - INTERVAL '1 day 6 hours'),

  -- ATK-014 & ATK-015: Tanpa movement

  -- ATK-016 (Stok: 3)
  ((SELECT id FROM products WHERE sku = 'ATK-016'), 'in',   15, 'Pengadaan box file arsip',     NOW() - INTERVAL '1 day'),
  ((SELECT id FROM products WHERE sku = 'ATK-016'), 'out',  12, 'Distribusi finance & HR',      NOW() - INTERVAL '15 minutes');

-- ============================================================================
-- 3. SALES ORDERS
-- ============================================================================
INSERT INTO sales_orders (customer, status, total, created_at, cancelled_at) VALUES
  ('PT Sinar Jaya Abadi', 'CREATED',   652500, NOW() - INTERVAL '3 days',        NULL),
  ('CV Maju Bersama',    'CREATED',   287500, NOW() - INTERVAL '1 day 6 hours', NULL),
  ('Bpk. Hendra Gunawan', 'CANCELLED',  70000, NOW() - INTERVAL '18 hours',       NOW() - INTERVAL '12 hours');

-- ============================================================================
-- 4. SALES ORDER ITEMS
-- ============================================================================
INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
  -- Items Order #1
  ((SELECT id FROM sales_orders WHERE customer = 'PT Sinar Jaya Abadi'), 'ATK-001', 10, 52000),
  ((SELECT id FROM sales_orders WHERE customer = 'PT Sinar Jaya Abadi'), 'ATK-003', 15,  3500),
  ((SELECT id FROM sales_orders WHERE customer = 'PT Sinar Jaya Abadi'), 'ATK-010', 20,  4000),

  -- Items Order #2
  ((SELECT id FROM sales_orders WHERE customer = 'CV Maju Bersama'),    'ATK-008', 10,  9000),
  ((SELECT id FROM sales_orders WHERE customer = 'CV Maju Bersama'),    'ATK-011', 50,  3000),
  ((SELECT id FROM sales_orders WHERE customer = 'CV Maju Bersama'),    'ATK-013',  5,  9500),

  -- Items Order #3
  ((SELECT id FROM sales_orders WHERE customer = 'Bpk. Hendra Gunawan'), 'ATK-004', 10,  3000),
  ((SELECT id FROM sales_orders WHERE customer = 'Bpk. Hendra Gunawan'), 'ATK-012',  5,  8000);
