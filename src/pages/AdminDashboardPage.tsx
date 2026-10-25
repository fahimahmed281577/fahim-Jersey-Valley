import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Package,
  Layers,
  Settings,
  RefreshCw,
  CheckCircle2,
  Lock
} from 'lucide-react';
import {
  formatBdt,
  type Product,
  type OrderStatus,
  type PaymentStatus,
  type SiteSettingsConfig
} from '../lib/commerce';
import { useStore } from '../context/StoreContext';

interface AdminOrderRecord {
  orderNumber: string;
  isDemoOrder?: boolean;
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
  demoOrdersCount: number;
  activeOrdersCount: number;
  totalRevenueBookedBdt: number;
  verifiedPaidRevenueBdt: number;
  pendingCodBdt: number;
  totalProducts: number;
  totalStockUnits: number;
}

export const AdminDashboardPage: React.FC = () => {
  const { currentUser, isAdmin, getAuthHeaders, refreshCatalog, pushToast } = useStore();

  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'settings'>('orders');
  const [authorizedAdmin, setAuthorizedAdmin] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [orders, setOrders] = useState<AdminOrderRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settingsForm, setSettingsForm] = useState<SiteSettingsConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadAdminOverview = useCallback(async () => {
    setLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin/overview?mode=readonly_audit', {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setAuthorizedAdmin(Boolean(data.authorizedAdmin));
        setMetrics(data.metrics);
        setOrders(data.orders || []);
        setProducts(data.products || []);
        setSettingsForm(data.settings || null);
      }
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview, currentUser, isAdmin]);

  const handleOrderUpdate = async (
    orderNumber: string,
    nextOrderStatus: OrderStatus,
    nextPaymentStatus: PaymentStatus
  ) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
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
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ size, stock: nextStock })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Administrator privileges required to modify stock.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast(`Updated stock for ${productId} (${size}) to ${nextStock}`, 'success');
    } catch {
      pushToast('Could not update stock.', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(settingsForm)
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast(data.error || 'Administrator privileges required to update settings.', 'error');
        return;
      }
      await loadAdminOverview();
      await refreshCatalog();
      pushToast('Updated Bangladesh shipping charges & site announcement', 'success');
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
            <span>SERVER-VERIFIED FIREBASE RBAC</span>
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
      <div
        className={`border p-4 flex flex-wrap items-center justify-between gap-4 text-xs ${
          authorizedAdmin
            ? 'bg-emerald-50/50 border-[#15803D] text-zinc-800'
            : 'bg-white border-zinc-300 text-zinc-700'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {authorizedAdmin ? (
            <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
          ) : (
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p>
              <strong>Server-Side &amp; Firestore Admin Authorization:</strong> All write endpoints (
              <code>PATCH /api/admin/*</code>) and Firestore rules require a cryptographically verified
              Firebase ID token with <code>email_verified == true</code> and an administrator record in{' '}
              <code>/admins/&#123;uid&#125;</code>, <code>ADMIN_UIDS</code> env var, or custom claim{' '}
              <code>admin: true</code>. No hardcoded email addresses are trusted.
            </p>
            <p>
              Current session:{' '}
              <strong>
                {currentUser
                  ? `${currentUser.email} (UID: ${currentUser.uid} · ${
                      authorizedAdmin ? 'Verified Server Admin — Write Enabled' : 'Customer — Read-Only Audit Mode'
                    })`
                  : 'Unauthenticated Guest — Read-Only Audit Mode (Real customer PII redacted; mutations blocked with HTTP 401)'}
              </strong>
            </p>
          </div>
        </div>
        <Link to="/account" className="text-[#15803D] font-semibold hover:underline shrink-0">
          Manage Auth Session →
        </Link>
      </div>

      {/* Real Store Metrics Strip (Excludes Demo Seed Orders from Financial Totals) */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Real Customer Orders</span>
            <strong className="text-xl font-bold font-mono-num text-zinc-900">
              {metrics.totalOrders}
            </strong>
            <span className="text-[10px] text-zinc-400 block mt-0.5">
              +{metrics.demoOrdersCount} labeled demo seed
            </span>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Active Real Orders</span>
            <strong className="text-xl font-bold font-mono-num text-zinc-900">
              {metrics.activeOrdersCount}
            </strong>
          </div>
          <div className="bg-white border border-zinc-200 p-4">
            <span className="text-[11px] text-zinc-500 block">Booked Real Order Value</span>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div>
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Order Fulfillment &amp; Payment Status Control
              </h2>
              <p className="text-xs text-zinc-500">
                Track COD fulfillment separately from payment collection. Do not mark COD orders as
                VERIFIED until cash is collected upon delivery.
              </p>
            </div>
            {!authorizedAdmin && (
              <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1">
                Read-Only Preview: Only demonstration order JV-DEMO-0001 is shown to unauthenticated visitors
              </span>
            )}
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
                      <span>{ord.orderNumber}</span>
                      {ord.isDemoOrder && (
                        <span className="block text-[10px] font-sans font-semibold text-amber-700">
                          DEMO RECORD
                        </span>
                      )}
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
                        disabled={!authorizedAdmin}
                        onChange={(e) =>
                          handleOrderUpdate(
                            ord.orderNumber,
                            e.target.value as OrderStatus,
                            ord.paymentStatus
                          )
                        }
                        className="px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num disabled:opacity-60"
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
                        disabled={!authorizedAdmin}
                        onChange={(e) =>
                          handleOrderUpdate(
                            ord.orderNumber,
                            ord.orderStatus,
                            e.target.value as PaymentStatus
                          )
                        }
                        className="px-2.5 py-1.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num disabled:opacity-60"
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
              Adjust stock counts per size variant (S to XXL). Server-side admin authentication is
              enforced on all stock updates.
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
                        disabled={!authorizedAdmin}
                        onClick={() =>
                          handleVariantStockUpdate(prod.id, v.size, Math.max(0, v.stock - 1))
                        }
                        aria-label={`Decrease ${prod.name} size ${v.size} stock`}
                        className="w-5 h-5 bg-zinc-100 hover:bg-zinc-200 font-bold disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-semibold">{v.stock}</span>
                      <button
                        type="button"
                        disabled={!authorizedAdmin}
                        onClick={() => handleVariantStockUpdate(prod.id, v.size, v.stock + 1)}
                        aria-label={`Increase ${prod.name} size ${v.size} stock`}
                        className="w-5 h-5 bg-zinc-100 hover:bg-zinc-200 font-bold disabled:opacity-40"
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
              storefront announcement bar (requires verified Admin session).
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
              disabled={!authorizedAdmin}
              value={settingsForm.announcementText}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, announcementText: e.target.value })
              }
              className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs disabled:opacity-60"
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
                disabled={!authorizedAdmin}
                value={settingsForm.insideDhakaShippingBdt}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    insideDhakaShippingBdt: Number(e.target.value)
                  })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num disabled:opacity-60"
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
                disabled={!authorizedAdmin}
                value={settingsForm.outsideDhakaShippingBdt}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    outsideDhakaShippingBdt: Number(e.target.value)
                  })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num disabled:opacity-60"
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
                disabled={!authorizedAdmin}
                value={settingsForm.freeShippingThresholdBdt}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    freeShippingThresholdBdt: Number(e.target.value)
                  })
                }
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!authorizedAdmin}
            className="px-6 py-2.5 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {authorizedAdmin ? 'Save Store Configuration' : 'Admin Sign-In Required to Save'}
            </span>
          </button>
        </form>
      )}
    </div>
  );
};
