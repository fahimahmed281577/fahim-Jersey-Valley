import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Truck, Sparkles, CheckCircle2, PhoneCall } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { JerseyVisualizer } from '../components/JerseyVisualizer';
import { formatBdt, type JerseyCategory } from '../lib/commerce';

export const HomePage: React.FC = () => {
  const { products, settings } = useStore();
  const [activeCollectionTab, setActiveCollectionTab] = useState<'all' | JerseyCategory>('all');
  const [heroShowcaseIndex, setHeroShowcaseIndex] = useState<number>(0);
  const [studioName, setStudioName] = useState<string>('HAMZA');
  const [studioNumber, setStudioNumber] = useState<string>('8');

  const heroProducts = products.slice(0, 4);
  const currentHeroProduct = heroProducts[heroShowcaseIndex] || products[0];

  const displayedProducts = products
    .filter((p) => {
      if (!p.isActive) return false;
      if (activeCollectionTab === 'all') return true;
      return p.category === activeCollectionTab;
    })
    .slice(0, 6);

  return (
    <div>
      {/* SECTION 1: Editorial Split Hero */}
      <section className="bg-[#111111] text-white border-b border-zinc-800">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Editorial Column */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400 tracking-wide">
                  <span>BANGLADESH FOOTBALL APPAREL STORE</span>
                  <span aria-hidden="true">·</span>
                  <span>FAN &amp; RETRO REPLICAS</span>
                  <span aria-hidden="true">·</span>
                  <span>BDT (৳)</span>
                </div>

                <h1
                  className="font-display font-bold uppercase tracking-tight text-white balance-text leading-[0.96]"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.25rem)' }}
                >
                  YOUR GAME. YOUR COLOURS.
                </h1>

                <p className="text-base sm:text-lg text-zinc-300 max-w-xl leading-relaxed">
                  Discover football jerseys inspired by the teams and clubs you love. Breathable
                  AeroMesh and heritage pique replica kits with optional custom name &amp; number
                  thermal printing, delivered across all 8 divisions of Bangladesh.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Link
                    to="/shop"
                    className="px-6 py-3.5 bg-[#15803D] text-white text-sm font-semibold tracking-wide hover:bg-[#14532D] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <span>Shop Jerseys</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="#collections"
                    className="px-6 py-3.5 bg-transparent border border-zinc-600 text-white text-sm font-semibold tracking-wide hover:border-white transition-colors whitespace-nowrap shrink-0"
                  >
                    Explore Collections
                  </a>
                </div>
              </div>

              {/* Transparent Store Highlights Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-zinc-800 text-xs">
                <div>
                  <span className="block font-mono-num text-lg font-bold text-white">
                    {formatBdt(settings.insideDhakaShippingBdt)} / {formatBdt(settings.outsideDhakaShippingBdt)}
                  </span>
                  <span className="text-zinc-400">Inside / Outside Dhaka Delivery</span>
                </div>
                <div>
                  <span className="block font-mono-num text-lg font-bold text-white">
                    Cash on Delivery
                  </span>
                  <span className="text-zinc-400">Nationwide Doorstep Payment</span>
                </div>
                <div>
                  <span className="block font-mono-num text-lg font-bold text-white">
                    165–195 GSM
                  </span>
                  <span className="text-zinc-400">AeroMesh &amp; Retro Pique Weave</span>
                </div>
              </div>
            </div>

            {/* Right Interactive Studio Kit Showcase */}
            {currentHeroProduct && (
              <div className="lg:col-span-5 bg-[#18181B] border border-zinc-800 p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
                  <span>
                    {currentHeroProduct.team} · {currentHeroProduct.kitType} ·{' '}
                    {currentHeroProduct.editionTier}
                  </span>
                  <span className="font-mono-num text-white font-semibold">
                    {formatBdt(currentHeroProduct.priceBdt)}
                  </span>
                </div>

                <Link
                  to={`/product/${currentHeroProduct.slug}`}
                  className="block aspect-[4/3] w-full bg-[#EFEFEC] overflow-hidden"
                >
                  <JerseyVisualizer
                    visual={currentHeroProduct.visual}
                    team={currentHeroProduct.team}
                    editionTier={currentHeroProduct.editionTier}
                    view="front"
                    className="w-full h-full"
                  />
                </Link>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5" role="group" aria-label="Select featured hero kit">
                    {heroProducts.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setHeroShowcaseIndex(idx)}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          heroShowcaseIndex === idx
                            ? 'bg-[#15803D] text-white'
                            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {item.team}
                      </button>
                    ))}
                  </div>

                  <Link
                    to={`/product/${currentHeroProduct.slug}`}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 whitespace-nowrap shrink-0"
                  >
                    View Kit →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: Featured Collections & Storefront Grid */}
      <section id="collections" className="max-w-[1280px] mx-auto px-4 sm:px-6 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1.5">
              <span>DEMONSTRATION CATALOG</span>
              <span aria-hidden="true">·</span>
              <span>SAMPLE STOCK INVENTORY</span>
              <span aria-hidden="true">·</span>
              <span>REPLICA APPAREL</span>
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
              Featured Kits &amp; Collections
            </h2>
          </div>

          {/* Interactive Segmented Collection Controls */}
          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-zinc-200/80"
            role="tablist"
            aria-label="Filter featured jerseys by collection"
          >
            {[
              { id: 'all', label: 'All Featured' },
              { id: 'national', label: 'National Teams' },
              { id: 'club', label: 'Club Jerseys' },
              { id: 'retro', label: 'Retro Collection' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeCollectionTab === tab.id}
                onClick={() => setActiveCollectionTab(tab.id as 'all' | JerseyCategory)}
                className={`px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeCollectionTab === tab.id
                    ? 'bg-[#111111] text-white'
                    : 'text-zinc-700 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Column Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {displayedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-zinc-200">
          <p className="text-xs text-zinc-600">
            Showing {displayedProducts.length} of {products.length} demonstration replica kits. All
            prices in Bangladeshi Taka (৳).
          </p>
          <Link
            to="/shop"
            className="px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span>Browse Full Catalog ({products.length} Kits)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* SECTION 3: Custom Name & Number Studio + Bangladesh Trust & Payment Standards */}
      <section className="bg-white border-y border-zinc-200 py-14">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Live Custom Printing Preview Module */}
            <div className="lg:col-span-6 bg-[#F7F7F5] border border-zinc-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <span>CUSTOM THERMAL PRINTING</span>
                  <span aria-hidden="true">·</span>
                  <span>+৳300 TO ৳400 PER SHIRT</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-zinc-900 mb-2">
                  Personalize Your Back Print
                </h2>
                <p className="text-xs text-zinc-600 leading-relaxed mb-5">
                  Test how your custom name and squad number look on our Bangladesh Bengal Green
                  replica jersey. Every product page includes live back-view customization before
                  you add to bag.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  <div>
                    <label
                      htmlFor="home-studio-name"
                      className="block text-xs font-semibold text-zinc-800 mb-1"
                    >
                      Player / Supporter Name (Max 12)
                    </label>
                    <input
                      id="home-studio-name"
                      type="text"
                      maxLength={12}
                      value={studioName}
                      onChange={(e) =>
                        setStudioName(e.target.value.toUpperCase().replace(/[^A-Z.\-\s]/g, ''))
                      }
                      placeholder="HAMZA"
                      className="w-full px-3 py-2 bg-white border border-zinc-300 text-xs font-mono-num uppercase focus:outline-none focus:border-[#111111]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="home-studio-number"
                      className="block text-xs font-semibold text-zinc-800 mb-1"
                    >
                      Squad Number (0–99)
                    </label>
                    <input
                      id="home-studio-number"
                      type="text"
                      maxLength={2}
                      value={studioNumber}
                      onChange={(e) => setStudioNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="8"
                      className="w-full px-3 py-2 bg-white border border-zinc-300 text-xs font-mono-num focus:outline-none focus:border-[#111111]"
                    />
                  </div>
                </div>
              </div>

              <div className="aspect-[4/3] w-full bg-[#EFEFEC] border border-zinc-200 overflow-hidden mb-4">
                <JerseyVisualizer
                  visual={
                    products.find((p) => p.id === 'bd-home-2026')?.visual || products[0].visual
                  }
                  team="Bangladesh"
                  editionTier="Fan Replica"
                  view="back"
                  customName={studioName}
                  customNumber={studioNumber}
                  className="w-full h-full"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-zinc-600">
                  Previewing: <strong>Bangladesh Home Replica</strong> ({studioName || 'NO NAME'} #
                  {studioNumber || '—'})
                </span>
                <Link
                  to="/product/bangladesh-national-green-home-replica"
                  className="px-4 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                >
                  Customize &amp; Order →
                </Link>
              </div>
            </div>

            {/* Why Shop With Jersey Valley & Bangladesh Operations */}
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <span>TRANSPARENT RETAIL STANDARDS</span>
                  <span aria-hidden="true">·</span>
                  <span>BUILT FOR BANGLADESH</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-zinc-900 mb-3">
                  Why Supporters Choose Jersey Valley
                </h2>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  We operate with straightforward policies: honest replica grading, transparent BDT
                  pricing, size-specific inventory verification, and reliable nationwide Cash on
                  Delivery.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-[#F7F7F5] border border-zinc-200 space-y-2">
                  <Shield className="w-5 h-5 text-[#15803D]" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Honest Replica Positioning
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Every jersey is clearly identified as a Fan Replica, Player-Fit Replica, or
                    Heritage Retro Replica. We never misrepresent replica apparel as officially
                    licensed merchandise.
                  </p>
                </div>

                <div className="p-5 bg-[#F7F7F5] border border-zinc-200 space-y-2">
                  <Truck className="w-5 h-5 text-[#15803D]" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    All 8 Divisions Covered
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Structured delivery across Dhaka, Chattogram, Sylhet, Rajshahi, Khulna,
                    Barishal, Rangpur, and Mymensingh with clear Inside/Outside Dhaka charges.
                  </p>
                </div>

                <div className="p-5 bg-[#F7F7F5] border border-zinc-200 space-y-2">
                  <CheckCircle2 className="w-5 h-5 text-[#15803D]" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Real COD Order Workflow
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Cash on Delivery orders track order confirmation, dispatch, and payment status
                    separately. Online bKash/Nagad gateways require live merchant verification.
                  </p>
                </div>

                <div className="p-5 bg-[#F7F7F5] border border-zinc-200 space-y-2">
                  <Sparkles className="w-5 h-5 text-[#15803D]" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Verified Size-Specific Stock
                  </h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Each size variant (S to XXL) maintains independent stock counts verified on our
                    backend before order placement to prevent overselling.
                  </p>
                </div>
              </div>

              <div className="p-5 bg-[#111111] text-white flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <PhoneCall className="w-5 h-5 text-[#15803D] shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">
                      Need sizing advice or bulk team kit printing?
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Use coupon <span className="font-mono-num text-white">VALLEY10</span> for 10%
                      off orders {formatBdt(1500)}+ or track an existing order online.
                    </p>
                  </div>
                </div>
                <Link
                  to="/track"
                  className="px-4 py-2 bg-white text-[#111111] text-xs font-semibold hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Track an Order
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
