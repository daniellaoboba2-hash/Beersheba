let adminState = { view: 'dashboard', genres: [], tags: [], currentBookId: null };

function fmtMoney(cents, currency){ return `$${(cents/100).toFixed(2)} ${currency||''}`.trim(); }
function fmtDate(s){ return s ? new Date(s.replace(' ','T')+'Z').toLocaleString() : ''; }
function badge(status){ return `<span class="badge badge-${(status||'').toLowerCase()}">${status}</span>`; }
function closeModal(){ document.getElementById('modalScrim').classList.remove('show'); }
function openModal(html){ document.getElementById('modalBox').innerHTML = html; document.getElementById('modalScrim').classList.add('show'); }
function toast(msg){
  let t = document.getElementById('adminToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'adminToast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e1e23;border:1px solid #2a2a30;color:#f2f0ea;padding:10px 18px;border-radius:8px;font-size:12.5px;z-index:300;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(window._at);
  window._at = setTimeout(()=>{ t.style.opacity='0'; }, 2400);
}

async function logoutAdmin(){ await API.post('/api/auth/logout'); location.href = '/login.html'; }

function toggleSidebar(force){
  const sb = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebarScrim');
  const open = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  scrim.classList.toggle('show', open);
}

function nav(view, param){
  adminState.view = view;
  adminState.param = param;
  document.querySelectorAll('.admin-nav a').forEach(a=>a.classList.remove('active'));
  const el = document.querySelector(`.admin-nav a[data-nav="${view}"]`);
  if (el) el.classList.add('active');
  toggleSidebar(false);
  render();
}

async function ensureTaxonomy(){
  if (!adminState.genres.length) adminState.genres = await API.get('/api/admin/genres');
  if (!adminState.tags.length) adminState.tags = await API.get('/api/admin/tags');
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDashboard(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const d = await API.get('/api/admin/dashboard');
  main.innerHTML = `
    <div class="admin-topbar"><h1>Dashboard</h1><span class="who">Beersheba Publisher</span></div>
    <div class="panel" style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-gold btn-sm" onclick="openCreateBookModal()">+ New Book</button>
      <button class="btn btn-ghost btn-sm" onclick="nav('media')">Upload Media</button>
      <button class="btn btn-ghost btn-sm" onclick="nav('books'); toast('Open a book, then Manage Chapters to add one.')">+ Add Chapter</button>
      <button class="btn btn-ghost btn-sm" onclick="nav('orders')">View Orders</button>
      <button class="btn btn-ghost btn-sm" onclick="nav('readers')">View Readers</button>
      <button class="btn btn-ghost btn-sm" onclick="nav('comments')">View Comments</button>
    </div>
    <div class="grid-cards">
      ${statCard(d.totalBooks,'Total Books','goToBooks()')}
      ${statCard(d.publishedBooks,'Published',"goToBooks('PUBLISHED')")}
      ${statCard(d.draftBooks,'Drafts',"goToBooks('DRAFT')")}
      ${statCard(d.scheduledBooks,'Scheduled',"goToBooks('SCHEDULED')")}
      ${statCard(d.totalReaders,'Total Readers',"nav('readers')")}
      ${statCard(d.newReaders7d,'New Readers (7d)',"nav('readers')")}
      ${statCard(d.standardPurchases,'Standard Purchases',"goToOrders('standard')")}
      ${statCard(d.vipMembers,'VIP Members',"nav('vip')")}
      ${statCard('$'+d.totalRevenue,'Total Revenue',"nav('analytics')")}
      ${statCard(d.booksRead,'Books Read',"nav('analytics')")}
      ${statCard(d.pdfDownloads,'PDF Downloads',"nav('analytics')")}
      ${statCard(d.comments,'Comments',"nav('comments')")}
      ${statCard(d.translationRequests,'Translation Requests',"nav('translations')")}
      ${statCard(d.openReports,'Open Reports',"nav('reports')")}
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel"><h3>Revenue (30 days)</h3>${miniBarChart(d.revenueByDay.map(r=>r.cents/100))}</div>
      <div class="panel"><h3>Reader Growth (30 days)</h3>${miniBarChart(d.readerGrowthByDay.map(r=>r.c))}</div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel"><h3>Recent Purchases</h3>${d.recentPurchases.map(o=>`<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px;"><span>${o.user_name} — ${o.product_name}</span><span>${fmtMoney(o.amount_cents,o.currency)}</span></div>`).join('') || '<p class="small-muted">No purchases yet.</p>'}</div>
      <div class="panel"><h3>Recent Registrations</h3>${d.recentRegistrations.map(u=>`<div style="padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px;">${u.name} — ${u.email}</div>`).join('') || '<p class="small-muted">No readers yet.</p>'}</div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel"><h3>Most Read</h3>${d.mostRead.map(b=>`<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px; cursor:pointer;" onclick="openBookEditor('${b.id}')"><span>${b.title}</span><span>${b.readers} readers</span></div>`).join('') || '<p class="small-muted">—</p>'}</div>
      <div class="panel"><h3>Most Purchased</h3>${d.mostPurchased.map(b=>`<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px; cursor:pointer;" onclick="openBookEditor('${b.id}')"><span>${b.title}</span><span>${b.purchases} purchases</span></div>`).join('') || '<p class="small-muted">—</p>'}</div>
    </div>
    <div class="panel"><h3>Recent Comments</h3>${d.recentComments.map(c=>`<div style="padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px;"><b>${c.user_name}</b> on <i>${c.book_title}</i>: ${c.body}</div>`).join('') || '<p class="small-muted">No comments yet.</p>'}</div>
  `;
}
function goToBooks(status){ adminState.bookFilter = status || ''; nav('books'); }
function goToOrders(filter){ adminState.orderFilter = filter || ''; nav('orders'); }
function statCard(num,label,onclick){ return `<div class="stat-card" style="cursor:pointer;" onclick="${onclick||''}" role="button" tabindex="0"><div class="num">${num}</div><div class="label">${label}</div></div>`; }
function miniBarChart(values){
  if (!values.length) return '<p class="small-muted">No data yet.</p>';
  const max = Math.max(...values, 1);
  return `<div style="display:flex; align-items:flex-end; gap:3px; height:100px;">${values.map(v=>`<div style="flex:1; background:linear-gradient(180deg,var(--gold-bright),var(--gold)); height:${Math.max(2,(v/max)*100)}%; border-radius:2px 2px 0 0;" title="${v}"></div>`).join('')}</div>`;
}

/* ============================================================
   BOOKS
   ============================================================ */
async function renderBooks(){
  await ensureTaxonomy();
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const status = adminState.bookFilter || '';
  const books = await API.get('/api/admin/books' + (status ? `?status=${status}` : ''));
  main.innerHTML = `
    <div class="admin-topbar"><h1>Books</h1><button class="btn btn-gold" onclick="openCreateBookModal()">+ New Book</button></div>
    <div class="tabs-row">
      ${['','DRAFT','PUBLISHED','SCHEDULED','UNPUBLISHED','ARCHIVED'].map(s=>`<button class="${status===s?'active':''}" onclick="adminState.bookFilter='${s}'; renderBooks();">${s||'All'}</button>`).join('')}
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Cover</th><th>Title</th><th>Author</th><th>Genre</th><th>Chapters</th><th>Status</th><th>Access</th><th>VIP</th><th>PDF</th><th>Updated</th><th></th></tr></thead>
        <tbody>
          ${books.map(b=>`<tr>
            <td>${b.cover_image ? `<img src="${esc(b.cover_image)}" style="width:34px;height:50px;object-fit:cover;border-radius:4px;">` : `<div style="width:34px;height:50px;border-radius:4px;border:1px dashed var(--border);"></div>`}</td>
            <td><b>${b.title}</b></td>
            <td>${b.author}</td>
            <td>${b.genres.map(g=>g.name).join(', ')}</td>
            <td>${b.chapterCount}</td>
            <td>${badge(b.status)}</td>
            <td>${b.accessTiers.join(', ')||'—'}</td>
            <td>${b.vip_exclusive?'Exclusive':b.vip_eligible?'Eligible':'—'}</td>
            <td>${b.pdf_eligible?'Yes':'No'}</td>
            <td>${fmtDate(b.updated_at)}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="openBookEditor('${b.id}')">Edit</button></td>
          </tr>`).join('') || '<tr><td colspan="11" class="small-muted">No books yet.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function openCreateBookModal(){
  openModal(`
    <h3 style="font-family:var(--serif); margin-bottom:14px;">New Book</h3>
    <div class="field"><label>Title</label><input id="nbTitle" placeholder="The Billionaire's Forbidden Love"></div>
    <div class="field"><label>Author</label><input id="nbAuthor" value="Beersheba"></div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:18px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="createBook()">Create Draft</button>
    </div>`);
}
async function createBook(){
  const title = document.getElementById('nbTitle').value.trim();
  if (!title) return toast('Title is required.');
  try {
    const book = await API.post('/api/admin/books', { title, author: document.getElementById('nbAuthor').value.trim() });
    closeModal();
    openBookEditor(book.id);
  } catch (e) { toast(e.message); }
}

async function openBookEditor(bookId){
  adminState.currentBookId = bookId;
  adminState.bookTab = adminState.bookTab || 'details';
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const book = await API.get(`/api/admin/books/${bookId}`);
  main.innerHTML = `
    <div class="admin-topbar">
      <h1>${book.title || 'Untitled'} ${badge(book.status)}</h1>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="nav('books')">← Back to Books</button>
        ${book.status==='PUBLISHED' ? `<button class="btn btn-ghost" onclick="unpublishBook('${book.id}')">Unpublish</button>` : `<button class="btn btn-gold" onclick="publishBook('${book.id}')">Publish</button>`}
        <button class="btn btn-danger" onclick="archiveBook('${book.id}')">Archive</button>
      </div>
    </div>
    <div class="panel" style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" onclick="adminState.bookTab='chapters'; openBookEditor('${book.id}')">Manage Chapters</button>
      <button class="btn btn-ghost btn-sm" onclick="adminState.bookTab='details'; openBookEditor('${book.id}')">Upload Cover</button>
      <button class="btn btn-ghost btn-sm" onclick="adminState.bookTab='access'; openBookEditor('${book.id}')">Upload PDF</button>
      ${book.status==='PUBLISHED' ? `<a class="btn btn-ghost btn-sm" href="/index.html#detail/${book.slug}" target="_blank" rel="noopener">View Public Page</a>` : `<button class="btn btn-ghost btn-sm" disabled title="Publish the book to view its live page">View Public Page</button>`}
    </div>
    <div class="tabs-row">
      <button class="${adminState.bookTab==='details'?'active':''}" onclick="adminState.bookTab='details'; openBookEditor('${book.id}')">Details</button>
      <button class="${adminState.bookTab==='access'?'active':''}" onclick="adminState.bookTab='access'; openBookEditor('${book.id}')">Access, Flags &amp; PDF</button>
      <button class="${adminState.bookTab==='seo'?'active':''}" onclick="adminState.bookTab='seo'; openBookEditor('${book.id}')">SEO</button>
      <button class="${adminState.bookTab==='chapters'?'active':''}" onclick="adminState.bookTab='chapters'; openBookEditor('${book.id}')">Chapters (${book.chapterCount})</button>
    </div>
    <div id="bookTabBody"></div>`;
  const body = document.getElementById('bookTabBody');
  if (adminState.bookTab === 'chapters') return renderChapterManager(book);
  if (adminState.bookTab === 'access') return renderAccessTab(book, body);
  if (adminState.bookTab === 'seo') return renderSeoTab(book, body);
  return renderDetailsTab(book, body);
}

function renderDetailsTab(book, body){
  body.innerHTML = `
    <div class="panel">
      <div class="field-row">
        <div class="field"><label>Title</label><input id="fTitle" value="${esc(book.title||'')}"></div>
        <div class="field"><label>Subtitle</label><input id="fSubtitle" value="${esc(book.subtitle||'')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Author</label><input id="fAuthor" value="${esc(book.author||'')}"></div>
        <div class="field"><label>Original Language</label><input id="fLang" value="${esc(book.original_language||'English')}"></div>
      </div>
      <div class="field"><label>Short Description</label><input id="fShort" value="${esc(book.short_description||'')}"></div>
      <div class="field"><label>Synopsis</label><textarea id="fSynopsis" rows="4">${esc(book.synopsis||'')}</textarea></div>
      <div class="field">
        <label>Book Cover</label>
        <div style="display:flex; gap:16px; align-items:flex-start;">
          <div style="flex-shrink:0;">
            <img id="coverPreviewImg" src="${esc(book.cover_image||'')}" style="display:${book.cover_image?'block':'none'}; width:110px; height:165px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:var(--bg-2);">
            <div id="coverPlaceholder" style="display:${book.cover_image?'none':'flex'}; width:110px; height:165px; border-radius:8px; border:1px dashed var(--border); align-items:center; justify-content:center; color:var(--text-faint); font-size:11px; text-align:center; padding:6px;">No Cover</div>
          </div>
          <div style="flex:1;">
            <input type="file" id="coverFileInput" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="onCoverFileSelected('${book.id}')">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('coverFileInput').click()">${book.cover_image?'Replace Cover':'Upload Cover'}</button>
              ${book.cover_image ? `<button type="button" class="btn btn-danger btn-sm" onclick="removeCover('${book.id}')">Remove Cover</button>` : ''}
            </div>
            <div id="coverPendingActions" style="display:none; gap:8px; margin-top:10px;">
              <button type="button" class="btn btn-gold btn-sm" onclick="saveCoverUpload('${book.id}')">Save Cover</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="cancelCoverUpload('${book.id}')">Cancel</button>
            </div>
            <div id="coverStatus" class="small-muted" style="margin-top:8px;">JPG, PNG, or WEBP. Up to 5MB. Portrait orientation recommended (e.g. 600×900).</div>
          </div>
        </div>
        <input type="hidden" id="fCover" value="${esc(book.cover_image||'')}">
      </div>
      <div class="field-row">
        <div class="field"><label>Genres</label>${multiSelect('fGenres', adminState.genres, book.genres.map(g=>g.id))}</div>
        <div class="field"><label>Tags</label>${multiSelect('fTags', adminState.tags, book.tags.map(t=>t.id))}</div>
      </div>
      <button class="btn btn-gold" onclick="saveBookDetails('${book.id}')">Save Changes</button>
    </div>`;
}
/* ---- cover upload (Media/CoverService-backed — see /api/admin/media/upload) ---- */
let pendingCoverFile = null;
function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function onCoverFileSelected(){
  const input = document.getElementById('coverFileInput');
  const statusEl = document.getElementById('coverStatus');
  const file = input.files[0];
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    statusEl.textContent = 'Upload failed: please choose a JPG, PNG, or WEBP image. Existing cover kept.';
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    statusEl.textContent = 'Upload failed: file is larger than 5MB. Existing cover kept.';
    input.value = '';
    return;
  }
  pendingCoverFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('coverPreviewImg').src = reader.result;
    document.getElementById('coverPreviewImg').style.display = 'block';
    document.getElementById('coverPlaceholder').style.display = 'none';
    document.getElementById('coverPendingActions').style.display = 'flex';
    statusEl.textContent = 'Preview ready — Save Cover to apply, or Cancel to discard.';
  };
  reader.readAsDataURL(file);
}
async function saveCoverUpload(bookId){
  if (!pendingCoverFile) return;
  const statusEl = document.getElementById('coverStatus');
  const file = pendingCoverFile;
  statusEl.textContent = 'Uploading…';
  try {
    const base64 = await fileToBase64(file);
    statusEl.textContent = 'Processing…';
    const res = await API.post('/api/admin/media/upload', { filename: file.name, type: 'COVER', bookId, dataBase64: base64 });
    await API.patch(`/api/admin/books/${bookId}`, { cover: res.url });
    statusEl.textContent = 'Uploaded';
    pendingCoverFile = null;
    toast('Cover updated — now live everywhere this book appears.');
    openBookEditor(bookId);
  } catch (e) {
    statusEl.textContent = `Upload failed: ${e.message} — existing cover kept.`;
  }
}
function cancelCoverUpload(bookId){
  pendingCoverFile = null;
  openBookEditor(bookId); // re-render discards the local (unsaved) preview
}
async function removeCover(bookId){
  if (!confirm("Remove this book's cover? It will fall back to the default genre art everywhere it's shown.")) return;
  try {
    await API.patch(`/api/admin/books/${bookId}`, { cover: null });
    toast('Cover removed');
    openBookEditor(bookId);
  } catch (e) { toast(e.message); }
}

function multiSelect(id, options, selectedIds){
  return `<select id="${id}" multiple size="5" style="height:110px;">${options.map(o=>`<option value="${o.id}" ${selectedIds.includes(o.id)?'selected':''}>${o.name}</option>`).join('')}</select>`;
}
function getMultiSelectValues(id){ return Array.from(document.getElementById(id).selectedOptions).map(o=>o.value); }
async function saveBookDetails(bookId){
  try {
    await API.patch(`/api/admin/books/${bookId}`, {
      title: document.getElementById('fTitle').value.trim(),
      subtitle: document.getElementById('fSubtitle').value.trim(),
      author: document.getElementById('fAuthor').value.trim(),
      originalLanguage: document.getElementById('fLang').value.trim(),
      shortDescription: document.getElementById('fShort').value.trim(),
      synopsis: document.getElementById('fSynopsis').value.trim(),
      cover: document.getElementById('fCover').value.trim(),
      genreIds: getMultiSelectValues('fGenres'),
      tagIds: getMultiSelectValues('fTags'),
    });
    toast('Saved');
    openBookEditor(bookId);
  } catch (e) { toast(e.message); }
}

function renderAccessTab(book, body){
  const tiers = book.accessTiers || [];
  const pdfSizeKB = book.pdf_size_bytes ? (book.pdf_size_bytes/1024).toFixed(0)+' KB' : '';
  body.innerHTML = `
    <div class="panel">
      <div class="field"><label>Chapter-Access Eligibility</label>
        ${['20','30','50'].map(t=>`<label class="checkbox-row"><input type="checkbox" class="tierBox" value="${t}" ${tiers.includes(t)?'checked':''}> ${t} Chapters Access</label>`).join('')}
      </div>
      <label class="checkbox-row"><input type="checkbox" id="fVipEligible" ${book.vip_eligible?'checked':''}> VIP Eligible (readable by VIP members)</label>
      <label class="checkbox-row"><input type="checkbox" id="fVipExclusive" ${book.vip_exclusive?'checked':''}> VIP Exclusive (VIP-only, no standard purchase)</label>
      <div class="field" style="max-width:220px;"><label>Free Preview Chapters</label><input type="number" id="fPreview" min="0" value="${book.free_preview_chapters}"></div>
      <hr style="border-color:var(--border-soft); margin:18px 0;">
      <label class="checkbox-row"><input type="checkbox" id="fFeatured" ${book.featured?'checked':''}> Featured (editorial — shown in the Featured rail regardless of activity)</label>
      <label class="checkbox-row"><input type="checkbox" id="fNewRelease" ${book.new_release?'checked':''}> Force into New Releases (New Releases is normally computed automatically from publish date)</label>
      <p class="small-muted" style="margin:6px 0 0;">Trending and Best Sellers are no longer manual flags — they're computed live from real reader activity and purchase data (see Analytics).</p>
      <button class="btn btn-gold" style="margin-top:14px;" onclick="saveBookAccess('${book.id}')">Save Access Configuration</button>
    </div>

    <div class="panel">
      <h3>PDF / Downloadable File</h3>
      <label class="checkbox-row"><input type="checkbox" id="fPdfEnabled" ${book.pdf_enabled?'checked':''}> PDF Available (master switch)</label>
      <label class="checkbox-row"><input type="checkbox" id="fPdfEligible" ${book.pdf_eligible?'checked':''}> VIP PDF Access</label>
      <label class="checkbox-row"><input type="checkbox" id="fPdfStandard" ${book.pdf_standard_access?'checked':''}> Standard Purchase PDF Access</label>
      <button class="btn btn-ghost btn-sm" onclick="savePdfAccessFlags('${book.id}')">Save PDF Access Settings</button>

      <hr style="border-color:var(--border-soft); margin:18px 0;">
      ${book.pdf_url ? `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div style="width:40px; height:48px; background:var(--bg-2); border:1px solid var(--border); border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:16px;">📄</div>
          <div>
            <div><b>${esc(book.pdf_filename||'document.pdf')}</b></div>
            <div class="small-muted">${pdfSizeKB} · Currently the protected asset for this book</div>
          </div>
        </div>
      ` : `<p class="small-muted" style="margin-bottom:12px;">No PDF uploaded yet.</p>`}
      <input type="file" id="pdfFileInput" accept="application/pdf" style="display:none" onchange="onPdfFileSelected()">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('pdfFileInput').click()">${book.pdf_url?'Replace PDF':'Upload PDF'}</button>
        ${book.pdf_url ? `<button class="btn btn-danger btn-sm" onclick="removePdf('${book.id}')">Remove PDF</button>` : ''}
      </div>
      <div id="pdfPendingActions" style="display:none; gap:8px; margin-top:10px;">
        <button class="btn btn-gold btn-sm" onclick="savePdfUpload('${book.id}')">Save PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="cancelPdfUpload('${book.id}')">Cancel</button>
      </div>
      <div id="pdfStatus" class="small-muted" style="margin-top:8px;">PDF files only. Up to 25MB. Never publicly linkable — served only through the authorized download route once entitlement is verified.</div>
    </div>`;
}
let pendingPdfFile = null;
function pdfFileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function onPdfFileSelected(){
  const input = document.getElementById('pdfFileInput');
  const statusEl = document.getElementById('pdfStatus');
  const file = input.files[0];
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    statusEl.textContent = 'Upload failed: please choose a PDF file. Existing PDF kept.';
    input.value = ''; return;
  }
  if (file.size > 25*1024*1024) {
    statusEl.textContent = 'Upload failed: file larger than 25MB. Existing PDF kept.';
    input.value = ''; return;
  }
  pendingPdfFile = file;
  document.getElementById('pdfPendingActions').style.display = 'flex';
  statusEl.textContent = `Ready to upload: ${file.name} (${(file.size/1024).toFixed(0)} KB) — Save PDF to apply, or Cancel to discard.`;
}
async function savePdfUpload(bookId){
  if (!pendingPdfFile) return;
  const statusEl = document.getElementById('pdfStatus');
  const file = pendingPdfFile;
  statusEl.textContent = 'Uploading…';
  try {
    const base64 = await pdfFileToBase64(file);
    statusEl.textContent = 'Processing…';
    await API.post(`/api/admin/books/${bookId}/pdf`, { filename: file.name, dataBase64: base64 });
    statusEl.textContent = 'Uploaded';
    pendingPdfFile = null;
    toast('PDF updated');
    openBookEditor(bookId);
  } catch (e) {
    statusEl.textContent = `Upload failed: ${e.message} — existing PDF kept.`;
  }
}
function cancelPdfUpload(bookId){ pendingPdfFile = null; openBookEditor(bookId); }
async function removePdf(bookId){
  if (!confirm('Remove this PDF? Readers will no longer be able to download it.')) return;
  try { await API.del(`/api/admin/books/${bookId}/pdf`); toast('PDF removed'); openBookEditor(bookId); }
  catch (e) { toast(e.message); }
}
async function savePdfAccessFlags(bookId){
  try {
    await API.patch(`/api/admin/books/${bookId}`, {
      pdfEnabled: document.getElementById('fPdfEnabled').checked,
      pdfEligible: document.getElementById('fPdfEligible').checked,
      pdfStandardAccess: document.getElementById('fPdfStandard').checked,
    });
    toast('PDF access settings saved');
    openBookEditor(bookId);
  } catch (e) { toast(e.message); }
}
async function saveBookAccess(bookId){
  const tiers = Array.from(document.querySelectorAll('.tierBox')).filter(c=>c.checked).map(c=>c.value);
  try {
    await API.patch(`/api/admin/books/${bookId}`, {
      accessTiers: tiers,
      vipEligible: document.getElementById('fVipEligible').checked,
      vipExclusive: document.getElementById('fVipExclusive').checked,
      freePreviewChapters: Number(document.getElementById('fPreview').value) || 0,
      featured: document.getElementById('fFeatured').checked,
      newRelease: document.getElementById('fNewRelease').checked,
    });
    toast('Access configuration saved');
    openBookEditor(bookId);
  } catch (e) { toast(e.message); }
}

