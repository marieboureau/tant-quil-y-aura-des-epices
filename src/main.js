import './styles.css'
import { supabase } from './supabase'

const app = document.querySelector('#app')

let session = null
let organizationId = null
let products = []
let customers = []
let categories = []
let loyaltyEvents = []
let settings = null
let sales = []
let saleLines = []
let payments = []
let cart = []
let selectedCustomer = null
let paymentMode = 'card'
let pendingImport = null

const eur = value => Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const num = value => Number(value || 0)
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
})[char])

const fmtDateTime = value => value ? new Date(value).toLocaleString('fr-FR') : '—'
const fmtDate = value => value ? new Date(value).toLocaleDateString('fr-FR') : '—'
const boolLabel = value => value ? 'Oui' : 'Non'

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
  loadData()
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Tant qu’il y aura des Épices</h1>
        <p class="muted">Connexion à l’application de gestion.</p>
        <label class="small">Email</label>
        <input id="email" class="field" type="email">
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
  const msg = document.querySelector('#loginMsg')
  msg.textContent = 'Connexion…'
  const { error } = await supabase.auth.signInWithPassword({
    email: document.querySelector('#email').value.trim(),
    password: document.querySelector('#password').value
  })
  msg.textContent = error ? error.message : ''
}

function renderShell() {
  app.innerHTML = `
    <div class="app">
      <aside>
        <div class="brand">Tant qu’il y aura des Épices</div>
        <div class="sub">V1 réelle — Sprint 2.1</div>
        <nav>
          <button class="active" data-tab="sell">Vendre</button>
          <button data-tab="products">Produits</button>
          <button data-tab="clients">Clients</button>
          <button data-tab="history">Historique</button>
        </nav>
      </aside>

      <main>
        <section id="sell" class="section active">
          <div class="top">
            <div>
              <h1>Vendre</h1>
              <div class="muted">Panier, règlement, stock et fidélité.</div>
            </div>
            <button id="logoutBtn" class="secondary">Déconnexion</button>
          </div>

          <div id="globalMsg" class="notice" style="display:none;margin-bottom:12px"></div>

          <div class="grid sell-layout">
            <div class="card">
              <input id="sellSearch" class="field" placeholder="Rechercher un produit…">
              <div id="sellProducts" class="product-grid"></div>
            </div>

            <div class="card">
              <h2>Ticket</h2>
              <div id="cart"></div>
              <div id="cartEmpty" class="muted">Touchez un produit pour l’ajouter.</div>

              <label class="small">Client fidélité</label>
              <input id="customerSearch" class="field" placeholder="Rechercher un client…">
              <div id="customerHints"></div>
              <div id="selectedCustomer" class="notice" style="display:none;margin-top:8px"></div>

              <div class="row space" style="margin-top:14px">
                <b>Total</b>
                <span id="cartTotal" class="total">0,00 €</span>
              </div>

              <label class="small">Mode de règlement</label>
              <div class="payments">
                <button class="pay active" data-pay="card">CB</button>
                <button class="pay" data-pay="cash">Espèces</button>
                <button class="pay" data-pay="cheque">Chèque</button>
              </div>

              <button id="mixedBtn" class="secondary" style="width:100%;margin-top:8px">Paiement mixte</button>
              <div id="mixedBox" style="display:none">
                <div class="grid" style="margin-top:8px">
                  <input id="mixCard" class="field" type="number" step="0.01" placeholder="CB €">
                  <input id="mixCash" class="field" type="number" step="0.01" placeholder="Espèces €">
                </div>
              </div>

              <button id="validateSale" class="primary" style="width:100%;margin-top:12px">Valider la vente</button>
              <div id="saleMsg" class="small" style="margin-top:8px"></div>
            </div>
          </div>
        </section>

        <section id="products" class="section">
          <div class="top">
            <div>
              <h1>Produits</h1>
              <div class="muted">Catalogue complet, export et réimport contrôlé.</div>
            </div>
            <div class="actions">
              <button id="exportProductsBtn" class="secondary">Exporter CSV</button>
              <label class="secondary file-btn">Importer CSV<input id="importProductsInput" type="file" accept=".csv,text/csv"></label>
              <button id="addProductBtn" class="primary">+ Produit</button>
            </div>
          </div>

          <div class="card">
            <input id="productSearch" class="field" placeholder="Rechercher…" style="margin-bottom:10px">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Réf.</th><th>Produit</th><th>Catégorie</th><th>Stock</th>
                    <th>Achat HT</th><th>Vente HT</th><th>Cadeau</th><th>Statut</th>
                  </tr>
                </thead>
                <tbody id="productRows"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="clients" class="section">
          <div class="top">
            <div>
              <h1>Clients</h1>
              <div class="muted">Base clients et programme de fidélité.</div>
            </div>
            <div class="actions">
              <button id="exportClientsBtn" class="secondary">Exporter CSV</button>
              <label class="secondary file-btn">Importer CSV<input id="importClientsInput" type="file" accept=".csv,text/csv"></label>
              <button id="addClientBtn" class="primary">+ Client</button>
            </div>
          </div>

          <div class="card">
            <input id="clientSearch" class="field" placeholder="Rechercher…" style="margin-bottom:10px">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Réf.</th><th>Client</th><th>Passages</th><th>Progression</th>
                    <th>Cadeaux dispo</th><th>Dernier passage</th><th>Statut</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="clientRows"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="history" class="section">
          <div class="top">
            <div>
              <h1>Historique des ventes</h1>
              <div class="muted">Le numéro de vente relie tickets, lignes produits et paiements.</div>
            </div>
          </div>

          <div class="history-toolbar card">
            <div class="actions">
              <button id="exportSalesBtn" class="secondary">Export ventes</button>
              <button id="exportSaleLinesBtn" class="secondary">Export lignes</button>
              <button id="exportPaymentsBtn" class="secondary">Export paiements</button>
            </div>
            <div>
              <label class="small">Filtrer les paiements</label>
              <select id="paymentFilter" class="field compact">
                <option value="">Tous</option>
                <option value="card">CB</option>
                <option value="cash">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="transfer">Virement</option>
                <option value="other">Autre</option>
              </select>
            </div>
          </div>

          <div class="card" style="margin-top:12px">
            <h2>Ventes</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>N° vente</th><th>Date</th><th>Client</th><th>Total</th><th>Statut</th><th>Action</th></tr>
                </thead>
                <tbody id="salesRows"></tbody>
              </table>
            </div>
          </div>

          <div class="card" style="margin-top:12px">
            <h2>Lignes de vente</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>N° vente</th><th>Date</th><th>Produit</th><th>Quantité</th><th>Unité</th><th>Total HT</th><th>Total TTC</th></tr>
                </thead>
                <tbody id="saleLineRows"></tbody>
              </table>
            </div>
          </div>

          <div class="card" style="margin-top:12px">
            <h2>Paiements</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>N° vente</th><th>Date</th><th>Mode</th><th>Montant</th><th>Statut</th></tr>
                </thead>
                <tbody id="paymentRows"></tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>

    <dialog id="productDialog">
      <form method="dialog" class="card dialog-card">
        <h2>Nouveau produit</h2>
        <label class="small">Nom</label>
        <input id="pName" class="field">
        <label class="small">Catégorie</label>
        <select id="pCategory" class="field"></select>
        <div class="grid" style="margin-top:10px">
          <input id="pStock" type="number" class="field" placeholder="Stock initial">
          <input id="pThreshold" type="number" class="field" placeholder="Seuil d’alerte">
        </div>
        <div class="grid" style="margin-top:10px">
          <input id="pBuy" type="number" step="0.01" class="field" placeholder="Achat HT / base">
          <input id="pSell" type="number" step="0.01" class="field" placeholder="Vente HT / base">
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button value="cancel" class="secondary">Annuler</button>
          <button id="saveProductBtn" type="button" class="primary">Enregistrer</button>
        </div>
        <div id="productMsg" class="small"></div>
      </form>
    </dialog>

    <dialog id="clientDialog">
      <form method="dialog" class="card dialog-card">
        <h2>Nouveau client</h2>
        <input id="cName" class="field" placeholder="Nom">
        <input id="cPhone" class="field" placeholder="Téléphone" style="margin-top:8px">
        <input id="cEmail" class="field" type="email" placeholder="Email" style="margin-top:8px">
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button value="cancel" class="secondary">Annuler</button>
          <button id="saveClientBtn" type="button" class="primary">Enregistrer</button>
        </div>
        <div id="clientMsg" class="small"></div>
      </form>
    </dialog>

    <dialog id="rewardDialog">
      <div class="card dialog-card">
        <h2>Utiliser un cadeau fidélité</h2>
        <div id="rewardClientLabel" class="notice"></div>
        <label class="small" style="display:block;margin-top:10px">Produit offert</label>
        <select id="rewardProduct" class="field"></select>
        <label class="small" style="display:block;margin-top:10px">Quantité</label>
        <input id="rewardQty" type="number" class="field" min="1">
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button id="closeRewardBtn" type="button" class="secondary">Annuler</button>
          <button id="useRewardBtn" type="button" class="primary">Valider le cadeau</button>
        </div>
        <div id="rewardMsg" class="small"></div>
      </div>
    </dialog>

    <dialog id="cancelSaleDialog">
      <div class="card dialog-card">
        <h2>Annuler une vente</h2>
        <div id="cancelSaleLabel" class="notice"></div>
        <label class="small" style="display:block;margin-top:10px">Motif (facultatif)</label>
        <input id="cancelReason" class="field" placeholder="Ex. erreur de saisie">
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button id="closeCancelBtn" type="button" class="secondary">Retour</button>
          <button id="confirmCancelBtn" type="button" class="danger">Confirmer l’annulation</button>
        </div>
        <div id="cancelMsg" class="small"></div>
      </div>
    </dialog>

    <dialog id="importDialog">
      <div class="card import-dialog">
        <h2>Aperçu de l’import</h2>
        <div id="importSummary" class="notice"></div>
        <div id="importErrors" class="import-errors"></div>
        <div id="importPreview" class="table-wrap" style="margin-top:12px"></div>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button id="closeImportBtn" type="button" class="secondary">Annuler</button>
          <button id="applyImportBtn" type="button" class="primary">Importer</button>
        </div>
        <div id="importMsg" class="small"></div>
      </div>
    </dialog>
  `

  bindEvents()
}

