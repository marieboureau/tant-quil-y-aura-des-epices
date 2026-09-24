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
const eur0 = v => Math.round(num(v)).toLocaleString('fr-FR')+' €'
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
function pilotageSelection(){
  const input=document.querySelector('#pilotageMonth')
  const now=new Date()
  const fallback=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const value=input?.value || fallback
  if(input && !input.value) input.value=value
  const [year,monthNo]=value.split('-').map(Number)
  return {year,month:monthNo-1,value}
}

async function fetchPilotageData(year){
  const priorYear=year-1
  const [
    {data:sales},{data:payments},{data:lines},{data:expenses},{data:settings},
    {data:remittanceBatches},{data:remittanceItems},{data:historical}
  ]=await Promise.all([
    supabase.from('sales').select('*').eq('status','completed')
      .gte('sold_at',`${priorYear}-01-01T00:00:00`)
      .lt('sold_at',`${year+1}-01-01T00:00:00`),
    supabase.from('payments').select('*'),
    supabase.from('sale_lines').select('*'),
    supabase.from('management_expenses').select('*')
      .gte('expense_date',`${year}-01-01`).lte('expense_date',`${year}-12-31`),
    supabase.from('settings').select('*').single(),
    supabase.from('remittance_batches').select('id,remittance_number,payment_method,remittance_kind,status,prepared_at,deposit_date,credited_date'),
    supabase.from('remittance_items').select('batch_id,payment_id,amount'),
    supabase.from('historical_monthly_sales').select('year,month,ca_ttc').eq('year',priorYear)
  ])

  const monthly=Array.from({length:12},(_,month)=>({
    month,ca:0,caHt:0,card:0,cheque:0,cash:0,caisseN:0,cashReserve:0,
    bankedRemittances:0,banked:0,remittancePrepared:0,remittanceDeposited:0,
    remittanceCredited:0,cost:0,expenses:0
  }))
  const priorLive=Array.from({length:12},(_,month)=>({month,ca:0,count:0}))
  const priorHistorical=Array(12).fill(0)
  for(const row of historical||[]){
    const idx=num(row.month)-1
    if(idx>=0&&idx<12) priorHistorical[idx]=num(row.ca_ttc)
  }

  const allSales=sales||[]
  const saleMap=new Map(allSales.map(s=>[s.id,s]))
  const paymentMap=new Map((payments||[]).map(p=>[p.id,p]))

  for(const sale of allSales){
    const d=new Date(sale.sold_at)
    const y=d.getFullYear(),m=d.getMonth()
    if(y===year){
      monthly[m].ca+=num(sale.total_ttc)
      monthly[m].caHt+=num(sale.total_ht)
    }else if(y===priorYear){
      priorLive[m].ca+=num(sale.total_ttc)
      priorLive[m].count+=1
    }
  }

  for(const payment of payments||[]){
    const sale=saleMap.get(payment.sale_id)
    if(!sale || (payment.status && payment.status!=='completed'))continue
    const d=new Date(sale.sold_at)
    if(d.getFullYear()!==year)continue
    const m=d.getMonth()
    if(payment.payment_method==='card')monthly[m].card+=num(payment.amount)
    if(payment.payment_method==='cheque')monthly[m].cheque+=num(payment.amount)
    if(payment.payment_method==='cash')monthly[m].cash+=num(payment.amount)
  }

  const batchMap=new Map((remittanceBatches||[]).map(b=>[b.id,b]))
  for(const item of remittanceItems||[]){
    const batch=batchMap.get(item.batch_id)
    const payment=paymentMap.get(item.payment_id)
    const sale=payment ? saleMap.get(payment.sale_id) : null
    if(!batch || !payment || !sale || batch.status==='cancelled')continue
    const d=new Date(sale.sold_at)
    if(d.getFullYear()!==year)continue
    const m=d.getMonth()
    const amount=num(item.amount)

    if(batch.remittance_kind==='cash_reserve' && payment.payment_method==='cash'){
      monthly[m].cashReserve+=amount
    }
    if(/^CAISSE\s+N\d{4}/i.test(String(batch.remittance_number||'').trim())){
      monthly[m].caisseN+=amount
    }

    if(batch.remittance_kind==='bank_deposit'){
      if(batch.status==='prepared') monthly[m].remittancePrepared+=amount
      if(batch.status==='deposited') monthly[m].remittanceDeposited+=amount
      if(batch.status==='credited'){
        monthly[m].remittanceCredited+=amount
        monthly[m].bankedRemittances+=amount
      }
    }
  }

  for(const line of lines||[]){
    const sale=saleMap.get(line.sale_id)
    if(!sale)continue
    const d=new Date(sale.sold_at)
    if(d.getFullYear()!==year)continue
    monthly[d.getMonth()].cost+=num(line.line_cost_ht)
  }

  for(const e of expenses||[]){
    const d=new Date(e.expense_date+'T00:00:00')
    if(d.getFullYear()===year) monthly[d.getMonth()].expenses+=num(e.amount)
  }

  const sr=num(settings?.micro_social_rate)/100
  const tr=num(settings?.income_tax_rate)/100
  for(const m of monthly){
    m.nonCash=m.card+m.cheque
    m.managementCa=Math.max(0,m.ca-m.caisseN)
    m.banked=m.card+m.bankedRemittances
    m.bankedRate=m.ca?m.banked/m.ca*100:0
    m.gross=m.caHt-m.cost
    m.grossRate=m.caHt?m.gross/m.caHt*100:0
    m.social=m.ca*sr
    m.tax=m.ca*tr
    m.net=m.gross-m.expenses-m.social-m.tax
    m.netRate=m.ca?m.net/m.ca*100:0
  }

  const prior=priorLive.map((live,i)=>({
    month:i,
    ca:live.count>0 ? live.ca : priorHistorical[i]
  }))

  return {monthly,prior,settings,year,priorYear}
}

