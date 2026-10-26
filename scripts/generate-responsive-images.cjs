const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_DIR = '/tmp/extracted_assets';
const OUTPUT_DIR = path.resolve(__dirname, '../public/images/products');

// Mapping of extracted filenames to canonical jersey IDs
const ASSET_MAP = [
  {
    file: 'Football_jersey_on_invisible_man…_20261026121913.jpg',
    id: 'arg-home-2026',
    team: 'Argentina 2026 Home'
  },
  {
    file: 'Green_football_jersey_on_mannequin_20261026121913.jpg',
    id: 'bd-home-2026',
    team: 'Bangladesh Bengal Green Home'
  },
  {
    file: 'Football_jersey_on_ghost_mannequin_20261026121913.jpg',
    id: 'bra-home-2026',
    team: 'Brazil 2026 Home'
  },
  {
    file: 'Football_shirt_on_athletic_manne…_20261026121913.jpg',
    id: 'rma-home-2526',
    team: 'Real Madrid Blanco 25/26'
  },
  {
    file: 'Football_jersey_on_ghost_mannequin_20261026121913_2.jpg',
    id: 'fcb-retro-1999',
    team: 'Barcelona 1999 Centenary'
  },
  {
    file: 'Football_jersey_on_invisible_man…_20261026121913_2.jpg',
    id: 'ger-home-2026',
    team: 'Germany 2026 Classic'
  },
  {
    file: 'Football_kit_ghost_mannequin_dis…_20261026121913.jpg',
    id: 'fra-away-2026',
    team: 'France 2026 Away'
  },
  {
    file: 'Football_jersey_product_photograph_20261026121913.jpg',
    id: 'esp-home-2026',
    team: 'Spain 2026 La Roja'
  },
  {
    file: 'Football_jersey_on_mannequin_dis…_20261026121913.jpg',
    id: 'acm-retro-2007',
    team: 'AC Milan 2007 Athens Retro'
  },
  {
    file: 'Arsenal_third_kit_jersey_displayed_20261026121913.jpg',
    id: 'ars-third-2526',
    team: 'Arsenal 25/26 Third Forest Green'
  }
];

const TARGET_WIDTHS = [400, 800, 1024];

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Starting responsive image generation for ${ASSET_MAP.length} jerseys...`);

  for (const item of ASSET_MAP) {
    const srcPath = path.join(SOURCE_DIR, item.file);
    if (!fs.existsSync(srcPath)) {
      console.error(`Source file not found: ${srcPath}`);
      continue;
    }

    console.log(`Processing: ${item.team} (${item.id})`);

    for (const width of TARGET_WIDTHS) {
      // 1. AVIF format (quality 80)
      const avifPath = path.join(OUTPUT_DIR, `${item.id}-${width}w.avif`);
      await sharp(srcPath)
        .resize(width, width, { fit: 'cover' })
        .avif({ quality: 80, effort: 4 })
        .toFile(avifPath);

      // 2. WebP format (quality 85)
      const webpPath = path.join(OUTPUT_DIR, `${item.id}-${width}w.webp`);
      await sharp(srcPath)
        .resize(width, width, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(webpPath);

      // 3. JPG fallback format (quality 88 mozjpeg)
      const jpgPath = path.join(OUTPUT_DIR, `${item.id}-${width}w.jpg`);
      await sharp(srcPath)
        .resize(width, width, { fit: 'cover' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(jpgPath);
    }

    // Also output primary canonical image at 1024w for standard src fallback
    const canonicalJpg = path.join(OUTPUT_DIR, `${item.id}.jpg`);
    const canonicalWebp = path.join(OUTPUT_DIR, `${item.id}.webp`);
    await sharp(srcPath).resize(1024, 1024).jpeg({ quality: 90, mozjpeg: true }).toFile(canonicalJpg);
    await sharp(srcPath).resize(1024, 1024).webp({ quality: 90 }).toFile(canonicalWebp);
  }

  console.log('Responsive image generation completed successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
