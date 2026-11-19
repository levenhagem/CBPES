let D = null, filter = 'all', profileMode = 'current', selectedWeeklyTable = 'current', statsCategory = 'official';
const selectedPhaseByEdition = {}; let selectedOfficialPhase = null;
const selectedRoundByEdition = {}; const selectedOfficialRoundByPhase = {};
const $ = id => document.getElementById(id);
const PAGES = ['home', 'games', 'table', 'stats', 'weeklies', 'participant', 'team', 'coach'];
const empty = t => `<div class="empty">${t}</div>`;

function route() {
  const raw = location.hash.slice(1), parts = raw.split('/');
  const profile = ['participant','team','coach'].includes(parts[0]) && parts.length > 1;
  const id = profile ? parts[0] : (PAGES.includes(raw) ? raw : 'home');
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  if (profile && D) {
    const value = decodeURIComponent(parts.slice(1).join('/'));
    if (id === 'participant') renderParticipant(value);
    if (id === 'team') renderTeam(value);
    if (id === 'coach') renderCoach(value);
  }
  window.scrollTo(0, 0);
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => location.hash = b.dataset.page);
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.hash = b.dataset.go);
window.addEventListener('hashchange', route);
$('filters').onclick = e => { if (e.target.dataset.f) { filter = e.target.dataset.f; renderGames(); } };

const participantLink = p => `<a href="#team/${encodeURIComponent(p.id)}">${teamWithCrest(p)}</a>`;
const coachLink = name => name ? `<a class="coach-link" href="#coach/${encodeURIComponent(name)}">${esc(name)}</a>` : '<span>Não informado</span>';
const zonesFor = (type,weeklyId,phaseId) => (D?.standingsZones||[]).filter(z=>z.competition_type===type && (type==='official'||String(z.weekly_id)===String(weeklyId)) && (phaseId ? String(z.phase_id)===String(phaseId) : !z.phase_id)).sort((a,b)=>a.position_start-b.position_start);
const zoneAt = (zones,position) => zones.find(z=>position>=z.position_start&&position<=z.position_end);
const zoneLegend = zones => zones.length ? `<div class="cbpes-zone-legend">${zones.map(z=>`<span><i style="background:${z.color}"></i>${esc(z.label)}</span>`).join('')}</div>` : '';
const formDots = (teamId,matches=[]) => {
  const recent=matches.filter(m=>m.played&&(String(m.home_id)===String(teamId)||String(m.away_id)===String(teamId)))
    .sort((a,b)=>String(a.played_on||a.updated_at||a.date||'').localeCompare(String(b.played_on||b.updated_at||b.date||''))||Number(a.round?.number||0)-Number(b.round?.number||0)||String(a.created_at||'').localeCompare(String(b.created_at||''))).slice(-5);
  const dots=Array.from({length:Math.max(0,5-recent.length)},()=>'<span class="cbpes-form-dot pending" title="Sem jogo"></span>');
  recent.forEach(m=>{const home=String(m.home_id)===String(teamId),goals=Number(home?m.home_score:m.away_score),against=Number(home?m.away_score:m.home_score);
    const result=goals>against?'win':goals<against?'loss':'draw';
    dots.push('<span class="cbpes-form-dot '+result+'" title="'+({win:'Vitória',loss:'Derrota',draw:'Empate'}[result])+'"></span>');
  });
  return '<span class="cbpes-form" aria-label="Forma nos últimos cinco jogos">'+dots.join('')+'</span>';
};
const miniTable = (st,zones=[],matches=[]) => `<table class="table cbpes-liga-pro-table cbpes-liga-pro-mini"><thead><tr><th>TIME</th><th>PTS</th><th>J</th><th>SG</th><th>FORMA</th></tr></thead><tbody>${st.map((x, i) => `<tr style="--zone-color:${zoneAt(zones,i+1)?.color||'transparent'}"><td class="cbpes-zone-position"><span class="pos">${i + 1}</span><span class="club">${participantLink(x.p)}<small class="table-coach">${x.p.coach_name ? coachLink(x.p.coach_name) : ''}</small></span></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${sgf(x.sg)}</td><td>${formDots(x.p.id,matches)}</td></tr>`).join('')}</tbody></table>${zoneLegend(zones)}`;
const fullTbl = (st,zones=[],matches=[],theme='') => st.length ? `<table class="table ${theme==='liga-pro'?'cbpes-liga-pro-table':''}"><thead><tr><th>POS.</th><th>TIME</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th><th>FORMA</th></tr></thead><tbody>${st.map((x, i) => `<tr style="--zone-color:${zoneAt(zones,i+1)?.color||'transparent'}"><td class="cbpes-zone-position">${i + 1}</td><td class="club">${participantLink(x.p)}<small class="table-coach">${x.p.coach_name ? coachLink(x.p.coach_name) : ''}</small></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td><td>${formDots(x.p.id,matches)}</td></tr>`).join('')}</tbody></table>${zoneLegend(zones)}` : empty('Sem participantes nesta tabela.');
const heading = t => `<div class="eyebrow" style="margin:12px 0 4px">${t}</div>`;

const roundPicker = (rounds, selected, prefix, attr) => {
  if (!rounds.length) return empty('Nenhuma rodada cadastrada nesta fase.');
  const ix = Math.max(0, rounds.findIndex(r => String(r.id) === String(selected)));
  const current = rounds[ix];
  return `<div class="round-switcher" aria-label="Navegação por rodadas"><button class="phase-arrow" data-${attr}-prev="${esc(prefix)}" aria-label="Rodada anterior" ${ix===0?'disabled':''}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><b>${esc(roundLabel(current).toUpperCase())}</b><button class="phase-arrow" data-${attr}-next="${esc(prefix)}" aria-label="Próxima rodada" ${ix===rounds.length-1?'disabled':''}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button></div>`;
};
const defaultRound = (rounds, games, key) => {
  if (!rounds.length) return null;
  if (rounds.some(r=>String(r.id)===String(key))) return key;
  const played = rounds.filter(r=>games.some(m=>String(m.round_id||m.weekly_round_id)===String(r.id)&&m.played));
  return (played.length ? played[played.length-1] : rounds[0]).id;
};
const changeRound = (rounds, selected, direction) => {
  const i=rounds.findIndex(r=>String(r.id)===String(selected));
  return rounds[Math.max(0,Math.min(rounds.length-1,i+direction))]?.id || selected;
};
const byDisplayOrder = (a,b)=>(a.display_order??1000000)-(b.display_order??1000000);
const matchWinner = m => !m?.played ? null : m.home_score>m.away_score ? m.home : m.away_score>m.home_score ? m.away : m.home_pen!=null&&m.away_pen!=null ? (m.home_pen>m.away_pen?m.home:m.away_pen>m.home_pen?m.away:null) : null;
const championBanner = (team,coach) => team ? `<div class="cbpes-champion-banner"><span>CAMPEÃO</span><strong>${participantLink(team)}${coach?' — '+coachLink(coach):''}</strong></div>` : '';

const resultsPanel = (nav, content) => `<div class="cbpes-results-panel">${nav}${content}</div>`;
const twoColumn = (table, results) => table ? `<div class="cbpes-competition-layout"><div class="cbpes-standings-panel">${table}</div>${resultsPanel('',results)}</div>` : `<div class="cbpes-knockout-full">${resultsPanel('',results)}</div>`;


