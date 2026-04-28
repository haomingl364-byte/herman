import { Solar, Lunar, EightChar, LunarUtil, SolarUtil, DaYun as LunarDaYun } from 'lunar-javascript';
import { BaZiChart, Pillar, Gender, ElementType, DaYun, HiddenStem, LiuNian, LiuYue, CalendarType, UserInput, SiLingConfig, SiLingTable } from '../types';
import { STEM_ELEMENTS, BRANCH_ELEMENTS, ELEMENT_CN, PROVINCES_DATA, GAN, ZHI, SILING_PRESETS } from '../constants';

const getElement = (char: string): ElementType => {
  const type = STEM_ELEMENTS[char] || BRANCH_ELEMENTS[char] || 'earth';
  return type as ElementType;
};

// --- Local Helpers for robustness ---
const CHANG_SHENG = '长生,沐浴,冠带,临官,帝旺,衰,病,死,墓,绝,胎,养'.split(',');

const getLifeStage = (gan: string, zhi: string): string => {
  const ganIndex = GAN.indexOf(gan);
  const zhiIndex = ZHI.indexOf(zhi);
  if (ganIndex === -1 || zhiIndex === -1) return '';

  let startZhiIndex = 0;
  let forward = true;

  switch (gan) {
    case '甲': startZhiIndex = 11; break; // Hai
    case '乙': startZhiIndex = 6; forward = false; break; // Wu
    case '丙': startZhiIndex = 2; break; // Yin
    case '丁': startZhiIndex = 9; forward = false; break; // You
    case '戊': startZhiIndex = 2; break; // Yin
    case '己': startZhiIndex = 9; forward = false; break; // You
    case '庚': startZhiIndex = 5; break; // Si
    case '辛': startZhiIndex = 0; forward = false; break; // Zi
    case '壬': startZhiIndex = 8; break; // Shen
    case '癸': startZhiIndex = 3; forward = false; break; // Mao
  }

  let offset = 0;
  if (forward) {
    offset = zhiIndex - startZhiIndex;
  } else {
    offset = startZhiIndex - zhiIndex;
  }

  if (offset < 0) offset += 12;
  
  return CHANG_SHENG[offset % 12];
};

const SHI_SHEN_MAP: {[key: string]: string} = {
  '甲甲': '比肩', '甲乙': '劫财', '甲丙': '食神', '甲丁': '伤官', '甲戊': '偏财', '甲己': '正财', '甲庚': '七杀', '甲辛': '正官', '甲壬': '偏印', '甲癸': '正印',
  '乙甲': '劫财', '乙乙': '比肩', '乙丙': '伤官', '乙丁': '食神', '乙戊': '正财', '乙己': '偏财', '乙庚': '正官', '乙辛': '七杀', '乙壬': '正印', '乙癸': '偏印',
  '丙甲': '偏印', '丙乙': '正印', '丙丙': '比肩', '丙丁': '劫财', '丙戊': '食神', '丙己': '伤官', '丙庚': '偏财', '丙辛': '正财', '丙壬': '七杀', '丙癸': '正官',
  '丁甲': '正印', '丁乙': '偏印', '丁丙': '劫财', '丁丁': '比肩', '丁戊': '伤官', '丁己': '食神', '丁庚': '正财', '丁辛': '偏财', '丁壬': '正官', '丁癸': '七杀',
  '戊甲': '七杀', '戊乙': '正官', '戊丙': '偏印', '戊丁': '正印', '戊戊': '比肩', '戊己': '劫财', '戊庚': '食神', '戊辛': '伤官', '戊壬': '偏财', '戊癸': '正财',
  '己甲': '正官', '己乙': '七杀', '己丙': '正印', '己丁': '偏印', '己戊': '劫财', '己己': '比肩', '己庚': '伤官', '己辛': '食神', '己壬': '正财', '己癸': '偏财',
  '庚甲': '偏财', '庚乙': '正财', '庚丙': '七杀', '庚丁': '正官', '庚戊': '偏印', '庚己': '正印', '庚庚': '比肩', '庚辛': '劫财', '庚壬': '食神', '庚癸': '伤官',
  '辛甲': '正财', '辛乙': '偏财', '辛丙': '正官', '辛丁': '七杀', '辛戊': '正印', '辛己': '偏印', '辛庚': '劫财', '辛辛': '比肩', '辛壬': '伤官', '辛癸': '食神',
  '壬甲': '食神', '壬乙': '伤官', '壬丙': '偏财', '壬丁': '正财', '壬戊': '七杀', '壬己': '正官', '壬庚': '偏印', '壬辛': '正印', '壬壬': '比肩', '壬癸': '劫财',
  '癸甲': '伤官', '癸乙': '食神', '癸丙': '正财', '癸丁': '偏财', '癸戊': '正官', '癸己': '七杀', '癸庚': '正印', '癸辛': '偏印', '癸壬': '劫财', '癸癸': '比肩'
};

