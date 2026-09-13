/* D Time · Matchup
   Your live Sleeper matchup, and what it would take to win it.

   Everything on the page is derived from five public Sleeper reads and one
   local scenario. The reads are the truth about the world — who is on which
   roster, who has scored what, what Sleeper projects for the rest. The scenario
   is the truth about the question you are asking: a projection you have
   overridden here, a bench player you have started there. Refresh replaces the
   world and keeps the question. Reset does the opposite.

   Scoring is recomputed here from raw stat lines under this league's own
   settings rather than read off Sleeper's generic pts_ppr, because the two
   disagree: McCaffrey's Week 1 line is 19.58 in Sleeper's default and 19.91 in
   this league. The recompute was checked against every starter's actual points
   and matched to the cent. */
(()=>{
const LEAGUE='1392057555869536256';
const ME='nickmansourr';
const API='https://api.sleeper.app';
const CDN='https://sleepercdn.com';
const POS=['QB','RB','WR','TE','K','DEF'];
/* what may stand in each slot; anything not listed is its own name */
const FITS={FLEX:['RB','WR','TE'],SUPER_FLEX:['QB','RB','WR','TE'],
 WRRB_FLEX:['RB','WR'],REC_FLEX:['WR','TE'],IDP_FLEX:['DL','LB','DB'],BN:POS};
const SLOTNAME={SUPER_FLEX:'SFLEX',FLEX:'FLEX',WRRB_FLEX:'W/R',REC_FLEX:'W/T'};

const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>{n=+n||0;const s=(Math.round(n*100)/100).toFixed(2);return s.replace(/\.?0+$/,'')};
const fmt1=n=>(Math.round((+n||0)*10)/10).toFixed(1);
const signed=n=>(n>0?'+':n<0?'−':'')+fmt(Math.abs(n));
const day=d=>{if(!d)return '';const t=new Date(d+'T12:00:00');return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getDay()]};

/* ---- the world -------------------------------------------------------- */
let W=null;        /* everything fetched, shaped */
let S=null;        /* the scenario: overrides and lineups, kept per week */
let VIEW={m:null}; /* which matchup is open */
let UPDATED=null;

const get=async u=>{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(r.status+' '+u);return r.json()};

async function load(first){
 const st=await get(`${API}/v1/state/nfl`);
 const season=st.season,week=st.display_week||st.week;
 const [league,users,rosters,matchups,proj,sched]=await Promise.all([
  first?get(`${API}/v1/league/${LEAGUE}`):W.league,
  first?get(`${API}/v1/league/${LEAGUE}/users`):W.users,
  get(`${API}/v1/league/${LEAGUE}/rosters`),
  get(`${API}/v1/league/${LEAGUE}/matchups/${week}`),
  get(`${API}/projections/nfl/${season}/${week}?season_type=regular&`+POS.map(p=>'position[]='+p).join('&')),
  get(`${API}/schedule/nfl/regular/${season}`)]);
 W=shape({season,week,league,users,rosters,matchups,proj,sched});
 UPDATED=new Date();
 if(!S||S.key!==W.key)S=loadScenario(W.key)}

/* One pass from Sleeper's shapes to ours. Nothing downstream reads the raw
   payloads again. */
function shape({season,week,league,users,rosters,matchups,proj,sched}){
 const sc=league.scoring_settings;
 const score=stats=>{let t=0;for(const k in sc){const v=stats[k];if(v)t+=v*sc[k]}return Math.round(t*100)/100};
 /* this week's game for every team */
 const game={};
 for(const g of sched){if(g.week!==week)continue;
  game[g.home]={status:g.status,opp:g.away,home:true,date:g.date};
  game[g.away]={status:g.status,opp:g.home,home:false,date:g.date}}
 const players={};
 for(const p of proj){const pl=p.player||{};const team=pl.team||p.team||null;
  players[p.player_id]={id:p.player_id,
   name:pl.position==='DEF'?(pl.last_name||team):`${pl.first_name||''} ${pl.last_name||''}`.trim(),
   short:pl.position==='DEF'?(pl.last_name||team):`${(pl.first_name||'')[0]||''}. ${pl.last_name||''}`.trim(),
   pos:pl.position||'—',team,injury:pl.injury_status||null,
   proj:score(p.stats||{}),game:team?game[team]||null:null}}
 const userBy={};for(const u of users)userBy[u.user_id]=u;
 const teams={};
 for(const r of rosters){const u=userBy[r.owner_id]||{};
  teams[r.roster_id]={id:r.roster_id,owner:r.owner_id,
   name:(u.metadata&&u.metadata.team_name)||u.display_name||'Team '+r.roster_id,
   handle:u.display_name||'',avatar:u.avatar||null,
   players:r.players||[],reserve:r.reserve||[],taxi:r.taxi||[],
   starters:[],actual:{},points:0}}
 for(const m of matchups){const t=teams[m.roster_id];if(!t)continue;
  t.starters=m.starters||[];t.actual=m.players_points||{};t.points=m.points||0;t.matchup=m.matchup_id}
 const pairs={};
 for(const t of Object.values(teams)){if(t.matchup==null)continue;(pairs[t.matchup]=pairs[t.matchup]||[]).push(t.id)}
 const me=Object.values(teams).find(t=>t.handle.toLowerCase()===ME.toLowerCase());
 return {key:`${LEAGUE}.${season}.${week}`,season,week,league,slots:league.roster_positions,
  players,teams,pairs,me:me?me.id:null}}

/* ---- the scenario ----------------------------------------------------- */
const SKEY=k=>'dtime.'+k;
function loadScenario(key){try{const j=JSON.parse(localStorage.getItem(SKEY(key)));
 if(j&&j.key===key)return j}catch(e){}return {key,proj:{},lineup:{}}}
function saveScenario(){try{localStorage.setItem(SKEY(S.key),JSON.stringify(S))}catch(e){}}
const touched=()=>Object.keys(S.proj).length>0||Object.keys(S.lineup).length>0;

/* ---- the model -------------------------------------------------------- */
/* a player's state this week, and the number the scenario currently gives him */
function line(tid,pid){
 const t=W.teams[tid],p=W.players[pid];
 const actual=+(t.actual[pid]||0);
 if(!p)return {pid,p:null,actual,proj:0,final:actual,status:'empty',fixed:true};
 const g=p.game;
 const status=!g?'bye':g.status==='complete'?'final':g.status==='in_game'?'live':'pre';
 const fixed=status==='final'||status==='bye';
 /* Sleeper keeps publishing a full projection for a player it has already
    ruled out — Murray carried 18 while listed Out with 0.62 on the board. A
    player who is Out or on IR is not going to score, so his number is whatever
    he has; you can still type over it if you know better. */
 const out=p.injury==='Out'||p.injury==='IR'||p.injury==='PUP'||p.injury==='Sus';
 const base=status==='bye'?0:out?actual:status==='live'?Math.max(p.proj,actual):p.proj;
 const over=S.proj[pid];
 const final=fixed?actual:(over!=null?+over:base);
 return {pid,p,actual,proj:p.proj,base,final,status,fixed,edited:!fixed&&over!=null}}
const starters=tid=>S.lineup[tid]||W.teams[tid].starters;
const lineup=tid=>starters(tid).map(pid=>line(tid,pid));
const totals=tid=>{const L=lineup(tid);
 return {actual:L.reduce((a,l)=>a+l.actual,0),final:L.reduce((a,l)=>a+l.final,0),
  left:L.filter(l=>!l.fixed),done:L.filter(l=>l.fixed).length,live:L.filter(l=>l.status==='live').length}};
const fits=(slot,pos)=>(FITS[slot]||[slot]).includes(pos);
const bench=tid=>{const t=W.teams[tid],on=new Set(starters(tid));
 return t.players.filter(pid=>!on.has(pid)).map(pid=>line(tid,pid))
  .sort((a,b)=>(POS.indexOf(a.p?a.p.pos:'')-POS.indexOf(b.p?b.p.pos:''))||(b.final-a.final))};

/* ---- the page ---------------------------------------------------------- */
const shot=p=>p.pos==='DEF'
 ?`${CDN}/images/team_logos/nfl/${(p.team||'').toLowerCase()}.png`
 :`${CDN}/content/nfl/players/thumb/${p.id}.jpg`;
const avatar=t=>t.avatar?`<img class="av" src="${CDN}/avatars/thumbs/${t.avatar}" alt="">`
 :`<span class="av avt">${esc((t.name||'?')[0])}</span>`;

function chip(l){
 if(!l.p)return '<span class="st empty">Empty</span>';
 const inj=l.p.injury?`<span class="inj">${esc(l.p.injury==='Questionable'?'Q':l.p.injury==='Doubtful'?'D':l.p.injury)}</span>`:'';
 const g=l.p.game;
 const vs=g?`${g.home?'vs':'@'} ${g.opp}`:'';
 const s={final:'Final',live:'Live',pre:day(g&&g.date),bye:'Bye',empty:''}[l.status];
 return `<span class="st ${l.status}">${esc(s)}</span><span class="vs">${esc(vs)}</span>${inj}`}

function row(tid,l,i,slot){
 const p=l.p;
 const num=l.fixed
  ?`<span class="fin">${fmt(l.final)}</span>`
  :`<input class="fin in${l.edited?' ed':''}" type="number" inputmode="decimal" step="0.1" min="0"
     value="${fmt(l.final)}" data-proj="${tid}|${l.pid}" aria-label="Projected points for ${esc(p?p.name:'empty slot')}">`;
 return `<div class="pr ${l.status}${l.edited?' edited':''}" data-row="${tid}|${i}">
<span class="sl">${esc(SLOTNAME[slot]||slot)}</span>
${p?`<img class="hs${p.pos==='DEF'?' def':''}" src="${shot(p)}" alt="" loading="lazy">`:'<span class="hs none"></span>'}
<span class="who" data-tap="${tid}|${i}" role="button" tabindex="0" aria-label="Swap ${esc(p?p.name:'empty slot')}"><span class="nm">${p?esc(p.name):'—'}</span>
<span class="meta">${p?`<b>${esc(p.pos)}</b> ${esc(p.team||'')}`:''} ${chip(l)}</span></span>
<span class="act" title="Scored so far">${l.status==='pre'||l.status==='bye'?'<i>–</i>':fmt(l.actual)}</span>
${num}
<button class="sw" type="button" data-swap="${tid}|${i}" aria-label="Swap ${esc(p?p.name:'empty slot')} for a bench player">⇄</button>
</div>`}

function side(tid,mine,other){
 const t=W.teams[tid],T=totals(tid),O=totals(other);
 const L=lineup(tid);
 const state=T.left.length===0?'done':T.live>0?'live':'pre';
 return `<section class="side${mine?' me':''}" data-side="${tid}">
<header class="sh">
${avatar(t)}
<span class="tn"><span class="tnm">${esc(t.name)}</span><span class="tnh">@${esc(t.handle)}${mine?' · you':''}</span></span>
<span class="tot"><b class="tf">${fmt(T.final)}</b><span class="ta">${fmt(T.actual)} so far</span></span>
</header>
<div class="rows">${L.map((l,i)=>row(tid,l,i,W.slots[i])).join('')}</div>
<details class="bn"><summary>Bench <span class="bnc">${bench(tid).length}</span></summary>
<div class="rows bnr">${bench(tid).map(l=>`<div class="pr ${l.status} b" data-bench="${tid}|${l.pid}">
<span class="sl">${l.p?esc(l.p.pos):'—'}</span>
${l.p?`<img class="hs${l.p.pos==='DEF'?' def':''}" src="${shot(l.p)}" alt="" loading="lazy">`:''}
<span class="who"><span class="nm">${l.p?esc(l.p.name):'—'}</span><span class="meta">${l.p?`<b>${esc(l.p.pos)}</b> ${esc(l.p.team||'')}`:''} ${chip(l)}</span></span>
<span class="act">${l.status==='pre'||l.status==='bye'?'<i>–</i>':fmt(l.actual)}</span>
<span class="fin">${fmt(l.final)}</span>
<button class="sw" type="button" data-start="${tid}|${l.pid}" aria-label="Start ${esc(l.p?l.p.name:'')}">Start</button></div>`).join('')}</div>
</details>
</section>`}

/* the sentence between the two columns: who is ahead, by how much, and what
   the players still to play have to do about it */
function verdict(a,b){
 const A=totals(a),B=totals(b),ta=W.teams[a],tb=W.teams[b];
 const me=a===W.me,mine=me?'You':ta.name,are=me?'’re':' is';
 const d=A.final-B.final;
 const lead=A.actual-B.actual;
 let head,sub;
 if(A.left.length===0&&B.left.length===0){
  const w=lead>0?ta:lead<0?tb:null;
  head=w?`${esc(w.id===W.me?'You':w.name)} won by ${fmt(Math.abs(lead))}`:'Tied';sub='Final.'}
 else{
  head=d>0?`${esc(mine)}${are} projected to win by ${fmt(d)}`:d<0?`${esc(mine)}${are} projected to lose by ${fmt(-d)}`:'Dead even on projection';
  const need=B.final-A.actual;
  const names=A.left.map(l=>l.p?l.p.short:'empty').join(', ');
  const have=A.left.reduce((s,l)=>s+l.final,0);
  sub=A.left.length
   ?need>0
    ?`${esc(mine)} need${me?'':'s'} <b>${fmt(need)}</b> more from ${esc(names)} — set to ${fmt(have)}.`
    :`${esc(mine)} ${me?'are':'is'} already past ${esc(tb.name)}’s projected ${fmt(B.final)}, with ${esc(names)} still to play.`
   :`${esc(mine)} ${me?'are':'is'} done at ${fmt(A.actual)}; ${esc(tb.name)} needs ${fmt(Math.max(0,A.actual-B.actual))} more from ${B.left.length} player${B.left.length===1?'':'s'}.`}
 return `<div class="vd ${d>0?'up':d<0?'down':''}"><p class="vh">${head}</p><p class="vs2">${sub}</p>
<p class="vn"><span>${fmt(A.actual)}</span><i>so far</i><span>${fmt(B.actual)}</span></p></div>`}

function strip(){
 const ids=Object.keys(W.pairs).sort((x,y)=>(W.pairs[x].includes(W.me)?-1:0)-(W.pairs[y].includes(W.me)?-1:0)||x-y);
 return `<nav class="ms" aria-label="Matchups">${ids.map(id=>{const [a,b]=W.pairs[id];
  const A=totals(a),B=totals(b),on=VIEW.m===id;
  const mine=a===W.me||b===W.me;
  const live=A.live+B.live>0,done=A.left.length+B.left.length===0;
  return `<button class="mc${on?' on':''}${mine?' mine':''}" data-m="${id}" aria-current="${on}">
<span class="mr"><span>${esc(W.teams[a].name)}</span><b>${fmt(A.final)}</b></span>
<span class="mr"><span>${esc(W.teams[b].name)}</span><b>${fmt(B.final)}</b></span>
<span class="mst ${done?'final':live?'live':'pre'}">${done?'Final':live?'Live':'Projected'}</span></button>`}).join('')}</nav>`}

function render(){
 const root=$('#root');
 if(!VIEW.m||!W.pairs[VIEW.m]){VIEW.m=Object.keys(W.pairs).find(id=>W.pairs[id].includes(W.me))||Object.keys(W.pairs)[0]}
 let [a,b]=W.pairs[VIEW.m];
 if(b===W.me)[a,b]=[b,a];
 $('#mw').textContent=`Week ${W.week}`;
 root.innerHTML=`${strip()}
<div class="mu">
${side(a,a===W.me,b)}
${verdict(a,b)}
${side(b,b===W.me,a)}
</div>
<footer class="ft">
<span class="upd">Updated ${UPDATED.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span>
${touched()?'<button class="rs" id="reset" type="button">Reset what-ifs</button>':'<span class="hint">Edit any projection, or swap in a bench player, to ask what it would take.</span>'}
</footer>`;
 wire(root)}

function wire(root){
 root.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{VIEW.m=b.dataset.m;location.hash='m'+VIEW.m;render()});
 root.querySelectorAll('[data-proj]').forEach(inp=>{
  const [tid,pid]=inp.dataset.proj.split('|');
  const commit=()=>{const v=parseFloat(inp.value);
   if(isNaN(v)){delete S.proj[pid]}else{S.proj[pid]=Math.max(0,v)}
   saveScenario();render();
   const again=root.querySelector(`[data-proj="${tid}|${pid}"]`);if(again&&document.activeElement===document.body)again.blur()};
  inp.onchange=commit;
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();inp.blur()}};
  inp.onfocus=()=>inp.select()});
 root.querySelectorAll('[data-swap],[data-tap]').forEach(b=>{
  const open=()=>{const [tid,i]=(b.dataset.swap||b.dataset.tap).split('|');openSwap(tid,+i)};
  b.onclick=open;
  if(b.dataset.tap)b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
 root.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>{
  const [tid,pid]=b.dataset.start.split('|');startFromBench(tid,pid)});
 const rs=$('#reset');if(rs)rs.onclick=()=>{S={key:S.key,proj:{},lineup:{}};saveScenario();render()}}

