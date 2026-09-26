import type { DetailInstrument } from './DetailWorld'

export const PRODUCT_NAV: { id: DetailInstrument; name: string; split: [string, string]; category: string; line: string }[] = [
  { id: 'fade', name: 'Fade', split: ['FA', 'DE'], category: 'A price in motion', line: 'A falling price. A signed handoff.' },
  { id: 'pod', name: 'Pod', split: ['P', 'OD'], category: 'A capsule in time', line: 'Your key. Its own time.' },
  { id: 'trigger', name: 'Trigger', split: ['TRIG', 'GER'], category: 'A condition to meet', line: 'Proof arrives. Escrow moves.' },
  { id: 'envoy', name: 'Envoy', split: ['EN', 'VOY'], category: 'An agent with limits', line: 'Give permission. Keep control.' },
  { id: 'ramp', name: 'Ramp', split: ['ON/', 'OFF'], category: 'A bridge to explore', line: 'Two currencies. One route.' },
  { id: 'ledger', name: 'Ledger', split: ['LED', 'GER'], category: 'A record to keep', line: 'Follow the reference.' },
]
