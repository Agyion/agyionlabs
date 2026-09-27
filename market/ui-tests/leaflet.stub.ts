// Test-only resolution target. Every test explicitly installs its Leaflet double.
export const map = () => { throw new Error('Leaflet mock is missing'); };
