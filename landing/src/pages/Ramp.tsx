import DetailWorld from '../components/DetailWorld'

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
  />
}
