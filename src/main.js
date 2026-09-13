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
let managementExpenses = []
let cashClosings = []
let bankTransactions = []
let bankRules = []
let forecastEvents = []
let pendingBankImport = null

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
          <button data-tab="history">Historique</button>
          <button data-tab="products">Produits</button>
          <button data-tab="clients">Clients</button>
          <button data-tab="pilotage">Pilotage</button>
          <button data-tab="treasury">Caisse & trésorerie</button>
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
        <section id="pilotage" class="section">
          <div class="top">
            <div>
              <h1>Pilotage</h1>
              <div class="muted">CA, marge, seuils, URSSAF et compte de gestion.</div>
            </div>
            <button id="refreshPilotageBtn" class="secondary">Actualiser</button>
          </div>

          <div id="pilotageKpis" class="kpi-grid"></div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Seuils 2026</h2>
              <div id="thresholdsBox"></div>
            </div>
            <div class="card">
              <h2>Préparation URSSAF</h2>
              <div id="urssafBox"></div>
            </div>
          </div>

          <div class="card" style="margin-top:14px">
            <div class="row space">
              <div>
                <h2>CA et marges mensuels</h2>
                <div class="small">Barres = CA · ligne pleine = marge brute % · ligne pointillée = marge nette %</div>
              </div>
            </div>
            <div id="pilotageChart" class="pilotage-chart"></div>
          </div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Top ventes — cumul annuel</h2>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Produit</th><th>Qté mois</th><th>Qté YTD</th><th>CA YTD</th><th>% CA</th><th>Marge YTD</th><th>% marge</th></tr></thead>
                  <tbody id="topSalesRows"></tbody>
                </table>
              </div>
            </div>
            <div class="card">
              <h2>Stocks sous seuil</h2>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Produit</th><th>Stock</th><th>Seuil</th></tr></thead>
                  <tbody id="lowStockRows"></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:14px">
            <h2>Compte de gestion</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th><th>CA encaissé</th><th>Achats consommés</th><th>Marge brute</th><th>Taux marge brute</th>
                    <th>Autres dépenses</th><th>Cotisations estimées</th><th>Versement libératoire estimé</th>
                    <th>Solde de gestion estimé</th><th>Marge nette</th>
                  </tr>
                </thead>
                <tbody id="managementRows"></tbody>
              </table>
            </div>
          </div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Autres dépenses professionnelles</h2>
              <div class="grid">
                <input id="expenseDate" class="field" type="date">
                <input id="expenseAmount" class="field" type="number" min="0" step="0.01" placeholder="Montant €">
              </div>
              <input id="expenseLabel" class="field" style="margin-top:8px" placeholder="Libellé — ex. loyer, assurance, téléphone">
              <button id="addExpenseBtn" class="primary" style="margin-top:8px">Ajouter la dépense</button>
              <div id="expenseMsg" class="small" style="margin-top:6px"></div>
              <div class="table-wrap" style="margin-top:12px">
                <table>
                  <thead><tr><th>Date</th><th>Libellé</th><th>Montant</th><th></th></tr></thead>
                  <tbody id="expenseRows"></tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h2>Paramètres de pilotage</h2>
              <label class="small">Début d'activité</label>
              <input id="settingActivityStart" class="field" type="date">
              <div class="grid" style="margin-top:8px">
                <div><label class="small">Cotisations sociales %</label><input id="settingSocialRate" class="field" type="number" step="0.01"></div>
                <div><label class="small">Versement libératoire %</label><input id="settingTaxRate" class="field" type="number" step="0.01"></div>
              </div>
              <div class="grid" style="margin-top:8px">
                <div><label class="small">TVA seuil base €</label><input id="settingVatBase" class="field" type="number"></div>
                <div><label class="small">TVA seuil majoré €</label><input id="settingVatMajor" class="field" type="number"></div>
              </div>
              <label class="small" style="display:block;margin-top:8px">Seuil micro €</label>
              <input id="settingMicroThreshold" class="field" type="number">
              <button id="savePilotageSettingsBtn" class="primary" style="margin-top:10px">Enregistrer les paramètres</button>
              <div id="settingsMsg" class="small" style="margin-top:6px"></div>
              <div class="notice" style="margin-top:12px">
                Les seuils sont paramétrables pour rester à jour. Les valeurs 2026 préchargées sont : TVA 85 000 € / 93 500 € et micro 203 100 €.
              </div>
            </div>
          </div>
        </section>

        <section id="treasury" class="section">
          <div class="top">
            <div>
              <h1>Caisse & trésorerie</h1>
              <div class="muted">Clôture quotidienne, banque, rapprochement CB et prévision.</div>
            </div>
            <button id="refreshTreasuryBtn" class="secondary">Actualiser</button>
          </div>

          <div id="treasuryKpis" class="kpi-grid"></div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Clôture de caisse</h2>
              <label class="small">Date</label>
              <input id="closingDate" class="field" type="date">
              <div id="closingExpected" class="notice" style="margin-top:8px"></div>
              <label class="small" style="display:block;margin-top:10px">Espèces comptées</label>
              <input id="cashCounted" class="field" type="number" step="0.01" min="0" placeholder="0,00">
              <label class="small" style="display:block;margin-top:10px">Note</label>
              <input id="closingNote" class="field" placeholder="Facultatif">
              <button id="saveClosingBtn" class="primary" style="margin-top:10px">Enregistrer la clôture</button>
              <div id="closingMsg" class="small" style="margin-top:6px"></div>
              <div class="table-wrap" style="margin-top:12px">
                <table>
                  <thead><tr><th>Date</th><th>CB</th><th>Espèces th.</th><th>Espèces comptées</th><th>Écart</th></tr></thead>
                  <tbody id="closingRows"></tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h2>Solde bancaire de départ</h2>
              <div class="small">Indique le solde réellement disponible aujourd'hui. Il sert de point de départ aux prévisions.</div>
              <input id="currentBankBalance" class="field" type="number" step="0.01" style="margin-top:10px">
              <button id="saveBankBalanceBtn" class="primary" style="margin-top:8px">Enregistrer le solde</button>
              <div id="bankBalanceMsg" class="small" style="margin-top:6px"></div>

              <h2 style="margin-top:22px">Prévision 30 / 60 / 90 jours</h2>
              <div id="forecastBars"></div>
              <div id="forecastLowPoint" class="notice" style="margin-top:10px"></div>
            </div>
          </div>

          <div class="card" style="margin-top:14px">
            <div class="top compact-top">
              <div>
                <h2>Import bancaire CSV</h2>
                <div class="small">V1 gratuite : import du relevé bancaire, catégorisation automatique simple puis correction manuelle.</div>
              </div>
              <label class="secondary file-btn">Importer un CSV<input id="bankCsvInput" type="file" accept=".csv,text/csv"></label>
            </div>
            <div id="bankImportSummary" class="notice" style="display:none"></div>
            <div class="table-wrap" style="margin-top:10px">
              <table>
                <thead><tr><th>Date</th><th>Libellé</th><th>Montant</th><th>Catégorie</th><th>Action</th></tr></thead>
                <tbody id="bankRows"></tbody>
              </table>
            </div>
          </div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Rapprochement CB</h2>
              <div class="small">Comparaison des encaissements CB théoriques avec les crédits bancaires catégorisés « Encaissement CB ». Tolérance de délai : 3 jours.</div>
              <div class="table-wrap" style="margin-top:10px">
                <table>
                  <thead><tr><th>Date ventes</th><th>CB théorique</th><th>Crédit bancaire rapproché</th><th>Écart</th><th>Statut</th></tr></thead>
                  <tbody id="cardReconRows"></tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h2>Règles de catégorisation</h2>
              <div class="grid">
                <input id="ruleKeyword" class="field" placeholder="Mot-clé du libellé">
                <input id="ruleCategory" class="field" placeholder="Catégorie">
              </div>
              <button id="addBankRuleBtn" class="primary" style="margin-top:8px">Ajouter la règle</button>
              <div id="ruleMsg" class="small" style="margin-top:6px"></div>
              <div class="table-wrap" style="margin-top:10px">
                <table>
                  <thead><tr><th>Mot-clé</th><th>Catégorie</th><th></th></tr></thead>
                  <tbody id="bankRuleRows"></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:14px">
            <h2>Événements de trésorerie à venir</h2>
            <div class="treasury-event-form">
              <input id="forecastDate" class="field" type="date">
              <input id="forecastLabel" class="field" placeholder="Ex. URSSAF, loyer, fournisseur">
              <input id="forecastAmount" class="field" type="number" min="0" step="0.01" placeholder="Montant €">
              <select id="forecastType" class="field">
                <option value="expense">Décaissement</option>
                <option value="income">Encaissement</option>
              </select>
              <select id="forecastRecurrence" class="field">
                <option value="">Ponctuel</option>
                <option value="monthly">Mensuel</option>
              </select>
              <button id="addForecastEventBtn" class="primary">Ajouter</button>
            </div>
            <div id="forecastEventMsg" class="small" style="margin-top:6px"></div>
            <div class="table-wrap" style="margin-top:10px">
              <table>
                <thead><tr><th>Date</th><th>Événement</th><th>Type</th><th>Montant</th><th>Récurrence</th><th></th></tr></thead>
                <tbody id="forecastEventRows"></tbody>
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
  document.querySelector('#refreshPilotageBtn').onclick = loadData
  document.querySelector('#addExpenseBtn').onclick = addManagementExpense
  document.querySelector('#savePilotageSettingsBtn').onclick = savePilotageSettings
  document.querySelector('#refreshTreasuryBtn').onclick = loadData
  document.querySelector('#closingDate').onchange = renderClosingExpected
  document.querySelector('#saveClosingBtn').onclick = saveCashClosing
  document.querySelector('#saveBankBalanceBtn').onclick = saveBankBalance
  document.querySelector('#bankCsvInput').onchange = event => importBankCsv(event.target.files?.[0])
  document.querySelector('#addBankRuleBtn').onclick = addBankRule
  document.querySelector('#addForecastEventBtn').onclick = addForecastEvent
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
    loyaltyRes, salesRes, linesRes, paymentsRes, expensesRes,
    closingsRes, bankRes, rulesRes, forecastRes
  ] = await Promise.all([
    supabase.from('product_categories').select('id,name,active,sort_order').order('sort_order'),
    supabase.from('products').select('*').order('name'),
    supabase.from('customers').select('*').order('display_name'),
    supabase.from('settings').select('*').single(),
    supabase.from('loyalty_events').select('*').order('created_at', { ascending: false }),
    supabase.from('sales').select('*').order('sold_at', { ascending: false }).limit(5000),
    supabase.from('sale_lines').select('*').limit(50000),
    supabase.from('payments').select('*').order('paid_at', { ascending: false }).limit(50000),
    supabase.from('management_expenses').select('*').order('expense_date', { ascending: false }).limit(5000),
    supabase.from('cash_closings').select('*').order('closing_date', { ascending: false }).limit(500),
    supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }).limit(5000),
    supabase.from('bank_category_rules').select('*').eq('active', true).order('priority').limit(500),
    supabase.from('forecast_events').select('*').eq('active', true).order('event_date').limit(1000)
  ])

  const error = [
    categoriesRes.error, productsRes.error, customersRes.error, settingsRes.error,
    loyaltyRes.error, salesRes.error, linesRes.error, paymentsRes.error, expensesRes.error,
    closingsRes.error, bankRes.error, rulesRes.error, forecastRes.error
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
  managementExpenses = expensesRes.data || []
  cashClosings = closingsRes.data || []
  bankTransactions = bankRes.data || []
  bankRules = rulesRes.data || []
  forecastEvents = forecastRes.data || []

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
  renderPilotage()
  renderTreasury()
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


// =========================================================
// SPRINT 3 — PILOTAGE
// =========================================================

function completedSales() {
  return sales.filter(s => s.status === 'completed')
}

function dateYear(value) {
  return new Date(value).getFullYear()
}

function dateMonth(value) {
  return new Date(value).getMonth()
}

function currentYear() {
  return new Date().getFullYear()
}

function currentMonth() {
  return new Date().getMonth()
}

function saleIsYtd(sale) {
  return sale.status === 'completed' && dateYear(sale.sold_at) === currentYear()
}

function saleIsCurrentMonth(sale) {
  return saleIsYtd(sale) && dateMonth(sale.sold_at) === currentMonth()
}

function lineSale(line) {
  return saleById(line.sale_id)
}

function lineCost(line) {
  if (line.line_cost_ht != null) return num(line.line_cost_ht)
  const product = products.find(p => p.id === line.product_id)
  if (!product) return 0
  return num(product.purchase_price_ht) * num(line.quantity) / (num(product.purchase_price_basis) || 100)
}

function monthName(index) {
  return ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'][index]
}

function monthLong(index) {
  return ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][index]
}

