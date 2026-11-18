let D = null, filter = 'all', profileMode = 'current';
const $ = id => document.getElementById(id);
const PAGES = ['home', 'games', 'table', 'stats', 'participant', 'team', 'coach'];
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

const participantLink = p => `<a href="#team/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`;
const coachLink = name => name ? `<a class="coach-link" href="#coach/${encodeURIComponent(name)}">${esc(name)}</a>` : '<span>Não informado</span>';
const miniTable = st => `<table class="table"><thead><tr><th>TIME</th><th>PTS</th><th>J</th><th>SG</th></tr></thead><tbody>${st.map((x, i) => `<tr><td><span class="pos">${i + 1}</span><span class="club">${participantLink(x.p)}<small class="table-coach">${x.p.coach_name ? coachLink(x.p.coach_name) : ''}</small></span></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${sgf(x.sg)}</td></tr>`).join('')}</tbody></table>`;
const fullTbl = st => st.length ? `<table class="table"><thead><tr><th>POS.</th><th>TIME</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th></tr></thead><tbody>${st.map((x, i) => `<tr><td>${i + 1}</td><td class="club">${participantLink(x.p)}<small class="table-coach">${x.p.coach_name ? coachLink(x.p.coach_name) : ''}</small></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td></tr>`).join('')}</tbody></table>` : empty('Sem participantes nesta tabela.');
const heading = t => `<div class="eyebrow" style="margin:12px 0 4px">${t}</div>`;

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
const plCard = (title, rows, f, unit) => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b>${i + 1}. ${esc(x.name)}</b><small><a href="#team/${x.team.id}">${esc(x.team.name)}</a></small></div><span class="number">${f(x)} ${unit}</span></div>`).join('') : empty('Nenhum registro ainda.')}</div></div>`;
const rankCard = (title, rows, f, unit = '') => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 8).map((x, i) => `<div class="player"><div><b>${i + 1}. ${participantLink(x.p)}</b></div><span class="number">${f(x)}${unit}</span></div>`).join('') : empty('Sem dados ainda.')}</div></div>`;

function renderHome() {
  const { participants, rounds, matches } = D, played = latestPlayed(matches), nx = nextMatches(matches), S = stats(D), t = typeOf();
  $('hSeason').textContent = (SET.name + ' • TEMPORADA ' + SET.season).toUpperCase();
  const cr = currentRound(rounds, matches);
  $('hRound').textContent = cr ? roundLabel(cr).toUpperCase() : 'SEM RODADAS';

  const sc = m => `<div class="sc"><div class="sc-meta"><a href="#games">${m.category === 'friendly' ? 'AMIS' : esc(SET.name)} • ${m.date ? fd(m.date).slice(0, 5) : 'a definir'}</a></div><div class="sc-row"><span><a href="#team/${m.home_id}">${esc(m.home.name)}</a></span><b>${m.played ? m.home_score : ''}</b></div><div class="sc-row"><span><a href="#team/${m.away_id}">${esc(m.away.name)}</a></span><b>${m.played ? m.away_score : ''}</b></div></div>`;
  const sl = played.slice(0, 6).reverse().concat(nx.slice(0, 6));
  $('strip').innerHTML = sl.length ? sl.map(sc).join('') + '<a class="sc-end" href="#games">TODOS OS JOGOS →</a>' : '<div class="sc-end" style="padding:14px 16px">Nenhuma partida cadastrada.</div>';
  const m = played[0];
  $('latest').innerHTML = m ? `<div class="latest-match" style="--match-color:${matchColor(m)};background:${matchColor(m)}"><div class="latest-top"><b>Última partida</b><span>${m.category === 'friendly' ? 'AMIS' : esc(SET.name)}</span></div><div class="latest-main"><div class="latest-team"><div class="latest-teamtext"><div><a href="#team/${m.home_id}">${esc(m.home.name)}</a></div><small>${coachLink(m.home_coach_name || m.home.coach_name)}</small></div></div><div class="latest-score"><span>${m.home_score} : ${m.away_score}</span></div><div class="latest-team"><div class="latest-teamtext"><div><a href="#team/${m.away_id}">${esc(m.away.name)}</a></div><small>${coachLink(m.away_coach_name || m.away.coach_name)}</small></div></div></div><div class="latest-foot"><span>${fd(m.date)}</span><span>${esc(SET.season)}</span></div></div>` : `<div class="card"><div class="cardbody">${empty('Nenhuma partida realizada ainda.')}</div></div>`;
  $('recent').innerHTML = played.length ? played.slice(0, 5).map(matchRow).join('') : empty('Nenhum resultado cadastrado.');
  $('next').innerHTML = nx.length ? nx.slice(0, 5).map(matchRow).join('') : empty('Nenhuma partida agendada.');
  // Cartão lateral: depende do formato
  const ko = koRounds(D), lastKo = ko[ko.length - 1];
  let mini = '', title = 'CLASSIFICAÇÃO';
  if (t === 'liga') { const st = standings(participants, leagueMatches(D)); mini = st.length ? miniTable(st.slice(0, 8)) : empty('Nenhum participante cadastrado.'); }
  else {
    if (t === 'copa') { const g = groupTables(D); title = lastKo ? 'GRUPOS E MATA-MATA' : 'GRUPOS'; mini = g.map(x => heading('GRUPO ' + esc(x.name)) + miniTable(x.st.slice(0, 4))).join(''); }
    else title = 'CHAVEAMENTO';
    if (lastKo) mini += heading(esc(roundLabel(lastKo).toUpperCase())) + tieRows(tiesOf(matches.filter(x => x.round_id === lastKo.id)));
    if (!mini) mini = empty('Aguardando sorteio e geração dos jogos.');
  }
  $('miniTitle').textContent = title; $('miniTable').innerHTML = mini;
  $('numbers').innerHTML = `<div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Média</span></div></div>`;
  const hl = (tt, who, sub, v, teamId = null, whoIsTeam = false) => `<div class="player"><div><b>${tt}</b><small>${whoIsTeam && teamId ? `<a href="#team/${teamId}">${esc(who)}</a>` : esc(who)}${sub ? ' • ' + (teamId && !whoIsTeam ? `<a href="#team/${teamId}">${esc(sub)}</a>` : esc(sub)) : ''}</small></div><span class="number">${v}</span></div>`;
  let h = '';
  if (S.artilheiros[0]) h += hl('Artilheiro', S.artilheiros[0].name, S.artilheiros[0].team.name, S.artilheiros[0].g + ' gols', S.artilheiros[0].team.id);
  if (S.garcons[0]) h += hl('Líder em assistências', S.garcons[0].name, S.garcons[0].team.name, S.garcons[0].a, S.garcons[0].team.id);
  if (S.jogos) h += hl('Melhor ataque', S.ataque[0].p.name, '', S.ataque[0].gp + ' gols', S.ataque[0].p.id, true) + hl('Melhor defesa', S.defesa[0].p.name, '', S.defesa[0].gc + ' sofridos', S.defesa[0].p.id, true);
  $('highlights').innerHTML = h || empty('Disponível após o primeiro resultado.');
}

function renderGames() {
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('selected', b.dataset.f === filter));
  const ms = D.matches.filter(m => ['all','done','next'].includes(filter) ? (filter === 'all' || (filter === 'done' ? m.played : !m.played)) : (m.category || 'official') === filter);
  const official = ms.filter(m => m.category !== 'friendly' && m.round);
  const friendlies = ms.filter(m => m.category === 'friendly');
  const rs = [...new Map(official.map(m => [m.round.id, m.round])).values()].sort((a,b) => filter === 'next' ? a.number-b.number : b.number-a.number);
  const officialHtml = rs.map(r => {
    const list = official.filter(m => m.round_id === r.id).sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.seq||0)-(b.seq||0));
    if (!list.length) return '';
    return heading(`${esc(roundLabel(r).toUpperCase())}${r.date ? ' • ' + fd(r.date) : ''}`) + list.map(matchRow).join('');
  }).join('');
  const friendlyHtml = friendlies.length ? heading('PARTIDAS AMISTOSAS') + friendlies.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(matchRow).join('') : '';
  $('gamesList').innerHTML = officialHtml + friendlyHtml || empty('Nenhuma partida encontrada.');
}
function renderTable() {
  const t = typeOf(); let html = '', title = 'TABELA GERAL', pill = '';
  const currentName = SET.name || 'Competição atual';
  $('tableCompetition').innerHTML = `<option value="current">${esc(currentName)}</option>`;
  if (t === 'liga') { const ms = leagueMatches(D); html = fullTbl(standings(D.participants, ms)); pill = ms.filter(m => m.played).length + ' PARTIDAS DISPUTADAS'; }
  else {
    if (t === 'copa') { title = 'GRUPOS E MATA-MATA'; const g = groupTables(D); html = g.length ? g.map(x => heading('GRUPO ' + esc(x.name)) + fullTbl(x.st)).join('') : empty('Fase de grupos ainda não gerada.'); }
    else title = 'CHAVEAMENTO';
    const k = koHTML(); html += k ? (t === 'copa' ? heading('<span style="font-size:12px">MATA-MATA</span>') : '') + k : (t === 'mata' ? empty('Chaveamento ainda não gerado.') : '');
    pill = (PRESETS[SET.format] || {}).label || '';
  }
  $('tblTitle').textContent = title; $('tblPill').textContent = pill.toUpperCase(); $('fullTable').innerHTML = html;
}

function renderStats() {
  const S = stats(D), b = S.big;
  const bigTxt = b ? `<a href="#team/${b.home_id}">${esc(b.home.name)}</a> ${b.home_score} x ${b.away_score} <a href="#team/${b.away_id}">${esc(b.away.name)}</a>` : '—';
  $('statsGrid').innerHTML =
    `<div class="card"><div class="cardhead"><h2>INDICADORES GERAIS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Gols/jogo</span></div></div><div class="player" style="margin-top:8px"><div><b>Maior goleada</b><small>${bigTxt}</small></div></div></div></div>` +
    plCard('ARTILHARIA', S.artilheiros, x => x.g, 'gols') + plCard('ASSISTÊNCIAS', S.garcons, x => x.a, 'assist.') + plCard('PARTICIPAÇÕES EM GOLS (G+A)', S.part, x => x.ga, '') +
    rankCard('MELHOR ATAQUE (GOLS/JOGO)', S.ataque.slice().sort((a, c) => c.gp / c.j - a.gp / a.j), x => fmt1(x.gp / x.j)) +
    rankCard('MELHOR DEFESA (MENOS SOFRIDOS)', S.defesa, x => x.gc) + rankCard('GOLS MARCADOS', S.ataque, x => x.gp) +
    rankCard('APROVEITAMENTO', S.aprov, x => x.ap, '%') + rankCard('VITÓRIAS', S.vit, x => x.v) + rankCard('EMPATES', S.emp, x => x.e) + rankCard('DERROTAS', S.der, x => x.d) +
    rankCard('SALDO DE GOLS', S.st.filter(x => x.j).sort((a, c) => c.sg - a.sg), x => sgf(x.sg));
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
  const rivalCard = (label,x,mode) => `<div class="card"><div class="cardhead"><h2>${label}</h2></div><div class="cardbody">${x?`<div class="player"><div><b><a href="#team/${x.p.id}">${esc(x.p.name)}</a></b><small>${mode==='best'?'Maior saldo de vitórias do participante':'Maior saldo de derrotas do participante'}</small></div><span class="number"><b class="res-w">${x.v}</b> - <b class="res-l">${x.d}</b></span></div>`:empty('Ainda não há saldo positivo/negativo contra um adversário.')}</div></div>`;
  root.innerHTML = `<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL</div><h1>${esc(p.name)}</h1><div class="sub">Técnico responsável: ${coachLink(p.coach_name)}</div></div></div>
  <div class="inline" style="margin-bottom:8px"><button class="btn ${profileMode==='current'?'primary':''}" data-pmode="current">Temporada atual</button><button class="btn ${profileMode==='history'?'primary':''}" data-pmode="history">Histórico completo</button></div><p class="admin-help" style="margin-bottom:12px">Como o portal ainda não possui temporadas arquivadas separadamente, as duas opções exibem todas as partidas atualmente cadastradas.</p>
  <div class="cols3 profile-stats"><div class="card"><div class="cardhead"><h2>PARTIDAS</h2></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${ms.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${wins}</b><span>Vitórias</span></div><div class="stat"><b>${draws}</b><span>Empates</span></div><div class="stat"><b class="res-l">${losses}</b><span>Derrotas</span></div></div></div></div><div class="card"><div class="cardhead"><h2>GOLS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${goals}</b><span>Marcados</span></div><div class="stat"><b>${conceded}</b><span>Sofridos</span></div><div class="stat"><b>${ms.length ? (goals/ms.length).toFixed(1).replace('.',',') : '0,0'}</b><span>Média</span></div></div></div></div>${rivalCard('MAIOR FREGUÊS',best,'best')}${rivalCard('MAIOR CARRASCO',worst,'worst')}</div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE PARTIDAS</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${rows.length ? rows.map(m=>`<div class="result-row"><div class="round-label ${m.category==='friendly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${esc(m.home.name)}</a> x <a href="#team/${m.away_id}">${esc(m.away.name)}</a><small>${m.category==='friendly' ? '' : esc(SET.name)}${m.date ? (m.category==='friendly' ? '' : ' • ') + fd(m.date) : ''} • ${coachLink(m.home_coach_name || m.home.coach_name)} / ${coachLink(m.away_coach_name || m.away.coach_name)}</small></div><div class="result-score">${m.home_score} – ${m.away_score}</div></div>`).join('') : empty('Nenhuma partida disputada.')}</div></div>
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
  const history=(D.coachHistory||[]).filter(h=>h.participant_id===id).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
  const career=history.length?history.map(h=>`<div class="player"><div><b>${coachLink(h.coach_name)}</b><small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small></div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`).join(''):empty(p.coach_name?'Histórico anterior à implantação ainda não está detalhado.':'Nenhum técnico registrado.');
  root.innerHTML=`<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL DO TIME</div><h1>${esc(p.name)}</h1><div class="sub">Técnico atual: ${coachLink(p.coach_name)}</div></div></div>
  <div class="card"><div class="cardhead"><h2>DESEMPENHO DO TIME</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${statsSquares(ms,m=>m.home_id===id?'home':'away')}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE TÉCNICOS</h2></div><div class="cardbody">${career}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>HISTÓRICO DE PARTIDAS</h2><span class="pill">${ms.length} JOGOS</span></div><div class="cardbody">${ms.length?ms.map(m=>`<div class="result-row"><div class="round-label ${m.category==='friendly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${esc(m.home.name)}</a> x <a href="#team/${m.away_id}">${esc(m.away.name)}</a><small>${m.category==='friendly'?'':esc(SET.name)+' • '}${fd(m.date)} • ${coachLink(m.home_coach_name||m.home.coach_name)} / ${coachLink(m.away_coach_name||m.away.coach_name)}</small></div><div class="result-score">${m.home_score} – ${m.away_score}</div></div>`).join(''):empty('Nenhuma partida disputada.')}</div></div>`;
}
function renderCoach(name) {
  const root=$('coachView'), key=String(name||'').trim().toLocaleLowerCase();
  const assignments=(D.coachHistory||[]).filter(h=>String(h.coach_name||'').trim().toLocaleLowerCase()===key).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
  const teams=assignments.map(h=>D.participants.find(p=>p.id===h.participant_id)).filter(Boolean);
  const matches=D.matches.filter(m=>m.played && [m.home_coach_name,m.away_coach_name].some(n=>String(n||'').trim().toLocaleLowerCase()===key)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  let v=0,e=0,d=0;
  matches.forEach(m=>{const home=String(m.home_coach_name||'').trim().toLocaleLowerCase()===key;const own=home?m.home_score:m.away_score,opp=home?m.away_score:m.home_score;if(own>opp)v++;else if(own<opp)d++;else e++;});
  const career=assignments.length?assignments.map(h=>{const t=D.participants.find(p=>p.id===h.participant_id);return `<div class="player"><div><b>${t?`<a href="#team/${t.id}">${esc(t.name)}</a>`:'Time removido'}</b><small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small></div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`;}).join(''):empty('Nenhum vínculo histórico cadastrado para este técnico.');
  root.innerHTML=`<div class="page-title"><div><div class="eyebrow"><a href="#table">CLASSIFICAÇÃO</a> / PERFIL DO TÉCNICO</div><h1>${esc(name)}</h1><div class="sub">Trajetória e desempenho na carreira</div></div></div>
  <div class="card"><div class="cardhead"><h2>ESTATÍSTICAS DA CARREIRA</h2><span class="pill">${matches.length} JOGOS</span></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${matches.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${v}</b><span>Vitórias</span></div><div class="stat"><b>${e}</b><span>Empates</span></div><div class="stat"><b class="res-l">${d}</b><span>Derrotas</span></div></div></div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>TIMES COMANDADOS</h2></div><div class="cardbody">${career}</div></div>
  <div class="card" style="margin-top:16px"><div class="cardhead"><h2>PARTIDAS NA CARREIRA</h2></div><div class="cardbody">${matches.length?matches.map(m=>`<div class="result-row"><div class="round-label ${m.category==='friendly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':'OFIC'}</div><div class="result-teams"><a href="#team/${m.home_id}">${esc(m.home.name)}</a> x <a href="#team/${m.away_id}">${esc(m.away.name)}</a><small>${fd(m.date)} • ${coachLink(m.home_coach_name)} / ${coachLink(m.away_coach_name)}</small></div><div class="result-score">${m.home_score} – ${m.away_score}</div></div>`).join(''):empty('As estatísticas serão formadas a partir das partidas com o técnico registrado no momento do jogo.')}</div></div>`;
}

function renderAll() { renderHome(); renderGames(); renderTable(); renderStats(); const raw=location.hash.slice(1), parts=raw.split('/'); if(parts[1]){const value=decodeURIComponent(parts.slice(1).join('/'));if(parts[0]==='participant')renderParticipant(value);if(parts[0]==='team')renderTeam(value);if(parts[0]==='coach')renderCoach(value);} $('season').textContent = 'TEMPORADA ' + SET.season; }
async function boot() {
  route();
  try {
    if (CBPES.url.startsWith('COLE')) throw new Error('config.js ainda não foi preenchido.');
    D = await load(); $('status').classList.add('hidden'); renderAll();
  } catch (e) { $('status').textContent = 'Não foi possível carregar os dados: ' + (e.message || e); }
}
boot();
setInterval(async () => { if (D && !document.hidden) { try { D = await load(); renderAll(); } catch (e) {} } }, 60000);
