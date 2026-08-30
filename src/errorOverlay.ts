let shown = false;

const detailFor = (value: unknown): string => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const showError = (title: string, detail?: string) => {
  if (shown) return;
  shown = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'display:grid',
    'place-items:center',
    'padding:20px',
    'background:rgba(35,31,24,.78)',
    'font-family:Georgia,"Times New Roman",serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:min(560px,100%)',
    'max-height:min(80vh,560px)',
    'overflow:auto',
    'padding:18px',
    'border:1px solid rgba(64,52,32,.48)',
    'border-radius:3px',
    'background:#f6efd7',
    'color:#2c2923',
    'box-shadow:0 14px 40px rgba(0,0,0,.32)',
  ].join(';');

  const heading = document.createElement('h1');
  heading.textContent = title;
  heading.style.cssText = 'margin:0 0 8px;font-size:20px';

  const message = document.createElement('p');
  message.textContent = "Reload the page. If the problem persists, clear this site's cached data and try again.";
  message.style.cssText = 'margin:0 0 12px;line-height:1.4';

  const technical = document.createElement('pre');
  technical.textContent = detail || 'No technical details were provided.';
  technical.style.cssText = [
    'margin:0 0 14px',
    'padding:10px',
    'overflow:auto',
    'border:1px solid rgba(64,52,32,.2)',
    'background:#fff7dc',
    'white-space:pre-wrap',
    'overflow-wrap:anywhere',
    'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  ].join(';');

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.style.cssText = [
    'min-height:36px',
    'padding:6px 16px',
    'border:1px solid rgba(64,52,32,.36)',
    'border-radius:2px',
    'background:#2f2b24',
    'color:#fff7dc',
    'font:inherit',
    'font-weight:700',
    'cursor:pointer',
  ].join(';');
  reload.addEventListener('click', () => window.location.reload());

  card.append(heading, message, technical, reload);
  overlay.append(card);
  document.body.appendChild(overlay);
};

window.addEventListener('error', (event) => {
  if (event instanceof ErrorEvent && event.error) {
    showError('Living War Atlas error', detailFor(event.error));
  }
});

window.addEventListener('unhandledrejection', (event) => {
  showError('Living War Atlas error', detailFor(event.reason));
});