async function enhancePilotage(){
  if(pilotageRunning)return
  pilotageRunning=true
  try{
    const selection=pilotageSelection()
    const {monthly,prior,settings,year,priorYear}=await fetchPilotageData(selection.year)
    renderConsolidatedKpis(monthly,prior,selection,year,priorYear)
    renderStackedChart(monthly,prior,year,priorYear)
    renderDualThresholds(monthly,settings,selection.month)
    renderManagement(monthly,prior,selection.month)
  }catch(e){
    console.error('Pilotage UX2',e)
  }finally{
    pilotageRunning=false
  }
}

function renderConsolidatedKpis(monthly,prior,selection,year,priorYear){
  const box=document.querySelector('#pilotageKpis')
  if(!box)return
  const m=monthly[selection.month] || monthly[0]
  const p=prior[selection.month]?.ca || 0
  const delta=m.ca-p
  const realization=p?m.ca/p*100:0
  const monthLabel=monthNames[selection.month]

  box.innerHTML=`
    <div class="card kpi">
      <div class="muted">CA total encaissé — ${monthLabel} ${year}</div>
      <div class="kpi-value">${eur(m.ca)}</div>
    </div>
    <div class="card kpi">
      <div class="muted">Caisse banc</div>
      <div class="kpi-value">${eur(m.caisseN)}</div>
    </div>
    <div class="card kpi">
      <div class="muted">CA après Caisse banc</div>
      <div class="kpi-value">${eur(m.managementCa)}</div>
    </div>
    <div class="card kpi">
      <div class="muted">CA bancarisé</div>
      <div class="kpi-value">${eur(m.banked)}</div>
      <div class="small">${m.bankedRate.toFixed(1)} % du CA du mois</div>
    </div>
    <div class="card kpi">
      <div class="muted">Espèces conservées</div>
      <div class="kpi-value">${eur(m.cashReserve)}</div>
    </div>
    <div class="card kpi remittance-status-kpi">
      <div class="muted">Remises bancaires du mois</div>
      <div class="kpi-mini-row"><span>Préparées</span><b>${eur(m.remittancePrepared)}</b></div>
      <div class="kpi-mini-row"><span>Déposées</span><b>${eur(m.remittanceDeposited)}</b></div>
      <div class="kpi-mini-row"><span>Créditées</span><b>${eur(m.remittanceCredited)}</b></div>
    </div>
    <div class="card kpi comparison-kpi">
      <div class="muted">Comparaison ${priorYear}</div>
      <div class="kpi-value">${eur(p)}</div>
      <div class="small">Écart : <b class="${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${eur(delta)}</b></div>
      <div class="small">Taux de réalisation : <b>${p?realization.toFixed(1)+' %':'—'}</b></div>
    </div>
  `
}

