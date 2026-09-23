import './styles.css'
import { supabase } from './supabase'

const app = document.querySelector('#app')

let session = null
let organizationId = null
let products = []
let productPriceTiers = []
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
let discountPercent = 0
let commercialGiftAmount = 0
let pendingImport = null
let managementExpenses = []
let cashClosings = []
let bankTransactions = []
let bankRules = []
let forecastEvents = []
let remittanceBatches = []
let remittanceItems = []
let pendingBankImport = null
let offlineSnapshot = null
let offlineQueue = []
let installPrompt = null

const eur = value => Number(value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const eur0 = value => Math.round(Number(value || 0)).toLocaleString('fr-FR') + ' €'
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
          <button data-tab="remittances">Remises & caisse</button>
          <button data-tab="pilotage">Pilotage</button>
          <button data-tab="treasury">Caisse & trésorerie</button>
          <button data-tab="backup">Sauvegarde & appareil</button>
          <button data-tab="settings">Paramètres</button>
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
                <button class="pay" data-pay="gift">Offert</button>
              </div>

              <button id="mixedBtn" class="secondary" style="width:100%;margin-top:8px">Paiement mixte</button>
              <div id="mixedBox" style="display:none">
                <div class="mixed-payment-grid" style="margin-top:8px">
                  <input id="mixCard" class="field" type="number" min="0" step="0.01" placeholder="CB €">
                  <input id="mixCash" class="field" type="number" min="0" step="0.01" placeholder="Espèces €">
                  <input id="mixCheque" class="field" type="number" min="0" step="0.01" placeholder="Chèque €">
                  <input id="mixGift" class="field" type="number" min="0" step="0.01" placeholder="Offert €">
                </div>
                <div class="small" style="margin-top:5px">Le montant « Offert » sort le produit du stock sans créer d’encaissement.</div>
              </div>

              <div class="sale-adjustments">
                <div>
                  <label class="small">Remise</label>
                  <div class="discount-buttons">
                    <button type="button" class="secondary discount-btn active" data-discount="0">0 %</button>
                    <button type="button" class="secondary discount-btn" data-discount="5">5 %</button>
                    <button type="button" class="secondary discount-btn" data-discount="10">10 %</button>
                    <button type="button" class="secondary discount-btn" data-discount="20">20 %</button>
                    <input id="customDiscount" class="field compact discount-custom" type="number" min="0" max="100" step="0.5" placeholder="% libre">
                  </div>
                </div>
                <div class="margin-panel">
                  <div class="small">Marge ticket estimée</div>
                  <div class="row space"><span>Avant geste</span><b id="marginBefore">—</b></div>
                  <div class="row space"><span id="marginAfterLabel">Après remise / offert</span><b id="marginAfter">—</b></div>
                  <div id="marginHint" class="small"></div>
                </div>
              </div>

              <div id="ticketAdjustments" class="ticket-adjustments">
                <div class="row space"><span>Sous-total</span><span id="cartSubtotal">0,00 €</span></div>
                <div class="row space"><span>Remise</span><span id="discountDisplay">0,00 €</span></div>
                <div class="row space"><span>Offert</span><span id="giftDisplay">0,00 €</span></div>
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
                    <th>Réf.</th><th>Produit</th><th>Catégorie</th><th>Sous-famille</th><th>Stock</th>
                    <th>Achat HT</th><th>Tarifs</th><th>Cadeau</th><th>Statut</th>
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
        <section id="remittances" class="section">
          <div class="top">
            <div>
              <h1>Remises & caisse</h1>
              <div class="muted">Suivi des espèces, chèques, fonds de caisse et dépôts bancaires.</div>
            </div>
            <button id="refreshRemittancesBtn" class="secondary">Actualiser</button>
          </div>

          <div class="card remittance-toolbar">
            <div>
              <label class="small">Mois</label>
              <input id="remittanceMonth" class="field compact" type="month">
            </div>
            <div class="remittance-date-range">
              <div>
                <label class="small">Du</label>
                <input id="remittanceDateFrom" class="field compact" type="date">
              </div>
              <div>
                <label class="small">Au</label>
                <input id="remittanceDateTo" class="field compact" type="date">
              </div>
              <button id="resetRemittanceRangeBtn" class="secondary">Mois complet</button>
            </div>
            <div class="cash-float-settings">
              <div>
                <label class="small">Fonds de caisse cible</label>
                <div class="row">
                  <input id="cashFloatTarget" class="field compact" type="number" min="0" step="1" placeholder="200">
                  <span>€</span>
                </div>
              </div>
              <div>
                <label class="small">ou % des espèces encaissées</label>
                <div class="row">
                  <input id="cashFloatTargetPercent" class="field compact" type="number" min="0" max="100" step="1" placeholder="20">
                  <span>%</span>
                </div>
              </div>
              <div class="cash-float-proposal">
                <div class="small">Montant proposé sur la période</div>
                <b id="cashFloatComputed">—</b>
              </div>
              <button id="saveCashFloatTargetBtn" class="secondary">Enregistrer</button>
            </div>
            <div id="cashFloatMsg" class="small"></div>
          </div>

          <div id="remittanceKpis" class="kpi-grid" style="margin-top:14px"></div>

          <div class="card" style="margin-top:14px">
            <div class="top compact-top">
              <div>
                <h2>Espèces</h2>
                <div class="small">Sélectionne les encaissements à conserver physiquement ou à regrouper dans une remise bancaire.</div>
              </div>
              <div class="row">
                <button id="toggleAllCashBtn" class="secondary">Tout cocher</button>
                <button id="suggestCashDepositBtn" class="secondary">Proposer une remise</button>
              </div>
            </div>
            <div id="cashSuggestion" class="notice" style="margin:8px 0"></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th></th><th>N° vente</th><th>Date</th><th>Montant</th><th>Affectation</th></tr></thead>
                <tbody id="cashRemittanceRows"></tbody>
              </table>
            </div>
            <div class="remittance-selection-total">Sélection : <b id="cashSelectionTotal">0,00 €</b></div>
            <div class="remittance-actions">
              <input id="cashRemittanceName" class="field" placeholder="Nom facultatif — ex. ESP-2026-001">
              <input id="cashDepositDate" class="field" type="date" title="Date de dépôt">
              <button id="keepCashReserveBtn" class="secondary">Conserver en caisse</button>
              <button id="createCashDepositBtn" class="primary">Créer la remise espèces</button>
            </div>
            <div id="cashRemittanceMsg" class="small"></div>
          </div>

          <div class="card" style="margin-top:14px">
            <div class="top compact-top">
              <div>
                <h2>Chèques</h2>
                <div class="small">Regroupe les chèques en remise puis renseigne leur dépôt et leur crédit sur le compte.</div>
              </div>
              <button id="toggleAllChequeBtn" class="secondary">Tout cocher</button>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th></th><th>N° vente</th><th>Date</th><th>Montant</th><th>Affectation</th></tr></thead>
                <tbody id="chequeRemittanceRows"></tbody>
              </table>
            </div>
            <div class="remittance-selection-total">Sélection : <b id="chequeSelectionTotal">0,00 €</b></div>
            <div class="remittance-actions">
              <input id="chequeRemittanceName" class="field" placeholder="Nom facultatif — ex. CHQ-2026-001">
              <input id="chequeDepositDate" class="field" type="date" title="Date de dépôt">
              <button id="createChequeDepositBtn" class="primary">Créer la remise chèques</button>
            </div>
            <div id="chequeRemittanceMsg" class="small"></div>
          </div>

          <div class="card" style="margin-top:14px">
            <h2>Remises et fonds de caisse</h2>
            <div class="small">Une remise passe de Préparée à Déposée puis Créditée. Une date de crédit permet le rapprochement avec le relevé bancaire.</div>
            <div class="table-wrap" style="margin-top:10px">
              <table>
                <thead>
                  <tr><th>N°</th><th>Type</th><th>Montant</th><th>Statut</th><th>Préparée</th><th>Dépôt</th><th>Crédit bancaire</th><th>Actions</th></tr>
                </thead>
                <tbody id="remittanceBatchRows"></tbody>
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

        <section id="backup" class="section">
          <div class="top">
            <div>
              <h1>Sauvegarde & appareil</h1>
              <div class="muted">Installation tablette, fonctionnement hors ligne et sauvegarde complète.</div>
            </div>
            <button id="refreshBackupBtn" class="secondary">Actualiser</button>
          </div>

          <div class="kpi-grid">
            <div class="card kpi">
              <div class="muted">Connexion</div>
              <div id="connectionStatus" class="kpi-value">—</div>
            </div>
            <div class="card kpi">
              <div class="muted">Ventes en attente de synchro</div>
              <div id="offlineQueueCount" class="kpi-value">0</div>
            </div>
            <div class="card kpi">
              <div class="muted">Dernière sauvegarde locale</div>
              <div id="lastBackupLabel" class="kpi-value smallish">Jamais</div>
            </div>
            <div class="card kpi">
              <div class="muted">Dernière synchro</div>
              <div id="lastSyncLabel" class="kpi-value smallish">—</div>
            </div>
          </div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Installer sur la tablette</h2>
              <p class="muted">
                L'application peut être installée comme une application classique depuis Chrome/Edge.
                Elle s'ouvrira en plein écran depuis l'écran d'accueil.
              </p>
              <button id="installAppBtn" class="primary">Installer l'application</button>
              <div id="installMsg" class="small" style="margin-top:8px"></div>
              <div class="notice" style="margin-top:12px">
                Si le bouton n'est pas disponible, utilise le menu du navigateur :
                « Installer l'application » / « Ajouter à l'écran d'accueil ».
              </div>
            </div>

            <div class="card">
              <h2>Mode hors ligne</h2>
              <p class="muted">
                Le catalogue produits et clients est mémorisé sur l'appareil.
                Une vente saisie sans internet est conservée localement puis envoyée à Supabase dès que la connexion revient.
              </p>
              <button id="syncNowBtn" class="primary">Synchroniser maintenant</button>
              <div id="syncMsg" class="small" style="margin-top:8px"></div>
              <div id="offlineQueuePreview" class="table-wrap" style="margin-top:12px"></div>
            </div>
          </div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Sauvegarde complète</h2>
              <p class="muted">
                Télécharge un fichier JSON contenant toutes les tables utiles de l'application.
                Ce fichier est la sauvegarde restaurable de référence.
              </p>
              <button id="exportFullBackupBtn" class="primary">Exporter la sauvegarde complète</button>
              <div id="backupMsg" class="small" style="margin-top:8px"></div>
              <div class="notice" style="margin-top:12px">
                Recommandation pilote : faire une sauvegarde au minimum chaque semaine,
                et avant toute importation massive ou modification importante.
              </div>
            </div>

            <div class="card">
              <h2>Exports de lecture</h2>
              <p class="muted">
                Les CSV restent utiles pour Excel et les contrôles, mais ne remplacent pas la sauvegarde JSON complète.
              </p>
              <div class="actions">
                <button id="backupProductsCsvBtn" class="secondary">Produits CSV</button>
                <button id="backupClientsCsvBtn" class="secondary">Clients CSV</button>
                <button id="backupSalesCsvBtn" class="secondary">Ventes CSV</button>
                <button id="backupLinesCsvBtn" class="secondary">Lignes CSV</button>
                <button id="backupPaymentsCsvBtn" class="secondary">Paiements CSV</button>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:14px">
            <h2>Journal technique local</h2>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Élément</th><th>Valeur</th></tr></thead>
                <tbody id="backupTechRows"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="settings" class="section">
          <div class="top">
            <div>
              <h1>Paramètres</h1>
              <div class="muted">Réglages généraux de l'application et du commerce.</div>
            </div>
            <button id="refreshSettingsBtn" class="secondary">Actualiser</button>
          </div>

          <div class="grid pilotage-grid">
            <div class="card">
              <h2>Catégories produits</h2>
              <div class="row">
                <input id="newCategoryName" class="field" placeholder="Nouvelle catégorie">
                <button id="addCategoryBtn" class="primary">Ajouter</button>
              </div>
              <div id="categoryMsg" class="small" style="margin-top:6px"></div>
              <div class="table-wrap" style="margin-top:12px">
                <table>
                  <thead><tr><th>Ordre</th><th>Nom</th><th>Statut</th><th>Actions</th></tr></thead>
                  <tbody id="categoryRows"></tbody>
                </table>
              </div>
            </div>

            <div class="card">
              <h2>Fidélité</h2>
              <label class="small">Nombre de passages nécessaires pour obtenir un cadeau</label>
              <input id="settingLoyaltyVisits" class="field" type="number" min="1" step="1">
              <button id="saveLoyaltyBtn" class="primary" style="margin-top:8px">Enregistrer la fidélité</button>
              <div id="loyaltyMsg" class="small" style="margin-top:6px"></div>

              <div class="notice" style="margin-top:12px">
                Les produits pouvant être offerts restent définis directement dans la fiche produit via l'option « Cadeau ».
              </div>

              <h2 style="margin-top:22px">Modes de paiement</h2>
              <div class="notice">
                Les modes actuellement activés sont : CB, espèces et chèque.
                Ils sont conservés comme paramètres fixes pour cette première version.
              </div>
            </div>
          </div>

          <div class="grid pilotage-grid" style="margin-top:14px">
            <div class="card">
              <h2>Pilotage fiscal</h2>

              <label class="small">Date de début d'activité</label>
              <input id="appSettingActivityStart" class="field" type="date">

              <div class="grid" style="margin-top:8px">
                <div>
                  <label class="small">Cotisations sociales %</label>
                  <input id="appSettingSocialRate" class="field" type="number" step="0.01">
                </div>
                <div>
                  <label class="small">Versement libératoire %</label>
                  <input id="appSettingTaxRate" class="field" type="number" step="0.01">
                </div>
              </div>

              <div class="grid" style="margin-top:8px">
                <div>
                  <label class="small">TVA seuil de base €</label>
                  <input id="appSettingVatBase" class="field" type="number">
                </div>
                <div>
                  <label class="small">TVA seuil majoré €</label>
                  <input id="appSettingVatMajor" class="field" type="number">
                </div>
              </div>

              <label class="small" style="display:block;margin-top:8px">Seuil micro €</label>
              <input id="appSettingMicroThreshold" class="field" type="number">

              <button id="saveAppSettingsBtn" class="primary" style="margin-top:10px">Enregistrer les paramètres</button>
              <div id="appSettingsMsg" class="small" style="margin-top:6px"></div>
            </div>

            <div class="card">
              <h2>Catégorisation bancaire</h2>
              <div class="small">Ces règles sont aussi utilisées dans l'onglet Caisse & trésorerie.</div>
              <div class="grid" style="margin-top:10px">
                <input id="settingsRuleKeyword" class="field" placeholder="Mot-clé du libellé">
                <input id="settingsRuleCategory" class="field" placeholder="Catégorie">
              </div>
              <button id="settingsAddBankRuleBtn" class="primary" style="margin-top:8px">Ajouter la règle</button>
              <div id="settingsRuleMsg" class="small" style="margin-top:6px"></div>
              <div class="table-wrap" style="margin-top:10px">
                <table>
                  <thead><tr><th>Mot-clé</th><th>Catégorie</th><th></th></tr></thead>
                  <tbody id="settingsBankRuleRows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>

    <dialog id="productDialog">
      <form method="dialog" class="card dialog-card product-dialog-card">
        <h2>Nouveau produit</h2>

        <label class="small">Nom</label>
        <input id="pName" class="field" placeholder="Ex. Gingembre moulu">

        <div class="grid product-form-grid" style="margin-top:8px">
          <div>
            <label class="small">Catégorie</label>
            <select id="pCategory" class="field"></select>
          </div>
          <div>
            <label class="small">Sous-famille</label>
            <input id="pSubfamily" class="field" placeholder="Ex. Racines, Poivres, Thé noir">
          </div>
        </div>

        <label class="small" style="display:block;margin-top:10px">Comment ce produit est-il vendu ?</label>
        <select id="pPricingMode" class="field">
          <option value="tiered_weight">Au poids — tarifs 25 / 50 / 100 / 200 g</option>
          <option value="fixed_unit">À l’unité — prix fixe</option>
          <option value="free_unit">À l’unité — prix saisi au moment de la vente</option>
        </select>
        <div id="productPricingHelp" class="notice product-pricing-help" style="margin-top:8px"></div>

        <div class="grid product-form-grid" style="margin-top:10px">
          <div>
            <label id="pStockLabel" class="small">Stock initial (g)</label>
            <input id="pStock" type="number" class="field" min="0" placeholder="Ex. 1000">
          </div>
          <div>
            <label id="pThresholdLabel" class="small">Alerte stock (g)</label>
            <input id="pThreshold" type="number" class="field" min="0" placeholder="Ex. 200">
          </div>
        </div>

        <div style="margin-top:10px">
          <label id="pBuyLabel" class="small">Coût d’achat HT pour 100 g</label>
          <input id="pBuy" type="number" min="0" step="0.01" class="field" placeholder="Ex. 3,20">
          <div id="pBuyHelp" class="small">Utilisé uniquement pour calculer la marge. Laisser à 0 si le coût n’est pas encore connu.</div>
        </div>

        <div id="fixedPriceBlock" style="display:none;margin-top:10px">
          <label class="small">Prix de vente par unité</label>
          <input id="pSell" type="number" min="0" step="0.01" class="field" placeholder="Ex. 12,00">
        </div>

        <div id="tierPriceBlock" style="margin-top:12px">
          <div class="small"><b>Tarifs de vente par palier</b> — remplir uniquement les grammages réellement proposés.</div>
          <div class="grid tier-editor" style="margin-top:7px">
            <div><label class="small">25 g</label><input id="pPrice25" type="number" min="0" step="0.01" class="field" placeholder="€"></div>
            <div><label class="small">50 g</label><input id="pPrice50" type="number" min="0" step="0.01" class="field" placeholder="€"></div>
            <div><label class="small">100 g</label><input id="pPrice100" type="number" min="0" step="0.01" class="field" placeholder="€"></div>
            <div><label class="small">200 g</label><input id="pPrice200" type="number" min="0" step="0.01" class="field" placeholder="€"></div>
          </div>
          <div class="small" style="margin-top:5px">Entre deux paliers, l’application calcule automatiquement le prix par interpolation.</div>
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
  document.querySelector('#pPricingMode').onchange = updateProductPricingForm
  document.querySelector('#saveClientBtn').onclick = saveCustomer
  document.querySelector('#validateSale').onclick = completeSale
  document.querySelector('#saveLoyaltyBtn').onclick = saveLoyaltySettings

  document.querySelectorAll('.discount-btn').forEach(btn => btn.onclick = () => {
    discountPercent = Number(btn.dataset.discount || 0)
    document.querySelectorAll('.discount-btn').forEach(x => x.classList.toggle('active', x === btn))
    document.querySelector('#customDiscount').value = ''
    if (paymentMode === 'gift' && document.querySelector('#mixedBox').style.display === 'none') {
      commercialGiftAmount = ticketAfterDiscountHt()
    }
    renderCart()
  })
  document.querySelector('#customDiscount').oninput = event => {
    discountPercent = Math.max(0, Math.min(100, Number(event.target.value || 0)))
    document.querySelectorAll('.discount-btn').forEach(x => x.classList.remove('active'))
    if (paymentMode === 'gift' && document.querySelector('#mixedBox').style.display === 'none') {
      commercialGiftAmount = ticketAfterDiscountHt()
    }
    renderCart()
  }

  document.querySelector('#mixedBtn').onclick = () => {
    const box = document.querySelector('#mixedBox')
    box.style.display = box.style.display === 'none' ? 'block' : 'none'
    if (box.style.display !== 'none') {
      paymentMode = 'mixed'
      document.querySelectorAll('.pay').forEach(x => x.classList.remove('active'))
      commercialGiftAmount = Number(document.querySelector('#mixGift')?.value || 0)
    } else {
      paymentMode = 'card'
      document.querySelectorAll('.pay').forEach(x => x.classList.toggle('active', x.dataset.pay === 'card'))
      commercialGiftAmount = 0
    }
    renderCart()
  }
  ;['mixCard','mixCash','mixCheque','mixGift'].forEach(id => {
    const input = document.querySelector('#'+id)
    if (input) input.oninput = () => {
      if (id === 'mixGift') commercialGiftAmount = Math.max(0, Number(input.value || 0))
      renderTicketSummary()
    }
  })

  document.querySelectorAll('.pay').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.pay').forEach(x => x.classList.remove('active'))
    btn.classList.add('active')
    paymentMode = btn.dataset.pay
    document.querySelector('#mixedBox').style.display = 'none'
    commercialGiftAmount = paymentMode === 'gift' ? ticketAfterDiscountHt() : 0
    renderCart()
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
  document.querySelector('#refreshRemittancesBtn').onclick = loadData
  document.querySelector('#remittanceMonth').onchange = () => {
    resetRemittanceRangeToMonth()
    renderRemittances()
  }
  document.querySelector('#remittanceDateFrom').onchange = renderRemittances
  document.querySelector('#remittanceDateTo').onchange = renderRemittances
  document.querySelector('#resetRemittanceRangeBtn').onclick = () => {
    resetRemittanceRangeToMonth()
    renderRemittances()
  }
  document.querySelector('#toggleAllCashBtn').onclick = () => toggleAllRemittanceChecks('cash')
  document.querySelector('#toggleAllChequeBtn').onclick = () => toggleAllRemittanceChecks('cheque')
  document.querySelector('#cashFloatTarget').oninput = () => {
    document.querySelector('#cashFloatTargetPercent').value = ''
    refreshCashFloatProposal()
  }
  document.querySelector('#cashFloatTargetPercent').oninput = () => {
    refreshCashFloatProposal(true)
  }
  document.querySelector('#saveCashFloatTargetBtn').onclick = saveCashFloatTarget
  document.querySelector('#suggestCashDepositBtn').onclick = suggestCashDeposit
  document.querySelector('#keepCashReserveBtn').onclick = () => createRemittanceFromSelection('cash','cash_reserve')
  document.querySelector('#createCashDepositBtn').onclick = () => createRemittanceFromSelection('cash','bank_deposit')
  document.querySelector('#createChequeDepositBtn').onclick = () => createRemittanceFromSelection('cheque','bank_deposit')
  document.querySelector('#refreshPilotageBtn').onclick = loadData
  document.querySelector('#addExpenseBtn').onclick = addManagementExpense
  document.querySelector('#refreshTreasuryBtn').onclick = loadData
  document.querySelector('#closingDate').onchange = renderClosingExpected
  document.querySelector('#saveClosingBtn').onclick = saveCashClosing
  document.querySelector('#saveBankBalanceBtn').onclick = saveBankBalance
  document.querySelector('#bankCsvInput').onchange = event => importBankCsv(event.target.files?.[0])
  document.querySelector('#addBankRuleBtn').onclick = addBankRule
  document.querySelector('#addForecastEventBtn').onclick = addForecastEvent
  document.querySelector('#refreshBackupBtn').onclick = renderBackupPanel
  document.querySelector('#installAppBtn').onclick = installPwa
  document.querySelector('#syncNowBtn').onclick = syncOfflineQueue
  document.querySelector('#exportFullBackupBtn').onclick = exportFullBackup
  document.querySelector('#backupProductsCsvBtn').onclick = exportProducts
  document.querySelector('#backupClientsCsvBtn').onclick = exportClients
  document.querySelector('#backupSalesCsvBtn').onclick = exportSales
  document.querySelector('#backupLinesCsvBtn').onclick = exportSaleLines
  document.querySelector('#backupPaymentsCsvBtn').onclick = exportPayments
  document.querySelector('#refreshSettingsBtn').onclick = renderSettings
  document.querySelector('#addCategoryBtn').onclick = addCategory
  document.querySelector('#saveAppSettingsBtn').onclick = saveAppSettings
  document.querySelector('#settingsAddBankRuleBtn').onclick = addBankRuleFromSettings
}

