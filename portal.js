let selectedWeeklyEditionId = null;
let D = null, filter = 'all', profileMode = 'current', selectedWeeklyTable = 'current', statsCategory = 'official', statsCompetition = null, statsDefenseMode = 'per-game';
const matchMetricModes = {};
const selectedPhaseByEdition = {}; let selectedOfficialPhase = null;
const selectedRoundByEdition = {}; const selectedOfficialRoundByPhase = {};
let openingArchive = [], openingArchiveError = '', openingArchiveTab = 'classification', openingArchiveRound = 1;
const $ = id => document.getElementById(id);
const PAGES = ['home', 'games', 'table', 'stats', 'stats-detail', 'records', 'trophies', 'weeklies', 'belts', 'match', 'participant', 'team', 'coach'];
const empty = t => `<div class="empty">${t}</div>`;
const publicEditionVisible = e => {
  const competition=(D?.officialCompetitions||[]).find(c=>String(c.id)===String(e?.competition_id));
  if(!competition)return false;
  // Proteção adicional para as competições em preparação, independente de cache de dados.
  const hiddenIds=new Set(['31a4e67c-54fb-46f8-895b-35dfd876c211','810e323b-ed38-44d4-8460-1e21f02dd077']);
  if(hiddenIds.has(String(competition.id)) && !/torneio\s*de\s*abertura/i.test(String(competition.name||'')))return false;
  if(/^liga\s*evo$/i.test(String(competition.name||'').trim()))return false;
  return competition.is_visible!==false;
};
const publicCompetitionMatch = m => {
  if((m.category||'official')!=='official')return true;
  const edition=(D?.officialEditions||[]).find(e=>String(e.id)===String(m.official_edition_id||m.round?.official_edition_id));
  const competition=(D?.officialCompetitions||[]).find(c=>String(c.id)===String(edition?.competition_id));
  return competition?.is_visible!==false;
};


function renderMatchReport(matchId){
  const root=$('matchReportView'),m=(D?.matches||[]).find(x=>String(x.id)===String(matchId));
  if(!m||(m.category||'official')!=='official'||!publicCompetitionMatch(m)){root.innerHTML='<div class="empty">Súmula oficial não encontrada.</div>';return;}
  const edition=(D.officialEditions||[]).find(e=>String(e.id)===String(m.official_edition_id||m.round?.official_edition_id));
  const competition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition?.competition_id));
  const stadium=(D.stadiums||[]).find(s=>s.id===(m.stadium_id||m.home?.stadium_id));
  const stat=(D.matchStatistics||[]).find(s=>s.match_id===m.id);
  const player=id=>(D.players||[]).find(p=>p.id===id);
  const goals=(D.events||[]).filter(e=>e.match_id===m.id).sort((a,b)=>(a.minute??999)-(b.minute??999));
  const isLigaPro=/liga\s*pro/i.test((competition?.name||'')+' '+(edition?.name||''));
  const isCopaMaster=/copa\s*master/i.test((competition?.name||'')+' '+(edition?.name||''));
  const theme=isLigaPro?'cbpes-report-liga-pro':isCopaMaster?'cbpes-report-copa-master':'cbpes-report-default';
  document.body.classList.toggle('cbpes-report-page',true);
  document.body.classList.toggle('cbpes-report-page-liga-pro',isLigaPro);
  document.body.classList.toggle('cbpes-report-page-copa-master',isCopaMaster);
  const goalTeam=e=>e.team_id||(e.goal_type==='own_goal'?(player(e.scorer_id)?.participant_id===m.home_id?m.away_id:m.home_id):player(e.scorer_id)?.participant_id);
  const goalName=e=>esc(player(e.scorer_id)?.name||'Jogador não informado')+(e.minute!=null?' <small>'+esc(String(e.minute))+'’</small>':'')+(e.goal_type==='own_goal'?' <small>(GC)</small>':e.goal_type==='penalty'?' <small>(P)</small>':'');
  const homeGoals=goals.filter(e=>goalTeam(e)===m.home_id);
  const awayGoals=goals.filter(e=>goalTeam(e)===m.away_id);
  const goalRows='<div class="cbpes-report-goal-column cbpes-report-goal-home">'+homeGoals.map(e=>'<div>'+goalName(e)+'</div>').join('')+'</div><span class="cbpes-report-goal-center" aria-hidden="true"><iconify-icon icon="iconoir:soccer-ball"></iconify-icon></span><div class="cbpes-report-goal-column cbpes-report-goal-away">'+awayGoals.map(e=>'<div>'+goalName(e)+'</div>').join('')+'</div>';
  const saveStats=(stat&&m.played&&stat.home_shots_on_target!=null&&stat.away_shots_on_target!=null)?{home:Math.max(0,Number(stat.away_shots_on_target)-Number(m.away_score)),away:Math.max(0,Number(stat.home_shots_on_target)-Number(m.home_score))}:null;
  const statDefs=[['possession','Posse de bola','%',false],['shots','Chutes','',false],['shots_on_target','Chutes a gol','',false],['goalkeeper_saves','Defesas do goleiro','',false],['corners','Escanteios','',false],['penalties','Pênaltis','',true],['fouls','Faltas cometidas','',false],['offsides','Impedimentos','',true],['yellow_cards','Cartões amarelos','',false],['red_cards','Cartões vermelhos','',true]];
  const clubColor=team=>{
    const valid=x=>/^#[0-9a-f]{6}$/i.test(x||'');
    const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
    const primary=valid(team?.primary_color)?team.primary_color:'#2678a9';
    const secondary=valid(team?.secondary_color)?team.secondary_color:null;
    // Fundo escuro do relatório: usar a alternativa mais legível quando a primária for apagada.
    return secondary&&luminance(secondary)>luminance(primary)&&luminance(primary)<.17?secondary:primary;
  };
  const reportClubStyle='--cbpes-home-club:'+clubColor(m.home)+';--cbpes-away-club:'+clubColor(m.away)+';';
  const statHTML=statDefs.map(([key,label,suffix,conditional])=>{
    const a=key==='goalkeeper_saves'?saveStats?.home:stat?.['home_'+key],b=key==='goalkeeper_saves'?saveStats?.away:stat?.['away_'+key];
    if(conditional&&!(Number(a)>0||Number(b)>0))return '';
    if(a==null&&b==null)return '';
    const left=Number(a)||0,right=Number(b)||0,total=left+right;
    const lPct=total?100*left/total:50,rPct=total?100*right/total:50;
    return '<div class="cbpes-report-stat cbpes-report-stat-compare"><div class="cbpes-report-stat-heading"><b>'+(a==null?(key==='yellow_cards'?'0':'—'):a+suffix)+'</b><span>'+label+'</span><b>'+(b==null?(key==='yellow_cards'?'0':'—'):b+suffix)+'</b></div><div class="cbpes-report-compare-track" role="img" aria-label="'+esc(label)+': '+(a??'não informado')+' contra '+(b??'não informado')+'"><span class="cbpes-report-compare-home" style="width:'+lPct+'%"></span><span class="cbpes-report-compare-away" style="width:'+rPct+'%"></span></div></div>';
  }).join('');
  root.innerHTML='<a class="cbpes-report-back" href="#games">← JOGOS E RESULTADOS</a><div class="cbpes-report-hero '+theme+'"><div class="cbpes-report-overline">'+(m.date?'<span class="cbpes-report-date-inline">'+fd(m.date)+'</span><span class="cbpes-report-separator"> • </span>':'')+'<strong class="cbpes-report-competition-name">'+esc(competition?.name||edition?.name||'CBPES')+'</strong>'+(m.round?' <span class="cbpes-report-separator">•</span> <strong class="cbpes-report-round-name">'+esc(m.round.name||'RODADA '+m.round.number)+'</strong>':'')+'</div><div class="cbpes-report-heading-date">'+(stadium?'<iconify-icon class="cbpes-stadium-icon" icon="material-symbols:stadium-outline" aria-hidden="true"></iconify-icon><span>'+esc(stadium.name)+'</span>':'')+'</div><div class="cbpes-report-scoreboard"><div>'+crestImg(m.home)+'<a href="#team/'+m.home_id+'">'+esc(m.home.name)+'</a><small>'+esc(m.home_coach_name||m.home.coach_name||'')+'</small></div><strong>'+(m.played?m.home_score+' : '+m.away_score:'– : –')+'</strong><div>'+crestImg(m.away)+'<a href="#team/'+m.away_id+'">'+esc(m.away.name)+'</a><small>'+esc(m.away_coach_name||m.away.coach_name||'')+'</small></div></div>'+(m.played&&goals.length?'<div class="cbpes-report-goals cbpes-report-goals-centered">'+goalRows+'</div>':'')+'<div class="cbpes-report-meta">'+(m.home_pen!=null&&m.away_pen!=null?'PÊNALTIS '+m.home_pen+'–'+m.away_pen:'')+'</div></div>'+(m.played?'<div class="card cbpes-report-stats-card" style="'+reportClubStyle+'"><div class="cardhead"><h2>ESTATÍSTICAS DA PARTIDA</h2></div><div class="cardbody">'+(statHTML||'<div class="empty">Estatísticas ainda não informadas.</div>')+'</div></div>':'')+(m.played&&m.mvp_player_id?'<div class="cbpes-report-mvp">★ MELHOR JOGADOR DA PARTIDA: <b>'+esc(player(m.mvp_player_id)?.name||'')+'</b></div>':'');
}

