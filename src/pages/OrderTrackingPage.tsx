import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Search,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  CreditCard
} from 'lucide-react';
import { formatBdt, type OrderStatus, type PaymentStatus } from '../lib/commerce';
import { useStore } from '../context/StoreContext';

interface OrderDetailData {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  division: string;
  district: string;
  upazila: string;
  streetAddress: string;
  postalCode: string;
  deliveryNotes: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  items: {
    productId: string;
    slug: string;
    productName: string;
    team: string;
    editionTier: string;
    size: string;
    sku: string;
    quantity: number;
    customName: string;
    customNumber: string;
    hasCustomPrint: boolean;
    finalUnitPriceBdt: number;
    lineTotalBdt: number;
  }[];
  itemCount: number;
  subtotalBdt: number;
  discountBdt: number;
  appliedCouponCode: string | null;
  shippingBdt: number;
  shippingZoneLabel: string;
  totalBdt: number;
  createdAt: string;
  updatedAt: string;
  statusHistory: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    timestamp: string;
    note: string;
  }[];
}

export const OrderTrackingPage: React.FC = () => {
  const { orderNumber: routeOrderNumber } = useParams<{ orderNumber?: string }>();
  const { refreshCatalog, pushToast } = useStore();

  const [lookupInput, setLookupInput] = useState<string>(
    routeOrderNumber || 'JV-2026-1001'
  );
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<boolean>(false);

  const fetchOrder = useCallback(async (ordNum: string) => {
    const clean = ordNum.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        setOrder(null);
        setError(data.error || `Order ${clean} not found.`);
      } else {
        setOrder(data.order);
      }
    } catch {
      setError('Could not load order details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const target = routeOrderNumber || 'JV-2026-1001';
    setLookupInput(target);
    fetchOrder(target);
  }, [routeOrderNumber, fetchOrder]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrder(lookupInput);
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.orderNumber)}/cancel`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setOrder(data.order);
        await refreshCatalog();
        pushToast(`Order ${order.orderNumber} has been cancelled and stock restored.`, 'info');
      } else {
        pushToast(data.error || 'Unable to cancel order.', 'error');
      }
    } catch {
      pushToast('Network error while cancelling order.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const statusSteps: OrderStatus[] = [
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED'
  ];

  const currentStepIndex = order ? statusSteps.indexOf(order.orderStatus) : -1;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="border-b border-zinc-200 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span>ORDER VERIFICATION &amp; TRACKING</span>
            <span aria-hidden="true">·</span>
            <span>COD &amp; PAYMENT STATUS</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            {routeOrderNumber ? `Order Receipt #${routeOrderNumber}` : 'Track Your Jersey Order'}
          </h1>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-auto">
          <label htmlFor="track-order-input" className="sr-only">
            Order Number
          </label>
          <input
            id="track-order-input"
            type="text"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value.toUpperCase())}
            placeholder="e.g. JV-2026-1001"
            className="w-full md:w-56 px-3 py-2 bg-white border border-zinc-300 text-xs font-mono-num uppercase focus:outline-none focus:border-[#111111]"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Lookup Order</span>
          </button>
        </form>
      </div>

      {loading && (
        <div className="bg-white border border-zinc-200 p-10 text-center text-xs text-zinc-500">
          Loading order details...
        </div>
      )}

      {error && (
        <div className="bg-white border border-red-300 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <p className="text-xs text-zinc-500">
            Try sample order <strong className="font-mono-num">JV-2026-1001</strong> or place a new
            Cash on Delivery order from the catalog.
          </p>
        </div>
      )}

      {order && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Fulfillment Progress & Items */}
          <div className="lg:col-span-8 space-y-6">
            {/* Fulfillment vs Payment Status Banner */}
            <div className="bg-white border border-zinc-200 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                <div>
                  <span className="text-xs text-zinc-500 block">Order Reference</span>
                  <h2 className="font-mono-num text-xl font-bold text-zinc-900">
                    {order.orderNumber}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Fulfillment Status</span>
                    <strong className="font-mono-num text-zinc-900">{order.orderStatus}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Payment Status</span>
                    <strong
                      className={`font-mono-num ${
                        order.paymentStatus === 'VERIFIED'
                          ? 'text-[#15803D]'
                          : 'text-amber-700'
                      }`}
                    >
                      {order.paymentStatus} ({order.paymentMethod})
                    </strong>
                  </div>
                </div>
              </div>

              {/* 5-Step Progress Bar */}
              {order.orderStatus === 'CANCELLED' ? (
                <div className="p-4 bg-red-50 border border-red-200 flex items-center gap-3 text-xs text-red-900">
                  <XCircle className="w-5 h-5 text-red-700 shrink-0" />
                  <div>
                    <strong>Order Cancelled:</strong> This order has been cancelled and reserved
                    jersey stock was returned to inventory.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                  {statusSteps.map((step, idx) => {
                    const reached = idx <= currentStepIndex;
                    return (
                      <div
                        key={step}
                        className={`p-3 border text-xs ${
                          reached
                            ? 'bg-emerald-50/60 border-[#15803D] text-zinc-900'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono-num font-bold">0{idx + 1}</span>
                          {reached ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span className="font-semibold block text-[11px] leading-tight">
                          {step.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Customer Cancellation Option while Pending Confirmation */}
              {order.orderStatus === 'PENDING_CONFIRMATION' && (
                <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-zinc-600">
                    Need to change a size or address? You can cancel this order before dispatch
                    confirmation.
                  </p>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={handleCancelOrder}
                    className="px-3.5 py-1.5 border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors"
                  >
                    {cancelling ? 'Cancelling...' : 'Cancel Pending Order'}
                  </button>
                </div>
              )}
            </div>

            {/* Purchased Items Snapshot */}
            <div className="bg-white border border-zinc-200 p-6 space-y-4">
              <h3 className="font-display text-lg font-bold uppercase text-zinc-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#15803D]" />
                <span>Purchased Jersey Snapshot ({order.itemCount} unit{order.itemCount === 1 ? '' : 's'})</span>
              </h3>

              <div className="divide-y divide-zinc-200">
                {order.items.map((item, idx) => (
                  <div
                    key={`${item.sku}-${idx}`}
                    className="py-3.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <Link
                        to={`/product/${item.slug}`}
                        className="font-semibold text-sm text-zinc-900 hover:text-[#15803D]"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-zinc-500 mt-0.5 font-mono-num">
                        SKU: {item.sku} · Size: <strong>{item.size}</strong> · Qty:{' '}
                        <strong>{item.quantity}</strong> · {item.editionTier}
                      </p>
                      {item.hasCustomPrint && (
                        <p className="text-[#15803D] font-mono-num mt-0.5">
                          Custom Back Print: {item.customName || '—'} #{item.customNumber || '—'}
                        </p>
                      )}
                    </div>
                    <div className="text-right font-mono-num">
                      <span className="font-semibold text-sm text-zinc-900 block">
                        {formatBdt(item.lineTotalBdt)}
                      </span>
                      <span className="text-zinc-500 text-[11px]">
                        {formatBdt(item.finalUnitPriceBdt)} each
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Audit Log */}
            <div className="bg-white border border-zinc-200 p-6 space-y-4">
              <h3 className="font-display text-lg font-bold uppercase text-zinc-900">
                Order &amp; Payment Audit Log
              </h3>
              <div className="space-y-3">
                {order.statusHistory.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#F7F7F5] border border-zinc-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono-num font-bold text-zinc-900">
                        {entry.status} · {entry.paymentStatus}
                      </span>
                      <p className="text-zinc-600 mt-0.5">{entry.note}</p>
                    </div>
                    <span className="text-[11px] font-mono-num text-zinc-500 shrink-0">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Delivery Address & Payment Summary */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-zinc-200 p-6 space-y-4 text-xs">
              <h3 className="font-display text-lg font-bold uppercase text-zinc-900 border-b border-zinc-100 pb-2">
                Bangladesh Delivery Address
              </h3>
              <div className="space-y-2 text-zinc-700">
                <p className="font-semibold text-sm text-zinc-900">{order.customerName}</p>
                <p className="flex items-center gap-2 font-mono-num">
                  <Phone className="w-3.5 h-3.5 text-[#15803D]" />
                  <span>{order.customerPhone}</span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                  <span>
                    {order.streetAddress}, {order.upazila}, {order.district}, {order.division}
                    {order.postalCode ? ` — ${order.postalCode}` : ''}
                  </span>
                </p>
                {order.deliveryNotes && (
                  <p className="text-zinc-500 italic">Note: {order.deliveryNotes}</p>
                )}
              </div>
            </div>

            <div className="bg-white border border-zinc-200 p-6 space-y-3 text-xs">
              <h3 className="font-display text-lg font-bold uppercase text-zinc-900 border-b border-zinc-100 pb-2 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#15803D]" />
                <span>Financial Summary (BDT)</span>
              </h3>
              <div className="flex justify-between text-zinc-600">
                <span>Items Subtotal</span>
                <span className="font-mono-num">{formatBdt(order.subtotalBdt)}</span>
              </div>
              {order.discountBdt > 0 && (
                <div className="flex justify-between text-[#15803D]">
                  <span>Discount ({order.appliedCouponCode})</span>
                  <span className="font-mono-num">-{formatBdt(order.discountBdt)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-600">
                <span>Shipping</span>
                <span className="font-mono-num">
                  {order.shippingBdt === 0 ? 'FREE' : formatBdt(order.shippingBdt)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-zinc-900 pt-3 border-t border-zinc-200">
                <span>Total Amount</span>
                <span className="font-mono-num">{formatBdt(order.totalBdt)}</span>
              </div>
              <p className="text-[11px] text-zinc-500 pt-1">
                {order.paymentStatus === 'UNPAID_COD'
                  ? 'Amount to be collected in cash upon doorstep delivery.'
                  : `Payment status: ${order.paymentStatus}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
