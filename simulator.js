/* Simulador CBPES: placares editáveis na própria tabela, sem gravar no Supabase. */
(function(){
let state=null,refreshing=false;
const same=(a,b)=>String(a)===String(b);
const played=m=>m.home_score!=null&&m.away_score!=null;
const valid=v=>/^(0|[1-9][0-9]{0,2})$/.test(v);
const root=()=>document.getElementById('fullTable');
const current=()=>state&&D&&D.matches.filter(m=>m.category===(state.kind==='weekly'?'weekly':'official')&&(state.kind==='weekly'?same(m.weekly_id,state.id):same(m.official_edition_id,state.id)||D.rounds.some(r=>same(r.id,m.round_id)&&same(r.official_edition_id,state.id))));
function simulated(m){const s=state?.scores[m.id];return !state||played(m)||!s||s[0]===''||s[1]===''?m:{...m,home_score:Number(s[0]),away_score:Number(s[1]),played:true};}
function update(){
 if(!state||!root()||typeof renderTable!=='function')return;
 const original=D.matches;refreshing=true;
 try{D.matches=original.map(simulated);renderTable();}
 finally{D.matches=original;refreshing=false;}
 const button=root().querySelector('[data-simulator-kind]');if(button){button.textContent='SAIR DO SIMULADOR';button.classList.add('cbpes-sim-active');}
 const list=current()||[];
 for(const m of list){
  if(played(m))continue;
  const card=Array.from(root().querySelectorAll('[data-cbpes-match-id]')).find(x=>same(x.dataset.cbpesMatchId,m.id));
  if(!card)continue;
  const score=card.querySelector('.cbpes-match-score');if(!score)continue;
  const values=state.scores[m.id]||['',''];
  score.innerHTML='<span class="cbpes-sim-inline"><input type="number" inputmode="numeric" min="0" max="999" data-sim-id="'+m.id+'" data-sim-side="0" aria-label="Gols mandante" value="'+values[0]+'"><span>:</span><input type="number" inputmode="numeric" min="0" max="999" data-sim-id="'+m.id+'" data-sim-side="1" aria-label="Gols visitante" value="'+values[1]+'"></span>';
  card.querySelector('.cbpes-match-report-link')?.remove();
 }
 let controls=document.getElementById('cbpes-sim-controls');if(!controls){controls=document.createElement('div');controls.id='cbpes-sim-controls';root().insertBefore(controls,root().firstChild);}
 controls.innerHTML='<button type="button" data-sim-clear>REINICIAR PLACARES</button><span>Simulação local • não altera resultados oficiais</span>';
}
function exit(){state=null;refreshing=false;document.getElementById('cbpes-sim-controls')?.remove();if(typeof renderTable==='function')renderTable();}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-simulator-kind]');
 if(button){e.preventDefault();e.stopPropagation();if(state&&same(state.id,button.dataset.simulatorId)&&state.kind===button.dataset.simulatorKind){exit();return;}state={kind:button.dataset.simulatorKind,id:button.dataset.simulatorId,scores:{}};try{update();}catch(err){console.error('Simulador:',err);exit();}return;}
 if(state&&e.target.closest('[data-sim-clear]')){state.scores={};update();}
},true);
document.addEventListener('change',e=>{
 if(!state||!e.target.matches('[data-sim-id]'))return;
 const input=e.target,m=current()?.find(m=>same(m.id,input.dataset.simId));if(!m||played(m))return;
 const value=input.value.trim();if(value!==''&&!valid(value)){input.value=state.scores[m.id]?.[Number(input.dataset.simSide)]||'';return;}
 const scores=state.scores[m.id]||['',''];scores[Number(input.dataset.simSide)]=value;state.scores[m.id]=scores;update();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state)exit();});
const css=document.createElement('style');css.textContent='.cbpes-sim-launch{margin:10px 0;padding:7px 12px;border:1px solid var(--line,#ccc);border-radius:5px;background:transparent;color:inherit;font-size:12px;font-weight:700;cursor:pointer}.cbpes-sim-launch.cbpes-sim-active{background:#14784b;color:white}.cbpes-sim-inline{display:flex;align-items:center;justify-content:center;gap:4px}.cbpes-sim-inline input{box-sizing:border-box;width:38px;height:36px;border:1px solid #b9c6ca;border-radius:4px;background:#fff;color:#15232b;text-align:center;font-weight:800;font-size:16px;padding:2px}.cbpes-sim-inline input::-webkit-inner-spin-button,.cbpes-sim-inline input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.cbpes-sim-inline input{appearance:textfield;-moz-appearance:textfield}#cbpes-sim-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px;font-size:11px;color:var(--muted,#777)}#cbpes-sim-controls button{border:1px solid var(--line,#ccc);border-radius:5px;padding:7px 10px;background:transparent;color:inherit;cursor:pointer;font-weight:700}@media(max-width:520px){.cbpes-sim-inline input{width:31px;height:33px;font-size:14px}}';document.head.appendChild(css);
window.CBPESSimulator={exit};
})();