function tieRows(ties) {
  if (!ties.length) return empty('Aguardando definição do mata-mata.');
  return ties.map(t => {
    const w = x => `<a href="#team/${x.id}"${t.winner && t.winner.id === x.id ? ' class=\"winner\"' : ''}>${esc(x.name)}</a>`;
    const legs = t.legs.map(l => `${esc(l.home.name)} ${l.played ? l.home_score + ' x ' + l.away_score : 'a jogar'}${l.home_pen !== null ? ' (' + l.home_pen + '–' + l.away_pen + ' pên.)' : ''}`).join(' • ');
    const agg = t.legs.some(l => l.played) ? `${t.A} – ${t.B}` : '– : –';
    return `<div class="result-row"><div class="round-label">${t.done ? 'ENC.' : 'ABERTO'}</div><div class="result-teams">${w(t.a)} x ${w(t.b)}<small>${legs}</small></div><div class="result-score">${agg}</div></div>`;
  }).join('');
}
const koHTML = () => koRounds(D).map(r => heading(esc(roundLabel(r).toUpperCase())) + tieRows(tiesOf(D.matches.filter(m => m.round_id === r.id)))).join('');
const densePosition=(rows,i,f)=>i>0 && f(rows[i])===f(rows[i-1]) ? '' : String(1+rows.slice(1,i+1).filter((x,j)=>f(x)!==f(rows[j])).length);
const plCard = (title, rows, f, unit) => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b><span class="rank-position">${densePosition(rows,i,f)}</span>${esc(x.name)}</b><small><a href="#team/${x.team.id}">${esc(x.team.name)}</a></small></div><span class="number">${f(x)} ${unit}</span></div>`).join('') : empty('Nenhum registro ainda.')}</div></div>`;
const rankCard = (title, rows, f, unit = '') => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 8).map((x, i) => `<div class="player"><div><b><span class="rank-position">${densePosition(rows,i,f)}</span>${participantLink(x.p)}</b></div><span class="number">${f(x)}${unit}</span></div>`).join('') : empty('Sem dados ainda.')}</div></div>`;

function renderHome() {
  const { participants, rounds, matches } = D, played = latestPlayed(matches), nx = nextMatches(matches), S = stats(D, 'nonweekly'), t = typeOf();
  $('hSeason').textContent = (SET.name + ' • TEMPORADA ' + SET.season).toUpperCase();
  const cr = currentRound(rounds, matches);
  $('hRound').textContent = cr ? roundLabel(cr).toUpperCase() : 'SEM RODADAS';

  const sc = m => `<div class="sc"><div class="sc-meta"><a href="#games">${m.category === 'friendly' ? 'AMISTOSO' : m.category === 'weekly' ? 'SEMANAL' : esc(SET.name)} • ${m.date ? fd(m.date).slice(0, 5) : 'a definir'}</a></div><div class="sc-row"><span><a href="#team/${m.home_id}">${esc(m.home.name)}</a></span><b>${m.played ? m.home_score : ''}</b></div><div class="sc-row"><span><a href="#team/${m.away_id}">${esc(m.away.name)}</a></span><b>${m.played ? m.away_score : ''}</b></div></div>`;
  const sl = played.slice(0, 6).reverse();
  $('strip').innerHTML = sl.length ? sl.map(sc).join('') + '<a class="sc-end" href="#games">TODOS OS JOGOS →</a>' : '<div class="sc-end" style="padding:14px 16px">Nenhuma partida cadastrada.</div>';
  const m = played.find(x=>x.is_featured) || D.matches.find(x=>x.is_featured && x.played) || played[0];
  const featured = !!m?.is_featured;
  const featuredRow = () => matchRow(m);
  const championTag = team => String(m.champion_team_id||'')===String(team?.id) ? '<span class="featured-juventus-champion">CAMPEÃO</span>' : '';
  $('latest').innerHTML = m ? (m.category !== 'official' ? `<div class="eyebrow" style="margin-bottom:5px">${featured?'PARTIDA EM DESTAQUE':'ÚLTIMA PARTIDA'}${m.category==='weekly'?' • SEMANAL':m.category==='friendly'?' • AMISTOSO':''}</div>${featuredRow()}` : `<div class="latest-match" style="--match-color:${matchColor(m)};background:${matchColor(m)}"><div class="latest-top"><b>${featured?'PARTIDA EM DESTAQUE':'Última partida'}</b><span>${esc(SET.name)}</span></div><div class="latest-main"><div class="latest-team"><div class="latest-teamtext"><div class="featured-juventus-name-row"><a href="#team/${m.home_id}">${esc(m.home.name)}</a>${championTag(m.home)}</div><small>${coachLink(m.home_coach_name || m.home.coach_name)}</small></div></div><div class="latest-score"><span>${m.home_score} : ${m.away_score}</span></div><div class="latest-team"><div class="latest-teamtext"><div class="featured-juventus-name-row"><a href="#team/${m.away_id}">${esc(m.away.name)}</a>${championTag(m.away)}</div><small>${coachLink(m.away_coach_name || m.away.coach_name)}</small></div></div></div><div class="latest-foot"><span>${fd(m.date)}</span><span>${esc(SET.season)}</span></div></div>`) : `<div class="card"><div class="cardbody">${empty('Nenhuma partida realizada ainda.')}</div></div>`;
  const recentHome = played.slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'') || (b.date||'').localeCompare(a.date||'')).slice(0,5);
  const nextHome = [...nx.filter(m => m.category === 'official').slice(0, 5), ...nx.filter(m => m.category === 'friendly').slice(0, 5), ...nx.filter(m => m.category === 'weekly').slice(0, 5)].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  $('recent').innerHTML = recentHome.length ? recentHome.map(matchRow).join('') : empty('Nenhum resultado cadastrado.');
  $('next').innerHTML = nextHome.length ? nextHome.map(matchRow).join('') : empty('Nenhuma partida agendada.');
  // Painel lateral da Liga Pro: classificação, últimos resultados e números exclusivos.
  const proEdition=(D.officialEditions||[]).find(e=>/liga\s*pro/i.test(((D.officialCompetitions||[]).find(c=>c.id===e.competition_id)?.name||'')+' '+e.name));
  const proRounds=proEdition?(D.rounds||[]).filter(r=>String(r.official_edition_id)===String(proEdition.id)):[];
  const proRoundIds=new Set(proRounds.map(r=>String(r.id)));
  const proMatches=proEdition?matches.filter(m=>(m.category||'official')==='official'&&(String(m.official_edition_id)===String(proEdition.id)||(!m.official_edition_id&&proRoundIds.has(String(m.round_id))))):[];
  const proPhases=(D.phases||[]).filter(p=>p.competition_type==='official'&&String(p.official_edition_id)===String(proEdition?.id));
  const standingsPhases=new Set(proPhases.filter(p=>p.counts_in_standings).map(p=>String(p.id)));
  const leagueRounds=proRounds.filter(r=>standingsPhases.size?standingsPhases.has(String(r.phase_id)):(r.stage==='liga'||r.stage==='grupos'));
  const leagueIds=new Set(leagueRounds.map(r=>String(r.id)));
  const proLeagueMatches=proMatches.filter(m=>leagueIds.has(String(m.round_id)));
  const proTeamIds=new Set(proLeagueMatches.flatMap(m=>[String(m.home_id),String(m.away_id)]));
  const proTeams=participants.filter(p=>proTeamIds.has(String(p.id)));
  const proStanding=standings(proTeams,proLeagueMatches);
  $('miniTitle').textContent=proEdition?'LIGA PRO — CLASSIFICAÇÃO':'CLASSIFICAÇÃO';
  $('miniTable').innerHTML=proEdition?(proStanding.length?'<div class="cbpes-home-league-compact">'+miniTable(proStanding.slice(0,6),zonesFor('official',null,(D.phases||[]).find(p=>String(p.official_edition_id)===String(proEdition.id)&&p.counts_in_standings)?.id),proLeagueMatches)+'</div>':empty('Nenhuma equipe vinculada à fase classificatória.')):empty('Liga Pro não cadastrada.');
  const proRecent=latestPlayed(proMatches).slice(0,3);
  $('leagueRecent').innerHTML=proRecent.length?proRecent.map(m=>matchRow(m,true)).join(''):empty('Nenhuma partida da Liga Pro finalizada.');
  const proPlayed=proMatches.filter(m=>m.played);
  const proGoals=proPlayed.reduce((sum,m)=>sum+(Number(m.home_score)||0)+(Number(m.away_score)||0),0);
  $('numbers').innerHTML=`<div class="stats"><div class="stat"><b>${proPlayed.length}</b><span>Partidas</span></div><div class="stat"><b>${proGoals}</b><span>Gols</span></div><div class="stat"><b>${proPlayed.length?(proGoals/proPlayed.length).toFixed(2).replace('.',','):'0,00'}</b><span>Média de gols</span></div></div>`;

}

function renderGames() {
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('selected', b.dataset.f === filter));
  const ms = D.matches.filter(m => ['all','done','next'].includes(filter) ? (filter === 'all' || (filter === 'done' ? m.played : !m.played)) : (m.category || 'official') === filter);
  const official = ms.filter(m => m.category === 'official' && m.round);
  const visibleOfficialRounds = new Set(official.filter(m => m.played).map(m => String(m.round_id)));
  const friendlies = ms.filter(m => m.category === 'friendly');
  const weeklies = ms.filter(m => m.category === 'weekly');
  const latestResultInRound = round => official.filter(m=>String(m.round_id)===String(round.id)&&m.played).reduce((latest,m)=>{
    const stamp=m.updated_at||m.played_on||m.date||'';
    return stamp>latest?stamp:latest;
  },'');
  const rs = [...new Map(official.filter(m => visibleOfficialRounds.has(String(m.round_id))).map(m => [m.round.id, m.round])).values()].sort((a,b) => {
    if(filter==='next')return a.number-b.number;
    const aLatest=latestResultInRound(a), bLatest=latestResultInRound(b);
    if(aLatest!==bLatest)return bLatest.localeCompare(aLatest);
    return b.number-a.number;
  });
  const officialHtml = rs.map(r => {
    const list = official.filter(m => m.round_id === r.id).sort((a,b)=>byDisplayOrder(a,b)||(a.seq||0)-(b.seq||0));
    if (!list.length) return '';
    return heading(`${esc(roundLabel(r).toUpperCase())}${r.date ? ' • ' + fd(r.date) : ''}`) + list.map(matchRow).join('');
  }).join('');
  const friendlyHtml = friendlies.length ? heading('PARTIDAS AMISTOSAS') + friendlies.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(matchRow).join('') : '';
  const weeklyHtml = [...new Set(weeklies.map(m=>m.weekly_id))].map(id=>{const edition=weeklies.find(m=>m.weekly_id===id)?.weekly;const games=weeklies.filter(m=>m.weekly_id===id);const title=edition?`SEMANAL • ${fd(edition.event_date)}`:'SEMANAL';const playedWeeklyRoundIds=new Set(games.filter(m=>m.played&&m.weekly_round_id).map(m=>String(m.weekly_round_id)));const rounds=[...new Map(games.filter(m=>m.weeklyRound&&playedWeeklyRoundIds.has(String(m.weekly_round_id))).map(m=>[m.weeklyRound.id,m.weeklyRound])).values()].sort((a,b)=>a.number-b.number);const roundHtml=rounds.map(r=>heading(esc(roundLabel(r).toUpperCase()))+games.filter(m=>m.weekly_round_id===r.id).sort(byDisplayOrder).map(m=>matchRow(m,true)).join('')).join('');const unassigned=games.filter(m=>!m.weekly_round_id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));return heading(title)+roundHtml+(unassigned.length?heading('PARTIDAS SEM RODADA')+unassigned.map(m=>matchRow(m,true)).join(''):'');}).join('');
  $('gamesList').innerHTML = officialHtml + friendlyHtml + weeklyHtml || empty('Nenhuma partida encontrada.');
}
function renderTable() {
  const editions=D.officialEditions||[], competitions=D.officialCompetitions||[];
  const valid=editions.some(e=>e.id===selectedWeeklyTable);
  if(!valid)selectedWeeklyTable=editions[0]?.id||'current';
  const selectedEdition=editions.find(e=>String(e.id)===String(selectedWeeklyTable));
  const selectedCompetition=competitions.find(c=>String(c.id)===String(selectedEdition?.competition_id));
  const selectedWeekly=(D.weeklies||[]).find(w=>String(w.id)===String(selectedWeeklyTable));
  const isLigaProTable=/liga\s*pro/i.test([selectedEdition?.name,selectedCompetition?.name].filter(Boolean).join(' '));
  const isMaster=/copa\s*master/i.test([selectedEdition?.name,selectedCompetition?.name,selectedWeekly?.name].filter(Boolean).join(' '));
  const compButton=$('tableCompetitionButton'), compOptions=$('tableCompetitionOptions');
  const compChoices=editions.map(e=>({id:String(e.id),label:(competitions.find(c=>c.id===e.competition_id)?.name||'Competição')+' — '+e.name}));
  if(compButton&&compOptions){
    compButton.textContent=compChoices.find(o=>o.id===String(selectedWeeklyTable))?.label||compChoices[0]?.label||'Nenhuma competição cadastrada';
    compOptions.innerHTML=compChoices.map(o=>'<button type="button" role="option" aria-selected="'+(o.id===String(selectedWeeklyTable)?'true':'false')+'" data-competition-id="'+esc(o.id)+'">'+esc(o.label)+'</button>').join('');
    compOptions.hidden=true;compButton.setAttribute('aria-expanded','false');
  }
  if ((D.weeklies||[]).some(w=>w.id===selectedWeeklyTable)) {
    const w=D.weeklies.find(x=>x.id===selectedWeeklyTable), allMs=D.matches.filter(m=>m.category==='weekly'&&m.weekly_id===selectedWeeklyTable), phases=(D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===selectedWeeklyTable).sort((a,b)=>a.sort_order-b.sort_order), ms=allMs.filter(m=>{const r=(D.weeklyRounds||[]).find(x=>x.id===m.weekly_round_id);return r?.phase?.counts_in_standings || (!r?.phase_id && (!phases.length || phases[0].phase_type==='groups'));}), ids=new Set(allMs.flatMap(m=>[m.home_id,m.away_id]));
    const roster=(D.weeklyParticipants||[]).filter(x=>x.weekly_id===selectedWeeklyTable).map(x=>x.participant_id);const st=standings(D.participants.filter(p=>ids.has(p.id)||roster.includes(p.id)),ms,{ptsW:3,ptsD:1});
    $('tblTitle').textContent=w?.name||'CAMPEONATO SEMANAL'; $('tblPill').textContent=''; $('tblPill').hidden=true; 
    const champion=w?.champion_id?D.participants.find(p=>p.id===w.champion_id):null;
    const info=`<div class="notice"><b>Formato:</b> ${esc(w?.format_description||'Não informado')}<br><b>Participantes:</b> ${w?.participant_count||roster.length||ids.size}${champion?`<br><b>Campeão:</b> <a href="#team/${champion.id}">${esc(champion.name)}</a>${w.champion_coach_name?' • '+coachLink(w.champion_coach_name):''}`:'<br><b>Campeão:</b> ainda não definido'}</div>`;
    const rounds=[...new Map(allMs.filter(m=>m.weeklyRound).map(m=>[m.weeklyRound.id,m.weeklyRound])).values()].sort((a,b)=>a.number-b.number);const results=rounds.map(r=>heading(`${esc(roundLabel(r).toUpperCase())}${r.date?' • '+fd(r.date):''}`)+allMs.filter(m=>m.weekly_round_id===r.id).sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(matchRow).join('')).join('')+(allMs.some(m=>!m.weekly_round_id)?heading('PARTIDAS SEM RODADA')+allMs.filter(m=>!m.weekly_round_id).map(matchRow).join(''):'');
    $('fullTable').innerHTML=info+`<div class="admin-help">A classificação considera somente as fases classificatórias. Partidas de mata-mata são exibidas separadamente e não somam pontos.</div>`+(st.length?`<div class="eyebrow" style="margin:12px 0 4px">RESUMO ESTATÍSTICO DA EDIÇÃO (RESUMO: 3 PTS POR VITÓRIA, 1 POR EMPATE)</div>${fullTbl(st,zonesFor('weekly',selectedWeeklyTable,phases.find(p=>p.counts_in_standings)?.id),allMs.filter(m=>m.round?.phase?.counts_in_standings))}`:empty('Ainda não há partidas nesta edição.'))+heading('PARTIDAS DA EDIÇÃO')+(results||empty('Nenhuma partida cadastrada.'));
    return;
  }
  const edition=editions.find(e=>e.id===selectedWeeklyTable);
  // A aba Jogos exibe partidas oficiais mesmo quando registros antigos não têm edição.
  // A classificação também deve reconhecê-las pela edição da rodada.
  // Compatibilidade com dados legados só é aplicada automaticamente se existir uma única edição.
  const onlyEdition=editions.length===1;
  const officialRounds=D.rounds.filter(r=>r.official_edition_id===edition?.id||(onlyEdition&&!r.official_edition_id));
  const roundIds=new Set(officialRounds.map(r=>String(r.id)));
  const officialMatches=D.matches.filter(m=>(m.category||'official')==='official'&&(
    m.official_edition_id===edition?.id||
    (!m.official_edition_id&&(m.round_id?roundIds.has(String(m.round_id)):onlyEdition))
  ));
  const officialPhases=(D.phases||[]).filter(p=>p.competition_type==='official'&&(
    p.official_edition_id===edition?.id||(onlyEdition&&!p.official_edition_id)
  ));
  if(!edition){$('tblTitle').textContent='COMPETIÇÕES CBPES';$('tblPill').textContent='';$('fullTable').innerHTML=empty('Nenhuma competição oficial cadastrada.');return;}
  const t = officialRounds.some(r=>r.stage==='liga')?'liga':officialRounds.some(r=>r.stage==='grupos')?'copa':officialRounds.some(r=>r.stage==='mata')?'mata':typeOf(); let html = '', title = edition.name, pill = '';
  const phases=officialPhases.filter(p=>p.competition_type==='official'&&(p.phase_type!=='third_place'||!officialPhases.some(x=>x.competition_type==='official'&&x.phase_type==='final'))).sort((a,b)=>a.sort_order-b.sort_order);
  if(phases.length){
    if(!phases.some(p=>p.id===selectedOfficialPhase)) selectedOfficialPhase=phases[0].id;
    const active=phases.find(p=>p.id===selectedOfficialPhase);
    const ix=phases.findIndex(p=>p.id===selectedOfficialPhase);
    const nav=`<div class="phase-switcher" style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:10px 0;margin:12px 0"><button class="phase-arrow" id="phasePrev" aria-label="Fase anterior" ${ix<=0?'disabled':''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><b style="text-align:center;flex:1">${esc(active.name).toUpperCase()}</b><button class="phase-arrow" id="phaseNext" aria-label="Próxima fase" ${ix>=phases.length-1?'disabled':''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div>`;
    const rounds=officialRounds.filter(r=>r.phase_id===active.id).sort((a,b)=>a.number-b.number);
    const phaseMatches=officialMatches.filter(m=>rounds.some(r=>r.id===m.round_id));
    const roundKey=String(active.id); selectedOfficialRoundByPhase[roundKey]=defaultRound(rounds,phaseMatches,selectedOfficialRoundByPhase[roundKey]);
    const currentRound=rounds.find(r=>String(r.id)===String(selectedOfficialRoundByPhase[roundKey]));
    let currentGames=phaseMatches.filter(m=>m.round_id===currentRound?.id).sort(byDisplayOrder);
    if(active.phase_type==='final'){const thirdP=officialPhases.find(p=>p.competition_type==='official'&&p.phase_type==='third_place');const ids=officialRounds.filter(r=>r.phase_id===thirdP?.id).map(r=>r.id);currentGames=currentGames.concat(officialMatches.filter(m=>ids.includes(m.round_id))).sort(byDisplayOrder);}
    const roundNav=roundPicker(rounds,selectedOfficialRoundByPhase[roundKey],roundKey,'official-round');
    if(active.counts_in_standings){
      if(t==='copa'||rounds.some(r=>r.stage==='grupos')){const groups=[...new Set(phaseMatches.map(m=>m.group_name).filter(Boolean))].sort();html=groups.map(g=>{const gm=phaseMatches.filter(m=>m.group_name===g),ids=new Set(gm.flatMap(m=>[m.home_id,m.away_id]));return heading('GRUPO '+esc(g))+fullTbl(standings(D.participants.filter(p=>ids.has(p.id)),gm),zonesFor('official',null,active.id),gm,isLigaProTable?'liga-pro':'');}).join('')||(phaseMatches.length?fullTbl(standings(D.participants.filter(p=>phaseMatches.some(m=>m.home_id===p.id||m.away_id===p.id)),phaseMatches),zonesFor('official',null,active.id),phaseMatches,isLigaProTable?'liga-pro':''):empty('Aguardando partidas da fase de grupos.'));}
      else html=fullTbl(standings(D.participants.filter(p=>p.participates_in_competition!==false),phaseMatches),zonesFor('official',null,active.id),phaseMatches,isLigaProTable?'liga-pro':'');
    }else{
      html='';
    }
    const configuredSlots=Array.isArray(active.playoff_config?.placeholder_matches)?active.playoff_config.placeholder_matches:[];
    const placeholderHtml=['playoff','knockout','final'].includes(active.phase_type)&&!phaseMatches.length&&configuredSlots.length?
      '<div class="cbpes-playoff-template">'+configuredSlots.map((pair,i)=>`<div class="cbpes-match" style="--match-color:#bfcbd3">
        ${active.phase_type==='final'?'':`<div class="cbpes-match-top"><span class="cbpes-match-category">${esc(active.name).toUpperCase()} • CHAVE ${i+1}</span></div>`}
        <div class="cbpes-match-main">
          <div class="cbpes-match-team home"><div class="cbpes-match-club"><div class="cbpes-match-club-text"><span class="cbpes-team-name">${esc(String(pair[0]||'A definir'))}</span></div></div></div>
          <div class="cbpes-match-score">– : –</div>
          <div class="cbpes-match-team away"><div class="cbpes-match-club"><div class="cbpes-match-club-text"><span class="cbpes-team-name">${esc(String(pair[1]||'A definir'))}</span></div></div></div>
        </div>
      </div>`).join('')+'</div>':'';
    const roundGames=placeholderHtml||(active.counts_in_standings?currentGames.map(m=>matchRow(m,true)).join(''):active.phase_type==='final'?currentGames.map(m=>matchRow(m,true)).join(''):tieRows(tiesOf(currentGames)));
    const editionCompetition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition.competition_id));
    const isLigaEvo=/liga\s*evo/i.test((editionCompetition?.name||'')+' '+(edition.name||''));
    if(isLigaEvo&&ix===0){
      const evoTeamIds=new Set(officialMatches.flatMap(m=>[String(m.home_id),String(m.away_id)]));
      const evoTeams=D.participants.filter(p=>p.participates_in_competition!==false&&(evoTeamIds.size===0||evoTeamIds.has(String(p.id))));
      const evoTable=fullTbl(standings(evoTeams,phaseMatches),zonesFor('official',null,active.id),phaseMatches);
      const evoFixtures=phaseMatches.length?(roundNav+(roundGames||empty('Nenhuma partida nesta rodada.'))):'<div style="display:flex;align-items:center;justify-content:center;min-height:180px;padding:24px;text-align:center;color:var(--muted)">Confrontos a definir.</div>';
      html=twoColumn(evoTable,evoFixtures);
    }else{
      html=placeholderHtml?'<div class="cbpes-competition-neutral" style="width:100%;max-width:100%">'+placeholderHtml+'</div>':twoColumn(active.counts_in_standings?html:'',roundNav+(roundGames||empty('Nenhuma partida nesta rodada.')));
    }
    const finalP=phases.find(p=>p.phase_type==='final'),thirdP=officialPhases.find(p=>p.competition_type==='official'&&p.phase_type==='third_place');
    const finalIds=officialRounds.filter(r=>r.phase_id===finalP?.id).map(r=>r.id),thirdIds=officialRounds.filter(r=>r.phase_id===thirdP?.id).map(r=>r.id);
    const fm=officialMatches.find(m=>finalIds.includes(m.round_id)&&m.played),tm=officialMatches.find(m=>thirdIds.includes(m.round_id)&&m.played);
    const win=matchWinner(fm), runner=win?(win.id===fm.home_id?fm.away:fm.home):null;
    const bronze=matchWinner(tm);
    const podium=(win||runner||bronze)?`<div class="notice" style="margin-top:14px"><b>PÓDIO DA COMPETIÇÃO</b><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;text-align:center;align-items:end;margin-top:10px"><div><b>${runner?participantLink(runner):'—'}</b><small style="display:block">2º LUGAR</small><div style="height:36px;background:#a7adb4;margin-top:5px"></div></div><div><b>${win?participantLink(win):'—'}</b><small style="display:block">1º LUGAR</small><div style="height:56px;background:#d2a52b;margin-top:5px"></div></div><div><b>${bronze?participantLink(bronze):'—'}</b><small style="display:block">3º LUGAR</small><div style="height:28px;background:#b87950;margin-top:5px"></div></div></div></div>`:'';
    html=nav+championBanner(win,fm?(win?.id===fm.home_id?fm.home_coach_name:fm.away_coach_name):null)+'<div class="cbpes-competition-neutral">'+html+'</div>'+podium; title=edition.name; pill=`${phaseMatches.filter(m=>m.played).length} PARTIDAS NA FASE`;
  } else if (t === 'liga') { const ms = officialMatches.filter(m=>!m.round?.phase_id); const rs=officialRounds.filter(r=>!r.phase_id).sort((a,b)=>a.number-b.number);const key='league';selectedOfficialRoundByPhase[key]=defaultRound(rs,ms,selectedOfficialRoundByPhase[key]);const rr=rs.find(r=>r.id===selectedOfficialRoundByPhase[key]);html='<div class="cbpes-competition-neutral">'+twoColumn(fullTbl(standings(D.participants.filter(p => p.participates_in_competition !== false), ms),[],ms),roundPicker(rs,selectedOfficialRoundByPhase[key],key,'official-round')+ms.filter(m=>m.round_id===rr?.id).map(m=>matchRow(m,true)).join(''))+'</div>'; pill = ms.filter(m => m.played).length + ' PARTIDAS DISPUTADAS'; }
  else {
    const rs=officialRounds.slice().sort((a,b)=>a.number-b.number);
    const ms=officialMatches.slice().sort(byDisplayOrder);
    html=ms.length?heading('PARTIDAS DA COMPETIÇÃO')+rs.map(r=>heading(esc(roundLabel(r).toUpperCase()))+ms.filter(m=>String(m.round_id)===String(r.id)).map(m=>matchRow(m,true)).join('')).join('')+ms.filter(m=>!m.round_id).map(m=>matchRow(m,true)).join(''):empty('Nenhuma partida vinculada a esta edição.');
    pill=ms.filter(m=>m.played).length+' PARTIDAS DISPUTADAS';
  }
  const isCopaMaster=/copa\s*master/i.test([edition.name,(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition.competition_id))?.name||''].join(' '));
  const drawNotice='';
  if(isCopaMaster && !officialMatches.length){
    html='<div class="copa-master-draw-notice copa-master-draw-centered">SORTEIO NO DIA 21 DE NOVEMBRO, ÀS 12H.</div>';
  }
  $('tblTitle').textContent = 'COMPETIÇÕES CBPES'; $('tblPill').textContent = ''; $('tblPill').hidden = true; $('fullTable').innerHTML = drawNotice+html;
  $('fullTable').onclick=e=>{const b=e.target.closest('[data-official-round-prev],[data-official-round-next]');if(!b)return;const key=b.dataset.officialRoundPrev||b.dataset.officialRoundNext;const rs=officialRounds.filter(r=>key==='league'?!r.phase_id:String(r.phase_id)===String(key)).sort((a,c)=>a.number-c.number);selectedOfficialRoundByPhase[key]=changeRound(rs,selectedOfficialRoundByPhase[key],b.dataset.officialRoundNext?1:-1);renderTable();};
  const prev=$('phasePrev'),next=$('phaseNext'); if(prev)prev.onclick=()=>{const i=phases.findIndex(p=>p.id===selectedOfficialPhase);if(i>0){selectedOfficialPhase=phases[i-1].id;renderTable();}};if(next)next.onclick=()=>{const i=phases.findIndex(p=>p.id===selectedOfficialPhase);if(i<phases.length-1){selectedOfficialPhase=phases[i+1].id;renderTable();}};
}
const competitionPickerButton=$('tableCompetitionButton'), competitionPickerOptions=$('tableCompetitionOptions');
if(competitionPickerButton&&competitionPickerOptions){
  competitionPickerButton.onclick=()=>{const open=competitionPickerOptions.hidden;competitionPickerOptions.hidden=!open;competitionPickerButton.setAttribute('aria-expanded',String(open));};
  competitionPickerOptions.onclick=e=>{const option=e.target.closest('[data-competition-id]');if(!option)return;selectedWeeklyTable=option.dataset.competitionId;renderTable();};
  document.addEventListener('click',e=>{if(!e.target.closest('.competition-select-wrap')){competitionPickerOptions.hidden=true;competitionPickerButton.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){competitionPickerOptions.hidden=true;competitionPickerButton.setAttribute('aria-expanded','false');}});
}