function bindEvents() {
  document.querySelector('#logoutBtn').onclick = () => supabase.auth.signOut()
  document.querySelectorAll('nav button').forEach(btn => btn.onclick = () => switchTab(btn))

  document.querySelector('#sellSearch').oninput = renderSellProducts
  document.querySelector('#productSearch').oninput = renderProducts
  document.querySelector('#clientSearch').oninput = renderCustomers
  document.querySelector('#customerSearch').oninput = renderCustomerHints
  document.querySelector('#paymentFilter').onchange = renderPayments

  document.querySelector('#addProductBtn').onclick = openProductDialog
  document.querySelector('#addClientBtn').onclick = () => document.querySelector('#clientDialog').showModal()
  document.querySelector('#saveProductBtn').onclick = saveProduct
  document.querySelector('#saveClientBtn').onclick = saveCustomer
  document.querySelector('#validateSale').onclick = completeSale

  document.querySelector('#mixedBtn').onclick = () => {
    const box = document.querySelector('#mixedBox')
    box.style.display = box.style.display === 'none' ? 'block' : 'none'
  }

  document.querySelectorAll('.pay').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.pay').forEach(x => x.classList.remove('active'))
    btn.classList.add('active')
    paymentMode = btn.dataset.pay
    document.querySelector('#mixedBox').style.display = 'none'
  })

  document.querySelector('#exportProductsBtn').onclick = exportProducts
  document.querySelector('#exportClientsBtn').onclick = exportClients
  document.querySelector('#exportSalesBtn').onclick = exportSales
  document.querySelector('#exportSaleLinesBtn').onclick = exportSaleLines
  document.querySelector('#exportPaymentsBtn').onclick = exportPayments

  document.querySelector('#importProductsInput').onchange = event => prepareImport('products', event.target.files?.[0])
  document.querySelector('#importClientsInput').onchange = event => prepareImport('clients', event.target.files?.[0])

  document.querySelector('#closeRewardBtn').onclick = () => document.querySelector('#rewardDialog').close()
  document.querySelector('#useRewardBtn').onclick = useReward
  document.querySelector('#rewardProduct').onchange = syncRewardQuantity

  document.querySelector('#closeCancelBtn').onclick = () => document.querySelector('#cancelSaleDialog').close()
  document.querySelector('#confirmCancelBtn').onclick = confirmCancelSale

  document.querySelector('#closeImportBtn').onclick = closeImport
  document.querySelector('#applyImportBtn').onclick = applyImport
}

