const $ = id => document.getElementById(id);
let D, tab = 'camp', selRound = null, openPart = null, openGoals = null, draft = null;
const today = () => new Date().toISOString().slice(0, 10);

function say(t, ok) { const m = $('msg'); m.textContent = t || ''; m.className = 'msg ' + (ok ? 'ok' : 'err'); if (t && ok) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 3500); }
const run = async (q, okMsg) => { const { error } = await q; if (error) { say(traduz(error), false); return false; } say(okMsg, true); await refresh(); return true; };
function traduz(e) {
  if (e.code === '23505') return 'Registro duplicado (já existe).';
  if (e.code === '23503') return 'Não é possível excluir: há partidas, jogadores ou gols ligados a este item. Remova-os antes.';
  if (e.code === '42501' || /row-level security/i.test(e.message)) return 'Sem permissão para esta operação.';
  if (e.code === '23514') return 'Dados inválidos (confira participantes e placar).';
  if (e.code === '42P01' || /does not exist|schema cache/i.test(e.message)) return 'Banco desatualizado: rode o arquivo atualizacao_v2.sql no Supabase.';
  return e.message;
}

// ---------- Acesso ----------
async function enter(session) {
  const { data } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (!data) { await sb.auth.signOut(); $('login').classList.remove('hidden'); $('app').classList.add('hidden'); return say('Esta conta não tem permissão de administrador.', false); }
  $('login').classList.add('hidden'); $('app').classList.remove('hidden'); $('logout').classList.remove('hidden'); say('');
  await refresh();
}
$('loginBtn').onclick = async () => {
  const { data, error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('pass').value });
  if (error) return say('E-mail ou senha incorretos.', false);
  enter(data.session);
};
$('pass').onkeydown = e => { if (e.key === 'Enter') $('loginBtn').click(); };
$('logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };
$('tabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; draft = null; render(); } };

async function refresh() { try { D = await load(); } catch (e) { return say(traduz(e), false); } render(); }
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('view').onclick = null; $('view').onchange = null;
  ({ camp: vCamp, part: vPart, jog: vJog, rod: vRod, res: vRes, est: vEst, his: vHis })[tab]();
}
const pname = id => (D.participants.find(p => p.id === id) || {}).name || '?';
const plname = id => (D.players.find(p => p.id === id) || {}).name || '?';
const opts = (list, sel, label) => list.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
const field = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;

// ---------- Campeonato (formato + calendário) ----------
function capture() {
  if (!$('cn') || !draft) return;
  draft.name = $('cn').value.trim() || 'CBPES'; draft.season = $('cs').value.trim();
  draft.config.ptsW = +$('pw').value || 3; draft.config.ptsD = +$('pd').value;
  ['legs', 'koLegs', 'groups', 'qual', 'groupLegs'].forEach(k => { const e = $('o_' + k); if (e) draft.config[k] = +e.value; });
  if ($('o_finalSingle')) draft.config.finalSingle = $('o_finalSingle').checked;
}
function vCamp() {
  const S = D.settings;
  if (!draft) draft = { name: S.name, season: S.season, format: S.format, config: { ...cfgOf(S) } };
  const c = draft.config, t = PRESETS[draft.format].type;
  const sel = (id, v, list) => `<select id="o_${id}">${list.map(([k, l]) => `<option value="${k}" ${+v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const num = (id, v, mn, mx) => `<input id="o_${id}" type="number" min="${mn}" max="${mx}" value="${v}" style="width:90px">`;
  const fs = `<label style="align-self:center"><input type="checkbox" id="o_finalSingle" ${c.finalSingle ? 'checked' : ''}> Final em jogo único</label>`;
  const koL = field('MATA-MATA', sel('koLegs', c.koLegs, [[1, 'Jogo único'], [2, 'Ida e volta']]));
  const o = t === 'liga' ? field('TURNOS', sel('legs', c.legs, [[1, 'Turno único'], [2, 'Turno e returno']]))
    : t === 'mata' ? koL + fs
    : field('Nº DE GRUPOS', num('groups', c.groups, 2, 8)) + field('CLASSIFICAM POR GRUPO', num('qual', c.qual, 1, 8)) + field('JOGOS NO GRUPO', sel('groupLegs', c.groupLegs, [[1, 'Só ida'], [2, 'Ida e volta']])) + koL + fs;
  const saved = S.format === draft.format;
  const t0 = typeOf(S), P = (id, l, cls = '') => `<button class="btn ${cls}" id="${id}">${l}</button>`;
  $('view').innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>FORMATO E REGRAS</h2></div><div class="cardbody">
   <div class="inline" style="margin-bottom:12px">${field('NOME DO CAMPEONATO', `<input id="cn" value="${esc(draft.name)}" maxlength="60">`)}${field('TEMPORADA', `<input id="cs" value="${esc(draft.season)}" style="width:90px" maxlength="12">`)}${field('PTS VITÓRIA', `<input id="pw" type="number" min="1" max="9" value="${c.ptsW}" style="width:70px">`)}${field('PTS EMPATE', `<input id="pd" type="number" min="0" max="9" value="${c.ptsD}" style="width:70px">`)}</div>
   ${Object.entries(PRESETS).map(([k, p]) => `<label style="display:block;padding:8px 10px;border:1px solid ${k === draft.format ? 'var(--green)' : '#d9dfe2'};margin-bottom:6px;cursor:pointer"><input type="radio" name="fmt" value="${k}" ${k === draft.format ? 'checked' : ''}> <b>${p.label}</b><div class="admin-help">${p.desc}</div></label>`).join('')}
   <div class="inline" style="margin-top:10px">${o}</div>
   <div class="form-actions"><button class="btn primary" id="cSave">SALVAR CONFIGURAÇÃO</button></div></div></div>
  <div class="card"><div class="cardhead"><h2>CALENDÁRIO DE JOGOS</h2><span class="admin-help">${D.rounds.length} rodadas • ${D.matches.length} partidas • ${D.participants.length} participantes</span></div><div class="cardbody">
   ${saved ? '' : '<div class="msg err">Salve a configuração antes de gerar o calendário.</div>'}
   <label class="admin-help"><input type="checkbox" id="draw" checked> Sortear a ordem/grupos (desmarcado: ordem alfabética)</label>
   <div class="inline" style="margin-top:10px">
   ${t0 === 'liga' ? P('gLiga', 'GERAR CALENDÁRIO') : ''}
   ${t0 === 'mata' ? P('gKo1', 'GERAR 1ª FASE') + P('gAdv', 'AVANÇAR FASE') : ''}
   ${t0 === 'copa' ? P('gGrp', 'SORTEAR GRUPOS E GERAR JOGOS') + P('gKoG', 'GERAR MATA-MATA') + P('gAdv', 'AVANÇAR FASE') : ''}
   ${P('gDel', 'APAGAR CALENDÁRIO', 'danger')}</div>
   <p class="admin-help">Após gerar, ajuste datas na aba Rodadas e lance placares em Resultados. Mata-mata exige 2, 4, 8, 16 ou 32 times.</p></div></div>`;
  $('view').onchange = e => {
    if (e.target.name === 'fmt') { capture(); const keep = { ptsW: draft.config.ptsW, ptsD: draft.config.ptsD }; draft.format = e.target.value; draft.config = { ...keep, ...PRESETS[draft.format].cfg }; vCamp(); }
  };
  $('view').onclick = e => {
    const id = e.target.id;
    if (id === 'cSave') { capture(); const d = draft; draft = null; run(sb.from('settings').update({ name: d.name, season: d.season, format: d.format, config: d.config }).eq('id', 1), 'Configuração salva.'); }
    if (id === 'gLiga') genLiga(); if (id === 'gKo1') genKo1(); if (id === 'gGrp') genGroups(); if (id === 'gKoG') genKoFromGroups(); if (id === 'gAdv') advance();
    if (id === 'gDel' && confirm('Apagar TODAS as rodadas e partidas (e gols lançados)? Participantes e jogadores permanecem.')) run(sb.from('rounds').delete().not('id', 'is', null), 'Calendário apagado.');
  };
}

async function createRounds(specs) {
  const base = D.rounds.length ? Math.max(...D.rounds.map(r => r.number)) : 0;
  const r = await sb.from('rounds').insert(specs.map((s, i) => ({ number: base + 1 + i, stage: s.stage, name: s.name || null }))).select();
  if (r.error) return say(traduz(r.error), false);
  const id = Object.fromEntries(r.data.map(x => [x.number, x.id])), rows = [];
  specs.forEach((s, i) => s.matches.forEach(m => rows.push({ ...m, round_id: id[base + 1 + i] })));
  const m = await sb.from('matches').insert(rows);
  if (m.error) return say(traduz(m.error), false);
  say(`${specs.length} rodada(s) e ${rows.length} partida(s) criadas.`, true); await refresh();
}
const orderIds = () => (($('draw') || {}).checked ? shuffle(D.participants) : D.participants).map(p => p.id);
const needEmpty = () => D.rounds.length ? (say('Já existe calendário. Apague-o antes de gerar outro.', false), false) : true;

function genLiga() {
  if (!needEmpty()) return; const ids = orderIds(); if (ids.length < 2) return say('Cadastre ao menos 2 participantes.', false);
  const rr = roundRobin(ids), all = rr.slice(); if (cfgOf().legs == 2) rr.forEach(r => all.push(r.map(([h, a]) => [a, h])));
  createRounds(all.map(ms => ({ stage: 'liga', matches: ms.map(([h, a]) => ({ home_id: h, away_id: a })) })));
}
function genKo1() {
  if (!needEmpty()) return; const ids = orderIds();
  if (!isPow2(ids.length)) return say('O mata-mata exige 2, 4, 8, 16 ou 32 participantes (hoje: ' + ids.length + ').', false);
  createRounds([koSpec(ids, cfgOf())]);
}
function genGroups() {
  if (!needEmpty()) return; const c = cfgOf(), ids = orderIds(), g = c.groups;
  if (ids.length < g * 2) return say(`São necessários ao menos ${g * 2} participantes para ${g} grupos.`, false);
  const groups = Array.from({ length: g }, () => []); ids.forEach((x, i) => groups[i % g].push(x));
  const sched = groups.map((gr, gi) => { const rr = roundRobin(gr), all = rr.slice(); if (c.groupLegs == 2) rr.forEach(r => all.push(r.map(([h, a]) => [a, h]))); return all.map(ms => ms.map(([h, a]) => ({ home_id: h, away_id: a, group_name: String.fromCharCode(65 + gi) }))); });
  const n = Math.max(...sched.map(s => s.length)), specs = [];
  for (let k = 0; k < n; k++) specs.push({ stage: 'grupos', name: 'Fase de grupos — Rodada ' + (k + 1), matches: sched.flatMap(s => s[k] || []) });
  createRounds(specs);
}
function genKoFromGroups() {
  if (koRounds(D).length) return say('O mata-mata já foi gerado.', false);
  const c = cfgOf(), gt = groupTables(D); if (!gt.length) return say('Gere a fase de grupos primeiro.', false);
  const total = gt.length * c.qual; if (!isPow2(total)) return say(`Classificados (${total}) deve ser 2, 4, 8, 16 ou 32. Ajuste grupos/classificados.`, false);
  if (D.matches.some(m => m.round.stage === 'grupos' && !m.played) && !confirm('Ainda há jogos de grupo sem resultado. Gerar mesmo assim com a classificação atual?')) return;
  let pairs = [];
  if (c.qual === 2 && gt.length % 2 === 0) {
    const a = [], b = [];
    for (let i = 0; i < gt.length; i += 2) { a.push([gt[i].st[0].p.id, gt[i + 1].st[1].p.id]); b.push([gt[i + 1].st[0].p.id, gt[i].st[1].p.id]); }
    pairs = a.concat(b);
  } else {
    const seeds = []; for (let pos = 0; pos < c.qual; pos++) gt.map(g => g.st[pos]).sort((x, y) => y.pts - x.pts || y.sg - x.sg || y.gp - x.gp).forEach(x => seeds.push(x.p.id));
    for (let i = 0; i < seeds.length / 2; i++) pairs.push([seeds[i], seeds[seeds.length - 1 - i]]);
  }
  createRounds([koSpec(pairs.flat(), c)]);
}
function advance() {
  const rs = koRounds(D); if (!rs.length) return say('Gere o mata-mata primeiro.', false);
  const last = rs[rs.length - 1], ties = tiesOf(D.matches.filter(m => m.round_id === last.id));
  if (ties.length === 1 && ties[0].winner) return say('O campeonato já tem campeão: ' + ties[0].winner.name + '.', true);
  const open = ties.filter(t => !t.winner);
  if (open.length) return say(`Faltam definir ${open.length} confronto(s) de "${roundLabel(last)}" (placar${cfgOf().koLegs == 2 ? ' das duas partidas' : ''} e pênaltis, se empatar).`, false);
  createRounds([koSpec(ties.map(t => t.winner.id), cfgOf())]);
}

// ---------- Participantes ----------
function vPart() {
  const st = Object.fromEntries(standings(D.participants, D.matches).map(x => [x.p.id, x]));
  $('view').innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>NOVO PARTICIPANTE</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>NOME</label><input id="pn" maxlength="60"></div><button class="btn primary" id="pAdd">CADASTRAR</button></div></div></div>
  <div class="card"><div class="cardhead"><h2>PARTICIPANTES (${D.participants.length})</h2></div><div class="cardbody scroll">${D.participants.length ? `<table class="table"><thead><tr><th>NOME</th><th>J</th><th>PTS</th><th></th></tr></thead><tbody>${D.participants.map(p => `<tr><td class="club">${esc(p.name)}</td><td>${st[p.id].j}</td><td>${st[p.id].pts}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-h="${p.id}">HISTÓRICO</button> <button class="btn sm" data-e="${p.id}">EDITAR</button> <button class="btn sm danger" data-d="${p.id}">EXCLUIR</button></td></tr>${openPart === p.id ? `<tr><td colspan="4">${histPart(p)}</td></tr>` : ''}`).join('')}</tbody></table>` : '<div class="empty">Cadastre o primeiro participante.</div>'}</div></div>`;
  $('pAdd').onclick = () => { const n = $('pn').value.trim(); if (n) run(sb.from('participants').insert({ name: n }), 'Participante cadastrado.'); };
  $('view').onclick = e => {
    const t = e.target;
    if (t.dataset.h) { openPart = openPart === t.dataset.h ? null : t.dataset.h; vPart(); }
    if (t.dataset.e) { const p = D.participants.find(x => x.id === t.dataset.e), n = prompt('Novo nome:', p.name); if (n && n.trim() && n.trim() !== p.name) run(sb.from('participants').update({ name: n.trim() }).eq('id', p.id), 'Nome atualizado.'); }
    if (t.dataset.d && confirm('Excluir este participante? Só é possível se ele não tiver partidas nem jogadores.')) run(sb.from('participants').delete().eq('id', t.dataset.d), 'Participante excluído.');
  };
}
function histPart(p) {
  const ms = D.matches.filter(m => m.played && (m.home_id === p.id || m.away_id === p.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ms.length) return '<div class="empty">Sem partidas disputadas.</div>';
  return ms.map(m => { const home = m.home_id === p.id, g = home ? m.home_score : m.away_score, c = home ? m.away_score : m.home_score, r = g > c ? ['V', 'res-w'] : g < c ? ['D', 'res-l'] : ['E', 'res-d']; return `<div class="result-row"><div class="round-label">${pad(m.round.number)}</div><div class="result-teams">${esc(m.home.name)} x ${esc(m.away.name)}<small>${esc(roundLabel(m.round))} • ${fd(m.date)}</small></div><div class="result-score">${m.home_score} – ${m.away_score} <span class="${r[1]}">${r[0]}</span></div></div>`; }).join('');
}

// ---------- Jogadores ----------
function vJog() {
  const g = {}, a = {}; D.events.forEach(e => { g[e.scorer_id] = (g[e.scorer_id] || 0) + 1; if (e.assist_id) a[e.assist_id] = (a[e.assist_id] || 0) + 1; });
  $('view').innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>NOVO JOGADOR</h2></div><div class="cardbody"><div class="admin-help" style="margin-bottom:8px">Cadastre só quem faz gol ou assistência.</div><div class="inline"><div class="field"><label>NOME DO JOGADOR</label><input id="jn" maxlength="60"></div><div class="field"><label>PARTICIPANTE / TIME</label><select id="jp">${opts(D.participants, null, p => p.name)}</select></div><button class="btn primary" id="jAdd">CADASTRAR</button></div></div></div>
  <div class="card"><div class="cardhead"><h2>JOGADORES (${D.players.length})</h2></div><div class="cardbody scroll">${D.players.length ? `<table class="table"><thead><tr><th>JOGADOR</th><th>TIME</th><th>GOLS</th><th>ASSIST.</th><th></th></tr></thead><tbody>${D.players.map(p => `<tr><td class="club">${esc(p.name)}</td><td>${esc(p.team.name)}</td><td>${g[p.id] || 0}</td><td>${a[p.id] || 0}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-e="${p.id}">EDITAR</button> <button class="btn sm danger" data-d="${p.id}">EXCLUIR</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum jogador cadastrado.</div>'}</div></div>`;
  $('jAdd').onclick = () => { const n = $('jn').value.trim(), p = $('jp').value; if (!p) return say('Cadastre os participantes primeiro.', false); if (n) run(sb.from('players').insert({ name: n, participant_id: p }), 'Jogador cadastrado.'); };
  $('view').onclick = e => {
    const t = e.target;
    if (t.dataset.e) { const p = D.players.find(x => x.id === t.dataset.e), n = prompt('Novo nome:', p.name); if (n && n.trim() && n.trim() !== p.name) run(sb.from('players').update({ name: n.trim() }).eq('id', p.id), 'Nome atualizado.'); }
    if (t.dataset.d && confirm('Excluir este jogador? Só é possível se ele não tiver gols/assistências.')) run(sb.from('players').delete().eq('id', t.dataset.d), 'Jogador excluído.');
  };
}

// ---------- Rodadas (ajustes manuais) ----------
function vRod() {
  const next = D.rounds.length ? Math.max(...D.rounds.map(r => r.number)) + 1 : 1, ST = { liga: 'Liga', grupos: 'Grupos', mata: 'Mata-mata' };
  $('view').innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>NOVA RODADA (MANUAL)</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>NÚMERO</label><input id="rn" type="number" min="1" value="${next}" style="width:80px"></div><div class="field"><label>FASE</label><select id="rst"><option value="liga">Liga</option><option value="grupos">Grupos</option><option value="mata">Mata-mata</option></select></div><div class="field"><label>NOME (OPCIONAL)</label><input id="rnm" placeholder="Ex.: Semifinais"></div><div class="field"><label>DATA</label><input id="rd" type="date"></div><button class="btn primary" id="rAdd">CRIAR</button></div><p class="admin-help">Dica: para gerar tudo automaticamente, use a aba Campeonato.</p></div></div>
  ${D.rounds.slice().reverse().map(r => { const ms = D.matches.filter(m => m.round_id === r.id).sort((a, b) => a.seq - b.seq); return `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>${esc(roundLabel(r).toUpperCase())} • ${ST[r.stage]} ${r.date ? '• ' + fd(r.date) : ''}</h2><span><button class="btn sm" data-rd="${r.id}">DATA</button> <button class="btn sm danger" data-rx="${r.id}">EXCLUIR</button></span></div><div class="cardbody">
   ${ms.length ? ms.map(m => `<div class="result-row"><div class="round-label">${m.played ? 'ENC.' : 'AGEND.'}</div><div class="result-teams">${esc(m.home.name)} x ${esc(m.away.name)}<small>${[m.group_name ? 'Grupo ' + esc(m.group_name) : '', r.stage === 'mata' ? 'Jogo ' + m.leg : '', m.date ? fd(m.date) : 'data a definir'].filter(Boolean).join(' • ')}</small></div><div class="result-score">${m.played ? m.home_score + ' – ' + m.away_score : '–'} <button class="btn sm" data-md="${m.id}">DATA</button> <button class="btn sm danger" data-mx="${m.id}">✕</button></div></div>`).join('') : '<div class="empty">Sem confrontos.</div>'}
   <div class="inline" style="margin-top:10px"><select data-mh="${r.id}">${opts(D.participants, null, p => p.name)}</select><span>x</span><select data-ma="${r.id}">${opts(D.participants, null, p => p.name)}</select>${r.stage === 'grupos' ? `<input data-mg="${r.id}" placeholder="Grupo" style="width:70px" maxlength="2">` : ''}${r.stage === 'mata' ? `<select data-ml="${r.id}"><option value="1">Jogo 1</option><option value="2">Jogo 2</option></select>` : ''}<input type="date" data-mdt="${r.id}" value="${r.date || ''}"><button class="btn sm primary" data-add="${r.id}">ADICIONAR CONFRONTO</button></div>
  </div></div>`; }).join('') || '<div class="empty">Nenhuma rodada criada.</div>'}`;
  $('rAdd').onclick = () => { const n = +$('rn').value; if (n > 0) run(sb.from('rounds').insert({ number: n, stage: $('rst').value, name: $('rnm').value.trim() || null, date: $('rd').value || null }), 'Rodada criada.'); };
  $('view').onclick = e => {
    const t = e.target, q = k => document.querySelector(`[data-${k}="${t.dataset.add}"]`);
    if (t.dataset.rd) { const r = D.rounds.find(x => x.id === t.dataset.rd), v = prompt('Data da rodada (AAAA-MM-DD), vazio para limpar:', r.date || ''); if (v !== null) run(sb.from('rounds').update({ date: v.trim() || null }).eq('id', r.id), 'Data atualizada.'); }
    if (t.dataset.md) { const m = D.matches.find(x => x.id === t.dataset.md), v = prompt('Data da partida (AAAA-MM-DD), vazio para limpar:', m.played_on || ''); if (v !== null) run(sb.from('matches').update({ played_on: v.trim() || null }).eq('id', m.id), 'Data atualizada.'); }
    if (t.dataset.rx && confirm('Excluir a rodada e todas as suas partidas?')) run(sb.from('rounds').delete().eq('id', t.dataset.rx), 'Rodada excluída.');
    if (t.dataset.mx && confirm('Excluir esta partida?')) run(sb.from('matches').delete().eq('id', t.dataset.mx), 'Partida excluída.');
    if (t.dataset.add) {
      const h = q('mh').value, a = q('ma').value; if (!h || !a) return say('Cadastre os participantes primeiro.', false); if (h === a) return say('Escolha participantes diferentes.', false);
      const g = q('mg'), l = q('ml');
      run(sb.from('matches').insert({ round_id: t.dataset.add, home_id: h, away_id: a, played_on: q('mdt').value || null, group_name: g ? g.value.trim().toUpperCase() || null : null, leg: l ? +l.value : 1 }), 'Confronto adicionado.');
    }
  };
}

// ---------- Resultados + gols ----------
function goalsPanel(m) {
  const ev = D.events.filter(e => e.match_id === m.id), pls = D.players.filter(p => [m.home_id, m.away_id].includes(p.participant_id));
  const cnt = id => ev.filter(e => (D.players.find(p => p.id === e.scorer_id) || {}).participant_id === id).length;
  const optsP = first => (first ? '<option value="">— sem assistência —</option>' : '') + [m.home, m.away].map(t => `<optgroup label="${esc(t.name)}">${pls.filter(p => p.participant_id === t.id).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
  const chk = (t, sc, n) => `<span class="${n === sc ? 'res-w' : 'res-d'}">${esc(t.name)}: ${n}/${sc}</span>`;
  return `<div style="grid-column:1/-1;background:#f6f8f9;padding:10px;border:1px solid #e1e5e7">
   <div class="admin-help" style="margin-bottom:6px"><b>Gols lançados / placar:</b> ${chk(m.home, m.home_score, cnt(m.home_id))} • ${chk(m.away, m.away_score, cnt(m.away_id))} (o lançamento de autores é opcional)</div>
   ${ev.map(e => `<div class="result-row"><div class="round-label">⚽</div><div class="result-teams">${esc(plname(e.scorer_id))} <small>${esc(pname((D.players.find(p => p.id === e.scorer_id) || {}).participant_id))}${e.assist_id ? ' • assistência: ' + esc(plname(e.assist_id)) : ' • sem assistência'}</small></div><div class="result-score"><button class="btn sm danger" data-ex="${e.id}">✕</button></div></div>`).join('')}
   ${pls.length ? `<div class="inline" style="margin-top:8px"><div class="field"><label>GOL</label><select id="gs">${optsP(false)}</select></div><div class="field"><label>ASSISTÊNCIA</label><select id="ga">${optsP(true)}</select></div><button class="btn sm primary" data-ga="${m.id}">ADICIONAR GOL</button></div>` : '<div class="empty">Cadastre jogadores desses times na aba Jogadores.</div>'}</div>`;
}
function vRes() {
  if (!D.rounds.length) { $('view').innerHTML = '<div class="empty">Gere o calendário na aba Campeonato (ou crie rodadas) primeiro.</div>'; return; }
  if (!D.rounds.some(r => r.id === selRound)) selRound = currentRound(D.rounds, D.matches).id;
  const ms = D.matches.filter(m => m.round_id === selRound).sort((a, b) => a.seq - b.seq);
  $('view').innerHTML = `<div class="card"><div class="cardhead"><h2>REGISTRAR / EDITAR RESULTADOS</h2><select id="rs">${opts(D.rounds, selRound, x => roundLabel(x))}</select></div><div class="cardbody">
  ${ms.length ? ms.map(m => { const ko = m.round.stage === 'mata'; return `<div class="arow"><div class="nm">${esc(m.home.name)}</div><div><input class="scoreinput" type="number" min="0" max="99" id="h${m.id}" value="${m.home_score ?? ''}"> x <input class="scoreinput" type="number" min="0" max="99" id="a${m.id}" value="${m.away_score ?? ''}"></div><div class="nm">${esc(m.away.name)}</div>
   <div class="arow-foot">${m.group_name ? `<span class="admin-help">Grupo ${esc(m.group_name)}</span>` : ''}${ko ? `<span class="admin-help">Jogo ${m.leg} • Pênaltis:</span><input class="scoreinput" type="number" min="0" id="ph${m.id}" value="${m.home_pen ?? ''}"> x <input class="scoreinput" type="number" min="0" id="pa${m.id}" value="${m.away_pen ?? ''}">` : ''}<label class="admin-help">Data</label><input type="date" id="d${m.id}" value="${m.played_on || (m.played ? '' : today())}"><button class="btn sm primary" data-s="${m.id}">SALVAR</button>${m.played ? `<button class="btn sm" data-g="${m.id}">GOLS (${D.events.filter(e => e.match_id === m.id).length})</button><button class="btn sm danger" data-c="${m.id}">LIMPAR</button>` : ''}</div>${openGoals === m.id && m.played ? goalsPanel(m) : ''}</div>`; }).join('') : '<div class="empty">Esta rodada não tem confrontos.</div>'}</div></div>`;
  $('rs').onchange = e => { selRound = e.target.value; openGoals = null; vRes(); };
  $('view').onclick = e => {
    const d = e.target.dataset;
    if (d.g) { openGoals = openGoals === d.g ? null : d.g; return vRes(); }
    if (d.ex) return run(sb.from('match_events').delete().eq('id', d.ex), 'Gol removido.');
    if (d.ga) return run(sb.from('match_events').insert({ match_id: d.ga, scorer_id: $('gs').value, assist_id: $('ga').value || null }), 'Gol lançado.');
    if (d.c) { if (confirm('Apagar o placar desta partida? (Os gols lançados dela também serão apagados.)')) sb.from('match_events').delete().eq('match_id', d.c).then(() => run(sb.from('matches').update({ home_score: null, away_score: null, home_pen: null, away_pen: null }).eq('id', d.c), 'Placar removido.')); return; }
    if (!d.s) return;
    const id = d.s, h = $('h' + id).value, a = $('a' + id).value, dt = $('d' + id).value;
    if (h === '' || a === '') return say('Informe os dois placares.', false);
    if (!dt) return say('Informe a data da partida.', false);
    let pen = { home_pen: null, away_pen: null }; const ph = $('ph' + id), pa = $('pa' + id);
    if (ph && (ph.value !== '' || pa.value !== '')) { if (ph.value === '' || pa.value === '') return say('Informe os dois valores de pênaltis.', false); pen = { home_pen: +ph.value, away_pen: +pa.value }; }
    run(sb.from('matches').update({ home_score: +h, away_score: +a, played_on: dt, ...pen }).eq('id', id), 'Resultado salvo. Tabela, destaque e estatísticas atualizados.');
  };
}

// ---------- Estatísticas ----------
function vEst() {
  const S = stats(D), pl = (t, rows, f) => `<div class="card"><div class="cardhead"><h2>${t}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b>${i + 1}. ${esc(x.name)}</b><small>${esc(x.team.name)}</small></div><span class="number">${f(x)}</span></div>`).join('') : '<div class="empty">Sem registros.</div>'}</div></div>`;
  $('view').innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>VISÃO GERAL</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Gols/jogo</span></div></div></div></div>
  <div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>DESEMPENHO GERAL (TODAS AS FASES)</h2></div><div class="cardbody scroll"><table class="table"><thead><tr><th>#</th><th>PARTICIPANTE</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th></tr></thead><tbody>${S.st.map((x, i) => `<tr><td>${i + 1}</td><td class="club">${esc(x.p.name)}</td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="cols3">${pl('ARTILHARIA', S.artilheiros, x => x.g)}${pl('ASSISTÊNCIAS', S.garcons, x => x.a)}${pl('G+A', S.part, x => x.ga)}</div>
  <p class="admin-help">Tudo é calculado automaticamente a partir das partidas e dos gols lançados; não há lançamento manual, então não há duplicidade.</p>`;
}

// ---------- Histórico ----------
async function vHis() {
  $('view').innerHTML = '<div class="empty">Carregando…</div>';
  const { data, error } = await sb.from('history').select('*').order('at', { ascending: false }).limit(200);
  if (error) return say(traduz(error), false);
  const act = { INSERT: 'Criou', UPDATE: 'Alterou', DELETE: 'Excluiu' }, tb = { participants: 'participante', rounds: 'rodada', matches: 'partida', players: 'jogador', match_events: 'gol', settings: 'configuração' };
  const desc = h => { const d = h.detail || {}; switch (h.table_name) { case 'participants': case 'players': return d.name; case 'rounds': return d.name || 'Rodada ' + d.number; case 'settings': return `${d.name} • ${(PRESETS[d.format] || {}).label || d.format}`; case 'match_events': return `${plname(d.scorer_id)}${d.assist_id ? ' (assist. ' + plname(d.assist_id) + ')' : ''}`; default: return `${pname(d.home_id)} ${d.home_score ?? '–'} x ${d.away_score ?? '–'} ${pname(d.away_id)}`; } };
  $('view').innerHTML = `<div class="card"><div class="cardhead"><h2>ALTERAÇÕES NA ADMINISTRAÇÃO (ÚLTIMAS 200)</h2></div><div class="cardbody scroll">${data.length ? `<table class="table"><thead><tr><th>QUANDO</th><th>USUÁRIO</th><th>AÇÃO</th><th>DETALHE</th></tr></thead><tbody>${data.map(h => `<tr><td>${new Date(h.at).toLocaleString('pt-BR')}</td><td>${esc(h.user_email || '')}</td><td>${act[h.action] || h.action} ${tb[h.table_name] || ''}</td><td>${esc(desc(h))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sem registros.</div>'}</div></div>`;
}

(async () => {
  if (CBPES.url.startsWith('COLE')) return say('config.js ainda não foi preenchido.', false);
  const { data: { session } } = await sb.auth.getSession();
  session ? enter(session) : $('login').classList.remove('hidden');
})();