function pilotageMonthlyData() {
  const year = currentYear()
  const socialRate = num(settings?.micro_social_rate) / 100
  const taxRate = num(settings?.income_tax_rate) / 100

  return Array.from({ length: 12 }, (_, month) => {
    const monthSales = sales.filter(s =>
      s.status === 'completed' &&
      dateYear(s.sold_at) === year &&
      dateMonth(s.sold_at) === month
    )
    const ids = new Set(monthSales.map(s => s.id))
    const lines = saleLines.filter(line => ids.has(line.sale_id))
    const ca = monthSales.reduce((sum, sale) => sum + num(sale.total_ttc), 0)
    const caHt = monthSales.reduce((sum, sale) => sum + num(sale.total_ht), 0)
    const cost = lines.reduce((sum, line) => sum + lineCost(line), 0)
    const grossMargin = caHt - cost
    const expenses = managementExpenses
      .filter(e => dateYear(e.expense_date) === year && dateMonth(e.expense_date) === month)
      .reduce((sum, e) => sum + num(e.amount), 0)
    const social = ca * socialRate
    const incomeTax = ca * taxRate
    const net = grossMargin - expenses - social - incomeTax

    return {
      month,
      ca,
      caHt,
      cost,
      grossMargin,
      grossRate: caHt ? grossMargin / caHt * 100 : 0,
      expenses,
      social,
      incomeTax,
      net,
      netRate: ca ? net / ca * 100 : 0
    }
  })
}