/* Swap: the slot decides who is allowed. A FLEX takes any of three positions,
   a SUPER_FLEX four, and the rest their own name only. The bench player takes
   the slot and the starter goes to the bench — the scenario's lineup, not
   Sleeper's. */
function openSwap(tid,i){
 const slot=W.slots[i],cur=starters(tid).slice(),out=cur[i];
 const opts=bench(tid).filter(l=>l.p&&fits(slot,l.p.pos));
 const t=W.teams[tid];
 const box=document.createElement('div');box.className='sheet';
 box.innerHTML=`<div class="shx"><header class="shh"><b>${esc(SLOTNAME[slot]||slot)}</b> — ${esc(t.name)}
<button class="x" type="button" aria-label="Close">✕</button></header>
${opts.length?`<div class="rows">${opts.map(l=>`<button class="pr pick ${l.status}" type="button" data-pick="${l.pid}">
<span class="sl">${esc(l.p.pos)}</span><img class="hs${l.p.pos==='DEF'?' def':''}" src="${shot(l.p)}" alt="">
<span class="who"><span class="nm">${esc(l.p.name)}</span><span class="meta"><b>${esc(l.p.pos)}</b> ${esc(l.p.team||'')} ${chip(l)}</span></span>
<span class="act">${l.status==='pre'||l.status==='bye'?'<i>–</i>':fmt(l.actual)}</span><span class="fin">${fmt(l.final)}</span></button>`).join('')}</div>`
 :`<p class="none">Nobody on the bench can play ${esc(SLOTNAME[slot]||slot)}.</p>`}
${out&&out!=='0'?`<button class="pr pick empty" type="button" data-pick="0"><span class="sl">—</span><span class="who"><span class="nm">Leave the slot empty</span></span></button>`:''}
</div>`;
 const close=()=>box.remove();
 box.onclick=e=>{if(e.target===box)close()};
 box.querySelector('.x').onclick=close;
 box.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
  const pid=b.dataset.pick;
  const next=cur.slice();next[i]=pid;
  S.lineup[tid]=next;saveScenario();close();render()});
 document.body.appendChild(box)}

