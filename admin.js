const $ = id => document.getElementById(id);
let selOfficialEdition = null;
let officialWorkspaceOpen = false;
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
$('tabs').onclick = e => { const btn=e.target.closest('button[data-t]'); if(btn){ tab=btn.dataset.t; if(tab==='jogos'){gamesSubView='matches';editingMatchId=null;matchEditorTab='result';} draft=null; render(); } };


const OPENING_EDITION_ID='16917e42-3fc8-4aca-8cdc-4c008254dbe1';
let openingAdminArchive=[],openingAdminError='';
async function loadOpeningAdminArchive(){
 const {data,error}=await sb.from('opening_tournament_archive').select('source_key,record_type,payload').eq('edition_id',OPENING_EDITION_ID).order('source_key');
 openingAdminError=error?.message||'';openingAdminArchive=error?[]:data||[];
}
function renderOpeningAdminArchive(){
 const rows=openingAdminArchive.filter(x=>x.record_type==='match');
 const groups=new Map();
 rows.forEach(x=>{const p=x.payload||{},stage=p.phase||('Rodada '+(p.round||'?'));if(!groups.has(stage))groups.set(stage,[]);groups.get(stage).push(x);});
 const summary='<div class="card"><div class="cardhead"><h2>TORNEIO DE ABERTURA — ARQUIVO OFICIAL</h2><span class="pill">'+rows.length+' JOGOS</span></div><div class="cardbody"><p class="admin-help">Arquivo histórico separado da tabela matches. Inclui fase classificatória e mata-mata.</p>'+(openingAdminError?'<p>'+esc(openingAdminError)+'</p>':'')+[...groups].map(([stage,ms])=>'<h3 style="margin:16px 0 8px">'+esc(stage).toUpperCase()+' ('+ms.length+')</h3>'+ms.map(x=>{const m=x.payload||{};return '<div class="result-row"><div class="result-teams"><b>'+esc(m.home_coach||'—')+'</b> x <b>'+esc(m.away_coach||'—')+'</b><small>'+esc(x.source_key)+'</small></div><div class="result-score">'+esc(m.home_score)+' – '+esc(m.away_score)+'</div></div>';}).join('')).join('')+'</div></div>';
 $('view').innerHTML=summary;
}

let adminCareerMatches = [];
async function refresh() { const y = window.scrollY; try { D = await load(); const archiveResponse=await sb.from('career_matches').select('*'); if(archiveResponse.error)throw archiveResponse.error; adminCareerMatches=archiveResponse.data||[]; await loadOpeningAdminArchive(); await syncAutomaticCoachTrophies(); const {data: trophies, error} = await sb.from('coach_trophies').select('*'); if (error) throw error; D.coachTrophies = trophies || []; } catch (e) { return say(traduz(e), false); } if (firstLoad) { firstLoad = false; if (D.rounds.length) tab = 'jogos'; } render(); window.scrollTo(0, y); }
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('view').onclick = null; $('view').onchange = null; $('view').onkeydown = null;
  ({ camp: vCamp, times: vTimes, coaches: vTechnicians, jogos: vJogos, est: vEst, his: vHis, import: vImport, weekly: vSemanais })[tab]();
}
const pname = id => (D.participants.find(p => p.id === id) || {}).name || '?';
const plname = id => (D.players.find(p => p.id === id) || {}).name || '?';
const opts = (list, sel, label) => list.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
const field = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;
const askPhaseType = current => { const map={1:'groups',2:'knockout',3:'final',4:'third_place',5:'other',6:'playoff'}, labels={groups:'Fase de grupos / classificatória',knockout:'Mata-mata',final:'Final',third_place:'Disputa de 3º lugar',other:'Outra fase',playoff:'Playoff classificatório'}; const cur=Object.keys(map).find(k=>map[k]===current)||'2'; const answer=prompt('Tipo da fase:\n1 - Fase de grupos / classificatória\n2 - Mata-mata\n3 - Final\n4 - Disputa de 3º lugar\n5 - Outra fase\n6 - Playoff classificatório',cur); if(answer===null)return null; const type=map[answer.trim()]; return type?{type,label:labels[type]}:false; };
const askPlayoffConfig = current => { const c=current||{}; const direct=prompt('Quantos participantes avançam DIRETAMENTE para a próxima fase?',String(c.direct??2)); if(direct===null)return null; const from=prompt('A partir de qual posição começa o playoff?',String(c.from??3)); if(from===null)return null; const to=prompt('Até qual posição disputa o playoff?',String(c.to??6)); if(to===null)return null; const v={direct:+direct,from:+from,to:+to}; if(!Number.isInteger(v.direct)||v.direct<1||!Number.isInteger(v.from)||v.from<=v.direct||!Number.isInteger(v.to)||v.to<v.from||((v.to-v.from+1)%2)!==0){say('Configuração inválida. Use vagas diretas positivas e uma faixa par de participantes no playoff.',false);return false;} return v; };

// ---------- Campeonato (formato + calendário) ----------
function capture() {
  if (!$('cn') || !draft) return;
  draft.name = $('cn').value.trim() || 'CBPES'; draft.season = $('cs').value.trim();
  draft.config.ptsW = +$('pw').value || 3; draft.config.ptsD = +$('pd').value;
  ['legs', 'koLegs', 'groups', 'qual', 'groupLegs'].forEach(k => { const e = $('o_' + k); if (e) draft.config[k] = +e.value; });
  if ($('o_finalSingle')) draft.config.finalSingle = $('o_finalSingle').checked;
}
async function generateConfiguredPlayoff(phase) {
  const list=(D.phases||[]).filter(p=>p.competition_type===phase.competition_type && (phase.competition_type!=='weekly'||p.weekly_id===phase.weekly_id)).sort((a,b)=>a.sort_order-b.sort_order);
  const ix=list.findIndex(p=>p.id===phase.id), source=list.slice(0,ix).reverse().find(p=>p.counts_in_standings);
  if(!source)return say('Crie uma fase classificatória antes do playoff.',false);
  const cfg=phase.playoff_config||{direct:2,from:3,to:6};
  const matches=D.matches.filter(m=>m.category===(phase.competition_type==='weekly'?'weekly':'official') && (m.round?.phase_id===source.id || (m.category==='weekly' && (D.weeklyRounds||[]).some(r=>r.id===m.weekly_round_id&&r.phase_id===source.id))));
  const ids=[...new Set(matches.flatMap(m=>[m.home_id,m.away_id]))];
  const table=standings(D.participants.filter(p=>ids.includes(p.id)),matches,{ptsW:3,ptsD:1});
  if(matches.some(m=>!m.played))return say('Ainda há partidas sem resultado na fase classificatória. Finalize os jogos antes de gerar o playoff.',false);
  const entrants=table.slice(cfg.from-1,cfg.to);
  if(entrants.length!==(cfg.to-cfg.from+1)||entrants.length<2||entrants.length%2)return say('A faixa configurada não tem participantes suficientes ou não forma confrontos pares.',false);
  const pairs=[];for(let i=0;i<entrants.length/2;i++)pairs.push([entrants[i].p.id,entrants[entrants.length-1-i].p.id]);
  if(D.matches.some(m=>(m.round?.phase_id===phase.id || (m.category==='weekly' && (D.weeklyRounds||[]).some(r=>r.id===m.weekly_round_id&&r.phase_id===phase.id)))))return say('Esta fase já possui partidas. Para refazer, exclua primeiro as rodadas e partidas existentes.',false);
  if(phase.competition_type==='official'){
    const number=(D.rounds.length?Math.max(...D.rounds.map(r=>r.number)):0)+1;
    const {data:r,error:re}=await sb.from('rounds').insert({number,stage:'mata',phase_id:phase.id,name:phase.name}).select('id').single();if(re)return say(traduz(re),false);
    const {error}=await sb.from('matches').insert(pairs.map(([home_id,away_id])=>({round_id:r.id,home_id,away_id,category:'official'})));if(error)return say(traduz(error),false);
  }else{
    const rounds=(D.weeklyRounds||[]).filter(r=>r.weekly_id===phase.weekly_id);const number=(rounds.length?Math.max(...rounds.map(r=>r.number)):0)+1;
    const {data:r,error:re}=await sb.from('weekly_rounds').insert({weekly_id:phase.weekly_id,number,name:phase.name,phase_id:phase.id}).select('id').single();if(re)return say(traduz(re),false);
    const {error}=await sb.from('matches').insert(pairs.map(([home_id,away_id])=>({round_id:null,weekly_round_id:r.id,weekly_id:phase.weekly_id,home_id,away_id,category:'weekly'})));if(error)return say(traduz(error),false);
  }
  say(`Playoff gerado automaticamente: ${pairs.length} confronto(s). Você ainda pode ajustar os jogos na aba Jogos.`,true);await refresh();
}
async function generateNextFromPlayoff(nextPhase) {
  const list=(D.phases||[]).filter(p=>p.competition_type===nextPhase.competition_type && (nextPhase.competition_type!=='weekly'||p.weekly_id===nextPhase.weekly_id)).sort((a,b)=>a.sort_order-b.sort_order);
  const ix=list.findIndex(p=>p.id===nextPhase.id), prev=list[ix-1];if(!prev||prev.phase_type!=='playoff')return say('A fase anterior precisa ser um playoff.',false);
  const cfg=prev.playoff_config||{direct:2,from:3,to:6};
  const source=list.slice(0,ix-1).reverse().find(p=>p.counts_in_standings);if(!source)return say('Não encontrei a fase classificatória de origem.',false);
  const category=nextPhase.competition_type==='weekly'?'weekly':'official';
  const sourceMatches=D.matches.filter(m=>m.category===category&&(m.round?.phase_id===source.id || (m.category==='weekly' && (D.weeklyRounds||[]).some(r=>r.id===m.weekly_round_id&&r.phase_id===source.id)))), ids=[...new Set(sourceMatches.flatMap(m=>[m.home_id,m.away_id]))];
  const table=standings(D.participants.filter(p=>ids.includes(p.id)),sourceMatches,{ptsW:3,ptsD:1});
  const direct=table.slice(0,cfg.direct).map(x=>({id:x.p.id,seed:x.j?table.indexOf(x)+1:99}));
  const playoffMatches=D.matches.filter(m=>m.category===category&&(m.round?.phase_id===prev.id || (m.category==='weekly' && (D.weeklyRounds||[]).some(r=>r.id===m.weekly_round_id&&r.phase_id===prev.id))));
  if(!playoffMatches.length||playoffMatches.some(m=>!m.played))return say('Finalize todos os confrontos do playoff antes de avançar.',false);
  const winners=tiesOf(playoffMatches).map(t=>t.winner).filter(Boolean).map(p=>({id:p.id,seed:table.findIndex(x=>x.p.id===p.id)+1}));
  if(winners.length!==(cfg.to-cfg.from+1)/2)return say('Não foi possível identificar todos os vencedores do playoff.',false);
  const seeds=[...direct,...winners].sort((a,b)=>a.seed-b.seed);if(seeds.length<2||seeds.length%2)return say('A quantidade de classificados não forma uma chave equilibrada.',false);
  const pairs=[];for(let i=0;i<seeds.length/2;i++)pairs.push([seeds[i].id,seeds[seeds.length-1-i].id]);
  if(D.matches.some(m=>(m.round?.phase_id===nextPhase.id || (m.category==='weekly' && (D.weeklyRounds||[]).some(r=>r.id===m.weekly_round_id&&r.phase_id===nextPhase.id)))))return say('A próxima fase já possui partidas cadastradas.',false);
  if(category==='official'){
    const number=(D.rounds.length?Math.max(...D.rounds.map(r=>r.number)):0)+1;const {data:r,error:re}=await sb.from('rounds').insert({number,stage:'mata',phase_id:nextPhase.id,name:nextPhase.name}).select('id').single();if(re)return say(traduz(re),false);
    const {error}=await sb.from('matches').insert(pairs.map(([home_id,away_id])=>({round_id:r.id,home_id,away_id,category:'official'})));if(error)return say(traduz(error),false);
  }else{
    const rounds=(D.weeklyRounds||[]).filter(r=>r.weekly_id===nextPhase.weekly_id);const number=(rounds.length?Math.max(...rounds.map(r=>r.number)):0)+1;const {data:r,error:re}=await sb.from('weekly_rounds').insert({weekly_id:nextPhase.weekly_id,number,name:nextPhase.name,phase_id:nextPhase.id}).select('id').single();if(re)return say(traduz(re),false);
    const {error}=await sb.from('matches').insert(pairs.map(([home_id,away_id])=>({round_id:null,weekly_round_id:r.id,weekly_id:nextPhase.weekly_id,home_id,away_id,category:'weekly'})));if(error)return say(traduz(error),false);
  }
  say('Próxima fase gerada com os classificados diretos e vencedores do playoff.',true);await refresh();
}