function renderPilotage() {
  const section = document.querySelector('#pilotage')
  if (!section || !settings) return

  const monthly = pilotageMonthlyData()
  const ytd = monthly.slice(0, currentMonth() + 1)
  const month = monthly[currentMonth()]

  const caYtd = ytd.reduce((s, m) => s + m.ca, 0)
  const marginYtd = ytd.reduce((s, m) => s + m.grossMargin, 0)
  const caHtYtd = ytd.reduce((s, m) => s + m.caHt, 0)
  const grossRateYtd = caHtYtd ? marginYtd / caHtYtd * 100 : 0

  document.querySelector('#pilotageKpis').innerHTML = `
    <div class="card kpi"><div class="muted">CA du mois</div><div class="kpi-value">${eur(month.ca)}</div></div>
    <div class="card kpi"><div class="muted">CA cumulé ${currentYear()}</div><div class="kpi-value">${eur(caYtd)}</div></div>
    <div class="card kpi"><div class="muted">Marge brute cumulée</div><div class="kpi-value">${eur(marginYtd)}</div></div>
    <div class="card kpi"><div class="muted">Taux de marge brute</div><div class="kpi-value">${grossRateYtd.toFixed(1)} %</div></div>
  `

  renderThresholds(caYtd)
  renderUrssaf()
  renderPilotageChart(monthly)
  renderTopSales()
  renderLowStocks()
  renderManagementTable(monthly)
  renderExpenses()
  fillPilotageSettings()
}

function gauge(label, value, threshold, suffix = '') {
  const ratio = threshold > 0 ? Math.min(100, value / threshold * 100) : 0
  return `
    <div class="gauge-block">
      <div class="row space">
        <b>${esc(label)}</b>
        <span>${eur(value)} / ${eur(threshold)}${suffix}</span>
      </div>
      <div class="gauge"><span style="width:${ratio}%"></span></div>
      <div class="small">${ratio.toFixed(1)} % du seuil</div>
    </div>
  `
}

function daysInYear(year) {
  return ((new Date(year, 11, 31) - new Date(year, 0, 1)) / 86400000) + 1
}

function activeDaysInYear(startDate, year) {
  if (!startDate) return daysInYear(year)
  const start = new Date(startDate + 'T00:00:00')
  if (start.getFullYear() < year) return daysInYear(year)
  if (start.getFullYear() > year) return 0
  return Math.round((new Date(year, 11, 31) - start) / 86400000) + 1
}

function renderThresholds(caYtd) {
  const year = currentYear()
  const start = settings.activity_start_date
  const days = activeDaysInYear(start, year)
  const yearDays = daysInYear(year)
  const vatBase = num(settings.vat_base_threshold)
  const vatMajor = num(settings.vat_major_threshold)
  const micro = num(settings.micro_threshold)
  const proratedVatBase = vatBase * days / yearDays
  const proratedMicro = micro * days / yearDays
  const firstYear = start && new Date(start + 'T00:00:00').getFullYear() === year

  document.querySelector('#thresholdsBox').innerHTML = `
    ${gauge('Franchise TVA — seuil de base', caYtd, vatBase)}
    ${gauge('Franchise TVA — seuil majoré', caYtd, vatMajor)}
    ${gauge('Régime micro — plafond annuel', caYtd, micro)}
    ${firstYear ? `
      <div class="notice" style="margin-top:10px">
        Activité démarrée le ${fmtDate(start)}. Références proratisées indicatives pour l'année de création :
        TVA base ${eur(proratedVatBase)} · micro ${eur(proratedMicro)}.
        Le seuil TVA majoré de ${eur(vatMajor)} reste le seuil de bascule immédiate en cours d'année.
      </div>` : ''}
  `
}

function quarterBounds(date = new Date()) {
  const q = Math.floor(date.getMonth() / 3)
  return { startMonth: q * 3, endMonth: q * 3 + 2, quarter: q + 1 }
}

function copyValue(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const old = button.textContent
    button.textContent = 'Copié'
    setTimeout(() => button.textContent = old, 900)
  })
}