function renderWeeklies() {
  const root = $('weeklyList');
  const editions = D.weeklies || [];
  if (!editions.length) { root.innerHTML = `<div class="card"><div class="cardbody">${empty('Nenhuma edição semanal cadastrada ainda.')}</div></div>`; return; }
  root.innerHTML = editions.map(w => {
    const all = D.matches.filter(m => m.category === 'weekly' && m.weekly_id === w.id);
    const phases = (D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===w.id).sort((a,b)=>a.sort_order-b.sort_order);
    const fallback = {id:'legacy-groups',name:'Fase de grupos',phase_type:'groups',counts_in_standings:true};
    const phaseList = (phases.length ? phases : [fallback]).filter(p=>p.phase_type!=='third_place'||!phases.some(x=>x.phase_type==='final'));
    const finalDefault = phaseList.find(p=>p.phase_type==='final' && all.some(m=>m.played && (D.weeklyRounds||[]).some(r=>r.id===m.weekly_round_id && r.phase_id===p.id)));
    const activeId = phaseList.some(p=>p.id===selectedPhaseByEdition[w.id]) ? selectedPhaseByEdition[w.id] : (finalDefault?.id || phaseList[0].id);
    selectedPhaseByEdition[w.id]=activeId;
    const active = phaseList.find(p=>p.id===activeId);
    const rounds = (D.weeklyRounds||[]).filter(r=>r.weekly_id===w.id && (r.phase_id===activeId || (!r.phase_id && active.phase_type==='groups'))).sort((a,b)=>a.number-b.number);
    const ms = all.filter(m=>rounds.some(r=>r.id===m.weekly_round_id));
    const ids = new Set(all.flatMap(m=>[m.home_id,m.away_id]));
    const roster = (D.weeklyParticipants||[]).filter(x=>x.weekly_id===w.id).map(x=>x.participant_id);
    const teams = D.participants.filter(p=>ids.has(p.id)||roster.includes(p.id));
    const tableMatches = active.counts_in_standings ? ms : [];
    const table = standings(teams, tableMatches, {ptsW:3,ptsD:1});
    const roundKey=String(w.id)+'|'+String(activeId);
    selectedRoundByEdition[roundKey]=defaultRound(rounds,ms,selectedRoundByEdition[roundKey]);
    const chosen=rounds.find(r=>String(r.id)===String(selectedRoundByEdition[roundKey]));
    let selectedGames=all.filter(m=>m.weekly_round_id===chosen?.id);
    if(active.phase_type==='final'){const thirdP=phases.find(p=>p.phase_type==='third_place');const thirdRounds=(D.weeklyRounds||[]).filter(r=>r.phase_id===thirdP?.id);selectedGames=selectedGames.concat(all.filter(m=>thirdRounds.some(r=>r.id===m.weekly_round_id)));}
    let rows=selectedGames.sort(byDisplayOrder).map(m=>{const third=active.phase_type==='final'&&(D.weeklyRounds||[]).find(r=>r.id===m.weekly_round_id)?.phase?.phase_type==='third_place';return (third?heading('DISPUTA DE 3º LUGAR'):'')+matchRow(m,true);}).join('');
    const finalPhase = phaseList.find(p=>p.phase_type==='final');
    const thirdPhase = phases.find(p=>p.phase_type==='third_place');
    const finalRoundIds=(D.weeklyRounds||[]).filter(r=>r.phase_id===finalPhase?.id).map(r=>r.id);
    const thirdRoundIds=(D.weeklyRounds||[]).filter(r=>r.phase_id===thirdPhase?.id).map(r=>r.id);
    const finalMatch=all.find(m=>finalRoundIds.includes(m.weekly_round_id)&&m.played);
    const thirdMatch=all.find(m=>thirdRoundIds.includes(m.weekly_round_id)&&m.played);
    const winner=matchWinner(finalMatch);
    const runner=finalMatch?(winner?(winner.id===finalMatch.home_id?finalMatch.away:finalMatch.home):null):null;
    const third=matchWinner(thirdMatch);
    const podium = (winner||runner||third) ? `<div class="notice" style="margin:12px 0"><b>PÓDIO DA COMPETIÇÃO</b><div class="podium-cbp" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;text-align:center;align-items:end;margin-top:12px"><div><div style="font-size:20px;color:#a7adb4">🥈</div><b>${runner?participantLink(runner):'—'}</b><small style="display:block">2º LUGAR</small><div style="height:38px;background:#a7adb4;margin-top:6px"></div></div><div><div style="font-size:24px;color:#d2a52b">🥇</div><b>${winner?participantLink(winner):'—'}</b><small style="display:block">1º LUGAR</small><div style="height:58px;background:#d2a52b;margin-top:6px"></div></div><div><div style="font-size:20px;color:#b87950">🥉</div><b>${third?participantLink(third):'—'}</b><small style="display:block">3º LUGAR</small><div style="height:30px;background:#b87950;margin-top:6px"></div></div></div></div>`:'';
    const nav = `<div class="phase-switcher" style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:10px 0;margin:12px 0"><button class="phase-arrow" data-phase-prev="${w.id}" aria-label="Fase anterior" ${phaseList.findIndex(p=>p.id===activeId)<=0?'disabled':''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><b style="text-align:center;flex:1">${esc(active.name).toUpperCase()}</b><button class="phase-arrow" data-phase-next="${w.id}" aria-label="Próxima fase" ${phaseList.findIndex(p=>p.id===activeId)>=phaseList.length-1?'disabled':''}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div>`;
    return `<div class="card" style="margin-bottom:16px"><div class="cardhead"><div><h2>${esc(w.name)}</h2><small class="admin-help">${fd(w.event_date)} • ${w.participant_count||teams.length} PARTICIPANTES</small></div><span class="pill">${all.filter(m=>m.played).length} JOGOS • ${phaseList.length} FASES</span></div><div class="cardbody">${w.format_description?`<p class="sub">${esc(w.format_description)}</p>`:''}${nav}${championBanner(winner,finalMatch?(winner?.id===finalMatch.home_id?finalMatch.home_coach_name:finalMatch.away_coach_name):null)}<div class="cbpes-competition-neutral">${twoColumn(active.counts_in_standings?(table.length?`<h3>CLASSIFICAÇÃO — ${esc(active.name.toUpperCase())}</h3><div class="scroll">${fullTbl(table,zonesFor('weekly',w.id,active.id),phaseMatches)}</div>`:empty('Aguardando partidas desta fase.')):'',roundPicker(rounds,selectedRoundByEdition[roundKey],roundKey,'weekly-round')+(rows||empty('Nenhuma partida cadastrada nesta rodada.')))}</div>${podium}</div></div>`;
  }).join('');
  root.onclick=e=>{const b=e.target.closest('[data-phase-prev],[data-phase-next],[data-weekly-round-prev],[data-weekly-round-next]');if(!b)return;if(b.hasAttribute('data-weekly-round-prev')||b.hasAttribute('data-weekly-round-next')){const key=b.dataset.weeklyRoundPrev||b.dataset.weeklyRoundNext;const [edition,phase]=key.split('|');const rs=(D.weeklyRounds||[]).filter(r=>String(r.weekly_id)===edition&&(String(r.phase_id)===phase||(!r.phase_id&&phase==='legacy-groups'))).sort((a,c)=>a.number-c.number);selectedRoundByEdition[key]=changeRound(rs,selectedRoundByEdition[key],b.hasAttribute('data-weekly-round-next')?1:-1);renderWeeklies();return;}const id=b.dataset.phasePrev||b.dataset.phaseNext,w=D.weeklies.find(x=>x.id===id);if(!w)return;const allPhases=(D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===id).sort((a,b)=>a.sort_order-b.sort_order);const ps=allPhases.filter(p=>p.phase_type!=='third_place'||!allPhases.some(x=>x.phase_type==='final'));if(!ps.length)return;let i=ps.findIndex(p=>p.id===selectedPhaseByEdition[id]);i+=b.dataset.phasePrev?-1:1;i=Math.max(0,Math.min(ps.length-1,i));selectedPhaseByEdition[id]=ps[i].id;renderWeeklies();};
}

