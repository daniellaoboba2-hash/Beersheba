/* ============================================================
   GENRE THEME / COVER ART (reused verbatim from the approved design)
   ============================================================ */
const GENRE_THEME = {
  Romance:    {c1:'#4a1626', c2:'#0c0a0d', icon:'heart'},
  Billionaire:{c1:'#241f10', c2:'#0a0a0d', icon:'crown'},
  Werewolf:   {c1:'#0f2116', c2:'#0a0a0d', icon:'moon'},
  Fantasy:    {c1:'#1e1130', c2:'#0a0a0d', icon:'flame'},
  Mystery:    {c1:'#101722', c2:'#0a0a0d', icon:'eye'},
  Drama:      {c1:'#2a0f18', c2:'#0a0a0d', icon:'mask'},
  Mafia:      {c1:'#1c0d0d', c2:'#0a0a0d', icon:'rose'},
};
const ICON_PATHS = {
  heart:  '<path d="M32 54s-19-11.6-19-27.2C13 17.6 19.8 11 28 11c2.7 0 5.4 1 7.5 2.9L32 17l-3.5-3.1C30.6 12 33.3 11 36 11c8.2 0 15 6.6 15 15.8C51 42.4 32 54 32 54z"/>',
  crown:  '<path d="M12 46h40l4-24-13 9-11-17-11 17-13-9 4 24z"/><rect x="12" y="46" width="40" height="6"/>',
  moon:   '<path d="M40 8a24 24 0 1 0 16 42 20 20 0 0 1-16-42z"/><circle cx="46" cy="16" r="1.6"/><circle cx="52" cy="24" r="1"/>',
  flame:  '<path d="M32 6C22 20 16 28 16 38a16 16 0 0 0 32 0c0-6-3-10-6-13 1 6-2 9-4 9 2-8-2-14-6-28z"/>',
  eye:    '<path d="M6 32s10-18 26-18 26 18 26 18-10 18-26 18S6 32 6 32z"/><circle cx="32" cy="32" r="8"/>',
  mask:   '<path d="M8 22c8-6 16-8 24-8s16 2 24 8c0 16-10 30-24 30S8 38 8 22z"/><circle cx="22" cy="26" r="3"/><circle cx="42" cy="26" r="3"/>',
  rose:   '<circle cx="32" cy="24" r="12"/><circle cx="32" cy="24" r="6"/><path d="M32 36v22M24 50h16"/>',
};
function svgIcon(name, size){
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="var(--gold-bright)" stroke-width="1.6">${ICON_PATHS[name]||ICON_PATHS.heart}</svg>`;
}
function coverHTML(book, opts){
  opts=opts||{};
  const g = (book.genres && book.genres[0]) || 'Romance';
  const theme = GENRE_THEME[g]||GENRE_THEME.Romance;
  const showBadges = opts.badges!==false;
  const showTitle = opts.title!==false; // set false for small thumbnails (e.g. library list rows) — a full title+rating overlay doesn't fit a 56-64px thumbnail
  return `
  <div class="cover" style="background:linear-gradient(150deg, ${theme.c1}, ${theme.c2})">
    ${book.cover ? `<img src="${book.cover}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">` : `
    <div class="cover-art" style="inset:0; display:flex; align-items:center; justify-content:center;">
      ${svgIcon(theme.icon, opts.iconSize||64)}
    </div>`}
    <div class="cover-vign"></div>
    ${showBadges?`<div class="cover-badges">
      <span>${book.newRelease?'<span class="badge badge-new">New</span>':''}</span>
      <span>${book.vipEligible||book.vipExclusive?'<span class="badge badge-vip">VIP</span>':''}</span>
    </div>`:''}
    ${showTitle?`<div class="cover-title">
      <h4>${book.title}</h4>
      <div class="rating">★ ${(book.rating||0).toFixed(1)} · ${book.chapters||0} Ch</div>
    </div>`:''}
  </div>`;
}
function bookCardHTML(book){
  return `<div class="card" onclick="openBook('${book.slug}')">
    ${coverHTML(book)}
    <div class="card-meta">
      <span class="genre">${(book.genres&&book.genres[0])||''}</span>
    </div>
  </div>`;
}
function checkIcon(){return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>';}
function vipCardHTML(book){
  return `<div class="card" style="cursor:default;">
    <div onclick="openReader('${book.bookId}','${book.slug}',${book.currentChapter||1})" style="cursor:pointer;">${coverHTML({...book, genres:[]},{title:false})}</div>
    <div class="card-meta" style="flex-direction:column; align-items:stretch; gap:6px;">
      <span class="genre" style="white-space:normal;">${book.title}</span>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-gold btn-sm" style="flex:1;" onclick="openReader('${book.bookId}','${book.slug}',${book.currentChapter||1})">Read</button>
        ${book.canDownloadPdf ? `<button class="btn btn-ghost btn-sm" style="flex:1;" onclick="downloadPdf('${book.bookId}')">PDF</button>` : ''}
      </div>
    </div>
  </div>`;
}
function trustItem(icon,title,desc){
  const icons={
    lock:'<path d="M6 11V7a6 6 0 0 1 12 0v4"/><rect x="4" y="11" width="16" height="10" rx="2"/>',
    crown:'<path d="m3 18 1.5-9L9 13l3-8 3 8 4.5-4L21 18z"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9z"/>',
    shield:'<path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5z"/>',
  };
  return `<div class="trust-item">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icons[icon]}</svg>
    <div><b>${title}</b><span>${desc}</span></div>
  </div>`;
}
function brandMarkHTML(){
  return '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 26" fill="none"><path d="m3 5 5 4 8-7 8 7 5-4-2 14H5L3 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 19h18M11 23h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="16" cy="3" r="1.5" fill="currentColor"/></svg></span>';
}
function footerHTML(){
  return `<footer><div class="wrap footer-inner">
    <div class="logo" style="font-size:16px;">${brandMarkHTML()}<span>BEERSHEBA</span></div>
    <div class="footer-links">
      <span onclick="location.href='/about.html'">About</span>
      <span onclick="location.href='/support.html'">Support</span>
      <span onclick="location.href='/terms.html'">Terms</span>
      <span onclick="location.href='/privacy.html'">Privacy</span>
    </div>
    <div style="font-size:12px; color:var(--text-faint);">© 2026 Beersheba. All stories fictional.</div>
  </div></footer>`;
}
function avatarHTML(url, size){
  size = size || 32;
  if (url) return `<img src="${url}" style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;">`;
  return `<div class="av" style="width:${size}px;height:${size}px;border-radius:999px;background:linear-gradient(135deg,#3a2f14,#1a1408)"></div>`;
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  view: 'home',
  session: null, // {user, vip, entitlements}
  discoverGenre: 'All',
  discoverSort: 'Trending',
  currentSlug: null,
  detailTab: 'About',
  libTab: 'continue',
  readerBookId: null,
  readerBookSlug: null,
  readerChapterNumber: 1,
  fontSize: 'md',
  theme: 'dark',
  voiceSpeed: 1,
  pricingToggle: 'onetime',
  homeStats: null,
  genres: [],
  products: [],
  library: null,
  // transient purchase-flow state
  purchase: null, // {stage, order, entitlementId, eligibleBooks, productType}
};

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(window._tt);
  window._tt=setTimeout(()=>t.classList.remove('show'),2200);
}

function requireLogin(nextHint){
  const next = encodeURIComponent(location.pathname + (nextHint||''));
  location.href = `/login.html?next=${next}`;
}

/* ============================================================
   SESSION / BOOTSTRAP
   ============================================================ */
async function loadSession(){
  try {
    const s = await API.get('/api/auth/session');
    if (s.user) {
      const me = await API.get('/api/me');
      state.session = me;
    } else {
      state.session = null;
    }
  } catch (e) { state.session = null; }
  updateAuthUI();
}
function updateAuthUI(){
  const avatar = document.getElementById('navAvatar');
  if (!avatar) return;
  if (state.session && state.session.user) {
    const u = state.session.user;
    if (u.avatarUrl) {
      avatar.innerHTML = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;">`;
    } else {
      avatar.textContent = u.name.charAt(0).toUpperCase();
    }
    avatar.title = u.name;
  } else {
    avatar.textContent = '?';
    avatar.title = 'Sign in';
  }
}
async function logout(){
  await API.post('/api/auth/logout');
  state.session = null;
  toast('Signed out');
  go('home');
}

/* ============================================================
   ROUTER
   ============================================================ */
