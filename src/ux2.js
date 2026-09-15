import { supabase } from './supabase'
import './ux2.css'

const num=v=>Number(v||0)
const eur=v=>num(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
let pilotageBusy=false

function parseEuro(text=''){return Number(String(text).replace(/\s/g,'').replace('€','').replace(',','.').replace(/[^0-9.-]/g,''))||0}

function removeTreasuryDuplicate(){
  const treasury=document.querySelector('#treasury')
  if(!treasury)return
  const h=[...treasury.querySelectorAll('h2')].find(x=>x.textContent.trim()==='Règles de catégorisation')
  h?.closest('.card')?.remove()
}

function improveVersion(){
  const sub=document.querySelector('aside .sub')
  if(sub)sub.textContent='Gestion du comptoir'
}

function addChequeMixed(){
  const box=document.querySelector('#mixedBox')
  if(!box||document.querySelector('#mixCheque'))return
  const grid=box.querySelector('.grid')
  if(!grid)return
  grid.classList.add('ux2-mixed-grid')
  const i=document.createElement('input')
  i.id='mixCheque';i.className='field';i.type='number';i.step='0.01';i.placeholder='Chèque €'
  grid.appendChild(i)
}

async function advancedMixedSale(event){
  const cheque=num(document.querySelector('#mixCheque')?.value)
  const box=document.querySelector('#mixedBox')
  if(!box||box.style.display==='none'||cheque<=0)return

  event.preventDefault()
  event.stopImmediatePropagation()
  const msg=document.querySelector('#saleMsg')

  if(!navigator.onLine){msg.textContent='Le paiement mixte avec chèque nécessite une connexion internet dans cette version.';return}

  try{
    const card=num(document.querySelector('#mixCard')?.value)
    const cash=num(document.querySelector('#mixCash')?.value)
    const total=parseEuro(document.querySelector('#cartTotal')?.textContent)
    if(Math.abs(card+cash+cheque-total)>0.01){msg.textContent='Le paiement mixte doit être égal au total.';return}

    const {data:productRows,error:pe}=await supabase.from('products').select('id,name').eq('active',true)
    if(pe)throw pe

    const lines=[...document.querySelectorAll('#cart .cartline')].map(line=>{
      const name=line.querySelector('b')?.textContent?.trim()
      const qty=num(line.querySelector('.qtyInput')?.value)
      const product=productRows.find(p=>p.name===name)
      return product?{product_id:product.id,quantity:qty}:null
    }).filter(Boolean)

    if(!lines.length){msg.textContent='Impossible de reconstituer le panier.';return}

    let customerId=null
    const customerName=document.querySelector('#customerSearch')?.value?.trim()
    if(customerName){
      const {data:customerRows}=await supabase.from('customers').select('id,display_name').eq('active',true)
      customerId=customerRows?.find(c=>c.display_name===customerName)?.id||null
    }

    const p=[]
    if(card>0)p.push({method:'card',amount:card})
    if(cash>0)p.push({method:'cash',amount:cash})
    if(cheque>0)p.push({method:'cheque',amount:cheque})

    msg.textContent='Enregistrement…'
    const {error}=await supabase.rpc('complete_sale',{p_customer_id:customerId,p_lines:lines,p_payments:p,p_note:null})
    if(error)throw error
    msg.textContent='Vente enregistrée.'
    setTimeout(()=>location.reload(),450)
  }catch(e){msg.textContent='Erreur : '+e.message}
}

function bindMixed(){
  const btn=document.querySelector('#validateSale')
  if(!btn||btn.dataset.ux2)return
  btn.dataset.ux2='1'
  btn.addEventListener('click',advancedMixedSale,true)
}

async function renderSettingsData(){
  const categoryBody=document.querySelector('#categoryRows')
  const rulesBody=document.querySelector('#settingsBankRuleRows')
  if(!categoryBody||!rulesBody)return

  const [{data:cats},{data:rules}]=await Promise.all([
    supabase.from('product_categories').select('*').order('sort_order'),
    supabase.from('bank_category_rules').select('*').order('priority')
  ])

  categoryBody.innerHTML=(cats||[]).map(cat=>`
    <tr>
      <td>${num(cat.sort_order)}</td>
      <td><b>${esc(cat.name)}</b></td>
      <td><span class="status ${cat.active?'ok':'off'}">${cat.active?'Active':'Inactive'}</span></td>
      <td><button class="secondary ux2-toggle-cat" data-id="${cat.id}" data-active="${cat.active}">${cat.active?'Désactiver':'Réactiver'}</button></td>
    </tr>`).join('')||'<tr><td colspan="4" class="muted">Aucune catégorie.</td></tr>'

  categoryBody.querySelectorAll('.ux2-toggle-cat').forEach(btn=>btn.onclick=async()=>{
    const {error}=await supabase.from('product_categories').update({active:btn.dataset.active!=='true'}).eq('id',btn.dataset.id)
    if(error)return alert(error.message)
    renderSettingsData()
  })

  rulesBody.innerHTML=(rules||[]).map(r=>`<tr><td>${esc(r.keyword)}</td><td>${esc(r.category)}</td><td></td></tr>`).join('')||
    '<tr><td colspan="3" class="muted">Aucune règle.</td></tr>'
}

async function getPilotage(){
  const year=new Date().getFullYear()
  const [{data:sales},{data:payments},{data:lines},{data:settings},{data:expenses}]=await Promise.all([
    supabase.from('sales').select('*').eq('status','completed').gte('sold_at',`${year}-01-01`).lt('sold_at',`${year+1}-01-01`),
    supabase.from('payments').select('*'),
    supabase.from('sale_lines').select('*'),
    supabase.from('settings').select('*').single(),
    supabase.from('management_expenses').select('*').gte('expense_date',`${year}-01-01`).lte('expense_date',`${year}-12-31`)
  ])

  const m=Array.from({length:12},(_,month)=>({month,ca:0,caHt:0,card:0,cheque:0,cash:0,other:0,cost:0,expenses:0}))
  const saleMap=new Map((sales||[]).map(s=>[s.id,s]))

  for(const s of sales||[]){
    const i=new Date(s.sold_at).getMonth()
    m[i].ca+=num(s.total_ttc);m[i].caHt+=num(s.total_ht)
  }
  for(const p of payments||[]){
    const s=saleMap.get(p.sale_id)
    if(!s||(p.status&&p.status!=='completed'))continue
    const i=new Date(s.sold_at).getMonth()
    if(p.payment_method==='card')m[i].card+=num(p.amount)
    else if(p.payment_method==='cheque')m[i].cheque+=num(p.amount)
    else if(p.payment_method==='cash')m[i].cash+=num(p.amount)
    else m[i].other+=num(p.amount)
  }
  for(const l of lines||[]){
    const s=saleMap.get(l.sale_id);if(!s)continue
    m[new Date(s.sold_at).getMonth()].cost+=num(l.line_cost_ht)
  }
  for(const e of expenses||[])m[new Date(e.expense_date).getMonth()].expenses+=num(e.amount)

  const sr=num(settings?.micro_social_rate)/100
  const tr=num(settings?.income_tax_rate)/100
  for(const x of m){
    x.nonCash=x.card+x.cheque
    x.gross=x.caHt-x.cost
    x.grossRate=x.caHt?x.gross/x.caHt*100:0
    x.social=x.ca*sr;x.tax=x.ca*tr
    x.net=x.gross-x.expenses-x.social-x.tax
    x.netRate=x.ca?x.net/x.ca*100:0
  }
  return {monthly:m,settings}
}

function renderChart(monthly){
  const box=document.querySelector('#pilotageChart');if(!box)return
  const names=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
  const max=Math.max(1,...monthly.map(x=>x.ca))
  box.innerHTML=`<div class="ux2-legend"><span class="ux2-card-dot"></span>CB <span class="ux2-cheque-dot"></span>Chèques <span class="ux2-cash-dot"></span>Espèces <b>Marge brute %</b> <i>Marge nette %</i></div>
  <div class="ux2-chart">${monthly.map(x=>{
    const total=x.card+x.cheque+x.cash+x.other
    const pct=v=>total?v/total*100:0
    const h=total?Math.max(12,total/max*210):4
    return `<div class="ux2-month-col">
      <div class="ux2-ca-label">${total?Math.round(total).toLocaleString('fr-FR')+' €':''}</div>
      <div class="ux2-stack" style="height:${h}px">
        ${x.card?`<div class="ux2-seg ux2-card" style="height:${pct(x.card)}%"><span>${pct(x.card).toFixed(0)}%</span></div>`:''}
        ${x.cheque?`<div class="ux2-seg ux2-cheque" style="height:${pct(x.cheque)}%"><span>${pct(x.cheque).toFixed(0)}%</span></div>`:''}
        ${x.cash?`<div class="ux2-seg ux2-cash" style="height:${pct(x.cash)}%"><span>${pct(x.cash).toFixed(0)}%</span></div>`:''}
      </div>
      <div class="ux2-rates"><b>${x.grossRate.toFixed(0)}%</b><span>${x.netRate.toFixed(0)}%</span></div>
      <div class="ux2-month">${names[x.month]}</div>
    </div>`}).join('')}</div>`
}

function renderThresholds(monthly,settings){
  const box=document.querySelector('#thresholdsBox');if(!box)return
  const rows=monthly.slice(0,new Date().getMonth()+1)
  const total=rows.reduce((s,x)=>s+x.ca,0)
  const nonCash=rows.reduce((s,x)=>s+x.nonCash,0)
  const cash=rows.reduce((s,x)=>s+x.cash,0)
  const th=[['TVA — seuil de base',num(settings.vat_base_threshold)],['TVA — seuil majoré',num(settings.vat_major_threshold)],['Régime micro',num(settings.micro_threshold)]]
  const gauge=(l,v,t)=>`<div class="ux2-gauge-row"><div class="row space"><b>${l}</b><span>${eur(v)} / ${eur(t)}</span></div><div class="ux2-gauge"><span style="width:${Math.min(100,t?v/t*100:0)}%"></span></div></div>`
  box.innerHTML=`<div class="ux2-threshold-grid"><div><h3>CA total encaissé — référence officielle</h3>${th.map(([l,t])=>gauge(l,total,t)).join('')}</div><div><h3>Lecture de gestion — CB + chèques</h3>${th.map(([l,t])=>gauge(l,nonCash,t)).join('')}<div class="small">Espèces encaissées : <b>${eur(cash)}</b></div></div></div><div class="notice" style="margin-top:12px">Pour les seuils fiscaux et l’URSSAF, la référence reste le <b>CA total effectivement encaissé</b>, y compris les espèces. La lecture CB + chèques est un indicateur interne de gestion.</div>`
}

function renderManagement(monthly){
  const body=document.querySelector('#managementRows');if(!body)return
  const names=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const rows=monthly.slice(0,new Date().getMonth()+1)
  body.closest('table').querySelector('thead').innerHTML='<tr><th>Mois</th><th>CA total</th><th>dont CB + chèques</th><th>dont espèces</th><th>Achats consommés</th><th>Marge brute</th><th>Taux marge brute</th><th>Autres dépenses</th><th>Cotisations estimées</th><th>Versement libératoire estimé</th><th>Solde gestion estimé</th><th>Marge nette</th></tr>'
  body.innerHTML=rows.map(x=>`<tr><td>${names[x.month]}</td><td>${eur(x.ca)}</td><td>${eur(x.nonCash)}</td><td>${eur(x.cash)}</td><td>${eur(x.cost)}</td><td>${eur(x.gross)}</td><td>${x.grossRate.toFixed(1)} %</td><td>${eur(x.expenses)}</td><td>${eur(x.social)}</td><td>${eur(x.tax)}</td><td><b>${eur(x.net)}</b></td><td>${x.netRate.toFixed(1)} %</td></tr>`).join('')
}

async function enhancePilotage(){
  if(pilotageBusy)return
  pilotageBusy=true
  try{
    const card=document.querySelector('#pilotageChart')?.closest('.card')
    const h=card?.querySelector('h2')
    const small=card?.querySelector('.small')
    if(h)h.textContent='CA encaissé par mode de paiement'
    if(small)small.textContent='Barres empilées = CB / chèques / espèces · marge brute % et marge nette %.'
    const th=[...document.querySelectorAll('#pilotage h2')].find(x=>x.textContent.includes('Seuils'))
    if(th)th.textContent='Seuils & suivi des encaissements'
    const {monthly,settings}=await getPilotage()
    renderChart(monthly);renderThresholds(monthly,settings);renderManagement(monthly)
  }finally{pilotageBusy=false}
}

function bindTabs(){
  document.querySelectorAll('nav button').forEach(btn=>{
    if(btn.dataset.ux2)return
    btn.dataset.ux2='1'
    btn.addEventListener('click',()=>{
      if(btn.dataset.tab==='pilotage')setTimeout(enhancePilotage,250)
      if(btn.dataset.tab==='settings')setTimeout(renderSettingsData,250)
    })
  })
}

function apply(){
  if(!document.querySelector('#sell'))return
  improveVersion();removeTreasuryDuplicate();addChequeMixed();bindMixed();bindTabs();renderSettingsData()
  if(document.querySelector('#pilotage')?.classList.contains('active'))enhancePilotage()
}

new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true})
window.addEventListener('load',()=>setTimeout(apply,400))
