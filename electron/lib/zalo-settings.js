function entryToZaloId(entry) {
  if (entry && typeof entry === 'object') {
    if (entry.id !== undefined && entry.id !== null) return entry.id;
    if (entry.userId !== undefined && entry.userId !== null) return entry.userId;
    if (entry.uid !== undefined && entry.uid !== null) return entry.uid;
    if (entry.userKey !== undefined && entry.userKey !== null) return entry.userKey;
  }
  return entry;
}

function normalizeZaloBlocklist(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const id = String(entryToZaloId(entry) ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function sameStringArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function resolveZaloBlocklistSave({ existingBlocklist, incomingBlocklist, userBlocklistTouched }) {
  const existing = normalizeZaloBlocklist(existingBlocklist);
  if (!Array.isArray(incomingBlocklist)) {
    return { blocklist: existing, shouldWrite: false, preservedExisting: false };
  }

  const incoming = normalizeZaloBlocklist(incomingBlocklist);
  if (existing.length > 0 && incoming.length === 0 && userBlocklistTouched !== true) {
    return { blocklist: existing, shouldWrite: false, preservedExisting: true };
  }

  return {
    blocklist: incoming,
    shouldWrite: !sameStringArray(existing, incoming),
    preservedExisting: false,
  };
}

module.exports = {
  normalizeZaloBlocklist,
  resolveZaloBlocklistSave,
};