function go(view, param){
  state.view = view;
  if (view === 'detail') state.currentSlug = param;
  if (view === 'profile' && !(state.session && state.session.user)) return requireLogin('#profile');
  if (view === 'library' && !(state.session && state.session.user)) return requireLogin('#library');
  location.hash = param ? `${view}/${param}` : view;
  render();
  window.scrollTo({top:0, behavior:'instant'});
}
function openBook(slug){ state.detailTab='About'; go('detail', slug); }
function openReader(bookId, bookSlug, chapterNumber){
  state.readerBookId = bookId;
  state.readerBookSlug = bookSlug;
  state.readerChapterNumber = chapterNumber || 1;
  go('reader', bookSlug);
}

/* ============================================================
   HOME
   ============================================================ */
async function renderHome(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">Loading…</div>`;
  const [stats, trending, newRel, featuredList] = await Promise.all([
    API.get('/api/stats/homepage'),
    API.get('/api/books?trending=1'),
    API.get('/api/books?newRelease=1'),
    API.get('/api/books?featured=1'),
  ]);
  state.homeStats = stats;
  const featured = featuredList[0] || trending[0] || null;
  const featuredActions = featured
    ? `<button class="btn btn-gold btn-sm" onclick="openBook('${featured.slug}')">Read Preview</button>
       <button class="btn btn-ghost btn-sm" onclick="openBook('${featured.slug}')">Details</button>`
    : '<span class="small-muted">Featured stories will appear here once published.</span>';
  app.innerHTML = `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <p class="eyebrow">Premium Fiction · Est. Library</p>
        <h1>Stories Worth<br>Getting <span class="gold-txt">Lost In.</span></h1>
        <p class="lead">Immerse yourself in worlds of passion, power, betrayal and destiny — curated, cinematic fiction built for readers who want to disappear into a story.</p>
        <div class="cta-row">
          ${featured ? `<button class="btn btn-gold" onclick="openBook('${featured.slug}')">Read Preview</button>` : ''}
          <button class="btn btn-ghost" onclick="go('discover')">Explore Stories</button>
        </div>
        <div class="hero-stats">
          <div class="stat"><b>${stats.readers.toLocaleString()}+</b><span>Readers</span></div>
          <div class="stat"><b>${stats.stories.toLocaleString()}+</b><span>Stories</span></div>
          <div class="stat"><b>${stats.fiveStarPct}%</b><span>5-Star Reviews</span></div>
        </div>
      </div>
      <div class="hero-visual">
        ${featured ? `<div class="hero-cover-wrap">${coverHTML(featured,{iconSize:80})}</div>` : ''}
        <div class="featured-panel${featured ? '' : ' is-empty'}">
          <p class="eyebrow">Featured Story</p>
          <h3>${featured ? featured.title : 'Stories worth returning to.'}</h3>
          <p>${featured ? (featured.shortDescription||'').slice(0,150) : 'Our editors are preparing the next story for the Beersheba library.'}</p>
          ${featured ? `<div class="featured-meta">
            <span>★ ${featured.rating} (${featured.reviewCount})</span>
            <span>${featured.chapters} Chapters</span>
          </div>` : ''}
          <div style="margin-top:16px; display:flex; gap:10px; align-items:center;">
            ${featuredActions}
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="trust-bar">
    <div class="wrap trust-grid">
      ${trustItem('lock','One Purchase, One Story','Standard access unlocks one eligible story.')}
      ${trustItem('crown','Lifetime VIP','Access eligible library + download PDFs.')}
      ${trustItem('book','Your Library, Forever','Every story you unlock is stored in your library.')}
      ${trustItem('globe','Translate Everything','Translate chapters and comments instantly.')}
      ${trustItem('shield','Secure &amp; Private','Your reading. Your progress. Always protected.')}
    </div>
  </div>
  <section class="block">
    <div class="wrap">
      <div class="block-head"><h2 class="section-title"><span class="section-kicker">Trending</span> Trending Now</h2><a class="view-all" onclick="go('discover')">View All</a></div>
      <div class="rail">${trending.map(bookCardHTML).join('') || '<p class="small-muted">Nothing trending yet.</p>'}</div>
    </div>
  </section>
  <section class="block" style="padding-top:0">
    <div class="wrap">
      <div class="block-head"><h2 class="section-title">New Releases</h2><a class="view-all" onclick="go('discover')">View All</a></div>
      <div class="rail">${newRel.map(bookCardHTML).join('') || '<p class="small-muted">No new releases yet.</p>'}</div>
    </div>
  </section>
  ${footerHTML()}`;
}

/* ============================================================
   DISCOVER
   ============================================================ */
async function renderDiscover(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">Loading…</div>`;
  if (!state.genres.length) state.genres = await API.get('/api/genres');
  const q = {};
  if (state.discoverGenre !== 'All') q.genre = state.genres.find(g=>g.name===state.discoverGenre)?.slug;
  let books = await API.get('/api/books' + (q.genre ? `?genre=${q.genre}` : ''));
  if (state.discoverSort==='Trending') books.sort((a,b)=>(b.trending?1:0)-(a.trending?1:0) || b.rating-a.rating);
  if (state.discoverSort==='Newest') books.sort((a,b)=>(b.newRelease?1:0)-(a.newRelease?1:0));
  if (state.discoverSort==='Most Read') books.sort((a,b)=>b.reviewCount-a.reviewCount);
  if (state.discoverSort==='Highest Rated') books.sort((a,b)=>b.rating-a.rating);

  app.innerHTML = `
  <div class="wrap">
    <div class="page-head"><h1>Discover Stories</h1><p>Find your next obsession</p></div>
    <div class="filter-row">
      <div class="genre-pills">
        ${['All',...state.genres.map(g=>g.name)].map(g=>`<button class="pill ${state.discoverGenre===g?'active':''}" onclick="setDiscoverGenre('${g}')">${g}</button>`).join('')}
      </div>
      <div class="sort-row">
        <div class="select-fake" onclick="cycleSort()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
          ${state.discoverSort}
        </div>
      </div>
    </div>
    <div class="grid" style="margin-top:20px; padding-bottom:60px;">
      ${books.map(bookCardHTML).join('') || '<p class="small-muted">No stories match this filter yet.</p>'}
    </div>
  </div>
  ${footerHTML()}`;
}
function setDiscoverGenre(g){ state.discoverGenre=g; renderDiscover(); }
function cycleSort(){
  const opts=['Trending','Newest','Most Read','Highest Rated'];
  state.discoverSort = opts[(opts.indexOf(state.discoverSort)+1)%opts.length];
  renderDiscover();
}

/* ============================================================
   BOOK DETAIL
   ============================================================ */
async function renderDetail(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">Loading…</div>`;
  const b = await API.get(`/api/books/${state.currentSlug}`);
  const related = (await API.get(`/api/books?genre=${(b.genres[0]||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`)).filter(x=>x.slug!==b.slug).slice(0,5);

  app.innerHTML = `
  <div class="wrap">
    <div class="detail-grid">
      <div class="detail-cover">${coverHTML(b,{iconSize:90})}</div>
      <div class="detail-info">
        <div class="tag-row">
          ${b.genres.map(g=>`<span class="chip">${g}</span>`).join('')}
          ${b.vipEligible||b.vipExclusive?'<span class="badge badge-vip">★ VIP</span>':''}
        </div>
        <h1>${b.title}</h1>
        <div class="rating-row">
          <span class="stars">${'★'.repeat(Math.round(b.rating))}${'☆'.repeat(5-Math.round(b.rating))}</span>
          <span>${b.rating} (${b.reviewCount} ratings)</span>
          <span>· ${b.chapters} Chapters</span>
        </div>
        <p class="synopsis">${b.synopsis||b.shortDescription||''}</p>
        <div class="detail-actions">
          <button class="btn btn-ghost" onclick="openReader('${b.id}','${b.slug}',1)">Read Preview</button>
          ${b.inLibrary
            ? `<button class="btn btn-gold" onclick="openReader('${b.id}','${b.slug}',1)">Continue Reading</button>`
            : `<button class="btn btn-gold" onclick="go('pricing')">Unlock Story · From $1</button>`}
          ${b.pdfAvailable ? (
            b.canDownloadPdf
              ? `<button class="btn btn-ghost" onclick="downloadPdf('${b.id}')">Download PDF</button>`
              : `<button class="btn btn-ghost" onclick="toast('PDF download isn\\'t included with your current access to this book.')" title="PDF download not included with your current access">PDF (Locked)</button>`
          ) : ''}
          <button class="icon-btn bm-btn ${b.bookmarked?'active':''}" id="bmBtn" onclick="toggleBookmark('${b.id}')" title="Bookmark" aria-label="Bookmark this story">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${b.bookmarked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
          </button>
        </div>
        <div class="preview-box">Free preview: <b>Chapter 1</b> — unlock the full story to continue reading.</div>
        <div class="tabs">
          ${['About','Contents','Reviews','Comments'].map(t=>`<button class="tab ${state.detailTab===t?'active':''}" onclick="setDetailTab('${t}','${b.id}','${b.slug}')">${t}${t==='Contents'?` (${b.chapters})`:''}${t==='Reviews'?` (${b.reviewCount})`:''}${t==='Comments'?` (${b.commentCount})`:''}</button>`).join('')}
        </div>
        <div class="tab-panel" id="tabPanel">Loading…</div>
      </div>
    </div>
    <div class="block" style="padding-top:8px">
      <h2 class="section-title" style="margin-bottom:16px">More Like This</h2>
      <div class="related-grid">${related.map(bookCardHTML).join('') || '<p class="small-muted">More stories coming soon.</p>'}</div>
    </div>
  </div>
  ${footerHTML()}`;
  loadDetailTab(b);
}
function setDetailTab(t, bookId, slug){ state.detailTab=t; loadDetailTab({id:bookId, slug}); document.querySelectorAll('.tab').forEach(el=>el.classList.remove('active')); event.target.classList.add('active'); }