function renderStackedChart(monthly,prior,year,priorYear){
  const box=document.querySelector('#pilotageChart')
  if(!box)return
  const card=box.closest('.card')
  const title=card?.querySelector('h2')
  const note=card?.querySelector('.small')
  if(title)title.textContent=`CA mensuel ${year} vs ${priorYear}`
  if(note)note.textContent=`${year} détaillé par mode de paiement · ${priorYear} en gris sans ventilation · étiquette = CA total mensuel.`

  const W=1160,H=380,pad={l:30,r:25,t:58,b:50},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b
  const max=Math.max(1,...monthly.map(m=>m.ca),...prior.map(m=>m.ca))
  const slot=iw/12,currentBw=slot*.31,priorBw=slot*.25,gap=4
  const x=i=>pad.l+slot*i+slot/2
  const currentX=i=>x(i)-currentBw/2-gap/2
  const priorX=i=>x(i)+currentBw/2+gap/2
  const y=v=>pad.t+ih-(v/max)*ih
  const yp=v=>pad.t+ih-((Math.max(-20,Math.min(100,v))+20)/120)*ih

  const bars=monthly.map((m,i)=>{
    const cashBank=Math.min(num(m.cash),Math.max(0,num(m.caisseN)))
    const cashOutside=Math.max(0,num(m.cash)-cashBank)
    const currentTotal=num(m.card)+num(m.cheque)+cashOutside+cashBank
    const priorTotal=num(prior[i]?.ca)
    let acc=0

    const seg=(value,cls)=>{
      if(!value)return ''
      const y0=y(acc)
      acc+=value
      const yt=y(acc),h=y0-yt
      const pct=currentTotal?value/currentTotal*100:0
      return `<rect x="${currentX(i)-currentBw/2}" y="${yt}" width="${currentBw}" height="${h}" class="ux2-svg-${cls}"></rect>${h>18?`<text x="${currentX(i)}" y="${yt+h/2+4}" text-anchor="middle" class="ux2-pct">${pct.toFixed(0)}%</text>`:''}`
    }

    const currentLabel=currentTotal
      ? `<text x="${currentX(i)}" y="${Math.max(18,y(currentTotal)-8)}" text-anchor="middle" class="chart-ca-label">${Math.round(currentTotal).toLocaleString('fr-FR')} €</text>`
      : ''
    const priorLabel=priorTotal
      ? `<text x="${priorX(i)}" y="${Math.max(18,y(priorTotal)-8)}" text-anchor="middle" class="chart-prior-label">${Math.round(priorTotal).toLocaleString('fr-FR')} €</text>`
      : ''
    const priorBar=priorTotal
      ? `<rect x="${priorX(i)-priorBw/2}" y="${y(priorTotal)}" width="${priorBw}" height="${pad.t+ih-y(priorTotal)}" class="ux2-svg-prior"></rect>`
      : ''

    return `${seg(m.card,'card')}${seg(m.cheque,'cheque')}${seg(cashOutside,'cash-outside')}${seg(cashBank,'cash-bank')}
      ${priorBar}${currentLabel}${priorLabel}
      <text x="${x(i)}" y="${H-14}" text-anchor="middle" class="chart-month">${monthNames[i]}</text>`
  }).join('')

  const gross=monthly.map(m=>`${currentX(m.month)},${yp(m.grossRate)}`).join(' ')
  const net=monthly.map(m=>`${currentX(m.month)},${yp(m.netRate)}`).join(' ')
  const gl=monthly.map(m=>m.ca?`<text x="${currentX(m.month)}" y="${yp(m.grossRate)-8}" text-anchor="middle" class="chart-gross-label">${m.grossRate.toFixed(0)}%</text>`:'').join('')
  const nl=monthly.map(m=>m.ca?`<text x="${currentX(m.month)}" y="${yp(m.netRate)+17}" text-anchor="middle" class="chart-net-label">${m.netRate.toFixed(0)}%</text>`:'').join('')

  box.innerHTML=`<div class="ux2-legend">
    <span><i class="ux2-swatch card"></i>CB ${year}</span>
    <span><i class="ux2-swatch cheque"></i>Chèques ${year}</span>
    <span><i class="ux2-swatch cash-outside"></i>Espèces hors Caisse banc</span>
    <span><i class="ux2-swatch cash-bank"></i>Caisse banc</span>
    <span><i class="ux2-swatch prior"></i>CA ${priorYear}</span>
    <span>Marge brute %</span><span>Marge nette %</span>
  </div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${bars}
    <polyline points="${gross}" class="chart-line gross"></polyline>
    <polyline points="${net}" class="chart-line net"></polyline>
    ${gl}${nl}
  </svg>`
}

