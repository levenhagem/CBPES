let D = null, filter = 'all';
const $ = id => document.getElementById(id);
const PAGES = ['home', 'games', 'table', 'stats'];
const empty = t => `<div class="empty">${t}</div>`;

function route() {
  const id = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  window.scrollTo(0, 0);
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => location.hash = b.dataset.page);
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.hash = b.dataset.go);
window.addEventListener('hashchange', route);
$('filters').onclick = e => { if (e.target.dataset.f) { filter = e.target.dataset.f; renderGames(); } };

const miniTable = st => `<table class="table"><thead><tr><th>PARTICIPANTE</th><th>PTS</th><th>J</th><th>SG</th></tr></thead><tbody>${st.map((x, i) => `<tr><td><span class="pos">${i + 1}</span><span class="club">${esc(x.p.name)}</span></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${sgf(x.sg)}</td></tr>`).join('')}</tbody></table>`;
const fullTbl = st => st.length ? `<table class="table"><thead><tr><th>POS.</th><th>PARTICIPANTE</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th></tr></thead><tbody>${st.map((x, i) => `<tr><td>${i + 1}</td><td class="club">${esc(x.p.name)}</td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td></tr>`).join('')}</tbody></table>` : empty('Sem participantes nesta tabela.');
const heading = t => `<div class="eyebrow" style="margin:12px 0 4px">${t}</div>`;