async function loadDetailTab(b){
  const panel = document.getElementById('tabPanel');
  if (!panel) return;
  panel.innerHTML = 'Loading…';
  if (state.detailTab === 'About') {
    const full = await API.get(`/api/books/${b.slug}`);
    panel.innerHTML = `<p class="synopsis">${full.synopsis||''}</p>
      <div class="author-box">
        <div class="av"></div>
        <div class="rows">
          <div>Publisher <b>${full.author}</b></div>
          <div>Language <b>${full.originalLanguage||'English'}</b></div>
          <div>Last Updated <b>${new Date(full.updatedAt).toLocaleDateString()}</b></div>
        </div>
      </div>`;
  } else if (state.detailTab === 'Contents') {
    const chapters = await API.get(`/api/books/${b.id}/chapters`);
    panel.innerHTML = `<div>${chapters.map(c=>`
      <div class="chapter-row" onclick="${c.locked?`toast('${c.unlockReason.replace(/'/g,"\\'")}')`:`openReader('${b.id}','${b.slug}',${c.number})`}" style="cursor:pointer">
        <div><span style="color:var(--text-faint); font-size:12px; margin-right:10px;">${String(c.number).padStart(2,'0')}</span><span class="ttl">${c.title}</span></div>
        ${c.locked?'<span class="lock">🔒</span>':'<span style="color:var(--gold); font-size:12px;">Read</span>'}
      </div>`).join('')}</div>`;
  } else if (state.detailTab === 'Reviews') {
    const reviews = await API.get(`/api/reviews?bookId=${b.id}`);
    const loggedIn = !!(state.session && state.session.user);
    panel.innerHTML = `
      ${loggedIn ? `<div class="review-form">
        <div class="star-picker" id="starPicker">${[1,2,3,4,5].map(n=>`<span data-n="${n}" onclick="setStarPick(${n})">★</span>`).join('')}</div>
        <textarea id="reviewBody" rows="2" placeholder="Share your thoughts on this story…" style="background:var(--bg-3); border:1px solid var(--border-soft); border-radius:8px; padding:10px; color:var(--text); font-family:inherit;"></textarea>
        <button class="btn btn-gold btn-sm" onclick="submitReview('${b.id}')">Post Review</button>
      </div>` : `<p class="small-muted" style="margin-bottom:16px;">Sign in to leave a review.</p>`}
      ${reviews.map(r=>`<div class="review">
        <div class="who">${avatarHTML(r.user_avatar)}<b>${r.user_name}</b><span style="color:var(--text-faint); font-size:12px;">${new Date(r.created_at).toLocaleDateString()}</span></div>
        <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
        <p>${r.body||''}</p>
      </div>`).join('') || '<p class="small-muted">No reviews yet — be the first.</p>'}`;
  } else {
    const comments = await API.get(`/api/comments?bookId=${b.id}`);
    const loggedIn = !!(state.session && state.session.user);
    panel.innerHTML = `
      <div style="display:flex; gap:14px; margin-bottom:18px;">
        <input id="commentInput" placeholder="${loggedIn?'Share your thoughts…':'Sign in to comment'}" ${loggedIn?'':'disabled'} style="flex:1; background:var(--bg-2); border:1px solid var(--border-soft); border-radius:10px; padding:12px 16px; color:var(--text);">
        <button class="btn btn-gold btn-sm" onclick="${loggedIn?`postComment('${b.id}')`:`requireLogin()`}">Post</button>
      </div>
      ${comments.map(c=>`<div class="comment-row">
        <div class="who">${avatarHTML(c.user_avatar)}<b>${c.user_name}</b><span>${new Date(c.created_at).toLocaleDateString()}</span></div>
        <p>${c.body}</p>
        <div class="comment-actions">
          <span onclick="likeComment('${c.id}')">♡ ${c.likes}</span>
          <span onclick="translateComment('${c.id}','${(c.body||'').replace(/"/g,'&quot;')}')">🌐 Translate</span>
          <span onclick="reportComment('${c.id}')">⚑ Report</span>
        </div>
      </div>`).join('') || '<p class="small-muted">No comments yet.</p>'}`;
  }
}
let starPick = 5;
function setStarPick(n){ starPick=n; document.querySelectorAll('#starPicker span').forEach(s=>s.classList.toggle('on', Number(s.dataset.n)<=n)); }
async function submitReview(bookId){
  const body = document.getElementById('reviewBody').value.trim();
  try {
    await API.post('/api/reviews', { bookId, rating: starPick, body });
    toast('Review posted');
    loadDetailTab({id:bookId, slug: state.currentSlug});
  } catch(e){ toast(e.message); }
}
async function postComment(bookId){
  const input = document.getElementById('commentInput');
  const body = input.value.trim();
  if (!body) return;
  try {
    await API.post('/api/comments', { bookId, body });
    input.value='';
    loadDetailTab({id:bookId, slug: state.currentSlug});
  } catch(e){ toast(e.message); }
}
async function likeComment(id){ try { await API.post(`/api/comments/${id}/like`); loadDetailTab({id:null, slug: state.currentSlug}); } catch(e){ requireLogin(); } }
async function reportComment(id){
  if (!(state.session && state.session.user)) return requireLogin();
  try { await API.post(`/api/comments/${id}/report`, {reason:'reported from reader'}); toast('Thanks — our team will review this.'); } catch(e){ toast(e.message); }
}
async function translateComment(id, original){
  try {
    const lang = prompt('Translate to (e.g. Spanish, French):','Spanish');
    if (!lang) return;
    const res = await API.post('/api/translate', { contentType:'COMMENT', contentId:id, language:lang, text: original });
    toast(res.status === 'READY' ? 'Translated' : res.message);
  } catch(e){ toast(e.message); }
}

/* ---- chapter-end discussion (distinct from book-level comments) ---- */
async function loadChapterDiscussion(chapterId){
  const listEl = document.getElementById('cdList');
  const countEl = document.getElementById('cdCount');
  if (!listEl) return;
  try {
    const comments = await API.get(`/api/comments?bookId=${state.readerBookId}&chapterId=${chapterId}`);
    if (countEl) countEl.textContent = `${comments.length} comment${comments.length===1?'':'s'}`;
    listEl.innerHTML = comments.map(c=>`<div class="comment-row">
      <div class="who">${avatarHTML(c.user_avatar)}<b>${c.user_name}</b><span>${new Date(c.created_at).toLocaleDateString()}</span></div>
      <p>${c.body}</p>
      <div class="comment-actions">
        <span onclick="likeChapterComment('${c.id}')">♡ ${c.likes}</span>
        <span onclick="translateComment('${c.id}','${(c.body||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}')">🌐 Translate</span>
        <span onclick="reportComment('${c.id}')">⚑ Report</span>
      </div>
    </div>`).join('') || '<p class="small-muted">No comments yet on this chapter — be the first to share your thoughts.</p>';
  } catch (e) {
    listEl.innerHTML = `<p class="small-muted">${e.message}</p>`;
  }
}
async function postChapterComment(){
  if (!(state.session && state.session.user)) return requireLogin();
  const input = document.getElementById('cdInput');
  const body = input.value.trim();
  if (!body) return;
  try {
    await API.post('/api/comments', { bookId: state.readerBookId, chapterId: window._currentChapterId, body });
    input.value = '';
    loadChapterDiscussion(window._currentChapterId);
  } catch (e) { toast(e.message); }
}
async function likeChapterComment(id){
  try { await API.post(`/api/comments/${id}/like`); loadChapterDiscussion(window._currentChapterId); }
  catch (e) { requireLogin(); }
}
async function downloadPdf(bookId){
  if (!(state.session && state.session.user)) return requireLogin();
  try {
    const res = await fetch(`/api/books/${bookId}/pdf`, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'Download failed.'}));
      return toast(err.error || 'Download failed.');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'book.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Download started');
  } catch (e) { toast('Download failed.'); }
}
async function toggleBookmark(bookId){
  if (!(state.session && state.session.user)) return requireLogin();
  const btn = document.getElementById('bmBtn');
  const active = btn.classList.contains('active');
  try {
    if (active) { await API.del(`/api/library/bookmarks/${bookId}`); btn.classList.remove('active'); btn.querySelector('svg').setAttribute('fill','none'); toast('Removed from bookmarks'); }
    else { await API.post('/api/library/bookmarks', {bookId}); btn.classList.add('active'); btn.querySelector('svg').setAttribute('fill','currentColor'); toast('Bookmarked'); }
  } catch(e){ toast(e.message); }
}

/* ============================================================
   ACCESS / PRICING (one-time vs VIP — two distinct experiences)
   ============================================================ */
async function renderPricing(){
  const app = document.getElementById('app');
  if (!state.products.length) state.products = await API.get('/api/products');
  if (state.pricingToggle === 'onetime') return renderOneTimeAccess();
  return renderVipSalesPage();
}
function setPricingToggle(v){ state.pricingToggle=v; renderPricing(); }

function renderOneTimeAccess(){
  const app = document.getElementById('app');
  const tiers = state.products.filter(p=>p.type==='READING_PASS');
  app.innerHTML = `
  <div class="wrap" style="text-align:center; padding-bottom:60px;">
    <div class="page-head" style="text-align:center"><h1>Choose Your Access</h1><p>Unlock stories. Build your library.</p></div>
    <div class="pricing-toggle">
      <button class="active" onclick="setPricingToggle('onetime')">One-time Access</button>
      <button onclick="setPricingToggle('vip')">Lifetime VIP</button>
    </div>
    <div class="pricing-grid" style="text-align:left;">
      ${tiers.map(p=>`<div class="price-card">
        ${p.badge?`<div class="badge badge-vip" style="margin-bottom:8px;">${p.badge}</div>`:''}
        <h3>${p.name}</h3>
        <div class="price">$${(p.price_cents/100).toFixed(2).replace(/\.00$/,'')}</div>
        <div class="price-note">One-time payment</div>
        <ul>
          <li>${checkIcon()}<span>Choose 1 eligible story${p.chapter_allowance?` (${p.chapter_allowance} chapters)`:''}</span></li>
          <li>${checkIcon()}<span>Read online</span></li>
          <li>${checkIcon()}<span>Track progress</span></li>
          <li>${checkIcon()}<span>Store in library</span></li>
        </ul>
        <button class="btn btn-ghost" style="width:100%" onclick="startPurchase('${p.id}')">Choose ${p.name.replace(' Access','')}</button>
      </div>`).join('') || '<p class="small-muted">No access products are available right now.</p>'}
    </div>
    <div class="trust-bar" style="margin-top:40px; border-radius:14px;">
      <div class="trust-grid" style="grid-template-columns:repeat(4,1fr)">
        ${trustItem('shield','Secure Payment','Powered by Paystack')}
        ${trustItem('lock','Instant Access','Start reading right away')}
        ${trustItem('book','Your Library','Stories you own forever')}
        ${trustItem('globe','Read Anywhere','Sync across devices')}
      </div>
    </div>
    <p style="color:var(--text-faint); font-size:12px; margin-top:18px;">Prices shown in USD. You can pay by card or bank transfer.</p>
  </div>
  ${footerHTML()}`;
}

async function renderVipSalesPage(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">Loading…</div>`;
  const vipProduct = state.products.find(p=>p.type==='VIP_MEMBERSHIP');
  const alreadyVip = !!(state.session && state.session.user && (await API.get('/api/me').catch(()=>({vip:false}))).vip);
  const [bestSellers, mostRead, newReleases, exclusives] = await Promise.all([
    API.get('/api/books?bestSeller=1'),
    API.get('/api/books?trending=1'),
    API.get('/api/books?newRelease=1'),
    API.get('/api/books?vipExclusive=1'),
  ]);
  app.innerHTML = `
  <div class="wrap" style="padding-bottom:60px;">
    <div class="page-head" style="text-align:center"><h1>Choose Your Access</h1><p>Unlock stories. Build your library.</p></div>
    <div class="pricing-toggle" style="display:flex; justify-content:center;">
      <button onclick="setPricingToggle('onetime')">One-time Access</button>
      <button class="active" onclick="setPricingToggle('vip')">Lifetime VIP</button>
    </div>
    <div class="vip-hero">
      <p class="eyebrow">👑 Lifetime VIP</p>
      <h2>${alreadyVip ? "You're a Lifetime VIP Member" : 'Read Everything. Forever.'}</h2>
      ${alreadyVip ? `<p class="small-muted" style="margin:10px 0 20px;">Thank you for being VIP — enjoy the eligible library, exclusives, and PDF downloads.</p>` : `
      <div class="price">$${vipProduct?(vipProduct.price_cents/100).toFixed(0):'30'}</div>
      <p class="small-muted">One-time payment · lifetime access</p>
      <div class="vip-benefits">
        ${[['Access eligible library','book'],['Download eligible PDFs','lock'],['New releases included','crown'],['VIP-only exclusive stories','shield'],['No ads','globe']].map(([t])=>`<div class="b">${checkIcon()}<span>${t}</span></div>`).join('')}
      </div>`}
      ${alreadyVip
        ? `<button class="btn btn-gold" style="padding:14px 40px;" onclick="state.libTab='vip'; go('library')">View VIP Collection</button>`
        : `<button class="btn btn-gold" style="padding:14px 40px;" onclick="startPurchase('${vipProduct?vipProduct.id:''}')">Become a Lifetime VIP — $${vipProduct?(vipProduct.price_cents/100).toFixed(0):'30'}</button>`}
    </div>

    <div class="vip-section"><h3>VIP Exclusive Stories</h3><div class="rail">${exclusives.map(bookCardHTML).join('') || '<p class="small-muted">More exclusives coming soon.</p>'}</div></div>
    <div class="vip-section"><h3>Readers Can't Stop Reading</h3><div class="rail">${bestSellers.map(bookCardHTML).join('') || mostRead.map(bookCardHTML).join('')}</div></div>
    <div class="vip-section"><h3>New Releases</h3><div class="rail">${newReleases.map(bookCardHTML).join('') || '<p class="small-muted">Check back soon.</p>'}</div></div>

    <div class="vip-section">
      <h3>Why Readers Choose VIP</h3>
      <div class="testimonial-row">
        <div class="testimonial"><div class="stars">★★★★★</div><p>Paid for itself after two books. Having everything in one library changed how much I actually read.</p><b>— VIP member</b></div>
        <div class="testimonial"><div class="stars">★★★★★</div><p>The PDF downloads mean I can read on flights with no signal. Worth it for that alone.</p><b>— VIP member</b></div>
        <div class="testimonial"><div class="stars">★★★★★</div><p>No more picking one book per purchase — I just read whatever I'm in the mood for.</p><b>— VIP member</b></div>
      </div>
    </div>
    <div style="text-align:center; margin-top:30px;">
      ${alreadyVip
        ? `<button class="btn btn-gold" style="padding:14px 40px;" onclick="state.libTab='vip'; go('library')">View VIP Collection</button>`
        : `<button class="btn btn-gold" style="padding:14px 40px;" onclick="startPurchase('${vipProduct?vipProduct.id:''}')">Become a Lifetime VIP — $${vipProduct?(vipProduct.price_cents/100).toFixed(0):'30'}</button>`}
    </div>
  </div>
  ${footerHTML()}`;
}