function switchTab(btn) {
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'))
  btn.classList.add('active')
  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'))
  document.querySelector('#' + btn.dataset.tab).classList.add('active')
}

async function loadData() {
  const profileRes = await supabase.from('user_profiles').select('organization_id').single()
  if (profileRes.error) return showGlobalError(profileRes.error.message)
  organizationId = profileRes.data.organization_id

  const [
    categoriesRes, productsRes, customersRes, settingsRes,
    loyaltyRes, salesRes, linesRes, paymentsRes
  ] = await Promise.all([
    supabase.from('product_categories').select('id,name,active,sort_order').order('sort_order'),
    supabase.from('products').select('*').order('name'),
    supabase.from('customers').select('*').order('display_name'),
    supabase.from('settings').select('*').single(),
    supabase.from('loyalty_events').select('*').order('created_at', { ascending: false }),
    supabase.from('sales').select('*').order('sold_at', { ascending: false }).limit(500),
    supabase.from('sale_lines').select('*').limit(5000),
    supabase.from('payments').select('*').order('paid_at', { ascending: false }).limit(5000)
  ])

  const error = [
    categoriesRes.error, productsRes.error, customersRes.error, settingsRes.error,
    loyaltyRes.error, salesRes.error, linesRes.error, paymentsRes.error
  ].find(Boolean)

  if (error) return showGlobalError(error.message)

  categories = categoriesRes.data || []
  products = productsRes.data || []
  customers = customersRes.data || []
  settings = settingsRes.data
  loyaltyEvents = loyaltyRes.data || []
  sales = salesRes.data || []
  saleLines = linesRes.data || []
  payments = paymentsRes.data || []

  renderAll()
}

function renderAll() {
  renderSellProducts()
  renderCart()
  renderProducts()
  renderCustomers()
  renderSales()
  renderSaleLines()
  renderPayments()
}

function showGlobalError(message) {
  const box = document.querySelector('#globalMsg')
  if (!box) return
  box.style.display = 'block'
  box.textContent = 'Erreur Supabase : ' + message
}

function activeProducts() {
  return products.filter(p => p.active)
}

function renderSellProducts() {
  const input = document.querySelector('#sellSearch')
  const container = document.querySelector('#sellProducts')
  if (!input || !container) return

  const query = input.value.toLowerCase().trim()
  container.innerHTML = activeProducts()
    .filter(p => p.name.toLowerCase().includes(query) || String(p.sku || '').toLowerCase().includes(query))
    .map(p => `
      <button class="product-card" data-id="${p.id}">
        <b>${esc(p.name)}</b>
        <span>${eur(p.sale_price_ht)} / ${num(p.sale_price_basis)} ${esc(p.stock_unit)}</span>
        <small class="${num(p.stock_quantity) <= num(p.stock_alert_threshold) ? 'low' : ''}">
          ${num(p.stock_quantity).toLocaleString('fr-FR')} ${esc(p.stock_unit)}
        </small>
      </button>
    `).join('')

  document.querySelectorAll('.product-card').forEach(btn => btn.onclick = () => addToCart(btn.dataset.id))
}

function addToCart(id) {
  const product = products.find(p => p.id === id)
  if (!product) return
  const line = cart.find(item => item.id === id)
  const defaultQty = product.stock_unit === 'g' ? 100 : 1
  if (line) line.qty += defaultQty
  else cart.push({ id, qty: defaultQty })
  renderCart()
}

