(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FutbolLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function cleanWhatsAppPrefix(value) {
    return value
      .replace(/^\s*(?:[-–—•*✓✅☑️⚽]+\s*)+/, '')
      .replace(/^\s*\d{1,2}\s*[.)\-:]\s*/, '')
      .replace(/^\s*\[[xX ]\]\s*/, '')
      .trim();
  }

  function parseLine(raw, lineNumber) {
    var source = cleanWhatsAppPrefix(raw);
    if (!source || /^(titulares|suplentes|confirmados|lista|equipo)\s*:?'?$/i.test(source)) return null;
    var absent = /(?:^|\s)(AUS|AUSENTE)(?:$|\s)/i.test(source);
    source = source.replace(/(?:^|\s)(AUS|AUSENTE)(?=$|\s)/ig, ' ');
    var roleMatch = source.match(/(?:^|\s)(ARQ|ARQUERO|DEF|DEFENSOR)(?=$|\s)/i);
    var role = null;
    if (roleMatch) {
      role = /^ARQ/i.test(roleMatch[1]) ? 'ARQ' : 'DEF';
      source = source.replace(roleMatch[0], ' ');
    }
    // Limpia etiquetas y niveles de la versión anterior sin exigirlos al usuario.
    source = source.replace(/(?:^|\s)(MED|DEL)(?=$|\s)/ig, ' ');
    source = source.replace(/(?:^|[\s|,;])([1-5])(?:\/5)?(?=$|[\s|,;])/g, ' ');
    var name = source.replace(/[|;,]+/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      id: 'p' + lineNumber + '-' + name.toLocaleLowerCase('es').replace(/[^a-z0-9áéíóúüñ]+/g, '-'),
      name: name,
      role: role,
      absent: absent,
      source: raw,
      line: lineNumber
    };
  }

  function parsePlayers(text) {
    return String(text || '').split(/\r?\n/).map(function (line, index) {
      return parseLine(line, index + 1);
    }).filter(Boolean);
  }

  function countByRole(players) {
    return players.reduce(function (counts, player) {
      if (player.role === 'ARQ') counts.ARQ += 1;
      else if (player.role === 'DEF') counts.DEF += 1;
      else counts.LIBRE += 1;
      return counts;
    }, { ARQ: 0, DEF: 0, LIBRE: 0 });
  }

  function splitRoster(players) {
    var active = players.filter(function (p) { return !p.absent; });
    return { starters: active.slice(0, 14), substitutes: active.slice(14), absent: players.filter(function (p) { return p.absent; }) };
  }

  function validateRoster(players) {
    var roster = splitRoster(players);
    var counts = countByRole(roster.starters);
    var errors = [];
    var warnings = [];
    var seen = {};
    players.forEach(function (player) {
      if (!player.name) errors.push('La línea ' + player.line + ' no tiene nombre.');
      var key = player.name.toLocaleLowerCase('es');
      if (seen[key]) errors.push('“' + player.name + '” aparece más de una vez.');
      seen[key] = true;
    });
    if (roster.starters.length < 14) errors.push('Faltan ' + (14 - roster.starters.length) + ' jugadores para completar el 7 vs 7.');
    if (roster.substitutes.length) warnings.push(roster.substitutes.length + ' jugador' + (roster.substitutes.length === 1 ? '' : 'es') + ' queda' + (roster.substitutes.length === 1 ? '' : 'n') + ' como suplente' + (roster.substitutes.length === 1 ? '' : 's') + ' por orden de lista.');
    if (counts.ARQ === 1) warnings.push('Hay un solo ARQ: un equipo tendrá arquero fijo y el otro usará arquero rotativo.');
    if (counts.ARQ === 0) warnings.push('Sin ARQ marcados: ambos equipos usarán arqueros rotativos.');
    if (counts.DEF > 0 && counts.DEF < 4) warnings.push('Hay menos de 4 DEF: se repartirán lo más parejo posible.');
    if (counts.DEF === 0) warnings.push('Sin DEF marcados: el sorteo se hará normalmente, sin puestos fijos.');
    return { valid: errors.length === 0, errors: errors, warnings: warnings, starters: roster.starters, substitutes: roster.substitutes, absent: roster.absent, counts: counts };
  }

  function namesOfTeam(team) {
    return team.map(function (p) { return p.name.toLocaleLowerCase('es'); });
  }

  function buildPairCounts(history) {
    var pairs = {};
    (history || []).slice(0, 8).forEach(function (record, historyIndex) {
      var weight = Math.max(1, 8 - historyIndex);
      [record.teamA, record.teamB].filter(Boolean).forEach(function (team) {
        var names = namesOfTeam(team);
        for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) {
          var key = [names[i], names[j]].sort().join('|');
          pairs[key] = (pairs[key] || 0) + weight;
        }
      });
    });
    return pairs;
  }

  function teammatePenalty(team, pairCounts) {
    var names = namesOfTeam(team);
    var value = 0;
    for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) {
      value += pairCounts[[names[i], names[j]].sort().join('|')] || 0;
    }
    return value;
  }

  function chooseTeams(players, history, randomFn) {
    if (players.length !== 14) throw new Error('El sorteo requiere exactamente 14 titulares.');
    var totalRoles = countByRole(players);
    var pairCounts = buildPairCounts(history);
    var candidates = [];
    var random = randomFn || Math.random;

    function inspect(indices) {
      var selected = {};
      indices.forEach(function (i) { selected[i] = true; });
      var teamA = indices.map(function (i) { return players[i]; });
      var teamB = players.filter(function (_, i) { return !selected[i]; });
      var a = countByRole(teamA);
      var b = countByRole(teamB);
      if (totalRoles.ARQ >= 2 && Math.abs(a.ARQ - b.ARQ) > 1) return;
      if (totalRoles.DEF >= 4 && (a.DEF < 2 || b.DEF < 2)) return;
      var roleGap = Math.abs(a.ARQ - b.ARQ) * 2 + Math.abs(a.DEF - b.DEF);
      var repeatPenalty = teammatePenalty(teamA, pairCounts) + teammatePenalty(teamB, pairCounts);
      candidates.push({ teamA: teamA, teamB: teamB, score: roleGap * 30 + repeatPenalty * 1.5 + random(), roleGap: roleGap, repeatPenalty: repeatPenalty });
    }

    function combinations(start, chosen) {
      if (chosen.length === 7) { inspect(chosen); return; }
      for (var i = start; i <= players.length - (7 - chosen.length); i++) {
        if (chosen.length === 0 && i !== 0) break;
        chosen.push(i); combinations(i + 1, chosen); chosen.pop();
      }
    }
    combinations(0, []);
    if (!candidates.length) throw new Error('No se pudo formar una combinación válida.');
    candidates.sort(function (a, b) { return a.score - b.score; });
    var ceiling = candidates[0].score + 4;
    var elite = candidates.filter(function (item) { return item.score <= ceiling; }).slice(0, 20);
    var chosen = elite[Math.floor(random() * elite.length)] || candidates[0];
    chosen.teamA = chosen.teamA.slice().sort(sortTeam);
    chosen.teamB = chosen.teamB.slice().sort(sortTeam);
    return chosen;
  }

  function sortTeam(a, b) {
    var order = { ARQ: 0, DEF: 1 };
    return (order[a.role] == null ? 2 : order[a.role]) - (order[b.role] == null ? 2 : order[b.role]) || a.name.localeCompare(b.name, 'es');
  }

  function nextWednesdayISO(fromDate) {
    var date = fromDate ? new Date(fromDate) : new Date();
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    date.setDate(date.getDate() + ((3 - date.getDay() + 7) % 7));
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function formatRoster(players) {
    return players.map(function (p, index) { return (index + 1) + '. ' + p.name + (p.role ? ' ' + p.role : '') + (p.absent ? ' AUS' : ''); }).join('\n');
  }

  return { parseLine: parseLine, parsePlayers: parsePlayers, countByRole: countByRole, splitRoster: splitRoster, validateRoster: validateRoster, chooseTeams: chooseTeams, nextWednesdayISO: nextWednesdayISO, formatRoster: formatRoster };
});