/* ---- purchase flow (order -> pay -> verify -> entitlement/VIP -> choose book) ---- */
function purchaseModalShell(inner){
  return `<div class="modal-scrim show" id="purchaseModal"><div class="modal-box">${inner}</div></div>`;
}
function closePurchaseModal(){ const m=document.getElementById('purchaseModal'); if(m) m.remove(); }

async function startPurchase(productId){
  if (!productId) return;
  if (!(state.session && state.session.user)) return requireLogin();
  document.body.insertAdjacentHTML('beforeend', purchaseModalShell(`
    <div class="pay-spinner"><div class="dot"></div><div>Starting checkout…</div></div>
  `));
  try {
    const order = await API.post('/api/orders', { productId });
    document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`
      <span class="modal-close" onclick="closePurchaseModal()">✕</span>
      <h3>${order.productName}</h3>
      <div class="modal-sub">Total: $${order.amount} ${order.currency}</div>
      ${order.dev ? '<span class="dev-badge">DEV PAYMENT SIMULATOR — no real Paystack key configured</span>' : ''}
      <p class="small-muted" style="margin-bottom:20px;">${order.dev ? 'This environment has no outbound network access to Paystack, so payment is simulated end-to-end. Add PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY as environment variables to go live — no other code changes needed.' : 'You will be redirected to Paystack to complete payment securely.'}</p>
      <button class="btn btn-gold btn-block" onclick="completePurchase('${order.orderId}','${order.productType}', ${!!order.dev})">Pay $${order.amount}</button>
    `);
  } catch (e) {
    closePurchaseModal();
    toast(e.message);
  }
}

