// Ported from existing GAS pure matching/deduplication logic. No GAS APIs or writes.
export function aggregateSourceRows(sourceRows,resultRows,config={}) {
 const LINE_ACCOUNT_NAME_FALLBACKS=config.fallbackNames||{},READER_NAME_OVERRIDES=config.readerOverrides||{};
 const getNameList=()=>new Set(resultRows.slice(1).map(row=>String(row[0]||'').trim()).filter(Boolean));
function normalizeLineAccountId_(value) {
  return String(value || '').trim().replace(/^＠/, '@').toLowerCase();
}
function buildLineAccountResolution_(rows) {
  const nameList = getNameList();
  const trie = buildRosterTrie(nameList);
  const candidateSets = {};
  const blankReaderSets = {};

  rows.forEach(function(row, index) {
    const accountId = normalizeLineAccountId_(row[7]);
    if (!accountId) return;

    const rawName = String(row[5] || '').trim();
    if (rawName) {
      const resolvedName = nameList.has(rawName) ? rawName : resolveRosterName(rawName, trie);
      if (!resolvedName) return;
      if (!candidateSets[accountId]) candidateSets[accountId] = new Set();
      candidateSets[accountId].add(resolvedName);
      return;
    }

    if (!blankReaderSets[accountId]) blankReaderSets[accountId] = new Set();
    const readerId = String(row[0] || '').trim();
    blankReaderSets[accountId].add(readerId || ('ROW_' + index));
  });

  const fallbackNames = Object.assign({}, LINE_ACCOUNT_NAME_FALLBACKS);
  Object.keys(candidateSets).forEach(function(accountId) {
    const names = Array.from(candidateSets[accountId]);
    if (!fallbackNames[accountId] && names.length === 1) {
      fallbackNames[accountId] = names[0];
    }
  });

  const issues = [];
  Object.keys(blankReaderSets).forEach(function(accountId) {
    if (fallbackNames[accountId]) return;
    const candidates = candidateSets[accountId] ? Array.from(candidateSets[accountId]).sort() : [];
    issues.push({
      accountId: accountId,
      count: blankReaderSets[accountId].size,
      status: candidates.length ? '複数候補' : '候補なし',
      candidates: candidates
    });
  });

  return { fallbackNames: fallbackNames, issues: issues };
}
function buildRosterTrie(nameList) {var root = {}; nameList.forEach(function(name) {var node = root; for (var i = 0; i < name.length; i++) {var ch = name[i]; if (!node[ch]) node[ch] = {}; node = node[ch];} node.__end = name;}); return root;}
function resolveRosterName(rawName, trie) {if (!rawName) return null; var node = trie; var lastMatch = null; for (var i = 0; i < rawName.length; i++) {var ch = rawName[i]; if (!node[ch]) break; node = node[ch]; if (node.__end) lastMatch = node.__end;} return lastMatch;}
function readFromSource() {
  const rows = sourceRows;
  const accountResolution = buildLineAccountResolution_(rows);

  const TRACKING_START_YM = '2026-02';
  const nameList = getNameList();
  const trie = buildRosterTrie(nameList);
  const selectedByReader = new Map();
  const withoutReaderId = [];

  function normalizeIdentity_(value, lowerCase) {
    let normalized = String(value || '');
    if (normalized.normalize) normalized = normalized.normalize('NFKC');
    normalized = normalized.trim();
    return lowerCase ? normalized.toLowerCase() : normalized;
  }

  function resolveCandidate_(row, sourceIndex) {
    const readerId = String(row[0] || '').trim();
    const rawName = String(row[5] || '').trim();
    const ts = String(row[6] || '');
    const lineAccountId = normalizeLineAccountId_(row[7]);

    // 確認済みの読者ID指定を最優先する。
    const overrideName = READER_NAME_OVERRIDES[readerId];
    if (overrideName && nameList.has(overrideName)) {
      return { name: overrideName, ts: ts, quality: 3, sourceIndex: sourceIndex };
    }

    // 登録経路に有効な生徒名が入っている行を確定情報として扱う。
    if (rawName) {
      const resolvedName = nameList.has(rawName) ? rawName : resolveRosterName(rawName, trie);
      if (resolvedName) {
        return { name: resolvedName, ts: ts, quality: 2, sourceIndex: sourceIndex };
      }
    }

    // 専用LINE、または候補が一人だけのLINEアカウントは補完情報として使う。
    const fallbackName = accountResolution.fallbackNames[lineAccountId];
    if (fallbackName && nameList.has(fallbackName)) {
      return { name: fallbackName, ts: ts, quality: 1, sourceIndex: sourceIndex };
    }

    return { name: rawName, ts: ts, quality: 0, sourceIndex: sourceIndex };
  }

  function isEarlier_(ts, sourceIndex, currentTs, currentSourceIndex) {
    return ts < currentTs || (ts === currentTs && sourceIndex < currentSourceIndex);
  }

  function createReader_(readerId, candidate, row, sourceIndex) {
    const email = normalizeIdentity_(row[4], true);
    const lineFriendId = normalizeIdentity_(row[1], false);
    const sharedFriendId = normalizeIdentity_(row[2], false);
    return {
      readerId: readerId,
      name: candidate.name,
      quality: candidate.quality,
      ts: candidate.ts,
      sourceIndex: sourceIndex,
      emails: email ? new Set([email]) : new Set(),
      lineFriendIds: lineFriendId ? new Set([lineFriendId]) : new Set(),
      sharedFriendIds: sharedFriendId ? new Set([sharedFriendId]) : new Set()
    };
  }

  function addRowIdentities_(reader, row) {
    const email = normalizeIdentity_(row[4], true);
    const lineFriendId = normalizeIdentity_(row[1], false);
    const sharedFriendId = normalizeIdentity_(row[2], false);
    if (email) reader.emails.add(email);
    if (lineFriendId) reader.lineFriendIds.add(lineFriendId);
    if (sharedFriendId) reader.sharedFriendIds.add(sharedFriendId);
  }

  rows.forEach(function(row, sourceIndex) {
    const readerId = String(row[0] || '').trim();
    const ts = String(row[6] || '');
    if (ts.length < 7 || ts.substring(0, 7) < TRACKING_START_YM) return;

    const candidate = resolveCandidate_(row, sourceIndex);
    if (!readerId) {
      withoutReaderId.push(createReader_('', candidate, row, sourceIndex));
      return;
    }

    const current = selectedByReader.get(readerId);
    if (!current) {
      selectedByReader.set(readerId, createReader_(readerId, candidate, row, sourceIndex));
      return;
    }

    // 生徒名は最も確度が高い情報を採用する。
    if (candidate.quality > current.quality) {
      current.name = candidate.name;
      current.quality = candidate.quality;
    }

    // 同じ読者は最初にリストインした日時へ寄せる。
    if (isEarlier_(ts, sourceIndex, current.ts, current.sourceIndex)) {
      current.ts = ts;
      current.sourceIndex = sourceIndex;
    }
    addRowIdentities_(current, row);
  });

  const readers = Array.from(selectedByReader.values()).concat(withoutReaderId);
  const parents = readers.map(function(_, index) { return index; });

  function findRoot_(index) {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }

  function union_(left, right) {
    const leftRoot = findRoot_(left);
    const rightRoot = findRoot_(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  }

  // 異なる生徒間は統合しない。生徒名と安定識別子の組み合わせで同一人物を束ねる。
  const identityOwner = new Map();
  readers.forEach(function(reader, index) {
    if (!nameList.has(reader.name)) return;
    [
      ['EMAIL', reader.emails],
      ['LINE_FRIEND', reader.lineFriendIds],
      ['SHARED_FRIEND', reader.sharedFriendIds]
    ].forEach(function(identityGroup) {
      const identityType = identityGroup[0];
      identityGroup[1].forEach(function(value) {
        const identityKey = JSON.stringify([reader.name, identityType, value]);
        if (identityOwner.has(identityKey)) {
          union_(index, identityOwner.get(identityKey));
        } else {
          identityOwner.set(identityKey, index);
        }
      });
    });
  });

  // 同一人物のグループでは最初のリストインだけを残す。
  const selectedPeople = new Map();
  readers.forEach(function(reader, index) {
    const root = findRoot_(index);
    const current = selectedPeople.get(root);
    if (!current || isEarlier_(reader.ts, reader.sourceIndex, current.ts, current.sourceIndex)) {
      selectedPeople.set(root, reader);
    }
  });

  return Array.from(selectedPeople.values())
    .sort(function(a, b) { return a.sourceIndex - b.sourceIndex; })
    .map(function(item) { return [item.name, item.ts]; });
}
 return readFromSource();
}
