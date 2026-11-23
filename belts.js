/* CBPES — cinturões itinerantes. Cálculo local; configurações protegidas por RLS. */
(function(){
'use strict';
const types={official:'CINTURÃO OFICIAL',weekly:'CINTURÃO SEMANAL',general:'CINTURÃO GERAL'};
const norm=v=>String(v||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
function matches(data,career){
 const results=[];
 for(const m of data.matches||[]){
  if(m.home_score==null||m.away_score==null)continue;
  const date=m.date||m.played_on||(m.result_registered_at||m.created_at||'').slice(0,10);
  if(!validDate(date))continue;
  const home=m.home_coach_name||m.home?.coach_name,away=m.away_coach_name||m.away?.coach_name;
  if(!norm(home)||!norm(away)||norm(home)===norm(away))continue;
  results.push({id:'m:'+m.id,category:m.category||'official',date,sortTime:m.result_registered_at||m.created_at||date,order:Number(m.seq||m.display_order||0),home,away,hs:Number(m.home_score),as:Number(m.away_score),source:'CBPES'});
 }
 for(const m of career||[]){
  if(m.home_score==null||m.away_score==null||!validDate(m.played_on)||!norm(m.home_coach)||!norm(m.away_coach)||norm(m.home_coach)===norm(m.away_coach))continue;
  results.push({id:'c:'+m.id,category:m.official_competition_id?'official':'friendly',date:m.played_on,sortTime:m.played_on,order:0,home:m.home_coach,away:m.away_coach,hs:Number(m.home_score),as:Number(m.away_score),source:'Histórico'});
 }
 return results.sort((a,b)=>a.date.localeCompare(b.date)||a.sortTime.localeCompare(b.sortTime)||a.order-b.order||a.id.localeCompare(b.id));
}
function calculate(config,all){
 const type=config.belt_type,holder=String(config.initial_coach||'').trim();
 if(!holder||!validDate(config.starts_on))return null;
 const allowed=type==='general'?['official','weekly','friendly']:type==='official'?['official']:['weekly'];
 const events=[],start=norm(holder);let current=holder,streak=0,defenses=0,transfers=0;
 for(const m of all){
  if(m.date<config.starts_on||!allowed.includes(m.category))continue;
  const home=norm(m.home)===norm(current),away=norm(m.away)===norm(current);
  if(!home&&!away)continue;
  const conceded=home?m.as:m.hs,scored=home?m.hs:m.as,previous=current;
  if(scored<conceded){current=home?m.away:m.home;streak=0;transfers++;events.push({...m,kind:'transfer',previous,current});}
  else {streak++;defenses++;events.push({...m,kind:scored===conceded?'draw':'defense',previous,current});}
 }
 return {type,holder:current,streak,defenses,transfers,events,start:config.starts_on,initial:holder};
}
async function loadConfig(){const {data,error}=await sb.from('cbpes_belts').select('*');if(error)throw error;return data||[];}
async function loadHistory(){const {data,error}=await sb.from('career_matches').select('id,home_coach,away_coach,home_score,away_score,played_on,category,official_competition_id').order('played_on',{ascending:true}).limit(10000);if(error)throw error;return data||[];}
function view(belts){
 const boxes=['official','weekly','general'].map(t=>{
  const b=belts.find(x=>x.type===t);
  if(!b)return '<article class="cbpes-belt-card"><span>🏅 '+types[t]+'</span><h3>AGUARDANDO DETENTOR INICIAL</h3><small>O administrador ainda não definiu o primeiro detentor.</small></article>';
  return '<article class="cbpes-belt-card"><span>🏅 '+types[t]+'</span><h3>'+clean(b.holder)+'</h3><div class="cbpes-belt-stats"><b>'+b.streak+' <small>DEFESAS CONSECUTIVAS</small></b><b>'+b.transfers+' <small>TROCAS DE DETENTOR</small></b></div><p>Detentor inicial: '+clean(b.initial)+' · Início: '+clean(b.start.split('-').reverse().join('/'))+'</p><details><summary>HISTÓRICO DE DEFESAS E TRANSFERÊNCIAS ('+b.events.length+')</summary><div class="cbpes-belt-history">'+(b.events.length?b.events.slice().reverse().map(m=>'<div><time>'+clean(m.date.split('-').reverse().join('/'))+'</time> · '+clean(m.home)+' '+m.hs+' × '+m.as+' '+clean(m.away)+' — <strong>'+(m.kind==='transfer'?'NOVO DETENTOR: '+clean(m.current):m.kind==='draw'?'EMPATE — DEFESA':'VITÓRIA — DEFESA')+'</strong></div>').join(''):'Nenhuma defesa registrada após a data inicial.')+'</div></details></article>';
 }).join('');
 return '<div class="cbpes-belt-grid">'+boxes+'</div><p class="cbpes-belt-footnote">O cinturão é disputado somente nas partidas do detentor. Vitória ou empate mantém o título; derrota transfere ao adversário. A sequência reinicia quando há transferência. Jogos sem data confiável não são contabilizados.</p>';
}
async function renderPublic(){
 const el=document.getElementById('beltsView');if(!el||typeof D==='undefined'||!D)return;
 try{const [configs,career]=await Promise.all([loadConfig(),loadHistory()]);const all=matches(D,career);el.innerHTML=view(configs.map(c=>calculate(c,all)).filter(Boolean));}
 catch(err){el.innerHTML='<div class="empty">Não foi possível carregar os cinturões: '+clean(err.message)+'</div>';}
}
const style=document.createElement('style');style.textContent='.cbpes-belt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:15px}.cbpes-belt-card{padding:24px;border:1px solid #315b64;border-radius:9px;background:linear-gradient(140deg,#102c31,#083e36);color:#fff}.cbpes-belt-card>span{font-size:12px;font-weight:800;letter-spacing:.07em;color:#f0cf77}.cbpes-belt-card h3{font-size:25px;margin:16px 0}.cbpes-belt-stats{display:flex;gap:24px;margin:15px 0}.cbpes-belt-stats b{font-size:27px}.cbpes-belt-stats small{display:block;font-size:9px;font-weight:600;color:#c4d6d4}.cbpes-belt-card p,.cbpes-belt-footnote{font-size:12px;color:#b8c9c9}.cbpes-belt-card summary{cursor:pointer;font-size:12px;font-weight:700;margin-top:18px}.cbpes-belt-history{margin-top:12px;max-height:280px;overflow:auto;font-size:11px}.cbpes-belt-history>div{padding:9px 0;border-bottom:1px solid #ffffff23}.cbpes-belt-history time{color:#f0cf77}';document.head.appendChild(style);
window.CBPESBelts={types,matches,calculate,loadConfig,loadHistory,renderPublic};
})();