async function completePurchase(orderId, productType, dev){
  document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`
    <div class="pay-spinner"><div class="dot"></div><div>${dev?'Simulating payment…':'Verifying payment…'}</div></div>
  `);
  await new Promise(r=>setTimeout(r, 900));
  try {
    const result = await API.post(`/api/orders/${orderId}/verify`);
    if (result.status !== 'PAID') {
      document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`<p>Payment was not completed. <button class="btn btn-ghost" onclick="closePurchaseModal()">Close</button></p>`);
      return;
    }
    await loadSession();
    if (productType === 'VIP_MEMBERSHIP') {
      document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`
        <div class="pay-success"><div class="check">✓</div><h3>Welcome to VIP</h3><p class="modal-sub">Your lifetime membership is active. Enjoy the eligible library, exclusives, and PDF downloads.</p>
        <button class="btn btn-gold btn-block" onclick="closePurchaseModal(); state.libTab='vip'; go('library')">Go to VIP Collection</button></div>`);
    } else {
      const elig = await API.get(`/api/entitlements/${result.entitlementId}/eligible-books`);
      document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`
        <h3>Choose Your Book</h3>
        <div class="modal-sub">Pick one story to unlock with this entitlement. This choice is final.</div>
        <div class="choose-book-grid">${elig.books.map(b=>`<div class="card" onclick="chooseEntitlementBook('${result.entitlementId}','${b.id}')">${coverHTML({...b, genres:[]})}<div class="card-meta"><span class="genre">${b.title}</span></div></div>`).join('') || '<p class="small-muted">No eligible books yet — check back soon.</p>'}</div>
      `);
    }
  } catch (e) {
    document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`<p>${e.message}</p><button class="btn btn-ghost" onclick="closePurchaseModal()">Close</button>`);
  }
}

async function chooseEntitlementBook(entitlementId, bookId){
  try {
    await API.post(`/api/entitlements/${entitlementId}/consume`, { bookId });
    document.getElementById('purchaseModal').outerHTML = purchaseModalShell(`
      <div class="pay-success"><div class="check">✓</div><h3>Added to Your Library</h3><p class="modal-sub">Start reading any time from My Library.</p>
      <button class="btn btn-gold btn-block" onclick="closePurchaseModal(); state.libTab='purchased'; go('library')">Go to Purchased</button></div>`);
  } catch (e) { toast(e.message); }
}

/* ============================================================
   LIBRARY
   ============================================================ */
async function renderLibrary(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">Loading…</div>`;
  const lib = await API.get('/api/library');
  state.library = lib;
  const tabs=[
    ['continue',`Continue Reading (${lib.continueReading.length})`],
    ['purchased',`Purchased (${lib.purchased.length})`],
    ['vip',`VIP Collection (${lib.vipCollection.length})`],
    ['completed',`Completed (${lib.completed.length})`],
    ['bookmarks',`Bookmarks (${lib.bookmarks.length})`],
  ];
  app.innerHTML = `<div class="wrap">
    <div class="page-head"><h1>My Library</h1></div>
    <div class="lib-tabs">${tabs.map(([k,label])=>`<button class="lib-tab ${state.libTab===k?'active':''}" onclick="setLibTab('${k}')">${label}</button>`).join('')}</div>
    <div id="libBody"></div>
  </div>
  ${footerHTML()}`;
  renderLibBody();
}
function setLibTab(t){ state.libTab=t; document.querySelectorAll('.lib-tab').forEach(el=>el.classList.remove('active')); event.target.classList.add('active'); renderLibBody(); }
function renderLibBody(){
  const body = document.getElementById('libBody');
  const lib = state.library;
  if (state.libTab === 'continue') {
    body.innerHTML = lib.continueReading.length ? `<div class="lib-list">${lib.continueReading.map(b=>`
      <div class="lib-row">
        <div class="cov">${coverHTML(b,{badges:false, title:false})}</div>
        <div class="body"><h4>${b.title}</h4><div class="sub">Chapter ${b.currentChapter} of ${b.totalChapters}</div>
          <div class="progress-bar"><i style="width:${b.percent}%"></i></div><div class="progress-pct">${b.percent}%</div></div>
        <button class="btn btn-gold btn-sm" onclick="openReader('${b.bookId}','${b.slug}',${b.currentChapter})">Continue Reading</button>
      </div>`).join('')}</div>` : emptyShelf();
  } else if (state.libTab === 'bookmarks') {
    body.innerHTML = lib.bookmarks.length ? `<div class="lib-grid">${lib.bookmarks.map(bookCardHTML).join('')}</div>` : emptyShelf();
  } else if (state.libTab === 'purchased') {
    body.innerHTML = lib.purchased.length ? `<div class="lib-grid">${lib.purchased.map(bookCardHTML).join('')}</div>` : emptyShelf();
  } else if (state.libTab === 'vip') {
    body.innerHTML = lib.vipCollection.length
      ? `<div class="vip-benefits" style="justify-content:flex-start; margin-bottom:20px;">
          ${['Read VIP stories','Access eligible library','Download PDFs','New releases','VIP-only stories'].map(t=>`<div class="b">${checkIcon()}<span>${t}</span></div>`).join('')}
        </div>
        <div class="lib-grid">${lib.vipCollection.map(vipCardHTML).join('')}</div>`
      : emptyShelf();
  } else {
    body.innerHTML = lib.completed.length ? `<div class="lib-list">${lib.completed.map(b=>`
      <div class="lib-row">
        <div class="cov">${coverHTML(b,{badges:false, title:false})}</div>
        <div class="body"><h4>${b.title}</h4><div class="sub">${b.totalChapters} Chapters · Completed</div></div>
        <button class="btn btn-ghost btn-sm" onclick="openReader('${b.bookId}','${b.slug}',1)">Read Again</button>
      </div>`).join('')}</div>` : emptyShelf();
  }
}
function emptyShelf(){ return `<div style="text-align:center; padding:60px 0; color:var(--text-faint);">Nothing here yet — stories you save will appear in this shelf.</div>`; }

/* ============================================================
   READER
   ============================================================ */
