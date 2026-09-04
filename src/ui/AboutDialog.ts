import packageInfo from '../../package.json';

const ABOUT_HIDDEN_KEY = 'living-war-atlas:about-hidden';

interface VersionInfo {
  version: string;
  build?: number;
  commit?: string;
  dirty?: boolean;
}

export function shouldShowAboutDialog(): boolean {
  return localStorage.getItem(ABOUT_HIDDEN_KEY) !== '1';
}

async function loadVersionInfo(): Promise<VersionInfo> {
  try {
    const response = await fetch(new URL('version.json', document.baseURI), { cache: 'no-store' });
    if (response.ok) {
      const value = await response.json() as Partial<VersionInfo>;
      if (typeof value.version === 'string') {
        return {
          version: value.version,
          build: typeof value.build === 'number' ? value.build : undefined,
          commit: typeof value.commit === 'string' ? value.commit : undefined,
          dirty: value.dirty === true,
        };
      }
    }
  } catch {
    // Development can start without a generated version.json; package.json remains the fallback.
  }

  return { version: packageInfo.version };
}

export async function showAboutDialog(): Promise<void> {
  const version = await loadVersionInfo();

  await new Promise<void>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'map-picker about-dialog';

    const details = version.build !== undefined && version.commit
      ? `<span>Build ${version.build} · ${version.commit}${version.dirty ? '-dirty' : ''}</span>`
      : '';

    dialog.innerHTML = `
      <form>
        <div class="map-picker-title">Living War Atlas</div>
        <div class="about-tagline">Autonomous fronts. Emergent warfare.</div>
        <div class="about-copy">
          <p>Living War Atlas is a strategy simulation of continuously evolving front lines.</p>
          <p>Cities generate production, force flows toward the front, and territory changes hands as the simulation resolves the fighting. Each game mode changes how you can influence that process.</p>
        </div>
        <div class="about-version">
          <span>Version ${version.version}</span>
          ${details}
        </div>
        <label class="mode-instructions-dismiss">
          <input type="checkbox" ${localStorage.getItem(ABOUT_HIDDEN_KEY) === '1' ? 'checked' : ''}>
          <span>Don't show this again</span>
        </label>
        <div class="map-picker-actions">
          <button type="button" class="map-picker-start">OK</button>
        </div>
      </form>
    `;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const checkbox = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      if (checkbox.checked) localStorage.setItem(ABOUT_HIDDEN_KEY, '1');
      else localStorage.removeItem(ABOUT_HIDDEN_KEY);
      dialog.close();
      dialog.remove();
      resolve();
    };

    dialog.querySelector<HTMLButtonElement>('.map-picker-start')!
      .addEventListener('click', finish);
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      finish();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