function tieRows(ties) {
  if (!ties.length) return empty('Aguardando definição do mata-mata.');
  return ties.map(t => {
    const w = x => t.winner && t.winner.id === x.id ? `<b>${esc(x.name)}</b>` : esc(x.name);
    const legs = t.legs.map(l => `${esc(l.home.name)} ${l.played ? l.home_score + ' x ' + l.away_score : 'a jogar'}${l.home_pen !== null ? ' (' + l.home_pen + '–' + l.away_pen + ' pên.)' : ''}`).join(' • ');
    const agg = t.legs.some(l => l.played) ? `${t.A} – ${t.B}` : '– : –';
    return `<div class="result-row"><div class="round-label">${t.done ? 'ENC.' : 'ABERTO'}</div><div class="result-teams">${w(t.a)} x ${w(t.b)}<small>${legs}</small></div><div class="result-score">${agg}</div></div>`;
  }).join('');
}
const koHTML = () => koRounds(D).map(r => heading(esc(roundLabel(r).toUpperCase())) + tieRows(tiesOf(D.matches.filter(m => m.round_id === r.id)))).join('');
const plCard = (title, rows, f, unit) => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b>${i + 1}. ${esc(x.name)}</b><small>${esc(x.team.name)}</small></div><span class="number">${f(x)} ${unit}</span></div>`).join('') : empty('Nenhum registro ainda.')}</div></div>`;
const rankCard = (title, rows, f, unit = '') => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 8).map((x, i) => `<div class="player"><div><b>${i + 1}. ${esc(x.p.name)}</b></div><span class="number">${f(x)}${unit}</span></div>`).join('') : empty('Sem dados ainda.')}</div></div>`;

function renderHome() {
  const { participants, rounds, matches } = D, played = latestPlayed(matches), nx = nextMatches(matches), S = stats(D), t = typeOf();
  $('hSeason').textContent = (SET.name + ' • TEMPORADA ' + SET.season).toUpperCase();
  const ch = champion(D);
  $('champ').innerHTML = ch ? `<div class="champ">Campeão • ${esc(ch.name)}</div>` : '';
  const cr = currentRound(rounds, matches);
  $('hRound').textContent = cr ? roundLabel(cr).toUpperCase() : 'SEM RODADAS';

  const sc = m => `<a class="sc" href="#games"><div class="sc-meta">${esc(roundLabel(m.round))} • ${m.date ? fd(m.date).slice(0, 5) : 'a definir'}</div><div class="sc-row ${m.played && m.home_score > m.away_score ? 'w' : m.played ? 'l' : ''}"><span>${esc(m.home.name)}</span><b>${m.played ? m.home_score : ''}</b></div><div class="sc-row ${m.played && m.away_score > m.home_score ? 'w' : m.played ? 'l' : ''}"><span>${esc(m.away.name)}</span><b>${m.played ? m.away_score : ''}</b></div></a>`;
  const sl = played.slice(0, 6).reverse().concat(nx.slice(0, 6));
  $('strip').innerHTML = sl.length ? sl.map(sc).join('') + '<a class="sc-end" href="#games">TODOS OS JOGOS →</a>' : '<div class="sc-end" style="padding:14px 16px">Nenhuma partida cadastrada.</div>';
  const m = played[0];
  $('latest').innerHTML = m ? `<div class="latest-match"><div class="latest-top"><b>Última partida</b><span>${esc(roundLabel(m.round).toUpperCase())}</span></div><div class="latest-main"><div class="latest-team"><span class="crest">${crest(m.home.name)}</span><div>${esc(m.home.name)}</div></div><div class="latest-score"><span>${m.home_score} : ${m.away_score}</span><small>${m.home_pen !== null ? 'PÊNALTIS ' + m.home_pen + '–' + m.away_pen : 'PARTIDA ENCERRADA'}</small></div><div class="latest-team"><span class="crest">${crest(m.away.name)}</span><div>${esc(m.away.name)}</div></div></div><div class="latest-foot"><span>${fd(m.date)}</span><span>${esc(SET.name)} • ${esc(SET.season)}</span></div></div>` : `<div class="card"><div class="cardbody">${empty('Nenhuma partida realizada ainda.')}</div></div>`;
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
  const hl = (tt, who, sub, v) => `<div class="player"><div><b>${tt}</b><small>${esc(who)}${sub ? ' • ' + esc(sub) : ''}</small></div><span class="number">${v}</span></div>`;
  let h = '';
  if (S.artilheiros[0]) h += hl('Artilheiro', S.artilheiros[0].name, S.artilheiros[0].team.name, S.artilheiros[0].g + ' gols');
  if (S.garcons[0]) h += hl('Líder em assistências', S.garcons[0].name, S.garcons[0].team.name, S.garcons[0].a);
  if (S.jogos) h += hl('Melhor ataque', S.ataque[0].p.name, '', S.ataque[0].gp + ' gols') + hl('Melhor defesa', S.defesa[0].p.name, '', S.defesa[0].gc + ' sofridos');
  $('highlights').innerHTML = h || empty('Disponível após o primeiro resultado.');
}

function renderGames() {
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('selected', b.dataset.f === filter));
  const ms = D.matches.filter(m => filter === 'all' || (filter === 'done' ? m.played : !m.played));
  const rs = D.rounds.slice().sort((a, b) => filter === 'next' ? a.number - b.number : b.number - a.number);
  const html = rs.map(r => {
    const list = ms.filter(m => m.round_id === r.id).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.seq - b.seq);
    if (!list.length) return '';
    const done = D.matches.filter(m => m.round_id === r.id).every(m => m.played);
    return heading(`${esc(roundLabel(r).toUpperCase())} • ${done ? 'ENCERRADA' : 'EM ANDAMENTO / PRÓXIMA'}${r.date ? ' • ' + fd(r.date) : ''}`) + list.map(m => {
      const tag = [m.group_name ? 'Grupo ' + esc(m.group_name) : '', m.round.stage === 'mata' && m.leg === 2 ? 'Jogo de volta' : '', m.played ? 'Encerrada' : 'Agendada', m.date ? fd(m.date) : 'data a definir'].filter(Boolean).join(' • ');
      const sc = m.played ? `${m.home_score} – ${m.away_score}${m.home_pen !== null ? ` <small>(${m.home_pen}–${m.away_pen})</small>` : ''}` : '– : –';
      return `<div class="result-row"><div class="round-label">${pad(r.number)}</div><div class="result-teams">${esc(m.home.name)} x ${esc(m.away.name)}<small>${tag}</small></div><div class="result-score">${sc}</div></div>`;
    }).join('');
  }).join('');
  $('gamesList').innerHTML = html || empty('Nenhuma partida encontrada.');
}

function renderTable() {
  const t = typeOf(); let html = '', title = 'TABELA GERAL', pill = '';
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
  const bigTxt = b ? `${esc(b.home.name)} ${b.home_score} x ${b.away_score} ${esc(b.away.name)}` : '—';
  $('statsGrid').innerHTML =
    `<div class="card"><div class="cardhead"><h2>INDICADORES GERAIS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Gols/jogo</span></div></div><div class="player" style="margin-top:8px"><div><b>Maior goleada</b><small>${bigTxt}</small></div></div></div></div>` +
    plCard('ARTILHARIA', S.artilheiros, x => x.g, 'gols') + plCard('ASSISTÊNCIAS', S.garcons, x => x.a, 'assist.') + plCard('PARTICIPAÇÕES EM GOLS (G+A)', S.part, x => x.ga, '') +
    rankCard('MELHOR ATAQUE (GOLS/JOGO)', S.ataque.slice().sort((a, c) => c.gp / c.j - a.gp / a.j), x => fmt1(x.gp / x.j)) +
    rankCard('MELHOR DEFESA (MENOS SOFRIDOS)', S.defesa, x => x.gc) + rankCard('GOLS MARCADOS', S.ataque, x => x.gp) +
    rankCard('APROVEITAMENTO', S.aprov, x => x.ap, '%') + rankCard('VITÓRIAS', S.vit, x => x.v) + rankCard('EMPATES', S.emp, x => x.e) + rankCard('DERROTAS', S.der, x => x.d) +
    rankCard('SALDO DE GOLS', S.st.filter(x => x.j).sort((a, c) => c.sg - a.sg), x => sgf(x.sg));
}

function renderAll() { renderHome(); renderGames(); renderTable(); renderStats(); $('season').textContent = 'TEMPORADA ' + SET.season; }
async function boot() {
  route();
  try {
    if (CBPES.url.startsWith('COLE')) throw new Error('config.js ainda não foi preenchido.');
    D = await load(); $('status').classList.add('hidden'); renderAll();
  } catch (e) { $('status').textContent = 'Não foi possível carregar os dados: ' + (e.message || e); }
}
boot();
setInterval(async () => { if (D && !document.hidden) { try { D = await load(); renderAll(); } catch (e) {} } }, 60000);
