import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Shield,
  Truck,
  Sparkles,
  CheckCircle2,
  PhoneCall,
  ShoppingBag,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { JerseyVisualizer } from '../components/JerseyVisualizer';
import { ResponsiveImage } from '../components/common/ResponsiveImage';
import {
  formatBdt,
  getEffectiveProductPriceBdt,
  type JerseyCategory,
  type JerseySize,
  type Product
} from '../lib/commerce';
import { usePageSeo } from '../lib/seo';

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface MaskedHeadingProps {
  lines: string[];
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  style?: React.CSSProperties;
  baseDelay?: number;
  triggerOnScroll?: boolean;
}

const MaskedHeading: React.FC<MaskedHeadingProps> = ({
  lines,
  as: Tag = 'h2',
  className = '',
  style,
  baseDelay = 0,
  triggerOnScroll = true
}) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <Tag className={className} style={style}>
        {lines.join(' ')}
      </Tag>
    );
  }

  return (
    <Tag className={className} style={style} aria-label={lines.join(' ')}>
      {lines.map((line, idx) => (
        <span key={idx} className="block overflow-hidden pb-1 -mb-1">
          <motion.span
            className="block will-change-transform"
            initial={{ y: '105%', opacity: 0 }}
            {...(triggerOnScroll
              ? {
                  whileInView: { y: '0%', opacity: 1 },
                  viewport: { once: true, amount: 0.25 }
                }
              : {
                  animate: { y: '0%', opacity: 1 }
                })}
            transition={{
              duration: 0.65,
              delay: baseDelay + idx * 0.09,
              ease: EASE_OUT_EXPO
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
};

export const HomePage: React.FC = () => {
  const { products, settings, addToCart, pushToast } = useStore();
  const shouldReduceMotion = useReducedMotion();

  usePageSeo({
    title: 'Jersey Valley — Football Jerseys Bangladesh | National, Club & Retro Kits',
    description:
      'Shop fan replica, player-fit, and heritage retro football jerseys in Bangladesh. Custom name & squad number printing, BDT (৳) pricing, and nationwide Cash on Delivery.',
    canonicalPath: '/'
  });

  const [activeCollectionTab, setActiveCollectionTab] = useState<'all' | JerseyCategory>('all');
  const [heroShowcaseIndex, setHeroShowcaseIndex] = useState<number>(0);
  const [heroViewMode, setHeroViewMode] = useState<'front' | 'back' | 'detail'>('front');
  const [studioName, setStudioName] = useState<string>('HAMZA');
  const [studioNumber, setStudioNumber] = useState<string>('8');

  // Pointer-driven parallax & cursor follower via DOM refs (zero React re-renders on pointermove)
  const [canHoverPointer, setCanHoverPointer] = useState<boolean>(false);
  const heroParallaxRef = useRef<HTMLDivElement | null>(null);
  const heroRafRef = useRef<number | null>(null);
  const heroRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const cursorFollowerRef = useRef<HTMLDivElement | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const [cursorBadge, setCursorBadge] = useState<{ visible: boolean; label: string }>({
    visible: false,
    label: 'EXPLORE'
  });

  // Horizontal campaign carousel state
  const [campaignIndex, setCampaignIndex] = useState<number>(0);
  const [campaignSelectedSize, setCampaignSelectedSize] = useState<JerseySize>('L');
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
    const updatePointerCapability = () => {
      setCanHoverPointer(mql.matches && !shouldReduceMotion);
    };
    const handleResize = () => {
      heroRectRef.current = null;
    };
    updatePointerCapability();
    mql.addEventListener?.('change', updatePointerCapability);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      mql.removeEventListener?.('change', updatePointerCapability);
      window.removeEventListener('resize', handleResize);
      if (heroRafRef.current !== null) {
        cancelAnimationFrame(heroRafRef.current);
      }
      if (cursorRafRef.current !== null) {
        cancelAnimationFrame(cursorRafRef.current);
      }
    };
  }, [shouldReduceMotion]);

  const activeCatalog = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  // Curated hero lineup from actual catalog
  const heroProducts = useMemo(() => {
    const preferredIds = [
      'bd-home-2026',
      'arg-home-2026',
      'rma-home-2526',
      'fcb-retro-1999',
      'bra-home-2026'
    ];
    const picked = preferredIds
      .map((id) => activeCatalog.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p));
    return picked.length > 0 ? picked : activeCatalog.slice(0, 4);
  }, [activeCatalog]);

  const currentHeroProduct = heroProducts[heroShowcaseIndex] || activeCatalog[0] || products[0];

  // Category collections backed by real catalog counts and items
  const collectionsData = useMemo(() => {
    const nationalKits = activeCatalog.filter((p) => p.category === 'national');
    const clubKits = activeCatalog.filter((p) => p.category === 'club');
    const retroKits = activeCatalog.filter((p) => p.category === 'retro');

    return [
      {
        id: 'national' as const,
        index: '01',
        title: 'National Teams',
        kicker: 'INTERNATIONAL FEDERATIONS · 2025/26',
        description:
          'From Bengal Green in Dhaka to Albiceleste stripes and Seleção gold. Breathable 165 GSM AeroMesh supporter kits built for matchday humidity.',
        href: '/shop?category=national',
        count: nationalKits.length,
        primaryKit:
          nationalKits.find((p) => p.id === 'bd-home-2026') ||
          nationalKits[0] ||
          currentHeroProduct,
        secondaryKit:
          nationalKits.find((p) => p.id === 'arg-home-2026') ||
          nationalKits[1] ||
          currentHeroProduct
      },
      {
        id: 'club' as const,
        index: '02',
        title: 'Club Jerseys',
        kicker: 'EUROPEAN & GLOBAL CLUB GIANTS',
        description:
          'Home, away, and third replica kits featuring 4-way stretch player-fit weaves and stadium fan cuts with heat-sealed or embroidered crests.',
        href: '/shop?category=club',
        count: clubKits.length,
        primaryKit:
          clubKits.find((p) => p.id === 'rma-home-2526') ||
          clubKits[0] ||
          currentHeroProduct,
        secondaryKit:
          clubKits.find((p) => p.id === 'ars-third-2526') ||
          clubKits[1] ||
          currentHeroProduct
      },
      {
        id: 'retro' as const,
        index: '03',
        title: 'Retro Jerseys',
        kicker: 'HERITAGE ARCHIVE · 1999–2007',
        description:
          'Heavyweight 190–195 GSM vintage pique knit tribute jerseys celebrating iconic European finals, fold-over polo collars, and classic 90s silhouettes.',
        href: '/shop?category=retro',
        count: retroKits.length,
        primaryKit:
          retroKits.find((p) => p.id === 'fcb-retro-1999') ||
          retroKits[0] ||
          currentHeroProduct,
        secondaryKit:
          retroKits.find((p) => p.id === 'acm-retro-2007') ||
          retroKits[1] ||
          currentHeroProduct
      }
    ];
  }, [activeCatalog, currentHeroProduct]);

  const displayedProducts = useMemo(() => {
    return activeCatalog
      .filter((p) => {
        if (activeCollectionTab === 'all') return true;
        return p.category === activeCollectionTab;
      })
      .slice(0, 6);
  }, [activeCatalog, activeCollectionTab]);

  // Curated horizontal campaign lookbook slides using actual catalog products
  const campaignSlides = useMemo(() => {
    const bdKit = activeCatalog.find((p) => p.id === 'bd-home-2026') || activeCatalog[0];
    const argKit = activeCatalog.find((p) => p.id === 'arg-home-2026') || activeCatalog[0];
    const rmaKit = activeCatalog.find((p) => p.id === 'rma-home-2526') || activeCatalog[0];
    const fcbKit = activeCatalog.find((p) => p.id === 'fcb-retro-1999') || activeCatalog[0];

    return [
      {
        code: '01',
        chapter: 'CHAPTER 01 · DHAKA MATCHDAY',
        headline: 'BENGAL GREEN PRIDE.',
        subheadline:
          'Engineered for supporters from Dhanmondi to Chattogram. Sublimated geometric weave with crimson collar trim and custom squad thermal printing.',
        specCallout: '160 GSM DRYKNIT INTERLOCK · REGULAR STADIUM FIT',
        product: bdKit
      },
      {
        code: '02',
        chapter: 'CHAPTER 02 · WORLD CHAMPIONS',
        headline: 'ALBICELESTE HERITAGE.',
        subheadline:
          'Classic sky-blue and white stripes paired with gold trim accents and breathable micro-eyelet ventilation panels for 90-minute comfort.',
        specCallout: '165 GSM AEROMESH POLYESTER · WOVEN SUPPORTER CREST',
        product: argKit
      },
      {
        code: '03',
        chapter: 'CHAPTER 03 · PLAYER-FIT PRECISION',
        headline: 'ENGINEERED FOR SPEED.',
        subheadline:
          'Slim athletic cut crafted from 175 GSM 4-way stretch honeycomb fabric with heat-applied TPU crest for zero friction on five-a-side turf.',
        specCallout: '175 GSM 4-WAY STRETCH · ATHLETIC CONTOUR',
        product: rmaKit
      },
      {
        code: '04',
        chapter: 'CHAPTER 04 · THE RETRO VAULT',
        headline: '1999 CENTENARY CLASS.',
        subheadline:
          'Split garnet and midnight navy halves with a structured fold-over polo collar. Heavyweight 195 GSM pique knit built for timeless streetwear styling.',
        specCallout: '195 GSM VINTAGE PIQUE KNIT · 90S BOXY FIT',
        product: fcbKit
      }
    ].filter((s) => Boolean(s.product));
  }, [activeCatalog]);

  const activeCampaignSlide = campaignSlides[campaignIndex] || campaignSlides[0];

  const campaignAvailableSizes = useMemo(() => {
    if (!activeCampaignSlide?.product) return [] as JerseySize[];
    return activeCampaignSlide.product.variants
      .filter((v) => v.isActive && v.stock > 0)
      .map((v) => v.size);
  }, [activeCampaignSlide]);

  useEffect(() => {
    if (campaignAvailableSizes.length > 0 && !campaignAvailableSizes.includes(campaignSelectedSize)) {
      setCampaignSelectedSize(
        campaignAvailableSizes.includes('L')
          ? 'L'
          : campaignAvailableSizes.includes('M')
            ? 'M'
            : campaignAvailableSizes[0]
      );
    }
  }, [campaignAvailableSizes, campaignSelectedSize]);

  const studioProduct = useMemo(
    () =>
      activeCatalog.find((p) => p.id === 'bd-home-2026') ||
      activeCatalog[0] ||
      products[0],
    [activeCatalog, products]
  );

  const retroSpotlightProducts = useMemo(
    () => activeCatalog.filter((p) => p.category === 'retro').slice(0, 2),
    [activeCatalog]
  );
  const nationalSpotlightProducts = useMemo(
    () => activeCatalog.filter((p) => p.category === 'national').slice(0, 2),
    [activeCatalog]
  );

  const handleHeroPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canHoverPointer || shouldReduceMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    heroRectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const handleHeroPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canHoverPointer || shouldReduceMotion || !heroParallaxRef.current) return;
    if (!heroRectRef.current) {
      const r = e.currentTarget.getBoundingClientRect();
      heroRectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    const rect = heroRectRef.current;
    if (!rect.width || !rect.height) return;
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    const normY = (e.clientY - rect.top) / rect.height - 0.5;
    const offsetX = Math.round(normX * 16);
    const offsetY = Math.round(normY * 12);

    if (heroRafRef.current !== null) {
      cancelAnimationFrame(heroRafRef.current);
    }
    heroRafRef.current = requestAnimationFrame(() => {
      if (heroParallaxRef.current) {
        heroParallaxRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(1.02)`;
      }
    });
  };

  const handleHeroPointerLeave = () => {
    heroRectRef.current = null;
    if (heroRafRef.current !== null) {
      cancelAnimationFrame(heroRafRef.current);
      heroRafRef.current = null;
    }
    if (heroParallaxRef.current) {
      heroParallaxRef.current.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
    }
  };

  const handleScopedCursorMove = (
    e: React.MouseEvent<HTMLElement>,
    label: string
  ) => {
    if (!canHoverPointer || shouldReduceMotion) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (cursorRafRef.current !== null) {
      cancelAnimationFrame(cursorRafRef.current);
    }
    cursorRafRef.current = requestAnimationFrame(() => {
      if (cursorFollowerRef.current) {
        cursorFollowerRef.current.style.transform = `translate3d(${clientX + 16}px, ${clientY + 16}px, 0)`;
      }
    });
    setCursorBadge((prev) =>
      prev.visible && prev.label === label ? prev : { visible: true, label }
    );
  };

  const handleScopedCursorLeave = () => {
    if (cursorRafRef.current !== null) {
      cancelAnimationFrame(cursorRafRef.current);
      cursorRafRef.current = null;
    }
    setCursorBadge((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const stepCampaignSlide = (direction: -1 | 1) => {
    setCampaignIndex((prev) => {
      const len = campaignSlides.length;
      if (len === 0) return 0;
      return (prev + direction + len) % len;
    });
  };

  const handleCampaignKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepCampaignSlide(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepCampaignSlide(-1);
    }
  };

  const handleCampaignQuickAdd = (product: Product, size: JerseySize) => {
    const selectedVariant = product.variants.find(
      (v) => v.size === size && v.isActive && v.stock > 0
    );
    if (!selectedVariant) {
      pushToast(`Size ${size} is currently out of stock.`, 'error');
      return;
    }
    const res = addToCart({
      product,
      size: selectedVariant.size,
      quantity: 1
    });
    if (!res.ok && res.error) {
      pushToast(res.error, 'error');
    }
  };

  return (
    <div className="relative overflow-x-hidden">
      {/* Desktop-Only Scoped Custom Cursor Follower (Zero React state re-renders on pointermove) */}
      {canHoverPointer && !shouldReduceMotion && cursorBadge.visible && (
        <div
          ref={cursorFollowerRef}
          aria-hidden="true"
          className="fixed top-0 left-0 z-50 pointer-events-none transition-transform duration-75 ease-out will-change-transform"
        >
          <span className="inline-block px-2.5 py-1 bg-[#15803D] text-white text-[10px] font-mono-num font-bold uppercase tracking-widest shadow-md border border-white/20">
            {cursorBadge.label}
          </span>
        </div>
      )}

      {/* =====================================================================
          SECTION 1: CINEMATIC ANIMATED HERO
          ===================================================================== */}
      <section
        onPointerEnter={handleHeroPointerEnter}
        onPointerMove={handleHeroPointerMove}
        onPointerLeave={handleHeroPointerLeave}
        className="relative bg-[#111111] text-white border-b border-zinc-800 overflow-hidden"
      >
        {/* Step 1: Hero background atmosphere fades in smoothly */}
        <motion.div
          aria-hidden="true"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.85, ease: EASE_OUT_EXPO }}
          className="absolute inset-0 bg-editorial-grid pointer-events-none"
        >
          <div
            className="absolute -top-36 right-1/4 w-[520px] h-[520px] rounded-full opacity-20 blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(21,128,61,0.65) 0%, rgba(17,17,17,0) 70%)'
            }}
          />
        </motion.div>

        <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Editorial Column (Asymmetric 7-Column Anchor) */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-10">
              <div className="space-y-6">
                {/* Editorial Kicker */}
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.05, ease: EASE_OUT_EXPO }}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400 tracking-wider uppercase"
                >
                  <span className="text-[#22C55E] font-semibold">2025/26 MATCHDAY DROP</span>
                  <span aria-hidden="true">·</span>
                  <span>BANGLADESH FOOTBALL APPAREL</span>
                  <span aria-hidden="true">·</span>
                  <span>FAN &amp; RETRO REPLICAS</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">BDT (৳)</span>
                </motion.div>

                {/* Step 2: Main headline reveals line by line using masked text animation */}
                <MaskedHeading
                  as="h1"
                  lines={['WEAR YOUR', 'PASSION.']}
                  triggerOnScroll={false}
                  baseDelay={0.12}
                  className="font-display font-bold uppercase tracking-tight text-white leading-[0.92]"
                  style={{ fontSize: 'clamp(2.65rem, 6.8vw, 5.6rem)' }}
                />

                {/* Step 4: Supporting text fades in after the headline */}
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.34, ease: EASE_OUT_EXPO }}
                  className="space-y-3 max-w-xl"
                >
                  <p className="font-display text-xl sm:text-2xl uppercase tracking-wide text-zinc-100">
                    Your team. Your colours. Your game.
                  </p>
                  <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                    Precision-crafted supporter and heritage retro football jerseys tailored for
                    matchdays across Bangladesh. Breathable 165–195 GSM AeroMesh &amp; vintage
                    pique fabrics with optional custom name and squad number thermal printing.
                  </p>
                </motion.div>

                {/* Step 5: CTA buttons appear with a slight stagger */}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.44, ease: EASE_OUT_EXPO }}
                  >
                    <Link
                      to="/shop"
                      className="px-7 py-4 bg-[#15803D] text-white text-xs sm:text-sm font-bold uppercase tracking-wider hover:bg-[#14532D] active:scale-[0.98] transition-all duration-150 flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      <span>SHOP JERSEYS</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </motion.div>

                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.52, ease: EASE_OUT_EXPO }}
                  >
                    <a
                      href="#featured-collections"
                      className="px-7 py-4 bg-transparent border border-zinc-600 text-white text-xs sm:text-sm font-bold uppercase tracking-wider hover:border-white hover:bg-white/5 active:scale-[0.98] transition-all duration-150 inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
                    >
                      <span>EXPLORE COLLECTION</span>
                    </a>
                  </motion.div>
                </div>
              </div>

              {/* Animated Store Highlights Strip */}
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.6, ease: EASE_OUT_EXPO }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-zinc-800/90 text-xs"
              >
                <div>
                  <span className="block font-mono-num text-base sm:text-lg font-bold text-white">
                    {formatBdt(settings.insideDhakaShippingBdt)} /{' '}
                    {formatBdt(settings.outsideDhakaShippingBdt)}
                  </span>
                  <span className="text-zinc-400">Inside / Outside Dhaka</span>
                </div>
                <div>
                  <span className="block font-mono-num text-base sm:text-lg font-bold text-white">
                    Cash on Delivery
                  </span>
                  <span className="text-zinc-400">All 8 BD Divisions</span>
                </div>
                <div>
                  <span className="block font-mono-num text-base sm:text-lg font-bold text-white">
                    165–195 GSM
                  </span>
                  <span className="text-zinc-400">AeroMesh &amp; Pique Knit</span>
                </div>
                <div>
                  <span className="block font-mono-num text-base sm:text-lg font-bold text-[#22C55E]">
                    S – XXL
                  </span>
                  <span className="text-zinc-400">Size-Verified Stock</span>
                </div>
              </motion.div>
            </div>

            {/* Step 3 & 6: Hero Jersey Stage (Scale + upward entry + pointer parallax on hover devices) */}
            {currentHeroProduct && (
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94, y: 28 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.22, ease: EASE_OUT_EXPO }}
                className="lg:col-span-5 flex flex-col justify-between bg-[#18181B] border border-zinc-800 p-5 sm:p-6 relative"
              >
                {/* Top Metadata Bar */}
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 mb-3">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-white font-semibold">{currentHeroProduct.team}</span>
                    <span aria-hidden="true">·</span>
                    <span>{currentHeroProduct.kitType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{currentHeroProduct.editionTier}</span>
                  </div>
                  <span className="font-mono-num text-sm text-[#22C55E] font-bold shrink-0">
                    {formatBdt(getEffectiveProductPriceBdt(currentHeroProduct))}
                  </span>
                </div>

                {/* Parallax Studio Jersey Frame */}
                <div className="relative aspect-[4/3] w-full bg-[#EFEFEC] overflow-hidden border border-zinc-700/60">
                  <div
                    ref={heroParallaxRef}
                    className="w-full h-full transition-transform duration-200 ease-out will-change-transform"
                  >
                    <Link
                      to={`/product/${currentHeroProduct.slug}`}
                      aria-label={`Inspect ${currentHeroProduct.name}`}
                      className="block w-full h-full focus-visible:outline-2 focus-visible:outline-[#15803D]"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={`${currentHeroProduct.id}-${heroViewMode}`}
                          initial={shouldReduceMotion ? false : { opacity: 0.2, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                          transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                          className="w-full h-full"
                        >
                          {heroViewMode === 'front' ? (
                            <ResponsiveImage
                              productId={currentHeroProduct.id}
                              alt={currentHeroProduct.name}
                              priority={true}
                              sizes="(max-width: 640px) 94vw, (max-width: 1024px) 85vw, 520px"
                              className="w-full h-full"
                              fallbackColor={currentHeroProduct.visual?.secondaryColor || '#F7F7F5'}
                            />
                          ) : (
                            <JerseyVisualizer
                              visual={currentHeroProduct.visual}
                              team={currentHeroProduct.team}
                              editionTier={currentHeroProduct.editionTier}
                              view={heroViewMode}
                              className="w-full h-full"
                            />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </Link>
                  </div>

                  {/* Floating Secondary Angle Preview (Click to toggle Front / Back) */}
                  <button
                    type="button"
                    onClick={() =>
                      setHeroViewMode((prev) => (prev === 'front' ? 'back' : 'front'))
                    }
                    aria-label="Toggle between front and custom back print view"
                    className="hidden sm:flex absolute bottom-3 right-3 w-24 h-20 bg-white/95 border border-zinc-300 p-1 flex-col justify-between shadow-md hover:border-[#111111] transition-colors"
                  >
                    <div className="w-full h-12 overflow-hidden">
                      <JerseyVisualizer
                        visual={currentHeroProduct.visual}
                        team={currentHeroProduct.team}
                        editionTier={currentHeroProduct.editionTier}
                        view={heroViewMode === 'front' ? 'back' : 'front'}
                        className="w-full h-full"
                      />
                    </div>
                    <span className="text-[9px] font-mono-num font-bold uppercase text-zinc-800 text-center w-full truncate">
                      {heroViewMode === 'front'
                        ? `Back #${currentHeroProduct.visual.defaultPreviewNumber}`
                        : 'Front View'}
                    </span>
                  </button>

                  {/* Angle Selector Switch */}
                  <div
                    className="absolute top-3 left-3 flex items-center gap-0.5 bg-[#111111]/90 p-0.5 border border-zinc-700"
                    role="group"
                    aria-label="Hero jersey angle view"
                  >
                    {(
                      [
                        { id: 'front', label: 'Front' },
                        { id: 'back', label: 'Back Print' },
                        { id: 'detail', label: 'Weave' }
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setHeroViewMode(mode.id)}
                        aria-pressed={heroViewMode === mode.id}
                        className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          heroViewMode === mode.id
                            ? 'bg-[#15803D] text-white'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kit Selector Controls + Direct PDP Action */}
                <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label="Select featured hero kit"
                  >
                    {heroProducts.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setHeroShowcaseIndex(idx)}
                        aria-pressed={heroShowcaseIndex === idx}
                        className={`px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
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
                    className="text-xs font-bold uppercase tracking-wider text-[#22C55E] hover:text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <span>Inspect Kit</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: INTERACTIVE COLLECTION SECTION (NATIONAL, CLUB, RETRO)
          ===================================================================== */}
      <section
        id="featured-collections"
        className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 border-b border-zinc-200"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider mb-2">
              <span>CURATED BY SUPPORTER CATEGORY</span>
              <span aria-hidden="true">·</span>
              <span>{activeCatalog.length} ACTIVE KITS IN CATALOG</span>
            </div>
            <MaskedHeading
              as="h2"
              lines={['CHOOSE YOUR ALLEGIANCE.']}
              className="font-display text-3xl sm:text-5xl font-bold uppercase tracking-tight text-zinc-900 leading-[0.95]"
            />
          </div>
          <p className="text-xs sm:text-sm text-zinc-600 max-w-md leading-relaxed">
            Explore our three core jersey collections. Every category features verified S–XXL stock
            and optional custom player name and number printing.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {collectionsData.map((col, idx) => (
            <motion.div
              key={col.id}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.55,
                delay: idx * 0.08,
                ease: EASE_OUT_EXPO
              }}
              onMouseMove={(e) => handleScopedCursorMove(e, `VIEW ${col.title.toUpperCase()}`)}
              onMouseLeave={handleScopedCursorLeave}
            >
              <Link
                to={col.href}
                className="group bg-white border border-zinc-200 hover:border-zinc-900 flex flex-col justify-between h-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
              >
                {/* Collection Dual-Jersey Visual Banner with Subtle Scale Reveal */}
                <div className="relative aspect-[16/11] w-full bg-[#EFEFEC] border-b border-zinc-200 overflow-hidden">
                  <motion.div
                    initial={shouldReduceMotion ? false : { scale: 1.06 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
                    className="w-full h-full grid grid-cols-12 items-center p-4 transition-transform duration-500 ease-out-expo group-hover:scale-[1.05]"
                  >
                    <div className="col-span-7 h-full">
                      {col.primaryKit && (
                        <JerseyVisualizer
                          visual={col.primaryKit.visual}
                          team={col.primaryKit.team}
                          editionTier={col.primaryKit.editionTier}
                          view="front"
                          className="w-full h-full"
                        />
                      )}
                    </div>
                    <div className="col-span-5 h-4/5 border-l border-zinc-300/80 pl-2">
                      {col.secondaryKit && (
                        <JerseyVisualizer
                          visual={col.secondaryKit.visual}
                          team={col.secondaryKit.team}
                          editionTier={col.secondaryKit.editionTier}
                          view="back"
                          className="w-full h-full"
                        />
                      )}
                    </div>
                  </motion.div>

                  {/* Top Editorial Index & Live Count */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-xs pointer-events-none">
                    <span className="font-mono-num font-bold text-zinc-900 bg-white/95 px-2.5 py-1 border border-zinc-200">
                      {col.index} · {col.title.toUpperCase()}
                    </span>
                    <span className="font-mono-num text-[11px] font-semibold text-white bg-[#111111] px-2.5 py-1">
                      {col.count} Kits
                    </span>
                  </div>
                </div>

                {/* Collection Copy & Desktop Hover CTA / Mobile Touch CTA */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
                  <div>
                    <span className="text-[11px] font-mono-num uppercase tracking-wider text-zinc-500 block mb-1">
                      {col.kicker}
                    </span>
                    <h3 className="font-display text-2xl sm:text-3xl font-bold uppercase text-zinc-900 mb-2 group-hover:text-[#15803D] transition-colors">
                      {col.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                      {col.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-900 group-hover:text-[#15803D] transition-colors">
                    <span>Explore {col.title}</span>
                    <span className="inline-flex items-center gap-1 transition-transform duration-300 ease-out-expo group-hover:translate-x-1">
                      <span>Shop Now</span>
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* =====================================================================
          SECTION 3: BEST-SELLING & FEATURED JERSEYS (ACTUAL CATALOG DATA)
          ===================================================================== */}
      <section id="collections" className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <span>MATCHDAY ROTATION</span>
              <span aria-hidden="true">·</span>
              <span>LIVE VARIANT INVENTORY</span>
              <span aria-hidden="true">·</span>
              <span>REPLICA APPAREL</span>
            </div>
            <MaskedHeading
              as="h2"
              lines={['FEATURED KITS & RELEASES']}
              className="font-display text-3xl sm:text-5xl font-bold uppercase tracking-tight text-zinc-900 leading-[0.95]"
            />
          </div>

          {/* Interactive Segmented Collection Controls */}
          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-zinc-200/80"
            role="group"
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
                aria-pressed={activeCollectionTab === tab.id}
                onClick={() => setActiveCollectionTab(tab.id as 'all' | JerseyCategory)}
                className={`px-3.5 sm:px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#15803D] ${
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

        {/* 3-Column Staggered Scroll-Triggered Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {displayedProducts.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{
                duration: 0.5,
                delay: (idx % 3) * 0.07,
                ease: EASE_OUT_EXPO
              }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-zinc-200">
          <p className="text-xs text-zinc-600">
            Showing {displayedProducts.length} of {activeCatalog.length} active replica kits. All
            prices in Bangladeshi Taka (৳).
          </p>
          <Link
            to="/shop"
            className="px-6 py-3 bg-[#111111] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span>Browse Full Catalog ({activeCatalog.length} Kits)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: HORIZONTAL FOOTBALL CAMPAIGN LOOKBOOK SECTION
          ===================================================================== */}
      {activeCampaignSlide && (
        <section
          id="campaign-lookbook"
          tabIndex={0}
          aria-label="Jersey Valley Football Campaign Lookbook Carousel"
          onKeyDown={handleCampaignKeyDown}
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (touchStartXRef.current === null) return;
            const deltaX = (e.changedTouches[0]?.clientX ?? 0) - touchStartXRef.current;
            if (Math.abs(deltaX) > 45) {
              stepCampaignSlide(deltaX < 0 ? 1 : -1);
            }
            touchStartXRef.current = null;
          }}
          onMouseMove={(e) => handleScopedCursorMove(e, 'CAMPAIGN · CLICK OR ARROW KEYS')}
          onMouseLeave={handleScopedCursorLeave}
          className="bg-[#111111] text-white border-y border-zinc-800 py-16 lg:py-20 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#15803D]"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 space-y-10">
            {/* Campaign Top Header & Accessible Carousel Controls */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-zinc-800 pb-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-[#22C55E] font-mono-num uppercase tracking-wider mb-2">
                  <Layers className="w-3.5 h-3.5" />
                  <span>EDITORIAL CAMPAIGN · {activeCampaignSlide.chapter}</span>
                </div>
                <MaskedHeading
                  as="h2"
                  lines={['BUILT FOR THE 90TH MINUTE.']}
                  className="font-display text-3xl sm:text-5xl font-bold uppercase tracking-tight text-white leading-[0.95]"
                />
              </div>

              {/* Visible Keyboard & Touch Navigation Controls */}
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Select campaign chapter"
                >
                  {campaignSlides.map((slide, idx) => (
                    <button
                      key={slide.code}
                      type="button"
                      aria-pressed={campaignIndex === idx}
                      onClick={() => setCampaignIndex(idx)}
                      className={`px-3 py-2 text-xs font-mono-num font-bold transition-colors whitespace-nowrap ${
                        campaignIndex === idx
                          ? 'bg-[#15803D] text-white'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      {slide.code} · {slide.product.team}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => stepCampaignSlide(-1)}
                    aria-label="Previous campaign slide"
                    className="w-10 h-10 bg-zinc-900 border border-zinc-700 text-white hover:bg-[#15803D] hover:border-[#15803D] transition-colors flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#22C55E]"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepCampaignSlide(1)}
                    aria-label="Next campaign slide"
                    className="w-10 h-10 bg-zinc-900 border border-zinc-700 text-white hover:bg-[#15803D] hover:border-[#15803D] transition-colors flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#22C55E]"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active Horizontal Campaign Slide */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeCampaignSlide.code}
                initial={shouldReduceMotion ? false : { opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, x: -32 }}
                transition={{ duration: 0.42, ease: EASE_OUT_EXPO }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
              >
                {/* Left Campaign Editorial Narrative (5 Columns) */}
                <div className="lg:col-span-5 bg-[#18181B] border border-zinc-800 p-6 sm:p-8 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-block text-xs font-mono-num uppercase text-zinc-400">
                        {activeCampaignSlide.specCallout}
                      </span>
                      <span className="text-[10px] font-mono-num uppercase tracking-wider px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300">
                        Illustrative Studio Render · Real Catalog Stock
                      </span>
                    </div>
                    <h3
                      className="font-display font-bold uppercase text-white leading-[0.94]"
                      style={{ fontSize: 'clamp(2.2rem, 4vw, 3.4rem)' }}
                    >
                      {activeCampaignSlide.headline}
                    </h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {activeCampaignSlide.subheadline}
                    </p>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-zinc-800">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-xs text-zinc-400 block">
                          Featured Purchasable Kit ({activeCampaignSlide.product.editionTier})
                        </span>
                        <strong className="text-base text-white">
                          {activeCampaignSlide.product.name}
                        </strong>
                      </div>
                      <span className="font-mono-num text-xl font-bold text-[#22C55E] shrink-0">
                        {formatBdt(getEffectiveProductPriceBdt(activeCampaignSlide.product))}
                      </span>
                    </div>

                    {/* Real Variant Stock & Size Selection on Campaign Card */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>Select Size for Quick Add:</span>
                        <span className="font-mono-num text-zinc-300">
                          {activeCampaignSlide.product.variants.reduce(
                            (acc, v) => acc + (v.isActive ? v.stock : 0),
                            0
                          )}{' '}
                          total units in stock
                        </span>
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-1.5"
                        role="group"
                        aria-label={`Select campaign jersey size for ${activeCampaignSlide.product.name}`}
                      >
                        {activeCampaignSlide.product.variants
                          .filter((v) => v.isActive)
                          .map((v) => {
                            const inStock = v.stock > 0;
                            const isSelected = campaignSelectedSize === v.size && inStock;
                            return (
                              <button
                                key={v.size}
                                type="button"
                                disabled={!inStock}
                                onClick={() => setCampaignSelectedSize(v.size)}
                                aria-pressed={isSelected}
                                aria-label={`Campaign size ${v.size}${inStock ? ` (${v.stock} left)` : ' (Out of stock)'}`}
                                className={`px-2.5 py-1 text-xs font-mono-num font-semibold border transition-colors ${
                                  !inStock
                                    ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 line-through cursor-not-allowed'
                                    : isSelected
                                      ? 'border-[#22C55E] bg-[#15803D] text-white'
                                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-white'
                                }`}
                              >
                                {v.size} ({v.stock})
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Link
                        to={`/product/${activeCampaignSlide.product.slug}`}
                        className="px-5 py-3 bg-[#15803D] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#14532D] transition-colors inline-flex items-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <span>Shop This Kit</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        disabled={campaignAvailableSizes.length === 0}
                        onClick={() =>
                          handleCampaignQuickAdd(activeCampaignSlide.product, campaignSelectedSize)
                        }
                        className="px-5 py-3 bg-white text-[#111111] text-xs font-bold uppercase tracking-wider hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#22C55E]"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>
                          {campaignAvailableSizes.length > 0
                            ? `Quick Add · Size ${campaignSelectedSize}`
                            : 'Out of Stock'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Wide 3-Panel Horizontal Jersey Triptych Reveal (7 Columns) */}
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                  {(
                    [
                      {
                        view: 'front',
                        caption: '01 · FRONT SILHOUETTE',
                        title: 'Stadium Cut & Crest',
                        detail: activeCampaignSlide.product.fitNote
                      },
                      {
                        view: 'back',
                        caption: `02 · BACK #${activeCampaignSlide.product.visual.defaultPreviewNumber}`,
                        title: `Custom #${activeCampaignSlide.product.visual.defaultPreviewNumber} ${activeCampaignSlide.product.visual.defaultPreviewName}`,
                        detail: `Optional +${formatBdt(activeCampaignSlide.product.customPrintPriceBdt)} heat-pressed matte PU name & squad number`
                      },
                      {
                        view: 'detail',
                        caption: '03 · MACRO WEAVE',
                        title: activeCampaignSlide.product.fabricSpec,
                        detail: 'Breathable micro-eyelet ventilation for humid matchdays'
                      }
                    ] as const
                  ).map((panel, pIdx) => (
                    <motion.div
                      key={panel.view}
                      initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.45,
                        delay: pIdx * 0.08,
                        ease: EASE_OUT_EXPO
                      }}
                      className="bg-[#18181B] border border-zinc-800 flex flex-col justify-between overflow-hidden group"
                    >
                      <Link
                        to={`/product/${activeCampaignSlide.product.slug}`}
                        className="flex-1 flex items-center justify-center min-h-[220px] w-full bg-[#EFEFEC] overflow-hidden p-2"
                      >
                        {panel.view === 'front' ? (
                          <ResponsiveImage
                            productId={activeCampaignSlide.product.id}
                            alt={activeCampaignSlide.product.name}
                            sizes="(max-width: 640px) 100vw, 33vw"
                            className="w-full h-full transition-transform duration-500 ease-out-expo group-hover:scale-[1.06]"
                            fallbackColor={activeCampaignSlide.product.visual?.secondaryColor || '#F7F7F5'}
                          />
                        ) : (
                          <JerseyVisualizer
                            visual={activeCampaignSlide.product.visual}
                            team={activeCampaignSlide.product.team}
                            editionTier={activeCampaignSlide.product.editionTier}
                            view={panel.view}
                            className="w-full h-full transition-transform duration-500 ease-out-expo group-hover:scale-[1.06]"
                          />
                        )}
                      </Link>
                      <div className="p-3.5 border-t border-zinc-800 bg-[#141417] space-y-1">
                        <div className="text-xs font-bold text-white uppercase tracking-wide">
                          {panel.title}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug">
                          {panel.detail}
                        </p>
                      </div>
                      <div className="px-3.5 py-2.5 border-t border-zinc-800 flex items-center justify-between text-[11px] font-mono-num text-zinc-300">
                        <span>{panel.caption}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-[#22C55E] transition-colors" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 5: RETRO VAULT & NATIONAL TEAM SPOTLIGHT + CUSTOM BACK STUDIO
          ===================================================================== */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 border-b border-zinc-200 space-y-14">
        {/* Retro & National Team Split Spotlight */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left: Heritage Retro Vault Spotlight */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
            className="lg:col-span-6 bg-white border border-zinc-200 p-6 sm:p-8 flex flex-col justify-between space-y-6"
          >
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider mb-2">
                <span>HERITAGE RETRO COLLECTION</span>
                <span aria-hidden="true">·</span>
                <span>190–195 GSM HEAVY PIQUE</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase text-zinc-900 mb-2">
                The Retro Vault (1999–2007)
              </h2>
              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                Structured fold-over polo collars, vintage embroidered crests, and classic 90s/00s
                club silhouettes. Built for collectors and match-night watchers across Bangladesh.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {retroSpotlightProducts.map((item) => (
                <Link
                  key={item.id}
                  to={`/product/${item.slug}`}
                  className="group bg-[#F7F7F5] border border-zinc-200 hover:border-zinc-900 p-3 transition-colors"
                >
                  <div className="aspect-[4/3] w-full bg-[#EFEFEC] overflow-hidden mb-3">
                    <JerseyVisualizer
                      visual={item.visual}
                      team={item.team}
                      editionTier={item.editionTier}
                      view="front"
                      className="w-full h-full transition-transform duration-500 ease-out-expo group-hover:scale-[1.05]"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <strong className="text-zinc-900 truncate">{item.team} {item.season}</strong>
                    <span className="font-mono-num font-bold text-[#15803D]">
                      {formatBdt(getEffectiveProductPriceBdt(item))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500 font-mono-num">
                    <span>
                      Sizes:{' '}
                      {item.variants
                        .filter((v) => v.isActive && v.stock > 0)
                        .map((v) => v.size)
                        .join(', ') || 'Sold Out'}
                    </span>
                    <span>
                      {item.variants.reduce((acc, v) => acc + (v.isActive ? v.stock : 0), 0)} in stock
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-zinc-100">
              <span className="text-xs text-zinc-500">
                Unofficial heritage tribute replicas · Live size-verified stock
              </span>
              <Link
                to="/shop?category=retro"
                className="text-xs font-bold uppercase tracking-wider text-[#15803D] hover:underline inline-flex items-center gap-1"
              >
                <span>Explore Retro Vault</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>

          {/* Right: National Teams Spotlight */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
            className="lg:col-span-6 bg-white border border-zinc-200 p-6 sm:p-8 flex flex-col justify-between space-y-6"
          >
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider mb-2">
                <span>INTERNATIONAL FEDERATIONS</span>
                <span aria-hidden="true">·</span>
                <span>2026 TOURNAMENT EDITION</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase text-zinc-900 mb-2">
                National Team Matchday Kits
              </h2>
              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                Support Bangladesh, Argentina, Brazil, Germany, France, and Spain with lightweight
                moisture-wicking fan replicas engineered for warm weather.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nationalSpotlightProducts.map((item) => (
                <Link
                  key={item.id}
                  to={`/product/${item.slug}`}
                  className="group bg-[#F7F7F5] border border-zinc-200 hover:border-zinc-900 p-3 transition-colors"
                >
                  <div className="aspect-[4/3] w-full bg-[#EFEFEC] overflow-hidden mb-3">
                    <JerseyVisualizer
                      visual={item.visual}
                      team={item.team}
                      editionTier={item.editionTier}
                      view="front"
                      className="w-full h-full transition-transform duration-500 ease-out-expo group-hover:scale-[1.05]"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <strong className="text-zinc-900 truncate">{item.team} {item.kitType}</strong>
                    <span className="font-mono-num font-bold text-[#15803D]">
                      {formatBdt(getEffectiveProductPriceBdt(item))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500 font-mono-num">
                    <span>
                      Sizes:{' '}
                      {item.variants
                        .filter((v) => v.isActive && v.stock > 0)
                        .map((v) => v.size)
                        .join(', ') || 'Sold Out'}
                    </span>
                    <span>
                      {item.variants.reduce((acc, v) => acc + (v.isActive ? v.stock : 0), 0)} in stock
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-zinc-100">
              <span className="text-xs text-zinc-500">
                Available in sizes S, M, L, XL &amp; XXL
              </span>
              <Link
                to="/shop?category=national"
                className="text-xs font-bold uppercase tracking-wider text-[#15803D] hover:underline inline-flex items-center gap-1"
              >
                <span>Shop National Teams</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 6: CUSTOM PRINT STUDIO & BANGLADESH TRUST STANDARDS
          ===================================================================== */}
      <section className="bg-white border-b border-zinc-200 py-16">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Live Custom Printing Preview Module */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
              className="lg:col-span-6 bg-[#F7F7F5] border border-zinc-200 p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <span>CUSTOM THERMAL PRINTING</span>
                  <span aria-hidden="true">·</span>
                  <span>+{formatBdt(studioProduct.customPrintPriceBdt)} ON {studioProduct.team.toUpperCase()} KIT</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase text-zinc-900 mb-2">
                  Personalize Your Back Print
                </h2>
                <p className="text-xs text-zinc-600 leading-relaxed mb-5">
                  Test how your custom name and squad number look on our {studioProduct.name}.
                  Every product page includes live back-view customization before you add to bag.
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
                  visual={studioProduct.visual}
                  team={studioProduct.team}
                  editionTier={studioProduct.editionTier}
                  view="back"
                  customName={studioName}
                  customNumber={studioNumber}
                  className="w-full h-full"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs text-zinc-600">
                  Previewing: <strong>{studioProduct.name}</strong> ({studioName || 'NO NAME'} #
                  {studioNumber || '—'})
                </span>
                <Link
                  to={`/product/${studioProduct.slug}?name=${encodeURIComponent(studioName)}&number=${encodeURIComponent(studioNumber)}`}
                  className="px-4 py-2 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                >
                  Customize &amp; Order →
                </Link>
              </div>
            </motion.div>

            {/* Why Shop With Jersey Valley & Bangladesh Operations */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE_OUT_EXPO }}
              className="lg:col-span-6 flex flex-col justify-between space-y-6"
            >
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
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

