let D = null, filter = 'all';
const $ = id => document.getElementById(id);
const PAGES = ['home', 'games', 'table', 'stats'];
const participantIdFromHash = () => { const m = location.hash.match(/^#participant\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
const empty = t => `<div class="empty">${t}</div>`;

function route() {
  const participantId = participantIdFromHash();
  const id = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : (participantId ? 'participantPage' : 'home');
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === id));
  if (participantId && D) renderParticipant(participantId);
  window.scrollTo(0, 0);
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => location.hash = b.dataset.page);
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.hash = b.dataset.go);
window.addEventListener('hashchange', route);
$('filters').onclick = e => { if (e.target.dataset.f) { filter = e.target.dataset.f; renderGames(); } };
$('strip').onclick = e => { if (e.target.closest('a')) return; if (e.target.closest('.sc')) location.hash = '#games'; };

const miniTable = st => `<table class="table"><thead><tr><th>PARTICIPANTE</th><th>PTS</th><th>J</th><th>SG</th></tr></thead><tbody>${st.map((x, i) => `<tr><td><span class="pos">${i + 1}</span><span class="club">${participantLink(x.p)}</span></td><td class="points">${x.pts}</td><td>${x.j}</td><td>${sgf(x.sg)}</td></tr>`).join('')}</tbody></table>`;
const fullTbl = st => st.length ? `<table class="table"><thead><tr><th>POS.</th><th>PARTICIPANTE</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th></tr></thead><tbody>${st.map((x, i) => `<tr><td>${i + 1}</td><td class="club">${participantLink(x.p)}</td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td></tr>`).join('')}</tbody></table>` : empty('Sem participantes nesta tabela.');
const heading = t => `<div class="eyebrow" style="margin:12px 0 4px">${t}</div>`;

function tieRows(ties) {
  if (!ties.length) return empty('Aguardando definição do mata-mata.');
  return ties.map(t => {
    const w = x => t.winner && t.winner.id === x.id ? `<b>${participantLink(x)}</b>` : participantLink(x);
    const legs = t.legs.map(l => `${participantLink(l.home)} ${l.played ? l.home_score + ' x ' + l.away_score : 'a jogar'} ${participantLink(l.away)}${l.home_pen !== null ? ' (' + l.home_pen + '–' + l.away_pen + ' pên.)' : ''}`).join(' • ');
    const agg = t.legs.some(l => l.played) ? `${t.A} – ${t.B}` : '– : –';
    return `<div class="result-row"><div class="round-label">${t.done ? 'ENC.' : 'ABERTO'}</div><div class="result-teams">${w(t.a)} x ${w(t.b)}<small>${legs}</small></div><div class="result-score">${agg}</div></div>`;
  }).join('');
}
const koHTML = () => koRounds(D).map(r => heading(esc(roundLabel(r).toUpperCase())) + tieRows(tiesOf(D.matches.filter(m => m.round_id === r.id)))).join('');
const plCard = (title, rows, f, unit) => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b>${i + 1}. ${esc(x.name)}</b><small>${participantLink(x.team)}</small></div><span class="number">${f(x)} ${unit}</span></div>`).join('') : empty('Nenhum registro ainda.')}</div></div>`;
const rankCard = (title, rows, f, unit = '') => `<div class="card"><div class="cardhead"><h2>${title}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 8).map((x, i) => `<div class="player"><div><b>${i + 1}. ${participantLink(x.p)}</b></div><span class="number">${f(x)}${unit}</span></div>`).join('') : empty('Sem dados ainda.')}</div></div>`;

