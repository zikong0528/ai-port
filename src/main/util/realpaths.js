'use strict';

const path = require('path');

// MSIX（商店版）会把 APPDATA / LOCALAPPDATA 重定向到包私有目录，
// 检索必须访问真实用户目录（USERPROFILE 不受重定向影响），
// 否则商店版会找不到开始菜单快捷方式 / npm 全局包 / %LOCALAPPDATA%\Programs。
/**
 * 归一化环境变量里的 Windows 路径：
 * 去引号/空白、折叠多反斜杠（某些环境 SystemRoot 是 "C:\\WINDOWS"）、正斜杠统一。
 * 环境变量值不可信，拼路径前必须洗一遍。
 */
function normalizeWinPath(s) {
  return String(s || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/[\\/]+/g, '\\');
}

function userHome() {
  const h = process.env.USERPROFILE || process.env.HOME || '';
  return normalizeWinPath(h);
}

function realAppData() {
  const h = userHome();
  if (h) return path.join(h, 'AppData', 'Roaming');
  return process.env.APPDATA || '';
}

function realLocalAppData() {
  const h = userHome();
  if (h) return path.join(h, 'AppData', 'Local');
  return process.env.LOCALAPPDATA || '';
}

/** 用于给子进程（npm 等）注入真实路径的环境变量覆盖 */
function realPathsEnv(base) {
  const env = base || process.env;
  return Object.assign({}, env, {
    APPDATA: realAppData(),
    LOCALAPPDATA: realLocalAppData(),
  });
}

module.exports = { realAppData, realLocalAppData, realPathsEnv, normalizeWinPath };