function route() {
  const raw = location.hash.slice(1), parts = raw.split('/');
  document.body.classList.remove('cbpes-report-page','cbpes-report-page-liga-pro','cbpes-report-page-copa-master');
  const profile = ['participant','team','coach','match'].includes(parts[0]) && parts.length > 1;
  const id = profile ? parts[0] : (parts[0]==='table' ? 'table' : (parts[0]==='stats-detail' ? 'stats-detail' : (PAGES.includes(raw) ? raw : 'home')));
  if(id==='stats-detail' && D)renderStatsDetail(decodeURIComponent(parts[1]||'official'),decodeURIComponent(parts[2]||''));
  if(id==='table' && D){if(parts[1]){const requested=decodeURIComponent(parts.slice(1).join('/'));if((D.officialEditions||[]).some(e=>String(e.id)===requested&&publicEditionVisible(e)))selectedWeeklyTable=requested;}renderTable();}
  closeNavCompetitionMenu();
  closeNavStatsMenu();
  document.body.classList.toggle('cbpes-liga-pro-page', id === 'table' && document.getElementById('table')?.dataset.ligaPro === 'true');
  document.body.classList.toggle('cbpes-copa-master-page', id === 'table' && document.getElementById('table')?.dataset.copaMaster === 'true');
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === id || (b.id==='navStatsButton'&&['stats','records','stats-detail','trophies'].includes(id))));
  if(id==='belts'&&D&&window.CBPESBelts)CBPESBelts.renderPublic();
  if (profile && D) {
    const value = decodeURIComponent(parts.slice(1).join('/'));
    if (id === 'participant') renderParticipant(value);
    if (id === 'team') renderTeam(value);
    if (id === 'coach') renderCoach(value);
    if (id === 'match') renderMatchReport(value);
  }
  window.scrollTo(0, 0);
}
function closeNavCompetitionMenu(){
  const m=$('navCompetitionMenu'),b=$('navCompetitionButton'),wrap=$('navCompetitionWrap');
  if(m){m.hidden=true;if(wrap&&m.parentElement!==wrap)wrap.appendChild(m);m.style.removeProperty('top');m.style.removeProperty('left');m.style.removeProperty('right');m.style.removeProperty('width');m.style.removeProperty('max-width');}
  if(b)b.setAttribute('aria-expanded','false');
}
function openNavCompetitionMenu(){
  const m=$('navCompetitionMenu'),b=$('navCompetitionButton');if(!m||!b)return;
  if(window.matchMedia('(max-width:700px)').matches){
    document.body.appendChild(m);
    const rect=b.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24);
    m.style.width=width+'px';m.style.maxWidth=width+'px';
    m.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
    m.style.top=Math.min(rect.bottom+2,window.innerHeight-80)+'px';
    m.style.right='auto';
  }
  m.hidden=false;b.setAttribute('aria-expanded','true');
}
function renderNavCompetitions(){
  const menu=$('navCompetitionMenu');if(!menu||!D)return;
  const competitions=D.officialCompetitions||[];
  const editions=(D.officialEditions||[]).filter(e=>publicEditionVisible(e));
  menu.innerHTML='<a href="#weeklies" class="cbpes-nav-weeklies-option" style="--competition-tint:#15995c">SEMANAIS <small>Edições e resultados</small></a>'+(editions.length?editions.map(e=>{const c=competitions.find(c=>String(c.id)===String(e.competition_id));const name=String(c?.name||e.name||'');const tint=/copa\s*master/i.test(name)?'#d8ad46':/liga\s*pro/i.test(name)?'#2b8ae8':/winning\s*eleven/i.test(name)?'#d83c3c':/liga\s*evo/i.test(name)?'#35b98c':'#7895b2';return '<a class="cbpes-nav-competition-entry" style="--competition-tint:'+tint+'" href="#table/'+encodeURIComponent(e.id)+'">'+esc(c?.name||'Competição')+' <small>'+esc(e.name||'')+'</small></a>';}).join(''):'');
}
const navCompetitionWrap=$('navCompetitionWrap'),navCompetitionButton=$('navCompetitionButton');
if(navCompetitionWrap&&navCompetitionButton){
  const menu=$('navCompetitionMenu');
  navCompetitionButton.onclick=e=>{e.stopPropagation();if(menu.hidden){renderNavCompetitions();openNavCompetitionMenu();}else closeNavCompetitionMenu();};
  navCompetitionWrap.addEventListener('mouseenter',()=>{if(D&&window.matchMedia('(hover:hover) and (min-width:701px)').matches)openNavCompetitionMenu();});
  navCompetitionWrap.addEventListener('mouseleave',()=>{if(window.matchMedia('(hover:hover) and (min-width:701px)').matches)closeNavCompetitionMenu();});
  navCompetitionWrap.addEventListener('focusout',e=>{if(!navCompetitionWrap.contains(e.relatedTarget)&&!menu.contains(e.relatedTarget))closeNavCompetitionMenu();});
  menu.addEventListener('click',e=>{
    const link=e.target.closest('a[href^="#table/"],a[href="#weeklies"]');
    if(!link)return;
    e.preventDefault();
    if(link.getAttribute('href')==='#weeklies'){closeNavCompetitionMenu();if(location.hash==='#weeklies')route();else location.hash='#weeklies';return;}
    const editionId=decodeURIComponent(link.getAttribute('href').slice('#table/'.length));
    selectedWeeklyTable=editionId;
    closeNavCompetitionMenu();
    const targetHash='#table/'+encodeURIComponent(editionId);
    if(location.hash===targetHash){renderTable();route();}
    else location.hash=targetHash;
  });
  document.addEventListener('click',e=>{if(!navCompetitionWrap.contains(e.target)&&!menu.contains(e.target))closeNavCompetitionMenu();});
  window.addEventListener('resize',closeNavCompetitionMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeNavCompetitionMenu();navCompetitionButton.focus();}});
}
function closeNavStatsMenu(){
  const m=$('navStatsMenu'),b=$('navStatsButton'),wrap=$('navStatsWrap');
  if(m){m.hidden=true;if(wrap&&m.parentElement!==wrap)wrap.appendChild(m);['top','left','right','width','max-width'].forEach(x=>m.style.removeProperty(x));}
  if(b)b.setAttribute('aria-expanded','false');
}
function openNavStatsMenu(){
  const m=$('navStatsMenu'),b=$('navStatsButton');if(!m||!b)return;
  if(window.matchMedia('(max-width:700px)').matches){
    document.body.appendChild(m);
    const rect=b.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24);
    m.style.width=width+'px';m.style.maxWidth=width+'px';
    m.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
    m.style.top=Math.min(rect.bottom+2,window.innerHeight-80)+'px';m.style.right='auto';
  }
  m.hidden=false;b.setAttribute('aria-expanded','true');
}
const navStatsWrap=$('navStatsWrap'),navStatsButton=$('navStatsButton');
if(navStatsWrap&&navStatsButton){
  const menu=$('navStatsMenu');
  navStatsButton.onclick=e=>{e.stopPropagation();if(menu.hidden){closeNavCompetitionMenu();openNavStatsMenu();}else closeNavStatsMenu();};
  navStatsWrap.addEventListener('mouseenter',()=>{if(window.matchMedia('(hover:hover) and (min-width:701px)').matches)openNavStatsMenu();});
  navStatsWrap.addEventListener('mouseleave',()=>{if(window.matchMedia('(hover:hover) and (min-width:701px)').matches)closeNavStatsMenu();});
  navStatsWrap.addEventListener('focusout',e=>{if(!navStatsWrap.contains(e.relatedTarget)&&!menu.contains(e.relatedTarget))closeNavStatsMenu();});
  menu.addEventListener('click',e=>{if(e.target.closest('a'))closeNavStatsMenu();});
  document.addEventListener('click',e=>{if(!navStatsWrap.contains(e.target)&&!menu.contains(e.target))closeNavStatsMenu();});
  window.addEventListener('resize',closeNavStatsMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){closeNavStatsMenu();navStatsButton.focus();}});
}
document.querySelectorAll('#nav button:not(#navCompetitionButton):not(#navStatsButton)').forEach(b => b.onclick = () => location.hash = b.dataset.page);
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
const miniTable = (st,zones=[],matches=[]) => `<table class="table cbpes-liga-pro-table cbpes-liga-pro-mini"><thead><tr><th aria-label="Time"></th><th>PTS</th><th>J</th><th>SG</th><th>FORMA</th></tr></thead><tbody>${st.map((x, i) => `<tr style="--zone-color:${zoneAt(zones,i+1)?.color||'transparent'}"><td class="cbpes-zone-position"><div class="cbpes-mini-team-cell"><span class="pos">${i + 1}</span><span class="club">${participantLink(x.p)}<small class="table-coach">${x.p.coach_name ? coachLink(x.p.coach_name) : ''}</small></span></div></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${sgf(x.sg)}</td><td>${formDots(x.p.id,matches)}</td></tr>`).join('')}</tbody></table>${zoneLegend(zones)}`;
const fullTbl = (st,zones=[],matches=[],theme='') => st.length ? `<table class="table ${theme==='liga-pro'?'cbpes-liga-pro-table':''}"><thead><tr><th aria-label="Posição"></th><th aria-label="Time"></th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th><th>FORMA</th></tr></thead><tbody>${st.map((x, i) => `<tr style="--zone-color:${zoneAt(zones,i+1)?.color||'transparent'}"><td class="cbpes-zone-position">${i + 1}</td><td class="club">${participantLink(x.p)}<small class="table-coach">${x.p.coach_name ? coachLink(x.p.coach_name) : ''}</small></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td><td>${formDots(x.p.id,matches)}</td></tr>`).join('')}</tbody></table>${zoneLegend(zones)}` : empty('Sem participantes nesta tabela.');
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
const densePosition=(rows,i,f)=>{const value=x=>String(f(x)).trim();return String(rows.findIndex(x=>value(x)===value(rows[i]))+1);};
const plCard = (title, rows, f, unit) => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b><span class="rank-position">${densePosition(rows,i,f)}</span>${esc(x.name)}</b><small><a href="#team/${x.team.id}">${esc(x.team.name)}</a></small></div><span class="number">${f(x)} ${unit}</span></div>`).join('') : empty('Nenhum registro ainda.')}</div></div>`;
const rankCard = (title, rows, f, unit = '') => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 8).map((x, i) => `<div class="player"><div><b><span class="rank-position">${densePosition(rows,i,f)}</span>${participantLink(x.p)}</b></div><span class="number">${f(x)}${unit}</span></div>`).join('') : empty('Sem dados ainda.')}</div></div>`;

function renderHome() {
  const { participants, rounds } = D, matches=D.matches.filter(publicCompetitionMatch).filter(m=>String(m.official_edition_id||m.round?.official_edition_id||'')!==openingEditionId), played = latestPlayed(matches), nx = nextMatches(matches), S = stats(D, 'nonweekly'), t = typeOf();
  $('hSeason').textContent = (SET.name + ' • TEMPORADA ' + SET.season).toUpperCase();
  const cr = currentRound(rounds, matches);
  $('hRound').textContent = cr ? roundLabel(cr).toUpperCase() : 'SEM RODADAS';

  const sc = m => {
    const edition=(D.officialEditions||[]).find(e=>String(e.id)===String(m.official_edition_id||m.round?.official_edition_id));
    const competition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition?.competition_id));
    const isPro=(m.category||'official')==='official' && /liga\s*pro/i.test([competition?.name,edition?.name].filter(Boolean).join(' '));
    const kind=m.category==='weekly'?'weekly':m.category==='friendly'?'friendly':isPro?'liga-pro':'official';
    const title=m.category==='weekly'?'SEMANAL':m.category==='friendly'?'AMISTOSO':competition?.name||edition?.name||SET.name;
    return `<div class="sc sc-themed sc-${kind}" style="--strip-match-color:${matchColor(m)}"><div class="sc-meta"><a href="#games">${esc(title)} • ${m.date?fd(m.date).slice(0,5):'a definir'}</a></div><div class="sc-row"><span><a href="#team/${m.home_id}">${esc(m.home.name)}</a></span><b>${m.played?m.home_score:''}</b></div><div class="sc-row"><span><a href="#team/${m.away_id}">${esc(m.away.name)}</a></span><b>${m.played?m.away_score:''}</b></div></div>`;
  };

  const m = played.find(x=>x.category==='official') || played[0];
  const featured = !!m?.is_featured;
  const featuredEdition=(D.officialEditions||[]).find(e=>String(e.id)===String(m?.official_edition_id));
  const featuredCompetition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(featuredEdition?.competition_id));
  const featuredIsLigaPro=m?.category==='official' && /liga\s*pro/i.test([featuredEdition?.name,featuredCompetition?.name].filter(Boolean).join(' '));
  const featuredRow = () => matchRow(m);
  const championTag = team => String(m.champion_team_id||'')===String(team?.id) ? '<span class="featured-juventus-champion">CAMPEÃO</span>' : '';
  // O destaque oficial reutiliza o mesmo cartão das partidas da competição.
  // Assim, escudos, técnicos, placar e identidade da Liga Pro permanecem idênticos.
  $('latest').innerHTML = m
    ? (m.category === 'official'
        ? '<div class="cbpes-home-featured-match"><div class="cbpes-featured-label">PARTIDA EM DESTAQUE</div>' + matchRow(m) + '</div>'
        : `<div class="eyebrow" style="margin-bottom:5px">PARTIDA EM DESTAQUE</div>${featuredRow()}`)
    : `<div class="card"><div class="cardbody">${empty('Nenhuma partida realizada ainda.')}</div></div>`;
  // Manter os jogos semanais recentes, mas limitar a quatro partidas
  // por importação simultânea para não esconder o próximo resultado
  // registrado separadamente (oficial ou amistoso).
  const recentBatchCounts=new Map();
  const recentHome=played.filter(m=>{
    const registered=String(m.result_registered_at||m.created_at||'');
    if(m.category!=='weekly'||!registered)return true;
    const key='weekly-batch:'+registered;
    const count=recentBatchCounts.get(key)||0;
    if(count>=4)return false;
    recentBatchCounts.set(key,count+1);
    return true;
  }).slice(0,5);
  // A faixa superior e o painel Últimos Resultados usam exatamente
  // a mesma seleção de cinco partidas, na mesma ordem de registro.
  const sl = recentHome;
  $('strip').innerHTML = sl.length ? sl.map(sc).join('') : '<div class="sc-end" style="padding:14px 16px">Nenhuma partida cadastrada.</div>';  // Próximos jogos: terminar a rodada pendente antes de avançar à seguinte.
  // Não usar a data como prioridade entre rodadas: partidas podem ser registradas fora de ordem.
  const officialPending=nx.filter(m=>m.category==='official');
  const editionOf=m=>String(m.official_edition_id||m.round?.official_edition_id||'');
  const phaseOf=m=>String(m.round?.phase_id||'');
  const roundOf=m=>String(m.round_id||m.round?.id||'');
  const phaseIndex=id=>(D.phases||[]).findIndex(p=>String(p.id)===id);
  const orderedOfficial=officialPending.slice().sort((a,b)=>{
    const ea=editionOf(a),eb=editionOf(b);
    if(ea!==eb)return ea.localeCompare(eb);
    const pa=phaseIndex(phaseOf(a)),pb=phaseIndex(phaseOf(b));
    if(pa!==pb&&pa>=0&&pb>=0)return pa-pb;
    const na=Number(a.round?.number),nb=Number(b.round?.number);
    if(Number.isFinite(na)&&Number.isFinite(nb)&&na!==nb)return na-nb;
    const ra=roundOf(a),rb=roundOf(b);
    if(ra!==rb){
      const ia=(D.rounds||[]).findIndex(r=>String(r.id)===ra);
      const ib=(D.rounds||[]).findIndex(r=>String(r.id)===rb);
      if(ia>=0&&ib>=0&&ia!==ib)return ia-ib;
    }
    return (a.seq||0)-(b.seq||0)||(a.date||'9999').localeCompare(b.date||'9999');
  });
  const nextHome=[...orderedOfficial,...nx.filter(m=>m.category==='friendly'),...nx.filter(m=>m.category==='weekly')].slice(0,5);
  $('recent').innerHTML = recentHome.length ? recentHome.map(m=>matchRow(m,false,false,'arrow',true)).join('') : empty('Nenhum resultado cadastrado.');
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
  const recentLigaProLink=document.querySelector('#leagueRecentCard .cbpes-home-heading-link');
  if(recentLigaProLink)recentLigaProLink.href=proEdition?'#table/'+encodeURIComponent(proEdition.id):'#table';
  $('miniTitle').innerHTML='<a class="cbpes-home-heading-link" href="'+(proEdition?'#table/'+encodeURIComponent(proEdition.id):'#table')+'">'+(proEdition?'LIGA PRO — CLASSIFICAÇÃO':'CLASSIFICAÇÃO')+'</a>';
  $('miniTable').innerHTML=proEdition?(proStanding.length?'<div class="cbpes-home-league-compact">'+miniTable(proStanding.slice(0,6),zonesFor('official',null,(D.phases||[]).find(p=>String(p.official_edition_id)===String(proEdition.id)&&p.counts_in_standings)?.id),proLeagueMatches)+'</div>':empty('Nenhuma equipe vinculada à fase classificatória.')):empty('Liga Pro não cadastrada.');
  // Artilharia exclusiva da Liga PRO, contabilizando apenas gols dos jogos desta edição.
  const proMatchIds=new Set(proMatches.filter(m=>m.played).map(m=>String(m.id)));
  const proScorers=new Map();
  (D.events||[]).filter(e=>proMatchIds.has(String(e.match_id))&&e.scorer_id).forEach(e=>{
    const player=(D.players||[]).find(p=>String(p.id)===String(e.scorer_id));
    if(!player)return;
    const key=String(player.id);
    const entry=proScorers.get(key)||{player,goals:0};
    entry.goals++;proScorers.set(key,entry);
  });
  const topScorers=[...proScorers.values()].sort((a,b)=>b.goals-a.goals||String(a.player.name||'').localeCompare(String(b.player.name||''),'pt-BR')).slice(0,5);
  $('leagueRecent').innerHTML=topScorers.length
    ?'<div class="cbpes-home-scorers">'+topScorers.map((x,i)=>{
      const team=(D.participants||[]).find(p=>String(p.id)===String(x.player.participant_id||x.player.team_id));
      return '<div class="cbpes-home-scorer"><span class="cbpes-home-scorer-rank">'+(i+1)+'</span>'+(team?crestImg(team,'cbpes-stats-player-crest cbpes-home-scorer-crest'):'<span class="cbpes-home-scorer-crest-placeholder" aria-hidden="true"></span>')+'<span class="cbpes-home-scorer-name"><strong>'+esc(x.player.name)+'</strong></span><b>'+x.goals+' '+(x.goals===1?'gol':'gols')+'</b></div>';
    }).join('')+'</div>'
    :empty('Ainda não há gols de jogadores registrados na Liga PRO.');
  const proPlayed=proMatches.filter(m=>m.played);
  const proGoals=proPlayed.reduce((sum,m)=>sum+(Number(m.home_score)||0)+(Number(m.away_score)||0),0);
  $('numbers').innerHTML=`<div class="stats"><div class="stat"><b>${proPlayed.length}</b><span>Partidas</span></div><div class="stat"><b>${proGoals}</b><span>Gols</span></div><div class="stat"><b>${proPlayed.length?(proGoals/proPlayed.length).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:1}):'0'}</b><span>Média de gols</span></div></div>`;

}

function openingConsolidatedRow(m){
  const side=(club,coach)=>'<div class="cbpes-opening-consolidated-side"><a href="#team/'+encodeURIComponent(club.id)+'">'+esc(club.name)+'</a><small><a href="#coach/'+encodeURIComponent(coach||'')+'">'+esc(coach||'—')+'</a></small></div>';
  return '<div class="cbpes-opening-consolidated-game"><div>'+side(m.home,m.home_coach_name)+'</div><strong class="cbpes-opening-consolidated-score">'+esc(m.home_score)+' <span>–</span> '+esc(m.away_score)+'</strong><div>'+side(m.away,m.away_coach_name)+'</div></div>';
}
function renderGames() {
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('selected', b.dataset.f === filter));
  const ms = D.matches.filter(publicCompetitionMatch).filter(m=>String(m.official_edition_id||m.round?.official_edition_id||'')!==openingEditionId).filter(m => ['all','done','next'].includes(filter) ? (filter === 'all' || (filter === 'done' ? m.played : !m.played)) : (m.category || 'official') === filter);
  // Linha do tempo única: partidas oficiais, amistosas e semanais intercaladas
  // pela data/hora de cadastro, sem agrupar resultados por competição ou rodada.
  const visibleGames=ms;
  const chronological = visibleGames.slice().sort((a,b)=>{
    if(Boolean(a.played)!==Boolean(b.played))return a.played?-1:1;
    return matchResultOrder(a,b);
  });
  const timelineHtml = chronological.map(m=>matchRow(m,false,true,'arrow',true)).join('');
  $('gamesList').innerHTML = timelineHtml || empty('Nenhuma partida encontrada.');
}

const openingEditionId='16917e42-3fc8-4aca-8cdc-4c008254dbe1';
async function loadOpeningArchive(){
  const {data,error}=await sb.from('opening_tournament_archive').select('source_key,record_type,payload').eq('edition_id',openingEditionId).order('source_key');
  openingArchiveError=error?.message||'';
  openingArchive=error?[]:(data||[]);
}
const openingTeamAliases={
  'middlebrook':'Bolton Wanderers','east london':'West Ham','man blue':'Manchester City',
  'lancashire':'Blackburn Rovers','west midlands village':'Aston Villa',
  'athenakos fc':'Panathinaikos','fc bosphorus':'Beşiktaş',
  'dynamo kiev':'Dínamo de Kiev','dynamo kyiv':'Dínamo de Kiev',
  'aj auxerre':'Auxerre','r.c. celta':'Celta de Vigo',
  'as saint etienne':'Saint-Etiénne','as saint-étienne':'Saint-Etiénne',
  'stade rennais fc':'Stade Rennais','sc heerenveen':'Heerenveen',
  'c.a. osasuna':'Osasuna','rc lens':'Lens',
  'r.c.d. espanyol':'Espanyol','fc groningen':'Groningen',
  'getafe c.f.':'Getafe'
};
function openingTeamName(name){
  const key=String(name||'').trim().toLocaleLowerCase('pt-BR');
  return openingTeamAliases[key]||String(name||'');
}
function openingTeamView(coach,team){
  const name=openingTeamName(team),norm=x=>String(x||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const club=(D?.participants||[]).find(p=>norm(p.name)===norm(name));
  const img='';
  return '<div class="cbpes-opening-team">'+img+'<div class="cbpes-opening-team-names"><strong>'+esc(name||'—')+'</strong><small>'+esc(coach||'—')+'</small></div></div>';
}

// Contagem única de TODOS os jogos do arquivo, inclusive mata-mata.
function openingFullTotals(){
 const normalize=v=>String(v||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const standings=openingArchive.filter(x=>x.record_type==='standing').map(x=>x.payload);
 const map=new Map(standings.map(x=>[normalize(x.coach),{...x,team:openingTeamName(x.team),j:0,v:0,e:0,d:0,gp:0,gc:0,points:0}]));
 openingArchive.filter(x=>x.record_type==='match').forEach(x=>{
  const m=x.payload||{},hs=Number(m.home_score),as=Number(m.away_score);
  if(!Number.isFinite(hs)||!Number.isFinite(as))return;
  [[m.home_coach,hs,as],[m.away_coach,as,hs]].forEach(([coach,gf,ga])=>{
   const row=map.get(normalize(coach));if(!row)return;
   row.j++;row.gp+=gf;row.gc+=ga;if(gf>ga)row.v++;else if(gf===ga)row.e++;else row.d++;
  });
 });
 return [...map.values()].map(x=>({...x,sg:x.gp-x.gc,points:x.v*3+x.e})).sort((x,y)=>y.points-x.points||y.sg-x.sg||y.gp-x.gp);
}

function renderOpeningArchive(){
  const root=$('fullTable');if(!root)return;
  $('tblTitle').textContent='TORNEIO DE ABERTURA 2026';
  $('tblPill').hidden=true;
  if(openingArchiveError){root.innerHTML='<div class="notice">Não foi possível consultar o arquivo histórico: '+esc(openingArchiveError)+'</div>';return;}
  if(!openingArchive.length){root.innerHTML=empty('Histórico do Torneio de Abertura ainda não disponível.');return;}
  const entries=openingArchive.filter(x=>x.record_type==='match').map(x=>({...x.payload,key:x.source_key}));
  const standing=openingArchive.filter(x=>x.record_type==='standing').map(x=>x.payload).sort((a,b)=>Number(a.position)-Number(b.position));
  const fullTotals=openingFullTotals();
  const stages=[['classification','FASE CLASSIFICATÓRIA'],['round_of_16','OITAVAS DE FINAL'],['quarterfinal','QUARTAS DE FINAL'],['semifinal','SEMIFINAIS'],['final','FINAL']];
  if(!stages.some(x=>x[0]===openingArchiveTab))openingArchiveTab='classification';
  const phaseIndex=stages.findIndex(x=>x[0]===openingArchiveTab);
  const phaseNav='<div class="phase-switcher cbpes-opening-phase-nav"><button class="phase-arrow" data-opening-phase="-1" aria-label="Fase anterior" '+(phaseIndex===0?'disabled':'')+'><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><b>'+stages[phaseIndex][1]+'</b><button class="phase-arrow" data-opening-phase="1" aria-label="Próxima fase" '+(phaseIndex===stages.length-1?'disabled':'')+'><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button></div>';
  // As rodadas do Optijuegos registram apenas o técnico; a classificação histórica vincula técnico e clube.
  const coachKey=value=>String(value||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  const clubByCoach=new Map(standing.filter(x=>x.coach&&x.team).map(x=>[coachKey(x.coach),x.team]));
  const participant=(coach,team)=>openingTeamView(coach,team||clubByCoach.get(coachKey(coach))||'');
  const score=x=>'<strong>'+esc(String(x.home_score??'–'))+' <span>–</span> '+esc(String(x.away_score??'–'))+'</strong>';
  const game=x=>'<div class="cbpes-opening-game cbpes-opening-fixture"><div>'+participant(x.home_coach,x.home_team)+'</div><div class="cbpes-opening-score">'+score(x)+'</div><div>'+participant(x.away_coach,x.away_team)+'</div></div>';
  const podium='<div class="cbpes-opening-podium"><div class="cbpes-opening-champion"><span class="cbpes-opening-medal">🏆 CAMPEÃO</span><strong>Tirol</strong><small>Auxerre</small></div><div class="cbpes-opening-runnerup"><span class="cbpes-opening-medal">🥈 VICE-CAMPEÃO</span><strong>William Hard</strong><small>Olympiacos Piraeus</small></div></div>';
  let content='';
  if(openingArchiveTab==='classification'){
    const fullTable='<div class="scroll"><table class="cbpes-opening-table"><thead><tr><th>CLUBE / TÉCNICO</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead><tbody>'+fullTotals.map(x=>'<tr><td>'+participant(x.coach,x.team)+'</td>'+[x.j,x.v,x.e,x.d,x.gp,x.gc,x.sg].map(v=>'<td>'+esc(String(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    const table='<div class="scroll"><table class="cbpes-opening-table"><thead><tr><th>#</th><th>CLUBE / TÉCNICO</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead><tbody>'+standing.map(x=>'<tr class="'+(Number(x.position)>=1&&Number(x.position)<=16?'cbpes-opening-qualified':'')+'"><td>'+esc(String(x.position))+'</td><td>'+participant(x.coach,x.team)+'</td>'+[x.points,x.played,x.wins,x.draws,x.losses,x.goals_for,x.goals_against,x.goal_difference].map(v=>'<td>'+esc(String(v??'—'))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    const rounds=entries.filter(x=>Number(x.round)>=1&&Number(x.round)<=6);
    const selector='<div class="cbpes-opening-round-nav"><button class="phase-arrow" type="button" data-opening-round="-1" '+(openingArchiveRound<=1?'disabled':'')+' aria-label="Rodada anterior">‹</button><b>RODADA '+openingArchiveRound+'</b><button class="phase-arrow" type="button" data-opening-round="1" '+(openingArchiveRound>=6?'disabled':'')+' aria-label="Próxima rodada">›</button></div>';
    const fixtures='<div class="cbpes-opening-fixtures">'+selector+'<div class="cbpes-opening-games">'+rounds.filter(x=>Number(x.round)===openingArchiveRound).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)).map(game).join('')+'</div></div>';
    content='<div class="cbpes-opening-two-column"><div class="cbpes-opening-standings"><h3>CLASSIFICAÇÃO — PRIMEIRA FASE</h3>'+table+'<p class="admin-help">Classificação histórica após seis rodadas.</p><h3>ESTATÍSTICAS — CAMPEONATO COMPLETO (120 JOGOS)</h3>'+fullTable+'<p class="admin-help">Inclui todas as fases. GP e GC são somados diretamente dos placares de cada partida.</p></div><aside class="cbpes-opening-fixtures-column"><h3>JOGOS E RESULTADOS</h3>'+fixtures+'</aside></div>';
  }else{
    const phase=openingArchiveTab;
    const games=entries.filter(x=>x.phase===phase);
    const ties=[...new Set(games.map(x=>Number(x.tie)||1))].sort((a,b)=>a-b);
    const tieHtml=tie=>{
      const matches=games.filter(x=>(Number(x.tie)||1)===tie).sort((a,b)=>(Number(a.leg||a.game)||1)-(Number(b.leg||b.game)||1));
      const first=matches[0];if(!first)return '';
      const penalty=matches.find(x=>x.penalty_shootout)?.penalty_shootout;
      const note=penalty?'<small class="cbpes-opening-penalty-note">Decisão por pênaltis</small>':'';
      return '<article class="cbpes-opening-tie"><h4 class="cbpes-opening-tie-heading">'+stages[phaseIndex][1]+(phase==='final'?'':' • CHAVE '+tie)+'</h4><div class="cbpes-opening-legs">'+matches.map((m,i)=>'<div class="cbpes-opening-leg"><small>'+(matches.length===1?'PARTIDA ÚNICA':i===0?'IDA':i===1?'VOLTA':'TERCEIRO JOGO')+'</small>'+game(m)+'</div>').join('')+'</div>'+note+'</article>';
    };
    content='<div class="cbpes-opening-knockout"><div class="cbpes-opening-stage-heading"><h3>'+stages[phaseIndex][1]+'</h3><small>'+games.length+' PARTIDAS</small></div><div class="cbpes-opening-ties">'+ties.map(tieHtml).join('')+'</div></div>';
  }
  root.innerHTML='<div class="cbpes-opening-history">'+podium+phaseNav+'<div class="cbpes-competition-neutral">'+content+'</div></div>';
  root.onclick=e=>{
    const phase=e.target.closest('[data-opening-phase]'),round=e.target.closest('[data-opening-round]');
    if(phase){const next=Math.max(0,Math.min(stages.length-1,phaseIndex+Number(phase.dataset.openingPhase)));openingArchiveTab=stages[next][0];renderOpeningArchive();}
    else if(round){openingArchiveRound=Math.max(1,Math.min(6,openingArchiveRound+Number(round.dataset.openingRound)));renderOpeningArchive();}
  };
}

function renderTable() {
  const simulatorButton=(kind,id)=>'<button type="button" class="cbpes-sim-launch" data-simulator-kind="'+kind+'" data-simulator-id="'+esc(id)+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M18.4 5.6l-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg><span>SIMULADOR</span></button>';

  const competitions=D.officialCompetitions||[];
  const editions=(D.officialEditions||[]).filter(e=>publicEditionVisible(e));
  const valid=editions.some(e=>String(e.id)===String(selectedWeeklyTable));
  if(!valid)selectedWeeklyTable=editions[0]?.id||'current';
  const selectedEdition=editions.find(e=>String(e.id)===String(selectedWeeklyTable));
  const selectedCompetition=competitions.find(c=>String(c.id)===String(selectedEdition?.competition_id));
  const selectedWeekly=(D.weeklies||[]).find(w=>String(w.id)===String(selectedWeeklyTable));
  const isLigaProTable=/liga\s*pro/i.test([selectedEdition?.name,selectedCompetition?.name].filter(Boolean).join(' '));
  const headingName=selectedCompetition?.name||selectedEdition?.name||selectedWeekly?.name||'Tabela do campeonato';
  const heading=$('tableCompetitionName'), emblem=$('tableCompetitionEmblem');
  if(heading){
    if(/copa\s*master/i.test(headingName)){
      heading.innerHTML='<span class="cbpes-master-title-copa">COPA</span> <span class="cbpes-master-title-master">MASTER</span>';
    }else if(/supercopa\s*winning\s*eleven/i.test(headingName)){
      heading.innerHTML='<span class="cbpes-winning-title-supercopa">SUPERCOPA</span> <span class="cbpes-winning-title-red">WINNING ELEVEN</span>';
    }else heading.textContent=headingName;
  }
  if(emblem){
    const logo=selectedCompetition?.logo_url||selectedCompetition?.logo||selectedEdition?.logo_url||selectedEdition?.logo;
    emblem.textContent='';
    if(typeof logo==='string' && /^https:\/\//i.test(logo)){
      const img=document.createElement('img');img.src=logo;img.alt='';img.loading='lazy';
      img.onerror=()=>{emblem.textContent=headingName.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();};
      emblem.appendChild(img);
    }else emblem.textContent=headingName.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  }

  document.getElementById('table').dataset.openingTournament=String(/torneio\s*de\s*abertura/i.test(headingName));
  document.getElementById('table').dataset.winningEleven=String(/supercopa\s*winning\s*eleven/i.test(headingName));
  document.getElementById('table').dataset.ligaPro=String(isLigaProTable);
  document.body.classList.toggle('cbpes-liga-pro-page', location.hash.slice(1).split('/')[0]==='table' && isLigaProTable);
  const isMaster=/copa\s*master/i.test([selectedEdition?.name,selectedCompetition?.name,selectedWeekly?.name].filter(Boolean).join(' '));
  document.getElementById('table').dataset.copaMaster=String(isMaster);
  document.body.classList.toggle('cbpes-copa-master-page', location.hash.slice(1).split('/')[0]==='table' && isMaster);
  if(/torneio\s*de\s*abertura/i.test(String(selectedCompetition?.name||''))){renderOpeningArchive();return;}
  if ((D.weeklies||[]).some(w=>w.id===selectedWeeklyTable)) {
    const w=D.weeklies.find(x=>x.id===selectedWeeklyTable), allMs=D.matches.filter(m=>m.category==='weekly'&&m.weekly_id===selectedWeeklyTable), phases=(D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===selectedWeeklyTable).sort((a,b)=>a.sort_order-b.sort_order), ms=allMs.filter(m=>{const r=(D.weeklyRounds||[]).find(x=>x.id===m.weekly_round_id);return r?.phase?.counts_in_standings || (!r?.phase_id && (!phases.length || phases[0].phase_type==='groups'));}), ids=new Set(allMs.flatMap(m=>[m.home_id,m.away_id]));
    const roster=(D.weeklyParticipants||[]).filter(x=>x.weekly_id===selectedWeeklyTable).map(x=>x.participant_id);const st=standings(D.participants.filter(p=>ids.has(p.id)||roster.includes(p.id)),ms,{ptsW:3,ptsD:1});
    $('tblTitle').textContent=w?.name||'CAMPEONATO SEMANAL'; $('tblPill').textContent=''; $('tblPill').hidden=true; 
    const champion=w?.champion_id?D.participants.find(p=>p.id===w.champion_id):null;
    const info=`<div class="notice"><b>Formato:</b> ${esc(w?.format_description||'Não informado')}<br><b>Participantes:</b> ${w?.participant_count||roster.length||ids.size}${champion?`<br><b>Campeão:</b> <a href="#team/${champion.id}">${esc(champion.name)}</a>${w.champion_coach_name?' • '+coachLink(w.champion_coach_name):''}`:'<br><b>Campeão:</b> ainda não definido'}</div>`;
    const rounds=[...new Map(allMs.filter(m=>m.weeklyRound).map(m=>[m.weeklyRound.id,m.weeklyRound])).values()].sort((a,b)=>a.number-b.number);const results=rounds.map(r=>heading(`${esc(roundLabel(r).toUpperCase())}${r.date?' • '+fd(r.date):''}`)+allMs.filter(m=>m.weekly_round_id===r.id).sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(matchRow).join('')).join('')+(allMs.some(m=>!m.weekly_round_id)?heading('PARTIDAS SEM RODADA')+allMs.filter(m=>!m.weekly_round_id).map(matchRow).join(''):'');
    $('fullTable').innerHTML=info+`<div class="admin-help">A classificação considera somente as fases classificatórias. Partidas de mata-mata são exibidas separadamente e não somam pontos.</div>`+(st.length?`<div class="eyebrow" style="margin:12px 0 4px">RESUMO ESTATÍSTICO DA EDIÇÃO (RESUMO: 3 PTS POR VITÓRIA, 1 POR EMPATE)</div>${fullTbl(st,zonesFor('weekly',selectedWeeklyTable,phases.find(p=>p.counts_in_standings)?.id),allMs.filter(m=>m.round?.phase?.counts_in_standings))}`:empty('Ainda não há partidas nesta edição.'))+heading('PARTIDAS DA EDIÇÃO')+(results||empty('Nenhuma partida cadastrada.'));
    $('fullTable').insertAdjacentHTML('afterbegin',simulatorButton('weekly',selectedWeeklyTable));
    return;
  }
  const edition=editions.find(e=>String(e.id)===String(selectedWeeklyTable));
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
    const isMasterKnockout=/copa\s*master/i.test([edition.name,competitions.find(c=>String(c.id)===String(edition.competition_id))?.name||''].join(' '))&&!active.counts_in_standings;
    const masterKnockoutHtml=isMasterKnockout&&window.CBPESSimulator?.masterKnockout?.(edition,active);
    const placeholderHtml=masterKnockoutHtml||(isMasterKnockout&&window.CBPESSimulator?.isActive?.()?'<div class="cbpes-master-ko-pending">Preparando projeção do mata-mata…</div>':null)||(['playoff','knockout','final'].includes(active.phase_type)&&!phaseMatches.length&&configuredSlots.length?
      '<div class="cbpes-playoff-template">'+configuredSlots.map((pair,i)=>`<div class="cbpes-match ${isLigaProTable?'cbpes-match-liga-pro':''}" style="--match-color:#bfcbd3">
        ${active.phase_type==='final'?'':`<div class="cbpes-match-top"><span class="cbpes-match-category">${esc(active.name).toUpperCase()} • CHAVE ${i+1}</span></div>`}
        <div class="cbpes-match-main">
          <div class="cbpes-match-team home"><div class="cbpes-match-club"><div class="cbpes-match-club-text"><span class="cbpes-team-name">${esc(String(pair[0]||'A definir'))}</span></div></div></div>
          <div class="cbpes-match-score">– : –</div>
          <div class="cbpes-match-team away"><div class="cbpes-match-club"><div class="cbpes-match-club-text"><span class="cbpes-team-name">${esc(String(pair[1]||'A definir'))}</span></div></div></div>
        </div>
      </div>`).join('')+'</div>':'');
    const roundGames=placeholderHtml||(active.counts_in_standings?currentGames.map(m=>matchRow(m,true,false,'details')).join(''):window.CBPESSimulator?.isActive()?currentGames.map(m=>matchRow(m,true,false,'details')).join(''):active.phase_type==='final'?currentGames.map(m=>matchRow(m,true,false,'details')).join(''):tieRows(tiesOf(currentGames)));
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
  } else if (t === 'liga') { const ms = officialMatches.filter(m=>!m.round?.phase_id); const rs=officialRounds.filter(r=>!r.phase_id).sort((a,b)=>a.number-b.number);const key='league';selectedOfficialRoundByPhase[key]=defaultRound(rs,ms,selectedOfficialRoundByPhase[key]);const rr=rs.find(r=>r.id===selectedOfficialRoundByPhase[key]);html='<div class="cbpes-competition-neutral">'+twoColumn(fullTbl(standings(D.participants.filter(p => p.participates_in_competition !== false), ms),[],ms),roundPicker(rs,selectedOfficialRoundByPhase[key],key,'official-round')+ms.filter(m=>m.round_id===rr?.id).map(m=>matchRow(m,true,false,'details')).join(''))+'</div>'; pill = ms.filter(m => m.played).length + ' PARTIDAS DISPUTADAS'; }
  else {
    const rs=officialRounds.slice().sort((a,b)=>a.number-b.number);
    const ms=officialMatches.slice().sort(byDisplayOrder);
    html=ms.length?heading('PARTIDAS DA COMPETIÇÃO')+rs.map(r=>heading(esc(roundLabel(r).toUpperCase()))+ms.filter(m=>String(m.round_id)===String(r.id)).map(m=>matchRow(m,true,false,'details')).join('')).join('')+ms.filter(m=>!m.round_id).map(m=>matchRow(m,true,false,'details')).join(''):empty('Nenhuma partida vinculada a esta edição.');
    pill=ms.filter(m=>m.played).length+' PARTIDAS DISPUTADAS';
  }
  const isCopaMaster=/copa\s*master/i.test([edition.name,(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition.competition_id))?.name||''].join(' '));
  // Copa Master usa os grupos e resultados reais do gerenciador, nunca uma prévia estática.
  const masterGroupPhase=(D.phases||[]).find(p=>String(p.official_edition_id)===String(edition.id)&&p.counts_in_standings);
  const masterGroupZones=masterGroupPhase?zonesFor('official',null,masterGroupPhase.id):[];
  const masterGroupRounds=officialRounds.filter(r=>String(r.phase_id)===String(masterGroupPhase?.id)).sort((a,b)=>(Number(a.number)||0)-(Number(b.number)||0));
  const masterGroupMatchesRaw=officialMatches.filter(m=>masterGroupRounds.some(r=>String(r.id)===String(m.round_id)));
  const masterGroupMatches=isCopaMaster?(window.CBPESSimulator?.masterProjectedMatches?.(edition,masterGroupMatchesRaw)||masterGroupMatchesRaw):masterGroupMatchesRaw;
  const masterConfig=edition.group_config||{};
  const masterGroupCount=Math.max(1,Math.min(16,Number(masterConfig.groups)||4));
  const masterSlots=Math.max(1,Math.min(24,Number(masterConfig.teams_per_group)||3));
  // Calendário virtual determinístico: rodízio de posições, sem gravar jogos fictícios.
  const masterLegs=Math.max(1,Math.min(4,Number(masterConfig.legs)||1));
  const masterRoundRobin=(count)=>{
    const ids=Array.from({length:count},(_,i)=>i+1);
    if(ids.length%2)ids.push(null);
    const rounds=[];
    for(let r=0;r<ids.length-1;r++){
      const pairs=[];
      for(let j=0;j<ids.length/2;j++){
        const a=ids[j],b=ids[ids.length-1-j];
        if(a!==null&&b!==null)pairs.push(r%2?[b,a]:[a,b]);
      }
      rounds.push(pairs);
      ids.splice(1,0,ids.pop());
    }
    return rounds;
  };
  const masterBaseRounds=masterRoundRobin(masterSlots);
  const masterCalendar=Array.from({length:masterLegs},(_,leg)=>masterBaseRounds.map(round=>round.map(([a,b])=>leg%2?[b,a]:[a,b]))).flat();
  const masterAssignments=(D.officialGroupTeams||[]).filter(a=>String(a.official_edition_id)===String(edition.id));
  const masterGroupNames=Array.from({length:masterGroupCount},(_,i)=>String.fromCharCode(65+i));
  // Jogos virtuais só existem enquanto o simulador da Copa Master está ligado.
  // Nunca entram no banco nem nos resultados oficiais.
  const masterSimGames=isCopaMaster&&!masterGroupMatches.length&&window.CBPESSimulator?.virtualMasterGames?.(edition,masterAssignments,masterCalendar,masterGroupRounds,masterGroupNames,masterGroupMatches)||[];
  const masterStandingsMatches=masterGroupMatches.concat(masterSimGames).map(m=>{
    // A pontuação da simulação depende dos placares preenchidos, nunca da flag de banco.
    // Jogos reais sem resultado e jogos virtuais com gols simulados são tratados igualmente.
    const hasScore=m.home_score!==null&&m.home_score!==undefined&&m.away_score!==null&&m.away_score!==undefined&&Number.isFinite(Number(m.home_score))&&Number.isFinite(Number(m.away_score));
    return {...m,played:hasScore};
  });

  // A Copa Master possui confrontos ENTRE GRUPOS. Cada partida pontua para os dois
  // clubes, cada qual na tabela do seu próprio grupo. Não filtrar por group_name.
  const masterAllTeamIds=new Set(masterAssignments.map(a=>String(a.participant_id)));
  const masterAllTeams=D.participants.filter(team=>masterAllTeamIds.has(String(team.id)));
  const masterGlobalRanking=standings(masterAllTeams,masterStandingsMatches);
  const masterGroupsHtml='<section class="cbpes-master-groups-preview"><div class="cbpes-master-groups-grid">'+masterGroupNames.map(g=>{
    const groupAssignments=masterAssignments.filter(a=>String(a.group_name).trim().toUpperCase().replace(/^GRUPO\s+/,'')===g).sort((a,b)=>(a.slot||0)-(b.slot||0));
    const teamIds=new Set(groupAssignments.map(a=>String(a.participant_id)));
    // Inclui resultados contra adversários de outros grupos; classificação filtrada
    // somente DEPOIS do cálculo global de pontos, gols e saldo.
    const gm=masterStandingsMatches.filter(m=>teamIds.has(String(m.home_id))||teamIds.has(String(m.away_id)));
    const ranking=masterGlobalRanking.filter(x=>teamIds.has(String(x.p.id)));
    const registered=groupAssignments.map(a=>D.participants.find(t=>String(t.id)===String(a.participant_id))).filter(Boolean);
    const completedRanking=ranking.concat(registered.filter(t=>!ranking.some(x=>String(x.p.id)===String(t.id))).map(t=>({p:t,pts:0,j:0,v:0,e:0,d:0,gp:0,gc:0,sg:0,ap:0})));
    const slots=Array.from({length:Math.max(masterSlots,completedRanking.length)},(_,i)=>completedRanking[i]||null);
    return '<div class="card cbpes-master-group"><div class="cardhead cbpes-master-group-header"><span class="cbpes-master-group-heading"><span class="cbpes-master-group-label">GRUPO <b>'+g+'</b></span></span></div><div class="cbpes-master-group-scroll"><table class="table cbpes-master-group-table"><thead><tr><th class="cbpes-master-position"></th><th class="cbpes-master-club"></th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th><th>FORMA</th></tr></thead><tbody>'+
      slots.map((x,i)=>{
        const n=i+1,qualified=!!zoneAt(masterGroupZones,n);
        const team=x?.p;
        const cells=x?[x.pts,x.j,x.v,x.e,x.d,x.gp,x.gc,sgf(x.sg),x.ap]:Array(9).fill(0);
        return '<tr '+(team?'data-master-team-id="'+esc(team.id)+'" ':'')+'class="'+(qualified?'cbpes-master-qualified':'cbpes-master-not-qualified')+'"><td class="cbpes-master-position'+(qualified?' cbpes-zone-position':'')+'"><span class="cbpes-master-group-rank">'+n+'</span></td><td class="cbpes-master-club">'+(team?participantLink(team)+'<small>'+ (team.coach_name?coachLink(team.coach_name):'')+'</small>':'<strong>Equipe a definir</strong>')+'</td>'+cells.map(v=>'<td>'+v+'</td>').join('')+'<td class="cbpes-master-form">'+(team?formDots(team.id,gm):'<span class="cbpes-master-form-dots">'+Array(5).fill('<i></i>').join('')+'</span>')+'</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  }).join('')+'</div>'+zoneLegend(masterGroupZones)+'</section>';
  if(isCopaMaster && masterGroupPhase && String(selectedOfficialPhase)===String(masterGroupPhase.id)){
    // Mantém a navegação de fases e partidas; substitui somente a tabela da fase de grupos.
    const virtualRoundKey='master-template-'+edition.id;
    const totalMasterRounds=Math.max(masterCalendar.length,masterGroupRounds.length,1);
    const virtualRound=Math.max(0,Math.min(totalMasterRounds-1,Number(selectedOfficialRoundByPhase[virtualRoundKey])||0));
    const masterSelectedRound=masterGroupRounds[virtualRound]||null;
    const masterRoundNav='<div class="round-switcher cbpes-master-round-switcher"><button class="phase-arrow" data-master-round-prev="1" '+(virtualRound===0?'disabled':'')+' aria-label="Rodada anterior">‹</button><b>RODADA '+String(virtualRound+1).padStart(2,'0')+'</b><button class="phase-arrow" data-master-round-next="1" '+(virtualRound>=totalMasterRounds-1?'disabled':'')+' aria-label="Próxima rodada">›</button></div>';
    // Calendário da Copa Master: seis confrontos por rodada, sem divisão por grupos.
    // Usa exclusivamente partidas reais cadastradas no Supabase.
    const roundGames=masterStandingsMatches
      .filter(m=>m.virtualRoundIndex===virtualRound||(m.virtualRoundIndex===undefined&&String(m.round_id)===String(masterSelectedRound?.id)))
      .sort(byDisplayOrder);
    const masterFixtures='<div class="cbpes-master-rounds">'+masterRoundNav+
      '<div class="cbpes-master-round-groups cbpes-master-round-list">'+
      (roundGames.length?roundGames.map(m=>matchRow(m,true,false,'details')).join(''):
       '<div class="cbpes-master-fixture-placeholder">Aguardando confrontos</div>')+
      '</div></div>';
    const masterNav=html.match(/^<div class="phase-switcher"[\s\S]*?<\/div>/)?.[0]||'';
    html=masterNav+'<div class="cbpes-competition-neutral cbpes-master-two-column"><div class="cbpes-master-standings-column">'+masterGroupsHtml+'</div><aside class="cbpes-master-fixtures-column">'+masterFixtures+'</aside></div>';
  }
  // A classificação por grupos deve permanecer visível em qualquer fase da Copa Master.
  // Não substituir as equipes por placeholders quando o visitante navega às quartas.
  if(isCopaMaster && masterAssignments.length && !(masterGroupPhase && String(selectedOfficialPhase)===String(masterGroupPhase.id))){
    html='<div class="cbpes-master-always-groups">'+masterGroupsHtml+'</div>'+html;
  }
  const drawNotice='';
  $('tblTitle').textContent = 'COMPETIÇÕES CBPES'; $('tblPill').textContent = ''; $('tblPill').hidden = true; $('fullTable').innerHTML = drawNotice+html;
  // Copa Master: classificação por grupo à esquerda; confrontos de toda a rodada
  // em lista única à direita, sem divisões ou cabeçalhos por grupo.
  if(isCopaMaster && masterGroupPhase && String(selectedOfficialPhase)===String(masterGroupPhase.id)){
    const root=$('fullTable').querySelector('.cbpes-master-two-column');
    if(root){
      const standings=root.querySelector('.cbpes-master-groups-preview');
      const fixtures=root.querySelector('.cbpes-master-rounds');
      const roundGroups=fixtures?.querySelector('.cbpes-master-round-groups');
      if(roundGroups){
        // Os jogos já são renderizados diretamente em roundGroups.
        // Não substituir os filhos: isso apagava os 6 confrontos de cada rodada.
        roundGroups.classList.add('cbpes-master-round-list');
      }
      root.classList.add('cbpes-master-round-layout');
      // A tabela mantém os grupos A–D; apenas os confrontos são agrupados por rodada.
      if(standings&&fixtures){
        root.replaceChildren(
          Object.assign(document.createElement('div'),{className:'cbpes-master-standings-column'}),
          Object.assign(document.createElement('aside'),{className:'cbpes-master-fixtures-column'})
        );
        root.children[0].append(standings);
        root.children[1].append(fixtures);
      }
    }
  }

  if(edition && $('fullTable') && !/supercopa|torneio\s*de\s*abertura/i.test([edition.name,selectedCompetition?.name].join(' '))) $('fullTable').insertAdjacentHTML('afterbegin',simulatorButton('official',edition.id));
  $('fullTable').onclick=e=>{const phaseButton=e.target.closest('#phasePrev,#phaseNext');if(phaseButton){const i=phases.findIndex(p=>String(p.id)===String(selectedOfficialPhase));const nextIndex=Math.max(0,Math.min(phases.length-1,i+(phaseButton.id==='phaseNext'?1:-1)));if(phases[nextIndex]&&nextIndex!==i){selectedOfficialPhase=phases[nextIndex].id;if(window.CBPESSimulator?.isActive?.())window.CBPESSimulator.refresh();else renderTable();}return;}const masterButton=e.target.closest('[data-master-round-prev],[data-master-round-next]');if(masterButton){const key='master-template-'+edition.id;const current=Number(selectedOfficialRoundByPhase[key])||0;selectedOfficialRoundByPhase[key]=Math.max(0,Math.min(Math.max(masterCalendar.length,masterGroupRounds.length,1)-1,current+(masterButton.hasAttribute('data-master-round-next')?1:-1)));if(window.CBPESSimulator?.isActive?.())window.CBPESSimulator.refresh();else renderTable();return;}const b=e.target.closest('[data-official-round-prev],[data-official-round-next]');if(!b)return;const key=b.dataset.officialRoundPrev||b.dataset.officialRoundNext;const rs=officialRounds.filter(r=>key==='league'?!r.phase_id:String(r.phase_id)===String(key)).sort((a,c)=>a.number-c.number);selectedOfficialRoundByPhase[key]=changeRound(rs,selectedOfficialRoundByPhase[key],b.dataset.officialRoundNext?1:-1);if(window.CBPESSimulator?.isActive?.())window.CBPESSimulator.refresh();else renderTable();};
  // As setas de fase são tratadas por delegação no contêiner, inclusive após recriar os cards.
}
function renderWeeklies() {
  const root = $('weeklyList');
  const editions = [...(D.weeklies || [])].sort((a,b)=>String(b.event_date||'').localeCompare(String(a.event_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  if (!editions.length) { root.innerHTML = `<div class="card"><div class="cardbody">${empty('Nenhuma edição semanal cadastrada ainda.')}</div></div>`; return; }
  if(!editions.some(w=>String(w.id)===String(selectedWeeklyEditionId)))selectedWeeklyEditionId=editions[0].id;
  const editionSelector = `<div class="cbpes-weekly-edition-picker"><label for="weeklyEditionSelect">SELECIONE A DATA DO SEMANAL</label><select id="weeklyEditionSelect" aria-label="Selecionar edição semanal por data">${editions.map(w=>`<option value="${esc(w.id)}" ${String(w.id)===String(selectedWeeklyEditionId)?'selected':''}>${esc(fd(w.event_date))} — ${esc(w.name)}</option>`).join('')}</select></div>`;
  root.innerHTML = editionSelector + editions.filter(w=>String(w.id)===String(selectedWeeklyEditionId)).map(w => {
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
    let rows=selectedGames.sort(byDisplayOrder).map(m=>{const gameRound=(D.weeklyRounds||[]).find(r=>r.id===m.weekly_round_id);const third=active.phase_type==='final'&&phases.some(ph=>ph.id===gameRound?.phase_id&&ph.phase_type==='third_place');return third?'<div class="cbpes-weekly-third-place"><div class="cbpes-weekly-third-label">DISPUTA DE 3º LUGAR</div>'+matchRow(m,true)+'</div>':matchRow(m,true);}).join('');
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
    return `<div class="card" style="margin-bottom:16px"><div class="cardhead"><div><h2>${esc(w.name)}</h2><small class="admin-help">${fd(w.event_date)} • ${w.participant_count||teams.length} PARTICIPANTES</small></div><span class="pill">${all.filter(m=>m.played).length} JOGOS • ${phaseList.length} FASES</span></div><div class="cardbody">${w.format_description?`<p class="sub">${esc(w.format_description)}</p>`:''}${nav}${championBanner(winner,finalMatch?(winner?.id===finalMatch.home_id?finalMatch.home_coach_name:finalMatch.away_coach_name):null)}<div class="cbpes-competition-neutral">${twoColumn(active.counts_in_standings?(table.length?`<h3>CLASSIFICAÇÃO — ${esc(active.name.toUpperCase())}</h3><div class="scroll">${fullTbl(table,zonesFor('weekly',w.id,active.id),ms)}</div>`:empty('Aguardando partidas desta fase.')):'',roundPicker(rounds,selectedRoundByEdition[roundKey],roundKey,'weekly-round')+(rows||empty('Nenhuma partida cadastrada nesta rodada.')))}</div>${podium}</div></div>`;
  }).join('');
  root.onchange=e=>{if(e.target.id==='weeklyEditionSelect'){selectedWeeklyEditionId=e.target.value;renderWeeklies();}};
  root.onclick=e=>{const b=e.target.closest('[data-phase-prev],[data-phase-next],[data-weekly-round-prev],[data-weekly-round-next]');if(!b)return;if(b.hasAttribute('data-weekly-round-prev')||b.hasAttribute('data-weekly-round-next')){const key=b.dataset.weeklyRoundPrev||b.dataset.weeklyRoundNext;const [edition,phase]=key.split('|');const rs=(D.weeklyRounds||[]).filter(r=>String(r.weekly_id)===edition&&(String(r.phase_id)===phase||(!r.phase_id&&phase==='legacy-groups'))).sort((a,c)=>a.number-c.number);selectedRoundByEdition[key]=changeRound(rs,selectedRoundByEdition[key],b.hasAttribute('data-weekly-round-next')?1:-1);renderWeeklies();return;}const id=b.dataset.phasePrev||b.dataset.phaseNext,w=D.weeklies.find(x=>x.id===id);if(!w)return;const allPhases=(D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===id).sort((a,b)=>a.sort_order-b.sort_order);const ps=allPhases.filter(p=>p.phase_type!=='third_place'||!allPhases.some(x=>x.phase_type==='final'));if(!ps.length)return;let i=ps.findIndex(p=>p.id===selectedPhaseByEdition[id]);i+=b.dataset.phasePrev?-1:1;i=Math.max(0,Math.min(ps.length-1,i));selectedPhaseByEdition[id]=ps[i].id;renderWeeklies();};
}

const statCategoryLabels={official:'COMPETIÇÕES OFICIAIS',weekly:'SEMANAIS',friendly:'AMISTOSOS — TÉCNICOS'};
const statDefinitions=S=>[
  {key:'scorers',title:'ARTILHARIA',rows:S.artilheiros,value:x=>x.g,unit:'gols',players:true},
  {key:'attack',title:'MELHOR ATAQUE (GOLS/JOGO)',rows:S.ataque.slice().sort((a,b)=>b.gp/b.j-a.gp/a.j),value:x=>fmt1(x.gp/x.j)},
  {key:'defense',title:'MELHOR DEFESA',rows:S.defesa,value:x=>x.gc},
  {key:'goals',title:'GOLS MARCADOS',rows:S.ataque,value:x=>x.gp},
  {key:'efficiency',title:'APROVEITAMENTO',rows:S.aprov,value:x=>x.ap,unit:'%'},
  {key:'wins',title:'VITÓRIAS',rows:S.vit,value:x=>x.v},
  {key:'draws',title:'EMPATES',rows:S.emp,value:x=>x.e},
  {key:'losses',title:'DERROTAS',rows:S.der,value:x=>x.d},
  {key:'goal-difference',title:'SALDO DE GOLS',rows:S.st.filter(x=>x.j).sort((a,b)=>b.sg-a.sg),value:x=>sgf(x.sg)}
];
const activeVisibleStatCompetitions=()=> (D.officialCompetitions||[]).filter(c=>
  c.is_visible!==false && c.is_active!==false && !['inactive','archived','hidden','draft','completed','finished'].includes(String(c.status||'').toLowerCase()) &&
  (D.officialEditions||[]).some(e=>String(e.competition_id)===String(c.id)&&publicEditionVisible(e))
);
const statsCompetitionMatch=m=>{
  if(statsCompetition==='all')return true;
  const edition=(D.officialEditions||[]).find(e=>String(e.id)===String(m.official_edition_id||m.round?.official_edition_id));
  return String(edition?.competition_id||'')===statsCompetition;
};
// O Torneio de Abertura possui arquivo histórico completo (grupos + mata-mata).
// Não combinar seus 93 registros parciais de matches com o arquivo: isso duplica jogos.
const openingStatMatches=()=>{
  // O arquivo contém 90 jogos da primeira fase e 30 do mata-mata.
  // Nos 90 primeiros, os clubes são identificados pelos técnicos do snapshot histórico.
  const standingsRows=openingArchive.filter(x=>x.record_type==='standing').map(x=>x.payload);
  const coachKey=s=>String(s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const byCoach=new Map(standingsRows.map(x=>[coachKey(x.coach),openingTeamName(x.team)]));
  const clubs=new Map();
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g,'');
  const teamFor=(team,coach)=>{
    const name=openingTeamName(team||byCoach.get(coachKey(coach))||'');
    if(!name)return null;
    const key=normalize(name);
    if(!clubs.has(key)){
      const participant=(D.participants||[]).find(p=>normalize(p.name)===key);
      clubs.set(key,{...(participant||{}),id:'opening-archive-team-'+key,name,coach_name:coach||''});
    }
    return clubs.get(key);
  };
  // Construir participantes exclusivos para esta edição, evitando misturar
  // clubes atuais com seus registros históricos e garantindo os 30 clubes.
  standingsRows.forEach(x=>teamFor(x.team,x.coach));
  const matches=openingArchive.filter(x=>x.record_type==='match').map(x=>{
    const p=x.payload||{},home=teamFor(p.home_team,p.home_coach),away=teamFor(p.away_team,p.away_coach);
    const hs=Number(p.home_score),as=Number(p.away_score);
    if(!home||!away||!Number.isFinite(hs)||!Number.isFinite(as))return null;
    return {id:'opening-archive-'+x.source_key,category:'official',official_edition_id:openingEditionId,
      home_id:home.id,away_id:away.id,home,away,home_score:hs,away_score:as,played:true};
  }).filter(Boolean);
  if(matches.length!==120||clubs.size!==30)console.warn('Arquivo Torneio de Abertura incompleto:',matches.length,'jogos;',clubs.size,'clubes');
  return {matches,participants:[...clubs.values()]};
};
const statDataCache=new WeakMap();
const statData=category=>{
  let cached=statDataCache.get(D);
  if(!cached){cached=new Map();statDataCache.set(D,cached);}
  const key=category+'|'+(category==='official'?statsCompetition:'all');
  if(cached.has(key))return cached.get(key);
  const includeOpening=category==='official'&&(statsCompetition==='all'||statsCompetition==='810e323b-ed38-44d4-8460-1e21f02dd077');
  const ms=D.matches.filter(m=>m.category===category&&publicCompetitionMatch(m)&&(category!=='official'||statsCompetitionMatch(m))&&
    (!includeOpening||String(m.official_edition_id||m.round?.official_edition_id)!==openingEditionId));
  const archive=includeOpening?openingStatMatches():{matches:[],participants:[]};
  const combined=ms.concat(archive.matches);
  const ids=new Set(ms.map(m=>m.id));
  const filtered={...D,participants:D.participants.concat(archive.participants),matches:combined,events:D.events.filter(e=>ids.has(e.match_id))};
  const result=stats(filtered,category);
  cached.set(key,result);
  return result;
};
const friendlyCoachDefinitions=()=>{
  const coaches=new Map();
  const ensure=name=>{
    const clean=String(name||'').trim(),key=clean.toLocaleLowerCase();
    if(!key)return null;
    if(!coaches.has(key))coaches.set(key,{name:clean,j:0,v:0,e:0,d:0,gp:0,gc:0,sg:0,ap:0});
    return coaches.get(key);
  };
  const add=(home,away,hs,as)=>{
    if(!Number.isFinite(Number(hs))||!Number.isFinite(Number(as)))return;
    const h=ensure(home),a=ensure(away);
    if(!h||!a||h===a)return;
    [[h,Number(hs),Number(as)],[a,Number(as),Number(hs)]].forEach(([x,gf,ga])=>{
      x.j++;x.gp+=gf;x.gc+=ga;
      if(gf>ga)x.v++;else if(gf===ga)x.e++;else x.d++;
    });
  };
  D.matches.filter(m=>m.played&&m.category==='friendly').forEach(m=>add(m.home_coach_name,m.away_coach_name,m.home_score,m.away_score));
  (careerArchive||[]).forEach(m=>add(m.home_coach,m.away_coach,m.home_score,m.away_score));
  const rows=[...coaches.values()].map(x=>({...x,sg:x.gp-x.gc,ap:x.j?Math.round((3*x.v+x.e)/(3*x.j)*1000)/10:0}));
  const ranked=(value,ascending=false)=>rows.slice().sort((a,b)=>(ascending?Number(value(a))-Number(value(b)):Number(value(b))-Number(value(a)))||a.name.localeCompare(b.name,'pt-BR'));
  const def=(key,title,value,unit='',ascending=false)=>({key,title,rows:ranked(value,ascending),value,unit,coaches:true});
  return [
    {key:'attack',title:'MELHOR ATAQUE (GOLS/JOGO)',rows:ranked(x=>x.gp/x.j),value:x=>fmt1(x.gp/x.j),unit:'',coaches:true},
    def('defense','MELHOR DEFESA',x=>x.gc,'',true),
    def('goals','GOLS MARCADOS',x=>x.gp),
    def('efficiency','APROVEITAMENTO',x=>x.ap,'%'),
    def('wins','VITÓRIAS',x=>x.v),
    def('draws','EMPATES',x=>x.e),
    def('losses','DERROTAS',x=>x.d),
    def('goal-difference','SALDO DE GOLS',x=>sgf(x.sg))
  ];
};
const officialMatchMetricDefinitions=()=>{
  const metrics=[
    ['possession','POSSE DE BOLA','%'],
    ['shots','CHUTES ',''],
    ['shots_on_target','CHUTES A GOL ',''],
    ['goalkeeper_saves','DEFESAS DO GOLEIRO ',''],
    ['corners','ESCANTEIOS ',''],
    ['penalties','PÊNALTIS (TOTAL) ',''],
    ['fouls','FALTAS COMETIDAS ',''],
    ['offsides','IMPEDIMENTOS ',''],
    ['yellow_cards','CARTÕES AMARELOS ',''],
    ['red_cards','CARTÕES VERMELHOS ','']
  ];
  const statsByMatch=new Map((D.matchStatistics||[]).map(s=>[String(s.match_id),s]));
  const teams=new Map();
  D.matches.filter(m=>m.played&&m.category==='official'&&publicCompetitionMatch(m)&&statsCompetitionMatch(m)).forEach(m=>{
    const s=statsByMatch.get(String(m.id));
    if(!s)return;
    [['home',m.home_id,m.home],['away',m.away_id,m.away]].forEach(([side,id,team])=>{
      if(!id||!team)return;
      const key=String(id);
      if(!teams.has(key))teams.set(key,{p:team,totals:{},counts:{}});
      const row=teams.get(key);
      metrics.forEach(([metric])=>{
        let n=s[side+'_'+metric];
        if(metric==='goalkeeper_saves'&&(n==null||n==='')){
          const opponent=side==='home'?'away':'home';
          const onTarget=Number(s[opponent+'_shots_on_target']);
          const goals=Number(m[opponent+'_score']);
          if(s[opponent+'_shots_on_target']!=null&&m[opponent+'_score']!=null&&Number.isFinite(onTarget)&&Number.isFinite(goals))n=Math.max(0,onTarget-goals);
        }
        if(n==null||n==='')return;
        const value=Number(n);
        if(!Number.isFinite(value))return;
        row.totals[metric]=(row.totals[metric]||0)+value;
        row.counts[metric]=(row.counts[metric]||0)+1;
      });
    });
  });
  const format=n=>n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  return metrics.map(([key,title,unit])=>{
    const mode=key==='possession'?'average':key==='penalties'?'total':(matchMetricModes[key]||'average');
    const rows=[...teams.values()].filter(x=>x.counts[key]>0).map(x=>({...x,average:x.totals[key]/x.counts[key],total:x.totals[key]}))
      .sort((a,b)=>(mode==='total'?b.total-a.total:b.average-a.average)||String(a.p.name||'').localeCompare(String(b.p.name||''),'pt-BR'));
    return {key:'match-'+key,title,rows,value:x=>mode==='total'?String(x.total):format(x.average),unit,matchMetric:key,metricMode:mode};
  });
};
const weeklyCoachDefinitions=()=>{
  const coaches=new Map();
  const ensure=name=>{
    const clean=String(name||'').trim(),key=clean.toLocaleLowerCase('pt-BR');
    if(!key)return null;
    if(!coaches.has(key))coaches.set(key,{name:clean,j:0,v:0,e:0,d:0,gp:0,gc:0,sg:0,ap:0,titles:0});
    return coaches.get(key);
  };
  D.matches.filter(m=>m.played&&m.category==='weekly').forEach(m=>{
    const home=ensure(m.home_coach_name||m.home?.coach_name);
    const away=ensure(m.away_coach_name||m.away?.coach_name);
    if(!home||!away||home===away)return;
    [[home,Number(m.home_score),Number(m.away_score)],[away,Number(m.away_score),Number(m.home_score)]].forEach(([x,gf,ga])=>{
      x.j++;x.gp+=gf;x.gc+=ga;
      if(gf>ga)x.v++;else if(gf===ga)x.e++;else x.d++;
    });
  });
  (D.weeklies||[]).filter(w=>w.champion_id).forEach(w=>{
    const name=w.champion_coach_name||D.participants.find(p=>String(p.id)===String(w.champion_id))?.coach_name;
    const coach=ensure(name);if(coach)coach.titles++;
  });
  const rows=[...coaches.values()].map(x=>({...x,sg:x.gp-x.gc,ap:x.j?Math.round((3*x.v+x.e)/(3*x.j)*1000)/10:0}));
  const ranked=(value,ascending=false)=>rows.slice().sort((a,b)=>(ascending?Number(value(a))-Number(value(b)):Number(value(b))-Number(value(a)))||a.name.localeCompare(b.name,'pt-BR'));
  const def=(key,title,value,unit='',ascending=false)=>({key,title,rows:ranked(value,ascending),value,unit,coaches:true});
  return [
    def('titles','TÍTULOS SEMANAIS',x=>x.titles),
    {key:'attack',title:'MELHOR ATAQUE (GOLS/JOGO)',rows:ranked(x=>x.j?x.gp/x.j:0),value:x=>x.j?fmt1(x.gp/x.j):'0',unit:'',coaches:true},
    def('defense','MELHOR DEFESA',x=>x.gc,'',true),
    def('goals','GOLS MARCADOS',x=>x.gp),
    def('wins','VITÓRIAS',x=>x.v),
    def('draws','EMPATES',x=>x.e),
    def('losses','DERROTAS',x=>x.d),
    def('efficiency','APROVEITAMENTO',x=>x.ap,'%'),
    def('goal-difference','SALDO DE GOLS',x=>x.sg)
  ];
};
const visibleStatDefinitions=category=>{
  if(category==='friendly')return friendlyCoachDefinitions();
  if(category==='weekly')return weeklyCoachDefinitions();
  const defs=statDefinitions(statData(category));
  if(category==='official')return [...defs.filter(d=>!['wins','draws','losses','efficiency'].includes(d.key)),...officialMatchMetricDefinitions()];
  return defs.filter(d=>!d.players);
};
const defenseDefinition=definition=>{
  if(definition.key!=='defense')return definition;
  const perGame=statsDefenseMode==='per-game';
  const rows=definition.rows.filter(x=>x.j>0).slice().sort((a,b)=>{
    const av=perGame?a.gc/a.j:a.gc,bv=perGame?b.gc/b.j:b.gc;
    return av-bv || a.gc-b.gc || b.j-a.j || (definition.coaches?a.name.localeCompare(b.name,'pt-BR'):a.p.name.localeCompare(b.p.name,'pt-BR'));
  });
  return {...definition,rows,value:x=>perGame?fmt1(x.gc/x.j):x.gc,unit:perGame?'gols/jogo':'gols'};
};
const matchMetricPicker=definition=>definition.matchMetric&&!['possession','penalties'].includes(definition.matchMetric)
  ?'<div class="stats-category-filter cbpes-defense-picker" role="group" aria-label="Exibição de '+esc(definition.title)+'"><button type="button" data-match-metric="'+esc(definition.matchMetric)+'" data-match-mode="average" class="'+(definition.metricMode==='average'?'selected':'')+'">MÉDIA</button><button type="button" data-match-metric="'+esc(definition.matchMetric)+'" data-match-mode="total" class="'+(definition.metricMode==='total'?'selected':'')+'">TOTAL</button></div>'
  :'';
const changeMatchMetricMode=e=>{
  const button=e.target.closest('[data-match-metric][data-match-mode]');
  if(!button)return false;
  matchMetricModes[button.dataset.matchMetric]=button.dataset.matchMode;
  if(location.hash.startsWith('#stats-detail/')){
    const parts=location.hash.slice(1).split('/');
    renderStatsDetail(decodeURIComponent(parts[1]||'official'),decodeURIComponent(parts[2]||''));
  }else renderStats();
  return true;
};
const defensePicker=definition=>definition.key==='defense'
  ?'<div class="stats-category-filter cbpes-defense-picker" role="group" aria-label="Critério de melhor defesa"><button type="button" data-defense-mode="per-game" class="'+(statsDefenseMode==='per-game'?'selected':'')+'">SOFRIDOS POR JOGO</button><button type="button" data-defense-mode="total" class="'+(statsDefenseMode==='total'?'selected':'')+'">SOFRIDOS NO TOTAL</button></div>'
  :'';
const changeDefenseMode=e=>{
  const button=e.target.closest('[data-defense-mode]');
  if(!button)return false;
  statsDefenseMode=button.dataset.defenseMode;
  renderStats();
  if(location.hash.startsWith('#stats-detail/')){
    const parts=location.hash.slice(1).split('/');
    renderStatsDetail(decodeURIComponent(parts[1]||'official'),decodeURIComponent(parts[2]||''));
  }
  return true;
};
const teamColor=(team)=>/^#[0-9a-f]{6}$/i.test(team?.primary_color||'')?team.primary_color:'#186a55';
const statRowsHtml=(definition,limit=Infinity)=>{
  const rows=definition.rows.slice(0,limit);
  return rows.length?rows.map((x,i)=>'<div class="player cbpes-stats-player" ><div><b>'+'<span class="rank-position">'+(i>0&&String(definition.value(x))===String(definition.value(definition.rows[i-1]))?'':densePosition(definition.rows,i,definition.value))+'</span>'+(definition.players?crestImg(x.team,'cbpes-stats-player-crest'):'')+(definition.coaches?'<a href="#coach/'+encodeURIComponent(x.name)+'">'+esc(x.name)+'</a>':definition.players?esc(x.name):participantLink(x.p))+'</b></div><span class="number">'+definition.value(x)+(definition.unit?' '+definition.unit:'')+'</span></div>').join(''):empty('Nenhum registro ainda.');
};
const statCard=(definition,category,full=false)=>'<div class="card cbpes-stats-card"><div class="cardhead"><h2>'+esc(definition.title)+'</h2></div><div class="cardbody">'+defensePicker(definition)+matchMetricPicker(definition)+statRowsHtml(defenseDefinition(definition),full?Infinity:5)+(full?'':'<a class="cbpes-stats-more" href="#stats-detail/'+encodeURIComponent(category)+'/'+encodeURIComponent(definition.key)+'">VER MAIS <span aria-hidden="true">→</span></a>')+'</div></div>';
function generalStatsData(category){
  const includeOpening=category==='official'&&(statsCompetition==='all'||statsCompetition==='810e323b-ed38-44d4-8460-1e21f02dd077');
  const matches=D.matches.filter(m=>m.category===category&&m.played&&publicCompetitionMatch(m)&&(category!=='official'||statsCompetitionMatch(m))&&
    (!includeOpening||String(m.official_edition_id||m.round?.official_edition_id)!==openingEditionId));
  if(includeOpening)matches.push(...openingStatMatches().matches);
  const records=matches.map(m=>({
    home:category==='weekly'?(m.home_coach_name||m.home?.coach_name||'Mandante'):(m.home?.name||'Mandante'),away:category==='weekly'?(m.away_coach_name||m.away?.coach_name||'Visitante'):(m.away?.name||'Visitante'),
    homeId:m.home_id,awayId:m.away_id,
    hs:Number(m.home_score),as:Number(m.away_score),archive:category==='weekly'
  }));
  if(category==='friendly'){
    (careerArchive||[]).forEach(m=>{
      const hs=Number(m.home_score),as=Number(m.away_score);
      if(!Number.isFinite(hs)||!Number.isFinite(as))return;
      records.push({home:m.home_coach||m.home_club||'Mandante',away:m.away_coach||m.away_club||'Visitante',hs,as,archive:true});
    });
  }
  const goals=records.reduce((sum,m)=>sum+m.hs+m.as,0);
  const biggest=records.slice().sort((a,b)=>Math.abs(b.hs-b.as)-Math.abs(a.hs-a.as)||(b.hs+b.as)-(a.hs+a.as))[0];
  return {games:records.length,goals,average:records.length?goals/records.length:0,biggest};
}
function renderStats(){
  // Definir a competição antes de calcular qualquer indicador.
  if(statsCategory==='official'){
    const available=activeVisibleStatCompetitions();
    if(statsCompetition===null){
      const liga=available.find(x=>/liga\s*pro/i.test(String(x.name||'')));
      statsCompetition=liga?String(liga.id):'all';
    }else if(statsCompetition!=='all'&&!available.some(x=>String(x.id)===statsCompetition)){
      statsCompetition='all';
    }
  }
  const generalData=generalStatsData(statsCategory),b=generalData.biggest;
  const bigTxt=b?(b.archive?coachLink(b.home):'<a href="#team/'+encodeURIComponent(b.homeId)+'">'+esc(b.home)+'</a>')+' '+b.hs+' x '+b.as+' '+(b.archive?coachLink(b.away):'<a href="#team/'+encodeURIComponent(b.awayId)+'">'+esc(b.away)+'</a>'):'—';
  const filter='<div class="stats-category-filter" role="group" aria-label="Filtrar estatísticas">'+Object.entries(statCategoryLabels).map(([v,l])=>'<button data-stats-category="'+v+'" class="'+(statsCategory===v?'selected':'')+'">'+l+'</button>').join('')+'</div>';
  const competitionOptions=statsCategory==='official'?activeVisibleStatCompetitions():[];
  if(statsCategory==='official'){
    if(statsCompetition===null){
      const ligaPro=competitionOptions.find(c=>/liga\s*pro/i.test(String(c.name||'')));
      statsCompetition=ligaPro?String(ligaPro.id):'all';
    }else if(statsCompetition!=='all'&&!competitionOptions.some(c=>String(c.id)===statsCompetition)){
      statsCompetition='all';
    }
  }
  const competitionFilter=statsCategory==='official'?'<div class="cbpes-stats-competition-filter"><label for="statsCompetitionSelect">COMPETIÇÃO</label><select id="statsCompetitionSelect" aria-label="Filtrar estatísticas por competição"><option value="all">TODAS</option>'+competitionOptions.map(c=>'<option value="'+esc(String(c.id))+'"'+(statsCompetition===String(c.id)?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div>':'';
  const general='<div class="card cbpes-stats-card cbpes-stats-general"><div class="cardhead"><h2>INDICADORES GERAIS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>'+generalData.games+'</b><span>Partidas</span></div><div class="stat"><b>'+generalData.goals+'</b><span>Gols</span></div><div class="stat"><b>'+fmt1(generalData.average)+'</b><span>Gols/jogo</span></div></div><div class="player" style="margin-top:8px"><div><b>Maior goleada</b><small>'+bigTxt+'</small></div></div></div></div>';
  const definitions=visibleStatDefinitions(statsCategory);
  $('statsGrid').innerHTML=filter+competitionFilter+general+definitions.map(d=>statCard(d,statsCategory)).join('');
  $('statsGrid').onchange=e=>{if(e.target.id==='statsCompetitionSelect'){statsCompetition=e.target.value;renderStats();}};
  $('statsGrid').onclick=e=>{if(changeDefenseMode(e)||changeMatchMetricMode(e))return;const btn=e.target.closest('[data-stats-category]');if(!btn)return;statsCategory=btn.dataset.statsCategory;renderStats();};
}
function renderStatsDetail(category,key){
  const root=$('statsDetailView');if(!root)return;
  const valid=Object.hasOwn(statCategoryLabels,category)?category:'official';
  const definition=visibleStatDefinitions(valid).find(d=>d.key===key);
  if(!definition){root.innerHTML='<div class="page-title"><h1>Estatística indisponível</h1></div><a class="cbpes-stats-back" href="#stats">VOLTAR ÀS ESTATÍSTICAS</a>';return;}
  root.onclick=e=>{if(changeDefenseMode(e))return;changeMatchMetricMode(e);};
  root.innerHTML='<div class="page-title cbpes-stats-detail-title"><div><div class="eyebrow">'+statCategoryLabels[valid]+'</div><h1>'+esc(definition.title)+'</h1><div class="sub">Classificação completa da estatística selecionada.</div></div></div><a class="cbpes-stats-back" href="#stats">← VOLTAR ÀS ESTATÍSTICAS</a>'+statCard(definition,valid,true);
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
  const historicClub=(careerArchive||[]).filter(m=>[m.home_club,m.away_club].some(c=>String(c||'').trim().toLocaleLowerCase()===String(p.name||'').trim().toLocaleLowerCase()));
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
// Histórico importado do PES6, separado das partidas das competições.
let careerArchive = [];
let careerArchiveError = '';
async function loadCareerArchive() {
  const {data,error} = await sb.from('career_matches').select('*');
  careerArchiveError = error ? (error.message || 'Falha ao consultar career_matches') : '';
  careerArchive = error ? [] : (data || []);
  if(error) console.error('CBPES: falha no histórico de carreira',error);
}
function careerArchiveNotice() {
  return careerArchiveError ? `<div class="notice" style="margin-top:16px"><b>HISTÓRICO INDISPONÍVEL</b><p>O Supabase não permitiu carregar as partidas históricas: ${esc(careerArchiveError)}. Confira as permissões de leitura da tabela career_matches.</p></div>` : '';
}
function archiveStats(rows, side) {
  let w=0,e=0,l=0,gf=0,ga=0;
  rows.forEach(m=>{
    const home=side(m)==='home', own=home?m.home_score:m.away_score,other=home?m.away_score:m.home_score;
    gf+=own;ga+=other;
    if(own>other)w++;else if(own<other)l++;else e++;
  });
  return {w,e,l,gf,ga};
}
function archiveCard(rows, side, title) {
  if(!rows.length)return '';
  const x=archiveStats(rows,side);
  return `<div class="card" style="margin-top:16px"><div class="cardhead"><h2>${esc(title)}</h2><span class="pill">${rows.length} JOGOS</span></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${rows.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${x.w}</b><span>Vitórias</span></div><div class="stat"><b>${x.e}</b><span>Empates</span></div><div class="stat"><b class="res-l">${x.l}</b><span>Derrotas</span></div></div><small>Gols marcados: ${x.gf} · Gols sofridos: ${x.ga} · Registros históricos importados, separados das competições.</small></div></div>`;
}
function renderTeam(id) {
  const p=D.participants.find(x=>x.id===id), root=$('teamView');
  if(!p){root.innerHTML=`<div class="page-title"><h1>Time não encontrado</h1><a href="#table">Voltar à tabela</a></div>`;return;}
  const ms=D.matches.filter(m=>m.played&&(m.home_id===id||m.away_id===id)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const weeklyTitles=(D.weeklies||[]).filter(w=>w.champion_id===id).sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||''));
  const history=(D.coachHistory||[]).filter(h=>h.participant_id===id).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
  const career=history.length?history.map(h=>`<div class="player"><div><b>${coachLink(h.coach_name)}</b>${h.dates_unspecified?'<small>Competição de Abertura</small>':`<small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small>`}</div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`).join(''):empty(p.coach_name?'Histórico anterior à implantação ainda não está detalhado.':'Nenhum técnico registrado.');
  root.innerHTML=`<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL DO TIME</div><h1>${esc(p.name)}</h1><div class="sub">${p.coach_name ? 'Técnico atual: ' + coachLink(p.coach_name) : 'Sem técnico atualmente'}</div></div></div>
  <div class="card"><div class="cardhead"><h2>DESEMPENHO DO TIME</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${statsSquares(ms,m=>m.home_id===id?'home':'away')}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>TROFÉUS SEMANAIS (${weeklyTitles.length})</h2></div><div class="cardbody">${weeklyTitles.length?weeklyTitles.map(w=>`<div class="player"><b>${esc(w.name)}</b><span>${fd(w.event_date)}</span></div>`).join(''):empty('Nenhum título semanal registrado.')}</div></div><div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE TÉCNICOS</h2></div><div class="cardbody">${career}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE PARTIDAS</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${ms.length?ms.map(m=>`<div class="result-row"><div class="round-label ${m.category==='friendly'||m.category==='weekly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':m.category==='weekly'?'SEM':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${esc(m.home.name)}</a> x <a href="#team/${m.away_id}">${esc(m.away.name)}</a><small>${m.category==='friendly'?'Amistoso':m.category==='weekly'?esc(m.weekly?.name||'Semanal'):esc(SET.name)} • ${fd(m.date)} • ${coachLink(m.home_coach_name||m.home.coach_name)} / ${coachLink(m.away_coach_name||m.away.coach_name)}</small></div><div class="result-score">${m.home_score} – ${m.away_score}</div></div>`).join(''):empty('Nenhuma partida disputada.')}</div></div>`;
  root.insertAdjacentHTML('beforeend',careerArchiveNotice()+archiveCard(historicClub,m=>String(m.home_club||'').trim().toLocaleLowerCase()===String(p.name||'').trim().toLocaleLowerCase()?'home':'away','HISTÓRICO IMPORTADO DO CLUBE'));
}
function renderCoach(name) {
  const root=$('coachView'), key=String(name||'').trim().toLocaleLowerCase();
  const historicCoach=(careerArchive||[]).filter(m=>[m.home_coach,m.away_coach].some(c=>String(c||'').trim().toLocaleLowerCase()===key));
  const assignments=(D.coachHistory||[]).filter(h=>String(h.coach_name||'').trim().toLocaleLowerCase()===key).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
  const teams=assignments.map(h=>D.participants.find(p=>p.id===h.participant_id)).filter(Boolean);
  const currentTeam=D.participants.find(p=>String(p.coach_name||'').trim().toLocaleLowerCase()===key)||teams.find((t,i)=>!assignments[i]?.ended_on)||null;
  const coachTeamLink=t=>t?`<a href="#team/${encodeURIComponent(t.id)}" class="cbpes-coach-team-link">${teamWithCrest(t)}</a>`:'<span>Sem time atualmente</span>';
  const careerCrests=[...new Map([...assignments].reverse().map(h=>{const t=D.participants.find(p=>p.id===h.participant_id);return t?[String(t.id),t]:null;}).filter(Boolean)).values()];
  const crestOnly=t=>{const wrapper=document.createElement('span');wrapper.innerHTML=teamWithCrest(t);const img=wrapper.querySelector('img');return img?`<a class="cbpes-coach-career-crest" href="#team/${encodeURIComponent(t.id)}" title="${esc(t.name)}" aria-label="${esc(t.name)}">${img.outerHTML}</a>`:`<a class="cbpes-coach-career-crest cbpes-coach-crest-fallback" href="#team/${encodeURIComponent(t.id)}" title="${esc(t.name)}">${esc(String(t.name||'?').slice(0,2))}</a>`;};
  // Amplia os escudos do cabeçalho para acompanhar o nome do técnico.
  const largeCrest=t=>crestOnly(t).replace('class="cbpes-coach-career-crest', 'style="display:inline-flex;width:66px;height:66px;align-items:center;justify-content:center;font-size:22px" class="cbpes-coach-career-crest').replace('<img ', '<img style="width:64px;height:64px;max-width:100%;object-fit:contain" ');
  const matches=D.matches.filter(m=>m.played && [m.home_coach_name,m.away_coach_name].some(n=>String(n||'').trim().toLocaleLowerCase()===key)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  let v=0,e=0,d=0;
  matches.forEach(m=>{const home=String(m.home_coach_name||'').trim().toLocaleLowerCase()===key;const own=home?m.home_score:m.away_score,opp=home?m.away_score:m.home_score;if(own>opp)v++;else if(own<opp)d++;else e++;});
  // A carreira inclui também os registros históricos importados do PES6.
  // Os dados originais das competições permanecem intocados.
  const historicTotals=archiveStats(historicCoach,m=>String(m.home_coach||'').trim().toLocaleLowerCase()===key?'home':'away');
  v+=historicTotals.w;e+=historicTotals.e;d+=historicTotals.l;
  const careerGames=matches.length+historicCoach.length;
  // Categorias selecionáveis: histórico PES6 é composto por amistosos importados.
  const coachCareerRows=[
    ...matches.map(m=>{const home=String(m.home_coach_name||'').trim().toLocaleLowerCase()===key;const own=home?m.home_score:m.away_score,opp=home?m.away_score:m.home_score;return {category:m.category==='weekly'?'weekly':m.category==='friendly'?'friendly':'official',own,opp};}),
    ...historicCoach.map(m=>{const home=String(m.home_coach||'').trim().toLocaleLowerCase()===key;return {category:m.official_competition_id?'official':'friendly',own:home?m.home_score:m.away_score,opp:home?m.away_score:m.home_score};})
  ];
  const coachFormMatches=[
    ...matches.map(m=>{const home=String(m.home_coach_name||'').trim().toLocaleLowerCase()===key;return {category:m.category==='weekly'?'weekly':m.category==='friendly'?'friendly':'official',own:home?Number(m.home_score):Number(m.away_score),opp:home?Number(m.away_score):Number(m.home_score),date:m.played_on||m.date||m.updated_at||m.created_at||'',id:String(m.id||'')};}),
    ...historicCoach.map((m,i)=>{const home=String(m.home_coach||'').trim().toLocaleLowerCase()===key;return {category:m.official_competition_id?'official':'friendly',own:Number(home?m.home_score:m.away_score),opp:Number(home?m.away_score:m.home_score),date:m.played_on||m.date||'',id:'archive-'+i};})
  ].filter(m=>Number.isFinite(m.own)&&Number.isFinite(m.opp)).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
  // SVG independente do CSS: os resultados permanecem círculos mesmo com estilos antigos em cache.
  const coachFormSvg = rows => {
    const recent=rows.slice(0,5);
    const entries=recent.length?recent.map(m=>({letter:m.own>m.opp?'V':m.own<m.opp?'D':'E',score:m.own+'–'+m.opp})):Array.from({length:5},()=>({letter:'–',score:'Sem partida registrada'}));
    const colors={V:'#159354',E:'#89949c',D:'#d64d4d','–':'#e7ecef'};
    const width=entries.length*46;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 42" width="'+width+'" height="42" role="img" aria-label="Últimos resultados: '+entries.map(e=>e.letter).join(', ')+'" style="display:block;max-width:100%;height:42px;margin:0 auto">'+entries.map((e,i)=>'<g transform="translate('+(i*46+23)+' 21)"><title>'+e.letter+' • '+e.score+'</title><circle r="17" fill="'+colors[e.letter]+'" stroke="'+(e.letter==='–'?'#cbd5db':colors[e.letter])+'" stroke-width="1"/><text x="0" y="1" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="'+(e.letter==='–'?'#87949b':'#ffffff')+'">'+e.letter+'</text></g>').join('')+'</svg>';
  };
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
  historicCoach.forEach(m => {
    const homeKey=String(m.home_coach||'').trim().toLocaleLowerCase();
    const awayKey=String(m.away_coach||'').trim().toLocaleLowerCase();
    const ownHome=homeKey===key, ownAway=awayKey===key;
    if(ownHome===ownAway)return;
    const opponent=ownHome?String(m.away_coach||'').trim():String(m.home_coach||'').trim();
    if(!opponent)return;
    const opponentKey=opponent.toLocaleLowerCase();
    if(!coachOpponents.has(opponentKey))coachOpponents.set(opponentKey,{name:opponent,wins:0,losses:0,draws:0});
    const rec=coachOpponents.get(opponentKey),own=ownHome?m.home_score:m.away_score,other=ownHome?m.away_score:m.home_score;
    if(own>other)rec.wins++;else if(own<other)rec.losses++;else rec.draws++;
  });
  const opponentRecords=[...coachOpponents.values()].filter(x=>x.wins+x.losses+x.draws>0);
  const bestVictim=opponentRecords.filter(x=>x.wins>x.losses).sort((a,b)=>(b.wins-b.losses)-(a.wins-a.losses)||b.wins-a.wins||a.name.localeCompare(b.name))[0];
  const biggestNemesis=opponentRecords.filter(x=>x.losses>x.wins).sort((a,b)=>(b.losses-b.wins)-(a.losses-a.wins)||b.losses-a.losses||a.name.localeCompare(b.name))[0];
  const coachRivalryCard=(title,rec,emptyText,type)=>`<div class="cbpes-coach-rivalry-card ${type}"><div class="cbpes-coach-rivalry-icon" aria-hidden="true">${type==='victim'?'🦆':'🤬'}</div><div class="cbpes-coach-rivalry-info"><span class="cbpes-coach-rivalry-label">${title}</span><div class="cbpes-coach-rivalry-name">${rec?coachLink(rec.name):'—'}</div>${!rec?`<small class="cbpes-coach-rivalry-empty">${emptyText}</small>`:''}</div>${rec?`<div class="cbpes-coach-rivalry-record"><span class="cbpes-coach-record-w">${rec.wins}</span><span class="cbpes-coach-record-divider">–</span><span class="cbpes-coach-record-l">${rec.losses}</span></div>`:''}</div>`;

  // Recordes de placar: partidas oficiais, semanais, amistosas e histórico PES6.
  const coachScoreMatches=[
    ...matches.map(m=>({home:m.home_coach_name,away:m.away_coach_name,hs:Number(m.home_score),as:Number(m.away_score),date:m.date||null,competition:m.category==='friendly'?'Amistoso':null,match:m})),
    ...historicCoach.map(m=>({home:m.home_coach,away:m.away_coach,hs:Number(m.home_score),as:Number(m.away_score),date:m.played_on||m.date||null,competition:'Amistoso',match:null}))
  ].filter(m=>Number.isFinite(m.hs)&&Number.isFinite(m.as)).map(m=>{
    const isHome=String(m.home||'').trim().toLocaleLowerCase()===key;
    return {...m,own:isHome?m.hs:m.as,against:isHome?m.as:m.hs,opponent:isHome?m.away:m.home};
  });
  const biggestWin=coachScoreMatches.filter(m=>m.own>m.against).sort((a,b)=>(b.own-b.against)-(a.own-a.against)||b.own-a.own||String(b.date||'').localeCompare(String(a.date||'')))[0];
  const worstLoss=coachScoreMatches.filter(m=>m.own<m.against).sort((a,b)=>(b.against-b.own)-(a.against-a.own)||b.against-a.against||String(b.date||'').localeCompare(String(a.date||'')))[0];
  const coachScoreRecordCard=(label,emoji,m,kind)=>{
    const score=m?`${m.own}–${m.against}`:'—';
    const competition=m?(m.competition||coachMatchCompetition(m.match)):'';
    const detail=m?`<span class="cbpes-coach-record-opponent">${score} vs. <strong style="font-weight:750">${coachLink(m.opponent)}</strong></span><small style="display:block;margin-top:6px;color:#8a929d;font-weight:400;font-size:12px;line-height:1.4">${esc(competition||'Competição não informada').toLocaleUpperCase('pt-BR')}</small>`:'<small>Nenhuma partida correspondente registrada.</small>';
    return `<div class="cbpes-coach-rivalry-card ${kind}" style="position:relative"><div class="cbpes-coach-rivalry-icon" aria-hidden="true">${emoji}</div><div class="cbpes-coach-rivalry-info" style="min-width:0;padding-right:85px"><span class="cbpes-coach-rivalry-label">${label}</span><div class="cbpes-coach-rivalry-name" style="font-weight:600">${detail}</div></div>${m?.date?`<small style="position:absolute;right:14px;top:12px;white-space:nowrap;opacity:.7;font-size:11px">${esc(fd(m.date))}</small>`:''}</div>`;
  };

  const coachMatchCompetition=m=>{
    if(m.category==='friendly')return '';
    if(m.category==='weekly'){
      const weekly=(D.weeklies||[]).find(w=>String(w.id)===String(m.weekly_id));
      return weekly?.name||weekly?.title||'PARTIDA SEMANAL';
    }
    const edition=(D.officialEditions||[]).find(e=>String(e.id)===String(m.official_edition_id||m.round?.official_edition_id));
    const competition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition?.competition_id));
    return competition?.name||edition?.name||'PARTIDA OFICIAL';
  };
  // Os registros importados são amistosos comuns na apresentação do perfil.
  const historicResults=historicCoach.map(m=>{
    const isHome=String(m.home_coach||'').trim().toLocaleLowerCase()===key;
    const own=isHome?m.home_score:m.away_score,other=isHome?m.away_score:m.home_score;
    const outcome=own>other?'win':own<other?'loss':'draw';
    return `<div class="result-row cbpes-coach-match-row cbpes-coach-match-friendly"><span class="cbpes-coach-match-meta">${m.date?esc(fd(m.date)):m.played_on?esc(fd(m.played_on)):"Data não informada"}</span><div class="cbpes-coach-match-line"><span>${coachLink(m.home_coach)}</span><strong class="cbpes-coach-match-score ${outcome}">${m.home_score}–${m.away_score}</strong><span>${coachLink(m.away_coach)}</span></div></div>`;
  }).join('');
  const coachTrophies=(D.coachTrophies||[]).filter(t=>String(t.coach_name||'').trim().toLocaleLowerCase()===key).sort((a,b)=>(b.awarded_on||'').localeCompare(a.awarded_on||''));
  const profile=(D.coachProfiles||[]).find(p=>String(p.name||'').trim().toLocaleLowerCase()===key);
  const orderedAssignments=[...assignments].sort((a,b)=>{const ac=currentTeam&&String(a.participant_id)===String(currentTeam.id)&&!a.ended_on;const bc=currentTeam&&String(b.participant_id)===String(currentTeam.id)&&!b.ended_on;return Number(bc)-Number(ac)||(b.started_on||'').localeCompare(a.started_on||'');});
  const career=orderedAssignments.length?orderedAssignments.map(h=>{const t=D.participants.find(p=>p.id===h.participant_id);const isCurrent=!!currentTeam&&String(h.participant_id)===String(currentTeam.id)&&!h.ended_on;return `<div class="player cbpes-coach-team-row ${isCurrent?'cbpes-coach-team-current':''}"><div><b>${t?coachTeamLink(t):'Time removido'}</b><small>${h.dates_unspecified?'Competição de Abertura':`${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):isCurrent?'Atual':'Data final não informada'}`}</small></div><span class="pill">${isCurrent?'ATUAL':'ANTERIOR'}</span></div>`;}).join(''):empty('Nenhum vínculo histórico cadastrado para este técnico.');
  const coachNames=[...new Set([
    ...(D.coachProfiles||[]).map(x=>x.name), ...(D.coachHistory||[]).map(x=>x.coach_name),
    ...D.participants.map(x=>x.coach_name), ...D.matches.flatMap(m=>[m.home_coach_name,m.away_coach_name]),
    ...(D.coachTrophies||[]).map(x=>x.coach_name)
  ].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const coachCompareOptions=coachNames.filter(n=>n.toLocaleLowerCase()!==key).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const coachSummary=(coachName)=>{
    const k=coachName.toLocaleLowerCase();
    const games=D.matches.filter(m=>m.played && [m.home_coach_name,m.away_coach_name].some(n=>String(n||'').trim().toLocaleLowerCase()===k));
    let wins=0,draws=0,losses=0,goalsFor=0,goalsAgainst=0;
    games.forEach(m=>{const isHome=String(m.home_coach_name||'').trim().toLocaleLowerCase()===k;const own=isHome?m.home_score:m.away_score,other=isHome?m.away_score:m.home_score;goalsFor+=Number(own)||0;goalsAgainst+=Number(other)||0;if(own>other)wins++;else if(own<other)losses++;else draws++;});
    const imported=careerArchive.filter(m=>[m.home_coach,m.away_coach].some(n=>String(n||'').trim().toLocaleLowerCase()===k));
    imported.forEach(m=>{const home=String(m.home_coach||'').trim().toLocaleLowerCase()===k;const own=home?m.home_score:m.away_score,opp=home?m.away_score:m.home_score;goalsFor+=Number(own)||0;goalsAgainst+=Number(opp)||0;if(own>opp)wins++;else if(own<opp)losses++;else draws++;});
    const trophies=(D.coachTrophies||[]).filter(t=>String(t.coach_name||'').trim().toLocaleLowerCase()===k);
    const teams=(D.coachHistory||[]).filter(h=>String(h.coach_name||'').trim().toLocaleLowerCase()===k).map(h=>D.participants.find(t=>t.id===h.participant_id)?.name).filter(Boolean);
    return {games:games.length+imported.length,wins,draws,losses,goalsFor,goalsAgainst,trophies,teams:[...new Set(teams)]};
  };
  const renderCoachComparison=(otherName,mode='career')=>{
    const out=root.querySelector('#coachCompareResult');if(!out)return;
    if(!otherName){out.innerHTML='<div class="admin-help">Selecione outro técnico para comparar as estatísticas.</div>';return;}
    const otherKey=otherName.trim().toLocaleLowerCase();
    const allDirect=[
      ...D.matches.filter(m=>m.played&&publicCompetitionMatch(m)).map(m=>({h:String(m.home_coach_name||'').trim().toLocaleLowerCase(),a:String(m.away_coach_name||'').trim().toLocaleLowerCase(),hs:m.home_score,as:m.away_score,date:m.date,home:m.home?.name||m.home_coach_name,away:m.away?.name||m.away_coach_name,category:m.category||'official'})),
      ...careerArchive.map(m=>({h:String(m.home_coach||'').trim().toLocaleLowerCase(),a:String(m.away_coach||'').trim().toLocaleLowerCase(),hs:m.home_score,as:m.away_score,date:m.played_on||m.match_date||m.date,home:m.home_club||m.home_coach,away:m.away_club||m.away_coach,category:'friendly'}))
    ].filter(m=>(m.h===key&&m.a===otherKey)||(m.h===otherKey&&m.a===key));
    const direct={games:allDirect.length,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0};
    allDirect.forEach(m=>{const own=m.h===key?m.hs:m.as,opp=m.h===key?m.as:m.hs;direct.goalsFor+=Number(own)||0;direct.goalsAgainst+=Number(opp)||0;if(own>opp)direct.wins++;else if(own<opp)direct.losses++;else direct.draws++;});
    const a=mode==='direct'?direct:coachSummary(name);
    const b=mode==='direct'?{games:direct.games,wins:direct.losses,draws:direct.draws,losses:direct.wins,goalsFor:direct.goalsAgainst,goalsAgainst:direct.goalsFor}:coachSummary(otherName);
    const rate=x=>x.games?Math.round((x.wins*3+x.draws)/(x.games*3)*1000)/10:0;
    const metrics=[['JOGOS',a.games,b.games],['VITÓRIAS',a.wins,b.wins],['EMPATES',a.draws,b.draws],['DERROTAS',a.losses,b.losses],['GOLS PRÓ',a.goalsFor,b.goalsFor],['GOLS SOFRIDOS',a.goalsAgainst,b.goalsAgainst],['APROVEITAMENTO',rate(a),rate(b),'%']];
    const bars=(mode==='direct'?metrics.filter(([label])=>label!=='DERROTAS'):metrics).map(([label,av,bv,suffix=''])=>{
      const total=av+bv,left=total?av/total*100:50,right=100-left;const neutral=mode==='direct'&&(label==='JOGOS'||label==='EMPATES');
      return `<div class="cbpes-compare-metric">${neutral?`<div class="cbpes-compare-metric-head cbpes-compare-metric-head-neutral"><span>${label}</span><b>${av}${suffix}</b></div>`:`<div class="cbpes-compare-metric-head"><b class="${av<bv?'cbpes-compare-lower':''}">${av}${suffix}</b><span>${label}</span><b class="${bv<av?'cbpes-compare-lower':''}">${bv}${suffix}</b></div>`}<div class="cbpes-compare-track ${neutral?'cbpes-compare-track-neutral':''}" role="img" aria-label="${label}: ${esc(name)} ${av}${suffix}; ${esc(otherName)} ${bv}${suffix}"><span class="cbpes-compare-left" style="width:${left}%"></span><span class="cbpes-compare-right" style="width:${right}%"></span></div></div>`;
    }).join('');
    const directMatches=mode==='direct'&&allDirect.length?'<div class="cbpes-direct-fixtures"><h3>PARTIDAS ENTRE OS TÉCNICOS <span>('+allDirect.length+')</span></h3>'+allDirect.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(m=>{
      const homeGoals=Number(m.hs),awayGoals=Number(m.as);
      const ownGoals=m.h===key?homeGoals:awayGoals,opponentGoals=m.h===key?awayGoals:homeGoals;
      const result=ownGoals>opponentGoals?'V':ownGoals<opponentGoals?'D':'E';
      const category=m.category==='official'?'OFICIAL':m.category==='weekly'?'SEMANAL':'AMISTOSO';
      const homeLabel=m.category==='official'?(m.home||m.h):(m.h===key?name:otherName);
      const awayLabel=m.category==='official'?(m.away||m.a):(m.a===key?name:otherName);
      return '<div class="cbpes-direct-fixture"><div class="cbpes-direct-fixture-info"><span>'+category+'</span><small>'+recordDate(m.date)+'</small></div><div class="cbpes-direct-fixture-score"><span>'+esc(homeLabel)+'</span><strong>'+homeGoals+' – '+awayGoals+'</strong><span>'+esc(awayLabel)+'</span></div><div class="cbpes-direct-fixture-result"><span class="cbpes-direct-result-badge cbpes-direct-result-'+result.toLowerCase()+'" title="'+(result==='V'?'Vitória':result==='D'?'Derrota':'Empate')+' de '+esc(name)+'">'+result+'</span></div></div>';
    }).join('')+'</div>':'';
    const trophiesA=coachSummary(name).trophies,trophiesB=coachSummary(otherName).trophies;
    const trophies=(items)=>items.length?items.map(t=>`<div class="cbpes-compare-achievement">🏆 ${esc(t.title)}</div>`).join(''):'Nenhuma conquista registrada';
    out.innerHTML=`<div class="cbpes-compare-modes" role="group" aria-label="Tipo de comparação"><button type="button" class="${mode==='career'?'active':''}" data-compare-mode="career" aria-pressed="${mode==='career'}">CARREIRA COMPLETA</button><button type="button" class="${mode==='direct'?'active':''}" data-compare-mode="direct" aria-pressed="${mode==='direct'}">CONFRONTO DIRETO</button></div><div class="cbpes-compare-board"><div class="cbpes-compare-names"><strong>${coachLink(name)}</strong><span>VS</span><strong>${coachLink(otherName)}</strong></div>${bars}<div class="cbpes-compare-legend"><span>■ ${esc(name)}</span><span>■ ${esc(otherName)}</span></div></div>${directMatches}${mode==='direct'&&!direct.games?'<div class="admin-help">Nenhuma partida entre estes técnicos foi registrada. As barras de comparação ficam neutras.</div>':''}<div class="cbpes-compare-achievements"><h3>CONQUISTAS</h3><div class="cbpes-compare-achievements-grid"><div><b>${esc(name)}</b>${trophies(trophiesA)}</div><div><b>${esc(otherName)}</b>${trophies(trophiesB)}</div></div></div>`;
    out.querySelectorAll('[data-compare-mode]').forEach(btn=>btn.addEventListener('click',()=>renderCoachComparison(otherName,btn.dataset.compareMode)));
  };
  const previousClubs=[...new Map(assignments.map(h=>D.participants.find(p=>String(p.id)===String(h.participant_id))).filter(t=>t&&String(t.id)!==String(currentTeam?.id)).map(t=>[String(t.id),t])).values()];
  root.innerHTML=`<div class="cbpes-coach-hero" style="padding:32px 34px;min-height:205px;position:relative">
    <div class="cbpes-coach-hero-label" style="font-size:12px;letter-spacing:.12em">PERFIL DO TÉCNICO</div>
    <div class="cbpes-coach-hero-title cbpes-coach-hero-identity">
      <h1>${esc(name)}</h1>
      <div class="cbpes-coach-hero-crest-line">
        ${currentTeam?`<span class="cbpes-coach-hero-current-crest" title="Clube atual: ${esc(currentTeam.name)}">${crestOnly(currentTeam)}</span>`:""}
        ${previousClubs.length?`<span class="cbpes-coach-hero-past-crests">${previousClubs.map(t=>`<span class="cbpes-coach-hero-past-crest" title="Clube anterior: ${esc(t.name)}">${crestOnly(t)}</span>`).join("")}</span>`:""}
      </div>
    </div>
    <div class="cbpes-coach-current-team"><span>TIME ATUAL:</span>${currentTeam?`<a href="#team/${encodeURIComponent(currentTeam.id)}">${esc(currentTeam.name)}</a>`:"Sem time atualmente"}</div>
    ${profile?.bio?`<p class="cbpes-coach-hero-bio" style="margin-top:14px">${esc(profile.bio)}</p>`:""}
  </div>
  <div class="card cbpes-coach-performance"><div class="cardhead"><h2>ESTATÍSTICAS DA CARREIRA</h2></div><div class="cardbody"><div class="cbpes-coach-filter" role="group" aria-label="Filtrar estatísticas por categoria"><span>FILTRAR POR</span><label><input type="checkbox" data-coach-category="friendly" checked> AMISTOSOS</label><label><input type="checkbox" data-coach-category="official" checked> OFICIAIS</label><label><input type="checkbox" data-coach-category="weekly" checked> SEMANAIS</label></div><div class="cbpes-coach-kpi-grid"><div class="cbpes-coach-kpi games"><span class="cbpes-coach-kpi-label">JOGOS</span><strong>${careerGames}</strong><small>Partidas disputadas</small></div><div class="cbpes-coach-kpi wins"><span class="cbpes-coach-kpi-label">VITÓRIAS</span><strong>${v}</strong><small>${careerGames?Math.round(v/careerGames*100):0}% dos jogos</small></div><div class="cbpes-coach-kpi draws"><span class="cbpes-coach-kpi-label">EMPATES</span><strong>${e}</strong><small>${careerGames?Math.round(e/careerGames*100):0}% dos jogos</small></div><div class="cbpes-coach-kpi losses"><span class="cbpes-coach-kpi-label">DERROTAS</span><strong>${d}</strong><small>${careerGames?Math.round(d/careerGames*100):0}% dos jogos</small></div><div class="cbpes-coach-kpi efficiency"><span class="cbpes-coach-kpi-label">APROVEITAMENTO</span><strong>0%</strong><small></small></div></div><div class="cbpes-coach-recent-form" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;margin:20px auto 4px;padding:18px 12px;text-align:center"><span style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#66737d">ÚLTIMOS 5 JOGOS</span><div class="cbpes-coach-recent-form-dots" style="display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap;min-height:36px" aria-label="Forma dos últimos cinco jogos">${coachFormSvg(coachFormMatches)}</div></div></div></div>
  <div class="cbpes-coach-rivalry-grid">${coachRivalryCard('MAIOR FREGUÊS',bestVictim,'Sem retrospecto positivo definido.','victim')}${coachRivalryCard('MAIOR CARRASCO',biggestNemesis,'Sem retrospecto negativo definido.','nemesis')}</div>
  <div class="cbpes-coach-rivalry-grid" style="margin-top:16px">${coachScoreRecordCard('MAIOR GOLEADA','⚽',biggestWin,'victim')}${coachScoreRecordCard('PIOR DERROTA SOFRIDA','💀',worstLoss,'nemesis')}</div>
  <div class="card cbpes-coach-trophies" style="margin-top:16px"><div class="cardhead"><h2>SALA DE TROFÉUS (${coachTrophies.length})</h2></div><div class="cardbody">${coachTrophies.length?coachTrophies.map(t=>`<div class="player"><div><b>🏆 ${esc(t.title)}</b><small>${esc(t.competition_name||'Conquista')} • ${fd(t.awarded_on)}${t.team_name?' • '+esc(t.team_name):''}</small></div><span class="pill">${t.source_type==='manual'?'ESPECIAL':t.source_type==='weekly'?'SEMANAL':'OFICIAL'}</span></div>`).join(''):empty('Nenhum título registrado.')}</div></div><div class="card cbpes-coach-teams" style="margin-top:16px"><div class="cardhead"><h2>TIMES COMANDADOS</h2></div><div class="cardbody">${career}</div></div>
  <div class="card cbpes-coach-compare" style="margin-top:16px"><div class="cardhead"><h2>COMPARAR COM OUTRO TÉCNICO</h2></div><div class="cardbody"><div class="field"><label for="coachCompareWith">Selecione o técnico</label><select id="coachCompareWith"><option value="">Selecione outro técnico</option>${coachCompareOptions}</select></div><div id="coachCompareResult" style="margin-top:12px"></div></div></div>
  <div class="card cbpes-coach-history" style="margin-top:16px"><div class="cardhead"><h2>PARTIDAS NA CARREIRA</h2></div><div class="cardbody">${matches.length?matches.map(m=>`<div class="result-row cbpes-coach-match-row ${m.category==='weekly'?'cbpes-coach-match-weekly':m.category==='friendly'?'cbpes-coach-match-friendly':'cbpes-coach-match-official'} ${String(m.official_edition_id||m.round?.official_edition_id||'')===openingEditionId?'cbpes-coach-opening-match':''}"><span class="cbpes-coach-match-meta">${esc(coachMatchCompetition(m))}${m.date||m.played_on?`<small class="cbpes-coach-match-date">${esc(fd(m.date||m.played_on))}</small>`:""}</span><div class="cbpes-coach-match-line"><span class="cbpes-coach-match-side"><a href="#team/${encodeURIComponent(m.home_id)}" class="cbpes-coach-match-club">${String(m.official_edition_id||m.round?.official_edition_id||'')===openingEditionId?esc(m.home.name):teamWithCrest(m.home)}</a><small>${esc(m.home_coach_name||'')}</small></span><strong class="cbpes-coach-match-score">${m.home_score}–${m.away_score}</strong><span class="cbpes-coach-match-side"><a href="#team/${encodeURIComponent(m.away_id)}" class="cbpes-coach-match-club">${String(m.official_edition_id||m.round?.official_edition_id||'')===openingEditionId?esc(m.away.name):teamWithCrest(m.away)}</a><small>${esc(m.away_coach_name||'')}</small></span></div></div>`).join(''):empty('As estatísticas serão formadas a partir das partidas com o técnico registrado no momento do jogo.')}</div></div>`;
  // Separa partidas competitivas e amistosos, cada categoria com sua própria expansão.
  const historyCard=root.querySelector('.cbpes-coach-history');
  if(historyCard){
    const body=historyCard.querySelector('.cardbody');
    const existing=[...body.querySelectorAll('.result-row')];
    const officialRows=existing.filter((row,i)=>matches[i]?.category!=='friendly');
    const friendlyRows=existing.filter((row,i)=>matches[i]?.category==='friendly');
    const makeSection=(title,rows,limit=5)=>{
      const section=document.createElement('section');section.className='cbpes-coach-history-section';
      const heading=document.createElement('h3');heading.textContent=title;section.appendChild(heading);
      rows.forEach((row,i)=>{const collapsed=limit!==null&&i>=limit;row.hidden=collapsed;row.classList.toggle('cbpes-history-collapsed',collapsed);section.appendChild(row);});
      if(limit!==null&&rows.length>limit){
        const more=document.createElement('button');more.type='button';more.className='cbpes-coach-history-toggle';
        more.textContent='EXIBIR HISTÓRICO COMPLETO ('+rows.length+' PARTIDAS)';more.setAttribute('aria-expanded','false');
        more.addEventListener('click',()=>{const expanded=more.getAttribute('aria-expanded')!=='true';rows.slice(limit).forEach(row=>{row.hidden=!expanded;row.classList.toggle('cbpes-history-collapsed',!expanded);});more.setAttribute('aria-expanded',String(expanded));more.textContent=expanded?'MOSTRAR APENAS AS '+limit+' PRIMEIRAS':'EXIBIR HISTÓRICO COMPLETO ('+rows.length+' PARTIDAS)';});
        section.appendChild(more);
      }
      if(!rows.length){const emptyText=document.createElement('p');emptyText.className='cbpes-coach-history-empty';emptyText.textContent='Nenhuma partida registrada nesta categoria.';section.appendChild(emptyText);}
      body.appendChild(section);
    };
    body.innerHTML='';
    makeSection('PARTIDAS OFICIAIS / SEMANAIS',officialRows,10);
    const imported=document.createElement('div');imported.innerHTML=historicResults;
    // Une amistosos do portal e histórico PES6 em ordem cronológica decrescente,
    // independentemente do adversário. Datas ausentes ficam por último.
    const importedRows=[...imported.querySelectorAll('.result-row')];
    const friendlyDated=[
      ...friendlyRows.map(row=>({row,date:matches[existing.indexOf(row)]?.date||matches[existing.indexOf(row)]?.played_on||''})),
      ...importedRows.map((row,i)=>({row,date:historicCoach[i]?.played_on||historicCoach[i]?.date||''}))
    ];
    const dateValue=value=>{
      if(!value)return -Infinity;
      const str=String(value).trim();
      const br=str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      const normalized=br?br[3]+'-'+br[2]+'-'+br[1]:str;
      const timestamp=Date.parse(normalized);
      return Number.isFinite(timestamp)?timestamp:-Infinity;
    };
    friendlyDated.sort((a,b)=>dateValue(b.date)-dateValue(a.date));
    makeSection('PARTIDAS AMISTOSAS',friendlyDated.map(item=>item.row));
    historyCard.querySelector('.cardhead h2').textContent='HISTÓRICO DO TÉCNICO';
  }
  root.insertAdjacentHTML('beforeend',careerArchiveNotice());
  const updateCoachCareerStats=()=>{
    const selected=[...root.querySelectorAll('[data-coach-category]:checked')].map(el=>el.dataset.coachCategory);
    const rows=coachCareerRows.filter(m=>selected.includes(m.category));
    const games=rows.length,wins=rows.filter(m=>m.own>m.opp).length,draws=rows.filter(m=>m.own===m.opp).length,losses=games-wins-draws;
    const panel=root.querySelector('.cbpes-coach-performance');
    if(!panel)return;
    const set=(cls,value,desc)=>{const el=panel.querySelector('.cbpes-coach-kpi.'+cls);if(!el)return;el.querySelector('strong').textContent=value;el.querySelector('small').textContent=desc;};
    set('games',games,'Partidas disputadas');
    set('wins',wins,(games?Math.round(wins/games*100):0)+'% dos jogos');
    set('draws',draws,(games?Math.round(draws/games*100):0)+'% dos jogos');
    set('losses',losses,(games?Math.round(losses/games*100):0)+'% dos jogos');
    const form=panel.querySelector('.cbpes-coach-recent-form-dots');
    if(form){
      const recent=coachFormMatches.filter(m=>selected.includes(m.category)).slice(0,5);
      form.innerHTML=coachFormSvg(recent);
    }
    const rate=games?Math.round((wins*3+draws)/(games*3)*1000)/10:0;
    set('efficiency',rate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%','');
  };
  root.querySelectorAll('[data-coach-category]').forEach(input=>input.addEventListener('change',updateCoachCareerStats));
  updateCoachCareerStats();
  const compareSelect=root.querySelector('#coachCompareWith');
  if(compareSelect) compareSelect.addEventListener('change',()=>renderCoachComparison(compareSelect.value));
}


const recordGroups=[
 ['matches','PARTIDAS',['Maior goleada da história','Partida com mais gols','Maior empate']],
 ['clubs','CLUBES',['Maior sequência de vitórias','Maior invencibilidade','Maior sequência sem vencer','Mais gols marcados em uma competição','Menos gols sofridos em uma competição','Mais títulos conquistados']],
 ['coaches','TÉCNICOS',['Técnico com mais vitórias na história','Maior sequência de vitórias','Maior sequência invicta','Maior número de títulos','Mais finais disputadas','Maior freguesia histórica contra outro técnico','Maior vencedor de semanais']],
 ['titles','TÍTULOS OFICIAIS',[]],
 ['weeklyTitles','TÍTULOS SEMANAIS',[]],
 ['players','JOGADORES',['Mais gols em uma partida','Mais gols em uma edição','Maior sequência de jogos marcando','Mais participações em gols em uma edição']],
 ['competitions','COMPETIÇÕES',['Campeão com melhor campanha','Campeão com mais gols marcados','Campeão com menos gols sofridos','Maior pontuação em uma edição de liga','Maior diferença de pontos entre campeão e vice','Maior número de gols em uma edição']]
];
const recordDate=d=>d?fd(String(d).slice(0,10)):'Data não informada';
const recordMatch=m=>m?esc(m.homeName)+' '+m.hs+'–'+m.as+' '+esc(m.awayName):'Partida não identificada';
const recordMeta=m=>m?recordMatch(m)+' · '+recordDate(m.date):'';
const recordLink=(name,type,id)=>type==='coach'?'<a href="#coach/'+encodeURIComponent(name)+'">'+esc(name)+'</a>':id?'<a href="#team/'+encodeURIComponent(id)+'">'+esc(name)+'</a>':esc(name);
function recordFixtures(){
  const items=D.matches.filter(m=>m.played&&publicCompetitionMatch(m)).map(m=>({
    id:m.id,date:m.date,seq:m.seq,category:m.category,homeId:m.home_id,awayId:m.away_id,
    homeName:m.home.name,awayName:m.away.name,homeCoach:m.home_coach_name||m.home.coach_name,
    awayCoach:m.away_coach_name||m.away.coach_name,hs:Number(m.home_score),as:Number(m.away_score),
    edition:m.category==='official'?String(m.official_edition_id||m.round?.official_edition_id||''):m.category==='weekly'?String(m.weekly_id||''):'',
    round:m.round,raw:m
  }));
  (careerArchive||[]).forEach((m,i)=>{
    const hs=Number(m.home_score),as=Number(m.away_score);
    if(!Number.isFinite(hs)||!Number.isFinite(as))return;
    items.push({id:'archive-'+i,date:m.played_on||m.match_date||m.date||null,seq:m.seq,
      category:'friendly',homeId:null,awayId:null,homeName:m.home_club||m.home_coach||'Mandante',
      awayName:m.away_club||m.away_coach||'Visitante',homeCoach:m.home_coach,awayCoach:m.away_coach,
      hs,as,edition:'',round:null,raw:m,archive:true});
  });
  // Arquivo oficial do Torneio de Abertura: reconstruir clubes a partir do
  // cadastro histórico de técnicos, inclusive oitavas, quartas, semis e final.
  const standing=(openingArchive||[]).filter(x=>x.record_type==='standing').map(x=>x.payload);
  const coachTeams=new Map(standing.filter(x=>x.coach&&x.team).map(x=>[String(x.coach).toLocaleLowerCase('pt-BR'),openingTeamName(x.team)]));
  (openingArchive||[]).filter(x=>x.record_type==='match').forEach((entry,i)=>{
    const m=entry.payload||{},hs=Number(m.home_score),as=Number(m.away_score);
    if(!Number.isFinite(hs)||!Number.isFinite(as))return;
    const homeCoach=String(m.home_coach||''),awayCoach=String(m.away_coach||'');
    const homeName=coachTeams.get(homeCoach.toLocaleLowerCase('pt-BR'))||homeCoach;
    const awayName=coachTeams.get(awayCoach.toLocaleLowerCase('pt-BR'))||awayCoach;
    const homeTeam=D.participants.find(p=>p.name===homeName),awayTeam=D.participants.find(p=>p.name===awayName);
    items.push({id:'opening-'+entry.source_key,date:m.played_on||null,seq:i,category:'official',
      homeId:homeTeam?.id||'opening:'+homeName,awayId:awayTeam?.id||'opening:'+awayName,
      homeName,awayName,homeCoach,awayCoach,hs,as,edition:openingEditionId,
      round:{name:String(entry.source_key||'').includes('-qf-')?'Quartas de final':String(entry.source_key||'').includes('-ro16-')?'Oitavas de final':String(entry.source_key||'').includes('-sf-')?'Semifinal':String(entry.source_key||'').includes('-final-')?'Final':'Classificação'},
      raw:m,archive:true,opening:true,order:i});
  });
  return items.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||Number(a.seq||0)-Number(b.seq||0)||String(a.id).localeCompare(String(b.id)));
}
function recordStreaks(fixtures,kind,mode){
  const per=new Map(),results=[];
  fixtures.filter(m=>m.date).forEach(m=>{
    const sides=kind==='coach'
      ?[[m.homeCoach,m.hs,m.as],[m.awayCoach,m.as,m.hs]]
      :[[m.homeId,m.hs,m.as],[m.awayId,m.as,m.hs]];
    sides.forEach(([id,gf,ga])=>{
      if(!id)return;
      const key=String(id).toLocaleLowerCase(),current=per.get(key)||{id,name:kind==='coach'?id:(D.participants.find(p=>String(p.id)===key)?.name||''),count:0,start:null,end:null,matches:[]};
      const qualifies=mode==='wins'?gf>ga:mode==='unbeaten'?gf>=ga:gf<=ga;
      if(qualifies){if(!current.count)current.start=m;current.count++;current.end=m;current.matches.push(m);}
      else{if(current.count)results.push({...current,active:false,breaker:m});current.count=0;current.start=null;current.end=null;current.matches=[];}
      per.set(key,current);
    });
  });
  per.forEach(x=>{if(x.count)results.push({...x,active:true});});
  return results.sort((a,b)=>b.count-a.count);
}
function recordCards(){
  const fixtures=recordFixtures(),official=fixtures.filter(m=>m.category==='official'),groups={matches:[],clubs:[],coaches:[],titles:[],weeklyTitles:[],players:[],competitions:[]};
  const put=(group,title,rows,render)=>groups[group].push({title,rows:rows||[],render});
  const top=(arr,value,dir='max')=>{
    const valid=arr.filter(x=>Number.isFinite(Number(value(x))));
    if(!valid.length)return [];
    const best=dir==='min'?Math.min(...valid.map(value)):Math.max(...valid.map(value));
    return valid.filter(x=>value(x)===best);
  };
  const matchRow=m=>({value:recordMatch(m),detail:recordDate(m.date)});
  put('matches','Maior goleada da história',top(fixtures,m=>Math.abs(m.hs-m.as)),m=>({...matchRow(m),metric:Math.abs(m.hs-m.as)+' gols de diferença'}));
  put('matches','Partida com mais gols',top(fixtures,m=>m.hs+m.as),m=>({...matchRow(m),metric:m.hs+m.as+' gols'}));
  put('matches','Maior empate',top(fixtures.filter(m=>m.hs===m.as),m=>m.hs),m=>({...matchRow(m),metric:m.hs+'–'+m.as}));
  const streakCard=(group,title,kind,mode,source=fixtures)=>{
    const arr=recordStreaks(source,kind,mode);
    put(group,title,top(arr,x=>x.count),x=>({value:recordLink(x.name,kind,x.id),metric:x.count+' jogos',detail:'<div class="cbpes-record-streak-games"><div class="cbpes-record-streak-heading">PARTIDAS DA SEQUÊNCIA</div>'+x.matches.map((m,i)=>'<div>'+(i+1)+'. '+recordMeta(m)+'</div>').join('')+(x.breaker?'<div><strong>JOGO QUE ENCERROU:</strong> '+recordMeta(x.breaker)+'</div>':'<div>Sequência ainda ativa</div>')+'</div>'}));
  };
  streakCard('clubs','Maior invencibilidade de clubes','club','unbeaten');
  streakCard('clubs','Maior sequência sem vencer','club','winless');
  const editions=new Map();
  fixtures.filter(m=>m.edition).forEach(m=>{
    const key=m.category+':'+m.edition;
    if(!editions.has(key))editions.set(key,[]);
    editions.get(key).push(m);
  });
  const editionName=(ms)=>{
    const m=ms[0];
    if(!m)return 'Edição não identificada';
    if(m.category==='weekly')return m.raw.weekly?.name||'Semanal';
    if(m.opening)return 'Torneio de Abertura 2026';
    const e=D.officialEditions.find(e=>String(e.id)===m.edition);
    const c=D.officialCompetitions.find(c=>String(c.id)===String(e?.competition_id));
    return [c?.name,e?.name].filter(Boolean).join(' · ')||'Competição oficial';
  };
  const teamEditions=[];
  editions.forEach(ms=>{
    const map=new Map();
    ms.forEach(m=>[[m.homeId,m.homeName,m.hs,m.as],[m.awayId,m.awayName,m.as,m.hs]].forEach(([id,name,gf,ga])=>{
      if(!id)return;
      if(!map.has(id))map.set(id,{id,name,gf:0,ga:0,j:0,v:0,e:0,pts:0,competition:editionName(ms),matches:ms});
      const x=map.get(id);x.gf+=gf;x.ga+=ga;x.j++;x.v+=gf>ga?1:0;x.e+=gf===ga?1:0;x.pts+=gf>ga?3:gf===ga?1:0;
    }));
    teamEditions.push(...map.values());
  });
  const teRow=x=>({value:recordLink(x.name,'club',x.id),detail:esc(x.competition)});
  put('clubs','Mais gols marcados em uma competição',top(teamEditions,x=>x.gf),x=>({...teRow(x),metric:x.gf+' gols'}));
  put('clubs','Menos gols sofridos em uma competição',top(teamEditions.filter(x=>x.j>=2),x=>x.ga,'min'),x=>({...teRow(x),metric:x.ga+' gols · '+x.j+' jogos'}));
  const trophies=D.coachTrophies||[];
  const titleRows=trophies.map(t=>({
    coach:t.coach_name||(D.coachProfiles||[]).find(c=>String(c.id)===String(t.coach_id))?.name,
    teamId:t.participant_id||t.team_id,
    category:String(t.source_type||t.category||t.type||'').toLowerCase()
  }));
  const officialTitles=titleRows.filter(t=>t.category==='official');
  const weeklyTitles=titleRows.filter(t=>t.category==='weekly');
  const titleCounts=(key,source)=>{const map=new Map();source.forEach(t=>{const name=key(t);if(name)map.set(String(name),(map.get(String(name))||0)+1);});return [...map].map(([name,count])=>({name,count}));};
  const titleTeamRow=x=>({value:recordLink(D.participants.find(p=>String(p.id)===x.name)?.name||x.name,'club',x.name),metric:x.count+' títulos'});
  const titleCoachRow=x=>({value:recordLink(x.name,'coach'),metric:x.count+' títulos'});
  put('titles','Técnico com mais títulos oficiais',top(titleCounts(t=>t.coach,officialTitles),x=>x.count),titleCoachRow);
  put('titles','Clube com mais títulos oficiais',top(titleCounts(t=>t.teamId,officialTitles),x=>x.count),titleTeamRow);
  put('weeklyTitles','Técnico com mais títulos semanais',top(titleCounts(t=>t.coach,weeklyTitles),x=>x.count),titleCoachRow);
  put('weeklyTitles','Clube com mais títulos semanais',top(titleCounts(t=>t.teamId,weeklyTitles),x=>x.count),titleTeamRow);
  put('clubs','Mais títulos oficiais conquistados',top(titleCounts(t=>t.teamId,officialTitles),x=>x.count),titleTeamRow);
  put('clubs','Mais títulos semanais conquistados',top(titleCounts(t=>t.teamId,weeklyTitles),x=>x.count),titleTeamRow);
  const coachMatches=new Map();
  fixtures.forEach(m=>[[m.homeCoach,m.hs,m.as,m.awayCoach],[m.awayCoach,m.as,m.hs,m.homeCoach]].forEach(([name,gf,ga,opponent])=>{
    if(!name)return;
    const key=String(name).toLocaleLowerCase();
    if(!coachMatches.has(key))coachMatches.set(key,{name,wins:0,finals:new Set(),opponents:new Map()});
    const x=coachMatches.get(key);if(gf>ga)x.wins++;
    if(opponent){const o=String(opponent).toLocaleLowerCase(),p=x.opponents.get(o)||{name:opponent,wins:0,losses:0};if(gf>ga)p.wins++;if(gf<ga)p.losses++;x.opponents.set(o,p);}
  }));
  const coaches=[...coachMatches.values()];
  put('coaches','Técnico com mais vitórias na história',top(coaches,x=>x.wins),x=>({value:recordLink(x.name,'coach'),metric:x.wins+' vitórias'}));
  streakCard('coaches','Maior sequência de vitórias de técnicos','coach','wins');
  streakCard('coaches','Maior sequência de vitórias oficiais de técnicos','coach','wins',official);
  streakCard('coaches','Maior sequência invicta de técnicos','coach','unbeaten');
  put('coaches','Mais títulos oficiais',top(titleCounts(t=>t.coach,officialTitles),x=>x.count),titleCoachRow);
  put('coaches','Mais títulos semanais',top(titleCounts(t=>t.coach,weeklyTitles),x=>x.count),titleCoachRow);
  const finals=fixtures.filter(m=>/final/i.test(String(m.round?.name||''))&&!/semi|quart|oitav|terceiro|3º/i.test(String(m.round?.name||'')));
  const finalMap=new Map();
  finals.forEach(m=>[m.homeCoach,m.awayCoach].forEach(n=>{if(n){const key=n.toLocaleLowerCase();if(!finalMap.has(key))finalMap.set(key,{name:n,ids:new Set()});finalMap.get(key).ids.add(m.edition||m.id);}}));
  put('coaches','Mais finais disputadas',top([...finalMap.values()],x=>x.ids.size),x=>({value:recordLink(x.name,'coach'),metric:x.ids.size+' finais'}));
  const rivals=coaches.flatMap(c=>[...c.opponents.values()].map(o=>({coach:c.name,opponent:o.name,wins:o.wins,losses:o.losses,lead:o.wins-o.losses}))).filter(x=>x.lead>0);
  put('coaches','Maior freguesia histórica contra outro técnico',top(rivals,x=>x.lead),x=>({value:recordLink(x.coach,'coach')+' contra '+recordLink(x.opponent,'coach'),metric:x.wins+'–'+x.losses+' · saldo +'+x.lead}));
  const weeklyChampions=(D.weeklies||[]).filter(w=>w.champion_id).map(w=>({name:w.champion_coach_name||D.participants.find(p=>String(p.id)===String(w.champion_id))?.coach_name}));
  const weekMap=new Map();weeklyChampions.forEach(x=>{if(x.name)weekMap.set(x.name,(weekMap.get(x.name)||0)+1);});
  put('coaches','Maior vencedor de semanais',top([...weekMap].map(([name,count])=>({name,count})),x=>x.count),x=>({value:recordLink(x.name,'coach'),metric:x.count+' títulos semanais'}));
  const officialIds=new Set(official.map(m=>String(m.id)));
  const scorerEvents=(D.events||[]).filter(e=>officialIds.has(String(e.match_id))&&e.scorer_id);
  const players=new Map(D.players.map(p=>[String(p.id),p]));
  const playerEvents=new Map();
  scorerEvents.forEach(e=>{const key=String(e.match_id)+':'+e.scorer_id;playerEvents.set(key,(playerEvents.get(key)||0)+1);});
  const playerName=id=>{const p=players.get(String(id));return p?esc(p.name)+' · '+esc(p.team?.name||''):esc(id);};
  const gameGoals=[...playerEvents].map(([key,goals])=>{const split=key.indexOf(':');return {match:official.find(m=>String(m.id)===key.slice(0,split)),player:key.slice(split+1),goals};});
  put('players','Mais gols em uma partida',top(gameGoals,x=>x.goals),x=>({value:playerName(x.player),metric:x.goals+' gols',detail:recordMeta(x.match)}));
  const playerEdition=new Map();
  scorerEvents.forEach(e=>{const m=official.find(m=>String(m.id)===String(e.match_id));if(!m?.edition)return;const key=e.scorer_id+':'+m.edition;const x=playerEdition.get(key)||{player:e.scorer_id,edition:m.edition,goals:0,ga:0};x.goals++;x.ga++;playerEdition.set(key,x);});
  (D.events||[]).filter(e=>officialIds.has(String(e.match_id))&&e.assist_id).forEach(e=>{const m=official.find(m=>String(m.id)===String(e.match_id));if(!m?.edition)return;const key=e.assist_id+':'+m.edition;const x=playerEdition.get(key)||{player:e.assist_id,edition:m.edition,goals:0,ga:0};x.ga++;playerEdition.set(key,x);});
  const pe=[...playerEdition.values()];
  const peDetail=x=>editionName(editions.get('official:'+x.edition)||[]);
  put('players','Mais gols em uma edição',top(pe,x=>x.goals),x=>({value:playerName(x.player),metric:x.goals+' gols',detail:esc(peDetail(x))}));
  const playerStreaks=[];
  const playerGames=new Map();
  official.filter(m=>m.date).forEach(m=>{
    [m.homeId,m.awayId].forEach(id=>{if(!id)return;const ps=D.players.filter(p=>String(p.participant_id)===String(id));ps.forEach(p=>{const k=String(p.id),current=playerGames.get(k)||{player:k,count:0,start:null,end:null};const g=playerEvents.get(String(m.id)+':'+k)||0;if(g){if(!current.count)current.start=m;current.count++;current.end=m;}else{if(current.count)playerStreaks.push({...current});current.count=0;current.start=null;current.end=null;}playerGames.set(k,current);});});
  });
  playerGames.forEach(x=>{if(x.count)playerStreaks.push({...x});});
  put('players','Maior sequência de jogos marcando',top(playerStreaks,x=>x.count),x=>({value:playerName(x.player),metric:x.count+' jogos',detail:'INÍCIO · '+recordMeta(x.start)+'<br>FIM · '+recordMeta(x.end)}));
  put('players','Mais participações em gols em uma edição',top(pe,x=>x.ga),x=>({value:playerName(x.player),metric:x.ga+' participações',detail:esc(peDetail(x))}));
  const champions=[];
  (D.officialEditions||[]).forEach(e=>{if(!publicEditionVisible(e))return;const id=e.champion_id||e.champion_team_id;if(!id)return;const ms=editions.get('official:'+e.id)||[];const x=teamEditions.find(t=>String(t.id)===String(id)&&t.matches===ms);if(x)champions.push(x);});
  // Recordes de campeões desta seção são exclusivos das competições oficiais.
  // Adicionar os campeões do arquivo histórico quando houver identificação
  // explícita do campeão no cadastro da edição.
  const openingEdition=(D.officialEditions||[]).find(e=>String(e.id)===openingEditionId);
  const openingChampionId=openingEdition?.champion_id||openingEdition?.champion_team_id;
  if(openingChampionId&&!champions.some(x=>String(x.id)===String(openingChampionId)&&x.matches[0]?.opening)){
    const entry=teamEditions.find(x=>String(x.id)===String(openingChampionId)&&x.matches[0]?.opening);
    if(entry)champions.push(entry);
  }
  put('competitions','Mais gols marcados por um clube em uma edição (todas as fases)',top(teamEditions.filter(x=>x.matches[0]?.category==='official'),x=>x.gf),x=>({...teRow(x),metric:x.gf+' gols · '+x.j+' jogos'}));
  put('competitions','Menos gols sofridos por um clube em uma edição (todas as fases)',top(teamEditions.filter(x=>x.matches[0]?.category==='official'&&x.j>=2),x=>x.ga,'min'),x=>({...teRow(x),metric:x.ga+' gols · '+x.j+' jogos'}));
  put('competitions','Mais gols sofridos por um clube em uma edição (todas as fases)',top(teamEditions.filter(x=>x.matches[0]?.category==='official'),x=>x.ga),x=>({...teRow(x),metric:x.ga+' gols · '+x.j+' jogos'}));
  put('competitions','Campeão com melhor campanha',top(champions.filter(x=>x.j),x=>x.pts/(x.j*3)),x=>({...teRow(x),metric:fmt1(100*x.pts/(x.j*3))+'%'}));
  put('competitions','Campeão com mais gols marcados',top(champions,x=>x.gf),x=>({...teRow(x),metric:x.gf+' gols'}));
  put('competitions','Campeão com menos gols sofridos',top(champions,x=>x.ga,'min'),x=>({...teRow(x),metric:x.ga+' gols'}));
  const leagueTeams=teamEditions.filter(x=>{const m=x.matches[0];if(m.category!=='official')return false;const e=D.officialEditions.find(e=>String(e.id)===m.edition);return /liga|pontos corridos/i.test(String(e?.name||'')+' '+String(D.officialCompetitions.find(c=>String(c.id)===String(e?.competition_id))?.name||''));});
  put('competitions','Maior pontuação em uma edição de liga',top(leagueTeams,x=>x.pts),x=>({...teRow(x),metric:x.pts+' pontos'}));
  const gaps=[];editions.forEach(ms=>{const table=teamEditions.filter(x=>x.matches===ms).sort((a,b)=>b.pts-a.pts);if(table.length>=2)gaps.push({champ:table[0],runner:table[1],gap:table[0].pts-table[1].pts});});
  put('competitions','Maior diferença de pontos entre campeão e vice',top(gaps,x=>x.gap),x=>({value:recordLink(x.champ.name,'club',x.champ.id)+' / '+recordLink(x.runner.name,'club',x.runner.id),metric:x.gap+' pontos',detail:esc(x.champ.competition)}));
  const editionTotals=[...editions.values()].filter(ms=>ms[0]?.category==='official').map(ms=>({name:editionName(ms),goals:ms.reduce((sum,m)=>sum+m.hs+m.as,0)}));
  put('competitions','Maior número de gols em uma edição',top(editionTotals,x=>x.goals),x=>({value:esc(x.name),metric:x.goals+' gols'}));
  return groups;
}
function renderRecords(){
  const root=$('recordsView');if(!root||!D)return;
  const groups=recordCards();
  const records=recordGroups.filter(group=>group[0]!=='players').flatMap(group=>groups[group[0]]||[]);
  // Todos os titulares empatados de cada recorde contam no ranking.
  // Contabilizar apenas recordes de técnicos, não clubes ou partidas.
  const leaders=new Map();
  (groups.coaches||[]).forEach(card=>(card.rows||[]).forEach(x=>{
    const name=String(x.coach||x.name||'').trim();
    if(!name)return;
    const key=name.toLocaleLowerCase('pt-BR');
    const entry=leaders.get(key)||{name,titles:[]};
    if(!entry.titles.includes(card.title))entry.titles.push(card.title);
    leaders.set(key,entry);
  }));
  const leaderboard=[...leaders.values()].sort((a,b)=>b.titles.length-a.titles.length||a.name.localeCompare(b.name,'pt-BR'));
  const recordHtml=records.map(c=>
    '<div class="cbpes-record-line"><div class="cbpes-record-label"><h2>'+esc(c.title)+'</h2></div><div class="cbpes-record-values">'+
    (c.rows.length?c.rows.map(x=>{const item=c.render(x);return '<div class="cbpes-record-value"><div class="cbpes-record-person"><strong>'+item.value+'</strong>'+(item.detail?'<small>'+item.detail+'</small>':'')+'</div><span class="cbpes-record-number">'+esc(item.metric||'')+'</span></div>';}).join(''):'<span class="cbpes-record-empty">Sem dados suficientes</span>')+
    '</div></div>').join('');
  root.innerHTML='<div class="cbpes-records-layout"><div class="cbpes-records-simple">'+recordHtml+'</div><aside class="cbpes-record-leaders"><h2>MAIORES RECORDISTAS</h2><p>Recordes detidos por técnicos</p><table><thead><tr><th>TÉCNICO</th><th>RECORDES</th></tr></thead><tbody>'+leaderboard.map((x,i)=>
    '<tr><td><details><summary>'+(i+1)+'. '+esc(x.name)+'</summary><div class="cbpes-record-leader-details">'+x.titles.map(t=>'<div>'+esc(t)+'</div>').join('')+'</div></details></td><td>'+x.titles.length+'</td></tr>').join('')+'</tbody></table></aside></div>';
}
function renderTrophyRoom(){
  const root=$('trophiesView');if(!root||!D)return;
  const trophies=(D.coachTrophies||[]).slice().sort((a,b)=>String(b.awarded_on||'').localeCompare(String(a.awarded_on||'')));
  const byCoach=new Map();
  trophies.forEach(t=>{
    const name=String(t.coach_name||'').trim();
    if(!name)return;
    const key=name.toLocaleLowerCase('pt-BR');
    if(!byCoach.has(key))byCoach.set(key,{name,items:[]});
    byCoach.get(key).items.push(t);
  });
  // Campeonatos de temporada têm peso superior às conquistas semanais.
  const trophyWeight=t=>/torneio de abertura|temporada/i.test(String(t.competition_name||'')+' '+String(t.title||''))?10:t.source_type==='official'?5:t.source_type==='weekly'?1:2;
  const coaches=[...byCoach.values()].map(coach=>({...coach,points:coach.items.reduce((sum,t)=>sum+trophyWeight(t),0)}))
    .sort((a,b)=>b.points-a.points||b.items.length-a.items.length||a.name.localeCompare(b.name,'pt-BR'));
  const trophyLabel=t=>{
    const competition=String(t.competition_name||'').trim();
    const title=String(t.title||'').trim();
    const weekly=t.source_type==='weekly'||/semanal/i.test(title+' '+competition);
    const name=weekly?'CAMPEÃO SEMANAL':/torneio de abertura/i.test(competition)?'CAMPEÃO DO TORNEIO DE ABERTURA':(title||competition||'CONQUISTA').toLocaleUpperCase('pt-BR');
    const date=t.awarded_on?fd(t.awarded_on):'';
    return name+(date?' · '+date:'');
  };
  root.innerHTML=coaches.length?'<div class="cbpes-trophy-ranking">'+coaches.map((coach,i)=>
      '<div class="cbpes-trophy-ranking-row"><div class="cbpes-trophy-ranking-position">'+(i+1)+'</div>'+
      '<div class="cbpes-trophy-ranking-coach"><a href="#coach/'+encodeURIComponent(coach.name)+'">'+esc(coach.name)+'</a></div>'+
      '<div class="cbpes-trophy-ranking-achievements">'+coach.items.map(t=>'<div class="cbpes-trophy-ranking-achievement">'+esc(trophyLabel(t))+'</div>').join('')+'</div>'+
      '</div>').join('')+'</div>':empty('Nenhum troféu registrado até o momento.');
}
function renderAll() { renderNavCompetitions(); renderHome(); renderGames(); renderTable(); renderWeeklies(); renderStats(); renderRecords(); renderTrophyRoom(); if(window.CBPESBelts)CBPESBelts.renderPublic(); const raw=location.hash.slice(1), parts=raw.split('/'); if(parts[1]){const value=decodeURIComponent(parts.slice(1).join('/'));if(parts[0]==='participant')renderParticipant(value);if(parts[0]==='team')renderTeam(value);if(parts[0]==='coach')renderCoach(value);if(parts[0]==='stats-detail')renderStatsDetail(decodeURIComponent(parts[1]||'official'),decodeURIComponent(parts[2]||''));} $('season').textContent = 'TEMPORADA ' + SET.season; }
async function boot() {
  try {
    if (CBPES.url.startsWith('COLE')) throw new Error('config.js ainda não foi preenchido.');
    D = await load();
    // O arquivo de histórico é complementar: não deve bloquear a exibição do portal.
    try { await loadCareerArchive(); } catch (archiveError) { console.warn('Histórico complementar indisponível:', archiveError); }
    try { await loadOpeningArchive(); } catch (archiveError) { openingArchiveError=archiveError.message; }
    renderAll();
    route();
    $('status').classList.add('hidden');
  } catch (e) {
    const status=$('status');
    status.textContent='Não foi possível carregar os dados: ' + (e.message || e);
    status.classList.remove('hidden');
  } finally {
    document.documentElement.classList.remove('cbpes-preboot');
  }
}
boot();
setInterval(async () => { if (D && !document.hidden) { try { D = await load(); await loadCareerArchive(); await loadOpeningArchive(); renderAll(); } catch (e) {} } }, 60000);
