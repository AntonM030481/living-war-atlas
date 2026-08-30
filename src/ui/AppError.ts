type ErrorPresenter = (title: string, detail: string) => void;

type ErrorWindow = Window & {
  __livingWarAtlasShowError?: ErrorPresenter;
};

let shown = false;

function detailFor(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function showOverlay(title: string, detail: string): void {
  if (shown) return;
  shown = true;

  const overlay = document.createElement('div');
  overlay.className = 'app-error-overlay';
  overlay.setAttribute('role', 'alert');
  overlay.innerHTML = `
    <div class="app-error-card">
      <h1></h1>
      <p>Reload the page. If the problem persists, clear this site's cached data and try again.</p>
      <pre></pre>
      <button type="button">Reload</button>
    </div>
  `;

  const heading = overlay.querySelector('h1');
  const technical = overlay.querySelector('pre');
  const reload = overlay.querySelector('button');
  if (heading) heading.textContent = title;
  if (technical) technical.textContent = detail || 'No technical details were provided.';
  reload?.addEventListener('click', () => window.location.reload());

  document.body.appendChild(overlay);
}

(window as ErrorWindow).__livingWarAtlasShowError = showOverlay;

window.addEventListener('error', (event) => {
  if (event instanceof ErrorEvent && event.error) {
    showAppError('Living War Atlas error', event.error);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  showAppError('Living War Atlas error', event.reason);
});

export function showAppError(title: string, error: unknown): void {
  console.error(title, error);
  showOverlay(title, detailFor(error));
}
