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
  var soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  var audioContext = null;
  var $ = function (id) { return document.getElementById(id); };
  var playersEl = $('players');
  var drawBtn = $('drawBtn');
  var validationBox = $('validationBox');
  var resultSection = $('resultSection');

  var PRESIDENT_QUOTES = [
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
    'El Presidente recuerda: caño vale doble solamente en la memoria.',
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

  function makePresidentQuote() {
    var template = PRESIDENT_QUOTES[Math.floor(Math.random() * PRESIDENT_QUOTES.length)];
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
    currentDraw = { teamA: normalisePlayers(draw.teamA), teamB: normalisePlayers(draw.teamB), substitutes: normalisePlayers(draw.substitutes || []), venue: draw.venue || $('venue').value.trim(), quote: draw.quote || makePresidentQuote() };
    renderTeam($('teamA'), currentDraw.teamA, 'A'); renderTeam($('teamB'), currentDraw.teamB, 'B');
    var a = logic.countByRole(currentDraw.teamA), b = logic.countByRole(currentDraw.teamB);
    var details = [];
    if (a.ARQ || b.ARQ) details.push(a.ARQ + '–' + b.ARQ + ' arqueros');
    if (a.DEF || b.DEF) details.push(a.DEF + '–' + b.DEF + ' defensores');
    $('balanceText').textContent = details.length ? 'Roles repartidos: ' + details.join(' · ') + '.' : 'Sorteo libre, sin puestos fijos.';
    $('presidentQuote').textContent = '“' + currentDraw.quote + '”';
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
    var phases = ['El Presidente está mezclando...', 'Repartiendo las camisetas...', 'Midiendo el humo...', 'Cerrando el sorteo...'];
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
    lines.push('', '_👑 El Presidente:_ “' + currentDraw.quote + '”');
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
  function exportData() {
    var payload = JSON.stringify({ exportedAt: new Date().toISOString(), matches: loadHistory() }, null, 2), url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = 'futbol-miercoles-historial.json'; link.click(); URL.revokeObjectURL(url); showToast('Historial exportado');
  }
  function showToast(message) { var toast = $('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200); }

  function updateThemeButton() { var dark = document.body.classList.contains('dark-mode'); $('themeToggle').textContent = dark ? '☀️ Modo claro' : '🌙 Modo oscuro'; $('themeToggle').setAttribute('aria-pressed', dark); }
  function updateSoundButton() { $('soundToggle').textContent = soundOn ? '🔊 Sonido' : '🔇 Sin sonido'; $('soundToggle').setAttribute('aria-pressed', soundOn); }

  playersEl.addEventListener('input', renderRosterState); $('venue').addEventListener('input', function () { localStorage.setItem(VENUE_KEY, $('venue').value); });
  drawBtn.addEventListener('click', runDraw); $('redrawBtn').addEventListener('click', runDraw); $('copyBtn').addEventListener('click', copyDraw); $('shareBtn').addEventListener('click', shareDraw);
  $('saveDrawBtn').addEventListener('click', saveDraw); $('saveResultBtn').addEventListener('click', saveResult); $('reuseBtn').addEventListener('click', reuseRoster); $('exportBtn').addEventListener('click', exportData);
  $('clearBtn').addEventListener('click', function () { playersEl.value = ''; resultSection.hidden = true; renderRosterState(); playersEl.focus(); });
  $('themeToggle').addEventListener('click', function () { document.body.classList.toggle('dark-mode'); localStorage.setItem(THEME_KEY, document.body.classList.contains('dark-mode') ? 'dark' : 'light'); updateThemeButton(); });
  $('soundToggle').addEventListener('click', function () { soundOn = !soundOn; localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); updateSoundButton(); });
  $('nextPhraseBtn').addEventListener('click', function () { showNextLivePhrase(false); startLivePhrases(); });

  if (localStorage.getItem(THEME_KEY) === 'dark') document.body.classList.add('dark-mode');
  playersEl.value = localStorage.getItem(ROSTER_KEY) || ''; $('venue').value = localStorage.getItem(VENUE_KEY) || '';
  updateThemeButton(); updateSoundButton(); renderRosterState(); renderHistory();
  showNextLivePhrase(true); startLivePhrases();
})();
