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
  const T = ['participants', 'rounds', 'matches', 'settings', 'players', 'match_events', 'team_coach_history', 'weekly_editions', 'weekly_participants', 'weekly_rounds', 'competition_phases', 'coach_profiles', 'coach_trophies', 'standings_zones', 'official_competitions', 'official_editions', 'stadiums', 'match_statistics'];
  const res = await Promise.all(T.map(t => sb.from(t).select('*')));
  const groupRes = await sb.from('official_group_teams').select('*');
  if(groupRes.error && !/does not exist|schema cache|could not find/i.test(groupRes.error.message||''))throw groupRes.error;
  const err = res.map(x => x.error).find(Boolean); if (err) throw err;
  const [p, r, m, s, pl, ev, coachHistory, weeklies, weeklyParticipants, weeklyRounds, phases, coachProfiles, coachTrophies, standingsZones, officialCompetitions, officialEditions, stadiums, matchStatistics] = res.map(x => x.data);
  p.sort((a, b) => a.name.localeCompare(b.name)); r.sort((a, b) => a.number - b.number);
  if (s[0]) SET = s[0];
  const P = Object.fromEntries(p.map(x => [x.id, x])), R = Object.fromEntries(r.map(x => [x.id, x])), WR = Object.fromEntries((weeklyRounds || []).map(x => [x.id, x])), PH = Object.fromEntries((phases || []).map(x => [x.id, x]));
  r.forEach(x => x.phase = PH[x.phase_id] || null); (weeklyRounds || []).forEach(x => x.phase = PH[x.phase_id] || null);
  const evoEditionIds = new Set((officialEditions||[]).filter(e=>/liga\s*evo/i.test(String(e.name||'')+' '+String((officialCompetitions||[]).find(c=>String(c.id)===String(e.competition_id))?.name||''))).map(e=>String(e.id)));
  const evoRoundIds = new Set(r.filter(round=>evoEditionIds.has(String(round.official_edition_id||''))).map(round=>String(round.id)));
  const matches = m.map(x => ({
    ...x, is_liga_evo: (x.category||'official')==='official' && (evoEditionIds.has(String(x.official_edition_id||'')) || evoRoundIds.has(String(x.round_id||''))), home: P[x.home_id], away: P[x.away_id], round: (x.category === 'weekly' ? WR[x.weekly_round_id] : R[x.round_id]) || null,
    category: x.category || 'official', weeklyRound: WR[x.weekly_round_id] || null, weekly: (weeklies || []).find(w => w.id === x.weekly_id) || null,
    played: x.home_score !== null && x.away_score !== null,
    date: x.played_on || (x.category === 'weekly' && WR[x.weekly_round_id] ? WR[x.weekly_round_id].date : null) || (R[x.round_id] && R[x.round_id].date) || ((weeklies || []).find(w => w.id === x.weekly_id)?.event_date) || null
  })).filter(x => x.home && x.away).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.seq || 0) - (b.seq || 0));
  const players = pl.map(x => ({ ...x, team: P[x.participant_id] })).filter(x => x.team).sort((a, b) => a.name.localeCompare(b.name));
  return { participants: p, rounds: r, matches, players, events: ev, coachHistory, phases: phases || [], weeklies: (weeklies || []).sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')), weeklyParticipants: weeklyParticipants || [], weeklyRounds: weeklyRounds || [], coachProfiles: coachProfiles || [], coachTrophies: coachTrophies || [], standingsZones: standingsZones || [], officialCompetitions: officialCompetitions || [], officialEditions: officialEditions || [], officialGroupTeams: groupRes.data || [], stadiums: stadiums || [], matchStatistics: matchStatistics || [], settings: SET };
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
// Linha do tempo: priorizar a data real da partida, não o cadastro.
function matchRegistrationTime(m){
 return String(m.played_on||m.date||m.result_registered_at||m.created_at||'').slice(0,10);
}
function matchResultOrder(a,b){
 return matchRegistrationTime(b).localeCompare(matchRegistrationTime(a))
   ||String(b.created_at||'').localeCompare(String(a.created_at||''))
   ||(Number(b.seq)||0)-(Number(a.seq)||0)
   ||String(b.id||'').localeCompare(String(a.id||''));
}
function latestPlayed(ms) {
 return ms.filter(m=>m.played).sort(matchResultOrder);
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

function stats(D, category = 'official') {
  const scoped = category === 'nonweekly' ? D.matches.filter(m => m.category !== 'weekly') : D.matches.filter(m => m.category === category);
  const ids = new Set(scoped.map(m => m.id));
  const events = D.events.filter(e => ids.has(e.match_id));
  const played = scoped.filter(m => m.played), st = standings(D.participants, scoped);
  const goals = played.reduce((s, m) => s + m.home_score + m.away_score, 0);
  const by = (f, dir = -1) => st.filter(x => x.j > 0).sort((a, b) => dir * (f(a) - f(b)) || a.p.name.localeCompare(b.p.name));
  const big = played.slice().sort((a, b) => Math.abs(b.home_score - b.away_score) - Math.abs(a.home_score - a.away_score) || (b.home_score + b.away_score) - (a.home_score + a.away_score))[0];
  const g = {}, a = {}, og = {};
  events.forEach(e => { if(e.goal_type==='own_goal'&&e.scorer_id) og[e.scorer_id]=(og[e.scorer_id]||0)+1; if(e.goal_type!=='own_goal') g[e.scorer_id] = (g[e.scorer_id] || 0) + 1; if (e.assist_id) a[e.assist_id] = (a[e.assist_id] || 0) + 1; });
  const pl = D.players.filter(x=>!/^gol\s+contra\b/i.test(String(x.name||'').trim())).map(x => ({ ...x, g: g[x.id] || 0, a: a[x.id] || 0, og: og[x.id] || 0 }));
  const cmp = (k, k2) => (x, y) => y[k] - x[k] || y[k2] - x[k2] || x.name.localeCompare(y.name);
  return {
    st, jogos: played.length, gols: goals, media: played.length ? goals / played.length : 0, big,
    ataque: by(x => x.gp), defesa: by(x => x.gc, 1), aprov: by(x => x.ap), vit: by(x => x.v), emp: by(x => x.e), der: by(x => x.d), gols_part: by(x => x.gp + x.gc),
    ownGoals: pl.filter(x=>x.og>0&&String(x.name||'').trim()&&!/^(gol\s+contra|não identificado|desconhecido|jogador não informado)/i.test(String(x.name).trim())).sort((a,b)=>b.og-a.og||a.name.localeCompare(b.name,'pt-BR')), artilheiros: pl.filter(x => x.g > 0).sort(cmp('g', 'a')), garcons: pl.filter(x => x.a > 0).sort(cmp('a', 'g')),
    part: pl.filter(x => x.g + x.a > 0).map(x => ({ ...x, ga: x.g + x.a })).sort(cmp('ga', 'g'))
  };
}
const fmt1 = n => n.toFixed(1).replace('.', ',');

function matchColor(m) { return m.category === 'friendly' || m.category === 'weekly' ? '#176b45' : '#174e83'; }
function crestImg(p,cls='') {
  if(!p?.crest_url || !/^https:\/\//i.test(p.crest_url))return '';
  return `<img class="cbpes-crest ${cls}" src="${esc(p.crest_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
}
function teamWithCrest(p) { return `<span class="cbpes-team-inline">${crestImg(p)}<span>${esc(p.name)}</span></span>`; }
function matchRow(m, hideDate = false, showOfficialRound = false, reportLinkMode = 'arrow', showRegistrationDate = false) {
  const coach = name => name ? `<a class="coach-link" href="#coach/${encodeURIComponent(name)}">${esc(name)}</a>` : '';
  const score = m.played ? `${m.home_score} - ${m.away_score}` : '– : –';
  const details = [];
  if(m.went_to_extra_time)details.push('PRORROGAÇÃO');
  if(m.golden_goal)details.push('GOL DE OURO');
  const penaltyTag=side=>{if(!m.played||m.home_pen==null||m.away_pen==null)return '';const own=Number(m[side+'_pen']),opp=Number(m[(side==='home'?'away':'home')+'_pen']);return own>opp?`<span class="cbpes-penalty-score">pên. ${m.home_pen}-${m.away_pen}</span>`:'';};
  const hasPens=!!(penaltyTag('home')||penaltyTag('away'));
  const detailHTML=details.length?`<div class="cbpes-match-details">${details.map(t=>`<span${t.startsWith("pên.")?' class="cbpes-penalty-score"':""}>${t}</span>`).join('')}</div>`:'';
  const winnerByPens=m.played&&m.home_score===m.away_score&&m.home_pen!=null&&m.away_pen!=null;

  const homeWon = m.played && (m.home_score > m.away_score || (winnerByPens&&m.home_pen>m.away_pen));
  const awayWon = m.played && (m.away_score > m.home_score || (winnerByPens&&m.away_pen>m.home_pen));
  const category = m.category === 'weekly' ? 'SEMANAL' : m.category === 'friendly' ? 'AMISTOSO' : 'OFICIAL';
  const championTag = id => String(m.champion_team_id||'')===String(id) ? '<span class="cbpes-match-champion-label">CAMPEÃO</span>' : '';
  const color = matchColor(m);
  const edition=(D.officialEditions||[]).find(e=>String(e.id)===String(m.official_edition_id||m.round?.official_edition_id));
  const competition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition?.competition_id));
  const isLigaPro=(m.category||'official')==='official'&&/liga\s*pro/i.test((competition?.name||'')+' '+(edition?.name||''));
  const isCopaMaster=(m.category||'official')==='official'&&/copa\s*master/i.test((competition?.name||'')+' '+(edition?.name||''));
  const officialName = competition?.name || edition?.name || SET.name || 'OFICIAL';
  const officialPhase = (D.phases||[]).find(p=>String(p.id)===String(m.round?.phase_id||''));
  const officialRound = m.round ? (officialPhase && !officialPhase.counts_in_standings ? officialPhase.name : roundLabel(m.round)) : (officialPhase?.name||'');
  const categoryLabel = m.category==='official' ? esc(officialName)+(showOfficialRound && officialRound ? ' • '+esc(officialRound).toUpperCase() : '') : category;
  const registeredAt=m.result_registered_at||m.created_at;
  const registeredDate=registeredAt?new Date(registeredAt):null;
  const dateText=fd(m.played_on||m.date);
  const meta=hideDate||!dateText?'':`<span class="match-date">${esc(dateText)}</span>`;
  return `<div data-cbpes-match-id="${esc(m.id)}" class="cbpes-match ${m.is_liga_evo?"cbpes-match-evo":""} ${isLigaPro?"cbpes-match-liga-pro":""} ${isCopaMaster?"cbpes-match-copa-master":""} ${m.category==="weekly"?"cbpes-match-semanal":""} ${m.category==="friendly"?"cbpes-match-friendly":""}" style="--match-color:${color}">
    <div class="cbpes-match-top"><span class="cbpes-match-category">${categoryLabel}</span>${meta}</div>
    ${reportLinkMode==='details'? `<div class="cbpes-round-clean">
      <div class="cbpes-round-clean-teams">${['home','away'].map(side=>`<div class="cbpes-round-clean-row"><span class="cbpes-champion-crest">${side==='home'?championTag(m.home_id):''}${crestImg(m[side])}</span><div class="cbpes-round-clean-identity"><a class="cbpes-team-name" href="#team/${m[side+'_id']}">${esc(m[side].name)}</a>${championTag(m[side+'_id']).replace('cbpes-match-champion-label','cbpes-match-champion-label cbpes-mobile-champion')}<small class="cbpes-champion-coach">${coach(m[side+'_coach_name']||m[side].coach_name)}${side==='away'?championTag(m.away_id):''}</small></div><div class="cbpes-round-score-pair ${hasPens?'has-pens':''}">${penaltyTag(side)}<b class="cbpes-round-clean-goals">${m.played?m[side+'_score']:'–'}</b></div></div>`).join('')}${detailHTML}</div>
      ${(m.category||'official')==='official'&&m.played?`<a class="cbpes-round-clean-link" href="#match/${encodeURIComponent(m.id)}" aria-label="Ver súmula da partida" title="Ver súmula da partida"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`:''}
    </div>`:''}
    <div class="cbpes-match-main" ${reportLinkMode==='details'?'hidden style="display:none!important"':''}>

      <div class="cbpes-match-team home ${homeWon?'winner':''}"><div class="cbpes-match-club"><span class="cbpes-champion-crest">${championTag(m.home_id)}${crestImg(m.home)}</span><div class="cbpes-match-club-text"><span class="featured-juventus-name-row"><a class="cbpes-team-name" href="#team/${m.home_id}">${esc(m.home.name==='Manchester United'?'Man. United':m.home.name)}</a></span>${championTag(m.home_id).replace('cbpes-match-champion-label','cbpes-match-champion-label cbpes-mobile-champion')}<small>${coach(m.home_coach_name || m.home.coach_name)}</small></div></div></div>
      <div class="cbpes-match-score ${hasPens?'has-pens':''}">${hasPens?`<div class="cbpes-penalty-above">${penaltyTag('home')||penaltyTag('away')}</div>`:''}<span class="cbpes-score-inline"><span class="cbpes-regulation-score">${score}</span></span><span class="cbpes-score-stacked" aria-label="Placar: ${score}"><span class="${!m.played?'pending':homeWon?'score-winner':'score-normal'}"><span class="cbpes-regulation-score">${m.played?m.home_score:'–'}</span></span><span class="${!m.played?'pending':awayWon?'score-winner':'score-normal'}"><span class="cbpes-regulation-score">${m.played?m.away_score:'–'}</span></span></span>${detailHTML}</div>
      <div class="cbpes-match-team away ${awayWon?'winner':''}"><div class="cbpes-match-club">${crestImg(m.away)}<div class="cbpes-match-club-text"><span class="featured-juventus-name-row"><a class="cbpes-team-name" href="#team/${m.away_id}">${esc(m.away.name==='Manchester United'?'Man. United':m.away.name)}</a></span>${championTag(m.away_id).replace('cbpes-match-champion-label','cbpes-match-champion-label cbpes-mobile-champion')}<small class="cbpes-champion-coach">${coach(m.away_coach_name || m.away.coach_name)}${championTag(m.away_id)}</small></div></div></div>
    </div>
    ${(m.category||'official')==='official' && m.played && reportLinkMode!=='none' && reportLinkMode!=='details' ? `<a class="cbpes-match-report-link ${reportLinkMode==='details'?'cbpes-match-report-details':''}" href="#match/${encodeURIComponent(m.id)}" aria-label="Ver súmula de ${esc(m.home.name)} contra ${esc(m.away.name)}" title="Ver súmula da partida">${reportLinkMode==='details'?`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`:`<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</a>` : ''}
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
    .friendly-side.home,.fixture-side:first-child{text-align:right;align-items:flex-end;}
    .friendly-side.away,.fixture-side.away{text-align:left;align-items:flex-start;}
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

/* V26 — seleção visual personalizada, mantendo o select nativo como fonte de dados. */
(function(){
  function enhance(root){
    const selects=[];
    if(root.nodeType===1&&root.matches?.('select'))selects.push(root);
    root.querySelectorAll?.('select').forEach(s=>selects.push(s));
    for(const select of selects){
      if(select.dataset.cbpesEnhanced||select.multiple||select.size>1)continue;
      select.dataset.cbpesEnhanced='1';
      const shell=document.createElement('div');shell.className='cbpes-select';
      const trigger=document.createElement('button');trigger.type='button';trigger.className='cbpes-select-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
      const menu=document.createElement('div');menu.className='cbpes-select-menu';menu.setAttribute('role','listbox');
      select.parentNode.insertBefore(shell,select);shell.append(select,trigger,menu);
      select.classList.add('cbpes-select-native');
      const sync=()=>{
        const option=select.selectedOptions[0];
        trigger.textContent=option?.textContent||'Selecione';
        trigger.disabled=select.disabled;
        menu.replaceChildren();
        [...select.options].forEach((opt,i)=>{
          const item=document.createElement('button');item.type='button';item.className='cbpes-select-option';item.setAttribute('role','option');
          item.textContent=opt.textContent;item.disabled=opt.disabled;
          item.setAttribute('aria-selected',String(opt.selected));
          if(opt.selected)item.classList.add('selected');
          item.addEventListener('click',()=>{
            if(opt.disabled)return;
            select.selectedIndex=i;
            select.dispatchEvent(new Event('change',{bubbles:true}));
            close();sync();trigger.focus();
          });
          menu.append(item);
        });
      };
      const close=()=>{shell.classList.remove('open');trigger.setAttribute('aria-expanded','false');};
      trigger.addEventListener('click',()=>{
        document.querySelectorAll('.cbpes-select.open').forEach(el=>{if(el!==shell){el.classList.remove('open');el.querySelector('.cbpes-select-trigger')?.setAttribute('aria-expanded','false');}});
        shell.classList.toggle('open');trigger.setAttribute('aria-expanded',String(shell.classList.contains('open')));
        if(shell.classList.contains('open'))menu.querySelector('.selected')?.scrollIntoView({block:'nearest'});
      });
      trigger.addEventListener('keydown',e=>{
        if(e.key==='Escape'){close();return;}
        if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Enter'||e.key===' '){
          e.preventDefault();
          if(!shell.classList.contains('open'))trigger.click();
          const choices=[...menu.querySelectorAll('button:not(:disabled)')];
          const current=choices.indexOf(document.activeElement);
          const selected=choices.findIndex(x=>x.classList.contains('selected'));
          const step=e.key==='ArrowUp'?-1:1;
          choices[Math.max(0,Math.min(choices.length-1,current<0?selected>=0?selected:0:current+step))]?.focus();
        }
      });
      menu.addEventListener('keydown',e=>{
        const choices=[...menu.querySelectorAll('button:not(:disabled)')],i=choices.indexOf(document.activeElement);
        if(e.key==='Escape'){e.preventDefault();close();trigger.focus();}
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();choices[Math.max(0,Math.min(choices.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();}
        if(e.key==='Home'||e.key==='End'){e.preventDefault();choices[e.key==='Home'?0:choices.length-1]?.focus();}
      });
      select.addEventListener('change',sync);
      // Opções de filtros carregadas após o início da página também precisam atualizar o seletor visual.
      const optionsObserver=new MutationObserver(()=>sync());
      optionsObserver.observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['selected','disabled']});
      sync();
    }
  }
  document.addEventListener('click',e=>{
    if(!e.target.closest('.cbpes-select'))document.querySelectorAll('.cbpes-select.open').forEach(el=>{el.classList.remove('open');el.querySelector('.cbpes-select-trigger')?.setAttribute('aria-expanded','false');});
  });
  const start=()=>{
    enhance(document);
    const observer=new MutationObserver(records=>{
      for(const r of records)for(const node of r.addedNodes)if(node.nodeType===1)enhance(node);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

/* Universal champion placement for shared match cards. */
(()=>{const style=document.createElement('style');style.textContent=`.cbpes-match .cbpes-champion-crest{display:inline-flex!important;align-items:center!important;gap:4px;flex:none;width:max-content;max-width:100%}.cbpes-match .cbpes-champion-coach{display:flex!important;align-items:center!important;gap:4px;flex-wrap:wrap;min-width:0}.cbpes-match .cbpes-champion-coach .cbpes-match-champion-label{order:1!important}.cbpes-match .cbpes-champion-crest .cbpes-match-champion-label{order:-1!important}.cbpes-match .cbpes-round-clean-row:has(.cbpes-champion-crest .cbpes-match-champion-label){grid-template-columns:max-content minmax(0,1fr) auto!important}.cbpes-match .cbpes-match-club:has(.cbpes-champion-crest .cbpes-match-champion-label){grid-template-columns:max-content minmax(0,1fr)!important}.cbpes-match .cbpes-champion-crest img{flex:none}@media(max-width:700px){.cbpes-match .cbpes-champion-crest{gap:3px}.cbpes-match .cbpes-champion-crest .cbpes-match-champion-label,.cbpes-match .cbpes-champion-coach .cbpes-match-champion-label{font-size:8px!important;padding:2px 3px!important}}`;document.head.appendChild(style)})();
