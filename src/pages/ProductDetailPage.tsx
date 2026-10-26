import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Heart,
  Ruler,
  ShoppingBag,
  Truck,
  RefreshCw,
  ShieldAlert,
  Check,
  X,
  ZoomIn
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { JerseyVisualizer } from '../components/JerseyVisualizer';
import { ResponsiveImage } from '../components/common/ResponsiveImage';
import { ProductCard } from '../components/ProductCard';
import {
  formatBdt,
  getEffectiveProductPriceBdt,
  validateCustomization,
  type JerseySize
} from '../lib/commerce';
import { usePageSeo } from '../lib/seo';

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    products,
    settings,
    addToCart,
    setCartDrawerOpen,
    toggleWishlist,
    isInWishlist
  } = useStore();

  const product = products.find((p) => p.slug === slug);

  const [activeView, setActiveView] = useState<'front' | 'back' | 'detail' | 'photo'>('front');
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number>(0);
  const [selectedSize, setSelectedSize] = useState<JerseySize | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [customName, setCustomName] = useState<string>('');
  const [customNumber, setCustomNumber] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState<boolean>(false);
  const [zoomModalOpen, setZoomModalOpen] = useState<boolean>(false);

  usePageSeo({
    title: product
      ? `${product.name} (${formatBdt(getEffectiveProductPriceBdt(product))}) — Jersey Valley`
      : 'Jersey Not Found — Jersey Valley',
    description: product
      ? `${product.name} (${product.editionTier}) in BDT (${formatBdt(getEffectiveProductPriceBdt(product))}). ${product.fabricSpec}. Optional custom name & squad number printing with Bangladesh Cash on Delivery.`
      : 'Browse fan replica, player-fit, and retro football jerseys at Jersey Valley Bangladesh.',
    canonicalPath: product ? `/product/${product.slug}` : '/shop',
    ogType: product ? 'product' : 'website',
    productJsonLd: product || null
  });

  // Reset local state when navigating between products, prefilling custom name/number if passed via query string
  useEffect(() => {
    const paramName = (searchParams.get('name') || '')
      .toUpperCase()
      .replace(/[^A-Z.\-\s]/g, '')
      .slice(0, 12);
    const paramNumber = (searchParams.get('number') || '')
      .replace(/\D/g, '')
      .slice(0, 2);

    if (paramName || paramNumber) {
      setCustomName(paramName);
      setCustomNumber(paramNumber);
      setActiveView('back');
    } else {
      setCustomName('');
      setCustomNumber('');
      setActiveView(
        product?.imageUrls && product.imageUrls.length > 0 ? 'photo' : 'front'
      );
    }
    setSelectedPhotoIdx(0);
    setSelectedSize(null);
    setQuantity(1);
    setFormError(null);
  }, [slug, product, searchParams]);

  if (!product) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-3xl font-bold uppercase">Jersey Not Found</h1>
        <p className="text-sm text-zinc-600">
          The requested jersey could not be found in the Jersey Valley catalog.
        </p>
        <Link
          to="/shop"
          className="inline-block px-6 py-3 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D]"
        >
          Return to Catalog
        </Link>
      </div>
    );
  }

  const selectedVariant = selectedSize
    ? product.variants.find((v) => v.size === selectedSize && v.isActive)
    : undefined;

  const customValidation = validateCustomization(customName, customNumber);
  const hasCustomPrint = customValidation.hasCustomPrint;
  const effectiveBasePriceBdt = getEffectiveProductPriceBdt(product, selectedVariant?.priceBdt);
  const hasSalePrice = effectiveBasePriceBdt < product.priceBdt;
  const unitPriceBdt =
    effectiveBasePriceBdt + (hasCustomPrint ? product.customPrintPriceBdt : 0);
  const lineTotalBdt = unitPriceBdt * quantity;
  const saved = isInWishlist(product.id);
  const uploadedPhotos = Array.isArray(product.imageUrls) ? product.imageUrls : [];

  const relatedProducts = products
    .filter((p) => p.id !== product.id && (p.category === product.category || p.featuredRank <= 4))
    .slice(0, 3);

  const handleCustomNameChange = (val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z.\-\s]/g, '').slice(0, 12);
    setCustomName(clean);
    if (clean || customNumber) {
      setActiveView('back');
    }
    setFormError(null);
  };

  const handleCustomNumberChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 2);
    setCustomNumber(clean);
    if (clean || customName) {
      setActiveView('back');
    }
    setFormError(null);
  };

  const handleAddToCart = (buyNow = false) => {
    setFormError(null);
    if (!selectedSize || !selectedVariant) {
      setFormError('Please select an available jersey size (S, M, L, XL, or XXL) before adding to bag.');
      return;
    }

    if (selectedVariant.stock < quantity) {
      setFormError(`Only ${selectedVariant.stock} unit(s) available in Size ${selectedSize}.`);
      return;
    }

    if (!customValidation.valid) {
      setFormError(customValidation.error || 'Invalid custom printing input.');
      return;
    }

    const res = addToCart({
      product,
      size: selectedSize,
      quantity,
      customName,
      customNumber
    });

    if (!res.ok) {
      setFormError(res.error || 'Could not add jersey to bag.');
      return;
    }

    if (buyNow) {
      navigate('/checkout');
    } else {
      setCartDrawerOpen(true);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 mb-6 flex items-center gap-2">
        <Link to="/" className="hover:text-zinc-900">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/shop?category=${product.category}`} className="hover:text-zinc-900 capitalize">
          {product.category} Jerseys
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-zinc-900 font-medium truncate">{product.name}</span>
      </nav>

      {/* Main 2-Column Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Studio Image Gallery */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-[4/3] w-full bg-[#EFEFEC] border border-zinc-200 overflow-hidden">
            {activeView === 'front' || activeView === 'photo' ? (
              <ResponsiveImage
                productId={product.id}
                alt={product.name}
                priority={true}
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="w-full h-full"
                imageClassName="object-contain sm:object-cover"
                fallbackColor={product.visual?.secondaryColor || '#F7F7F5'}
              />
            ) : (
              <JerseyVisualizer
                visual={product.visual}
                team={product.team}
                editionTier={product.editionTier}
                view={activeView}
                customName={customName}
                customNumber={customNumber}
                className="w-full h-full"
              />
            )}

            <button
              type="button"
              onClick={() => setZoomModalOpen(true)}
              aria-label="Inspect full-screen studio jersey view"
              className="absolute bottom-3 right-3 px-3 py-1.5 bg-white/90 text-zinc-900 text-xs font-medium border border-zinc-300 hover:bg-white flex items-center gap-1.5"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Enlarge View</span>
            </button>
          </div>

          {/* Gallery Angle Switcher */}
          <div className="grid grid-cols-3 gap-3" role="group" aria-label="Product gallery views">
            {[
              { id: 'front', label: '01. Front Kit View' },
              { id: 'back', label: '02. Back & Live Print' },
              { id: 'detail', label: '03. Fabric & Collar Macro' }
            ].map((viewTab) => (
              <button
                key={viewTab.id}
                type="button"
                aria-pressed={activeView === viewTab.id}
                onClick={() => setActiveView(viewTab.id as 'front' | 'back' | 'detail')}
                className={`p-2.5 border text-left transition-colors ${
                  activeView === viewTab.id
                    ? 'bg-[#111111] text-white border-[#111111]'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <span className="block text-xs font-semibold truncate">{viewTab.label}</span>
              </button>
            ))}
          </div>

          {uploadedPhotos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {uploadedPhotos.map((photoUrl, idx) => (
                <button
                  key={photoUrl}
                  type="button"
                  onClick={() => {
                    setSelectedPhotoIdx(idx);
                    setActiveView('photo');
                  }}
                  className={`w-16 h-16 border overflow-hidden ${
                    activeView === 'photo' && selectedPhotoIdx === idx
                      ? 'border-[#15803D] ring-1 ring-[#15803D]'
                      : 'border-zinc-300'
                  }`}
                >
                  <img
                    src={photoUrl}
                    alt={`${product.name} thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Technical Fabric & Replica Positioning Details */}
          <div className="bg-white border border-zinc-200 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold uppercase text-zinc-900">
              Garment Construction &amp; Replica Disclosure
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              {product.description}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-zinc-100 text-xs">
              <div>
                <span className="text-zinc-500 block">Fabric Specification</span>
                <strong className="text-zinc-900">{product.fabricSpec}</strong>
              </div>
              <div>
                <span className="text-zinc-500 block">Fit Profile</span>
                <strong className="text-zinc-900">{product.fitNote}</strong>
              </div>
              <div>
                <span className="text-zinc-500 block">Garment Care</span>
                <strong className="text-zinc-900">{product.careInstructions}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Contiguous Purchase Module */}
        <div className="lg:col-span-5 bg-white border border-zinc-200 p-6 sm:p-7 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <span>{product.team}</span>
              <span aria-hidden="true">·</span>
              <span>{product.kitType} Kit</span>
              <span aria-hidden="true">·</span>
              <span>{product.editionTier}</span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase text-zinc-900 leading-tight">
              {product.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-bold font-mono-num text-zinc-900">
                {formatBdt(unitPriceBdt)}
              </span>
              {hasSalePrice && (
                <span className="text-sm text-zinc-400 line-through font-mono-num">
                  {formatBdt(product.priceBdt + (hasCustomPrint ? product.customPrintPriceBdt : 0))}
                </span>
              )}
              {hasCustomPrint && (
                <span className="text-xs text-[#15803D] font-mono-num">
                  (Includes +{formatBdt(product.customPrintPriceBdt)} custom print)
                </span>
              )}
            </div>
          </div>

          {/* Honest Replica Notice */}
          <div className="p-3 bg-[#F7F7F5] border border-zinc-200 flex items-start gap-2.5 text-xs text-zinc-700">
            <ShieldAlert className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
            <span>
              <strong>{product.editionTier}:</strong> High-craft supporter replica apparel. Not
              officially licensed federation or club merchandise.
            </span>
          </div>

          {/* Size Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                Select Size {selectedSize ? `— ${selectedSize}` : '(Required)'}
              </label>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(true)}
                className="text-xs font-medium text-[#15803D] hover:underline flex items-center gap-1"
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>BD Size Chart</span>
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Select jersey size">
              {product.variants.map((v) => {
                const outOfStock = !v.isActive || v.stock <= 0;
                const isSelected = selectedSize === v.size;
                return (
                  <button
                    key={v.sku}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => {
                      setSelectedSize(v.size);
                      if (quantity > v.stock) {
                        setQuantity(Math.max(1, v.stock));
                      }
                      setFormError(null);
                    }}
                    aria-pressed={isSelected}
                    className={`py-2.5 px-2 border text-center transition-colors ${
                      outOfStock
                        ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed line-through'
                        : isSelected
                          ? 'bg-[#111111] text-white border-[#111111]'
                          : 'bg-white text-zinc-900 border-zinc-300 hover:border-[#111111]'
                    }`}
                  >
                    <span className="block text-xs font-bold font-mono-num">{v.size}</span>
                    <span
                      className={`block text-[10px] font-mono-num ${
                        isSelected ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                    >
                      {outOfStock ? '0 left' : `${v.stock} left`}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedVariant && (
              <p className="text-xs text-zinc-600 font-mono-num">
                SKU: {selectedVariant.sku} · Chest: {selectedVariant.chestInches} · Length:{' '}
                {selectedVariant.lengthInches} · Sample Stock: {selectedVariant.stock} units
              </p>
            )}
          </div>

          {/* Optional Custom Name & Number Printing */}
          <div className="space-y-3 pt-2 border-t border-zinc-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                Optional Custom Name &amp; Number
              </span>
              <span className="text-xs font-mono-num font-semibold text-[#15803D]">
                +{formatBdt(product.customPrintPriceBdt)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="pdp-custom-name"
                  className="block text-[11px] font-medium text-zinc-600 mb-1"
                >
                  Back Name (A–Z, max 12 chars)
                </label>
                <input
                  id="pdp-custom-name"
                  type="text"
                  maxLength={12}
                  value={customName}
                  onChange={(e) => handleCustomNameChange(e.target.value)}
                  placeholder="e.g. MESSI or RAHIM"
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num uppercase focus:outline-none focus:border-[#111111]"
                />
              </div>
              <div>
                <label
                  htmlFor="pdp-custom-number"
                  className="block text-[11px] font-medium text-zinc-600 mb-1"
                >
                  Squad Number (0–99)
                </label>
                <input
                  id="pdp-custom-number"
                  type="text"
                  maxLength={2}
                  value={customNumber}
                  onChange={(e) => handleCustomNumberChange(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full px-3 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs font-mono-num focus:outline-none focus:border-[#111111]"
                />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              Leave both fields blank for a standard unprinted jersey. Entering a name or number
              automatically updates the live back preview.
            </p>
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
            <label htmlFor="pdp-qty" className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Quantity
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-8 h-8 border border-zinc-300 text-sm font-bold hover:bg-zinc-100"
              >
                -
              </button>
              <span id="pdp-qty" className="w-8 text-center text-sm font-mono-num font-bold">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  const maxAllowed = selectedVariant ? selectedVariant.stock : 10;
                  setQuantity((q) => Math.min(maxAllowed, q + 1));
                }}
                aria-label="Increase quantity"
                className="w-8 h-8 border border-zinc-300 text-sm font-bold hover:bg-zinc-100"
              >
                +
              </button>
            </div>
          </div>

          {/* Validation Error Alert */}
          {formError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-300 text-xs text-red-800 font-medium"
            >
              {formError}
            </div>
          )}

          {/* Primary & Secondary Action Buttons */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleAddToCart(false)}
              className="w-full py-3.5 px-5 bg-[#15803D] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#14532D] transition-colors flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Add to Bag — {formatBdt(lineTotalBdt)}</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleAddToCart(true)}
                className="py-2.5 px-4 bg-[#111111] text-white text-xs font-semibold hover:bg-zinc-800 transition-colors"
              >
                Buy Now (COD / Checkout)
              </button>

              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                className="py-2.5 px-4 bg-white border border-zinc-300 text-zinc-900 text-xs font-semibold hover:border-[#111111] transition-colors flex items-center justify-center gap-1.5"
              >
                <Heart
                  className={`w-3.5 h-3.5 ${saved ? 'fill-[#15803D] text-[#15803D]' : ''}`}
                />
                <span>{saved ? 'Saved in Wishlist' : 'Save to Wishlist'}</span>
              </button>
            </div>
          </div>

          {/* Shipping & Exchange Summary */}
          <div className="pt-4 border-t border-zinc-200 space-y-2 text-xs text-zinc-600">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#15803D] shrink-0" />
              <span>
                Inside Dhaka: <strong className="font-mono-num">{formatBdt(settings.insideDhakaShippingBdt)}</strong> ·
                Outside Dhaka: <strong className="font-mono-num">{formatBdt(settings.outsideDhakaShippingBdt)}</strong> ·
                Free at <strong className="font-mono-num">{formatBdt(settings.freeShippingThresholdBdt)}</strong>+
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#15803D] shrink-0" />
              <span>Cash on Delivery (COD) available across all 64 districts of Bangladesh.</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#15803D] shrink-0" />
              <span>
                {settings.returnWindowDays}-day size exchange on unprinted jerseys with original tags.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16 pt-10 border-t border-zinc-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold uppercase text-zinc-900">
              You May Also Like
            </h2>
            <Link to="/shop" className="text-xs font-semibold text-[#15803D] hover:underline">
              View All Kits →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedProducts.map((rel) => (
              <ProductCard key={rel.id} product={rel} />
            ))}
          </div>
        </section>
      )}

      {/* Size Guide Modal */}
      {sizeGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bangladesh Jersey Size Chart"
        >
          <div className="bg-white max-w-lg w-full p-6 border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="font-display text-xl font-bold uppercase">
                Jersey Valley — Bangladesh Size Guide
              </h3>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(false)}
                aria-label="Close size chart"
                className="p-1 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-600">
              Measurements below correspond to standard Asian / Bangladesh chest and body length in
              inches. For Player-Fit editions, we recommend ordering one size up for a relaxed fit.
            </p>
            <table className="w-full text-xs border-collapse border border-zinc-200 font-mono-num">
              <thead>
                <tr className="bg-zinc-100 text-left">
                  <th className="p-2.5 border border-zinc-200">Size</th>
                  <th className="p-2.5 border border-zinc-200">Chest (Inches)</th>
                  <th className="p-2.5 border border-zinc-200">Length (Inches)</th>
                  <th className="p-2.5 border border-zinc-200">Stock Status</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.sku}>
                    <td className="p-2.5 border border-zinc-200 font-bold">{v.size}</td>
                    <td className="p-2.5 border border-zinc-200">{v.chestInches}</td>
                    <td className="p-2.5 border border-zinc-200">{v.lengthInches}</td>
                    <td className="p-2.5 border border-zinc-200">
                      {v.stock > 0 ? `${v.stock} units available` : 'Out of Stock'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enlarge Zoom Modal */}
      {zoomModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged Jersey Studio View"
        >
          <div className="bg-white max-w-3xl w-full p-5 border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700">
                {product.name} — {activeView.toUpperCase()} STUDIO VIEW
              </span>
              <button
                type="button"
                onClick={() => setZoomModalOpen(false)}
                aria-label="Close enlarged view"
                className="p-1 text-zinc-600 hover:text-zinc-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-[4/3] w-full bg-[#EFEFEC]">
              {activeView === 'photo' && uploadedPhotos[selectedPhotoIdx] ? (
                <img
                  src={uploadedPhotos[selectedPhotoIdx]}
                  alt={`${product.name} enlarged photo`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <JerseyVisualizer
                  visual={product.visual}
                  team={product.team}
                  editionTier={product.editionTier}
                  view={activeView === 'photo' ? 'front' : activeView}
                  customName={customName}
                  customNumber={customNumber}
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
