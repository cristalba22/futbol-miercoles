(function () {
  'use strict';
  var logic = window.FutbolLogic;
  var STORAGE_KEY = 'futbolMiercoles_v2';
  var LEGACY_KEY = 'futbolMiercolesHistory_v1';
  var ROSTER_KEY = 'futbolMiercoles_roster';
  var VENUE_KEY = 'futbolMiercoles_venue';
  var THEME_KEY = 'futbolMiercoles_theme';
  var SOUND_KEY = 'futbolMiercoles_sound';
  var currentDraw = null;
  var toastTimer = null;
  var lastImageBlob = null;
  var lastImageUrl = null;
  var soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  var audioContext = null;
  var $ = function (id) { return document.getElementById(id); };
  var playersEl = $('players');
  var drawBtn = $('drawBtn');
  var validationBox = $('validationBox');
  var resultSection = $('resultSection');

  var CHIQUI_QUOTES = [
    'Ojo con el Equipo {team}: tiene más humo que vestuario en invierno.',
    'El sorteo habló. Ahora falta que hablen adentro de la cancha.',
    'Mucho nombre, mucha promesa… veremos quién corre cuando van perdiendo.',
    'Este partido tiene pinta de empate y discusión hasta el miércoles que viene.',
    'Cuidado con el Equipo {team}: silencioso, pero con olor a batacazo.',
    'Los equipos están parejos. Las excusas también.',
    'Hoy no gana el mejor: gana el que vuelva a marcar después de perderla.',
    'Hay talento de sobra. Estado físico, no tanto.'
  ];
  var LIVE_PHRASES = [
    'Acá no se discute el sorteo, se discute quién paga la cancha.',
    'El que llega último ataja. Estatuto número uno del potrero.',
    'Hay equipo. Lo que falta confirmar es si hay piernas.',
    'La táctica es simple: correr hasta que alguno pida el cambio.',
    'El VAR está chequeando quién todavía debe la cancha.',
    'Pelota que pasa, jugador que también. No compliquemos.',
    'Hoy se juega lindo. O por lo menos se intenta.',
    'El tercer tiempo ya está confirmado; falta confirmar el fútbol.',
    'Prohibido pedir falta después de perderla solo.',
    'La camiseta transpira más que algunos jugadores.',
    'Si la pelota se va lejos, la busca el que la tiró. Es ley.',
    'Los pingos se ven en la cancha… y los jueves en el grupo.',
    'Mucho botín nuevo. Esperemos que venga con fútbol incluido.',
    'El 2–0 es el resultado más peligroso, sobre todo si vas perdiendo.',
    'Hoy hay promesa de buen fútbol. La promesa no está certificada.',
    'Sin suplentes no hay cansancio: hay estrategia de ahorro.',
    'El Chiqui Mafia recuerda: caño vale doble solamente en la memoria.',
    'Se ruega no gastar todos los goles en la entrada en calor.',
    'El que dice “una más y voy” ya perdió la marca.',
    'Puntualidad inglesa, definición argentina.',
    'La pelota siempre al diez. Si no hay diez, al que esté libre.',
    'Hoy se marca en zona: la zona más cercana a la sombra.',
    'Hay dos equipos parejos y catorce opiniones distintas.',
    'El fútbol da revancha. El grupo de WhatsApp no perdona.'
  ];
  var livePhraseIndex = Math.floor(Math.random() * LIVE_PHRASES.length);
  var livePhraseTimer = null;

  function loadHistory() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length) return saved;
      return migrateLegacy();
    } catch (_) { return []; }
  }

  function migrateLegacy() {
    try {
      var old = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      if (!Array.isArray(old) || !old.length) return [];
      var migrated = old.map(function (record, index) {
        var teams = record.teams || [];
        var scoreA = null, scoreB = null;
        if (record.winnerIndex === 0) { scoreA = Number(record.diff || 1); scoreB = 0; }
        if (record.winnerIndex === 1) { scoreA = 0; scoreB = Number(record.diff || 1); }
        if (record.winnerIndex === null) { scoreA = 0; scoreB = 0; }
        return { id: 'legacy-' + index + '-' + record.date, date: record.date, createdAt: record.savedAt || new Date().toISOString(), updatedAt: record.savedAt || new Date().toISOString(), status: 'played', teamA: normalisePlayers((teams[0] && teams[0].players) || []), teamB: normalisePlayers((teams[1] && teams[1].players) || []), substitutes: [], venue: '', quote: '', scoreA: scoreA, scoreB: scoreB };
      });
      saveHistory(migrated);
      return migrated;
    } catch (_) { return []; }
  }

  function normalisePlayers(players) {
    return players.map(function (p, i) {
      var role = p.role === 'ARQ' || p.role === 'DEF' ? p.role : null;
      return { id: p.id || ('saved-' + i + '-' + p.name), name: p.name, role: role, absent: false };
    });
  }

  function saveHistory(history) { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); }
  function getRosterState() { var players = logic.parsePlayers(playersEl.value); return { players: players, validation: logic.validateRoster(players) }; }

  function renderRosterState() {
    var state = getRosterState();
    var validation = state.validation;
    var count = $('playerCount');
    count.textContent = validation.starters.length + ' / 14 titulares' + (validation.substitutes.length ? ' · ' + validation.substitutes.length + ' SUP' : '');
    count.className = 'counter' + (validation.starters.length === 14 ? ' ok' : '');
    $('rosterSummary').innerHTML = [
      summaryChip(validation.counts.ARQ, 'Arqueros'), summaryChip(validation.counts.DEF, 'Defensores'),
      summaryChip(validation.counts.LIBRE, 'Libres'), summaryChip(validation.substitutes.length, 'Suplentes')
    ].join('');
    validationBox.innerHTML = '';
    validation.errors.forEach(function (message) { addValidation(message, 'error', '×'); });
    validation.warnings.forEach(function (message) { addValidation(message, '', '!'); });
    if (validation.valid) addValidation('Lista lista: se arman dos equipos de 7.', 'ok', '✓');
    drawBtn.disabled = !validation.valid;
    localStorage.setItem(ROSTER_KEY, playersEl.value);
  }

  function summaryChip(value, label) { return '<div class="summary-chip"><b>' + value + '</b><span>' + label + '</span></div>'; }
  function addValidation(message, className, icon) {
    var row = document.createElement('div'); row.className = 'validation-message ' + className;
    var symbol = document.createElement('b'); symbol.textContent = icon;
    var text = document.createElement('span'); text.textContent = message;
    row.append(symbol, text); validationBox.appendChild(row);
  }

  function renderTeam(element, players, variant) {
    element.innerHTML = ''; element.dataset.letter = variant === 'A' ? 'C' : 'O';
    var counts = logic.countByRole(players);
    var kicker = document.createElement('div'); kicker.className = 'team-kicker';
    kicker.innerHTML = '<span>' + (variant === 'A' ? 'CAMISETA CLARA' : 'CAMISETA OSCURA') + '</span><span class="team-rating">7 jugadores</span>';
    var title = document.createElement('h3'); title.textContent = 'Equipo ' + (variant === 'A' ? 'Claro' : 'Oscuro');
    var list = document.createElement('ol'); list.className = 'player-list';
    players.forEach(function (player, index) {
      var item = document.createElement('li');
      var number = document.createElement('span'); number.className = 'shirt-number'; number.textContent = String(index + 1).padStart(2, '0');
      var name = document.createElement('span'); name.className = 'player-name'; name.textContent = player.name;
      item.append(number, name);
      if (player.role) { var role = document.createElement('span'); role.className = 'role-tag'; role.textContent = player.role; item.appendChild(role); }
      list.appendChild(item);
    });
    var footer = document.createElement('div'); footer.className = 'team-kicker'; footer.style.marginTop = '18px'; footer.style.marginBottom = '0'; footer.style.borderBottom = '0';
    footer.innerHTML = '<span>' + counts.DEF + ' DEF</span><span>' + (counts.ARQ ? counts.ARQ + ' ARQ' : 'ARQ rotativo') + '</span>';
    element.append(kicker, title, list, footer);
  }

  function makeChiquiQuote() {
    var template = CHIQUI_QUOTES[Math.floor(Math.random() * CHIQUI_QUOTES.length)];
    return template.replace('{team}', Math.random() < .5 ? 'Claro' : 'Oscuro');
  }

  function showNextLivePhrase(immediate) {
    var phrase = $('livePhrase');
    livePhraseIndex = (livePhraseIndex + 1) % LIVE_PHRASES.length;
    if (immediate) { phrase.textContent = LIVE_PHRASES[livePhraseIndex]; return; }
    phrase.classList.add('changing');
    setTimeout(function () { phrase.textContent = LIVE_PHRASES[livePhraseIndex]; phrase.classList.remove('changing'); }, 180);
  }

  function startLivePhrases() {
    clearInterval(livePhraseTimer);
    livePhraseTimer = setInterval(function () { if (!document.hidden) showNextLivePhrase(false); }, 6200);
  }

  function renderDraw(draw, shouldScroll) {
    currentDraw = { teamA: normalisePlayers(draw.teamA), teamB: normalisePlayers(draw.teamB), substitutes: normalisePlayers(draw.substitutes || []), venue: draw.venue || $('venue').value.trim(), quote: draw.quote || makeChiquiQuote() };
    renderTeam($('teamA'), currentDraw.teamA, 'A'); renderTeam($('teamB'), currentDraw.teamB, 'B');
    var a = logic.countByRole(currentDraw.teamA), b = logic.countByRole(currentDraw.teamB);
    var details = [];
    if (a.ARQ || b.ARQ) details.push(a.ARQ + '–' + b.ARQ + ' arqueros');
    if (a.DEF || b.DEF) details.push(a.DEF + '–' + b.DEF + ' defensores');
    $('balanceText').textContent = details.length ? 'Roles repartidos: ' + details.join(' · ') + '.' : 'Sorteo libre, sin puestos fijos.';
    $('chiquiQuote').textContent = '“' + currentDraw.quote + '”';
    $('matchDate').value = logic.nextWednesdayISO(); $('scoreA').value = ''; $('scoreB').value = ''; $('saveStatus').textContent = '';
    resultSection.hidden = false;
    if (shouldScroll) resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function playLotterySound() {
    if (!soundOn) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      var start = audioContext.currentTime;
      for (var i = 0; i < 11; i++) {
        var osc = audioContext.createOscillator(), gain = audioContext.createGain(), time = start + i * .11;
        osc.type = i % 2 ? 'triangle' : 'square'; osc.frequency.value = 190 + Math.random() * 190;
        gain.gain.setValueAtTime(.0001, time); gain.gain.linearRampToValueAtTime(.055, time + .01); gain.gain.exponentialRampToValueAtTime(.0001, time + .065);
        osc.connect(gain); gain.connect(audioContext.destination); osc.start(time); osc.stop(time + .07);
      }
    } catch (_) {}
  }

  function runDraw() {
    var state = getRosterState();
    if (!state.validation.valid) { renderRosterState(); showToast('Faltan jugadores para completar el 7 vs 7.'); return; }
    drawBtn.disabled = true; resultSection.hidden = true;
    var overlay = $('drawOverlay'); overlay.hidden = false; playLotterySound();
    var phases = ['El Chiqui Mafia mueve los hilos...', 'Repartiendo las camisetas...', 'Midiendo el humo...', 'Cerrando el sorteo...'];
    var phase = 0; $('drawPhase').textContent = phases[0];
    var interval = setInterval(function () { phase = (phase + 1) % phases.length; $('drawPhase').textContent = phases[phase]; }, 380);
    var shortMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      clearInterval(interval);
      try {
        var draw = logic.chooseTeams(state.validation.starters, loadHistory());
        draw.substitutes = state.validation.substitutes; draw.venue = $('venue').value.trim();
        renderDraw(draw, true);
      } catch (error) { showToast(error.message); }
      overlay.hidden = true; drawBtn.disabled = false;
    }, shortMotion ? 250 : 1550);
  }

  function recordForCurrent(status) {
    var date = $('matchDate').value || logic.nextWednesdayISO();
    return { id: 'match-' + date, date: date, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: status, teamA: currentDraw.teamA, teamB: currentDraw.teamB, substitutes: currentDraw.substitutes, venue: currentDraw.venue, quote: currentDraw.quote, scoreA: $('scoreA').value === '' ? null : Number($('scoreA').value), scoreB: $('scoreB').value === '' ? null : Number($('scoreB').value) };
  }

  function upsertRecord(record) {
    var history = loadHistory(), existing = history.findIndex(function (item) { return item.date === record.date; });
    if (existing >= 0) { record.createdAt = history[existing].createdAt; history[existing] = record; } else history.push(record);
    history.sort(function (a, b) { return b.date.localeCompare(a.date); }); saveHistory(history); renderHistory();
  }

  function saveDraw() {
    if (!currentDraw) return;
    var record = recordForCurrent('scheduled'); record.scoreA = null; record.scoreB = null; upsertRecord(record);
    $('saveStatus').textContent = '✓ Sorteo guardado. Podés completar el resultado después.'; showToast('Sorteo guardado');
  }

  function saveResult() {
    if (!currentDraw) return;
    var scoreA = $('scoreA').value, scoreB = $('scoreB').value;
    if (scoreA === '' || scoreB === '') { showToast('Cargá los dos goles.'); return; }
    if (Number(scoreA) < 0 || Number(scoreB) < 0 || Number(scoreA) > 99 || Number(scoreB) > 99) { showToast('El resultado debe estar entre 0 y 99.'); return; }
    upsertRecord(recordForCurrent('played')); $('saveStatus').textContent = '✓ Resultado final guardado.'; showToast('Resultado guardado');
  }

  function formatDate(iso) {
    var parts = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(parts[0], parts[1] - 1, parts[2])).replace(/\./g, '');
  }

  function renderHistory() {
    var history = loadHistory(), list = $('historyList'); list.innerHTML = ''; $('reuseBtn').hidden = history.length === 0;
    ['shareHistoryBtn', 'historyJpgBtn', 'historyPdfBtn'].forEach(function (id) { $(id).disabled = history.length === 0; });
    if (!history.length) { list.innerHTML = '<div class="history-empty">Todavía no hay fechas guardadas. El primer sorteo va a aparecer acá.</div>'; return; }
    history.slice(0, 12).forEach(function (record) {
      var item = document.createElement('div'); item.className = 'history-item';
      var date = document.createElement('div'); date.className = 'history-date'; date.textContent = formatDate(record.date);
      var result = document.createElement('div'); result.className = 'history-result';
      if (record.status === 'played' && record.scoreA != null && record.scoreB != null) result.innerHTML = 'Claro ' + record.scoreA + ' — ' + record.scoreB + ' Oscuro<small>' + winnerLabel(record) + (record.venue ? ' · ' + safeText(record.venue) : '') + '</small>';
      else result.innerHTML = 'Equipo Claro vs Equipo Oscuro<small>Sorteo guardado · resultado pendiente' + (record.venue ? ' · ' + safeText(record.venue) : '') + '</small>';
      var right = document.createElement('div'), badge = document.createElement('span'); badge.className = 'status-badge' + (record.status === 'played' ? ' played' : ''); badge.textContent = record.status === 'played' ? 'JUGADO' : 'PENDIENTE';
      var actions = document.createElement('div'); actions.className = 'history-actions';
      var load = document.createElement('button'); load.className = 'icon-button'; load.type = 'button'; load.textContent = 'Abrir'; load.addEventListener('click', function () { openRecord(record); });
      var remove = document.createElement('button'); remove.className = 'icon-button'; remove.type = 'button'; remove.textContent = 'Eliminar'; remove.addEventListener('click', function () { deleteRecord(record.id); });
      actions.append(load, remove); right.append(badge, actions); item.append(date, result, right); list.appendChild(item);
    });
  }

  function safeText(value) { var span = document.createElement('span'); span.textContent = String(value); return span.innerHTML; }
  function winnerLabel(record) { if (record.scoreA === record.scoreB) return 'Empate'; return (record.scoreA > record.scoreB ? 'Ganó el Equipo Claro' : 'Ganó el Equipo Oscuro') + ' por ' + Math.abs(record.scoreA - record.scoreB); }
  function openRecord(record) {
    renderDraw({ teamA: record.teamA, teamB: record.teamB, substitutes: record.substitutes || [], venue: record.venue || '', quote: record.quote || '' }, true);
    $('matchDate').value = record.date; $('scoreA').value = record.scoreA == null ? '' : record.scoreA; $('scoreB').value = record.scoreB == null ? '' : record.scoreB; $('venue').value = record.venue || '';
    $('saveStatus').textContent = record.status === 'played' ? 'Fecha guardada. Podés corregir el resultado.' : 'Sorteo recuperado del historial.';
  }
  function deleteRecord(id) { saveHistory(loadHistory().filter(function (record) { return record.id !== id; })); renderHistory(); showToast('Fecha eliminada'); }
  function reuseRoster() {
    var history = loadHistory(); if (!history.length) return;
    var record = history[0], players = normalisePlayers(record.teamA || []).concat(normalisePlayers(record.teamB || []), normalisePlayers(record.substitutes || []));
    playersEl.value = logic.formatRoster(players); $('venue').value = record.venue || ''; renderRosterState(); playersEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function shareText() {
    if (!currentDraw) return '';
    function playerLine(p, i) { return (i + 1) + '. ' + p.name + (p.role === 'ARQ' ? ' 🧤' : p.role === 'DEF' ? ' 🛡️' : ''); }
    var date = formatDate($('matchDate').value || logic.nextWednesdayISO());
    var lines = ['*⚽ FÚTBOL DEL MIÉRCOLES*', '📅 ' + date + ' · 20:00'];
    if (currentDraw.venue) lines.push('📍 *Cancha:* ' + currentDraw.venue);
    lines.push('', '*⚪ EQUIPO CLARO*'); currentDraw.teamA.forEach(function (p, i) { lines.push(playerLine(p, i)); });
    lines.push('', '*⚫ EQUIPO OSCURO*'); currentDraw.teamB.forEach(function (p, i) { lines.push(playerLine(p, i)); });
    if (currentDraw.substitutes.length) { lines.push('', '*🟡 SUPLENTES*'); currentDraw.substitutes.forEach(function (p, i) { lines.push(playerLine(p, i)); }); }
    if ($('scoreA').value !== '' && $('scoreB').value !== '') lines.push('', '*RESULTADO:* ' + $('scoreA').value + ' — ' + $('scoreB').value);
    lines.push('', '_😎 El Chiqui Mafia:_ “' + currentDraw.quote + '”');
    return lines.join('\n');
  }

  function fallbackCopy(text) { var area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); }
  function copyDraw() {
    var text = shareText(), done = function () { showToast('Texto listo para pegar en WhatsApp'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); }); else { fallbackCopy(text); done(); }
  }
  function shareDraw() {
    var text = shareText();
    if (navigator.share) navigator.share({ title: 'Fútbol del miércoles', text: text }).catch(function (error) { if (error.name !== 'AbortError') copyDraw(); }); else copyDraw();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }

  function fitCanvasText(ctx, text, maxWidth) {
    var value = String(text);
    if (ctx.measureText(value).width <= maxWidth) return value;
    while (value.length > 2 && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
    return value + '…';
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    });
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach(function (row, i) {
      if (i === maxLines - 1 && lines.length > maxLines) row = fitCanvasText(ctx, row + '…', maxWidth);
      ctx.fillText(row, x, y + i * lineHeight);
    });
  }

  function drawTeamCanvas(ctx, x, y, width, title, players, dark) {
    roundedRect(ctx, x, y, width, 660, 30); ctx.fillStyle = dark ? '#08150e' : '#f4f5ec'; ctx.fill();
    ctx.fillStyle = dark ? '#dfff44' : '#31523d'; ctx.font = '800 22px Manrope, sans-serif'; ctx.fillText(dark ? 'CAMISETA OSCURA' : 'CAMISETA CLARA', x + 38, y + 54);
    ctx.fillStyle = dark ? '#ffffff' : '#07180f'; ctx.font = '900 52px "Barlow Condensed", Impact, sans-serif'; ctx.fillText(title, x + 38, y + 118);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(7,24,15,.14)'; ctx.lineWidth = 2;
    players.forEach(function (player, index) {
      var rowY = y + 174 + index * 62;
      ctx.beginPath(); ctx.moveTo(x + 38, rowY + 35); ctx.lineTo(x + width - 38, rowY + 35); ctx.stroke();
      ctx.fillStyle = dark ? 'rgba(255,255,255,.45)' : '#819087'; ctx.font = '800 17px Manrope, sans-serif'; ctx.fillText(String(index + 1).padStart(2, '0'), x + 38, rowY);
      ctx.fillStyle = dark ? '#ffffff' : '#07180f'; ctx.font = '800 25px Manrope, sans-serif'; ctx.fillText(fitCanvasText(ctx, player.name, width - 190), x + 86, rowY);
      if (player.role) {
        roundedRect(ctx, x + width - 105, rowY - 25, 68, 34, 17); ctx.fillStyle = '#dfff44'; ctx.fill();
        ctx.fillStyle = '#07180f'; ctx.font = '900 16px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(player.role, x + width - 71, rowY - 2); ctx.textAlign = 'left';
      }
    });
    var counts = logic.countByRole(players);
    ctx.fillStyle = dark ? 'rgba(255,255,255,.62)' : '#607066'; ctx.font = '800 19px Manrope, sans-serif';
    ctx.fillText(counts.DEF + ' DEF', x + 38, y + 625); ctx.textAlign = 'right'; ctx.fillText(counts.ARQ ? counts.ARQ + ' ARQ' : 'ARQ ROTATIVO', x + width - 38, y + 625); ctx.textAlign = 'left';
  }

  async function generateMatchImage() {
    if (!currentDraw) throw new Error('Primero tenés que sortear los equipos.');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    var subRows = Math.ceil(currentDraw.substitutes.length / 2);
    var canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1320 + subRows * 52;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 1080, canvas.height); gradient.addColorStop(0, '#04321d'); gradient.addColorStop(.58, '#0b582f'); gradient.addColorStop(1, '#031d11'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 3; ctx.strokeRect(32, 32, 1016, canvas.height - 64); ctx.beginPath(); ctx.moveTo(540, 32); ctx.lineTo(540, canvas.height - 32); ctx.stroke(); ctx.beginPath(); ctx.arc(540, 380, 210, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#dfff44'; ctx.font = '900 22px Manrope, sans-serif'; ctx.fillText('MIÉRCOLES · 20:00 HS', 65, 78);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 76px "Barlow Condensed", Impact, sans-serif'; ctx.fillText('FÚTBOL DE LOS MIÉRCOLES', 65, 157);
    ctx.fillStyle = 'rgba(255,255,255,.76)'; ctx.font = '700 23px Manrope, sans-serif';
    var meta = formatDate($('matchDate').value || logic.nextWednesdayISO()).toUpperCase(); if (currentDraw.venue) meta += '  ·  ' + currentDraw.venue; ctx.fillText(fitCanvasText(ctx, meta, 950), 65, 207);
    if ($('scoreA').value !== '' && $('scoreB').value !== '') { ctx.fillStyle = '#dfff44'; ctx.font = '900 34px Manrope, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('RESULTADO  ' + $('scoreA').value + ' — ' + $('scoreB').value, 1015, 152); ctx.textAlign = 'left'; }
    drawTeamCanvas(ctx, 55, 255, 450, 'EQUIPO CLARO', currentDraw.teamA, false); drawTeamCanvas(ctx, 575, 255, 450, 'EQUIPO OSCURO', currentDraw.teamB, true);
    ctx.beginPath(); ctx.arc(540, 590, 52, 0, Math.PI * 2); ctx.fillStyle = '#dfff44'; ctx.fill(); ctx.fillStyle = '#07180f'; ctx.font = '900 29px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('VS', 540, 600); ctx.textAlign = 'left';
    var contentY = 960;
    if (currentDraw.substitutes.length) {
      ctx.fillStyle = '#dfff44'; ctx.font = '900 24px Manrope, sans-serif'; ctx.fillText('SUPLENTES', 65, contentY);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 22px Manrope, sans-serif';
      currentDraw.substitutes.forEach(function (player, index) { var col = index % 2, row = Math.floor(index / 2); ctx.fillText('• ' + fitCanvasText(ctx, player.name, 390), 65 + col * 500, contentY + 42 + row * 45); });
      contentY += 70 + subRows * 45;
    }
    roundedRect(ctx, 55, contentY, 970, 150, 24); ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fill();
    ctx.fillStyle = '#dfff44'; ctx.font = '900 18px Manrope, sans-serif'; ctx.fillText('😎 FALLO DEL CHIQUI MAFIA', 85, contentY + 43);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Manrope, sans-serif'; wrapCanvasText(ctx, '“' + currentDraw.quote + '”', 85, contentY + 82, 890, 32, 2);
    ctx.fillStyle = 'rgba(255,255,255,.48)'; ctx.font = '700 17px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('futbolmiercoles.vercel.app', 540, canvas.height - 48); ctx.textAlign = 'left';
    return new Promise(function (resolve, reject) { canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error('No se pudo generar la imagen.')); }, 'image/jpeg', .93); });
  }

  function downloadBlob(blob, filename) { var url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function imageFilename() { return 'equipos-' + ($('matchDate').value || logic.nextWednesdayISO()) + '.jpg'; }
  async function openImagePreview() {
    try {
      $('imageBtn').disabled = true; $('imageBtn').textContent = 'Generando…';
      lastImageBlob = await generateMatchImage(); if (lastImageUrl) URL.revokeObjectURL(lastImageUrl); lastImageUrl = URL.createObjectURL(lastImageBlob); $('matchImage').src = lastImageUrl; $('imagePreview').hidden = false; document.body.style.overflow = 'hidden';
    } catch (error) { showToast(error.message); }
    finally { $('imageBtn').disabled = false; $('imageBtn').textContent = 'Crear placa'; }
  }
  function closeImagePreview() { $('imagePreview').hidden = true; document.body.style.overflow = ''; }
  function downloadImage() { if (lastImageBlob) { downloadBlob(lastImageBlob, imageFilename()); showToast('Placa descargada'); } }
  async function shareImage() {
    if (!lastImageBlob) return;
    var file = new File([lastImageBlob], imageFilename(), { type: 'image/jpeg' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ title: 'Equipos del miércoles', text: '⚽ Equipos confirmados', files: [file] }); } catch (error) { if (error.name !== 'AbortError') downloadImage(); }
    } else downloadImage();
  }

  function historyFilename(extension) { return 'historial-futbol-miercoles-' + new Date().toISOString().slice(0, 10) + '.' + extension; }
  function historyTeamLine(players) {
    return normalisePlayers(players || []).map(function (player) { return player.name + (player.role ? ' (' + player.role + ')' : ''); }).join('  ·  ');
  }
  function drawHistoryCard(ctx, record, y) {
    roundedRect(ctx, 55, y, 1130, 300, 28); ctx.fillStyle = '#f5f7ef'; ctx.fill();
    ctx.fillStyle = '#31523d'; ctx.font = '900 21px Manrope, sans-serif'; ctx.fillText(formatDate(record.date).toUpperCase(), 90, y + 48);
    var played = record.status === 'played' && record.scoreA != null && record.scoreB != null;
    roundedRect(ctx, 950, y + 25, 190, 40, 20); ctx.fillStyle = played ? '#dfff44' : '#e4e9df'; ctx.fill();
    ctx.fillStyle = '#07180f'; ctx.font = '900 17px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(played ? 'RESULTADO FINAL' : 'PARTIDO PENDIENTE', 1045, y + 52); ctx.textAlign = 'left';
    ctx.fillStyle = '#07180f'; ctx.font = '900 42px "Barlow Condensed", Impact, sans-serif';
    ctx.fillText(played ? 'CLARO  ' + record.scoreA + '  —  ' + record.scoreB + '  OSCURO' : 'EQUIPO CLARO  VS  EQUIPO OSCURO', 90, y + 105);
    ctx.fillStyle = '#607066'; ctx.font = '700 18px Manrope, sans-serif'; ctx.fillText(record.venue ? 'CANCHA  ·  ' + fitCanvasText(ctx, record.venue, 860) : 'CANCHA SIN INFORMAR', 90, y + 138);
    ctx.fillStyle = '#31523d'; ctx.font = '900 17px Manrope, sans-serif'; ctx.fillText('EQUIPO CLARO', 90, y + 182);
    ctx.fillStyle = '#07180f'; ctx.font = '700 18px Manrope, sans-serif'; wrapCanvasText(ctx, historyTeamLine(record.teamA), 90, y + 211, 1030, 25, 2);
    ctx.fillStyle = '#31523d'; ctx.font = '900 17px Manrope, sans-serif'; ctx.fillText('EQUIPO OSCURO', 90, y + 260);
    ctx.fillStyle = '#07180f'; ctx.font = '700 18px Manrope, sans-serif'; ctx.fillText(fitCanvasText(ctx, historyTeamLine(record.teamB), 1030), 90, y + 286);
  }
  function makeHistoryCanvas(records, fixedHeight, pageLabel) {
    var canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = fixedHeight || (280 + records.length * 330);
    var ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 1240, canvas.height);
    gradient.addColorStop(0, '#04321d'); gradient.addColorStop(1, '#071b10'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 3; ctx.strokeRect(28, 28, 1184, canvas.height - 56);
    ctx.fillStyle = '#dfff44'; ctx.font = '900 21px Manrope, sans-serif'; ctx.fillText('ARCHIVO DEL CHIQUI MAFIA', 55, 72);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 66px "Barlow Condensed", Impact, sans-serif'; ctx.fillText('HISTORIAL DE LOS MIÉRCOLES', 55, 145);
    ctx.fillStyle = 'rgba(255,255,255,.66)'; ctx.font = '700 19px Manrope, sans-serif';
    ctx.fillText(records.length + (records.length === 1 ? ' FECHA' : ' FECHAS') + '  ·  GENERADO ' + new Intl.DateTimeFormat('es-AR').format(new Date()), 55, 187);
    if (pageLabel) { ctx.textAlign = 'right'; ctx.fillText(pageLabel, 1185, 187); ctx.textAlign = 'left'; }
    records.forEach(function (record, index) { drawHistoryCard(ctx, record, 225 + index * 330); });
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '700 17px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('futbolmiercoles.vercel.app', 620, canvas.height - 35); ctx.textAlign = 'left';
    return canvas;
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) { canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error('No se pudo crear el archivo.')); }, type, quality); });
  }
  async function generateHistoryJpg() {
    var history = loadHistory(); if (!history.length) throw new Error('Todavía no hay fechas guardadas.');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return canvasToBlob(makeHistoryCanvas(history.slice(0, 12)), 'image/jpeg', .92);
  }
  function concatBytes(chunks) {
    var length = chunks.reduce(function (sum, chunk) { return sum + chunk.length; }, 0), result = new Uint8Array(length), offset = 0;
    chunks.forEach(function (chunk) { result.set(chunk, offset); offset += chunk.length; }); return result;
  }
  async function makePdfBlob(canvases) {
    var encoder = new TextEncoder(), images = [];
    for (var i = 0; i < canvases.length; i++) images.push(new Uint8Array(await (await canvasToBlob(canvases[i], 'image/jpeg', .88)).arrayBuffer()));
    var objectCount = 2 + canvases.length * 3, objects = new Array(objectCount + 1);
    objects[1] = encoder.encode('<< /Type /Catalog /Pages 2 0 R >>');
    var kids = [];
    canvases.forEach(function (_, index) { kids.push((3 + index * 3) + ' 0 R'); });
    objects[2] = encoder.encode('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + canvases.length + ' >>');
    canvases.forEach(function (canvas, index) {
      var pageId = 3 + index * 3, imageId = pageId + 1, contentId = pageId + 2;
      objects[pageId] = encoder.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ' + imageId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
      objects[imageId] = concatBytes([encoder.encode('<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + images[index].length + ' >>\nstream\n'), images[index], encoder.encode('\nendstream')]);
      var content = encoder.encode('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ');
      objects[contentId] = concatBytes([encoder.encode('<< /Length ' + content.length + ' >>\nstream\n'), content, encoder.encode('\nendstream')]);
    });
    var header = encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'), chunks = [header], offsets = new Array(objectCount + 1).fill(0), cursor = header.length;
    for (var id = 1; id <= objectCount; id++) { var wrapped = concatBytes([encoder.encode(id + ' 0 obj\n'), objects[id], encoder.encode('\nendobj\n')]); offsets[id] = cursor; chunks.push(wrapped); cursor += wrapped.length; }
    var xrefOffset = cursor, xref = 'xref\n0 ' + (objectCount + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= objectCount; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + (objectCount + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF'; chunks.push(encoder.encode(xref));
    return new Blob([concatBytes(chunks)], { type: 'application/pdf' });
  }
  async function downloadHistoryJpg() {
    try { downloadBlob(await generateHistoryJpg(), historyFilename('jpg')); showToast('Historial JPG descargado'); } catch (error) { showToast(error.message); }
  }
  async function downloadHistoryPdf() {
    try {
      var history = loadHistory(); if (!history.length) throw new Error('Todavía no hay fechas guardadas.');
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var pages = [], total = Math.ceil(history.length / 4);
      for (var i = 0; i < total; i++) pages.push(makeHistoryCanvas(history.slice(i * 4, i * 4 + 4), 1754, 'PÁGINA ' + (i + 1) + ' DE ' + total));
      downloadBlob(await makePdfBlob(pages), historyFilename('pdf')); showToast('Historial PDF descargado');
    } catch (error) { showToast(error.message); }
  }
  async function shareHistory() {
    try {
      var blob = await generateHistoryJpg(), file = new File([blob], historyFilename('jpg'), { type: 'image/jpeg' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ title: 'Historial Fútbol de los Miércoles', text: '⚽ Historial de las fechas', files: [file] });
      else { downloadBlob(blob, historyFilename('jpg')); showToast('Historial JPG descargado'); }
    } catch (error) { if (error.name !== 'AbortError') showToast(error.message); }
  }
  function showToast(message) { var toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200); }

  function updateThemeButton() { var dark = document.body.classList.contains('dark-mode'); $('themeToggle').textContent = dark ? '☀️ Modo claro' : '🌙 Modo oscuro'; $('themeToggle').setAttribute('aria-pressed', dark); }
  function updateSoundButton() { $('soundToggle').textContent = soundOn ? '🔊 Sonido' : '🔇 Sin sonido'; $('soundToggle').setAttribute('aria-pressed', soundOn); }

  playersEl.addEventListener('input', renderRosterState); $('venue').addEventListener('input', function () { localStorage.setItem(VENUE_KEY, $('venue').value); });
  drawBtn.addEventListener('click', runDraw); $('redrawBtn').addEventListener('click', runDraw); $('copyBtn').addEventListener('click', copyDraw); $('shareBtn').addEventListener('click', shareDraw); $('imageBtn').addEventListener('click', openImagePreview);
  $('closeImageBtn').addEventListener('click', closeImagePreview); $('downloadImageBtn').addEventListener('click', downloadImage); $('shareImageBtn').addEventListener('click', shareImage);
  $('imagePreview').addEventListener('click', function (event) { if (event.target === $('imagePreview')) closeImagePreview(); });
  $('saveDrawBtn').addEventListener('click', saveDraw); $('saveResultBtn').addEventListener('click', saveResult); $('reuseBtn').addEventListener('click', reuseRoster);
  $('shareHistoryBtn').addEventListener('click', shareHistory); $('historyJpgBtn').addEventListener('click', downloadHistoryJpg); $('historyPdfBtn').addEventListener('click', downloadHistoryPdf);
  $('clearBtn').addEventListener('click', function () { playersEl.value = ''; resultSection.hidden = true; renderRosterState(); playersEl.focus(); });
  $('themeToggle').addEventListener('click', function () { document.body.classList.toggle('dark-mode'); localStorage.setItem(THEME_KEY, document.body.classList.contains('dark-mode') ? 'dark' : 'light'); updateThemeButton(); });
  $('soundToggle').addEventListener('click', function () { soundOn = !soundOn; localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); updateSoundButton(); });
  $('nextPhraseBtn').addEventListener('click', function () { showNextLivePhrase(false); startLivePhrases(); });

  if (localStorage.getItem(THEME_KEY) === 'dark') document.body.classList.add('dark-mode');
  playersEl.value = localStorage.getItem(ROSTER_KEY) || ''; $('venue').value = localStorage.getItem(VENUE_KEY) || '';
  updateThemeButton(); updateSoundButton(); renderRosterState(); renderHistory();
  showNextLivePhrase(true); startLivePhrases();
})();
