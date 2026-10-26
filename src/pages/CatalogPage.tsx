import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, RotateCcw, Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { filterAndSortProducts, formatBdt } from '../lib/commerce';
import { usePageSeo } from '../lib/seo';

export const CatalogPage: React.FC = () => {
  const { products } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get('q') || '';
  const category = searchParams.get('category') || 'all';
  const kitType = searchParams.get('kitType') || 'all';
  const size = searchParams.get('size') || 'all';
  const gender = searchParams.get('gender') || 'all';
  const maxPriceParam = Number(searchParams.get('maxPrice') || '0');
  const inStockOnly = searchParams.get('inStock') === '1';
  const sortBy =
    (searchParams.get('sort') as 'featured' | 'newest' | 'price-asc' | 'price-desc') ||
    'featured';

  const seoTitle =
    category === 'national'
      ? 'National Team Football Jerseys Bangladesh — Jersey Valley'
      : category === 'club'
        ? 'European Club Football Jerseys Bangladesh — Jersey Valley'
        : category === 'retro'
          ? 'Heritage Retro Football Jerseys (1999–2007) — Jersey Valley'
          : query
            ? `Search "${query}" — Football Jerseys Catalog | Jersey Valley`
            : 'Shop All Replica Football Jerseys in Bangladesh — Jersey Valley';

  usePageSeo({
    title: seoTitle,
    description:
      'Browse size-verified S–XXL fan replica, player-fit, and retro football jerseys in Bangladesh with BDT pricing and optional custom back printing.',
    canonicalPath: category !== 'all' ? `/shop?category=${encodeURIComponent(category)}` : '/shop'
  });

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || value === '0') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next);
  };

  const resetAllFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const filteredProducts = useMemo(() => {
    return filterAndSortProducts(products, {
      query,
      category,
      kitType,
      size,
      gender,
      maxPriceBdt: maxPriceParam > 0 ? maxPriceParam : undefined,
      inStockOnly,
      sortBy
    });
  }, [products, query, category, kitType, size, gender, maxPriceParam, inStockOnly, sortBy]);

  const activeFilterCount = [
    query !== '',
    category !== 'all',
    kitType !== 'all',
    size !== 'all',
    gender !== 'all',
    maxPriceParam > 0,
    inStockOnly
  ].filter(Boolean).length;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-6 mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span>JERSEY VALLEY CATALOG</span>
            <span aria-hidden="true">·</span>
            <span>REPLICA &amp; FAN EDITIONS</span>
            <span aria-hidden="true">·</span>
            <span>PRICES IN BDT (৳)</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            {category === 'national'
              ? 'National Team Jerseys'
              : category === 'club'
                ? 'European Club Jerseys'
                : category === 'retro'
                  ? 'Heritage Retro Vault'
                  : 'All Football Jerseys'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="catalog-sort" className="text-xs font-semibold text-zinc-700 whitespace-nowrap">
            Sort by:
          </label>
          <select
            id="catalog-sort"
            value={sortBy}
            onChange={(e) => updateParam('sort', e.target.value)}
            className="px-3 py-2 bg-white border border-zinc-300 text-xs font-medium text-zinc-900 focus:outline-none focus:border-[#111111]"
          >
            <option value="featured">Featured Priority</option>
            <option value="newest">Newest Arrivals</option>
            <option value="price-asc">Price: Low to High (৳)</option>
            <option value="price-desc">Price: High to Low (৳)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Filters */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-zinc-200 p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#15803D]" />
                <span>Filter Jerseys ({activeFilterCount})</span>
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs font-medium text-[#15803D] hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Keyword Filter */}
            <div>
              <label
                htmlFor="filter-keyword"
                className="block text-xs font-semibold text-zinc-800 mb-1.5"
              >
                Team or Keyword
              </label>
              <div className="relative">
                <input
                  id="filter-keyword"
                  type="search"
                  value={query}
                  onChange={(e) => updateParam('q', e.target.value)}
                  placeholder="e.g. Argentina, Bangladesh..."
                  className="w-full pl-3 pr-8 py-2 bg-[#F7F7F5] border border-zinc-300 text-xs focus:outline-none focus:border-[#111111]"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Collection Category */}
            <div>
              <span className="block text-xs font-semibold text-zinc-800 mb-2">
                Collection
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'all', label: 'All Kits' },
                  { value: 'national', label: 'National' },
                  { value: 'club', label: 'Club Kits' },
                  { value: 'retro', label: 'Retro Vault' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateParam('category', opt.value)}
                    className={`py-1.5 px-2.5 text-xs font-medium border text-left transition-colors whitespace-nowrap ${
                      category === opt.value
                        ? 'bg-[#111111] text-white border-[#111111]'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Jersey Type */}
            <div>
              <label
                htmlFor="filter-kit-type"
                className="block text-xs font-semibold text-zinc-800 mb-1.5"
              >
                Kit Type
              </label>
              <select
                id="filter-kit-type"
                value={kitType}
                onChange={(e) => updateParam('kitType', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-[#111111]"
              >
                <option value="all">All Kit Types (Home / Away / Third / Retro)</option>
                <option value="Home">Home Kit</option>
                <option value="Away">Away Kit</option>
                <option value="Third">Third Kit</option>
                <option value="Retro">Heritage Retro</option>
              </select>
            </div>

            {/* Size In Stock Filter */}
            <div>
              <span className="block text-xs font-semibold text-zinc-800 mb-2">
                Available Size
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {['all', 'S', 'M', 'L', 'XL', 'XXL'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => updateParam('size', sz)}
                    className={`py-1.5 px-2 text-xs font-mono-num font-semibold border transition-colors ${
                      size === sz
                        ? 'bg-[#15803D] text-white border-[#15803D]'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {sz === 'all' ? 'Any' : sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Gender / Cut */}
            <div>
              <label
                htmlFor="filter-gender"
                className="block text-xs font-semibold text-zinc-800 mb-1.5"
              >
                Fit &amp; Gender
              </label>
              <select
                id="filter-gender"
                value={gender}
                onChange={(e) => updateParam('gender', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-[#111111]"
              >
                <option value="all">All Fits (Unisex &amp; Men&apos;s)</option>
                <option value="Unisex">Unisex Stadium Fit</option>
                <option value="Men">Men&apos;s Player / Retro Cut</option>
              </select>
            </div>

            {/* Max Price Filter */}
            <div>
              <label
                htmlFor="filter-max-price"
                className="block text-xs font-semibold text-zinc-800 mb-1.5"
              >
                Maximum Base Price (BDT)
              </label>
              <select
                id="filter-max-price"
                value={String(maxPriceParam)}
                onChange={(e) => updateParam('maxPrice', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-300 text-xs font-mono-num text-zinc-900 focus:outline-none focus:border-[#111111]"
              >
                <option value="0">No Price Limit</option>
                <option value="1200">Up to {formatBdt(1200)}</option>
                <option value="1400">Up to {formatBdt(1400)}</option>
                <option value="1700">Up to {formatBdt(1700)}</option>
                <option value="2000">Up to {formatBdt(2000)}</option>
              </select>
            </div>

            {/* In-Stock Toggle */}
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-800 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => updateParam('inStock', e.target.checked ? '1' : '')}
                className="accent-[#15803D]"
              />
              <span>In-stock jerseys only</span>
            </label>
          </div>
        </aside>

        {/* Product Grid Area */}
        <div className="lg:col-span-9">
          <div className="flex items-center justify-between text-xs text-zinc-600 mb-4">
            <span>
              Showing <strong className="font-mono-num text-zinc-900">{filteredProducts.length}</strong>{' '}
              matching jersey(s)
            </span>
            <span>Replica disclosure: All kits are unofficial supporter replicas</span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-zinc-200 p-12 text-center space-y-4">
              <p className="text-base font-semibold text-zinc-900">
                No jerseys match your current filter combination
              </p>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Try clearing your search query or expanding the size and price filters to see all
                available National Team, Club, and Retro kits.
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-5 py-2.5 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