function renderCart() {
  const empty = document.querySelector('#cartEmpty')
  const container = document.querySelector('#cart')
  const totalEl = document.querySelector('#cartTotal')
  if (!empty || !container || !totalEl) return

  empty.style.display = cart.length ? 'none' : 'block'

  container.innerHTML = cart.map((item, index) => {
    const product = products.find(p => p.id === item.id)
    if (!product) return ''
    const step = product.stock_unit === 'g' ? 50 : 1
    return `
      <div class="cartline">
        <div class="row space">
          <b>${esc(product.name)}</b>
          <button class="danger remove" data-i="${index}">×</button>
        </div>
        <div class="row space">
          <div class="qty">
            <button class="secondary minus" data-i="${index}">−${step}</button>
            <input class="field qtyInput" data-i="${index}" type="number" min="1" value="${item.qty}">
            <button class="secondary plus" data-i="${index}">+${step}</button>
            <span>${esc(product.stock_unit)}</span>
          </div>
          <b>${eur(product.sale_price_ht * item.qty / (product.sale_price_basis || 100))}</b>
        </div>
      </div>
    `
  }).join('')

  document.querySelectorAll('.remove').forEach(btn => btn.onclick = () => {
    cart.splice(Number(btn.dataset.i), 1)
    renderCart()
  })

  document.querySelectorAll('.minus').forEach(btn => btn.onclick = () => {
    const index = Number(btn.dataset.i)
    const product = products.find(p => p.id === cart[index].id)
    const step = product?.stock_unit === 'g' ? 50 : 1
    cart[index].qty = Math.max(1, cart[index].qty - step)
    renderCart()
  })

  document.querySelectorAll('.plus').forEach(btn => btn.onclick = () => {
    const index = Number(btn.dataset.i)
    const product = products.find(p => p.id === cart[index].id)
    const step = product?.stock_unit === 'g' ? 50 : 1
    cart[index].qty += step
    renderCart()
  })

  document.querySelectorAll('.qtyInput').forEach(input => input.onchange = () => {
    cart[Number(input.dataset.i)].qty = Math.max(1, Number(input.value) || 1)
    renderCart()
  })

  totalEl.textContent = eur(ticketTotal())
}

function ticketTotal() {
  return cart.reduce((sum, item) => {
    const product = products.find(p => p.id === item.id)
    if (!product) return sum
    return sum + product.sale_price_ht * item.qty / (product.sale_price_basis || 100)
  }, 0)
}

function renderCustomerHints() {
  const input = document.querySelector('#customerSearch')
  const container = document.querySelector('#customerHints')
  if (!input || !container) return

  const query = input.value.toLowerCase().trim()
  container.innerHTML = query
    ? customers.filter(c => c.active && (
        c.display_name.toLowerCase().includes(query) ||
        String(c.customer_code || '').toLowerCase().includes(query)
      )).slice(0, 8).map(c =>
        `<button class="hint" data-id="${c.id}">${esc(c.display_name)} <span class="muted">${esc(c.customer_code || '')}</span></button>`
      ).join('')
    : ''

  document.querySelectorAll('.hint').forEach(btn => btn.onclick = () => selectCustomer(btn.dataset.id))
}

function selectCustomer(id) {
  selectedCustomer = customers.find(c => c.id === id) || null
  document.querySelector('#customerHints').innerHTML = ''
  document.querySelector('#customerSearch').value = selectedCustomer?.display_name || ''
  const box = document.querySelector('#selectedCustomer')

  if (selectedCustomer) {
    const info = loyaltyInfo(selectedCustomer.id)
    box.style.display = 'block'
    box.textContent = `Client : ${selectedCustomer.display_name} — ${info.visits} passage(s), ${info.availableRewards} cadeau(x) disponible(s)`
  }
}