// Zonas visuais independentes das regras de classificação esportiva.
function zoneManager(type,weeklyId) {
 const phases=(D.phases||[]).filter(p=>p.competition_type===type&&(type==='official'||p.weekly_id===weeklyId)&&p.counts_in_standings);
 const zones=(D.standingsZones||[]).filter(z=>z.competition_type===type&&(type==='official'||z.weekly_id===weeklyId));
 const phaseOptions=phases.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
 return `<div class="card cbpes-zones-admin"><div class="cardhead"><h2>ZONAS DA CLASSIFICAÇÃO</h2></div><div class="cardbody">
 <p class="admin-help">Defina faixas de posições, cores e legendas. Essas cores não alteram quem avança de fase. As faixas não devem se sobrepor dentro da mesma fase.</p>
 ${phases.length ? `<div class="cbpes-zone-form">
 ${field('FASE',`<select id="zonePhase">${phaseOptions}</select>`)}
 ${field('DA POSIÇÃO',`<input id="zoneFrom" type="number" min="1" value="1">`)}
 ${field('ATÉ A POSIÇÃO',`<input id="zoneTo" type="number" min="1" value="2">`)}
 ${field('LEGENDA',`<input id="zoneLabel" maxlength="80" placeholder="Ex.: Classificados">`)}
 ${field('COR',`<input id="zoneColor" type="color" value="#15945a">`)}
 <button class="btn primary" data-zone-add="1">ADICIONAR ZONA</button></div>`:'<p class="admin-help">Cadastre primeiro uma fase classificatória para configurar as zonas.</p>'}
 ${phases.map(p=>{const list=zones.filter(z=>z.phase_id===p.id).sort((a,b)=>a.position_start-b.position_start);return `<div class="cbpes-zone-phase"><b>${esc(p.name)}</b>${list.length?list.map(z=>`<div class="cbpes-zone-item"><span class="cbpes-zone-swatch" style="background:${z.color}"></span><span>${z.position_start===z.position_end?z.position_start+'º':z.position_start+'º–'+z.position_end+'º'} — ${esc(z.label)}</span><button class="btn sm" data-zone-edit="${z.id}">EDITAR</button><button class="btn sm danger" data-zone-del="${z.id}">EXCLUIR</button></div>`).join(''):'<small class="admin-help">Sem zonas cadastradas.</small>'}</div>`}).join('')}
 </div></div>`;
}
async function zoneAction(d,type,weeklyId) {
 if(d.zoneDel){if(!confirm('Excluir esta zona da tabela?'))return;return run(sb.from('standings_zones').delete().eq('id',d.zoneDel),'Zona excluída.');}
 const old=d.zoneEdit?(D.standingsZones||[]).find(z=>String(z.id)===String(d.zoneEdit)):null;
 if(d.zoneEdit&&!old)return;
 if(!d.zoneAdd&&!d.zoneEdit)return;
 let phaseId,from,to,label,color;
 if(old){
  phaseId=old.phase_id;
  const a=prompt('Posição inicial:',old.position_start);if(a===null)return;from=Number(a);
  const b=prompt('Posição final:',old.position_end);if(b===null)return;to=Number(b);
  const c=prompt('Legenda:',old.label);if(c===null)return;label=c.trim();
  const e=prompt('Cor hexadecimal (#RRGGBB):',old.color);if(e===null)return;color=e.trim();
 }else{
  phaseId=$('zonePhase')?.value;from=Number($('zoneFrom')?.value);to=Number($('zoneTo')?.value);
  label=$('zoneLabel')?.value.trim();color=$('zoneColor')?.value;
 }
 if(!phaseId||!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||!label||!/^#[0-9a-fA-F]{6}$/.test(color))return say('Informe posições válidas, legenda e cor.',false);
 const overlapping=(D.standingsZones||[]).some(z=>z.id!==old?.id&&z.phase_id===phaseId&&z.competition_type===type&&(type==='official'||z.weekly_id===weeklyId)&&from<=z.position_end&&to>=z.position_start);
 if(overlapping)return say('Esta faixa se sobrepõe a outra zona da mesma fase.',false);
 const payload={position_start:from,position_end:to,label,color};
 if(old)return run(sb.from('standings_zones').update(payload).eq('id',old.id),'Zona atualizada.');
 return run(sb.from('standings_zones').insert({...payload,competition_type:type,weekly_id:type==='weekly'?weeklyId:null,phase_id:phaseId}),'Zona adicionada.');
}
async function generateEditionGroupRounds(){
  const editionId=selOfficialEdition, edition=(D.officialEditions||[]).find(e=>String(e.id)===String(editionId));
  if(!edition)return say('Selecione uma edição.',false);
  const cfg=edition.group_config||{}, format=cfg.format||'groups', groupCount=format==='groups'?Math.max(1,Math.min(16,Number(cfg.groups)||4)):1,size=Math.max(2,Math.min(32,Number(cfg.teams_per_group)||3)),legs=Number(cfg.legs)===2?2:1;
  if(format==='custom')return say('No formato personalizado, crie as fases e os confrontos manualmente no gerenciador de fases.',false);
  const roster=(D.officialGroupTeams||[]).filter(x=>String(x.official_edition_id)===String(editionId));
  if(roster.length!==groupCount*size||new Set(roster.map(x=>x.participant_id)).size!==roster.length)return say('Salve todos os times dos grupos antes de gerar o calendário.',false);
  if(D.rounds.some(r=>String(r.official_edition_id)===String(editionId))||D.matches.some(m=>String(m.official_edition_id)===String(editionId)))return say('Esta edição já possui calendário. Revise as partidas existentes.',false);
  const groups=Array.from({length:groupCount},(_,i)=>String.fromCharCode(65+i));
  const fixturesByRound=[];
  if(format==='knockout'){
    if(size<2 || (size&(size-1))!==0)return say('No mata-mata direto, use 2, 4, 8, 16 ou 32 participantes. Para outras quantidades, configure fases e vagas manualmente.',false);
    const ids=roster.slice().sort((a,b)=>a.slot-b.slot).map(x=>x.participant_id);
    const pairs=[];for(let i=0;i<ids.length;i+=2)pairs.push([ids[i],ids[i+1]]);
    const fixtures=pairs.map(([home_id,away_id])=>({home_id,away_id,group_name:null,leg:1}));
    if(legs===2)fixtures.push(...pairs.map(([home_id,away_id])=>({home_id:away_id,away_id:home_id,group_name:null,leg:2})));
    fixturesByRound.push(fixtures);
  } else if(format==='league'){
    const ids=roster.slice().sort((a,b)=>a.slot-b.slot).map(x=>x.participant_id);
    const schedule=roundRobin(ids);
    if(legs===2)schedule.push(...schedule.map(round=>round.map(([h,a])=>[a,h])));
    schedule.forEach((round,i)=>fixturesByRound[i]=round.map(([home_id,away_id])=>({home_id,away_id,group_name:null})));
  } else for(const g of groups){
    const ids=roster.filter(x=>x.group_name===g).sort((a,b)=>a.slot-b.slot).map(x=>x.participant_id);
    if(ids.length!==size)return say('Grupo '+g+' incompleto.',false);
    const schedule=roundRobin(ids);
    if(legs===2)schedule.push(...schedule.map(round=>round.map(([h,a])=>[a,h])));
    schedule.forEach((round,i)=>{if(!fixturesByRound[i])fixturesByRound[i]=[];round.forEach(([h,a])=>fixturesByRound[i].push({home_id:h,away_id:a,group_name:g}));});
  }
  const phase=(D.phases||[]).find(p=>String(p.official_edition_id)===String(editionId)&&p.phase_type===(format==='knockout'?'knockout':'groups'));
  const base=D.rounds.length?Math.max(...D.rounds.map(r=>Number(r.number)||0)):0;
  const rounds=fixturesByRound.map((_,i)=>({number:base+i+1,stage:format==='knockout'?'mata':format==='league'?'liga':'grupos',name:(format==='knockout'?'Mata-mata — '+(size===2?'Final':size===4?'Semifinais':size===8?'Quartas de final':size===16?'Oitavas de final':'Primeira fase'):format==='league'?'Liga — Rodada '+(i+1):'Fase de grupos — Rodada '+(i+1)),official_edition_id:editionId,phase_id:phase?.id||null}));
  const count=fixturesByRound.reduce((n,x)=>n+x.length,0);
  if(!confirm('Gerar '+rounds.length+' rodadas e '+count+' partidas somente para '+edition.name+'?'))return;
  const rr=await sb.from('rounds').insert(rounds).select();if(rr.error)return say(traduz(rr.error),false);
  const fixtures=fixturesByRound.flatMap((round,i)=>round.map(x=>({...x,round_id:rr.data[i].id,official_edition_id:editionId,category:'official',leg:x.leg||1})));
  const result=await sb.from('matches').insert(fixtures);
  if(result.error){await sb.from('rounds').delete().in('id',rr.data.map(x=>x.id));return say(traduz(result.error),false);}
  say('Calendário criado: '+rounds.length+' rodadas e '+fixtures.length+' partidas nesta edição.',true);await refresh();
}
function vCamp() {
  const ocList=D.officialCompetitions||[], oeList=D.officialEditions||[];
  if(!officialWorkspaceOpen){
    $('view').innerHTML='<div class="card"><div class="cardhead"><h2>GERENCIAR COMPETIÇÕES</h2></div><div class="cardbody"><p class="admin-help">Escolha a edição que deseja editar. Cada edição possui suas próprias fases, times, grupos e partidas.</p>'+ocList.map(c=>'<div class="card" style="margin:12px 0"><div class="cardhead"><h2>'+esc(c.name)+'</h2></div><div class="cardbody"><div class="inline" style="margin-bottom:12px"><span class="pill">'+(c.is_visible===false?'OCULTA NO PORTAL':'VISÍVEL NO PORTAL')+'</span><button class="btn sm" data-toggle-comp-visibility="'+esc(c.id)+'">'+(c.is_visible===false?'EXIBIR COMPETIÇÃO':'OCULTAR COMPETIÇÃO')+'</button></div><div class="inline" style="margin-bottom:12px"><div class="field" style="flex:1"><label>URL DO LOGOTIPO</label><input type="url" data-comp-logo="'+esc(c.id)+'" value="'+esc(c.logo_url||'')+'" placeholder="https://exemplo.com/logo.png"><label style="margin-top:9px">OU ENVIAR IMAGEM (PNG, JPG, WEBP OU SVG, ATÉ 2 MB)</label><input type="file" data-comp-logo-file="'+esc(c.id)+'" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"><small>Escolha um arquivo ou use uma URL. O upload salva o logotipo automaticamente.</small></div><button class="btn primary sm" data-save-comp-logo="'+esc(c.id)+'">SALVAR LOGO</button></div>'+oeList.filter(e=>e.competition_id===c.id).map(e=>'<div class="player"><div><b>'+esc(e.name)+'</b><small>'+esc(e.season||'')+'</small></div><button class="btn primary sm" data-open-edition="'+e.id+'">GERENCIAR EDIÇÃO</button></div>').join('')+'</div></div>').join('')+'<div class="inline" style="margin-top:16px"><div class="field"><label>NOVA COMPETIÇÃO</label><input id="newOfficialComp" placeholder="Ex.: Copa CBPES"></div><button class="btn primary" id="createOfficialComp">CRIAR</button></div><div class="inline" style="margin-top:12px"><div class="field"><label>COMPETIÇÃO</label><select id="newOfficialCompPick">'+opts(ocList,null,x=>x.name)+'</select></div><div class="field"><label>NOVA EDIÇÃO</label><input id="newOfficialEdition" placeholder="Ex.: 2027"></div><div class="field"><label>TEMPORADA</label><input id="newOfficialSeason" placeholder="2027"></div><button class="btn primary" id="createOfficialEdition">CRIAR EDIÇÃO</button></div></div></div>';
    $('view').onclick=async e=>{
      const visibility=e.target.closest('[data-toggle-comp-visibility]');if(visibility){const comp=ocList.find(c=>String(c.id)===String(visibility.dataset.toggleCompVisibility));if(!comp)return;return run(sb.from('official_competitions').update({is_visible:comp.is_visible===false}).eq('id',comp.id),comp.is_visible===false?'Competição exibida no portal.':'Competição ocultada do portal.');}
      const open=e.target.closest('[data-open-edition]');if(open){selOfficialEdition=open.dataset.openEdition;officialWorkspaceOpen=true;draft=null;vCamp();return;}
      const logoBtn=e.target.closest('[data-save-comp-logo]');if(logoBtn){
        const id=logoBtn.dataset.saveCompLogo;
        const urlInput=$('view').querySelector('[data-comp-logo="'+id+'"]');
        const fileInput=$('view').querySelector('[data-comp-logo-file="'+id+'"]');
        const file=fileInput?.files?.[0], input=urlInput?.value.trim()||'';
        if(file&&input&&input!==String((ocList.find(c=>String(c.id)===String(id))||{}).logo_url||''))return say('Escolha o arquivo OU informe uma nova URL.',false);
        let url=input;
        if(file){
          const svg=file.type==='image/svg+xml'||/\.svg$/i.test(file.name);
          if((!['image/png','image/jpeg','image/webp'].includes(file.type)&&!svg)||file.size>2097152)return say('Use PNG, JPG, WebP ou SVG de até 2 MB.',false);
          let uploadFile=file;
          try{if(svg)uploadFile=validateCrestSvg(await file.text());}catch(err){return say(err.message||'SVG inválido.',false);}
          const ext=svg?'svg':file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
          const path='competitions/'+id+'/'+Date.now()+'.'+ext;
          logoBtn.disabled=true;logoBtn.textContent='ENVIANDO...';
          try{
            const {error}=await sb.storage.from('club-crests').upload(path,uploadFile,{contentType:svg?'image/svg+xml':file.type,upsert:false});
            if(error)return say('Falha no upload: '+traduz(error),false);
            url=sb.storage.from('club-crests').getPublicUrl(path).data.publicUrl;
          }finally{logoBtn.disabled=false;logoBtn.textContent='SALVAR LOGO';}
        }
        if(url&&!/^https:\/\//i.test(url))return say('Use uma URL HTTPS válida.',false);
        return run(sb.from('official_competitions').update({logo_url:url||null}).eq('id',id),url?'Logotipo salvo.':'Logotipo removido.');
      }
      if(e.target.id==='createOfficialComp'){const name=$('newOfficialComp').value.trim();if(!name)return say('Informe o nome da competição.',false);return run(sb.from('official_competitions').insert({name}),'Competição criada.');}
      if(e.target.id==='createOfficialEdition'){const name=$('newOfficialEdition').value.trim(),competition_id=$('newOfficialCompPick').value;if(!name||!competition_id)return say('Escolha a competição e informe a edição.',false);return run(sb.from('official_editions').insert({competition_id,name,season:$('newOfficialSeason').value.trim()||null}),'Edição criada.');}
    };return;
  }
  if(!oeList.some(e=>String(e.id)===String(selOfficialEdition))){officialWorkspaceOpen=false;return vCamp();}
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
  const oc=D.officialCompetitions||[], oe=D.officialEditions||[];
  if(!oe.some(e=>e.id===selOfficialEdition))selOfficialEdition=oe[0]?.id||null;
  const editionPhases=(D.phases||[]).filter(p=>p.competition_type==='official'&&p.official_edition_id===selOfficialEdition);
  const legacyPhases=(D.phases||[]).filter(p=>p.competition_type==='official'&&!p.official_edition_id);

  const compManager='<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>COMPETIÇÕES OFICIAIS</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>Nova competição</label><input id="newOfficialComp" placeholder="Ex.: Copa CBPES"></div><button class="btn primary" id="createOfficialComp">CRIAR COMPETIÇÃO</button></div><div class="inline" style="margin-top:12px"><div class="field"><label>Competição</label><select id="newOfficialCompPick">'+opts(oc,null,x=>x.name)+'</select></div><div class="field"><label>Nome da edição</label><input id="newOfficialEdition" placeholder="Ex.: Copa CBPES 2027"></div><div class="field"><label>Temporada</label><input id="newOfficialSeason" placeholder="2027"></div><button class="btn primary" id="createOfficialEdition">CRIAR EDIÇÃO</button></div><div style="margin-top:12px">'+oc.map(c=>'<div class="player"><b>'+esc(c.name)+'</b><button class="btn sm danger" data-delete-official-comp="'+c.id+'">EXCLUIR COMPETIÇÃO</button></div>'+oe.filter(e=>e.competition_id===c.id).map(e=>'<div class="player" style="padding-left:18px"><div><b>'+esc(e.name)+'</b><small>'+esc(e.season||'')+'</small></div><button class="btn sm danger" data-delete-official-edition="'+e.id+'">EXCLUIR EDIÇÃO</button></div>').join('')).join('')+'</div></div></div>';
  const duplicateManager='<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>DUPLICAR FORMATO DE COMPETIÇÃO</h2></div><div class="cardbody"><p class="admin-help">Copie as fases, a ordem, as regras dos playoffs e os modelos de confrontos de uma edição existente para uma nova edição. Não copia partidas, resultados, classificação ou participantes.</p><div class="inline"><div class="field"><label>EDIÇÃO DE ORIGEM</label><select id="cloneSourceEdition">'+oe.map(e=>'<option value="'+e.id+'">'+esc((oc.find(c=>c.id===e.competition_id)?.name||'Competição')+' — '+e.name)+'</option>').join('')+'</select></div><div class="field"><label>COMPETIÇÃO DE DESTINO</label><select id="cloneDestinationComp">'+opts(oc,null,x=>x.name)+'</select></div><div class="field"><label>NOME DA NOVA EDIÇÃO</label><input id="cloneEditionName" placeholder="Ex.: Liga Pro 2027/28"></div><div class="field"><label>TEMPORADA</label><input id="cloneEditionSeason" placeholder="2027/28"></div><button class="btn primary" id="cloneCompetitionFormat">DUPLICAR FORMATO</button></div></div></div>';
  const phaseEditionPicker='<div class="card" style="margin-bottom:12px"><div class="cardbody"><div class="field"><label>EDIÇÃO PARA GERENCIAR AS FASES</label><select id="phaseEditionPick">'+oe.map(e=>'<option value="'+e.id+'" '+(e.id===selOfficialEdition?'selected':'')+'>'+esc((oc.find(c=>c.id===e.competition_id)?.name||'Competição')+' — '+e.name)+'</option>').join('')+'</select></div></div></div>';
  const registered=(D.officialGroupTeams||[]).filter(x=>String(x.official_edition_id)===String(selOfficialEdition));
  const editionConfig=oe.find(e=>String(e.id)===String(selOfficialEdition))?.group_config||{};
  const editionFormat=editionConfig.format||'groups';
  const groupCount=editionFormat==='groups'?Math.max(1,Math.min(16,Number(editionConfig.groups)||4)):1;
  const groupSize=Math.max(2,Math.min(32,Number(editionConfig.teams_per_group)||3));
  const groupQual=Math.max(1,Math.min(groupSize,Number(editionConfig.qualifiers_per_group)||2));
  const groupLegs=Number(editionConfig.legs)===2?2:1;
  const groups=Array.from({length:groupCount},(_,i)=>String.fromCharCode(65+i));
  const availableEditionTeams=D.participants.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const groupManager='<div class="card cbpes-format-manager" style="margin-bottom:12px"><div class="cardhead"><h2>FORMATO E PARTICIPANTES DA EDIÇÃO</h2></div><div class="cardbody"><p class="admin-help">Escolha o sistema de disputa desta edição. Cada edição tem seus próprios participantes, fases e calendário.</p><div class="inline" style="margin-bottom:14px;align-items:end">'+
  '<div class="field"><label>SISTEMA DE DISPUTA</label><select id="editionFormat"><option value="groups" '+(editionFormat==='groups'?'selected':'')+'>Grupos + eliminatórias</option><option value="league" '+(editionFormat==='league'?'selected':'')+'>Pontos corridos</option><option value="knockout" '+(editionFormat==='knockout'?'selected':'')+'>Mata-mata direto</option><option value="custom" '+(editionFormat==='custom'?'selected':'')+'>Personalizado (fases manuais)</option></select></div>'+
  '<div class="field" data-format-groups><label>NÚMERO DE GRUPOS</label><input id="editionGroupCount" type="number" min="1" max="16" value="'+groupCount+'" style="width:90px"></div>'+
  '<div class="field"><label>TIMES POR GRUPO / PARTICIPANTES</label><input id="editionGroupSize" type="number" min="2" max="32" value="'+groupSize+'" style="width:90px"></div>'+
  '<div class="field" data-format-groups><label>CLASSIFICADOS POR GRUPO</label><input id="editionGroupQual" type="number" min="1" max="'+groupSize+'" value="'+groupQual+'" style="width:90px"></div>'+
  '<div class="field"><label>CONFRONTOS</label><select id="editionGroupLegs"><option value="1" '+(groupLegs===1?'selected':'')+'>Jogo único / turno único</option><option value="2" '+(groupLegs===2?'selected':'')+'>Ida e volta</option></select></div>'+
  '<button class="btn" id="applyEditionGroupConfig">SALVAR FORMATO</button></div>'+
  '<p class="admin-help" id="editionFormatHint"></p><p class="admin-help">Você pode inscrever uma equipe por vez e salvar. Os demais campos podem ficar vazios; complete os participantes quando quiser. Para gerar o calendário, todas as vagas deverão estar preenchidas.</p><div class="inline" style="margin-bottom:12px;align-items:end"><div class="field"><label>BUSCAR TIME CADASTRADO</label><input id="editionTeamSearch" placeholder="Digite o nome do time" autocomplete="off"></div><button class="btn" id="refreshEditionTeams">ATUALIZAR LISTA DE TIMES</button><span class="admin-help">'+availableEditionTeams.length+' times cadastrados (ativos e inativos)</span></div><div class="cols3" style="gap:10px">'+groups.map(g=>'<div class="card"><div class="cardhead"><h2>'+(editionFormat==='groups'?'GRUPO '+g:'PARTICIPANTES')+'</h2></div><div class="cardbody">'+Array.from({length:groupSize},(_,i)=>i+1).map(slot=>{const current=registered.find(x=>x.group_name===g&&Number(x.slot)===slot);return '<div class="field" style="margin-bottom:8px"><label>TIME '+slot+'</label><select data-group-slot="'+g+'-'+slot+'"><option value="">Selecionar time</option>'+availableEditionTeams.map(p=>'<option value="'+p.id+'" '+(String(current?.participant_id)===String(p.id)?'selected':'')+'>'+esc(p.name)+(p.participates_in_competition===false?' (inativo)':'')+'</option>').join('')+'</select></div>'}).join('')+'</div></div>').join('')+'</div><div class="inline" style="margin-top:12px"><button class="btn primary" id="saveOfficialGroups">SALVAR PARTICIPANTES</button><span class="admin-help">'+registered.length+'/'+(groupCount*groupSize)+' times inscritos'+(editionFormat==='groups'?' • '+(groupCount*groupQual)+' vagas de classificação':'')+'</span></div></div></div>';
  const legacyPhasePanel=legacyPhases.length?'<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>FASES ANTIGAS SEM EDIÇÃO</h2></div><div class="cardbody"><p class="admin-help">Associe cada fase já criada à edição selecionada acima.</p>'+legacyPhases.map(p=>'<div class="player"><b>'+esc(p.name)+'</b><button class="btn sm" data-link-legacy-phase="'+p.id+'">VINCULAR À EDIÇÃO</button></div>').join('')+'</div></div>':'';
  const currentEdition=oe.find(e=>String(e.id)===String(selOfficialEdition));
  const currentCompetition=oc.find(c=>String(c.id)===String(currentEdition?.competition_id));
  const workspaceHeader='<div class="card" style="margin-bottom:14px;border:2px solid var(--green)"><div class="cardbody"><button class="btn sm" id="backOfficialList">← TODAS AS COMPETIÇÕES</button><h2 style="margin:12px 0 3px">'+esc(currentCompetition?.name||'Competição')+' — '+esc(currentEdition?.name||'Edição')+'</h2><span class="admin-help">Você está editando exclusivamente esta edição. Fases, participantes, grupos e calendário abaixo pertencem a ela.</span></div></div>';
  const safeCalendar='<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>CALENDÁRIO DESTA EDIÇÃO</h2></div><div class="cardbody"><p class="admin-help">Geração vinculada somente à edição selecionada. Não altera calendários de outras competições.</p><button class="btn primary" id="generateEditionGroups">GERAR CALENDÁRIO DA EDIÇÃO</button><div style="margin-top:12px">'+D.rounds.filter(r=>String(r.official_edition_id)===String(selOfficialEdition)).map(r=>'<div class="player"><b>'+esc(r.name||'Rodada '+r.number)+'</b><small>'+D.matches.filter(m=>String(m.round_id)===String(r.id)).length+' jogos</small></div>').join('')+'</div></div></div>';
  $('view').innerHTML = workspaceHeader+groupManager+legacyPhasePanel+`
  <div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>FASES DA COMPETIÇÃO OFICIAL</h2><button class="btn sm primary" id="opAdd">ADICIONAR FASE</button></div><div class="cardbody">${editionPhases.slice().sort((a,b)=>a.sort_order-b.sort_order).map(p=>`<div class="player"><div><b>${esc(p.name)}</b><small>${p.phase_type==='playoff'?'Playoff • '+(p.playoff_config?.direct??2)+' diretos / posições '+(p.playoff_config?.from??3)+'–'+(p.playoff_config?.to??6):(p.counts_in_standings?'Entra na classificação':'Fora da classificação')}</small></div><span>${['playoff','knockout','final'].includes(p.phase_type)?`<button class="btn sm" data-op-template="${p.id}">MODELO DE CONFRONTOS</button> `:''}${p.phase_type==='playoff'?`<button class="btn sm primary" data-op-playoff="${p.id}">GERAR PLAYOFF</button>`:''}${p.phase_type!=='playoff' && editionPhases.slice().sort((a,b)=>a.sort_order-b.sort_order).some((q,i,arr)=>q.id===p.id&&i>0&&arr[i-1].phase_type==='playoff')?`<button class="btn sm primary" data-op-advance="${p.id}">AVANÇAR VENCEDORES</button>`:''} <button class="btn sm" data-opedit="${p.id}">EDITAR</button> <button class="btn sm danger" data-opdel="${p.id}">EXCLUIR</button></span></div>`).join('')||'<div class="empty">Nenhuma fase cadastrada.</div>'}<p class="admin-help">A classificação considera somente fases classificatórias. Playoffs são gerados pela classificação e podem ser ajustados na aba Jogos; depois, use AVANÇAR VENCEDORES para montar a fase seguinte.</p></div></div>
  ${zoneManager('official',null)}
  ${safeCalendar}`;
  $('view').onchange = e => {
    if (e.target.name === 'fmt') { capture(); const keep = { ptsW: draft.config.ptsW, ptsD: draft.config.ptsD }; draft.format = e.target.value; draft.config = { ...keep, ...PRESETS[draft.format].cfg }; vCamp(); }
  };
  if($('createOfficialComp'))$('createOfficialComp').onclick=()=>{const name=$('newOfficialComp').value.trim();if(!name)return say('Informe o nome da competição.',false);return run(sb.from('official_competitions').insert({name}),'Competição criada.');};
  if($('createOfficialEdition'))$('createOfficialEdition').onclick=()=>{const name=$('newOfficialEdition').value.trim(),competition_id=$('newOfficialCompPick').value;if(!name||!competition_id)return say('Escolha a competição e informe a edição.',false);return run(sb.from('official_editions').insert({competition_id,name,season:$('newOfficialSeason').value.trim()||null}),'Edição criada.');};
  if($('phaseEditionPick'))$('phaseEditionPick').onchange=e=>{selOfficialEdition=e.target.value;vCamp();};
  const syncEditionFormat=()=>{const f=$('editionFormat')?.value;document.querySelectorAll('[data-format-groups]').forEach(el=>el.style.display=f==='groups'?'':'none');const hint=$('editionFormatHint');if(hint)hint.textContent=({groups:'Grupos com classificação independente. Adicione as eliminatórias em Fases da Competição.',league:'Tabela única por pontos. O calendário gera todos contra todos.',knockout:'Gera a primeira etapa eliminatória; as fases seguintes podem ser criadas no gerenciador de fases.',custom:'Monte as fases manualmente abaixo. O calendário automático não será gerado.'})[f]||'';};
  if($('editionFormat')){$('editionFormat').onchange=syncEditionFormat;syncEditionFormat();}
  if($('editionTeamSearch'))$('editionTeamSearch').oninput=e=>{const q=e.target.value.trim().toLocaleLowerCase('pt-BR');document.querySelectorAll('[data-group-slot]').forEach(sel=>{const current=sel.value;[...sel.options].forEach(opt=>{opt.hidden=!!q&&!!opt.value&&!opt.textContent.toLocaleLowerCase('pt-BR').includes(q)&&opt.value!==current;});});};
  $('view').onclick = async e => {
    if(e.target.id==='backOfficialList'){officialWorkspaceOpen=false;selOfficialEdition=null;draft=null;vCamp();return;}
    if(e.target.id==='refreshEditionTeams'){await refresh();return;}
    if(e.target.id==='generateEditionGroups'){await generateEditionGroupRounds();return;}
    if(e.target.id==='applyEditionGroupConfig'){
      const format=$('editionFormat').value,groups=format==='groups'?Number($('editionGroupCount').value):1,size=Number($('editionGroupSize').value),qual=format==='groups'?Number($('editionGroupQual').value):1,legs=Number($('editionGroupLegs').value);
      if(!['groups','league','knockout','custom'].includes(format)||!Number.isInteger(groups)||groups<1||groups>16||!Number.isInteger(size)||size<2||size>32||!Number.isInteger(qual)||qual<1||qual>size)return say('Formato inválido. Confira os números de participantes e classificados.',false);
      if(D.matches.some(m=>String(m.official_edition_id)===String(selOfficialEdition)))return say('Esta edição já possui jogos. Não altere o formato dos grupos após gerar o calendário.',false);
      const upd=await sb.from('official_editions').update({group_config:{format,groups,teams_per_group:size,qualifiers_per_group:qual,legs}}).eq('id',selOfficialEdition);
      if(upd.error)return say(traduz(upd.error),false);
      say('Formato dos grupos atualizado.',true);await refresh();return;
    }
    if(e.target.id==='saveOfficialGroups'){
      if(!selOfficialEdition)return say('Selecione uma edição.',false);
      const fields=[...$('view').querySelectorAll('[data-group-slot]')];
      const chosen=fields.map(f=>({participant_id:f.value,group_name:f.dataset.groupSlot.split('-')[0],slot:Number(f.dataset.groupSlot.split('-')[1])})).filter(x=>x.participant_id);
      if(!chosen.length)return say('Selecione ao menos uma equipe para salvar. Para retirar inscrições, use os campos vazios e mantenha pelo menos uma equipe.',false);
      if(new Set(chosen.map(x=>x.participant_id)).size!==chosen.length)return say('Um time não pode aparecer em mais de um grupo.',false);
      const old=registered.map(x=>({participant_id:String(x.participant_id),group_name:x.group_name,slot:Number(x.slot)}));
      if(D.matches.some(m=>String(m.official_edition_id)===String(selOfficialEdition)) && JSON.stringify(old.sort((a,b)=>a.group_name.localeCompare(b.group_name)||a.slot-b.slot))!==JSON.stringify(chosen.sort((a,b)=>a.group_name.localeCompare(b.group_name)||a.slot-b.slot)) && !confirm('Esta edição já possui partidas. Alterar os grupos não altera confrontos existentes. Continuar?'))return;
      const del=await sb.from('official_group_teams').delete().eq('official_edition_id',selOfficialEdition);
      if(del.error)return say(traduz(del.error),false);
      const ins=await sb.from('official_group_teams').insert(chosen.map(x=>({...x,official_edition_id:selOfficialEdition})));
      if(ins.error)return say(traduz(ins.error),false);
      say('Grupos salvos com sucesso.',true);await refresh();return;
    }
    const link=e.target.closest('[data-link-legacy-phase]');
    if(link){
      if(!selOfficialEdition)return say('Selecione uma edição antes de vincular a fase.',false);
      const phase=legacyPhases.find(p=>String(p.id)===link.dataset.linkLegacyPhase);
      if(!phase||!confirm('Vincular a fase '+phase.name+' à edição selecionada?'))return;
      return run(sb.from('competition_phases').update({official_edition_id:selOfficialEdition}).eq('id',phase.id),'Fase vinculada à edição.');
    }

    const eb=e.target.closest('[data-delete-official-edition]'),cb=e.target.closest('[data-delete-official-comp]');
    if(eb||cb){
      const eid=eb?.dataset.deleteOfficialEdition,cid=cb?.dataset.deleteOfficialComp;
      const related=eid?oe.filter(x=>x.id===eid):oe.filter(x=>x.competition_id===cid);
      if(related.some(x=>(D.matches||[]).some(m=>m.official_edition_id===x.id)||(D.rounds||[]).some(r=>r.official_edition_id===x.id)||(D.phases||[]).some(p=>p.official_edition_id===x.id)))return say('Existem jogos, rodadas ou fases vinculados. Exclua-os antes de apagar esta competição.',false);
      const name=eid?oe.find(x=>x.id===eid)?.name:oc.find(x=>x.id===cid)?.name;
      if(!confirm('Excluir definitivamente '+name+'?'))return;
      if(cid&&related.length){const x=await sb.from('official_editions').delete().eq('competition_id',cid);if(x.error)return say(x.error.message,false);}
      const x=await sb.from(eid?'official_editions':'official_competitions').delete().eq('id',eid||cid);
      if(x.error)return say(x.error.message,false);
      say('Excluído com sucesso.');await refresh();return;
    }
    if(e.target.id==='cloneCompetitionFormat'){
      const sourceId=$('cloneSourceEdition')?.value,destinationId=$('cloneDestinationComp')?.value;
      const name=$('cloneEditionName')?.value.trim(),season=$('cloneEditionSeason')?.value.trim();
      const source=oe.find(x=>String(x.id)===String(sourceId));
      if(!source||!destinationId||!name)return say('Selecione a origem, o destino e informe o nome da nova edição.',false);
      const sourcePhases=(D.phases||[]).filter(p=>String(p.official_edition_id)===String(sourceId)&&p.competition_type==='official').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
      if(!confirm('Duplicar o formato de '+source.name+' para '+name+'? Serão copiadas '+sourcePhases.length+' fases, sem jogos ou resultados.'))return;
      const button=e.target;button.disabled=true;
      let newEditionId=null;
      try{
        const created=await sb.from('official_editions').insert({competition_id:destinationId,name,season:season||null}).select('id').single();
        if(created.error)throw created.error;
        newEditionId=created.data.id;
        if(sourcePhases.length){
          const maxOfficialOrder=Math.max(0,...(D.phases||[]).filter(p=>p.competition_type==='official').map(p=>Number(p.sort_order)||0));
          const rows=sourcePhases.map((p,i)=>({competition_type:'official',official_edition_id:newEditionId,name:p.name,phase_type:p.phase_type,sort_order:maxOfficialOrder+i+1,counts_in_standings:p.counts_in_standings,playoff_config:p.playoff_config||null}));
          const inserted=await sb.from('competition_phases').insert(rows).select('id,sort_order');
          if(inserted.error)throw inserted.error;
          const phaseIdMap=new Map(sourcePhases.map((p,i)=>[String(p.id),inserted.data.find(n=>Number(n.sort_order)===rows[i].sort_order)?.id]));
          const sourceZones=(D.standingsZones||[]).filter(z=>z.competition_type==='official'&&phaseIdMap.has(String(z.phase_id)));
          if(sourceZones.length){
            const zoneRows=sourceZones.map(z=>({competition_type:'official',phase_id:phaseIdMap.get(String(z.phase_id)),position_start:z.position_start,position_end:z.position_end,label:z.label,color:z.color}));
            const zoneResult=await sb.from('standings_zones').insert(zoneRows);
            if(zoneResult.error)throw zoneResult.error;
          }
        }
        selOfficialEdition=newEditionId;
        say('Formato duplicado! Nova edição criada com '+sourcePhases.length+' fases, sem partidas.');await refresh();
      }catch(err){
        if(newEditionId){
          const cleanupPhases=await sb.from('competition_phases').select('id').eq('official_edition_id',newEditionId);
          if(cleanupPhases.data?.length)await sb.from('standings_zones').delete().in('phase_id',cleanupPhases.data.map(p=>p.id));
          await sb.from('competition_phases').delete().eq('official_edition_id',newEditionId);
          await sb.from('official_editions').delete().eq('id',newEditionId);
        }
        say('Não foi possível duplicar: '+(err.message||err),false);
      }finally{button.disabled=false;}
      return;
    }
    const id = e.target.id;
    if(e.target.closest('[data-zone-add],[data-zone-edit],[data-zone-del]'))return zoneAction(e.target.closest('button').dataset,'official',null);
    if(id==='opAdd'){const name=prompt('Nome da fase (ex.: Fase de grupos, Final, Disputa de 3º lugar):');if(!name)return;const choice=askPhaseType('knockout');if(!choice)return choice===false?say('Escolha uma opção de 1 a 6.',false):null;const kind=choice.type,ps=editionPhases;const playoff_config=kind==='playoff'?askPlayoffConfig():null;if(playoff_config===false||playoff_config===null&&kind==='playoff')return;return run(sb.from('competition_phases').insert({competition_type:'official',official_edition_id:selOfficialEdition,name:name.trim(),phase_type:kind,sort_order:Math.max(0,...(D.phases||[]).filter(p=>p.competition_type==='official').map(p=>Number(p.sort_order)||0))+1,counts_in_standings:kind==='groups',playoff_config}),'Fase oficial criada.');}
    if(e.target.dataset.opedit){const p=(D.phases||[]).find(x=>x.id===e.target.dataset.opedit);if(!p)return;const name=prompt('Nome da fase:',p.name);if(!name)return;const choice=askPhaseType(p.phase_type);if(!choice)return choice===false?say('Escolha uma opção de 1 a 6.',false):null;const kind=choice.type;const playoff_config=kind==='playoff'?askPlayoffConfig(p.playoff_config):(p.playoff_config||null);if(playoff_config===false||playoff_config===null&&kind==='playoff')return;return run(sb.from('competition_phases').update({name:name.trim(),phase_type:kind,counts_in_standings:kind==='groups',playoff_config}).eq('id',p.id),'Fase atualizada.');}
    if(e.target.dataset.opTemplate){
      const ph=editionPhases.find(p=>String(p.id)===String(e.target.dataset.opTemplate));
      if(!ph)return;
      const current=Array.isArray(ph.playoff_config?.placeholder_matches)?ph.playoff_config.placeholder_matches:[];
      const sample=current.length?current.map(pair=>pair.join(' x ')).join('\n'):(ph.phase_type==='final'?'Vencedor da Semifinal 1 x Vencedor da Semifinal 2':ph.phase_type==='knockout'?'1º colocado x Vencedor do Playoff 2\n2º colocado x Vencedor do Playoff 1':'3º colocado x 6º colocado\n4º colocado x 5º colocado');
      const input=prompt('MODELO DE CONFRONTOS — uma partida por linha, separando os participantes com " x ". Deixe vazio para remover o modelo.\nExemplo: 3º colocado x 6º colocado',sample);
      if(input===null)return;
      const lines=input.trim()?input.trim().split(/\r?\n/):[];
      const pairs=lines.map(line=>line.split(/\s+x\s+/i).map(x=>x.trim()));
      if(pairs.some(pair=>pair.length!==2||!pair[0]||!pair[1]))return say('Formato inválido. Use uma partida por linha: 3º colocado x 6º colocado.',false);
      const cfg={...(ph.playoff_config||{}),placeholder_matches:pairs};
      return run(sb.from('competition_phases').update({playoff_config:cfg}).eq('id',ph.id).eq('official_edition_id',selOfficialEdition),'Modelo de confrontos salvo.');
    }
    if(e.target.dataset.opPlayoff){const ph=(D.phases||[]).find(p=>p.id===e.target.dataset.opPlayoff);if(ph)return generateConfiguredPlayoff(ph);}
    if(e.target.dataset.opAdvance){const ph=(D.phases||[]).find(p=>p.id===e.target.dataset.opAdvance);if(ph)return generateNextFromPlayoff(ph);}
    if(e.target.dataset.opdel){const used=(D.rounds||[]).some(r=>r.phase_id===e.target.dataset.opdel);if(used)return say('Esta fase possui rodadas vinculadas. Mova ou exclua as rodadas antes.',false);if(confirm('Excluir esta fase?'))return run(sb.from('competition_phases').delete().eq('id',e.target.dataset.opdel),'Fase excluída.');}
    if (id === 'cSave') { capture(); const d = draft; draft = null; run(sb.from('settings').update({ name: d.name, season: d.season, format: d.format, config: d.config }).eq('id', 1), 'Configuração salva.'); }
    if (id === 'gLiga') genLiga(); if (id === 'gKo1') genKo1(); if (id === 'gGrp') genGroups(); if (id === 'gKoG') genKoFromGroups(); if (id === 'gAdv') advance();
    if (id === 'gDel' && confirm('Apagar TODAS as rodadas e partidas (e gols lançados)? Participantes e jogadores permanecem.')) run(sb.from('rounds').delete().not('id', 'is', null), 'Calendário apagado.');
  };
}

async function createRounds(specs) {
  const base = D.rounds.length ? Math.max(...D.rounds.map(r => r.number)) : 0;
  const r = await sb.from('rounds').insert(specs.map((s, i) => { const phase=(D.phases||[]).find(p=>p.competition_type==='official'&&p.phase_type===((s.stage==='grupos'||s.stage==='liga')?'groups':'knockout')); return { number: base + 1 + i, stage: s.stage, phase_id: phase?.id || null, name: s.name || null }; })).select();
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
let gamesSubView='matches';
let editingMatchId=null;
let matchEditorTab='result';
let reportSection='stats';
const curMatches = () => activeCategory === 'friendly' ? D.matches.filter(m => m.category === 'friendly').sort(displaySort) : D.matches.filter(m => (activeCategory === 'weekly' ? m.weekly_round_id === selRound : m.round_id === selRound) && (m.category || 'official') === activeCategory && (activeCategory !== 'weekly' || m.weekly_id === selWeekly)).sort((a,b)=>displaySort(a,b)||(a.seq||0)-(b.seq||0));
function rowPayload(id) {
  const h = $('h' + id).value, a = $('a' + id).value, dt = $('d' + id).value;
  if (h === '' && a === '') return { skip: true };
  if (h === '' || a === '') return { err: 'Informe os dois placares.' };
  if (!dt) return { err: 'Informe a data da partida.' };
  let pen = { home_pen: null, away_pen: null }; const ph = $('ph' + id), pa = $('pa' + id);
  if (ph && (ph.value !== '' || pa.value !== '')) { if (ph.value === '' || pa.value === '') return { err: 'Informe os dois valores de pênaltis.' }; pen = { home_pen: +ph.value, away_pen: +pa.value }; }
  const extra=$('extra'+id), golden=$('golden'+id);
  const match=D.matches.find(m=>String(m.id)===String(id));
  if(match && isGroupMatch(match))return {data:{home_score:+h,away_score:+a,played_on:dt}};
  return { data: { home_score: +h, away_score: +a, played_on: dt, ...pen, went_to_extra_time:!!extra?.checked, golden_goal:!!golden?.checked } };
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
    if (m.played && m.home_score === d.home_score && m.away_score === d.away_score && m.played_on === d.played_on && (isGroupMatch(m) || (m.home_pen === d.home_pen && m.away_pen === d.away_pen && !!m.went_to_extra_time === d.went_to_extra_time && !!m.golden_goal === d.golden_goal))) continue;
    ups.push(sb.from('matches').update(d).eq('id', m.id));
  }
  if (!ups.length) return say('Nada para salvar: preencha ou altere algum placar.', false);
  const e = (await Promise.all(ups)).find(x => x.error); if (e) return say(traduz(e.error), false);
  say(ups.length + ' resultado(s) salvo(s).', true); refresh();
}
const isGroupMatch = m => {
  const phase = m.round?.phase || m.weeklyRound?.phase;
  return phase ? phase.phase_type === 'groups' || (phase.counts_in_standings && phase.phase_type !== 'playoff') : ['grupos','liga'].includes(m.round?.stage);
};
const matchExtras = m => isGroupMatch(m) ? '' : `<span class="match-extra-fields"><label>Prorrogação <input type="checkbox" id="extra${m.id}" ${m.went_to_extra_time?'checked':''}></label><label>Gol de ouro <input type="checkbox" id="golden${m.id}" ${m.golden_goal?'checked':''}></label><label>Pênaltis <input class="scoreinput" type="number" min="0" id="ph${m.id}" value="${m.home_pen??''}"></label> x <input class="scoreinput" type="number" min="0" id="pa${m.id}" value="${m.away_pen??''}"></span>`;
function featuredToggle(m) { return `<label class="admin-featured"><input type="checkbox" data-featured="${m.id}" ${m.is_featured?'checked':''}> FIXAR NA PÁGINA INICIAL</label>`; }
async function setFeatured(id,checked){
  if(checked){const current=D.matches.filter(m=>m.is_featured&&m.id!==id);for(const m of current){const {error}=await sb.from('matches').update({is_featured:false}).eq('id',m.id);if(error)return say(traduz(error),false);}}
  const {error}=await sb.from('matches').update({is_featured:checked}).eq('id',id);
  if(error)return say(traduz(error),false);
  say(checked?'Partida fixada na página inicial.':'Destaque removido.',true);await refresh();
}
function canAssignChampionTag(m) {
  if(!m || m.category==='friendly')return false;
  const round=m.category==='weekly'
    ? (D.weeklyRounds||[]).find(r=>String(r.id)===String(m.weekly_round_id))
    : (D.rounds||[]).find(r=>String(r.id)===String(m.round_id));
  const phase=(D.phases||[]).find(p=>String(p.id)===String(round?.phase_id));
  return phase?.phase_type==='final';
}
function championTagControl(m) {
  if(!canAssignChampionTag(m))return '';
  const selected = String(m.champion_team_id || '');
  return `<label class="admin-help">TAG CAMPEÃO <select data-champion="${m.id}" aria-label="Selecionar campeão da partida"><option value="">Sem tag</option><option value="${m.home_id}" ${selected===String(m.home_id)?'selected':''}>${esc(m.home.name)}</option><option value="${m.away_id}" ${selected===String(m.away_id)?'selected':''}>${esc(m.away.name)}</option></select></label>`;
}
async function setChampionTag(id, teamId) {
  const m = D.matches.find(x=>String(x.id)===String(id));
  if(!m)return say('Partida não encontrada.',false);
  if(!canAssignChampionTag(m))return say('A tag CAMPEÃO só pode ser atribuída a partidas de final.',false);
  if(teamId && ![String(m.home_id),String(m.away_id)].includes(String(teamId)))return say('Selecione um dos times da partida.',false);
  if(teamId && !m.played)return say('Registre o resultado antes de marcar o campeão.',false);
  const {error}=await sb.from('matches').update({champion_team_id:teamId||null}).eq('id',id);
  if(error)return say(traduz(error),false);
  say(teamId?'Tag CAMPEÃO ativada.':'Tag CAMPEÃO removida.',true);
  await refresh();
}
const displaySort = (a,b) => (a.display_order == null ? 1000000 : a.display_order) - (b.display_order == null ? 1000000 : b.display_order);
const displayOrderControls = (m,list) => `<span class="cbpes-order-controls"><button class="btn sm" data-order-up="${m.id}" title="Subir partida" ${list[0]?.id===m.id?'disabled':''}>↑</button><button class="btn sm" data-order-down="${m.id}" title="Descer partida" ${list[list.length-1]?.id===m.id?'disabled':''}>↓</button></span>`;
async function moveMatchOrder(id,direction,list) {
 const index=list.findIndex(m=>String(m.id)===String(id)), other=index+direction;
 if(index<0||other<0||other>=list.length)return;
 const next=[...list];[next[index],next[other]]=[next[other],next[index]];
 for(let i=0;i<next.length;i++){const {error}=await sb.from('matches').update({display_order:i+1}).eq('id',next[i].id);if(error){say(traduz(error),false);await refresh();return;}}
 say('Ordem das partidas salva.',true);await refresh();
}
function matchSummary(m){
 const date=m.played_on||m.date||'';
 const score=m.home_score!=null&&m.away_score!=null?m.home_score+' : '+m.away_score:'– : –';
 const label=m.category==='friendly'?'AMISTOSO':m.category==='weekly'?'SEMANAL':'OFICIAL';
 const open=String(editingMatchId)===String(m.id);
 return `<div class="cbpes-admin-match-summary"><div class="cbpes-admin-match-main"><span class="cbpes-admin-match-team">${esc(m.home.name)}</span><strong class="cbpes-admin-match-score">${score}</strong><span class="cbpes-admin-match-team away">${esc(m.away.name)}</span></div><div class="cbpes-admin-match-bottom"><span class="cbpes-admin-match-meta">${label}${date?' · '+esc(fd(date)):''}${m.group_name?' · Grupo '+esc(m.group_name):''}</span><button type="button" class="btn cbpes-admin-edit-btn" data-edit-match="${m.id}" title="${open?'Fechar edição':'Editar partida'}" aria-label="${open?'Fechar edição':'Editar partida'}"><iconify-icon icon="${open?'lucide:x':'lucide:pencil'}"></iconify-icon></button></div></div>`;
}
function expandedMatchEditor(m) {
  const ko = !!(m.round && m.round.stage === 'mata'), id = m.id;
  return `<div class="arow"><div class="nm">${esc(m.home.name)}</div><div><input class="scoreinput" type="number" min="0" max="99" id="h${id}" data-m="${id}" value="${m.home_score ?? ''}"> x <input class="scoreinput" type="number" min="0" max="99" id="a${id}" data-m="${id}" value="${m.away_score ?? ''}"></div><div class="nm">${esc(m.away.name)}</div>
   <div class="arow-foot">${m.group_name ? `<span class="admin-help">Grupo ${esc(m.group_name)}</span>` : ''}${matchExtras(m)}${featuredToggle(m)}${championTagControl(m)}${displayOrderControls(m,curMatches())}${m.category==='friendly'?friendlyCompetitionPicker(m):''}<label class="admin-help">Data</label><input type="date" id="d${id}" value="${m.played_on || (m.played ? '' : today())}"><button class="btn sm primary" data-s="${id}">SALVAR</button>${m.played ? `<button class="btn sm" data-g="${id}">GOLS (${D.events.filter(e => e.match_id === id).length})</button><button class="btn sm danger" data-c="${id}">LIMPAR</button>` : ''}<button class="btn sm danger" data-mx="${id}">EXCLUIR PARTIDA</button>${m.category==='official'?'<button class="btn sm" data-edit-report="'+id+'">SÚMULA OFICIAL</button>':''}</div>${openGoals === id && m.played ? goalsPanel(m) : ''}</div>`;
}

function rowHTML(m){
 if(String(editingMatchId)!==String(m.id))return matchSummary(m);
 return '<div class="cbpes-admin-match-wrap">'+matchSummary(m)+'<div class="cbpes-admin-match-editor"><div class="cbpes-admin-editor-heading"><b>EDITAR PARTIDA</b><span>Resultado, data e configurações</span></div>'+expandedMatchEditor(m)+'</div></div>';
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
document.addEventListener('change', async e=>{if(e.target.matches('[data-featured]'))await setFeatured(e.target.dataset.featured,e.target.checked);});
document.addEventListener('change', async e=>{if(e.target.matches('[data-champion]'))await setChampionTag(e.target.dataset.champion,e.target.value);});
function officialEditionSelect(){
 const ed=D.officialEditions||[], comps=D.officialCompetitions||[];
 if(!selOfficialEdition||!ed.some(e=>e.id===selOfficialEdition))selOfficialEdition=ed[0]?.id||null;
 return '<div class="card" style="margin-bottom:12px"><div class="cardbody inline"><div class="field"><label>CAMPEONATO / EDIÇÃO</label><select id="officialEditionPick">'+ed.map(e=>'<option value="'+e.id+'" '+(e.id===selOfficialEdition?'selected':'')+'>'+esc((comps.find(c=>c.id===e.competition_id)?.name||'Competição')+' — '+e.name)+'</option>').join('')+'</select></div><span class="admin-help">As rodadas e os jogos ficam vinculados à edição selecionada.</span></div></div>';
}
// Importação de confrontos oficiais a partir de texto (sem data ou horário).
function parseOfficialFixtures(raw,editionId){
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const teams=D.participants||[], rounds=D.rounds.filter(r=>r.official_edition_id===editionId);
 const existing=D.matches.filter(m=>(m.category||'official')==='official'&&(m.official_edition_id===editionId||rounds.some(r=>r.id===m.round_id)));
 const result=[], errors=[], seen=new Set();
 String(raw||'').split(/\r?\n/).forEach((line,index)=>{
  const lineNo=index+1,trim=line.trim();
  if(!trim||/^rodada\s*[|;,\t]/i.test(trim))return;
  let parts=trim.split(/\s*[|;\t]\s*/).map(x=>x.trim());
  if(parts.length===2&&/^\d+\s*[-.]\s*/.test(parts[0]))parts=[parts[0].match(/^\d+/)[0],parts[0].replace(/^\d+\s*[-.]\s*/,''),parts[1]];
  if(parts.length!==3||!/^\d+$/.test(parts[0])){errors.push('Linha '+lineNo+': use Rodada | Mandante | Visitante.');return;}
  const number=Number(parts[0]),lookup=name=>teams.filter(p=>norm(p.name)===norm(name));
  const home=lookup(parts[1]),away=lookup(parts[2]);
  if(!number||number>999){errors.push('Linha '+lineNo+': rodada inválida.');return;}
  if(home.length!==1||away.length!==1){errors.push('Linha '+lineNo+': time não encontrado ou ambíguo ('+parts[1]+' / '+parts[2]+').');return;}
  if(home[0].id===away[0].id){errors.push('Linha '+lineNo+': clubes iguais.');return;}
  const key=number+'|'+home[0].id+'|'+away[0].id;
  if(seen.has(key)){errors.push('Linha '+lineNo+': confronto repetido no texto.');return;}
  seen.add(key);
  const round=rounds.find(r=>r.number===number);
  if(round&&existing.some(m=>m.round_id===round.id&&m.home_id===home[0].id&&m.away_id===away[0].id)){errors.push('Linha '+lineNo+': confronto já cadastrado nessa rodada.');return;}
  result.push({number,home:home[0],away:away[0]});
 });
 return {result,errors};
}
async function importOfficialFixtures(){
 const input=$('fixtureBulkText'),button=$('fixtureBulkSave');
 if(!input||!selOfficialEdition)return say('Selecione uma edição oficial.',false);
 const {result,errors}=parseOfficialFixtures(input.value,selOfficialEdition);
 if(errors.length){$('fixtureBulkFeedback').textContent=errors.join('\n');return say('Corrija as linhas indicadas antes de importar.',false);}
 if(!result.length)return say('Cole ao menos uma partida.',false);
 if(!confirm('Importar '+result.length+' confrontos para esta edição?'))return;
 button.disabled=true;
 try{
  const phaseId=$('fixtureBulkPhase')?.value||null;
  if(!phaseId)return say('Selecione a fase para importar as partidas.',false);
  const phase=(D.phases||[]).find(p=>p.id===phaseId&&p.official_edition_id===selOfficialEdition);
  if(!phase)return say('A fase selecionada não pertence à edição.',false);
  const rounds=D.rounds.filter(r=>r.official_edition_id===selOfficialEdition);
  const numbers=[...new Set(result.map(x=>x.number))];
  const roundIds=new Map(rounds.map(r=>[r.number,r.id]));
  const created=[];
  for(const number of numbers){
   if(roundIds.has(number))continue;
   const {data,error}=await sb.from('rounds').insert({number,stage:phase.counts_in_standings?'liga':'mata',phase_id:phaseId,official_edition_id:selOfficialEdition}).select('id').single();
   if(error)throw new Error('Erro ao criar rodada '+number+': '+error.message);
   roundIds.set(number,data.id);created.push(number);
  }
  for(const number of numbers){
   const round=rounds.find(r=>r.number===number);
   if(round&&round.phase_id!==phaseId){
    if(round.phase_id)throw new Error('A rodada '+number+' já está vinculada a outra fase. Nenhum confronto foi importado.');
    const {error}=await sb.from('rounds').update({phase_id:phaseId}).eq('id',round.id).eq('official_edition_id',selOfficialEdition);
    if(error)throw new Error('Não foi possível vincular a rodada '+number+': '+error.message);
   }
  }
  const rows=result.map(x=>({round_id:roundIds.get(x.number),official_edition_id:selOfficialEdition,home_id:x.home.id,away_id:x.away.id,category:'official',leg:1}));
  const {error}=await sb.from('matches').insert(rows);
  if(error)throw new Error('Falha ao importar confrontos: '+error.message+'. Rodadas novas criadas: '+(created.join(', ')||'nenhuma')+'.');
  input.value='';say(result.length+' confrontos importados com sucesso.',true);await refresh();
 }catch(err){say(err.message,false);}finally{button.disabled=false;}
}

// Reclassificação de amistosos: preserva placar, data, times e eventos da partida.
function friendlyCompetitionPicker(m){
  const editions=(D.officialEditions||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  const choices=editions.map(e=>{
    const competition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(e.competition_id));
    const rounds=(D.rounds||[]).filter(r=>String(r.official_edition_id)===String(e.id)).sort((a,b)=>(a.number||0)-(b.number||0));
    if(!rounds.length)return '';
    return '<optgroup label="'+esc((competition?.name||'Competição')+' • '+(e.name||'Edição'))+'">'+rounds.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name||'Rodada '+r.number)+'</option>').join('')+'</optgroup>';
  }).join('');
  return '<div class="cbpes-friendly-reclassify"><label class="admin-help" for="reclass'+m.id+'">VINCULAR A COMPETIÇÃO / RODADA</label><select id="reclass'+m.id+'"><option value="">Selecione a competição e rodada</option>'+choices+'</select><button class="btn sm" data-reclass="'+m.id+'" '+(!choices?'disabled':'')+'>ALTERAR PARA OFICIAL</button></div>';
}
async function reclassifyFriendly(id){
  const m=D.matches.find(x=>String(x.id)===String(id));
  if(!m||m.category!=='friendly')return say('Amistoso não encontrado.',false);
  const roundId=$('reclass'+id)?.value;
  const round=(D.rounds||[]).find(r=>String(r.id)===String(roundId));
  if(!round||!round.official_edition_id)return say('Selecione uma rodada de uma competição oficial cadastrada.',false);
  const edition=(D.officialEditions||[]).find(e=>String(e.id)===String(round.official_edition_id));
  if(!edition)return say('Edição oficial não encontrada.',false);
  const competition=(D.officialCompetitions||[]).find(c=>String(c.id)===String(edition.competition_id));
  const name=(competition?.name||'Competição')+' • '+(edition.name||'Edição')+' • '+(round.name||'Rodada '+round.number);
  if(!confirm('Converter este amistoso em partida OFICIAL de '+name+'? O resultado e os gols serão preservados.'))return;
  const {data, error}=await sb.from('matches').update({category:'official',round_id:round.id,official_edition_id:edition.id,weekly_id:null,weekly_round_id:null,champion_team_id:null}).eq('id',id).eq('category','friendly').select('id,category,round_id,official_edition_id');
  if(error)return say(traduz(error),false);
  if(!data?.length||data[0].category!=='official')return say('A alteração não foi persistida. Verifique as permissões de atualização da tabela matches.',false);
  say('Partida vinculada à competição oficial. Estatísticas e tabela serão recalculadas.',true);
  await refresh();
}

function vMatchEditor(){
 const m=(D.matches||[]).find(x=>String(x.id)===String(editingMatchId));
 if(!m){gamesSubView='matches';editingMatchId=null;return vJogos();}
 const id=m.id;
 const tabs=[['result','lucide:flag','Resultado'],['options','lucide:settings-2','Configurações'],['goals','lucide:goal','Gols']];
 if((m.category||'official')==='official')tabs.push(['report','lucide:clipboard-list','Súmula oficial']);
 if(matchEditorTab==='report'){reportMatchId=id;gamesSubView='reports';return vSumulas();}
 const details=expandedMatchEditor(m);
 // Os campos existentes são mantidos no editor, mas apresentados por seção.
 const temp=document.createElement('div');temp.innerHTML=details;
 const foot=temp.querySelector('.arow-foot');
 const extras=foot?.innerHTML||'';
 const score=m.home_score!=null&&m.away_score!=null?m.home_score+' : '+m.away_score:'– : –';
 const header='<div class="cbpes-admin-editor-top"><button class="btn" data-editor-back="1"><iconify-icon icon="lucide:arrow-left"></iconify-icon> VOLTAR À LISTA</button><span>GERENCIAR PARTIDA</span></div><div class="cbpes-admin-editor-hero"><span>'+esc(m.home.name)+'</span><strong>'+score+'</strong><span>'+esc(m.away.name)+'</span><small>'+(m.played_on?fd(m.played_on):'Data não informada')+' · '+(m.category==='friendly'?'AMISTOSO':m.category==='weekly'?'SEMANAL':'OFICIAL')+'</small></div>';
 const nav='<div class="cbpes-admin-editor-tabs">'+tabs.map(([key,icon,label])=>'<button class="'+(matchEditorTab===key?'on':'')+'" data-editor-tab="'+key+'"><iconify-icon icon="'+icon+'"></iconify-icon>'+label+'</button>').join('')+'</div>';
 let content='';
 if(matchEditorTab==='result')content='<div class="card cbpes-admin-editor-section"><div class="cardhead"><h2>RESULTADO DA PARTIDA</h2></div><div class="cardbody"><p class="admin-help">Informe o placar e a data da partida. Salve para atualizar a tabela e o histórico.</p><div class="cbpes-admin-editor-score"><div><b>'+esc(m.home.name)+'</b><input class="scoreinput" type="number" min="0" max="99" id="h'+id+'" value="'+(m.home_score??'')+'"></div><span>×</span><div><b>'+esc(m.away.name)+'</b><input class="scoreinput" type="number" min="0" max="99" id="a'+id+'" value="'+(m.away_score??'')+'"></div></div><div class="cbpes-admin-editor-date">'+field('Data do jogo','<input type="date" id="d'+id+'" value="'+(m.played_on||'')+'">')+'</div><div id="editorExtraFields"></div><button class="btn primary" data-editor-save="'+id+'">SALVAR RESULTADO</button></div></div>';
 else if(matchEditorTab==='options')content='<div class="card cbpes-admin-editor-section"><div class="cardhead"><h2>CONFIGURAÇÕES DA PARTIDA</h2></div><div class="cardbody"><div class="cbpes-admin-editor-settings">'+extras+'</div></div></div>';
 else content='<div class="card cbpes-admin-editor-section"><div class="cardhead"><h2>GOLS E ASSISTÊNCIAS</h2></div><div class="cardbody">'+(m.played?goalsPanel(m):'<div class="empty">Registre o resultado antes de adicionar gols.</div>')+'</div></div>';
 $('view').innerHTML=header+nav+content;
 if(matchEditorTab==='result'){
   // Pênaltis e prorrogação continuam integrados ao mesmo salvamento.
   const source=document.createElement('div');source.innerHTML=details;
   const extra=source.querySelector('.arow-foot');
   if(extra){const pen=extra.querySelectorAll('input[id^="ph"],input[id^="pa"],input[id^="et"]');const target=$('editorExtraFields');pen.forEach(el=>{const wrapper=el.closest('label')||el.parentElement;if(wrapper&&target&&!target.contains(wrapper)){target.appendChild(wrapper.cloneNode(true));}});}
 }
 $('view').onclick=async e=>{
   const t=e.target.closest('button');if(!t)return;const d=t.dataset;
   if(d.editorBack){gamesSubView='matches';editingMatchId=null;openGoals=null;return vJogos();}
   if(d.editorTab){matchEditorTab=d.editorTab;return vMatchEditor();}
   if(d.editorSave)return saveOne(d.editorSave);
   if(d.editReport){reportMatchId=id;gamesSubView='reports';return vSumulas();}
   if(d.reclass)return reclassifyFriendly(d.reclass);
   if(d.orderUp||d.orderDown)return moveMatchOrder(d.orderUp||d.orderDown,d.orderUp?-1:1,curMatches());
   if(d.s)return saveOne(d.s);
   if(d.mx&&confirm('Excluir esta partida?')){gamesSubView='matches';editingMatchId=null;return run(sb.from('matches').delete().eq('id',d.mx),'Partida excluída.');}
   if(d.c&&confirm('Limpar o resultado e os gols desta partida?')){await sb.from('match_events').delete().eq('match_id',d.c);return run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null,played:false}).eq('id',d.c),'Resultado removido.');}
   if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
   if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
 };
}

