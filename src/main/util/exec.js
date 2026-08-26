'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { normalizeWinPath } = require('./realpaths');

// 默认超时：防止卡死的系统命令让扫描/状态永久挂起
const DEFAULT_TIMEOUT = 30000;

/**
 * 系统工具绝对路径解析：用户 PATH 被改坏/被精简时，系统命令仍可用。
 * 环境变量值先归一化（去引号/折叠双反斜杠），否则在异常环境下拼出的路径不可用。
 * 注意：Windows 11 24H2 起 System32\powershell.exe 被移除，必须用
 * WindowsPowerShell\v1.0\powershell.exe（各版本 Windows 均存在）。
 */
const PS_EXE = 'WindowsPowerShell\\v1.0\\powershell.exe';

function sys(name) {
  const sr = normalizeWinPath(process.env.SystemRoot || process.env.WINDIR || '');
  return sr ? path.join(sr, 'System32', name) : name;
}

function sysPowerShell() {
  return sys(PS_EXE);
}

/**
 * 以 execFile 运行命令并捕获 stdout，返回 Promise。
 * 默认隐藏窗口、放宽 maxBuffer、30 秒超时（超时自动杀掉进程）。
 */
function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: DEFAULT_TIMEOUT, ...options },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(String(stdout));
      }
    );
  });
}

/**
 * 通过 cmd.exe 运行一行命令（用于 .cmd/.bat 如 npm）。
 */
function runCmd(commandLine, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'cmd.exe',
      ['/c', commandLine],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: DEFAULT_TIMEOUT, ...options },
      (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(String(stdout));
      }
    );
  });
}

/**
 * PowerShell 脚本输出前缀：强制 UTF-8 输出，
 * 保证中文系统上中文应用名不乱码。
 */
const PS_UTF8_PREFIX = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;\n";

/**
 * 运行 PowerShell 脚本并解析其 JSON 输出。
 * PowerShell 不可用或输出异常时返回 null，由调用方降级处理（不抛错）。
 */
async function runPowerShellJson(script) {
  try {
    const out = await run(sysPowerShell(), [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      PS_UTF8_PREFIX + script,
    ]);
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

module.exports = { run, runCmd, runPowerShellJson, PS_UTF8_PREFIX, sys, sysPowerShell };
