import React, { useState, useMemo, useRef, useEffect } from 'react';
// FIX: Alias the imported `Record` to `BaZiRecord` to avoid conflict with TypeScript's built-in `Record` utility type.
import { Record as BaZiRecord } from '../types';
import { X, Clock, Trash2, Search, ChevronRight, Download, Upload, Edit3, ChevronUp, ChevronDown } from 'lucide-react';
import { pinyin } from 'pinyin-pro';
import { GROUP_ORDER_KEY } from '../constants';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  records: BaZiRecord[];
  activeRecordId?: string;
  onSelect: (record: BaZiRecord) => void;
  onEdit: (record: BaZiRecord) => void; 
  onDelete: (id: string) => void;
  onImport: () => void;
  onBackup: (e: React.MouseEvent) => void;
  onUpdateGroup?: (oldName: string, newName: string) => void;
  onDeleteGroup?: (groupName: string) => void;
  onShowToast?: (msg: string) => void;
}

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ 
    isOpen, onClose, records, activeRecordId, onSelect, onEdit, onDelete, onImport, onBackup,
    onUpdateGroup, onDeleteGroup, onShowToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('全部');
  const [sortMode, setSortMode] = useState<'time' | 'alpha'>('time');

  // Group Management State
  const [editingGroup, setEditingGroup] = useState<{original: string, current: string} | null>(null);
  const [customGroupOrder, setCustomGroupOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem(GROUP_ORDER_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Drag and Drop State
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef<{ startX: number; currentIndex: number; itemWidths: number[] }>({ startX: 0, currentIndex: 0, itemWidths: [] });
  const groupBarRef = useRef<HTMLDivElement>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const longPressMatched = useRef(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const alphaRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const activeRecordRef = useRef<HTMLDivElement | null>(null);

  // Sync custom order when groups change
  const currentGroupsList = useMemo(() => {
    const uniqueGroups = Array.from(new Set(records.map(r => r.group || '默认分组')));
    let newOrder = [...customGroupOrder];
    uniqueGroups.forEach(g => {
      if (!newOrder.includes(g)) newOrder.push(g);
    });
    newOrder = newOrder.filter(g => uniqueGroups.includes(g));
    return newOrder;
  }, [records, customGroupOrder]);

  const finalSortedGroups = useMemo(() => ['全部', ...currentGroupsList], [currentGroupsList]);

  useEffect(() => {
    localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(currentGroupsList));
  }, [currentGroupsList]);

  useEffect(() => {
      if (isOpen) {
          setSortMode('time');
          setSearchTerm('');
          setTimeout(() => {
              if (activeRecordRef.current) {
                  activeRecordRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
          }, 100);
      }
  }, [isOpen]);

  const processedData = useMemo(() => {
    const baseList = records.filter(rec => {
      const rawTerm = searchTerm.trim().toLowerCase();
      const recGroup = rec.group || '默认分组';
      let matchesSearch = true;
      if (rawTerm) {
          const terms = rawTerm.split(/\s+/);
          const chartStr = `${rec.chart.year.stem}${rec.chart.year.branch}${rec.chart.month.stem}${rec.chart.month.branch}${rec.chart.day.stem}${rec.chart.day.branch}${rec.chart.hour.stem}${rec.chart.hour.branch}`;
          const fullSearchText = `${rec.name.toLowerCase()} ${recGroup.toLowerCase()} ${chartStr}`;
          matchesSearch = terms.every(t => fullSearchText.includes(t));
      }
      const matchesGroup = selectedGroup === '全部' || recGroup === selectedGroup;
      return matchesSearch && matchesGroup;
    });

    if (sortMode === 'time') {
        return baseList.sort((a, b) => b.createdAt - a.createdAt);
    } else {
        const alphaGrouped: { [key: string]: BaZiRecord[] } = {};
        baseList.forEach(rec => {
            const firstChar = rec.name.trim().charAt(0);
            let letter = '#';
            if (firstChar) {
                const py = pinyin(firstChar, { pattern: 'initial', toneType: 'none' });
                if (py && /^[a-zA-Z]/.test(py)) letter = py.toUpperCase();
            }
            if (!alphaGrouped[letter]) alphaGrouped[letter] = [];
            alphaGrouped[letter].push(rec);
        });
        Object.keys(alphaGrouped).forEach(key => alphaGrouped[key].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')));
        return alphaGrouped;
    }
  }, [records, searchTerm, selectedGroup, sortMode]);

  // DRAG LOGIC
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent, group: string, index: number) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressMatched.current = false;
    
    if (pressTimer.current) clearTimeout(pressTimer.current);

    if (group === '全部') return;

    const startPos = { x: clientX, y: clientY };

    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(60);
      isDragging.current = true;
      longPressMatched.current = true;
      setDragIndex(index);
      
      const bar = groupBarRef.current;
      if (bar) {
        const children = Array.from(bar.children) as HTMLElement[];
        dragRef.current = {
          startX: clientX,
          currentIndex: index,
          itemWidths: children.map(c => c.offsetWidth + 8) 
        };
      }
    }, 600); // Slightly longer for stability
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current || dragIndex === null) {
        // If user moves too much before long press threshold, cancel it
        if (pressTimer.current) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const delta = Math.abs(clientX - dragRef.current.startX);
            if (delta > 10) clearTimeout(pressTimer.current);
        }
        return;
    }
    if ('touches' in e) e.preventDefault(); // Prevent scroll while dragging
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const delta = clientX - dragRef.current.startX;
    setDragOffset(delta);
  };

  const handleTouchEnd = (group: string, index: number) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    
    if (isDragging.current && dragIndex !== null) {
      const widths = dragRef.current.itemWidths;
      let moveCount = 0;
      let tempOffset = dragOffset;

      if (dragOffset > 0) {
        let i = dragIndex + 1;
        while (i < widths.length && tempOffset > widths[i] / 2) {
          tempOffset -= widths[i];
          moveCount++;
          i++;
        }
      } else {
        let i = dragIndex - 1;
        while (i >= 0 && tempOffset < -widths[i] / 2) { 
          tempOffset += widths[i];
          moveCount--;
          i--;
        }
      }

      if (moveCount !== 0) {
        const newOrder = [...currentGroupsList];
        const actualIdx = dragIndex - 1; 
        const targetIdx = Math.max(0, Math.min(newOrder.length - 1, actualIdx + moveCount));
        const item = newOrder.splice(actualIdx, 1)[0];
        newOrder.splice(targetIdx, 0, item);
        setCustomGroupOrder(newOrder);
      }

      isDragging.current = false;
      setDragIndex(null);
      setDragOffset(0);
    } else {
      if (!longPressMatched.current && group) {
        setSelectedGroup(group);
        // Scroll selected group into view
        const bar = groupBarRef.current;
        if (bar) {
          const btn = bar.children[index] as HTMLElement;
          if (btn) {
              bar.scrollTo({ left: btn.offsetLeft - bar.offsetWidth/2 + btn.offsetWidth/2, behavior: 'smooth' });
          }
        }
      }
    }
    longPressMatched.current = false;
  };

  // SWIPE TO SWITCH GROUP
  const touchStartPos = useRef({ x: 0, y: 0 });
  const handleListTouchStart = (e: React.TouchEvent) => {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleListTouchEnd = (e: React.TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - touchStartPos.current.x;
      const deltaY = e.changedTouches[0].clientY - touchStartPos.current.y;
      
      if (Math.abs(deltaX) > 80 && Math.abs(deltaY) < 50) {
          const currentIndex = finalSortedGroups.indexOf(selectedGroup);
          if (deltaX > 0 && currentIndex > 0) {
              const nextGroup = finalSortedGroups[currentIndex - 1];
              setSelectedGroup(nextGroup);
              onShowToast?.(`切换到: ${nextGroup}`);
          } else if (deltaX < 0 && currentIndex < finalSortedGroups.length - 1) {
              const nextGroup = finalSortedGroups[currentIndex + 1];
              setSelectedGroup(nextGroup);
              onShowToast?.(`切换到: ${nextGroup}`);
          }
      }
  };

  const handleIndexScroll = (letter: string) => {
      if (sortMode !== 'alpha') setSortMode('alpha');
      const target = alphaRefs.current[letter];
      if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  const saveGroupEdit = () => {
      if (!editingGroup || !onUpdateGroup) return;
      if (editingGroup.current.trim() && editingGroup.current !== editingGroup.original) {
          onUpdateGroup(editingGroup.original, editingGroup.current.trim());
          const newOrder = customGroupOrder.map(g => g === editingGroup.original ? editingGroup.current.trim() : g);
          setCustomGroupOrder(newOrder);
          if (selectedGroup === editingGroup.original) {
              setSelectedGroup(editingGroup.current.trim());
          }
      }
      setEditingGroup(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-[85%] max-w-sm h-full bg-[#fffcf5] shadow-2xl flex flex-col font-sans animate-slideLeft border-l border-[#d6cda4] pt-[env(safe-area-inset-top)]">
        <div className="p-4 border-b border-[#d6cda4] flex justify-between items-center bg-[#fff8ea] shrink-0">
          <div className="flex flex-col">
              <h2 className="text-lg font-bold text-[#8B0000] font-serif flex items-center gap-2">
                <Clock size={18} /> 历史档案
              </h2>
              <div className="flex gap-4 mt-1">
                  <button onClick={() => setSortMode('time')} className={`text-[10px] font-bold pb-0.5 border-b-2 transition-all ${sortMode === 'time' ? 'text-[#8B0000] border-[#8B0000]' : 'text-[#a89f91] border-transparent'}`}>按时间</button>
                  <button onClick={() => setSortMode('alpha')} className={`text-[10px] font-bold pb-0.5 border-b-2 transition-all ${sortMode === 'alpha' ? 'text-[#8B0000] border-[#8B0000]' : 'text-[#a89f91] border-transparent'}`}>按姓名</button>
              </div>
          </div>
          <button onClick={onClose} className="text-[#8B0000]/50 hover:text-[#8B0000] transition-colors p-1 rounded-full hover:bg-[#8B0000]/10"><X size={24} /></button>
        </div>

        <div className="p-3 bg-[#fffcf5] border-b border-[#ebe5ce] space-y-3 shrink-0">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89f91]" size={14} />
                <input type="text" placeholder="搜索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border border-[#d6cda4] rounded-full py-2 pl-9 pr-4 text-sm text-[#450a0a] outline-none" />
            </div>

            <div 
              ref={groupBarRef}
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1 relative transition-all"
              onMouseMove={handleTouchMove}
            >
                {finalSortedGroups.map((group, idx) => (
                    <button
                        key={group}
                        onTouchStart={(e) => handleTouchStart(e, group, idx)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => handleTouchEnd(group, idx)}
                        onMouseDown={(e) => handleTouchStart(e, group, idx)}
                        onMouseMove={handleTouchMove}
                        onMouseUp={() => handleTouchEnd(group, idx)}
                        onMouseLeave={() => dragIndex === idx && handleTouchEnd(group, idx)}
                        onDoubleClick={() => group !== '全部' && setEditingGroup({ original: group, current: group })}
                        style={{
                          transform: dragIndex === idx ? `translateX(${dragOffset}px) scale(1.05)` : 'none',
                          zIndex: dragIndex === idx ? 50 : 1,
                          boxShadow: dragIndex === idx ? '0 10px 15px -3px rgba(139, 0, 0, 0.2)' : 'none',
                          transition: dragIndex === idx ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                        }}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border select-none transition-all flex items-center gap-1 ${
                            selectedGroup === group 
                            ? 'bg-[#8B0000] text-[#fff8ea] border-[#8B0000] shadow-md' 
                            : 'bg-white text-[#5c4033] border-[#d6cda4] hover:border-[#8B0000]/50'
                        } ${dragIndex === idx ? 'opacity-90 ring-2 ring-[#8B0000]/30 cursor-grabbing' : 'cursor-pointer'}`}
                    >
                        {group}
                    </button>
                ))}
            </div>
        </div>

        <div 
            className="flex flex-1 overflow-hidden relative"
            onTouchStart={handleListTouchStart}
            onTouchEnd={handleListTouchEnd}
        >
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fdfbf6] overscroll-contain pr-6">
              {sortMode === 'time' ? (
                (processedData as BaZiRecord[]).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-[#a89f91] opacity-30"><Search size={32} /></div>
                ) : (processedData as BaZiRecord[]).map(rec => (
                    <div key={rec.id} ref={rec.id === activeRecordId ? activeRecordRef : null}>
                        {renderRecordCard(rec, onSelect, onEdit, onDelete, onClose, rec.id === activeRecordId)}
                    </div>
                ))
              ) : (
                Object.keys(processedData).sort().map(letter => (
                    <div key={letter} ref={el => { alphaRefs.current[letter] = el; }} className="space-y-2">
                        <div className="sticky top-0 z-10 bg-[#fdfbf6]/90 py-1"><span className="bg-[#8B0000] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{letter}</span></div>
                        {(processedData as any)[letter].map((rec: BaZiRecord) => (
                            <div key={rec.id} ref={rec.id === activeRecordId ? activeRecordRef : null}>
                                {renderRecordCard(rec, onSelect, onEdit, onDelete, onClose, rec.id === activeRecordId)}
                            </div>
                        ))}
                    </div>
                ))
              )}
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-6 flex flex-col items-center justify-center z-20">
                {AZ.map(letter => <div key={letter} onClick={() => handleIndexScroll(letter)} className="text-[8px] font-bold text-[#8B0000]/60 py-0.5 w-full text-center">{letter}</div>)}
            </div>
        </div>
        
        <div className="p-3 border-t border-[#d6cda4] bg-[#fffcf5] flex gap-2 shrink-0">
            <button onClick={onBackup} className="flex-1 bg-[#eaddcf] text-[#5c4033] py-2 rounded text-xs font-bold">备份数据</button>
            <button onClick={onImport} className="flex-1 bg-[#8B0000] text-white py-2 rounded text-xs font-bold">恢复数据</button>
        </div>

        <div className="pb-4 pt-1 text-center text-[10px] text-[#a89f91] bg-[#fffcf5] shrink-0">
            长按分组拖动排序 · 双击修改名称
        </div>

        {editingGroup && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6 animate-fadeIn">
                <div className="bg-white rounded-lg shadow-xl w-full border border-[#d6cda4] overflow-hidden max-w-xs">
                    <div className="bg-[#fff8ea] p-3 border-b border-[#eaddcf] flex justify-between items-center">
                        <h3 className="text-[#8B0000] font-bold text-sm">修改分组名称</h3>
                        <button onClick={() => setEditingGroup(null)}><X size={18} /></button>
                    </div>
                    <div className="p-4 space-y-4">
                        <input value={editingGroup.current} onChange={(e) => setEditingGroup({...editingGroup, current: e.target.value})} className="w-full border-b border-[#d6cda4] text-lg py-1 text-[#450a0a] outline-none" />
                        <div className="flex gap-2">
                            <button onClick={() => { if(confirm('删除分组？')) onDeleteGroup?.(editingGroup.original); setEditingGroup(null); }} className="flex-1 py-2 text-xs font-bold text-red-600 bg-red-50 rounded">删除</button>
                            <button onClick={saveGroupEdit} className="flex-[2] py-2 text-xs font-bold text-white bg-[#8B0000] rounded">保存</button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

const renderRecordCard = (rec: BaZiRecord, onSelect: any, onEdit: any, onDelete: any, onClose: any, isActive: boolean = false) => (
    <div onClick={() => { onSelect(rec); onClose(); }} className={`border rounded-lg p-3 active:scale-[0.98] transition-all relative group cursor-pointer ${isActive ? 'bg-[#f5ecd5] border-[#8B0000]' : 'bg-white border-[#e5e0d0]'}`}>
        <div className="flex justify-between items-start mb-2 pr-12">
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-base font-bold ${isActive ? 'text-[#8B0000]' : 'text-[#450a0a]'}`}>{rec.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${rec.gender === '乾造' ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'}`}>{rec.gender}</span>
                {rec.group && rec.group !== '默认分组' && <span className="text-[10px] text-[#8B0000] bg-[#fff8ea] px-1.5 py-0.5 rounded border border-[#eaddcf] font-bold">{rec.group}</span>}
            </div>
        </div>
        <div className="absolute top-3 right-3 flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(rec); onClose(); }} className="text-[#a89f91] p-1.5"><Edit3 size={15} /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(rec.id); }} className="text-[#a89f91] p-1.5"><Trash2 size={15} /></button>
        </div>
        <div className="text-xs text-[#5c4033] font-mono opacity-80">
            <div>{rec.birthDate} {rec.birthTime}</div>
            <div className="text-sm font-serif font-medium mt-1">
                {rec.chart.year.stem}{rec.chart.year.branch} {rec.chart.month.stem}{rec.chart.month.branch} {rec.chart.day.stem}{rec.chart.day.branch} {rec.chart.hour.stem}{rec.chart.hour.branch}
            </div>
        </div>
    </div>
);