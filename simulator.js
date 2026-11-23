/* CBPES — simulador isolado, com classificação e chaves em memória. */
(function(){
'use strict';
let state=null,rendering=false;
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
  if(!done(m)&&scores&&scores.every(x=>x!=='')){m.home_score=Number(scores[0]);m.away_score=Number(scores[1]);m.played=true;}
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

function virtualMasterGames(edition,assignments,calendar,rounds,groupNames,real){
 if(!state||state.kind!=='official'||!eq(state.id,edition.id))return [];
 const virtual=[];
 for(let ri=0;ri<calendar.length;ri++)for(const group of groupNames){
  const slots=assignments.filter(a=>String(a.group_name||'').trim().toUpperCase().replace(/^GRUPO\\s+/,'')===group).sort((a,b)=>Number(a.slot)-Number(b.slot));
  for(const [left,right] of calendar[ri]){
   const home=team(slots[left-1]?.participant_id),away=team(slots[right-1]?.participant_id);
   if(!home||!away)continue;
   const round=rounds[ri];
   const exists=real.some(m=>eq(m.round_id,round?.id)&&[String(m.home_id),String(m.away_id)].sort().join('|')===[String(home.id),String(away.id)].sort().join('|'));
   if(exists)continue;
   const id='master-virtual-'+edition.id+'-'+ri+'-'+group+'-'+left+'-'+right;
   const values=state.scores[id]||['',''],completed=values.every(x=>x!=='');
   virtual.push({id,home_id:home.id,away_id:away.id,home,away,home_coach_name:home.coach_name,away_coach_name:away.coach_name,home_score:completed?Number(values[0]):null,away_score:completed?Number(values[1]):null,played:completed,category:'official',group_name:group,round_id:round?.id||null,virtualRoundIndex:ri,official_edition_id:edition.id,seq:ri*100+group.charCodeAt(0),date:round?.date||null});
  }
 }
 return virtual;
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
 if(btn){btn.textContent='SAIR DO SIMULADOR';btn.classList.add('cbpes-sim-active');}
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
function exit(){state=null;renderTable();}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-simulator-kind]');
 if(btn){e.preventDefault();e.stopPropagation();if(state&&state.kind===btn.dataset.simulatorKind&&eq(state.id,btn.dataset.simulatorId))exit();else{state={kind:btn.dataset.simulatorKind,id:btn.dataset.simulatorId,scores:{}};render();}return;}
 if(state&&e.target.closest('[data-sim-clear]')){state.scores={};render();}
},true);
document.addEventListener('change',e=>{
 const el=e.target;if(!state||!el.matches('[data-sim-id]'))return;
 const original=all().find(m=>eq(m.id,el.dataset.simId));if(original&&done(original))return;
 if(!original&&!String(el.dataset.simId).startsWith('master-virtual-'))return;
 const key=String(el.dataset.simId);
 const v=el.value.trim(),side=Number(el.dataset.simSide);
 if(v!==''&&!valid(v)){el.value=state.scores[key]?.[side]||'';return;}
 const scores=state.scores[key]||['',''];scores[side]=v;state.scores[key]=scores;
 render();
});
document.addEventListener('click',e=>{
 if(!state)return;
 const nav=e.target.closest('#phasePrev,#phaseNext,[data-official-round-prev],[data-official-round-next],[data-master-round-prev],[data-master-round-next]');
 if(nav)requestAnimationFrame(()=>{if(state)render();});
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state)exit();});
const css=document.createElement('style');css.textContent='.cbpes-sim-launch{margin:10px 0;padding:7px 12px;border:1px solid var(--line,#ccc);border-radius:5px;background:transparent;color:inherit;font-size:12px;font-weight:700;cursor:pointer}.cbpes-sim-launch.cbpes-sim-active{background:#14784b;color:#fff}.cbpes-sim-inline{display:flex;align-items:center;justify-content:center;gap:4px}.cbpes-sim-inline input{box-sizing:border-box;width:36px;height:32px;border:1px solid #b9c6ca;border-radius:4px;background:#fff;color:#15232b;text-align:center;font-weight:800;font-size:15px;padding:2px;appearance:textfield;-moz-appearance:textfield}.cbpes-sim-inline input::-webkit-inner-spin-button,.cbpes-sim-inline input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}#table[data-liga-pro="true"] .cbpes-sim-inline,#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-sim-inline{flex-direction:column;gap:4px}#table[data-liga-pro="true"] .cbpes-sim-colon,#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-sim-colon{display:none}#table[data-liga-pro="true"] .cbpes-sim-inline input{height:28px;width:36px}#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-sim-inline input{width:39px;height:31px;background:linear-gradient(135deg,#352c1a,#151616);border:1px solid #c6a45a;color:#fff4d0;box-shadow:inset 0 0 0 1px #655027;border-radius:4px;font-family:inherit;font-size:17px;font-weight:850}#table[data-liga-pro="true"] .cbpes-sim-inline input{background:linear-gradient(135deg,#17478c,#08275b);border:1px solid #6fa5ff;color:#fff;border-radius:4px}#table[data-winning-eleven="true"] .cbpes-sim-inline input{background:#8b1230;border:1px solid #ff6685;color:#fff}#table[data-copa-master="true"] .cbpes-match-copa-master .cbpes-match-score{z-index:4!important;position:relative!important}#cbpes-sim-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px;font-size:11px;color:var(--muted,#777)}#cbpes-sim-controls button{border:1px solid var(--line,#ccc);border-radius:5px;padding:7px 10px;background:transparent;color:inherit;cursor:pointer;font-weight:700}#table .cbpes-sim-active~* table tbody tr{transition:transform .28s ease,background-color .28s ease}@media(max-width:520px){.cbpes-sim-inline input{width:31px;height:30px;font-size:14px}}';document.head.appendChild(css);
window.CBPESSimulator={exit,isActive:()=>!!state,virtualMasterGames,refresh:()=>{if(state&&!rendering)render();}};
})();