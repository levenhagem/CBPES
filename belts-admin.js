/* Administração dos cinturões: apenas usuários administradores autenticados. */
(function(){
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function render(){
 const root=document.getElementById('view');if(!root)return;
 root.innerHTML='<div class="card"><div class="cardbody">Carregando cinturões...</div></div>';
 try{
  const [configs,history]=await Promise.all([CBPESBelts.loadConfig(),CBPESBelts.loadHistory()]);
  const names=[...new Set([...(D.coachProfiles||[]).map(x=>x.name),...(D.participants||[]).map(x=>x.coach_name),...history.flatMap(x=>[x.home_coach,x.away_coach]),...(D.matches||[]).flatMap(x=>[x.home_coach_name,x.away_coach_name]),...configs.map(x=>x.initial_coach)].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const games=CBPESBelts.matches(D,history);
  root.innerHTML='<div class="card"><div class="cardhead"><h2>GERENCIAMENTO DE CINTURÕES</h2></div><div class="cardbody"><p class="admin-help">Defina o detentor inicial e a data de início. Partidas anteriores à data escolhida não disputam o cinturão. O histórico é recalculado automaticamente pelos resultados oficiais.</p><div class="cbpes-belt-admin-grid">'+['official','weekly','general'].map(type=>{
   const cfg=configs.find(x=>x.belt_type===type),result=cfg?CBPESBelts.calculate(cfg,games):null;
   return '<form class="cbpes-belt-admin-form" data-belt="'+type+'"><h3>'+CBPESBelts.types[type]+'</h3><div class="field"><label>DETENTOR INICIAL</label><select name="coach" required><option value="">SELECIONE O TÉCNICO</option>'+names.map(n=>'<option value="'+E(n)+'"'+(cfg?.initial_coach===n?' selected':'')+'>'+E(n)+'</option>').join('')+'</select></div><div class="field"><label>INÍCIO DA DISPUTA</label><input type="date" name="start" value="'+E(cfg?.starts_on||new Date().toISOString().slice(0,10))+'" required></div><p>DETENTOR ATUAL: <strong>'+E(result?.holder||'A definir')+'</strong></p><p>DEFESAS CONSECUTIVAS: <strong>'+(result?.streak||0)+'</strong></p><button type="submit" class="btn primary">SALVAR CINTURÃO</button></form>';
  }).join('')+'</div></div></div>';
  root.querySelectorAll('form[data-belt]').forEach(form=>form.onsubmit=async e=>{
   e.preventDefault();const type=form.dataset.belt,coach=form.elements.coach.value,start=form.elements.start.value;
   if(!coach||!start)return say('Selecione um técnico e uma data de início.',false);
   const button=form.querySelector('button[type="submit"]');button.disabled=true;
   const {data,error}=await sb.from('cbpes_belts').upsert({belt_type:type,initial_coach:coach,starts_on:start,updated_at:new Date().toISOString()},{onConflict:'belt_type'}).select('belt_type');
   button.disabled=false;
   if(error)return say(traduz(error),false);
   if(!data?.length)return say('Não foi possível confirmar o salvamento do cinturão.',false);
   say('Cinturão configurado com sucesso.',true);await render();
  });
 }catch(err){root.innerHTML='<div class="card"><div class="cardbody">Não foi possível carregar cinturões: '+E(err.message)+'</div></div>';}
}
const css=document.createElement('style');css.textContent='.cbpes-belt-admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,265px),1fr));gap:15px}.cbpes-belt-admin-form{border:1px solid var(--line,#ccc);border-radius:8px;padding:18px}.cbpes-belt-admin-form h3{margin:0 0 18px}.cbpes-belt-admin-form .field{margin:12px 0}.cbpes-belt-admin-form select,.cbpes-belt-admin-form input{width:100%;max-width:100%}.cbpes-belt-admin-form p{font-size:12px}';document.head.appendChild(css);
window.renderBeltsAdmin=render;
})();