/* from the bench list: put him in the first slot he fits, preferring one that
   is empty, then one whose starter has not played, then any */
function startFromBench(tid,pid){
 const p=W.players[pid];if(!p)return;
 const cur=starters(tid).slice();
 const ok=W.slots.map((s,i)=>s!=='BN'&&fits(s,p.pos)?i:-1).filter(i=>i>=0);
 if(!ok.length)return;
 const empty=ok.find(i=>!cur[i]||cur[i]==='0');
 const pre=ok.find(i=>{const l=line(tid,cur[i]);return l.status==='pre'});
 const i=empty??pre??ok[0];
 if(ok.length>1&&empty==null){openSwapFor(tid,pid,ok);return}
 cur[i]=pid;S.lineup[tid]=cur;saveScenario();render()}

function openSwapFor(tid,pid,slots){
 const p=W.players[pid],t=W.teams[tid],cur=starters(tid);
 const box=document.createElement('div');box.className='sheet';
 box.innerHTML=`<div class="shx"><header class="shh"><b>Start ${esc(p.name)}</b> — in place of
<button class="x" type="button" aria-label="Close">✕</button></header>
<div class="rows">${slots.map(i=>{const l=line(tid,cur[i]);return `<button class="pr pick ${l.status}" type="button" data-slot="${i}">
<span class="sl">${esc(SLOTNAME[W.slots[i]]||W.slots[i])}</span>
${l.p?`<img class="hs${l.p.pos==='DEF'?' def':''}" src="${shot(l.p)}" alt="">`:'<span class="hs none"></span>'}
<span class="who"><span class="nm">${l.p?esc(l.p.name):'Empty'}</span><span class="meta">${l.p?`<b>${esc(l.p.pos)}</b> ${esc(l.p.team||'')}`:''} ${chip(l)}</span></span>
<span class="act">${l.status==='pre'||l.status==='bye'?'<i>–</i>':fmt(l.actual)}</span><span class="fin">${fmt(l.final)}</span></button>`}).join('')}</div></div>`;
 const close=()=>box.remove();
 box.onclick=e=>{if(e.target===box)close()};
 box.querySelector('.x').onclick=close;
 box.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{
  const i=+b.dataset.slot,next=cur.slice();next[i]=pid;
  S.lineup[tid]=next;saveScenario();close();render()});
 document.body.appendChild(box)}

/* ---- refresh ------------------------------------------------------------ */
async function refresh(){
 const b=$('#refresh');b.classList.add('busy');b.disabled=true;
 try{await load(false);render()}
 catch(e){console.error(e);const f=$('.upd');if(f)f.textContent='Refresh failed — try again'}
 finally{b.classList.remove('busy');b.disabled=false}}

/* ---- boot --------------------------------------------------------------- */
async function boot(){
 $('#refresh').onclick=refresh;
 const h=location.hash.match(/^#m(\d+)$/);if(h)VIEW.m=h[1];
 try{await load(true);render()}
 catch(e){console.error(e);$('#root').innerHTML=`<div class="boot"><p class="bootl">Couldn’t reach Sleeper.</p><p class="boots">${esc(e.message)}</p></div>`}}
boot();
})();