function renderUrssaf() {
  const now = new Date()
  const { startMonth, endMonth, quarter } = quarterBounds(now)
  const qSales = sales.filter(s =>
    s.status === 'completed' &&
    dateYear(s.sold_at) === now.getFullYear() &&
    dateMonth(s.sold_at) >= startMonth &&
    dateMonth(s.sold_at) <= endMonth
  )

  const ca = qSales.reduce((sum, sale) => sum + num(sale.total_ttc), 0)
  const socialRate = num(settings.micro_social_rate)
  const taxRate = num(settings.income_tax_rate)
  const social = ca * socialRate / 100
  const tax = ca * taxRate / 100

  document.querySelector('#urssafBox').innerHTML = `
    <div class="small" style="margin-bottom:8px">Trimestre ${quarter} — ${currentYear()}</div>
    <div class="urssaf-line">
      <div><b>Chiffre d'affaires des ventes de marchandises</b><div class="small">Régime micro-social simplifié</div></div>
      <div class="row"><b>${eur(ca)}</b><button class="copy-btn" data-copy="${ca.toFixed(2)}">⧉</button></div>
    </div>
    <div class="urssaf-line">
      <div><b>Cotisations sociales estimées</b><div class="small">${socialRate.toFixed(2)} %</div></div>
      <div class="row"><b>${eur(social)}</b><button class="copy-btn" data-copy="${social.toFixed(2)}">⧉</button></div>
    </div>
    <div class="urssaf-line">
      <div><b>Versement libératoire estimé</b><div class="small">${taxRate.toFixed(2)} % — si option applicable</div></div>
      <div class="row"><b>${eur(tax)}</b><button class="copy-btn" data-copy="${tax.toFixed(2)}">⧉</button></div>
    </div>
  `

  document.querySelectorAll('.copy-btn').forEach(btn => btn.onclick = () => copyValue(btn.dataset.copy, btn))
}