const getShiShen = (dayMaster: string, targetStem: string): string => {
    return SHI_SHEN_MAP[dayMaster + targetStem] || '';
};

const getShenSha = (pillarBranch: string, yearBranch: string, dayBranch: string, dayStem: string): string[] => {
  const list: string[] = [];
  const zhi = pillarBranch;

  const isYiMa = (base: string) => {
    if (['申', '子', '辰'].includes(base) && zhi === '寅') return true;
    if (['寅', '午', '戌'].includes(base) && zhi === '申') return true;
    if (['亥', '卯', '未'].includes(base) && zhi === '巳') return true;
    if (['巳', '酉', '丑'].includes(base) && zhi === '亥') return true;
    return false;
  };
  if (isYiMa(yearBranch) || isYiMa(dayBranch)) list.push('驿马');

  const isTaoHua = (base: string) => {
    if (['申', '子', '辰'].includes(base) && zhi === '酉') return true;
    if (['寅', '午', '戌'].includes(base) && zhi === '卯') return true;
    if (['亥', '卯', '未'].includes(base) && zhi === '子') return true;
    if (['巳', '酉', '丑'].includes(base) && zhi === '午') return true;
    return false;
  };
  if (isTaoHua(yearBranch) || isTaoHua(dayBranch)) list.push('咸池');

  const isTianYi = (stem: string) => {
     if (['甲', '戊', '庚'].includes(stem) && ['丑', '未'].includes(zhi)) return true;
     if (['乙', '己'].includes(stem) && ['子', '申'].includes(zhi)) return true;
     if (['丙', '丁'].includes(stem) && ['亥', '酉'].includes(zhi)) return true;
     if (['壬', '癸'].includes(stem) && ['巳', '卯'].includes(zhi)) return true;
     if (['辛'].includes(stem) && ['午', '寅'].includes(zhi)) return true;
     return false;
  };
  if (isTianYi(dayStem)) list.push('天乙');

  const wenChangMap: {[key:string]: string} = {'甲':'巳', '乙':'午', '丙':'申', '戊':'申', '丁':'酉', '己':'酉', '庚':'亥', '辛':'子', '壬':'寅', '癸':'卯'};
  if (wenChangMap[dayStem] === zhi) list.push('文昌');

  const luMap: {[key:string]: string} = {'甲':'寅', '乙':'卯', '丙':'巳', '戊':'巳', '丁':'午', '己':'午', '庚':'申', '辛':'酉', '壬':'亥', '癸':'子'};
  if (luMap[dayStem] === zhi) list.push('禄神');

  const renMap: {[key:string]: string} = {'甲':'卯', '乙':'辰', '丙':'午', '戊':'午', '丁':'未', '己':'未', '庚':'酉', '辛':'戌', '壬':'子', '癸':'丑'};
  if (renMap[dayStem] === zhi) list.push('羊刃');

  return list;
};

