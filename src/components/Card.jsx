'use client';

// src/components/Card.jsx
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, Search, ArrowLeftRight, Layers } from 'lucide-react';

// Card back color (gradient) by value range
const getCardColor = (value) => {
  if (value === 0) return 'from-emerald-400 to-emerald-600';
  if (value <= 3)  return 'from-sky-400 to-sky-600';
  if (value <= 6)  return 'from-violet-400 to-violet-600';
  if (value <= 8)  return 'from-teal-500 to-emerald-700'; // 7, 8: Peek
  if (value <= 10) return 'from-rose-500 to-pink-700';   // 9, 10: Spy
  if (value <= 12) return 'from-amber-500 to-orange-600'; // 11, 12: Swap
  return 'from-slate-600 to-slate-800'; // 13: King
};

// Ability labels & icon components
const getAbilityBadge = (ability) => {
  switch (ability) {
    case 'peek':
      return {
        icon: Eye,
        label: 'PEEK',
        color: 'bg-[#a465b5]/15 text-[#7d458d] border-[#a465b5]/40',
      };
    case 'spy':
      return {
        icon: Search,
        label: 'SPY',
        color: 'bg-[#ff5757]/15 text-[#e03e3e] border-[#ff5757]/40',
      };
    case 'swap':
      return {
        icon: ArrowLeftRight,
        label: 'SWAP',
        color: 'bg-[#545454]/15 text-[#383838] border-[#545454]/40',
      };
    default:
      return null;
  }
};

const Card = ({
  card,
  isFaceUp = false,
  isKnown = false, // known by current player only
  isCurrentPlayer = false,
  isSelected = false,
  onClick,
  isMyTurn = false,
  selectable = false,
  size = 'normal', // 'compact' | 'normal' | 'large'
  badgeText = null,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const interactive = typeof onClick === 'function';
  const isClickable = interactive || selectable;

  // Preserve the last visible card data so the face doesn't blank out mid-flip when closing
  const lastCardRef = useRef(card);
  if (card) {
    lastCardRef.current = card;
  }
  const displayCard = card || lastCardRef.current;

  // Size styling classes
  const sizeClasses = {
    compact: 'w-14 sm:w-16 aspect-[2/3] text-xs shrink-0',
    normal: 'w-16 sm:w-20 md:w-24 aspect-[2/3] text-sm shrink-0',
    large: 'w-24 sm:w-28 md:w-32 aspect-[2/3] text-base shrink-0',
  }[size] || 'w-16 sm:w-20 aspect-[2/3] text-sm shrink-0';

  const abilityInfo = displayCard?.ability ? getAbilityBadge(displayCard.ability) : null;
  const AbilityIcon = abilityInfo?.icon;

  return (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={interactive ? onClick : undefined}
      className={`relative select-none ${sizeClasses} ${
        isClickable ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{ perspective: 1000 }}
      animate={{
        y: isSelected ? -8 : selectable && isHovered ? -6 : interactive && isHovered ? -3 : 0,
        scale: isSelected ? 1.06 : 1,
      }}
      whileHover={
        isClickable
          ? {
              scale: 1.07,
              y: isSelected ? -9 : -6,
              rotate: [-1.2, 1.2, -1, 1, 0],
              transition: {
                rotate: { repeat: Infinity, duration: 0.32, ease: 'easeInOut' },
                scale: { type: 'spring', stiffness: 450, damping: 20 },
              },
            }
          : {}
      }
      whileTap={isClickable ? { scale: 0.94 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-label={
        isFaceUp && displayCard
          ? `Card value ${displayCard.value}${displayCard.ability ? `, ${displayCard.ability} ability` : ''}`
          : 'Face-down card'
      }
    >
      {/* 3D Flip Container */}
      <motion.div
        className="w-full h-full relative"
        initial={false}
        animate={{ rotateY: isFaceUp ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* ── BACK FACE (rotateY: 0deg) ── */}
        <div
          className={`absolute inset-0 rounded-xl bg-gradient-to-br from-[#a465b5] via-[#7d458d] to-[#242424] flex flex-col items-center justify-center overflow-hidden border border-[#a465b5]/50 shadow-md ${
            isSelected ? 'ring-4 ring-[#a465b5] shadow-[#a465b5]/40 shadow-xl' : ''
          }`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(0deg)',
          }}
        >
          {/* Geometric card back pattern */}
          <div className="absolute inset-1 rounded-lg border border-[#c8d1d9]/30 flex flex-col items-center justify-center p-1 bg-black/20">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6 text-[#c8d1d9] mb-0.5" />
            <span className="text-[9px] sm:text-[10px] text-[#c8d1d9] font-extrabold tracking-widest uppercase">
              CABO
            </span>
          </div>
        </div>

        {/* ── FRONT FACE (rotateY: 180deg) ── */}
        <div
          className={`absolute inset-0 rounded-xl bg-gradient-to-br from-white via-[#eef2f6] to-[#c8d1d9] border ${
            isKnown && !isFaceUp
              ? 'border-[#a465b5] bg-[#a465b5]/10 shadow-inner'
              : 'border-[#545454]/30'
          } ${
            isSelected ? 'ring-4 ring-[#a465b5] shadow-[#a465b5]/40 shadow-xl' : ''
          } flex flex-col items-center justify-between p-1.5 overflow-hidden shadow-md`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {displayCard ? (
            <>
              {/* Top Row: value and optional known badge */}
              <div className="w-full flex justify-between items-start leading-none">
                <span className="font-black text-[#2e2e2e] text-xs sm:text-sm">
                  {displayCard.value}
                </span>
                {isKnown && !isFaceUp && (
                  <span className="p-0.5 bg-[#a465b5]/20 text-[#7d458d] rounded font-semibold tracking-tighter" title="Known by you">
                    <Eye className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>

              {/* Center value & Ability */}
              <div className="flex flex-col items-center justify-center my-auto">
                <span
                  className={`font-extrabold tracking-tight ${
                    size === 'compact' ? 'text-xl' : 'text-3xl sm:text-4xl'
                  } ${
                    displayCard.value === 0
                      ? 'text-[#a465b5]'
                      : displayCard.value === 13
                      ? 'text-[#ff5757]'
                      : displayCard.value >= 11
                      ? 'text-[#a465b5]'
                      : 'text-[#2e2e2e]'
                  }`}
                >
                  {displayCard.value}
                </span>
                {abilityInfo && AbilityIcon && (
                  <span
                    className={`mt-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold tracking-wider ${abilityInfo.color}`}
                    title={`${abilityInfo.label} Ability`}
                  >
                    <AbilityIcon className="w-2.5 h-2.5" />
                    {size !== 'compact' && <span>{abilityInfo.label}</span>}
                  </span>
                )}
              </div>

              {/* Bottom Row */}
              <div className="w-full flex justify-end items-end leading-none">
                <span className="font-black text-[#2e2e2e] text-xs sm:text-sm rotate-180">
                  {displayCard.value}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center w-full h-full text-[#8b949e]">
              <Layers className="w-5 h-5 animate-pulse" />
            </div>
          )}
        </div>
      </motion.div>

      {/* Selectable glowing border */}
      {selectable && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-[#a465b5] ring-offset-1 pointer-events-none animate-pulse" />
      )}

      {/* Custom badge text overlay (e.g., target pick indicator) */}
      {badgeText && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="absolute -top-2 -right-2 bg-[#a465b5] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md z-20"
        >
          {badgeText}
        </motion.div>
      )}
    </motion.div>
  );
};

export default Card;