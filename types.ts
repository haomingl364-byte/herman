export enum Gender {
  MALE = '乾造',
  FEMALE = '坤造',
}

export enum ElementType {
  WOOD = 'wood',
  FIRE = 'fire',
  EARTH = 'earth',
  METAL = 'metal',
  WATER = 'water',
}

export enum CalendarType {
  SOLAR = '公历',
  LUNAR = '农历',
}

export interface HiddenStem {
  stem: string;
  tenGod: string; // e.g. 正官
  element: ElementType;
}

export interface Pillar {
  stem: string;      // 天干
  stemTenGod: string; // 天干十神
  stemElement: ElementType;
  
  branch: string;    // 地支
  branchElement: ElementType;
  
  hiddenStems: HiddenStem[]; // 藏干
  
  naYin: string;     // 纳音
  lifeStage: string; // 长生十二神
  
  shenSha: string[]; // 神煞 list
  kongWang: boolean; // 空亡
}

export interface LiuNian {
  year: number;
  ganZhi: string; // e.g. 丙寅
}

export interface LiuYue {
  month: number; // 1-12
  ganZhi: string; // e.g. 丙寅
}

export interface DaYun {
  index: number;
  startAge: number; // 起运岁数
  startYear: number; // 起运年份
  stem: string;
  stemTenGod: string; // e.g. 正官
  stemElement: ElementType;
  branch: string;
  branchElement: ElementType;
  ganZhi: string;
  
  lifeStage: string; // 运支长生
  naYin: string;     // 运纳音
  
  liuNian: LiuNian[]; // The 10 years in this luck cycle
}

export interface SiLingRule {
  gan: string;
  days: number;
}

export type SiLingTable = {[key: string]: SiLingRule[]};

export interface SiLingConfig {
  source: '滴天髓' | '子平真诠' | '三命通会' | '渊海子平' | '自定义';
  customTable?: SiLingTable;
}

export interface BaZiChart {
  type: 'calculated' | 'manual';
  solarDateStr: string;
  lunarDateStr: string;
  solarTermStr: string; // e.g. 惊蛰后19日
  
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
  
  dayKongWang: string; // e.g. "戌亥"
  renYuanSiLing: string; // 人元司令 (Replaces TaiYuan/MingGong)
  
  daYun: DaYun[]; 
  yunQian: LiuNian[]; // Years before the first Da Yun
  startLuckText: string; // e.g. 3年11个月后上运
}

export interface Record {
  id: string;
  name: string;
  gender: Gender;
  birthDate: string; // ISO String
  birthTime: string; // HH:mm
  calendarType: CalendarType;
  city?: string;
  province?: string; 
  createdAt: number;
  chart: BaZiChart;
  notes: string;
  aiAnalysis?: string;
  group?: string; // Case grouping
}

export interface UserInput {
  name: string;
  gender: Gender;
  calendarType: CalendarType;
  
  // Date Mode
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isLeapMonth: boolean; // For Lunar
  
  // Location
  selectedProvince: string; 
  selectedCityKey: string;  
  
  // Settings
  autoSave: boolean;
  group: string; // Input for grouping
  processEarlyLateRat: boolean; // Whether to distinguish Early/Late Rat

  // Manual Mode
  manualYear: string; 
  manualMonth: string;
  manualDay: string;
  manualHour: string;
}