function renderStats() {
  const filteredMatches = D.matches.filter(m => m.category === statsCategory);
  const matchIds = new Set(filteredMatches.map(m => m.id));
  const filtered = { ...D, matches: filteredMatches, events: D.events.filter(e => matchIds.has(e.match_id)) };
  const S = stats(filtered, statsCategory), b = S.big;
  const bigTxt = b ? `<a href="#team/${b.home_id}">${esc(b.home.name)}</a> ${b.home_score} x ${b.away_score} <a href="#team/${b.away_id}">${esc(b.away.name)}</a>` : '—';
  $('statsGrid').innerHTML = `<div class="stats-category-filter" role="group" aria-label="Filtrar estatísticas">${[['official','COMPETIÇÕES OFICIAIS'],['weekly','SEMANAIS'],['friendly','AMISTOSOS']].map(([v,l])=>`<button data-stats-category="${v}" class="${statsCategory===v?'selected':''}">${l}</button>`).join('')}</div>` +
    `<div class="card"><div class="cardhead"><h2>INDICADORES GERAIS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Gols/jogo</span></div></div><div class="player" style="margin-top:8px"><div><b>Maior goleada</b><small>${bigTxt}</small></div></div></div></div>` +
    plCard('ARTILHARIA', S.artilheiros, x => x.g, 'gols') + plCard('ASSISTÊNCIAS', S.garcons, x => x.a, 'assist.') + plCard('PARTICIPAÇÕES EM GOLS (G+A)', S.part, x => x.ga, '') +
    rankCard('MELHOR ATAQUE (GOLS/JOGO)', S.ataque.slice().sort((a, c) => c.gp / c.j - a.gp / a.j), x => fmt1(x.gp / x.j)) +
    rankCard('MELHOR DEFESA (MENOS SOFRIDOS)', S.defesa, x => x.gc) + rankCard('GOLS MARCADOS', S.ataque, x => x.gp) +
    rankCard('APROVEITAMENTO', S.aprov, x => x.ap, '%') + rankCard('VITÓRIAS', S.vit, x => x.v) + rankCard('EMPATES', S.emp, x => x.e) + rankCard('DERROTAS', S.der, x => x.d) +
    rankCard('SALDO DE GOLS', S.st.filter(x => x.j).sort((a, c) => c.sg - a.sg), x => sgf(x.sg));
  $('statsGrid').onclick = e => { const b=e.target.closest('[data-stats-category]'); if(!b)return; statsCategory=b.dataset.statsCategory; renderStats(); };
}


