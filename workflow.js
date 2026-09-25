(() => {
  const form = document.querySelector('#jobForm');
  const originalCollectForm = collectForm;
  const originalFillForm = fillForm;
  const originalCoverPage = coverPage;
  const originalPrintDocument = printDocument;

  const normalize = (value) => String(value || '').trim().toLowerCase();
  const phoneKey = (value) => String(value || '').replace(/\D/g, '').slice(-10);
  const profileKey = (name, phone, email) => normalize(email) || phoneKey(phone) || normalize(name);

  function ensureDirectoryState() {
    state.customers = Array.isArray(state.customers) ? state.customers : [];
    state.contractors = Array.isArray(state.contractors) ? state.contractors : [];
    state.jobs.forEach((job) => {
      saveCustomerFromJob(job, false);
      saveContractorFromJob(job, false);
    });
  }

  function saveCustomerFromJob(job, stamp = true) {
    if (!job?.customerName?.trim()) return;
    const key = profileKey(job.customerName, job.customerPhone, job.customerEmail);
    let record = state.customers.find((item) => item.key === key || (normalize(item.name) === normalize(job.customerName) && normalize(job.customerName)));
    if (!record) {
      record = { id: crypto.randomUUID(), key, createdAt: Date.now() };
      state.customers.push(record);
    }
    Object.assign(record, {
      key,
      name: job.customerName.trim(),
      phone: job.customerPhone || '',
      email: job.customerEmail || '',
      billingAddress: job.billingAddress || '',
      projectAddress: job.projectAddress || '',
      updatedAt: stamp ? Date.now() : (record.updatedAt || job.updatedAt || Date.now())
    });
    job.customerId = record.id;
  }

  function saveContractorFromJob(job, stamp = true) {
    if (!job?.freelancerName?.trim()) return;
    const key = `${normalize(job.freelancerName)}|${normalize(job.freelancerCompany)}`;
    let record = state.contractors.find((item) => item.key === key || (normalize(item.name) === normalize(job.freelancerName) && normalize(job.freelancerName)));
    if (!record) {
      record = { id: crypto.randomUUID(), key, createdAt: Date.now() };
      state.contractors.push(record);
    }
    Object.assign(record, {
      key,
      name: job.freelancerName.trim(),
      company: job.freelancerCompany || '',
      contact: job.freelancerContact || '',
      trade: job.freelancerScope || job.workerTrade || '',
      documents: job.freelancerDocuments || 'Not collected',
      paymentTerms: job.freelancerPaymentTerms || '',
      updatedAt: stamp ? Date.now() : (record.updatedAt || job.updatedAt || Date.now())
    });
    job.contractorId = record.id;
  }

  function refreshSuggestions() {
    ensureDirectoryState();
    const customers = document.querySelector('#customerSuggestions');
    const contractors = document.querySelector('#contractorSuggestions');
    if (customers) customers.innerHTML = state.customers.sort((a, b) => a.name.localeCompare(b.name)).map((item) => `<option value="${esc(item.name)}">${esc(item.phone || item.email || '')}</option>`).join('');
    if (contractors) contractors.innerHTML = state.contractors.sort((a, b) => a.name.localeCompare(b.name)).map((item) => `<option value="${esc(item.name)}">${esc(item.company || item.contact || '')}</option>`).join('');
  }

  function findCustomer(value) {
    const name = normalize(value);
    return state.customers.find((item) => normalize(item.name) === name);
  }

  function findContractor(value) {
    const name = normalize(value);
    return state.contractors.find((item) => normalize(item.name) === name);
  }

  function fillCustomerProfile(record) {
    if (!record) return;
    form.elements.customerPhone.value = record.phone || '';
    form.elements.customerEmail.value = record.email || '';
    form.elements.billingAddress.value = record.billingAddress || '';
    form.elements.projectAddress.value = record.projectAddress || '';
    autosave();
    toast(`Customer file loaded for ${record.name}`);
  }

  function fillContractorProfile(record) {
    if (!record) return;
    form.elements.freelancerCompany.value = record.company || '';
    form.elements.freelancerContact.value = record.contact || '';
    form.elements.freelancerScope.value = record.trade || '';
    form.elements.freelancerDocuments.value = record.documents || 'Not collected';
    form.elements.freelancerPaymentTerms.value = record.paymentTerms || '';
    autosave();
    toast(`Contractor file loaded for ${record.name}`);
  }

  collectForm = function collectFormWithDirectories() {
    const job = originalCollectForm();
    if (job) {
      saveCustomerFromJob(job);
      saveContractorFromJob(job);
      refreshSuggestions();
    }
    return job;
  };

  fillForm = function fillFormWithDirectories(job) {
    originalFillForm(job);
    refreshSuggestions();
  };

  form?.elements.customerName?.addEventListener('change', (event) => fillCustomerProfile(findCustomer(event.target.value)));
  form?.elements.freelancerName?.addEventListener('change', (event) => fillContractorProfile(findContractor(event.target.value)));

  const stageGroups = [
    { key: 'quotes', title: 'Quotes', statuses: ['Draft quote', 'Quote sent'], empty: 'All caught up with quotes.' },
    { key: 'approved', title: 'Approved and scheduled', statuses: ['Approved'], empty: 'No approved jobs waiting to start.' },
    { key: 'working', title: 'Work in progress', statuses: ['In progress'], empty: 'No jobs are currently in progress.' },
    { key: 'completed', title: 'Completed', statuses: ['Completed'], empty: 'No completed jobs waiting for payment.' },
    { key: 'paid', title: 'Paid and closed', statuses: ['Paid'], empty: 'No paid jobs yet.' }
  ];

  function jobRow(job) {
    const amount = totals(job);
    return `<div class="job-row"><div><b>${esc(job.customerName || 'Unnamed customer')}</b><small>${esc(job.projectAddress || 'No project address')}</small></div><div><b>${esc(job.quoteNumber)}</b><small>${new Date(job.updatedAt).toLocaleDateString()}</small></div><span class="status-chip">${esc(job.status)}</span><div><b>${money(amount.finalTotal)}</b><small>${money(amount.due)} due</small></div><button class="open-job" data-id="${job.id}" aria-label="Open job">›</button><button class="job-delete" data-id="${job.id}" aria-label="Delete job">×</button></div>`;
  }

  renderDashboard = function renderWorkflowDashboard(filter = '') {
    ensureDirectoryState();
    const query = normalize(filter);
    const matching = state.jobs.filter((job) => [job.customerName, job.customerPhone, job.customerEmail, job.projectAddress, job.quoteNumber, job.contractNumber, job.invoiceNumber, job.freelancerName, job.freelancerCompany, job.workerName].join(' ').toLowerCase().includes(query));
    const completed = state.jobs.filter((job) => ['Completed', 'Paid'].includes(job.status));
    $('#statJobs').textContent = state.jobs.length;
    $('#statOpen').textContent = state.jobs.filter((job) => !['Completed', 'Paid'].includes(job.status)).length;
    $('#statValue').textContent = money(state.jobs.reduce((sum, job) => sum + totals(job).finalTotal, 0));
    $('#statDue').textContent = money(state.jobs.reduce((sum, job) => sum + Math.max(0, totals(job).due), 0));
    $('#statCompletedRevenue').textContent = money(completed.reduce((sum, job) => sum + totals(job).finalTotal, 0));
    $('#statCollected').textContent = money(completed.reduce((sum, job) => sum + (Number(job.paymentsReceived) || 0), 0));
    $('#nextNumber').textContent = nextNum();
    const host = $('#jobList');
    host.innerHTML = stageGroups.map((group, index) => {
      const jobs = matching.filter((job) => group.statuses.includes(job.status));
      const open = group.key !== 'paid' && (jobs.length > 0 || group.key === 'quotes');
      return `<details class="workflow-group" ${open ? 'open' : ''}><summary><span><b>${group.title}</b><small>${jobs.length} job${jobs.length === 1 ? '' : 's'}</small></span><span class="workflow-count">${jobs.length}</span></summary><div class="job-list">${jobs.length ? jobs.map(jobRow).join('') : `<div class="workflow-empty">${group.empty}</div>`}</div></details>`;
    }).join('');
    $('#emptyJobs').classList.toggle('hidden', state.jobs.length > 0);
    $$('.open-job').forEach((button) => { button.onclick = () => openJob(button.dataset.id); });
    $$('.job-delete').forEach((button) => { button.onclick = () => deleteJobById(button.dataset.id); });
    renderCompleted();
    renderCustomers($('#customerSearch')?.value || '');
    renderContractors($('#contractorSearch')?.value || '');
    renderDocumentArchive();
  };

  renderCustomers = function renderSavedCustomers(filter = '') {
    ensureDirectoryState();
    const query = normalize(filter);
    const records = state.customers.filter((item) => [item.name, item.phone, item.email, item.billingAddress, item.projectAddress].join(' ').toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
    const host = $('#customerList');
    if (!host) return;
    host.innerHTML = records.length ? records.map((customer) => {
      const jobs = state.jobs.filter((job) => job.customerId === customer.id || profileKey(job.customerName, job.customerPhone, job.customerEmail) === customer.key);
      return `<article class="portal-card"><div class="portal-card-head"><div><h3>${esc(customer.name)}</h3><small>${esc(customer.phone || 'No phone')} · ${esc(customer.email || 'No email')}</small></div><span class="status-chip">${jobs.length} job${jobs.length === 1 ? '' : 's'}</span></div><p>${esc(customer.projectAddress || customer.billingAddress || 'No saved address')}</p><div class="lead-meta"><div><small>Total work</small><strong>${money(jobs.reduce((sum, job) => sum + totals(job).finalTotal, 0))}</strong></div><div><small>Collected</small><strong>${money(jobs.reduce((sum, job) => sum + (Number(job.paymentsReceived) || 0), 0))}</strong></div></div>${jobs.map((job) => `<button type="button" class="customer-job" data-id="${job.id}">${esc(job.quoteNumber)} · ${esc(job.status)} · ${esc(job.projectAddress || 'No address')}</button>`).join('')}</article>`;
    }).join('') : '<div class="portal-empty">No matching customers.</div>';
    $$('.customer-job').forEach((button) => { button.onclick = () => openJob(button.dataset.id); });
  };

  function renderContractors(filter = '') {
    ensureDirectoryState();
    const query = normalize(filter);
    const records = state.contractors.filter((item) => [item.name, item.company, item.contact, item.trade].join(' ').toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
    const host = $('#contractorList');
    if (!host) return;
    host.innerHTML = records.length ? records.map((contractor) => {
      const jobs = state.jobs.filter((job) => job.contractorId === contractor.id || normalize(job.freelancerName) === normalize(contractor.name));
      return `<article class="portal-card"><div class="portal-card-head"><div><h3>${esc(contractor.name)}</h3><small>${esc(contractor.company || 'Independent contractor')} · ${esc(contractor.contact || 'No contact saved')}</small></div><span class="status-chip">${jobs.length} assignment${jobs.length === 1 ? '' : 's'}</span></div><p>${esc(contractor.trade || 'No trade or scope saved')}</p><div class="lead-meta"><div><small>Company cost</small><strong>${money(jobs.reduce((sum, job) => sum + (Number(job.freelancerPrice) || 0), 0))}</strong></div><div><small>Documents</small><strong>${esc(contractor.documents || 'Not collected')}</strong></div></div>${jobs.map((job) => `<button type="button" class="contractor-job" data-id="${job.id}">${esc(job.quoteNumber)} · ${esc(job.customerName || 'Unnamed customer')} · ${esc(job.status)}</button>`).join('')}</article>`;
    }).join('') : '<div class="portal-empty">No contractors saved yet. Add one inside a job under Schedule.</div>';
    $$('.contractor-job').forEach((button) => { button.onclick = () => openJob(button.dataset.id); });
  }

  window.renderContractors = renderContractors;
  $('#contractorSearch')?.addEventListener('input', (event) => renderContractors(event.target.value));

  const oldSwitchView = switchView;
  switchView = function switchViewWithContractors(name) {
    oldSwitchView(name);
    if (name === 'contractors') { $('#viewTitle').textContent = 'Contractors'; renderContractors($('#contractorSearch')?.value || ''); }
    if (name === 'documents') renderDocumentArchive();
  };

  photoPage = function flexiblePhotoPage(title, page, photos, label) {
    const pictures = (photos || []).filter((photo) => photo?.type?.startsWith('image/'));
    if (!pictures.length) return '';
    const pages = [];
    for (let index = 0; index < pictures.length; index += 4) pages.push(pictures.slice(index, index + 4));
    return pages.map((group, index) => {
      const countClass = `photo-count-${group.length}`;
      const pageLabel = pages.length > 1 ? `${page} · Photo page ${index + 1} of ${pages.length}` : page;
      return `<section class="print-page">${brand()}<div class="print-title"><h2>${title}</h2><span>${pageLabel}</span></div><p>${label}</p><div class="print-photos ${countClass}">${group.map((photo) => `<div class="print-photo"><div><img src="${photo.data || ''}" alt="">${photo.caption ? `<small>${esc(photo.caption)}</small>` : ''}</div></div>`).join('')}</div>${foot()}</section>`;
    }).join('');
  };

  coverPage = function coverPageWithContractSignature(stage, title, number, date, job, totalPages, privateDocument = false) {
    let html = originalCoverPage(stage, title, number, date, job, totalPages, privateDocument);
    if (title === 'Customer Contract') {
      const block = `<div class="cover-signatures"><div><span></span><small>Customer signature · Date</small></div><div><span></span><small>${esc(state.settings.legal)} representative · Date</small></div></div>`;
      html = html.replace('<div class="cover-bottom">', `${block}<div class="cover-bottom">`);
    }
    return html;
  };

  function blankDocument(type) {
    const job = blankJob();
    job.customerName = '';
    job.customerPhone = '';
    job.customerEmail = '';
    job.projectAddress = '';
    job.billingAddress = '';
    job.description = '';
    job.completedDescription = '';
    job.items = Array.from({ length: 6 }, () => ({ id: crypto.randomUUID(), done: false, category: 'Labor', description: '', qty: '', rate: '' }));
    job.freelancerName = '____________________________';
    originalPrintDocument(type, job);
    if (type === 'contract') removeRepeatedContractSignatures();
    $('#printArea').classList.add('print-monochrome');
  }

  function removeRepeatedContractSignatures() {
    $$('#printArea .signature-grid').forEach((grid) => {
      if (grid.textContent.includes('Customer signature')) grid.remove();
    });
  }

  function printSaved(type, job, mode = 'standard') {
    if (!job) return toast('Choose a saved job first');
    originalPrintDocument(type, job);
    const printArea = $('#printArea');
    if (type === 'contract') removeRepeatedContractSignatures();
    printArea.classList.toggle('print-monochrome', mode === 'black-white' || type === 'quote' || type === 'contract');
    if (mode === 'receipt-pair') {
      const colorCopy = printArea.innerHTML;
      printArea.innerHTML = `<div class="receipt-color-copy">${colorCopy}</div><div class="receipt-copy-break print-monochrome">${colorCopy}</div>`;
      printArea.classList.remove('print-monochrome');
    }
  }

  $$('.print-blank').forEach((button) => { button.addEventListener('click', () => blankDocument(button.dataset.doc)); });

  function archiveCard(job) {
    return `<article class="archive-card"><button class="archive-toggle" type="button" data-id="${job.id}"><span><b>${esc(job.quoteNumber)} · ${esc(job.customerName || 'Unnamed customer')}</b><small>${dateLabel(job.quoteDate || job.createdAt)} · ${esc(job.status)}</small></span><span>Open documents</span></button><div class="archive-actions" data-archive="${job.id}" hidden><button data-print="quote">Quote · B&amp;W</button><button data-print="contract">Contract · B&amp;W</button><button data-print="receipt">Receipt · color</button><button data-print="receipt-pair">Print 2 receipts · color + B&amp;W</button><button data-print="freelancer">Subcontract</button><button class="create-sign-link">Create customer signing link</button></div></article>`;
  }

  function renderDocumentArchive() {
    const host = $('#documentArchive');
    if (!host) return;
    const jobs = [...state.jobs].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    host.innerHTML = jobs.length ? jobs.map(archiveCard).join('') : '<div class="portal-empty">No saved customer documents yet.</div>';
    $$('.archive-toggle', host).forEach((button) => { button.onclick = () => { const actions = host.querySelector(`[data-archive="${button.dataset.id}"]`); actions.hidden = !actions.hidden; }; });
    $$('.archive-actions button[data-print]', host).forEach((button) => {
      button.onclick = () => {
        const job = state.jobs.find((item) => item.id === button.closest('.archive-actions').dataset.archive);
        const action = button.dataset.print;
        printSaved(action === 'receipt-pair' ? 'receipt' : action, job, action === 'receipt-pair' ? 'receipt-pair' : (action === 'receipt' ? 'standard' : 'black-white'));
      };
    });
    $$('.create-sign-link', host).forEach((button) => { button.onclick = () => createSigningLink(button.closest('.archive-actions').dataset.archive, button); });
    loadSigningActivity();
  }

  async function loadSigningActivity() {
    const host = $('#signedDocumentList');
    if (!host || !window.supabase || !window.NIKO_CONFIG) return;
    try {
      const client = window.supabase.createClient(window.NIKO_CONFIG.supabaseUrl, window.NIKO_CONFIG.supabasePublishableKey);
      const { data: authData } = await client.auth.getSession();
      if (!authData.session) return;
      const { data, error } = await client.from('niko_signature_requests').select('id,quote_number,customer_name,created_at,expires_at,signed_at,signer_name,signature_data_url').eq('owner_id', authData.session.user.id).order('created_at', { ascending: false });
      if (error) throw error;
      host.innerHTML = data?.length ? data.map((request) => `<article class="signature-activity"><div><b>${esc(request.quote_number)} · ${esc(request.customer_name)}</b><small>${request.signed_at ? `Signed ${dateLabel(request.signed_at)} by ${esc(request.signer_name || 'customer')}` : `Awaiting signature · expires ${dateLabel(request.expires_at)}`}</small></div>${request.signature_data_url ? `<img src="${request.signature_data_url}" alt="Customer signature for ${esc(request.quote_number)}">` : '<span class="permission-chip">Pending</span>'}</article>`).join('') : '<div class="portal-empty">No customer signing links created yet.</div>';
    } catch (error) {
      host.innerHTML = '<div class="portal-empty">Run the updated Supabase setup SQL to enable customer signing.</div>';
    }
  }

  async function createSigningLink(jobId, button) {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job?.customerName || !job?.customerPhone) return toast('Add the customer name and phone number first');
    if (!window.supabase || !window.NIKO_CONFIG) return toast('Supabase connection is unavailable');
    button.disabled = true;
    try {
      const client = window.supabase.createClient(window.NIKO_CONFIG.supabaseUrl, window.NIKO_CONFIG.supabasePublishableKey);
      const { data: authData } = await client.auth.getSession();
      if (!authData.session) throw new Error('Sign in again before creating a link');
      const token = [...crypto.getRandomValues(new Uint8Array(24))].map((value) => value.toString(16).padStart(2, '0')).join('');
      const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((value) => value.toString(16).padStart(2, '0')).join('');
      const snapshot = {
        customerName: job.customerName,
        customerPhoneLast4: phoneKey(job.customerPhone).slice(-4),
        quoteNumber: job.quoteNumber,
        contractNumber: job.contractNumber,
        projectAddress: job.projectAddress,
        description: job.description,
        items: job.items,
        total: totals(job).quotedTotal,
        materials: job.materials,
        cleanup: job.cleanup,
        paymentDue: job.paymentDue,
        company: state.settings.business,
        legal: state.settings.legal,
        phone: state.settings.phone
      };
      const { error } = await client.from('niko_signature_requests').insert({ owner_id: authData.session.user.id, job_id: job.id, access_token_hash: tokenHash, customer_name: job.customerName, customer_phone_last4: phoneKey(job.customerPhone).slice(-4), quote_number: job.quoteNumber, document_type: 'contract', document_snapshot: snapshot, expires_at: new Date(Date.now() + 14 * 86400000).toISOString() });
      if (error) throw error;
      const base = String(state.settings.website || 'https://nikoresidentialholdings.com').replace(/\/$/, '');
      const link = `${base}/sign.html?token=${token}`;
      await navigator.clipboard.writeText(link);
      toast('Secure signing link copied');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not create signing link. Run the updated Supabase SQL first.');
    } finally {
      button.disabled = false;
    }
  }

  window.renderDocumentArchive = renderDocumentArchive;
  window.nikoAppReady?.then(() => {
    ensureDirectoryState();
    refreshSuggestions();
    renderDashboard();
    renderContractors();
    renderDocumentArchive();
    persist();
  });
})();