function renderHome() {
  const { participants, rounds, matches } = D, played = latestPlayed(matches), nx = nextMatches(matches), S = stats(D), t = typeOf();
  $('hSeason').textContent = (SET.name + ' • TEMPORADA ' + SET.season).toUpperCase();
  const ch = champion(D);
  $('champ').innerHTML = ch ? `<div class="champ">Campeão • ${participantLink(ch)}</div>` : '';
  const cr = currentRound(rounds, matches);
  $('hRound').textContent = cr ? roundLabel(cr).toUpperCase() : 'SEM RODADAS';

  const sc = m => `<div class="sc" role="link" tabindex="0"><div class="sc-meta">${esc(roundLabel(m.round))} • ${m.date ? fd(m.date).slice(0, 5) : 'a definir'}</div><div class="sc-row ${m.played && m.home_score > m.away_score ? 'w' : m.played ? 'l' : ''}"><span>${participantLink(m.home)}</span><b>${m.played ? m.home_score : ''}</b></div><div class="sc-row ${m.played && m.away_score > m.home_score ? 'w' : m.played ? 'l' : ''}"><span>${participantLink(m.away)}</span><b>${m.played ? m.away_score : ''}</b></div></div>`;
  const sl = played.slice(0, 6).reverse().concat(nx.slice(0, 6));
  $('strip').innerHTML = sl.length ? sl.map(sc).join('') + '<a class="sc-end" href="#games">TODOS OS JOGOS →</a>' : '<div class="sc-end" style="padding:14px 16px">Nenhuma partida cadastrada.</div>';
  const m = played[0];
  $('latest').innerHTML = m ? `<div class="latest-match"><div class="latest-top"><b>Última partida</b><span>${esc(roundLabel(m.round).toUpperCase())}</span></div><div class="latest-main"><div class="latest-team"><span class="crest">${crest(m.home.name)}</span><div>${participantLink(m.home)}</div></div><div class="latest-score"><span>${m.home_score} : ${m.away_score}</span><small>${m.home_pen !== null ? 'PÊNALTIS ' + m.home_pen + '–' + m.away_pen : 'PARTIDA ENCERRADA'}</small></div><div class="latest-team"><span class="crest">${crest(m.away.name)}</span><div>${participantLink(m.away)}</div></div></div><div class="latest-foot"><span>${fd(m.date)}</span><span>${esc(SET.name)} • ${esc(SET.season)}</span></div></div>` : `<div class="card"><div class="cardbody">${empty('Nenhuma partida realizada ainda.')}</div></div>`;
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
  const hl = (tt, who, team, v) => `<div class="player"><div><b>${tt}</b><small>${who ? esc(who) + (team ? ' • ' : '') : ''}${team ? participantLink(team) : ''}</small></div><span class="number">${v}</span></div>`;
  let h = '';
  if (S.artilheiros[0]) h += hl('Artilheiro', S.artilheiros[0].name, S.artilheiros[0].team, S.artilheiros[0].g + ' gols');
  if (S.garcons[0]) h += hl('Líder em assistências', S.garcons[0].name, S.garcons[0].team, S.garcons[0].a);
  if (S.jogos) h += hl('Melhor ataque', '', S.ataque[0].p, S.ataque[0].gp + ' gols') + hl('Melhor defesa', '', S.defesa[0].p, S.defesa[0].gc + ' sofridos');
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
      return `<div class="result-row"><div class="round-label">${pad(r.number)}</div><div class="result-teams">${participantLink(m.home)} x ${participantLink(m.away)}<small>${tag}</small></div><div class="result-score">${sc}</div></div>`;
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
  const bigTxt = b ? `${participantLink(b.home)} ${b.home_score} x ${b.away_score} ${participantLink(b.away)}` : '—';
  $('statsGrid').innerHTML =
    `<div class="card"><div class="cardhead"><h2>INDICADORES GERAIS</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Gols/jogo</span></div></div><div class="player" style="margin-top:8px"><div><b>Maior goleada</b><small>${bigTxt}</small></div></div></div></div>` +
    plCard('ARTILHARIA', S.artilheiros, x => x.g, 'gols') + plCard('ASSISTÊNCIAS', S.garcons, x => x.a, 'assist.') + plCard('PARTICIPAÇÕES EM GOLS (G+A)', S.part, x => x.ga, '') +
    rankCard('MELHOR ATAQUE (GOLS/JOGO)', S.ataque.slice().sort((a, c) => c.gp / c.j - a.gp / a.j), x => fmt1(x.gp / x.j)) +
    rankCard('MELHOR DEFESA (MENOS SOFRIDOS)', S.defesa, x => x.gc) + rankCard('GOLS MARCADOS', S.ataque, x => x.gp) +
    rankCard('APROVEITAMENTO', S.aprov, x => x.ap, '%') + rankCard('VITÓRIAS', S.vit, x => x.v) + rankCard('EMPATES', S.emp, x => x.e) + rankCard('DERROTAS', S.der, x => x.d) +
    rankCard('SALDO DE GOLS', S.st.filter(x => x.j).sort((a, c) => c.sg - a.sg), x => sgf(x.sg));
}

