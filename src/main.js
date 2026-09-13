import './styles.css'
import { supabase } from './supabase'

const app = document.querySelector('#app')

let session = null
let products = []
let customers = []
let categories = []

async function init() {
  const { data } = await supabase.auth.getSession()
  session = data.session
  render()

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession
    render()
  })
}

function render() {
  if (!session) return renderLogin()
  renderShell()
  loadInitialData()
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Tant qu’il y aura des Épices</h1>
        <p class="muted">Connexion à l’application de gestion.</p>
        <label class="small">Email</label>
        <input id="email" class="field" type="email" placeholder="email@exemple.fr">
        <label class="small" style="display:block;margin-top:10px">Mot de passe</label>
        <input id="password" class="field" type="password">
        <button id="loginBtn" class="primary" style="width:100%;margin-top:14px">Se connecter</button>
        <div id="loginMsg" class="small" style="margin-top:10px"></div>
      </div>
    </div>
  `
  document.querySelector('#loginBtn').onclick = login
}

async function login() {
  const email = document.querySelector('#email').value.trim()
  const password = document.querySelector('#password').value
  const msg = document.querySelector('#loginMsg')
  msg.textContent = 'Connexion…'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  msg.textContent = error ? error.message : ''
}

function renderShell() {
  app.innerHTML = `
    <div class="app">
      <aside>
        <div class="brand">Tant qu’il y aura des Épices</div>
        <div class="sub">V1 réelle — Sprint 1</div>
        <nav>
          <button class="active" data-tab="dashboard">Accueil</button>
          <button data-tab="products">Produits</button>
          <button data-tab="clients">Clients</button>
        </nav>
      </aside>
      <main>
        <section id="dashboard" class="section active">
          <div class="top">
            <div><h1>Accueil</h1><div class="muted">Connexion Supabase active.</div></div>
            <button id="logoutBtn" class="secondary">Déconnexion</button>
          </div>
          <div id="status" class="notice">Chargement des données…</div>
          <div class="grid" style="margin-top:16px">
            <div class="card"><div class="muted">Produits</div><h1 id="productCount">—</h1></div>
            <div class="card"><div class="muted">Clients</div><h1 id="customerCount">—</h1></div>
          </div>
        </section>

        <section id="products" class="section">
          <div class="top">
            <div><h1>Produits</h1><div class="muted">Données réelles lues depuis Supabase.</div></div>
            <button id="addProductBtn" class="primary">+ Produit</button>
          </div>
          <div class="card">
            <input id="productSearch" class="field" placeholder="Rechercher un produit…" style="margin-bottom:10px">
            <div style="overflow:auto">
              <table>
                <thead><tr><th>Produit</th><th>Catégorie</th><th>Stock</th><th>Achat HT</th><th>Vente HT</th><th>Cadeau</th></tr></thead>
                <tbody id="productRows"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="clients" class="section">
          <div class="top">
            <div><h1>Clients</h1><div class="muted">Données réelles lues depuis Supabase.</div></div>
            <button id="addClientBtn" class="primary">+ Client</button>
          </div>
          <div class="card">
            <input id="clientSearch" class="field" placeholder="Rechercher un client…" style="margin-bottom:10px">
            <div style="overflow:auto">
              <table>
                <thead><tr><th>Client</th><th>Téléphone</th><th>Email</th></tr></thead>
                <tbody id="clientRows"></tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>

    <dialog id="productDialog">
      <form method="dialog" class="card" style="min-width:min(520px,90vw)">
        <h2>Nouveau produit</h2>
        <label class="small">Nom</label><input id="pName" class="field">
        <label class="small">Catégorie</label><select id="pCategory" class="field"></select>
        <div class="grid" style="margin-top:10px">
          <div><label class="small">Stock initial (g)</label><input id="pStock" type="number" class="field" value="0"></div>
          <div><label class="small">Seuil d'alerte (g)</label><input id="pThreshold" type="number" class="field" value="500"></div>
        </div>
        <div class="grid" style="margin-top:10px">
          <div><label class="small">Achat HT /100g</label><input id="pBuy" type="number" step="0.01" class="field" value="0"></div>
          <div><label class="small">Vente HT /100g</label><input id="pSell" type="number" step="0.01" class="field" value="0"></div>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button value="cancel" class="secondary">Annuler</button>
          <button id="saveProductBtn" type="button" class="primary">Enregistrer</button>
        </div>
        <div id="productMsg" class="small"></div>
      </form>
    </dialog>

    <dialog id="clientDialog">
      <form method="dialog" class="card" style="min-width:min(520px,90vw)">
        <h2>Nouveau client</h2>
        <label class="small">Nom affiché</label><input id="cName" class="field">
        <label class="small">Téléphone</label><input id="cPhone" class="field">
        <label class="small">Email</label><input id="cEmail" type="email" class="field">
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button value="cancel" class="secondary">Annuler</button>
          <button id="saveClientBtn" type="button" class="primary">Enregistrer</button>
        </div>
        <div id="clientMsg" class="small"></div>
      </form>
    </dialog>
  `

  document.querySelector('#logoutBtn').onclick = () => supabase.auth.signOut()
  document.querySelectorAll('nav button').forEach(btn => btn.onclick = () => switchTab(btn))
  document.querySelector('#productSearch').oninput = renderProducts
  document.querySelector('#clientSearch').oninput = renderCustomers
  document.querySelector('#addProductBtn').onclick = openProductDialog
  document.querySelector('#addClientBtn').onclick = () => document.querySelector('#clientDialog').showModal()
  document.querySelector('#saveProductBtn').onclick = saveProduct
  document.querySelector('#saveClientBtn').onclick = saveCustomer
}

function switchTab(btn) {
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
  document.querySelector('#' + btn.dataset.tab).classList.add('active')
}

async function loadInitialData() {
  const status = document.querySelector('#status')
  const [catsRes, productsRes, customersRes] = await Promise.all([
    supabase.from('product_categories').select('id,name').eq('active', true).order('sort_order'),
    supabase.from('products').select('id,name,stock_quantity,purchase_price_ht,sale_price_ht,loyalty_eligible,category_id').eq('active', true).order('name'),
    supabase.from('customers').select('id,display_name,phone,email').eq('active', true).order('display_name')
  ])

  const errors = [catsRes.error, productsRes.error, customersRes.error].filter(Boolean)
  if (errors.length) {
    status.textContent = 'Erreur Supabase : ' + errors.map(e => e.message).join(' | ')
    return
  }

  categories = catsRes.data
  products = productsRes.data
  customers = customersRes.data

  status.textContent = `Connecté à Supabase — ${products.length} produits et ${customers.length} clients chargés.`
  document.querySelector('#productCount').textContent = products.length
  document.querySelector('#customerCount').textContent = customers.length
  renderProducts()
  renderCustomers()
}

function renderProducts() {
  const input = document.querySelector('#productSearch')
  if (!input) return
  const q = input.value.toLowerCase().trim()
  const rows = products.filter(p => p.name.toLowerCase().includes(q))
  document.querySelector('#productRows').innerHTML = rows.map(p => {
    const cat = categories.find(c => c.id === p.category_id)?.name ?? '—'
    return `<tr>
      <td><b>${escapeHtml(p.name)}</b></td>
      <td>${escapeHtml(cat)}</td>
      <td>${Number(p.stock_quantity).toLocaleString('fr-FR')} g</td>
      <td>${Number(p.purchase_price_ht).toFixed(2)} €</td>
      <td>${Number(p.sale_price_ht).toFixed(2)} €</td>
      <td>${p.loyalty_eligible ? 'Oui' : 'Non'}</td>
    </tr>`
  }).join('')
}

function renderCustomers() {
  const input = document.querySelector('#clientSearch')
  if (!input) return
  const q = input.value.toLowerCase().trim()
  const rows = customers.filter(c => c.display_name.toLowerCase().includes(q))
  document.querySelector('#clientRows').innerHTML = rows.map(c => `<tr>
    <td><b>${escapeHtml(c.display_name)}</b></td>
    <td>${escapeHtml(c.phone || '')}</td>
    <td>${escapeHtml(c.email || '')}</td>
  </tr>`).join('')
}

function openProductDialog() {
  document.querySelector('#pCategory').innerHTML = categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  document.querySelector('#productDialog').showModal()
}

async function saveProduct() {
  const msg = document.querySelector('#productMsg')
  const payload = {
    name: document.querySelector('#pName').value.trim(),
    category_id: document.querySelector('#pCategory').value || null,
    stock_unit: 'g',
    purchase_unit: 'sachet',
    purchase_unit_quantity: 500,
    purchase_unit_stock_equivalent: 500,
    stock_quantity: Number(document.querySelector('#pStock').value || 0),
    stock_alert_threshold: Number(document.querySelector('#pThreshold').value || 0),
    purchase_price_ht: Number(document.querySelector('#pBuy').value || 0),
    purchase_price_basis: 100,
    sale_price_ht: Number(document.querySelector('#pSell').value || 0),
    sale_price_basis: 100
  }
  if (!payload.name) return msg.textContent = 'Nom obligatoire.'
  const { data: profile, error: profileError } = await supabase.from('user_profiles').select('organization_id').single()
  if (profileError) return msg.textContent = profileError.message
  payload.organization_id = profile.organization_id

  const { error } = await supabase.from('products').insert(payload)
  if (error) return msg.textContent = error.message
  document.querySelector('#productDialog').close()
  await loadInitialData()
}

async function saveCustomer() {
  const msg = document.querySelector('#clientMsg')
  const name = document.querySelector('#cName').value.trim()
  if (!name) return msg.textContent = 'Nom obligatoire.'
  const { data: profile, error: profileError } = await supabase.from('user_profiles').select('organization_id').single()
  if (profileError) return msg.textContent = profileError.message

  const { error } = await supabase.from('customers').insert({
    organization_id: profile.organization_id,
    display_name: name,
    phone: document.querySelector('#cPhone').value.trim() || null,
    email: document.querySelector('#cEmail').value.trim() || null
  })
  if (error) return msg.textContent = error.message
  document.querySelector('#clientDialog').close()
  await loadInitialData()
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[ch])
}

init()