const createPillar = (
  stem: string, 
  branch: string, 
  eightChar: any, 
  pillarType: 'year' | 'month' | 'day' | 'time',
  dayMaster: string,
  yearBranch: string,
  dayBranch: string
): Pillar => {
  
  let tenGod = '';
  let naYin = '';
  let lifeStage = '';
  let hiddenStems: HiddenStem[] = [];
  let isKongWang = false;
  let shenSha: string[] = [];

  if (eightChar) {
    switch(pillarType) {
      case 'year':
        tenGod = eightChar.getYearShiShenGan();
        naYin = eightChar.getYearNaYin();
        lifeStage = eightChar.getYearDiShi(); 
        break;
      case 'month':
        tenGod = eightChar.getMonthShiShenGan();
        naYin = eightChar.getMonthNaYin();
        lifeStage = eightChar.getMonthDiShi();
        break;
      case 'day':
        tenGod = '日主';
        naYin = eightChar.getDayNaYin();
        lifeStage = eightChar.getDayDiShi();
        break;
      case 'time':
        tenGod = eightChar.getTimeShiShenGan();
        naYin = eightChar.getTimeNaYin();
        lifeStage = eightChar.getTimeDiShi();
        break;
    }

    let hiddenGans: string[] = [];
    let hiddenShiShens: string[] = [];
    
    if (pillarType === 'year') {
      hiddenGans = eightChar.getYearHideGan();
      hiddenShiShens = eightChar.getYearShiShenZhi();
    } else if (pillarType === 'month') {
      hiddenGans = eightChar.getMonthHideGan();
      hiddenShiShens = eightChar.getMonthShiShenZhi();
    } else if (pillarType === 'day') {
      hiddenGans = eightChar.getDayHideGan();
      hiddenShiShens = eightChar.getDayShiShenZhi();
    } else {
      hiddenGans = eightChar.getTimeHideGan();
      hiddenShiShens = eightChar.getTimeShiShenZhi();
    }

    hiddenStems = hiddenGans.map((gan, idx) => ({
      stem: gan,
      tenGod: hiddenShiShens[idx] || '',
      element: getElement(gan)
    }));

    shenSha = getShenSha(branch, yearBranch, dayBranch, dayMaster);
    const kongWangList = eightChar.getDayXunKong();
    isKongWang = kongWangList.includes(branch);
  }

  return {
    stem,
    stemTenGod: tenGod,
    stemElement: getElement(stem),
    branch,
    branchElement: getElement(branch),
    hiddenStems,
    naYin,
    lifeStage,
    shenSha,
    kongWang: isKongWang
  };
};

// --- Ren Yuan Si Ling Logic ---

const getRenYuanCommander = (monthBranch: string, daysSinceJie: number, config?: SiLingConfig): string => {
  // Determine which table to use
  let table: SiLingTable;
  if (config?.source === '自定义' && config.customTable) {
    table = config.customTable;
  } else {
    table = SILING_PRESETS[config?.source || '滴天髓'] || SILING_PRESETS['滴天髓'];
  }

  const rules = table[monthBranch];
  if (!rules) return '未知';

  const currentDay = daysSinceJie + 1;
  
  let accumulatedDays = 0;
  let matchedGan = '';
  
  for (const rule of rules) {
    accumulatedDays += rule.days;
    if (currentDay <= accumulatedDays) {
      matchedGan = rule.gan;
      break;
    }
  }
  if (!matchedGan) matchedGan = rules[rules.length - 1].gan;

  const elementKey = STEM_ELEMENTS[matchedGan];
  const elementCn = ELEMENT_CN[elementKey] || '';

  return `${matchedGan}${elementCn}司令`;
};


// --- Reverse Search Function ---

export interface MatchingDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  ganZhi: string; 
}