function switchTab(btn) {
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'))
  btn.classList.add('active')
  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'))
  const tab = btn.dataset.tab
  document.querySelector('#' + tab).classList.add('active')

  // Rendu à l'ouverture : évite un écran vide si un autre panneau a rencontré une erreur auparavant.
  if (tab === 'remittances') renderRemittances()
  if (tab === 'pilotage') renderPilotage()
  if (tab === 'treasury') renderTreasury()
  if (tab === 'settings') renderSettings()
  if (tab === 'backup') renderBackupPanel()
}

async function loadData() {
  loadOfflineState()

  if (!navigator.onLine) {
    if (!useOfflineSnapshot()) showGlobalError('Hors ligne et aucune donnée locale disponible. Connecte une première fois l’appareil à internet.')
    return
  }

  const profileRes = await supabase.from('user_profiles').select('organization_id').single()
  if (profileRes.error) {
    if (!useOfflineSnapshot()) showGlobalError(profileRes.error.message)
    return
  }
  organizationId = profileRes.data.organization_id

  const [
    categoriesRes, productsRes, tiersRes, customersRes, settingsRes,
    loyaltyRes, salesRes, linesRes, paymentsRes, expensesRes,
    closingsRes, bankRes, rulesRes, forecastRes, remittanceBatchesRes, remittanceItemsRes
  ] = await Promise.all([
    supabase.from('product_categories').select('id,name,active,sort_order').order('sort_order'),
    supabase.from('products').select('*').order('name'),
    supabase.from('product_price_tiers').select('*').eq('active',true).order('quantity'),
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
    supabase.from('forecast_events').select('*').eq('active', true).order('event_date').limit(1000),
    supabase.from('remittance_batches').select('*').order('prepared_at', { ascending:false }).limit(2000),
    supabase.from('remittance_items').select('*').limit(10000)
  ])

  const error = [
    categoriesRes.error, productsRes.error, tiersRes.error, customersRes.error, settingsRes.error,
    loyaltyRes.error, salesRes.error, linesRes.error, paymentsRes.error, expensesRes.error,
    closingsRes.error, bankRes.error, rulesRes.error, forecastRes.error,
    remittanceBatchesRes.error, remittanceItemsRes.error
  ].find(Boolean)

  if (error) return showGlobalError(error.message)

  categories = categoriesRes.data || []
  products = productsRes.data || []
  productPriceTiers = tiersRes.data || []
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
  remittanceBatches = remittanceBatchesRes.data || []
  remittanceItems = remittanceItemsRes.data || []

  renderAll()
}

