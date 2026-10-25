import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, ArrowUpRight, Check } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  formatBdt,
  getEffectiveProductPriceBdt,
  type Product,
  type JerseySize
} from '../lib/commerce';
import { JerseyVisualizer } from './JerseyVisualizer';
import { useStore } from '../context/StoreContext';

interface ProductCardProps {
  product: Product;
}

type CardViewMode = 'front' | 'back' | 'detail';

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { toggleWishlist, isInWishlist, addToCart, setCartDrawerOpen, pushToast } = useStore();
  const shouldReduceMotion = useReducedMotion();
  const saved = isInWishlist(product.id);

  const availableVariants = product.variants.filter((v) => v.isActive && v.stock > 0);
  const availableSizes = availableVariants.map((v) => v.size);

  const [selectedSize, setSelectedSize] = useState<JerseySize>(
    availableSizes.includes('L')
      ? 'L'
      : availableSizes.includes('M')
        ? 'M'
        : availableSizes[0] || 'M'
  );
  const [activeView, setActiveView] = useState<CardViewMode>('front');
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [justAdded, setJustAdded] = useState<boolean>(false);

  const totalStock = product.variants.reduce(
    (acc, v) => acc + (v.isActive ? v.stock : 0),
    0
  );

  const effectivePriceBdt = getEffectiveProductPriceBdt(product);
  const hasSalePrice = effectivePriceBdt < product.priceBdt;
  const savingsBdt = hasSalePrice ? product.priceBdt - effectivePriceBdt : 0;

  const validImageUrls = Array.isArray(product.imageUrls)
    ? product.imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
    : [];
  const hasMultipleUploadedImages = validImageUrls.length > 1;
  const currentUploadedImageUrl =
    validImageUrls[activeImageIndex] || validImageUrls[0] || null;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (totalStock <= 0 || availableSizes.length === 0) return;

    const targetSize = availableSizes.includes(selectedSize)
      ? selectedSize
      : availableSizes[0];

    const result = addToCart({
      product,
      size: targetSize,
      quantity: 1
    });

    if (result.ok) {
      setJustAdded(true);
      pushToast(`Added ${product.team} (${targetSize}) to bag`, 'success');
      setTimeout(() => setJustAdded(false), 1600);
    } else if (result.error) {
      pushToast(result.error, 'error');
    }
  };

  return (
    <article
      className="group bg-white border border-zinc-200 hover:border-zinc-900 flex flex-col justify-between transition-[transform,box-shadow,border-color] duration-300 ease-out-expo hover:-translate-y-1 hover:shadow-[0_18px_36px_-14px_rgba(17,17,17,0.14)]"
      onMouseEnter={() => {
        if (!shouldReduceMotion && hasMultipleUploadedImages) {
          setActiveImageIndex(1);
        }
      }}
      onMouseLeave={() => {
        if (hasMultipleUploadedImages) {
          setActiveImageIndex(0);
        }
      }}
    >
      <div>
        {/* Studio Jersey Image Frame */}
        <div className="relative aspect-[4/3] w-full bg-[#EFEFEC] border-b border-zinc-200 overflow-hidden">
          <Link
            to={`/product/${product.slug}`}
            className="block w-full h-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#15803D]"
            aria-label={`View ${product.name}`}
          >
            <div className="w-full h-full transition-transform duration-500 ease-out-expo group-hover:scale-[1.05]">
              <AnimatePresence mode="wait" initial={false}>
                {currentUploadedImageUrl && activeView === 'front' ? (
                  <motion.img
                    key={`img-${currentUploadedImageUrl}`}
                    src={currentUploadedImageUrl}
                    alt={product.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    initial={shouldReduceMotion ? false : { opacity: 0.25, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <motion.div
                    key={`viz-${activeView}`}
                    initial={shouldReduceMotion ? false : { opacity: 0.3, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full h-full"
                  >
                    <JerseyVisualizer
                      visual={product.visual}
                      team={product.team}
                      editionTier={product.editionTier}
                      view={activeView}
                      className="w-full h-full"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Link>

          {/* Top-Left Status / Sale Kicker */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 pointer-events-none">
            {totalStock <= 0 ? (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white bg-zinc-900 px-2.5 py-1">
                Sold Out
              </span>
            ) : hasSalePrice ? (
              <span className="text-[11px] font-bold uppercase tracking-wider text-white bg-[#15803D] px-2.5 py-1 shadow-xs transition-transform duration-300 group-hover:scale-[1.03]">
                Sale · Save {formatBdt(savingsBdt)}
              </span>
            ) : (
              <span className="text-[11px] font-medium tracking-wide text-zinc-800 bg-white/95 backdrop-blur-xs px-2.5 py-1 border border-zinc-200/80">
                {product.editionTier}
              </span>
            )}
          </div>

          {/* Functional Wishlist Button */}
          <button
            type="button"
            onClick={() => toggleWishlist(product)}
            aria-label={
              saved
                ? `Remove ${product.name} from wishlist`
                : `Save ${product.name} to wishlist`
            }
            className="absolute top-2.5 right-2.5 w-9 h-9 flex items-center justify-center bg-white/95 text-zinc-800 hover:bg-[#111111] hover:text-white active:scale-95 transition-all duration-150 border border-zinc-200/80 focus-visible:outline-2 focus-visible:outline-[#15803D]"
          >
            <Heart
              className={`w-4 h-4 transition-transform duration-150 ${
                saved ? 'fill-[#15803D] text-[#15803D] scale-110' : ''
              }`}
            />
          </button>

          {/* Bottom-Left Interactive Angle Switcher (Front / Back / Fabric Weave) */}
          <div
            className="absolute bottom-2.5 left-2.5 flex items-center gap-0.5 bg-white/95 backdrop-blur-xs border border-zinc-300 p-0.5"
            role="group"
            aria-label={`Switch studio angle for ${product.team}`}
          >
            {(
              [
                { id: 'front', label: 'Front' },
                { id: 'back', label: `Back #${product.visual.defaultPreviewNumber}` },
                { id: 'detail', label: 'Weave' }
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveView(mode.id);
                }}
                aria-pressed={activeView === mode.id}
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  activeView === mode.id
                    ? 'bg-[#111111] text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clean Unboxed Metadata, Title & Pricing */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 mb-1.5">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-zinc-700">{product.team}</span>
              <span aria-hidden="true">·</span>
              <span>{product.kitType}</span>
              <span aria-hidden="true">·</span>
              <span>{product.season}</span>
            </div>
            <span className="font-mono-num text-[11px] text-zinc-400 shrink-0">
              {totalStock > 0 ? `${totalStock} in stock` : '0 left'}
            </span>
          </div>

          <h3 className="text-base font-semibold text-zinc-900 leading-snug mb-3 group-hover:text-[#15803D] transition-colors">
            <Link
              to={`/product/${product.slug}`}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
            >
              {product.name}
            </Link>
          </h3>

          <div className="flex items-end justify-between gap-2 pt-3 border-t border-zinc-100">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold text-zinc-900 font-mono-num">
                  {formatBdt(effectivePriceBdt)}
                </span>
                {hasSalePrice && (
                  <span className="text-xs text-zinc-400 line-through font-mono-num">
                    {formatBdt(product.priceBdt)}
                  </span>
                )}
              </div>
              <span className="block text-[11px] text-zinc-500 mt-0.5">
                Custom name &amp; number +{formatBdt(product.customPrintPriceBdt)}
              </span>
            </div>

            {/* Interactive Size Selector Pills */}
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                Select Size
              </span>
              {availableSizes.length > 0 ? (
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label={`Select size for ${product.name}`}
                >
                  {product.variants
                    .filter((v) => v.isActive)
                    .map((v) => {
                      const inStock = v.stock > 0;
                      const isSelected = selectedSize === v.size && inStock;
                      return (
                        <button
                          key={v.size}
                          type="button"
                          disabled={!inStock}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedSize(v.size);
                          }}
                          aria-label={`Size ${v.size}${inStock ? '' : ' (Out of stock)'}`}
                          aria-pressed={isSelected}
                          className={`min-w-[26px] h-[26px] px-1 text-[11px] font-mono-num font-semibold border transition-colors ${
                            !inStock
                              ? 'border-zinc-200 text-zinc-300 line-through cursor-not-allowed bg-zinc-50'
                              : isSelected
                                ? 'border-[#111111] bg-[#111111] text-white'
                                : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900'
                          }`}
                        >
                          {v.size}
                        </button>
                      );
                    })}
                </div>
              ) : (
                <span className="text-xs font-medium text-red-700 font-mono-num">Sold Out</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer: Quick Add to Bag + Full Customize Link */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 grid grid-cols-12 gap-2">
        <button
          type="button"
          disabled={totalStock <= 0 || availableSizes.length === 0}
          onClick={handleQuickAdd}
          className={`col-span-7 py-2.5 px-3 text-xs font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.98] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D] ${
            totalStock <= 0
              ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
              : justAdded
                ? 'bg-[#15803D] text-white'
                : 'bg-[#111111] text-white hover:bg-[#15803D]'
          }`}
        >
          {justAdded ? (
            <>
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Added ({selectedSize})</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span>{totalStock > 0 ? `Add to Bag · ${selectedSize}` : 'Out of Stock'}</span>
            </>
          )}
        </button>

        <Link
          to={`/product/${product.slug}`}
          onClick={() => setCartDrawerOpen(false)}
          className="col-span-5 py-2.5 px-3 bg-[#F7F7F5] border border-zinc-300 text-zinc-900 text-xs font-semibold tracking-wide hover:border-[#111111] hover:bg-zinc-200/70 transition-colors flex items-center justify-center gap-1 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
        >
          <span>Customize</span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
        </Link>
      </div>
    </article>
  );
};

