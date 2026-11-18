const sb = supabase.createClient(CBPES.url, CBPES.key);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const crest = n => esc((n || '').replace(/\s/g, '').slice(0, 3).toUpperCase());
const fd = d => d ? d.split('-').reverse().join('/') : '';
const pad = n => String(n).padStart(2, '0');

const PRESETS = {
  liga1: { type: 'liga', label: 'Pontos corridos — turno único', desc: 'Todos se enfrentam uma vez. Campeão: líder da tabela.', cfg: { legs: 1 } },
  liga2: { type: 'liga', label: 'Pontos corridos — turno e returno', desc: 'Todos se enfrentam em casa e fora. Campeão: líder da tabela.', cfg: { legs: 2 } },
  mata1: { type: 'mata', label: 'Mata-mata — jogo único', desc: 'Eliminatórias em jogo único; empate decidido nos pênaltis.', cfg: { koLegs: 1 } },
  mata2: { type: 'mata', label: 'Mata-mata — ida e volta', desc: 'Confrontos em dois jogos (placar agregado); final em jogo único opcional.', cfg: { koLegs: 2, finalSingle: true } },
  copa: { type: 'copa', label: 'Fase de grupos + mata-mata', desc: 'Grupos em pontos corridos; os melhores de cada grupo seguem para o mata-mata.', cfg: { groups: 2, qual: 2, groupLegs: 1, koLegs: 1, finalSingle: true } }
};
let SET = { name: 'CBPES', season: CBPES.season, format: 'liga1', config: {} };
const cfgOf = (s = SET) => ({ ptsW: 3, ptsD: 1, ...(PRESETS[s.format] || PRESETS.liga1).cfg, ...(s.config || {}) });
const typeOf = (s = SET) => (PRESETS[s.format] || PRESETS.liga1).type;
const roundLabel = r => r.name || 'Rodada ' + pad(r.number);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isPow2 = n => n >= 2 && (n & (n - 1)) === 0;
const koName = n => ({ 2: 'Final', 4: 'Semifinais', 8: 'Quartas de final', 16: 'Oitavas de final', 32: '16-avos de final' })[n] || 'Mata-mata (' + n + ' times)';
function roundRobin(ids) {
  const L = ids.slice(); if (L.length % 2) L.push(null);
  const n = L.length, R = [];
  for (let r = 0; r < n - 1; r++) {
    const m = [];
    for (let i = 0; i < n / 2; i++) { const h = L[i], a = L[n - 1 - i]; if (h && a) m.push(r % 2 ? [a, h] : [h, a]); }
    R.push(m); L.splice(1, 0, L.pop());
  }
  return R;
}
function koSpec(ids, cfg) { // ids em ordem de chave: (0x1), (2x3)...
  const n = ids.length, legs = (cfg.koLegs == 2 && !(n == 2 && cfg.finalSingle)) ? 2 : 1, ms = [];
  for (let i = 0; i < n; i += 2) ms.push({ home_id: ids[i], away_id: ids[i + 1], leg: 1 });
  if (legs == 2) for (let i = 0; i < n; i += 2) ms.push({ home_id: ids[i + 1], away_id: ids[i], leg: 2 });
  return { stage: 'mata', name: koName(n), matches: ms };
}