async function completeSale() {
  const msg = document.querySelector('#saleMsg')
  msg.textContent = ''

  if (!cart.length) return msg.textContent = 'Ajoute au moins un produit.'

  for (const item of cart) {
    const product = products.find(p => p.id === item.id)
    if (item.qty > num(product.stock_quantity)) {
      return msg.textContent = `Stock insuffisant pour ${product.name}.`
    }
  }

  const total = Number(ticketTotal().toFixed(2))
  let payRows = []

  if (document.querySelector('#mixedBox').style.display !== 'none') {
    const card = Number(document.querySelector('#mixCard').value || 0)
    const cash = Number(document.querySelector('#mixCash').value || 0)
    if (Math.abs(card + cash - total) > 0.01) {
      return msg.textContent = 'Le paiement mixte doit être égal au total.'
    }
    if (card > 0) payRows.push({ method: 'card', amount: card })
    if (cash > 0) payRows.push({ method: 'cash', amount: cash })
  } else {
    payRows = [{ method: paymentMode, amount: total }]
  }

  msg.textContent = 'Enregistrement…'

  const { error } = await supabase.rpc('complete_sale', {
    p_customer_id: selectedCustomer?.id || null,
    p_lines: cart.map(item => ({ product_id: item.id, quantity: item.qty })),
    p_payments: payRows,
    p_note: null
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  msg.textContent = 'Vente enregistrée.'
  cart = []
  selectedCustomer = null
  document.querySelector('#customerSearch').value = ''
  document.querySelector('#selectedCustomer').style.display = 'none'
  document.querySelector('#mixCard').value = ''
  document.querySelector('#mixCash').value = ''
  renderCart()
  await loadData()
}

function renderProducts() {
  const input = document.querySelector('#productSearch')
  const body = document.querySelector('#productRows')
  if (!input || !body) return

  const query = input.value.toLowerCase().trim()
  body.innerHTML = products.filter(p =>
    p.name.toLowerCase().includes(query) ||
    String(p.sku || '').toLowerCase().includes(query)
  ).map(p => {
    const category = categories.find(c => c.id === p.category_id)?.name || '—'
    return `
      <tr>
        <td>${esc(p.sku || '—')}</td>
        <td><b>${esc(p.name)}</b></td>
        <td>${esc(category)}</td>
        <td>${num(p.stock_quantity).toLocaleString('fr-FR')} ${esc(p.stock_unit)}</td>
        <td>${eur(p.purchase_price_ht)}</td>
        <td>${eur(p.sale_price_ht)}</td>
        <td>${boolLabel(p.loyalty_eligible)}</td>
        <td><span class="status ${p.active ? 'ok' : 'off'}">${p.active ? 'Actif' : 'Inactif'}</span></td>
      </tr>
    `
  }).join('')
}

function loyaltyInfo(customerId) {
  const required = Number(settings?.loyalty_visits_per_reward || 5)
  const events = loyaltyEvents.filter(e => e.customer_id === customerId)
  const points = events.reduce((sum, event) => sum + Number(event.points_delta || 0), 0)
  const used = events.filter(e => e.event_type === 'reward_used').length
  const availableRewards = Math.max(0, Math.floor(points / required) - used)
  const progress = ((points % required) + required) % required
  const lastVisit = events
    .filter(e => e.event_type === 'visit')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.created_at || null

  return {
    visits: Math.max(0, points),
    used,
    availableRewards,
    progress,
    required,
    lastVisit
  }
}

function renderCustomers() {
  const input = document.querySelector('#clientSearch')
  const body = document.querySelector('#clientRows')
  if (!input || !body) return

  const query = input.value.toLowerCase().trim()

  body.innerHTML = customers.filter(c =>
    c.display_name.toLowerCase().includes(query) ||
    String(c.customer_code || '').toLowerCase().includes(query)
  ).map(c => {
    const info = loyaltyInfo(c.id)
    return `
      <tr>
        <td>${esc(c.customer_code || '—')}</td>
        <td>
          <b>${esc(c.display_name)}</b>
          <div class="small">${esc(c.phone || '')}${c.phone && c.email ? ' · ' : ''}${esc(c.email || '')}</div>
        </td>
        <td>${info.visits}</td>
        <td>
          <div class="progress-label">${info.progress} / ${info.required}</div>
          <div class="progress"><span style="width:${Math.min(100, info.progress / info.required * 100)}%"></span></div>
        </td>
        <td><b>${info.availableRewards}</b></td>
        <td>${fmtDate(info.lastVisit)}</td>
        <td><span class="status ${c.active ? 'ok' : 'off'}">${c.active ? 'Actif' : 'Inactif'}</span></td>
        <td>
          <div class="row">
            <button class="secondary reward-btn" data-id="${c.id}" ${info.availableRewards < 1 || !c.active ? 'disabled' : ''}>Cadeau</button>
            <button class="secondary toggle-client" data-id="${c.id}" data-active="${c.active}">
              ${c.active ? 'Désactiver' : 'Réactiver'}
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')

  document.querySelectorAll('.reward-btn').forEach(btn => btn.onclick = () => openRewardDialog(btn.dataset.id))
  document.querySelectorAll('.toggle-client').forEach(btn => btn.onclick = () => toggleClient(btn.dataset.id, btn.dataset.active === 'true'))
}

async function toggleClient(id, currentlyActive) {
  const { error } = await supabase.from('customers')
    .update({ active: !currentlyActive, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return alert(error.message)
  await loadData()
}

function openRewardDialog(customerId) {
  const customer = customers.find(c => c.id === customerId)
  if (!customer) return

  const eligible = products.filter(p => p.active && p.loyalty_eligible)
  const select = document.querySelector('#rewardProduct')

  select.innerHTML = eligible.map(p =>
    `<option value="${p.id}">${esc(p.name)} — stock ${num(p.stock_quantity).toLocaleString('fr-FR')} ${esc(p.stock_unit)}</option>`
  ).join('')

  document.querySelector('#rewardDialog').dataset.customerId = customerId
  document.querySelector('#rewardClientLabel').textContent = `${customer.display_name} — ${loyaltyInfo(customerId).availableRewards} cadeau(x) disponible(s)`
  document.querySelector('#rewardMsg').textContent = ''
  syncRewardQuantity()
  document.querySelector('#rewardDialog').showModal()
}

function syncRewardQuantity() {
  const id = document.querySelector('#rewardProduct')?.value
  const product = products.find(p => p.id === id)
  if (product) document.querySelector('#rewardQty').value = num(product.loyalty_reward_quantity) || 100
}

async function useReward() {
  const dialog = document.querySelector('#rewardDialog')
  const msg = document.querySelector('#rewardMsg')
  const customerId = dialog.dataset.customerId
  const productId = document.querySelector('#rewardProduct').value
  const quantity = Number(document.querySelector('#rewardQty').value || 0)

  msg.textContent = 'Enregistrement…'
  const { error } = await supabase.rpc('use_loyalty_reward', {
    p_customer_id: customerId,
    p_product_id: productId,
    p_quantity: quantity
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  dialog.close()
  await loadData()
}

function saleById(id) {
  return sales.find(s => s.id === id)
}

function customerName(id) {
  return customers.find(c => c.id === id)?.display_name || '—'
}

function productName(id) {
  return products.find(p => p.id === id)?.name || 'Produit'
}

function renderSales() {
  const body = document.querySelector('#salesRows')
  if (!body) return

  body.innerHTML = sales.map(sale => `
    <tr>
      <td><b>${esc(sale.sale_number || sale.id.slice(0, 8))}</b></td>
      <td>${fmtDateTime(sale.sold_at)}</td>
      <td>${esc(customerName(sale.customer_id))}</td>
      <td>${eur(sale.total_ttc)}</td>
      <td><span class="status ${sale.status === 'completed' ? 'ok' : 'off'}">${esc(sale.status)}</span></td>
      <td>
        ${sale.status === 'completed'
          ? `<button class="danger cancel-sale-btn" data-id="${sale.id}">Annuler</button>`
          : '—'}
      </td>
    </tr>
  `).join('')

  document.querySelectorAll('.cancel-sale-btn').forEach(btn => btn.onclick = () => openCancelSale(btn.dataset.id))
}

function renderSaleLines() {
  const body = document.querySelector('#saleLineRows')
  if (!body) return

  const ordered = [...saleLines].sort((a, b) => {
    const aDate = saleById(a.sale_id)?.sold_at || ''
    const bDate = saleById(b.sale_id)?.sold_at || ''
    return new Date(bDate) - new Date(aDate)
  })

  body.innerHTML = ordered.map(line => {
    const sale = saleById(line.sale_id)
    return `
      <tr>
        <td>${esc(sale?.sale_number || line.sale_id.slice(0, 8))}</td>
        <td>${fmtDateTime(sale?.sold_at)}</td>
        <td>${esc(productName(line.product_id))}</td>
        <td>${num(line.quantity).toLocaleString('fr-FR')}</td>
        <td>${esc(line.unit)}</td>
        <td>${eur(line.line_total_ht)}</td>
        <td>${eur(line.line_total_ttc)}</td>
      </tr>
    `
  }).join('')
}

function renderPayments() {
  const body = document.querySelector('#paymentRows')
  const filter = document.querySelector('#paymentFilter')?.value || ''
  if (!body) return

  body.innerHTML = payments
    .filter(p => !filter || p.payment_method === filter)
    .map(payment => {
      const sale = saleById(payment.sale_id)
      return `
        <tr>
          <td>${esc(sale?.sale_number || payment.sale_id.slice(0, 8))}</td>
          <td>${fmtDateTime(payment.paid_at)}</td>
          <td>${esc(paymentMethodLabel(payment.payment_method))}</td>
          <td>${eur(payment.amount)}</td>
          <td><span class="status ${payment.status === 'completed' ? 'ok' : 'off'}">${esc(payment.status || 'completed')}</span></td>
        </tr>
      `
    }).join('')
}

function paymentMethodLabel(value) {
  return ({
    card: 'CB',
    cash: 'Espèces',
    cheque: 'Chèque',
    transfer: 'Virement',
    other: 'Autre'
  })[value] || value
}

function openCancelSale(id) {
  const sale = saleById(id)
  if (!sale) return
  const dialog = document.querySelector('#cancelSaleDialog')
  dialog.dataset.saleId = id
  document.querySelector('#cancelSaleLabel').textContent = `${sale.sale_number || sale.id} — ${eur(sale.total_ttc)} — ${fmtDateTime(sale.sold_at)}`
  document.querySelector('#cancelReason').value = ''
  document.querySelector('#cancelMsg').textContent = ''
  dialog.showModal()
}

async function confirmCancelSale() {
  const dialog = document.querySelector('#cancelSaleDialog')
  const msg = document.querySelector('#cancelMsg')
  const saleId = dialog.dataset.saleId

  msg.textContent = 'Annulation…'
  const { error } = await supabase.rpc('cancel_sale', {
    p_sale_id: saleId,
    p_reason: document.querySelector('#cancelReason').value.trim() || null
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  dialog.close()
  await loadData()
}

function openProductDialog() {
  document.querySelector('#pCategory').innerHTML = categories
    .filter(c => c.active)
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
  document.querySelector('#productDialog').showModal()
}

async function saveProduct() {
  const msg = document.querySelector('#productMsg')
  msg.textContent = ''

  const payload = {
    organization_id: organizationId,
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

  const { error } = await supabase.from('products').insert(payload)
  if (error) return msg.textContent = error.message

  document.querySelector('#productDialog').close()
  await loadData()
}

async function saveCustomer() {
  const msg = document.querySelector('#clientMsg')
  msg.textContent = ''

  const name = document.querySelector('#cName').value.trim()
  if (!name) return msg.textContent = 'Nom obligatoire.'

  const { error } = await supabase.from('customers').insert({
    organization_id: organizationId,
    display_name: name,
    phone: document.querySelector('#cPhone').value.trim() || null,
    email: document.querySelector('#cEmail').value.trim() || null
  })

  if (error) return msg.textContent = error.message

  document.querySelector('#clientDialog').close()
  await loadData()
}

// =========================================================
// CSV EXPORT
// =========================================================

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(';'),
    ...rows.map(row => row.map(csvEscape).join(';'))
  ]
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportProducts() {
  const headers = [
    'sku','name','category','active','stock_unit','purchase_unit',
    'purchase_unit_quantity','purchase_unit_stock_equivalent','stock_quantity',
    'stock_alert_threshold','purchase_price_ht','purchase_price_basis',
    'sale_price_ht','sale_price_basis','vat_rate_purchase','vat_rate_sale',
    'loyalty_eligible','loyalty_reward_quantity'
  ]

  const rows = products.map(p => [
    p.sku, p.name, categories.find(c => c.id === p.category_id)?.name || '',
    p.active, p.stock_unit, p.purchase_unit, p.purchase_unit_quantity,
    p.purchase_unit_stock_equivalent, p.stock_quantity, p.stock_alert_threshold,
    p.purchase_price_ht, p.purchase_price_basis, p.sale_price_ht, p.sale_price_basis,
    p.vat_rate_purchase, p.vat_rate_sale, p.loyalty_eligible, p.loyalty_reward_quantity
  ])

  downloadCsv(`produits_${todayStamp()}.csv`, headers, rows)
}

function exportClients() {
  const headers = ['customer_code','display_name','phone','email','notes','active']
  const rows = customers.map(c => [
    c.customer_code, c.display_name, c.phone, c.email, c.notes, c.active
  ])
  downloadCsv(`clients_${todayStamp()}.csv`, headers, rows)
}

function exportSales() {
  const headers = ['sale_number','sale_id','sold_at','customer_code','customer_name','total_ht','total_ttc','status','note']
  const rows = sales.map(s => {
    const customer = customers.find(c => c.id === s.customer_id)
    return [
      s.sale_number, s.id, s.sold_at, customer?.customer_code || '',
      customer?.display_name || '', s.total_ht, s.total_ttc, s.status, s.note
    ]
  })
  downloadCsv(`ventes_${todayStamp()}.csv`, headers, rows)
}

function exportSaleLines() {
  const headers = ['sale_number','sale_id','sold_at','product_sku','product_name','quantity','unit','unit_price_ht','vat_rate','line_total_ht','line_total_ttc','sale_status']
  const rows = saleLines.map(line => {
    const sale = saleById(line.sale_id)
    const product = products.find(p => p.id === line.product_id)
    return [
      sale?.sale_number || '', line.sale_id, sale?.sold_at || '',
      product?.sku || '', product?.name || '', line.quantity, line.unit,
      line.unit_price_ht, line.vat_rate, line.line_total_ht, line.line_total_ttc,
      sale?.status || ''
    ]
  })
  downloadCsv(`lignes_ventes_${todayStamp()}.csv`, headers, rows)
}

function exportPayments() {
  const headers = ['sale_number','sale_id','paid_at','payment_method','payment_label','amount','payment_status','sale_status']
  const rows = payments.map(payment => {
    const sale = saleById(payment.sale_id)
    return [
      sale?.sale_number || '', payment.sale_id, payment.paid_at,
      payment.payment_method, paymentMethodLabel(payment.payment_method),
      payment.amount, payment.status || 'completed', sale?.status || ''
    ]
  })
  downloadCsv(`paiements_${todayStamp()}.csv`, headers, rows)
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

// =========================================================
// CSV IMPORT AVEC PRÉVISUALISATION
// =========================================================

function parseCsv(text) {
  text = text.replace(/^\ufeff/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const separator = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','

  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === separator && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some(value => value.trim() !== '')) rows.push(row)

  if (!rows.length) return []
  const headers = rows.shift().map(h => h.trim())

  return rows.map(values => Object.fromEntries(headers.map((h, index) => [h, values[index] ?? ''])))
}

function parseBoolean(value, defaultValue = true) {
  if (value === '' || value == null) return defaultValue
  return ['true','1','oui','yes','vrai'].includes(String(value).trim().toLowerCase())
}

function parseNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback
  const result = Number(String(value).replace(',', '.').trim())
  return Number.isFinite(result) ? result : fallback
}

async function prepareImport(type, file) {
  if (!file) return

  const text = await file.text()
  const rows = parseCsv(text)
  const analysis = type === 'products' ? analyzeProductImport(rows) : analyzeClientImport(rows)

  pendingImport = { type, ...analysis }

  const summary = document.querySelector('#importSummary')
  summary.textContent = `${rows.length} ligne(s) — ${analysis.creates.length} création(s), ${analysis.updates.length} modification(s), ${analysis.unchanged.length} inchangée(s), ${analysis.errors.length} erreur(s).`

  document.querySelector('#importErrors').innerHTML = analysis.errors.length
    ? `<div class="error-box"><b>Erreurs à corriger avant import :</b><ul>${analysis.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`
    : ''

  const previewRows = [...analysis.creates, ...analysis.updates, ...analysis.unchanged].slice(0, 50)
  document.querySelector('#importPreview').innerHTML = `
    <table>
      <thead><tr><th>Action</th><th>Référence</th><th>Nom</th></tr></thead>
      <tbody>
        ${previewRows.map(item => `<tr><td>${esc(item._action)}</td><td>${esc(item._code || 'générée automatiquement')}</td><td>${esc(item._name)}</td></tr>`).join('')}
      </tbody>
    </table>
    ${previewRows.length < analysis.creates.length + analysis.updates.length + analysis.unchanged.length ? '<div class="small">Aperçu limité aux 50 premières lignes.</div>' : ''}
  `

  const applyBtn = document.querySelector('#applyImportBtn')
  applyBtn.disabled = analysis.errors.length > 0
  document.querySelector('#importMsg').textContent = ''
  document.querySelector('#importDialog').showModal()

  document.querySelector(type === 'products' ? '#importProductsInput' : '#importClientsInput').value = ''
}

function analyzeProductImport(rows) {
  const creates = [], updates = [], unchanged = [], errors = []
  const bySku = new Map(products.filter(p => p.sku).map(p => [p.sku.trim().toUpperCase(), p]))
  const categoryByName = new Map(categories.map(c => [c.name.trim().toLowerCase(), c]))

  rows.forEach((row, index) => {
    const lineNo = index + 2
    const sku = String(row.sku || '').trim().toUpperCase()
    const name = String(row.name || '').trim()
    const categoryName = String(row.category || '').trim()

    if (!name) {
      errors.push(`Ligne ${lineNo} : nom produit manquant.`)
      return
    }

    const category = categoryName ? categoryByName.get(categoryName.toLowerCase()) : null
    if (categoryName && !category) {
      errors.push(`Ligne ${lineNo} : catégorie inconnue "${categoryName}".`)
      return
    }

    const payload = {
      organization_id: organizationId,
      sku: sku || null,
      name,
      category_id: category?.id || null,
      active: parseBoolean(row.active, true),
      stock_unit: row.stock_unit || 'g',
      purchase_unit: row.purchase_unit || 'sachet',
      purchase_unit_quantity: parseNumber(row.purchase_unit_quantity, 500),
      purchase_unit_stock_equivalent: parseNumber(row.purchase_unit_stock_equivalent, 500),
      stock_quantity: parseNumber(row.stock_quantity, 0),
      stock_alert_threshold: parseNumber(row.stock_alert_threshold, 0),
      purchase_price_ht: parseNumber(row.purchase_price_ht, 0),
      purchase_price_basis: parseNumber(row.purchase_price_basis, 100),
      sale_price_ht: parseNumber(row.sale_price_ht, 0),
      sale_price_basis: parseNumber(row.sale_price_basis, 100),
      vat_rate_purchase: parseNumber(row.vat_rate_purchase, 0),
      vat_rate_sale: parseNumber(row.vat_rate_sale, 0),
      loyalty_eligible: parseBoolean(row.loyalty_eligible, false),
      loyalty_reward_quantity: parseNumber(row.loyalty_reward_quantity, 100)
    }

    if (!sku) {
      if (products.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) {
        errors.push(`Ligne ${lineNo} : "${name}" existe déjà mais la référence sku est vide. Utilise sa référence existante pour éviter un doublon.`)
        return
      }
      creates.push({ ...payload, _action: 'Créer', _code: '', _name: name })
      return
    }

    const existing = bySku.get(sku)
    if (!existing) {
      creates.push({ ...payload, _action: 'Créer', _code: sku, _name: name })
      return
    }

    const changed = productChanged(existing, payload)
    const item = { ...payload, id: existing.id, _action: changed ? 'Modifier' : 'Inchangé', _code: sku, _name: name }
    ;(changed ? updates : unchanged).push(item)
  })

  return { creates, updates, unchanged, errors }
}

function productChanged(existing, payload) {
  const fields = [
    'name','category_id','active','stock_unit','purchase_unit',
    'purchase_unit_quantity','purchase_unit_stock_equivalent','stock_quantity',
    'stock_alert_threshold','purchase_price_ht','purchase_price_basis',
    'sale_price_ht','sale_price_basis','vat_rate_purchase','vat_rate_sale',
    'loyalty_eligible','loyalty_reward_quantity'
  ]
  return fields.some(field => String(existing[field] ?? '') !== String(payload[field] ?? ''))
}

function analyzeClientImport(rows) {
  const creates = [], updates = [], unchanged = [], errors = []
  const byCode = new Map(customers.filter(c => c.customer_code).map(c => [c.customer_code.trim().toUpperCase(), c]))

  rows.forEach((row, index) => {
    const lineNo = index + 2
    const code = String(row.customer_code || '').trim().toUpperCase()
    const name = String(row.display_name || '').trim()

    if (!name) {
      errors.push(`Ligne ${lineNo} : nom client manquant.`)
      return
    }

    const payload = {
      organization_id: organizationId,
      customer_code: code || null,
      display_name: name,
      phone: String(row.phone || '').trim() || null,
      email: String(row.email || '').trim() || null,
      notes: String(row.notes || '').trim() || null,
      active: parseBoolean(row.active, true)
    }

    if (!code) {
      if (customers.some(c => c.display_name.trim().toLowerCase() === name.toLowerCase())) {
        errors.push(`Ligne ${lineNo} : "${name}" existe déjà mais customer_code est vide. Utilise sa référence existante pour éviter un doublon.`)
        return
      }
      creates.push({ ...payload, _action: 'Créer', _code: '', _name: name })
      return
    }

    const existing = byCode.get(code)
    if (!existing) {
      creates.push({ ...payload, _action: 'Créer', _code: code, _name: name })
      return
    }

    const fields = ['display_name','phone','email','notes','active']
    const changed = fields.some(field => String(existing[field] ?? '') !== String(payload[field] ?? ''))
    const item = { ...payload, id: existing.id, _action: changed ? 'Modifier' : 'Inchangé', _code: code, _name: name }
    ;(changed ? updates : unchanged).push(item)
  })

  return { creates, updates, unchanged, errors }
}

async function applyImport() {
  if (!pendingImport || pendingImport.errors.length) return

  const msg = document.querySelector('#importMsg')
  msg.textContent = 'Import en cours…'

  try {
    if (pendingImport.type === 'products') {
      for (const item of pendingImport.updates) {
        const { id, _action, _code, _name, ...payload } = item
        const { error } = await supabase.from('products').update(payload).eq('id', id)
        if (error) throw error
      }
      for (const item of pendingImport.creates) {
        const { _action, _code, _name, ...payload } = item
        if (!payload.sku) delete payload.sku
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
      }
    } else {
      for (const item of pendingImport.updates) {
        const { id, _action, _code, _name, ...payload } = item
        const { error } = await supabase.from('customers').update(payload).eq('id', id)
        if (error) throw error
      }
      for (const item of pendingImport.creates) {
        const { _action, _code, _name, ...payload } = item
        if (!payload.customer_code) delete payload.customer_code
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
      }
    }

    document.querySelector('#importDialog').close()
    pendingImport = null
    await loadData()
  } catch (error) {
    msg.textContent = 'Erreur : ' + error.message
  }
}

function closeImport() {
  pendingImport = null
  document.querySelector('#importDialog').close()
}

init()