function participantRecord(participant, matches) {
  const played = matches.filter(m => m.played && (m.home_id === participant.id || m.away_id === participant.id));
  const record = { j: played.length, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
  played.forEach(m => {
    const home = m.home_id === participant.id;
    const gf = home ? m.home_score : m.away_score;
    const ga = home ? m.away_score : m.home_score;
    record.gp += gf; record.gc += ga;
    if (gf > ga) record.v++;
    else if (gf < ga) record.d++;
    else record.e++;
  });
  record.sg = record.gp - record.gc;
  return record;
}

function comparisonRecord(a, b, matches) {
  const direct = matches.filter(m => m.played && ((m.home_id === a.id && m.away_id === b.id) || (m.home_id === b.id && m.away_id === a.id)));
  const result = { j: direct.length, a: { v: 0, e: 0, d: 0, gp: 0, gc: 0 }, b: { v: 0, e: 0, d: 0, gp: 0, gc: 0 } };
  direct.forEach(m => {
    const ag = m.home_id === a.id ? m.home_score : m.away_score;
    const bg = m.home_id === b.id ? m.home_score : m.away_score;
    result.a.gp += ag; result.a.gc += bg;
    result.b.gp += bg; result.b.gc += ag;
    if (ag > bg) { result.a.v++; result.b.d++; }
    else if (bg > ag) { result.b.v++; result.a.d++; }
    else { result.a.e++; result.b.e++; }
  });
  result.a.sg = result.a.gp - result.a.gc;
  result.b.sg = result.b.gp - result.b.gc;
  return { ...result, matches: direct.slice().sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.round.number - x.round.number || y.seq - x.seq) };
}

function participantMatchRow(m, participant) {
  const isHome = m.home_id === participant.id;
  const opponent = isHome ? m.away : m.home;
  const own = isHome ? m.home_score : m.away_score;
  const other = isHome ? m.away_score : m.home_score;
  let outcome = 'AGENDADA', cls = '';
  if (m.played) {
    outcome = own > other ? 'VITÓRIA' : own < other ? 'DERROTA' : 'EMPATE';
    cls = own > other ? 'res-w' : own < other ? 'res-l' : 'res-d';
  }
  const score = m.played ? `${m.home_score} – ${m.away_score}${m.home_pen !== null ? ` <small>(${m.home_pen}–${m.away_pen} pên.)</small>` : ''}` : '– : –';
  return `<div class="result-row participant-match"><div class="round-label">${pad(m.round.number)}</div><div class="result-teams">${participantLink(m.home)} x ${participantLink(m.away)}<small>${esc(roundLabel(m.round))} • ${m.date ? fd(m.date) : 'Data a definir'} • ${participantLink(opponent, 'opponent-link')}</small></div><div class="participant-match-right"><div class="result-score">${score}</div><small class="${cls}">${outcome}</small></div></div>`;
}

function renderComparison(a, b, scope) {
  const box = $('comparisonContent');
  if (!box) return;
  if (!b) { box.innerHTML = empty('Cadastre outro participante para comparar.'); return; }
  // O banco atual contém apenas a competição configurada em settings. Até existir arquivo de temporadas,
  // os dois modos usam todos os registros disponíveis; o aviso evita apresentar isso como histórico multitemporada.
  const comp = comparisonRecord(a, b, D.matches);
  const note = scope === 'history' ? '<div class="notice history-note">O histórico multitemporada ainda não está arquivado no banco. Por enquanto, este modo considera todos os confrontos atualmente registrados. A galeria histórica permitirá ampliar esse recorte para edições anteriores.</div>' : '';
  const metric = (label, left, right) => `<div class="compare-metric"><span>${label}</span><b>${left}</b><b>${right}</b></div>`;
  const games = comp.matches.length ? comp.matches.map(m => `<div class="result-row"><div class="round-label">${pad(m.round.number)}</div><div class="result-teams">${participantLink(m.home)} x ${participantLink(m.away)}<small>${esc(roundLabel(m.round))} • ${m.date ? fd(m.date) : 'Data a definir'}</small></div><div class="result-score">${m.home_score} – ${m.away_score}${m.home_pen !== null ? `<small> (${m.home_pen}–${m.away_pen} pên.)</small>` : ''}</div></div>`).join('') : empty('Ainda não existem confrontos disputados entre esses participantes.');
  box.innerHTML = note + `<div class="compare-summary"><div class="compare-side"><b>${participantLink(a)}</b><strong>${comp.a.v}</strong><small>Vitórias</small></div><div class="compare-total"><strong>${comp.j}</strong><small>CONFRONTOS</small></div><div class="compare-side"><b>${participantLink(b)}</b><strong>${comp.b.v}</strong><small>Vitórias</small></div></div><div class="compare-grid"><div class="compare-head"><span>INDICADOR</span><b>${participantLink(a)}</b><b>${participantLink(b)}</b></div>${metric('Vitórias', comp.a.v, comp.b.v)}${metric('Empates', comp.a.e, comp.b.e)}${metric('Derrotas', comp.a.d, comp.b.d)}${metric('Gols marcados', comp.a.gp, comp.b.gp)}${metric('Gols sofridos', comp.a.gc, comp.b.gc)}${metric('Saldo de gols', sgf(comp.a.sg), sgf(comp.b.sg))}</div><div class="card compare-games"><div class="cardhead"><h2>CONFRONTOS DISPUTADOS</h2></div><div class="cardbody">${games}</div></div>`;
}

