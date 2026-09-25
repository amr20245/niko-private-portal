(() => {
  const config = window.NIKO_CONFIG || {};
  const authShell = document.querySelector('#authShell');
  const loginForm = document.querySelector('#loginForm');
  const emailInput = document.querySelector('#loginEmail');
  const passwordInput = document.querySelector('#loginPassword');
  const message = document.querySelector('#authMessage');
  const signOutButton = document.querySelector('#signOutButton');
  const syncButton = document.querySelector('#syncNow');
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl || '') &&
    config.supabasePublishableKey && !String(config.supabasePublishableKey).startsWith('PASTE_');
  let cloud = null;
  let currentUser = null;
  let syncing = false;
  let syncTimer = null;
  const localPersist = persist;

  function setMessage(text, good = false) {
    message.textContent = text || '';
    message.style.color = good ? 'var(--good)' : 'var(--danger)';
  }

  function setCloudStatus(label, detail, online = true) {
    const sidebarLabel = document.querySelector('#cloudStatusText');
    const title = document.querySelector('#settingsCloudTitle');
    const settingsDetail = document.querySelector('#settingsCloudDetail');
    const dot = document.querySelector('#cloudStatusDot');
    if (sidebarLabel) sidebarLabel.textContent = label;
    if (title) title.textContent = label;
    if (settingsDetail) settingsDetail.textContent = detail;
    if (dot) dot.classList.toggle('offline', !online);
  }

  async function saveLocalOnly() {
    return localPersist();
  }

  function fileGroups(job) {
    return ['beforePhotos', 'afterPhotos', 'receiptPhotos'].flatMap(key =>
      (job[key] || []).map(file => ({ key, file }))
    );
  }

  function safeExtension(file) {
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type === 'image/png') return 'png';
    return 'jpg';
  }

  async function uploadPendingFiles() {
    for (const job of state.jobs || []) {
      for (const { key, file } of fileGroups(job)) {
        if (file.storagePath || !file.data) continue;
        const blob = await fetch(file.data).then(response => response.blob());
        const path = `${currentUser.id}/${job.id}/${key}/${file.id}.${safeExtension(file)}`;
        const { error } = await cloud.storage.from('niko-job-files').upload(path, blob, {
          contentType: file.type || blob.type,
          cacheControl: '3600',
          upsert: true
        });
        if (error) throw error;
        file.storagePath = path;
      }
    }
  }

  function payloadForCloud() {
    const payload = structuredClone(state);
    for (const job of payload.jobs || []) {
      for (const { file } of fileGroups(job)) {
        if (file.storagePath) delete file.data;
      }
    }
    return payload;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function downloadCloudFiles(remoteState) {
    for (const job of remoteState.jobs || []) {
      for (const { file } of fileGroups(job)) {
        if (file.data || !file.storagePath) continue;
        const { data, error } = await cloud.storage.from('niko-job-files').download(file.storagePath);
        if (error) {
          console.error(error);
          file.cloudFileUnavailable = true;
          continue;
        }
        file.data = await blobToDataUrl(data);
      }
    }
  }

  async function pushCloud(showToast = false) {
    if (!cloud || !currentUser || syncing) return false;
    syncing = true;
    setCloudStatus('Syncing…', 'Uploading records and private project files', true);
    try {
      state.cloudUpdatedAt = Date.now();
      await uploadPendingFiles();
      await saveLocalOnly();
      const { error } = await cloud.from('niko_app_state').upsert({
        user_id: currentUser.id,
        payload: payloadForCloud(),
        updated_at: new Date(state.cloudUpdatedAt).toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
      setCloudStatus('Cloud synced', `Last saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, true);
      if (showToast) toast('Cloud sync complete');
      return true;
    } catch (error) {
      console.error(error);
      setCloudStatus('Cloud sync paused', 'Local copy is safe; check Supabase setup or connection', false);
      if (showToast) toast('Cloud sync failed; local copy saved');
      return false;
    } finally {
      syncing = false;
    }
  }

  function queueCloudSave() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushCloud(false), 900);
  }

  persist = async function persistWithCloud() {
    state.cloudUpdatedAt = Date.now();
    const saved = await saveLocalOnly();
    if (saved && currentUser) queueCloudSave();
    return saved;
  };

  async function pullCloud() {
    setCloudStatus('Checking cloud…', 'Comparing this device with your saved account', true);
    const { data, error } = await cloud
      .from('niko_app_state')
      .select('payload, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.payload) {
      await pushCloud(false);
      return;
    }
    const remoteState = data.payload;
    const remoteTime = new Date(data.updated_at || 0).getTime();
    const localTime = Number(state.cloudUpdatedAt || 0);
    if (remoteTime >= localTime || !state.jobs?.length) {
      state = remoteState;
      migrateState();
      state.cloudUpdatedAt = remoteTime;
      setCloudStatus('Loading project files…', 'Downloading private photos and receipt copies', true);
      await downloadCloudFiles(state);
      await saveLocalOnly();
      hydrateSettings();
      renderDashboard();
      updateDocSelect();
    } else {
      await pushCloud(false);
    }
    setCloudStatus('Cloud synced', 'This device matches your Supabase account', true);
  }

  async function openApp(session) {
    await (window.nikoAppReady || Promise.resolve());
    currentUser = session.user;
    if (state.accountUserId && state.accountUserId !== currentUser.id) {
      state = {
        jobs: [],
        settings: {
          business: 'Niko Residential Holdings',
          legal: 'Amr and Nhi LLC',
          phone: '513-212-5883',
          email: 'daraghmehamr1@gmail.com',
          address: '',
          website: 'https://nikoresidentialholdings.com'
        },
        counter: 1,
        currentId: null
      };
    }
    state.accountUserId = currentUser.id;
    await saveLocalOnly();
    document.querySelector('#signedInEmail').textContent = currentUser.email || 'Owner';
    document.querySelector('.account-avatar').textContent = (currentUser.email || 'A').charAt(0).toUpperCase();
    try {
      await pullCloud();
      authShell.classList.add('hidden');
      document.body.classList.add('authenticated');
      setMessage('');
    } catch (error) {
      console.error(error);
      authShell.classList.add('hidden');
      setCloudStatus('Local copy active', 'Database table or security policy still needs setup', false);
      toast('Signed in; cloud table needs setup');
    }
  }

  async function initialize() {
    if (!configured || !window.supabase?.createClient) {
      loginForm.querySelector('button').disabled = true;
      setMessage('System connection unavailable. Contact tech support at 513-212-5883.');
      setCloudStatus('Connection unavailable', 'Contact tech support at 513-212-5883', false);
      return;
    }
    cloud = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    cloud.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        authShell.classList.remove('hidden');
        passwordInput.value = '';
        setCloudStatus('Signed out', 'Sign in to reach cloud records', false);
      }
    });
    const { data, error } = await cloud.auth.getSession();
    if (error) setMessage(error.message);
    if (data?.session) await openApp(data.session);
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!cloud) return;
    const button = loginForm.querySelector('button');
    button.disabled = true;
    button.textContent = 'Signing in…';
    setMessage('');
    const { data, error } = await cloud.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    button.disabled = false;
    button.textContent = 'Sign in securely';
    if (error) return setMessage(error.message);
    await openApp(data.session);
  });

  const supportDialog = document.querySelector('#techSupportDialog');
  document.querySelector('#forgotPassword')?.addEventListener('click', () => {
    if (supportDialog?.showModal) {
      supportDialog.showModal();
      return;
    }
    alert('Contact tech support: 513-212-5883');
  });

  signOutButton.addEventListener('click', async () => {
    if (cloud) await cloud.auth.signOut();
  });

  syncButton.addEventListener('click', () => pushCloud(true));
  window.nikoDeleteRemoteFiles = async job => {
    if (!cloud || !currentUser || !job) return;
    const paths = fileGroups(job).map(({ file }) => file.storagePath).filter(Boolean);
    if (!paths.length) return;
    const { error } = await cloud.storage.from('niko-job-files').remove(paths);
    if (error) console.error(error);
  };
  window.nikoDeleteRemoteFile = async file => {
    if (!cloud || !currentUser || !file?.storagePath) return;
    const { error } = await cloud.storage.from('niko-job-files').remove([file.storagePath]);
    if (error) console.error(error);
  };
  window.addEventListener('online', () => currentUser && pushCloud(false));
  window.addEventListener('offline', () => setCloudStatus('Offline — local copy active', 'Changes will sync when the connection returns', false));
  initialize();
})();
