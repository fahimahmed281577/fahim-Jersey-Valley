import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Truck,
  Tag,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Lock
} from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../context/StoreContext';
import {
  BANGLADESH_DIVISIONS,
  calculateOrderTotals,
  formatBdt,
  validateBangladeshPhone,
  type PaymentMethod
} from '../lib/commerce';
import { JerseyVisualizer } from '../components/JerseyVisualizer';

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    cart,
    products,
    coupons,
    settings,
    currentUser,
    savedAddress,
    saveCustomerAddress,
    clearCart,
    refreshCatalog,
    pushToast
  } = useStore();

  const [customerName, setCustomerName] = useState<string>(
    currentUser?.displayName || ''
  );
  const [customerPhone, setCustomerPhone] = useState<string>(savedAddress.phone || '');
  const [customerEmail, setCustomerEmail] = useState<string>(
    currentUser?.email || ''
  );
  const [division, setDivision] = useState<string>(savedAddress.division || 'Dhaka');
  const [district, setDistrict] = useState<string>(savedAddress.district || 'Dhaka');
  const [upazila, setUpazila] = useState<string>(savedAddress.upazila || 'Dhanmondi');
  const [streetAddress, setStreetAddress] = useState<string>(
    savedAddress.streetAddress || ''
  );
  const [postalCode, setPostalCode] = useState<string>(savedAddress.postalCode || '');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [saveAddressForNextTime, setSaveAddressForNextTime] = useState<boolean>(true);

  const [couponInput, setCouponInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [idempotencyKey] = useState<string>(
    () => `jv-chk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );

  // Sync division -> district -> upazila options
  const availableDistricts = useMemo(() => {
    const divObj = BANGLADESH_DIVISIONS[division] || BANGLADESH_DIVISIONS.Dhaka;
    return Object.keys(divObj.districts);
  }, [division]);

  const availableUpazilas = useMemo(() => {
    const divObj = BANGLADESH_DIVISIONS[division] || BANGLADESH_DIVISIONS.Dhaka;
    return divObj.districts[district] || Object.values(divObj.districts)[0] || [];
  }, [division, district]);

  useEffect(() => {
    if (!availableDistricts.includes(district)) {
      const nextDist = availableDistricts[0] || 'Dhaka';
      setDistrict(nextDist);
    }
  }, [division, availableDistricts, district]);

  useEffect(() => {
    if (!availableUpazilas.includes(upazila)) {
      setUpazila(availableUpazilas[0] || '');
    }
  }, [district, availableUpazilas, upazila]);

  // Calculate order totals deterministically using shared business logic + server verification
  const calculation = useMemo(() => {
    return calculateOrderTotals({
      items: cart.map((c) => ({
        productId: c.productId,
        size: c.size,
        quantity: c.quantity,
        customName: c.customName,
        customNumber: c.customNumber
      })),
      catalog: products,
      coupons,
      settings,
      couponCode: appliedCoupon,
      division,
      district
    });
  }, [cart, products, coupons, settings, appliedCoupon, division, district]);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedCoupon(couponInput.trim().toUpperCase());
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (cart.length === 0) {
      setSubmitError('Your bag is empty.');
      return;
    }

    if (customerName.trim().length < 2) {
      setSubmitError('Please enter your full name.');
      return;
    }

    const phoneCheck = validateBangladeshPhone(customerPhone);
    if (!phoneCheck.valid) {
      setSubmitError(phoneCheck.error || 'Invalid Bangladesh mobile number.');
      return;
    }

    if (streetAddress.trim().length < 4) {
      setSubmitError('Please enter your detailed house/road/area address.');
      return;
    }

    if (paymentMethod === 'BKASH' && !settings.bkashMerchantEnabled) {
      setSubmitError(
        'bKash online merchant API credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to complete your order.'
      );
      return;
    }

    if (paymentMethod === 'NAGAD' && !settings.nagadMerchantEnabled) {
      setSubmitError(
        'Nagad merchant API credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to complete your order.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          idempotencyKey,
          customerName: customerName.trim(),
          customerPhone: phoneCheck.normalized,
          customerEmail: customerEmail.trim(),
          division,
          district,
          upazila,
          streetAddress: streetAddress.trim(),
          postalCode: postalCode.trim(),
          deliveryNotes: deliveryNotes.trim(),
          paymentMethod,
          couponCode: appliedCoupon || undefined,
          items: cart.map((c) => ({
            productId: c.productId,
            size: c.size,
            quantity: c.quantity,
            customName: c.customName,
            customNumber: c.customNumber
          }))
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setSubmitError(data.error || 'Could not place order. Please review your details.');
        setIsSubmitting(false);
        return;
      }

      const createdOrder = data.order;
      if (createdOrder?.orderNumber && data.orderAccessToken) {
        try {
          const existingRaw = sessionStorage.getItem('jv_order_tokens_v1');
          const tokenMap = existingRaw ? JSON.parse(existingRaw) : {};
          tokenMap[String(createdOrder.orderNumber).toUpperCase()] = String(data.orderAccessToken);
          sessionStorage.setItem('jv_order_tokens_v1', JSON.stringify(tokenMap));
        } catch {
          // ignore storage errors
        }
      }

      // Save shipping address if checked
      if (saveAddressForNextTime) {
        await saveCustomerAddress({
          phone: phoneCheck.normalized,
          division,
          district,
          upazila,
          streetAddress: streetAddress.trim(),
          postalCode: postalCode.trim()
        });
      }

      // Also persist to Firestore /orders/{orderNumber} if user is authenticated and verified
      if (currentUser && currentUser.emailVerified && createdOrder) {
        const orderDocPath = `orders/${createdOrder.orderNumber}`;
        try {
          await setDoc(doc(db, 'orders', createdOrder.orderNumber), {
            orderNumber: createdOrder.orderNumber,
            userId: currentUser.uid,
            customerName: createdOrder.customerName.slice(0, 80),
            customerPhone: createdOrder.customerPhone.slice(0, 20),
            division: createdOrder.division.slice(0, 40),
            district: createdOrder.district.slice(0, 40),
            upazila: createdOrder.upazila.slice(0, 60),
            streetAddress: createdOrder.streetAddress.slice(0, 200),
            paymentMethod: createdOrder.paymentMethod,
            paymentStatus: createdOrder.paymentStatus,
            orderStatus: createdOrder.orderStatus,
            subtotalBdt: createdOrder.subtotalBdt,
            shippingBdt: createdOrder.shippingBdt,
            discountBdt: createdOrder.discountBdt,
            totalBdt: createdOrder.totalBdt,
            itemCount: createdOrder.itemCount,
            itemsSummary: createdOrder.items
              .map(
                (i: { productName: string; size: string; quantity: number }) =>
                  `${i.productName} (${i.size}) x${i.quantity}`
              )
              .join(', ')
              .slice(0, 500),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, orderDocPath);
        }
      }

      await refreshCatalog();
      clearCart();
      pushToast(`Order ${createdOrder.orderNumber} placed!`, 'success');
      navigate(`/orders/${createdOrder.orderNumber}`);
    } catch {
      setSubmitError('Network error while submitting order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-3xl font-bold uppercase">Your Checkout Bag is Empty</h1>
        <p className="text-sm text-zinc-600">
          Add a football jersey to your bag before proceeding to Bangladesh checkout.
        </p>
        <Link
          to="/shop"
          className="inline-block px-6 py-3 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D]"
        >
          Browse Jerseys
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8 flex items-center justify-between border-b border-zinc-200 pb-5">
        <div>
          <Link
            to="/shop"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1.5 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Continue Shopping</span>
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            Bangladesh Checkout
          </h1>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-xs text-zinc-500 block">Currency</span>
          <strong className="text-sm font-mono-num text-zinc-900">
            Bangladeshi Taka (BDT · ৳)
          </strong>
        </div>
      </div>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Shipping Address & Payment Method */}
        <div className="lg:col-span-7 space-y-8">
          {/* Step 1: Customer & Bangladesh Delivery Address */}
          <section className="bg-white border border-zinc-200 p-6 space-y-5">
            <div className="border-b border-zinc-100 pb-3">
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                01. Customer &amp; Delivery Details (Bangladesh)
              </h2>
              <p className="text-xs text-zinc-500">
                Our dispatch team verifies COD orders via your 11-digit Bangladesh mobile number.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="chk-name"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Full Name *
                </label>
                <input
                  id="chk-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Tanvir Ahmed"
                  className="w-full px-3 py-2.5 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div>
                <label
                  htmlFor="chk-phone"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Bangladesh Mobile Number *
                </label>
                <input
                  id="chk-phone"
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="01712345678"
                  className="w-full px-3 py-2.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num focus:outline-none focus:border-[#111111]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="chk-email"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Email Address (Optional — for digital receipt)
              </label>
              <input
                id="chk-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
              />
            </div>

            {/* Division / District / Upazila Cascade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="chk-division"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Division *
                </label>
                <select
                  id="chk-division"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                >
                  {Object.keys(BANGLADESH_DIVISIONS).map((divName) => (
                    <option key={divName} value={divName}>
                      {divName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="chk-district"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  District *
                </label>
                <select
                  id="chk-district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                >
                  {availableDistricts.map((distName) => (
                    <option key={distName} value={distName}>
                      {distName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="chk-upazila"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Upazila / Thana *
                </label>
                <select
                  id="chk-upazila"
                  value={upazila}
                  onChange={(e) => setUpazila(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                >
                  {availableUpazilas.map((upaName) => (
                    <option key={upaName} value={upaName}>
                      {upaName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="chk-street"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Area, Road &amp; House Address *
                </label>
                <input
                  id="chk-street"
                  type="text"
                  required
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="House 14, Road 5, Sector 7 / Block C"
                  className="w-full px-3 py-2.5 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div>
                <label
                  htmlFor="chk-postal"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Postal Code (Optional)
                </label>
                <input
                  id="chk-postal"
                  type="text"
                  maxLength={10}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="1209"
                  className="w-full px-3 py-2.5 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num focus:outline-none focus:border-[#111111]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="chk-notes"
                className="block text-xs font-semibold text-zinc-800 mb-1"
              >
                Delivery Instructions (Optional)
              </label>
              <input
                id="chk-notes"
                type="text"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="e.g. Call rider before arriving at main gate"
                className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={saveAddressForNextTime}
                onChange={(e) => setSaveAddressForNextTime(e.target.checked)}
                className="accent-[#15803D]"
              />
              <span>Save this Bangladesh delivery address for faster future checkout</span>
            </label>
          </section>

          {/* Step 2: Payment Method Selection */}
          <section className="bg-white border border-zinc-200 p-6 space-y-4">
            <div className="border-b border-zinc-100 pb-3">
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                02. Payment Method
              </h2>
              <p className="text-xs text-zinc-500">
                Choose Cash on Delivery (active production workflow) or inspect bKash / Nagad gateway status.
              </p>
            </div>

            <div className="space-y-3" role="radiogroup" aria-label="Payment method">
              {/* Option 1: Cash on Delivery */}
              <label
                className={`block p-4 border cursor-pointer transition-colors ${
                  paymentMethod === 'COD'
                    ? 'border-[#15803D] bg-emerald-50/40'
                    : 'border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      checked={paymentMethod === 'COD'}
                      onChange={() => {
                        setPaymentMethod('COD');
                        setSubmitError(null);
                      }}
                      className="mt-1 accent-[#15803D]"
                    />
                    <div>
                      <span className="text-sm font-bold text-zinc-900 block">
                        Cash on Delivery (COD) — Nationwide Bangladesh
                      </span>
                      <span className="text-xs text-zinc-600 block mt-0.5">
                        Pay <strong className="font-mono-num">{formatBdt(calculation.totalBdt)}</strong> in cash when the courier delivers your jersey. Order status starts as{' '}
                        <code className="text-[11px] bg-zinc-200 px-1">PENDING_CONFIRMATION</code> and payment status remains{' '}
                        <code className="text-[11px] bg-zinc-200 px-1">UNPAID_COD</code> until collected.
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-[#15803D] whitespace-nowrap">
                    Active Workflow
                  </span>
                </div>
              </label>

              {/* Option 2: bKash */}
              <label
                className={`block p-4 border cursor-pointer transition-colors ${
                  paymentMethod === 'BKASH'
                    ? 'border-[#111111] bg-zinc-50'
                    : 'border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="BKASH"
                      checked={paymentMethod === 'BKASH'}
                      onChange={() => setPaymentMethod('BKASH')}
                      className="mt-1 accent-[#111111]"
                    />
                    <div>
                      <span className="text-sm font-bold text-zinc-900 block">
                        bKash Merchant Tokenized Checkout
                      </span>
                      <span className="text-xs text-zinc-600 block mt-0.5">
                        {settings.bkashMerchantEnabled
                          ? 'Redirect to official bKash PGW for tokenized payment verification.'
                          : 'Integration interface ready. Live bKash Merchant API keys (BKASH_APP_KEY / BKASH_APP_SECRET) are not yet configured in environment secrets — fake payment confirmations are strictly disabled.'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">
                    {settings.bkashMerchantEnabled ? 'Live' : 'Pending Merchant Keys'}
                  </span>
                </div>
              </label>

              {/* Option 3: Nagad */}
              <label
                className={`block p-4 border cursor-pointer transition-colors ${
                  paymentMethod === 'NAGAD'
                    ? 'border-[#111111] bg-zinc-50'
                    : 'border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="NAGAD"
                      checked={paymentMethod === 'NAGAD'}
                      onChange={() => setPaymentMethod('NAGAD')}
                      className="mt-1 accent-[#111111]"
                    />
                    <div>
                      <span className="text-sm font-bold text-zinc-900 block">
                        Nagad Merchant Payment Gateway
                      </span>
                      <span className="text-xs text-zinc-600 block mt-0.5">
                        {settings.nagadMerchantEnabled
                          ? 'Redirect to official Nagad PGW for cryptographic signature verification.'
                          : 'Integration interface ready. Live Nagad Merchant PGW keys (NAGAD_MERCHANT_ID / NAGAD_PG_PUBLIC_KEY) are not yet configured — fake payment confirmations are strictly disabled.'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap">
                    {settings.nagadMerchantEnabled ? 'Live' : 'Pending Merchant Keys'}
                  </span>
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* Right: Server-Authoritative Order Summary & Coupon Box */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-zinc-200 p-6 space-y-5">
            <h2 className="font-display text-xl font-bold uppercase text-zinc-900 border-b border-zinc-100 pb-3">
              Order Summary ({calculation.itemCount} Item{calculation.itemCount === 1 ? '' : 's'})
            </h2>

            {/* Itemized List */}
            <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div
                  key={item.lineKey}
                  className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 shrink-0 border border-zinc-200 bg-[#EFEFEC]">
                      <JerseyVisualizer
                        visual={item.visual}
                        team={item.team}
                        editionTier={item.editionTier}
                        view={item.hasCustomPrint ? 'back' : 'front'}
                        customName={item.customName}
                        customNumber={item.customNumber}
                        className="w-full h-full"
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900">{item.productName}</p>
                      <p className="text-zinc-500">
                        Size: <strong>{item.size}</strong> · Qty: <strong>{item.quantity}</strong>
                      </p>
                      {item.hasCustomPrint && (
                        <p className="text-[#15803D] font-mono-num">
                          Print: {item.customName || '—'} #{item.customNumber || '—'}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="font-mono-num font-semibold text-zinc-900 shrink-0">
                    {formatBdt(item.unitPriceBdt * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Coupon Code Box */}
            <div className="pt-2">
              <label
                htmlFor="chk-coupon"
                className="block text-xs font-semibold text-zinc-800 mb-1.5"
              >
                Promo / Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  id="chk-coupon"
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Try VALLEY10 or DHAKA60"
                  className="flex-1 px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num uppercase focus:outline-none focus:border-[#111111]"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 bg-zinc-900 text-white text-xs font-semibold hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                >
                  Apply
                </button>
              </div>
              {calculation.couponMessage && (
                <p
                  className={`text-xs mt-1.5 flex items-center gap-1 ${
                    calculation.appliedCouponCode ? 'text-[#15803D]' : 'text-red-700'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5 shrink-0" />
                  <span>{calculation.couponMessage}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-zinc-500">
                <span>Available codes:</span>
                {coupons.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      setCouponInput(c.code);
                      setAppliedCoupon(c.code);
                    }}
                    className="underline hover:text-zinc-900 font-mono-num"
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-2 pt-3 border-t border-zinc-200 text-xs">
              <div className="flex justify-between text-zinc-600">
                <span>Items Subtotal (including custom print)</span>
                <span className="font-mono-num font-semibold text-zinc-900">
                  {formatBdt(calculation.subtotalBdt)}
                </span>
              </div>

              {calculation.discountBdt > 0 && (
                <div className="flex justify-between text-[#15803D]">
                  <span>Coupon Discount ({calculation.appliedCouponCode})</span>
                  <span className="font-mono-num font-semibold">
                    -{formatBdt(calculation.discountBdt)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-zinc-600">
                <span>Shipping ({calculation.shippingZoneLabel || `${division} / ${district}`})</span>
                <span className="font-mono-num font-semibold text-zinc-900">
                  {calculation.shippingBdt === 0 ? 'FREE' : formatBdt(calculation.shippingBdt)}
                </span>
              </div>

              <div className="flex justify-between text-base font-bold text-zinc-900 pt-3 border-t border-zinc-200">
                <span>Total Payable (BDT)</span>
                <span className="font-mono-num text-lg">{formatBdt(calculation.totalBdt)}</span>
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-300 text-xs text-red-800 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-5 bg-[#15803D] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#14532D] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Verifying Stock & Placing Order...'
                  : paymentMethod === 'COD'
                    ? `Place Cash on Delivery Order — ${formatBdt(calculation.totalBdt)}`
                    : `Proceed with ${paymentMethod} — ${formatBdt(calculation.totalBdt)}`}
              </span>
            </button>

            <div className="space-y-1.5 text-[11px] text-zinc-500 pt-2 border-t border-zinc-100">
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                <span>
                  Prices, discounts, and size inventory are re-verified on our server before order creation.
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                <span>
                  Inside Dhaka: {formatBdt(settings.insideDhakaShippingBdt)} · Outside Dhaka:{' '}
                  {formatBdt(settings.outsideDhakaShippingBdt)}
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                <span>Idempotent order key active to prevent duplicate order placement.</span>
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
