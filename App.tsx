import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Menu, Save, Settings, MapPin, Calendar, RotateCcw, ArrowLeft, Search, X, Fingerprint, FolderInput, ChevronDown, Check, BookOpen, ChevronRight, Edit3, Download, Upload, FileText, Copy, ChevronLeft, Mic, Sliders, Plus, Trash2 } from 'lucide-react';
// FIX: Alias the imported `Record` to `BaZiRecord` to avoid conflict with TypeScript's built-in `Record` utility type.
import { UserInput, Gender, Record as BaZiRecord, CalendarType, SiLingConfig, SiLingTable, SiLingRule, LiuYue } from './types';
import { calculateBaZi, findDatesFromPillars, MatchingDate, calculateLiuYue } from './services/baziCalculator';
import { analyzeBaZi } from './services/geminiService';
import { APP_STORAGE_KEY, APP_SETTINGS_KEY, SI_LING_CONFIG_KEY, ELEMENT_COLORS, PROVINCES_DATA, GAN, ZHI, LUNAR_MONTHS, LUNAR_DAYS, LUNAR_TIMES, STEM_ELEMENTS, BRANCH_ELEMENTS, SILING_PRESETS } from './constants';
import { Button } from './components/Button';
import { HistoryDrawer } from './components/HistoryDrawer';
import { PillarDisplay } from './components/PillarDisplay';
import { WheelPicker } from './components/WheelPicker';
import { LunarYear } from 'lunar-javascript';
import { pinyin } from 'pinyin-pro';
import { get as idbGet, set as idbSet } from 'idb-keyval';

// Helper to get initial input with current time and persisted settings
const getInitialInput = (): UserInput => {
  const now = new Date();
  
  // Try to load persisted habits
  let persistedSettings = { processEarlyLateRat: true, autoSave: true };
  try {
      const saved = localStorage.getItem(APP_SETTINGS_KEY);
      if (saved) {
          persistedSettings = { ...persistedSettings, ...JSON.parse(saved) };
      }
  } catch (e) {
      console.warn("Failed to load settings habits");
  }

  return {
    name: '',
    gender: Gender.MALE,
    calendarType: CalendarType.SOLAR,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    isLeapMonth: false,
    selectedProvince: '全国', 
    selectedCityKey: '不参考出生地 (北京时间)', 
    autoSave: persistedSettings.autoSave,
    group: '',
    processEarlyLateRat: persistedSettings.processEarlyLateRat,
    manualYear: '甲子',
    manualMonth: '丙寅',
    manualDay: '戊辰',
    manualHour: '壬子'
  };
};

interface PillarSelection {
    yGan: string; yZhi: string;
    mGan: string; mZhi: string;
    dGan: string; dZhi: string;
    hGan: string; hZhi: string;
}

const initialPillars: PillarSelection = {
    yGan: '', yZhi: '',
    mGan: '', mZhi: '',
    dGan: '', dZhi: '',
    hGan: '', hZhi: ''
};

const GAN_PINYIN: Record<string, string> = {
    '甲': 'jia', '乙': 'yi', '丙': 'bing', '丁': 'ding', '戊': 'wu',
    '己': 'ji', '庚': 'geng', '辛': 'xin', '壬': 'ren', '癸': 'gui'
};
const ZHI_PINYIN: Record<string, string> = {
    '子': 'zi', '丑': 'chou', '寅': 'yin', '卯': 'mao', '辰': 'chen', '巳': 'si',
    '午': 'wu', '未': 'wei', '申': 'shen', '酉': 'you', '戌': 'xu', '亥': 'hai'
};

const PINYIN_TO_GAN: Record<string, string[]> = Object.entries(GAN_PINYIN).reduce((acc, [char, py]) => {
    if (!acc[py]) acc[py] = [];
    acc[py].push(char);
    return acc;
}, {} as Record<string, string[]>);

const PINYIN_TO_ZHI: Record<string, string[]> = Object.entries(ZHI_PINYIN).reduce((acc, [char, py]) => {
    if (!acc[py]) acc[py] = [];
    acc[py].push(char);
    return acc;
}, {} as Record<string, string[]>);

PINYIN_TO_GAN['kui'] = ['癸'];
PINYIN_TO_GAN['gui'] = ['癸'];