function renderSeoTab(book, body){
  body.innerHTML = `
    <div class="panel">
      <div class="field"><label>Slug</label><input id="fSlug" value="${esc(book.slug||'')}"></div>
      <div class="field"><label>SEO Title</label><input id="fSeoTitle" value="${esc(book.seo_title||'')}"></div>
      <div class="field"><label>Meta Description</label><textarea id="fMeta" rows="3">${esc(book.meta_description||'')}</textarea></div>
      <div class="field"><label>Social Sharing Image URL</label><input id="fSocial" value="${esc(book.social_image||'')}"></div>
      <button class="btn btn-gold" onclick="saveBookSeo('${book.id}')">Save SEO</button>
    </div>`;
}
async function saveBookSeo(bookId){
  try {
    await API.patch(`/api/admin/books/${bookId}`, {
      slug: document.getElementById('fSlug').value.trim(),
      seoTitle: document.getElementById('fSeoTitle').value.trim(),
      metaDescription: document.getElementById('fMeta').value.trim(),
      socialImage: document.getElementById('fSocial').value.trim(),
    });
    toast('SEO saved');
  } catch (e) { toast(e.message); }
}

async function publishBook(bookId){
  try {
    await API.post(`/api/admin/books/${bookId}/publish`, {});
    toast('Book published');
    openBookEditor(bookId);
  } catch (e) {
    if (e.issues) {
      openModal(`<h3 style="font-family:var(--serif)">Cannot Publish</h3>
        <div class="issue-box">${e.issues.length} issue(s) found:<ul>${e.issues.map(i=>`<li>${i}</li>`).join('')}</ul></div>
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>`);
    } else toast(e.message);
  }
}
async function unpublishBook(bookId){ await API.post(`/api/admin/books/${bookId}/unpublish`, {}); toast('Unpublished'); openBookEditor(bookId); }
async function archiveBook(bookId){
  if (!confirm('Archive this book? It will be removed from the public catalogue.')) return;
  await API.post(`/api/admin/books/${bookId}/archive`, {});
  toast('Archived');
  nav('books');
}

