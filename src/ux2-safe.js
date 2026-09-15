import './ux2-safe.css'
import { supabase } from './supabase'

// ------------------------------------------------------------------
// 1) Sécurise la synchronisation hors ligne : même vente locale = 1 vente serveur.
// ------------------------------------------------------------------
const originalRpc = supabase.rpc.bind(supabase)
supabase.rpc = (name, args = {}, options) => {
  if (name === 'complete_sale' && typeof args?.p_note === 'string') {
    const match = args.p_note.match(/^Vente hors ligne ([0-9a-f-]{36})$/i)
    if (match) {
      return originalRpc('complete_sale_offline_idempotent', {
        p_local_id: match[1],
        p_customer_id: args.p_customer_id ?? null,
        p_lines: args.p_lines,
        p_payments: args.p_payments,
        p_note: args.p_note
      }, options)
    }
  }
  return originalRpc(name, args, options)
}

const num = v => Number(v || 0)
const eur = v => num(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
const monthNames = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
let enhanceTimer = null
let pilotageRunning = false
let treasuryRunning = false

function scheduleEnhance(){
  clearTimeout(enhanceTimer)
  enhanceTimer=setTimeout(enhance,80)
}

function enhance(){
  try{
    replaceSprintLabel()
    removeDuplicateBankRules()
    ensureMixedCheque()
    enhanceSaleLineStatuses()
    if(document.querySelector('#pilotage')?.classList.contains('active')) enhancePilotage()
    if(document.querySelector('#treasury')?.classList.contains('active')) enhanceTreasury()
  }catch(e){
    console.error('UX2 enhancement error',e)
  }
}

function replaceSprintLabel(){
  const el=document.querySelector('aside .sub')
  if(el && el.textContent.includes('Sprint')) el.textContent='Gestion du comptoir'
}

function removeDuplicateBankRules(){
  const treasury=document.querySelector('#treasury')
  if(!treasury)return
  const h=[...treasury.querySelectorAll('h2')].find(x=>x.textContent.trim()==='Règles de catégorisation')
  h?.closest('.card')?.remove()
}

function ensureMixedCheque(){
  const box=document.querySelector('#mixedBox')
  if(!box || document.querySelector('#mixCheque')) return
  const grid=box.querySelector('.grid')
  if(!grid)return
  grid.classList.remove('grid')
  grid.classList.add('mixed-payment-grid')
  const input=document.createElement('input')
  input.id='mixCheque';input.className='field';input.type='number';input.min='0';input.step='0.01';input.placeholder='Chèque €'
  grid.appendChild(input)

  const validate=document.querySelector('#validateSale')
  if(validate && !validate.dataset.ux2Cheque){
    validate.dataset.ux2Cheque='1'
    validate.addEventListener('click',handleMixedCheque,true)
  }
}

async function handleMixedCheque(event){
  const box=document.querySelector('#mixedBox')
  const cheque=num(document.querySelector('#mixCheque')?.value)
  if(!box || box.style.display==='none' || cheque<=0) return

  event.preventDefault()
  event.stopImmediatePropagation()
  const msg=document.querySelector('#saleMsg')
  if(!navigator.onLine){
    msg.textContent='Le paiement mixte comprenant un chèque nécessite une connexion internet.'
    return
  }

  try{
    const card=num(document.querySelector('#mixCard')?.value)
    const cash=num(document.querySelector('#mixCash')?.value)
    const totalText=document.querySelector('#cartTotal')?.textContent || '0'
    const total=num(totalText.replace(/\s/g,'').replace('€','').replace(',','.').replace(/[^0-9.-]/g,''))

    if(Math.abs(card+cash+cheque-total)>0.01){
      msg.textContent='Le paiement mixte doit être égal au total.'
      return
    }

    const {data:products,error:productError}=await supabase.from('products').select('id,name')
    if(productError)throw productError

    const lines=[...document.querySelectorAll('#cart .cartline')].map(row=>{
      const name=row.querySelector('b')?.textContent?.trim()
      const qty=num(row.querySelector('.qtyInput')?.value)
      const product=products.find(p=>p.name===name)
      return product ? {product_id:product.id,quantity:qty} : null
    }).filter(Boolean)

    if(!lines.length) throw new Error('Panier introuvable.')

    let customerId=null
    const clientName=document.querySelector('#customerSearch')?.value?.trim()
    if(clientName){
      const {data:clients}=await supabase.from('customers').select('id,display_name').eq('active',true)
      customerId=clients?.find(c=>c.display_name===clientName)?.id || null
    }

    const payments=[]
    if(card>0)payments.push({method:'card',amount:card})
    if(cash>0)payments.push({method:'cash',amount:cash})
    if(cheque>0)payments.push({method:'cheque',amount:cheque})

    msg.textContent='Enregistrement…'
    const {error}=await originalRpc('complete_sale',{
      p_customer_id:customerId,
      p_lines:lines,
      p_payments:payments,
      p_note:null
    })
    if(error)throw error

    msg.textContent='Vente enregistrée.'
    setTimeout(()=>location.reload(),400)
  }catch(e){
    msg.textContent='Erreur : '+e.message
  }
}

// ------------------------------------------------------------------
// 2) Historique : statut des lignes de vente.
// ------------------------------------------------------------------
async function enhanceSaleLineStatuses(){
  const body=document.querySelector('#saleLineRows')
  if(!body || body.dataset.ux2Busy==='1')return
  const table=body.closest('table')
  const header=table?.querySelector('thead tr')
  if(!header)return

  body.dataset.ux2Busy='1'
  try{
    const {data:sales,error}=await supabase.from('sales').select('sale_number,status')
    if(error)return

    const statusByNumber=new Map((sales||[]).map(s=>[s.sale_number,s.status]))
    if(!header.querySelector('[data-ux2-status]')){
      const th=document.createElement('th')
      th.textContent='Statut';th.dataset.ux2Status='1';header.appendChild(th)
    }

    for(const row of body.querySelectorAll('tr')){
      const saleNumber=row.cells[0]?.textContent?.trim()
      if(!saleNumber || row.querySelector('[data-ux2-status]'))continue
      const status=statusByNumber.get(saleNumber) || '—'
      const td=document.createElement('td')
      td.dataset.ux2Status='1'
      td.innerHTML=`<span class="status ${status==='completed'?'ok':'cancelled'}">${esc(status)}</span>`
      row.appendChild(td)
      if(status!=='completed')row.classList.add('cancelled-row')
    }
  }finally{
    body.dataset.ux2Busy='0'
  }
}

// ------------------------------------------------------------------
// 3) Pilotage : paiements empilés + double lecture des seuils + compte de gestion.
// ------------------------------------------------------------------
async function fetchPilotageData(){
  const year=new Date().getFullYear()
  const [{data:sales},{data:payments},{data:lines},{data:expenses},{data:settings}]=await Promise.all([
    supabase.from('sales').select('*').eq('status','completed').gte('sold_at',`${year}-01-01T00:00:00`).lt('sold_at',`${year+1}-01-01T00:00:00`),
    supabase.from('payments').select('*'),
    supabase.from('sale_lines').select('*'),
    supabase.from('management_expenses').select('*').gte('expense_date',`${year}-01-01`).lte('expense_date',`${year}-12-31`),
    supabase.from('settings').select('*').single()
  ])

  const monthly=Array.from({length:12},(_,month)=>({
    month,ca:0,caHt:0,card:0,cheque:0,cash:0,cost:0,expenses:0
  }))
  const saleMap=new Map((sales||[]).map(s=>[s.id,s]))

  for(const s of sales||[]){
    const m=new Date(s.sold_at).getMonth()
    monthly[m].ca+=num(s.total_ttc)
    monthly[m].caHt+=num(s.total_ht)
  }
  for(const p of payments||[]){
    const s=saleMap.get(p.sale_id)
    if(!s || (p.status && p.status!=='completed'))continue
    const m=new Date(s.sold_at).getMonth()
    if(p.payment_method==='card')monthly[m].card+=num(p.amount)
    if(p.payment_method==='cheque')monthly[m].cheque+=num(p.amount)
    if(p.payment_method==='cash')monthly[m].cash+=num(p.amount)
  }
  for(const line of lines||[]){
    const s=saleMap.get(line.sale_id)
    if(!s)continue
    monthly[new Date(s.sold_at).getMonth()].cost+=num(line.line_cost_ht)
  }
  for(const e of expenses||[]){
    monthly[new Date(e.expense_date+'T00:00:00').getMonth()].expenses+=num(e.amount)
  }

  const sr=num(settings?.micro_social_rate)/100
  const tr=num(settings?.income_tax_rate)/100
  for(const m of monthly){
    m.nonCash=m.card+m.cheque
    m.gross=m.caHt-m.cost
    m.grossRate=m.caHt?m.gross/m.caHt*100:0
    m.social=m.ca*sr
    m.tax=m.ca*tr
    m.net=m.gross-m.expenses-m.social-m.tax
    m.netRate=m.ca?m.net/m.ca*100:0
  }
  return {monthly,settings}
}

async function enhancePilotage(){
  if(pilotageRunning)return
  pilotageRunning=true
  try{
    const {monthly,settings}=await fetchPilotageData()
    renderStackedChart(monthly)
    renderDualThresholds(monthly,settings)
    renderManagement(monthly)
  }catch(e){
    console.error('Pilotage UX2',e)
  }finally{
    pilotageRunning=false
  }
}

function renderStackedChart(monthly){
  const box=document.querySelector('#pilotageChart')
  if(!box)return
  const card=box.closest('.card')
  const title=card?.querySelector('h2')
  const note=card?.querySelector('.small')
  if(title)title.textContent='CA encaissé par mode de paiement'
  if(note)note.textContent='Barres empilées = CB / chèques / espèces · ligne pleine = marge brute % · ligne pointillée = marge nette %.'

  const W=1100,H=350,pad={l:30,r:25,t:45,b:45},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b
  const max=Math.max(1,...monthly.map(m=>m.ca))
  const slot=iw/12,bw=slot*.5
  const x=i=>pad.l+slot*i+slot/2
  const y=v=>pad.t+ih-(v/max)*ih
  const yp=v=>pad.t+ih-((Math.max(-20,Math.min(100,v))+20)/120)*ih

  const bars=monthly.map(m=>{
    const total=m.card+m.cheque+m.cash
    let acc=0
    const seg=(value,cls)=>{
      if(!value)return ''
      const y0=y(acc);acc+=value;const yt=y(acc),h=y0-yt
      const pct=total?value/total*100:0
      return `<rect x="${x(m.month)-bw/2}" y="${yt}" width="${bw}" height="${h}" class="ux2-svg-${cls}"></rect>${h>18?`<text x="${x(m.month)}" y="${yt+h/2+4}" text-anchor="middle" class="ux2-pct">${pct.toFixed(0)}%</text>`:''}`
    }
    return `${seg(m.card,'card')}${seg(m.cheque,'cheque')}${seg(m.cash,'cash')}
      <text x="${x(m.month)}" y="${Math.max(16,y(total)-7)}" text-anchor="middle" class="chart-ca-label">${total?Math.round(total).toLocaleString('fr-FR')+' €':''}</text>
      <text x="${x(m.month)}" y="${H-14}" text-anchor="middle" class="chart-month">${monthNames[m.month]}</text>`
  }).join('')

  const gross=monthly.map(m=>`${x(m.month)},${yp(m.grossRate)}`).join(' ')
  const net=monthly.map(m=>`${x(m.month)},${yp(m.netRate)}`).join(' ')
  const gl=monthly.map(m=>m.ca?`<text x="${x(m.month)}" y="${yp(m.grossRate)-8}" text-anchor="middle" class="chart-gross-label">${m.grossRate.toFixed(0)}%</text>`:'').join('')
  const nl=monthly.map(m=>m.ca?`<text x="${x(m.month)}" y="${yp(m.netRate)+17}" text-anchor="middle" class="chart-net-label">${m.netRate.toFixed(0)}%</text>`:'').join('')

  box.innerHTML=`<div class="ux2-legend">
    <span><i class="ux2-swatch card"></i>CB</span>
    <span><i class="ux2-swatch cheque"></i>Chèques</span>
    <span><i class="ux2-swatch cash"></i>Espèces</span>
    <span>Marge brute %</span><span>Marge nette %</span>
  </div><svg viewBox="0 0 ${W} ${H}">
    ${bars}
    <polyline points="${gross}" class="chart-line gross"></polyline>
    <polyline points="${net}" class="chart-line net"></polyline>
    ${gl}${nl}
  </svg>`
}

function gauge(label,value,threshold){
  const pct=threshold?Math.min(100,value/threshold*100):0
  return `<div class="gauge-block"><div class="row space"><b>${esc(label)}</b><span>${eur(value)} / ${eur(threshold)}</span></div><div class="gauge"><span style="width:${pct}%"></span></div><div class="small">${pct.toFixed(1)} % du seuil</div></div>`
}

function renderDualThresholds(monthly,settings){
  const box=document.querySelector('#thresholdsBox')
  if(!box)return
  const current=monthly.slice(0,new Date().getMonth()+1)
  const total=current.reduce((s,m)=>s+m.ca,0)
  const nonCash=current.reduce((s,m)=>s+m.nonCash,0)
  const cash=current.reduce((s,m)=>s+m.cash,0)
  const thresholds=[
    ['TVA — seuil de base',num(settings?.vat_base_threshold)],
    ['TVA — seuil majoré',num(settings?.vat_major_threshold)],
    ['Régime micro',num(settings?.micro_threshold)]
  ]
  const title=box.closest('.card')?.querySelector('h2')
  if(title)title.textContent='Seuils & suivi des encaissements'
  box.innerHTML=`<div class="ux2-thresholds">
    <div><h3>CA total encaissé — référence officielle</h3>${thresholds.map(([l,t])=>gauge(l,total,t)).join('')}</div>
    <div><h3>Lecture de gestion — CB + chèques</h3>${thresholds.map(([l,t])=>gauge(l,nonCash,t)).join('')}<div class="small">Espèces encaissées : <b>${eur(cash)}</b></div></div>
  </div>
  <div class="notice" style="margin-top:12px">La déclaration URSSAF et les seuils réglementaires restent calculés sur le <b>CA total effectivement encaissé</b>, espèces comprises. La colonne CB + chèques est uniquement une lecture interne de gestion.</div>`
}

function renderManagement(monthly){
  const body=document.querySelector('#managementRows')
  if(!body)return
  const current=monthly.slice(0,new Date().getMonth()+1)
  const head=body.closest('table')?.querySelector('thead')
  if(head)head.innerHTML='<tr><th>Mois</th><th>CA total</th><th>dont CB + chèques</th><th>dont espèces</th><th>Achats consommés</th><th>Marge brute</th><th>Taux marge brute</th><th>Autres dépenses</th><th>Cotisations estimées</th><th>Versement libératoire estimé</th><th>Solde gestion estimé</th><th>Marge nette</th></tr>'

  const total=current.reduce((a,m)=>({
    ca:a.ca+m.ca,nonCash:a.nonCash+m.nonCash,cash:a.cash+m.cash,cost:a.cost+m.cost,caHt:a.caHt+m.caHt,gross:a.gross+m.gross,expenses:a.expenses+m.expenses,social:a.social+m.social,tax:a.tax+m.tax,net:a.net+m.net
  }),{ca:0,nonCash:0,cash:0,cost:0,caHt:0,gross:0,expenses:0,social:0,tax:0,net:0})
  const grossRate=total.caHt?total.gross/total.caHt*100:0
  const netRate=total.ca?total.net/total.ca*100:0

  body.innerHTML=current.map(m=>`<tr>
    <td>${monthNames[m.month]}</td><td>${eur(m.ca)}</td><td>${eur(m.nonCash)}</td><td>${eur(m.cash)}</td>
    <td>${eur(m.cost)}</td><td>${eur(m.gross)}</td><td>${m.grossRate.toFixed(1)} %</td><td>${eur(m.expenses)}</td>
    <td>${eur(m.social)}</td><td>${eur(m.tax)}</td><td><b>${eur(m.net)}</b></td><td>${m.netRate.toFixed(1)} %</td>
  </tr>`).join('')+`<tr class="total-row"><td><b>Cumul</b></td><td><b>${eur(total.ca)}</b></td><td><b>${eur(total.nonCash)}</b></td><td><b>${eur(total.cash)}</b></td><td><b>${eur(total.cost)}</b></td><td><b>${eur(total.gross)}</b></td><td><b>${grossRate.toFixed(1)} %</b></td><td><b>${eur(total.expenses)}</b></td><td><b>${eur(total.social)}</b></td><td><b>${eur(total.tax)}</b></td><td><b>${eur(total.net)}</b></td><td><b>${netRate.toFixed(1)} %</b></td></tr>`
}

// ------------------------------------------------------------------
// 4) Trésorerie : remet un graphe de projection visible.
// ------------------------------------------------------------------
async function enhanceTreasury(){
  if(treasuryRunning)return
  treasuryRunning=true
  try{
    const section=document.querySelector('#treasury')
    const kpis=document.querySelector('#treasuryKpis')
    if(!section||!kpis)return

    let card=document.querySelector('#ux2TreasuryChartCard')
    if(!card){
      card=document.createElement('div')
      card.id='ux2TreasuryChartCard'
      card.className='card'
      card.style.marginTop='14px'
      kpis.insertAdjacentElement('afterend',card)
    }

    const now=new Date()
    const start=new Date(now);start.setDate(start.getDate()-60)
    const [{data:settings},{data:sales},{data:events}]=await Promise.all([
      supabase.from('settings').select('*').single(),
      supabase.from('sales').select('sold_at,total_ttc,status').eq('status','completed').gte('sold_at',start.toISOString()),
      supabase.from('forecast_events').select('*').eq('active',true)
    ])

    const daily=(sales||[]).reduce((s,x)=>s+num(x.total_ttc),0)/60
    const startBalance=num(settings?.current_bank_balance)

    function eventNet(days){
      const end=new Date(now);end.setDate(end.getDate()+days)
      let net=0
      for(const e of events||[]){
        const first=new Date(e.event_date+'T00:00:00')
        if(e.recurrence==='monthly'){
          const d=new Date(first)
          while(d<now)d.setMonth(d.getMonth()+1)
          while(d<=end){
            net+=e.event_type==='income'?num(e.amount):-num(e.amount)
            d.setMonth(d.getMonth()+1)
          }
        }else if(first>=now&&first<=end){
          net+=e.event_type==='income'?num(e.amount):-num(e.amount)
        }
      }
      return net
    }

    const points=[0,30,60,90].map(days=>({days,value:startBalance+daily*days+eventNet(days)}))
    const W=850,H=250,p={l:65,r:30,t:25,b:35}
    const vals=points.map(x=>x.value)
    const min=Math.min(0,...vals),max=Math.max(1,...vals)
    const range=max-min||1
    const x=i=>p.l+i*((W-p.l-p.r)/(points.length-1))
    const y=v=>p.t+(H-p.t-p.b)-(v-min)/range*(H-p.t-p.b)
    const poly=points.map((pt,i)=>`${x(i)},${y(pt.value)}`).join(' ')

    card.innerHTML=`<h2>Projection de trésorerie</h2>
      <div class="small">Projection indicative à partir du solde saisi, du rythme récent des ventes et des événements futurs.</div>
      <div class="ux2-treasury-chart"><svg viewBox="0 0 ${W} ${H}">
        <line x1="${p.l}" y1="${y(0)}" x2="${W-p.r}" y2="${y(0)}" stroke="#ddd"/>
        <polyline points="${poly}" fill="none" stroke="#755638" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${points.map((pt,i)=>`<circle cx="${x(i)}" cy="${y(pt.value)}" r="5" fill="#755638"/><text x="${x(i)}" y="${H-10}" text-anchor="middle" class="chart-month">${pt.days===0?'Aujourd’hui':'J+'+pt.days}</text><text x="${x(i)}" y="${Math.max(15,y(pt.value)-10)}" text-anchor="middle" class="chart-ca-label">${Math.round(pt.value).toLocaleString('fr-FR')} €</text>`).join('')}
      </svg></div>`
  }catch(e){
    console.error('Treasury UX2',e)
  }finally{
    treasuryRunning=false
  }
}

function bindNavigation(){
  document.querySelectorAll('nav button').forEach(btn=>{
    if(btn.dataset.ux2Bound)return
    btn.dataset.ux2Bound='1'
    btn.addEventListener('click',()=>setTimeout(enhance,120))
  })
  const refreshP=document.querySelector('#refreshPilotageBtn')
  if(refreshP&&!refreshP.dataset.ux2Bound){refreshP.dataset.ux2Bound='1';refreshP.addEventListener('click',()=>setTimeout(enhancePilotage,300))}
  const refreshT=document.querySelector('#refreshTreasuryBtn')
  if(refreshT&&!refreshT.dataset.ux2Bound){refreshT.dataset.ux2Bound='1';refreshT.addEventListener('click',()=>setTimeout(enhanceTreasury,300))}
}

function boot(){
  bindNavigation()
  scheduleEnhance()
}

const observer=new MutationObserver(()=>{bindNavigation();scheduleEnhance()})
observer.observe(document.documentElement,{subtree:true,childList:true})
window.addEventListener('load',()=>setTimeout(boot,300))