async function load() {
  const T = ['participants', 'rounds', 'matches', 'settings', 'players', 'match_events', 'team_coach_history', 'weekly_editions', 'weekly_participants', 'weekly_rounds', 'competition_phases', 'coach_profiles', 'coach_trophies'];
  const res = await Promise.all(T.map(t => sb.from(t).select('*')));
  const err = res.map(x => x.error).find(Boolean); if (err) throw err;
  const [p, r, m, s, pl, ev, coachHistory, weeklies, weeklyParticipants, weeklyRounds, phases, coachProfiles, coachTrophies] = res.map(x => x.data);
  p.sort((a, b) => a.name.localeCompare(b.name)); r.sort((a, b) => a.number - b.number);
  if (s[0]) SET = s[0];
  const P = Object.fromEntries(p.map(x => [x.id, x])), R = Object.fromEntries(r.map(x => [x.id, x])), WR = Object.fromEntries((weeklyRounds || []).map(x => [x.id, x])), PH = Object.fromEntries((phases || []).map(x => [x.id, x]));
  r.forEach(x => x.phase = PH[x.phase_id] || null); (weeklyRounds || []).forEach(x => x.phase = PH[x.phase_id] || null);
  const matches = m.map(x => ({
    ...x, home: P[x.home_id], away: P[x.away_id], round: (x.category === 'weekly' ? WR[x.weekly_round_id] : R[x.round_id]) || null,
    category: x.category || 'official', weeklyRound: WR[x.weekly_round_id] || null, weekly: (weeklies || []).find(w => w.id === x.weekly_id) || null,
    played: x.home_score !== null && x.away_score !== null,
    date: x.played_on || (x.category === 'weekly' && WR[x.weekly_round_id] ? WR[x.weekly_round_id].date : null) || (R[x.round_id] && R[x.round_id].date) || ((weeklies || []).find(w => w.id === x.weekly_id)?.event_date) || null
  })).filter(x => x.home && x.away).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.seq || 0) - (b.seq || 0));
  const players = pl.map(x => ({ ...x, team: P[x.participant_id] })).filter(x => x.team).sort((a, b) => a.name.localeCompare(b.name));
  return { participants: p, rounds: r, matches, players, events: ev, coachHistory, phases: phases || [], weeklies: (weeklies || []).sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')), weeklyParticipants: weeklyParticipants || [], weeklyRounds: weeklyRounds || [], coachProfiles: coachProfiles || [], coachTrophies: coachTrophies || [], settings: SET };
}

// Desempate: pontos, vitórias, saldo, gols pró, nome.
function standings(ps, ms, cfg = cfgOf()) {
  const t = Object.fromEntries(ps.map(p => [p.id, { p, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 }]));
  ms.filter(m => m.played).forEach(m => {
    const h = t[m.home_id], a = t[m.away_id]; if (!h || !a) return;
    h.j++; a.j++; h.gp += m.home_score; h.gc += m.away_score; a.gp += m.away_score; a.gc += m.home_score;
    if (m.home_score > m.away_score) { h.v++; a.d++; h.pts += cfg.ptsW; }
    else if (m.home_score < m.away_score) { a.v++; h.d++; a.pts += cfg.ptsW; }
    else { h.e++; a.e++; h.pts += cfg.ptsD; a.pts += cfg.ptsD; }
  });
  return Object.values(t).map(x => ({ ...x, sg: x.gp - x.gc, ap: x.j ? Math.round(x.pts / (x.j * cfg.ptsW) * 100) : 0 }))
    .sort((a, b) => b.pts - a.pts || b.v - a.v || b.sg - a.sg || b.gp - a.gp || a.p.name.localeCompare(b.p.name));
}
const leagueMatches = D => D.matches.filter(m => m.category === 'official' && m.round && m.round.stage === 'liga');
function groupTables(D) {
  const ms = D.matches.filter(m => m.category === 'official' && m.round && m.round.stage === 'grupos' && m.group_name);
  return [...new Set(ms.map(m => m.group_name))].sort().map(n => {
    const gm = ms.filter(m => m.group_name === n), ids = new Set(gm.flatMap(m => [m.home_id, m.away_id]));
    return { name: n, matches: gm, st: standings(D.participants.filter(p => ids.has(p.id) && p.participates_in_competition !== false), gm) };
  });
}
const koRounds = D => D.rounds.filter(r => !r.weekly_id && r.stage === 'mata');
function tiesOf(ms) { // confrontos (ida/volta agregados) de uma fase de mata-mata
  const map = new Map();
  ms.slice().sort((a, b) => a.leg - b.leg || a.seq - b.seq).forEach(m => {
    const k = [m.home_id, m.away_id].sort().join('|');
    if (!map.has(k)) map.set(k, { a: m.home, b: m.away, legs: [] });
    map.get(k).legs.push(m);
  });
  return [...map.values()].sort((x, y) => x.legs[0].seq - y.legs[0].seq).map(t => {
    const sum = f => t.legs.reduce((s, m) => s + f(m), 0), isA = m => m.home_id === t.a.id;
    const A = sum(m => isA(m) ? (m.home_score || 0) : (m.away_score || 0)), B = sum(m => isA(m) ? (m.away_score || 0) : (m.home_score || 0));
    const PA = sum(m => (isA(m) ? m.home_pen : m.away_pen) || 0), PB = sum(m => (isA(m) ? m.away_pen : m.home_pen) || 0);
    const done = t.legs.every(m => m.played);
    let winner = null;
    if (done) winner = A > B ? t.a : B > A ? t.b : PA > PB ? t.a : PB > PA ? t.b : null;
    return { ...t, A, B, PA, PB, done, winner };
  });
}
function champion(D) {
  if (typeOf() === 'liga') { const ms = leagueMatches(D); return ms.length && ms.every(m => m.played) ? standings(D.participants, ms)[0].p : null; }
  const rs = koRounds(D); if (!rs.length) return null;
  const ties = tiesOf(D.matches.filter(m => m.round_id === rs[rs.length - 1].id));
  return ties.length === 1 && ties[0].winner ? ties[0].winner : null;
}
function latestPlayed(ms) {
  return ms.filter(m => m.played).sort((a, b) => (b.date || '').localeCompare(a.date || '') || ((b.round?.number || 0) - (a.round?.number || 0)) || (b.seq || 0) - (a.seq || 0));
}
function nextMatches(ms) {
  return ms.filter(m => !m.played).sort((a, b) => ((a.round?.number || 999999) - (b.round?.number || 999999)) || (a.date || '9').localeCompare(b.date || '9') || (a.seq || 0) - (b.seq || 0));
}
function currentRound(rounds, ms) {
  const official = ms.filter(m => m.category === 'official' && m.round);
  const nx = nextMatches(official)[0]; if (nx) return nx.round;
  const lp = latestPlayed(official)[0]; return lp ? lp.round : rounds[rounds.length - 1] || null;
}
const sgf = n => (n > 0 ? '+' : '') + n;

