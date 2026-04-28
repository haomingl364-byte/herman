import { GoogleGenAI } from "@google/genai";
// FIX: Alias the imported `Record` to `BaZiRecord` to avoid conflict with TypeScript's built-in `Record` utility type.
import { BaZiChart, Gender, Record as BaZiRecord } from "../types";

export const analyzeBaZi = async (record: BaZiRecord): Promise<string> => {
  if (!process.env.API_KEY) {
    return "未检测到 API Key。请配置环境以使用 AI 大师功能。";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    作为一个专业的传统命理师，请根据以下八字排盘信息进行简要但深刻的分析。
    不需要过多的寒暄，直接输出分析结果。
    
    造主信息:
    姓名: ${record.name}
    性别: ${record.gender}
    出生时间: ${record.birthDate} ${record.birthTime}
    
    八字排盘:
    年柱: ${record.chart.year.stem}${record.chart.year.branch}
    月柱: ${record.chart.month.stem}${record.chart.month.branch}
    日柱: ${record.chart.day.stem}${record.chart.day.branch}
    时柱: ${record.chart.hour.stem}${record.chart.hour.branch}
    
    请分析：
    1. 五行旺衰 (简述)
    2. 性格特征
    3. 近期运势建议
    
    保持语气专业、神秘且具有建设性。
  `;

  try {
    const response = await ai.models.generateContent({
      // FIX: Update model to a recommended newer version as per guidelines.
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "AI 无法生成分析，请稍后再试。";
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "AI 服务连接失败，请检查网络或 API 配额。";
  }
};
