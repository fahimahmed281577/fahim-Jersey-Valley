import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';

export const WishlistPage: React.FC = () => {
  const { products, wishlistIds } = useStore();
  const savedProducts = products.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10">
      <div className="border-b border-zinc-200 pb-6 mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span>SAVED JERSEYS</span>
            <span aria-hidden="true">·</span>
            <span>CUSTOMER WISHLIST</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight text-zinc-900">
            Your Saved Kits ({savedProducts.length})
          </h1>
        </div>
        <Link
          to="/shop"
          className="text-xs font-semibold text-[#15803D] hover:underline whitespace-nowrap"
        >
          Browse Catalog →
        </Link>
      </div>

      {savedProducts.length === 0 ? (
        <div className="bg-white border border-zinc-200 p-12 text-center space-y-4">
          <Heart className="w-10 h-10 text-zinc-300 mx-auto" />
          <h2 className="text-base font-semibold text-zinc-900">No jerseys saved yet</h2>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Click the heart icon on any National Team, Club, or Retro jersey to save it here for
            quick size and customization comparison.
          </p>
          <Link
            to="/shop"
            className="inline-block px-6 py-2.5 bg-[#111111] text-white text-xs font-semibold hover:bg-[#15803D] transition-colors"
          >
            Explore Football Jerseys
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {savedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};
