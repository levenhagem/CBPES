const $ = id => document.getElementById(id);
let D, tab = 'camp', selRound = null, openPart = null, openGoals = null, draft = null, firstLoad = true, importRows = [], selWeekly = null, weeklyDraft = null; 
const today = () => new Date().toISOString().slice(0, 10);

function say(t, ok) { const m = $('msg'); m.textContent = t || ''; m.className = 'msg ' + (ok ? 'ok' : 'err'); if (t && ok) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 3500); }
const run = async (q, okMsg) => { const { error } = await q; if (error) { say(traduz(error), false); return false; } say(okMsg, true); await refresh(); return true; };
function traduz(e) {
  if (e.code === '23505') return 'Registro duplicado (já existe).';
  if (e.code === '23503') return 'Não é possível excluir: há partidas, jogadores ou gols ligados a este item. Remova-os antes.';
  if (e.code === '42501' || /row-level security/i.test(e.message)) return 'Sem permissão para esta operação.';
  if (e.code === '23514') return 'Dados inválidos (confira participantes e placar).';
  if (e.code === '42P01' || /does not exist|schema cache/i.test(e.message)) return 'Banco desatualizado: confira se executou as atualizações SQL anteriores e a V10 no Supabase.';
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

async function refresh() { const y = window.scrollY; try { D = await load(); await syncAutomaticCoachTrophies(); const {data: trophies, error} = await sb.from('coach_trophies').select('*'); if (error) throw error; D.coachTrophies = trophies || []; } catch (e) { return say(traduz(e), false); } if (firstLoad) { firstLoad = false; if (D.rounds.length) tab = 'jogos'; } render(); window.scrollTo(0, y); }
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('view').onclick = null; $('view').onchange = null; $('view').onkeydown = null;
  ({ camp: vCamp, times: vTimes, coaches: vTechnicians, jogos: vJogos, est: vEst, his: vHis, import: vImport, weekly: vSemanais })[tab]();
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
  <div class="card"><div class="cardhead"><h2>CALENDÁRIO DE JOGOS</h2><span class="admin-help">${D.rounds.length} rodadas • ${D.matches.length} partidas • ${competitionParticipants().length} participantes ativos</span></div><div class="cardbody">
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
const competitionParticipants = () => D.participants.filter(p => p.participates_in_competition !== false);
const orderIds = () => { const ps = competitionParticipants(); return (($('draw') || {}).checked ? shuffle(ps) : ps).map(p => p.id); };
const needEmpty = () => D.rounds.length ? (say('Já existe calendário. Apague-o antes de gerar outro.', false), false) : true;

function genLiga() {
  if (!needEmpty()) return; const ids = orderIds(); if (ids.length < 2) return say('Cadastre ao menos 2 participantes ativos na competição.', false);
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
  if (D.matches.some(m => m.round && m.round.stage === 'grupos' && !m.played) && !confirm('Ainda há jogos de grupo sem resultado. Gerar mesmo assim com a classificação atual?')) return;
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

// ---------- Jogos: rodadas, placares, gols e confrontos numa tela só ----------
let showNew = false, activeCategory = 'official';
const curMatches = () => activeCategory === 'friendly' ? D.matches.filter(m => m.category === 'friendly').sort((a,b)=>(b.date||'').localeCompare(a.date||'')) : activeCategory === 'weekly' ? D.matches.filter(m => m.category === 'weekly' && m.weekly_id === selWeekly).sort((a,b)=>(b.date||'').localeCompare(a.date||'')) : D.matches.filter(m => m.round_id === selRound && (m.category || 'official') === 'official').sort((a, b) => a.seq - b.seq);
function rowPayload(id) {
  const h = $('h' + id).value, a = $('a' + id).value, dt = $('d' + id).value;
  if (h === '' && a === '') return { skip: true };
  if (h === '' || a === '') return { err: 'Informe os dois placares.' };
  if (!dt) return { err: 'Informe a data da partida.' };
  let pen = { home_pen: null, away_pen: null }; const ph = $('ph' + id), pa = $('pa' + id);
  if (ph && (ph.value !== '' || pa.value !== '')) { if (ph.value === '' || pa.value === '') return { err: 'Informe os dois valores de pênaltis.' }; pen = { home_pen: +ph.value, away_pen: +pa.value }; }
  return { data: { home_score: +h, away_score: +a, played_on: dt, ...pen } };
}
function saveOne(id) {
  const r = rowPayload(id); if (r.skip) return say('Informe o placar.', false); if (r.err) return say(r.err, false);
  run(sb.from('matches').update(r.data).eq('id', id), 'Resultado salvo. Tabela, destaque e estatísticas atualizados.');
}
async function saveAll() {
  const ups = [];
  for (const m of curMatches()) {
    const r = rowPayload(m.id); if (r.err) return say(`${m.home.name} x ${m.away.name}: ${r.err}`, false);
    if (!r.data) continue; const d = r.data;
    if (m.played && m.home_score === d.home_score && m.away_score === d.away_score && m.played_on === d.played_on && m.home_pen === d.home_pen && m.away_pen === d.away_pen) continue;
    ups.push(sb.from('matches').update(d).eq('id', m.id));
  }
  if (!ups.length) return say('Nada para salvar: preencha ou altere algum placar.', false);
  const e = (await Promise.all(ups)).find(x => x.error); if (e) return say(traduz(e.error), false);
  say(ups.length + ' resultado(s) salvo(s).', true); refresh();
}
function rowHTML(m) {
  const ko = !!(m.round && m.round.stage === 'mata'), id = m.id;
  return `<div class="arow"><div class="nm">${esc(m.home.name)}</div><div><input class="scoreinput" type="number" min="0" max="99" id="h${id}" data-m="${id}" value="${m.home_score ?? ''}"> x <input class="scoreinput" type="number" min="0" max="99" id="a${id}" data-m="${id}" value="${m.away_score ?? ''}"></div><div class="nm">${esc(m.away.name)}</div>
   <div class="arow-foot">${m.group_name ? `<span class="admin-help">Grupo ${esc(m.group_name)}</span>` : ''}${ko ? `<span class="admin-help">Jogo ${m.leg} • Pênaltis:</span><input class="scoreinput" type="number" min="0" id="ph${id}" data-m="${id}" value="${m.home_pen ?? ''}"> x <input class="scoreinput" type="number" min="0" id="pa${id}" data-m="${id}" value="${m.away_pen ?? ''}">` : ''}<label class="admin-help">Data</label><input type="date" id="d${id}" value="${m.played_on || (m.played ? '' : today())}"><button class="btn sm primary" data-s="${id}">SALVAR</button>${m.played ? `<button class="btn sm" data-g="${id}">GOLS (${D.events.filter(e => e.match_id === id).length})</button><button class="btn sm danger" data-c="${id}">LIMPAR</button>` : ''}<button class="btn sm danger" data-mx="${id}">EXCLUIR JOGO</button></div>${openGoals === id && m.played ? goalsPanel(m) : ''}</div>`;
}
function goalsPanel(m) {
  const ev = D.events.filter(e => e.match_id === m.id), pls = D.players.filter(p => [m.home_id, m.away_id].includes(p.participant_id));
  const cnt = id => ev.filter(e => (D.players.find(p => p.id === e.scorer_id) || {}).participant_id === id).length;
  const optsP = first => (first ? '<option value="">— sem assistência —</option>' : '') + [m.home, m.away].map(t => `<optgroup label="${esc(t.name)}">${pls.filter(p => p.participant_id === t.id).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
  const chk = (t, sc, n) => `<span class="${n === sc ? 'res-w' : 'res-d'}">${esc(t.name)}: ${n}/${sc}</span>`;
  return `<div style="grid-column:1/-1;background:#f6f8f9;padding:10px;border:1px solid var(--line)">
   <div class="admin-help" style="margin-bottom:6px"><b>Gols lançados / placar:</b> ${chk(m.home, m.home_score, cnt(m.home_id))} • ${chk(m.away, m.away_score, cnt(m.away_id))} (lançar autores é opcional)</div>
   ${ev.map(e => `<div class="result-row"><div class="round-label">GOL</div><div class="result-teams">${esc(plname(e.scorer_id))} <small>${esc(pname((D.players.find(p => p.id === e.scorer_id) || {}).participant_id))}${e.assist_id ? ' • assistência: ' + esc(plname(e.assist_id)) : ' • sem assistência'}</small></div><div class="result-score"><button class="btn sm danger" data-ex="${e.id}">✕</button></div></div>`).join('')}
   ${pls.length ? `<div class="inline" style="margin-top:8px"><div class="field"><label>Gol</label><select id="gs">${optsP(false)}</select></div><div class="field"><label>Assistência</label><select id="ga">${optsP(true)}</select></div><button class="btn sm primary" data-ga="${m.id}">ADICIONAR GOL</button></div>` : '<div class="empty">Cadastre jogadores desses times na aba Times.</div>'}</div>`;
}
function vJogos() {
  const switcher = `<div class="card" style="margin-bottom:12px"><div class="cardbody inline" style="padding:10px"><button class="btn ${activeCategory==='official'?'primary':''}" data-category="official">JOGOS OFICIAIS</button><button class="btn ${activeCategory==='friendly'?'primary':''}" data-category="friendly">AMISTOSOS</button><button class="btn ${activeCategory==='weekly'?'primary':''}" data-category="weekly">SEMANAIS</button><span class="admin-help">${activeCategory==='friendly'?'Partidas independentes, sem rodada.':activeCategory==='weekly'?'Partidas vinculadas a uma edição semanal.':'Partidas vinculadas às rodadas da competição oficial.'}</span></div></div>`;
  if (activeCategory === 'friendly') {
    const ms = curMatches();
    const form = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>NOVO AMISTOSO</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>Mandante</label><select id="fh">${opts(D.participants,null,p=>p.name)}</select></div><span>x</span><div class="field"><label>Visitante</label><select id="fa">${opts(D.participants,null,p=>p.name)}</select></div><div class="field"><label>Data</label><input type="date" id="fdt" value="${today()}"></div><button class="btn primary" data-fadd="1">CADASTRAR AMISTOSO</button></div></div></div>`;
    const rows = ms.length ? ms.map(m=>`<div class="arow"><div class="nm">${esc(m.home.name)}<small class="admin-help">${esc(m.home.coach_name||'')}</small></div><div><input class="scoreinput" type="number" min="0" max="99" id="h${m.id}" value="${m.home_score??''}"> x <input class="scoreinput" type="number" min="0" max="99" id="a${m.id}" value="${m.away_score??''}"></div><div class="nm" style="text-align:right">${esc(m.away.name)}<small class="admin-help">${esc(m.away.coach_name||'')}</small></div><div class="arow-foot"><label class="admin-help">Data</label><input type="date" id="d${m.id}" value="${m.played_on||m.date||''}"><button class="btn sm primary" data-s="${m.id}">SALVAR</button>${m.played?`<button class="btn sm" data-g="${m.id}">GOLS (${D.events.filter(e=>e.match_id===m.id).length})</button><button class="btn sm danger" data-c="${m.id}">LIMPAR</button>`:''}<button class="btn sm danger" data-mx="${m.id}">EXCLUIR</button></div>${openGoals===m.id&&m.played?goalsPanel(m):''}</div>`).join('') : '<div class="empty">Nenhum amistoso cadastrado. Amistosos não recebem rodada.</div>';
    $('view').innerHTML = switcher + form + `<div class="card"><div class="cardhead"><h2>AMISTOSOS CADASTRADOS (${ms.length})</h2></div><div class="cardbody">${rows}</div></div>`;
    $('view').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.m)saveOne(e.target.dataset.m)};
    $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
      if(d.category){activeCategory=d.category;selRound=null;return vJogos();}
      if(d.fadd){const h=$('fh').value,a=$('fa').value;if(!h||!a)return say('Cadastre os participantes primeiro.',false);if(h===a)return say('Escolha participantes diferentes.',false);return run(sb.from('matches').insert({round_id:null,home_id:h,away_id:a,played_on:$('fdt').value||null,category:'friendly'}),'Amistoso cadastrado sem vínculo com rodada.');}
      if(d.s)return saveOne(d.s);
      if(d.mx&&confirm('Excluir este amistoso?'))return run(sb.from('matches').delete().eq('id',d.mx),'Amistoso excluído.');
      if(d.g){openGoals=openGoals===d.g?null:d.g;return vJogos();}
      if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
      if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
      if(d.c&&confirm('Apagar o placar desta partida?'))sb.from('match_events').delete().eq('match_id',d.c).then(()=>run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null}).eq('id',d.c),'Placar removido.'));
    };
    return;
  }
  if (activeCategory === 'weekly') {
    if (!selWeekly || !D.weeklies.some(w => w.id === selWeekly)) selWeekly = D.weeklies[0]?.id || null;
    const edition = D.weeklies.find(w => w.id === selWeekly);
    const ms = curMatches();
    const picker = `<div class="card" style="margin-bottom:12px"><div class="cardbody inline" style="padding:10px"><div class="field"><label>Campeonato semanal</label><select id="weeklyPick">${D.weeklies.map(w=>`<option value="${w.id}" ${w.id===selWeekly?'selected':''}>${esc(w.name)} • ${fd(w.event_date)}</option>`).join('')}</select></div><button class="btn" data-goweekly="1">ABRIR SEMANAIS</button></div></div>`;
    if (!edition) { $('view').innerHTML = switcher + picker + '<div class="empty">Cadastre uma edição na aba SEMANAIS antes de registrar partidas.</div>'; $('view').onclick=e=>{if(e.target.closest('[data-goweekly]')){tab='weekly';render();}}; return; }
    const form = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>NOVA PARTIDA — ${esc(edition.name)}</h2><span class="pill">${fd(edition.event_date)}</span></div><div class="cardbody"><div class="inline"><div class="field"><label>Mandante</label><select id="wh">${opts(D.participants,null,p=>p.name)}</select></div><span>x</span><div class="field"><label>Visitante</label><select id="wa">${opts(D.participants,null,p=>p.name)}</select></div><div class="field"><label>Data do jogo</label><input type="date" id="wdt" value="${edition.event_date}"></div><button class="btn primary" data-wadd="1">CADASTRAR PARTIDA SEMANAL</button></div></div></div>`;
    const rows = ms.length ? ms.map(rowHTML).join('') : '<div class="empty">Nenhuma partida cadastrada nesta edição.</div>';
    $('view').innerHTML = switcher + picker + form + `<div class="card"><div class="cardhead"><h2>PARTIDAS DA EDIÇÃO (${ms.length})</h2></div><div class="cardbody">${rows}</div></div>`;
    $('view').onchange=e=>{if(e.target.id==='weeklyPick'){selWeekly=e.target.value;vJogos();}};
    $('view').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.m)saveOne(e.target.dataset.m)};
    $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
      if(d.category){activeCategory=d.category;selRound=null;return vJogos();}
      if(d.goweekly){tab='weekly';render();return;}
      if(d.wadd){const h=$('wh').value,a=$('wa').value;if(!h||!a)return say('Cadastre os participantes primeiro.',false);if(h===a)return say('Escolha participantes diferentes.',false);return run(sb.from('matches').insert({round_id:null,weekly_id:selWeekly,home_id:h,away_id:a,played_on:$('wdt').value||edition.event_date,category:'weekly'}),'Partida vinculada à edição semanal.');}
      if(d.s)return saveOne(d.s);if(d.mx&&confirm('Excluir esta partida semanal?'))return run(sb.from('matches').delete().eq('id',d.mx),'Partida excluída.');
      if(d.g){openGoals=openGoals===d.g?null:d.g;return vJogos();}if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
      if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
      if(d.c&&confirm('Apagar o placar desta partida?'))sb.from('match_events').delete().eq('match_id',d.c).then(()=>run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null}).eq('id',d.c),'Placar removido.'));
    };
    return;
  }
  const categoryRounds = D.rounds.filter(x => { const linked=D.matches.filter(m=>m.round_id===x.id);return !linked.length||linked.some(m=>(m.category||'official')==='official'); });
  if(!categoryRounds.some(r=>r.id===selRound))selRound=categoryRounds.length?categoryRounds[categoryRounds.length-1].id:null;
  const r=D.rounds.find(x=>x.id===selRound),ST={liga:'Liga',grupos:'Grupos',mata:'Mata-mata'};
  const next=D.rounds.length?Math.max(...D.rounds.map(x=>x.number))+1:1;
  const newForm=showNew?`<div class="card" style="margin-bottom:8px"><div class="cardbody" style="padding:10px;display:grid;gap:8px"><div class="field"><label>Número</label><input id="rn" type="number" min="1" value="${next}"></div><div class="field"><label>Fase</label><select id="rst"><option value="liga">Liga</option><option value="grupos">Grupos</option><option value="mata">Mata-mata</option></select></div><div class="field"><label>Nome (opcional)</label><input id="rnm" placeholder="Ex.: Semifinais"></div><div class="field"><label>Data</label><input id="rd" type="date"></div><button class="btn sm primary" data-rcreate="1">CRIAR RODADA</button></div></div>`:'';
  const list=categoryRounds.map(x=>{const a=D.matches.filter(m=>m.round_id===x.id&&(m.category||'official')==='official');return `<button data-sel="${x.id}" class="${x.id===selRound?'on':''}"><span>${esc(roundLabel(x))}</span><small>${a.filter(m=>m.played).length}/${a.length}</small></button>`;}).join('')||'<div class="empty">Nenhuma rodada oficial cadastrada.</div>';
  const ms=r?curMatches():[];
  const right=r?`<div class="card"><div class="cardhead"><h2>${esc(roundLabel(r))} <span class="pill">${ST[r.stage]}</span></h2><span class="inline" style="align-items:center"><input type="date" id="rdt" value="${r.date||''}"><button class="btn sm" data-rdsave="1">SALVAR DATA</button><button class="btn sm danger" data-rx="${r.id}">EXCLUIR RODADA</button></span></div><div class="cardbody">${ms.length?`<div style="text-align:right;margin:8px 0"><button class="btn primary" data-saveall="1">SALVAR TODOS OS PLACARES</button></div>`+ms.map(rowHTML).join(''):'<div class="empty">Sem confrontos nesta rodada.</div>'}<div class="inline" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><div class="field"><label>Novo confronto</label><select id="mh">${opts(competitionParticipants(),null,p=>p.name)}</select></div><span>x</span><div class="field"><label>Visitante</label><select id="ma">${opts(competitionParticipants(),null,p=>p.name)}</select></div>${r.stage==='grupos'?'<div class="field"><label>Grupo</label><input id="mg" style="width:64px" maxlength="2"></div>':''}${r.stage==='mata'?'<div class="field"><label>Jogo</label><select id="ml"><option value="1">Jogo 1</option><option value="2">Jogo 2</option></select></div>':''}<div class="field"><label>Data</label><input type="date" id="mdt" value="${r.date||''}"></div><button class="btn sm primary" data-add="1">ADICIONAR</button></div></div></div>`:'<div class="empty">Gere o calendário na aba Campeonato ou crie uma rodada ao lado.</div>';
  $('view').innerHTML=switcher+`<div class="split"><div><button class="btn primary" style="width:100%;margin-bottom:8px" data-new="1">${showNew?'FECHAR':'+ NOVA RODADA'}</button>${newForm}<div class="rlist">${list}</div></div><div>${right}</div></div>`;
  $('view').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.m)saveOne(e.target.dataset.m)};
  $('view').onclick=e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
    if(d.category){activeCategory=d.category;selRound=null;showNew=false;openGoals=null;return vJogos();}
    if(d.sel){selRound=d.sel;openGoals=null;return vJogos();}
    if(d.new){showNew=!showNew;return vJogos();}
    if(d.rcreate){const n=+$('rn').value;if(n>0){showNew=false;run(sb.from('rounds').insert({number:n,stage:$('rst').value,name:$('rnm').value.trim()||null,date:$('rd').value||null}),'Rodada criada.');}return;}
    if(d.rdsave)return run(sb.from('rounds').update({date:$('rdt').value||null}).eq('id',selRound),'Data da rodada salva.');
    if(d.rx){if(confirm('Excluir a rodada e todas as suas partidas?')){selRound=null;run(sb.from('rounds').delete().eq('id',d.rx),'Rodada excluída.');}return;}
    if(d.mx&&confirm('Excluir este jogo?'))return run(sb.from('matches').delete().eq('id',d.mx),'Jogo excluído.');
    if(d.add){const h=$('mh').value,a=$('ma').value;if(!h||!a)return say('Cadastre os participantes primeiro.',false);if(h===a)return say('Escolha participantes diferentes.',false);return run(sb.from('matches').insert({round_id:selRound,home_id:h,away_id:a,played_on:$('mdt').value||null,group_name:$('mg')?$('mg').value.trim().toUpperCase()||null:null,leg:$('ml')?+$('ml').value:1,category:'official'}),'Confronto oficial adicionado à rodada.');}
    if(d.saveall)return saveAll();if(d.s)return saveOne(d.s);if(d.g){openGoals=openGoals===d.g?null:d.g;return vJogos();}
    if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
    if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
    if(d.c&&confirm('Apagar o placar desta partida?'))sb.from('match_events').delete().eq('match_id',d.c).then(()=>run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null}).eq('id',d.c),'Placar removido.'));
  };
}
// ---------- Edições de campeonatos semanais ----------
function vSemanais() {
  const selected = D.weeklies.find(w=>w.id===selWeekly) || null;
  const w = selected || {name:'',event_date:today(),participant_count:0,format_description:'',champion_id:null,champion_coach_name:''};
  $('view').innerHTML = `<div class="card" style="margin-bottom:14px"><div class="cardhead"><h2>${selected?'EDITAR EDIÇÃO SEMANAL':'NOVA EDIÇÃO SEMANAL'}</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>Nome do campeonato</label><input id="wn" maxlength="80" value="${esc(w.name)}" placeholder="Ex.: Semanal CBPES"></div><div class="field"><label>Data da edição</label><input id="wdate" type="date" value="${w.event_date||today()}"></div><div class="field"><label>Quantidade de participantes</label><input id="wcount" type="number" min="0" max="128" value="${w.participant_count||0}" style="width:110px"></div></div><div class="field" style="margin-top:10px"><label>Formato / regras desta edição</label><textarea id="wformat" rows="3" style="width:100%" placeholder="Ex.: 8 participantes, grupos + semifinal e final, jogo único...">${esc(w.format_description||'')}</textarea></div><div style="margin-top:12px"><label class="admin-help">PARTICIPANTES INSCRITOS NESTA EDIÇÃO (opcional)</label><div class="cols3" style="gap:6px;margin-top:6px">${D.participants.map(p=>`<label style="display:flex;gap:7px;align-items:center;padding:5px;border:1px solid var(--line)"><input type="checkbox" name="weeklyParticipant" value="${p.id}" ${(D.weeklyParticipants||[]).some(x=>x.weekly_id===selected?.id&&x.participant_id===p.id)?'checked':''}>${esc(p.name)}</label>`).join('')||'<span class="admin-help">Cadastre os times na aba Times primeiro.</span>'}</div></div><div class="inline" style="margin-top:10px"><div class="field"><label>Campeão da edição</label><select id="wchamp"><option value="">Ainda não definido</option>${opts(D.participants,w.champion_id,p=>p.name)}</select></div><div class="field"><label>Técnico campeão</label><input id="wcoach" maxlength="80" value="${esc(w.champion_coach_name||'')}" placeholder="Nome do técnico"></div></div><div class="form-actions"><button class="btn primary" id="wSave">${selected?'SALVAR ALTERAÇÕES':'CRIAR EDIÇÃO'}</button>${selected?'<button class="btn danger" id="wDelete">EXCLUIR EDIÇÃO</button><button class="btn" id="wNew">NOVA EDIÇÃO</button>':''}</div><p class="admin-help">Cada data identifica uma edição independente. O campeão e seu técnico ficam registrados como troféu no histórico geral.</p></div></div>
  <div class="card"><div class="cardhead"><h2>EDIÇÕES CADASTRADAS (${D.weeklies.length})</h2></div><div class="cardbody">${D.weeklies.length?D.weeklies.map(x=>`<div class="player"><div><b>${esc(x.name)}</b><small>${fd(x.event_date)} • ${x.participant_count||0} participantes • ${D.matches.filter(m=>m.weekly_id===x.id).length} partidas ${x.champion_id?'• Campeão: '+esc(pname(x.champion_id)):''}</small></div><button class="btn sm" data-wedit="${x.id}">EDITAR</button></div>`).join(''):'<div class="empty">Nenhuma edição semanal cadastrada.</div>'}</div></div>`;
  $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
    if(d.wedit){selWeekly=d.wedit;return vSemanais();}
    if(t.id==='wNew'){selWeekly=null;return vSemanais();}
    if(t.id==='wSave'){const roster=[...document.querySelectorAll('input[name=weeklyParticipant]:checked')].map(x=>x.value);const payload={name:$('wn').value.trim()||'Campeonato Semanal',event_date:$('wdate').value,participant_count:roster.length||(+$('wcount').value||0),format_description:$('wformat').value.trim(),champion_id:$('wchamp').value||null,champion_coach_name:$('wcoach').value.trim()||null};if(!payload.event_date)return say('Informe a data da edição.',false);if(payload.champion_id&&!payload.champion_coach_name){const cp=D.participants.find(p=>p.id===payload.champion_id);const games=D.matches.filter(m=>m.weekly_id===selected?.id&&m.played);const last=games.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));const snap=last.map(m=>m.home_id===payload.champion_id?m.home_coach_name:m.away_id===payload.champion_id?m.away_coach_name:null).find(Boolean);payload.champion_coach_name=snap||cp?.coach_name||null;}let savedId=selected?.id;if(selected){const {error}=await sb.from('weekly_editions').update(payload).eq('id',selected.id);if(error)return say(traduz(error),false);}else{const {data,error}=await sb.from('weekly_editions').insert(payload).select('id').single();if(error)return say(traduz(error),false);savedId=data.id;selWeekly=savedId;}const {error:delErr}=await sb.from('weekly_participants').delete().eq('weekly_id',savedId);if(delErr)return say(traduz(delErr),false);if(roster.length){const {error:insErr}=await sb.from('weekly_participants').insert(roster.map(participant_id=>({weekly_id:savedId,participant_id})));if(insErr)return say(traduz(insErr),false);}say(selected?'Edição semanal atualizada.':'Edição semanal criada.',true);await refresh();return;}
    if(t.id==='wDelete'&&selected){if(D.matches.some(m=>m.weekly_id===selected.id))return say('Exclua primeiro as partidas vinculadas a esta edição.',false);if(confirm('Excluir esta edição semanal?')){selWeekly=null;return run(sb.from('weekly_editions').delete().eq('id',selected.id),'Edição excluída.');}}
  };
}

// ---------- Times: participantes + jogadores + histórico individual ----------
function histPart(p) {
  const ms = D.matches.filter(m => m.played && (m.home_id === p.id || m.away_id === p.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ms.length) return '<div class="empty">Sem partidas disputadas.</div>';
  return ms.map(m => { const home = m.home_id === p.id, g = home ? m.home_score : m.away_score, c = home ? m.away_score : m.home_score, r = g > c ? ['V', 'res-w'] : g < c ? ['D', 'res-l'] : ['E', 'res-d']; return `<div class="result-row"><div class="round-label ${m.category==='friendly'||m.category==='weekly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':m.category==='weekly'?'SEM':pad(m.round?.number||0)}</div><div class="result-teams">${esc(m.home.name)} x ${esc(m.away.name)}<small>${m.category==='friendly'?'Amistoso':m.category==='weekly'?esc(m.weekly?.name||'Semanal'):esc(roundLabel(m.round))+' • '}${fd(m.date)}</small></div><div class="result-score">${m.home_score} – ${m.away_score} <span class="${r[1]}">${r[0]}</span></div></div>`; }).join('');
}
function vTimes() {
  const st = Object.fromEntries(standings(D.participants, D.matches).map(x => [x.p.id, x]));
  const g = {}, a = {}; D.events.forEach(e => { g[e.scorer_id] = (g[e.scorer_id] || 0) + 1; if (e.assist_id) a[e.assist_id] = (a[e.assist_id] || 0) + 1; });
  const panel = p => {
    const pls = D.players.filter(x => x.participant_id === p.id);
    const coachRows = (D.coachHistory||[]).filter(h=>h.participant_id===p.id).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||'')).map(h=>`<div class="player"><div><b>${esc(h.coach_name)}</b><small>${h.started_on||'—'} até ${h.ended_on||'atual'}</small></div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`).join('') || '<div class="empty">Nenhum técnico no histórico.</div>';
    return `<tr><td colspan="4" style="text-align:left;background:#f6f8f9;padding:10px 12px"><div class="cols3" style="gap:20px"><div><div class="eyebrow" style="margin-bottom:6px">Jogadores (gol / assistência)</div>${pls.map(x => `<div class="player"><div><b>${esc(x.name)}</b></div><span>${g[x.id] || 0} / ${a[x.id] || 0} <button class="btn sm" data-je="${x.id}">EDITAR</button> <button class="btn sm danger" data-jd="${x.id}">EXCLUIR</button></span></div>`).join('') || '<div class="empty">Nenhum jogador.</div>'}<div class="inline" style="margin-top:8px"><input id="jn${p.id}" placeholder="Nome do jogador" maxlength="60"><button class="btn sm primary" data-jadd="${p.id}">ADICIONAR</button></div></div><div><div class="eyebrow" style="margin-bottom:6px">Histórico de técnicos</div>${coachRows}<small class="admin-help">A data final é o primeiro dia em que o técnico já não estava no time. As partidas datadas desse período serão atribuídas a ele.</small><div class="inline" style="margin-top:10px;align-items:end"><div class="field"><label>Técnico anterior</label><input id="hcn${p.id}" placeholder="Nome do técnico"></div><div class="field"><label>Início</label><input id="hcs${p.id}" type="date"></div><div class="field"><label>Fim do vínculo</label><input id="hce${p.id}" type="date"></div><button class="btn sm primary" data-hadd="${p.id}">REGISTRAR PASSAGEM</button></div></div><div><div class="eyebrow" style="margin-bottom:6px">Histórico de partidas</div>${histPart(p)}</div></div></td></tr>`;
  };
  $('view').innerHTML = `<div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>CADASTRAR TIME</h2></div><div class="cardbody"><div class="inline" style="margin-top:10px"><input id="pn" maxlength="60" placeholder="Nome do time"><input id="pc" maxlength="80" placeholder="Técnico atual"><label class="field" style="min-width:190px"><span>Participa de competição atualmente?</span><select id="pactive"><option value="true" selected>Sim</option><option value="false">Não</option></select></label><button class="btn primary" id="pAdd">CADASTRAR</button></div></div></div>
  <div class="card"><div class="cardhead"><h2>Times (${D.participants.length})</h2><span class="admin-help">Abra um time para ver jogadores e histórico</span></div><div class="cardbody scroll">${D.participants.length ? `<table class="table"><thead><tr><th>TIME / TÉCNICO</th><th>J</th><th>PTS</th><th></th></tr></thead><tbody>${D.participants.map(p => `<tr><td class="club">${esc(p.name)}<small style="display:block;color:var(--muted);font-weight:500">${esc(p.coach_name || 'Sem técnico atualmente')}<span class="pill" style="margin-left:6px">${p.participates_in_competition === false ? 'FORA DA COMPETIÇÃO' : 'ATIVO'}</span></small></td><td>${st[p.id].j}</td><td>${st[p.id].pts}</td><td style="white-space:nowrap"><button class="btn sm" data-t="${p.id}">${openPart === p.id ? 'FECHAR' : 'ABRIR'}</button> <button class="btn sm" data-e="${p.id}">EDITAR</button> <button class="btn sm danger" data-d="${p.id}">EXCLUIR</button></td></tr>${openPart === p.id ? panel(p) : ''}`).join('')}</tbody></table>` : '<div class="empty">Cadastre o primeiro time.</div>'}</div></div>`;
  $('pAdd').onclick = async () => {
    const n = $('pn').value.trim(), coach_name = $('pc').value.trim() || null, participates_in_competition = $('pactive').value === 'true';
    if (!n) return;
    const { data, error } = await sb.from('participants').insert({ name: n, coach_name: null, participates_in_competition }).select('id').single();
    if (error) return say(traduz(error), false);
    if (coach_name) {
      const { error: ce } = await sb.rpc('assign_team_coach', { p_participant_id: data.id, p_coach_name: coach_name, p_start_date: today() });
      if (ce) return say('Time criado, mas não foi possível registrar o técnico: ' + traduz(ce), false);
    }
    say('Time cadastrado' + (coach_name ? ' com técnico responsável.' : '.'), true); await refresh();
  };
  $('view').onclick = async e => {
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.t) { openPart = openPart === d.t ? null : d.t; return vTimes(); }
    if (d.e) {
      const p = D.participants.find(x => x.id === d.e), n = prompt('Nome do time:', p.name); if (n === null) return;
      const c = prompt('Técnico atual do time (deixe em branco se não houver):', p.coach_name || ''); if (c === null) return;
      const active = prompt('Participa de competição atualmente? Digite SIM ou NÃO:', p.participates_in_competition === false ? 'NÃO' : 'SIM'); if (active === null) return;
      const participates_in_competition = !/^n(ão|ao)?$/i.test(active.trim());
      const { error: ne } = await sb.from('participants').update({ name: n.trim(), participates_in_competition }).eq('id', p.id);
      if (ne) return say(traduz(ne), false);
      const { error: ce } = await sb.rpc('assign_team_coach', { p_participant_id: p.id, p_coach_name: c.trim() || null, p_start_date: today() });
      if (ce) return say('Nome do time atualizado, mas houve falha ao registrar o técnico: ' + traduz(ce), false);
      say('Time, técnico e participação atualizados. O vínculo anterior foi preservado no histórico.', true); await refresh();
    }
    if (d.d && confirm(`EXCLUIR PARTICIPANTE DE TESTE?\n\nSerão removidos também os jogos, gols, jogadores, inscrições semanais e histórico de técnico vinculados a este participante. Esta ação é definitiva e não afeta os demais participantes.`)) {
      const { error } = await sb.rpc('purge_test_participant', { p_participant_id: d.d });
      if (error) return say('Não foi possível excluir o participante: ' + traduz(error), false);
      say('Participante de teste e seus dados vinculados foram excluídos.', true);
      await refresh();
    }
    if (d.hadd) {
      const coach_name=$('hcn'+d.hadd).value.trim(), started_on=$('hcs'+d.hadd).value, ended_on=$('hce'+d.hadd).value;
      if(!coach_name||!started_on||!ended_on)return say('Informe o técnico e as datas de início e fim da passagem.',false);
      if(ended_on<started_on)return say('A data final não pode ser anterior à inicial.',false);
      const {error}=await sb.rpc('register_past_team_coach', { p_participant_id:d.hadd, p_coach_name:coach_name, p_start_date:started_on, p_end_date:ended_on });
      if(error)return say(traduz(error),false);
      say('Passagem anterior registrada; partidas desse período vinculadas ao técnico.',true);await refresh();
    }
    if (d.jadd) { const n = $('jn' + d.jadd).value.trim(); if (n) run(sb.from('players').insert({ name: n, participant_id: d.jadd }), 'Jogador cadastrado.'); }
    if (d.je) { const p = D.players.find(x => x.id === d.je), n = prompt('Novo nome:', p.name); if (n && n.trim() && n.trim() !== p.name) run(sb.from('players').update({ name: n.trim() }).eq('id', p.id), 'Nome atualizado.'); }
    if (d.jd && confirm('Excluir este jogador? Só é possível se ele não tiver gols/assistências.')) run(sb.from('players').delete().eq('id', d.jd), 'Jogador excluído.');
  };
}


