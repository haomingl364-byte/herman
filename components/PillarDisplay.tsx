
import React from 'react';
import { Pillar, ElementType } from '../types';
import { ELEMENT_COLORS } from '../constants';

interface PillarDisplayProps {
  title: string; 
  pillar: Pillar;
  isDayMaster?: boolean;
  kongWang?: string; // New prop for specific KongWang display (e.g. on Hour pillar)
}

export const PillarDisplay: React.FC<PillarDisplayProps> = ({ pillar, kongWang }) => {
  const getStemColor = (type: ElementType) => ELEMENT_COLORS[type];
  const getBranchColor = (type: ElementType) => ELEMENT_COLORS[type];

  return (
    <div className="flex flex-col items-center text-center w-full">
      
      {/* 1. Na Yin (Top Row) */}
      <div className="h-6 flex items-center justify-center">
        <span className="text-[11px] text-stone-500 font-medium tracking-tight">
          {pillar.naYin}
        </span>
      </div>

      {/* 2. Ten God (Stem) - Adjusted font size to match Hidden Stems (11px) */}
      <div className="h-5 flex items-end justify-center">
        <span className="text-[11px] text-stone-500 font-medium">
          {pillar.stemTenGod}
        </span>
      </div>

      {/* 3. Main Character Block (Stem + Branch) */}
      <div className="flex flex-col items-center py-1 gap-1 relative">
        {/* Stem */}
        <div className={`text-2xl font-bold leading-none ${getStemColor(pillar.stemElement)} relative`}>
          {pillar.stem}
          {/* Kong Wang displayed to the right of the Hour Stem */}
          {kongWang && (
            <span className="absolute left-[140%] top-1/2 -translate-y-1/2 text-[10px] text-stone-400 whitespace-nowrap font-normal">
              {kongWang}空
            </span>
          )}
        </div>

        {/* Branch */}
        <div className={`text-2xl font-bold leading-none ${getBranchColor(pillar.branchElement)}`}>
          {pillar.branch}
        </div>
      </div>

      {/* 4. Hidden Stems - List Style - Unified Font Size */}
      <div className="flex flex-col w-full items-center space-y-0.5 mt-1 min-h-[48px]">
        {pillar.hiddenStems.map((hs, idx) => (
          <div key={idx} className="flex items-center gap-1 text-[11px] leading-none w-full justify-center">
            <span className={`${ELEMENT_COLORS[hs.element]} font-bold w-3 text-center`}>
              {hs.stem}
            </span>
            <span className="text-stone-500 text-[11px] transform scale-90 origin-left">
              {hs.tenGod}
            </span>
          </div>
        ))}
      </div>
      
      {/* 5. Life Stage */}
      <div className="w-full text-center mt-1 h-6 flex items-center justify-center">
        <span className="text-xs text-stone-800 block font-medium">
           {pillar.lifeStage}
        </span>
      </div>
    </div>
  );
};
