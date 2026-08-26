'use strict';

const path = require('path');

// MSIX（商店版）会把 APPDATA / LOCALAPPDATA 重定向到包私有目录，
// 检索必须访问真实用户目录（USERPROFILE 不受重定向影响），
// 否则商店版会找不到开始菜单快捷方式 / npm 全局包 / %LOCALAPPDATA%\Programs。
function userHome() {
  return process.env.USERPROFILE || process.env.HOME || '';
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

module.exports = { realAppData, realLocalAppData, realPathsEnv };
