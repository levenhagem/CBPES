/* CBPES — simulador isolado, com classificação e chaves em memória. */
(function(){
'use strict';
let state=null,rendering=false,typingTimer=null;
const eq=(a,b)=>String(a)===String(b);
const done=m=>m.home_score!==null&&m.home_score!==undefined&&m.away_score!==null&&m.away_score!==undefined;
const valid=v=>/^(0|[1-9][0-9]{0,2})$/.test(String(v));
const root=()=>document.getElementById('fullTable');
const all=()=>D?.matches||[];
const team=id=>D.participants.find(p=>eq(p.id,id));
const phaseOf=(m,rounds,phases,weekly)=>{const r=rounds.find(r=>eq(r.id,weekly?m.weekly_round_id:m.round_id));return phases.find(p=>eq(p.id,r?.phase_id));};
function scope(){
 if(!state||typeof D==='undefined'||!D)return null;
 const weekly=state.kind==='weekly',id=state.id;
 const rounds=(weekly?D.weeklyRounds:D.rounds).filter(r=>eq(weekly?r.weekly_id:r.official_edition_id,id));
 const ids=new Set(rounds.map(r=>String(r.id)));
 const phases=(D.phases||[]).filter(p=>p.competition_type===(weekly?'weekly':'official')&&eq(weekly?p.weekly_id:p.official_edition_id,id)).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
 const games=all().filter(m=>m.category===(weekly?'weekly':'official')&&(weekly?eq(m.weekly_id,id):eq(m.official_edition_id,id)||ids.has(String(m.round_id))));
 return {weekly,rounds,phases,games};
}
function winner(games){
 if(!games.length||games.some(m=>!done(m)))return null;
 const first=games[0],a=first.home_id,b=first.away_id;
 if(!a||!b)return null;
 let ga=0,gb=0;
 for(const m of games){if(eq(m.home_id,a)){ga+=Number(m.home_score);gb+=Number(m.away_score);}else if(eq(m.away_id,a)){ga+=Number(m.away_score);gb+=Number(m.home_score);}else return null;}
 if(ga===gb){const last=games[games.length-1],pa=eq(last.home_id,a)?last.home_pen:last.away_pen,pb=eq(last.home_id,a)?last.away_pen:last.home_pen;if(pa!=null&&pb!=null&&pa!==pb)return Number(pa)>Number(pb)?a:b;return null;}
 return ga>gb?a:b;
}
function projected(){
 const sc=scope();if(!sc)return [];
 const {games,rounds,phases,weekly}=sc;
 const projected=games.map(m=>({...m}));
 const getRound=m=>rounds.find(r=>eq(r.id,weekly?m.weekly_round_id:m.round_id));
 const getPhase=m=>phases.find(p=>eq(p.id,getRound(m)?.phase_id));
 for(const m of projected){
  const scores=state.scores[String(m.id)];
  if(!done(m)&&scores&&scores.some(x=>x!=='')){m.home_score=Number(scores[0]||0);m.away_score=Number(scores[1]||0);m.played=true;}
 }
 const groupPhase=phases.find(p=>p.counts_in_standings);
 const groupGames=projected.filter(m=>eq(getPhase(m)?.id,groupPhase?.id));
 const groupNames=[...new Set(groupGames.map(m=>m.group_name).filter(Boolean))].sort();
 let qualifiers=[];
 if(groupGames.length){
  if(groupNames.length){const ranked=groupNames.map(g=>{const ms=groupGames.filter(m=>m.group_name===g),ids=new Set(ms.flatMap(m=>[String(m.home_id),String(m.away_id)]));return standings(D.participants.filter(p=>ids.has(String(p.id))),ms,{ptsW:3,ptsD:1});});const depth=Math.max(...ranked.map(r=>r.length));for(let place=0;place<depth;place++)for(const group of ranked)if(group[place])qualifiers.push(group[place].p.id);}
  else {const ids=new Set(groupGames.flatMap(m=>[String(m.home_id),String(m.away_id)]));qualifiers=standings(D.participants.filter(p=>ids.has(String(p.id))),groupGames,{ptsW:3,ptsD:1}).map(x=>x.p.id);}
 }
 const ko=phases.filter(p=>!p.counts_in_standings&&p.phase_type!=='third_place');
 let previous=qualifiers;
 for(const ph of ko){
  const ms=projected.filter(m=>eq(getPhase(m)?.id,ph.id)).sort((a,b)=>(Number(getRound(a)?.number)||0)-(Number(getRound(b)?.number)||0)||(Number(a.seq)||0)-(Number(b.seq)||0));
  const ties=new Map();
  for(const m of ms){const k=m.tie_id||m.bracket_slot||m.matchup_id||[m.home_id,m.away_id].map(String).sort().join('|');if(!ties.has(k))ties.set(k,[]);ties.get(k).push(m);}
  const entries=[...ties.values()];
  const need=entries.length*2;
  // Projeta apenas confrontos ainda não realizados, nunca altera partidas oficiais.
  // A classificação da fase de grupos precisa estar completa para alimentar a chave.
  const groupReady=groupGames.every(done);
  const canProject=previous.length>=need&&(ph===ko[0]?groupReady:true);
  if(canProject)entries.forEach((legs,index)=>{
    const h=previous[index],a=previous[need-1-index];
    for(const m of legs){if(done(games.find(g=>eq(g.id,m.id))))continue;
      if(!team(m.home_id)||!team(m.away_id)){const home=team(h),away=team(a);if(home&&away){m.home_id=home.id;m.away_id=away.id;m.home=home;m.away=away;}}
    }
  });
  previous=entries.map(winner).filter(Boolean);
 }
 return projected;
}

// A Copa Master calcula diretamente os resultados em memória, sem depender da
// substituição temporária de D.matches (usada pela Liga PRO).
function masterProjectedMatches(edition,matches){
 if(!state||state.kind!=='official'||!eq(state.id,edition.id))return matches;
 return matches.map(m=>{
  if(done(m))return m;
  const scores=state.scores[String(m.id)];
  if(!scores||!scores.some(x=>x!==''))return m;
  return {...m,home_score:Number(scores[0]||0),away_score:Number(scores[1]||0),played:true,_simulated:true};
 });
}
function virtualMasterGames(edition,assignments,calendar,rounds,groupNames,real){
 if(!state||state.kind!=='official'||!eq(state.id,edition.id))return [];
 const virtual=[];
 for(let ri=0;ri<calendar.length;ri++)for(const group of groupNames){
  const slots=assignments.filter(a=>String(a.group_name||'').trim().toUpperCase().replace(/^GRUPO\s+/,'')===group).sort((a,b)=>Number(a.slot)-Number(b.slot));
  for(const [left,right] of calendar[ri]){
   const home=team(slots[left-1]?.participant_id),away=team(slots[right-1]?.participant_id);
   if(!home||!away)continue;
   const round=rounds[ri];
   const exists=real.some(m=>eq(m.round_id,round?.id)&&[String(m.home_id),String(m.away_id)].sort().join('|')===[String(home.id),String(away.id)].sort().join('|'));
   if(exists)continue;
   const id='master-virtual-'+edition.id+'-'+ri+'-'+group+'-'+left+'-'+right;
   const values=state.scores[id]||['',''],completed=values.some(x=>x!=='');
   virtual.push({id,home_id:home.id,away_id:away.id,home,away,home_coach_name:home.coach_name,away_coach_name:away.coach_name,home_score:completed?Number(values[0]||0):null,away_score:completed?Number(values[1]||0):null,played:completed,category:'official',group_name:group,round_id:round?.id||null,virtualRoundIndex:ri,official_edition_id:edition.id,seq:ri*100+group.charCodeAt(0),date:round?.date||null});
  }
 }
 return virtual;
}
// Atualização incremental da Copa Master: mantém os inputs montados e o teclado
// aberto, recalculando a tabela em cada evento input, sem esperar outra partida.

// Chave da Copa Master: quartas (A1-B2, C1-D2, B1-A2, D1-C2),
// semifinais (Q1-Q2, Q3-Q4) e final (S1-S2).
function masterKnockout(edition,phase){
 if(!state||state.kind!=='official'||!eq(state.id,edition.id))return null;
 const assignments=(D.officialGroupTeams||[]).filter(a=>eq(a.official_edition_id,edition.id));
 const groupPhase=(D.phases||[]).find(p=>eq(p.official_edition_id,edition.id)&&p.counts_in_standings);
 const rounds=(D.rounds||[]).filter(r=>eq(r.phase_id,groupPhase?.id));
 const roundIds=new Set(rounds.map(r=>String(r.id)));
 const groupGames=masterProjectedMatches(edition,all().filter(m=>(m.category||'official')==='official'&&(roundIds.has(String(m.round_id))||eq(m.official_edition_id,edition.id)&&eq(m.round?.phase_id,groupPhase?.id))));
 // A chave acompanha a classificação projetada desde que o simulador é ligado.
 // Não exigir partidas completas nem depender de IDs do calendário para ativá-la.
 // Classificação única considera TODOS os confrontos cruzados A×D e B×C.
 // Só depois dividimos o ranking por grupo para obter o 1º e o 2º.
 const participants=D.participants.filter(p=>assignments.some(a=>eq(a.participant_id,p.id)));
 const ranking=standings(participants,groupGames.map(m=>({...m,played:done(m)})),{ptsW:3,ptsD:1});
 const normalizeGroup=value=>String(value||'').trim().toUpperCase().replace(/^GRUPO\s+/,'');
 const groupTeams={};
 for(const letter of ['A','B','C','D']){
  const ids=new Set(assignments.filter(a=>normalizeGroup(a.group_name)===letter).map(a=>String(a.participant_id)));
  groupTeams[letter]=ranking.filter(x=>ids.has(String(x.p.id))).map(x=>x.p);
 }
 const groups=groupTeams;
 const match=(stage,index,home,away)=>{
  const id='master-ko-'+edition.id+'-'+stage+'-'+index;
  const scores=state.scores[id]||['',''];
  const played=!!home&&!!away&&scores.some(v=>v!=='');
  const hs=played?Number(scores[0]||0):null,as=played?Number(scores[1]||0):null;
  const winner=played&&hs!==as?(hs>as?home:away):null;
  return {id,home,away,home_id:home?.id,away_id:away?.id,home_score:hs,away_score:as,played,winner,category:'official',official_edition_id:edition.id,home_coach_name:home?.coach_name,away_coach_name:away?.coach_name,virtualKnockout:true};
 };
 // Posições de classificação vinculadas diretamente às quatro tabelas.
 const quarterSlots=[['A',0,'B',1],['C',0,'D',1],['B',0,'A',1],['D',0,'C',1]];
 const q=quarterSlots.map(([hg,hi,ag,ai],index)=>match('q',index,groups[hg]?.[hi],groups[ag]?.[ai]));
 /*const q=[
  match('q',0,groups.A[0],groups.B[1]),
  match('q',1,groups.C[0],groups.D[1]),
  match('q',2,groups.B[0],groups.A[1]),
  match('q',3,groups.D[0],groups.C[1])
 ];*/
 const semi=[match('s',0,q[0].winner,q[1].winner),match('s',1,q[2].winner,q[3].winner)];
 const final=[match('f',0,semi[0].winner,semi[1].winner)];
 const stage=phase.phase_type==='final'?'f':/semi/i.test(phase.name||'')?'s':'q';
 const fixtures=stage==='f'?final:stage==='s'?semi:q;
 return '<div class="cbpes-playoff-template">'+fixtures.map((m,index)=>{
  const label=esc(String(phase.name||'').toUpperCase());
  const team=(p,side)=>'<div class="cbpes-master-ko-row '+side+'"><div class="cbpes-master-ko-identity">'+(p?crestImg(p):'')+'<span class="cbpes-master-ko-team-info"><span class="cbpes-master-ko-name">'+(p?'<a href="#team/'+encodeURIComponent(p.id)+'">'+esc(p.name)+'</a>':'A definir')+'</span>'+(p?.coach_name?'<small class="cbpes-master-ko-coach">'+esc(p.coach_name)+'</small>':'')+'</span></div><div class="cbpes-master-ko-goals">'+(p?'<input type="number" min="0" max="999" inputmode="numeric" data-sim-id="'+m.id+'" data-sim-side="'+(side==='home'?0:1)+'" aria-label="Gols '+(side==='home'?'mandante':'visitante')+'" value="'+esc((state.scores[m.id]||['',''])[side==='home'?0:1])+'">':'<span>–</span>')+'</div></div>';
  return '<div class="cbpes-match cbpes-match-copa-master cbpes-master-ko-simulator-card cbpes-master-ko-stacked" style="--match-color:#bfcbd3" data-cbpes-match-id="'+m.id+'">'+(stage==='f'?'':'<div class="cbpes-match-top"><span class="cbpes-match-category">'+label+' • CHAVE '+(index+1)+'</span></div>')+'<div class="cbpes-master-ko-rows">'+team(m.home,'home')+team(m.away,'away')+'</div>'+(m.played&&m.home_score===m.away_score?'<div class="cbpes-master-ko-note">Empate: altere o placar para definir o classificado</div>':'')+'</div>';
 }).join('')+'</div>';
}

function updateMasterStandings(){
 if(!state||state.kind!=='official')return false;
 const groups=[...root()?.querySelectorAll('.cbpes-master-group')||[]];
 if(!groups.length)return false;
 const edition=D.officialEditions.find(e=>eq(e.id,state.id));
 if(!edition)return false;
 const assignments=(D.officialGroupTeams||[]).filter(a=>eq(a.official_edition_id,edition.id));
 const phase=(D.phases||[]).find(p=>eq(p.official_edition_id,edition.id)&&p.counts_in_standings);
 const roundIds=new Set((D.rounds||[]).filter(r=>eq(r.phase_id,phase?.id)).map(r=>String(r.id)));
 const actual=all().filter(m=>m.category==='official'&&roundIds.has(String(m.round_id)));
 const projectedMatches=masterProjectedMatches(edition,actual).map(m=>({
  ...m,played:done(m),home_score:done(m)?Number(m.home_score):null,away_score:done(m)?Number(m.away_score):null
 }));
 const ids=new Set(assignments.map(a=>String(a.participant_id)));
 const ranking=standings(D.participants.filter(p=>ids.has(String(p.id))),projectedMatches);
 const byTeam=new Map(ranking.map(x=>[String(x.p.id),x]));
 const cells=x=>[x.pts,x.j,x.v,x.e,x.d,x.gp,x.gc,typeof sgf==='function'?sgf(x.sg):x.sg,x.ap];
 for(const group of groups){
  const name=group.querySelector('.cbpes-master-group-label b')?.textContent?.trim().toUpperCase();
  if(!name)continue;
  const members=new Set(assignments.filter(a=>String(a.group_name||'').trim().toUpperCase().replace(/^GRUPO\s+/,'')===name).map(a=>String(a.participant_id)));
  const ranked=ranking.filter(x=>members.has(String(x.p.id)));
  const tbody=group.querySelector('tbody');
  if(!tbody)continue;
  const rows=new Map([...tbody.querySelectorAll('tr[data-master-team-id]')].map(tr=>[tr.dataset.masterTeamId,tr]));
  ranked.forEach((x,index)=>{
   const tr=rows.get(String(x.p.id));if(!tr)return;
   const tds=[...tr.children];
   const values=cells(x);
   values.forEach((value,j)=>{if(tds[j+2]&&tds[j+2].textContent!==String(value))tds[j+2].textContent=String(value);});
   const rank=tr.querySelector('.cbpes-master-group-rank');if(rank)rank.textContent=String(index+1);
   const form=tr.querySelector('.cbpes-master-form');
   if(form&&typeof formDots==='function')form.innerHTML=formDots(x.p.id,projectedMatches.filter(m=>members.has(String(m.home_id))||members.has(String(m.away_id))));
   tbody.appendChild(tr);
  });
 }
 return true;
}
function render(){
 if(!state||!root()||rendering)return;
 const old=D.matches,proj=projected(),byId=new Map(proj.map(m=>[String(m.id),m]));
 const positions=new Map([...root().querySelectorAll('table tbody tr')].map(tr=>[tr.querySelector('a[href^="#team/"]')?.getAttribute('href'),tr.getBoundingClientRect().top]).filter(([key])=>key));
 rendering=true;
 try{
  D.matches=old.map(m=>byId.get(String(m.id))||m);
  renderTable();
 }catch(err){console.error('Erro ao recalcular simulador:',err);}
 finally{D.matches=old;rendering=false;}
 const btn=root()?.querySelector('[data-simulator-kind]');
 if(btn){btn.innerHTML='<span>SAIR DO SIMULADOR</span>';btn.classList.add('cbpes-sim-active');}
 // Simulação não oferece súmulas/detalhes: o placar é hipotético.
 root().querySelectorAll('.cbpes-match-report-link').forEach(link=>link.remove());
 const cards=[...root().querySelectorAll('[data-cbpes-match-id]')];
 for(const card of cards){
  const id=card.dataset.cbpesMatchId,official=old.find(m=>eq(m.id,id));
  if(official&&done(official))continue;
  if(!official&&!id.startsWith('master-virtual-'))continue;
  const score=card.querySelector('.cbpes-match-score');if(!score)continue;
  const values=state.scores[id]||['',''];
  const field=(side,label)=>'<input type="number" inputmode="numeric" min="0" max="999" aria-label="'+label+'" data-sim-id="'+id+'" data-sim-side="'+side+'" value="'+values[side]+'">';
  score.innerHTML='<div class="cbpes-sim-inline">'+field(0,'Gols mandante')+'<span class="cbpes-sim-colon">:</span>'+field(1,'Gols visitante')+'</div>';
 }
 let bar=root().querySelector('#cbpes-sim-controls');
 if(!bar){bar=document.createElement('div');bar.id='cbpes-sim-controls';root().prepend(bar);}
 bar.innerHTML='<button type="button" data-sim-clear>REINICIAR PLACARES</button><span>Simulação temporária — nenhum resultado oficial será alterado.</span>';
 root().querySelectorAll('table tbody tr').forEach(tr=>{const key=tr.querySelector('a[href^="#team/"]')?.getAttribute('href');const from=positions.get(key);if(from===undefined)return;const delta=from-tr.getBoundingClientRect().top;if(Math.abs(delta)>2&&Math.abs(delta)<650)tr.animate([{transform:'translateY('+delta+'px)',backgroundColor:'rgba(40,153,104,.19)'},{transform:'translateY(0)',backgroundColor:'transparent'}],{duration:340,easing:'ease-out'});});
}
function exit(){if(typingTimer)clearTimeout(typingTimer);typingTimer=null;state=null;renderTable();}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-simulator-kind]');
 if(btn){e.preventDefault();e.stopPropagation();if(state&&state.kind===btn.dataset.simulatorKind&&eq(state.id,btn.dataset.simulatorId))exit();else{state={kind:btn.dataset.simulatorKind,id:btn.dataset.simulatorId,scores:{}};render();}return;}
 if(state&&e.target.closest('[data-sim-clear]')){state.scores={};render();}
},true);
function updateScore(el,immediate=false){
 if(!state||!el.matches('[data-sim-id]'))return;
 const key=String(el.dataset.simId),original=all().find(m=>eq(m.id,key));
 if(original&&done(original))return;
 if(!original&&!key.startsWith('master-virtual-')&&!key.startsWith('master-ko-'))return;
 const v=el.value.trim(),side=Number(el.dataset.simSide);
 if(v!==''&&!valid(v)){el.value=state.scores[key]?.[side]||'';return;}
 const scores=state.scores[key]||['',''];scores[side]=v;state.scores[key]=scores;
 if(typingTimer)clearTimeout(typingTimer);
 // A classificação é recalculada enquanto o usuário digita, não apenas ao sair do campo.
 // Mantém o foco no mesmo quadradinho após reconstruir a tabela.
 const refresh=()=>{
  const active=document.activeElement,focusKey=active?.dataset?.simId,focusSide=active?.dataset?.simSide;
  render();
  if(focusKey!==undefined&&focusSide!==undefined){
   const next=[...root()?.querySelectorAll('[data-sim-id]')||[]].find(x=>x.dataset.simId===focusKey&&x.dataset.simSide===focusSide);
   if(next){next.focus({preventScroll:true});try{next.setSelectionRange?.(next.value.length,next.value.length);}catch(_){}}
  }
 };
 // A Copa Master atualiza apenas as linhas da classificação, preservando
 // os quadradinhos e o foco do teclado. Demais competições usam renderização normal.
 if(key.startsWith('master-ko-')||!updateMasterStandings())refresh();
}
document.addEventListener('input',e=>updateScore(e.target));
// O evento input já atualiza a tabela; change não deve reconstruí-la novamente.
document.addEventListener('click',e=>{
 if(!state)return;
 const nav=e.target.closest('#phasePrev,#phaseNext,[data-official-round-prev],[data-official-round-next],[data-master-round-prev],[data-master-round-next]');
 if(nav)requestAnimationFrame(()=>{if(state){const btn=root()?.querySelector('[data-simulator-kind]');if(btn){btn.classList.add('cbpes-sim-active');btn.innerHTML='<span>SAIR DO SIMULADOR</span>';}render();}});
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state)exit();});
const css=document.createElement('style');css.textContent='.cbpes-sim-launch{margin:10px 0;padding:7px 12px;border:1px solid var(--line,#ccc);border-radius:5px;background:transparent;color:inherit;font-size:12px;font-weight:700;cursor:pointer}.cbpes-sim-launch.cbpes-sim-active{background:#14784b;color:#fff}.cbpes-sim-inline{display:flex;align-items:center;justify-content:center;gap:4px}.cbpes-sim-inline input{box-sizing:border-box;width:36px;height:32px;border:1px solid #b9c6ca;border-radius:4px;background:#fff;color:#15232b;text-align:center;font-weight:800;font-size:15px;padding:2px;appearance:textfield;-moz-appearance:textfield}.cbpes-sim-inline input::-webkit-inner-spin-button,.cbpes-sim-inline input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}#table[data-liga-pro="true"] .cbpes-sim-inline,#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-sim-inline{flex-direction:column;gap:4px}#table[data-liga-pro="true"] .cbpes-sim-colon,#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-sim-colon{display:none}#table[data-liga-pro="true"] .cbpes-sim-inline input{height:28px;width:36px}#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-sim-inline input{width:39px;height:31px;background:linear-gradient(135deg,#352c1a,#151616);border:1px solid #c6a45a;color:#fff4d0;box-shadow:inset 0 0 0 1px #655027;border-radius:4px;font-family:inherit;font-size:17px;font-weight:850}#table[data-liga-pro="true"] .cbpes-sim-inline input{background:linear-gradient(135deg,#17478c,#08275b);border:1px solid #6fa5ff;color:#fff;border-radius:4px}#table[data-winning-eleven="true"] .cbpes-sim-inline input{background:#8b1230;border:1px solid #ff6685;color:#fff}.cbpes-match-semanal .cbpes-sim-inline input{background:#0d5638;border:1px solid #6ee1aa;color:#fff}.cbpes-match:not(.cbpes-match-copa-master):not(.cbpes-match-liga-pro):not(.cbpes-match-semanal) .cbpes-sim-inline input{border-color:var(--match-color,#7c9ab1);box-shadow:inset 0 0 0 1px #ffffff45}#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-match-score{z-index:4!important;position:relative!important}#cbpes-sim-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px;font-size:11px;color:var(--muted,#777)}#cbpes-sim-controls button{border:1px solid var(--line,#ccc);border-radius:5px;padding:7px 10px;background:transparent;color:inherit;cursor:pointer;font-weight:700}#table .cbpes-sim-active~* table tbody tr{transition:transform .28s ease,background-color .28s ease}@media(max-width:520px){.cbpes-sim-inline input{width:31px;height:30px;font-size:14px}}';document.head.appendChild(css);
const masterCss=document.createElement('style');masterCss.textContent=`
#fullTable .cbpes-sim-launch{display:flex;align-items:center;justify-content:center;gap:9px;margin:14px auto 18px;padding:11px 21px;border-radius:999px;border:1px solid #328969;background:linear-gradient(125deg,#126b4b,#16825a);color:white;font-size:12px;font-weight:800;letter-spacing:.055em;box-shadow:0 5px 16px rgba(13,92,62,.16);transition:transform .18s ease,box-shadow .18s ease;cursor:pointer}
#fullTable .cbpes-sim-launch:hover{transform:translateY(-1px);box-shadow:0 7px 20px rgba(13,92,62,.24)}
#fullTable .cbpes-sim-launch.cbpes-sim-active{background:transparent;color:#14784b;box-shadow:none;border-color:#14784b}
.cbpes-sim-launch svg{width:17px;height:17px;flex:none}
.cbpes-master-sim-knockout{display:grid;gap:12px;width:100%;max-width:900px;margin:12px auto}
.cbpes-master-ko-match{border:1px solid var(--line,#d6dce0);border-radius:10px;background:var(--card,#fff);padding:12px 15px}
.cbpes-master-ko-label{font-size:10px;letter-spacing:.07em;font-weight:800;color:var(--muted,#8b929b);margin-bottom:12px}
.cbpes-master-ko-body{display:grid;grid-template-columns:minmax(0,1fr) 86px minmax(0,1fr);align-items:center;gap:8px}
.cbpes-master-ko-team{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px;font-weight:700}
.cbpes-master-ko-team:last-child{justify-content:flex-end;text-align:right;flex-direction:row-reverse}
.cbpes-master-ko-team img{width:29px;height:29px;object-fit:contain;flex:none}
.cbpes-master-ko-team span{min-width:0;overflow-wrap:anywhere}
.cbpes-master-ko-pending{color:var(--muted,#929aa2);font-weight:500}
.cbpes-master-ko-score{display:flex;justify-content:center}
.cbpes-master-ko-score .cbpes-sim-inline{flex-direction:row!important;gap:5px!important}
.cbpes-master-ko-score .cbpes-sim-colon{display:inline!important}
.cbpes-master-ko-score input{width:34px!important;height:33px!important}
.cbpes-master-ko-note{font-size:11px;color:var(--muted,#8a9096);text-align:center;margin-top:8px}
@media(max-width:480px){.cbpes-master-ko-body{grid-template-columns:minmax(0,1fr) 75px minmax(0,1fr);gap:5px}.cbpes-master-ko-team{font-size:11px;gap:4px}.cbpes-master-ko-team img{width:23px;height:23px}.cbpes-master-ko-match{padding:11px 9px}}
`;document.head.appendChild(masterCss);
window.CBPESSimulator={exit,isActive:()=>!!state,virtualMasterGames,masterProjectedMatches,masterKnockout,refresh:()=>{if(state&&!rendering)render();}};
})();