function renderPilotageChart(monthly) {
  const box = document.querySelector('#pilotageChart')
  const width = 1100
  const height = 330
  const pad = { left: 25, right: 25, top: 35, bottom: 45 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const maxCa = Math.max(1, ...monthly.map(m => m.ca))
  const slot = innerW / 12
  const barW = slot * 0.48

  const x = i => pad.left + slot * i + slot / 2
  const yCa = value => pad.top + innerH - (value / maxCa) * innerH
  const yPct = value => {
    const clamped = Math.max(-20, Math.min(100, value))
    return pad.top + innerH - ((clamped + 20) / 120) * innerH
  }

  const grossPoints = monthly.map(m => `${x(m.month)},${yPct(m.grossRate)}`).join(' ')
  const netPoints = monthly.map(m => `${x(m.month)},${yPct(m.netRate)}`).join(' ')

  const bars = monthly.map(m => {
    const top = yCa(m.ca)
    const h = pad.top + innerH - top
    return `
      <rect x="${x(m.month) - barW/2}" y="${top}" width="${barW}" height="${h}" rx="5" class="chart-bar"></rect>
      <text x="${x(m.month)}" y="${Math.max(15, top - 7)}" text-anchor="middle" class="chart-ca-label">${m.ca ? Math.round(m.ca).toLocaleString('fr-FR') + ' €' : ''}</text>
      <text x="${x(m.month)}" y="${height - 15}" text-anchor="middle" class="chart-month">${monthName(m.month)}</text>
    `
  }).join('')

  const grossLabels = monthly.map(m =>
    `<text x="${x(m.month)}" y="${yPct(m.grossRate) - 9}" text-anchor="middle" class="chart-gross-label">${m.ca ? m.grossRate.toFixed(0) + '%' : ''}</text>`
  ).join('')

  const netLabels = monthly.map(m =>
    `<text x="${x(m.month)}" y="${yPct(m.netRate) + 18}" text-anchor="middle" class="chart-net-label">${m.ca ? m.netRate.toFixed(0) + '%' : ''}</text>`
  ).join('')

  box.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="CA et marges mensuels">
      ${bars}
      <polyline points="${grossPoints}" class="chart-line gross"></polyline>
      <polyline points="${netPoints}" class="chart-line net"></polyline>
      ${grossLabels}
      ${netLabels}
    </svg>
  `
}

function renderTopSales() {
  const ytdSales = sales.filter(s => saleIsYtd(s))
  const currentMonthSales = sales.filter(s => saleIsCurrentMonth(s))
  const ytdIds = new Set(ytdSales.map(s => s.id))
  const monthIds = new Set(currentMonthSales.map(s => s.id))
  const totalCa = ytdSales.reduce((sum, sale) => sum + num(sale.total_ht), 0)

  const byProduct = new Map()

  for (const line of saleLines.filter(l => ytdIds.has(l.sale_id))) {
    const existing = byProduct.get(line.product_id) || { qtyYtd: 0, qtyMonth: 0, ca: 0, margin: 0 }
    existing.qtyYtd += num(line.quantity)
    if (monthIds.has(line.sale_id)) existing.qtyMonth += num(line.quantity)
    existing.ca += num(line.line_total_ht)
    existing.margin += num(line.line_total_ht) - lineCost(line)
    byProduct.set(line.product_id, existing)
  }

  const totalMargin = [...byProduct.values()].reduce((sum, row) => sum + row.margin, 0)

  const rows = [...byProduct.entries()]
    .map(([productId, values]) => ({ productId, ...values }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 12)

  document.querySelector('#topSalesRows').innerHTML = rows.length ? rows.map(row => {
    const product = products.find(p => p.id === row.productId)
    return `
      <tr>
        <td><b>${esc(product?.name || 'Produit')}</b></td>
        <td>${row.qtyMonth.toLocaleString('fr-FR')}</td>
        <td>${row.qtyYtd.toLocaleString('fr-FR')}</td>
        <td>${eur(row.ca)}</td>
        <td>${totalCa ? (row.ca / totalCa * 100).toFixed(1) : '0.0'} %</td>
        <td>${eur(row.margin)}</td>
        <td>${totalMargin ? (row.margin / totalMargin * 100).toFixed(1) : '0.0'} %</td>
      </tr>
    `
  }).join('') : '<tr><td colspan="7" class="muted">Pas encore de ventes.</td></tr>'
}

function renderLowStocks() {
  const rows = products
    .filter(p => p.active && num(p.stock_quantity) <= num(p.stock_alert_threshold))
    .sort((a, b) => num(a.stock_quantity) - num(b.stock_quantity))

  document.querySelector('#lowStockRows').innerHTML = rows.length ? rows.map(p => `
    <tr>
      <td><b>${esc(p.name)}</b></td>
      <td class="low">${num(p.stock_quantity).toLocaleString('fr-FR')} ${esc(p.stock_unit)}</td>
      <td>${num(p.stock_alert_threshold).toLocaleString('fr-FR')} ${esc(p.stock_unit)}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="muted">Aucun produit sous le seuil.</td></tr>'
}

function renderManagementTable(monthly) {
  const throughMonth = monthly.slice(0, currentMonth() + 1)
  const cumulative = throughMonth.reduce((acc, m) => ({
    ca: acc.ca + m.ca,
    caHt: acc.caHt + m.caHt,
    cost: acc.cost + m.cost,
    grossMargin: acc.grossMargin + m.grossMargin,
    expenses: acc.expenses + m.expenses,
    social: acc.social + m.social,
    incomeTax: acc.incomeTax + m.incomeTax,
    net: acc.net + m.net
  }), { ca:0, caHt:0, cost:0, grossMargin:0, expenses:0, social:0, incomeTax:0, net:0 })

  const rows = throughMonth.map(m => `
    <tr>
      <td>${monthLong(m.month)}</td>
      <td>${eur(m.ca)}</td>
      <td>${eur(m.cost)}</td>
      <td>${eur(m.grossMargin)}</td>
      <td>${m.grossRate.toFixed(1)} %</td>
      <td>${eur(m.expenses)}</td>
      <td>${eur(m.social)}</td>
      <td>${eur(m.incomeTax)}</td>
      <td><b>${eur(m.net)}</b></td>
      <td>${m.netRate.toFixed(1)} %</td>
    </tr>
  `).join('')

  const grossRate = cumulative.caHt ? cumulative.grossMargin / cumulative.caHt * 100 : 0
  const netRate = cumulative.ca ? cumulative.net / cumulative.ca * 100 : 0

  document.querySelector('#managementRows').innerHTML = rows + `
    <tr class="total-row">
      <td><b>Cumul ${currentYear()}</b></td>
      <td><b>${eur(cumulative.ca)}</b></td>
      <td><b>${eur(cumulative.cost)}</b></td>
      <td><b>${eur(cumulative.grossMargin)}</b></td>
      <td><b>${grossRate.toFixed(1)} %</b></td>
      <td><b>${eur(cumulative.expenses)}</b></td>
      <td><b>${eur(cumulative.social)}</b></td>
      <td><b>${eur(cumulative.incomeTax)}</b></td>
      <td><b>${eur(cumulative.net)}</b></td>
      <td><b>${netRate.toFixed(1)} %</b></td>
    </tr>
  `
}

function renderExpenses() {
  const body = document.querySelector('#expenseRows')
  if (!body) return

  const current = managementExpenses
    .filter(e => dateYear(e.expense_date) === currentYear())
    .slice(0, 30)

  body.innerHTML = current.length ? current.map(e => `
    <tr>
      <td>${fmtDate(e.expense_date)}</td>
      <td>${esc(e.label)}</td>
      <td>${eur(e.amount)}</td>
      <td><button class="danger delete-expense-btn" data-id="${e.id}">×</button></td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="muted">Aucune dépense saisie.</td></tr>'

  document.querySelectorAll('.delete-expense-btn').forEach(btn => btn.onclick = () => deleteManagementExpense(btn.dataset.id))
}

async function addManagementExpense() {
  const msg = document.querySelector('#expenseMsg')
  const date = document.querySelector('#expenseDate').value || new Date().toISOString().slice(0,10)
  const amount = Number(document.querySelector('#expenseAmount').value || 0)
  const label = document.querySelector('#expenseLabel').value.trim()

  if (!label) return msg.textContent = 'Libellé obligatoire.'
  if (!(amount > 0)) return msg.textContent = 'Montant invalide.'

  msg.textContent = 'Enregistrement…'
  const { error } = await supabase.from('management_expenses').insert({
    organization_id: organizationId,
    expense_date: date,
    label,
    amount
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  document.querySelector('#expenseAmount').value = ''
  document.querySelector('#expenseLabel').value = ''
  msg.textContent = ''
  await loadData()
}

async function deleteManagementExpense(id) {
  if (!confirm('Supprimer cette dépense du pilotage ?')) return
  const { error } = await supabase.from('management_expenses').delete().eq('id', id)
  if (error) return alert(error.message)
  await loadData()
}

function fillPilotageSettings() {
  document.querySelector('#settingActivityStart').value = settings.activity_start_date || ''
  document.querySelector('#settingSocialRate').value = num(settings.micro_social_rate)
  document.querySelector('#settingTaxRate').value = num(settings.income_tax_rate)
  document.querySelector('#settingVatBase').value = num(settings.vat_base_threshold)
  document.querySelector('#settingVatMajor').value = num(settings.vat_major_threshold)
  document.querySelector('#settingMicroThreshold').value = num(settings.micro_threshold)

  const dateInput = document.querySelector('#expenseDate')
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0,10)
}

async function savePilotageSettings() {
  const msg = document.querySelector('#settingsMsg')
  msg.textContent = 'Enregistrement…'

  const { error } = await supabase.rpc('update_pilotage_settings', {
    p_activity_start_date: document.querySelector('#settingActivityStart').value || null,
    p_micro_social_rate: Number(document.querySelector('#settingSocialRate').value || 0),
    p_income_tax_rate: Number(document.querySelector('#settingTaxRate').value || 0),
    p_vat_base_threshold: Number(document.querySelector('#settingVatBase').value || 0),
    p_vat_major_threshold: Number(document.querySelector('#settingVatMajor').value || 0),
    p_micro_threshold: Number(document.querySelector('#settingMicroThreshold').value || 0)
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  msg.textContent = 'Paramètres enregistrés.'
  await loadData()
}


// =========================================================
// SPRINT 4 — CAISSE & TRÉSORERIE
// =========================================================

function isoDate(value) {
  return new Date(value).toISOString().slice(0,10)
}

function localDateKey(value) {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function paymentsForDate(date) {
  const saleIds = new Set(
    sales.filter(s => s.status === 'completed' && localDateKey(s.sold_at) === date).map(s => s.id)
  )
  return payments.filter(p => saleIds.has(p.sale_id) && (p.status || 'completed') === 'completed')
}

function expectedByMethod(date) {
  const rows = paymentsForDate(date)
  const sum = method => rows
    .filter(p => p.payment_method === method)
    .reduce((acc,p) => acc + num(p.amount), 0)
  return {
    card: sum('card'),
    cash: sum('cash'),
    cheque: sum('cheque')
  }
}

function renderTreasury() {
  const section = document.querySelector('#treasury')
  if (!section || !settings) return

  const today = new Date().toISOString().slice(0,10)
  const closingDate = document.querySelector('#closingDate')
  if (closingDate && !closingDate.value) closingDate.value = today

  const forecastDate = document.querySelector('#forecastDate')
  if (forecastDate && !forecastDate.value) forecastDate.value = today

  const todayExpected = expectedByMethod(today)
  const latestClosing = cashClosings[0]
  const currentBalance = num(settings.current_bank_balance)
  const forecast = treasuryForecast()

  document.querySelector('#treasuryKpis').innerHTML = `
    <div class="card kpi"><div class="muted">CB théorique aujourd'hui</div><div class="kpi-value">${eur(todayExpected.card)}</div></div>
    <div class="card kpi"><div class="muted">Espèces théoriques aujourd'hui</div><div class="kpi-value">${eur(todayExpected.cash)}</div></div>
    <div class="card kpi"><div class="muted">Solde bancaire saisi</div><div class="kpi-value">${eur(currentBalance)}</div></div>
    <div class="card kpi"><div class="muted">Prévision J+30</div><div class="kpi-value">${eur(forecast.d30)}</div></div>
  `

  document.querySelector('#currentBankBalance').value = currentBalance.toFixed(2)
  renderClosingExpected()
  renderClosings()
  renderBankTransactions()
  renderCardReconciliation()
  renderBankRules()
  renderForecastEvents()
  renderForecastBars(forecast)
}

function renderClosingExpected() {
  const date = document.querySelector('#closingDate')?.value
  const box = document.querySelector('#closingExpected')
  if (!date || !box) return
  const expected = expectedByMethod(date)
  const existing = cashClosings.find(c => c.closing_date === date)
  box.innerHTML = `
    <div class="row space"><span>CB théorique</span><b>${eur(expected.card)}</b></div>
    <div class="row space"><span>Espèces théoriques</span><b>${eur(expected.cash)}</b></div>
    <div class="row space"><span>Chèques</span><b>${eur(expected.cheque)}</b></div>
    ${existing ? `<div class="small" style="margin-top:5px">Une clôture existe déjà pour cette date : elle sera mise à jour.</div>` : ''}
  `
  if (existing && document.querySelector('#cashCounted')) {
    document.querySelector('#cashCounted').value = num(existing.cash_counted).toFixed(2)
    document.querySelector('#closingNote').value = existing.note || ''
  }
}

async function saveCashClosing() {
  const msg = document.querySelector('#closingMsg')
  const date = document.querySelector('#closingDate').value
  const cashCounted = Number(document.querySelector('#cashCounted').value || 0)
  const note = document.querySelector('#closingNote').value.trim() || null
  const expected = expectedByMethod(date)

  msg.textContent = 'Enregistrement…'

  const payload = {
    organization_id: organizationId,
    closing_date: date,
    card_total_expected: expected.card,
    cash_total_expected: expected.cash,
    cheque_total_expected: expected.cheque,
    cash_counted: cashCounted,
    cash_variance: Number((cashCounted - expected.cash).toFixed(2)),
    note
  }

  const existing = cashClosings.find(c => c.closing_date === date)
  const query = existing
    ? supabase.from('cash_closings').update(payload).eq('id', existing.id)
    : supabase.from('cash_closings').insert(payload)

  const { error } = await query
  if (error) return msg.textContent = 'Erreur : ' + error.message

  msg.textContent = 'Clôture enregistrée.'
  await loadData()
}

function renderClosings() {
  const body = document.querySelector('#closingRows')
  if (!body) return
  body.innerHTML = cashClosings.slice(0,20).map(c => `
    <tr>
      <td>${fmtDate(c.closing_date)}</td>
      <td>${eur(c.card_total_expected)}</td>
      <td>${eur(c.cash_total_expected)}</td>
      <td>${eur(c.cash_counted)}</td>
      <td class="${Math.abs(num(c.cash_variance)) > 0.01 ? 'low' : ''}">${eur(c.cash_variance)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="muted">Aucune clôture enregistrée.</td></tr>'
}

async function saveBankBalance() {
  const msg = document.querySelector('#bankBalanceMsg')
  msg.textContent = 'Enregistrement…'
  const { error } = await supabase.rpc('update_treasury_settings', {
    p_current_bank_balance: Number(document.querySelector('#currentBankBalance').value || 0)
  })
  if (error) return msg.textContent = 'Erreur : ' + error.message
  msg.textContent = 'Solde enregistré.'
  await loadData()
}

function autoCategory(label) {
  const value = String(label || '').toLowerCase()
  const rule = bankRules
    .filter(r => r.active !== false)
    .sort((a,b) => num(a.priority) - num(b.priority))
    .find(r => value.includes(String(r.keyword || '').toLowerCase()))
  return rule?.category || ''
}

function normalizeBankRow(row) {
  const aliases = key => {
    const map = {
      date: ['date','date_operation','date operation','dateop','date de l operation','date opération','operation_date'],
      valueDate: ['date_valeur','date valeur','value_date'],
      label: ['libelle','libellé','label','description','operation','opération'],
      amount: ['montant','amount','net','somme'],
      debit: ['debit','débit'],
      credit: ['credit','crédit']
    }
    const entries = Object.entries(row)
    for (const alias of map[key]) {
      const hit = entries.find(([k]) => k.trim().toLowerCase() === alias)
      if (hit) return hit[1]
    }
    return ''
  }

  let amount = parseNumber(aliases('amount'), NaN)
  if (!Number.isFinite(amount)) {
    const debit = parseNumber(aliases('debit'), 0)
    const credit = parseNumber(aliases('credit'), 0)
    amount = credit - debit
  }

  const rawDate = String(aliases('date')).trim()
  const parts = rawDate.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  const date = parts
    ? `${parts[3].length === 2 ? '20'+parts[3] : parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
    : rawDate.slice(0,10)

  const label = String(aliases('label')).trim()
  return {
    transaction_date: date,
    value_date: String(aliases('valueDate') || '').trim() || null,
    label,
    amount,
    category: autoCategory(label),
    source: 'csv'
  }
}

async function importBankCsv(file) {
  if (!file) return
  const summary = document.querySelector('#bankImportSummary')
  summary.style.display = 'block'
  summary.textContent = 'Lecture du fichier…'

  try {
    const rows = parseCsv(await file.text()).map(normalizeBankRow)
      .filter(r => r.transaction_date && r.label && Number.isFinite(r.amount))

    if (!rows.length) throw new Error('Aucune ligne bancaire exploitable détectée.')

    // Déduplication simple : date + libellé + montant
    const existingKeys = new Set(bankTransactions.map(t =>
      `${t.transaction_date}|${String(t.label).trim().toLowerCase()}|${num(t.amount).toFixed(2)}`
    ))

    const uniqueRows = rows.filter(r => !existingKeys.has(
      `${r.transaction_date}|${r.label.trim().toLowerCase()}|${num(r.amount).toFixed(2)}`
    ))

    if (!uniqueRows.length) {
      summary.textContent = `${rows.length} ligne(s) lue(s), aucune nouvelle transaction à importer.`
      document.querySelector('#bankCsvInput').value = ''
      return
    }

    const payload = uniqueRows.map(r => ({ ...r, organization_id: organizationId }))
    const { error } = await supabase.from('bank_transactions').insert(payload)
    if (error) throw error

    summary.textContent = `${rows.length} ligne(s) lue(s) · ${uniqueRows.length} nouvelle(s) transaction(s) importée(s) · ${rows.length - uniqueRows.length} doublon(s) ignoré(s).`
    document.querySelector('#bankCsvInput').value = ''
    await loadData()
  } catch (error) {
    summary.textContent = 'Erreur import : ' + error.message
  }
}

function renderBankTransactions() {
  const body = document.querySelector('#bankRows')
  if (!body) return

  body.innerHTML = bankTransactions.slice(0,100).map(t => `
    <tr>
      <td>${fmtDate(t.transaction_date)}</td>
      <td>${esc(t.label)}</td>
      <td class="${num(t.amount) < 0 ? 'low' : ''}">${eur(t.amount)}</td>
      <td>
        <input class="field compact bank-cat-input" data-id="${t.id}" value="${esc(t.category || '')}" placeholder="À catégoriser">
      </td>
      <td><button class="secondary save-bank-cat" data-id="${t.id}">Enregistrer</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="muted">Aucune transaction bancaire importée.</td></tr>'

  document.querySelectorAll('.save-bank-cat').forEach(btn => btn.onclick = async () => {
    const input = document.querySelector(`.bank-cat-input[data-id="${btn.dataset.id}"]`)
    const { error } = await supabase.from('bank_transactions')
      .update({ category: input.value.trim() || null })
      .eq('id', btn.dataset.id)
    if (error) return alert(error.message)
    await loadData()
  })
}

function cardExpectedByDay() {
  const map = new Map()
  for (const p of payments.filter(p => p.payment_method === 'card' && (p.status || 'completed') === 'completed')) {
    const sale = saleById(p.sale_id)
    if (!sale || sale.status !== 'completed') continue
    const date = localDateKey(sale.sold_at)
    map.set(date, (map.get(date) || 0) + num(p.amount))
  }
  return [...map.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a,b) => b.date.localeCompare(a.date))
}

function renderCardReconciliation() {
  const body = document.querySelector('#cardReconRows')
  if (!body) return

  const bankCredits = bankTransactions
    .filter(t => t.category === 'Encaissement CB' && num(t.amount) > 0)
    .map(t => ({ ...t, used: false }))
    .sort((a,b) => a.transaction_date.localeCompare(b.transaction_date))

  const expected = cardExpectedByDay().slice(0,40)
  const rows = expected.map(day => {
    const saleDate = new Date(day.date + 'T00:00:00')
    let best = null

    for (const tx of bankCredits) {
      if (tx.used) continue
      const txDate = new Date(tx.transaction_date + 'T00:00:00')
      const diffDays = Math.round((txDate - saleDate) / 86400000)
      if (diffDays < 0 || diffDays > 3) continue
      const diffAmount = Math.abs(num(tx.amount) - day.amount)
      if (!best || diffAmount < best.diffAmount) best = { tx, diffAmount, diffDays }
    }

    if (best && best.diffAmount <= Math.max(0.02, day.amount * 0.01)) best.tx.used = true

    const received = best && best.diffAmount <= Math.max(0.02, day.amount * 0.01) ? num(best.tx.amount) : 0
    const variance = received - day.amount
    const ok = received > 0 && Math.abs(variance) <= Math.max(0.02, day.amount * 0.01)

    return `
      <tr>
        <td>${fmtDate(day.date)}</td>
        <td>${eur(day.amount)}</td>
        <td>${received ? eur(received) : '—'}</td>
        <td class="${ok ? '' : 'low'}">${received ? eur(variance) : eur(-day.amount)}</td>
        <td><span class="status ${ok ? 'ok' : 'off'}">${ok ? 'Rapproché' : 'À vérifier'}</span></td>
      </tr>
    `
  })

  body.innerHTML = rows.join('') || '<tr><td colspan="5" class="muted">Aucun encaissement CB à rapprocher.</td></tr>'
}

function renderBankRules() {
  const body = document.querySelector('#bankRuleRows')
  if (!body) return
  body.innerHTML = bankRules.map(r => `
    <tr>
      <td>${esc(r.keyword)}</td>
      <td>${esc(r.category)}</td>
      <td><button class="danger delete-rule-btn" data-id="${r.id}">×</button></td>
    </tr>
  `).join('')

  document.querySelectorAll('.delete-rule-btn').forEach(btn => btn.onclick = async () => {
    const { error } = await supabase.from('bank_category_rules').delete().eq('id', btn.dataset.id)
    if (error) return alert(error.message)
    await loadData()
  })
}

async function addBankRule() {
  const msg = document.querySelector('#ruleMsg')
  const keyword = document.querySelector('#ruleKeyword').value.trim()
  const category = document.querySelector('#ruleCategory').value.trim()
  if (!keyword || !category) return msg.textContent = 'Mot-clé et catégorie obligatoires.'

  const { error } = await supabase.from('bank_category_rules').insert({
    organization_id: organizationId,
    keyword,
    category
  })
  if (error) return msg.textContent = 'Erreur : ' + error.message

  document.querySelector('#ruleKeyword').value = ''
  document.querySelector('#ruleCategory').value = ''
  msg.textContent = ''
  await loadData()
}

function futureEventOccurrences(daysAhead) {
  const now = new Date()
  now.setHours(0,0,0,0)
  const end = new Date(now)
  end.setDate(end.getDate() + daysAhead)
  const occurrences = []

  for (const e of forecastEvents.filter(e => e.active !== false)) {
    const first = new Date(e.event_date + 'T00:00:00')
    if (e.recurrence === 'monthly') {
      let d = new Date(first)
      while (d < now) d.setMonth(d.getMonth() + 1)
      while (d <= end) {
        occurrences.push({ date: new Date(d), amount: num(e.amount), type: e.event_type, label: e.label })
        d.setMonth(d.getMonth() + 1)
      }
    } else if (first >= now && first <= end) {
      occurrences.push({ date:first, amount:num(e.amount), type:e.event_type, label:e.label })
    }
  }
  return occurrences
}

function recentDailySalesAverage() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 60)

  const relevant = sales.filter(s =>
    s.status === 'completed' &&
    new Date(s.sold_at) >= start &&
    new Date(s.sold_at) <= now
  )
  const total = relevant.reduce((sum,s) => sum + num(s.total_ttc), 0)
  return total / 60
}