function renderParticipant(id) {
  const p = D.participants.find(x => x.id === id), root = $('participantView');
  if (!p) { root.innerHTML = `<div class="page-title"><h1>Participante não encontrado</h1><a href="#table">Voltar à tabela</a></div>`; return; }
  const all = D.matches.filter(m => m.played && (m.home_id === id || m.away_id === id));
  const ms = all; // Até existir arquivo de temporadas, ambas as opções mostram todo o histórico disponível.
  const wins = ms.filter(m => m.home_id === id ? m.home_score > m.away_score : m.away_score > m.home_score).length;
  const draws = ms.filter(m => m.home_score === m.away_score).length, losses = ms.length - wins - draws;
  const goals = ms.reduce((n,m) => n + (m.home_id === id ? m.home_score : m.away_score), 0);
  const conceded = ms.reduce((n,m) => n + (m.home_id === id ? m.away_score : m.home_score), 0);
  const records = D.participants.filter(x => x.id !== id).map(x => {
    const h = ms.filter(m => (m.home_id === id && m.away_id === x.id) || (m.away_id === id && m.home_id === x.id));
    let v=0,d=0; h.forEach(m=>{const own=m.home_id===id?m.home_score:m.away_score, opp=m.home_id===id?m.away_score:m.home_score;if(own>opp)v++;else if(own<opp)d++;});
    return {p:x,v,d,diff:v-d,games:h.length};
  }).filter(x=>x.games);
  const best = records.filter(x=>x.diff>0).sort((a,b)=>b.diff-a.diff||b.v-a.v||b.games-a.games)[0];
  const worst = records.filter(x=>x.diff<0).sort((a,b)=>a.diff-b.diff||b.d-a.d||b.games-a.games)[0];
  const rows = ms.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const weeklyTitles=(D.weeklies||[]).filter(w=>w.champion_id===id).sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||''));
  const rivalCard = (label,x,mode) => `<div class="card"><div class="cardhead"><h2>${label}</h2></div><div class="cardbody">${x?`<div class="player"><div><b><a href="#team/${x.p.id}">${esc(x.p.name)}</a></b><small>${mode==='best'?'Maior saldo de vitórias do participante':'Maior saldo de derrotas do participante'}</small></div><span class="number"><b class="res-w">${x.v}</b> - <b class="res-l">${x.d}</b></span></div>`:empty('Ainda não há saldo positivo/negativo contra um adversário.')}</div></div>`;
  root.innerHTML = `<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL</div><h1 class="cbpes-profile-name">${crestImg(p,'cbpes-crest-large')}${esc(p.name)}</h1><div class="sub">Técnico responsável: ${coachLink(p.coach_name)}</div></div></div>
  <div class="inline" style="margin-bottom:8px"><button class="btn ${profileMode==='current'?'primary':''}" data-pmode="current">Temporada atual</button><button class="btn ${profileMode==='history'?'primary':''}" data-pmode="history">Histórico completo</button></div><p class="admin-help" style="margin-bottom:12px">Como o portal ainda não possui temporadas arquivadas separadamente, as duas opções exibem todas as partidas atualmente cadastradas.</p>
  <div class="cols3 profile-stats"><div class="card"><div class="cardhead"><h2>PARTIDAS</h2></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${ms.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${wins}</b><span>Vitórias</span></div><div class="stat"><b>${draws}</b><span>Empates</span></div><div class="stat"><b class="res-l">${losses}</b><span>Derrotas</span></div></div></div></div><div class="card"><div class="cardhead"><h2>GOLS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${goals}</b><span>Marcados</span></div><div class="stat"><b>${conceded}</b><span>Sofridos</span></div><div class="stat"><b>${ms.length ? (goals/ms.length).toFixed(1).replace('.',',') : '0,0'}</b><span>Média</span></div></div></div></div>${rivalCard('MAIOR FREGUÊS',best,'best')}${rivalCard('MAIOR CARRASCO',worst,'worst')}</div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>TROFÉUS SEMANAIS (${weeklyTitles.length})</h2></div><div class="cardbody">${weeklyTitles.length?weeklyTitles.map(w=>`<div class="player"><b>${esc(w.name)}</b><span>${fd(w.event_date)}</span></div>`).join(''):empty('Nenhum título semanal registrado.')}</div></div><div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE PARTIDAS</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${rows.length ? rows.map(m=>`<div class="result-row ${(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.home_score:m.away_score)>(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.away_score:m.home_score)?'coach-career-win':(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.home_score:m.away_score)<(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.away_score:m.home_score)?'coach-career-loss':'coach-career-draw'}"><div class="round-label ${m.category==='friendly'||m.category==='weekly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':m.category==='weekly'?'SEM':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${teamWithCrest(m.home)}</a> x <a href="#team/${m.away_id}">${teamWithCrest(m.away)}</a><small>${m.category==='friendly' ? 'Amistoso' : m.category==='weekly' ? esc(m.weekly?.name||'Semanal') : esc(SET.name)}${m.date ? ' • ' + fd(m.date) : ''} • ${coachLink(m.home_coach_name || m.home.coach_name)} / ${coachLink(m.away_coach_name || m.away.coach_name)}</small></div><div class="result-score">${m.home_score} – ${m.away_score}</div></div>`).join('') : empty('Nenhuma partida disputada.')}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>COMPARAR PARTICIPANTES</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>Adversário</label><select id="compareWith"><option value="">Selecione</option>${D.participants.filter(x=>x.id!==id).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div></div><div id="compareResult" class="admin-help" style="margin-top:10px">Selecione um participante para ver o confronto direto.</div></div></div>`;
  root.querySelectorAll('[data-pmode]').forEach(b=>b.onclick=()=>{profileMode=b.dataset.pmode;renderParticipant(id)});
  const sel=root.querySelector('#compareWith'), out=root.querySelector('#compareResult');
  sel.onchange=()=>{const other=sel.value;if(!other){out.textContent='Selecione um participante.';return;}const h=ms.filter(m=>(m.home_id===id&&m.away_id===other)||(m.away_id===id&&m.home_id===other));const w=h.filter(m=>m.home_id===id?m.home_score>m.away_score:m.away_score>m.home_score).length;const d=h.filter(m=>m.home_score===m.away_score).length;out.innerHTML=`${esc(p.name)}: <b>${w} vitória(s)</b> • ${d} empate(s) • ${h.length-w-d} derrota(s) <br>${h.map(m=>`${fd(m.date)} — ${m.home_score} x ${m.away_score}`).join('<br>')||'Nenhum confronto registrado.'}`;};
}


