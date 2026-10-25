import React from 'react';
import type { KitVisualSpec, EditionTier } from '../lib/commerce';

interface JerseyVisualizerProps {
  visual: KitVisualSpec;
  team: string;
  editionTier?: EditionTier;
  view?: 'front' | 'back' | 'detail';
  customName?: string;
  customNumber?: string;
  className?: string;
}

export const JerseyVisualizer: React.FC<JerseyVisualizerProps> = ({
  visual,
  team,
  editionTier = 'Fan Replica',
  view = 'front',
  customName,
  customNumber,
  className = ''
}) => {
  const uid = React.useId().replace(/:/g, '');
  const displayBackName =
    customName !== undefined && customName.trim() !== ''
      ? customName.trim().toUpperCase().slice(0, 12)
      : customNumber !== undefined && customNumber.trim() !== ''
        ? ''
        : visual.defaultPreviewName;

  const displayBackNumber =
    customNumber !== undefined && customNumber.trim() !== ''
      ? customNumber.trim().slice(0, 2)
      : customName !== undefined && customName.trim() !== ''
        ? ''
        : visual.defaultPreviewNumber;

  if (view === 'detail') {
    return (
      <div
        className={`relative overflow-hidden bg-[#ECECE8] flex items-center justify-center select-none ${className}`}
        role="img"
        aria-label={`${team} collar and breathable mesh fabric macro detail`}
      >
        <svg
          viewBox="0 0 400 300"
          className="w-full h-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id={`mesh-${uid}`}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="rgba(0,0,0,0.08)" />
              <circle cx="6" cy="6" r="1" fill="rgba(0,0,0,0.08)" />
            </pattern>
            <linearGradient id={`macro-bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={visual.primaryColor} />
              <stop offset="100%" stopColor={visual.secondaryColor} />
            </linearGradient>
          </defs>

          {/* Base Fabric Swatch */}
          <rect width="400" height="300" fill={`url(#macro-bg-${uid})`} />
          <rect width="400" height="300" fill={`url(#mesh-${uid})`} />

          {/* Diagonal Accent Stripe */}
          <polygon
            points="0,220 400,110 400,165 0,275"
            fill={visual.accentColor}
            opacity="0.88"
          />

          {/* Collar Neck Tape & Seam Close-up */}
          <path
            d="M 70 0 Q 200 135 330 0"
            fill="#18181B"
            stroke={visual.accentColor}
            strokeWidth="6"
          />
          <text
            x="200"
            y="42"
            textAnchor="middle"
            fill="#FAFAFA"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="2"
          >
            JERSEY VALLEY · {editionTier.toUpperCase()}
          </text>

          {/* Embroidered Crest Macro */}
          <g transform="translate(260, 155)">
            <rect
              x="0"
              y="0"
              width="86"
              height="96"
              rx="12"
              fill="#111111"
              stroke={visual.accentColor}
              strokeWidth="3"
            />
            <text
              x="43"
              y="50"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="24"
              fontWeight="700"
              fontFamily="Barlow Condensed, sans-serif"
              letterSpacing="1.5"
            >
              {visual.crestCode}
            </text>
            <text
              x="43"
              y="74"
              textAnchor="middle"
              fill={visual.accentColor}
              fontSize="8.5"
              fontFamily="JetBrains Mono, monospace"
              letterSpacing="1"
            >
              WOVEN BADGE
            </text>
          </g>

          {/* Spec Label */}
          <rect x="24" y="242" width="196" height="34" rx="4" fill="rgba(17,17,17,0.88)" />
          <text
            x="36"
            y="263"
            fill="#FFFFFF"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            165 GSM AEROMESH WEAVE
          </text>
        </svg>
      </div>
    );
  }

  // Shirt silhouette path (fits comfortably inside 400x340 studio canvas)
  const shirtPath =
    'M 135 38 L 165 32 Q 200 48 235 32 L 265 38 L 336 86 L 308 142 L 272 122 L 272 296 Q 200 304 128 296 L 128 122 L 92 142 L 64 86 Z';

  return (
    <div
      className={`relative overflow-hidden bg-[#EFEFEC] flex items-center justify-center select-none ${className}`}
      role="img"
      aria-label={`${team} ${editionTier} (${view === 'back' ? 'Back view with custom print' : 'Front studio view'})`}
    >
      <svg
        viewBox="0 0 400 340"
        className="w-full h-full object-contain"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={`shirt-clip-${uid}`}>
            <path d={shirtPath} />
          </clipPath>

          <linearGradient id={`studio-shade-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0,0,0,0.16)" />
            <stop offset="22%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0)" />
            <stop offset="78%" stopColor="rgba(0,0,0,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </linearGradient>

          <pattern
            id={`stripes-${uid}`}
            width="36"
            height="340"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="18" height="340" fill={visual.primaryColor} />
            <rect x="18" y="0" width="18" height="340" fill={visual.secondaryColor} />
          </pattern>

          <pattern
            id={`pinstripe-${uid}`}
            width="22"
            height="340"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="20" height="340" fill={visual.primaryColor} />
            <rect x="20" y="0" width="2" height="340" fill={visual.secondaryColor} opacity="0.65" />
          </pattern>

          <pattern
            id={`hoops-${uid}`}
            width="400"
            height="44"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="400" height="26" fill={visual.primaryColor} />
            <rect x="0" y="26" width="400" height="18" fill={visual.secondaryColor} />
          </pattern>

          <filter id={`drop-${uid}`} x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#111111" floodOpacity="0.16" />
          </filter>
        </defs>

        {/* Subtle Studio Plinth Shadow */}
        <ellipse cx="200" cy="316" rx="92" ry="9" fill="rgba(17,17,17,0.1)" />

        {/* Main Jersey Silhouette with Pattern */}
        <g filter={`url(#drop-${uid})`}>
          <g clipPath={`url(#shirt-clip-${uid})`}>
            {/* Base Fill */}
            <rect
              x="50"
              y="20"
              width="300"
              height="300"
              fill={
                visual.pattern === 'stripes'
                  ? `url(#stripes-${uid})`
                  : visual.pattern === 'pinstripe'
                    ? `url(#pinstripe-${uid})`
                    : visual.pattern === 'hoops'
                      ? `url(#hoops-${uid})`
                      : visual.primaryColor
              }
            />

            {/* Split Halves Pattern */}
            {visual.pattern === 'halves' && (
              <>
                <rect x="50" y="20" width="150" height="300" fill={visual.primaryColor} />
                <rect x="200" y="20" width="150" height="300" fill={visual.secondaryColor} />
              </>
            )}

            {/* Diagonal Sash / Chest Band Pattern */}
            {visual.pattern === 'sash' && view === 'front' && (
              <polygon
                points="120,60 165,60 280,260 235,260"
                fill={visual.secondaryColor}
                opacity="0.9"
              />
            )}

            {/* Back number solid readability zone when pattern is stripes */}
            {view === 'back' && visual.pattern === 'stripes' && (
              <rect
                x="142"
                y="78"
                width="116"
                height="168"
                rx="8"
                fill={visual.primaryColor}
              />
            )}

            {/* Sleeve Cuffs */}
            <polygon points="64,86 92,142 101,136 74,80" fill={visual.accentColor} />
            <polygon points="336,86 308,142 299,136 326,80" fill={visual.accentColor} />

            {/* Shoulder Piping */}
            <path
              d="M 135 38 L 74 80 M 265 38 L 326 80"
              stroke={visual.accentColor}
              strokeWidth="5"
              opacity="0.9"
            />

            {/* Hem Trim */}
            <rect x="128" y="290" width="144" height="6" fill={visual.accentColor} opacity="0.85" />

            {/* 3D Studio Drape & Lighting Overlay */}
            <rect x="50" y="20" width="300" height="300" fill={`url(#studio-shade-${uid})`} />
          </g>

          {/* Crisp Silhouette Outline */}
          <path
            d={shirtPath}
            fill="none"
            stroke="rgba(17,17,17,0.18)"
            strokeWidth="1.5"
          />
        </g>

        {/* Collar Construction */}
        {visual.collarStyle === 'polo' ? (
          <g>
            <path
              d="M 162 32 Q 200 54 238 32 L 228 54 L 200 44 L 172 54 Z"
              fill={visual.accentColor}
              stroke="#111111"
              strokeWidth="1.2"
            />
            {view === 'front' && (
              <line
                x1="200"
                y1="44"
                x2="200"
                y2="74"
                stroke={visual.accentColor}
                strokeWidth="3"
              />
            )}
          </g>
        ) : visual.collarStyle === 'v-neck' ? (
          <path
            d="M 163 32 L 200 60 L 237 32 Q 200 44 163 32 Z"
            fill={visual.accentColor}
            stroke="#111111"
            strokeWidth="1"
          />
        ) : (
          <path
            d="M 163 32 Q 200 54 237 32 Q 200 43 163 32 Z"
            fill={visual.accentColor}
            stroke="#111111"
            strokeWidth="1"
          />
        )}

        {/* Inner Neck Label (Visible on Front) */}
        {view === 'front' && (
          <text
            x="200"
            y="40"
            textAnchor="middle"
            fill={visual.textColor}
            opacity="0.65"
            fontSize="6"
            fontFamily="JetBrains Mono, monospace"
          >
            JV REPLICA
          </text>
        )}

        {/* FRONT DETAILS: Manufacturer Mark, Team Crest, Edition Jock Tag */}
        {view === 'front' && (
          <g>
            {/* Minimalist Kit Maker Mark (Right Chest) */}
            <path
              d="M 156 96 L 170 96 L 166 103 L 152 103 Z"
              fill={visual.accentColor}
            />

            {/* Woven Team Crest Shield (Left Chest) */}
            <g transform="translate(224, 86)">
              <path
                d="M 0 0 L 26 0 L 26 18 Q 13 30 0 18 Z"
                fill="#111111"
                stroke={visual.accentColor}
                strokeWidth="2"
              />
              <text
                x="13"
                y="15"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="8.5"
                fontWeight="700"
                fontFamily="Barlow Condensed, sans-serif"
              >
                {visual.crestCode}
              </text>
            </g>

            {/* Bottom Left Replica Jock Tag */}
            <g transform="translate(138, 266)">
              <rect
                x="0"
                y="0"
                width="42"
                height="14"
                rx="2"
                fill="#111111"
                stroke={visual.accentColor}
                strokeWidth="0.8"
              />
              <text
                x="21"
                y="9.5"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="6"
                fontFamily="JetBrains Mono, monospace"
              >
                REPLICA
              </text>
            </g>
          </g>
        )}

        {/* BACK DETAILS: Custom Player Name & Squad Number */}
        {view === 'back' && (
          <g>
            {displayBackName && (
              <text
                x="200"
                y="108"
                textAnchor="middle"
                fill={visual.textColor}
                stroke={visual.textColor === '#FFFFFF' ? '#111111' : '#FFFFFF'}
                strokeWidth="0.8"
                fontSize="22"
                fontWeight="700"
                fontFamily="Barlow Condensed, sans-serif"
                letterSpacing="2.5"
              >
                {displayBackName}
              </text>
            )}
            {displayBackNumber && (
              <text
                x="200"
                y="212"
                textAnchor="middle"
                fill={visual.textColor}
                stroke={visual.textColor === '#FFFFFF' ? '#111111' : '#FFFFFF'}
                strokeWidth="2"
                fontSize="96"
                fontWeight="700"
                fontFamily="Barlow Condensed, sans-serif"
              >
                {displayBackNumber}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
};
