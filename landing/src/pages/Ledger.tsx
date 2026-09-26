import DetailWorld from '../components/DetailWorld'

function RecordDiagram({ step }: { step: number }) {
  return (
    <figure className="detail-record" data-stage={step} aria-label="Local records, an export checksum and a transaction reference">
      <svg viewBox="0 0 600 360" fill="none" aria-hidden="true">
        <path className="detail-visual__guide" d="M28 180H572M300 28V332" />
        <g className="detail-record__pages"><path d="M173 70H362L410 118V298H173ZM200 47H389L437 95V275H410M224 27H414L462 75V254H437" /><path d="M362 70V119H410M389 47V96H437M414 27V76H462" /></g>
        <g className="detail-record__lines"><path d="M207 156H372M207 177H346M207 198H362M207 238H293M207 259H326" /><circle cx="190" cy="156" r="2" /><circle cx="190" cy="198" r="2" /></g>
        <g className="detail-record__checksum"><circle cx="390" cy="253" r="52" /><circle cx="390" cy="253" r="42" /><path d="M377 232L371 274M397 232L391 274M363 245H408M361 261H406" /></g>
        <g className="detail-record__reference"><path d="M432 168H525V108M502 108H525V131" /><circle cx="529" cy="98" r="33" /></g>
      </svg>
      <figcaption key={step}>{['Local records', 'Proof Pack + checksum', 'Transaction reference'][step]}<span>{step === 1 ? 'Signature optional' : 'Record structure'}</span></figcaption>
    </figure>
  )
}

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
    visual={step => <RecordDiagram step={step} />}
  />
}