function profileRecord(matches, id, sideField) {
  const ms = matches.filter(m => m.played && (m.home_id === id || m.away_id === id));
  const wins = ms.filter(m => m.home_id === id ? m.home_score > m.away_score : m.away_score > m.home_score).length;
  const draws = ms.filter(m => m.home_score === m.away_score).length;
  return { ms, wins, draws, losses: ms.length - wins - draws };
}
function statsSquares(ms, sideFn) {
  let v=0,e=0,d=0;
  ms.forEach(m=>{const s=sideFn(m), own=s==='home'?m.home_score:m.away_score, opp=s==='home'?m.away_score:m.home_score;if(own>opp)v++;else if(own<opp)d++;else e++;});
  return `<div class="stats four-stats"><div class="stat"><b>${ms.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${v}</b><span>Vitórias</span></div><div class="stat"><b>${e}</b><span>Empates</span></div><div class="stat"><b class="res-l">${d}</b><span>Derrotas</span></div></div>`;
}
function renderTeam(id) {
  const p=D.participants.find(x=>x.id===id), root=$('teamView');
  if(!p){root.innerHTML=`<div class="page-title"><h1>Time não encontrado</h1><a href="#table">Voltar à tabela</a></div>`;return;}
  const ms=D.matches.filter(m=>m.played&&(m.home_id===id||m.away_id===id)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const weeklyTitles=(D.weeklies||[]).filter(w=>w.champion_id===id).sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||''));
  const history=(D.coachHistory||[]).filter(h=>h.participant_id===id).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
  const career=history.length?history.map(h=>`<div class="player"><div><b>${coachLink(h.coach_name)}</b>${h.dates_unspecified?'':`${h.dates_unspecified?'':`<small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small>`}`}</div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`).join(''):empty(p.coach_name?'Histórico anterior à implantação ainda não está detalhado.':'Nenhum técnico registrado.');
  root.innerHTML=`<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL DO TIME</div><h1>${esc(p.name)}</h1><div class="sub">${p.coach_name ? 'Técnico atual: ' + coachLink(p.coach_name) : 'Sem técnico atualmente'}</div></div></div>
  <div class="card"><div class="cardhead"><h2>DESEMPENHO DO TIME</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${statsSquares(ms,m=>m.home_id===id?'home':'away')}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>TROFÉUS SEMANAIS (${weeklyTitles.length})</h2></div><div class="cardbody">${weeklyTitles.length?weeklyTitles.map(w=>`<div class="player"><b>${esc(w.name)}</b><span>${fd(w.event_date)}</span></div>`).join(''):empty('Nenhum título semanal registrado.')}</div></div><div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE TÉCNICOS</h2></div><div class="cardbody">${career}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE PARTIDAS</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${ms.length?ms.map(m=>`<div class="result-row"><div class="round-label ${m.category==='friendly'||m.category==='weekly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':m.category==='weekly'?'SEM':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${esc(m.home.name)}</a> x <a href="#team/${m.away_id}">${esc(m.away.name)}</a><small>${m.category==='friendly'?'Amistoso':m.category==='weekly'?esc(m.weekly?.name||'Semanal'):esc(SET.name)} • ${fd(m.date)} • ${coachLink(m.home_coach_name||m.home.coach_name)} / ${coachLink(m.away_coach_name||m.away.coach_name)}</small></div><div class="result-score">${m.home_score} – ${m.away_score}</div></div>`).join(''):empty('Nenhuma partida disputada.')}</div></div>`;
}
function renderCoach(name) {
  const root=$('coachView'), key=String(name||'').trim().toLocaleLowerCase();
  const assignments=(D.coachHistory||[]).filter(h=>String(h.coach_name||'').trim().toLocaleLowerCase()===key).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
  const teams=assignments.map(h=>D.participants.find(p=>p.id===h.participant_id)).filter(Boolean);
  const matches=D.matches.filter(m=>m.played && [m.home_coach_name,m.away_coach_name].some(n=>String(n||'').trim().toLocaleLowerCase()===key)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  let v=0,e=0,d=0;
  matches.forEach(m=>{const home=String(m.home_coach_name||'').trim().toLocaleLowerCase()===key;const own=home?m.home_score:m.away_score,opp=home?m.away_score:m.home_score;if(own>opp)v++;else if(own<opp)d++;else e++;});
  const coachOpponents = new Map();
  matches.forEach(m => {
    const homeKey=String(m.home_coach_name||'').trim().toLocaleLowerCase(), awayKey=String(m.away_coach_name||'').trim().toLocaleLowerCase();
    const ownHome=homeKey===key, ownAway=awayKey===key;
    if (ownHome===ownAway) return;
    const opponent=ownHome?String(m.away_coach_name||'').trim():String(m.home_coach_name||'').trim();
    if (!opponent) return;
    const opponentKey=opponent.toLocaleLowerCase();
    if (!coachOpponents.has(opponentKey)) coachOpponents.set(opponentKey,{name:opponent,wins:0,losses:0,draws:0});
    const rec=coachOpponents.get(opponentKey), own=ownHome?m.home_score:m.away_score, other=ownHome?m.away_score:m.home_score;
    if(own>other)rec.wins++;else if(own<other)rec.losses++;else rec.draws++;
  });
  const opponentRecords=[...coachOpponents.values()].filter(x=>x.wins+x.losses+x.draws>0);
  const bestVictim=opponentRecords.filter(x=>x.wins>x.losses).sort((a,b)=>(b.wins-b.losses)-(a.wins-a.losses)||b.wins-a.wins||a.name.localeCompare(b.name))[0];
  const biggestNemesis=opponentRecords.filter(x=>x.losses>x.wins).sort((a,b)=>(b.losses-b.wins)-(a.losses-a.wins)||b.losses-a.losses||a.name.localeCompare(b.name))[0];
  const coachRivalryCard=(title,rec,emptyText)=>`<div class="stat cbpes-rivalry"><span class="cbpes-rivalry-title">${title}</span><b class="cbpes-rivalry-name">${rec?esc(rec.name):'—'}</b><small>${rec?`<strong class="res-w">${rec.wins} V</strong> · <strong class="res-l">${rec.losses} D</strong>`:emptyText}</small></div>`;
  const coachTrophies=(D.coachTrophies||[]).filter(t=>String(t.coach_name||'').trim().toLocaleLowerCase()===key).sort((a,b)=>(b.awarded_on||'').localeCompare(a.awarded_on||''));
  const profile=(D.coachProfiles||[]).find(p=>String(p.name||'').trim().toLocaleLowerCase()===key);
  const career=assignments.length?assignments.map(h=>{const t=D.participants.find(p=>p.id===h.participant_id);return `<div class="player"><div><b>${t?`<a href="#team/${t.id}">${esc(t.name)}</a>`:'Time removido'}</b><small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small></div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`;}).join(''):empty('Nenhum vínculo histórico cadastrado para este técnico.');
  const coachNames=[...new Set([
    ...(D.coachProfiles||[]).map(x=>x.name), ...(D.coachHistory||[]).map(x=>x.coach_name),
    ...D.participants.map(x=>x.coach_name), ...D.matches.flatMap(m=>[m.home_coach_name,m.away_coach_name]),
    ...(D.coachTrophies||[]).map(x=>x.coach_name)
  ].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const coachCompareOptions=coachNames.filter(n=>n.toLocaleLowerCase()!==key).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const coachSummary=(coachName)=>{
    const k=coachName.toLocaleLowerCase();
    const games=D.matches.filter(m=>m.played && [m.home_coach_name,m.away_coach_name].some(n=>String(n||'').trim().toLocaleLowerCase()===k));
    let wins=0,draws=0,losses=0;
    games.forEach(m=>{const isHome=String(m.home_coach_name||'').trim().toLocaleLowerCase()===k;const own=isHome?m.home_score:m.away_score,other=isHome?m.away_score:m.home_score;if(own>other)wins++;else if(own<other)losses++;else draws++;});
    const trophies=(D.coachTrophies||[]).filter(t=>String(t.coach_name||'').trim().toLocaleLowerCase()===k);
    const teams=(D.coachHistory||[]).filter(h=>String(h.coach_name||'').trim().toLocaleLowerCase()===k).map(h=>D.participants.find(t=>t.id===h.participant_id)?.name).filter(Boolean);
    return {games:games.length,wins,draws,losses,trophies,teams:[...new Set(teams)]};
  };
  const renderCoachComparison=(otherName)=>{
    const out=root.querySelector('#coachCompareResult'); if(!out)return;
    if(!otherName){out.innerHTML='<div class="admin-help">Selecione outro técnico para comparar as carreiras.</div>';return;}
    const a=coachSummary(name), b=coachSummary(otherName), otherKey=otherName.toLocaleLowerCase();
    let directW=0,directD=0,directL=0,directGames=0;
    D.matches.filter(m=>m.played).forEach(m=>{
      const h=String(m.home_coach_name||'').trim().toLocaleLowerCase(), aw=String(m.away_coach_name||'').trim().toLocaleLowerCase();
      if(!((h===key&&aw===otherKey)||(h===otherKey&&aw===key)))return;
      directGames++; const own=h===key?m.home_score:m.away_score, opp=h===key?m.away_score:m.home_score;
      if(own>opp)directW++;else if(own<opp)directL++;else directD++;
    });
    const summary=(coachName,x)=>`<div class="card"><div class="cardhead"><h3>${esc(coachName)}</h3></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${x.games}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${x.wins}</b><span>Vitórias</span></div><div class="stat"><b>${x.draws}</b><span>Empates</span></div><div class="stat"><b class="res-l">${x.losses}</b><span>Derrotas</span></div></div><div class="player"><b>🏆 Troféus</b><span class="number">${x.trophies.length}</span></div><div class="player"><b>Times comandados</b><span class="number">${x.teams.length}</span></div><small>${x.teams.length?x.teams.map(esc).join(' • '):'Histórico de equipes não cadastrado'}</small><div class="player"><b>Conquistas</b><span class="number">${x.trophies.length}</span></div><small>${x.trophies.length?x.trophies.map(t=>esc(t.title)).join(' • '):'Nenhum troféu registrado'}</small></div></div>`;
    out.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px">${summary(name,a)}${summary(otherName,b)}</div><div class="notice" style="margin-top:12px"><b>CONFRONTO DIRETO</b><br>${directGames?`${esc(name)}: ${directW} vitórias • ${directD} empates • ${directL} derrotas (${directGames} jogos)`:'Nenhum confronto direto registrado entre os dois técnicos.'}</div>`;
  };
  root.innerHTML=`<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL DO TÉCNICO</div><h1>${esc(name)}</h1><div class="sub">Trajetória e desempenho na carreira</div>${profile?.bio?`<p class="sub">${esc(profile.bio)}</p>`:''}</div></div>
  <div class="card"><div class="cardhead"><h2>ESTATÍSTICAS DA CARREIRA</h2><span class="pill">${matches.length} JOGOS</span></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${matches.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${v}</b><span>Vitórias</span></div><div class="stat"><b>${e}</b><span>Empates</span></div><div class="stat"><b class="res-l">${d}</b><span>Derrotas</span></div></div></div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>RETROSPECTO CONTRA OUTROS TÉCNICOS</h2></div><div class="cardbody"><div class="stats cbpes-rivalry-grid">${coachRivalryCard('MAIOR FREGUÊS',bestVictim,'Sem retrospecto positivo definido.')}${coachRivalryCard('MAIOR CARRASCO',biggestNemesis,'Sem retrospecto negativo definido.')}</div></div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>SALA DE TROFÉUS (${coachTrophies.length})</h2></div><div class="cardbody">${coachTrophies.length?coachTrophies.map(t=>`<div class="player"><div><b>🏆 ${esc(t.title)}</b><small>${esc(t.competition_name||'Conquista')} • ${fd(t.awarded_on)}${t.team_name?' • '+esc(t.team_name):''}</small></div><span class="pill">${t.source_type==='manual'?'ESPECIAL':t.source_type==='weekly'?'SEMANAL':'OFICIAL'}</span></div>`).join(''):empty('Nenhum título registrado.')}</div></div><div class="card" style="margin-top:16px"><div class="cardhead"><h2>TIMES COMANDADOS</h2></div><div class="cardbody">${career}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>COMPARAR COM OUTRO TÉCNICO</h2></div><div class="cardbody"><div class="field"><label for="coachCompareWith">Selecione o técnico</label><select id="coachCompareWith"><option value="">Selecione outro técnico</option>${coachCompareOptions}</select></div><div id="coachCompareResult" style="margin-top:12px"><div class="admin-help">Compare retrospecto, títulos, equipes comandadas e confrontos diretos.</div></div></div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>PARTIDAS NA CARREIRA</h2></div><div class="cardbody">${matches.length?matches.map(m=>`<div class="result-row"><div class="round-label ${m.category==='friendly'||m.category==='weekly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':m.category==='weekly'?'SEM':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${esc(m.home.name)}</a> x <a href="#team/${m.away_id}">${esc(m.away.name)}</a><small>${fd(m.date)} • ${coachLink(m.home_coach_name)} / ${coachLink(m.away_coach_name)}</small></div><div class="result-score"><span class="coach-career-result" style="color:${(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.home_score:m.away_score)>(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.away_score:m.home_score)?'#16804b':(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.home_score:m.away_score)<(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.away_score:m.home_score)?'#c63d3d':'inherit'}">${(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.home_score:m.away_score)>(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.away_score:m.home_score)?'V':(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.home_score:m.away_score)<(String(m.home_coach_name||'').trim().toLocaleLowerCase()===key?m.away_score:m.home_score)?'D':'E'}</span> ${m.home_score} – ${m.away_score}</div></div>`).join(''):empty('As estatísticas serão formadas a partir das partidas com o técnico registrado no momento do jogo.')}</div></div>`;
  const compareSelect=root.querySelector('#coachCompareWith');
  if(compareSelect) compareSelect.addEventListener('change',()=>renderCoachComparison(compareSelect.value));
}

function renderAll() { renderHome(); renderGames(); renderTable(); renderWeeklies(); renderStats(); const raw=location.hash.slice(1), parts=raw.split('/'); if(parts[1]){const value=decodeURIComponent(parts.slice(1).join('/'));if(parts[0]==='participant')renderParticipant(value);if(parts[0]==='team')renderTeam(value);if(parts[0]==='coach')renderCoach(value);} $('season').textContent = 'TEMPORADA ' + SET.season; }
async function boot() {
  route();
  try {
    if (CBPES.url.startsWith('COLE')) throw new Error('config.js ainda não foi preenchido.');
    D = await load(); $('status').classList.add('hidden'); renderAll();
  } catch (e) { $('status').textContent = 'Não foi possível carregar os dados: ' + (e.message || e); }
}
boot();
setInterval(async () => { if (D && !document.hidden) { try { D = await load(); renderAll(); } catch (e) {} } }, 60000);