function renderParticipant(id) {
  const previousCompare = $('compareWith')?.value || '';
  const previousScope = $('compareScope')?.value || 'current';
  const p = D.participants.find(x => x.id === id);
  const root = $('participantContent');
  if (!p) { root.innerHTML = `<div class="page-title"><div><div class="eyebrow">Participante</div><h1>Não encontrado</h1><div class="sub">Este participante não está cadastrado na competição atual.</div></div></div><a class="btn" href="#table">VOLTAR À TABELA</a>`; return; }
  const matches = D.matches.filter(m => m.home_id === p.id || m.away_id === p.id).sort((a, b) => {
    if (a.played !== b.played) return a.played ? -1 : 1;
    return a.played ? (b.date || '').localeCompare(a.date || '') || b.round.number - a.round.number || b.seq - a.seq : a.round.number - b.round.number || (a.date || '9').localeCompare(b.date || '9') || a.seq - b.seq;
  });
  const r = participantRecord(p, D.matches);
  const options = D.participants.filter(x => x.id !== p.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  root.innerHTML = `<div class="page-title"><div><div class="eyebrow">Perfil do participante</div><h1>${esc(p.name)}</h1><div class="sub">Desempenho e histórico de partidas na CBPES.</div></div><a class="btn" href="#table">← TABELA</a></div><div class="participant-hero"><div class="participant-crest">${crest(p.name)}</div><div class="participant-hero-main"><div class="eyebrow">PARTICIPANTE</div><h2>${esc(p.name)}</h2><span>${esc(SET.name)} • Temporada ${esc(SET.season)}</span></div></div><div class="participant-stats"><div class="stat"><b>${r.j}</b><span>Jogos</span></div><div class="stat"><b>${r.v}</b><span>Vitórias</span></div><div class="stat"><b>${r.e}</b><span>Empates</span></div><div class="stat"><b>${r.d}</b><span>Derrotas</span></div><div class="stat"><b>${r.gp}</b><span>Gols pró</span></div><div class="stat"><b>${sgf(r.sg)}</b><span>Saldo</span></div></div><div class="cols participant-columns"><div class="card"><div class="cardhead"><h2>PARTIDAS DO PARTICIPANTE</h2><span class="pill">${matches.length} JOGOS</span></div><div class="cardbody">${matches.length ? matches.map(m => participantMatchRow(m, p)).join('') : empty('Nenhuma partida cadastrada para este participante.')}</div></div><div class="stack"><div class="card"><div class="cardhead"><h2>DESEMPENHO</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${r.gp}</b><span>Gols pró</span></div><div class="stat"><b>${r.gc}</b><span>Gols contra</span></div><div class="stat"><b>${r.j ? Math.round(r.v / r.j * 100) : 0}%</b><span>Vitórias</span></div></div><div class="player"><b>Saldo de gols</b><span class="number">${sgf(r.sg)}</span></div></div></div><div class="card"><div class="cardhead"><h2>COMPARAR CONFRONTOS</h2></div><div class="cardbody"><div class="field"><label for="compareWith">Comparar com participante</label><select id="compareWith" ${options ? '' : 'disabled'}><option value="">Selecione um participante</option>${options}</select></div><div class="field compare-scope"><label for="compareScope">Período do retrospecto</label><select id="compareScope"><option value="current">Temporada atual</option><option value="history">Histórico completo</option></select></div><div id="comparisonContent" class="comparison-content">${empty('Escolha outro participante para visualizar o retrospecto.')}</div></div></div></div></div>`;
  if (previousCompare && D.participants.some(x => x.id === previousCompare && x.id !== p.id)) $('compareWith').value = previousCompare;
  $('compareScope').value = previousScope;
  $('compareWith').addEventListener('change', e => renderComparison(p, D.participants.find(x => x.id === e.target.value), $('compareScope').value));
  $('compareScope').addEventListener('change', () => renderComparison(p, D.participants.find(x => x.id === $('compareWith').value), $('compareScope').value));
  if ($('compareWith').value) renderComparison(p, D.participants.find(x => x.id === $('compareWith').value), $('compareScope').value);
}

function renderAll() { renderHome(); renderGames(); renderTable(); renderStats(); $('season').textContent = 'TEMPORADA ' + SET.season; route(); }
async function boot() {
  route();
  try {
    if (CBPES.url.startsWith('COLE')) throw new Error('config.js ainda não foi preenchido.');
    D = await load(); $('status').classList.add('hidden'); renderAll();
  } catch (e) { $('status').textContent = 'Não foi possível carregar os dados: ' + (e.message || e); }
}
boot();
setInterval(async () => { if (D && !document.hidden) { try { D = await load(); renderAll(); } catch (e) {} } }, 60000);
