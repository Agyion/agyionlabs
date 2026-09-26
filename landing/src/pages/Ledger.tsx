import DetailWorld from '../components/DetailWorld'

export default function Ledger() {
  return <DetailWorld id="ledger" name="Ledger" promise="Keep the record. Check the reference."
    steps={[
      { label: 'Review', text: 'Review the actions and statuses recorded by this browser.' },
      { label: 'Export', text: 'Export a Proof Pack with recorded entries, transaction references and an integrity checksum.' },
      { label: 'Verify', text: 'Check the referenced transaction on the configured Stellar testnet before relying on a settlement claim.' },
    ]}
    caveat="Exports may be unsigned; local history is not proof of settlement."
    notes={[
      'A connected wallet does not automatically sign an export; a supported signing key is required.',
      'A checksum records integrity, not confirmation of an on-chain result.',
      'Clearing browser data can erase this history; an export preserves it but does not reverse transactions.',
    ]}
    environment="Local history. Testnet references."
  />
}