export const findDatesFromPillars = (
  yGan: string, yZhi: string,
  mGan: string, mZhi: string,
  dGan: string, dZhi: string,
  hGan: string, hZhi: string
): MatchingDate[] => {
  const matches: MatchingDate[] = [];
  const startYear = 1900;
  const endYear = 2100;
  
  let currentSolar = Solar.fromYmd(startYear, 1, 1);
  const endSolar = Solar.fromYmd(endYear, 12, 31);
  
  while (currentSolar.isBefore(endSolar)) {
    const lunar = currentSolar.getLunar();
    const nextJie = lunar.getNextJie();
    const nextJieSolar = nextJie.getSolar();
    
    const checkPoint = currentSolar.next(2); 
    const ec = checkPoint.getLunar().getEightChar();
    ec.setSect(2); 

    if (ec.getYearGan() === yGan && ec.getYearZhi() === yZhi &&
        ec.getMonthGan() === mGan && ec.getMonthZhi() === mZhi) {
        
        let dayRunner = currentSolar;
        while (dayRunner.isBefore(nextJieSolar) || dayRunner.toYmd() === nextJieSolar.toYmd()) {
            const testHours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 23];
            
            for (const h of testHours) {
                const hSolar = Solar.fromYmdHms(dayRunner.getYear(), dayRunner.getMonth(), dayRunner.getDay(), h, 0, 0);
                const hec = hSolar.getLunar().getEightChar();
                hec.setSect(2);
                
                if (hec.getYearGan() === yGan && hec.getYearZhi() === yZhi &&
                    hec.getMonthGan() === mGan && hec.getMonthZhi() === mZhi &&
                    hec.getDayGan() === dGan && hec.getDayZhi() === dZhi &&
                    hec.getTimeGan() === hGan && hec.getTimeZhi() === hZhi) {
                    
                    matches.push({
                        year: dayRunner.getYear(),
                        month: dayRunner.getMonth(),
                        day: dayRunner.getDay(),
                        hour: h,
                        ganZhi: `${yGan}${yZhi} ${mGan}${mZhi} ${dGan}${dZhi} ${hGan}${hZhi}`
                    });
                    break; 
                }
            }
            dayRunner = dayRunner.next(1);
        }
        currentSolar = nextJieSolar;
    } else {
        currentSolar = nextJieSolar;
    }
    
    if (matches.length > 200) break; 
  }
  
  return matches;
};

// --- Main Calculator ---

export const calculateLiuYue = (year: number): LiuYue[] => {
  const months: LiuYue[] = [];
  // BaZi months are generally defined by solar terms.
  // We can use a reference date in each solar term month to get the GanZhi.
  // The 12 months start from Yin (寅) month (around Feb).
  // Standard solar terms for month starts: 立春, 惊蛰, 清明, 立夏, 芒种, 小暑, 立秋, 白露, 寒露, 立冬, 大雪, 小寒
  const monthStarts = [
    { m: 2, d: 15 }, // Yin
    { m: 3, d: 15 }, // Mao
    { m: 4, d: 15 }, // Chen
    { m: 5, d: 15 }, // Si
    { m: 6, d: 15 }, // Wu
    { m: 7, d: 15 }, // Wei
    { m: 8, d: 15 }, // Shen
    { m: 9, d: 15 }, // You
    { m: 10, d: 15 }, // Xu
    { m: 11, d: 15 }, // Hai
    { m: 12, d: 15 }, // Zi
    { m: 1, d: 15 }, // Chou (next year usually, but BaZi month 12)
  ];

  for (let i = 0; i < 12; i++) {
    const { m, d } = monthStarts[i];
    // Chou month (i=11) usually falls in early Jan of NEXT year if we count from Feb.
    // However, if we just want the 12 months for a "Year", we need to be careful.
    // Liu Yue usually means the 12 months WITHIN that year's reign.
    const solar = Solar.fromYmd(i === 11 ? year + 1 : year, m, d);
    const lunar = solar.getLunar();
    const ec = lunar.getEightChar();
    months.push({
      month: i + 1,
      ganZhi: ec.getMonth()
    });
  }
  return months;
};

