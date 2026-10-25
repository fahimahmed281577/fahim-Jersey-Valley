import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { formatBdt, type Product } from '../lib/commerce';
import { JerseyVisualizer } from './JerseyVisualizer';
import { useStore } from '../context/StoreContext';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { toggleWishlist, isInWishlist } = useStore();
  const saved = isInWishlist(product.id);

  const availableSizes = product.variants
    .filter((v) => v.isActive && v.stock > 0)
    .map((v) => v.size);

  const totalStock = product.variants.reduce(
    (acc, v) => acc + (v.isActive ? v.stock : 0),
    0
  );

  return (
    <article className="group bg-white border border-zinc-200 flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-sm">
      <div>
        {/* Studio Jersey Image Frame (70% height emphasis) */}
        <div className="relative aspect-[4/3] w-full bg-[#EFEFEC] border-b border-zinc-200 overflow-hidden">
          <Link
            to={`/product/${product.slug}`}
            className="block w-full h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
            aria-label={`View ${product.name}`}
          >
            <JerseyVisualizer
              visual={product.visual}
              team={product.team}
              editionTier={product.editionTier}
              view="front"
              className="w-full h-full transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </Link>

          {/* Subtle single text status indicator (unboxed / minimal) */}
          <div className="absolute top-3 left-3 text-[11px] font-medium tracking-wide text-zinc-700 bg-white/90 px-2 py-0.5">
            {totalStock > 0 ? `${ product.editionTier }` : 'Out of Stock'}
          </div>

          {/* Functional Wishlist Affordance */}
          <button
            type="button"
            onClick={() => toggleWishlist(product)}
            aria-label={
              saved
                ? `Remove ${product.name} from wishlist`
                : `Save ${product.name} to wishlist`
            }
            className="absolute top-2.5 right-2.5 w-9 h-9 flex items-center justify-center bg-white/90 text-zinc-800 hover:text-[#15803D] transition-colors focus-visible:outline-2 focus-visible:outline-[#15803D]"
          >
            <Heart
              className={`w-4 h-4 ${saved ? 'fill-[#15803D] text-[#15803D]' : ''}`}
            />
          </button>
        </div>

        {/* Clean Unboxed Metadata & Title */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1.5">
            <span>{product.team}</span>
            <span aria-hidden="true">·</span>
            <span>{product.kitType}</span>
            <span aria-hidden="true">·</span>
            <span>{product.season}</span>
          </div>

          <h3 className="text-base font-semibold text-zinc-900 leading-snug mb-2">
            <Link
              to={`/product/${product.slug}`}
              className="hover:text-[#15803D] transition-colors"
            >
              {product.name}
            </Link>
          </h3>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
            <div>
              <span className="text-[15px] font-semibold text-zinc-900 font-mono-num">
                {formatBdt(product.priceBdt)}
              </span>
              <span className="block text-[11px] text-zinc-500">
                Custom print +{formatBdt(product.customPrintPriceBdt)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-zinc-500 block">Sizes in stock</span>
              <span className="text-xs font-medium text-zinc-800 font-mono-num">
                {availableSizes.length > 0 ? availableSizes.join(' / ') : 'Sold Out'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <Link
          to={`/product/${product.slug}`}
          className="w-full py-2.5 px-4 bg-[#111111] text-white text-xs font-semibold tracking-wide text-center block hover:bg-[#15803D] transition-colors whitespace-nowrap"
        >
          Select Size &amp; Customize
        </Link>
      </div>
    </article>
  );
};