// Histórico de técnicos: partidas amistosas importadas, sem copiar registros para matches.
function archivedFriendlies(){
 const normalize=v=>String(v||'').normalize('NFD').replace(/[^\x00-\x7F]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const official=new Set(D.matches.filter(m=>m.category==='official'&&m.played).map(m=>
  [normalize(m.home?.name),normalize(m.away?.name),m.home_score,m.away_score,String(m.played_on||m.date||'').slice(0,10)].join('|')));
 const unique=new Set();
 return adminCareerMatches.filter(m=>{
  if(m.category&&m.category!=='friendly')return false;
  const key=[normalize(m.home_club),normalize(m.away_club),m.home_score,m.away_score,String(m.played_on||'').slice(0,10)].join('|');
  if(official.has(key)||unique.has(String(m.source_key||m.id)))return false;
  unique.add(String(m.source_key||m.id));return true;
 }).sort((a,b)=>String(b.played_on||'').localeCompare(String(a.played_on||''))||String(b.source_key||'').localeCompare(String(a.source_key||'')));
}
let friendlyCoachFilter='all';
function vJogos() {
  if(gamesSubView==='opening-archive')return renderOpeningAdminArchive();
  if(gamesSubView==='editor')return vMatchEditor();
  if(gamesSubView==='reports')return vSumulas();
  const switcher = `<div class="card" style="margin-bottom:12px"><div class="cardbody inline" style="padding:10px"><button class="btn ${activeCategory==='official'?'primary':''}" data-category="official">JOGOS OFICIAIS</button><button class="btn ${activeCategory==='friendly'?'primary':''}" data-category="friendly">AMISTOSOS</button><button class="btn ${activeCategory==='weekly'?'primary':''}" data-category="weekly">SEMANAIS</button><button class="btn" data-opening-admin="1">TORNEIO DE ABERTURA</button><button class="btn cbpes-report-tab" data-open-reports="1"><iconify-icon icon="lucide:clipboard-list"></iconify-icon> SÚMULAS OFICIAIS</button><span class="admin-help">${activeCategory==='friendly'?'Partidas independentes, sem rodada.':activeCategory==='weekly'?'Partidas vinculadas a uma edição semanal.':'Partidas vinculadas às rodadas da competição oficial.'}</span></div></div>`;
  if (activeCategory === 'friendly') {
    const coachNames=[...new Set([...adminCareerMatches.flatMap(m=>[m.home_coach,m.away_coach]),...curMatches().flatMap(m=>[m.home_coach_name,m.away_coach_name,m.home_coach,m.away_coach]),...(D.coachProfiles||[]).map(p=>p.name),...D.participants.map(p=>p.coach_name)].map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const coachFilter='<div class="card cbpes-friendly-coach-filter" style="margin-bottom:12px"><div class="cardbody inline"><label for="friendlyCoachFilter"><strong>FILTRAR AMISTOSOS POR TÉCNICO</strong></label><select id="friendlyCoachFilter"><option value="all">TODOS OS TÉCNICOS</option>'+coachNames.map(name=>'<option value="'+esc(name)+'"'+(friendlyCoachFilter===name?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></div></div>';
    const coachMatches=m=>{
      if(friendlyCoachFilter==='all')return true;
      const homeTeam=D.participants.find(p=>String(p.id)===String(m.home_id));
      const awayTeam=D.participants.find(p=>String(p.id)===String(m.away_id));
      return [m.home_coach,m.away_coach,m.home_coach_name,m.away_coach_name,homeTeam?.coach_name,awayTeam?.coach_name]
        .some(name=>String(name||'').trim().toLocaleLowerCase('pt-BR')===friendlyCoachFilter.toLocaleLowerCase('pt-BR'));
    };
    const ms = curMatches().filter(coachMatches);
    const form = `<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>NOVO AMISTOSO</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>Mandante</label><select id="fh">${opts(D.participants,null,p=>p.name)}</select></div><span>x</span><div class="field"><label>Visitante</label><select id="fa">${opts(D.participants,null,p=>p.name)}</select></div><div class="field"><label>Data</label><input type="date" id="fdt" value="${today()}"></div><button class="btn primary" data-fadd="1">CADASTRAR AMISTOSO</button></div></div></div>`;
    const rows = ms.length ? ms.map(rowHTML).join('') : '<div class="empty">Nenhum amistoso cadastrado.</div>';
    const archive=archivedFriendlies().filter(coachMatches);
    const competitionOptions=(D.officialCompetitions||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
    const historicalRows=archive.map(m=>{
      const selected=String(m.official_competition_id||'');
      const options='<option value=""'+(!selected?' selected':'')+'>AMISTOSO</option>'+(D.officialCompetitions||[]).map(x=>'<option value="'+esc(x.id)+'"'+(String(x.id)===selected?' selected':'')+'>'+esc(x.name)+'</option>').join('');
      const field=(key,label,value,type='text')=>'<label class="cbpes-archive-edit-field"><span>'+label+'</span><input type="'+type+'" data-career-field="'+key+'" value="'+esc(value??'')+'"></label>';
      return '<div class="cbpes-admin-archive-row" data-career-row="'+esc(m.id)+'"><div class="cbpes-archive-edit-fields">'+
        field('home_coach','TÉCNICO MANDANTE',m.home_coach)+field('away_coach','TÉCNICO VISITANTE',m.away_coach)+
        field('home_club','CLUBE MANDANTE',m.home_club)+field('away_club','CLUBE VISITANTE',m.away_club)+
        field('home_score','GOLS MANDANTE',m.home_score,'number')+field('away_score','GOLS VISITANTE',m.away_score,'number')+
        field('played_on','DATA',m.played_on,'date')+'</div>'+
        '<div class="cbpes-archive-competition-editor"><label class="admin-help" for="career-comp-'+esc(m.id)+'">COMPETIÇÃO</label><select id="career-comp-'+esc(m.id)+'" data-archive-competition="'+esc(m.id)+'">'+options+'</select>'+
        '<button type="button" class="btn primary" data-save-career-match="'+esc(m.id)+'">SALVAR ALTERAÇÕES</button>'+
        '<button type="button" class="btn danger" data-delete-career-match="'+esc(m.id)+'">EXCLUIR AMISTOSO</button></div></div>';
    }).join('');

    $('view').innerHTML = switcher + coachFilter + form + `<div class="card"><div class="cardhead"><h2>AMISTOSOS CADASTRADOS (${ms.length})</h2></div><div class="cardbody">${rows}</div></div><div class="card"><div class="cardhead"><h2>AMISTOSOS DO HISTÓRICO DOS TÉCNICOS (${archive.length})</h2><small class="admin-help">EDIÇÃO DE COMPETIÇÃO ATIVA · 23/11</small></div><div class="cardbody">${historicalRows||'<div class="empty">Nenhum amistoso histórico.</div>'}</div></div>`;
    $('view').onchange=e=>{if(e.target.id==='friendlyCoachFilter'){friendlyCoachFilter=e.target.value;vJogos();}};
    $('view').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.m)saveOne(e.target.dataset.m)};
    $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
      if(d.orderUp||d.orderDown)return moveMatchOrder(d.orderUp||d.orderDown,d.orderUp?-1:1,curMatches());
      if(d.editMatch){editingMatchId=d.editMatch;matchEditorTab='result';gamesSubView='editor';openGoals=null;return vMatchEditor();}
      if(d.editReport){reportMatchId=d.editReport;reportSection='stats';gamesSubView='reports';return vSumulas();}
      if(d.openingAdmin){gamesSubView='opening-archive';return vJogos();}
      if(d.openReports){gamesSubView='reports';return vSumulas();}
      if(d.category){editingMatchId=null;activeCategory=d.category;selRound=null;return vJogos();}
      if(d.saveCareerMatch){
        const row=[...$('view').querySelectorAll('[data-career-row]')].find(x=>x.dataset.careerRow===d.saveCareerMatch);
        if(!row)return say('Amistoso não encontrado.',false);
        const values=Object.fromEntries([...row.querySelectorAll('[data-career-field]')].map(x=>[x.dataset.careerField,x.value.trim()]));
        const hs=Number(values.home_score),as=Number(values.away_score);
        if(!values.home_coach||!values.away_coach||!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0)
          return say('Preencha os técnicos e placares com valores válidos.',false);
        const sel=row.querySelector('[data-archive-competition]');
        const update={...values,home_score:hs,away_score:as,played_on:values.played_on||null,official_competition_id:sel?.value||null};
        t.disabled=true;
        const {data,error}=await sb.from('career_matches').update(update).eq('id',d.saveCareerMatch).select('id,official_competition_id');
        t.disabled=false;
        if(error)return say(traduz(error),false);
        if(!data?.length||String(data[0].official_competition_id||'')!==String(update.official_competition_id||''))return say('A competição não foi salva no banco. Verifique as permissões de edição do histórico.',false);
        say('Amistoso histórico atualizado.',true);return refresh();
      }
      if(d.deleteCareerMatch){
        if(!confirm('Excluir definitivamente este amistoso do histórico dos técnicos?'))return;
        return run(sb.from('career_matches').delete().eq('id',d.deleteCareerMatch),'Amistoso histórico excluído.');
      }
      if(d.saveArchiveCompetition){
        const sel=[...$('view').querySelectorAll('[data-archive-competition]')].find(x=>x.dataset.archiveCompetition===d.saveArchiveCompetition);
        if(!sel)return say('Seletor de competição não encontrado.',false);
        const value=sel.value||null;
        t.disabled=true;
        const {error}=await sb.from('career_matches').update({official_competition_id:value}).eq('id',d.saveArchiveCompetition);
        t.disabled=false;
        if(error)return say(traduz(error),false);
        say('Competição do jogo histórico salva com sucesso.',true);
        return refresh();
      }
      if(d.fadd){const h=$('fh').value,a=$('fa').value;if(!h||!a)return say('Cadastre os participantes primeiro.',false);if(h===a)return say('Escolha participantes diferentes.',false);return run(sb.from('matches').insert({round_id:null,home_id:h,away_id:a,played_on:$('fdt').value||null,category:'friendly'}),'Amistoso cadastrado sem vínculo com rodada.');}
      if(d.reclass)return reclassifyFriendly(d.reclass);
      if(d.s)return saveOne(d.s);
      if(d.mx&&confirm('Excluir este amistoso?'))return run(sb.from('matches').delete().eq('id',d.mx),'Amistoso excluído.');
      if(d.g){openGoals=openGoals===d.g?null:d.g;return vJogos();}
      if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
      if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
      if(d.c&&confirm('Apagar o placar desta partida?'))sb.from('match_events').delete().eq('match_id',d.c).then(()=>run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null,went_to_extra_time:false,golden_goal:false}).eq('id',d.c),'Placar removido.'));
    };
    return;
  }
  if (activeCategory === 'weekly') {
    if (!selWeekly || !D.weeklies.some(w => w.id === selWeekly)) selWeekly = D.weeklies[0]?.id || null;
    const edition = D.weeklies.find(w => w.id === selWeekly);
    const weeklyRounds = (D.weeklyRounds||[]).filter(r => r.weekly_id === selWeekly).sort((a,b)=>a.number-b.number);
    if (!weeklyRounds.some(r => r.id === selRound)) selRound = weeklyRounds.length ? weeklyRounds[weeklyRounds.length-1].id : null;
    const r = weeklyRounds.find(x=>x.id===selRound) || null;
    const ms = r ? D.matches.filter(m=>m.category==='weekly'&&m.weekly_id===selWeekly&&m.weekly_round_id===r.id) : [];
    const picker = `<div class="card" style="margin-bottom:12px"><div class="cardbody inline" style="padding:10px"><div class="field"><label>Campeonato semanal</label><select id="weeklyPick">${D.weeklies.map(w=>`<option value="${w.id}" ${w.id===selWeekly?'selected':''}>${esc(w.name)} • ${fd(w.event_date)}</option>`).join('')}</select></div><button class="btn" data-goweekly="1">ABRIR SEMANAIS</button></div></div>`;
    if (!edition) { $('view').innerHTML = switcher + picker + '<div class="empty">Cadastre uma edição na aba SEMANAIS antes de registrar rodadas.</div>'; $('view').onclick=e=>{if(e.target.closest('[data-goweekly]')){tab='weekly';render();}}; return; }
    const finals=(D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===selWeekly&&['final','third_place'].includes(p.phase_type));
    const finalRoundIds=new Set(weeklyRounds.filter(r=>finals.some(p=>p.id===r.phase_id)).map(r=>r.id));
    const finalGames=D.matches.filter(m=>m.category==='weekly'&&m.weekly_id===selWeekly&&finalRoundIds.has(m.weekly_round_id)).sort((a,b)=>displaySort(a,b)||(a.created_at||'').localeCompare(b.created_at||''));
    const finalOrderPanel=finalGames.length>1?`<div class="card cbpes-final-order"><div class="cardhead"><h2>ORDEM DAS PARTIDAS DECISIVAS</h2></div><div class="cardbody"><p class="admin-help">Defina qual jogo aparece primeiro na Final. Use as setas para mover a disputa de 3º lugar acima da final, por exemplo.</p>${finalGames.map(m=>`<div class="cbpes-order-item"><span>${esc(weeklyRounds.find(r=>r.id===m.weekly_round_id)?.phase?.name||'Mata-mata')} · ${esc(m.home.name)} x ${esc(m.away.name)}</span>${displayOrderControls(m,finalGames)}</div>`).join('')}</div></div>`:'';
    const next = weeklyRounds.length ? Math.max(...weeklyRounds.map(x=>x.number))+1 : 1;
    const newForm = showNew ? `<div class="card" style="margin-bottom:8px"><div class="cardbody" style="padding:10px;display:grid;gap:8px"><div class="field"><label>Número da rodada</label><input id="wrn" type="number" min="1" value="${next}"></div><div class="field"><label>Nome (opcional)</label><input id="wrnm" placeholder="Ex.: Semifinal ou Final"></div><div class="field"><label>Fase</label><select id="wrphase">${opts((D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===selWeekly),null,p=>p.name)}</select></div><div class="field"><label>Data</label><input id="wrd" type="date" value="${edition.event_date||''}"></div><button class="btn sm primary" data-wrcreate="1">CRIAR RODADA</button></div></div>` : '';
    const list = weeklyRounds.map(x=>{const a=D.matches.filter(m=>m.weekly_round_id===x.id&&m.category==='weekly');return `<button data-wsel="${x.id}" class="${x.id===selRound?'on':''}"><span>${esc(roundLabel(x))}</span><small>${a.filter(m=>m.played).length}/${a.length}</small></button>`;}).join('') || '<div class="empty">Nenhuma rodada criada nesta edição.</div>';
    const right = r ? `<div class="card"><div class="cardhead"><h2>${esc(roundLabel(r))}</h2><span class="inline" style="align-items:center"><input type="date" id="wrdt" value="${r.date||''}"><button class="btn sm" data-wrdsave="1">SALVAR DATA</button><button class="btn sm danger" data-wrx="${r.id}">EXCLUIR RODADA</button></span></div><div class="cardbody">${ms.length?``+ms.map(rowHTML).join(''):'<div class="empty">Sem partidas nesta rodada.</div>'}<div class="inline" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><div class="field"><label>Mandante</label><select id="wh">${opts(D.participants,null,p=>p.name)}</select></div><span>x</span><div class="field"><label>Visitante</label><select id="wa">${opts(D.participants,null,p=>p.name)}</select></div><div class="field"><label>Data do jogo</label><input type="date" id="wdt" value="${r.date||edition.event_date}"></div><button class="btn sm primary" data-wadd="1">ADICIONAR PARTIDA</button></div></div></div>` : '<div class="empty">Crie ou selecione uma rodada para cadastrar partidas.</div>';
    $('view').innerHTML = switcher + picker + finalOrderPanel + `<div class="split"><div><button class="btn primary" style="width:100%;margin-bottom:8px" data-wnew="1">${showNew?'FECHAR':'+ NOVA RODADA'}</button>${newForm}<div class="rlist">${list}</div></div><div>${right}</div></div>`;
    $('view').onchange=e=>{if(e.target.id==='weeklyPick'){selWeekly=e.target.value;selRound=null;showNew=false;vJogos();}};
    $('view').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.m)saveOne(e.target.dataset.m)};
    $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
      if(d.orderUp||d.orderDown){const id=d.orderUp||d.orderDown;return moveMatchOrder(id,d.orderUp?-1:1,finalGames.some(m=>m.id===id)?finalGames:curMatches());}
      if(d.editMatch){editingMatchId=d.editMatch;matchEditorTab='result';gamesSubView='editor';openGoals=null;return vMatchEditor();}
      if(d.editReport){reportMatchId=d.editReport;gamesSubView='reports';return vSumulas();}
      if(d.openReports){gamesSubView='reports';return vSumulas();}
      if(d.category){editingMatchId=null;activeCategory=d.category;selRound=null;showNew=false;return vJogos();}
      if(d.goweekly){tab='weekly';render();return;}
      if(d.wnew){showNew=!showNew;return vJogos();}
      if(d.wsel){selRound=d.wsel;openGoals=null;return vJogos();}
      if(d.wrcreate){const n=+$('wrn').value;if(n<1)return say('Informe um número de rodada válido.',false);showNew=false;return run(sb.from('weekly_rounds').insert({number:n,name:$('wrnm').value.trim()||null,date:$('wrd').value||edition.event_date,weekly_id:selWeekly,phase_id:$('wrphase').value||null}),'Rodada semanal criada.');}
      if(d.wrdsave)return run(sb.from('weekly_rounds').update({date:$('wrdt').value||null}).eq('id',selRound).eq('weekly_id',selWeekly),'Data da rodada semanal salva.');
      if(d.wrx){const count=D.matches.filter(m=>m.weekly_round_id===d.wrx).length;if(count)return say('Esta rodada ainda possui partidas. Exclua ou mova as partidas antes de excluir a rodada.',false);if(confirm('Excluir esta rodada semanal?')){selRound=null;return run(sb.from('weekly_rounds').delete().eq('id',d.wrx).eq('weekly_id',selWeekly),'Rodada semanal excluída.');}}
      if(d.wadd){const h=$('wh').value,a=$('wa').value;if(!selRound)return say('Selecione uma rodada.',false);if(!h||!a)return say('Cadastre os participantes primeiro.',false);if(h===a)return say('Escolha participantes diferentes.',false);return run(sb.from('matches').insert({round_id:null,weekly_round_id:selRound,weekly_id:selWeekly,home_id:h,away_id:a,played_on:$('wdt').value||r.date||edition.event_date,category:'weekly'}),'Partida vinculada à rodada semanal.');}
      if(d.s)return saveOne(d.s);if(d.mx&&confirm('Excluir esta partida semanal?'))return run(sb.from('matches').delete().eq('id',d.mx),'Partida excluída.');
      if(d.g){openGoals=openGoals===d.g?null:d.g;return vJogos();}if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
      if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
      if(d.c&&confirm('Apagar o placar desta partida?'))sb.from('match_events').delete().eq('match_id',d.c).then(()=>run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null,went_to_extra_time:false,golden_goal:false}).eq('id',d.c),'Placar removido.'));
      if(d.saveall)return saveAll();
    };
    return;
  }
  // Resolve a edição antes de filtrar rodadas: o seletor não pode alterar o estado após a filtragem.
  const editions=D.officialEditions||[];
  if(!editions.some(e=>e.id===selOfficialEdition))selOfficialEdition=editions[0]?.id||null;
  const categoryRounds = D.rounds.filter(x => { if(x.official_edition_id!==selOfficialEdition)return false; const linked=D.matches.filter(m=>m.round_id===x.id);return !linked.length||linked.some(m=>(m.category||'official')==='official'); });
  if(!categoryRounds.some(r=>r.id===selRound))selRound=categoryRounds.length?categoryRounds[categoryRounds.length-1].id:null;
  const r=categoryRounds.find(x=>x.id===selRound),ST={liga:'Liga',grupos:'Grupos',mata:'Mata-mata'};
  const officialRounds=categoryRounds; const next=officialRounds.length?Math.max(...officialRounds.map(x=>x.number))+1:1;
  const newForm=showNew?`<div class="card" style="margin-bottom:8px"><div class="cardbody" style="padding:10px;display:grid;gap:8px"><div class="field"><label>Número</label><input id="rn" type="number" min="1" value="${next}"></div><div class="field"><label>Tipo de rodada</label><select id="rst"><option value="liga">Liga</option><option value="grupos">Grupos</option><option value="mata">Mata-mata</option></select></div><div class="field"><label>Fase da competição</label><select id="rphase">${opts((D.phases||[]).filter(p=>p.competition_type==='official'&&p.official_edition_id===selOfficialEdition),null,p=>p.name)}</select></div><div class="field"><label>Nome (opcional)</label><input id="rnm" placeholder="Ex.: Semifinais"></div><div class="field"><label>Data</label><input id="rd" type="date"></div><button class="btn sm primary" data-rcreate="1">CRIAR RODADA</button></div></div>`:'';
  const list=categoryRounds.map(x=>{const a=D.matches.filter(m=>m.round_id===x.id&&(m.category||'official')==='official');return `<button data-sel="${x.id}" class="${x.id===selRound?'on':''}"><span>${esc(roundLabel(x))}</span><small>${a.filter(m=>m.played).length}/${a.length}</small></button>`;}).join('')||'<div class="empty">Nenhuma rodada oficial cadastrada.</div>';
  const ms=r?curMatches():[];
  const right=r?`<div class="card"><div class="cardhead"><h2>${esc(roundLabel(r))} <span class="pill">${ST[r.stage]}</span></h2><span class="inline" style="align-items:center"><input type="date" id="rdt" value="${r.date||''}"><button class="btn sm" data-rdsave="1">SALVAR DATA</button><button class="btn sm danger" data-rx="${r.id}">EXCLUIR RODADA</button></span></div><div class="cardbody">${ms.length?``+ms.map(rowHTML).join(''):'<div class="empty">Sem confrontos nesta rodada.</div>'}<div class="inline" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><div class="field"><label>Novo confronto</label><select id="mh">${opts(competitionParticipants(),null,p=>p.name)}</select></div><span>x</span><div class="field"><label>Visitante</label><select id="ma">${opts(competitionParticipants(),null,p=>p.name)}</select></div>${r.stage==='grupos'?'<div class="field"><label>Grupo</label><input id="mg" style="width:64px" maxlength="2"></div>':''}${r.stage==='mata'?'<div class="field"><label>Jogo</label><select id="ml"><option value="1">Jogo 1</option><option value="2">Jogo 2</option></select></div>':''}<div class="field"><label>Data</label><input type="date" id="mdt" value="${r.date||''}"></div><button class="btn sm primary" data-add="1">ADICIONAR</button></div></div></div>`:'<div class="empty">Gere o calendário na aba Campeonato ou crie uma rodada ao lado.</div>';
  const importPhases=(D.phases||[]).filter(p=>p.competition_type==='official'&&p.official_edition_id===selOfficialEdition);
  const importPhaseOptions='<option value="">Selecione a fase</option>'+importPhases.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  const bulkPanel=`<div class="card" style="margin-bottom:12px"><div class="cardhead"><h2>IMPORTAR PARTIDAS EM LOTE</h2></div><div class="cardbody"><p class="admin-help">Uma partida por linha: Rodada | Mandante | Visitante. Sem datas e horários. As rodadas inexistentes serão vinculadas à fase escolhida.</p><div class="field" style="margin-bottom:10px"><label>FASE DA COMPETIÇÃO</label><select id="fixtureBulkPhase">${importPhaseOptions}</select></div><textarea id="fixtureBulkText" rows="5" style="width:100%" placeholder="Rodada | Mandante | Visitante&#10;1 | Roma | Milan&#10;1 | Arsenal | Inter"></textarea><pre id="fixtureBulkFeedback" style="white-space:pre-wrap;font-size:12px"></pre><div class="inline"><button class="btn" id="fixtureBulkRepair">VINCULAR RODADAS EXISTENTES À FASE</button><button class="btn" id="fixtureBulkPreview">CONFERIR PARTIDAS</button><button class="btn primary" id="fixtureBulkSave">IMPORTAR PARTIDAS</button></div></div></div>`;
  $('view').innerHTML=switcher+officialEditionSelect()+bulkPanel+`<div class="split"><div><button class="btn primary" style="width:100%;margin-bottom:8px" data-new="1">${showNew?'FECHAR':'+ NOVA RODADA'}</button>${newForm}<div class="rlist">${list}</div></div><div>${right}</div></div>`;
  $('view').onchange=e=>{if(e.target.id==='officialEditionPick'){selOfficialEdition=e.target.value;selRound=null;vJogos();}};
  $('view').onkeydown=e=>{if(e.key==='Enter'&&e.target.dataset.m)saveOne(e.target.dataset.m)};
  $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;
    if(t.id==='fixtureBulkRepair'){
      const phaseId=$('fixtureBulkPhase')?.value;
      const phase=(D.phases||[]).find(p=>p.id===phaseId&&p.official_edition_id===selOfficialEdition);
      if(!phase)return say('Selecione uma fase válida da edição.',false);
      const rounds=D.rounds.filter(r=>r.official_edition_id===selOfficialEdition&&!r.phase_id);
      if(!rounds.length)return say('Não há rodadas sem fase nesta edição.',false);
      if(!confirm('Vincular '+rounds.length+' rodadas sem fase à fase '+phase.name+'? Os jogos existentes serão preservados.'))return;
      t.disabled=true;
      try{
        const ids=rounds.map(r=>r.id);
        const {error}=await sb.from('rounds').update({phase_id:phaseId}).in('id',ids).eq('official_edition_id',selOfficialEdition);
        if(error)throw error;
        say('Rodadas vinculadas à fase. Nenhuma partida foi duplicada.',true);await refresh();
      }catch(err){say(err.message,false);}finally{t.disabled=false;}
      return;
    }
    if(t.id==='fixtureBulkPreview'){const {result,errors}=parseOfficialFixtures($('fixtureBulkText').value,selOfficialEdition);$('fixtureBulkFeedback').textContent=errors.length?errors.join('\\n'):result.map(x=>'Rodada '+x.number+': '+x.home.name+' × '+x.away.name).join('\\n')||'Nenhuma partida identificada.';return;}
    if(t.id==='fixtureBulkSave')return importOfficialFixtures();
    const d=t.dataset;
    if(d.orderUp||d.orderDown)return moveMatchOrder(d.orderUp||d.orderDown,d.orderUp?-1:1,curMatches());
    if(d.editMatch){editingMatchId=d.editMatch;matchEditorTab='result';gamesSubView='editor';openGoals=null;return vMatchEditor();}
      if(d.editReport){reportMatchId=d.editReport;gamesSubView='reports';return vSumulas();}
      if(d.openReports){gamesSubView='reports';return vSumulas();}
      if(d.category){editingMatchId=null;activeCategory=d.category;selRound=null;showNew=false;openGoals=null;return vJogos();}
    if(d.sel){const selected=categoryRounds.find(x=>String(x.id)===String(d.sel));if(!selected)return say('Rodada não encontrada nesta edição. Atualize a página.',false);selRound=selected.id;openGoals=null;return vJogos();}
    if(d.new){showNew=!showNew;return vJogos();}
    if(d.rcreate){const n=+$('rn').value;if(n>0){showNew=false;run(sb.from('rounds').insert({number:n,stage:$('rst').value,phase_id:$('rphase').value||null,official_edition_id:selOfficialEdition,name:$('rnm').value.trim()||null,date:$('rd').value||null}),'Rodada criada.');}return;}
    if(d.rdsave)return run(sb.from('rounds').update({date:$('rdt').value||null}).eq('id',selRound),'Data da rodada salva.');
    if(d.rx){if(confirm('Excluir a rodada e todas as suas partidas?')){selRound=null;run(sb.from('rounds').delete().eq('id',d.rx),'Rodada excluída.');}return;}
    if(d.mx&&confirm('Excluir este jogo?'))return run(sb.from('matches').delete().eq('id',d.mx),'Jogo excluído.');
    if(d.add){const h=$('mh').value,a=$('ma').value;if(!h||!a)return say('Cadastre os participantes primeiro.',false);if(h===a)return say('Escolha participantes diferentes.',false);return run(sb.from('matches').insert({round_id:selRound,official_edition_id:selOfficialEdition,home_id:h,away_id:a,played_on:$('mdt').value||null,group_name:$('mg')?$('mg').value.trim().toUpperCase()||null:null,leg:$('ml')?+$('ml').value:1,category:'official'}),'Confronto oficial adicionado à rodada.');}
    if(d.saveall)return saveAll();if(d.s)return saveOne(d.s);if(d.g){openGoals=openGoals===d.g?null:d.g;return vJogos();}
    if(d.ex)return run(sb.from('match_events').delete().eq('id',d.ex),'Gol removido.');
    if(d.ga)return run(sb.from('match_events').insert({match_id:d.ga,scorer_id:$('gs').value,assist_id:$('ga').value||null}),'Gol lançado.');
    if(d.c&&confirm('Apagar o placar desta partida?'))sb.from('match_events').delete().eq('match_id',d.c).then(()=>run(sb.from('matches').update({home_score:null,away_score:null,home_pen:null,away_pen:null,went_to_extra_time:false,golden_goal:false}).eq('id',d.c),'Placar removido.'));
  };
}
// ---------- Edições de campeonatos semanais ----------
function vSemanais() {
  const selected = D.weeklies.find(w=>w.id===selWeekly) || null;
  const w = selected || {name:'',event_date:today(),participant_count:0,format_description:'',champion_id:null,champion_coach_name:''};
  $('view').innerHTML = `<div class="card" style="margin-bottom:14px"><div class="cardhead"><h2>${selected?'EDITAR EDIÇÃO SEMANAL':'NOVA EDIÇÃO SEMANAL'}</h2></div><div class="cardbody"><div class="inline"><div class="field"><label>Nome do campeonato</label><input id="wn" maxlength="80" value="${esc(w.name)}" placeholder="Ex.: Semanal CBPES"></div><div class="field"><label>Data da edição</label><input id="wdate" type="date" value="${w.event_date||today()}"></div><div class="field"><label>Quantidade de participantes</label><input id="wcount" type="number" min="0" max="128" value="${w.participant_count||0}" style="width:110px"></div></div><div class="field" style="margin-top:10px"><label>Formato / regras desta edição</label><textarea id="wformat" rows="3" style="width:100%" placeholder="Ex.: 8 participantes, grupos + semifinal e final, jogo único...">${esc(w.format_description||'')}</textarea></div><div style="margin-top:12px"><label class="admin-help">PARTICIPANTES INSCRITOS NESTA EDIÇÃO (opcional)</label><div class="cols3" style="gap:6px;margin-top:6px">${D.participants.map(p=>`<label style="display:flex;gap:7px;align-items:center;padding:5px;border:1px solid var(--line)"><input type="checkbox" name="weeklyParticipant" value="${p.id}" ${(D.weeklyParticipants||[]).some(x=>x.weekly_id===selected?.id&&x.participant_id===p.id)?'checked':''}>${esc(p.name)}</label>`).join('')||'<span class="admin-help">Cadastre os times na aba Times primeiro.</span>'}</div></div><div class="inline" style="margin-top:10px"><div class="field"><label>Campeão da edição</label><select id="wchamp"><option value="">Ainda não definido</option>${opts(D.participants,w.champion_id,p=>p.name)}</select></div><div class="field"><label>Técnico campeão</label><input id="wcoach" maxlength="80" value="${esc(w.champion_coach_name||'')}" placeholder="Nome do técnico"></div></div><div class="form-actions"><button class="btn primary" id="wSave">${selected?'SALVAR ALTERAÇÕES':'CRIAR EDIÇÃO'}</button>${selected?'<button class="btn danger" id="wDelete">EXCLUIR EDIÇÃO</button><button class="btn" id="wNew">NOVA EDIÇÃO</button>':''}</div><p class="admin-help">Cada data identifica uma edição independente. O campeão e seu técnico ficam registrados como troféu no histórico geral.</p></div></div>
  <div class="card" style="margin-bottom:14px"><div class="cardhead"><h2>FASES DESTA EDIÇÃO</h2><button class="btn sm primary" id="wpAdd" ${selected?'':'disabled'}>ADICIONAR FASE</button></div><div class="cardbody">${selected?((D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===selected.id).sort((a,b)=>a.sort_order-b.sort_order).map(p=>`<div class="player"><div><b>${esc(p.name)}</b><small>${p.phase_type==='groups'?'Conta para a classificação':p.phase_type==='final'?'Final':p.phase_type==='third_place'?'Disputa de 3º lugar':p.phase_type==='playoff'?'Playoff • '+(p.playoff_config?.direct??2)+' diretos / posições '+(p.playoff_config?.from??3)+'–'+(p.playoff_config?.to??6):'Mata-mata'}</small></div><span>${p.phase_type==='playoff'?`<button class="btn sm primary" data-wp-playoff="${p.id}">GERAR PLAYOFF</button>`:''}${p.phase_type!=='playoff' && (D.phases||[]).some(q=>q.competition_type==='weekly'&&q.weekly_id===selected.id&&q.sort_order===p.sort_order-1&&q.phase_type==='playoff')?`<button class="btn sm primary" data-wp-advance="${p.id}">AVANÇAR VENCEDORES</button>`:''} <button class="btn sm" data-wpedit="${p.id}">EDITAR</button> <button class="btn sm danger" data-wpdel="${p.id}">EXCLUIR</button></span></div>`).join('')||'<div class="empty">Nenhuma fase cadastrada.</div>'):'Salve a edição para administrar suas fases.'}<p class="admin-help">Crie fases de grupos, playoffs, mata-mata, final e disputa de 3º lugar. O playoff gera confrontos automaticamente; partidas podem ser ajustadas na aba Jogos antes de avançar os vencedores.</p></div></div>
  ${selected?zoneManager('weekly',selected.id):''}
  <div class="card"><div class="cardhead"><h2>EDIÇÕES CADASTRADAS (${D.weeklies.length})</h2></div><div class="cardbody">${D.weeklies.length?D.weeklies.map(x=>`<div class="player"><div><b>${esc(x.name)}</b><small>${fd(x.event_date)} • ${x.participant_count||0} participantes • ${D.matches.filter(m=>m.weekly_id===x.id).length} partidas ${x.champion_id?'• Campeão: '+esc(pname(x.champion_id)):''}</small></div><button class="btn sm" data-wedit="${x.id}">EDITAR</button></div>`).join(''):'<div class="empty">Nenhuma edição semanal cadastrada.</div>'}</div></div>`;
  $('view').onclick=async e=>{const t=e.target.closest('button');if(!t)return;const d=t.dataset;
    if(d.zoneAdd||d.zoneEdit||d.zoneDel)return zoneAction(d,'weekly',selected?.id);
    if(d.wedit){selWeekly=d.wedit;return vSemanais();}
    if(t.id==='wpAdd'&&selected){const name=prompt('Nome da nova fase (ex.: Final, Disputa de 3º lugar):');if(!name)return;const choice=askPhaseType('knockout');if(!choice)return choice===false?say('Escolha uma opção de 1 a 6.',false):null;const kind=choice.type,phases=(D.phases||[]).filter(p=>p.competition_type==='weekly'&&p.weekly_id===selected.id);const playoff_config=kind==='playoff'?askPlayoffConfig():null;if(playoff_config===false||playoff_config===null&&kind==='playoff')return;return run(sb.from('competition_phases').insert({competition_type:'weekly',weekly_id:selected.id,name:name.trim(),phase_type:kind,sort_order:phases.length+1,counts_in_standings:kind==='groups',playoff_config}),'Fase semanal criada.');}
    if(d.wpPlayoff){const ph=(D.phases||[]).find(p=>p.id===d.wpPlayoff);if(ph)return generateConfiguredPlayoff(ph);}
    if(d.wpAdvance){const ph=(D.phases||[]).find(p=>p.id===d.wpAdvance);if(ph)return generateNextFromPlayoff(ph);}
    if(d.wpedit){const p=(D.phases||[]).find(x=>x.id===d.wpedit);if(!p)return;const name=prompt('Nome da fase:',p.name);if(!name)return;const choice=askPhaseType(p.phase_type);if(!choice)return choice===false?say('Escolha uma opção de 1 a 6.',false):null;const kind=choice.type;const playoff_config=kind==='playoff'?askPlayoffConfig(p.playoff_config):null;if(playoff_config===false||playoff_config===null&&kind==='playoff')return;return run(sb.from('competition_phases').update({name:name.trim(),phase_type:kind,counts_in_standings:kind==='groups',playoff_config}).eq('id',p.id),'Fase atualizada.');}
    if(d.wpdel){const used=(D.weeklyRounds||[]).some(r=>r.phase_id===d.wpdel);if(used)return say('Esta fase possui rodadas vinculadas. Mova ou exclua as rodadas antes.',false);if(confirm('Excluir esta fase?'))return run(sb.from('competition_phases').delete().eq('id',d.wpdel),'Fase excluída.');}

    if(t.id==='wNew'){selWeekly=null;return vSemanais();}
    if(t.id==='wSave'){const roster=[...document.querySelectorAll('input[name=weeklyParticipant]:checked')].map(x=>x.value);const payload={name:$('wn').value.trim()||'Campeonato Semanal',event_date:$('wdate').value,participant_count:roster.length||(+$('wcount').value||0),format_description:$('wformat').value.trim(),champion_id:$('wchamp').value||null,champion_coach_name:$('wcoach').value.trim()||null};if(!payload.event_date)return say('Informe a data da edição.',false);if(payload.champion_id&&!payload.champion_coach_name){const cp=D.participants.find(p=>p.id===payload.champion_id);const games=D.matches.filter(m=>m.weekly_id===selected?.id&&m.played);const last=games.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));const snap=last.map(m=>m.home_id===payload.champion_id?m.home_coach_name:m.away_id===payload.champion_id?m.away_coach_name:null).find(Boolean);payload.champion_coach_name=snap||cp?.coach_name||null;}let savedId=selected?.id;if(selected){const {error}=await sb.from('weekly_editions').update(payload).eq('id',selected.id);if(error)return say(traduz(error),false);}else{const {data,error}=await sb.from('weekly_editions').insert(payload).select('id').single();if(error)return say(traduz(error),false);savedId=data.id;selWeekly=savedId;const {error:phaseErr}=await sb.from('competition_phases').insert({competition_type:'weekly',weekly_id:savedId,name:'Fase de grupos',phase_type:'groups',sort_order:1,counts_in_standings:true});if(phaseErr)return say(traduz(phaseErr),false);}const {error:delErr}=await sb.from('weekly_participants').delete().eq('weekly_id',savedId);if(delErr)return say(traduz(delErr),false);if(roster.length){const {error:insErr}=await sb.from('weekly_participants').insert(roster.map(participant_id=>({weekly_id:savedId,participant_id})));if(insErr)return say(traduz(insErr),false);}say(selected?'Edição semanal atualizada.':'Edição semanal criada.',true);await refresh();return;}
    if(t.id==='wDelete'&&selected){if(D.matches.some(m=>m.weekly_id===selected.id))return say('Exclua primeiro as partidas vinculadas a esta edição.',false);if(confirm('Excluir esta edição semanal?')){selWeekly=null;return run(sb.from('weekly_editions').delete().eq('id',selected.id),'Edição excluída.');}}
  };
}