function renderAll() {
  const renderers = [
    renderSellProducts, renderCart, renderProducts, renderCustomers,
    renderSales, renderSaleLines, renderPayments, renderRemittances, renderPilotage,
    renderTreasury, renderBackupPanel, renderSettings
  ]
  for (const renderer of renderers) {
    try {
      renderer()
    } catch (error) {
      console.error('Erreur de rendu dans '+(renderer.name || 'un panneau'), error)
    }
  }
  saveOfflineSnapshot()
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

function tiersForProduct(productId) {
  return productPriceTiers
    .filter(t => t.product_id === productId && t.active !== false)
    .sort((a,b) => num(a.quantity) - num(b.quantity))
}

function productPriceSummary(product) {
  if (product.pricing_mode === 'free_unit') return 'Prix libre / unité'
  if (product.pricing_mode === 'fixed_unit') return `${eur(product.sale_price_ht)} / unité`
  const tiers = tiersForProduct(product.id)
  if (!tiers.length) return `${eur(product.sale_price_ht)} / ${num(product.sale_price_basis) || 100} ${esc(product.stock_unit)}`
  return tiers.map(t => `${num(t.quantity)} g : ${eur(t.price_ht)}`).join(' · ')
}

function interpolatedPriceHt(product, quantity) {
  const qty = Math.max(0, num(quantity))
  if (!qty) return 0
  if (product.pricing_mode === 'fixed_unit') {
    return Number((num(product.sale_price_ht) * qty / (num(product.sale_price_basis) || 1)).toFixed(2))
  }
  const tiers = tiersForProduct(product.id)
  if (!tiers.length) {
    return Number((num(product.sale_price_ht) * qty / (num(product.sale_price_basis) || 100)).toFixed(2))
  }
  const low = [...tiers].reverse().find(t => num(t.quantity) <= qty)
  const high = tiers.find(t => num(t.quantity) >= qty)
  let price = 0
  if (!low && high) price = num(high.price_ht) * qty / num(high.quantity)
  else if (low && !high) price = num(low.price_ht) * qty / num(low.quantity)
  else if (low && high && num(low.quantity) === num(high.quantity)) price = num(low.price_ht)
  else if (low && high) {
    price = num(low.price_ht) +
      ((qty-num(low.quantity))/(num(high.quantity)-num(low.quantity))) *
      (num(high.price_ht)-num(low.price_ht))
  }
  return Number(price.toFixed(2))
}

function lineGrossHt(item) {
  const product = products.find(p => p.id === item.id)
  if (!product) return 0
  if (product.pricing_mode === 'free_unit') return Number((num(item.unitPriceHt) * num(item.qty)).toFixed(2))
  return interpolatedPriceHt(product, item.qty)
}

function lineCostHt(item) {
  const product = products.find(p => p.id === item.id)
  if (!product) return 0
  return Number((num(product.purchase_price_ht) * num(item.qty) / (num(product.purchase_price_basis) || (product.stock_unit === 'g' ? 100 : 1))).toFixed(2))
}

function ticketGrossHt() {
  return Number(cart.reduce((sum,item) => sum + lineGrossHt(item),0).toFixed(2))
}

function ticketDiscountHt() {
  return Number((ticketGrossHt() * discountPercent / 100).toFixed(2))
}

function ticketAfterDiscountHt() {
  return Math.max(0, Number((ticketGrossHt() - ticketDiscountHt()).toFixed(2)))
}

function ticketGiftHt() {
  return Math.max(0, Math.min(ticketAfterDiscountHt(), Number(num(commercialGiftAmount).toFixed(2))))
}

function ticketTotal() {
  return Math.max(0, Number((ticketAfterDiscountHt() - ticketGiftHt()).toFixed(2)))
}

function renderTicketSummary() {
  const gross = ticketGrossHt()
  const discount = ticketDiscountHt()
  const gift = ticketGiftHt()
  const net = ticketTotal()
  const cost = cart.reduce((sum,item) => sum + lineCostHt(item),0)
  const missingCost = cart.some(item => {
    const p = products.find(x => x.id === item.id)
    return p && !(num(p.purchase_price_ht) > 0)
  })
  const before = gross - cost
  const after = net - cost
  const fullGesture = gross > 0 && net <= 0.005

  const totalEl = document.querySelector('#cartTotal')
  if (totalEl) totalEl.textContent = eur(net)
  if (document.querySelector('#cartSubtotal')) document.querySelector('#cartSubtotal').textContent = eur(gross)
  if (document.querySelector('#discountDisplay')) document.querySelector('#discountDisplay').textContent = discount ? '- '+eur(discount) : eur(0)
  if (document.querySelector('#giftDisplay')) document.querySelector('#giftDisplay').textContent = gift ? '- '+eur(gift) : eur(0)

  const beforeEl = document.querySelector('#marginBefore')
  const afterEl = document.querySelector('#marginAfter')
  const afterLabel = document.querySelector('#marginAfterLabel')
  const hint = document.querySelector('#marginHint')

  if (beforeEl) beforeEl.textContent = missingCost
    ? 'Partielle'
    : `${eur(before)} · ${gross ? (before/gross*100).toFixed(0) : 0} %`

  if (missingCost) {
    if (afterLabel) afterLabel.textContent = 'Après remise / offert'
    if (afterEl) afterEl.textContent = 'Partielle'
    if (hint) hint.textContent = 'Prix d’achat manquant sur au moins un produit.'
  } else if (fullGesture) {
    if (afterLabel) afterLabel.textContent = 'Coût du geste'
    if (afterEl) afterEl.textContent = eur(cost)
    if (hint) hint.textContent = 'Tout est offert : aucun CA n’est encaissé. Le coût affiché est le coût d’achat du panier.'
  } else {
    if (afterLabel) afterLabel.textContent = 'Marge après geste'
    if (afterEl) afterEl.textContent = `${eur(after)} · ${net ? (after/net*100).toFixed(0) : 0} %`
    if (hint) hint.textContent = 'Calculée à partir des coûts d’achat enregistrés.'
  }
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
        <span>${productPriceSummary(p)}</span>
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

  if (product.pricing_mode === 'free_unit') {
    const raw = prompt(`Prix de vente pour « ${product.name} » (€ par unité) :`)
    if (raw === null) return
    const unitPriceHt = Number(String(raw).replace(',','.'))
    if (!Number.isFinite(unitPriceHt) || unitPriceHt < 0) return alert('Prix invalide.')
    const lineNote = prompt('Description facultative pour cette ligne :', '') || ''
    cart.push({ id, qty:1, unitPriceHt, lineNote })
    renderCart()
    return
  }

  const tiers = tiersForProduct(id)
  const defaultQty = product.pricing_mode === 'tiered_weight'
    ? (tiers.find(t => num(t.quantity) === 100)?.quantity || tiers[0]?.quantity || 100)
    : 1
  const line = cart.find(item => item.id === id && item.unitPriceHt == null)
  if (line) line.qty += num(defaultQty)
  else cart.push({ id, qty:num(defaultQty) })
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
    const step = product.stock_unit === 'g' ? 25 : 1
    return `
      <div class="cartline">
        <div class="row space">
          <div><b>${esc(product.name)}</b>${item.lineNote ? `<div class="small">${esc(item.lineNote)}</div>` : ''}</div>
          <button class="danger remove" data-i="${index}">×</button>
        </div>
        <div class="row space">
          <div class="qty">
            <button class="secondary minus" data-i="${index}">−${step}</button>
            <input class="field qtyInput" data-i="${index}" type="number" min="1" step="1" value="${item.qty}">
            <button class="secondary plus" data-i="${index}">+${step}</button>
            <span>${esc(product.stock_unit)}</span>
          </div>
          <div style="text-align:right">
            <b>${eur(lineGrossHt(item))}</b>
            <div class="small">${product.pricing_mode === 'tiered_weight' ? 'prix interpolé selon paliers' : product.pricing_mode === 'free_unit' ? `${eur(item.unitPriceHt)} / unité` : 'prix fixe'}</div>
          </div>
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
    const step = product?.stock_unit === 'g' ? 25 : 1
    cart[index].qty = Math.max(1, cart[index].qty - step)
    renderCart()
  })

  document.querySelectorAll('.plus').forEach(btn => btn.onclick = () => {
    const index = Number(btn.dataset.i)
    const product = products.find(p => p.id === cart[index].id)
    const step = product?.stock_unit === 'g' ? 25 : 1
    cart[index].qty += step
    renderCart()
  })

  document.querySelectorAll('.qtyInput').forEach(input => input.onchange = () => {
    cart[Number(input.dataset.i)].qty = Math.max(1, Number(input.value) || 1)
    renderCart()
  })

  renderTicketSummary()
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
    if (!product) return msg.textContent = 'Produit introuvable.'
    if (item.qty > num(product.stock_quantity)) {
      return msg.textContent = `Stock insuffisant pour ${product.name}.`
    }
  }

  const afterDiscount = ticketAfterDiscountHt()
  let gift = 0
  let payRows = []
  const mixed = document.querySelector('#mixedBox').style.display !== 'none'

  if (mixed) {
    const card = Number(document.querySelector('#mixCard').value || 0)
    const cash = Number(document.querySelector('#mixCash').value || 0)
    const cheque = Number(document.querySelector('#mixCheque').value || 0)
    gift = Math.max(0, Number(document.querySelector('#mixGift').value || 0))
    if (gift > afterDiscount + 0.01) return msg.textContent = 'Le montant offert dépasse le ticket.'
    if (Math.abs(card + cash + cheque + gift - afterDiscount) > 0.01) {
      return msg.textContent = 'CB + espèces + chèque + offert doivent être égaux au total après remise.'
    }
    if (card > 0) payRows.push({ method:'card', amount:card })
    if (cash > 0) payRows.push({ method:'cash', amount:cash })
    if (cheque > 0) payRows.push({ method:'cheque', amount:cheque })
  } else if (paymentMode === 'gift') {
    gift = afterDiscount
  } else {
    gift = 0
    const amount = Number((afterDiscount - gift).toFixed(2))
    payRows = amount > 0 ? [{ method:paymentMode, amount }] : []
  }

  commercialGiftAmount = gift
  const total = Number((afterDiscount - gift).toFixed(2))
  renderTicketSummary()

  const payload = {
    local_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    customer_id: selectedCustomer?.id || null,
    lines: cart.map(item => ({
      product_id:item.id,
      quantity:item.qty,
      ...(item.unitPriceHt != null ? { unit_price_ht:item.unitPriceHt } : {}),
      ...(item.lineNote ? { line_note:item.lineNote } : {})
    })),
    payments: payRows,
    discount_percent: discountPercent,
    commercial_gift_amount: gift,
    note: gift > 0 ? 'Vente avec geste commercial offert' : null,
    total
  }

  if (!navigator.onLine) {
    queueOfflineSale(payload)
    applyOfflineSaleLocally(payload)
    clearSaleForm()
    msg.textContent = 'Vente enregistrée hors ligne. Elle sera synchronisée automatiquement dès que la connexion revient.'
    renderAll()
    return
  }

  msg.textContent = 'Enregistrement…'

  const { error } = await supabase.rpc('complete_sale_v2', {
    p_customer_id: payload.customer_id,
    p_lines: payload.lines,
    p_payments: payload.payments,
    p_discount_percent: payload.discount_percent,
    p_commercial_gift_amount: payload.commercial_gift_amount,
    p_note: payload.note
  })

  if (error) {
    if (isNetworkError(error)) {
      queueOfflineSale(payload)
      applyOfflineSaleLocally(payload)
      clearSaleForm()
      msg.textContent = 'Connexion interrompue : vente gardée hors ligne et mise en attente de synchronisation.'
      renderAll()
      return
    }
    return msg.textContent = 'Erreur : ' + error.message
  }

  msg.textContent = 'Vente enregistrée.'
  clearSaleForm()
  localStorage.setItem('lastSyncAt', new Date().toISOString())
  await loadData()
}

function renderProducts() {
  const input = document.querySelector('#productSearch')
  const body = document.querySelector('#productRows')
  if (!input || !body) return

  const query = input.value.toLowerCase().trim()
  body.innerHTML = products.filter(p =>
    p.name.toLowerCase().includes(query) ||
    String(p.sku || '').toLowerCase().includes(query) ||
    String(p.subfamily || '').toLowerCase().includes(query)
  ).map(p => {
    const category = categories.find(c => c.id === p.category_id)?.name || '—'
    return `
      <tr>
        <td>${esc(p.sku || '—')}</td>
        <td><b>${esc(p.name)}</b></td>
        <td>${esc(category)}</td>
        <td>${esc(p.subfamily || '—')}</td>
        <td>${num(p.stock_quantity).toLocaleString('fr-FR')} ${esc(p.stock_unit)}</td>
        <td>${eur(p.purchase_price_ht)}</td>
        <td><span class="small">${productPriceSummary(p)}</span></td>
        <td>${boolLabel(p.loyalty_eligible)}</td>
        <td><span class="status ${p.active ? 'ok' : 'off'}">${p.active ? 'Actif' : 'Inactif'}</span></td>
      </tr>
    `
  }).join('')
}

function loyaltyInfo(customerId) {
  const required = Number(settings?.loyalty_visits_per_reward || 10)
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

function updateProductPricingForm() {
  const mode = document.querySelector('#pPricingMode')?.value || 'tiered_weight'
  const weighted = mode === 'tiered_weight'
  const fixed = mode === 'fixed_unit'
  const free = mode === 'free_unit'

  const tierBlock = document.querySelector('#tierPriceBlock')
  const fixedBlock = document.querySelector('#fixedPriceBlock')
  if (tierBlock) tierBlock.style.display = weighted ? 'block' : 'none'
  if (fixedBlock) fixedBlock.style.display = fixed ? 'block' : 'none'

  const stockLabel = document.querySelector('#pStockLabel')
  const thresholdLabel = document.querySelector('#pThresholdLabel')
  const buyLabel = document.querySelector('#pBuyLabel')
  const help = document.querySelector('#productPricingHelp')

  if (stockLabel) stockLabel.textContent = weighted ? 'Stock initial (g)' : 'Stock initial (unités)'
  if (thresholdLabel) thresholdLabel.textContent = weighted ? 'Alerte stock (g)' : 'Alerte stock (unités)'
  if (buyLabel) buyLabel.textContent = weighted ? 'Coût d’achat HT pour 100 g' : 'Coût d’achat HT par unité'

  if (help) {
    help.innerHTML = weighted
      ? '<b>Produit vendu au poids.</b> Saisis les prix des paliers connus. Une quantité intermédiaire sera calculée automatiquement.'
      : fixed
        ? '<b>Produit vendu à l’unité.</b> Saisis son prix de vente fixe ci-dessous.'
        : '<b>Produit à prix libre.</b> Aucun prix de vente n’est enregistré ici : Benoît le saisira au moment de l’ajouter au ticket.'
  }

  if (!fixed && document.querySelector('#pSell')) document.querySelector('#pSell').value = ''
}

function openProductDialog() {
  document.querySelector('#pCategory').innerHTML = categories
    .filter(c => c.active)
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')

  ;['pName','pSubfamily','pStock','pThreshold','pBuy','pSell','pPrice25','pPrice50','pPrice100','pPrice200']
    .forEach(id => {
      const el = document.querySelector('#'+id)
      if (el) el.value = ''
    })
  document.querySelector('#pPricingMode').value = 'tiered_weight'
  document.querySelector('#productMsg').textContent = ''
  updateProductPricingForm()
  document.querySelector('#productDialog').showModal()
}

async function saveProduct() {
  const msg = document.querySelector('#productMsg')
  msg.textContent = ''

  const pricingMode = document.querySelector('#pPricingMode').value
  const stockUnit = pricingMode === 'tiered_weight' ? 'g' : 'unit'
  const tiers = [
    [25, Number(document.querySelector('#pPrice25').value || 0)],
    [50, Number(document.querySelector('#pPrice50').value || 0)],
    [100, Number(document.querySelector('#pPrice100').value || 0)],
    [200, Number(document.querySelector('#pPrice200').value || 0)]
  ].filter(([,price]) => price > 0).map(([quantity,price_ht]) => ({quantity,price_ht}))

  const fallback = tiers.find(t => t.quantity === 100) || tiers[0]
  const payload = {
    organization_id: organizationId,
    name: document.querySelector('#pName').value.trim(),
    category_id: document.querySelector('#pCategory').value || null,
    subfamily: document.querySelector('#pSubfamily').value.trim() || null,
    pricing_mode: pricingMode,
    stock_unit: stockUnit,
    purchase_unit: stockUnit === 'g' ? 'sachet' : 'unité',
    purchase_unit_quantity: stockUnit === 'g' ? 500 : 1,
    purchase_unit_stock_equivalent: stockUnit === 'g' ? 500 : 1,
    stock_quantity: Number(document.querySelector('#pStock').value || 0),
    stock_alert_threshold: Number(document.querySelector('#pThreshold').value || 0),
    purchase_price_ht: Number(document.querySelector('#pBuy').value || 0),
    purchase_price_basis: stockUnit === 'g' ? 100 : 1,
    sale_price_ht: pricingMode === 'tiered_weight'
      ? num(fallback?.price_ht)
      : Number(document.querySelector('#pSell').value || 0),
    sale_price_basis: pricingMode === 'tiered_weight'
      ? num(fallback?.quantity || 100)
      : 1
  }

  if (!payload.name) return msg.textContent = 'Nom obligatoire.'
  if (pricingMode === 'tiered_weight' && !tiers.length) return msg.textContent = 'Ajoute au moins un prix par palier.'

  const { data:created, error } = await supabase.from('products').insert(payload).select('id').single()
  if (error) return msg.textContent = error.message

  if (tiers.length) await syncProductTiers(created.id, tiers)

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
// PWA / HORS LIGNE / SAUVEGARDE
// =========================================================

function clearSaleForm() {
  cart = []
  selectedCustomer = null
  const search = document.querySelector('#customerSearch')
  if (search) search.value = ''
  const selected = document.querySelector('#selectedCustomer')
  if (selected) selected.style.display = 'none'
  const mixCard = document.querySelector('#mixCard')
  const mixCash = document.querySelector('#mixCash')
  const mixCheque = document.querySelector('#mixCheque')
  const mixGift = document.querySelector('#mixGift')
  if (mixCard) mixCard.value = ''
  if (mixCash) mixCash.value = ''
  if (mixCheque) mixCheque.value = ''
  if (mixGift) mixGift.value = ''
  discountPercent = 0
  commercialGiftAmount = 0
  paymentMode = 'card'
  document.querySelectorAll('.discount-btn').forEach(x => x.classList.toggle('active', x.dataset.discount === '0'))
  if (document.querySelector('#customDiscount')) document.querySelector('#customDiscount').value = ''
  document.querySelectorAll('.pay').forEach(x => x.classList.toggle('active', x.dataset.pay === 'card'))
  if (document.querySelector('#mixedBox')) document.querySelector('#mixedBox').style.display = 'none'
  renderCart()
}

function isNetworkError(error) {
  const text = String(error?.message || error || '').toLowerCase()
  return !navigator.onLine || text.includes('fetch') || text.includes('network') || text.includes('failed')
}

function loadOfflineState() {
  try {
    offlineSnapshot = JSON.parse(localStorage.getItem('epices_offline_snapshot') || 'null')
  } catch { offlineSnapshot = null }
  try {
    offlineQueue = JSON.parse(localStorage.getItem('epices_offline_queue') || '[]')
  } catch { offlineQueue = [] }
}

function saveOfflineSnapshot() {
  if (!session || !organizationId) return
  const snapshot = {
    saved_at: new Date().toISOString(),
    organization_id: organizationId,
    products,
    productPriceTiers,
    customers,
    categories,
    settings,
    loyaltyEvents
  }
  offlineSnapshot = snapshot
  localStorage.setItem('epices_offline_snapshot', JSON.stringify(snapshot))
}

function useOfflineSnapshot() {
  loadOfflineState()
  if (!offlineSnapshot) return false
  organizationId = offlineSnapshot.organization_id
  products = offlineSnapshot.products || []
  productPriceTiers = offlineSnapshot.productPriceTiers || []
  customers = offlineSnapshot.customers || []
  categories = offlineSnapshot.categories || []
  settings = offlineSnapshot.settings || {}
  loyaltyEvents = offlineSnapshot.loyaltyEvents || []
  sales = []
  saleLines = []
  payments = []
  managementExpenses = []
  cashClosings = []
  bankTransactions = []
  bankRules = []
  forecastEvents = []
  renderAll()
  return true
}

function queueOfflineSale(payload) {
  loadOfflineState()
  offlineQueue.push(payload)
  localStorage.setItem('epices_offline_queue', JSON.stringify(offlineQueue))
}

function applyOfflineSaleLocally(payload) {
  for (const line of payload.lines) {
    const product = products.find(p => p.id === line.product_id)
    if (product) product.stock_quantity = num(product.stock_quantity) - num(line.quantity)
  }

  if (payload.customer_id) {
    loyaltyEvents.unshift({
      id: 'offline-' + payload.local_id,
      organization_id: organizationId,
      customer_id: payload.customer_id,
      event_type: 'visit',
      points_delta: 1,
      created_at: payload.created_at,
      sale_id: null,
      note: 'Passage hors ligne en attente de synchronisation'
    })
  }

  saveOfflineSnapshot()
}

async function syncOfflineQueue() {
  const msg = document.querySelector('#syncMsg')
  loadOfflineState()

  if (!navigator.onLine) {
    if (msg) msg.textContent = 'Pas de connexion internet.'
    renderBackupPanel()
    return
  }

  if (!offlineQueue.length) {
    if (msg) msg.textContent = 'Aucune vente en attente.'
    localStorage.setItem('lastSyncAt', new Date().toISOString())
    renderBackupPanel()
    return
  }

  if (msg) msg.textContent = `Synchronisation de ${offlineQueue.length} vente(s)…`

  const remaining = []
  for (const item of offlineQueue) {
    const { error } = await supabase.rpc('complete_sale_v2_offline_idempotent', {
      p_local_id: item.local_id,
      p_customer_id: item.customer_id,
      p_lines: item.lines,
      p_payments: item.payments,
      p_discount_percent: item.discount_percent || 0,
      p_commercial_gift_amount: item.commercial_gift_amount || 0,
      p_note: item.note || `Vente hors ligne ${item.local_id}`
    })
    if (error) {
      remaining.push(item)
      if (!isNetworkError(error)) {
        console.error('Synchronisation vente hors ligne impossible', item.local_id, error)
      }
      if (!navigator.onLine) break
    }
  }

  offlineQueue = remaining
  localStorage.setItem('epices_offline_queue', JSON.stringify(offlineQueue))

  if (!remaining.length) {
    localStorage.setItem('lastSyncAt', new Date().toISOString())
    if (msg) msg.textContent = 'Synchronisation terminée.'
    await loadData()
  } else {
    if (msg) msg.textContent = `${remaining.length} vente(s) restent en attente. Vérifie le stock ou la connexion.`
    renderBackupPanel()
  }
}

function renderBackupPanel() {
  const section = document.querySelector('#backup')
  if (!section) return
  loadOfflineState()

  const connection = document.querySelector('#connectionStatus')
  if (connection) {
    connection.textContent = navigator.onLine ? 'En ligne' : 'Hors ligne'
    connection.className = 'kpi-value ' + (navigator.onLine ? 'connection-ok' : 'connection-off')
  }

  const queueCount = document.querySelector('#offlineQueueCount')
  if (queueCount) queueCount.textContent = offlineQueue.length

  const lastBackup = localStorage.getItem('lastFullBackupAt')
  const lastSync = localStorage.getItem('lastSyncAt')
  const backupLabel = document.querySelector('#lastBackupLabel')
  const syncLabel = document.querySelector('#lastSyncLabel')
  if (backupLabel) backupLabel.textContent = lastBackup ? fmtDateTime(lastBackup) : 'Jamais'
  if (syncLabel) syncLabel.textContent = lastSync ? fmtDateTime(lastSync) : '—'

  const preview = document.querySelector('#offlineQueuePreview')
  if (preview) {
    preview.innerHTML = offlineQueue.length ? `
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Total</th><th>État</th></tr></thead>
        <tbody>
          ${offlineQueue.map(item => `
            <tr>
              <td>${fmtDateTime(item.created_at)}</td>
              <td>${esc(customerName(item.customer_id))}</td>
              <td>${eur(item.total)}</td>
              <td><span class="status off">À synchroniser</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="muted">Aucune vente en attente.</div>'
  }

  const techRows = document.querySelector('#backupTechRows')
  if (techRows) {
    techRows.innerHTML = `
      <tr><td>Version application</td><td>Sprint 6C.2</td></tr>
      <tr><td>Organisation</td><td>${esc(organizationId || '—')}</td></tr>
      <tr><td>Snapshot hors ligne</td><td>${offlineSnapshot?.saved_at ? fmtDateTime(offlineSnapshot.saved_at) : 'Non disponible'}</td></tr>
      <tr><td>Produits mémorisés</td><td>${offlineSnapshot?.products?.length ?? products.length}</td></tr>
      <tr><td>Clients mémorisés</td><td>${offlineSnapshot?.customers?.length ?? customers.length}</td></tr>
      <tr><td>Service worker</td><td>${'serviceWorker' in navigator ? 'Compatible' : 'Non compatible'}</td></tr>
    `
  }

  const installBtn = document.querySelector('#installAppBtn')
  if (installBtn) installBtn.disabled = !installPrompt
}

async function installPwa() {
  const msg = document.querySelector('#installMsg')
  if (!installPrompt) {
    msg.textContent = 'Le navigateur ne propose pas l’installation automatique. Utilise son menu « Installer l’application » / « Ajouter à l’écran d’accueil ».'
    return
  }

  installPrompt.prompt()
  const choice = await installPrompt.userChoice
  msg.textContent = choice.outcome === 'accepted' ? 'Installation lancée.' : 'Installation annulée.'
  installPrompt = null
  renderBackupPanel()
}

async function exportFullBackup() {
  const msg = document.querySelector('#backupMsg')
  msg.textContent = 'Préparation de la sauvegarde…'

  if (!navigator.onLine) {
    msg.textContent = 'La sauvegarde complète nécessite une connexion internet.'
    return
  }

  const tables = [
    'organizations','user_profiles','settings','product_categories','products','product_price_tiers',
    'customers','loyalty_events','remittance_batches','remittance_items','sales','sale_lines','payments','stock_movements',
    'cash_closings','bank_transactions','bank_category_rules','forecast_events',
    'management_expenses'
  ]

  const data = {}
  for (const table of tables) {
    const { data: rows, error } = await supabase.from(table).select('*')
    if (error) {
      msg.textContent = `Erreur sur ${table} : ${error.message}`
      return
    }
    data[table] = rows || []
  }

  loadOfflineState()
  const backup = {
    format: 'tant-quil-y-aura-des-epices-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    organization_id: organizationId,
    tables: data,
    offline_queue: offlineQueue
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sauvegarde_complete_epices_${todayStamp()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  localStorage.setItem('lastFullBackupAt', backup.exported_at)
  msg.textContent = 'Sauvegarde complète téléchargée.'
  renderBackupPanel()
}

async function registerPwa() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js')
    } catch (error) {
      console.warn('Service worker non enregistré', error)
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    installPrompt = event
    renderBackupPanel()
  })

  window.addEventListener('online', async () => {
    renderBackupPanel()
    await syncOfflineQueue()
  })

  window.addEventListener('offline', renderBackupPanel)
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
    'sku','name','category','subfamily','active','stock_unit','pricing_mode',
    'sale_price_25g_ht','sale_price_50g_ht','sale_price_100g_ht','sale_price_200g_ht','sale_price_unit_ht',
    'sale_price_ht','sale_price_basis','purchase_unit','purchase_unit_quantity',
    'purchase_unit_stock_equivalent','stock_quantity','stock_alert_threshold',
    'purchase_price_ht','purchase_price_basis','vat_rate_purchase','vat_rate_sale',
    'loyalty_eligible','loyalty_reward_quantity'
  ]

  const tierValue=(productId,quantity)=>tiersForProduct(productId).find(t=>num(t.quantity)===quantity)?.price_ht ?? ''
  const rows = products.map(p => [
    p.sku,p.name,categories.find(c => c.id === p.category_id)?.name || '',p.subfamily || '',
    p.active,p.stock_unit,p.pricing_mode || 'tiered_weight',
    tierValue(p.id,25),tierValue(p.id,50),tierValue(p.id,100),tierValue(p.id,200),
    p.pricing_mode === 'fixed_unit' ? p.sale_price_ht : '',
    p.sale_price_ht,p.sale_price_basis,p.purchase_unit,p.purchase_unit_quantity,
    p.purchase_unit_stock_equivalent,p.stock_quantity,p.stock_alert_threshold,
    p.purchase_price_ht,p.purchase_price_basis,p.vat_rate_purchase,p.vat_rate_sale,
    p.loyalty_eligible,p.loyalty_reward_quantity
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

    const hasTierColumns = ['sale_price_25g_ht','sale_price_50g_ht','sale_price_100g_ht','sale_price_200g_ht']
      .some(key => Object.prototype.hasOwnProperty.call(row,key))
    const tiers = [
      [25,parseNumber(row.sale_price_25g_ht,0)],
      [50,parseNumber(row.sale_price_50g_ht,0)],
      [100,parseNumber(row.sale_price_100g_ht,0)],
      [200,parseNumber(row.sale_price_200g_ht,0)]
    ].filter(([,price]) => price > 0).map(([quantity,price_ht]) => ({quantity,price_ht}))

    const pricingMode = String(row.pricing_mode || (tiers.length ? 'tiered_weight' : 'tiered_weight')).trim()
    if (!['tiered_weight','fixed_unit','free_unit'].includes(pricingMode)) {
      errors.push(`Ligne ${lineNo} : mode de tarification inconnu "${pricingMode}".`)
      return
    }

    const fallback = tiers.find(t => t.quantity === 100) || tiers[0]
    const stockUnit = row.stock_unit || (pricingMode === 'tiered_weight' ? 'g' : 'unit')
    const payload = {
      organization_id: organizationId,
      sku: sku || null,
      name,
      category_id: category?.id || null,
      subfamily: String(row.subfamily || '').trim() || null,
      pricing_mode: pricingMode,
      active: parseBoolean(row.active, true),
      stock_unit: stockUnit,
      purchase_unit: row.purchase_unit || (stockUnit === 'g' ? 'sachet' : 'unité'),
      purchase_unit_quantity: parseNumber(row.purchase_unit_quantity, stockUnit === 'g' ? 500 : 1),
      purchase_unit_stock_equivalent: parseNumber(row.purchase_unit_stock_equivalent, stockUnit === 'g' ? 500 : 1),
      stock_quantity: parseNumber(row.stock_quantity, 0),
      stock_alert_threshold: parseNumber(row.stock_alert_threshold, 0),
      purchase_price_ht: parseNumber(row.purchase_price_ht, 0),
      purchase_price_basis: parseNumber(row.purchase_price_basis, stockUnit === 'g' ? 100 : 1),
      sale_price_ht: parseNumber(row.sale_price_ht,
        pricingMode === 'fixed_unit' ? parseNumber(row.sale_price_unit_ht,0) : num(fallback?.price_ht)),
      sale_price_basis: parseNumber(row.sale_price_basis,
        pricingMode === 'tiered_weight' ? num(fallback?.quantity || 100) : 1),
      vat_rate_purchase: parseNumber(row.vat_rate_purchase, 0),
      vat_rate_sale: parseNumber(row.vat_rate_sale, 0),
      loyalty_eligible: parseBoolean(row.loyalty_eligible, false),
      loyalty_reward_quantity: parseNumber(row.loyalty_reward_quantity, stockUnit === 'g' ? 100 : 1)
    }

    const enrich = item => ({...item,_tiers:tiers,_tiersProvided:hasTierColumns})

    if (!sku) {
      if (products.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) {
        errors.push(`Ligne ${lineNo} : "${name}" existe déjà mais la référence sku est vide. Utilise sa référence existante pour éviter un doublon.`)
        return
      }
      creates.push(enrich({ ...payload, _action:'Créer', _code:'', _name:name }))
      return
    }

    const existing = bySku.get(sku)
    if (!existing) {
      creates.push(enrich({ ...payload, _action:'Créer', _code:sku, _name:name }))
      return
    }

    const currentTiers = tiersForProduct(existing.id).map(t => [num(t.quantity),num(t.price_ht)])
    const incomingTiers = tiers.map(t => [num(t.quantity),num(t.price_ht)])
    const tierChanged = hasTierColumns && JSON.stringify(currentTiers) !== JSON.stringify(incomingTiers)
    const changed = productChanged(existing,payload) || tierChanged
    const item = enrich({ ...payload, id:existing.id, _action:changed ? 'Modifier':'Inchangé', _code:sku, _name:name })
    ;(changed ? updates : unchanged).push(item)
  })

  return { creates, updates, unchanged, errors }
}

function productChanged(existing, payload) {
  const fields = [
    'name','category_id','subfamily','pricing_mode','active','stock_unit','purchase_unit',
    'purchase_unit_quantity','purchase_unit_stock_equivalent','stock_quantity',
    'stock_alert_threshold','purchase_price_ht','purchase_price_basis',
    'sale_price_ht','sale_price_basis','vat_rate_purchase','vat_rate_sale',
    'loyalty_eligible','loyalty_reward_quantity'
  ]
  return fields.some(field => String(existing[field] ?? '') !== String(payload[field] ?? ''))
}

async function syncProductTiers(productId, tiers) {
  const { error:deleteError } = await supabase.from('product_price_tiers').delete().eq('product_id',productId)
  if (deleteError) throw deleteError
  if (!tiers?.length) return
  const payload = tiers.map(t => ({
    organization_id:organizationId,
    product_id:productId,
    quantity:num(t.quantity),
    price_ht:num(t.price_ht),
    active:true
  }))
  const { error } = await supabase.from('product_price_tiers').insert(payload)
  if (error) throw error
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
        const { id, _action, _code, _name, _tiers, _tiersProvided, ...payload } = item
        const { error } = await supabase.from('products').update(payload).eq('id', id)
        if (error) throw error
        if (_tiersProvided) await syncProductTiers(id,_tiers)
      }
      for (const item of pendingImport.creates) {
        const { _action, _code, _name, _tiers, _tiersProvided, ...payload } = item
        if (!payload.sku) delete payload.sku
        const { data:created, error } = await supabase.from('products').insert(payload).select('id').single()
        if (error) throw error
        if (_tiersProvided) await syncProductTiers(created.id,_tiers)
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


// =========================================================
// SPRINT 6B — REMISES & CAISSE
// =========================================================

function monthBounds(monthValue) {
  const [year,monthNo] = monthValue.split('-').map(Number)
  const start = new Date(year,monthNo-1,1)
  const endExclusive = new Date(year,monthNo,1)
  const endInclusive = new Date(year,monthNo,0)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return {year,monthNo,start,endExclusive,endInclusive,startIso:iso(start),endIso:iso(endInclusive)}
}

function resetRemittanceRangeToMonth() {
  const monthInput = document.querySelector('#remittanceMonth')
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const month = monthInput?.value || fallback
  if (monthInput && !monthInput.value) monthInput.value = month
  const bounds = monthBounds(month)
  const from = document.querySelector('#remittanceDateFrom')
  const to = document.querySelector('#remittanceDateTo')
  if (from) from.value = bounds.startIso
  if (to) to.value = bounds.endIso
}

function remittancePeriod() {
  const input = document.querySelector('#remittanceMonth')
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const month = input?.value || fallback
  if (input && !input.value) input.value = month
  const bounds = monthBounds(month)

  const fromInput = document.querySelector('#remittanceDateFrom')
  const toInput = document.querySelector('#remittanceDateTo')
  if (fromInput && !fromInput.value) fromInput.value = bounds.startIso
  if (toInput && !toInput.value) toInput.value = bounds.endIso

  let from = fromInput?.value || bounds.startIso
  let to = toInput?.value || bounds.endIso
  if (from < bounds.startIso) from = bounds.startIso
  if (to > bounds.endIso) to = bounds.endIso
  if (to < from) to = from

  if (fromInput) fromInput.value = from
  if (toInput) toInput.value = to

  const start = new Date(from+'T00:00:00')
  const end = new Date(to+'T23:59:59.999')
  return {month,year:bounds.year,monthNo:bounds.monthNo,start,end,from,to}
}

function paymentInRemittancePeriod(payment, period) {
  const sale = saleById(payment.sale_id)
  if (!sale || sale.status !== 'completed') return false
  const d = new Date(sale.sold_at)
  return d >= period.start && d <= period.end
}

function activeRemittanceBatch(batchId) {
  const batch = remittanceBatches.find(b => b.id === batchId)
  return batch && batch.status !== 'cancelled' ? batch : null
}

function remittanceForPayment(paymentId) {
  const item = remittanceItems.find(i => i.payment_id === paymentId)
  if (!item) return null
  const batch = activeRemittanceBatch(item.batch_id)
  return batch ? {batch,item} : null
}

function remittanceAmount(batchId) {
  return remittanceItems
    .filter(i => i.batch_id === batchId)
    .reduce((sum,i) => sum + num(i.amount),0)
}

function remittanceKindLabel(batch) {
  if (batch.remittance_kind === 'cash_reserve') return 'Fonds de caisse'
  return batch.payment_method === 'cheque' ? 'Remise chèques' : 'Remise espèces'
}

function remittanceStatusLabel(status) {
  return ({
    prepared:'Préparée',
    deposited:'Déposée',
    credited:'Créditée',
    cancelled:'Annulée'
  })[status] || status
}

function remittancePaymentRows(method, period) {
  return payments
    .filter(p =>
      p.payment_method === method &&
      (p.status || 'completed') === 'completed' &&
      paymentInRemittancePeriod(p,period)
    )
    .sort((a,b) => new Date(a.paid_at || saleById(a.sale_id)?.sold_at) - new Date(b.paid_at || saleById(b.sale_id)?.sold_at))
}

function renderRemittancePaymentTable(method, rows, bodyId) {
  const body = document.querySelector('#'+bodyId)
  if (!body) return

  body.innerHTML = rows.map(payment => {
    const sale = saleById(payment.sale_id)
    const assignment = remittanceForPayment(payment.id)
    const batch = assignment?.batch
    const locked = batch && batch.remittance_kind !== 'cash_reserve'
    const label = batch
      ? `${esc(batch.remittance_number)} · ${esc(remittanceStatusLabel(batch.status))}`
      : 'À affecter'
    return `<tr>
      <td><input class="remittance-check" type="checkbox" data-method="${method}" data-payment-id="${payment.id}" ${locked ? 'disabled' : ''}></td>
      <td><b>${esc(sale?.sale_number || payment.sale_id.slice(0,8))}</b></td>
      <td>${fmtDateTime(sale?.sold_at || payment.paid_at)}</td>
      <td>${eur(payment.amount)}</td>
      <td><span class="status ${batch ? 'ok' : 'off'}">${label}</span></td>
    </tr>`
  }).join('') || '<tr><td colspan="5" class="muted">Aucun paiement sur cette période.</td></tr>'

  body.querySelectorAll('.remittance-check').forEach(box => box.onchange = () => {
    updateRemittanceSelectionTotals()
    syncRemittanceToggleLabels()
  })
  updateRemittanceSelectionTotals()
  syncRemittanceToggleLabels()
}

function updateRemittanceSelectionTotals() {
  for (const method of ['cash','cheque']) {
    const total = [...document.querySelectorAll(`.remittance-check[data-method="${method}"]:checked`)]
      .reduce((sum,box) => {
        const payment = payments.find(p => p.id === box.dataset.paymentId)
        return sum + num(payment?.amount)
      },0)
    const el = document.querySelector(method === 'cash' ? '#cashSelectionTotal' : '#chequeSelectionTotal')
    if (el) el.textContent = eur(total)
  }
}

function toggleAllRemittanceChecks(method) {
  const boxes = [...document.querySelectorAll(`.remittance-check[data-method="${method}"]:not(:disabled)`)]
  if (!boxes.length) return
  const shouldCheck = boxes.some(box => !box.checked)
  boxes.forEach(box => { box.checked = shouldCheck })
  const btn = document.querySelector(method === 'cash' ? '#toggleAllCashBtn' : '#toggleAllChequeBtn')
  if (btn) btn.textContent = shouldCheck ? 'Tout décocher' : 'Tout cocher'
  updateRemittanceSelectionTotals()
}

function syncRemittanceToggleLabels() {
  for (const method of ['cash','cheque']) {
    const boxes = [...document.querySelectorAll(`.remittance-check[data-method="${method}"]:not(:disabled)`)]
    const btn = document.querySelector(method === 'cash' ? '#toggleAllCashBtn' : '#toggleAllChequeBtn')
    if (btn) btn.textContent = boxes.length && boxes.every(box => box.checked) ? 'Tout décocher' : 'Tout cocher'
  }
}

function renderRemittanceBatches() {
  const body = document.querySelector('#remittanceBatchRows')
  if (!body) return

  const rows = remittanceBatches
    .filter(b => b.status !== 'cancelled')
    .slice(0,100)

  body.innerHTML = rows.map(batch => {
    const canCancel = batch.status !== 'credited'
    return `<tr>
      <td><b>${esc(batch.remittance_number)}</b></td>
      <td>${esc(remittanceKindLabel(batch))}</td>
      <td>${eur(remittanceAmount(batch.id))}</td>
      <td><span class="status ${batch.status === 'credited' ? 'ok' : 'off'}">${esc(remittanceStatusLabel(batch.status))}</span></td>
      <td>${fmtDateTime(batch.prepared_at)}</td>
      <td><input class="field compact remittance-deposit-date" data-id="${batch.id}" type="date" value="${batch.deposit_date || ''}" ${batch.remittance_kind === 'cash_reserve' ? 'disabled' : ''}></td>
      <td><input class="field compact remittance-credit-date" data-id="${batch.id}" type="date" value="${batch.credited_date || ''}" ${batch.remittance_kind === 'cash_reserve' ? 'disabled' : ''}></td>
      <td>
        ${batch.remittance_kind === 'bank_deposit' ? `<button class="secondary save-remittance-dates" data-id="${batch.id}">Enregistrer</button>` : ''}
        ${canCancel ? `<button class="danger cancel-remittance" data-id="${batch.id}">Annuler</button>` : ''}
      </td>
    </tr>`
  }).join('') || '<tr><td colspan="8" class="muted">Aucune remise créée.</td></tr>'

  document.querySelectorAll('.save-remittance-dates').forEach(btn => btn.onclick = () => saveRemittanceDates(btn.dataset.id))
  document.querySelectorAll('.cancel-remittance').forEach(btn => btn.onclick = () => cancelRemittance(btn.dataset.id))
}

function currentRemittanceCashTotal() {
  const period = remittancePeriod()
  return remittancePaymentRows('cash',period).reduce((sum,p) => sum + num(p.amount),0)
}

function effectiveCashFloatTarget(cashTotal = currentRemittanceCashTotal()) {
  const percent = num(settings?.cash_float_target_percent)
  const mode = settings?.cash_float_target_mode || (percent > 0 ? 'percent' : 'amount')
  return mode === 'percent'
    ? Math.round(cashTotal * percent / 100)
    : Math.round(num(settings?.cash_float_target))
}

function refreshCashFloatProposal(syncAmountFromPercent = false) {
  const amountInput = document.querySelector('#cashFloatTarget')
  const percentInput = document.querySelector('#cashFloatTargetPercent')
  const computed = document.querySelector('#cashFloatComputed')
  if (!amountInput || !percentInput || !computed) return

  const cashTotal = currentRemittanceCashTotal()
  const pct = Math.max(0,Math.min(100,Number(percentInput.value || 0)))
  if (pct > 0) {
    const proposed = Math.round(cashTotal * pct / 100)
    computed.textContent = eur0(proposed)
    if (syncAmountFromPercent) amountInput.value = String(proposed)
  } else {
    computed.textContent = eur0(Math.max(0,Number(amountInput.value || 0)))
  }
}

function renderRemittances() {
  const section = document.querySelector('#remittances')
  if (!section || !settings) return

  const period = remittancePeriod()
  const cashRows = remittancePaymentRows('cash',period)
  const chequeRows = remittancePaymentRows('cheque',period)
  const periodSales = sales.filter(s => {
    if (s.status !== 'completed') return false
    const d = new Date(s.sold_at)
    return d >= period.start && d <= period.end
  })
  const totalCa = periodSales.reduce((sum,s) => sum + num(s.total_ttc),0)
  const cashTotal = cashRows.reduce((sum,p) => sum + num(p.amount),0)
  const chequeTotal = chequeRows.reduce((sum,p) => sum + num(p.amount),0)
  const cashShare = totalCa ? cashTotal/totalCa*100 : 0

  const reserveBatchIds = new Set(remittanceBatches
    .filter(b => b.status !== 'cancelled' && b.remittance_kind === 'cash_reserve')
    .map(b => b.id))
  const currentReserve = remittanceItems
    .filter(i => reserveBatchIds.has(i.batch_id))
    .reduce((sum,i) => sum + num(i.amount),0)

  const bankedCash = cashRows.reduce((sum,p) => {
    const a = remittanceForPayment(p.id)
    return a?.batch.remittance_kind === 'bank_deposit' ? sum + num(p.amount) : sum
  },0)
  const unassignedCash = cashRows.reduce((sum,p) => remittanceForPayment(p.id) ? sum : sum + num(p.amount),0)
  const unassignedCheques = chequeRows.reduce((sum,p) => remittanceForPayment(p.id) ? sum : sum + num(p.amount),0)

  const target = effectiveCashFloatTarget(cashTotal)
  const targetMode = settings.cash_float_target_mode || 'amount'
  const targetPercent = num(settings.cash_float_target_percent)

  document.querySelector('#remittanceKpis').innerHTML = `
    <div class="card kpi"><div class="muted">CA encaissé période</div><div class="kpi-value">${eur(totalCa)}</div></div>
    <div class="card kpi"><div class="muted">Espèces encaissées</div><div class="kpi-value">${eur(cashTotal)}</div><div class="small">${cashShare.toFixed(1)} % du CA de la période</div></div>
    <div class="card kpi"><div class="muted">Espèces en remises</div><div class="kpi-value">${eur(bankedCash)}</div></div>
    <div class="card kpi"><div class="muted">Fonds de caisse actuel</div><div class="kpi-value">${eur(currentReserve)}</div><div class="small">Cible : ${eur0(target)}${targetMode==='percent' ? ' · '+targetPercent.toFixed(0)+' % des espèces' : ''}</div></div>
    <div class="card kpi"><div class="muted">Espèces à affecter</div><div class="kpi-value">${eur(unassignedCash)}</div></div>
    <div class="card kpi"><div class="muted">Chèques à affecter</div><div class="kpi-value">${eur(unassignedCheques)}</div><div class="small">Total chèques période : ${eur(chequeTotal)}</div></div>
  `
  const reserveNeeded = Math.max(0,target-currentReserve)
  const suggestedDeposit = Math.round(Math.max(0,unassignedCash-reserveNeeded))
  document.querySelector('#cashSuggestion').innerHTML = suggestedDeposit > 0
    ? `Avec un fonds de caisse cible de <b>${eur0(target)}</b>, la remise espèces suggérée sur les paiements encore disponibles est d’environ <b>${eur0(suggestedDeposit)}</b>.`
    : `Aucune remise espèces suggérée actuellement. Fonds de caisse cible : <b>${eur0(target)}</b>.`

  document.querySelector('#cashFloatTarget').value = String(Math.round(target))
  document.querySelector('#cashFloatTargetPercent').value = targetMode === 'percent' && targetPercent > 0 ? targetPercent.toFixed(0) : ''
  refreshCashFloatProposal()
  renderRemittancePaymentTable('cash',cashRows,'cashRemittanceRows')
  renderRemittancePaymentTable('cheque',chequeRows,'chequeRemittanceRows')
  renderRemittanceBatches()
}

function selectedRemittancePaymentIds(method) {
  return [...document.querySelectorAll(`.remittance-check[data-method="${method}"]:checked`)]
    .map(x => x.dataset.paymentId)
}

async function saveCashFloatTarget() {
  const msg = document.querySelector('#cashFloatMsg')
  const amount = Math.round(Math.max(0,Number(document.querySelector('#cashFloatTarget').value || 0)))
  const percent = Math.max(0,Math.min(100,Number(document.querySelector('#cashFloatTargetPercent').value || 0)))
  const mode = percent > 0 ? 'percent' : 'amount'

  msg.textContent = 'Enregistrement…'
  const {error} = await supabase.rpc('update_cash_float_settings',{
    p_cash_float_target:amount,
    p_cash_float_target_percent:percent,
    p_cash_float_target_mode:mode
  })
  if (error) return msg.textContent = 'Erreur : '+error.message
  msg.textContent = mode === 'percent'
    ? `Cible enregistrée : ${percent.toFixed(0)} % des espèces.`
    : 'Fonds de caisse cible enregistré.'
  await loadData()
}

function suggestCashDeposit() {
  const period = remittancePeriod()
  const rows = remittancePaymentRows('cash',period)
    .filter(p => !remittanceForPayment(p.id))
    .sort((a,b) => num(a.amount) - num(b.amount))

  const currentReserve = remittanceBatches
    .filter(b => b.status !== 'cancelled' && b.remittance_kind === 'cash_reserve')
    .reduce((sum,b) => sum + remittanceAmount(b.id),0)
  const cashTotal = remittancePaymentRows('cash',period).reduce((sum,p) => sum+num(p.amount),0)
  const target = effectiveCashFloatTarget(cashTotal)
  const unassigned = rows.reduce((sum,p) => sum+num(p.amount),0)
  const reserveNeeded = Math.max(0,target-currentReserve)
  const depositTarget = Math.round(Math.max(0,unassigned-reserveNeeded))

  document.querySelectorAll('.remittance-check[data-method="cash"]').forEach(x => x.checked=false)
  if (depositTarget <= 0) {
    updateRemittanceSelectionTotals()
    syncRemittanceToggleLabels()
    return
  }

  const chosen = []
  const remaining = []
  let selected = 0

  // On commence par les petits encaissements pour affiner la composition.
  for (const payment of rows) {
    const amount = num(payment.amount)
    if (selected + amount <= depositTarget + 0.001) {
      chosen.push(payment)
      selected += amount
    } else {
      remaining.push(payment)
    }
  }

  // Si un dernier paiement améliore réellement l'écart à la cible, on l'ajoute.
  const currentGap = Math.abs(depositTarget-selected)
  let best = null
  let bestGap = currentGap
  for (const payment of remaining) {
    const gap = Math.abs(depositTarget-(selected+num(payment.amount)))
    if (gap < bestGap) {
      best = payment
      bestGap = gap
    }
  }
  if (best) {
    chosen.push(best)
    selected += num(best.amount)
  }

  for (const payment of chosen) {
    const cb = document.querySelector(`.remittance-check[data-payment-id="${payment.id}"]`)
    if (cb && !cb.disabled) cb.checked=true
  }

  document.querySelector('#cashSuggestion').innerHTML =
    `Proposition sélectionnée : <b>${eur(selected)}</b> pour une cible d’environ <b>${eur(depositTarget)}</b>. Les plus petits encaissements sont privilégiés pour rester au plus près de la cible.`
  updateRemittanceSelectionTotals()
  syncRemittanceToggleLabels()
}

async function createRemittanceFromSelection(method,kind) {
  const msg = document.querySelector(method === 'cash' ? '#cashRemittanceMsg' : '#chequeRemittanceMsg')
  let ids = selectedRemittancePaymentIds(method)
  if (kind === 'cash_reserve') {
    ids = ids.filter(id => !remittanceForPayment(id))
  }
  if (!ids.length) return msg.textContent = kind === 'cash_reserve'
    ? 'Sélectionne au moins un encaissement non encore affecté.'
    : 'Sélectionne au moins un paiement.'

  const name = document.querySelector(method === 'cash' ? '#cashRemittanceName' : '#chequeRemittanceName').value.trim() || null
  const depositDate = kind === 'bank_deposit'
    ? (document.querySelector(method === 'cash' ? '#cashDepositDate' : '#chequeDepositDate').value || null)
    : null

  msg.textContent = 'Enregistrement…'
  const {error} = await supabase.rpc('create_remittance_batch',{
    p_payment_method:method,
    p_kind:kind,
    p_payment_ids:ids,
    p_name:name,
    p_deposit_date:depositDate,
    p_note:null
  })
  if (error) return msg.textContent = 'Erreur : '+error.message

  msg.textContent = kind === 'cash_reserve' ? 'Espèces affectées au fonds de caisse.' : 'Remise créée.'
  document.querySelector(method === 'cash' ? '#cashRemittanceName' : '#chequeRemittanceName').value=''
  await loadData()
}

async function saveRemittanceDates(batchId) {
  const deposit = document.querySelector(`.remittance-deposit-date[data-id="${batchId}"]`)?.value || null
  const credited = document.querySelector(`.remittance-credit-date[data-id="${batchId}"]`)?.value || null

  if (credited && !deposit) {
    return alert('Renseigne d’abord la date de dépôt.')
  }
  const {error} = await supabase.rpc('update_remittance_batch',{
    p_batch_id:batchId,
    p_deposit_date:deposit,
    p_credited_date:credited,
    p_note:null
  })
  if (error) return alert(error.message)
  await loadData()
}

async function cancelRemittance(batchId) {
  if (!confirm('Annuler cette affectation ? Les paiements redeviendront disponibles.')) return
  const {error} = await supabase.rpc('cancel_remittance_batch',{p_batch_id:batchId})
  if (error) return alert(error.message)
  await loadData()
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

function isCaisseBancBatch(batch) {
  return batch &&
    batch.status !== 'cancelled' &&
    /^CAISSE\s+N\d{4}/i.test(String(batch.remittance_number || '').trim())
}

function caisseBancAmountForSales(selectedSales) {
  const saleIds = new Set(selectedSales.map(s => s.id))
  const paymentById = new Map(payments.map(p => [p.id,p]))
  const caisseBatchIds = new Set(remittanceBatches.filter(isCaisseBancBatch).map(b => b.id))

  return remittanceItems
    .filter(item => caisseBatchIds.has(item.batch_id))
    .reduce((sum,item) => {
      const payment = paymentById.get(item.payment_id)
      return payment && saleIds.has(payment.sale_id) ? sum + num(item.amount) : sum
    },0)
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
  const caisseBanc = caisseBancAmountForSales(qSales)
  const socialRate = num(settings.micro_social_rate)
  const taxRate = num(settings.income_tax_rate)
  const social = ca * socialRate / 100
  const tax = ca * taxRate / 100

  document.querySelector('#urssafBox').innerHTML = `
    <div class="small" style="margin-bottom:8px">Trimestre ${quarter} — ${currentYear()}</div>
    <div class="urssaf-dual">
      <div class="urssaf-panel">
        <h3>URSSAF</h3>
        <div class="urssaf-line">
          <div><b>CA déclaré</b><div class="small">CA total encaissé</div></div>
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
      </div>
      <div class="urssaf-panel caisse-banc-panel">
        <h3>Caisse banc</h3>
        <div class="urssaf-line">
          <div><b>Total sur le trimestre</b><div class="small">Remises dont le libellé commence par CAISSE N + 4 chiffres</div></div>
          <div><b>${eur(caisseBanc)}</b></div>
        </div>
      </div>
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


// =========================================================
// FINITION FONCTIONNELLE — PARAMÈTRES
// =========================================================

function renderSettings() {
  const section = document.querySelector('#settings')
  if (!section || !settings) return

  const loyalty = document.querySelector('#settingLoyaltyVisits')
  if (loyalty) loyalty.value = Number(settings.loyalty_visits_per_reward || 10)

  const start = document.querySelector('#appSettingActivityStart')
  const social = document.querySelector('#appSettingSocialRate')
  const tax = document.querySelector('#appSettingTaxRate')
  const vatBase = document.querySelector('#appSettingVatBase')
  const vatMajor = document.querySelector('#appSettingVatMajor')
  const micro = document.querySelector('#appSettingMicroThreshold')

  if (start) start.value = settings.activity_start_date || ''
  if (social) social.value = num(settings.micro_social_rate)
  if (tax) tax.value = num(settings.income_tax_rate)
  if (vatBase) vatBase.value = num(settings.vat_base_threshold)
  if (vatMajor) vatMajor.value = num(settings.vat_major_threshold)
  if (micro) micro.value = num(settings.micro_threshold)

  renderCategorySettings()
  renderBankRulesInSettings()
}

function renderCategorySettings() {
  const body = document.querySelector('#categoryRows')
  if (!body) return

  const ordered = [...categories].sort((a,b) => num(a.sort_order) - num(b.sort_order))

  body.innerHTML = ordered.map(cat => `
    <tr>
      <td style="width:100px">
        <input class="field compact category-order" data-id="${cat.id}" type="number" value="${num(cat.sort_order)}">
      </td>
      <td>
        <input class="field category-name" data-id="${cat.id}" value="${esc(cat.name)}">
      </td>
      <td>
        <span class="status ${cat.active ? 'ok' : 'off'}">${cat.active ? 'Active' : 'Inactive'}</span>
      </td>
      <td>
        <div class="row">
          <button class="secondary save-category-btn" data-id="${cat.id}">Enregistrer</button>
          <button class="secondary toggle-category-btn" data-id="${cat.id}" data-active="${cat.active}">
            ${cat.active ? 'Désactiver' : 'Réactiver'}
          </button>
          <button class="danger delete-category-btn" data-id="${cat.id}">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join('')

  document.querySelectorAll('.save-category-btn').forEach(btn => btn.onclick = () => saveCategory(btn.dataset.id))
  document.querySelectorAll('.toggle-category-btn').forEach(btn => btn.onclick = () => toggleCategory(btn.dataset.id, btn.dataset.active === 'true'))
  document.querySelectorAll('.delete-category-btn').forEach(btn => btn.onclick = () => deleteCategory(btn.dataset.id))
}

async function addCategory() {
  const msg = document.querySelector('#categoryMsg')
  const name = document.querySelector('#newCategoryName').value.trim()

  if (!name) return msg.textContent = 'Nom obligatoire.'

  msg.textContent = 'Ajout…'
  const { error } = await supabase.rpc('create_product_category', { p_name: name })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  document.querySelector('#newCategoryName').value = ''
  msg.textContent = ''
  await loadData()
}

async function saveCategory(id) {
  const cat = categories.find(c => c.id === id)
  if (!cat) return

  const name = document.querySelector(`.category-name[data-id="${id}"]`).value.trim()
  const sortOrder = Number(document.querySelector(`.category-order[data-id="${id}"]`).value || 0)

  const { error } = await supabase.rpc('update_product_category', {
    p_category_id: id,
    p_name: name,
    p_sort_order: sortOrder,
    p_active: cat.active
  })

  if (error) return alert(error.message)
  await loadData()
}

async function toggleCategory(id, currentlyActive) {
  const cat = categories.find(c => c.id === id)
  if (!cat) return

  const { error } = await supabase.rpc('update_product_category', {
    p_category_id: id,
    p_name: cat.name,
    p_sort_order: num(cat.sort_order),
    p_active: !currentlyActive
  })

  if (error) return alert(error.message)
  await loadData()
}

async function deleteCategory(id) {
  if (!confirm('Supprimer cette catégorie ? Si elle est utilisée par un produit, la suppression sera refusée.')) return

  const { error } = await supabase.rpc('delete_product_category', {
    p_category_id: id
  })

  if (error) return alert(error.message)
  await loadData()
}

async function saveAppSettings() {
  const msg = document.querySelector('#appSettingsMsg')
  msg.textContent = 'Enregistrement…'

  const { error } = await supabase.rpc('update_app_settings', {
    p_loyalty_visits_per_reward: Number(document.querySelector('#settingLoyaltyVisits').value || 10),
    p_activity_start_date: document.querySelector('#appSettingActivityStart').value || null,
    p_micro_social_rate: Number(document.querySelector('#appSettingSocialRate').value || 0),
    p_income_tax_rate: Number(document.querySelector('#appSettingTaxRate').value || 0),
    p_vat_base_threshold: Number(document.querySelector('#appSettingVatBase').value || 0),
    p_vat_major_threshold: Number(document.querySelector('#appSettingVatMajor').value || 0),
    p_micro_threshold: Number(document.querySelector('#appSettingMicroThreshold').value || 0)
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  msg.textContent = 'Paramètres enregistrés.'
  await loadData()
}

async function saveLoyaltySettings() {
  const msg = document.querySelector('#loyaltyMsg')
  const visits = Number(document.querySelector('#settingLoyaltyVisits').value || 10)
  if (!(visits > 0)) return msg.textContent = 'Nombre de passages invalide.'
  msg.textContent = 'Enregistrement…'
  const { error } = await supabase.rpc('update_app_settings', {
    p_loyalty_visits_per_reward: visits,
    p_activity_start_date: settings.activity_start_date || null,
    p_micro_social_rate: num(settings.micro_social_rate),
    p_income_tax_rate: num(settings.income_tax_rate),
    p_vat_base_threshold: num(settings.vat_base_threshold),
    p_vat_major_threshold: num(settings.vat_major_threshold),
    p_micro_threshold: num(settings.micro_threshold)
  })
  if (error) return msg.textContent = 'Erreur : '+error.message
  msg.textContent = 'Fidélité enregistrée.'
  await loadData()
}

function renderBankRulesInSettings() {
  const body = document.querySelector('#settingsBankRuleRows')
  if (!body) return

  body.innerHTML = bankRules.map(rule => `
    <tr>
      <td>${esc(rule.keyword)}</td>
      <td>${esc(rule.category)}</td>
      <td><button class="danger settings-delete-rule" data-id="${rule.id}">×</button></td>
    </tr>
  `).join('')

  document.querySelectorAll('.settings-delete-rule').forEach(btn => btn.onclick = async () => {
    const { error } = await supabase.from('bank_category_rules').delete().eq('id', btn.dataset.id)
    if (error) return alert(error.message)
    await loadData()
  })
}

async function addBankRuleFromSettings() {
  const msg = document.querySelector('#settingsRuleMsg')
  const keyword = document.querySelector('#settingsRuleKeyword').value.trim()
  const category = document.querySelector('#settingsRuleCategory').value.trim()

  if (!keyword || !category) return msg.textContent = 'Mot-clé et catégorie obligatoires.'

  const { error } = await supabase.from('bank_category_rules').insert({
    organization_id: organizationId,
    keyword,
    category
  })

  if (error) return msg.textContent = 'Erreur : ' + error.message

  document.querySelector('#settingsRuleKeyword').value = ''
  document.querySelector('#settingsRuleCategory').value = ''
  msg.textContent = ''
  await loadData()
}

registerPwa()
init()
