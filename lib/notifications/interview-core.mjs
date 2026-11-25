// Pure logic ported from the live GAS source.
const InterviewCore=(function () {
  'use strict';
  function nfkc(value) { return String(value == null ? '' : value).normalize('NFKC'); }
  function nameKey(value) { return nfkc(value).replace(/[\s\u3000]+/g, ''); }
  function emailKey(value) { return nfkc(value).trim().toLowerCase(); }
  function accountKey(value) {
    var match = nfkc(value).toLowerCase().match(/@[a-z0-9_]+/);
    return match ? match[0] : '';
  }
  function slotKey(value) {
    var text = nfkc(value).replace(/\u00a0/g, ' ');
    var match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2}).*?(\d{1,2}):(\d{2})/);
    if (!match) return '';
    var y = +match[1], m = +match[2], d = +match[3], h = +match[4], minute = +match[5];
    var date = new Date(Date.UTC(y, m - 1, d, h, minute));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d || h > 23 || minute > 59) return '';
    return match[1] + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + ' ' + String(h).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
  function reservationKey(account, slot, email) { return JSON.stringify([accountKey(account), slotKey(slot), emailKey(email)]); }

  function aggregate(input) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Invalid target month');
    var statusBasis = input.statusBasis || 'utage';
    if (!['sheet', 'utage'].includes(statusBasis)) throw new Error('Invalid status basis');
    var roster = new Map(input.roster.map(function (name) { return [nameKey(name), String(name).trim()]; }));
    var rosterKeys = Array.from(roster.keys()).sort(function (a, b) { return b.length - a.length; });
    function canonical(value) {
      var key = nameKey(value);
      if (roster.has(key)) return roster.get(key);
      var prefix = rosterKeys.find(function (name) { return key.startsWith(name); });
      return prefix ? roster.get(prefix) : '';
    }
    var sources = input.sourceRows || [];
    var readerNames = new Map(), byEmail = new Map(), byName = new Map(), accountNames = new Map();
    function add(map, key, value) { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(value); }
    sources.forEach(function (row) {
      var owner = canonical(row[5]);
      add(readerNames, String(row[0] || ''), owner);
      add(accountNames, accountKey(row[7]), owner);
      add(byEmail, emailKey(row[4]), row);
      add(byName, nameKey(row[3]), row);
    });
    if (input.accountOwners) Object.keys(input.accountOwners).forEach(function (account) {
      Object.keys(input.accountOwners[account].names || {}).forEach(function (name) {
        add(accountNames, accountKey(account), canonical(name));
      });
    });
    var fallbacks = input.confirmedAccountFallbacks || {};
    function sourceOwner(row) {
      var override = (input.readerOverrides || {})[String(row[0] || '')];
      if (override && canonical(override)) return canonical(override);
      var owner = canonical(row[5]);
      if (owner) return owner;
      var candidates = unique(readerNames.get(String(row[0] || '')) || []);
      if (candidates.length === 1) return candidates[0];
      var account = accountKey(row[7]);
      if (fallbacks[account] && canonical(fallbacks[account])) return canonical(fallbacks[account]);
      candidates = unique(accountNames.get(account) || []);
      return candidates.length === 1 ? candidates[0] : '';
    }
    function identify(row, kind) {
      if (kind === 'minako') return canonical(input.minakoOwner || '');
      var account = accountKey(row[0]), slot = slotKey(row[1]);
      function timely(rows) {
        return rows.filter(function (source) {
          var registered = slotKey(source[6]);
          return !source[6] || !registered || registered <= slot;
        });
      }
      var emails = timely(byEmail.get(emailKey(row[4])) || []);
      var names = timely(byName.get(nameKey(row[2])) || []);
      var direct = unique(rosterKeys.filter(function (key) { return key.length >= 3 && nameKey(row[0]).includes(key); }).map(function (key) { return roster.get(key); }));
      var candidates = [
        emails.filter(function (source) { return accountKey(source[7]) === account; }),
        names.filter(function (source) { return accountKey(source[7]) === account; }), emails
      ];
      for (var index = 0; index < candidates.length; index++) {
        var owners = unique(candidates[index].map(sourceOwner));
        if (owners.length === 1) return direct.length === 1 && direct[0] !== owners[0] ? '' : owners[0];
      }
      if (direct.length === 1) return direct[0];
      if (fallbacks[account] && canonical(fallbacks[account])) return canonical(fallbacks[account]);
      var accountOwners = unique(accountNames.get(account) || []);
      if (accountOwners.length === 1) return accountOwners[0];
      var globalOwners = unique(names.map(sourceOwner));
      if (globalOwners.length === 1 && accountOwners.includes(globalOwners[0])) return globalOwners[0];
      return '';
    }

    var statuses = new Map();
    (input.statuses || []).forEach(function (item) {
      if (!accountKey(item.account) || !slotKey(item.slot) || !emailKey(item.email)) return;
      add(statuses, reservationKey(item.account, item.slot, item.email), String(item.status).trim());
    });
    var groups = new Map(), sourceSheetRows = 0;
    Object.keys(input.reservations).forEach(function (kind) {
      input.reservations[kind].slice(1).forEach(function (row, index) {
        var slot = slotKey(row[1]);
        if (!slot || !slot.startsWith(input.month + '-')) return;
        sourceSheetRows++;
        var key = reservationKey(row[0], row[1], row[4]);
        // Missing identifiers cannot identify two records as the same reservation.
        if (!accountKey(row[0]) || !emailKey(row[4])) key += ':' + kind + ':' + (index + 2);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ kind: kind, row: index + 2, values: row });
      });
    });
    var audit = [];
    groups.forEach(function (group) {
      var latest = group.slice().sort(function (a, b) {
        var left = slotKey(a.values[9]) || String(a.values[9] || '');
        var right = slotKey(b.values[9]) || String(b.values[9] || '');
        return left < right ? 1 : left > right ? -1 : b.row - a.row;
      })[0];
      var row = latest.values;
      var entry = { kind: latest.kind, row: latest.row, duplicateRows: group.length - 1 };
      var test = row.some(function (value) { return /テスト|練習/.test(String(value)); }) || [2, 3, 8].some(function (index) { return /(^|\s)test(\s|\d|$)/i.test(String(row[index] || '')); });
      var values = statuses.get(reservationKey(row[0], row[1], row[4])) || [];
      var active = values.includes('参加予定') || values.includes('参加済み');
      var cancelled = values.some(function (value) { return value.includes('キャンセル'); });
      if (test) entry.result = 'test';
      else if (statusBasis === 'utage' && cancelled && !active) entry.result = 'utage_cancelled';
      else if (['キャンセル', 'お断り', '面談辞退'].includes(String(row[10] || '').trim())) entry.result = 'sheet_cancelled_or_declined';
      else if ((statusBasis === 'utage' && !active) || !accountKey(row[0]) || !emailKey(row[4])) entry.result = 'participation_unconfirmed';
      else {
        entry.name = identify(row, latest.kind);
        entry.result = entry.name ? 'counted' : 'attribution_unconfirmed';
        if (entry.name) entry.identity = JSON.stringify([emailKey(row[4]), slotKey(row[1])]);
      }
      audit.push(entry);
    });
    var peopleAtSlot = new Map();
    audit.filter(function (entry) { return entry.result === 'counted'; }).forEach(function (entry) { add(peopleAtSlot, entry.identity, entry); });
    peopleAtSlot.forEach(function (entries) {
      var owners = unique(entries.map(function (entry) { return entry.name; }));
      entries.forEach(function (entry, index) {
        if (owners.length > 1) entry.result = 'attribution_unconfirmed';
        else if (index > 0) entry.result = 'duplicate_across_accounts';
      });
    });
    var hidden = new Set((input.hiddenNames || []).map(nameKey));
    audit.forEach(function (entry) {
      if (entry.result === 'counted' && hidden.has(nameKey(entry.name))) entry.result = 'existing_display_exclusion';
      delete entry.identity;
    });
    var decisions = {}, counts = new Map();
    audit.forEach(function (entry) {
      decisions[entry.result] = (decisions[entry.result] || 0) + 1;
      if (entry.result === 'counted') counts.set(entry.name, (counts.get(entry.name) || 0) + 1);
    });
    decisions.counted = decisions.counted || 0;
    var students = Array.from(counts, function (item) { return { name: item[0], count: item[1] }; }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'ja'); });
    var total = students.reduce(function (sum, item) { return sum + item.count; }, 0);
    var duplicateSheetRowsRemoved = audit.reduce(function (sum, entry) { return sum + entry.duplicateRows; }, 0);
    if (total !== decisions.counted || sourceSheetRows !== audit.length + duplicateSheetRowsRemoved) throw new Error('Reservation totals do not reconcile');
    return { month: input.month, statusBasis: statusBasis, sourceSheetRows: sourceSheetRows, uniqueSheetSlots: audit.length,
      duplicateSheetRowsRemoved: duplicateSheetRowsRemoved, decisions: decisions, students: students, audit: audit };
  }
  return { aggregate: aggregate, slotKey: slotKey, accountKey: accountKey, reservationKey: reservationKey, nameKey: nameKey };
})();
export default InterviewCore;
