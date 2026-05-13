'use strict';
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./util');

function getUserSkillsDir() {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return null;
  return path.join(ws, 'user-skills');
}

function getRegistryPath() {
  const dir = getUserSkillsDir();
  return dir ? path.join(dir, '_registry.json') : null;
}

function readRegistry() {
  const p = getRegistryPath();
  if (!p) return { version: 1, skills: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) {
      const tmps = fs.readdirSync(dir).filter(f => f.startsWith('_registry.json.tmp.'));
      for (const tmp of tmps.sort().reverse()) {
        try {
          const recovered = JSON.parse(fs.readFileSync(path.join(dir, tmp), 'utf-8'));
          fs.writeFileSync(p, JSON.stringify(recovered, null, 2), 'utf-8');
          console.warn('[skill-manager] recovered registry from', tmp);
          try { fs.unlinkSync(path.join(dir, tmp)); } catch {}
          return recovered;
        } catch {}
      }
    }
    console.error('[skill-manager] registry corrupt:', e.message);
    try {
      const logDir = path.join(path.dirname(dir), 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'skill-errors.log'),
        `${new Date().toISOString()} registry corrupt: ${e.message}\n`, 'utf-8');
    } catch {}
    return { version: 1, skills: [] };
  }
}

function writeRegistry(registry) {
  const p = getRegistryPath();
  if (!p) return;
  writeJsonAtomic(p, registry);
}

let _skillWriteChain = Promise.resolve();
async function withSkillLock(fn) {
  let release;
  const gate = new Promise(r => { release = r; });
  const prev = _skillWriteChain;
  _skillWriteChain = gate;
  await prev;
  try { return await fn(); } finally { release(); }
}

function slugify(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || ('skill-' + Date.now());
}

function getShippedSkillIds() {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return new Set();
  const skillsDir = path.join(ws, 'skills');
  const ids = new Set();
  function scan(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_archived') continue;
      if (entry.isDirectory()) scan(path.join(dir, entry.name), (prefix ? prefix + '/' : '') + entry.name);
      else if (entry.name.endsWith('.md')) ids.add((prefix ? prefix + '/' : '') + entry.name.replace(/\.md$/, ''));
    }
  }
  scan(skillsDir, '');
  return ids;
}

function validateNoCollision(id) {
  const shipped = getShippedSkillIds();
  if (shipped.has(id)) return `Skill id "${id}" conflicts with a shipped skill. Choose a different name.`;
  return null;
}

function sanitizeContent(raw) {
  return String(raw || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#+\s/gm, '')
    .slice(0, 500);
}

async function createUserSkill({ name, type, appliesTo, trigger, content, createdVia }) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    if (registry.skills.length >= 100) throw new Error('Too many skills (max 100). Delete some first.');

    const id = slugify(name);
    const collision = validateNoCollision(id);
    if (collision) throw new Error(collision);
    if (registry.skills.find(s => s.id === id)) throw new Error(`Skill "${id}" already exists.`);

    const dir = getUserSkillsDir();
    if (!dir) throw new Error('Workspace not available');

    const sanitized = sanitizeContent(content);
    const mdContent = `# ${String(name).replace(/^#+\s/gm, '')}\n\n## Khi nào áp dụng\n${String(trigger || '').replace(/^#+\s/gm, '')}\n\n## Nội dung\n${sanitized}\n`;
    fs.writeFileSync(path.join(dir, id + '.md'), mdContent, 'utf-8');

    const entry = {
      id,
      name: String(name),
      type: type || 'custom',
      appliesTo: Array.isArray(appliesTo) ? appliesTo : [],
      trigger: String(trigger || ''),
      summary: sanitized.slice(0, 120),
      enabled: true,
      createdAt: new Date().toISOString(),
      createdVia: createdVia || 'telegram-chat',
    };
    registry.skills.push(entry);
    writeRegistry(registry);
    return entry;
  });
}