function seasonalityFactor(targetDate) {
  const targetMonth = targetDate.getMonth()
  const years = [...new Set(sales.map(s => dateYear(s.sold_at)))]
  const monthTotals = new Map()

  for (const s of sales.filter(s => s.status === 'completed')) {
    const key = `${dateYear(s.sold_at)}-${dateMonth(s.sold_at)}`
    monthTotals.set(key, (monthTotals.get(key) || 0) + num(s.total_ttc))
  }

  const targetValues = years.map(y => monthTotals.get(`${y}-${targetMonth}`) || 0).filter(v => v > 0)
  const allValues = [...monthTotals.values()].filter(v => v > 0)

  if (targetValues.length && allValues.length >= 3) {
    const targetAvg = targetValues.reduce((a,b)=>a+b,0) / targetValues.length
    const globalAvg = allValues.reduce((a,b)=>a+b,0) / allValues.length
    return globalAvg ? Math.max(0.4, Math.min(2.5, targetAvg / globalAvg)) : 1
  }
  return 1
}

function treasuryForecast() {
  const startBalance = num(settings.current_bank_balance)
  const dailyBase = recentDailySalesAverage()

  const calc = days => {
    const now = new Date()
    let salesForecast = 0
    for (let i=1;i<=days;i++) {
      const d = new Date(now)
      d.setDate(d.getDate()+i)
      salesForecast += dailyBase * seasonalityFactor(d)
    }

    const events = futureEventOccurrences(days)
    const eventNet = events.reduce((sum,e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0)
    return startBalance + salesForecast + eventNet
  }

  const balances = []
  for (let d=1; d<=90; d++) balances.push(calc(d))
  const low = balances.length ? Math.min(...balances) : startBalance
  const lowDay = balances.indexOf(low) + 1

  return {
    d30: calc(30),
    d60: calc(60),
    d90: calc(90),
    low,
    lowDay,
    dailyBase
  }
}

function renderForecastBars(forecast) {
  const values = [
    { label:'Aujourd’hui', value:num(settings.current_bank_balance) },
    { label:'J+30', value:forecast.d30 },
    { label:'J+60', value:forecast.d60 },
    { label:'J+90', value:forecast.d90 }
  ]
  const maxAbs = Math.max(1, ...values.map(v => Math.abs(v.value)))

  document.querySelector('#forecastBars').innerHTML = values.map(v => `
    <div class="forecast-row">
      <span>${v.label}</span>
      <div class="forecast-track"><span class="${v.value < 0 ? 'negative' : ''}" style="width:${Math.max(3, Math.abs(v.value)/maxAbs*100)}%"></span></div>
      <b>${eur(v.value)}</b>
    </div>
  `).join('')

  document.querySelector('#forecastLowPoint').innerHTML = `
    Point bas estimé sur 90 jours : <b>${eur(forecast.low)}</b> vers J+${forecast.lowDay}.
    <div class="small">Prévision basée sur le CA récent, la saisonnalité disponible et les événements saisis. Elle deviendra plus fiable avec l'historique.</div>
  `
}

function renderForecastEvents() {
  const body = document.querySelector('#forecastEventRows')
  if (!body) return
  body.innerHTML = forecastEvents.map(e => `
    <tr>
      <td>${fmtDate(e.event_date)}</td>
      <td>${esc(e.label)}</td>
      <td>${e.event_type === 'income' ? 'Encaissement' : 'Décaissement'}</td>
      <td>${eur(e.amount)}</td>
      <td>${e.recurrence === 'monthly' ? 'Mensuel' : 'Ponctuel'}</td>
      <td><button class="danger delete-forecast-btn" data-id="${e.id}">×</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="muted">Aucun événement futur saisi.</td></tr>'

  document.querySelectorAll('.delete-forecast-btn').forEach(btn => btn.onclick = async () => {
    const { error } = await supabase.from('forecast_events').delete().eq('id', btn.dataset.id)
    if (error) return alert(error.message)
    await loadData()
  })
}

async function addForecastEvent() {
  const msg = document.querySelector('#forecastEventMsg')
  const date = document.querySelector('#forecastDate').value
  const label = document.querySelector('#forecastLabel').value.trim()
  const amount = Number(document.querySelector('#forecastAmount').value || 0)
  const eventType = document.querySelector('#forecastType').value
  const recurrence = document.querySelector('#forecastRecurrence').value || null

  if (!date || !label || !(amount > 0)) return msg.textContent = 'Date, libellé et montant obligatoires.'

  const { error } = await supabase.from('forecast_events').insert({
    organization_id: organizationId,
    event_date: date,
    label,
    amount,
    event_type: eventType,
    recurrence
  })
  if (error) return msg.textContent = 'Erreur : ' + error.message

  document.querySelector('#forecastLabel').value = ''
  document.querySelector('#forecastAmount').value = ''
  msg.textContent = ''
  await loadData()
}

init()