function App() {
  const [view, setView] = useState<'form' | 'chart'>('form');
  const [inputMode, setInputMode] = useState<'date' | 'manual'>('date');
  const [input, setInput] = useState<UserInput>(getInitialInput); 
  
  const [pillars, setPillars] = useState<PillarSelection>(initialPillars);
  const [foundDates, setFoundDates] = useState<MatchingDate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDateResults, setShowDateResults] = useState(false);

  const [isPickerExpanded, setIsPickerExpanded] = useState(false);

  const [currentRecord, setCurrentRecord] = useState<BaZiRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); 
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSiLingModal, setShowSiLingModal] = useState(false);
  const [selectedLiuNianYear, setSelectedLiuNianYear] = useState<number | null>(null);
  
  const [siLingConfig, setSiLingConfig] = useState<SiLingConfig>(() => {
    const saved = localStorage.getItem(SI_LING_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
    return { source: '滴天髓' };
  });

  const [records, setRecords] = useState<BaZiRecord[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);
  const [pasteInput, setPasteInput] = useState('');

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const manualSelectRefs = useRef<(HTMLSelectElement | null)[]>([]);

  const [currentTime, setCurrentTime] = useState(new Date());

  const [toastMsg, setToastMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chartScrollRef = useRef<HTMLDivElement>(null);
  const touchState = useRef({
      isDragging: false,
      startX: 0,
      startScrollLeft: 0
  });

  const years = Array.from({length: 150}, (_, i) => 1900 + i);
  const yearOptions = years.map(y => ({ label: `${y}`, value: y }));
  
  const leapMonth = useMemo(() => {
      if (input.calendarType === CalendarType.LUNAR) {
          try {
              return LunarYear.fromYear(input.year).getLeapMonth();
          } catch (e) {
              console.error("Error getting leap month:", e);
              return 0;
          }
      }
      return 0;
  }, [input.year, input.calendarType]);

  const monthOptions = useMemo(() => {
      if (input.calendarType === CalendarType.LUNAR) {
          const opts = [];
          for (let i = 1; i <= 12; i++) {
              opts.push({ label: LUNAR_MONTHS[i-1], value: i });
              if (i === leapMonth) {
                   opts.push({ label: `闰${LUNAR_MONTHS[i-1]}`, value: -i });
              }
          }
          return opts;
      } else {
          return Array.from({length: 12}, (_, i) => ({ label: `${i + 1}`, value: i + 1 }));
      }
  }, [input.calendarType, leapMonth]);

  const dayOptions = input.calendarType === CalendarType.LUNAR
      ? LUNAR_DAYS.map((d, i) => ({ label: d, value: i + 1 }))
      : Array.from({length: 31}, (_, i) => ({ label: `${i + 1}`, value: i + 1 }));

  const hourOptions = input.calendarType === CalendarType.LUNAR
      ? (input.processEarlyLateRat 
          ? LUNAR_TIMES.map(t => ({ label: t.name.split(' ')[0], value: t.value }))
          : LUNAR_TIMES.filter(t => t.value !== 23).map(t => ({ 
              label: t.value === 0 ? '子时' : t.name.split(' ')[0], 
              value: t.value 
            }))
        )
      : Array.from({length: 24}, (_, i) => ({ label: `${i}`, value: i }));

  const minuteOptions = Array.from({length: 60}, (_, i) => ({ label: `${i}`, value: i }));
  
  useEffect(() => {
    const loadStoredRecords = async () => {
        try {
            const saved = await idbGet(APP_STORAGE_KEY);
            if (saved && Array.isArray(saved)) {
                setRecords(saved);
            } else {
                // Compatibility: Migrate from localStorage if exists
                const legacy = localStorage.getItem(APP_STORAGE_KEY);
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    setRecords(parsed);
                    await idbSet(APP_STORAGE_KEY, parsed);
                    // We keep it in localStorage for one session to be safe, 
                    // but the app now primarily uses IndexedDB.
                }
            }
        } catch (e) {
            console.error("Failed to load records from IndexedDB", e);
        }
    };
    
    loadStoredRecords();
    
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Persist settings (habits) when they change
  useEffect(() => {
      const settings = {
          processEarlyLateRat: input.processEarlyLateRat,
          autoSave: input.autoSave
      };
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  }, [input.processEarlyLateRat, input.autoSave]);

  useEffect(() => {
      localStorage.setItem(SI_LING_CONFIG_KEY, JSON.stringify(siLingConfig));
      // Re-calculate if a chart is open
      if (view === 'chart' && currentRecord) {
        const updatedChart = calculateBaZi(input, siLingConfig);
        setCurrentRecord({ ...currentRecord, chart: updatedChart });
      }
  }, [siLingConfig]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = new Date();
        setCurrentTime(now);
        // Sync input to current time if it's potentially uninitialized (no name, not editing)
        // This addresses "iOS background time" issues where the app stays in memory but state is old.
        setInput(prev => {
          if (!prev.name && !editingId && view === 'form') {
            return {
              ...prev,
              year: now.getFullYear(),
              month: now.getMonth() + 1,
              day: now.getDate(),
              hour: now.getHours(),
              minute: now.getMinutes()
            };
          }
          return prev;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [editingId, view]);

  useEffect(() => {
      setSelectedLiuNianYear(null);
  }, [currentRecord?.id]);

  useEffect(() => {
      if (view === 'form') {
          setIsPickerExpanded(false);
      }
  }, [view]);

  useEffect(() => {
      if (input.calendarType === CalendarType.LUNAR && input.isLeapMonth) {
           try {
               const currentLeap = LunarYear.fromYear(input.year).getLeapMonth();
               if (currentLeap !== input.month) {
                   setInput(prev => ({ ...prev, isLeapMonth: false }));
               }
           } catch (e) {
               console.error("Error validating leap month:", e);
           }
      }
  }, [input.year, input.calendarType]);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [noteDraft, view]);

  const currentBaZi = useMemo(() => {
      try {
          return calculateBaZi(input, siLingConfig);
      } catch (e) {
          return null;
      }
  }, [input, siLingConfig]);

  const showToast = (msg: string) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(''), 2500);
  };

  const saveRecordsToStorage = async (newRecords: BaZiRecord[]) => {
    try {
        await idbSet(APP_STORAGE_KEY, newRecords);
        setRecords(newRecords);
    } catch (e) {
        console.error("Save to IndexedDB failed", e);
        // IndexedDB is much larger, if this fails it's likely a real drive issue or something very unusual
        alert("保存失败：数据库写入异常");
    }
  };

  const generateNextCaseName = (currentRecords: BaZiRecord[]) => {
      let maxNum = 0;
      const regex = /^案例(\d+)$/;
      currentRecords.forEach(r => {
          const match = r.name.match(regex);
          if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
          }
      });
      return `案例${maxNum + 1}`;
  };

  const handleReset = () => {
      const freshInput = getInitialInput();
      setInput(freshInput);
      setPillars(initialPillars);
      setEditingId(null);
      setNoteDraft('');
      setPasteInput('');
      setCurrentRecord(null);
      setSelectedLiuNianYear(null);
      setInputMode('date');
      setIsPickerExpanded(false);
      showToast("已重置");
  };

  const handleSmartPaste = async () => {
      try {
          let text = pasteInput.trim();
          
          if (!text) {
              text = await navigator.clipboard.readText();
              text = text ? text.trim() : '';
              if (!text) {
                  showToast("无内容");
                  return;
              }
          }

          let parsedYear, parsedMonth, parsedDay, parsedHour, parsedMinute;

          const compactRegex = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/;
          const compactMatch = text.match(compactRegex);

          if (compactMatch) {
              parsedYear = parseInt(compactMatch[1], 10);
              parsedMonth = parseInt(compactMatch[2], 10);
              parsedDay = parseInt(compactMatch[3], 10);
              parsedHour = parseInt(compactMatch[4], 10);
              parsedMinute = parseInt(compactMatch[5], 10);
          } else {
              const nums = text.match(/\d+/g);
              if (nums && nums.length >= 3) {
                  parsedYear = parseInt(nums[0], 10);
                  parsedMonth = parseInt(nums[1], 10);
                  parsedDay = parseInt(nums[2], 10);
                  parsedHour = nums.length > 3 ? parseInt(nums[3], 10) : 12; 
                  parsedMinute = nums.length > 4 ? parseInt(nums[4], 10) : 0;
              } else {
                  showToast("未能识别日期格式");
                  return;
              }
          }

          if (parsedYear && parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= 31) {
              setInput({
                  ...input,
                  calendarType: CalendarType.SOLAR, 
                  year: parsedYear,
                  month: parsedMonth,
                  day: parsedDay,
                  hour: Math.min(23, Math.max(0, parsedHour || 0)),
                  minute: Math.min(59, Math.max(0, parsedMinute || 0))
              });
              setPasteInput(''); 
              showToast("识别成功: " + parsedYear + "年" + parsedMonth + "月");
          } else {
              showToast("日期数值超出范围");
          }

      } catch (err) {
          console.error(err);
          const manualInput = window.prompt("请粘贴日期 (如 194910011500 或 2025年1月1日 12:00)");
          if (manualInput) {
             setPasteInput(manualInput);
          }
      }
  };

  const syncToCurrent = () => {
    const freshNow = new Date();
    const y = freshNow.getFullYear();
    const m = freshNow.getMonth() + 1;
    const d = freshNow.getDate();
    const h = freshNow.getHours();
    const min = freshNow.getMinutes();

    // Use a function to ensure we're not using any stale state
    setInput(prev => ({
      ...prev,
      year: y,
      month: m,
      day: d,
      hour: h,
      minute: min,
      calendarType: CalendarType.SOLAR,
      isLeapMonth: false
    }));
    setCurrentTime(freshNow); 
    showToast(`当前时间: ${y}年${m}月${d}日 ${h}:${min < 10 ? '0'+min : min}`);
  };

  const handleArrange = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalName = input.name.trim();
    let isAutoNamed = false;

    if (!finalName) {
        finalName = generateNextCaseName(records);
        isAutoNamed = true;
    }

    const chart = calculateBaZi({ ...input, name: finalName }, siLingConfig);
    
    const recordData: BaZiRecord = {
      id: editingId || Date.now().toString(),
      name: finalName,
      gender: input.gender,
      birthDate: `${input.year}-${input.month}-${input.day}`,
      birthTime: `${input.hour}:${input.minute}`,
      calendarType: input.calendarType,
      province: input.selectedProvince,
      city: input.selectedCityKey,
      createdAt: editingId ? (records.find(r => r.id === editingId)?.createdAt || Date.now()) : Date.now(),
      chart: chart,
      notes: editingId ? (records.find(r => r.id === editingId)?.notes || '') : '',
      group: input.group || '默认分组'
    };

    setCurrentRecord(recordData);
    setSelectedLiuNianYear(null);
    if (!editingId) {
        setNoteDraft('');
    } else {
        setNoteDraft(recordData.notes);
    }
    
    if (input.autoSave) {
        let newRecords;
        if (editingId) {
            newRecords = records.map(r => r.id === editingId ? recordData : r);
            showToast("案例已更新");
        } else {
            newRecords = [recordData, ...records];
            setEditingId(recordData.id);
        }
        saveRecordsToStorage(newRecords);
    }

    if (isAutoNamed && !editingId) {
        setInput(prev => ({ ...prev, name: '' }));
    } else {
        setInput(prev => ({ ...prev, name: finalName }));
    }

    setView('chart');
  };

  const handleSaveRecord = () => {
    if (!currentRecord) return;
    const updatedRecord = { ...currentRecord, notes: noteDraft };
    const exists = records.find(r => r.id === updatedRecord.id);
    let newRecords;
    if (exists) {
      newRecords = records.map(r => r.id === updatedRecord.id ? updatedRecord : r);
    } else {
      newRecords = [updatedRecord, ...records];
    }
    saveRecordsToStorage(newRecords);
    setCurrentRecord(updatedRecord);
    
    showToast("保存成功");
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
    if (!oldName || !newName || oldName === newName) return;
    const newRecords = records.map(r => {
        if ((r.group || '默认分组') === oldName) {
            return { ...r, group: newName };
        }
        return r;
    });
    saveRecordsToStorage(newRecords);
    showToast(`分组已重命名为: ${newName}`);
  };

  const handleDeleteGroup = (groupName: string) => {
    const newRecords = records.map(r => {
        if ((r.group || '默认分组') === groupName) {
            return { ...r, group: '' };
        }
        return r;
    });
    saveRecordsToStorage(newRecords);
    showToast(`分组“${groupName}”已删除`);
  };

  const handleAIAnalyze = async () => {
    if (!currentRecord) return;
    setIsAnalyzing(true);
    const analysis = await analyzeBaZi(currentRecord);
    const timestamp = new Date().toLocaleString();
    const newNotes = (noteDraft ? noteDraft + `\n\n` : "") + `--- AI 大师分析 (${timestamp}) ---\n` + analysis;
    
    setNoteDraft(newNotes);
    const updatedRecord = { ...currentRecord, notes: newNotes };
    const newRecords = records.map(r => r.id === updatedRecord.id ? updatedRecord : r);
    saveRecordsToStorage(newRecords);
    setCurrentRecord(updatedRecord);
    
    setIsAnalyzing(false);
  };

  const loadRecord = (rec: BaZiRecord) => {
    setCurrentRecord(rec);
    setNoteDraft(rec.notes);
    
    const [y, m, d] = rec.birthDate.split('-').map(Number);
    const [h, min] = rec.birthTime.split(':').map(Number);
    
    setInput({
      ...input,
      name: rec.name,
      gender: rec.gender,
      year: y, month: m, day: d, hour: h, minute: min,
      calendarType: rec.calendarType || CalendarType.SOLAR,
      selectedProvince: rec.province || '直辖市',
      selectedCityKey: rec.city || '北京',
      group: rec.group === '默认分组' ? '' : (rec.group || '')
    });

    setEditingId(rec.id); 
    
    setSelectedLiuNianYear(null);
    setView('chart');
    setHistoryOpen(false);
  };
  
  const handleEditRecord = (rec: BaZiRecord) => {
    setEditingId(rec.id);
    setNoteDraft(rec.notes);
    const [y,m,d] = rec.birthDate.split('-').map(Number);
    const [h,min] = rec.birthTime.split(':').map(Number);
    
    setInput({
      ...input,
      name: rec.name,
      gender: rec.gender,
      year: y, month: m, day: d, hour: h, minute: min,
      calendarType: rec.calendarType || CalendarType.SOLAR,
      selectedProvince: rec.province || '直辖市',
      selectedCityKey: rec.city || '北京',
      group: rec.group === '默认分组' ? '' : (rec.group || '')
    });
    
    setSelectedLiuNianYear(null);
    setView('form');
    setHistoryOpen(false);
    showToast("已加载档案，请修改后排盘");
  };

  const deleteRecord = (id: string) => {
    if (window.confirm("确定删除此记录吗？")) {
      const newRecords = records.filter(r => r.id !== id);
      saveRecordsToStorage(newRecords);
      if (currentRecord?.id === id) {
        setView('form');
        setCurrentRecord(null);
        setEditingId(null);
      }
    }
  };

  const handleBackup = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (records.length === 0) {
          alert("暂无记录可备份");
          return;
      }
      
      const fileName = `bazi_backup_${new Date().toISOString().slice(0,10)}.json`;
      const dataStr = JSON.stringify(records, null, 2);
      
      if (navigator.canShare && navigator.share) {
          try {
              const file = new File([dataStr], fileName, { type: 'application/json' });
              const shareData = {
                  files: [file],
                  title: '八字数据备份',
              };
              if (navigator.canShare(shareData)) {
                  await navigator.share(shareData);
                  return;
              }
          } catch (err) {
              console.warn("Share File failed", err);
          }
      }

      try {
          const blob = new Blob([dataStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("已尝试下载备份文件");
          return;
      } catch (err) {
          console.warn("Legacy download failed", err);
      }
      
      try {
          await navigator.clipboard.writeText(dataStr);
          alert("因系统限制无法直接导出文件。备份数据已复制到剪贴板，请粘贴到备忘录保存。");
      } catch (err) {
          alert("备份失败：无法导出文件也无法复制到剪贴板。");
      }
  };

  const handleRestoreClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = event.target?.result as string;
              const parsed = JSON.parse(json);
              
              if (Array.isArray(parsed)) {
                  const existingIds = new Set(records.map(r => r.id));
                  const newUniqueRecords = parsed.filter((r: BaZiRecord) => !existingIds.has(r.id));
                  const combinedRecords = [...newUniqueRecords, ...records];
                  combinedRecords.sort((a, b) => b.createdAt - a.createdAt);
                  
                  saveRecordsToStorage(combinedRecords);
                  showToast(`成功导入 ${newUniqueRecords.length} 条记录`);
                  setShowSettings(false);
              } else {
                  alert("文件格式不正确");
              }
          } catch (err) {
              console.error(err);
              alert("导入失败：文件格式错误");
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };


  const handleSearchDates = () => {
      const p = pillars;
      if (!p.yGan || !p.yZhi || !p.mGan || !p.mZhi || !p.dGan || !p.dZhi || !p.hGan || !p.hZhi) {
          alert("请完整选择四柱干支");
          return;
      }

      setIsSearching(true);
      setTimeout(() => {
          const results = findDatesFromPillars(
              p.yGan, p.yZhi, p.mGan, p.mZhi,
              p.dGan, p.dZhi, p.hGan, p.hZhi
          );
          setFoundDates(results);
          setIsSearching(false);
          setShowDateResults(true);
      }, 100);
  };

  const selectFoundDate = (d: MatchingDate) => {
      setInput({
          ...input,
          calendarType: CalendarType.SOLAR,
          year: d.year, month: d.month, day: d.day, hour: d.hour, minute: 0,
          selectedProvince: '全国',
          selectedCityKey: '不参考出生地 (北京时间)'
      });
      setInputMode('date');
      setShowDateResults(false);
  };

  const handleModeSwitch = (mode: 'SOLAR' | 'LUNAR' | 'MANUAL') => {
      if (mode === 'MANUAL') {
          setInputMode('manual');
      } else {
          setInputMode('date');
          setInput({ 
              ...input, 
              calendarType: mode === 'SOLAR' ? CalendarType.SOLAR : CalendarType.LUNAR,
              minute: mode === 'SOLAR' ? input.minute : 0 
          });
      }
  };

  const getCurrentModeKey = () => {
      if (inputMode === 'manual') return 'MANUAL';
      return input.calendarType === CalendarType.SOLAR ? 'SOLAR' : 'LUNAR';
  };

  const getFilteredZhi = (selectedGan: string) => {
      if (!selectedGan) return [];
      const ganIdx = GAN.indexOf(selectedGan);
      if (ganIdx === -1) return ZHI;
      const isYang = ganIdx % 2 === 0;
      return ZHI.filter((_, idx) => (idx % 2 === 0) === isYang);
  };
  
  const handleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
          try { 
            recognitionRef.current.stop(); 
          } catch(e) {}
      }
      setIsListening(false);
      return;
    }

    // iOS Safari specifically prefers webkitSpeechRecognition
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    
    if (!SpeechRecognition) {
      showToast("当前浏览器或设备不支持语音识别");
      return;
    }

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        showToast("语音功能需要 HTTPS 环境支持");
        return;
    }

    // Attempt to unlock AudioContext for iOS if needed (though not strictly for Web Speech, helps some scenarios)
    try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
            const tempCtx = new AudioCtx();
            if (tempCtx.state === 'suspended') tempCtx.resume();
        }
    } catch(e) {
        console.warn("AudioContext skip");
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true; // Show interim results for better feedback
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setPillars(initialPillars); // Reset pillars to empty
      setFoundDates([]); // Clear previous search results
      setShowDateResults(false);
      showToast("请读出：甲子 丙寅... (共八字)");
      if ('vibrate' in navigator) {
          navigator.vibrate(50);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      let errorMsg = "语音打开失败";
      if (event.error === 'no-speech') errorMsg = "未检测到语音输入";
      else if (event.error === 'not-allowed') errorMsg = "请在 iOS 设置中允许浏览器访问麦克风";
      else if (event.error === 'network') errorMsg = "网络异常";
      else if (event.error === 'aborted') return; // User stopped it
      
      showToast(errorMsg);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult[0].transcript.trim();
      
      // Extract characters as much as possible for real-time feedback
      const rawCharsForInterim = transcript.replace(/[^\u4e00-\u9fa5]/g, '').split('');
      if (rawCharsForInterim.length > 0) {
          const keys: (keyof PillarSelection)[] = ['yGan', 'yZhi', 'mGan', 'mZhi', 'dGan', 'dZhi', 'hGan', 'hZhi'];
          setPillars(prev => {
              const next = { ...prev };
              rawCharsForInterim.forEach((c, i) => {
                  if (i < 8) {
                      const isStem = i % 2 === 0;
                      if (isStem ? GAN.includes(c) : ZHI.includes(c)) {
                          (next as any)[keys[i]] = c;
                      }
                  }
              });
              return next;
          });
      }

      if (!lastResult.isFinal) return;

      const transcriptPinyin = pinyin(transcript, { toneType: 'none', nonChinese: 'spaced' }).toLowerCase();
      const pinyinSegments = transcriptPinyin.split(/\s+/).filter(s => s.length > 0);
      const rawChars = transcript.replace(/[^\u4e00-\u9fa5]/g, '').split('');

      let resultChars: string[] = [];
      for (let i = 0; i < 8; i++) {
          const isStemPos = i % 2 === 0;
          let matchedChar = '';
          const py = pinyinSegments[i];
          if (py) {
              const options = isStemPos ? PINYIN_TO_GAN[py] : PINYIN_TO_ZHI[py];
              if (options && options.length > 0) {
                  matchedChar = options[0];
              }
          }
          if (!matchedChar && rawChars[i]) {
              const char = rawChars[i];
              if (isStemPos ? GAN.includes(char) : ZHI.includes(char)) {
                  matchedChar = char;
              }
          }
          if (matchedChar) {
              resultChars.push(matchedChar);
          } else {
              break;
          }
      }

      if (resultChars.length === 8) {
        processRecognizedChars(resultChars);
      } else {
        const allChars = transcript.replace(/[^\u4e00-\u9fa5]/g, '');
        if (allChars.length >= 8) {
            const candidate = allChars.substring(0, 8).split('');
            const isValidScan = candidate.every((c, idx) => {
                if (idx % 2 === 0) return GAN.includes(c);
                return ZHI.includes(c);
            });
            if (isValidScan) {
                processRecognizedChars(candidate);
                return;
            }
        }
        // Even if incomplete, if we matched some, update state (already handled by interim but let's be sure)
        if (resultChars.length > 0) {
           const keys: (keyof PillarSelection)[] = ['yGan', 'yZhi', 'mGan', 'mZhi', 'dGan', 'dZhi', 'hGan', 'hZhi'];
           setPillars(prev => {
               const next = { ...prev };
               resultChars.forEach((c, i) => { (next as any)[keys[i]] = c; });
               return next;
           });
           showToast(`识别部分八字 (${resultChars.length}/8): ` + resultChars.join(''));
        } else {
           showToast("未能识别八字，识别到: " + (allChars || transcript));
        }
      }
    };

    const processRecognizedChars = (chars: string[]) => {
      const [yG, yZ, mG, mZ, dG, dZ, hG, hZ] = chars;
      const checkYinYang = (g: string, z: string) => (GAN.indexOf(g) % 2) === (ZHI.indexOf(z) % 2);
      const pairsValid = checkYinYang(yG, yZ) && checkYinYang(mG, mZ) && checkYinYang(dG, dZ) && checkYinYang(hG, hZ);
      
      const nextPillars = {
          yGan: yG, yZhi: yZ,
          mGan: mG, mZhi: mZ,
          dGan: dG, dZhi: dZ,
          hGan: hG, hZhi: hZ,
      };
      
      setPillars(nextPillars);
      showToast(pairsValid ? "识别成功: " + chars.join('') : "填充完成，但干支阴阳不合");
      
      // Auto-trigger search if 8 characters are recognized
      if (chars.length === 8) {
          setIsSearching(true);
          setTimeout(() => {
              const results = findDatesFromPillars(
                  nextPillars.yGan, nextPillars.yZhi, nextPillars.mGan, nextPillars.mZhi,
                  nextPillars.dGan, nextPillars.dZhi, nextPillars.hGan, nextPillars.hZhi
              );
              setFoundDates(results);
              setIsSearching(false);
              setShowDateResults(results.length > 0);
              if (results.length === 0) {
                  showToast("未找到匹配日期");
              } else {
                  showToast(`找到 ${results.length} 个匹配日期`);
              }
          }, 500);
      }
    };

    try {
        recognition.start();
    } catch (e) {
        console.error("Failed to start speech recognition", e);
        showToast("无法启动语音，请重选或刷新");
    }
  };

  const renderInputGroup = (content: React.ReactNode) => (
    <div className="mb-4 px-2">
       {content}
    </div>
  );
  
  const getDisplayData = () => {
    if (!currentBaZi) return null;
    const year = input.year; 
    const month = String(input.month).padStart(2, '0');
    const day = String(input.day).padStart(2, '0');
    const hour = String(input.hour).padStart(2, '0');
    const minute = String(input.minute).padStart(2, '0');
    const lunarParts = currentBaZi.lunarDateStr.replace('农历', '').split('年');
    const lunarRest = lunarParts[1] || ''; 
    const [lunarDate, lunarTimePart] = lunarRest.split(', ');
    const lunarDisplay = `农历: ${year}年${lunarDate} ${lunarTimePart}`;
    const solarDisplay = `公历: ${year}年${month}月${day}日 ${hour}:${minute}`;
    return { lunarDisplay, solarDisplay };
  };

  const displayData = getDisplayData();

  const renderForm = () => {
    const uniqueGroups = Array.from(new Set(records.map(r => r.group || '默认分组')))
        .filter(g => g !== '默认分组')
        .sort();

    const provinces = Object.keys(PROVINCES_DATA).sort((a,b) => {
        if (a === '全国') return -1;
        if (b === '全国') return 1;
        if (a === '直辖市') return -1;
        if (b === '直辖市') return 1;
        return a.localeCompare(b, 'zh-Hans-CN');
    });

    const cities = Object.keys(PROVINCES_DATA[input.selectedProvince] || PROVINCES_DATA['全国']);
    
    return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto px-4 pt-[max(0.5rem,env(safe-area-inset-top))] font-sans bg-[#fff8ea]">
      <div className="text-center mb-4 pt-4 relative">
        <h1 className="text-3xl font-calligraphy text-[#8B0000] mb-0 drop-shadow-sm">玄青君排盘</h1>
        <p className="text-[#5c4033] text-[9px] uppercase tracking-[0.3em] opacity-70">SIZHUBAZI</p>
      </div>

      <form onSubmit={handleArrange} className="relative mt-2 flex flex-col flex-1">
        
        {renderInputGroup(
            <div className="flex gap-4 items-end border-b border-[#d6cda4] pb-2">
                <input type="text" placeholder="请输入姓名 (为空则自动命名)" value={input.name}
                    onChange={e => setInput({ ...input, name: e.target.value })}
                    className="flex-1 bg-transparent text-[#450a0a] focus:text-[#8B0000] outline-none text-lg placeholder-[#d6cda4]"
                />
                <div className="flex gap-2 shrink-0">
                    {[Gender.MALE, Gender.FEMALE].map((g) => (
                    <button key={g} type="button" onClick={() => setInput({ ...input, gender: g })}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                            input.gender === g 
                            ? 'bg-[#8B0000] text-[#fff8ea] border-[#8B0000]' 
                            : 'bg-transparent text-[#a89f91] border-transparent hover:text-[#5c4033]'
                        }`}>
                        {g}
                    </button>
                    ))}
                </div>
            </div>
        )}

        <div className="flex justify-center mb-6">
            <div className="flex gap-1">
                {[
                    { key: 'SOLAR', label: '公历' },
                    { key: 'LUNAR', label: '农历' },
                    { key: 'MANUAL', label: '八字反推' }
                ].map((mode) => (
                    <button 
                        key={mode.key} 
                        type="button" 
                        onClick={() => handleModeSwitch(mode.key as any)}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                            getCurrentModeKey() === mode.key 
                            ? 'text-[#8B0000] bg-[#eaddcf]/50' 
                            : 'text-[#a89f91] hover:text-[#5c4033]'
                        }`}
                    >
                        {mode.label}
                    </button>
                ))}
            </div>
        </div>

        <div className="px-2 mb-4">
            {inputMode === 'date' ? (
                <div className="space-y-2">
                     <div className="flex justify-between items-center px-2 mb-2 gap-2">
                         <input 
                             value={pasteInput}
                             onChange={(e) => setPasteInput(e.target.value)}
                             placeholder="格式：194910011500"
                             className="flex-1 bg-transparent border-b border-[#d6cda4] text-[10px] text-[#5c4033] placeholder-[#d6cda4] outline-none py-1"
                         />
                         <button 
                            type="button"
                            onClick={syncToCurrent}
                            className="flex items-center gap-1 text-[10px] text-[#8B0000] bg-[#eaddcf]/40 hover:bg-[#eaddcf] px-2 py-1 rounded-full transition-colors whitespace-nowrap"
                         >
                            <RotateCcw size={10} /> 当前时间
                         </button>
                         <button 
                            type="button"
                            onClick={handleSmartPaste}
                            className="flex items-center gap-1 text-[10px] text-[#8B0000] bg-[#eaddcf]/40 hover:bg-[#eaddcf] px-2 py-1 rounded-full transition-colors whitespace-nowrap"
                         >
                            <FileText size={12} /> 识别日期
                         </button>
                     </div>

                     <div className="flex items-center justify-between">
                         <WheelPicker 
                             options={yearOptions} 
                             value={input.year} 
                             onChange={(v) => setInput({ ...input, year: Number(v) })} 
                             label="年"
                             className="flex-1"
                             expanded={isPickerExpanded}
                             onInteract={() => setIsPickerExpanded(true)}
                         />
                         <WheelPicker 
                             options={monthOptions} 
                             value={input.calendarType === CalendarType.LUNAR && input.isLeapMonth ? -input.month : input.month} 
                             onChange={(v) => {
                                 const val = Number(v);
                                 setInput({ 
                                     ...input, 
                                     month: Math.abs(val),
                                     isLeapMonth: val < 0
                                 });
                             }} 
                             label={input.calendarType === CalendarType.SOLAR ? "月" : ""}
                             className="flex-1"
                             expanded={isPickerExpanded}
                             onInteract={() => setIsPickerExpanded(true)}
                         />
                         <WheelPicker 
                             options={dayOptions} 
                             value={input.day} 
                             onChange={(v) => setInput({ ...input, day: Number(v) })} 
                             label={input.calendarType === CalendarType.SOLAR ? "日" : ""}
                             className="flex-1"
                             expanded={isPickerExpanded}
                             onInteract={() => setIsPickerExpanded(true)}
                         />
                         <WheelPicker 
                             options={hourOptions} 
                             value={input.hour} 
                             onChange={(v) => setInput({ ...input, hour: Number(v) })} 
                             label={input.calendarType === CalendarType.SOLAR ? "时" : ""}
                             className="flex-1"
                             expanded={isPickerExpanded}
                             onInteract={() => setIsPickerExpanded(true)}
                         />
                         {input.calendarType === CalendarType.SOLAR && (
                             <WheelPicker 
                                 options={minuteOptions} 
                                 value={input.minute} 
                                 onChange={(v) => setInput({ ...input, minute: Number(v) })} 
                                 label="分"
                                 className="flex-1"
                                 expanded={isPickerExpanded}
                                 onInteract={() => setIsPickerExpanded(true)}
                             />
                         )}
                     </div>
                     
                     {currentBaZi && displayData && (
                         <div className="mt-6 mb-2 flex justify-between items-start px-2">
                             <div className="flex flex-col gap-0.5">
                                 <div className="flex gap-5 pl-1">
                                     {[currentBaZi.year, currentBaZi.month, currentBaZi.day, currentBaZi.hour].map((p, i) => (
                                         <div key={i} className="flex flex-col items-center gap-1">
                                             <span className={`text-xl font-light leading-none ${ELEMENT_COLORS[p.stemElement]}`}>{p.stem}</span>
                                             <span className={`text-xl font-light leading-none ${ELEMENT_COLORS[p.branchElement]}`}>{p.branch}</span>
                                         </div>
                                     ))}
                                 </div>
                                 <div className="text-[10px] text-stone-400 leading-tight font-sans tracking-wide pl-1 mt-0.5">
                                     <div>{displayData.lunarDisplay}</div>
                                     <div>{displayData.solarDisplay}</div>
                                 </div>
                             </div>

                             <div className="flex flex-col gap-3 pt-1">
                                 <label className="flex items-center justify-end gap-2 cursor-pointer group select-none">
                                    <span className="text-[11px] text-[#5c4033] group-hover:text-[#8B0000] transition-colors">早晚子时</span>
                                    <div className={`w-3 h-3 border rounded-sm flex items-center justify-center transition-colors ${input.processEarlyLateRat ? 'bg-[#8B0000] border-[#8B0000]' : 'border-[#a89f91]'}`}>
                                        {input.processEarlyLateRat && <Check size={8} className="text-white" />}
                                    </div>
                                    <input type="checkbox" className="hidden" 
                                        checked={input.processEarlyLateRat} 
                                        onChange={(e) => setInput({...input, processEarlyLateRat: e.target.checked})} 
                                    />
                                </label>

                                <label className="flex items-center justify-end gap-2 cursor-pointer group select-none">
                                    <span className="text-[11px] text-[#5c4033] group-hover:text-[#8B0000] transition-colors">保存案例</span>
                                    <div className={`w-3 h-3 border rounded-sm flex items-center justify-center transition-colors ${input.autoSave ? 'bg-[#8B0000] border-[#8B0000]' : 'border-[#a89f91]'}`}>
                                        {input.autoSave && <Check size={8} className="text-white" />}
                                    </div>
                                    <input type="checkbox" className="hidden" 
                                        checked={input.autoSave} 
                                        onChange={(e) => setInput({...input, autoSave: e.target.checked})} 
                                    />
                                </label>
                             </div>
                         </div>
                     )}

                     <div className="flex items-center gap-2 border-b border-[#d6cda4] pb-2 mt-4">
                        <MapPin className="text-[#a89f91] shrink-0" size={16} />
                        <div className="flex flex-1 gap-2">
                            <select 
                                value={input.selectedProvince} 
                                onChange={(e) => {
                                    const prov = e.target.value;
                                    const firstCity = Object.keys(PROVINCES_DATA[prov])[0];
                                    setInput({...input, selectedProvince: prov, selectedCityKey: firstCity});
                                }}
                                className="flex-1 bg-transparent text-[#450a0a] text-sm outline-none border-none py-1 truncate"
                            >
                                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <span className="text-[#d6cda4] self-center">|</span>
                            <select 
                                value={input.selectedCityKey} 
                                onChange={(e) => setInput({...input, selectedCityKey: e.target.value})}
                                className="flex-1 bg-transparent text-[#450a0a] text-sm outline-none border-none py-1 truncate"
                            >
                                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                     </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-4 gap-4">
                         {['年','月','日','时'].map((t,i) => (
                             <div key={i} className="text-center text-[#8c7b75] text-xs font-serif">{t}柱</div>
                         ))}
                         <div className="col-span-4 grid grid-cols-4 gap-4">
                             {[
                                 [pillars.yGan, pillars.yZhi, 'yGan', 'yZhi'],
                                 [pillars.mGan, pillars.mZhi, 'mGan', 'mZhi'],
                                 [pillars.dGan, pillars.dZhi, 'dGan', 'dZhi'],
                                 [pillars.hGan, pillars.hZhi, 'hGan', 'hZhi']
                             ].map(([gVal, zVal, gKey, zKey]: any, idx) => {
                                 const gColor = gVal ? ELEMENT_COLORS[STEM_ELEMENTS[gVal]] : 'text-[#a89f91]';
                                 const zColor = zVal ? ELEMENT_COLORS[BRANCH_ELEMENTS[zVal]] : 'text-[#a89f91]';
                                 const filteredZhi = getFilteredZhi(gVal);

                                 return (
                                 <div key={idx} className="flex flex-col gap-3">
                                     <div className="relative border-b border-[#d6cda4]">
                                         <select 
                                            ref={el => manualSelectRefs.current[idx * 2] = el}
                                            className={`w-full bg-transparent text-center appearance-none text-2xl font-bold py-1 outline-none ${gColor}`}
                                            value={gVal} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                setPillars({...pillars, [gKey]: val, [zKey]: ''});
                                                if (val) {
                                                    setTimeout(() => manualSelectRefs.current[idx * 2 + 1]?.focus(), 10);
                                                }
                                            }}
                                         >
                                            <option value="">-</option>
                                            {GAN.map(g => (
                                                <option key={g} value={g} className={ELEMENT_COLORS[STEM_ELEMENTS[g]]}>{g}</option>
                                            ))}
                                         </select>
                                     </div>

                                     <div className="relative border-b border-[#d6cda4]">
                                        <select 
                                            ref={el => manualSelectRefs.current[idx * 2 + 1] = el}
                                            className={`w-full bg-transparent text-center appearance-none text-2xl font-bold py-1 outline-none ${zColor}`}
                                            value={zVal} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                setPillars({...pillars, [zKey]: val});
                                                if (val && idx < 3) {
                                                    setTimeout(() => manualSelectRefs.current[idx * 2 + 2]?.focus(), 10);
                                                }
                                            }}
                                            disabled={!gVal}
                                         >
                                            <option value="">-</option>
                                            {filteredZhi.map(z => (
                                                <option key={z} value={z} className={BRANCH_ELEMENTS[z] ? ELEMENT_COLORS[BRANCH_ELEMENTS[z]] : 'text-[#a89f91]'}>{z}</option>
                                            ))}
                                         </select>
                                     </div>
                                 </div>
                             )})}
                         </div>
                    </div>

                    <div className="flex justify-center pt-2">
                        <button
                            type="button"
                            onClick={handleVoiceInput}
                            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-md active:scale-95 border ${
                                isListening 
                                ? 'bg-[#8B0000] text-white animate-pulse' 
                                : 'bg-white text-[#a89f91] hover:text-[#8B0000] border-[#d6cda4]'
                            }`}
                            title="语音输入四柱"
                        >
                            <Mic size={24} />
                        </button>
                    </div>
                    
                    <div className="flex justify-end mt-2 px-1">
                        <label className="flex items-center gap-2 cursor-pointer group select-none">
                            <span className="text-[11px] text-[#5c4033] group-hover:text-[#8B0000] transition-colors">保存案例</span>
                            <div className={`w-3 h-3 border rounded-sm flex items-center justify-center transition-colors ${input.autoSave ? 'bg-[#8B0000] border-[#8B0000]' : 'border-[#a89f91]'}`}>
                                {input.autoSave && <Check size={8} className="text-white" />}
                            </div>
                            <input type="checkbox" className="hidden" 
                                checked={input.autoSave} 
                                onChange={(e) => setInput({...input, autoSave: e.target.checked})} 
                            />
                        </label>
                    </div>

                    <Button type="button" onClick={handleSearchDates} isLoading={isSearching} variant="secondary" className="text-xs py-2 mt-2 bg-[#eaddcf]/50 border-none shadow-none text-[#5c4033] hover:text-[#8B0000]">
                        <Search size={14} className="mr-2" /> 查询匹配日期
                    </Button>
                    
                    {showDateResults && (
                        <div className="absolute inset-x-4 top-20 z-50 bg-[#fff8ea] flex flex-col rounded-xl overflow-hidden shadow-2xl border border-[#8B0000] max-h-[60vh]">
                            <div className="p-2 bg-[#8B0000] text-white flex justify-between items-center">
                                <h3 className="font-bold text-xs">匹配日期 ({foundDates.length})</h3>
                                <button onClick={() => setShowDateResults(false)}><X size={16}/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-white">
                                {foundDates.length === 0 ? (
                                    <div className="text-center text-stone-500 mt-4 text-xs">未找到匹配日期</div>
                                ) : (
                                    foundDates.map((d, idx) => (
                                        <button key={idx} onClick={() => selectFoundDate(d)}
                                            className="w-full bg-[#fffcf5] border border-[#d6cda4] p-2 rounded text-left hover:bg-[#f5ecd5] transition-colors">
                                            <div className="text-[#8B0000] font-bold text-sm">{d.year}年{d.month}月{d.day}日 <span className="text-stone-600 text-xs ml-2">{d.hour}时</span></div>
                                            <div className="text-[#5c4033] text-xs mt-1 font-mono bg-[#eaddcf] inline-block px-1 rounded">{d.ganZhi}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="relative mb-2 px-2 z-20">
            <div className="flex items-center gap-3 border-b border-[#d6cda4] pb-2">
                <FolderInput className="text-[#a89f91]" size={16} />
                <div className="flex-1 relative">
                     <input
                         type="text"
                         value={input.group}
                         onChange={(e) => setInput({...input, group: e.target.value})}
                         onFocus={() => {
                             setShowGroupSuggestions(true);
                             setIsPickerExpanded(false);
                         }}
                         onBlur={() => setTimeout(() => setShowGroupSuggestions(false), 200)}
                         placeholder="输入或选择分组 (默认)"
                         className="w-full bg-transparent outline-none text-[#450a0a] text-sm"
                     />
                     <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-[#d6cda4] pointer-events-none" />
                </div>
            </div>
            {showGroupSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#fffcf5] border border-[#d6cda4] rounded shadow-lg max-h-40 overflow-y-auto z-30">
                     {['默认分组', ...uniqueGroups].map(g => (
                         <button
                             key={g}
                             type="button"
                             className="w-full text-left px-4 py-2 text-sm text-[#5c4033] hover:bg-[#eaddcf] hover:text-[#8B0000] transition-colors border-b border-[#f0ebda] last:border-0"
                             onClick={() => setInput({...input, group: g === '默认分组' ? '' : g})}
                         >
                             {g}
                         </button>
                     ))}
                </div>
            )}
        </div>

        <div className="flex-1"></div>

        <div className="sticky bottom-0 bg-[#fff8ea] z-30 pb-6 pt-2 px-1 border-t border-[#d6cda4]/30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2">
                <div className="flex-[1] flex justify-center">
                    <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="p-1.5 text-[#a89f91] hover:text-[#8B0000] hover:bg-[#eaddcf]/30 rounded-full transition-colors"
                    >
                    <Settings size={20} />
                    </button>
                </div>

                <Button onClick={handleArrange} className="flex-[7] h-9 p-0 text-base shadow-lg">
                    {editingId ? '更新排盘' : '立刻排盘'}
                </Button>
                
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setHistoryOpen(true)}
                    className="flex-[2] h-9 p-0 text-xs shadow-md border-[#d6cda4]"
                >
                    命例
                </Button>
            </div>
        </div>

      </form>
    </div>
    );
  };

  const renderSiLingModal = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
        <div className="bg-[#fffcf5] rounded-xl w-full max-w-sm border border-[#d6cda4] shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="bg-[#fff8ea] p-4 border-b border-[#e5e0d0] flex justify-between items-center">
                <h3 className="text-lg font-bold text-[#8B0000] flex items-center gap-2 font-serif">
                    <Sliders size={18} /> 人元司令设置
                </h3>
                <button onClick={() => setShowSiLingModal(false)} className="text-[#a89f91] hover:text-[#5c4033]">
                    <X size={20}/>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#fffcf5] no-scrollbar">
                <section>
                    <label className="text-[10px] text-[#a89f91] font-bold uppercase tracking-wider block mb-3">选择经典古籍排法</label>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.keys(SILING_PRESETS).map(name => (
                            <button
                                key={name}
                                onClick={() => setSiLingConfig({ ...siLingConfig, source: name as any })}
                                className={`px-2 py-2 text-[11px] font-bold rounded border transition-all ${
                                    siLingConfig.source === name 
                                    ? 'bg-[#8B0000] text-white border-[#8B0000]' 
                                    : 'bg-white text-[#5c4033] border-[#d6cda4] hover:bg-[#f5ecd5]'
                                }`}
                            >
                                《{name}》
                            </button>
                        ))}
                        <button
                            onClick={() => {
                                const initialCustom = siLingConfig.customTable || SILING_PRESETS['滴天髓'];
                                setSiLingConfig({ source: '自定义', customTable: JSON.parse(JSON.stringify(initialCustom)) });
                            }}
                            className={`px-2 py-2 text-[11px] font-bold rounded border transition-all ${
                                siLingConfig.source === '自定义' 
                                ? 'bg-[#8B0000] text-white border-[#8B0000]' 
                                : 'bg-white text-[#5c4033] border-[#d6cda4]'
                            }`}
                        >
                            自定义设置
                        </button>
                    </div>
                </section>

                {siLingConfig.source === '自定义' && siLingConfig.customTable && (
                    <section className="animate-fadeIn space-y-4">
                        <label className="text-[10px] text-[#a89f91] font-bold uppercase tracking-wider block">分月规则 (12月令)</label>
                        {ZHI.map(branch => (
                            <div key={branch} className="bg-white p-3 rounded border border-[#ebe5ce] shadow-sm">
                                <div className="flex justify-between items-center mb-2 pb-1 border-b border-[#f5ecd5]">
                                    <span className="text-sm font-bold text-[#8B0000]">{branch}月令</span>
                                    <button 
                                        onClick={() => {
                                            const newTable = { ...siLingConfig.customTable! };
                                            newTable[branch].push({ gan: '甲', days: 0 });
                                            setSiLingConfig({ ...siLingConfig, customTable: newTable });
                                        }}
                                        className="flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded"
                                    >
                                        <Plus size={10} /> 添加干
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {(siLingConfig.customTable![branch] || []).map((rule, idx) => (
                                        <div key={idx} className="flex gap-2 items-center group">
                                            <div className="flex-1 grid grid-cols-2 gap-2">
                                                <div className="relative">
                                                    <select 
                                                        value={rule.gan}
                                                        onChange={(e) => {
                                                            const newTable = { ...siLingConfig.customTable! };
                                                            newTable[branch][idx].gan = e.target.value;
                                                            setSiLingConfig({ ...siLingConfig, customTable: newTable });
                                                        }}
                                                        className="w-full bg-[#fffcf5] border border-[#d6cda4] rounded px-2 py-1 text-xs outline-none appearance-none font-bold text-[#450a0a]"
                                                    >
                                                        {GAN.map(g => <option key={g} value={g}>{g}</option>)}
                                                    </select>
                                                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a89f91] pointer-events-none" />
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="number"
                                                        value={rule.days}
                                                        onChange={(e) => {
                                                            const newTable = { ...siLingConfig.customTable! };
                                                            newTable[branch][idx].days = parseInt(e.target.value) || 0;
                                                            setSiLingConfig({ ...siLingConfig, customTable: newTable });
                                                        }}
                                                        className="w-full bg-[#fffcf5] border border-[#d6cda4] rounded px-2 py-1 text-xs outline-none font-bold text-[#8B0000] text-center"
                                                    />
                                                    <span className="text-[10px] text-[#a89f91] whitespace-nowrap">天</span>
                                                </div>
                                            </div>
                                            {siLingConfig.customTable![branch].length > 1 && (
                                                <button 
                                                    onClick={() => {
                                                        const newTable = { ...siLingConfig.customTable! };
                                                        newTable[branch].splice(idx, 1);
                                                        setSiLingConfig({ ...siLingConfig, customTable: newTable });
                                                    }}
                                                    className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <div className="pt-1 flex justify-end">
                                        <span className="text-[10px] text-[#a89f91]">
                                            小计：{siLingConfig.customTable![branch].reduce((sum, r) => sum + r.days, 0)} 天
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </section>
                )}
            </div>
            
            <div className="p-4 border-t border-[#eaddcf] bg-[#fff8ea] flex gap-2">
                <Button 
                    variant="secondary" 
                    onClick={() => {
                        if (confirm("确定要重置当前自定义设置为默认吗？")) {
                            setSiLingConfig({ ...siLingConfig, customTable: JSON.parse(JSON.stringify(SILING_PRESETS['滴天髓'])) });
                        }
                    }} 
                    className="h-10 text-xs flex-1"
                >
                    重置
                </Button>
                <Button onClick={() => setShowSiLingModal(false)} className="h-10 text-sm flex-[2]">保存选择</Button>
            </div>
        </div>
    </div>
  );

  const renderChart = () => {
    if (!currentBaZi || !currentRecord) return null;
    const { chart } = currentRecord;
    const currentYear = new Date().getFullYear();

    const handleDaYunTouchStart = (e: React.TouchEvent) => {
        if (!chartScrollRef.current) return;
        touchState.current.isDragging = true;
        touchState.current.startX = e.touches[0].pageX;
        touchState.current.startScrollLeft = chartScrollRef.current.scrollLeft;
    };

    const handleDaYunTouchMove = (e: React.TouchEvent) => {
        if (!touchState.current.isDragging || !chartScrollRef.current) return;
        const currentX = e.touches[0].pageX;
        const delta = currentX - touchState.current.startX;
        chartScrollRef.current.scrollLeft = touchState.current.startScrollLeft - delta;
    };

    const handleDaYunTouchEnd = () => {
        touchState.current.isDragging = false;
    };

    let currentDaYunStr = "运前";
    if (chart.daYun.length > 0) {
        if (currentYear < chart.daYun[0].startYear) {
            currentDaYunStr = "运前";
        } else {
            const activeYun = chart.daYun.find((yun, idx) => {
                const nextYun = chart.daYun[idx + 1];
                return currentYear >= yun.startYear && (!nextYun || currentYear < nextYun.startYear);
            });
            if (activeYun) {
                currentDaYunStr = activeYun.ganZhi;
            } else {
                currentDaYunStr = chart.daYun[chart.daYun.length - 1].ganZhi; 
            }
        }
    }

    return (
      <div className="flex flex-col min-h-screen bg-[#fffbe6] pb-20 font-sans text-[#1c1917] select-none">
        {toastMsg && (
            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-6 py-3 rounded-lg z-[80] flex items-center gap-2 shadow-2xl animate-fadeIn">
                <Check size={20} className="text-green-400" />
                <span className="font-bold">{toastMsg}</span>
            </div>
        )}

        <div className="sticky top-0 z-20 bg-[#961c1c] border-b border-[#700f0f] flex justify-between items-center h-auto min-h-[48px] pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 px-2 shadow-md">
           <button onClick={() => { setView('form'); setEditingId(null); }} className="px-3 py-2 text-white hover:text-white/80 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4l-8 8 8 8" />
              </svg>
           </button>
           <h1 className="font-calligraphy text-2xl text-white tracking-widest drop-shadow-md">玄青君排盘</h1>
           <button onClick={() => setHistoryOpen(true)} className="p-1 text-white hover:text-white/80 transition-colors">
              <Menu size={24} />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 overscroll-contain">
            
            <div className="space-y-1 text-[15px] leading-tight text-[#333]">
                <div>姓名：{currentRecord.name}</div>
                <div>出生时间：{chart.solarDateStr}</div>
                <div>出生时间：{chart.lunarDateStr}</div>
                <div>
                    出生于 <span className="text-green-700 font-bold">{chart.solarTermStr.replace('出生于', '')} [节气]</span>
                    <span className="ml-2 text-stone-500 text-sm">空亡：{chart.dayKongWang}</span>
                </div>
            </div>

            <div className="mt-2 pl-0">
                <div className="flex gap-2">
                    <div className="w-10 flex items-start justify-start text-[15px] font-bold text-[#1c1917] mt-1 whitespace-nowrap pl-1">
                        {currentRecord.gender}：
                    </div>

                    <div className="grid grid-cols-4 gap-0 text-center relative w-full max-w-[320px]">
                         {[chart.year, chart.month, chart.day, chart.hour].map((p, i) => (
                             <div key={`ny-${i}`} className="text-[15px] text-[#4a4a4a] h-6">{p.naYin}</div>
                         ))}
                         
                         {[chart.year, chart.month, chart.day, chart.hour].map((p, i) => (
                             <div key={`tg-${i}`} className="text-[15px] text-[#4a4a4a] h-6">{p.stemTenGod}</div>
                         ))}
                         
                         {[chart.year, chart.month, chart.day, chart.hour].map((p, i) => (
                             <div key={`s-${i}`} className={`text-2xl font-bold ${ELEMENT_COLORS[p.stemElement]}`}>
                                 {p.stem}
                             </div>
                         ))}
                         
                         {[chart.year, chart.month, chart.day, chart.hour].map((p, i) => (
                             <div key={`b-${i}`} className={`text-2xl font-bold ${ELEMENT_COLORS[p.branchElement]}`}>
                                 {p.branch}
                             </div>
                         ))}
                         
                         {[chart.year, chart.month, chart.day, chart.hour].map((p, i) => (
                             <div key={`hs-${i}`} className="flex flex-col items-center mt-1 space-y-0.5">
                                 {p.hiddenStems.map((hs, idx) => (
                                     <div key={idx} className="flex gap-0.5 items-center text-[15px] leading-none">
                                         <span className={`${ELEMENT_COLORS[hs.element]}`}>{hs.stem}</span>
                                         <span className="text-[#666] scale-90 origin-left">{hs.tenGod}</span>
                                     </div>
                                 ))}
                             </div>
                         ))}
                         
                         {[chart.year, chart.month, chart.day, chart.hour].map((p, i) => (
                             <div key={`ls-${i}`} className="mt-2 text-[15px] text-[#333]">{p.lifeStage}</div>
                         ))}
                    </div>
                </div>
            </div>

            <div className="mt-1 space-y-0.5 text-[15px] leading-snug">
                <div className="flex gap-2">
                    <span className="text-green-700">
                        司令: {chart.renYuanSiLing} 
                        <button 
                            onClick={() => setShowSiLingModal(true)}
                            className="ml-2 text-green-700"
                        >
                            [设置]
                        </button>
                    </span>
                </div>
            </div>

            <div className="mt-1 text-[15px]">
                <div className="text-[#333]">{chart.startLuckText} <span className="text-green-600">[设置]</span></div>
                <div className="text-[#333]">即每逢乙年清明后第7日交脱大运, 当前: <span className="text-[#8B0000] font-bold">{currentDaYunStr}</span></div>
            </div>

            <div 
                ref={chartScrollRef}
                className="mt-1 overflow-x-hidden whitespace-nowrap"
            >
                <div className="min-w-max">
                     <div className="flex">
                         <div className="flex flex-col w-12 items-center shrink-0">
                             <div className="h-4"></div>
                             <div className="h-4"></div>
                             {(() => {
                                 const isCurrentYunQian = chart.yunQian.some(y => y.year === currentYear);
                                 const highlightColor = 'text-[#8B0000]'; 
                                 
                                 return (
                                     <>
                                        <div 
                                            className="w-full flex flex-col items-center cursor-grab active:cursor-grabbing"
                                            onTouchStart={handleDaYunTouchStart}
                                            onTouchMove={handleDaYunTouchMove}
                                            onTouchEnd={handleDaYunTouchEnd}
                                        >
                                            <div className={`h-8 flex items-center justify-center font-bold text-lg ${isCurrentYunQian ? highlightColor : 'text-[#1c1917]'}`}>运前</div>
                                            <div className="h-4 text-[15px] text-[#333]">1</div>
                                            <div className="h-4 text-[15px] text-[#333]">{chart.yunQian[0]?.year}</div>
                                        </div>
                                        
                                        <div className="mt-2 w-full flex flex-col items-center gap-1 select-none">
                                            {chart.yunQian.map((yn, idx) => {
                                                const isCurrent = yn.year === currentYear;
                                                const textColor = isCurrentYunQian 
                                                    ? (isCurrent ? `${highlightColor} font-bold` : highlightColor) 
                                                    : 'text-[#333]';
                                                
                                                return (
                                                    <div key={idx} className={`flex items-center justify-center h-[18px] w-full ${textColor}`}>
                                                        <span className="text-[15px] tracking-widest">{yn.ganZhi}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                     </>
                                 );
                             })()}
                         </div>

                         {chart.daYun.map((yun, idx) => {
                             const nextYun = chart.daYun[idx + 1];
                             const isCurrentDaYun = currentYear >= yun.startYear && (!nextYun || currentYear < nextYun.startYear);
                             const highlightColor = 'text-[#8B0000]'; 
                             
                             return (
                             <div key={yun.index} className="flex flex-col w-12 items-center shrink-0">
                                 <div 
                                    className="w-full flex flex-col items-center cursor-grab active:cursor-grabbing"
                                    onTouchStart={handleDaYunTouchStart}
                                    onTouchMove={handleDaYunTouchMove}
                                    onTouchEnd={handleDaYunTouchEnd}
                                 >
                                    <div className="h-4 text-[15px] text-[#333] scale-90 whitespace-nowrap">{yun.naYin}</div>
                                    <div className="h-4 text-[15px] text-[#333]">{yun.stemTenGod}</div>
                                    
                                    <div className={`h-8 flex items-center justify-center ${isCurrentDaYun ? highlightColor : 'text-[#1c1917]'} font-bold`}>
                                        <span className="text-lg tracking-wide">{yun.ganZhi}</span> 
                                    </div>
                                    
                                    <div className="h-4 text-[15px] text-[#333]">{yun.startAge}</div>
                                    <div className="h-4 text-[15px] text-[#333]">{yun.startYear}</div>
                                 </div>

                                 <div className="mt-2 w-full flex flex-col items-center gap-1 select-none">
                                     {yun.liuNian.map((ln, lnIdx) => {
                                         const isCurrentLiuNian = ln.year === currentYear;
                                         const isSelected = selectedLiuNianYear === ln.year;
                                         const baseColor = isCurrentDaYun ? highlightColor : 'text-[#333]';
                                         const textColor = isCurrentLiuNian ? `${highlightColor} font-bold` : baseColor;
                                         
                                         return (
                                            <div 
                                               key={lnIdx} 
                                               onClick={() => setSelectedLiuNianYear(isSelected ? null : ln.year)}
                                               className={`flex items-center justify-center h-[18px] w-full cursor-pointer rounded transition-colors ${isSelected ? 'bg-[#8B0000]/10' : 'hover:bg-[#8B0000]/5'} ${textColor}`}
                                            >
                                                <span className="text-[15px] tracking-widest">{ln.ganZhi}</span>
                                            </div>
                                         );
                                     })}
                                 </div>
                             </div>
                         )})}
                     </div>
                </div>
            </div>

            {selectedLiuNianYear && (
                <div className="mt-4 px-2 py-3 bg-[#eaddcf]/30 border border-[#d6cda4] rounded-lg animate-fadeIn">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-bold text-[#8B0000]">{selectedLiuNianYear}年 流月排盘</h4>
                        <button onClick={() => setSelectedLiuNianYear(null)} className="text-[#a89f91]"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-6 gap-y-3">
                        {calculateLiuYue(selectedLiuNianYear).map((m, idx) => (
                            <div key={idx} className="flex flex-col items-center">
                                <span className={`text-sm font-bold ${ELEMENT_COLORS[STEM_ELEMENTS[m.ganZhi[0]]]}`}>{m.ganZhi[0]}</span>
                                <span className={`text-sm font-bold ${ELEMENT_COLORS[BRANCH_ELEMENTS[m.ganZhi[1]]]}`}>{m.ganZhi[1]}</span>
                                <span className="text-[10px] text-[#5c4033] mt-0.5">{idx + 1}月</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-8 mb-6 px-2">
                <div className="bg-white/60 border border-[#d6cda4] rounded-lg p-3 shadow-sm">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#e5e0d0]">
                        <h3 className="font-bold text-[#8B0000] text-[17px] flex items-center gap-2">
                            <Edit3 size={18}/> 命理师批注
                        </h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleAIAnalyze} 
                                className="text-[10px] px-2 py-1 bg-[#eaddcf] text-[#5c4033] rounded hover:bg-[#d6cda4] transition-colors"
                                disabled={isAnalyzing}
                            >
                                {isAnalyzing ? "AI推算中..." : "AI辅助批注"}
                            </button>
                            <button 
                                onClick={handleSaveRecord} 
                                className="text-[10px] px-3 py-1 bg-[#8B0000] text-white rounded shadow-sm hover:bg-[#7a0000] transition-colors"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                    <textarea
                        ref={textareaRef}
                        className="w-full min-h-[120px] bg-transparent outline-none resize-none text-[17px] font-sans leading-relaxed text-[#450a0a] placeholder-[#a89f91] overflow-hidden"
                        placeholder="在此输入命理分析..."
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                    />
                </div>
            </div>

        </div>
      </div>
    );
  };

  return (
    <>
      <HistoryDrawer 
        isOpen={historyOpen} 
        onClose={() => setHistoryOpen(false)} 
        records={records}
        activeRecordId={currentRecord?.id}
        onSelect={loadRecord}
        onEdit={handleEditRecord}
        onDelete={deleteRecord}
        onImport={handleRestoreClick}
        onBackup={handleBackup}
        onUpdateGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
        onShowToast={showToast}
      />
      
      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-[#fffcf5] rounded-xl w-full max-w-xs border border-[#d6cda4] shadow-2xl relative overflow-hidden">
                <div className="bg-[#fff8ea] p-4 border-b border-[#e5e0d0] flex justify-between items-center">
                    <h3 className="text-lg font-bold text-[#8B0000] flex items-center gap-2">
                        <Settings size={18} /> 设置与数据
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="text-[#a89f91] hover:text-[#5c4033]">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="p-5 space-y-4">
                    <div className="space-y-3">
                        <label className="text-xs text-[#a89f91] font-bold uppercase tracking-wider block mb-2">数据管理</label>
                        <button 
                            type="button"
                            onClick={handleBackup}
                            className="w-full flex items-center justify-between bg-white border border-[#d6cda4] p-3 rounded-lg text-[#450a0a] hover:border-[#8B0000] hover:bg-[#fff8ea] transition-all group"
                        >
                            <span className="flex items-center gap-3 font-bold text-sm">
                                <span className="bg-[#eaddcf] p-1.5 rounded text-[#5c4033] group-hover:text-[#8B0000] transition-colors"><Download size={16}/></span>
                                备份所有数据
                            </span>
                            <ChevronRight size={16} className="text-[#d6cda4] group-hover:text-[#8B0000]"/>
                        </button>
                        
                        <button 
                            type="button"
                            onClick={handleRestoreClick}
                            className="w-full flex items-center justify-between bg-white border border-[#d6cda4] p-3 rounded-lg text-[#450a0a] hover:border-[#8B0000] hover:bg-[#fff8ea] transition-all group"
                        >
                             <span className="flex items-center gap-3 font-bold text-sm">
                                <span className="bg-[#eaddcf] p-1.5 rounded text-[#5c4033] group-hover:text-[#8B0000] transition-colors"><Upload size={16}/></span>
                                恢复数据 (导入)
                            </span>
                            <ChevronRight size={16} className="text-[#d6cda4] group-hover:text-[#8B0000]"/>
                        </button>
                    </div>

                    <div className="bg-[#fdfbf6] p-3 rounded border border-[#f0ebda] text-[11px] text-[#8c7b75] leading-relaxed">
                        <p className="flex items-start gap-1">
                            <FileText size={12} className="mt-0.5 shrink-0"/>
                            更新 App 前，请先点击“备份”将数据保存到手机“文件”中。如果无反应，将自动复制到剪贴板，请粘贴保存。更新完成后，点击“恢复”导入。
                        </p>
                    </div>
                </div>
            </div>
        </div>
      )}

      {showSiLingModal && renderSiLingModal()}

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".json,application/json"
      />

      {view === 'form' ? renderForm() : renderChart()}
    </>
  );
}

export default App;