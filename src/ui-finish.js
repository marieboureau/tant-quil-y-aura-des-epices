
import './ui-finish.css'

let timer = null

function friendlyStatus(text){
  const value=String(text||'').trim().toLowerCase()
  const map={
    completed:'Validée',
    cancelled:'Annulée',
    canceled:'Annulée',
    pending:'En attente',
    active:'Actif',
    inactive:'Inactif'
  }
  return map[value] || null
}

function installBrand(){
  const aside=document.querySelector('aside')
  if(!aside || aside.querySelector('.ui-brand')) return
  const brand=document.createElement('div')
  brand.className='ui-brand'
  brand.innerHTML='<img src="/logo.png" alt="Tant qu’il y aura des Épices">'
  const nav=aside.querySelector('nav')
  if(nav) aside.insertBefore(brand,nav)
  else aside.prepend(brand)
}

function translateStatuses(){
  document.querySelectorAll('.status').forEach(el=>{
    const translated=friendlyStatus(el.textContent)
    if(!translated) return
    el.textContent=translated
    el.dataset.friendlyStatus='1'
    if(translated==='Annulée') {
      el.classList.remove('ok')
      el.classList.add('cancelled')
    }
  })
}

function improveLabels(){
  const history=document.querySelector('#history')
  if(history){
    const h=[...history.querySelectorAll('h2')].find(x=>x.textContent.trim()==='Lignes de vente')
    if(h && !h.dataset.uiHint){
      h.dataset.uiHint='1'
      h.insertAdjacentHTML('afterend','<div class="small" style="margin:-7px 0 9px">Les lignes d’une vente annulée restent visibles pour conserver la traçabilité.</div>')
    }
  }
}

function apply(){
  installBrand()
  translateStatuses()
  improveLabels()
}

function schedule(){
  clearTimeout(timer)
  timer=setTimeout(apply,70)
}

new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true})
window.addEventListener('load',()=>setTimeout(apply,250))
