const PW_EYE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const PW_EYE_OFF = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.6 20.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.6 20.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

/** Wraps a password <input> with a show/hide eye button. Call after the
 * input already exists in the DOM. Safe to call multiple times per page. */
function wirePasswordToggle(inputId){
  const input = document.getElementById(inputId);
  if (!input || input.dataset.pwWired) return;
  input.dataset.pwWired = '1';
  const wrap = document.createElement('div');
  wrap.className = 'pw-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.style.paddingRight = '42px';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-eye';
  btn.setAttribute('aria-label', 'Show password');
  btn.innerHTML = PW_EYE;
  btn.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    btn.innerHTML = hidden ? PW_EYE_OFF : PW_EYE;
    btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
  });
  wrap.appendChild(btn);
}