async function updateUserSkill(id, updates) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    const idx = registry.skills.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Skill "${id}" not found.`);

    const skill = registry.skills[idx];
    if (updates.name !== undefined) skill.name = String(updates.name);
    if (updates.type !== undefined) skill.type = updates.type;
    if (updates.appliesTo !== undefined) skill.appliesTo = Array.isArray(updates.appliesTo) ? updates.appliesTo : [];
    if (updates.trigger !== undefined) skill.trigger = String(updates.trigger);

    if (updates.content !== undefined) {
      const dir = getUserSkillsDir();
      const sanitized = sanitizeContent(updates.content);
      const mdContent = `# ${skill.name}\n\n## Khi nào áp dụng\n${skill.trigger}\n\n## Nội dung\n${sanitized}\n`;
      fs.writeFileSync(path.join(dir, id + '.md'), mdContent, 'utf-8');
      skill.summary = sanitized.slice(0, 120);
    }
    writeRegistry(registry);
    return skill;
  });
}

async function deleteUserSkill(id) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    const idx = registry.skills.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Skill "${id}" not found.`);
    registry.skills.splice(idx, 1);
    writeRegistry(registry);
    const dir = getUserSkillsDir();
    const mdPath = path.join(dir, id + '.md');
    try { if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath); } catch {}
    return { deleted: id };
  });
}

async function toggleUserSkill(id, enabled) {
  return withSkillLock(async () => {
    const registry = readRegistry();
    const skill = registry.skills.find(s => s.id === id);
    if (!skill) throw new Error(`Skill "${id}" not found.`);
    skill.enabled = !!enabled;
    writeRegistry(registry);
    return skill;
  });
}

function listUserSkills() {
  return readRegistry().skills;
}

function getUserSkillContent(id) {
  const dir = getUserSkillsDir();
  if (!dir) return null;
  const p = path.join(dir, id + '.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function checkConflict({ content, appliesTo, trigger }) {
  const registry = readRegistry();
  const activeSkills = registry.skills.filter(s => s.enabled);
  const conflicts = [];
  const newWords = new Set((content + ' ' + trigger).toLowerCase().split(/\s+/).filter(w => w.length > 2));

  for (const skill of activeSkills) {
    const reasons = [];
    if (appliesTo && appliesTo.length > 0 && skill.appliesTo && skill.appliesTo.length > 0) {
      const overlap = appliesTo.filter(a => skill.appliesTo.includes(a));
      if (overlap.length > 0) {
        const skillWords = new Set((skill.summary + ' ' + skill.trigger).toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const common = [...newWords].filter(w => skillWords.has(w));
        if (common.length >= 2) reasons.push(`Same target (${overlap.join(', ')}) with overlapping keywords: ${common.slice(0, 5).join(', ')}`);
      }
    }
    if (trigger && skill.trigger && trigger.toLowerCase() === skill.trigger.toLowerCase()) {
      reasons.push('Identical trigger pattern');
    }
    if (reasons.length > 0) conflicts.push({ skillId: skill.id, skillName: skill.name, reasons });
  }
  return conflicts;
}

function listShippedSkills() {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return [];
  const skillsDir = path.join(ws, 'skills');
  const results = [];
  const categoryMap = {
    operations: 'Vận hành', marketing: 'Marketing', content: 'Nội dung',
    finance: 'Tài chính', strategy: 'Chiến lược',
    'image-templates': 'Mẫu hình ảnh',
  };

  function scan(dir, category) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_archived' || entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), categoryMap[entry.name] || entry.name);
      } else if (entry.name.endsWith('.md')) {
        const filePath = path.join(dir, entry.name);
        let name = entry.name.replace(/\.md$/, '');
        try {
          const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n').find(l => l.trim());
          if (firstLine) name = firstLine.replace(/^#+\s*/, '').trim() || name;
        } catch {}
        results.push({
          id: (category && category !== 'Ngành' ? path.basename(dir) + '/' : '') + entry.name.replace(/\.md$/, ''),
          name,
          category: category || 'Ngành',
          source: 'shipped',
        });
      }
    }
  }
  scan(skillsDir, '');
  return results;
}

function getShippedSkillContent(relPath) {
  const { getWorkspace } = require('./workspace');
  const ws = getWorkspace();
  if (!ws) return null;
  const skillsDir = path.join(ws, 'skills');
  const p = path.resolve(skillsDir, relPath + '.md');
  if (!p.startsWith(skillsDir + path.sep) && p !== skillsDir) return null;
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

module.exports = {
  createUserSkill, updateUserSkill, deleteUserSkill, toggleUserSkill,
  listUserSkills, getUserSkillContent,
  checkConflict,
  listShippedSkills, getShippedSkillContent,
  slugify, getUserSkillsDir,
};