/* ---- chapter manager ---- */
async function renderChapterManager(book){
  const body = document.getElementById('bookTabBody');
  const chapters = await API.get(`/api/admin/books/${book.id}/chapters`);
  body.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <span class="small-muted">Drag the handle to reorder. Publishing requires content.</span>
        <button class="btn btn-gold btn-sm" onclick="addChapter('${book.id}')">+ Add Chapter</button>
      </div>
      <div id="chapterList">${chapters.map(c=>chapterRowHTML(book.id, c)).join('') || '<p class="small-muted">No chapters yet.</p>'}</div>
    </div>`;
  enableChapterDrag(book.id);
}
function chapterRowHTML(bookId, c){
  return `<div class="chapter-list-row" draggable="true" data-id="${c.id}" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="dragDrop(event,'${bookId}')">
    <span class="handle">⠿</span>
    <span style="width:36px; color:var(--text-faint);">${String(c.number).padStart(2,'0')}</span>
    <span style="flex:1;"><b>${esc(c.title)}</b> ${c.is_preview?'<span class="badge badge-published">Free Preview</span>':''}</span>
    <span>${badge(c.status)}</span>
    <button class="btn btn-ghost btn-sm" onclick="editChapter('${bookId}','${c.id}')">Edit</button>
    ${c.status==='PUBLISHED' ? `<button class="btn btn-ghost btn-sm" onclick="unpublishChapter('${bookId}','${c.id}')">Unpublish</button>` : `<button class="btn btn-gold btn-sm" onclick="publishChapter('${bookId}','${c.id}')">Publish</button>`}
    <button class="btn btn-danger btn-sm" onclick="deleteChapter('${bookId}','${c.id}')">Delete</button>
  </div>`;
}
let dragSrcId = null;
function dragStart(e){ dragSrcId = e.currentTarget.dataset.id; e.currentTarget.classList.add('dragging'); }
function dragOver(e){ e.preventDefault(); }
async function dragDrop(e, bookId){
  e.preventDefault();
  document.querySelectorAll('.chapter-list-row').forEach(r=>r.classList.remove('dragging'));
  const targetId = e.currentTarget.dataset.id;
  if (!dragSrcId || dragSrcId === targetId) return;
  const rows = Array.from(document.querySelectorAll('.chapter-list-row'));
  const ids = rows.map(r=>r.dataset.id);
  const srcIdx = ids.indexOf(dragSrcId), tgtIdx = ids.indexOf(targetId);
  ids.splice(tgtIdx, 0, ids.splice(srcIdx,1)[0]);
  const order = ids.map((id,i)=>({id, orderIndex: i+1}));
  await API.post(`/api/admin/books/${bookId}/chapters/reorder`, { order });
  const book = await API.get(`/api/admin/books/${bookId}`);
  renderChapterManager(book);
}
function enableChapterDrag(){ /* handlers wired inline via attributes */ }

async function addChapter(bookId){
  const chapter = await API.post(`/api/admin/books/${bookId}/chapters`, { title: 'New Chapter' });
  editChapter(bookId, chapter.id);
}
async function editChapter(bookId, chapterId){
  const chapters = await API.get(`/api/admin/books/${bookId}/chapters`);
  const c = chapters.find(x=>x.id===chapterId);
  openModal(`
    <h3 style="font-family:var(--serif)">Edit Chapter</h3>
    <div class="field-row">
      <div class="field"><label>Number</label><input type="number" id="chNumber" value="${c.number}"></div>
      <div class="field"><label>Title</label><input id="chTitle" value="${esc(c.title)}"></div>
    </div>
    <label class="checkbox-row"><input type="checkbox" id="chPreview" ${c.is_preview?'checked':''}> Free preview chapter</label>
    <label class="checkbox-row"><input type="checkbox" id="chVoice" ${c.voice_enabled?'checked':''}> Voice reader enabled</label>
    <div class="field"><label>Content</label><textarea id="chContent" class="editor-textarea">${esc(c.content)}</textarea></div>
    <div id="saveState" class="small-muted" style="margin-bottom:10px;">Saved</div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-ghost" onclick="saveChapterDraft('${bookId}','${chapterId}')">Save Draft</button>
      <button class="btn btn-gold" onclick="publishChapter('${bookId}','${chapterId}'); closeModal();">Publish</button>
    </div>`);
  const ta = document.getElementById('chContent');
  ta.addEventListener('input', debounce(()=>saveChapterDraft(bookId, chapterId, true), 900));
}
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
async function saveChapterDraft(bookId, chapterId, silent){
  const stateEl = document.getElementById('saveState');
  if (stateEl) stateEl.textContent = 'Saving…';
  try {
    await API.patch(`/api/admin/chapters/${chapterId}`, {
      number: Number(document.getElementById('chNumber').value),
      title: document.getElementById('chTitle').value.trim(),
      content: document.getElementById('chContent').value,
      isPreview: document.getElementById('chPreview').checked,
      voiceEnabled: document.getElementById('chVoice').checked,
    });
    if (stateEl) stateEl.textContent = 'Saved';
    if (!silent) toast('Chapter saved');
  } catch (e) { if (stateEl) stateEl.textContent = 'Unsaved changes — ' + e.message; }
}
async function publishChapter(bookId, chapterId){
  try {
    await saveChapterDraft(bookId, chapterId, true);
    await API.post(`/api/admin/chapters/${chapterId}/publish`, {});
    toast('Chapter published');
    const book = await API.get(`/api/admin/books/${bookId}`);
    renderChapterManager(book);
  } catch (e) { toast(e.message); }
}
async function unpublishChapter(bookId, chapterId){
  await API.post(`/api/admin/chapters/${chapterId}/unpublish`, {});
  const book = await API.get(`/api/admin/books/${bookId}`);
  renderChapterManager(book);
}
async function deleteChapter(bookId, chapterId){
  if (!confirm('Delete this chapter permanently?')) return;
  await API.del(`/api/admin/chapters/${chapterId}`);
  const book = await API.get(`/api/admin/books/${bookId}`);
  renderChapterManager(book);
}

/* ============================================================
   MEDIA
   ============================================================ */
async function renderMedia(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const media = await API.get('/api/admin/media');
  main.innerHTML = `
    <div class="admin-topbar"><h1>Media Library</h1></div>
    <div class="panel">
      <div class="field-row">
        <div class="field"><label>Type</label><select id="mediaType"><option>COVER</option><option>FEATURED</option><option>CHAPTER_IMAGE</option><option>PROMO</option><option>PDF</option></select></div>
        <div class="field"><label>File</label><input type="file" id="mediaFile"></div>
      </div>
      <button class="btn btn-gold" onclick="uploadMedia()">Upload</button>
    </div>
    <div class="panel">
      <table><thead><tr><th>Preview</th><th>Filename</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Associated Book</th><th></th></tr></thead>
      <tbody>${media.map(m=>`<tr>
        <td>${/\.(png|jpe?g|webp)$/i.test(m.filename)?`<img src="/uploads/${m.filename}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">`:'📄'}</td>
        <td>${esc(m.original_name)}</td><td>${m.type}</td><td>${(m.size_bytes/1024).toFixed(0)} KB</td><td>${fmtDate(m.uploaded_at)}</td>
        <td>${m.book_title ? `<a onclick="openBookEditor('${m.book_id}')" style="color:var(--gold-bright); cursor:pointer;">${esc(m.book_title)}</a>` : '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteMedia('${m.id}')">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="small-muted">No media uploaded yet.</td></tr>'}</tbody></table>
    </div>`;
}
async function uploadMedia(){
  const file = document.getElementById('mediaFile').files[0];
  if (!file) return toast('Choose a file first.');
  const type = document.getElementById('mediaType').value;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    try {
      await API.post('/api/admin/media/upload', { filename: file.name, type, dataBase64: base64 });
      toast('Uploaded');
      renderMedia();
    } catch (e) { toast(e.message); }
  };
  reader.readAsDataURL(file);
}

async function deleteMedia(id, force){
  if (!confirm('Delete this media asset?')) return;
  try {
    await API.del(`/api/admin/media/${id}${force ? '?force=1' : ''}`);
    toast('Deleted');
    renderMedia();
  } catch (e) {
    if (e.status === 409) {
      if (confirm(`${e.message}\n\nDelete anyway and leave that book without a cover?`)) return deleteMedia(id, true);
    } else toast(e.message);
  }
}

/* ============================================================
   READERS
   ============================================================ */
async function renderReaders(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const readers = await API.get('/api/admin/readers' + (adminState.readerSearch ? `?search=${encodeURIComponent(adminState.readerSearch)}` : ''));
  main.innerHTML = `
    <div class="admin-topbar"><h1>Readers</h1></div>
    <div class="panel">
      <input placeholder="Search by name, email, or ID…" value="${adminState.readerSearch||''}" oninput="adminState.readerSearch=this.value; debouncedReaderSearch();" style="width:100%; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:9px 12px; color:var(--text); margin-bottom:14px;">
      <table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Joined</th><th></th></tr></thead>
      <tbody>${readers.map(r=>`<tr>
        <td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${badge(r.status)}</td><td>${fmtDate(r.createdAt)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="viewReader('${r.id}')">View</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="small-muted">No readers found.</td></tr>'}</tbody></table>
    </div>`;
}
const debouncedReaderSearch = debounce(()=>renderReaders(), 350);
async function viewReader(readerId){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const d = await API.get(`/api/admin/readers/${readerId}`);
  main.innerHTML = `
    <div class="admin-topbar"><h1>${esc(d.user.name)}</h1><button class="btn btn-ghost" onclick="nav('readers')">← Back</button></div>
    <div class="grid-cards">
      ${statCard(d.vip?'Yes':'No','VIP Member')}
      ${statCard(d.library.length,'Library Items')}
      ${statCard(d.orders.length,'Orders')}
      ${statCard(d.comments,'Comments')}
      ${statCard(d.pdfDownloads,'PDF Downloads')}
    </div>
    <div class="panel">
      <h3>Profile</h3>
      <p>Email: ${esc(d.user.email)}</p>
      <p>Joined: ${fmtDate(d.user.createdAt)}</p>
      <p>Status: ${badge(d.user.status)}</p>
      <div style="margin-top:14px; display:flex; gap:8px;">
        ${d.user.status==='ACTIVE'
          ? `<button class="btn btn-danger" onclick="suspendReader('${readerId}')">Suspend</button>`
          : `<button class="btn btn-gold" onclick="restoreReader('${readerId}')">Restore</button>`}
        <button class="btn btn-ghost" onclick="grantEntitlementModal('${readerId}')">Grant Entitlement</button>
      </div>
    </div>
    <div class="panel"><h3>Library</h3>${d.library.map(l=>`<div style="padding:6px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px;">${l.title} — ${l.source}</div>`).join('')||'<p class="small-muted">Empty.</p>'}</div>
    <div class="panel"><h3>Orders</h3>${d.orders.map(o=>`<div style="padding:6px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px;">${o.product_name} — ${fmtMoney(o.amount_cents,o.currency)} — ${badge(o.status)}</div>`).join('')||'<p class="small-muted">No orders.</p>'}</div>`;
}
async function suspendReader(id){ if(!confirm('Suspend this reader?'))return; await API.post(`/api/admin/readers/${id}/suspend`,{}); toast('Suspended'); viewReader(id); }
async function restoreReader(id){ await API.post(`/api/admin/readers/${id}/restore`,{}); toast('Restored'); viewReader(id); }
function grantEntitlementModal(readerId){
  openModal(`<h3 style="font-family:var(--serif)">Grant Entitlement</h3>
    <div class="field"><label>Type</label><select id="grantType">
      <option value="CHAPTER_ACCESS_20">20 Chapters Access</option>
      <option value="CHAPTER_ACCESS_30">30 Chapters Access</option>
      <option value="CHAPTER_ACCESS_50">50 Chapters Access</option>
    </select></div>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-gold" onclick="grantEntitlement('${readerId}')">Grant</button>
    </div>`);
}
async function grantEntitlement(readerId){
  try {
    await API.post('/api/admin/entitlements/grant', { userId: readerId, type: document.getElementById('grantType').value });
    closeModal(); toast('Entitlement granted'); viewReader(readerId);
  } catch (e) { toast(e.message); }
}

/* ============================================================
   ORDERS / ENTITLEMENTS / VIP
   ============================================================ */
async function renderOrders(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  let orders = await API.get('/api/admin/orders');
  const filter = adminState.orderFilter || '';
  if (filter === 'standard') orders = orders.filter(o => o.product_name !== 'Lifetime VIP');
  main.innerHTML = `<div class="admin-topbar"><h1>Orders</h1>${filter ? `<button class="btn btn-ghost btn-sm" onclick="adminState.orderFilter=''; renderOrders();">Clear filter: ${filter}</button>` : ''}</div>
    <div class="panel table-scroll"><table><thead><tr><th>Reader</th><th>Product</th><th>Amount</th><th>Provider Ref</th><th>Status</th><th>Book</th><th>Date</th></tr></thead>
    <tbody>${orders.map(o=>`<tr><td>${esc(o.user_name)}<br><span class="small-muted">${esc(o.user_email)}</span></td><td>${esc(o.product_name)}</td><td>${fmtMoney(o.amount_cents,o.currency)}</td><td class="truncate">${esc(o.provider_reference||'')}</td><td>${badge(o.status)}</td><td>${esc(o.book_title||'—')}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('') || '<tr><td colspan="7" class="small-muted">No orders yet.</td></tr>'}</tbody></table></div>`;
}
async function renderEntitlements(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const ents = await API.get('/api/admin/entitlements');
  main.innerHTML = `<div class="admin-topbar"><h1>Entitlements</h1></div>
    <div class="panel"><table><thead><tr><th>Reader</th><th>Product</th><th>Status</th><th>Book</th><th>Created</th><th>Consumed</th><th></th></tr></thead>
    <tbody>${ents.map(e=>`<tr><td>${esc(e.user_name)}</td><td>${esc(e.product_name)}</td><td>${badge(e.status)}</td><td>${esc(e.book_title||'—')}</td><td>${fmtDate(e.created_at)}</td><td>${e.consumed_at?fmtDate(e.consumed_at):'—'}</td>
      <td>${e.status==='UNUSED'?`<button class="btn btn-danger btn-sm" onclick="revokeEntitlement('${e.id}')">Revoke</button>`:''}</td></tr>`).join('') || '<tr><td colspan="7" class="small-muted">No entitlements yet.</td></tr>'}</tbody></table></div>`;
}
async function revokeEntitlement(id){ if(!confirm('Revoke this entitlement?'))return; await API.post(`/api/admin/entitlements/${id}/revoke`,{}); toast('Revoked'); renderEntitlements(); }
async function renderVip(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const vip = await API.get('/api/admin/vip');
  main.innerHTML = `<div class="admin-topbar"><h1>VIP Members</h1></div>
    <div class="panel"><table><thead><tr><th>Name</th><th>Email</th><th>Since</th><th>Status</th><th>Payment Ref</th></tr></thead>
    <tbody>${vip.map(v=>`<tr><td>${esc(v.user_name)}</td><td>${esc(v.user_email)}</td><td>${fmtDate(v.created_at)}</td><td>${badge(v.status)}</td><td>${esc(v.payment_reference||'')}</td></tr>`).join('') || '<tr><td colspan="5" class="small-muted">No VIP members yet.</td></tr>'}</tbody></table></div>`;
}

/* ============================================================
   COMMENTS / REPORTS / TRANSLATIONS
   ============================================================ */
async function renderComments(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const comments = await API.get('/api/admin/comments');
  main.innerHTML = `<div class="admin-topbar"><h1>Comments</h1></div>
    <div class="panel"><table><thead><tr><th>Reader</th><th>Book</th><th>Comment</th><th>Status</th><th>Date</th><th></th></tr></thead>
    <tbody>${comments.map(c=>`<tr><td>${esc(c.user_name)}</td><td>${esc(c.book_title)}</td><td style="max-width:320px;">${esc(c.body)}</td><td>${badge(c.status)}</td><td>${fmtDate(c.created_at)}</td>
      <td>${c.status==='VISIBLE'?`<button class="btn btn-ghost btn-sm" onclick="hideComment('${c.id}')">Hide</button>`:`<button class="btn btn-ghost btn-sm" onclick="restoreComment('${c.id}')">Restore</button>`}
      <button class="btn btn-danger btn-sm" onclick="deleteComment('${c.id}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="6" class="small-muted">No comments yet.</td></tr>'}</tbody></table></div>`;
}
async function hideComment(id){ await API.post(`/api/admin/comments/${id}/hide`,{}); renderComments(); }
async function restoreComment(id){ await API.post(`/api/admin/comments/${id}/restore`,{}); renderComments(); }
async function deleteComment(id){ if(!confirm('Delete this comment?'))return; await API.del(`/api/admin/comments/${id}`); renderComments(); }

async function renderReports(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const reports = await API.get('/api/admin/reports');
  main.innerHTML = `<div class="admin-topbar"><h1>Reports</h1></div>
    <div class="panel"><table><thead><tr><th>Reporter</th><th>Book</th><th>Comment</th><th>Reason</th><th>Status</th><th></th></tr></thead>
    <tbody>${reports.map(r=>`<tr><td>${esc(r.reporter_name)}</td><td>${esc(r.book_title)}</td><td style="max-width:280px;">${esc(r.comment_body)}</td><td>${esc(r.reason||'')}</td><td>${badge(r.status)}</td>
      <td>${r.status==='OPEN'?`<button class="btn btn-ghost btn-sm" onclick="dismissReport('${r.id}')">Dismiss</button><button class="btn btn-danger btn-sm" onclick="resolveReport('${r.id}')">Hide Comment</button>`:''}</td></tr>`).join('') || '<tr><td colspan="6" class="small-muted">No reports.</td></tr>'}</tbody></table></div>`;
}
async function dismissReport(id){ await API.post(`/api/admin/reports/${id}/dismiss`,{}); renderReports(); }
async function resolveReport(id){ await API.post(`/api/admin/reports/${id}/resolve`,{}); renderReports(); }

async function renderTranslations(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const rows = await API.get('/api/admin/translations');
  main.innerHTML = `<div class="admin-topbar"><h1>Translations</h1></div>
    <p class="small-muted" style="margin-bottom:14px;">No translation provider is configured in this environment — requests are logged here with status FAILED until a provider (e.g. DeepL) is connected via TRANSLATE_API_KEY.</p>
    <div class="panel"><table><thead><tr><th>Content</th><th>Language</th><th>Status</th><th>Requested</th></tr></thead>
    <tbody>${rows.map(t=>`<tr><td>${t.content_type} #${t.content_id.slice(0,8)}</td><td>${esc(t.language)}</td><td>${badge(t.status)}</td><td>${fmtDate(t.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="small-muted">No translation requests yet.</td></tr>'}</tbody></table></div>`;
}

/* ============================================================
   ANALYTICS (reuses dashboard's real data with a couple of extra cuts)
   ============================================================ */
async function renderAnalytics(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const d = await API.get('/api/admin/dashboard');
  main.innerHTML = `<div class="admin-topbar"><h1>Analytics</h1></div>
    <div class="panel"><h3>Revenue — last 30 days</h3>${miniBarChart(d.revenueByDay.map(r=>r.cents/100))}<p class="small-muted" style="margin-top:8px;">Total this period: $${d.revenueByDay.reduce((a,r)=>a+r.cents,0)/100}</p></div>
    <div class="panel"><h3>Reader Growth — last 30 days</h3>${miniBarChart(d.readerGrowthByDay.map(r=>r.c))}</div>
    <div class="grid-cards">
      ${statCard(d.booksRead,'Books Read')}
      ${statCard(d.pdfDownloads,'PDF Downloads')}
      ${statCard(d.comments,'Comments')}
      ${statCard(d.translationRequests,'Translation Requests')}
      ${statCard(d.vipMembers,'VIP Members')}
      ${statCard(d.standardPurchases,'Standard Purchases')}
    </div>
    <p class="small-muted">Filter by book/product and custom date ranges is on the roadmap — the underlying queries in <code>lib/stats.js</code> already group by day and are straightforward to parameterize further.</p>`;
}

/* ============================================================
   AUDIT LOG
   ============================================================ */
async function renderAudit(){
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const rows = await API.get('/api/admin/audit');
  main.innerHTML = `<div class="admin-topbar"><h1>Audit Log</h1></div>
    <div class="panel"><table><thead><tr><th>Admin</th><th>Action</th><th>Entity</th><th>When</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${esc(r.admin_name||'System')}</td><td>${r.action}</td><td>${r.entity||''} ${r.entity_id?('#'+r.entity_id.slice(0,8)):''}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="small-muted">No actions logged yet.</td></tr>'}</tbody></table></div>`;
}

/* ============================================================
   SETTINGS (products/pricing, genres, tags)
   ============================================================ */
async function renderSettings(){
  await ensureTaxonomy();
  const main = document.getElementById('main');
  main.innerHTML = 'Loading…';
  const products = await API.get('/api/admin/products');
  const policies = await API.get('/api/admin/policies');
  const supportMessages = await API.get('/api/admin/support-messages');
  main.innerHTML = `
    <div class="admin-topbar"><h1>Settings</h1></div>
    <div class="panel">
      <h3>Products & Pricing</h3>
      <table><thead><tr><th>Name</th><th>Price (cents)</th><th>Currency</th><th>Active</th><th></th></tr></thead>
      <tbody>${products.map(p=>`<tr>
        <td>${esc(p.name)}</td>
        <td><input type="number" id="price-${p.id}" value="${p.price_cents}" style="width:100px; background:var(--bg-2); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:5px 8px;"></td>
        <td>${p.currency}</td>
        <td><input type="checkbox" id="active-${p.id}" ${p.active?'checked':''}></td>
        <td><button class="btn btn-ghost btn-sm" onclick="saveProduct('${p.id}')">Save</button></td>
      </tr>`).join('')}</tbody></table>
    </div>
    <div class="panel">
      <h3>Genres</h3>
      <div id="genreList">${adminState.genres.map(g=>`<span class="pill">${esc(g.name)} <button onclick="deleteGenre('${g.id}')">✕</button></span>`).join('')}</div>
      <div style="display:flex; gap:8px; margin-top:12px;"><input id="newGenre" placeholder="New genre name" style="flex:1; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:8px 12px; color:var(--text);"><button class="btn btn-gold btn-sm" onclick="addGenre()">Add</button></div>
    </div>
    <div class="panel">
      <h3>Tags</h3>
      <div id="tagList">${adminState.tags.map(t=>`<span class="pill">${esc(t.name)} <button onclick="deleteTag('${t.id}')">✕</button></span>`).join('')}</div>
      <div style="display:flex; gap:8px; margin-top:12px;"><input id="newTag" placeholder="New tag name" style="flex:1; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:8px 12px; color:var(--text);"><button class="btn btn-gold btn-sm" onclick="addTag()">Add</button></div>
    </div>
    <div class="panel">
      <h3>Legal / Policies</h3>
      <p class="small-muted" style="margin-bottom:12px;">Published policies are what appears on the public site. Drafts are admin-only until published.</p>
      <div id="policyList">${policies.map(p=>`<div style="display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--border-soft);">
        <span>${esc(p.title)} ${badge(p.status)}</span>
        <button class="btn btn-ghost btn-sm" onclick="openPolicyEditor('${p.key}')">Edit</button>
      </div>`).join('')}</div>
    </div>
    <div class="panel">
      <h3>Support Messages</h3>
      <div id="supportMsgList">${supportMessages.map(m=>`<div style="padding:10px 0; border-bottom:1px solid var(--border-soft); font-size:12.5px;">
        <div><b>${esc(m.name)}</b> — ${esc(m.email)} ${badge(m.status)}</div>
        <div class="small-muted">${esc(m.topic||'General')} · ${fmtDate(m.created_at)}</div>
        <div style="margin-top:4px;">${esc(m.message)}</div>
        ${m.status==='OPEN'?`<button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="closeSupportMessage('${m.id}')">Mark Closed</button>`:''}
      </div>`).join('') || '<p class="small-muted">No support messages yet.</p>'}</div>
    </div>`;
}
async function openPolicyEditor(key){
  const p = await API.get(`/api/admin/policies/${key}`);
  openModal(`
    <h3 style="font-family:var(--serif)">${esc(p.title)} ${badge(p.status)}</h3>
    <div class="field"><label>Content</label><textarea id="policyContent" rows="14" style="font-family:inherit; font-size:12.5px;">${esc(p.content)}</textarea></div>
    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-ghost" onclick="savePolicyDraft('${key}')">Save Draft</button>
      ${p.status==='PUBLISHED'
        ? `<button class="btn btn-danger" onclick="unpublishPolicy('${key}')">Unpublish</button>`
        : `<button class="btn btn-gold" onclick="publishPolicy('${key}')">Publish</button>`}
    </div>`);
}
async function savePolicyDraft(key){
  try {
    await API.patch(`/api/admin/policies/${key}`, { content: document.getElementById('policyContent').value });
    toast('Draft saved');
    closeModal();
    renderSettings();
  } catch (e) { toast(e.message); }
}
async function publishPolicy(key){
  try {
    await API.patch(`/api/admin/policies/${key}`, { content: document.getElementById('policyContent').value });
    await API.post(`/api/admin/policies/${key}/publish`, {});
    toast('Published');
    closeModal();
    renderSettings();
  } catch (e) { toast(e.message); }
}
async function unpublishPolicy(key){
  try { await API.post(`/api/admin/policies/${key}/unpublish`, {}); toast('Unpublished'); closeModal(); renderSettings(); }
  catch (e) { toast(e.message); }
}
async function closeSupportMessage(id){
  await API.post(`/api/admin/support-messages/${id}/close`, {});
  renderSettings();
}
async function saveProduct(id){
  try {
    await API.patch(`/api/admin/products/${id}`, { priceCents: Number(document.getElementById(`price-${id}`).value), active: document.getElementById(`active-${id}`).checked });
    toast('Product updated');
  } catch (e) { toast(e.message); }
}
async function addGenre(){
  const name = document.getElementById('newGenre').value.trim();
  if (!name) return;
  await API.post('/api/admin/genres', { name });
  adminState.genres = [];
  renderSettings();
}
async function deleteGenre(id){ await API.del(`/api/admin/genres/${id}`); adminState.genres=[]; renderSettings(); }
async function addTag(){
  const name = document.getElementById('newTag').value.trim();
  if (!name) return;
  await API.post('/api/admin/tags', { name });
  adminState.tags = [];
  renderSettings();
}
async function deleteTag(id){ await API.del(`/api/admin/tags/${id}`); adminState.tags=[]; renderSettings(); }

/* ============================================================
   ROUTER
   ============================================================ */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function render(){
  try {
    if (adminState.view==='dashboard') await renderDashboard();
    else if (adminState.view==='books') await renderBooks();
    else if (adminState.view==='media') await renderMedia();
    else if (adminState.view==='readers') await renderReaders();
    else if (adminState.view==='orders') await renderOrders();
    else if (adminState.view==='entitlements') await renderEntitlements();
    else if (adminState.view==='vip') await renderVip();
    else if (adminState.view==='comments') await renderComments();
    else if (adminState.view==='reports') await renderReports();
    else if (adminState.view==='translations') await renderTranslations();
    else if (adminState.view==='analytics') await renderAnalytics();
    else if (adminState.view==='settings') await renderSettings();
    else if (adminState.view==='audit') await renderAudit();
  } catch (e) {
    document.getElementById('main').innerHTML = `<div class="panel">${e.message}</div>`;
  }
}

(async function bootstrap(){
  try {
    const s = await API.get('/api/auth/session');
    if (!s.user || s.user.role !== 'ADMIN') { location.href = '/login.html?next=/admin'; return; }
  } catch (e) { location.href = '/login.html?next=/admin'; return; }
  nav('dashboard');
})();