function gauge(label,value,threshold){
  const pct=threshold?Math.min(100,value/threshold*100):0
  return `<div class="gauge-block"><div class="row space"><b>${esc(label)}</b><span>${eur0(value)} / ${eur0(threshold)}</span></div><div class="gauge"><span style="width:${pct}%"></span></div><div class="small">${pct.toFixed(1)} % du seuil</div></div>`
}

function renderDualThresholds(monthly,settings,selectedMonth){
  const box=document.querySelector('#thresholdsBox')
  if(!box)return
  const current=monthly.slice(0,selectedMonth+1)
  const total=current.reduce((sum,m)=>sum+m.ca,0)
  const caisseN=current.reduce((sum,m)=>sum+m.caisseN,0)
  const managementCa=Math.max(0,total-caisseN)
  const thresholds=[
    ['TVA — seuil de base',num(settings?.vat_base_threshold)],
    ['TVA — seuil majoré',num(settings?.vat_major_threshold)],
    ['Régime micro',num(settings?.micro_threshold)]
  ]
  const title=box.closest('.card')?.querySelector('h2')
  if(title)title.textContent='Seuils & suivi des encaissements'
  box.innerHTML=`<div class="ux2-thresholds">
    <div>
      <h3>CA total encaissé</h3>
      ${thresholds.map(([label,threshold])=>gauge(label,total,threshold)).join('')}
    </div>
    <div>
      <h3>CA encaissé moins Caisse banc</h3>
      ${thresholds.map(([label,threshold])=>gauge(label,managementCa,threshold)).join('')}
      <div class="small">Caisse banc : <b>${eur(caisseN)}</b></div>
    </div>
  </div>`
}