export const calculateBaZi = (input: UserInput, siLingConfig?: SiLingConfig): BaZiChart => {
  
  let solar: Solar;

  if (input.calendarType === CalendarType.LUNAR) {
    const lunarMonth = input.isLeapMonth ? -input.month : input.month; 
    solar = Lunar.fromYmdHms(input.year, lunarMonth, input.day, input.hour, input.minute, 0).getSolar();
  } else {
    solar = Solar.fromYmdHms(input.year, input.month, input.day, input.hour, input.minute, 0);
  }

  const provinceData = PROVINCES_DATA[input.selectedProvince] || PROVINCES_DATA['全国'];
  const longitude = provinceData[input.selectedCityKey] || 120.0;
  
  if (longitude !== 120.0) {
      const offsetMinutes = (longitude - 120.0) * 4;
      const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour(), solar.getMinute());
      date.setMinutes(date.getMinutes() + offsetMinutes);
      solar = Solar.fromDate(date);
  }

  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();
  
  eightChar.setSect(input.processEarlyLateRat ? 2 : 1); 

  const dayMaster = eightChar.getDayGan();
  const dayBranch = eightChar.getDayZhi();
  const yearBranch = eightChar.getYearZhi();

  const yearPillar = createPillar(eightChar.getYearGan(), eightChar.getYearZhi(), eightChar, 'year', dayMaster, yearBranch, dayBranch);
  const monthPillar = createPillar(eightChar.getMonthGan(), eightChar.getMonthZhi(), eightChar, 'month', dayMaster, yearBranch, dayBranch);
  const dayPillar = createPillar(eightChar.getDayGan(), eightChar.getDayZhi(), eightChar, 'day', dayMaster, yearBranch, dayBranch);
  const hourPillar = createPillar(eightChar.getTimeGan(), eightChar.getTimeZhi(), eightChar, 'time', dayMaster, yearBranch, dayBranch);
  
  const dayKongWang = eightChar.getDayXunKong(); 

  const prevJie = lunar.getPrevJie();
  const daysAfterJie = Math.floor(Math.abs(solar.subtract(prevJie.getSolar())));
  const solarTermStr = `出生于${prevJie.getName()}后第${daysAfterJie}日`;
  
  const renYuanSiLing = getRenYuanCommander(eightChar.getMonthZhi(), daysAfterJie, siLingConfig);

  const genderNum = input.gender === Gender.MALE ? 1 : 0;
  const yun = eightChar.getYun(genderNum);
  
  const daYunList: DaYun[] = [];
  const daYunArr = yun.getDaYun();
  
  const startLuckText = `约${yun.getStartYear()}年${yun.getStartMonth()}个月${yun.getStartDay()}日后上运`;

  const yunQian: LiuNian[] = [];
  const birthYear = solar.getYear();
  
  for (let i = 1; i <= 8; i++) {
    const dy: LunarDaYun = daYunArr[i];
    if (!dy) break;
    
    const ganZhi = dy.getGanZhi();
    const stem = ganZhi.substring(0, 1);
    const branch = ganZhi.substring(1, 2);
    
    let stemTenGod = getShiShen(dayMaster, stem);

    const liuNianList: LiuNian[] = [];
    const liuNianArr = dy.getLiuNian(); 
    
    for (let k=0; k<liuNianArr.length; k++) {
        const ln = liuNianArr[k];
        liuNianList.push({
            year: ln.getYear(),
            ganZhi: ln.getGanZhi()
        });
    }

    const yunLifeStage = getLifeStage(dayMaster, branch);
    
    let yunNaYin = '';
    try { yunNaYin = LunarUtil.getNaYin(ganZhi); } catch(e) { yunNaYin = ''; }

    daYunList.push({
      index: i,
      startAge: dy.getStartAge(),
      startYear: dy.getStartYear(),
      stem,
      stemTenGod,
      stemElement: getElement(stem),
      branch,
      branchElement: getElement(branch),
      ganZhi,
      lifeStage: yunLifeStage,
      naYin: yunNaYin,
      liuNian: liuNianList
    });
  }

  const firstLuckYear = daYunList[0]?.startYear || (birthYear + 10);
  for (let y = birthYear; y < firstLuckYear; y++) {
      const l = Solar.fromYmdHms(y, 6, 1, 0,0,0).getLunar();
      yunQian.push({
          year: y,
          ganZhi: l.getYearInGanZhi()
      });
  }

  return {
    type: 'calculated',
    solarDateStr: `阳历${solar.getYear()}年${solar.getMonth()}月${solar.getDay()}日 ${solar.getHour()}时${solar.getMinute()}分`,
    lunarDateStr: `农历${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}, ${lunar.getTimeZhi()}时`,
    solarTermStr,
    startLuckText,
    
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
    
    dayKongWang, 
    renYuanSiLing, 
    
    daYun: daYunList,
    yunQian: yunQian
  };
};