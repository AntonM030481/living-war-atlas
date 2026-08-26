type ErrorPresenter = (title: string, detail: string) => void;

type ErrorWindow = Window & {
  __livingWarAtlasShowError?: ErrorPresenter;
};

function detailFor(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function showAppError(title: string, error: unknown): void {
  console.error(title, error);
  (window as ErrorWindow).__livingWarAtlasShowError?.(title, detailFor(error));
}
