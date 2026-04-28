import React, { useRef, useEffect } from 'react';

interface WheelPickerProps {
  options: { label: string; value: number | string }[];
  value: number | string;
  onChange: (value: any) => void;
  label?: string; // e.g. "年"
  className?: string;
  expanded?: boolean; // Controlled from parent
  onInteract?: () => void; // Trigger parent expansion
}

const ITEM_HEIGHT = 40; // Height of each item in px
// Config for Dynamic Expansion
const ROWS_STATIC = 3;
const ROWS_ACTIVE = 5;

const HEIGHT_STATIC = ITEM_HEIGHT * ROWS_STATIC; // 120px
const HEIGHT_ACTIVE = ITEM_HEIGHT * ROWS_ACTIVE; // 200px

const PADDING_STATIC = (HEIGHT_STATIC - ITEM_HEIGHT) / 2; // 40px
const PADDING_ACTIVE = (HEIGHT_ACTIVE - ITEM_HEIGHT) / 2; // 80px

export const WheelPicker: React.FC<WheelPickerProps> = ({ 
  options, 
  value, 
  onChange, 
  label,
  className = '',
  expanded = false,
  onInteract
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHapticIndex = useRef<number>(-1);
  const lastVibrateTime = useRef<number>(0);
  const isInternalScroll = useRef(false);
  const lastEmittedValue = useRef<number | string | null>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouching = useRef(false);

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Initialize scroll position & Sync external value changes
  useEffect(() => {
    if (containerRef.current) {
      const selectedIndex = options.findIndex(o => o.value === value);
      if (selectedIndex !== -1) {
        const targetScroll = selectedIndex * ITEM_HEIGHT;
        
        // Only adjust if significantly off to prevent fighting.
        // We removed the 'value === lastEmittedValue.current' check because 
        // the visual scroll position might still be wrong even if the value matches.
        if (Math.abs(containerRef.current.scrollTop - targetScroll) > 1) {
             isInternalScroll.current = true;
             // Use 'auto' instead of 'smooth' for external synchronization
             // to ensure it lands exactly where it should without interference.
             containerRef.current.scrollTo({
                 top: targetScroll,
                 behavior: 'auto'
             });
             // Reset internal flag after a slightly longer delay to ensure browser settles
             setTimeout(() => { 
                if (isMounted.current) {
                    isInternalScroll.current = false; 
                }
             }, 150);
        }
      }
    }
  }, [value, options]);

  // Snap to the nearest item when scrolling stops
  const snapToNearest = () => {
      if (!containerRef.current || isTouching.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const index = Math.round(scrollTop / ITEM_HEIGHT);
      
      // Clamp index
      const clampedIndex = Math.max(0, Math.min(index, options.length - 1));
      const targetScroll = clampedIndex * ITEM_HEIGHT;

      // Only scroll if we are misaligned
      if (Math.abs(scrollTop - targetScroll) > 1) {
          isInternalScroll.current = true;
          containerRef.current.scrollTo({
              top: targetScroll,
              behavior: 'smooth'
          });
          setTimeout(() => { isInternalScroll.current = false; }, 300);
      }
      
      // Ensure the value is synced one last time
      if (options[clampedIndex]) {
           const finalValue = options[clampedIndex].value;
           if (finalValue !== value) {
               lastEmittedValue.current = finalValue;
               onChange(finalValue);
           }
      }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // If scroll was programmatically triggered by useEffect, ignore logic
    if (isInternalScroll.current) return;

    const scrollTop = e.currentTarget.scrollTop;
    
    // 1. Debounce Snap: Detect scroll end
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(snapToNearest, 100); // 100ms settled time

    // 2. Calculate Index
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    
    // 3. Haptic Feedback & Value Update
    if (index !== lastHapticIndex.current) {
        lastHapticIndex.current = index;
        
        // Throttled Vibration: Reduce "gear" feel
        const now = Date.now();
        if (now - lastVibrateTime.current > 50) { // Max 20 vibrations per second
             if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(2); // Very light tick
            }
            lastVibrateTime.current = now;
        }
        
        // Update value (Realtime, but filtered by React in parent usually)
        if (index >= 0 && index < options.length) {
             const newValue = options[index].value;
             if (newValue !== value) {
                 lastEmittedValue.current = newValue;
                 onChange(newValue);
             }
        }
    }
  };

  const handleInteractionStart = () => {
      isTouching.current = true;
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      
      if (!expanded && onInteract) {
          onInteract();
      }
  };

  const handleInteractionEnd = () => {
      isTouching.current = false;
      // Trigger snap check in case momentum was zero
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(snapToNearest, 150);
  };

  // Dynamic Styles
  const currentHeight = expanded ? HEIGHT_ACTIVE : HEIGHT_STATIC;
  const currentPadding = expanded ? PADDING_ACTIVE : PADDING_STATIC;

  return (
    <div 
        className={`relative w-full overflow-hidden select-none transition-all duration-300 ease-out ${className}`}
        style={{ 
            height: `${currentHeight}px`, 
            touchAction: 'pan-y' 
        }} 
    >
        {/* Selection Highlight Bar (Center) */}
        <div 
            className="absolute top-1/2 left-0 right-0 h-[40px] -translate-y-1/2 bg-[#8B0000]/5 rounded-sm pointer-events-none z-0 transition-colors duration-300"
        ></div>

        {/* Scroll Container */}
        {/* Removed 'snap-y snap-mandatory' to allow fluid momentum scrolling */}
        <div 
            ref={containerRef}
            className="h-full overflow-y-auto overflow-x-hidden no-scrollbar relative z-10 overscroll-contain"
            style={{ 
                paddingTop: `${currentPadding}px`, 
                paddingBottom: `${currentPadding}px`,
                transition: 'padding 0.3s ease-out', // Smooth padding animation
                willChange: 'scroll-position'
            }}
            onScroll={handleScroll}
            onTouchStart={handleInteractionStart}
            onTouchEnd={handleInteractionEnd}
            onMouseDown={handleInteractionStart}
            onMouseUp={handleInteractionEnd}
            onMouseLeave={handleInteractionEnd}
        >
            {options.map((opt, i) => {
                const isSelected = opt.value === value;
                return (
                    <div 
                        key={opt.value} 
                        // Removed 'snap-center'
                        className={`h-[40px] flex items-center justify-center transition-all duration-200 cursor-pointer w-full`}
                        onClick={() => {
                            if (containerRef.current) {
                                handleInteractionStart();
                                containerRef.current.scrollTo({
                                    top: i * ITEM_HEIGHT,
                                    behavior: 'smooth'
                                });
                                // Manual snap triggers logic via scroll event, or we can force it:
                                setTimeout(() => handleInteractionEnd(), 300);
                            }
                        }}
                    >
                        <div className={`transition-all duration-200 flex items-center justify-center whitespace-nowrap ${
                            isSelected 
                            ? 'text-[#8B0000] font-bold text-xl scale-110 opacity-100' 
                            : 'text-[#a89f91] text-base scale-95 opacity-80 font-medium grayscale' 
                        }`}>
                           {opt.label}
                           {label && isSelected && <span className="text-[10px] ml-0.5 font-normal self-end mb-1 text-[#8B0000]/70">{label}</span>}
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Gradients */}
        <div 
            className="absolute top-0 left-0 right-0 bg-gradient-to-b from-[#fff8ea] via-[#fff8ea]/90 to-transparent pointer-events-none z-20 transition-all duration-300"
            style={{ height: expanded ? '24px' : '40px' }}
        ></div>
        <div 
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#fff8ea] via-[#fff8ea]/90 to-transparent pointer-events-none z-20 transition-all duration-300"
            style={{ height: expanded ? '24px' : '40px' }}
        ></div>
    </div>
  );
};