function renderManagement(monthly,prior,selectedMonth){
  const body=document.querySelector('#managementRows')
  if(!body)return
  const current=monthly.slice(0,selectedMonth+1)
  const head=body.closest('table')?.querySelector('thead')
  if(head)head.innerHTML='<tr><th>Mois</th><th>CA total</th><th>CA N-1</th><th>Réalisation</th><th>Écart N/N-1</th><th>Caisse banc</th><th>CA après Caisse banc</th><th>CA bancarisé</th><th>Espèces conservées</th><th>Remises préparées</th><th>Remises déposées</th><th>Remises créditées</th><th>Achats consommés</th><th>Marge brute</th><th>Taux marge brute</th><th>Autres dépenses</th><th>Cotisations estimées</th><th>Versement libératoire estimé</th><th>Solde gestion estimé</th><th>Marge nette</th></tr>'

  const total=current.reduce((a,m)=>({
    ca:a.ca+m.ca,caisseN:a.caisseN+m.caisseN,managementCa:a.managementCa+m.managementCa,
    banked:a.banked+m.banked,cashReserve:a.cashReserve+m.cashReserve,
    remittancePrepared:a.remittancePrepared+m.remittancePrepared,
    remittanceDeposited:a.remittanceDeposited+m.remittanceDeposited,
    remittanceCredited:a.remittanceCredited+m.remittanceCredited,
    cost:a.cost+m.cost,caHt:a.caHt+m.caHt,gross:a.gross+m.gross,
    expenses:a.expenses+m.expenses,social:a.social+m.social,tax:a.tax+m.tax,net:a.net+m.net
  }),{ca:0,caisseN:0,managementCa:0,banked:0,cashReserve:0,remittancePrepared:0,remittanceDeposited:0,remittanceCredited:0,cost:0,caHt:0,gross:0,expenses:0,social:0,tax:0,net:0})
  const priorTotal=prior.slice(0,selectedMonth+1).reduce((sum,m)=>sum+num(m.ca),0)
  const totalDelta=total.ca-priorTotal
  const grossRate=total.caHt?total.gross/total.caHt*100:0
  const netRate=total.ca?total.net/total.ca*100:0

  body.innerHTML=current.map(m=>{
    const p=num(prior[m.month]?.ca)
    const delta=m.ca-p
    const realization=p?m.ca/p*100:0
    return `<tr>
      <td>${monthNames[m.month]}</td><td>${eur(m.ca)}</td><td>${eur(p)}</td><td>${p?realization.toFixed(1)+' %':'—'}</td><td class="${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${eur(delta)}</td>
      <td>${eur(m.caisseN)}</td><td>${eur(m.managementCa)}</td><td>${eur(m.banked)}</td><td>${eur(m.cashReserve)}</td>
      <td>${eur(m.remittancePrepared)}</td><td>${eur(m.remittanceDeposited)}</td><td>${eur(m.remittanceCredited)}</td>
      <td>${eur(m.cost)}</td><td>${eur(m.gross)}</td><td>${m.grossRate.toFixed(1)} %</td><td>${eur(m.expenses)}</td>
      <td>${eur(m.social)}</td><td>${eur(m.tax)}</td><td><b>${eur(m.net)}</b></td><td>${m.netRate.toFixed(1)} %</td>
    </tr>`
  }).join('')+`<tr class="total-row">
    <td><b>Cumul</b></td><td><b>${eur(total.ca)}</b></td><td><b>${eur(priorTotal)}</b></td><td><b>${priorTotal?(total.ca/priorTotal*100).toFixed(1)+' %':'—'}</b></td><td><b class="${totalDelta>=0?'positive':'negative'}">${totalDelta>=0?'+':''}${eur(totalDelta)}</b></td>
    <td><b>${eur(total.caisseN)}</b></td><td><b>${eur(total.managementCa)}</b></td><td><b>${eur(total.banked)}</b></td><td><b>${eur(total.cashReserve)}</b></td>
    <td><b>${eur(total.remittancePrepared)}</b></td><td><b>${eur(total.remittanceDeposited)}</b></td><td><b>${eur(total.remittanceCredited)}</b></td>
    <td><b>${eur(total.cost)}</b></td><td><b>${eur(total.gross)}</b></td><td><b>${grossRate.toFixed(1)} %</b></td><td><b>${eur(total.expenses)}</b></td>
    <td><b>${eur(total.social)}</b></td><td><b>${eur(total.tax)}</b></td><td><b>${eur(total.net)}</b></td><td><b>${netRate.toFixed(1)} %</b></td>
  </tr>`
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
  const pilotageMonth=document.querySelector('#pilotageMonth')
  if(pilotageMonth&&!pilotageMonth.dataset.ux2Bound){
    pilotageMonth.dataset.ux2Bound='1'
    if(!pilotageMonth.value){
      const now=new Date()
      pilotageMonth.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    }
    pilotageMonth.addEventListener('change',()=>setTimeout(enhancePilotage,80))
  }
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
