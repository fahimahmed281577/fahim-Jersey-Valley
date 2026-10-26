import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingBag,
  Search,
  Heart,
  Menu,
  X,
  Trash2,
  Plus,
  Minus,
  Truck,
  ArrowRight
} from 'lucide-react';
import { formatBdt } from '../lib/commerce';
import { useStore } from '../context/StoreContext';
import { JerseyVisualizer } from './JerseyVisualizer';
import { ResponsiveImage } from './common/ResponsiveImage';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    settings,
    cart,
    cartCount,
    cartSubtotalBdt,
    isCartDrawerOpen,
    setCartDrawerOpen,
    updateCartQuantity,
    removeFromCart,
    wishlistIds,
    toasts,
    dismissToast,
    pushToast
  } = useStore();

  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
    setMobileMenuOpen(false);
  };

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newsletterEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setNewsletterStatus('Please enter a valid email address.');
      return;
    }
    if (!newsletterConsent) {
      setNewsletterStatus('Please check the consent box to subscribe to Jersey Valley updates.');
      return;
    }


    setNewsletterEmail('');
    setNewsletterConsent(false);
    setNewsletterStatus('Subscribed! You will receive new kit drop alerts.');
    pushToast('Subscribed to Jersey Valley kit alerts', 'success');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F5] text-[#111111]">
      {/* Slim Dismissible Announcement Bar (<= 36px height) */}
      {!bannerDismissed && (
        <div className="bg-[#111111] text-white text-xs px-4 py-2 border-b border-zinc-800">
          <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-4">
            <p className="truncate font-medium tracking-wide">
              {settings.announcementText}
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss announcement bar"
              className="text-zinc-400 hover:text-white shrink-0 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Bar Contract: Strictly 3 Zones separated by gap */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <Link
            to="/"
            className="font-display text-xl sm:text-2xl font-bold tracking-wider text-[#111111] whitespace-nowrap shrink-0"
          >
            JERSEY VALLEY
          </Link>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-700"
          >
            <Link
              to="/shop"
              className={`hover:text-[#111111] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                location.pathname === '/shop' && !location.search ? 'text-[#111111] font-semibold underline' : ''
              }`}
            >
              Shop All
            </Link>
            <Link
              to="/shop?category=national"
              className="hover:text-[#111111] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              National Teams
            </Link>
            <Link
              to="/shop?category=club"
              className="hover:text-[#111111] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Club Jerseys
            </Link>
            <Link
              to="/shop?category=retro"
              className="hover:text-[#111111] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Retro Vault
            </Link>
            <Link
              to="/track"
              className={`hover:text-[#111111] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                location.pathname.startsWith('/track') ? 'text-[#111111] font-semibold underline' : ''
              }`}
            >
              Track Order
            </Link>
          </nav>

          {/* Zone 3: 1 primary action (Shopping Bag Drawer Trigger + Mobile Menu Trigger on small screens) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              aria-label={`Open shopping bag (${cartCount} items)`}
              className="px-3 sm:px-4 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Bag ({cartCount})</span>
              {cartSubtotalBdt > 0 && (
                <span className="hidden sm:inline font-mono-num text-zinc-300">
                  · {formatBdt(cartSubtotalBdt)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 border border-zinc-300 text-zinc-900 hover:bg-zinc-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Storefront Utility Bar (Search, Wishlist, Order Tracking) */}
      <div className="bg-[#F7F7F5] border-b border-zinc-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <form
            onSubmit={handleSearchSubmit}
            role="search"
            className="flex items-center w-full md:w-auto md:flex-1 md:max-w-md bg-white border border-zinc-300 focus-within:border-[#111111]"
          >
            <label htmlFor="global-jersey-search" className="sr-only">
              Search jerseys by team, country, club, or retro year
            </label>
            <input
              id="global-jersey-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search Argentina, Bangladesh, Real Madrid, Retro 1999..."
              className="w-full px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none min-w-0"
            />
            <button
              type="submit"
              aria-label="Search catalog"
              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 border-l border-zinc-300"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </form>

          <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3 sm:gap-5 text-xs font-medium text-zinc-700">
            <Link
              to="/wishlist"
              className="hover:text-[#15803D] flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Saved ({wishlistIds.length})</span>
            </Link>
            <Link
              to="/track"
              className="hover:text-[#15803D] flex items-center gap-1.5 whitespace-nowrap shrink-0"
              aria-label="Track your order"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Track Order</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-zinc-200 px-4 py-4 space-y-3">
          <nav aria-label="Mobile navigation" className="flex flex-col space-y-2.5 text-sm font-medium">
            <Link
              to="/shop"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 border-b border-zinc-100"
            >
              Shop All Jerseys
            </Link>
            <Link
              to="/shop?category=national"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 border-b border-zinc-100"
            >
              National Teams
            </Link>
            <Link
              to="/shop?category=club"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 border-b border-zinc-100"
            >
              Club Jerseys
            </Link>
            <Link
              to="/shop?category=retro"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 border-b border-zinc-100"
            >
              Retro Collection
            </Link>
            <Link
              to="/track"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 border-b border-zinc-100"
            >
              Track Order
            </Link>
            <Link
              to="/wishlist"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1.5 border-b border-zinc-100"
            >
              Wishlist ({wishlistIds.length})
            </Link>
          </nav>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 text-xs font-medium shadow-md border ${
                t.type === 'error'
                  ? 'bg-red-950 text-white border-red-800'
                  : t.type === 'success'
                    ? 'bg-[#111111] text-white border-[#15803D]'
                    : 'bg-zinc-900 text-white border-zinc-700'
              }`}
            >
              <span>{t.title}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Slide-Over Shopping Cart Drawer */}
      {isCartDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping Bag"
        >
          <div className="bg-white w-full max-w-md h-full flex flex-col justify-between shadow-xl border-l border-zinc-200">
            <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                  Your Kit Bag ({cartCount})
                </h2>
                <p className="text-xs text-zinc-500">
                  Prices in BDT (৳) · Final total verified at checkout
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                aria-label="Close shopping bag"
                className="p-2 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-12 space-y-4">
                  <ShoppingBag className="w-10 h-10 text-zinc-300 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-900">Your bag is empty</p>
                    <p className="text-xs text-zinc-500">
                      Explore National Team, Club, and Heritage Retro replica jerseys.
                    </p>
                  </div>
                  <Link
                    to="/shop"
                    onClick={() => setCartDrawerOpen(false)}
                    className="inline-block px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors"
                  >
                    Browse Jerseys
                  </Link>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.lineKey}
                    className="flex gap-3.5 pb-4 border-b border-zinc-200"
                  >
                    <div className="w-20 h-20 shrink-0 border border-zinc-200 bg-[#EFEFEC] overflow-hidden">
                      {item.hasCustomPrint ? (
                        <JerseyVisualizer
                          visual={item.visual}
                          team={item.team}
                          editionTier={item.editionTier}
                          view="back"
                          customName={item.customName}
                          customNumber={item.customNumber}
                          className="w-full h-full"
                        />
                      ) : (
                        <ResponsiveImage
                          productId={item.productId}
                          alt={item.productName}
                          sizes="80px"
                          className="w-full h-full"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/product/${item.slug}`}
                        onClick={() => setCartDrawerOpen(false)}
                        className="text-sm font-semibold text-zinc-900 hover:text-[#15803D] line-clamp-1"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Size: <strong className="text-zinc-800">{item.size}</strong> · {item.editionTier}
                      </p>
                      {item.hasCustomPrint && (
                        <p className="text-xs text-[#15803D] font-mono-num mt-0.5">
                          Custom Print: {item.customName || '—'} #{item.customNumber || '—'} (+
                          {formatBdt(item.customPrintPriceBdt)})
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center border border-zinc-300">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.lineKey, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.productName}`}
                            className="p-1 text-zinc-700 hover:bg-zinc-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 text-xs font-mono-num font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.lineKey, item.quantity + 1)}
                            aria-label={`Increase quantity of ${item.productName}`}
                            className="p-1 text-zinc-700 hover:bg-zinc-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold font-mono-num">
                            {formatBdt(item.unitPriceBdt * item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.lineKey)}
                            aria-label={`Remove ${item.productName} from bag`}
                            className="text-zinc-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-5 bg-[#F7F7F5] border-t border-zinc-200 space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>Inside Dhaka Delivery</span>
                  <span className="font-mono-num">
                    {cartSubtotalBdt >= settings.freeShippingThresholdBdt
                      ? 'FREE'
                      : formatBdt(settings.insideDhakaShippingBdt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base font-bold text-zinc-900">
                  <span>Bag Subtotal</span>
                  <span className="font-mono-num">{formatBdt(cartSubtotalBdt)}</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Coupons (e.g. <span className="font-mono-num font-semibold">VALLEY10</span>) and division shipping calculated at checkout.
                </p>
                <div className="grid grid-cols-1 gap-2 pt-1">
                  <Link
                    to="/checkout"
                    onClick={() => setCartDrawerOpen(false)}
                    className="w-full py-3 px-4 bg-[#15803D] text-white text-xs font-semibold tracking-wide text-center hover:bg-[#14532D] transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Proceed to Bangladesh Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editorial Footer */}
      <footer className="bg-[#111111] text-white border-t border-zinc-800 mt-16">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Column 1: Brand & Replica Honesty */}
          <div className="space-y-3">
            <span className="font-display text-2xl font-bold tracking-wider text-white block">
              JERSEY VALLEY
            </span>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Premium football jersey store serving supporters across all 8 divisions of Bangladesh.
              All products sold on Jersey Valley are high-grade <strong>fan replica</strong> and{' '}
              <strong>supporter tribute jerseys</strong>, never misrepresented as officially licensed club or federation merchandise.
            </p>
            <p className="text-xs text-zinc-400 font-mono-num">
              Dhaka Dispatch Desk · Sample Support Line: +880 1700-000000 (Demo Placeholder)
            </p>
          </div>

          {/* Column 2: Collections */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Collections
            </h3>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li>
                <Link to="/shop?category=national" className="hover:text-white">
                  National Team Jerseys (2026 Kits)
                </Link>
              </li>
              <li>
                <Link to="/shop?category=club" className="hover:text-white">
                  European Club Kits (Fan &amp; Player Fit)
                </Link>
              </li>
              <li>
                <Link to="/shop?category=retro" className="hover:text-white">
                  Heritage Retro Vault (1994–2007)
                </Link>
              </li>
              <li>
                <Link to="/shop" className="hover:text-white">
                  Custom Name &amp; Squad Number Printing
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Bangladesh Shipping & Payment Policy */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Shipping, COD &amp; Returns
            </h3>
            <ul className="space-y-2 text-xs text-zinc-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <Truck className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  Inside Dhaka: <strong className="text-white font-mono-num">{formatBdt(settings.insideDhakaShippingBdt)}</strong> · Outside Dhaka:{' '}
                  <strong className="text-white font-mono-num">{formatBdt(settings.outsideDhakaShippingBdt)}</strong> · Free at{' '}
                  <strong className="text-white font-mono-num">{formatBdt(settings.freeShippingThresholdBdt)}</strong>+
                </span>
              </li>
              <li>
                <strong className="text-white">Cash on Delivery (COD):</strong> Pay in cash upon receiving your parcel anywhere in Bangladesh.
              </li>
              <li>
                <strong className="text-white">7-Day Size Exchange:</strong> Unworn, unwashed standard jerseys (without custom name/number print) qualify for size exchange within {settings.returnWindowDays} days.
              </li>
            </ul>
          </div>

          {/* Column 4: Consent-Based Newsletter */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Kit Drop Alerts
            </h3>
            <p className="text-xs text-zinc-400">
              Receive notifications when new national team, club, and retro replica batches arrive in Dhaka.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="space-y-2.5">
              <div>
                <label htmlFor="footer-newsletter-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="footer-newsletter-email"
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#15803D]"
                />
              </div>
              <label className="flex items-start gap-2 text-[11px] text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newsletterConsent}
                  onChange={(e) => setNewsletterConsent(e.target.checked)}
                  className="mt-0.5 accent-[#15803D]"
                />
                <span>
                  I agree to receive email updates from Jersey Valley and understand I can unsubscribe at any time.
                </span>
              </label>
              <button
                type="submit"
                className="w-full py-2 px-4 bg-[#15803D] text-white text-xs font-semibold hover:bg-[#14532D] transition-colors"
              >
                Subscribe to Kit Drops
              </button>
              {newsletterStatus && (
                <p className="text-[11px] text-emerald-400">{newsletterStatus}</p>
              )}
            </form>
          </div>
        </div>

        <div className="border-t border-zinc-800 py-4 px-4 sm:px-6 text-xs text-zinc-500">
          <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <span>
              © {new Date().getFullYear()} Jersey Valley Bangladesh. Demonstration Catalog &amp; Sample Inventory Mode.
            </span>
            <div className="flex items-center gap-4">
              <Link to="/track" className="hover:text-zinc-300">
                Order Tracking
              </Link>
              <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="hover:text-zinc-300">
                Sitemap
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
