import SoftPhone from './SoftPhone'

/** Dialer working area — the full softphone, ported from yeti-client. */
function DialerPage(): React.JSX.Element {
  return (
    <div className="h-full">
      <SoftPhone />
    </div>
  )
}

export default DialerPage
