import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, MapPin, Package, Shield, Mail, AlertCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  BANGLADESH_DIVISIONS,
  formatBdt,
  validateBangladeshPhone
} from '../lib/commerce';
import { usePageSeo } from '../lib/seo';

interface CustomerOrderSummary {
  orderNumber: string;
  createdAt: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  totalBdt: number;
  itemCount: number;
}

export const AccountPage: React.FC = () => {
  const {
    currentUser,
    isAdmin,
    getAuthHeaders,
    savedAddress,
    saveCustomerAddress,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    sendPasswordReset,
    logoutUser
  } = useStore();

  usePageSeo({
    title: currentUser
      ? 'Customer Profile & Order History — Jersey Valley'
      : 'Customer Sign In & Registration — Jersey Valley',
    description:
      'Manage your Bangladesh delivery address, saved jerseys, and order history on Jersey Valley.',
    canonicalPath: '/account',
    robots: 'noindex, nofollow'
  });

  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [nameInput, setNameInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);

  // Address form state
  const [phone, setPhone] = useState<string>(savedAddress.phone);
  const [division, setDivision] = useState<string>(savedAddress.division || 'Dhaka');
  const [district, setDistrict] = useState<string>(savedAddress.district || 'Dhaka');
  const [upazila, setUpazila] = useState<string>(savedAddress.upazila || 'Dhanmondi');
  const [streetAddress, setStreetAddress] = useState<string>(savedAddress.streetAddress);
  const [postalCode, setPostalCode] = useState<string>(savedAddress.postalCode);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);

  useEffect(() => {
    setPhone(savedAddress.phone);
    setDivision(savedAddress.division || 'Dhaka');
    setDistrict(savedAddress.district || 'Dhaka');
    setUpazila(savedAddress.upazila || 'Dhanmondi');
    setStreetAddress(savedAddress.streetAddress);
    setPostalCode(savedAddress.postalCode);
  }, [savedAddress]);

  const availableDistricts = useMemo(() => {
    const divObj = BANGLADESH_DIVISIONS[division] || BANGLADESH_DIVISIONS.Dhaka;
    return Object.keys(divObj.districts);
  }, [division]);

  const availableUpazilas = useMemo(() => {
    const divObj = BANGLADESH_DIVISIONS[division] || BANGLADESH_DIVISIONS.Dhaka;
    return divObj.districts[district] || Object.values(divObj.districts)[0] || [];
  }, [division, district]);

  useEffect(() => {
    const loadCustomerOrders = async () => {
      if (!currentUser) {
        setOrders([]);
        return;
      }
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch('/api/customer/orders', {
          headers: authHeaders
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data.orders) ? data.orders : []);
        } else {
          setOrders([]);
        }
      } catch {
        setOrders([]);
      }
    };
    loadCustomerOrders();
  }, [currentUser, getAuthHeaders]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      if (authMode === 'login') {
        await loginWithEmail(emailInput, passwordInput);
      } else if (authMode === 'register') {
        await registerWithEmail(nameInput, emailInput, passwordInput);
      } else {
        await sendPasswordReset(emailInput);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('operation-not-allowed')) {
        setAuthError(
          'Email/Password provider is not yet enabled in your Firebase Console. Please sign in with Google below, or enable Email/Password under Authentication → Sign-in method in the Firebase Console.'
        );
      } else {
        setAuthError(msg);
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  };

  const handleAddressSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError(null);
    const phoneCheck = validateBangladeshPhone(phone);
    if (!phoneCheck.valid) {
      setAddressError(phoneCheck.error || 'Invalid Bangladesh phone number.');
      return;
    }
    if (streetAddress.trim().length < 4) {
      setAddressError('Please enter your complete road and house address.');
      return;
    }
    await saveCustomerAddress({
      phone: phoneCheck.normalized,
      division,
      district,
      upazila,
      streetAddress: streetAddress.trim(),
      postalCode: postalCode.trim()
    });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="border-b border-zinc-200 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span>FIREBASE AUTHENTICATION</span>
            <span aria-hidden="true">·</span>
            <span>PII SPLIT-COLLECTION ISOLATION</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            Customer Account &amp; Saved Address
          </h1>
        </div>

        {currentUser && (
          <button
            type="button"
            onClick={logoutUser}
            className="px-4 py-2 border border-zinc-300 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Auth Card or Signed-In Profile */}
        <div className="lg:col-span-5 space-y-6">
          {!currentUser ? (
            <div className="bg-white border border-zinc-200 p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                  {authMode === 'login'
                    ? 'Sign In to Jersey Valley'
                    : authMode === 'register'
                      ? 'Create Customer Account'
                      : 'Reset Password'}
                </h2>
                <User className="w-4 h-4 text-[#15803D]" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors flex items-center justify-center gap-2"
              >
                <span>Continue with Google Sign-In (Recommended)</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-zinc-200" />
                <span className="flex-shrink mx-3 text-[11px] text-zinc-400 uppercase">
                  or Email &amp; Password
                </span>
                <div className="flex-grow border-t border-zinc-200" />
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                {authMode === 'register' && (
                  <div>
                    <label
                      htmlFor="acc-name"
                      className="block text-xs font-semibold text-zinc-800 mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="acc-name"
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Rahim Uddin"
                      className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="acc-email"
                    className="block text-xs font-semibold text-zinc-800 mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="acc-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                  />
                </div>

                {authMode !== 'reset' && (
                  <div>
                    <label
                      htmlFor="acc-pass"
                      className="block text-xs font-semibold text-zinc-800 mb-1"
                    >
                      Password
                    </label>
                    <input
                      id="acc-pass"
                      type="password"
                      required
                      minLength={6}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                    />
                  </div>
                )}

                {authError && (
                  <div
                    role="alert"
                    className="p-3 bg-red-50 border border-red-300 text-xs text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-2.5 px-4 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D] transition-colors"
                >
                  {authSubmitting
                    ? 'Please wait...'
                    : authMode === 'login'
                      ? 'Sign In with Email'
                      : authMode === 'register'
                        ? 'Create Account'
                        : 'Send Password Reset Email'}
                </button>
              </form>

              <div className="flex items-center justify-between text-xs text-zinc-600 pt-2 border-t border-zinc-100">
                {authMode === 'login' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className="hover:underline font-medium text-[#15803D]"
                    >
                      Create an account
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('reset')}
                      className="hover:underline"
                    >
                      Forgot password?
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className="hover:underline font-medium text-[#15803D]"
                  >
                    ← Back to Sign In
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-zinc-200 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <span className="text-xs text-zinc-500 block">Authenticated Customer</span>
                  <h2 className="text-lg font-bold text-zinc-900">
                    {currentUser.displayName || 'Supporter Account'}
                  </h2>
                </div>
                <Shield className="w-5 h-5 text-[#15803D]" />
              </div>

              <div className="space-y-2 text-xs text-zinc-600">
                <p className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{currentUser.email}</span>
                </p>
                <div className="p-2.5 bg-[#F7F7F5] border border-zinc-200 space-y-1">
                  <span className="text-[11px] text-zinc-500 block">
                    Firebase Authentication UID (for <code>ADMIN_UIDS</code>):
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono-num text-[11px] font-bold text-zinc-900 break-all">
                      {currentUser.uid}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(currentUser.uid);
                      }}
                      className="px-2 py-1 bg-[#111111] text-white text-[10px] font-semibold hover:bg-[#15803D] shrink-0"
                    >
                      Copy UID
                    </button>
                  </div>
                </div>
                <p>
                  Email Verified:{' '}
                  <strong className="text-zinc-900">
                    {currentUser.emailVerified ? 'Yes (Verified)' : 'Pending Verification'}
                  </strong>
                </p>
                <p>
                  Access Tier:{' '}
                  <strong className="text-zinc-900">
                    {isAdmin ? 'Store Administrator' : 'Customer'}
                  </strong>
                </p>
                {isAdmin && (
                  <div className="pt-2">
                    <Link
                      to="/admin"
                      className="inline-block px-4 py-2 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D]"
                    >
                      Open Admin Dashboard →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Default Bangladesh Shipping Address Form */}
          <div className="bg-white border border-zinc-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
                Default Bangladesh Shipping Address
              </h2>
              <MapPin className="w-4 h-4 text-[#15803D]" />
            </div>

            <form onSubmit={handleAddressSave} className="space-y-3.5">
              <div>
                <label
                  htmlFor="prof-phone"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Bangladesh Mobile Number
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01712345678"
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor="prof-division"
                    className="block text-xs font-semibold text-zinc-800 mb-1"
                  >
                    Division
                  </label>
                  <select
                    id="prof-division"
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-zinc-300 text-xs"
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
                    htmlFor="prof-district"
                    className="block text-xs font-semibold text-zinc-800 mb-1"
                  >
                    District
                  </label>
                  <select
                    id="prof-district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-zinc-300 text-xs"
                  >
                    {availableDistricts.map((dist) => (
                      <option key={dist} value={dist}>
                        {dist}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prof-upazila"
                    className="block text-xs font-semibold text-zinc-800 mb-1"
                  >
                    Upazila
                  </label>
                  <select
                    id="prof-upazila"
                    value={upazila}
                    onChange={(e) => setUpazila(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-zinc-300 text-xs"
                  >
                    {availableUpazilas.map((upa) => (
                      <option key={upa} value={upa}>
                        {upa}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="prof-street"
                  className="block text-xs font-semibold text-zinc-800 mb-1"
                >
                  Street / Area / House Address
                </label>
                <input
                  id="prof-street"
                  type="text"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="House 24, Road 9/A, Dhanmondi"
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs"
                />
              </div>

              {addressError && (
                <p className="text-xs text-red-700 font-medium">{addressError}</p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors"
              >
                Save Delivery Address
              </button>
            </form>
          </div>
        </div>

        {/* Right: Order History */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-zinc-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h2 className="font-display text-xl font-bold uppercase text-zinc-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#15803D]" />
                <span>Your Order History</span>
              </h2>
              <Link
                to="/track"
                className="text-xs font-semibold text-[#15803D] hover:underline"
              >
                Lookup Any Order # →
              </Link>
            </div>

            {orders.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm font-semibold text-zinc-900">
                  No orders linked to this session or phone number yet
                </p>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  {currentUser
                    ? 'Place a Cash on Delivery order while signed in to view your account order history, or inspect our demonstration order '
                    : 'Sign in above to view orders linked to your account, or inspect our demonstration order '}
                  <Link
                    to="/orders/JV-DEMO-0001"
                    className="font-mono-num font-semibold text-[#15803D] underline"
                  >
                    JV-DEMO-0001
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse font-mono-num">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-500">
                      <th className="py-2.5 pr-4">Order #</th>
                      <th className="py-2.5 pr-4">Items</th>
                      <th className="py-2.5 pr-4">Order Status</th>
                      <th className="py-2.5 pr-4">Payment</th>
                      <th className="py-2.5 text-right">Total (BDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {orders.map((ord) => (
                      <tr key={ord.orderNumber}>
                        <td className="py-3 pr-4 font-bold">
                          <Link
                            to={`/orders/${ord.orderNumber}`}
                            className="text-[#15803D] hover:underline"
                          >
                            {ord.orderNumber}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">{ord.itemCount}</td>
                        <td className="py-3 pr-4">{ord.orderStatus}</td>
                        <td className="py-3 pr-4">
                          {ord.paymentStatus} ({ord.paymentMethod})
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {formatBdt(ord.totalBdt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