async function renderReader(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">Loading…</div>`;
  let chapter;
  try {
    chapter = await API.get(`/api/books/${state.readerBookSlug}/chapters/${state.readerChapterNumber}`);
  } catch (e) {
    app.innerHTML = `<div class="wrap"><div class="locked-panel"><div class="lock-icon">🔒</div><h2>${e.message}</h2>
      <button class="btn btn-gold" style="margin-top:16px" onclick="go('pricing')">Unlock Story</button></div></div>${footerHTML()}`;
    return;
  }
  const pct = Math.min(99, Math.round((chapter.number/chapter.totalChapters)*100));
  const bodyClasses = `reader-body ${state.theme!=='dark'?'theme-'+state.theme:''} fs-${state.fontSize}`;
  const fontFamilyCss = state.fontFamily==='sans' ? "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" : state.fontFamily==='accessible' ? "'Atkinson Hyperlegible','Verdana',sans-serif" : "var(--serif)";
  const lineHeightCss = state.lineSpacing==='compact' ? '1.4' : state.lineSpacing==='relaxed' ? '2.0' : '1.7';
  const maxWidthCss = state.width==='narrow' ? '540px' : state.width==='wide' ? '820px' : '680px';
  const inlineStyle = `font-family:${fontFamilyCss}; line-height:${lineHeightCss}; max-width:${maxWidthCss}; margin-left:auto; margin-right:auto;`;
  app.innerHTML = `
  <div class="reader-shell">
    <div class="reader-top">
      <button class="icon-btn" onclick="openBook('${state.readerBookSlug}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div class="center"><div class="bk">${chapter.bookTitle}</div><div class="ch">Chapter ${chapter.number}</div></div>
      <div style="display:flex; gap:8px;">
        <button class="icon-btn bm-btn" onclick="toggleReaderBookmark()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>
      </div>
    </div>
    <div class="${bodyClasses} no-select" oncontextmenu="return false" id="readerContent" style="${inlineStyle}">
      <h2>${chapter.title}</h2>
      <div class="ornament">❦</div>
      ${chapter.content.split(/\n+/).filter(Boolean).map(p=>`<p>${p}</p>`).join('')}
    </div>
    <div class="reader-nav">
      ${chapter.number <= 1
        ? `<span style="width:84px;"></span>`
        : `<button class="btn btn-ghost btn-sm" onclick="changeChapter(-1)">‹ Previous</button>`}
      <div style="display:flex; align-items:center; gap:10px; flex:1;">
        <div class="reader-progress-mini"><i style="width:${pct}%"></i></div>
        <span style="font-size:12px; color:var(--text-faint); width:36px;">${pct}%</span>
      </div>
      ${chapter.number >= chapter.totalChapters
        ? `<span class="btn btn-ghost btn-sm" style="opacity:.7; cursor:default;">Book Completed ✓</span>`
        : `<button class="btn btn-gold btn-sm" onclick="changeChapter(1)">Next Chapter ›</button>`}
    </div>
    <div class="reader-toolbar">
      ${toolbarBtn('text','Text', 'cycleFont()')}
      ${toolbarBtn('theme','Theme', 'cycleTheme()')}
      ${toolbarBtn('contents','Contents', 'openDrawer()')}
      ${toolbarBtn('translate','Translate', 'translateChapter()')}
      ${toolbarBtn('voice', VoiceReader.isPlaying && VoiceReader.isPlaying() ? 'Pause' : 'Listen', 'toggleVoice()')}
    </div>

    <div class="chapter-discussion" id="chapterDiscussion">
      <div class="cd-head">
        <h3>Chapter ${chapter.number} Discussion</h3>
        <span class="small-muted" id="cdCount">Loading…</span>
      </div>
      <p class="cd-sub">Share your thoughts about this chapter while they're still fresh.</p>
      <div style="display:flex; gap:10px; margin-bottom:18px;">
        <input id="cdInput" placeholder="Share your thoughts about this chapter…" style="flex:1; background:var(--bg-2); border:1px solid var(--border-soft); border-radius:10px; padding:12px 16px; color:var(--text);">
        <button class="btn btn-gold btn-sm" onclick="postChapterComment()">Post</button>
      </div>
      <div id="cdList"><p class="small-muted">Loading discussion…</p></div>
    </div>
  </div>`;
  saveProgress(chapter);
  window._currentChapterText = chapter.content;
  window._currentChapterId = chapter.id;
  loadChapterDiscussion(chapter.id);
}
function toolbarBtn(icon,label,fnCall){
  const icons={
    text:'<path d="M5 6h14M9 6v14M15 6v6"/>',
    theme:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    contents:'<path d="M4 6h16M4 12h16M4 18h10"/>',
    translate:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9z"/>',
    voice:'<path d="M12 3v18M8 8v8M16 8v8M4 11v2M20 11v2"/>',
  };
  return `<button class="rt-btn" onclick="${fnCall}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icons[icon]}</svg>${label}</button>`;
}
function cycleFont(){ const o=['sm','md','lg']; state.fontSize=o[(o.indexOf(state.fontSize)+1)%o.length]; saveReaderSettings(); renderReader(); toast('Text size: '+state.fontSize.toUpperCase()); }
function cycleTheme(){ const o=['dark','sepia','light']; state.theme=o[(o.indexOf(state.theme)+1)%o.length]; saveReaderSettings(); renderReader(); toast('Theme: '+state.theme); }
async function saveReaderSettings(){
  if (!(state.session && state.session.user)) return;
  try { await API.patch('/api/me/settings', { readerSettings: { fontSize: state.fontSize, theme: state.theme } }); } catch(e){}
}
function changeChapter(delta){
  state.readerChapterNumber = Math.max(1, state.readerChapterNumber + delta);
  go('reader', state.readerBookSlug);
}
async function saveProgress(chapter){
  if (!(state.session && state.session.user)) return;
  const percent = Math.min(100, Math.round((chapter.number/chapter.totalChapters)*100));
  try { await API.post('/api/library/progress', { bookId: state.readerBookId, chapterNumber: chapter.number, percent }); } catch(e){}
}
async function toggleReaderBookmark(){
  if (!(state.session && state.session.user)) return requireLogin();
  try { await API.post('/api/library/bookmarks', { bookId: state.readerBookId }); toast('Bookmarked'); } catch(e){ toast(e.message); }
}
async function translateChapter(){
  const lang = prompt('Translate this chapter to:', 'Spanish');
  if (!lang) return;
  try {
    const res = await API.post('/api/translate', { contentType:'CHAPTER', contentId: `${state.readerBookId}-${state.readerChapterNumber}`, language: lang, text: window._currentChapterText||'' });
    toast(res.status==='READY' ? 'Translated' : res.message);
  } catch(e){ toast(e.message); }
}
function toggleVoice(){
  if (!VoiceReader.isSupported()) return toast('Voice reading is not supported in this browser.');
  VoiceReader.setRate(Number(state.voiceSpeed) || 1);
  if (VoiceReader.isPlaying && VoiceReader.isPlaying()) { VoiceReader.pause(); toast('Paused'); }
  else { VoiceReader.load(window._currentChapterText||''); VoiceReader.play(); toast('Reading aloud at '+state.voiceSpeed+'x…'); }
}
function openDrawer(){
  const cur = state.readerChapterNumber;
  API.get(`/api/books/${state.readerBookSlug}/chapters`).then(chapters=>{
    const start = Math.max(0,cur-4), end = Math.min(chapters.length, cur+3);
    let html='';
    for (let i=start;i<end;i++){
      const c = chapters[i];
      const status = c.number<cur?'done': c.number===cur?'current': c.locked?'locked':'';
      html += `<div class="dch ${status}" onclick="${c.locked?`toast('${(c.unlockReason||'Locked').replace(/'/g,"\\'")}')`:`state.readerChapterNumber=${c.number}; closeDrawer(); go('reader', state.readerBookSlug);`}">
        <span class="num">${String(c.number).padStart(2,'0')}</span>
        <div class="t"><b>Chapter ${c.number}</b><span>${c.title}</span></div>
        ${status==='done'?'<span style="color:var(--success)">✓</span>':status==='current'?'<span style="color:var(--gold)">●</span>':c.locked?'<span class="lock">🔒</span>':''}
      </div>`;
    }
    document.getElementById('drawerBody').innerHTML = html;
    document.getElementById('drawer').classList.add('show');
    document.getElementById('scrim').classList.add('show');
  });
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('show');
  document.getElementById('scrim').classList.remove('show');
}

/* ============================================================
   PROFILE / ACCOUNT SETTINGS
   ============================================================ */
let pendingAvatarFile = null;
function avatarFileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function renderProfile(){
  const app = document.getElementById('app');
  const me = await API.get('/api/me');
  state.session = me;
  state.accountTab = state.accountTab || 'profile';
  app.innerHTML = `<div class="wrap">
    <div class="page-head"><h1>Account</h1></div>
    <div class="tabs" style="margin-bottom:22px;">
      <button class="tab ${state.accountTab==='profile'?'active':''}" onclick="setAccountTab('profile')">Profile</button>
      <button class="tab ${state.accountTab==='preferences'?'active':''}" onclick="setAccountTab('preferences')">Reading Preferences</button>
      <button class="tab ${state.accountTab==='security'?'active':''}" onclick="setAccountTab('security')">Account &amp; Security</button>
    </div>
    <div id="accountTabBody"></div>
  </div>
  ${footerHTML()}`;
  renderAccountTab(me);
}
function setAccountTab(t){ state.accountTab=t; renderProfile(); }

function renderAccountTab(me){
  const body = document.getElementById('accountTabBody');
  if (state.accountTab === 'profile') return renderProfileTab(body, me);
  if (state.accountTab === 'preferences') return renderPreferencesTab(body, me);
  return renderSecurityTab(body, me);
}

function renderProfileTab(body, me){
  const u = me.user;
  body.innerHTML = `
    <div class="profile-grid">
      <div class="profile-card">
        <h3 class="serif" style="font-size:18px; margin-bottom:18px;">Profile</h3>
        <div style="display:flex; gap:18px; align-items:flex-start; margin-bottom:22px;">
          <div style="flex-shrink:0;">
            <img id="avatarPreview" src="${u.avatarUrl||''}" style="display:${u.avatarUrl?'block':'none'}; width:88px; height:88px; border-radius:999px; object-fit:cover; border:1px solid var(--border-soft);">
            <div id="avatarPlaceholder" style="display:${u.avatarUrl?'none':'flex'}; width:88px; height:88px; border-radius:999px; background:linear-gradient(135deg,#3a2f14,#1a1408); align-items:center; justify-content:center; font-family:var(--serif); font-size:28px;">${u.name.charAt(0).toUpperCase()}</div>
          </div>
          <div>
            <input type="file" id="avatarFileInput" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="onAvatarSelected()">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('avatarFileInput').click()">${u.avatarUrl?'Replace Photo':'Upload Photo'}</button>
              ${u.avatarUrl?`<button class="btn btn-ghost btn-sm" onclick="removeAvatar()">Remove</button>`:''}
            </div>
            <div id="avatarPendingActions" style="display:none; gap:8px; margin-top:10px;">
              <button class="btn btn-gold btn-sm" onclick="saveAvatarUpload()">Save Photo</button>
              <button class="btn btn-ghost btn-sm" onclick="cancelAvatarUpload()">Cancel</button>
            </div>
            <div id="avatarStatus" class="small-muted" style="margin-top:8px;">JPG, PNG, or WEBP. Up to 5MB.</div>
          </div>
        </div>
        <div class="field"><label>Display Name</label><input id="fName" value="${escAttr(u.name)}"></div>
        <div class="field"><label>Username</label>
          <div style="display:flex; gap:8px;">
            <input id="fUsername" value="${escAttr(u.username||'')}" placeholder="not set">
            <button class="btn btn-ghost btn-sm" onclick="saveUsername()">Save</button>
          </div>
          <div id="usernameStatus" class="small-muted" style="margin-top:6px;">3-20 characters: letters, numbers, underscores.</div>
        </div>
        <div class="field"><label>Bio</label><textarea id="fBio" maxlength="280" rows="3" placeholder="Tell other readers a little about yourself…">${escAttr(u.bio||'')}</textarea>
          <div class="small-muted" style="margin-top:4px;"><span id="bioCount">${(u.bio||'').length}</span>/280</div>
        </div>
        <div class="field"><label>Preferred Language</label>
          <select id="fLanguage">
            ${['English','Spanish','French','Portuguese','German','Arabic','Hindi','Yoruba','Igbo','Hausa'].map(l=>`<option ${u.preferredLanguage===l?'selected':''}>${l}</option>`).join('')}
          </select>
          <div class="small-muted" style="margin-top:6px;">This is your interface/translation language — separate from a book's original language.</div>
        </div>
        <button class="btn btn-gold" onclick="saveProfileFields()">Save Changes</button>

        <hr style="border-color:var(--border-soft); margin:26px 0;">
        <h3 class="serif" style="font-size:16px; margin-bottom:10px;">Email Address</h3>
        <div class="profile-field"><span>Current Email</span><span>${escAttr(u.email)}</span></div>
        <div class="field" style="margin-top:12px;"><label>New Email</label><input id="fNewEmail" type="email" placeholder="new@email.com"></div>
        <div class="field"><label>Current Password (required to confirm)</label><input id="fEmailPassword" type="password"></div>
        <div id="emailStatus" class="inline-error" style="display:none;"></div>
        <button class="btn btn-ghost" onclick="changeEmail()">Update Email</button>
      </div>
      <div class="vip-status-card">
        <p class="eyebrow">VIP Status</p>
        ${me.vip
          ? `<h3 class="serif" style="font-size:20px; margin:10px 0 4px;">👑 Lifetime VIP Member</h3><p style="font-size:12.5px; color:var(--text-faint); margin-bottom:16px;">Thank you for being a VIP.</p>`
          : `<h3 class="serif" style="font-size:20px; margin:10px 0 4px;">Standard Reader</h3><p style="font-size:12.5px; color:var(--text-faint); margin-bottom:16px;">Upgrade for unlimited access to the eligible library.</p>`}
        <button class="btn btn-gold btn-sm" style="width:100%" onclick="${me.vip?"state.libTab='vip'; go('library')":"go('pricing')"}">${me.vip?'View VIP Collection':'Become VIP'}</button>
      </div>
    </div>`;
  document.getElementById('fBio').addEventListener('input', (e)=>{ document.getElementById('bioCount').textContent = e.target.value.length; });
}

function escAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function onAvatarSelected(){
  const input = document.getElementById('avatarFileInput');
  const statusEl = document.getElementById('avatarStatus');
  const file = input.files[0];
  if (!file) return;
  const allowed = ['image/jpeg','image/png','image/webp'];
  if (!allowed.includes(file.type)) { statusEl.textContent = 'Upload failed: choose a JPG, PNG, or WEBP image. Existing photo kept.'; input.value=''; return; }
  if (file.size > 5*1024*1024) { statusEl.textContent = 'Upload failed: file larger than 5MB. Existing photo kept.'; input.value=''; return; }
  pendingAvatarFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('avatarPreview').src = reader.result;
    document.getElementById('avatarPreview').style.display = 'block';
    document.getElementById('avatarPlaceholder').style.display = 'none';
    document.getElementById('avatarPendingActions').style.display = 'flex';
    statusEl.textContent = 'Preview ready — Save Photo to apply, or Cancel to discard.';
  };
  reader.readAsDataURL(file);
}
async function saveAvatarUpload(){
  if (!pendingAvatarFile) return;
  const statusEl = document.getElementById('avatarStatus');
  const file = pendingAvatarFile;
  statusEl.textContent = 'Uploading…';
  try {
    const base64 = await avatarFileToBase64(file);
    statusEl.textContent = 'Saved';
    await API.post('/api/me/avatar', { filename: file.name, dataBase64: base64 });
    pendingAvatarFile = null;
    await loadSession();
    toast('Profile photo updated');
    renderProfile();
  } catch (e) {
    statusEl.textContent = `Upload failed: ${e.message} — existing photo kept.`;
  }
}
function cancelAvatarUpload(){ pendingAvatarFile = null; renderProfile(); }
async function removeAvatar(){
  try { await API.del('/api/me/avatar'); await loadSession(); toast('Photo removed'); renderProfile(); }
  catch (e) { toast(e.message); }
}
async function saveProfileFields(){
  try {
    await API.patch('/api/me/profile', {
      name: document.getElementById('fName').value.trim(),
      bio: document.getElementById('fBio').value,
      preferredLanguage: document.getElementById('fLanguage').value,
    });
    await loadSession();
    toast('Profile saved');
    renderProfile();
  } catch (e) { toast(e.message); }
}
async function saveUsername(){
  const statusEl = document.getElementById('usernameStatus');
  try {
    await API.post('/api/me/username', { username: document.getElementById('fUsername').value.trim() });
    statusEl.textContent = 'Username saved.';
    toast('Username updated');
  } catch (e) { statusEl.textContent = e.message; }
}
async function changeEmail(){
  const statusEl = document.getElementById('emailStatus');
  statusEl.classList.remove('show');
  try {
    const res = await API.post('/api/me/email', {
      newEmail: document.getElementById('fNewEmail').value.trim(),
      currentPassword: document.getElementById('fEmailPassword').value,
    });
    await loadSession();
    toast('Email updated');
    renderProfile();
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.classList.add('show');
  }
}

function renderPreferencesTab(body, me){
  const settings = (me.user.readerSettings) || {};
  const fontSize = settings.fontSize || state.fontSize || 'md';
  const fontFamily = settings.fontFamily || 'serif';
  const lineSpacing = settings.lineSpacing || 'normal';
  const width = settings.width || 'normal';
  const theme = settings.theme || state.theme || 'dark';
  const voiceSpeed = settings.voiceSpeed || state.voiceSpeed || 1;
  body.innerHTML = `
    <div class="profile-card" style="max-width:520px;">
      <h3 class="serif" style="font-size:18px; margin-bottom:18px;">Reading Preferences</h3>
      <div class="field"><label>Font Size</label>
        <select id="pFontSize">${[['sm','Small'],['md','Medium'],['lg','Large'],['xl','Extra Large']].map(([v,l])=>`<option value="${v}" ${fontSize===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Font Family</label>
        <select id="pFontFamily">${[['serif','Serif'],['sans','Sans Serif'],['accessible','Readable (Accessibility)']].map(([v,l])=>`<option value="${v}" ${fontFamily===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Line Spacing</label>
        <select id="pLineSpacing">${[['compact','Compact'],['normal','Normal'],['relaxed','Relaxed']].map(([v,l])=>`<option value="${v}" ${lineSpacing===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Reading Width</label>
        <select id="pWidth">${[['narrow','Narrow'],['normal','Normal'],['wide','Wide']].map(([v,l])=>`<option value="${v}" ${width===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Theme</label>
        <select id="pTheme">${[['dark','Dark'],['sepia','Sepia'],['light','Light']].map(([v,l])=>`<option value="${v}" ${theme===v?'selected':''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Voice Reader Speed</label>
        <select id="pVoiceSpeed">${[0.75,1,1.25,1.5,2].map(v=>`<option value="${v}" ${Number(voiceSpeed)===v?'selected':''}>${v}x</option>`).join('')}</select>
      </div>
      <button class="btn btn-gold" onclick="savePreferences()">Save Preferences</button>
    </div>`;
}
async function savePreferences(){
  const readerSettings = {
    fontSize: document.getElementById('pFontSize').value,
    fontFamily: document.getElementById('pFontFamily').value,
    lineSpacing: document.getElementById('pLineSpacing').value,
    width: document.getElementById('pWidth').value,
    theme: document.getElementById('pTheme').value,
    voiceSpeed: Number(document.getElementById('pVoiceSpeed').value),
  };
  try {
    await API.patch('/api/me/settings', { readerSettings });
    state.fontSize = readerSettings.fontSize;
    state.theme = readerSettings.theme;
    state.voiceSpeed = readerSettings.voiceSpeed;
    await loadSession();
    toast('Reading preferences saved');
  } catch (e) { toast(e.message); }
}

function renderSecurityTab(body, me){
  body.innerHTML = `
    <div class="profile-card" style="max-width:520px;">
      <h3 class="serif" style="font-size:18px; margin-bottom:18px;">Account &amp; Security</h3>
      ${me.user.hasPassword ? `
      <div class="field"><label>Current Password</label><input type="password" id="curPass"></div>
      <div class="field"><label>New Password</label><input type="password" id="newPass" minlength="8"></div>
      <div id="passStatus" class="inline-error" style="display:none;"></div>
      <button class="btn btn-gold" onclick="changePassword()">Change Password</button>
      <p class="small-muted" style="margin-top:10px;">Changing your password signs you out on all other devices.</p>
      ` : `
      <p class="small-muted" style="margin-bottom:10px;">You signed up with Google and don't have a password yet. Set one so you can also sign in without Google.</p>
      <div class="field"><label>New Password</label><input type="password" id="newPass" minlength="8"></div>
      <div id="passStatus" class="inline-error" style="display:none;"></div>
      <button class="btn btn-gold" onclick="changePassword()">Set Password</button>
      `}

      <hr style="border-color:var(--border-soft); margin:26px 0;">
      <h3 class="serif" style="font-size:16px; margin-bottom:10px;">Connected Accounts</h3>
      <div class="connected-account-row">
        <div class="who">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.6 3 24 3 16.3 3 9.7 7.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 36.1 26.9 37 24 37c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.6 40.6 16.3 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.8 36 45 30.5 45 24c0-1.4-.1-2.7-.4-3.5z"/></svg>
          <span>Google ${me.googleConnected ? `— <b>${me.googleEmail || 'connected'}</b>` : '— not connected'}</span>
        </div>
        ${me.googleConnected
          ? `<button class="btn btn-ghost btn-sm" onclick="disconnectGoogle()">Disconnect</button>`
          : `<a class="btn btn-ghost btn-sm" href="/api/auth/google/start?mode=LINK">Connect</a>`}
      </div>

      <hr style="border-color:var(--border-soft); margin:26px 0;">
      <button class="btn btn-ghost btn-block" onclick="logout()">Sign Out</button>

      <hr style="border-color:var(--border-soft); margin:26px 0;">
      <h3 class="serif" style="font-size:16px; color:#ff9d9d; margin-bottom:10px;">Delete Account</h3>
      <p class="small-muted" style="margin-bottom:12px;">Not available in this prototype. Your library, reading progress, comments, reviews, purchase records, and VIP entitlement would need a deliberate retention policy (financial and audit records are never deleted just because an account closes) before this can go live.</p>
      <button class="btn btn-ghost" disabled onclick="explainDeleteAccount()">Delete Account (disabled)</button>
    </div>`;
  if (me.user.hasPassword) wirePasswordToggle('curPass');
  wirePasswordToggle('newPass');
}
async function disconnectGoogle(){
  if (!confirm('Disconnect Google from your account?')) return;
  try {
    await API.post('/api/me/google/disconnect');
    toast('Google disconnected');
    renderProfile();
  } catch (e) { toast(e.message); }
}
async function changePassword(){
  const statusEl = document.getElementById('passStatus');
  statusEl.classList.remove('show');
  const curPassEl = document.getElementById('curPass');
  try {
    await API.post('/api/me/password', {
      currentPassword: curPassEl ? curPassEl.value : undefined,
      newPassword: document.getElementById('newPass').value,
    });
    toast(curPassEl ? 'Password changed' : 'Password set');
    if (curPassEl) curPassEl.value='';
    document.getElementById('newPass').value='';
    await loadSession();
    renderProfile();
  } catch (e) { statusEl.textContent = e.message; statusEl.classList.add('show'); }
}
async function explainDeleteAccount(){
  try { await API.post('/api/me/delete-account'); } catch (e) { toast(e.message); }
}

/* ============================================================
   SEARCH
   ============================================================ */
function openSearch(){
  document.getElementById('searchOverlay').classList.add('show');
  setTimeout(()=>document.getElementById('searchInput').focus(),50);
  renderSearch();
}
function closeSearch(){ document.getElementById('searchOverlay').classList.remove('show'); }
async function renderSearch(){
  const q = (document.getElementById('searchInput').value||'').trim();
  const results = await API.get('/api/books' + (q?`?q=${encodeURIComponent(q)}`:''));
  const box = document.getElementById('searchResults');
  box.innerHTML = results.length
    ? `<div class="grid">${results.slice(0,12).map(bookCardHTML).join('')}</div>`
    : `<div style="text-align:center; color:var(--text-faint); padding:40px 0;">No stories found${q?` for "${q}"`:''}</div>`;
  document.querySelectorAll('#searchResults .card').forEach(c=>c.addEventListener('click', closeSearch));
}

/* ============================================================
   MAIN RENDER / BOOTSTRAP
   ============================================================ */
async function render(){
  try {
    if (state.view==='home') await renderHome();
    else if (state.view==='discover') await renderDiscover();
    else if (state.view==='pricing') await renderPricing();
    else if (state.view==='detail') await renderDetail();
    else if (state.view==='library') await renderLibrary();
    else if (state.view==='reader') await renderReader();
    else if (state.view==='profile') await renderProfile();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="wrap" style="padding:80px 0; text-align:center; color:var(--text-faint);">${e.message}</div>`;
  }
  document.querySelectorAll('.desktop-nav a').forEach(a=>a.classList.remove('active'));
  const map={home:0,discover:1,pricing:4};
  if (state.view in map) {
    const links = document.querySelectorAll('.desktop-nav a');
    if (links[map[state.view]]) links[map[state.view]].classList.add('active');
  }
  document.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));
  const bnMap={home:'home',discover:'discover',library:'library',profile:'profile'};
  if (bnMap[state.view]) {
    const el = document.querySelector(`.bn-item[data-bn="${bnMap[state.view]}"]`);
    if (el) el.classList.add('active');
  }
}

(async function bootstrap(){
  await loadSession();
  if (state.session && state.session.user && state.session.user.readerSettings) {
    state.fontSize = state.session.user.readerSettings.fontSize || 'md';
    state.theme = state.session.user.readerSettings.theme || 'dark';
    state.fontFamily = state.session.user.readerSettings.fontFamily || 'serif';
    state.lineSpacing = state.session.user.readerSettings.lineSpacing || 'normal';
    state.width = state.session.user.readerSettings.width || 'normal';
    state.voiceSpeed = state.session.user.readerSettings.voiceSpeed || 1;
  }
  const hash = location.hash.replace('#','');
  if (hash) {
    const [v, param] = hash.split('/');
    state.view = v || 'home';
    if (v === 'detail' && param) state.currentSlug = param;
    if (v === 'reader' && param) { state.readerBookSlug = param; }
  }
  const qp = new URLSearchParams(location.search);
  if (qp.get('googleLinked')) {
    state.view = 'profile';
    state.accountTab = 'security';
    setTimeout(() => toast('Google account connected'), 300);
  } else if (qp.get('googleError') === 'already_linked_elsewhere') {
    state.view = 'profile';
    state.accountTab = 'security';
    setTimeout(() => toast('That Google account is already connected to a different Beersheba account.'), 300);
  }
  render();
})();
