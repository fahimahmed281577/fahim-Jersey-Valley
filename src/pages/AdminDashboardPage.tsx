import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Package,
  Layers,
  Settings,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import {
  formatBdt,
  type Product,
  type OrderStatus,
  type PaymentStatus,
  type SiteSettingsConfig
} from '../lib/commerce';
import { useStore } from '../context/StoreContext';
import { ADMIN_BOOTSTRAP_EMAIL } from '../lib/firebase';

interface AdminOrderRecord {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  division: string;
  district: string;
  upazila: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  itemCount: number;
  totalBdt: number;
  createdAt: string;
}

interface AdminMetrics {
  totalOrders: number;
  activeOrdersCount: number;
  totalRevenueBookedBdt: number;
  verifiedPaidRevenueBdt: number;
  pendingCodBdt: number;
  totalProducts: number;
  totalStockUnits: number;
}

export const AdminDashboardPage: React.FC = () => {
  const { currentUser, isAdmin, refreshCatalog, pushToast } = useStore();

  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'settings'>('orders');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [orders, setOrders] = useState<AdminOrderRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settingsForm, setSettingsForm] = useState<SiteSettingsConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadAdminOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setOrders(data.orders || []);
        setProducts(data.products || []);
        setSettingsForm(data.settings || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview]);

  const handleOrderUpdate = async (
    orderNumber: string,
    nextOrderStatus: OrderStatus,
    nextPaymentStatus: PaymentStatus
  ) => {
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderStatus: nextOrderStatus,
          paymentStatus: nextPaymentStatus
        })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Could not update order.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(`Updated ${orderNumber} → ${nextOrderStatus} / ${nextPaymentStatus}`, 'success');
    } catch {
      pushToast('Failed to update order status.', 'error');
    }
  };

  const handleVariantStockUpdate = async (
    productId: string,
    size: string,
    nextStock: number
  ) => {
    if (nextStock < 0) return;
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size, stock: nextStock })
      });
      if (res.ok) {
        await loadAdminOverview();
        await refreshCatalog();
        pushToast(`Updated stock for ${productId} (${size}) to ${nextStock}`, 'success');
      }
    } catch {
      pushToast('Could not update stock.', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      });
      if (res.ok) {
        await loadAdminOverview();
        await refreshCatalog();
        pushToast('Updated Bangladesh shipping charges & site announcement', 'success');
      }
    } catch {
      pushToast('Could not save settings.', 'error');
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span>STORE ADMINISTRATION</span>
            <span aria-hidden="true">·</span>
            <span>ACTUAL STORED DATA METRICS</span>
            <span aria-hidden="true">·</span>
            <span>BDT (৳)</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            Jersey Valley Admin Console
          </h1>
        </div>

        <button
          type="button"
          onClick={loadAdminOverview}
          className="px-4 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Live Store Data</span>
        </button>
      </div>

      {/* RBAC & Security Verification Notice */}
      <div className="bg-white border border-zinc-200 p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2.5 text-zinc-700">
          <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
          <span>
            <strong>Firestore Security Rules RBAC:</strong> Direct Firestore writes to{' '}
            <code>/products</code>, <code>/siteSettings</code>, and <code>/admins</code> require{' '}
            <code>isAdmin()</code> (verified bootstrap admin <code>{ADMIN_BOOTSTRAP_EMAIL}</code>).
            Current session:{' '}
            <strong>
              {currentUser
                ? `${currentUser.email} (${isAdmin ? 'Verified Admin' : 'Customer'})`
                : 'Preview Guest Session'}
            </strong>
          </span>
        </div>
        <Link to="/account" className="text-[#15803D] font-semibold hover:underline">
          Manage Auth Session →
        </Link>
      </div>

      {/* Real Store Metrics Strip */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Total Orders</span>
            <strong className="text-xl font-bold font-mono-num text-zinc-900">
              {metrics.totalOrders}
            </strong>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Active Orders</span>
            <strong className="text-xl font-bold font-mono-num text-zinc-900">
              {metrics.activeOrdersCount}
            </strong>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Booked Order Value</span>
            <strong className="text-xl font-bold font-mono-num text-zinc-900">
              {formatBdt(metrics.totalRevenueBookedBdt)}
            </strong>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Pending COD Collection</span>
            <strong className="text-xl font-bold font-mono-num text-amber-700">
              {formatBdt(metrics.pendingCodBdt)}
            </strong>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Verified Paid Revenue</span>
            <strong className="text-xl font-bold font-mono-num text-[#15803D]">
              {formatBdt(metrics.verifiedPaidRevenueBdt)}
            </strong>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Total Sample Stock</span>
            <strong className="text-xl font-bold font-mono-num text-zinc-900">
              {metrics.totalStockUnits} units
            </strong>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        className="flex flex-wrap items-center gap-1 p-1 bg-zinc-200/80 w-fit"
        role="tablist"
        aria-label="Admin sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'orders' ? 'bg-[#111111] text-white' : 'text-zinc-700 hover:text-zinc-900'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Orders &amp; COD Workflow ({orders.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inventory'}
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'inventory'
              ? 'bg-[#111111] text-white'
              : 'text-zinc-700 hover:text-zinc-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Catalog &amp; Size Inventory ({products.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'bg-[#111111] text-white'
              : 'text-zinc-700 hover:text-zinc-900'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Bangladesh Shipping &amp; Announcements</span>
        </button>
      </div>

      {/* TAB 1: Order & COD Management */}
      {activeTab === 'orders' && !loading && (
        <div className="bg-white border border-zinc-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div>
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Order Fulfillment &amp; Payment Status Control
              </h2>
              <p className="text-xs text-zinc-500">
                Track COD fulfillment separately from payment collection. Do not mark COD orders as
                VERIFIED until cash is collected upon delivery.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="py-2.5 pr-4">Order #</th>
                  <th className="py-2.5 pr-4">Customer &amp; Phone</th>
                  <th className="py-2.5 pr-4">Location</th>
                  <th className="py-2.5 pr-4">Total (BDT)</th>
                  <th className="py-2.5 pr-4">Fulfillment Status</th>
                  <th className="py-2.5 pr-4">Payment Status</th>
                  <th className="py-2.5">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {orders.map((ord) => (
                  <tr key={ord.orderNumber}>
                    <td className="py-3 pr-4 font-mono-num font-bold text-zinc-900">
                      {ord.orderNumber}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-zinc-900 block">{ord.customerName}</span>
                      <span className="font-mono-num text-zinc-500">{ord.customerPhone}</span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600">
                      {ord.upazila}, {ord.district} ({ord.division})
                    </td>
                    <td className="py-3 pr-4 font-mono-num font-semibold text-zinc-900">
                      {formatBdt(ord.totalBdt)} ({ord.paymentMethod})
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Fulfillment status for ${ord.orderNumber}`}
                        value={ord.orderStatus}
                        onChange={(e) =>
                          handleOrderUpdate(
                            ord.orderNumber,
                            e.target.value as OrderStatus,
                            ord.paymentStatus
                          )
                        }
                        className="px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                      >
                        <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="PROCESSING">PROCESSING</option>
                        <option value="SHIPPED">SHIPPED</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        aria-label={`Payment status for ${ord.orderNumber}`}
                        value={ord.paymentStatus}
                        onChange={(e) =>
                          handleOrderUpdate(
                            ord.orderNumber,
                            ord.orderStatus,
                            e.target.value as PaymentStatus
                          )
                        }
                        className="px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                      >
                        <option value="UNPAID_COD">UNPAID_COD</option>
                        <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                        <option value="VERIFIED">VERIFIED (Paid)</option>
                        <option value="REFUNDED">REFUNDED</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <Link
                        to={`/orders/${ord.orderNumber}`}
                        className="text-[#15803D] font-semibold hover:underline"
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Size-Specific Inventory Management */}
      {activeTab === 'inventory' && !loading && (
        <div className="bg-white border border-zinc-200 p-6 space-y-6">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
              Size-Specific Variant Stock Management
            </h2>
            <p className="text-xs text-zinc-500">
              Adjust stock counts per size variant (S to XXL). Changes immediately reflect on the
              storefront catalog and server-side checkout verifier.
            </p>
          </div>

          <div className="space-y-4">
            {products.map((prod) => (
              <div
                key={prod.id}
                className="p-4 bg-[#F7F7F5] border border-zinc-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div>
                  <Link
                    to={`/product/${prod.slug}`}
                    className="text-sm font-bold text-zinc-900 hover:text-[#15803D]"
                  >
                    {prod.name}
                  </Link>
                  <p className="text-xs text-zinc-500 font-mono-num mt-0.5">
                    {prod.team} · {prod.editionTier} · Base Price: {formatBdt(prod.priceBdt)} ·
                    Print: +{formatBdt(prod.customPrintPriceBdt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {prod.variants.map((v) => (
                    <div
                      key={v.sku}
                      className="bg-white border border-zinc-300 px-3 py-2 flex items-center gap-2 text-xs font-mono-num"
                    >
                      <span className="font-bold text-zinc-900">{v.size}:</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleVariantStockUpdate(prod.id, v.size, Math.max(0, v.stock - 1))
                        }
                        aria-label={`Decrease ${prod.name} size ${v.size} stock`}
                        className="w-5 h-5 bg-zinc-100 hover:bg-zinc-200 font-bold"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-semibold">{v.stock}</span>
                      <button
                        type="button"
                        onClick={() => handleVariantStockUpdate(prod.id, v.size, v.stock + 1)}
                        aria-label={`Increase ${prod.name} size ${v.size} stock`}
                        className="w-5 h-5 bg-zinc-100 hover:bg-zinc-200 font-bold"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Configurable Bangladesh Shipping & Site Settings */}
      {activeTab === 'settings' && settingsForm && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-zinc-200 p-6 space-y-5 max-w-2xl"
        >
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
              Configurable Bangladesh Shipping &amp; Storefront Settings
            </h2>
            <p className="text-xs text-zinc-500">
              Modify Inside Dhaka / Outside Dhaka courier rates, free delivery threshold, and the
              storefront announcement bar.
            </p>
          </div>

          <div>
            <label
              htmlFor="adm-announcement"
              className="block text-xs font-semibold text-zinc-800 mb-1"
            >
              Top Announcement Bar Text
            </label>
            <input
              id="adm-announcement"
              type="text"
              value={settingsForm.announcementText}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, announcementText: e.target.value })
              }
              className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="adm-inside-dhaka"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Inside Dhaka Rate (৳)
              </label>
              <input
                id="adm-inside-dhaka"
                type="number"
                min={0}
                value={settingsForm.insideDhakaShippingBdt}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    insideDhakaShippingBdt: Number(e.target.value)
                  })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
              />
            </div>

            <div>
              <label
                htmlFor="adm-outside-dhaka"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Outside Dhaka Rate (৳)
              </label>
              <input
                id="adm-outside-dhaka"
                type="number"
                min={0}
                value={settingsForm.outsideDhakaShippingBdt}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    outsideDhakaShippingBdt: Number(e.target.value)
                  })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
              />
            </div>

            <div>
              <label
                htmlFor="adm-free-threshold"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Free Delivery Threshold (৳)
              </label>
              <input
                id="adm-free-threshold"
                type="number"
                min={0}
                value={settingsForm.freeShippingThresholdBdt}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    freeShippingThresholdBdt: Number(e.target.value)
                  })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D] transition-colors flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save Store Configuration</span>
          </button>
        </form>
      )}
    </div>
  );
};
