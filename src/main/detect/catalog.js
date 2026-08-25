'use strict';

const fs = require('fs');
const path = require('path');

let _catalogCache = null;

/**
 * 加载内置特征库（catalog.json）。
 * 结果被缓存，避免重复读取磁盘。
 */
function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  const p = path.join(__dirname, 'catalog.json');
  const raw = fs.readFileSync(p, 'utf8');
  _catalogCache = JSON.parse(raw);
  return _catalogCache;
}

/**
 * 根据「显示名称 / 可执行文件名 / 公司名(底层元数据) / 产品名(底层元数据) /
 * npm 包名 / PATH 可执行名 / 商店包名」匹配特征库条目。
 *
 * 关键：companyName / productName 来自 exe 内嵌版本信息，
 * 用户改快捷方式名或文件名都不会改变它们（底层识别，防改名）。
 * @param {object} query { displayName?, exeName?, companyName?, productName?, npmPackage?, pathExecutable?, storePackage? }
 * @returns {object|null} 命中的特征库条目
 */
function matchCatalog(query = {}) {
  const catalog = loadCatalog();
  const entries = catalog.entries || [];

  const displayName = (query.displayName || '').toLowerCase();
  const exeName = (query.exeName || '').toLowerCase();
  const companyName = (query.companyName || '').toLowerCase();
  const productName = (query.productName || '').toLowerCase();
  const npmPackage = (query.npmPackage || '').toLowerCase();
  const pathExecutable = (query.pathExecutable || '').toLowerCase();
  const storePackage = (query.storePackage || '').toLowerCase();

  for (const entry of entries) {
    if (displayName && (entry.displayNamePatterns || []).some((p) => displayName.includes(p.toLowerCase()))) {
      return entry;
    }
    if (exeName && (entry.exeNames || []).some((n) => n.toLowerCase() === exeName || n.toLowerCase() === exeName.replace(/\.exe$/i, '') || n.toLowerCase() === exeName + '.exe')) {
      return entry;
    }
    // 底层元数据：公司名（如 OpenAI / Anthropic），改名不失效
    if (companyName && (entry.companyNames || []).some((c) => companyName.includes(c.toLowerCase()))) {
      return entry;
    }
    // 底层元数据：内嵌产品名（如 ProductName = ChatGPT）
    if (productName && (entry.displayNamePatterns || []).some((p) => productName.includes(p.toLowerCase()))) {
      return entry;
    }
    if (storePackage && (entry.storePackageNames || []).some((p) => p.toLowerCase() === storePackage)) {
      return entry;
    }
    if (npmPackage && (entry.npmPackages || []).some((p) => p.toLowerCase() === npmPackage || npmPackage.startsWith(p.toLowerCase() + '/'))) {
      return entry;
    }
    if (pathExecutable && (entry.pathExecutables || []).some((p) => p.toLowerCase() === pathExecutable)) {
      return entry;
    }
  }
  return null;
}

/**
 * 判断一个字符串是否包含「疑似 AI」关键词（用于超出特征库的宽泛识别）。
 * 短英文关键词（如 ai/gpt/llm）按整词匹配，避免 "Adobe AIR" 误命中 "ai"。
 */
function looksLikeAI(text) {
  const catalog = loadCatalog();
  const keywords = catalog.aiKeywords || [];
  const t = (text || '').toLowerCase();
  const tokens = new Set(t.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean));

  for (const k of keywords) {
    const kl = (k || '').toLowerCase();
    if (!kl) continue;
    const isCJK = /[\u4e00-\u9fff]/.test(kl);
    if (isCJK) {
      if (t.includes(kl)) return true;
    } else if (kl.length <= 3) {
      if (tokens.has(kl)) return true;
    } else {
      if (t.includes(kl) || tokens.has(kl)) return true;
    }
  }
  return false;
}

module.exports = { loadCatalog, matchCatalog, looksLikeAI };