function stats(D) {
  const played = D.matches.filter(m => m.played), st = standings(D.participants, D.matches);
  const goals = played.reduce((s, m) => s + m.home_score + m.away_score, 0);
  const by = (f, dir = -1) => st.filter(x => x.j > 0).sort((a, b) => dir * (f(a) - f(b)) || a.p.name.localeCompare(b.p.name));
  const big = played.slice().sort((a, b) => Math.abs(b.home_score - b.away_score) - Math.abs(a.home_score - a.away_score) || (b.home_score + b.away_score) - (a.home_score + a.away_score))[0];
  const g = {}, a = {};
  D.events.forEach(e => { g[e.scorer_id] = (g[e.scorer_id] || 0) + 1; if (e.assist_id) a[e.assist_id] = (a[e.assist_id] || 0) + 1; });
  const pl = D.players.map(x => ({ ...x, g: g[x.id] || 0, a: a[x.id] || 0 }));
  const cmp = (k, k2) => (x, y) => y[k] - x[k] || y[k2] - x[k2] || x.name.localeCompare(y.name);
  return {
    st, jogos: played.length, gols: goals, media: played.length ? goals / played.length : 0, big,
    ataque: by(x => x.gp), defesa: by(x => x.gc, 1), aprov: by(x => x.ap), vit: by(x => x.v), emp: by(x => x.e), der: by(x => x.d), gols_part: by(x => x.gp + x.gc),
    artilheiros: pl.filter(x => x.g > 0).sort(cmp('g', 'a')), garcons: pl.filter(x => x.a > 0).sort(cmp('a', 'g')),
    part: pl.filter(x => x.g + x.a > 0).map(x => ({ ...x, ga: x.g + x.a })).sort(cmp('ga', 'g'))
  };
}
const fmt1 = n => n.toFixed(1).replace('.', ',');