// ---------- Times: participantes + jogadores + histórico individual ----------
function histPart(p) {
  const ms = D.matches.filter(m => m.played && (m.home_id === p.id || m.away_id === p.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ms.length) return '<div class="empty">Sem partidas disputadas.</div>';
  return ms.map(m => { const home = m.home_id === p.id, g = home ? m.home_score : m.away_score, c = home ? m.away_score : m.home_score, r = g > c ? ['V', 'res-w'] : g < c ? ['D', 'res-l'] : ['E', 'res-d']; return `<div class="result-row"><div class="round-label ${m.category==='friendly'||m.category==='weekly'?'tag-friendly':'tag-official'}">${m.category==='friendly'?'AMIS':m.category==='weekly'?'SEM':pad(m.round?.number||0)}</div><div class="result-teams">${esc(m.home.name)} x ${esc(m.away.name)}<small>${m.category==='friendly'?'Amistoso':m.category==='weekly'?esc(m.weekly?.name||'Semanal'):esc(roundLabel(m.round))+' • '}${fd(m.date)}</small></div><div class="result-score">${m.home_score} – ${m.away_score} <span class="${r[1]}">${r[0]}</span></div></div>`; }).join('');
}
function validateCrestSvg(raw){
 if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('SVG com DOCTYPE ou entidades não é permitido.');
 const doc=new DOMParser().parseFromString(raw,'image/svg+xml'),root=doc.documentElement;
 if(doc.querySelector('parsererror')||root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('SVG inválido.');
 const forbidden=new Set(['script','foreignObject','iframe','object','embed','image','animate','animateMotion','animateTransform','set','a','feImage']);
 for(const el of [root,...root.querySelectorAll('*')]){
  if(forbidden.has(el.localName))throw Error('SVG contém elemento não permitido: '+el.localName);
  for(const attr of [...el.attributes]){
   const name=attr.name.toLowerCase(),value=attr.value.trim();
   if(name.startsWith('on'))throw Error('SVG contém evento não permitido.');
   if(name==='href'||name.endsWith(':href')){
    if(!/^#[a-zA-Z_][\w.:-]*$/.test(value))throw Error('SVG contém referência externa.');
    continue;
   }
   const noLocalUrls=value.replace(/url\(\s*(['"]?)#[a-zA-Z_][\w.:-]*\1\s*\)/gi,'');
   if(/url\s*\(|javascript:|data:|@import|expression\s*\(|-moz-binding/i.test(noLocalUrls))throw Error('SVG contém referência externa ou estilo inseguro.');
  }
 }
 return new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'});
}
async function saveCrest(id){
 const p=D.participants.find(x=>String(x.id)===String(id));if(!p)return;
 const file=$('crestFile'+id)?.files?.[0],input=$('crestUrl'+id)?.value.trim()||'';
 if(file&&input)return say('Escolha o arquivo OU informe a URL, não ambos.',false);
 let url=input;
 if(file){
  const svg=file.type==='image/svg+xml'||/\.svg$/i.test(file.name);
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)&&!svg || file.size>2097152)return say('Use PNG, JPG, WebP ou SVG de até 2 MB.',false);
  let uploadFile=file;
  if(svg){
    const raw=await file.text();
    uploadFile=validateCrestSvg(raw);
  }
  const ext=svg?'svg':file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=`${id}/${Date.now()}.${ext}`;
  const {error}=await sb.storage.from('club-crests').upload(path,uploadFile,{contentType:svg?'image/svg+xml':file.type,upsert:false});
  if(error)return say('Falha no upload: '+traduz(error),false);
  url=sb.storage.from('club-crests').getPublicUrl(path).data.publicUrl;
 }
 if(url&&!/^https:\/\//i.test(url))return say('A URL precisa começar com https://',false);
 return run(sb.from('participants').update({crest_url:url||null}).eq('id',id),url?'Escudo salvo.':'Escudo removido.');
}

// Importação de escudos SVG em lote: associação por nomes conhecidos e confirmação prévia.
const crestAliases=[
 ['Milan',['milan','ac milan']],['Arsenal',['arsenal']],['Chelsea',['chelsea']],
 ['Barcelona',['barcelona','fc barcelona']],['Inter de Milão',['inter milan','inter de milao','internazionale','inter']],
 ['Juventus',['juventus']],['Liverpool',['liverpool']],['Manchester United',['manchester united','man utd']],
 ['Lyon',['lyonnais','lyon','olympique lyonnais']],['Real Madrid',['real madrid']],
 ['Roma',['roma','as roma']],['Villarreal',['villarreal']]
];
const crestNorm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function crestClubForFile(filename){
 const stem=crestNorm(filename.replace(/\.svg$/i,'').replace(/logo.*$/i,''));
 const found=crestAliases.find(([name,aliases])=>aliases.some(a=>stem===crestNorm(a)||stem.startsWith(crestNorm(a)+' ')));
 if(!found)return null;
 const candidates=D.participants.filter(p=>crestNorm(p.name)===crestNorm(found[0])||found[1].some(a=>crestNorm(p.name)===crestNorm(a)));
 return candidates.length===1?candidates[0]:null;
}
async function uploadCrestsBulk(files){
 const items=[...files].filter(f=>/\.svg$/i.test(f.name));
 if(!items.length)return say('Selecione arquivos SVG extraídos do RAR.',false);
 const matched=items.map(file=>({file,team:crestClubForFile(file.name)}));
 const valid=matched.filter(x=>x.team),missing=matched.filter(x=>!x.team);
 if(!valid.length)return say('Nenhum nome de arquivo corresponde aos times cadastrados. Confira os nomes dos clubes.',false);
 const details=valid.map(x=>x.file.name+' → '+x.team.name).join('\n');
 if(!confirm('IMPORTAR '+valid.length+' ESCUDOS?\n\n'+details+'\n\nSem correspondência: '+(missing.map(x=>x.file.name).join(', ')||'nenhum')+'\n\nOs escudos dos times associados serão substituídos.'))return;
 const errors=[];let count=0;
 for(const {file,team} of valid){
  try{
   if(file.size>2097152)throw Error('Arquivo maior que 2 MB');
   const raw=await file.text();
   const blob=validateCrestSvg(raw);
   const key=team.id+'/'+Date.now()+'-'+count+'.svg';
   const {error:ue}=await sb.storage.from('club-crests').upload(key,blob,{contentType:'image/svg+xml',upsert:false});
   if(ue)throw ue;
   const url=sb.storage.from('club-crests').getPublicUrl(key).data.publicUrl;
   const {error:de}=await sb.from('participants').update({crest_url:url}).eq('id',team.id);
   if(de)throw de;
   count++;
  }catch(e){errors.push(team.name+': '+(e.message||e));}
 }
 say('Escudos atualizados: '+count+'. Sem correspondência: '+missing.length+'.'+(errors.length?' Falhas: '+errors.join(' | '):''),!errors.length);
 if(count)await refresh();
}

function vTimes() {
  const st = Object.fromEntries(standings(D.participants, D.matches).map(x => [x.p.id, x]));
  const g = {}, a = {}; D.events.forEach(e => { g[e.scorer_id] = (g[e.scorer_id] || 0) + 1; if (e.assist_id) a[e.assist_id] = (a[e.assist_id] || 0) + 1; });
  const panel = p => {
    const pls = D.players.filter(x => x.participant_id === p.id);
    const coachRows = (D.coachHistory||[]).filter(h=>h.participant_id===p.id).sort((a,b)=>(b.started_on||'').localeCompare(a.started_on||'')).map(h=>`<div class="player"><div><b>${esc(h.coach_name)}</b>${h.dates_unspecified?'<small>Competição de Abertura</small>':`<small>${h.started_on||'—'} até ${h.ended_on||'atual'}</small>`}</div><span class="pill">${h.ended_on?'ANTERIOR':'ATUAL'}</span></div>`).join('') || '<div class="empty">Nenhum técnico no histórico.</div>';
    return `<tr><td colspan="4" style="text-align:left;background:#f6f8f9;padding:10px 12px"><div class="cbpes-crest-editor"><div class="eyebrow">IDENTIDADE DO CLUBE</div><div class="inline" style="align-items:end;gap:12px;margin-bottom:14px"><div class="field"><label>COR PRIMÁRIA</label><input type="color" id="teamColor${p.id}" value="${/^#[0-9a-f]{6}$/i.test(p.primary_color||'')?p.primary_color:'#176b45'}"></div><div class="field"><label>COR SECUNDÁRIA</label><input type="color" id="teamSecondaryColor${p.id}" value="${/^#[0-9a-f]{6}$/i.test(p.secondary_color||'')?p.secondary_color:'#f5c542'}"></div><button class="btn sm primary" data-team-color-save="${p.id}">SALVAR CORES</button></div><div class="eyebrow">ESCUDO DO CLUBE</div><div class="cbpes-crest-editor-row">${crestImg(p,'cbpes-crest-preview')}<div class="field"><label>Enviar imagem (PNG, JPG, WebP ou SVG, até 2 MB)</label><input id="crestFile${p.id}" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"></div><div class="field"><label>Ou URL HTTPS da imagem</label><input id="crestUrl${p.id}" type="url" placeholder="https://..." value="${esc(p.crest_url||'')}"></div><button class="btn sm primary" data-crest-save="${p.id}">SALVAR ESCUDO</button><button class="btn sm" data-crest-remove="${p.id}">REMOVER</button></div></div><div class="cols3" style="gap:20px"><div><div class="eyebrow" style="margin-bottom:6px">Jogadores (gol / assistência)</div>${pls.map(x => `<div class="player"><div><b>${esc(x.name)}</b></div><span>${g[x.id] || 0} / ${a[x.id] || 0} <button class="btn sm" data-je="${x.id}">EDITAR</button> <button class="btn sm danger" data-jd="${x.id}">EXCLUIR</button></span></div>`).join('') || '<div class="empty">Nenhum jogador.</div>'}<div class="inline" style="margin-top:8px"><input id="jn${p.id}" placeholder="Nome do jogador" maxlength="60"><button class="btn sm primary" data-jadd="${p.id}">ADICIONAR</button></div></div><div><div class="eyebrow" style="margin-bottom:6px">Histórico de técnicos</div>${coachRows}<div class="inline" style="margin-top:10px;align-items:end"><div class="field"><label>Técnico anterior</label><input id="hcn${p.id}" placeholder="Nome do técnico"></div><div class="field"><label>Competição</label><input value="Competição de Abertura" readonly aria-label="Competição de Abertura"></div><button class="btn sm primary" data-hadd="${p.id}">REGISTRAR PASSAGEM</button></div></div></div></td></tr>`;
  };
  $('view').innerHTML = `<div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>CADASTRAR TIME</h2></div><div class="cardbody"><div class="inline" style="margin-top:10px"><input id="pn" maxlength="60" placeholder="Nome do time"><input id="pc" maxlength="80" placeholder="Técnico atual"><label class="field" style="min-width:190px"><span>Participa de competição atualmente?</span><select id="pactive"><option value="true" selected>Sim</option><option value="false">Não</option></select></label><button class="btn primary" id="pAdd">CADASTRAR</button></div></div></div>
  <div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>IMPORTAR TIMES POR NOME</h2></div><div class="cardbody"><p class="admin-help">Cadastre vários clubes de uma só vez, informando um nome por linha.</p><button class="btn primary" id="openTeamImporter">IMPORTAR TIMES</button></div></div>
  <dialog id="teamImportDialog" class="cbpes-team-import-dialog" aria-labelledby="teamImportTitle"><div class="cardhead"><h2 id="teamImportTitle">IMPORTAR NOVOS TIMES</h2></div><div class="cardbody"><p class="admin-help">Digite ou cole um time por linha. Clubes já cadastrados serão ignorados.</p><div class="field"><label>NOMES DOS TIMES</label><textarea id="teamImportNames" rows="10" placeholder="Fluminense&#10;Botafogo&#10;Santos"></textarea></div><div class="field" style="margin-top:12px"><label>PARTICIPA DE COMPETIÇÃO ATUALMENTE?</label><select id="teamImportActive"><option value="true">Sim — ativo</option><option value="false">Não — inativo</option></select></div><p id="teamImportPreview" class="admin-help"></p><div class="inline" style="justify-content:flex-end;margin-top:16px"><button class="btn" id="cancelTeamImport">CANCELAR</button><button class="btn primary" id="submitTeamImport">IMPORTAR TIMES</button></div></div></dialog>
  <div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>IMPORTAR ESCUDOS SVG EM LOTE</h2></div><div class="cardbody"><p class="admin-help">Extraia o RAR no computador e selecione todos os arquivos SVG. O sistema identifica os clubes pelo nome do arquivo e pede confirmação antes de substituir os escudos.</p><div class="inline"><input id="crestBulkFiles" type="file" accept=".svg,image/svg+xml" multiple><button class="btn primary" id="crestBulkUpload">IMPORTAR ESCUDOS</button></div></div></div>
  <div class="card"><div class="cardhead"><h2>Times (${D.participants.length})</h2><span class="admin-help">Abra um time para gerenciar escudo, jogadores e técnicos</span></div><div class="cardbody scroll">${D.participants.length ? `<table class="table"><thead><tr><th>TIME / TÉCNICO</th><th>J</th><th>PTS</th><th></th></tr></thead><tbody>${D.participants.map(p => `<tr><td class="club">${crestImg(p)}${esc(p.name)}<small style="display:block;color:var(--muted);font-weight:500">${esc(p.coach_name || 'Sem técnico atualmente')}<span class="pill" style="margin-left:6px">${p.participates_in_competition === false ? 'FORA DA COMPETIÇÃO' : 'ATIVO'}</span></small></td><td>${st[p.id].j}</td><td>${st[p.id].pts}</td><td style="white-space:nowrap"><button class="btn sm" data-t="${p.id}">${openPart === p.id ? 'FECHAR' : 'ABRIR'}</button> <button class="btn sm" data-e="${p.id}">EDITAR</button> <button class="btn sm danger" data-d="${p.id}">EXCLUIR</button></td></tr>${openPart === p.id ? panel(p) : ''}`).join('')}</tbody></table>` : '<div class="empty">Cadastre o primeiro time.</div>'}</div></div>`;
  $('crestBulkUpload').onclick = () => uploadCrestsBulk($('crestBulkFiles').files);
  const importDialog=$('teamImportDialog');
  $('openTeamImporter').onclick=()=>{importDialog.showModal();$('teamImportNames').focus();};
  $('cancelTeamImport').onclick=()=>importDialog.close();
  importDialog.onclick=e=>{if(e.target===importDialog)importDialog.close();};
  const getImportNames=()=>[...new Map($('teamImportNames').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>[x.toLocaleLowerCase('pt-BR'),x])).values()];
  $('teamImportNames').oninput=()=>{const names=getImportNames();const existing=new Set(D.participants.map(p=>p.name.trim().toLocaleLowerCase('pt-BR')));$('teamImportPreview').textContent=names.filter(n=>!existing.has(n.toLocaleLowerCase('pt-BR'))).length+' novos times • '+names.filter(n=>existing.has(n.toLocaleLowerCase('pt-BR'))).length+' já cadastrados';};
  $('submitTeamImport').onclick=async()=>{
    const names=getImportNames(),existing=new Set(D.participants.map(p=>p.name.trim().toLocaleLowerCase('pt-BR'))),fresh=names.filter(n=>!existing.has(n.toLocaleLowerCase('pt-BR')));
    if(!names.length)return say('Informe pelo menos um nome de time.',false);
    if(!fresh.length)return say('Todos os times informados já estão cadastrados.',false);
    if(fresh.some(n=>n.length>60))return say('O nome de um time ultrapassa 60 caracteres.',false);
    const active=$('teamImportActive').value==='true';
    if(!confirm('Importar '+fresh.length+' novos times como '+(active?'ativos':'inativos')+'?'))return;
    const button=$('submitTeamImport');button.disabled=true;
    try{
      const {error}=await sb.from('participants').insert(fresh.map(name=>({name,coach_name:null,participates_in_competition:active})));
      if(error)return say('Falha na importação: '+traduz(error),false);
      importDialog.close();say(fresh.length+' times importados com sucesso. '+(names.length-fresh.length)+' nomes repetidos ignorados.',true);await refresh();
    }finally{button.disabled=false;}
  };

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
    if(d.teamColorSave){const color=$('teamColor'+d.teamColorSave)?.value,secondary=$('teamSecondaryColor'+d.teamColorSave)?.value;if(!/^#[0-9a-f]{6}$/i.test(color||'')||!/^#[0-9a-f]{6}$/i.test(secondary||''))return say('Cores inválidas.',false);return run(sb.from('participants').update({primary_color:color,secondary_color:secondary}).eq('id',d.teamColorSave),'Cores do clube salvas.');}
    if(d.crestSave)return saveCrest(d.crestSave);
    if(d.crestRemove){if(!confirm('Remover o escudo deste clube?'))return;return run(sb.from('participants').update({crest_url:null}).eq('id',d.crestRemove),'Escudo removido.');}
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
      const coach_name=$('hcn'+d.hadd).value.trim();
      if(!coach_name)return say('Informe o nome do técnico.',false);
      const {error}=await sb.rpc('register_past_team_coach', { p_participant_id:d.hadd, p_coach_name:coach_name, p_start_date:null, p_end_date:null });
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
    return `<div class="card" style="margin-bottom:12px"><div class="cardhead"><div><h2>${esc(name)}</h2><span class="admin-help">${team?'Atual: '+esc(team.name):'Sem equipe atual'} • ${rec.matches.length} jogos • ${titles.length} troféus</span></div><div class="inline"><button class="btn sm" data-coach-rename="${encodeURIComponent(name)}">ALTERAR NOME</button><button class="btn sm" data-coach-profile="${encodeURIComponent(name)}">EDITAR PERFIL</button></div></div><div class="cardbody"><div class="stats four-stats"><div class="stat"><b>${rec.matches.length}</b><span>Jogos</span></div><div class="stat"><b class="res-w">${rec.wins}</b><span>Vitórias</span></div><div class="stat"><b>${rec.draws}</b><span>Empates</span></div><div class="stat"><b class="res-l">${rec.losses}</b><span>Derrotas</span></div></div><p class="admin-help">${esc(profile?.bio||'Sem apresentação cadastrada.')}</p><div class="inline" style="justify-content:space-between;align-items:center"><b>Sala de troféus</b><span class="admin-help">${titles.length} conquista(s)</span></div>${titles.length?titles.map(t=>`<div class="player"><div><b>🏆 ${esc(t.title)}</b><small>${esc(t.competition_name||'Conquista')} • ${fd(t.awarded_on)}${t.team_name?' • '+esc(t.team_name):''}</small></div><span class="pill">${t.source_type==='manual'?'MANUAL':t.source_type==='weekly'?'SEMANAL':'OFICIAL'}</span>${t.source_type==='manual'?`<button class="btn sm danger" data-trophy-delete="${t.id}">EXCLUIR</button>`:''}</div>`).join(''):'<div class="empty">Nenhum troféu registrado.</div>'}<details style="margin-top:10px"><summary class="admin-help" style="cursor:pointer">Ver trajetória de equipes</summary>${history.length?history.map(h=>{const p=D.participants.find(x=>x.id===h.participant_id);return `<div class="player"><b>${esc(p?.name||'Equipe removida')}</b><small>${fd(h.started_on)} – ${h.ended_on?fd(h.ended_on):'Atual'}</small></div>`;}).join(''):'<div class="empty">Sem passagens detalhadas.</div>'}</details></div></div>`;
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
    if(t.dataset.coachRename){
      const oldName=decodeURIComponent(t.dataset.coachRename);
      const newName=prompt('Novo nome do técnico '+oldName+':',oldName);
      if(newName===null)return;
      const clean=newName.trim();
      if(!clean||clean===oldName)return;
      if(clean.length>80)return say('O nome deve ter até 80 caracteres.',false);
      if(allCoachNames().some(n=>coachKey(n)===coachKey(clean)))return say('Já existe um técnico com esse nome.',false);
      if(!confirm('Renomear '+oldName+' para '+clean+' em todo o histórico, partidas, equipes e troféus?'))return;
      const {error}=await sb.rpc('rename_cbpes_coach',{p_old_name:oldName,p_new_name:clean});
      if(error)return say('Não foi possível renomear: '+traduz(error)+'. Verifique se a função rename_cbpes_coach foi instalada no Supabase.',false);
      say('Técnico renomeado de '+oldName+' para '+clean+' em todo o histórico.',true);return refresh();
    }
    if(t.dataset.coachProfile){const name=decodeURIComponent(t.dataset.coachProfile),profile=profiles.find(p=>coachKey(p.name)===coachKey(name));const bio=prompt('Apresentação / biografia de '+name+':',profile?.bio||'');if(bio===null)return;const {error}=await sb.from('coach_profiles').upsert({name,bio},{onConflict:'name'});if(error)return say(traduz(error),false);say('Perfil atualizado.',true);return refresh();}
    if(t.dataset.trophyDelete&&confirm('Excluir esta conquista manual?')){const {error}=await sb.from('coach_trophies').delete().eq('id',t.dataset.trophyDelete).eq('source_type','manual');if(error)return say(traduz(error),false);say('Conquista manual removida.',true);return refresh();}
  };
}


let reportMatchId=null;
const reportStatFields=[['possession','Posse de bola (%)'],['shots','Chutes'],['shots_on_target','Chutes a gol'],['corners','Escanteios'],['penalties','Pênaltis'],['fouls','Faltas cometidas'],['offsides','Impedimentos'],['yellow_cards','Cartões amarelos'],['red_cards','Cartões vermelhos']];
async function vSumulas(){
  gamesSubView='reports';
  const view=$('view'),official=D.matches.filter(m=>(m.category||'official')==='official').slice().reverse();
  if(!reportMatchId&&official.length)reportMatchId=official[0].id;
  const m=official.find(x=>x.id===reportMatchId);
  const [st,stat]=await Promise.all([sb.from('stadiums').select('*').order('name'),m?sb.from('match_statistics').select('*').eq('match_id',m.id).maybeSingle():Promise.resolve({data:null})]);
  const stadiums=st.data||[],stats=stat.data||{};
  const players=D.players.filter(p=>m&&(p.participant_id===m.home_id||p.participant_id===m.away_id));
  const events=(D.events||[]).filter(e=>e.match_id===m?.id);
  const selectPlayers=(selected='',empty='Selecione')=>'<option value="">'+empty+'</option>'+players.map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+' — '+esc(p.team?.name||'')+'</option>').join('');
  const goalkeeperSelect=(teamId,selected)=>'<select data-goalkeeper="'+(teamId===m.home_id?'home':'away')+'"><option value="">Selecionar goleiro</option>'+D.players.filter(p=>p.participant_id===teamId).map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select>';
  const saves=(m&&stats.home_shots_on_target!=null&&stats.away_shots_on_target!=null&&m.home_score!=null&&m.away_score!=null)?{home:Math.max(0,Number(stats.away_shots_on_target)-Number(m.away_score)),away:Math.max(0,Number(stats.home_shots_on_target)-Number(m.home_score))}:null;
  const selectedReportId=reportMatchId;
  const reportNav='<div class="cbpes-admin-editor-tabs cbpes-admin-report-tabs">'+[['meta','lucide:map-pin','Estádio e MVP'],['goals','lucide:goal','Gols e jogadores'],['stats','lucide:chart-no-axes-column','Estatísticas']].map(([key,icon,label])=>'<button class="'+(reportSection===key?'on':'')+'" data-report-section="'+key+'"><iconify-icon icon="'+icon+'"></iconify-icon>'+label+'</button>').join('')+'</div>';
  view.innerHTML='<div class="cbpes-report-toolbar"><button class="btn" id="reportBackToGames"><iconify-icon icon="lucide:arrow-left"></iconify-icon> VOLTAR AOS JOGOS</button><span>SÚMULAS OFICIAIS <small>• Estádio, MVP, gols e estatísticas</small></span></div><div class="card"><div class="cardhead"><h2>SELECIONAR PARTIDA</h2></div><div class="cardbody"><div class="field"><label>PARTIDA</label><select id="reportMatchSelect">'+official.map(x=>'<option value="'+x.id+'" '+(x.id===m?.id?'selected':'')+'>'+esc(x.home.name)+' '+(x.home_score??'–')+' x '+(x.away_score??'–')+' '+esc(x.away.name)+'</option>').join('')+'</select></div></div></div>'+
  (m?'<div class="card"><div class="cardhead"><h2>ESTÁDIO E MVP</h2></div><div class="cardbody"><div class="inline">'+
  field('Estádio padrão do mandante','<select id="reportHomeStadium"><option value="">Não definido</option>'+stadiums.map(s=>'<option value="'+s.id+'" '+(s.id===m.home.stadium_id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select>')+
  field('Estádio desta partida','<select id="reportStadium"><option value="">Padrão do mandante</option>'+stadiums.map(s=>'<option value="'+s.id+'" '+(s.id===m.stadium_id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select>')+
  field('Melhor jogador','<select id="reportMvp">'+selectPlayers(m.mvp_player_id,'Não definido')+'</select>')+
  '</div><div class="inline"><input id="reportNewStadium" placeholder="Nome de novo estádio"><button class="btn" id="reportAddStadium">CADASTRAR ESTÁDIO</button><button class="btn primary" id="reportSaveMeta">SALVAR ESTÁDIO E MVP</button></div></div></div>'+
  '<div class="card"><div class="cardhead"><h2>ELENCO E GOLS</h2></div><div class="cardbody"><div class="inline">'+field('Clube','<select id="reportPlayerTeam"><option value="'+m.home_id+'">'+esc(m.home.name)+'</option><option value="'+m.away_id+'">'+esc(m.away.name)+'</option></select>')+field('Novo jogador','<input id="reportPlayerName" placeholder="Nome do jogador">')+'<button class="btn" id="reportAddPlayer">ADICIONAR JOGADOR</button></div><hr><div class="inline">'+field('Equipe do gol','<select id="reportGoalTeam"><option value="'+m.home_id+'">'+esc(m.home.name)+'</option><option value="'+m.away_id+'">'+esc(m.away.name)+'</option></select>')+field('Autor','<select id="reportScorer">'+selectPlayers()+'</select>')+field('Assistência (opcional)','<select id="reportAssist">'+selectPlayers('','Sem assistência')+'</select>')+field('Minuto (opcional)','<input id="reportMinute" type="number" min="0" max="130" placeholder="—">')+field('Tipo','<select id="reportGoalType"><option value="normal">Normal</option><option value="penalty">Pênalti</option><option value="own_goal">Contra</option></select>')+'<button class="btn primary" id="reportAddGoal">ADICIONAR GOL</button></div><div style="margin-top:14px">'+(events.length?events.map(e=>'<div class="cbpes-report-goal"><b>'+esc(D.players.find(p=>p.id===e.scorer_id)?.name||'Jogador')+'</b> '+(e.minute==null?'':e.minute+"'")+' <button class="btn" data-report-delete="'+e.id+'">REMOVER</button></div>').join(''):'Nenhum gol cadastrado')+'</div></div></div>'+
  '<div class="card"><div class="cardhead"><h2>ESTATÍSTICAS DA PARTIDA</h2></div><div class="cardbody"><div class="cbpes-stats-image-import"><div><b>IMPORTAR ESTATÍSTICAS DO PES 6</b><small>Envie a tela Informação do Jogo. Confira os dados antes de salvar.</small></div><label class="btn" for="reportStatsImage">IMPORTAR IMAGEM</label><input type="file" id="reportStatsImage" accept="image/png,image/jpeg,image/webp" hidden><span id="reportImageStatus" role="status"></span></div><div class="cbpes-goalkeepers-admin"><div><label>GOLEIRO DO '+esc(m.home.name)+'</label>'+goalkeeperSelect(m.home_id,stats.home_goalkeeper_id)+'</div><div><label>GOLEIRO DO '+esc(m.away.name)+'</label>'+goalkeeperSelect(m.away_id,stats.away_goalkeeper_id)+'</div></div><div class="cbpes-goalkeeper-saves"><b>DEFESAS DO GOLEIRO</b><span>'+(saves?' '+saves.home+' × '+saves.away+' ':'Informe chutes a gol e placar')+'</span></div><p class="admin-help">As defesas são calculadas a partir dos chutes a gol do adversário menos os gols sofridos. Confira possíveis gols contra ou substituições de goleiro.</p><div class="cbpes-admin-stat-table"><div class="cbpes-admin-stat-row cbpes-admin-stat-head"><strong>'+esc(m.home.name)+'</strong><span>ESTATÍSTICA</span><strong>'+esc(m.away.name)+'</strong></div>'+reportStatFields.map(([key,label])=>'<label class="cbpes-admin-stat-row"><input aria-label="'+esc(label)+' — '+esc(m.home.name)+'" type="number" min="0" '+(key==='possession'?'max="100"':'')+' data-stat="home_'+key+'" value="'+(stats['home_'+key]??'')+'"><span>'+esc(label)+'</span><input aria-label="'+esc(label)+' — '+esc(m.away.name)+'" type="number" min="0" '+(key==='possession'?'max="100"':'')+' data-stat="away_'+key+'" value="'+(stats['away_'+key]??'')+'"></label>').join('')+'</div><button class="btn primary" id="reportSaveStats">SALVAR ESTATÍSTICAS</button></div></div>':'<div class="empty">Sem partidas oficiais.</div>');
  const cards=[...view.querySelectorAll(':scope > .card')];
  if(cards.length>1){
    const bar=document.createElement('div');bar.innerHTML=reportNav;const nav=bar.firstElementChild;cards[0].after(nav);
    cards.slice(1).forEach((card,i)=>{card.classList.add('cbpes-admin-report-panel');card.hidden=(['meta','goals','stats'][i]!==reportSection);});
    nav.onclick=e=>{const btn=e.target.closest('button[data-report-section]');if(!btn)return;reportSection=btn.dataset.reportSection;vSumulas();};
  }
  $('reportBackToGames').onclick=()=>{if(editingMatchId&&String(editingMatchId)===String(reportMatchId)){gamesSubView='editor';matchEditorTab='result';return vMatchEditor();}gamesSubView='matches';vJogos();};
  $('reportMatchSelect').onchange=e=>{reportMatchId=e.target.value;editingMatchId=null;vSumulas()};
  if(!m)return;
  $('reportAddStadium').onclick=async()=>{const name=$('reportNewStadium').value.trim();if(!name)return say('Informe o estádio.',false);const {error}=await sb.from('stadiums').insert({name});if(error)return say(traduz(error),false);say('Estádio cadastrado.',true);vSumulas()};
  $('reportSaveMeta').onclick=async()=>{const {error:e1}=await sb.from('participants').update({stadium_id:$('reportHomeStadium').value||null}).eq('id',m.home_id);if(e1)return say(traduz(e1),false);const {error:e2}=await sb.from('matches').update({stadium_id:$('reportStadium').value||null,mvp_player_id:$('reportMvp').value||null}).eq('id',m.id);if(e2)return say(traduz(e2),false);say('Estádio e MVP salvos.',true);refresh()};
  $('reportAddPlayer').onclick=async()=>{const name=$('reportPlayerName').value.trim();if(!name)return say('Informe o jogador.',false);const {error}=await sb.from('players').insert({name,participant_id:$('reportPlayerTeam').value});if(error)return say(traduz(error),false);say('Jogador cadastrado.',true);refresh()};
  $('reportAddGoal').onclick=async()=>{const scorer=$('reportScorer').value,team=$('reportGoalTeam').value,assist=$('reportAssist').value;const p=players.find(x=>x.id===scorer);if(!p)return say('Selecione o autor.',false);if(assist===scorer)return say('Autor e assistente não podem ser iguais.',false);const goalType=$('reportGoalType').value;if(goalType==='own_goal'&&p.participant_id===team)return say('No gol contra, selecione a equipe beneficiada e o jogador adversário.',false);if(goalType!=='own_goal'&&p.participant_id!==team)return say('O autor deve pertencer à equipe do gol.',false);const minute=$('reportMinute').value;const {error}=await sb.from('match_events').insert({match_id:m.id,scorer_id:scorer,assist_id:assist||null,team_id:team,minute:minute===''?null:Number(minute),goal_type:goalType});if(error)return say(traduz(error),false);say('Gol cadastrado.',true);refresh()};
  view.querySelectorAll('[data-report-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Remover gol?'))return;const {error}=await sb.from('match_events').delete().eq('id',b.dataset.reportDelete);if(error)return say(traduz(error),false);refresh()});
  $('reportStatsImage').onchange=async e=>{
    const file=e.target.files?.[0],status=$('reportImageStatus');if(!file)return;
    status.textContent='Reconhecendo imagem…';
    try{
      if(!window.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Falha ao carregar o reconhecimento de imagens.'));document.head.appendChild(s)});
      const worker=await Tesseract.createWorker('eng');
      let result;try{result=await worker.recognize(file,{}, {text:true,blocks:true});}finally{await worker.terminate();}
      const data=result.data;
      const words=(data.words||data.blocks?.flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])))||[]).filter(w=>w.text&&w.bbox);
      const tokens=words.map(w=>({text:w.text.trim(),x:(w.bbox.x0+w.bbox.x1)/2,y:(w.bbox.y0+w.bbox.y1)/2}));
      // O idioma dos rótulos não importa: a tabela do PES 6 conserva oito linhas na mesma ordem.
      const width=Math.max(...words.map(w=>w.bbox.x1)),height=Math.max(...words.map(w=>w.bbox.y1));
      const numeric=tokens.filter(t=>/[0-9]/.test(t.text.replace(/[Oo]/g,'0'))&&(t.x<width*.37||t.x>width*.66));
      const groups=[];
      numeric.sort((a,b)=>a.y-b.y).forEach(t=>{
        let g=groups.find(g=>Math.abs(g.y-t.y)<Math.max(7,height*.012));
        if(!g){g={y:t.y,items:[]};groups.push(g);}
        g.items.push(t);
      });
      const candidates=groups.filter(g=>g.items.some(t=>t.x<width*.37)&&g.items.some(t=>t.x>width*.66)).sort((a,b)=>a.y-b.y);
      // Seleciona a sequência mais regular de oito linhas, ignorando cabeçalho, nomes e placar.
      let best=null,bestScore=Infinity;
      for(let j=0;j<=candidates.length-8;j++){
        const sample=candidates.slice(j,j+8);
        const gaps=sample.slice(1).map((g,i)=>g.y-sample[i].y);
        const avg=gaps.reduce((s,v)=>s+v,0)/gaps.length;
        if(avg<height*.009||avg>height*.11)continue;
        const variance=gaps.reduce((s,v)=>s+(v-avg)**2,0)/gaps.length;
        const score=variance/(avg*avg)+Math.abs(sample[0].y/height-.4)*.08;
        if(score<bestScore){best=sample;bestScore=score;}
      }
      if(!best)throw Error('Não identifiquei as oito linhas da tabela. Envie uma imagem mais nítida e sem cortes.');
      const values={};
      const parse=ts=>{
        const str=ts.sort((a,b)=>a.x-b.x).map(t=>t.text).join('').replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
        const match=str.match(/(\d+)\s*\(\s*(\d+)\s*\)/)||str.match(/(\d+)/);
        return match?{main:Number(match[1]),sub:match[2]==null?null:Number(match[2])}:null;
      };
      best.forEach((group,i)=>{
        const left=parse(group.items.filter(t=>t.x<width*.37));
        const right=parse(group.items.filter(t=>t.x>width*.66));
        const key=['shots','penalties',null,'corners','fouls','yellow_cards','red_cards','possession'][i];
        if(!key)return;
        if(left)values['home_'+key]=left.main;
        if(right)values['away_'+key]=right.main;
        if(i===0){if(left?.sub!=null)values.home_shots_on_target=left.sub;if(right?.sub!=null)values.away_shots_on_target=right.sub;}
        if(i===4){if(left?.sub!=null)values.home_offsides=left.sub;if(right?.sub!=null)values.away_offsides=right.sub;}
      });
      if(Object.keys(values).length<8)throw Error('Leitura incompleta. Tente outra imagem ou preencha os campos manualmente.');
      Object.entries(values).forEach(([key,val])=>{const el=view.querySelector('[data-stat="'+key+'"]');if(el)el.value=val;});
      status.textContent=Object.keys(values).length+' campos preenchidos. Confira os números e clique em SALVAR ESTATÍSTICAS.';
    }catch(err){status.textContent=err.message||'Não foi possível reconhecer a imagem.';}
  };
  $('reportSaveStats').onclick=async()=>{const row={match_id:m.id,home_goalkeeper_id:view.querySelector('[data-goalkeeper="home"]')?.value||null,away_goalkeeper_id:view.querySelector('[data-goalkeeper="away"]')?.value||null};view.querySelectorAll('[data-stat]').forEach(el=>row[el.dataset.stat]=el.value===''?null:Number(el.value));const {error}=await sb.from('match_statistics').upsert(row,{onConflict:'match_id'});if(error)return say(traduz(error),false);say('Estatísticas salvas.',true);refresh()};
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
