/* global API */
async function renderPolicyPage(key){
  const app = document.getElementById('policyApp');
  try {
    const p = await API.get(`/api/policies/${key}`);
    document.title = `${p.title} — Beersheba`;
    app.innerHTML = `
      <h1>${p.title}</h1>
      <div class="policy-updated">Last updated: ${new Date(p.updated_at.replace(' ','T')+'Z').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</div>
      <div class="policy-content">${escapeHtml(p.content)}</div>
      <div class="legal-links">
        <a onclick="location.href='/terms.html'">Terms</a>
        <a onclick="location.href='/privacy.html'">Privacy</a>
        <a onclick="location.href='/cookies.html'">Cookies</a>
        <a onclick="location.href='/copyright.html'">Copyright</a>
        <a onclick="location.href='/content-guidelines.html'">Content Guidelines</a>
        <a onclick="location.href='/refunds.html'">Refunds</a>
      </div>`;
  } catch (e) {
    app.innerHTML = `<h1>Not available</h1><p class="policy-content">This policy hasn't been published yet. Please check back soon.</p>`;
  }
}
function escapeHtml(s){
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
