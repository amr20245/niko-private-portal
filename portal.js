(() => {
  const cfg = window.NIKO_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(cfg.supabaseUrl || '') && cfg.supabasePublishableKey && !String(cfg.supabasePublishableKey).startsWith('PASTE_');
  const client = configured && window.supabase?.createClient ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const byId = (id) => document.getElementById(id);
  const make = (tag, textValue, className) => {
    const element = document.createElement(tag);
    if (textValue !== undefined && textValue !== null) element.textContent = String(textValue);
    if (className) element.className = className;
    return element;
  };
  const empty = (textValue) => {
    const element = make('div', textValue, 'portal-empty');
    return element;
  };
  const formatDateTime = (value) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not provided';
  const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' }) : 'Not provided';
  const getSession = async () => {
    if (!client) throw new Error('Connect Supabase first.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) throw new Error('Sign in again to continue.');
    return data.session;
  };
  const toDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const safeName = (value) => String(value || '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'photo.jpg';

  function refreshJobSelects() {
    ['appointmentJob', 'publishJob'].forEach((id) => {
      const select = byId(id);
      if (!select) return;
      const previous = select.value;
      select.replaceChildren();
      if (!state.jobs.length) select.append(new Option('Create a job first', ''));
      state.jobs.forEach((job) => select.append(new Option(`${job.customerName || 'Unnamed customer'} | ${job.quoteNumber}`, job.id)));
      if (state.jobs.some((job) => job.id === previous)) select.value = previous;
    });
  }

  async function loadLeads() {
    const list = byId('leadList');
    const notice = byId('leadNotice');
    list.replaceChildren();
    if (!client) {
      notice.hidden = false;
      list.append(empty('Add the Supabase Project URL and publishable key, then run the updated SQL.'));
      return;
    }
    notice.hidden = true;
    list.append(empty('Loading quote requests...'));
    try {
      await getSession();
      const { data, error } = await client.from('niko_quote_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const openCount=(data||[]).filter((lead)=>!['Converted to job','Closed'].includes(lead.status)).length;
      if(byId('statLeads'))byId('statLeads').textContent=String(openCount);
      document.querySelector('[data-view="leads"]')?.classList.toggle('has-alert',openCount>0);
      list.replaceChildren();
      if (!data?.length) return list.append(empty('No website quote requests yet.'));
      for (const lead of data) list.append(await leadCard(lead));
    } catch (error) {
      console.error(error);
      list.replaceChildren(empty(error.message || 'Could not load quote requests.'));
    }
  }

  async function signedLeadPhotos(paths) {
    const results = [];
    for (const path of Array.isArray(paths) ? paths : []) {
      const { data, error } = await client.storage.from('niko-quote-request-files').createSignedUrl(path, 1800);
      if (!error && data?.signedUrl) results.push({ path, url: data.signedUrl });
    }
    return results;
  }

  async function leadCard(lead) {
    const card = make('article', null, 'portal-card');
    const head = make('div', null, 'portal-card-head');
    const heading = make('div');
    heading.append(make('h3', lead.customer_name || 'Unnamed request'), make('small', `Received ${formatDateTime(lead.created_at)}`));
    const statusWrap = make('label', null, 'request-status');
    statusWrap.append(make('small', 'Status'));
    const status = document.createElement('select');
    ['New', 'Contacted', 'Visit scheduled', 'Quoted', 'Converted to job', 'Closed'].forEach((value) => status.append(new Option(value, value)));
    status.value = lead.status || 'New';
    status.addEventListener('change', async () => {
      const { error } = await client.from('niko_quote_requests').update({ status: status.value, updated_at: new Date().toISOString() }).eq('id', lead.id);
      if (error) toast('Could not update request status'); else toast('Request status updated');
    });
    statusWrap.append(status);
    head.append(heading, statusWrap);
    const meta = make('div', null, 'lead-meta');
    [['Phone', lead.phone], ['Email', lead.email], ['Project address', lead.project_address], ['Preferred visit', `${formatDate(lead.preferred_visit_date)} ${lead.preferred_time_window || ''}`.trim()], ['Services', (lead.service_types || []).join(', ')], ['Budget', lead.budget_range || 'Not provided']].forEach(([label, value]) => {
      const box = make('div'); box.append(make('small', label), make('strong', value || 'Not provided')); meta.append(box);
    });
    card.append(head, meta, make('p', lead.project_description || 'No description provided.'));
    const permission = make('span', lead.public_photo_release ? 'Public non-identifying photo use selected' : 'Documentation use only', `permission-chip${lead.public_photo_release ? ' approved' : ''}`);
    card.append(permission);
    const photos = await signedLeadPhotos(lead.file_paths);
    if (photos.length) {
      const photoGrid = make('div', null, 'lead-photos');
      photos.forEach((photo, index) => {
        const link = document.createElement('a'); link.href = photo.url; link.target = '_blank'; link.rel = 'noopener';
        const image = document.createElement('img'); image.src = photo.url; image.alt = `Submitted project photo ${index + 1}`; image.loading = 'lazy'; link.append(image); photoGrid.append(link);
      });
      card.append(photoGrid);
    }
    const actions = make('div', null, 'portal-card-actions');
    const createButton = make('button', 'Create job from request'); createButton.type = 'button';
    createButton.addEventListener('click', async () => createJobFromLead(lead, createButton));
    const call = document.createElement('a'); call.href = `tel:${String(lead.phone || '').replace(/[^+\d]/g, '')}`; call.textContent = 'Call';
    const email = document.createElement('a'); email.href = `mailto:${encodeURIComponent(lead.email || '')}`; email.textContent = 'Email';
    const remove = make('button', 'Delete request', 'danger-ghost'); remove.type = 'button'; remove.addEventListener('click', () => deleteLead(lead));
    actions.append(createButton, call, email, remove); card.append(actions);
    return card;
  }

  async function createJobFromLead(lead, button) {
    if (!confirm(`Create a new job for ${lead.customer_name || 'this request'}?`)) return;
    button.disabled = true; button.textContent = 'Creating job...';
    try {
      const job = blankJob();
      job.customerName = lead.customer_name || '';
      job.customerPhone = lead.phone || '';
      job.customerEmail = lead.email || '';
      job.projectAddress = lead.project_address || '';
      job.description = lead.project_description || '';
      job.photoUsePermission = lead.public_photo_release ? 'Public non-identifying use approved' : 'Documentation only';
      job.beforePhotos = [];
      for (const [index, path] of (lead.file_paths || []).entries()) {
        const { data, error } = await client.storage.from('niko-quote-request-files').download(path);
        if (error) continue;
        job.beforePhotos.push({ id: crypto.randomUUID(), name: path.split('/').pop() || `submitted-photo-${index + 1}.jpg`, type: data.type || 'image/jpeg', data: await toDataUrl(data), caption: 'Submitted with website quote request' });
      }
      state.jobs.unshift(job); state.counter += 1; state.currentId = job.id;
      await persist(); renderDashboard(); updateDocSelect(); refreshJobSelects();
      await client.from('niko_quote_requests').update({ status: 'Converted to job', updated_at: new Date().toISOString() }).eq('id', lead.id);
      openJob(job.id); toast('Job created from website request');
    } catch (error) {
      console.error(error); toast(error.message || 'Could not create job');
    } finally { button.disabled = false; button.textContent = 'Create job from request'; }
  }

  async function deleteLead(lead) {
    if (!confirm(`Delete the quote request from ${lead.customer_name || 'this customer'} and its submitted photos? This cannot be undone.`)) return;
    try {
      if (lead.file_paths?.length) await client.storage.from('niko-quote-request-files').remove(lead.file_paths);
      const { error } = await client.from('niko_quote_requests').delete().eq('id', lead.id);
      if (error) throw error;
      toast('Quote request deleted'); loadLeads();
    } catch (error) { console.error(error); toast('Could not delete quote request'); }
  }

  function customerCalendarLink(job, appointment) {
    const base = String(state.settings.website || 'https://nikoresidentialholdings.com').replace(/\/$/, '');
    const url = new URL(`${base}/calendar.html`);
    url.searchParams.set('title', `${appointment.type} | Niko Residential Holdings`);
    url.searchParams.set('start', new Date(appointment.start).toISOString());
    url.searchParams.set('end', new Date(appointment.end).toISOString());
    url.searchParams.set('location', appointment.location || job.projectAddress || 'To be confirmed');
    url.searchParams.set('notes', appointment.notes || `Appointment for ${job.customerName || 'customer project'}`);
    return url.toString();
  }

  function appointmentIcs(job, appointment) {
    const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const clean = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Niko Residential Holdings//Portal//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${appointment.id}@nikoresidentialholdings.com`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(appointment.start)}`,`DTEND:${stamp(appointment.end)}`,`SUMMARY:${clean(`${appointment.type} | Niko Residential Holdings`)}`,`DESCRIPTION:${clean(`${appointment.notes || 'Project appointment'}\nNiko Residential Holdings | 513-212-5883`)}`,`LOCATION:${clean(appointment.location || job.projectAddress)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  }

  function downloadText(textValue, name, type) {
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([textValue], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function renderAppointments() {
    refreshJobSelects();
    const list = byId('appointmentList'); list.replaceChildren();
    const appointments = state.jobs.flatMap((job) => (job.appointments || []).map((appointment) => ({ job, appointment }))).sort((a, b) => new Date(a.appointment.start) - new Date(b.appointment.start));
    if (!appointments.length) return list.append(empty('No appointments saved yet.'));
    appointments.forEach(({ job, appointment }) => {
      const card = make('article', null, 'portal-card appointment-row');
      const when = new Date(appointment.start);
      const dateBox = make('div', null, 'appointment-date'); dateBox.append(make('span', when.toLocaleDateString([], { month: 'short' })), make('b', when.getDate()), make('span', when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
      const body = make('div'); body.append(make('h3', appointment.type), make('small', `${job.customerName || 'Unnamed customer'} | ${job.quoteNumber}`), make('p', `${formatDateTime(appointment.start)} to ${new Date(appointment.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}\n${appointment.location || job.projectAddress || 'Location to be confirmed'}`));
      const actions = make('div', null, 'portal-card-actions');
      const copy = make('button', 'Copy customer link'); copy.type = 'button'; copy.onclick = async () => { await navigator.clipboard.writeText(customerCalendarLink(job, appointment)); toast('Customer calendar link copied'); };
      const open = document.createElement('a'); open.href = customerCalendarLink(job, appointment); open.target = '_blank'; open.rel = 'noopener'; open.textContent = 'Open calendar page';
      const ics = make('button', 'Download ICS'); ics.type = 'button'; ics.onclick = () => downloadText(appointmentIcs(job, appointment), 'niko-appointment.ics', 'text/calendar;charset=utf-8');
      const remove = make('button', 'Delete', 'danger-ghost'); remove.type = 'button'; remove.onclick = async () => { if (!confirm('Delete this appointment?')) return; job.appointments = (job.appointments || []).filter((item) => item.id !== appointment.id); await persist(); renderAppointments(); toast('Appointment deleted'); };
      actions.append(copy, open, ics, remove); body.append(actions); card.append(dateBox, body); list.append(card);
    });
  }

  byId('appointmentJob')?.addEventListener('change', (event) => {
    const job = state.jobs.find((item) => item.id === event.target.value);
    if (job) byId('appointmentLocation').value = job.projectAddress || '';
  });
  byId('appointmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const job = state.jobs.find((item) => item.id === byId('appointmentJob').value);
    if (!job) return toast('Choose a job first');
    const start = byId('appointmentStart').value; const end = byId('appointmentEnd').value;
    if (!start || !end || new Date(end) <= new Date(start)) return toast('End time must be after start time');
    job.appointments = job.appointments || [];
    job.appointments.push({ id: crypto.randomUUID(), type: byId('appointmentType').value, start, end, location: byId('appointmentLocation').value.trim(), notes: byId('appointmentNotes').value.trim(), createdAt: Date.now() });
    await persist(); event.target.reset(); renderAppointments(); toast('Appointment saved');
  });

  function renderPublishPhotos(job) {
    ['Before', 'After'].forEach((kind) => {
      const key = `${kind.toLowerCase()}Photos`;
      const host = byId(`publish${kind}Photos`); host.replaceChildren();
      if (!(job?.[key] || []).length) return host.append(empty(`No ${kind.toLowerCase()} photos in this job.`));
      job[key].forEach((photo) => {
        if (!photo.type?.startsWith('image/')) return;
        const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = photo.id; input.dataset.kind = key;
        const image = document.createElement('img'); image.src = photo.data || ''; image.alt = photo.caption || photo.name || `${kind} photo`;
        label.append(input, image, make('span', photo.caption || photo.name || `${kind} photo`)); host.append(label);
      });
    });
  }

  function fillPublishForm() {
    const job = state.jobs.find((item) => item.id === byId('publishJob').value);
    byId('publishTitle').value = job ? `${job.customerName ? '' : ''}${job.workerTrade || 'Residential project'}`.trim() : '';
    byId('publishCategory').value = job?.workerTrade || '';
    byId('publishArea').value = 'Greater Cincinnati';
    byId('publishCompleted').value = job?.completionDate || '';
    byId('publishSummary').value = job?.completedDescription || job?.description || '';
    byId('publishConfirm').checked = false;
    renderPublishPhotos(job);
    if (job && job.photoUsePermission !== 'Public non-identifying use approved') toast('This job does not have public photo approval');
  }
  byId('publishJob')?.addEventListener('change', fillPublishForm);

  async function photoBlob(job, photo) {
    if (photo.data) return fetch(photo.data).then((response) => response.blob());
    if (photo.storagePath) {
      const { data, error } = await client.storage.from('niko-job-files').download(photo.storagePath);
      if (error) throw error;
      return data;
    }
    throw new Error(`Photo ${photo.name || photo.id} is not available on this device.`);
  }

  async function publishProject(event) {
    event.preventDefault();
    const button = byId('publishProject');
    const job = state.jobs.find((item) => item.id === byId('publishJob').value);
    if (!job) return toast('Choose a job first');
    if (job.photoUsePermission !== 'Public non-identifying use approved') return toast('Customer public photo approval is required');
    if (!byId('publishConfirm').checked) return toast('Confirm the photo privacy review');
    const beforeIds = [...byId('publishBeforePhotos').querySelectorAll('input:checked')].map((item) => item.value);
    const afterIds = [...byId('publishAfterPhotos').querySelectorAll('input:checked')].map((item) => item.value);
    if (!beforeIds.length || !afterIds.length) return toast('Choose at least one before and one after photo');
    button.disabled = true; button.textContent = 'Publishing...';
    try {
      const session = await getSession(); const ownerId = session.user.id;
      const { data: existing, error: existingError } = await client.from('niko_public_projects').select('*').eq('owner_id', ownerId).eq('source_job_id', job.id).maybeSingle();
      if (existingError) throw existingError;
      const uploadGroup = async (key, ids) => {
        const files = job[key].filter((photo) => ids.includes(photo.id)); const paths = [];
        for (const photo of files) {
          const blob = await photoBlob(job, photo); const path = `${ownerId}/${job.id}/${key}/${photo.id}-${safeName(photo.name)}`;
          const { error } = await client.storage.from('niko-public-portfolio').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg', cacheControl: '3600' });
          if (error) throw error; paths.push(path);
        }
        return paths;
      };
      const beforePaths = await uploadGroup('beforePhotos', beforeIds); const afterPaths = await uploadGroup('afterPhotos', afterIds);
      const payload = { owner_id: ownerId, source_job_id: job.id, title: byId('publishTitle').value.trim(), summary: byId('publishSummary').value.trim(), service_category: byId('publishCategory').value.trim(), area_label: byId('publishArea').value.trim(), completed_on: byId('publishCompleted').value || null, before_paths: beforePaths, after_paths: afterPaths, is_published: true, published_at: new Date().toISOString() };
      const result = existing ? await client.from('niko_public_projects').update(payload).eq('id', existing.id) : await client.from('niko_public_projects').insert(payload);
      if (result.error) throw result.error;
      const oldPaths = [...(existing?.before_paths || []), ...(existing?.after_paths || [])].filter((path) => ![...beforePaths, ...afterPaths].includes(path));
      if (oldPaths.length) await client.storage.from('niko-public-portfolio').remove(oldPaths);
      toast('Project published to the public website'); loadPublishedProjects();
    } catch (error) { console.error(error); toast(error.message || 'Could not publish project'); }
    finally { button.disabled = false; button.textContent = 'Publish or update project'; }
  }
  byId('publishProjectForm')?.addEventListener('submit', publishProject);

  async function loadPublishedProjects() {
    const list = byId('publishedProjectList'); list.replaceChildren();
    if (!client) return list.append(empty('Connect Supabase to manage public projects.'));
    try {
      const session = await getSession();
      const { data, error } = await client.from('niko_public_projects').select('*').eq('owner_id', session.user.id).order('published_at', { ascending: false });
      if (error) throw error;
      if (!data?.length) return list.append(empty('No projects have been published yet.'));
      data.forEach((project) => {
        const card = make('article', null, 'portal-card'); const head = make('div', null, 'portal-card-head'); const info = make('div');
        info.append(make('h3', project.title), make('small', `${project.area_label || 'No area label'} | ${project.is_published ? 'Live' : 'Hidden'}`)); head.append(info, make('span', project.is_published ? 'Published' : 'Unpublished', `permission-chip${project.is_published ? ' approved' : ''}`));
        card.append(head, make('p', project.summary)); const actions = make('div', null, 'portal-card-actions');
        const toggle = make('button', project.is_published ? 'Unpublish' : 'Publish again'); toggle.type = 'button'; toggle.onclick = async () => { const { error: updateError } = await client.from('niko_public_projects').update({ is_published: !project.is_published, published_at: new Date().toISOString() }).eq('id', project.id); if (updateError) toast('Could not change project visibility'); else { toast(project.is_published ? 'Project hidden from website' : 'Project published'); loadPublishedProjects(); } };
        const remove = make('button', 'Delete public copy', 'danger-ghost'); remove.type = 'button'; remove.onclick = async () => { if (!confirm('Delete this public project and its public photo copies? The private job stays saved.')) return; const paths = [...(project.before_paths || []), ...(project.after_paths || [])]; if (paths.length) await client.storage.from('niko-public-portfolio').remove(paths); const { error: deleteError } = await client.from('niko_public_projects').delete().eq('id', project.id); if (deleteError) toast('Could not delete public project'); else { toast('Public project deleted'); loadPublishedProjects(); } };
        actions.append(toggle, remove); card.append(actions); list.append(card);
      });
    } catch (error) { console.error(error); list.append(empty(error.message || 'Could not load published projects.')); }
  }

  window.nikoPortalView = (name) => {
    refreshJobSelects();
    if (name === 'leads') loadLeads();
    if (name === 'schedule') renderAppointments();
    if (name === 'publicProjects') { fillPublishForm(); loadPublishedProjects(); }
  };
  byId('refreshLeads')?.addEventListener('click', loadLeads);
  byId('refreshPublicProjects')?.addEventListener('click', loadPublishedProjects);
  window.nikoAppReady?.then(() => {
    migrateState(); refreshJobSelects(); renderAppointments(); fillPublishForm(); loadLeads();
    setInterval(()=>{if(!document.hidden)loadLeads()},60000);
  });
})();
