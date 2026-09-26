import DetailWorld from '../components/DetailWorld'

function ExchangeDiagram({ step }: { step: number }) {
  return (
    <figure className="detail-exchange" data-stage={step} aria-label="Mock exchange route between TRY and USDC">
      <svg viewBox="0 0 600 360" fill="none" aria-hidden="true">
        <path className="detail-visual__guide" d="M30 180H570M300 30V330" />
        <ellipse className="detail-exchange__orbit" cx="300" cy="180" rx="215" ry="118" />
        <path className="detail-exchange__route" d="M104 130C175 34 425 34 496 130M496 230C425 326 175 326 104 230" />
        <path className="detail-exchange__arrows" d="M481 120L496 130L493 112M119 240L104 230L107 248" />
        <g className="detail-exchange__currency"><circle cx="98" cy="180" r="63" /><circle cx="98" cy="180" r="52" /><text x="98" y="191">TRY</text><circle cx="502" cy="180" r="63" /><circle cx="502" cy="180" r="52" /><text x="502" y="191">USDC</text></g>
        <path className="detail-exchange__wire" d="M164 180H239M361 180H436" />
        <g className="detail-exchange__anchor"><path d="M244 108L300 80L356 108V252L300 280L244 252ZM244 108L300 137L356 108M300 137V280" /><path d="M272 166V205L289 214M310 153V203L331 192" /></g>
        <circle className="detail-exchange__point" cx="300" cy="62" r="5" />
      </svg>
      <figcaption key={step}>{['Wallet authentication', 'Illustrative quote', 'Deposit or withdrawal request'][step]}<span>Mock anchor</span></figcaption>
    </figure>
  )
}

export default function Ramp() {
  return <DetailWorld id="ramp" name="Ramp" promise="TRY ↔ USDC, through a test anchor."
    steps={[
      { label: 'Connect', text: 'Authenticate your wallet by reviewing and signing the anchor’s challenge.' },
      { label: 'Quote', text: 'Review an illustrative TRY–USDC quote from the mock anchor.' },
      { label: 'Request', text: 'Create a simulated deposit or withdrawal request and check the returned status.' },
    ]}
    caveat="No real bank transfer or currency exchange is performed."
    notes={[
      'Use test information and test assets only.',
      'The separate mock anchor handles authentication, identity steps, quotes and transfer status.',
      'Availability depends on tr-mock-anchor.fly.dev; a local simulation does not replace that service.',
    ]}
    environment="Mock anchor. Test assets only."
    visual={step => <ExchangeDiagram step={step} />}
  />
}