function matchColor(m) { return m.category === 'friendly' ? '#176b45' : '#174e83'; }
function matchRow(m) {
  const coach = name => name ? `<a class="coach-link" href="#coach/${encodeURIComponent(name)}">${esc(name)}</a>` : '';
  const score = m.played ? `${m.home_score} : ${m.away_score}` : '– : –';
  if (m.category === 'friendly' || m.category === 'weekly') return `<div class="friendly-match">
    <div class="friendly-side home"><span class="friendly-tag">${m.category === 'weekly' ? 'SEMANAL' : 'AMISTOSO'}</span><b><a href="#team/${m.home_id}">${esc(m.home.name)}</a></b><small>${coach(m.home_coach_name || m.home.coach_name)}</small></div>
    <div class="friendly-score">${score}</div>
    <div class="friendly-side away"><b><a href="#team/${m.away_id}">${esc(m.away.name)}</a></b><small>${coach(m.away_coach_name || m.away.coach_name)}</small></div>
    <div class="friendly-date">${m.date ? fd(m.date) : ''}</div>
  </div>`;
  const color = matchColor(m), comp = SET.name || 'COMPETIÇÃO';
  return `<div class="fixture-mini" style="--match-color:${color}">
    <div class="fixture-side"><b><a href="#team/${m.home_id}">${esc(m.home.name)}</a></b><small>${coach(m.home_coach_name || m.home.coach_name)}</small></div>
    <div class="fixture-score">${score}</div>
    <div class="fixture-side away"><b><a href="#team/${m.away_id}">${esc(m.away.name)}</a></b><small>${coach(m.away_coach_name || m.away.coach_name)}</small></div>
    <div class="fixture-meta">${esc(comp)}${m.date ? ' • ' + fd(m.date) : ''}</div>
  </div>`;
}

/* Ajuste visual V14: restaura o layout de placares oficiais, amistosos e semanais. */
(() => {
  if (document.getElementById('cbpes-match-layout-v14')) return;
  const style = document.createElement('style');
  style.id = 'cbpes-match-layout-v14';
  style.textContent = `
    .friendly-match,.fixture-mini{
      display:grid;grid-template-columns:minmax(0,1fr) 104px minmax(0,1fr) 92px;
      align-items:center;gap:10px;padding:12px 14px;margin:0;
      border-bottom:1px solid var(--line,#dde2e5);min-width:0;
    }
    .friendly-match{background:#176b45;color:#fff;}
    .friendly-match.weekly{background:#002b36;border-left:4px solid #f2c500;}
    .friendly-side,.fixture-side{display:flex;flex-direction:column;gap:3px;min-width:0;line-height:1.2;}
    .friendly-side.home,.fixture-side:first-child{text-align:left;align-items:flex-start;}
    .friendly-side.away,.fixture-side.away{text-align:right;align-items:flex-end;}
    .friendly-side b,.fixture-side b{font-family:var(--fc,'Arial Narrow',sans-serif);font-size:18px;font-weight:700;line-height:1.1;overflow-wrap:anywhere;}
    .friendly-side a,.friendly-side small a,.fixture-side a,.fixture-side small a{color:inherit;}
    .friendly-side small,.fixture-side small{font-size:11px;opacity:.82;line-height:1.2;}
    .friendly-tag{display:inline-block;font-family:var(--fc,'Arial Narrow',sans-serif);font-size:10px;font-weight:700;letter-spacing:.8px;padding:2px 6px;border:1px solid currentColor;opacity:.9;margin-bottom:2px;}
    .friendly-score,.fixture-score{font-family:var(--fc,'Arial Narrow',sans-serif);font-size:27px;font-weight:800;line-height:1;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;}
    .friendly-date,.fixture-meta{font-size:11px;text-align:right;white-space:nowrap;opacity:.82;}
    .fixture-mini{grid-template-columns:minmax(0,1fr) 104px minmax(0,1fr);background:var(--match-color,#174e83);color:#fff;}
    .fixture-mini .fixture-meta{grid-column:1/-1;text-align:center;padding-top:3px;border-top:1px solid rgba(255,255,255,.2);}
    .friendly-date{align-self:center;}
    .friendly-match .coach-link,.fixture-mini .coach-link{color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,.45);text-underline-offset:2px;}
    @media(max-width:620px){
      .friendly-match,.fixture-mini{grid-template-columns:minmax(0,1fr) 76px minmax(0,1fr);gap:7px;padding:10px 9px;}
      .friendly-date{grid-column:1/-1;text-align:center;padding-top:3px;border-top:1px solid rgba(255,255,255,.2);}
      .friendly-side b,.fixture-side b{font-size:16px;}
      .friendly-score,.fixture-score{font-size:23px;}
      .fixture-mini .fixture-meta{grid-column:1/-1;}
    }
    @media(max-width:360px){
      .friendly-match,.fixture-mini{grid-template-columns:minmax(0,1fr) 62px minmax(0,1fr);gap:5px;padding:9px 7px;}
      .friendly-side b,.fixture-side b{font-size:14px;}
      .friendly-score,.fixture-score{font-size:20px;}
    }
  `;
  document.head.appendChild(style);
})();
