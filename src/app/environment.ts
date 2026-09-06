export function developerFeaturesEnabled(): boolean {
  return import.meta.env.MODE !== 'production';
}
