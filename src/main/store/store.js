'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 简单的 JSON 持久化存储。
 * 保存用户的应用列表与设置，文件位于 userData 目录下 config.json。
 */
class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { version: 1, entries: [], settings: {} };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data = {
          version: 1,
          entries: Array.isArray(parsed.entries) ? parsed.entries : [],
          settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
          instances: Array.isArray(parsed.instances) ? parsed.instances : [],
        };
      }
    } catch (e) {
      // 首次运行或文件损坏：使用默认值，不中断启动
      this.data = { version: 1, entries: [], settings: {}, instances: [] };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (e) {
      console.error('[store] save failed:', e);
    }
  }

  get entries() {
    return this.data.entries;
  }

  get settings() {
    return this.data.settings;
  }

  get instances() {
    if (!Array.isArray(this.data.instances)) this.data.instances = [];
    return this.data.instances;
  }

  addInstance(inst) {
    this.instances.push(inst);
    this.save();
  }

  removeInstance(id) {
    this.data.instances = this.instances.filter((i) => i.id !== id);
    this.save();
  }

  pruneInstances(keepIds) {
    const keep = new Set(keepIds);
    const before = this.instances.length;
    this.data.instances = this.instances.filter((i) => keep.has(i.id));
    if (this.instances.length !== before) this.save();
  }

  removeInstancesForEntry(entryId) {
    const before = this.instances.length;
    this.data.instances = this.instances.filter((i) => i.entryId !== entryId);
    if (this.instances.length !== before) this.save();
  }

  getSetting(key, def) {
    return this.data.settings[key] !== undefined ? this.data.settings[key] : def;
  }

  setSetting(key, val) {
    this.data.settings[key] = val;
    this.save();
  }

  findEntry(id) {
    return this.data.entries.find((e) => e.id === id) || null;
  }

  addEntry(entry) {
    if (this.data.entries.some((e) => e.id === entry.id)) return;
    this.data.entries.push(entry);
    this.save();
  }

  updateEntry(id, patch) {
    const entry = this.findEntry(id);
    if (!entry) return;
    Object.assign(entry, patch);
    this.save();
  }

  removeEntry(id) {
    this.data.entries = this.data.entries.filter((e) => e.id !== id);
    this.save();
  }

  setEntries(entries) {
    this.data.entries = entries;
    this.save();
  }
}

module.exports = { Store };