// ---------- Importação em lote de partidas CSV / Excel ----------
function parseImportDate(value) {
  const v = String(value ?? '').trim(); if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const br = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;
  if (/^\d+(\.\d+)?$/.test(v) && Number(v) > 20000 && window.XLSX?.SSF) {
    const d = XLSX.SSF.parse_date_code(Number(v));
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return false;
}
function parseImportMatrix(rows) {
  const norm = x => String(x ?? '').trim();
  const data = rows.filter(r => r.some(x => norm(x))).map(r => r.map(norm));
  if (data.length && /categoria/i.test(data[0][0]) && /confronto|mandante/i.test(data[0][1])) data.shift();
  return data.map((r,i)=>{
    const cat=(r[0]||'Oficial').toLowerCase().startsWith('amist')?'friendly':'official';
    const matchup=r[1]||'', inline= /\s+x\s+/i.test(matchup); let home='',away='';
    if(inline){[home,away]=matchup.split(/\s+x\s+/i).map(norm)}
    else if(r.length>=4){home=r[1];away=r[2];}
    const scoreCell=inline?r[2]:r[3];
    const score=String(scoreCell||'').match(/^(\d+)\s*[-–:x]\s*(\d+)$/);
    const rawDate=inline?r[3]:r[4], date=parseImportDate(rawDate);
    return {line:i+2,category:cat,home,away,home_score:score?+score[1]:null,away_score:score?+score[2]:null,date:date||null,error:!home||!away?'Informe o confronto no formato Time A x Time B.':home.toLowerCase()===away.toLowerCase()?'Os participantes precisam ser diferentes.':!score?'Placar inválido; use 1-0.':rawDate&&!date?'Data inválida; use DD/MM/AAAA ou AAAA-MM-DD.':''};
  });
}
function vImport(){
 $('view').innerHTML=`<div class="card"><div class="cardhead"><h2>IMPORTAR PARTIDAS EM LOTE</h2></div><div class="cardbody"><p class="admin-help">Envie um arquivo .xlsx, .xls ou .csv. Uma linha por partida, com as colunas: Categoria | Confronto | Placar | Data (opcional).</p><p class="admin-help">Exemplo: Amistoso | Time A x Time B | 1-0 | 17/11/2026. Informe a data para que o histórico de técnicos possa identificar quem comandou o time em cada partida.</p><div class="inline" style="margin:12px 0"><input type="file" id="importFile" accept=".xlsx,.xls,.csv"><button class="btn" id="sampleCsv">BAIXAR MODELO CSV</button></div><div id="importPreview"></div></div></div>`;
 $('sampleCsv').onclick=()=>{const blob=new Blob(['Categoria;Confronto;Placar;Data\nAmistoso;Time A x Time B;1-0;17/11/2026\nOficial;Time C x Time D;2-2;17/11/2026'],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='modelo_importacao_cbpes.csv';a.click();URL.revokeObjectURL(a.href);};
 $('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{let rows;if(/\.csv$/i.test(f.name)){const txt=await f.text();const sep=txt.includes(';')?';':',';rows=txt.split(/\r?\n/).map(x=>x.split(sep));}else{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});}importRows=parseImportMatrix(rows);showImportPreview();}catch(err){say('Não foi possível ler o arquivo: '+err.message,false);}};
}
function showImportPreview(){
 const root=$('importPreview'), seen=new Map();importRows.forEach(r=>[r.home,r.away].forEach(n=>{if(n){const key=n.toLowerCase();seen.set(key,(seen.get(key)||0)+1)}}));
 const existing=new Map(D.participants.map(p=>[p.name.toLowerCase(),p.name]));
 const names=[...new Set(importRows.flatMap(r=>[r.home,r.away]).filter(Boolean))];
 const missing=names.filter(n=>!existing.has(n.toLowerCase()));
 const errors=importRows.filter(r=>r.error);
 const duplicates=names.filter(n=>names.some(x=>x!==n&&x.toLowerCase()!==n.toLowerCase()&&(x.toLowerCase().includes(n.toLowerCase())||n.toLowerCase().includes(x.toLowerCase()))));
 root.innerHTML=`<div class="admin-help">${importRows.length} partidas • ${missing.length} participantes novos • ${errors.length} linha(s) com erro</div>${duplicates.length?`<div class="msg err" style="margin-top:8px">Atenção: nomes parecidos detectados: ${duplicates.map(esc).join(', ')}. Confira se são participantes diferentes antes de importar.</div>`:''}<div class="scroll"><table class="table"><thead><tr><th>Linha</th><th>Categoria</th><th>Mandante</th><th>Placar</th><th>Visitante</th><th>Data</th><th>Validação</th></tr></thead><tbody>${importRows.map(r=>`<tr><td>${r.line}</td><td>${r.category==='friendly'?'Amistoso':'Oficial'}</td><td>${esc(r.home)}</td><td>${r.home_score??'—'} x ${r.away_score??'—'}</td><td>${esc(r.away)}</td><td>${r.date?fd(r.date):'—'}</td><td>${r.error?`<span class="res-l">${esc(r.error)}</span>`:'<span class="res-w">OK</span>'}</td></tr>`).join('')}</tbody></table></div><p class="admin-help">Novos participantes: ${missing.map(esc).join(', ')||'nenhum'}.</p><button class="btn primary" id="confirmImport" ${errors.length?'disabled':''}>CONFIRMAR E IMPORTAR ${importRows.length} PARTIDAS</button>`;
 $('confirmImport').onclick=importMatches;
}
async function importMatches(){
 if(!importRows.length||importRows.some(r=>r.error))return say('Corrija os erros antes de importar.',false);
 if(!confirm(`Importar ${importRows.length} partidas? Amistosos serão cadastrados sem rodada; partidas oficiais receberão rodadas de importação.`))return;
 const names=[...new Set(importRows.flatMap(r=>[r.home,r.away]))], ids=new Map(D.participants.map(p=>[p.name.toLowerCase(),p.id]));
 for(const n of names){if(!ids.has(n.toLowerCase())){const {data,error}=await sb.from('participants').insert({name:n}).select('id').single();if(error)return say('Falha ao criar participante '+n+': '+traduz(error),false);ids.set(n.toLowerCase(),data.id);}}
 let number=D.rounds.length?Math.max(...D.rounds.map(r=>r.number))+1:1;
 // Cada partida recebe sua própria rodada para permitir confrontos repetidos no histórico.
 for(let i=0;i<importRows.length;i++){
   const r=importRows[i]; let round_id=null;
   if(r.category==='official'){const {data:rd,error:re}=await sb.from('rounds').insert({number:number++,stage:'liga',name:`Importação histórica ${i+1}`,date:r.date}).select('id').single();if(re)return say('Falha ao criar rodada da partida '+(i+1)+': '+traduz(re),false);round_id=rd.id;}
   const {error}=await sb.from('matches').insert({round_id,home_id:ids.get(r.home.toLowerCase()),away_id:ids.get(r.away.toLowerCase()),home_score:r.home_score,away_score:r.away_score,played_on:r.date,category:r.category});
   if(error)return say('Falha ao importar a partida '+(i+1)+': '+traduz(error),false);
 }
 importRows=[];say('Importação concluída com sucesso.',true);await refresh();tab='jogos';render();
}

// ---------- Estatísticas ----------
function vEst() {
  const S = stats(D), pl = (t, rows, f) => `<div class="card"><div class="cardhead"><h2>${t}</h2></div><div class="cardbody">${rows.length ? rows.slice(0, 10).map((x, i) => `<div class="player"><div><b>${i + 1}. ${esc(x.name)}</b><small>${esc(x.team.name)}</small></div><span class="number">${f(x)}</span></div>`).join('') : '<div class="empty">Sem registros.</div>'}</div></div>`;
  $('view').innerHTML = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>VISÃO GERAL</h2></div><div class="cardbody"><div class="stats"><div class="stat"><b>${S.jogos}</b><span>Partidas</span></div><div class="stat"><b>${S.gols}</b><span>Gols</span></div><div class="stat"><b>${fmt1(S.media)}</b><span>Gols/jogo</span></div></div></div></div>
  <div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>DESEMPENHO GERAL (TODAS AS FASES)</h2></div><div class="cardbody scroll"><table class="table"><thead><tr><th>#</th><th>PARTICIPANTE</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th></tr></thead><tbody>${S.st.map((x, i) => `<tr><td>${i + 1}</td><td class="club">${esc(x.p.name)}</td><td class="points">${x.pts}</td><td>${x.j}</td><td>${x.v}</td><td>${x.e}</td><td>${x.d}</td><td>${x.gp}</td><td>${x.gc}</td><td>${sgf(x.sg)}</td><td>${x.ap}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="cols3">${pl('ARTILHARIA', S.artilheiros, x => x.g)}${pl('ASSISTÊNCIAS', S.garcons, x => x.a)}${pl('G+A', S.part, x => x.ga)}</div>
  <p class="admin-help">Tudo é calculado automaticamente a partir das partidas e dos gols lançados; não há lançamento manual, então não há duplicidade.</p>`;
}

// ---------- Técnicos: perfis, retrospecto e sala de troféus ----------
const coachKey = n => String(n || '').trim().toLocaleLowerCase();
function allCoachNames() {
  const names = new Map();
  const add = n => { const clean = String(n || '').trim(); if (clean) names.set(coachKey(clean), clean); };
  (D.coachProfiles || []).forEach(x => add(x.name));
  D.participants.forEach(p => add(p.coach_name));
  (D.coachHistory || []).forEach(h => add(h.coach_name));
  D.matches.forEach(m => { add(m.home_coach_name); add(m.away_coach_name); });
  (D.weeklies || []).forEach(w => add(w.champion_coach_name));
  (D.coachTrophies || []).forEach(t => add(t.coach_name));
  return [...names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function coachRecord(name) {
  const key = coachKey(name), matches = D.matches.filter(m => m.played && (coachKey(m.home_coach_name) === key || coachKey(m.away_coach_name) === key));
  let wins=0,draws=0,losses=0;
  matches.forEach(m=>{
    const home=coachKey(m.home_coach_name)===key;
    const own=home?m.home_score:m.away_score,opp=home?m.away_score:m.home_score;
    if(own>opp)wins++;else if(own<opp)losses++;else draws++;
  });
  return {matches,wins,draws,losses};
}
function coachCurrentTeam(name) { return D.participants.find(p=>coachKey(p.coach_name)===coachKey(name)) || null; }
async function syncAutomaticCoachTrophies() {
  const awards=[];
  const officialChampion=champion(D);
  if(officialChampion){
    const matches=D.matches.filter(m=>m.played&&(m.home_id===officialChampion.id||m.away_id===officialChampion.id)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const snapshot=matches.map(m=>m.home_id===officialChampion.id?m.home_coach_name:m.away_coach_name).find(Boolean);
    const coach=snapshot;
    if(coach) awards.push({coach_name:coach,title:'Campeão',competition_name:`${D.settings.name}${D.settings.season?' • '+D.settings.season:''}`,source_type:'official',source_key:`official:${D.settings.id||D.settings.name}:${D.settings.season||''}`,team_name:officialChampion.name,awarded_on:matches[0]?.date||today(),notes:'Título reconhecido automaticamente pelo resultado do campeonato oficial.'});
  }
  (D.weeklies||[]).forEach(w=>{
    if(!w.champion_id)return;
    const team=D.participants.find(p=>p.id===w.champion_id);
    const games=D.matches.filter(m=>m.weekly_id===w.id&&m.played).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const snapshot=games.map(m=>m.home_id===w.champion_id?m.home_coach_name:m.away_id===w.champion_id?m.away_coach_name:null).find(Boolean);
    const coach=w.champion_coach_name||snapshot;
    if(coach) awards.push({coach_name:coach,title:'Campeão semanal',competition_name:w.name,source_type:'weekly',source_key:`weekly:${w.id}`,team_name:team?.name||'',awarded_on:w.event_date,notes:'Título reconhecido automaticamente a partir do campeão da edição semanal.'});
  });
  for(const award of awards){
    const {error}=await sb.from('coach_trophies').upsert(award,{onConflict:'source_key'});
    if(error) throw error;
  }
  const validWeeklyKeys=new Set(awards.filter(a=>a.source_type==='weekly').map(a=>a.source_key));
  for(const old of (D.coachTrophies||[]).filter(t=>t.source_type==='weekly'&&!validWeeklyKeys.has(t.source_key))){
    const {error}=await sb.from('coach_trophies').delete().eq('id',old.id).eq('source_type','weekly');
    if(error) throw error;
  }
}
function vTechnicians() {
  const names=allCoachNames();
  const profiles=D.coachProfiles||[], trophies=D.coachTrophies||[];
  const options=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const cards=names.map(name=>{
    const profile=profiles.find(p=>coachKey(p.name)===coachKey(name));
    const team=coachCurrentTeam(name), rec=coachRecord(name), titles=trophies.filter(t=>coachKey(t.coach_name)===coachKey(name));
    const history=(D.coachHistory||[]).filter(h=>coachKey(h.coach_name)===coachKey(name)).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||''));
    return `<div class="card" style="margin-bottom:12px"><div class="cardhead"><div><h2>${esc(name)}</h2><span class="admin-help">${team?'Atual: '+esc(team.name):'Sem equipe atual'} • ${rec.matches.length} jogos • ${titles.length} troféus</span></div><button class="btn sm" data-coach-profile="${encodeURIComponent(name)}">EDITAR PERFIL</button></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${rec.matches.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${rec.wins}</b><span>Vitórias</span></div><div class="stat"><b>${rec.draws}</b><span>Empates</span></div><div class="stat"><b class="res-l">${rec.losses}</b><span>Derrotas</span></div></div><p class="admin-help">${esc(profile?.bio||'Sem apresentação cadastrada.')}</p><div class="inline" style="justify-content:space-between;align-items:center"><b>Sala de troféus</b><span class="admin-help">${titles.length} conquista(s)</span></div>${titles.length?titles.map(t=>`<div class="player"><div><b>🏆 ${esc(t.title)}</b><small>${esc(t.competition_name||'Conquista')} • ${fd(t.awarded_on)}${t.team_name?' • '+esc(t.team_name):''}</small></div><span class="pill">${t.source_type==='manual'?'MANUAL':t.source_type==='weekly'?'SEMANAL':'OFICIAL'}</span>${t.source_type==='manual'?`<button class="btn sm danger" data-trophy-delete="${t.id}">EXCLUIR</button>`:''}</div>`).join(''):'<div class="empty">Nenhum troféu registrado.</div>'}<details style="margin-top:10px"><summary class="admin-help" style="cursor:pointer">Ver trajetória de equipes</summary>${history.length?history.map(h=>{const p=D.participants.find(x=>x.id===h.participant_id);return `<div class="player"><b>${esc(p?.name||'Equipe removida')}</b><small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small></div>`;}).join(''):'<div class="empty">Sem passagens detalhadas.</div>'}</details></div></div>`;
  }).join('');
  $('view').innerHTML=`<div class="card" style="margin-bottom:14px"><div class="cardhead"><h2>CADASTRAR / ATUALIZAR TÉCNICO</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>NOME DO TÉCNICO</label><input id="coachName" maxlength="80" placeholder="Nome do técnico"></div><div class="field" style="min-width:260px;flex:1"><label>APRESENTAÇÃO / BIOGRAFIA</label><input id="coachBio" maxlength="500" placeholder="Informações sobre a trajetória (opcional)"></div><button class="btn primary" id="coachSave">SALVAR PERFIL</button></div><p class="admin-help">Os técnicos vinculados aos times e aos históricos já aparecem automaticamente nesta lista. Use este cadastro para criar ou complementar o perfil público.</p></div></div>
  <div class="card" style="margin-bottom:14px"><div class="cardhead"><h2>REGISTRAR CONQUISTA MANUAL</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>TÉCNICO</label><select id="trophyCoach"><option value="">Selecione</option>${options}</select></div><div class="field"><label>TÍTULO / PREMIAÇÃO</label><input id="trophyTitle" maxlength="100" placeholder="Ex.: Campeão da Copa de Verão"></div><div class="field"><label>COMPETIÇÃO / EVENTO</label><input id="trophyCompetition" maxlength="100" placeholder="Nome da competição"></div><div class="field"><label>DATA</label><input id="trophyDate" type="date" value="${today()}"></div><div class="field"><label>EQUIPE</label><input id="trophyTeam" maxlength="80" placeholder="Equipe (opcional)"></div><button class="btn primary" id="trophyAdd">ADICIONAR TROFÉU</button></div><div class="field" style="margin-top:8px"><label>OBSERVAÇÃO (opcional)</label><input id="trophyNotes" maxlength="300" style="width:100%" placeholder="Detalhes da conquista"></div></div></div>
  <div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>TÍTULOS AUTOMÁTICOS</h2><span class="admin-help">Atualizados conforme os campeões registrados</span></div><div class="cardbody"><p class="admin-help">O sistema reconhece o campeão do campeonato oficial atual e os campeões das edições semanais. O técnico é identificado pelo registro histórico da equipe no momento da conquista.</p><button class="btn" id="coachSync">SINCRONIZAR TÍTULOS AUTOMÁTICOS</button></div></div>
  <div class="card"><div class="cardhead"><h2>TÉCNICOS CADASTRADOS (${names.length})</h2></div><div class="cardbody">${cards||'<div class="empty">Nenhum técnico encontrado. Cadastre um perfil ou informe o técnico na aba Times.</div>'}</div></div>`;
  $('view').onclick=async e=>{
    const t=e.target.closest('button');if(!t)return;
    if(t.id==='coachSave'){
      const name=$('coachName').value.trim(),bio=$('coachBio').value.trim();if(!name)return say('Informe o nome do técnico.',false);
      const {error}=await sb.from('coach_profiles').upsert({name,bio},{onConflict:'name'});if(error)return say(traduz(error),false);say('Perfil do técnico salvo.',true);return refresh();
    }
    if(t.id==='trophyAdd'){
      const coach=$('trophyCoach').value,title=$('trophyTitle').value.trim();if(!coach||!title)return say('Selecione o técnico e informe o título.',false);
      const {error}=await sb.from('coach_trophies').insert({coach_name:coach,title,competition_name:$('trophyCompetition').value.trim(),source_type:'manual',team_name:$('trophyTeam').value.trim(),awarded_on:$('trophyDate').value||null,notes:$('trophyNotes').value.trim()});if(error)return say(traduz(error),false);say('Conquista manual adicionada.',true);return refresh();
    }
    if(t.id==='coachSync'){try{await syncAutomaticCoachTrophies();say('Títulos automáticos atualizados.',true);return refresh();}catch(err){return say(traduz(err),false);}}
    if(t.dataset.coachProfile){const name=decodeURIComponent(t.dataset.coachProfile),profile=profiles.find(p=>coachKey(p.name)===coachKey(name));const bio=prompt('Apresentação / biografia de '+name+':',profile?.bio||'');if(bio===null)return;const {error}=await sb.from('coach_profiles').upsert({name,bio},{onConflict:'name'});if(error)return say(traduz(error),false);say('Perfil atualizado.',true);return refresh();}
    if(t.dataset.trophyDelete&&confirm('Excluir esta conquista manual?')){const {error}=await sb.from('coach_trophies').delete().eq('id',t.dataset.trophyDelete).eq('source_type','manual');if(error)return say(traduz(error),false);say('Conquista manual removida.',true);return refresh();}
  };
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
